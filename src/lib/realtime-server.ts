import type { RealtimeEvent } from "./types";
import { channelForConversation, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } from "./supabase";

type SseClient = {
  id: string;
  userId: string | null;
  enqueue: (data: string) => void;
};

const g = globalThis as typeof globalThis & {
  __pingchat_sse?: Map<string, SseClient>;
};

function clients(): Map<string, SseClient> {
  if (!g.__pingchat_sse) g.__pingchat_sse = new Map();
  return g.__pingchat_sse;
}

export function addSseClient(c: SseClient) {
  clients().set(c.id, c);
}

export function removeSseClient(id: string) {
  clients().delete(id);
}

export function sseClientCount() {
  return clients().size;
}

/**
 * Publish a realtime event:
 *
 * 1. Local SSE clients (same process).
 * 2. Supabase Realtime REST Broadcast:
 *    When clients subscribe via supabase.channel("chat:<id>"), supabase-js joins
 *    the Phoenix topic "realtime:chat:<id>".
 *    To ensure instant receipt across every client, we broadcast to BOTH:
 *      - `realtime:${target}`
 *      - `${target}`
 *    for the conversation channel AND global broadcast.
 */
export async function publishRealtime(event: RealtimeEvent) {
  // 1. Local SSE clients
  const payloadStr = `data: ${JSON.stringify({ ...event, _ts: Date.now() })}\n\n`;
  for (const c of clients().values()) {
    try {
      c.enqueue(payloadStr);
    } catch {
      // ignore broken pipes
    }
  }

  // 2. Supabase Realtime REST Broadcast
  if (SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)) {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

    // Collect topics: conversation specific and global
    const targetTopics: string[] = ["global"];
    if ("conversationId" in event && event.conversationId) {
      targetTopics.push(event.conversationId);
      targetTopics.push(channelForConversation(event.conversationId));
    }

    const allTopicStrings = new Set<string>();
    for (const t of targetTopics) {
      allTopicStrings.add(t);
      allTopicStrings.add(`realtime:${t}`);
    }

    const messages = Array.from(allTopicStrings).map((topic) => ({
      topic,
      event: event.type,
      payload: event,
      private: false,
    }));

    try {
      const res = await fetch(`${SUPABASE_URL.replace(/\/+$/, "")}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.warn("[realtime-server] Broadcast failed:", res.status, text);
      }
    } catch (err) {
      console.warn("[realtime-server] Broadcast network error:", err);
    }
  }
}
