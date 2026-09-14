import { NextResponse } from "next/server";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  getSupabaseServer,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; detail: string };

async function probe(url: string, path: string, apiKey: string): Promise<{ ok: boolean; status?: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${url}${path}`, {
      method: "GET",
      headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return { ok: res.ok || res.status === 404, status: res.status };
  } catch {
    return { ok: false };
  }
}

/**
 * GET /api/supabase/status
 * Reports whether the Supabase integration is wired up and reachable.
 * Never throws — it is used by the in-app diagnostics panel.
 */
export async function GET() {
  const url = SUPABASE_URL;
  const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  const checks: Check[] = [];

  if (!url || !key) {
    const missing = [
      !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !SUPABASE_ANON_KEY ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
    ].filter(Boolean) as string[];
    return NextResponse.json({
      configured: false,
      url: url || null,
      hasServiceKey: Boolean(SUPABASE_SERVICE_KEY),
      checks: [
        {
          name: "Supabase credentials",
          ok: false,
          detail: `Missing: ${missing.join(", ")}`,
        },
      ],
    });
  }

  const [rest, auth, storage] = await Promise.all([
    probe(url, "/rest/v1/", key),
    probe(url, "/auth/v1/settings", key),
    probe(url, "/storage/v1/bucket", key),
  ]);

  checks.push({
    name: "Project API",
    ok: rest.ok,
    detail: rest.ok ? `${url} reachable` : `Unreachable${rest.status ? ` (${rest.status})` : ""}`,
  });
  checks.push({
    name: "Supabase Auth",
    ok: auth.ok,
    detail: auth.ok ? "Auth endpoint responding" : "Auth endpoint unreachable",
  });
  checks.push({
    name: "Supabase Storage",
    ok: storage.ok,
    detail: storage.ok ? "Storage endpoint responding" : "Storage endpoint unreachable",
  });

  // Storage bucket check (needs the bucket to exist / be creatable)
  const bucketName = "chat-files";
  let bucketOk = false;
  let bucketDetail = "Not verified";
  try {
    const sb = getSupabaseServer();
    if (sb) {
      const { data, error } = await sb.storage.listBuckets();
      if (error) {
        bucketDetail = error.message;
      } else {
        bucketOk = Boolean(data?.some((b) => b.name === bucketName));
        bucketDetail = bucketOk
          ? `Bucket "${bucketName}" ready`
          : `Bucket "${bucketName}" will be created on first upload`;
      }
    }
  } catch (error) {
    bucketDetail = error instanceof Error ? error.message : "Unknown error";
  }
  checks.push({ name: `Storage bucket "${bucketName}"`, ok: bucketOk, detail: bucketDetail });

  // Realtime is a WebSocket endpoint; we verify the URL is derivable.
  const wsUrl = url.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws"));
  checks.push({
    name: "Supabase Realtime",
    ok: true,
    detail: `${wsUrl}/realtime/v1/websocket (broadcast channels)`,
  });

  return NextResponse.json({
    configured: true,
    url,
    hasServiceKey: Boolean(SUPABASE_SERVICE_KEY),
    checks,
  });
}
