/**
 * Email sync + send helpers.
 * Receive: imapflow (IMAP). Send: nodemailer (SMTP). Parse: mailparser.
 */
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import nodemailer from "nodemailer";
import type { EmailAccount } from "@/db/schema";
import type { EmailAddress } from "./types";

const SYNC_LIMIT_PER_BOX = 150;

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
  folder: "inbox" | "sent";
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments: { filename: string; size?: number; mime?: string }[];
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

async function fetchBox(client: ImapFlow, path: string, folder: "inbox" | "sent"): Promise<SyncedEmail[]> {
  const lock = await client.getMailboxLock(path);
  try {
    const mailbox = await client.mailboxOpen(path, { readOnly: true });
    const total = mailbox.exists || 0;
    if (!total) return [];
    const from = Math.max(1, total - SYNC_LIMIT_PER_BOX + 1);
    const out: SyncedEmail[] = [];
    for await (const msg of client.fetch(`${from}:${total}`, { envelope: true, source: true, flags: true })) {
      if (!msg.source) continue;
      try {
        const parsed: ParsedMail = await simpleParser(msg.source);
        const messageId = normId(String(parsed.messageId || msg.envelope?.messageId || "")) || `local-${msg.uid}-${folder}`;
        const refs = refChain(parsed.references);
        const subject = parsed.subject || "(no subject)";
        const bodyText = parsed.text?.trim() || "";
        const bodyHtml = typeof parsed.html === "string" ? sanitizeEmailHtml(parsed.html) : null;
        const from = parsed.from?.value?.[0];
        out.push({
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
          date: parsed.date ? new Date(parsed.date) : (msg.envelope?.date ? new Date(msg.envelope.date) : new Date()),
          folder,
          isRead: msg.flags?.has("\\Seen") ?? false,
          isStarred: msg.flags?.has("\\Flagged") ?? false,
          hasAttachments: (parsed.attachments?.length ?? 0) > 0,
          attachments: (parsed.attachments ?? [])
            .filter((x) => x.filename)
            .map((x) => ({ filename: x.filename as string, size: x.size, mime: x.contentType })),
        });
      } catch {
        /* one bad message shouldn't kill the sync */
      }
    }
    return out;
  } finally {
    lock.release();
  }
}

/** Fetch the newest messages from INBOX + Sent for this account. */
export async function syncAccount(account: EmailAccount): Promise<SyncedEmail[]> {
  const client = makeClient(account);
  await client.connect();
  try {
    let sentPath = "[Gmail]/Sent Mail";
    try {
      const boxes = await client.list();
      const sent = boxes.find((b) => b.specialUse === "\\Sent");
      if (sent?.path) sentPath = sent.path;
    } catch { /* keep the Gmail default */ }

    const inbox = await fetchBox(client, "INBOX", "inbox");
    let sent: SyncedEmail[] = [];
    try {
      sent = await fetchBox(client, sentPath, "sent");
    } catch { /* some servers deny Sent listing; not fatal */ }
    return [...inbox, ...sent];
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

/** ---------- SMTP send ---------- */

export interface SendParams {
  to: string;
  cc?: string;
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
