/**
 * Email messages API:
 * GET   ?accountId=&folder=inbox|sent|drafts|trash|spam → grouped thread list
 * GET   ?accountId=&thread=KEY                         → full thread (asc)
 * PATCH { accountId, threadKey, isRead?, isStarred? }  → flags (+ mirrors \Seen to Gmail)
 * DELETE { accountId, threadKey, folder, mode? }       → move to Trash / purge forever
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { setSeenFlag, moveToTrashRemote, purgeRemote, type SyncFolder } from "@/lib/email/mail";
import type { EmailFolderId, EmailMessage, EmailThreadRow } from "@/lib/email/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return (session as unknown as { chatUserId?: string } | null)?.chatUserId || null;
}

const toMessage = (r: typeof emails.$inferSelect): EmailMessage => ({
  id: r.id,
  accountId: r.accountId,
  threadKey: r.threadKey,
  messageId: r.messageId,
  subject: r.subject,
  fromAddress: r.fromAddress,
  fromName: r.fromName,
  toAddresses: (r.toAddresses as EmailMessage["toAddresses"]) ?? [],
  ccAddresses: (r.ccAddresses as EmailMessage["ccAddresses"]) ?? [],
  snippet: r.snippet,
  bodyText: r.bodyText,
  bodyHtml: r.bodyHtml,
  date: r.date.toISOString(),
  folder: ((r.folder as EmailFolderId) || "inbox") as EmailFolderId,
  isRead: r.isRead,
  isStarred: r.isStarred,
  hasAttachments: r.hasAttachments,
  attachments: (r.attachments as EmailMessage["attachments"]) ?? [],
});

export async function GET(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const q = req.nextUrl.searchParams;
  const accountId = q.get("accountId") || "";
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const thread = q.get("thread");
  if (thread) {
    const rows = await db
      .select()
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.threadKey, thread)))
      .orderBy(asc(emails.date));
    return NextResponse.json({ messages: rows.map(toMessage) });
  }

  const folder = (q.get("folder") || "inbox") as EmailFolderId;
  const rows = await db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.folder, folder)))
    .orderBy(desc(emails.date))
    .limit(500);

  // collapse into Gmail-style conversation rows (threadKey groups ref-chains)
  const seen = new Map<string, typeof rows>();
  const order: string[] = [];
  for (const r of rows) {
    const list = seen.get(r.threadKey);
    if (list) list.push(r);
    else {
      seen.set(r.threadKey, [r]);
      order.push(r.threadKey);
    }
  }
  const threads: EmailThreadRow[] = order.slice(0, 120).map((key) => {
    const list = seen.get(key)!;
    const latest = list[0];
    const participants = [
      ...new Map(
        list
          .slice(0, 3)
          .map((r) => [r.fromAddress, { name: r.fromName || undefined, address: r.fromAddress }])
      ).values(),
    ];
    return {
      threadKey: key,
      accountId,
      folder,
      subject: latest.subject || "(no subject)",
      snippet: latest.snippet,
      participants,
      lastDate: latest.date.toISOString(),
      count: list.length,
      unread: list.some((r) => !r.isRead),
      isStarred: list.some((r) => r.isStarred),
      hasAttachments: list.some((r) => r.hasAttachments),
    };
  });
  return NextResponse.json({ threads });
}

/** Mark a thread read/unread or star/unstar; also mirrors \Seen to Gmail (best effort). */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "");
  const threadKey = String(body.threadKey || "");
  const isRead = typeof body.isRead === "boolean" ? (body.isRead as boolean) : undefined;
  const isStarred = typeof body.isStarred === "boolean" ? (body.isStarred as boolean) : undefined;
  if (!accountId || !threadKey) return NextResponse.json({ error: "accountId + threadKey required" }, { status: 400 });

  const sets: Record<string, unknown> = {};
  if (isRead !== undefined) sets.isRead = isRead;
  if (isStarred !== undefined) sets.isStarred = isStarred;
  if (!Object.keys(sets).length) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await db
    .update(emails)
    .set(sets)
    .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.threadKey, threadKey)))
    .returning({ messageId: emails.messageId, folder: emails.folder });

  if (isRead !== undefined) {
    // mirror to Gmail in the background — never block the UI on it
    db.select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
      .limit(1)
      .then(([account]) => {
        if (!account) return;
        for (const u of updated.filter((x) => x.folder === "inbox")) {
          setSeenFlag(account, u.messageId, isRead).catch(() => undefined);
        }
      })
      .catch(() => undefined);
  }

  return NextResponse.json({ ok: true, updated: updated.length });
}

/**
 * DELETE { accountId, threadKey, folder, mode? }
 * mode "trash" (default for all folders except trash) → IMAP MOVE to Trash + local flip
 * mode "purge" (default when called on trash)          → IMAP expunge + local delete
 */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "");
  const threadKey = String(body.threadKey || "");
  const folder = String(body.folder || "inbox") as SyncFolder;
  const modeOverride = String(body.mode || "");
  if (!accountId || !threadKey) return NextResponse.json({ error: "accountId + threadKey required" }, { status: 400 });

  const rows = await db
    .select({ messageId: emails.messageId, folder: emails.folder })
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.threadKey, threadKey)));
  if (!rows.length) return NextResponse.json({ error: "Nothing to delete" }, { status: 404 });

  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
    .limit(1);

  const purge = modeOverride ? modeOverride === "purge" : folder === "trash";

  // mirror to Gmail best-effort — never block the UI on network mail ops
  if (account) {
    const ids = rows.map((r) => r.messageId);
    const boxes = [...new Set(rows.map((r) => r.folder))].filter((f): f is SyncFolder =>
      ["inbox", "sent", "drafts", "trash", "spam"].includes(f)
    );
    void (async () => {
      for (const box of boxes) {
        try {
          if (purge) await purgeRemote(account, ids, box);
          else await moveToTrashRemote(account, ids, box);
        } catch { /* best effort */ }
      }
    })().catch(() => undefined);
  }

  if (purge) {
    await db
      .delete(emails)
      .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.threadKey, threadKey)));
    return NextResponse.json({ mode: "purge", count: rows.length });
  }

  await db
    .update(emails)
    .set({ folder: "trash", isRead: true })
    .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.threadKey, threadKey)));
  return NextResponse.json({ mode: "trash", count: rows.length });
}
