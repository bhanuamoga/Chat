/**
 * GET /api/email/attachment?accountId=&id=<messageId>&i=<index>
 * Fetches an attachment live from Gmail over IMAP and streams it inline
 * (PDFs/images open in a tab, everything else downloads).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts } from "@/db/schema";
import { auth } from "@/auth";
import { ensureEmailSchema } from "@/lib/email/ddl";
import { fetchAttachment } from "@/lib/email/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureEmailSchema();

  const q = req.nextUrl.searchParams;
  const accountId = q.get("accountId") || "";
  const messageId = q.get("id") || "";
  const index = Math.max(0, Number(q.get("i")) || 0);
  if (!accountId || !messageId) return NextResponse.json({ error: "accountId + id required" }, { status: 400 });

  const [account] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, accountId), eq(emailAccounts.userId, userId)))
    .limit(1);
  if (!account) return NextResponse.json({ error: "Email account not found" }, { status: 404 });

  try {
    const att = await fetchAttachment(account, messageId, index);
    if (!att) return NextResponse.json({ error: "Attachment not found on the server" }, { status: 404 });
    const bytes = new Uint8Array(att.content);
    return new Response(bytes, {
      headers: {
        "Content-Type": att.mime,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.filename)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "download failed" }, { status: 502 });
  }
}
