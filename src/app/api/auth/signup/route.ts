import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toUserRow } from "@/lib/conversation-helpers";
import { SUPABASE_SERVICE_KEY, getSupabaseServer, isSupabaseConfigured } from "@/lib/supabase";
import { AVATAR_COLORS } from "@/lib/utils";

/**
 * POST /api/auth/signup
 * Body: { displayName, email, password, avatarEmoji?, avatarColor?, phone? }
 *
 * Creates the chat profile in Postgres AND (if Supabase is configured)
 * creates/links a Supabase Auth user.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const displayName = String(body.displayName || "").trim().slice(0, 40);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
    const password = String(body.password || "");

    if (!displayName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // 1. Check existing user in Postgres
    let existing;
    try {
      [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    } catch (dbErr: any) {
      const dbUrl = process.env.DATABASE_URL || "";
      const maskedHost = dbUrl.replace(/:[^:@]+@/, ":****@");
      const errMessage = dbErr?.message || String(dbErr);
      const errCode = dbErr?.code || "";

      console.error("[signup] Database query error:", dbErr);
      return NextResponse.json(
        {
          error:
            `Database connection failed (${errCode || "ERROR"}: ${errMessage}). ` +
            `Target DB: ${maskedHost || "NOT SET"}. ` +
            `Please check DATABASE_URL in Vercel Environment Variables.`,
        },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const avatarEmoji = String(body.avatarEmoji || "😀").slice(0, 8);
    const avatarColor =
      String(body.avatarColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]).slice(0, 20);
    const phone = body.phone ? String(body.phone).slice(0, 30) : null;
    const passwordHash = await bcrypt.hash(password, 10);

    // 2. Provision matching Supabase Auth user (safe, non-fatal fallback)
    let supabaseId: string | null = null;
    if (isSupabaseConfigured) {
      try {
        const sb = getSupabaseServer();
        if (sb) {
          if (SUPABASE_SERVICE_KEY) {
            const { data, error } = await sb.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { display_name: displayName },
            });
            if (!error && data.user) {
              supabaseId = data.user.id;
            } else if (error) {
              const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
              const match = listed.data?.users?.find(
                (u) => u.email?.toLowerCase() === email.toLowerCase()
              );
              if (match) {
                supabaseId = match.id;
                await sb.auth.admin.updateUserById(match.id, { password }).catch(() => {});
              } else {
                console.warn("[signup] supabase admin createUser failed:", error.message);
              }
            }
          } else {
            const { data, error } = await sb.auth.signUp({
              email,
              password,
              options: { data: { display_name: displayName } },
            });
            if (!error && data.user) {
              supabaseId = data.user.id;
            } else if (error && /already registered|already exists/i.test(error.message)) {
              const { data: signInData, error: signInError } = await sb.auth.signInWithPassword({
                email,
                password,
              });
              if (!signInError && signInData.user) supabaseId = signInData.user.id;
            } else if (error) {
              console.warn("[signup] supabase signUp failed:", error.message);
            }
          }
        }
      } catch (e) {
        console.warn("[signup] supabase link failed", e);
      }
    }

    // 3. Insert user into Postgres
    try {
      const [created] = await db
        .insert(users)
        .values({ displayName, email, passwordHash, supabaseId, avatarEmoji, avatarColor, phone })
        .returning();

      return NextResponse.json({ user: toUserRow(created), supabaseLinked: Boolean(supabaseId) });
    } catch (insertErr: any) {
      console.error("[signup] Insert error:", insertErr?.message || insertErr);
      return NextResponse.json(
        {
          error:
            "Failed to save user in database. Ensure tables exist in Postgres (`npx drizzle-kit push`). Detail: " +
            (insertErr?.message || "Insert failed"),
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("[signup] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "An unexpected error occurred during sign up" },
      { status: 500 }
    );
  }
}
