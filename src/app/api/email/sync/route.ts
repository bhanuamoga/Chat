/**
 * POST /api/email/sync { accountId? }
 * Streams NDJSON progress. Incremental: message-ids already in the table are
 * ONLY flag-synced — bodies are never re-downloaded (the old re-fetch was the
 * root of the stuck/slow syncs). New messages' attachments are uploaded to the
 * Supabase Storage bucket "email-attachments" during sync and their storage
 * paths are persisted into emails.attachments[].path.
 */
import { NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { syncAccount, type BoxSyncProgress } from "@/lib/email/mail";
import { storeAttachment, attachmentsStorageReady } from "@/lib/email/storage";

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
          let uploaded = 0;
          try {
            /* preload known ids + flags — heartbeat of the incremental sync */
            const knownRows = await db
              .select({ messageId: emails.messageId, isRead: emails.isRead, isStarred: emails.isStarred })
              .from(emails)
              .where(eq(emails.accountId, account.id))
              .limit(20000);
            const known = new Map(knownRows.map((r) => [r.messageId, { isRead: r.isRead, isStarred: r.isStarred }]));

            const { rows, flagUpdates } = await syncAccount(account, known, (p: BoxSyncProgress) =>
              line({ type: p.phase, accountId: account.id, folder: p.folder, fetched: p.fetched, total: p.total })
            );

            /* keep raw buffers OUT of jsonb; persist meta + placeholder path */
            const metaRows = rows.map((r) => ({
              ...r,
              attachments: r.attachments.map((a) => ({ filename: a.filename, size: a.size, mime: a.mime, path: null as string | null })),
            }));
            for (const r of metaRows) {
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

            /* flags that changed on the Gmail side since last sync */
            for (const u of flagUpdates) {
              await db
                .update(emails)
                .set({ isRead: u.isRead, isStarred: u.isStarred })
                .where(and(eq(emails.accountId, account.id), eq(emails.messageId, u.messageId)));
            }

            /* upload new attachments to Supabase Storage, then patch their paths into jsonb */
            if (attachmentsStorageReady() && rows.some((r) => r.attachments.some((a) => a.content))) {
              const withContent = rows.filter((r) => r.attachments.some((a) => a.content));
              const ids = withContent.map((r) => r.messageId);
              const dbRows = await db
                .select({ id: emails.id, messageId: emails.messageId, attachments: emails.attachments })
                .from(emails)
                .where(and(eq(emails.userId, userId), eq(emails.accountId, account.id), inArray(emails.messageId, ids)));
              const rowIdByMsg = new Map(dbRows.map((x) => [x.messageId, x.id]));
              for (const r of withContent) {
                const rowId = rowIdByMsg.get(r.messageId);
                if (!rowId) continue;
                const nextMeta = r.attachments.map((a) => ({ filename: a.filename, size: a.size, mime: a.mime, path: a.path ?? null }));
                let touched = false;
                for (let i = 0; i < r.attachments.length; i++) {
                  const a = r.attachments[i];
                  if (!a.content) continue;
                  const path = await storeAttachment(userId, rowId, i, a.filename, a.mime || "application/octet-stream", a.content);
                  if (path) {
                    nextMeta[i].path = path;
                    uploaded += 1;
                    touched = true;
                  }
                }
                if (touched) {
                  await db.update(emails).set({ attachments: nextMeta }).where(eq(emails.id, rowId));
                }
              }
            }

            await db.update(emailAccounts).set({ lastSyncAt: new Date() }).where(eq(emailAccounts.id, account.id));
            line({ type: "account-done", accountId: account.id, upserted: synced, flagUpdates: flagUpdates.length, attachmentsUploaded: uploaded });
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
