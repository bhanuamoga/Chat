import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { getGeminiModel, NATURAL_CHAT_SYSTEM_PROMPT } from "@/lib/gemini";
import { db } from "@/db";
import { naturalChats, naturalMessages } from "@/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import type { VisualData } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Helper: extract ```visual-json ... ``` payload from assistant text
 */
function extractVisualData(rawText: string): { text: string; visualData: VisualData | null } {
  const jsonRegex = /```visual-json\s*([\s\S]*?)\s*```/;
  const match = rawText.match(jsonRegex);

  if (!match) {
    return { text: rawText.trim(), visualData: null };
  }

  let visualData: VisualData | null = null;
  try {
    visualData = JSON.parse(match[1]);
  } catch (err) {
    console.warn("[natural-chat] Failed to parse visual JSON payload:", err);
  }

  const cleanText = rawText.replace(jsonRegex, "").trim();
  return { text: cleanText, visualData };
}

// POST /api/natural/chats/[id]/messages
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userContent = String(body.content || "").trim();

  if (!userContent) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  // Verify chat ownership
  const [chat] = await db
    .select()
    .from(naturalChats)
    .where(and(eq(naturalChats.id, id), eq(naturalChats.userId, userId)))
    .limit(1);

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  // 1. Insert user message
  const [userMsg] = await db
    .insert(naturalMessages)
    .values({
      chatId: id,
      role: "user",
      content: userContent,
      modelUsed: chat.model || "gemini-2.5-flash",
    })
    .returning();

  // 2. Load conversation history for context
  const previousMsgs = await db
    .select()
    .from(naturalMessages)
    .where(eq(naturalMessages.chatId, id))
    .orderBy(asc(naturalMessages.createdAt))
    .limit(30);

  const history = previousMsgs.map((m) => ({
    role: m.role as "user" | "assistant" | "system",
    content: m.content,
  }));

  // 3. Call Google Gemini 2.5 Flash via AI SDK
  let aiResult;
  let modelInstance;
  try {
    modelInstance = getGeminiModel();
  } catch (keyErr: any) {
    return NextResponse.json(
      {
        error:
          keyErr?.message ||
          "GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY to your environment variables.",
      },
      { status: 500 }
    );
  }

  try {
    aiResult = await generateText({
      model: modelInstance,
      system: chat.systemPrompt || NATURAL_CHAT_SYSTEM_PROMPT,
      messages: history,
    });
  } catch (aiErr: any) {
    console.error("[natural-chat] Gemini API error:", aiErr);
    return NextResponse.json(
      {
        error:
          aiErr?.message ||
          "Gemini API returned an error. Please verify GEMINI_API_KEY is active and valid.",
      },
      { status: 500 }
    );
  }

  const rawAnswer = aiResult.text || "";
  const { text: cleanContent, visualData } = extractVisualData(rawAnswer);

  // Approximate or actual token usage from AI SDK response (ai v3/v4 exports promptTokens or inputTokens)
  const usageAny = (aiResult.usage || {}) as any;
  const promptTokens =
    usageAny.promptTokens ??
    usageAny.inputTokens ??
    Math.round((userContent.length + history.reduce((acc, h) => acc + h.content.length, 0)) / 4);
  const completionTokens =
    usageAny.completionTokens ?? usageAny.outputTokens ?? Math.round(cleanContent.length / 4);
  const totalTokens = promptTokens + completionTokens;

  // 4. Save assistant message with token usage & visual data
  const [assistantMsg] = await db
    .insert(naturalMessages)
    .values({
      chatId: id,
      role: "assistant",
      content: cleanContent,
      visualData,
      promptTokens,
      completionTokens,
      totalTokens,
      modelUsed: "gemini-2.5-flash",
    })
    .returning();

  // 5. Update chat title if it was the first turn, and accumulate token telemetry
  const isFirstTurn = previousMsgs.length <= 1;
  const newPromptTotal = (chat.totalPromptTokens || 0) + promptTokens;
  const newCompletionTotal = (chat.totalCompletionTokens || 0) + completionTokens;
  const newGrandTotal = (chat.totalTokens || 0) + totalTokens;

  const updateSet: {
    updatedAt: Date;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    title?: string;
  } = {
    updatedAt: new Date(),
    totalPromptTokens: newPromptTotal,
    totalCompletionTokens: newCompletionTotal,
    totalTokens: newGrandTotal,
  };

  if (isFirstTurn && userContent.length > 0) {
    updateSet.title = userContent.slice(0, 50).trim();
  }

  const [updatedChat] = await db
    .update(naturalChats)
    .set(updateSet)
    .where(eq(naturalChats.id, id))
    .returning();

  return NextResponse.json({
    userMessage: {
      ...userMsg,
      createdAt: userMsg.createdAt.toISOString(),
    },
    assistantMessage: {
      ...assistantMsg,
      createdAt: assistantMsg.createdAt.toISOString(),
    },
    chat: {
      ...updatedChat,
      createdAt: updatedChat.createdAt.toISOString(),
      updatedAt: updatedChat.updatedAt.toISOString(),
    },
    tokenUsage: {
      promptTokens,
      completionTokens,
      totalTokens,
    },
  });
}
