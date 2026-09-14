import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { naturalChats, naturalMessages } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

// GET /api/natural/chats - List current user's Natural AI conversations
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chats = await db
    .select({
      id: naturalChats.id,
      userId: naturalChats.userId,
      title: naturalChats.title,
      model: naturalChats.model,
      systemPrompt: naturalChats.systemPrompt,
      totalPromptTokens: naturalChats.totalPromptTokens,
      totalCompletionTokens: naturalChats.totalCompletionTokens,
      totalTokens: naturalChats.totalTokens,
      createdAt: naturalChats.createdAt,
      updatedAt: naturalChats.updatedAt,
      messageCount: sql<number>`(SELECT count(*)::int FROM natural_messages WHERE natural_messages.chat_id = natural_chats.id)`,
      lastMessagePreview: sql<string>`(SELECT content FROM natural_messages WHERE natural_messages.chat_id = natural_chats.id ORDER BY created_at DESC LIMIT 1)`,
    })
    .from(naturalChats)
    .where(eq(naturalChats.userId, userId))
    .orderBy(desc(naturalChats.updatedAt));

  return NextResponse.json({
    chats: chats.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  });
}

// POST /api/natural/chats - Create a new Natural AI conversation
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const title = (body.title || "New Conversation").slice(0, 100);

  const [chat] = await db
    .insert(naturalChats)
    .values({
      userId,
      title,
      model: "gemini-2.5-flash",
    })
    .returning();

  return NextResponse.json({
    chat: {
      ...chat,
      createdAt: chat.createdAt.toISOString(),
      updatedAt: chat.updatedAt.toISOString(),
      messageCount: 0,
      lastMessagePreview: "",
    },
  });
}
