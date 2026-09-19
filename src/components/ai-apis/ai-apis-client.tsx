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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AiApisClientConfig, AiApiProviderId, UserRow } from "@/lib/types";

/* Provider accents — static class strings so Tailwind always emits them */
const PROVIDER_META: Record<
  AiApiProviderId,
  { label: string; short: string; hint: string; chip: string; dot: string }
> = {
  gemini: {
    label: "Google Gemini",
    short: "Gemini",
    hint: "Create a key free at aistudio.google.com",
    chip: "bg-sky-500/15 text-sky-500",
    dot: "bg-sky-500",
  },
  openai: {
    label: "OpenAI",
    short: "OpenAI",
    hint: "Create a key at platform.openai.com",
    chip: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
    dot: "bg-zinc-500",
  },
  openrouter: {
    label: "OpenRouter",
    short: "OpenRouter",
    hint: "Create a key at openrouter.ai — one key, hundreds of models",
    chip: "bg-violet-500/15 text-violet-500",
    dot: "bg-violet-500",
  },
};

type RateDraft = { mode: "5" | "10" | "custom" | "unlimited"; custom: number | null };

export function AiApisClient({ me }: { me: UserRow }) {
  const [config, setConfig] = useState<AiApisClientConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateDraft, setRateDraft] = useState<RateDraft>({ mode: "5", custom: null });
  const [savingRate, setSavingRate] = useState(false);
  const [busyEntry, setBusyEntry] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/natural/apis");
      if (res.ok) {
        const cfg: AiApisClientConfig = await res.json();
        setConfig(cfg);
        setRateDraft({ mode: cfg.rateLimit.mode, custom: cfg.rateLimit.custom });
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

  const stats = useMemo(() => {
    const entries = config?.entries || [];
    const def = entries.find((e) => e.id === config?.defaultEntryId) || entries[0] || null;
    return {
      connections: entries.length,
      models: entries.reduce((n, e) => n + e.models.length, 0),
      defaultName: def?.name || "Not set",
      defaultProvider: def?.provider || null,
    };
  }, [config]);

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

  const setDefaultEntry = async (id: string) => {
    setBusyEntry(id);
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

  const noKeys = config !== null && config.entries.length === 0;

  return (
    <div className="flex h-dvh min-w-0 flex-1 flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MobileMenuDrawer user={me} />
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <KeyRound className="size-4.5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">AI APIs</h1>
              <p className="truncate text-[11px] text-muted-foreground">
                Your keys, your models, your limits — for Natural Chat
              </p>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setShowAdd(true)}
          className="h-8 gap-1.5 text-xs rounded-lg shrink-0 shadow-xs"
        >
          <Plus className="size-3.5" />
          Add API key
        </Button>
      </div>

      <div className="nice-scroll flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-3 sm:px-5 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm">Loading…</span>
            </div>
          ) : (
            <>
              {/* ============ Overview stats ============ */}
              <div className="grid grid-cols-3 gap-2">
                <StatChip label="Connections" value={String(stats.connections)} />
                <StatChip label="Models ready" value={String(stats.models)} />
                <StatChip
                  label="Default"
                  value={stats.defaultName}
                  accent={stats.defaultProvider ? PROVIDER_META[stats.defaultProvider].dot : undefined}
                />
              </div>

              {/* ============ Daily prompt limit ============ */}
              <Card className="border-border/70 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-[15px] flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Clock className="size-3.5" />
                    </span>
                    Your daily prompt limit
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Applies to Natural Chat and resets every midnight (IST).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Tabs
                    value={rateDraft.mode}
                    onValueChange={(v) =>
                      setRateDraft((d) => ({ ...d, mode: v as RateDraft["mode"] }))
                    }
                  >
                    <TabsList className="grid h-10 w-full grid-cols-4">
                      <TabsTrigger value="5" className="text-xs gap-1.5">
                        5 / day
                        <span className="hidden sm:inline text-[9px] font-normal text-muted-foreground">default</span>
                      </TabsTrigger>
                      <TabsTrigger value="10" className="text-xs gap-1.5">
                        10 / day
                        <span className="hidden sm:inline text-[9px] font-normal text-muted-foreground">room</span>
                      </TabsTrigger>
                      <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
                      <TabsTrigger value="unlimited" className="text-xs">Unlimited</TabsTrigger>
                    </TabsList>
                  </Tabs>

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
                            custom:
                              e.target.value === "" ? null : Math.floor(Number(e.target.value)),
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

              {/* ============ Connections ============ */}
              <div className="space-y-2.5">
                <div className="flex items-end justify-between px-1">
                  <div>
                    <h2 className="text-sm font-semibold">Connected API keys</h2>
                    <p className="text-[11px] text-muted-foreground">
                      Keys power your Natural Chats only. Set one as default.
                    </p>
                  </div>
                </div>

                {noKeys ? (
                  /* Empty state — this is the required first step now */
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="group w-full rounded-2xl border-2 border-dashed border-border/70 px-6 py-10 text-center transition-all hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                      <KeyRound className="size-6" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">No API keys yet</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground leading-relaxed">
                      Connect a Gemini, OpenAI or OpenRouter key to unlock Natural Chat —
                      one key can power multiple models.
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm">
                      <Plus className="size-3.5" />
                      Add your first key
                    </span>
                  </button>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(config?.entries || []).map((e) => {
                      const meta = PROVIDER_META[e.provider];
                      const isDefault =
                        config?.defaultEntryId === e.id ||
                        (!config?.defaultEntryId && config!.entries[0]?.id === e.id);
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "rounded-2xl border p-3.5 transition-all",
                            isDefault
                              ? "border-primary/40 bg-primary/5 shadow-xs"
                              : "border-border/70 bg-muted/30 hover:border-border"
                          )}
                        >
                          {/* head */}
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                "flex size-9 shrink-0 items-center justify-center rounded-xl font-bold text-[11px]",
                                meta.chip
                              )}
                            >
                              {meta.short.slice(0, 2)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-[13px] font-semibold text-foreground">
                                  {e.name}
                                </p>
                                {isDefault && (
                                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-500">
                                    Default
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {meta.label} · <span className="font-mono">{e.maskedKey}</span>
                              </p>
                            </div>
                          </div>

                          {/* model chips */}
                          <div className="mt-2.5 flex flex-wrap gap-1" title={e.models.join(", ")}>
                            {e.models.slice(0, 3).map((m) => (
                              <span
                                key={m}
                                className="truncate max-w-[140px] rounded-md bg-background/80 border border-border/60 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground"
                              >
                                {m}
                              </span>
                            ))}
                            {e.models.length > 3 && (
                              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-semibold text-primary">
                                +{e.models.length - 3} more
                              </span>
                            )}
                          </div>

                          {/* actions */}
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                            {isDefault ? (
                              <span className="text-[10px] font-medium text-emerald-500">
                                Used by Natural Chat
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDefaultEntry(e.id)}
                                disabled={busyEntry === e.id}
                                className="text-[10px] font-semibold text-primary hover:underline disabled:opacity-60"
                              >
                                {busyEntry === e.id ? "Setting…" : "Make default"}
                              </button>
                            )}
                            {confirmDelete === e.id ? (
                              <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
                                <span className="text-[10px] font-medium text-destructive">
                                  Remove?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfirmDelete(null);
                                    deleteEntry(e.id, e.name);
                                  }}
                                  disabled={busyEntry === e.id}
                                  className="text-[10px] font-bold text-destructive hover:underline disabled:opacity-60"
                                >
                                  {busyEntry === e.id ? "Removing…" : "Yes"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-[10px] font-medium text-muted-foreground hover:underline"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(e.id)}
                                disabled={busyEntry === e.id}
                                className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                title="Remove this API key"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed px-1 pb-4">
                Keys are validated against the provider when you add them and are only
                ever sent to that provider, directly from the server — never to other
                users or third parties.
              </p>
            </>
          )}
        </div>
      </div>

      <AddApiDialog open={showAdd} onOpenChange={setShowAdd} onSaved={(cfg) => setConfig(cfg)} />
    </div>
  );
}

/* ---------------- stat chip ---------------- */

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-bold text-foreground" title={value}>
        {accent && <span className={cn("size-2 rounded-full shrink-0", accent)} />}
        <span className="truncate">{value}</span>
      </p>
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
      setSelected(new Set((data.models as string[]).slice(0, Math.min(3, data.models.length))));
    } catch (err: any) {
      setFetchedModels(null);
      setError(err?.message || "Invalid API key — could not fetch models");
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
      /* Server re-validates the key with the provider before saving */
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
      toast.success("API key verified & connected — pick it in the chat composer");
    } catch (err: any) {
      setError(err?.message || "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

  const meta = PROVIDER_META[provider];

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
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <KeyRound className="size-3.5" />
            </span>
            Add an AI API key
          </DialogTitle>
          <DialogDescription className="text-xs">
            Verified against the provider before saving. Never shared, never logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {/* 1. Provider */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              1 · Provider
            </p>
            <Tabs
              value={provider}
              onValueChange={(v) => {
                setProvider(v as AiApiProviderId);
                setFetchedModels(null);
                setSelected(new Set());
                setError(null);
              }}
            >
              <TabsList className="grid h-10 w-full grid-cols-3">
                {(Object.keys(PROVIDER_META) as AiApiProviderId[]).map((p) => (
                  <TabsTrigger key={p} value={p} className="gap-1.5 text-xs font-semibold">
                    <span className={cn("size-1.5 rounded-full", PROVIDER_META[p].dot)} />
                    {PROVIDER_META[p].short}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="mt-1 text-[10px] text-muted-foreground">{meta.hint}</p>
          </div>

          {/* 2. Name */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              2 · Name
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. My ${meta.short}`}
              className="h-9 text-xs"
              maxLength={60}
            />
          </div>

          {/* 3. Key + validate */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              3 · API key
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
                Validate & fetch
              </Button>
            </div>
          </div>

          {/* 4. Live model catalog — from the provider's API, never hardcoded. One key, many models. */}
          {fetchedModels && (
            <div className="animate-in fade-in duration-200">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  4 · Models ({selected.size} selected)
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
              <div className="nice-scroll max-h-44 overflow-y-auto rounded-xl border border-border/70">
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
                      <Checkbox
                        checked={selected.has(m)}
                        onCheckedChange={() => toggleModel(m)}
                        className="size-3.5"
                        aria-label={`Select ${m}`}
                      />
                      <span className="truncate font-mono text-[11px]">{m}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive animate-in fade-in duration-200">
              {error}
            </p>
          )}

          <Button
            onClick={save}
            disabled={saving || !fetchedModels || selected.size === 0 || !name.trim()}
            className="w-full gap-1.5 rounded-xl"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verifying key…
              </>
            ) : (
              <>
                <Check className="size-4" />
                Verify & save connection
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
