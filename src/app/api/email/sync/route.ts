/**
 * POST /api/email/sync { accountId? }
 * Streams NDJSON progress as it pulls Inbox / Sent / Drafts / Trash / Spam
 * from Gmail over IMAP. Each line: { type: "connect"|"box"|"box-done"|"account"|"error"|"done", ... }.
 */
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { syncAccount, type BoxSyncProgress } from "@/lib/email/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "");

  const where = accountId
    ? and(eq(emailAccounts.userId, userId), eq(emailAccounts.id, accountId))
    : eq(emailAccounts.userId, userId);
  const accounts = await db.select().from(emailAccounts).where(where);
  if (!accounts.length) return new Response(JSON.stringify({ error: "No email account configured" }), { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const line = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        for (const account of accounts) {
          line({ type: "account", accountId: account.id, email: account.emailAddress });
          let synced = 0;
          try {
            const rows = await syncAccount(account, (p: BoxSyncProgress) =>
              line({ type: p.phase, accountId: account.id, folder: p.folder, fetched: p.fetched, total: p.total })
            );
            for (const r of rows) {
              await db
                .insert(emails)
                .values({ userId, accountId: account.id, ...r })
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
                    folder: r.folder,
                  },
                });
              synced += 1;
            }
            await db.update(emailAccounts).set({ lastSyncAt: new Date() }).where(eq(emailAccounts.id, account.id));
            line({ type: "account-done", accountId: account.id, upserted: synced });
          } catch (e) {
            line({ type: "error", accountId: account.id, message: e instanceof Error ? e.message : "sync failed" });
          }
        }
        line({ type: "done" });
      } catch (e) {
        line({ type: "fatal", message: e instanceof Error ? e.message : "sync failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
}
