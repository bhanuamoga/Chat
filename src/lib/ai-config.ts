import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/**
 * Bring-Your-Own-Key (BYOK) AI provider configuration.
 * Each user stores ONE jsonb field on `users.ai_api_config`:
 *   { entries: AiApiEntry[], defaultEntryId: string|null, rateLimit: {...} }
 * Models are fetched LIVE from each provider's API (never hardcoded here).
 */

export type AiApiProvider = "gemini" | "openai" | "openrouter";

export const AI_API_PROVIDERS: { id: AiApiProvider; label: string }[] = [
  { id: "gemini", label: "Google Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
];

export type AiApiRateLimitMode = "5" | "10" | "custom" | "unlimited";

export type AiApiRateLimit = {
  mode: AiApiRateLimitMode;
  custom: number | null;
};

export type AiApiEntry = {
  id: string;
  name: string;
  provider: AiApiProvider;
  apiKey: string;
  /** Model ids the user picked (fetched dynamically from the provider's API) */
  models: string[];
};

export type AiApiConfig = {
  entries: AiApiEntry[];
  defaultEntryId: string | null;
  rateLimit: AiApiRateLimit;
};

export const EMPTY_AI_API_CONFIG: AiApiConfig = {
  entries: [],
  defaultEntryId: null,
  rateLimit: { mode: "5", custom: null },
};

/** Parse the (possibly malformed / missing) jsonb blob into a safe config. */
export function parseAiApiConfig(raw: unknown): AiApiConfig {
  const cfg = structuredClone(EMPTY_AI_API_CONFIG);
  if (!raw || typeof raw !== "object") return cfg;
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.entries)) {
    cfg.entries = o.entries
      .filter(
        (e): e is AiApiEntry =>
          !!e &&
          typeof e === "object" &&
          typeof (e as any).id === "string" &&
          typeof (e as any).name === "string" &&
          ["gemini", "openai", "openrouter"].includes((e as any).provider) &&
          typeof (e as any).apiKey === "string" &&
          Array.isArray((e as any).models)
      )
      .map((e) => ({ ...e, models: e.models.filter((m) => typeof m === "string") }));
  }

  if (typeof o.defaultEntryId === "string") {
    cfg.defaultEntryId = cfg.entries.some((e) => e.id === o.defaultEntryId)
      ? o.defaultEntryId
      : null;
  }

  const rl = o.rateLimit as Record<string, unknown> | undefined;
  if (rl && ["5", "10", "custom", "unlimited"].includes(String(rl.mode))) {
    cfg.rateLimit = {
      mode: rl.mode as AiApiRateLimitMode,
      custom:
        typeof rl.custom === "number" && Number.isFinite(rl.custom)
          ? Math.min(Math.max(Math.floor(rl.custom), 1), 100000)
          : null,
    };
  }

  return cfg;
}

/** Never send a full key back to the browser. */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return "••••••••";
  return `••••${key.slice(-4)}`;
}

export function providerLabel(p: AiApiProvider): string {
  return AI_API_PROVIDERS.find((x) => x.id === p)?.label || p;
}

/**
 * Validate a key AND fetch the live model catalog from the provider's own API.
 * Nothing here is hardcoded — the model list always comes from the provider.
 */
export async function listProviderModels(
  provider: AiApiProvider,
  apiKey: string
): Promise<string[]> {
  if (provider === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as any)?.error?.message || `Google rejected the API key (HTTP ${res.status})`
      );
    }
    const models = ((data as any).models || [])
      .filter((m: any) => m?.supportedGenerationMethods?.includes("generateContent"))
      .map((m: any) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean)
      .sort();
    if (!models.length) throw new Error("No generation-capable models available on this key");
    return models;
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as any)?.error?.message || `OpenAI rejected the API key (HTTP ${res.status})`
      );
    }
    const ids: string[] = ((data as any).data || []).map((m: any) => String(m.id || ""));
    const chatModels = ids
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id))
      .filter(
        (id) =>
          !/realtime|audio|whisper|tts|embed|moderation|transcribe|dall|search|instruct|image/i.test(
            id
          )
      )
      .sort()
      .reverse();
    if (!chatModels.length) throw new Error("No chat models available on this key");
    return chatModels;
  }

  if (provider === "openrouter") {
    // Validate the key first (requires auth), then list the model catalog.
    const keyRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!keyRes.ok) {
      throw new Error(`OpenRouter rejected the API key (HTTP ${keyRes.status})`);
    }
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Could not load OpenRouter models (HTTP ${res.status})`);
    }
    const models: string[] = ((data as any).data || [])
      .map((m: any) => String(m.id || ""))
      .filter(Boolean)
      .sort();
    if (!models.length) throw new Error("No models available on OpenRouter");
    return models;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

export type ResolvedChatModel = {
  /** AI SDK LanguageModel (v3 spec) */
  model: any;
  modelId: string;
  provider: AiApiProvider;
  /** Human label shown in the UI — the user's entry name */
  sourceName: string;
  /** The provider factory (for Gemini: enables the google_search grounding tool) */
  providerClient: any | null;
};

/** Thrown when the user has no usable BYOK entry — chat must prompt them to add one. */
export const NO_API_KEY_MESSAGE =
  "NO_API_KEY: Please set a valid AI API key on the AI APIs page to start chatting.";

/**
 * Pick the model to stream with from the user's OWN connected API entries
 * (configured on the AI APIs page). Model ids come straight from the entry's
 * saved catalog. There is no built-in fallback key anymore — no key, no chat.
 */
export async function resolveChatModel(
  config: AiApiConfig,
  apiEntryId: string | null | undefined,
  wantModel: string | null | undefined
): Promise<ResolvedChatModel> {
  const entry =
    (apiEntryId ? config.entries.find((e) => e.id === apiEntryId) : null) ||
    (config.defaultEntryId
      ? config.entries.find((e) => e.id === config.defaultEntryId) || null
      : null) ||
    config.entries[0] ||
    null;

  if (!entry) {
    throw new Error(NO_API_KEY_MESSAGE);
  }

  const modelId =
    wantModel && entry.models.includes(wantModel)
      ? wantModel
      : entry.models[0] || wantModel || defaultModelHint(entry.provider);

  let model: any;
  let providerClient: any = null;
  if (entry.provider === "gemini") {
    providerClient = createGoogleGenerativeAI({ apiKey: entry.apiKey });
    model = providerClient(modelId);
  } else if (entry.provider === "openai") {
    model = createOpenAI({ apiKey: entry.apiKey })(modelId);
  } else {
    model = createOpenRouter({ apiKey: entry.apiKey })(modelId);
  }
  return {
    model,
    modelId,
    provider: entry.provider,
    sourceName: entry.name,
    providerClient,
  };
}

/** Last-resort id if a saved entry somehow has no models — real catalogs always win. */
function defaultModelHint(provider: AiApiProvider): string {
  switch (provider) {
    case "gemini":
      return "gemini-2.5-flash";
    case "openai":
      return "gpt-4o-mini";
    case "openrouter":
      return "google/gemini-2.5-flash";
  }
}
