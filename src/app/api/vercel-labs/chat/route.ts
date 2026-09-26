import { streamText, convertToModelMessages } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseAiApiConfig } from "@/lib/ai-config";
import { LABS_SYSTEM_PROMPT } from "@/lib/vercel-labs/prompt";
import { touchPromptCount } from "@/lib/vercel-labs/usage";
import type { UIMessage } from "ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/vercel-labs/chat
 * Independent Vercel AI SDK 7 endpoint. Body: { messages: UIMessage[], entryId?, model? }
 * Streams a UIMessageStream (sendReasoning consumed client-side).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const body = await req.json().catch(() => ({}));
  const messages = (body.messages || []) as UIMessage[];
  if (!messages.length) return new Response(JSON.stringify({ error: "empty conversation" }), { status: 400 });

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });

  const config = parseAiApiConfig(userRow.aiApiConfig);
  const entry =
    (body.entryId ? config.entries.find((e) => e.id === body.entryId) : null) ||
    (config.defaultEntryId ? config.entries.find((e) => e.id === config.defaultEntryId) : null) ||
    config.entries[0] ||
    null;
  if (!entry) {
    return new Response(
      JSON.stringify({ error: "Connect an API key on the AI APIs page first." }),
      { status: 429 }
    );
  }

  /* per-user daily budget — labs prompts share the same daily counter */
  const usage = await touchPromptCount(userId, userRow);
  if (usage.error) {
    return new Response(JSON.stringify({ error: usage.error }), { status: 429 });
  }

  const modelId =
    body.model && entry.models.includes(String(body.model))
      ? String(body.model)
      : entry.models[0] || "gemini-2.5-flash";

  let model: any;
  if (entry.provider === "gemini") {
    model = createGoogleGenerativeAI({ apiKey: entry.apiKey })(modelId);
  } else if (entry.provider === "openai") {
    model = createOpenAI({ apiKey: entry.apiKey })(modelId);
  } else {
    model = createOpenRouter({ apiKey: entry.apiKey })(modelId);
  }

  const result = streamText({
    model,
    system: LABS_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    temperature: 0.4,
    maxOutputTokens: 4096,
    ...(entry.provider === "gemini"
      ? {
          providerOptions: {
            google: { thinkingConfig: { thinkingBudget: -1, includeThoughts: true } },
          },
        }
      : {}),
  });

  return result.toUIMessageStreamResponse({ sendReasoning: true });
}
