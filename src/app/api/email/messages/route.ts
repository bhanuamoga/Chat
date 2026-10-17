/**
 * Email messages API:
 * GET   ?accountId=&folder=inbox|sent|drafts|trash|spam&q= → thread list
 *       (inbox/sent tabs group across inbox+sent+drafts like Gmail — reply
 *       counts, unread and counts include every message of the conversation)
 * GET   ?accountId=&thread=KEY                            → full thread (asc)
 * PATCH { accountId, threadKey, isRead?, isStarred? }     → flags (+ \Seen mirror)
 * DELETE { accountId, threadKey, folder, mode? }          → Trash / purge
 */
import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, inArray, or, ilike, sql } from "drizzle-orm";
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

/** list rows are slim — no bodies, so the first paint stays fast. */
const ROWS_LIMIT = 800;

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
  const search = (q.get("q") || "").trim();
  const state = (q.get("state") || "all") as "all" | "unread" | "read";
  const page = Math.max(1, Number(q.get("page")) || 1);
  const PER_PAGE = 50;

  // Cross-folder conversation grouping like Gmail:
  //  - inbox tab: threads having ≥1 inbox message (sent/draft replies join the count)
  //  - sent tab:  threads having ≥1 sent message
  //  - other tabs: only rows in that folder
  const crossTabs = folder === "inbox" || folder === "sent";
  const scanFolders: SyncFolder[] = crossTabs ? ["inbox", "sent", "drafts"] : [folder as SyncFolder];

  const searchFilter =
    search.length > 1
      ? or(
          ilike(emails.subject, `%${search}%`),
          ilike(emails.snippet, `%${search}%`),
          ilike(emails.fromName, `%${search}%`),
          ilike(emails.fromAddress, `%${search}%`)
        )
      : undefined;

  const rows = await db
    .select({
      threadKey: emails.threadKey,
      subject: emails.subject,
      snippet: emails.snippet,
      fromName: emails.fromName,
      fromAddress: emails.fromAddress,
      date: emails.date,
      folder: emails.folder,
      isRead: emails.isRead,
      isStarred: emails.isStarred,
      hasAttachments: emails.hasAttachments,
    })
    .from(emails)
    .where(
      and(eq(emails.userId, userId), eq(emails.accountId, accountId), inArray(emails.folder, scanFolders), searchFilter)
    )
    .orderBy(desc(emails.date))
    .limit(ROWS_LIMIT);

  const groups = new Map<string, typeof rows>();
  const order: string[] = [];
  for (const r of rows) {
    const list = groups.get(r.threadKey);
    if (list) list.push(r);
    else {
      groups.set(r.threadKey, [r]);
      order.push(r.threadKey);
    }
  }

  const allThreads: EmailThreadRow[] = [];
  for (const key of order) {
    const list = groups.get(key)!;
    const hasFolder = crossTabs ? list.some((r) => r.folder === folder) : true;
    if (!hasFolder) continue;

    const latest = list[0]; // rows are date-desc
    const participants = [
      ...new Map(
        list
          .slice(0, 3)
          .map((r) => [r.fromAddress, { name: r.fromName || undefined, address: r.fromAddress }])
      ).values(),
    ];
    allThreads.push({
      threadKey: key,
      accountId,
      folder,
      subject: latest.subject || "(no subject)",
      snippet: latest.snippet,
      participants,
      lastDate: latest.date.toISOString(),
      count: list.length,
      unread: list.some((r) => !r.isRead && (crossTabs ? r.folder === "inbox" : true)),
      isStarred: list.some((r) => r.isStarred),
      hasAttachments: list.some((r) => r.hasAttachments),
    });
  }

  // state filter (all / unread / read) — applied on TOP of the folder grouping
  const filtered =
    state === "unread" ? allThreads.filter((t) => t.unread) : state === "read" ? allThreads.filter((t) => !t.unread) : allThreads;

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const threads = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  /* ---- Gmail-style EMAIL counts (individual messages, not threads)
     — 2 fast queries (GROUP BY + unread), not 7 — polls stay cheap ---- */
  const folderCounts: Record<string, number> = { inbox: 0, sent: 0, drafts: 0, trash: 0, spam: 0 };
  const perFolder = await db
    .select({ folder: emails.folder, value: sql<number>`count(*)` })
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.accountId, accountId)))
    .groupBy(emails.folder);
  for (const r of perFolder) folderCounts[r.folder] = Number(r.value) || 0;
  const [{ value: unreadVal }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(emails)
    .where(
      and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.folder, "inbox"), eq(emails.isRead, false))
    );
  folderCounts.unreadInbox = Number(unreadVal) || 0;

  /* pager's "of N": total emails in this folder (narrowed by the search, like Gmail) */
  let displayTotal = folderCounts[folder] ?? 0;
  if (search.length > 1) {
    const [{ value }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(emails)
      .where(
        and(eq(emails.userId, userId), eq(emails.accountId, accountId), eq(emails.folder, folder as SyncFolder), searchFilter)
      );
    displayTotal = Number(value) || 0;
  }

  return NextResponse.json({
    threads,
    page: currentPage,
    perPage: PER_PAGE,
    total,               // thread total (drives pages)
    totalPages,
    folderCounts,        // email counts per folder (left nav)
    displayTotal,        // email count shown as "of N" pager total
  });
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
 * mode "trash" (default outside trash) → IMAP MOVE to Trash + local flip
 * mode "purge" (default inside trash / any folder with mode:"purge") → expunge + local delete
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
