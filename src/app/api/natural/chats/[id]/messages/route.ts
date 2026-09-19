import { NextRequest, NextResponse } from "next/server";
import { streamText } from "ai";
import { NATURAL_CHAT_SYSTEM_PROMPT } from "@/lib/gemini";
import { resolveChatModel } from "@/lib/ai-config";
import { db } from "@/db";
import { naturalChats, naturalMessages, users } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDailyUsage } from "@/lib/rate-limit";
import { parseAiApiConfig } from "@/lib/ai-config";
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

/**
 * POST /api/natural/chats/[id]/messages
 * Streams the Gemini answer LIVE as newline-delimited JSON events:
 *   {"t":"reasoning","d":"…"}  - the model's live thinking (Gemini includes thoughts)
 *   {"t":"text","d":"…"}       - answer token deltas (client types them out like ChatGPT/v0)
 *   {"t":"done", …}            - persisted rows: userMessage, assistantMessage, chat, tokenUsage, usage
 *   {"t":"error","d":"…"}
 * Non-streaming errors (auth / rate-limit / chat missing) still return plain JSON errors.
 */
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
  /* BYOK selection from the composer dropdown (either may be omitted → fallback to user default / built-in) */
  const apiEntryId =
    typeof body.apiEntryId === "string" && body.apiEntryId ? body.apiEntryId : null;
  const wantModel = typeof body.model === "string" && body.model ? body.model : null;

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

  // Daily per-user prompt rate limit (resets at midnight IST)
  const usageBefore = await getDailyUsage(userId);
  if (usageBefore.reached) {
    return NextResponse.json(
      {
        error: `Daily limit reached: you can send ${usageBefore.limit} prompts per day. Come back tomorrow — your quota resets at midnight.`,
        code: "DAILY_LIMIT",
        usage: usageBefore,
      },
      { status: 429 }
    );
  }

  // 1. Resolve which provider/model/key streams this reply:
  //    the user's own API entry (BYOK) or the built-in default Gemini key.
  const [meRow] = await db
    .select({ aiApiConfig: users.aiApiConfig })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  let resolved;
  try {
    resolved = await resolveChatModel(
      parseAiApiConfig(meRow?.aiApiConfig),
      apiEntryId,
      wantModel
    );
  } catch (keyErr: any) {
    const msg = String(keyErr?.message || "");
    if (msg.startsWith("NO_API_KEY:")) {
      return NextResponse.json(
        {
          error: msg.replace("NO_API_KEY: ", ""),
          code: "NO_API_KEY",
        },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        error:
          msg ||
          "AI API key is not configured. Add a valid one on the AI APIs page.",
        code: "NO_API_KEY",
      },
      { status: 400 }
    );
  }
  const { model: modelInstance, modelId, provider, sourceName } = resolved;
  const modelLabel = `${sourceName} · ${modelId}`;

  // 2. Insert user message first (it exists even if generation fails mid-way)
  const [userMsg] = await db
    .insert(naturalMessages)
    .values({
      chatId: id,
      role: "user",
      content: userContent,
      modelUsed: modelLabel.slice(0, 160),
    })
    .returning();

  // 3. Load conversation history for context
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


  const result = streamText({
    model: modelInstance,
    system: chat.systemPrompt || NATURAL_CHAT_SYSTEM_PROMPT,
    messages: history,
    ...(provider === "gemini"
      ? {
          providerOptions: {
            google: {
              thinkingConfig: {
                // include the model's live reasoning so the UI can show "what it's doing"
                includeThoughts: true,
              },
            },
          },
        }
      : {}),
  });

  const encoder = new TextEncoder();
  let fullText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        for await (const part of result.fullStream as AsyncIterable<any>) {
          const p = part as { type: string; text?: string; delta?: string; textDelta?: string };
          // AI SDK 7 fullStream parts: { type: 'text-delta', text } / { type: 'reasoning-delta', text }
          if (p.type === "text-delta" || p.type === "text") {
            const delta = p.text ?? p.delta ?? p.textDelta ?? "";
            if (delta) {
              fullText += delta;
              send({ t: "text", d: delta });
            }
          } else if (p.type === "reasoning-delta" || p.type === "reasoning") {
            const delta = p.text ?? p.delta ?? p.textDelta ?? "";
            if (delta) {
              send({ t: "reasoning", d: delta });
            }
          } else if (p.type === "error") {
            throw (part as { error?: unknown }).error;
          }
        }

        // Guard: never persist an empty assistant bubble
        if (!fullText.trim()) {
          send({
            t: "error",
            d: "The model returned an empty response. Please try sending again.",
          });
          return;
        }

        // 4. Persist assistant message once the stream completes
        const rawAnswer = fullText;
        const { text: cleanContent, visualData } = extractVisualData(rawAnswer);

        const usageAny = ((await result.usage) || {}) as any;
        const promptTokens =
          usageAny.promptTokens ??
          usageAny.inputTokens ??
          Math.round(
            (userContent.length + history.reduce((acc, h) => acc + h.content.length, 0)) / 4
          );
        const completionTokens =
          usageAny.completionTokens ?? usageAny.outputTokens ?? Math.round(cleanContent.length / 4);
        const totalTokens = promptTokens + completionTokens;

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
            modelUsed: modelLabel.slice(0, 160),
          })
          .returning();

        // 5. Title on first turn + token telemetry accumulation
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

        send({
          t: "done",
          userMessage: { ...userMsg, createdAt: userMsg.createdAt.toISOString() },
          assistantMessage: { ...assistantMsg, createdAt: assistantMsg.createdAt.toISOString() },
          chat: {
            ...updatedChat,
            createdAt: updatedChat.createdAt.toISOString(),
            updatedAt: updatedChat.updatedAt.toISOString(),
          },
          tokenUsage: { promptTokens, completionTokens, totalTokens },
          usage: await getDailyUsage(userId),
        });
      } catch (err: any) {
        console.error("[natural-chat] streaming error:", err);
        send({
          t: "error",
          d:
            err?.message ||
            "Gemini API returned an error during streaming. Please try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
