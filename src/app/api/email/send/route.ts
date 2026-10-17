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
import { sendMail, snippetOf, escapeHtml } from "@/lib/email/mail";
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
  let subject = String(body.subject || "").trim();
  const text = String(body.text || "");

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
    const { messageId } = await sendMail(account, { to, cc, subject, text, inReplyTo, references });

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
    };
    await db
      .insert(emails)
      .values(localRow)
      .onConflictDoUpdate({
        target: [emails.accountId, emails.messageId],
        set: { bodyText: text, snippet: snippetOf(text) },
      });

    return NextResponse.json({ ok: true, messageId, threadKey: localRow.threadKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed" }, { status: 502 });
  }
}
