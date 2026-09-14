import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationParticipants, conversations, messages, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getMessagesForConversation, toMessageRow, toUserRow } from "@/lib/conversation-helpers";
import { publishRealtime } from "@/lib/realtime-server";
import type { MessageType } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 100), 200);
  const before = searchParams.get("before") || undefined;
  const msgs = await getMessagesForConversation(id, limit, before);
  return NextResponse.json({ messages: msgs });
}

const VALID_TYPES: MessageType[] = ["text", "image", "video", "audio", "document", "system"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const senderId = String(body.senderId || "");
  const content = String(body.content || "").slice(0, 4000);
  const replyToId = body.replyToId ? String(body.replyToId) : null;

  // Attachments (Option A: all file types)
  const attachmentUrl = body.attachmentUrl ? String(body.attachmentUrl).slice(0, 4000) : null;
  const attachmentName = body.attachmentName ? String(body.attachmentName).slice(0, 255) : null;
  const attachmentSize =
    typeof body.attachmentSize === "number" ? Math.floor(body.attachmentSize) : null;
  const attachmentMime = body.attachmentMime ? String(body.attachmentMime).slice(0, 120) : null;

  // Legacy: base64/URL image in imageUrl
  const legacyImageUrl = body.imageUrl ? String(body.imageUrl).slice(0, 2_000_000) : null;

  let messageType: MessageType = "text";
  if (body.messageType && VALID_TYPES.includes(body.messageType)) {
    messageType = body.messageType;
  } else if (attachmentUrl) {
    if (attachmentMime?.startsWith("image/")) messageType = "image";
    else if (attachmentMime?.startsWith("video/")) messageType = "video";
    else if (attachmentMime?.startsWith("audio/")) messageType = "audio";
    else messageType = "document";
  } else if (legacyImageUrl) {
    messageType = "image";
  }

  if (!senderId) return NextResponse.json({ error: "senderId required" }, { status: 400 });
  if (!content.trim() && !attachmentUrl && !legacyImageUrl) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return NextResponse.json({ error: "conversation not found" }, { status: 404 });

  const [sender] = await db.select().from(users).where(eq(users.id, senderId)).limit(1);
  if (!sender) return NextResponse.json({ error: "sender not found" }, { status: 404 });

  const [created] = await db
    .insert(messages)
    .values({
      conversationId: id,
      senderId,
      content: content.trim(),
      messageType,
      imageUrl: legacyImageUrl,
      attachmentUrl,
      attachmentName,
      attachmentSize,
      attachmentMime,
      replyToId,
    })
    .returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id));

  // mark sender as read
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: new Date() })
    .where(
      and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, senderId)
      )
    );

  const message = toMessageRow(created, sender);

  if (replyToId) {
    const [rm] = await db.select().from(messages).where(eq(messages.id, replyToId)).limit(1);
    if (rm) {
      let rsender = null;
      if (rm.senderId) {
        const [rs] = await db.select().from(users).where(eq(users.id, rm.senderId)).limit(1);
        rsender = rs ?? null;
      }
      message.replyTo = toMessageRow(rm, rsender);
    }
  }

  // ensure sender embedded with email fields
  message.sender = toUserRow(sender);

  await publishRealtime({ type: "message:new", conversationId: id, message });
  await publishRealtime({ type: "conversation:update", conversationId: id });

  return NextResponse.json({ message });
}
