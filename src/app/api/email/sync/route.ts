/**
 * POST /api/email/sync { accountId? }
 * Streams NDJSON progress. FULL-mailbox incremental sync — no 300 cap:
 * already-known message-ids only get flag updates; brand-new messages stream
 * in flushed batches (upsert + attachment upload to Supabase Storage inline).
 * If the serverless time budget runs out mid-mailbox we stop cleanly with
 * partial=true — the client immediately starts the next round and continues.
 */
import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { syncAccount } from "@/lib/email/mail";
import { storeAttachment, attachmentsStorageReady } from "@/lib/email/storage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TIME_BUDGET_MS = 95_000; // under the 120s serverless cap

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
      let anyPartial = false;
      try {
        for (const account of accounts) {
          line({ type: "account", accountId: account.id, email: account.emailAddress });
          let upserted = 0;
          let flagsFixed = 0;
          let uploaded = 0;
          try {
            /* preload known ids + flags — heartbeat of the incremental sync */
            const knownRows = await db
              .select({ messageId: emails.messageId, isRead: emails.isRead, isStarred: emails.isStarred })
              .from(emails)
              .where(eq(emails.accountId, account.id))
              .limit(100000);
            const known = new Map(knownRows.map((r) => [r.messageId, { isRead: r.isRead, isStarred: r.isStarred }]));

            const { partial } = await syncAccount(
              account,
              known,
              {
                onProgress: (p) =>
                  line({ type: p.phase, accountId: account.id, folder: p.folder, fetched: p.fetched, total: p.total }),
                onFlags: async (ups) => {
                  for (const u of ups) {
                    await db
                      .update(emails)
                      .set({ isRead: u.isRead, isStarred: u.isStarred })
                      .where(and(eq(emails.accountId, account.id), eq(emails.messageId, u.messageId)));
                  }
                  flagsFixed += ups.length;
                },
                onRows: async (rows) => {
                  for (const r of rows) {
                    const meta = {
                      ...r,
                      attachments: r.attachments.map((a) => ({
                        filename: a.filename,
                        size: a.size,
                        mime: a.mime,
                        path: null as string | null,
                      })),
                    };
                    const [ins] = await db
                      .insert(emails)
                      .values({ userId, accountId: account.id, ...meta })
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
                          attachments: meta.attachments,
                          threadKey: r.threadKey,
                          inReplyTo: r.inReplyTo,
                          refIds: r.refIds,
                          folder: r.folder,
                        },
                      })
                      .returning({ id: emails.id });
                    upserted += 1;

                    /* push attachment bytes to Supabase Storage; patch paths into jsonb */
                    const rowId = ins?.id;
                    if (rowId && attachmentsStorageReady() && r.attachments.some((a) => a.content)) {
                      const nextMeta = meta.attachments.map((a) => ({ ...a }));
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
                },
              },
              { timeBudgetMs: TIME_BUDGET_MS }
            );
            anyPartial = anyPartial || partial;
            await db.update(emailAccounts).set({ lastSyncAt: new Date() }).where(eq(emailAccounts.id, account.id));
            line({ type: "account-done", accountId: account.id, partial, upserted, flagsFixed, attachmentsUploaded: uploaded });
          } catch (e) {
            line({ type: "error", accountId: account.id, message: e instanceof Error ? e.message : "sync failed" });
          }
        }
        line({ type: "done", partial: anyPartial });
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
