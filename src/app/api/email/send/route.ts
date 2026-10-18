/**
 * POST /api/email/send
 * Sends via Gmail SMTP (nodemailer). For replies keeps the RFC threading
 * headers (In-Reply-To + References) so the sent mail lands in the same
 * conversation in Gmail — 100% thread-compatible — and parks a local copy
 * in the `emails` table (folder=sent).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emails } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { sendMail, snippetOf, escapeHtml, type OutAttachment } from "@/lib/email/mail";
import type { EmailAddress } from "@/lib/email/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const parseAddresses = (raw: string): EmailAddress[] =>
  raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*)<([^>]+)>\s*$/);
      return m ? { name: m[1].trim() || undefined, address: m[2].toLowerCase() } : { address: s.toLowerCase() };
    });

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const body: Record<string, unknown> = await req.json().catch(() => ({}));
  const accountId = String(body.accountId || "");
  const replyToEmailId = String(body.replyToEmailId || "");
  let to = String(body.to || "").trim();
  const cc = String(body.cc || "").trim();
  const bcc = String(body.bcc || "").trim();
  let subject = String(body.subject || "").trim();
  const text = String(body.text || "");
  interface RefAttachment { url: string; name?: string; mime?: string }
  const refAttachments: RefAttachment[] = Array.isArray(body.attachments)
    ? (body.attachments as RefAttachment[]).filter((x) => x && typeof x.url === "string").slice(0, 10)
    : [];

  if (!accountId || !text) return NextResponse.json({ error: "accountId + text required" }, { status: 400 });

  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
    .limit(1);
  if (!account) return NextResponse.json({ error: "Email account not found" }, { status: 404 });

  /* ---- reply threading (Gmail 100% same): headers + defaults from parent ---- */
  let threadKey: string | undefined;
  let inReplyTo: string | undefined;
  let references: string | undefined;
  if (replyToEmailId) {
    const [parent] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, replyToEmailId), eq(emails.userId, userId)))
      .limit(1);
    if (!parent) return NextResponse.json({ error: "Original message not found" }, { status: 404 });
    threadKey = parent.threadKey;
    inReplyTo = parent.messageId;
    references = [parent.refIds, parent.messageId].filter(Boolean).join(" ").trim();
    if (!to) to = parent.fromAddress;
    if (!subject) {
      const s = parent.subject || "";
      subject = /^re:/i.test(s) ? s : `Re: ${s}`;
    }
  }

  if (!to) return NextResponse.json({ error: "Recipient (to) is required" }, { status: 400 });

  try {
    /* pull the uploaded bytes back off storage so nodemailer can attach them */
    const attachments: OutAttachment[] = [];
    const attachmentMeta: { filename: string; size?: number; mime?: string }[] = [];
    for (const ref of refAttachments) {
      try {
        const url = ref.url.startsWith("http") ? ref.url : req.nextUrl.origin + ref.url;
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > 20 * 1024 * 1024) continue;
        attachments.push({ filename: ref.name || "file", content: buf, contentType: ref.mime || "application/octet-stream" });
        attachmentMeta.push({ filename: ref.name || "file", size: buf.length, mime: ref.mime || "application/octet-stream" });
      } catch { /* best effort per file */ }
    }

    const { messageId } = await sendMail(account, { to, cc, bcc, subject, text, inReplyTo, references, attachments });

    const localRow = {
      userId,
      accountId: account.id,
      messageId,
      threadKey: threadKey ?? messageId,
      inReplyTo: inReplyTo ?? null,
      refIds: references ?? "",
      fromAddress: account.emailAddress,
      fromName: account.name,
      toAddresses: parseAddresses(to),
      ccAddresses: parseAddresses(cc),
      subject,
      snippet: snippetOf(text),
      bodyText: text,
      bodyHtml: `<div style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</div>`,
      date: new Date(),
      folder: "sent",
      isRead: true,
      hasAttachments: attachmentMeta.length > 0,
      attachments: attachmentMeta,
    };
    await db
      .insert(emails)
      .values(localRow)
      .onConflictDoUpdate({
        target: [emails.accountId, emails.messageId],
        set: { bodyText: text, snippet: snippetOf(text), hasAttachments: attachmentMeta.length > 0, attachments: attachmentMeta },
      });

    return NextResponse.json({ ok: true, messageId, threadKey: localRow.threadKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 502 });
  }
}
