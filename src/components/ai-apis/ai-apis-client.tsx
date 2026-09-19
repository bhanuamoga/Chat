"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MobileMenuDrawer } from "@/components/nav-rail";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AiApisClientConfig, AiApiProviderId, UserRow } from "@/lib/types";

const PROVIDER_META: Record<
  AiApiProviderId,
  { label: string; short: string; hint: string }
> = {
  gemini: {
    label: "Google Gemini",
    short: "Gemini",
    hint: "Create a key free at aistudio.google.com",
  },
  openai: {
    label: "OpenAI",
    short: "OpenAI",
    hint: "Create a key at platform.openai.com",
  },
  openrouter: {
    label: "OpenRouter",
    short: "OpenRouter",
    hint: "Create a key at openrouter.ai — one key, hundreds of models",
  },
};

const RATE_MODES = [
  { id: "5", label: "5 / day", desc: "Default" },
  { id: "10", label: "10 / day", desc: "More room" },
  { id: "custom", label: "Custom", desc: "Pick a number" },
  { id: "unlimited", label: "Unlimited", desc: "No cap" },
] as const;

type RateDraft = { mode: "5" | "10" | "custom" | "unlimited"; custom: number | null };

export function AiApisClient({ me }: { me: UserRow }) {
  const [config, setConfig] = useState<AiApisClientConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateDraft, setRateDraft] = useState<RateDraft>({ mode: "5", custom: null });
  const [savingRate, setSavingRate] = useState(false);
  const [busyEntry, setBusyEntry] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/natural/apis");
      if (res.ok) {
        const cfg: AiApisClientConfig = await res.json();
        setConfig(cfg);
        setRateDraft({
          mode: cfg.rateLimit.mode,
          custom: cfg.rateLimit.custom,
        });
      }
    } catch {
      toast.error("Could not load your AI API settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveRateLimit = async () => {
    if (rateDraft.mode === "custom" && (!rateDraft.custom || rateDraft.custom < 1)) {
      toast.error("Enter a custom daily limit (1 or more)");
      return;
    }
    setSavingRate(true);
    try {
      const res = await fetch("/api/natural/apis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateLimit:
            rateDraft.mode === "custom"
              ? { mode: "custom", custom: rateDraft.custom }
              : { mode: rateDraft.mode },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data);
      toast.success("Daily limit updated");
    } catch (err: any) {
      toast.error(err?.message || "Could not save daily limit");
    } finally {
      setSavingRate(false);
    }
  };

  const setDefaultEntry = async (id: string | null) => {
    setBusyEntry(id || "builtin");
    try {
      const res = await fetch("/api/natural/apis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultEntryId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setConfig(data);
      toast.success("Default API updated — Natural Chat will use it");
    } catch (err: any) {
      toast.error(err?.message || "Could not set default");
    } finally {
      setBusyEntry(null);
    }
  };

  const deleteEntry = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}"? Natural Chat will fall back to your default API.`)) return;
    setBusyEntry(id);
    try {
      const res = await fetch(`/api/natural/apis?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setConfig(data);
      toast.success("API key removed");
    } catch (err: any) {
      toast.error(err?.message || "Could not remove API key");
    } finally {
      setBusyEntry(null);
    }
  };

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-3 sm:px-4 py-2.5 shrink-0">
        <MobileMenuDrawer user={me} />
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
            <KeyRound className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight">AI APIs</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Connect your own keys for Natural Chat
            </p>
          </div>
        </div>
      </div>

      <div className="nice-scroll flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-3 sm:px-5 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {/* ============ Daily prompt limit (per-user, own choice) ============ */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    Your daily prompt limit
                  </CardTitle>
                  <CardDescription>
                    Applies to Natural Chat and resets every midnight (IST).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {RATE_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setRateDraft((d) => ({
                            ...d,
                            mode: m.id as RateDraft["mode"],
                          }))
                        }
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left transition-all",
                          rateDraft.mode === m.id
                            ? "border-primary bg-primary/10 text-foreground shadow-xs"
                            : "border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        )}
                      >
                        <div className="text-xs font-semibold">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                      </button>
                    ))}
                  </div>

                  {rateDraft.mode === "custom" && (
                    <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-200">
                      <span className="text-xs text-muted-foreground shrink-0">
                        Prompts per day:
                      </span>
                      <Input
                        type="number"
                        min={1}
                        max={100000}
                        value={rateDraft.custom ?? ""}
                        onChange={(e) =>
                          setRateDraft((d) => ({
                            ...d,
                            custom: e.target.value === "" ? null : Math.floor(Number(e.target.value)),
                          }))
                        }
                        placeholder="e.g. 25"
                        className="h-8 w-32 text-xs"
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={saveRateLimit}
                      disabled={
                        savingRate ||
                        (config?.rateLimit.mode === rateDraft.mode &&
                          (rateDraft.mode !== "custom" ||
                            config?.rateLimit.custom === rateDraft.custom))
                      }
                      className="h-8 gap-1.5 text-xs rounded-lg"
                    >
                      {savingRate && <Loader2 className="size-3.5 animate-spin" />}
                      Save limit
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ============ Connected API keys ============ */}
              <Card>
                <CardHeader className="pb-3 flex-row items-start justify-between gap-3 space-y-0">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <KeyRound className="size-4 text-primary" />
                      API connections
                    </CardTitle>
                    <CardDescription>
                      Keys are used only for your Natural Chats. Set one as default.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAdd(true)}
                    className="h-8 gap-1.5 text-xs rounded-lg shrink-0"
                  >
                    <Plus className="size-3.5" />
                    Add API key
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {/* Built-in default (server key) — always present */}
                  <ApiRow
                    name="Morr Default"
                    providerLabel="Google Gemini"
                    detail={`Server key · ${
                      config?.defaultModels.length ?? "…"
                    } models available live`}
                    isDefault={!config?.defaultEntryId}
                    busy={busyEntry === "builtin"}
                    onMakeDefault={() => setDefaultEntry(null)}
                    builtIn
                  />

                  {(config?.entries || []).map((e) => (
                    <ApiRow
                      key={e.id}
                      name={e.name}
                      providerLabel={PROVIDER_META[e.provider].label}
                      detail={`${e.maskedKey} · ${e.models.length} model${
                        e.models.length === 1 ? "" : "s"
                      }`}
                      models={e.models}
                      isDefault={config?.defaultEntryId === e.id}
                      busy={busyEntry === e.id}
                      onMakeDefault={() => setDefaultEntry(e.id)}
                      onDelete={() => deleteEntry(e.id, e.name)}
                    />
                  ))}

                  {(config?.entries || []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground px-1 pt-1">
                      No custom keys yet — add your Gemini, OpenAI or OpenRouter key to
                      chat with your own quota and models.
                    </p>
                  )}
                </CardContent>
              </Card>

              <p className="text-[11px] text-muted-foreground leading-relaxed px-1 pb-4">
                Keys are stored in your account and only ever sent to the provider you
                chose, directly from the server — never to other users or third parties.
              </p>
            </>
          )}
        </div>
      </div>

      <AddApiDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        onSaved={(cfg) => setConfig(cfg)}
      />
    </div>
  );
}

/* ---------------- one API row ---------------- */

function ApiRow({
  name,
  providerLabel,
  detail,
  models,
  isDefault,
  busy,
  builtIn,
  onMakeDefault,
  onDelete,
}: {
  name: string;
  providerLabel: string;
  detail: string;
  models?: string[];
  isDefault: boolean;
  busy: boolean;
  builtIn?: boolean;
  onMakeDefault: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
        isDefault ? "border-primary/40 bg-primary/5" : "border-border/70 bg-muted/30"
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          builtIn ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <Sparkles className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-semibold text-foreground">{name}</p>
          {isDefault && (
            <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-500">
              Default
            </span>
          )}
        </div>
        <p
          className="truncate text-[10px] text-muted-foreground"
          title={models?.join(", ")}
        >
          {providerLabel} · {detail}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {busy && <Loader2 className="size-3.5 animate-spin text-primary" />}
        {!isDefault && (
          <Button
            variant="outline"
            size="sm"
            onClick={onMakeDefault}
            disabled={busy}
            className="h-7 px-2 text-[10px] rounded-lg"
          >
            Make default
          </Button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove this API key"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- add-key dialog ---------------- */

function AddApiDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (cfg: AiApisClientConfig) => void;
}) {
  const [provider, setProvider] = useState<AiApiProviderId>("gemini");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modelSearch, setModelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setProvider("gemini");
    setName("");
    setApiKey("");
    setFetching(false);
    setFetchedModels(null);
    setSelected(new Set());
    setModelSearch("");
    setSaving(false);
    setError(null);
  };

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!fetchedModels) return [];
    if (!q) return fetchedModels;
    return fetchedModels.filter((m) => m.toLowerCase().includes(q));
  }, [fetchedModels, modelSearch]);

  const fetchModels = async () => {
    if (!apiKey.trim()) {
      setError("Paste your API key first");
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/natural/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fetchModels", provider, apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not fetch models");
      setFetchedModels(data.models);
      /* Pre-select sensible defaults: first few models */
      setSelected(new Set((data.models as string[]).slice(0, Math.min(3, data.models.length))));
    } catch (err: any) {
      setFetchedModels(null);
      setError(err?.message || "Could not fetch models with this key");
    } finally {
      setFetching(false);
    }
  };

  const toggleModel = (m: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Give this connection a name");
      return;
    }
    if (selected.size === 0) {
      setError("Select at least one model");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/natural/apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          name: name.trim(),
          provider,
          apiKey: apiKey.trim(),
          models: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data);
      onOpenChange(false);
      reset();
      toast.success("API key connected — pick it from the chat composer");
    } catch (err: any) {
      setError(err?.message || "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-primary" />
            Add an AI API key
          </DialogTitle>
          <DialogDescription className="text-xs">
            Your key never leaves the server and is used only for your chats.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {/* 1. Provider */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Provider
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PROVIDER_META) as AiApiProviderId[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setProvider(p);
                    setFetchedModels(null);
                    setSelected(new Set());
                    setError(null);
                  }}
                  className={cn(
                    "rounded-xl border px-2 py-2 text-center transition-all",
                    provider === p
                      ? "border-primary bg-primary/10 text-foreground shadow-xs"
                      : "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <div className="text-xs font-semibold">{PROVIDER_META[p].short}</div>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {PROVIDER_META[provider].hint}
            </p>
          </div>

          {/* 2. Name */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Name
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. My ${PROVIDER_META[provider].short}`}
              className="h-9 text-xs"
              maxLength={60}
            />
          </div>

          {/* 3. Key + fetch */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              API key
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setFetchedModels(null);
                }}
                placeholder="Paste your key…"
                className="h-9 text-xs font-mono"
                autoComplete="off"
              />
              <Button
                variant="outline"
                onClick={fetchModels}
                disabled={fetching || !apiKey.trim()}
                className="h-9 shrink-0 gap-1.5 text-xs"
              >
                {fetching ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Fetch models
              </Button>
            </div>
          </div>

          {/* 4. Live model catalog — fetched from the provider, never hardcoded */}
          {fetchedModels && (
            <div className="animate-in fade-in duration-200">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Models ({selected.size} selected)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(new Set(filteredModels))}
                    className="text-[10px] font-medium text-primary hover:underline"
                  >
                    Select shown
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-[10px] font-medium text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="relative mb-1.5">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Filter models…"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className="nice-scroll max-h-48 overflow-y-auto rounded-xl border border-border/70">
                {filteredModels.length === 0 ? (
                  <p className="p-3 text-center text-[11px] text-muted-foreground">
                    No models match "{modelSearch}"
                  </p>
                ) : (
                  filteredModels.map((m) => (
                    <label
                      key={m}
                      className="flex cursor-pointer items-center gap-2.5 border-b border-border/40 px-3 py-2 text-xs last:border-0 hover:bg-accent/60 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(m)}
                        onChange={() => toggleModel(m)}
                        className="size-3.5 shrink-0 accent-[color:var(--primary)]"
                      />
                      <span className="truncate font-mono text-[11px]">{m}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
              {error}
            </p>
          )}

          <Button
            onClick={save}
            disabled={saving || !fetchedModels || selected.size === 0 || !name.trim()}
            className="w-full gap-1.5 rounded-xl"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save API connection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

