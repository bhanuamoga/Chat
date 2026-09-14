"use client";

import { useEffect, useRef } from "react";
import type { RealtimeEvent } from "./types";
import { channelForConversation, getSupabaseBrowser, isSupabaseConfigured } from "./supabase";

/**
 * useRealtime — High-precision Supabase Realtime Hook
 *
 * Implements:
 * 1. Supabase WebSocket Presence: tracks live online state on channels and emits
 *    instant 'presence' events on join/leave/sync with zero delay.
 * 2. Broadcast listeners across all conversation channels.
 * 3. PostgreSQL WAL changes on `messages` table via Supabase replication.
 * 4. Active conversation polling fallback (1.8s) so no packet drops.
 */
export function useRealtime(
  userId: string | null,
  activeConversationId: string | null,
  conversationIds: string[],
  onEvent: (e: RealtimeEvent) => void,
  onStatus?: (status: { supabase: boolean; sse: boolean }) => void
) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const seenRef = useRef<Set<string>>(new Set());

  // Stable dependency key: active ID + conversation IDs
  const convKey = [activeConversationId || "none", ...conversationIds.slice().sort()].join(",");

  useEffect(() => {
    if (!userId) return;
    const seen = seenRef.current;
    let sseOk = false;
    let sbOk = false;
    const emitStatus = () => statusRef.current?.({ supabase: sbOk, sse: sseOk });

    const deduped = (e: RealtimeEvent & { _ts?: number; message?: { id?: string } }) => {
      // Never dedupe typing or presence events so live updates flow immediately!
      if (e.type !== "typing" && e.type !== "presence") {
        const mid =
          "message" in e && e.message && typeof e.message === "object" && "id" in e.message
            ? (e.message as { id: string }).id
            : "messageId" in e
              ? (e as { messageId: string }).messageId
              : null;

        const key = mid
          ? `${e.type}:${mid}`
          : `${e.type}:${JSON.stringify(e).slice(0, 160)}:${e._ts ?? ""}`;

        if (seen.has(key)) return;
        seen.add(key);
        if (seen.size > 800) {
          const first = seen.values().next().value;
          if (first) seen.delete(first);
        }
      }
      handlerRef.current(e);
    };

    // ---- 1. Supabase Realtime (Presence + Broadcast + Postgres Changes) ----
    const cleanupFns: (() => void)[] = [];
    try {
      const sb = getSupabaseBrowser();
      if (sb && isSupabaseConfigured) {
        // Global channel with Realtime Presence tracking
        const globalCh = sb.channel("global", {
          config: {
            broadcast: { self: true },
            presence: { key: userId },
          },
        });

        globalCh.on("broadcast", { event: "*" }, ({ payload }) => {
          if (payload && typeof payload === "object" && "type" in payload) {
            deduped(payload as RealtimeEvent);
          }
        });

        // Supabase Presence: sync online status whenever users connect/disconnect
        globalCh
          .on("presence", { event: "sync" }, () => {
            const state = globalCh.presenceState();
            const now = new Date().toISOString();
            for (const [uid, presences] of Object.entries(state)) {
              if (presences && presences.length > 0) {
                deduped({
                  type: "presence",
                  userId: uid,
                  lastSeen: now,
                  online: true,
                });
              }
            }
          })
          .on("presence", { event: "join" }, ({ key }) => {
            if (key) {
              deduped({
                type: "presence",
                userId: key,
                lastSeen: new Date().toISOString(),
                online: true,
              });
            }
          })
          .on("presence", { event: "leave" }, ({ key }) => {
            if (key) {
              // User left: mark offline with past timestamp so UI transitions instantly
              deduped({
                type: "presence",
                userId: key,
                lastSeen: new Date(Date.now() - 300000).toISOString(),
                online: false,
              });
            }
          });

        // Listen for direct postgres database changes on messages table
        globalCh.on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          (payload) => {
            const row = payload.new as any;
            if (row && row.id && row.conversation_id) {
              deduped({
                type: "conversation:update",
                conversationId: row.conversation_id,
              });
            }
          }
        );

        globalCh.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            sbOk = true;
            emitStatus();
            // Announce presence over WebSocket
            try {
              await globalCh.track({
                userId,
                online_at: new Date().toISOString(),
              });
            } catch {
              // ignore
            }
          }
        });

        cleanupFns.push(() => {
          try {
            globalCh.untrack().catch(() => {});
            sb.removeChannel(globalCh);
          } catch {
            // ignore
          }
        });

        // Specific conversation channels
        const targetIds = new Set<string>();
        if (activeConversationId) targetIds.add(activeConversationId);
        for (const id of conversationIds) targetIds.add(id);

        for (const convId of targetIds) {
          const chName = channelForConversation(convId);
          const ch = sb.channel(chName, {
            config: { broadcast: { self: true } },
          });

          ch.on("broadcast", { event: "*" }, ({ payload }) => {
            if (payload && typeof payload === "object" && "type" in payload) {
              deduped(payload as RealtimeEvent);
            }
          });

          ch.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              sbOk = true;
              emitStatus();
            }
          });

          cleanupFns.push(() => {
            try {
              sb.removeChannel(ch);
            } catch {
              // ignore
            }
          });
        }
      }
    } catch (err) {
      console.warn("[realtime-client] Supabase channel error:", err);
    }

    // ---- 2. Built-in SSE stream (fallback / local dev) ----
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/realtime/stream?userId=${encodeURIComponent(userId)}`);
      es.onopen = () => {
        sseOk = true;
        emitStatus();
      };
      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === "connected") return;
          deduped(data);
        } catch {
          // ignore
        }
      };
      es.onerror = () => {
        sseOk = false;
        emitStatus();
      };
    } catch {
      // ignore
    }

    emitStatus();

    // ---- 3. Active conversation background sync ----
    const syncInterval = setInterval(() => {
      if (activeConversationId) {
        handlerRef.current({
          type: "conversation:update",
          conversationId: activeConversationId,
        });
      }
    }, 1800);

    // ---- 4. Window focus / Visibility catch-up ----
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handlerRef.current({
          type: "conversation:update",
          conversationId: activeConversationId || "",
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      if (es) {
        try {
          es.close();
        } catch {
          // ignore
        }
      }
      cleanupFns.forEach((fn) => fn());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, convKey]);
}
