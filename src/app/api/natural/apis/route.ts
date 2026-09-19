import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import {
  parseAiApiConfig,
  listProviderModels,
  maskApiKey,
  AI_API_PROVIDERS,
  type AiApiConfig,
  type AiApiProvider,
} from "@/lib/ai-config";
import type { AiApisClientConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_ENTRIES = 10;

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return (session as unknown as { chatUserId?: string } | null)?.chatUserId || null;
}

async function loadConfig(userId: string): Promise<AiApiConfig> {
  const [row] = await db
    .select({ aiApiConfig: users.aiApiConfig })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return parseAiApiConfig(row?.aiApiConfig);
}

async function saveConfig(userId: string, cfg: AiApiConfig): Promise<void> {
  await db.update(users).set({ aiApiConfig: cfg }).where(eq(users.id, userId));
}

/** Mask keys before anything reaches the browser. */
function toClient(cfg: AiApiConfig): AiApisClientConfig {
  return {
    entries: cfg.entries.map((e) => ({
      id: e.id,
      name: e.name,
      provider: e.provider,
      maskedKey: maskApiKey(e.apiKey),
      models: e.models,
    })),
    defaultEntryId: cfg.defaultEntryId,
    rateLimit: cfg.rateLimit,
  };
}

function validProvider(p: unknown): p is AiApiProvider {
  return AI_API_PROVIDERS.some((x) => x.id === p);
}

/**
 * GET /api/natural/apis — the user's BYOK config (masked keys) + live default catalog.
 */
export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await loadConfig(userId);
  return NextResponse.json(await toClient(cfg));
}

/**
 * POST /api/natural/apis
 *   action = "fetchModels"  { provider, apiKey }                → { models: string[] } (validates the key against the provider, nothing saved)
 *   action = "save"         { name, provider, apiKey, models[] } → saves entry, returns fresh config
 */
export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (!validProvider(body.provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  const provider: AiApiProvider = body.provider;
  const apiKey = String(body.apiKey || "").trim();
  if (apiKey.length < 8) {
    return NextResponse.json({ error: "Please paste a valid API key" }, { status: 400 });
  }

  if (action === "fetchModels") {
    try {
      const models = await listProviderModels(provider, apiKey);
      return NextResponse.json({ models });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message || "Could not fetch models with this key" },
        { status: 400 }
      );
    }
  }

  if (action === "save") {
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) {
      return NextResponse.json({ error: "Please give this API a name" }, { status: 400 });
    }
    const models: string[] = Array.isArray(body.models)
      ? body.models.filter((m: unknown) => typeof m === "string" && m.trim()).slice(0, 200)
      : [];
    if (!models.length) {
      return NextResponse.json(
        { error: "Fetch models and select at least one" },
        { status: 400 }
      );
    }

    /* VALIDATE on save, every time: hit the provider with this key and make
       sure the chosen models really exist on the live catalog. */
    let liveModels: string[];
    try {
      liveModels = await listProviderModels(provider, apiKey);
    } catch (err: any) {
      return NextResponse.json(
        {
          error: `Invalid or expired API key — it was rejected by ${
            AI_API_PROVIDERS.find((x) => x.id === provider)?.label
          }: ${err?.message || "validation failed"}`,
        },
        { status: 400 }
      );
    }
    const unknown = models.filter((m) => !liveModels.includes(m));
    if (unknown.length) {
      return NextResponse.json(
        {
          error: `Not available on this key: ${unknown
            .slice(0, 3)
            .join(", ")}${unknown.length > 3 ? ` (+${unknown.length - 3} more)` : ""}. Re-fetch models and pick from the live list.`,
        },
        { status: 400 }
      );
    }

    const cfg = await loadConfig(userId);
    if (cfg.entries.length >= MAX_ENTRIES) {
      return NextResponse.json(
        { error: `You can connect up to ${MAX_ENTRIES} API keys` },
        { status: 400 }
      );
    }

    cfg.entries.push({
      id: crypto.randomUUID(),
      name,
      provider,
      apiKey,
      models,
    });
    /* First key the user adds becomes their default automatically */
    if (!cfg.defaultEntryId) cfg.defaultEntryId = cfg.entries[0].id;

    await saveConfig(userId, cfg);
    return NextResponse.json(toClient(cfg));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * PATCH /api/natural/apis
 *   { defaultEntryId: string|null }              → set which API Natural Chat uses by default
 *   { rateLimit: { mode, custom? } }             → the user's own daily prompt cap
 */
export async function PATCH(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cfg = await loadConfig(userId);
  let changed = false;

  if ("defaultEntryId" in body) {
    const id = body.defaultEntryId === null ? null : String(body.defaultEntryId || "");
    if (id !== null && !cfg.entries.some((e) => e.id === id)) {
      return NextResponse.json({ error: "Unknown API entry" }, { status: 400 });
    }
    cfg.defaultEntryId = id;
    changed = true;
  }

  if (body.rateLimit && typeof body.rateLimit === "object") {
    const mode = String((body.rateLimit as any).mode || "");
    if (!["5", "10", "custom", "unlimited"].includes(mode)) {
      return NextResponse.json({ error: "Unknown rate limit mode" }, { status: 400 });
    }
    let custom: number | null = null;
    if (mode === "custom") {
      custom = Math.floor(Number((body.rateLimit as any).custom));
      if (!Number.isFinite(custom) || custom < 1 || custom > 100000) {
        return NextResponse.json(
          { error: "Custom limit must be a number between 1 and 100000" },
          { status: 400 }
        );
      }
    }
    cfg.rateLimit = { mode: mode as AiApiConfig["rateLimit"]["mode"], custom };
    changed = true;
  }

  if (!changed) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await saveConfig(userId, cfg);
  return NextResponse.json(await toClient(cfg));
}

/**
 * DELETE /api/natural/apis?id=<entryId> — remove a connected API key.
 */
export async function DELETE(req: NextRequest) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Entry id required" }, { status: 400 });

  const cfg = await loadConfig(userId);
  const next = cfg.entries.filter((e) => e.id !== id);
  if (next.length === cfg.entries.length) {
    return NextResponse.json({ error: "API entry not found" }, { status: 404 });
  }
  cfg.entries = next;
  if (cfg.defaultEntryId === id) cfg.defaultEntryId = null;

  await saveConfig(userId, cfg);
  return NextResponse.json(await toClient(cfg));
}
