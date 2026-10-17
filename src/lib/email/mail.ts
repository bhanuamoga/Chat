/**
 * Email sync + send helpers.
 * Receive: imapflow (IMAP). Send: nodemailer (SMTP). Parse: mailparser.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import type { EmailAccount } from "@/db/schema";
import type { EmailAddress } from "./types";

const SYNC_LIMIT_PER_BOX = 300;

/** ---------- parsing helpers ---------- */

const addressList = (v: ParsedMail["to"]): EmailAddress[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((g) =>
    (g.value ?? []).map((a) => ({ name: a.name || undefined, address: String(a.address || "").toLowerCase() }))
  );
};

const normId = (id: string) => id.trim().replace(/\s+/g, "");

const refChain = (refs: ParsedMail["references"]): string[] => {
  if (!refs) return [];
  const raw = Array.isArray(refs) ? refs : [refs];
  const out: string[] = [];
  for (const r of raw) {
    const matches = String(r).match(/<[^>\s]+>/g);
    if (matches) out.push(...matches.map(normId));
  }
  return out;
};

/** Root id = first References entry; else the message's own id. */
export const threadKeyOf = (messageId: string, refs: string[]): string =>
  refs[0] ?? normId(messageId);

export const snippetOf = (text: string, html?: string): string => {
  const src = (text || html2text(html || "")).replace(/\s+/g, " ").trim();
  return src.slice(0, 180);
};

const html2text = (html: string): string =>
  html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<br\s*\/?>(?=)/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

/** Strip scripts / event handlers / javascript: URLs before rendering. */
export const sanitizeEmailHtml = (html: string): string =>
  html
    .replace(/<\s*(script|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["']?)javascript:[^"' >]*\2/gi, "$1=$2#$2");

/** ---------- IMAP sync ---------- */

export interface SyncedEmail {
  messageId: string;
  threadKey: string;
  inReplyTo: string | null;
  refIds: string;
  fromAddress: string;
  fromName: string;
  toAddresses: EmailAddress[];
  ccAddresses: EmailAddress[];
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string | null;
  date: Date;
  folder: "inbox" | "sent" | "drafts" | "trash" | "spam";
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments: { filename: string; size?: number; mime?: string; path?: string | null; content?: Buffer | null }[];
}

export interface SyncResult {
  added: number;
  total: number;
  error?: string;
}

function makeClient(a: EmailAccount): ImapFlow {
  return new ImapFlow({
    host: a.imapHost || "imap.gmail.com",
    port: a.imapPort || 993,
    secure: (a.imapPort || 993) !== 143,
    auth: { user: a.emailAddress, pass: a.appPassword.replace(/\s+/g, "") },
    logger: false,
    socketTimeout: 45000,
    greetingTimeout: 20000,
  });
}

/** Verify IMAP login works (used by the config "test" action). */
export async function testImapConnection(cfg: Pick<EmailAccount, "emailAddress" | "appPassword" | "imapHost" | "imapPort">): Promise<void> {
  const client = makeClient(cfg as EmailAccount);
  await client.connect();
  await client.logout().catch(() => undefined);
}

/** Gmail-style inline images: replace src="cid:…" with data URIs from the attachments. */
const INLINE_IMAGE_LIMIT = 300_000; // bytes — don't bloat the table with giant banners
function embedInlineImages(html: string, parsed: ParsedMail): string {
  if (!html.includes("cid:")) return html;
  return html.replace(/src=["']cid:([^"']+)["']/gi, (full, cid) => {
    const att = (parsed.attachments ?? []).find((att) => {
      const id = (att.cid || att.contentId || "").replace(/[<>\s]/g, "");
      return id && id === cid.replace(/[<>\s]/g, "");
    });
    if (att?.content && (att.size ?? att.content.length) <= INLINE_IMAGE_LIMIT) {
      const mime = att.contentType || "image/png";
      return `src="data:${mime};base64,${att.content.toString("base64")}"`;
    }
    return full;
  });
}/** Parse one raw RFC822 message into our row shape. */
async function parseRaw(
  source: Buffer,
  folder: SyncedEmail["folder"],
  flags: ReadonlySet<string> | undefined,
  uid: number,
): Promise<SyncedEmail> {
  const parsed: ParsedMail = await simpleParser(source);
  const messageId = normId(String(parsed.messageId || parsed.inReplyTo || "")) || `local-${uid}-${folder}`;
  const refs = refChain(parsed.references);
  const subject = parsed.subject || "(no subject)";
  const bodyText = parsed.text?.trim() || "";
  let bodyHtml = typeof parsed.html === "string" ? sanitizeEmailHtml(parsed.html) : null;
  if (bodyHtml) bodyHtml = embedInlineImages(bodyHtml, parsed);
  const from = parsed.from?.value?.[0];
  return {
    messageId,
    threadKey: threadKeyOf(messageId, refs),
    inReplyTo: parsed.inReplyTo ? normId(String(parsed.inReplyTo)) : null,
    refIds: refs.join(" "),
    fromAddress: String(from?.address || "").toLowerCase(),
    fromName: from?.name || "",
    toAddresses: addressList(parsed.to),
    ccAddresses: addressList(parsed.cc),
    subject,
    snippet: snippetOf(bodyText, bodyHtml || ""),
    bodyText,
    bodyHtml,
    date: parsed.date ? new Date(parsed.date) : new Date(),
    folder,
    isRead: flags?.has("\\Seen") ?? false,
    isStarred: flags?.has("\\Flagged") ?? false,
    hasAttachments: (parsed.attachments?.length ?? 0) > 0,
    attachments: (parsed.attachments ?? [])
      .filter((x) => x.filename)
      .map((x) => ({
        filename: x.filename as string,
        size: x.size,
        mime: x.contentType,
        path: null as string | null,
        content: (x.content as Buffer) ?? null,
      })),
  };
}

/** Gmail (and standard IMAP) special-use mailboxes, in sync order. */
const SPECIAL_BOXES: { folder: SyncedEmail["folder"]; special: string; fallback: string }[] = [
  { folder: "inbox", special: "\\Inbox", fallback: "INBOX" },
  { folder: "sent", special: "\\Sent", fallback: "[Gmail]/Sent Mail" },
  { folder: "drafts", special: "\\Drafts", fallback: "[Gmail]/Drafts" },
  { folder: "trash", special: "\\Trash", fallback: "[Gmail]/Trash" },
  { folder: "spam", special: "\\Junk", fallback: "[Gmail]/Spam" },
];

export type SyncFolder = SyncedEmail["folder"];

export interface BoxSyncProgress {
  phase: "connect" | "box" | "box-done";
  folder: SyncFolder;
  path?: string;
  fetched?: number;
  total?: number;
  newsCount?: number;
}

export interface FlagUpdate {
  messageId: string;
  isRead: boolean;
  isStarred: boolean;
}

export interface SyncOutcome {
  rows: SyncedEmail[];
  flagUpdates: FlagUpdate[];
}

/** Resolve a mailbox path by special-use flag, falling back to Gmail names. */
function resolveBoxes(clientBoxes: Awaited<ReturnType<ImapFlow["list"]>>): Map<SyncFolder, string> {
  const map = new Map<SyncFolder, string>();
  for (const spec of SPECIAL_BOXES) {
    const hit = spec.folder === "inbox"
      ? clientBoxes.find((b) => b.path.toUpperCase() === "INBOX")
      : clientBoxes.find((b) => b.specialUse === spec.special);
    const path = hit?.path ?? (clientBoxes.some((b) => b.path === spec.fallback) ? spec.fallback : null);
    if (path) map.set(spec.folder, path);
  }
  if (!map.has("inbox")) map.set("inbox", "INBOX");
  return map;
}

/**
 * Smart incremental sync:
 *  1. HEADERS pass per mailbox (envelopes + flags only — cheap).
 *  2. Anything whose Message-ID we already have is {flag-synced} ONLY (no re-download
 *     of bodies — "already synced" messages are never re-downloaded, the root cause of
 *     the slow/stuck syncs is gone).
 *  3. Only brand-new messages get their full source fetched + parsed.
 */
export async function syncAccount(
  account: EmailAccount,
  known: Map<string, { isRead: boolean; isStarred: boolean }>,
  onProgress?: (p: BoxSyncProgress) => void,
): Promise<SyncOutcome> {
  const client = makeClient(account);
  onProgress?.({ phase: "connect", folder: "inbox" });
  await client.connect();
  try {
    let boxes = new Map<SyncFolder, string>();
    try {
      boxes = resolveBoxes(await client.list());
    } catch {
      boxes.set("inbox", "INBOX");
    }

    const out: SyncedEmail[] = [];
    const flagUpdates: FlagUpdate[] = [];
    for (const [folder, path] of boxes) {
      onProgress?.({ phase: "box", folder, path });
      try {
        const lock = await client.getMailboxLock(path);
        try {
          const mailbox = await client.mailboxOpen(path, { readOnly: true });
          const total = mailbox.exists || 0;
          onProgress?.({ phase: "box", folder, path, fetched: 0, total });
          if (!total) {
            lock.release();
            continue;
          }
          const from = Math.max(1, total - SYNC_LIMIT_PER_BOX + 1);

          /* pass 1 — headers only */
          interface Head {
            uid: number;
            id: string;
            seen: boolean;
            starred: boolean;
          }
          const heads: Head[] = [];
          for await (const h of client.fetch(`${from}:${total}`, { envelope: true, flags: true })) {
            const id = normId(String(h.envelope?.messageId || "")) || `local-${h.uid}-${folder}`;
            heads.push({
              uid: h.uid,
              id,
              seen: h.flags?.has("\Seen") ?? false,
              starred: h.flags?.has("\Flagged") ?? false,
            });
          }

          const fresh = heads.filter((h) => !known.has(h.id));
          for (const h of heads) {
            const prev = known.get(h.id);
            if (prev && (prev.isRead !== h.seen || prev.isStarred !== h.starred)) {
              flagUpdates.push({ messageId: h.id, isRead: h.seen, isStarred: h.starred });
            }
          }

          /* pass 2 — bodies ONLY for the brand-new */
          if (fresh.length) {
            onProgress?.({ phase: "box", folder, path, fetched: 0, total: fresh.length, newsCount: fresh.length });
            let received = 0;
            const uidRanges = fresh.map((f) => f.uid).join(",");
            for await (const msg of client.fetch(uidRanges, { envelope: true, source: true, flags: true }, { uid: true })) {
              if (!msg.source) continue;
              try {
                out.push(await parseRaw(msg.source, folder, msg.flags, msg.uid));
              } catch { /* one bad message shouldn't kill the sync */ }
              received += 1;
              if (received % 3 === 0 || received === fresh.length) {
                onProgress?.({ phase: "box", folder, path, fetched: received, total: fresh.length, newsCount: fresh.length });
              }
            }
          } else {
            onProgress?.({ phase: "box", folder, path, fetched: total, total, newsCount: 0 });
          }
        } finally {
          lock.release();
        }
      } catch { /* some servers deny listing some boxes; not fatal */ }
      onProgress?.({ phase: "box-done", folder, path });
    }
    return { rows: out, flagUpdates };
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Move messages (by Message-ID header) from a folder into Trash — Gmail MOVE. */
export async function moveToTrashRemote(
  account: EmailAccount,
  messageIds: string[],
  fromFolder: SyncFolder,
): Promise<void> {
  await boxMessageOpRemote(account, messageIds, fromFolder, "trash");
}

/** Permanently purge messages (by Message-ID header) from a mailbox. */
export async function purgeRemote(
  account: EmailAccount,
  messageIds: string[],
  fromFolder: SyncFolder,
): Promise<void> {
  await boxMessageOpRemote(account, messageIds, fromFolder, "purge");
}

async function boxMessageOpRemote(
  account: EmailAccount,
  messageIds: string[],
  fromFolder: SyncFolder,
  op: "trash" | "purge",
): Promise<void> {
  if (!messageIds.length) return;
  const client = makeClient(account);
  await client.connect();
  try {
    const listed = await client.list().catch(() => []);
    const boxes = resolveBoxes(listed);
    const fromPath = boxes.get(fromFolder) ?? "INBOX";
    const trashPath = boxes.get("trash") ?? "[Gmail]/Trash";
    const lock = await client.getMailboxLock(fromPath);
    try {
      await client.mailboxOpen(fromPath, { readOnly: false });
      for (const id of messageIds) {
        try {
          const hits = (await client.search({ header: { "Message-ID": id.toLowerCase() } })) as readonly number[] | false | undefined;
          if (!hits || !hits.length) continue;
          const uids = [...hits];
          if (op === "trash") await client.messageMove(uids, trashPath, { uid: true });
          else await client.messageDelete(uids, { uid: true });
        } catch { /* per-message best effort */ }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** Best-effort: set/unset the \\Seen flag on the server copy (keeps Gmail in step). */
export async function setSeenFlag(account: EmailAccount, messageId: string, seen: boolean): Promise<void> {
  const client = makeClient(account);
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      await client.mailboxOpen("INBOX");
      const hits = (await client.search({ header: { "Message-ID": messageId.toLowerCase() } })) as readonly number[] | false | undefined;
      if (hits && hits.length) {
        if (seen) await client.messageFlagsAdd([...hits], ["\\Seen"], { uid: true });
        else await client.messageFlagsRemove([...hits], ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** ---------- attachment fetch-on-demand ---------- */

export interface FetchedAttachment {
  filename: string;
  mime: string;
  content: Buffer;
}

/** Pull one attachment live from IMAP (searches every mailbox by Message-ID). */
export async function fetchAttachment(
  account: EmailAccount,
  messageId: string,
  index: number,
): Promise<FetchedAttachment | null> {
  const client = makeClient(account);
  await client.connect();
  try {
    const listed = await client.list().catch(() => []);
    const boxes = resolveBoxes(listed);
    for (const [, path] of boxes) {
      const lock = await client.getMailboxLock(path);
      try {
        await client.mailboxOpen(path, { readOnly: true });
        const hits = (await client.search({ header: { "Message-ID": messageId.toLowerCase() } })) as number[] | false | undefined;
        if (!hits || !hits.length) continue;
        const msg = await client.fetchOne(hits[0], { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed: ParsedMail = await simpleParser(msg.source);
        const named = (parsed.attachments ?? []).filter((x) => x.filename);
        const att = named[index];
        if (att) {
          return {
            filename: att.filename as string,
            mime: att.contentType || "application/octet-stream",
            content: att.content as Buffer,
          };
        }
      } finally {
        lock.release();
      }
    }
    return null;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

/** ---------- SMTP send ---------- */

export interface SendParams {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendMail(
  account: EmailAccount,
  p: SendParams
): Promise<{ messageId: string }> {
  const port = account.smtpPort || 587;
  const transport = nodemailer.createTransport({
    host: account.smtpHost || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: account.emailAddress, pass: account.appPassword.replace(/\s+/g, "") },
    connectionTimeout: 20000,
  });
  const from = account.name ? `"${account.name.replace(/"/g, "")}" <${account.emailAddress}>` : account.emailAddress;
  const info = await transport.sendMail({
    from,
    to: p.to,
    cc: p.cc || undefined,
    bcc: p.bcc || undefined,
    subject: p.subject,
    text: p.text,
    html: p.html ?? `<div style="white-space:pre-wrap;font-family:inherit">${escapeHtml(p.text)}</div>`,
    inReplyTo: p.inReplyTo,
    references: p.references,
  });
  return { messageId: normId(String(info.messageId || "")) || `local-${Date.now()}-sent` };
}

/** SMTP credential check for the config "test" action. */
export async function testSmtpConnection(cfg: Pick<EmailAccount, "emailAddress" | "appPassword" | "smtpHost" | "smtpPort">): Promise<void> {
  const port = cfg.smtpPort || 587;
  const transport = nodemailer.createTransport({
    host: cfg.smtpHost || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: cfg.emailAddress, pass: cfg.appPassword.replace(/\s+/g, "") },
    connectionTimeout: 15000,
  });
  await transport.verify();
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
