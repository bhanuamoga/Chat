import { NextRequest } from "next/server";
import { addSseClient, removeSseClient } from "@/lib/realtime-server";

/**
 * Built-in realtime stream (Supabase-compatible fallback).
 * Event shape mirrors Supabase Broadcast payloads so the client
 * can swap between Supabase Realtime and this SSE endpoint transparently.
 *
 * Usage (client):
 *   const es = new EventSource(`/api/realtime/stream?userId=${me.id}`);
 *   es.onmessage = (e) => handleRealtimeEvent(JSON.parse(e.data));
 *
 * Supabase equivalent:
 *   supabase.channel('chat:global').on('broadcast', { event: '*' }, handler)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // closed
        }
      };

      addSseClient({ id: clientId, userId, enqueue });

      // hello
      enqueue(`data: ${JSON.stringify({ type: "connected", clientId, _ts: Date.now() })}\n\n`);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 20000);

      const cleanup = () => {
        clearInterval(heartbeat);
        removeSseClient(clientId);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      req.signal?.addEventListener("abort", cleanup);
    },
    cancel() {
      removeSseClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
