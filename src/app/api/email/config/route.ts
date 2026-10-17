/**
 * Email account configuration — saved per user in `email_accounts`
 * (separate table, as requested). Passwords never reach the browser.
 *
 * GET                              → { accounts: EmailAccountClient[] }
 * POST { action:"save", ... }      → upsert account (tests IMAP first), returns accounts
 * POST { action:"test", ... }      → live IMAP+SMTP credential check, nothing saved
 * POST { action:"delete", id }     → remove account (+ its synced emails via cascade)
 * POST { action:"setDefault", id } → mark the active account
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { testImapConnection, testSmtpConnection } from "@/lib/email/mail";
import type { EmailAccountClient } from "@/lib/email/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return (session as unknown as { chatUserId?: string } | null)?.chatUserId || null;
}

const toClient = (a: typeof emailAccounts.$inferSelect): EmailAccountClient => ({
  id: a.id,
  name: a.name,
  emailAddress: a.emailAddress,
  isDefault: a.isDefault,
  lastSyncAt: a.lastSyncAt ? a.lastSyncAt.toISOString() : null,
});

async function listAccounts(userId: string) {
  const rows = await db.select().from(emailAccounts).where(eq(emailAccounts.userId, userId));
  return rows.map(toClient);
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();
  return NextResponse.json({ accounts: await listAccounts(userId) });
}

const str = (v: unknown): string => String(v ?? "").trim();
const int = (v: unknown, fb: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fb;
};

function readConfigFields(body: Record<string, unknown>) {
  return {
    name: str(body.name),
    emailAddress: str(body.emailAddress).toLowerCase(),
    appPassword: str(body.appPassword),
    imapHost: str(body.imapHost) || "imap.gmail.com",
    imapPort: int(body.imapPort, 993),
    smtpHost: str(body.smtpHost) || "smtp.gmail.com",
    smtpPort: int(body.smtpPort, 587),
  };
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const action = str(body.action);

  /* ---------- live credential test, nothing saved ---------- */
  if (action === "test") {
    const c = readConfigFields(body);
    if (!c.emailAddress || !c.appPassword)
      return NextResponse.json({ error: "Email address and app password are required" }, { status: 400 });
    try {
      await testImapConnection(c);
      try {
        await testSmtpConnection(c);
      } catch (e) {
        return NextResponse.json({ ok: true, imapOk: true, smtpOk: false, smtpError: e instanceof Error ? e.message : "SMTP failed" });
      }
      return NextResponse.json({ ok: true, imapOk: true, smtpOk: true });
    } catch (e) {
      return NextResponse.json(
        { error: `Could not sign in via IMAP — check the email + app password (needs a Gmail App Password, not your login password). ${e instanceof Error ? e.message : ""}` },
        { status: 400 }
      );
    }
  }

  /* ---------- save (create/update) ---------- */
  if (action === "save") {
    const c = readConfigFields(body);
    if (!c.emailAddress || !c.appPassword || !c.name)
      return NextResponse.json({ error: "Name, Gmail address and app password are required" }, { status: 400 });

    // verify before persisting so bad creds never land in the table
    try {
      await testImapConnection(c);
    } catch (e) {
      return NextResponse.json(
        { error: `IMAP sign-in failed — nothing saved. ${e instanceof Error ? e.message : ""}` },
        { status: 400 }
      );
    }

    const id = str(body.id);
    const [existing] = await db.select().from(emailAccounts).where(eq(emailAccounts.userId, userId));
    const isFirst = !id && !existing;

    if (id) {
      await db
        .update(emailAccounts)
        .set({ ...c, updatedAt: new Date() })
        .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)));
    } else {
      await db.insert(emailAccounts).values({ ...c, userId, isDefault: isFirst });
    }
    return NextResponse.json({ accounts: await listAccounts(userId) });
  }

  if (action === "delete") {
    const id = str(body.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await db.delete(emailAccounts).where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)));
    const remaining = await listAccounts(userId);
    // keep a default at all times
    if (remaining.length && !remaining.some((a) => a.isDefault)) {
      await db.update(emailAccounts).set({ isDefault: true }).where(eq(emailAccounts.id, remaining[0].id));
      return NextResponse.json({ accounts: await listAccounts(userId) });
    }
    return NextResponse.json({ accounts: remaining });
  }

  if (action === "setDefault") {
    const id = str(body.id);
    await db.update(emailAccounts).set({ isDefault: false }).where(eq(emailAccounts.userId, userId));
    await db
      .update(emailAccounts)
      .set({ isDefault: true })
      .where(and(eq(emailAccounts.id, id), eq(emailAccounts.userId, userId)));
    return NextResponse.json({ accounts: await listAccounts(userId) });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
