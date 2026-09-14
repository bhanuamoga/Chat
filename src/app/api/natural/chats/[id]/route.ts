import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { naturalChats, naturalMessages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

// GET /api/natural/chats/[id] - Fetch messages & metadata for a chat
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [chat] = await db
    .select()
    .from(naturalChats)
    .where(and(eq(naturalChats.id, id), eq(naturalChats.userId, userId)))
    .limit(1);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const msgs = await db
    .select()
    .from(naturalMessages)
    .where(eq(naturalMessages.chatId, id))
    .orderBy(asc(naturalMessages.createdAt));

  return NextResponse.json({
    chat: {
      ...chat,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
    },
    messages: msgs.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
      visualData: m.visualData,
      promptTokens: m.promptTokens ?? 0,
      completionTokens: m.completionTokens ?? 0,
      totalTokens: m.totalTokens ?? 0,
      modelUsed: m.modelUsed ?? "gemini-2.5-flash",
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

// DELETE /api/natural/chats/[id] - Delete a chat
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  await db
    .delete(naturalChats)
    .where(and(eq(naturalChats.id, id), eq(naturalChats.userId, userId)));

  return NextResponse.json({ ok: true });
}
