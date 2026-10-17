/**
 * POST /api/email/sync { accountId? }
 * Pulls the newest messages from INBOX + Sent (via IMAP) into the `emails`
 * table. Upserts by (accountId, messageId); updates read/star flags in step
 * with Gmail.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { syncAccount } from "@/lib/email/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "");

  const where = accountId
    ? and(eq(emailAccounts.userId, userId), eq(emailAccounts.id, accountId))
    : eq(emailAccounts.userId, userId);
  const accounts = await db.select().from(emailAccounts).where(where);
  if (!accounts.length) return NextResponse.json({ error: "No email account configured" }, { status: 400 });

  const results = [];
  for (const account of accounts) {
    try {
      const rows = await syncAccount(account);
      // re-thread across boxes: sent replies must join their inbox partner
      for (const r of rows) {
        await db
          .insert(emails)
          .values({
            userId,
            accountId: account.id,
            ...r,
          })
          .onConflictDoUpdate({
            target: [emails.accountId, emails.messageId],
            set: {
              subject: r.subject,
              snippet: r.snippet,
              bodyText: r.bodyText,
              bodyHtml: r.bodyHtml,
              toAddresses: r.toAddresses,
              ccAddresses: r.ccAddresses,
              isRead: r.isRead,
              isStarred: r.isStarred,
              hasAttachments: r.hasAttachments,
              attachments: r.attachments,
              threadKey: r.threadKey,
              inReplyTo: r.inReplyTo,
              refIds: r.refIds,
            },
          });
      }
      await db.update(emailAccounts).set({ lastSyncAt: new Date() }).where(eq(emailAccounts.id, account.id));
      results.push({ accountId: account.id, ok: true, total: rows.length });
    } catch (e) {
      results.push({ accountId: account.id, ok: false, error: e instanceof Error ? e.message : "sync failed" });
    }
  }

  return NextResponse.json({ results });
}
