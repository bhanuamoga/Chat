import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Realtime integration.
 *
 * If the user provides Supabase credentials, the app will use true
 * Supabase Realtime (Broadcast + Presence + postgres_changes).
 * Otherwise it gracefully falls back to the built-in SSE realtime
 * server (Supabase-compatible event shapes) backed by local Postgres.
 *
 * Env vars (optional):
 *  - NEXT_PUBLIC_SUPABASE_URL
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *  - SUPABASE_SERVICE_ROLE_KEY (server only, for broadcast relay)
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY);

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (browserClient) return browserClient;
  browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return browserClient;
}

let serverClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  if (!SUPABASE_URL) return null;
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!key) return null;
  if (serverClient) return serverClient;
  serverClient = createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
  return serverClient;
}

/** Channel name convention shared by client + server */
export const channelForConversation = (conversationId: string) =>
  `chat:${conversationId}`;
export const GLOBAL_CHANNEL = "chat:global";
