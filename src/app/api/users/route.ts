import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { desc } from "drizzle-orm";
import { toUserRow } from "@/lib/conversation-helpers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exclude = searchParams.get("exclude");
  const q = searchParams.get("q")?.trim();

  let rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);

  if (exclude) rows = rows.filter((u) => u.id !== exclude);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (u) =>
        u.displayName.toLowerCase().includes(needle) ||
        (u.email || "").toLowerCase().includes(needle)
    );
  }

  return NextResponse.json({ users: rows.map(toUserRow) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName || "").trim().slice(0, 40);
  if (!displayName) {
    return NextResponse.json({ error: "displayName required" }, { status: 400 });
  }
  const avatarColor = String(body.avatarColor || "#00a884").slice(0, 20);
  const avatarEmoji = String(body.avatarEmoji || "😀").slice(0, 8);
  const phone = body.phone ? String(body.phone).slice(0, 30) : null;
  const bio = String(body.bio || "Hey there! I am using Morr Chat.").slice(0, 140);
  const email = body.email ? String(body.email).trim().toLowerCase().slice(0, 120) : null;

  const [created] = await db
    .insert(users)
    .values({ displayName, avatarColor, avatarEmoji, phone, bio, email })
    .returning();

  return NextResponse.json({ user: toUserRow(created) });
}
