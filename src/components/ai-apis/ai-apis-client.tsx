"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { MobileMenuDrawer } from "@/components/nav-rail";
import { PROVIDER_LOGOS } from "@/lib/provider-logos";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AiApisClientConfig, AiApiEntryClient, AiApiProviderId, UserRow } from "@/lib/types";

/* Provider accents + real brand logos (inline data URIs — no CDN dependency) */
const PROVIDER_META: Record<
  AiApiProviderId,
  { label: string; short: string; hint: string; dot: string; logo: string }
> = {
  gemini: {
    label: "Google Gemini",
    short: "Gemini",
    hint: "Create a key free at aistudio.google.com",
    dot: "bg-sky-500",
    logo: PROVIDER_LOGOS.gemini,
  },
  openai: {
    label: "OpenAI",
    short: "OpenAI",
    hint: "Create a key at platform.openai.com",
    dot: "bg-zinc-700",
    logo: PROVIDER_LOGOS.openai,
  },
  openrouter: {
    label: "OpenRouter",
    short: "OpenRouter",
    hint: "Create a key at openrouter.ai — one key, hundreds of models",
    dot: "bg-indigo-500",
    logo: PROVIDER_LOGOS.openrouter,
  },
};

const PROVIDER_ORDER: AiApiProviderId[] = ["gemini", "openai", "openrouter"];

type RateDraft = { mode: "5" | "10" | "custom" | "unlimited"; custom: number | null };

/* Small white tile so dark logos (OpenAI knot) stay visible in dark mode */
function ProviderLogo({ provider, className }: { provider: AiApiProviderId; className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-lg border border-border/60 bg-white shadow-2xs",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PROVIDER_META[provider].logo} alt="" className="size-[60%] object-contain" />
    </span>
  );
}

export function AiApisClient({ me }: { me: UserRow }) {
  const [config, setConfig] = useState<AiApisClientConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateDraft, setRateDraft] = useState<RateDraft>({ mode: "5", custom: null });
  const [savingRate, setSavingRate] = useState(false);
  const [busyEntry, setBusyEntry] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState<AiApiProviderId>("gemini");
  const [editEntry, setEditEntry] = useState<AiApiEntryClient | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
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

  const effectiveDefaultId = (cfg: AiApisClientConfig | null) =>
    cfg?.defaultEntryId || cfg?.entries[0]?.id || null;

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
      setRateDraft({ mode: data.rateLimit.mode, custom: data.rateLimit.custom });
      toast.success("Daily limit updated & applied immediately");
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
      toast.success("Default API updated — Jarvis will use it");
    } catch (err: any) {
      toast.error(err?.message || "Could not set default");
    } finally {
      setBusyEntry(null);
    }
  };

  const deleteEntry = async (id: string) => {
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
      setConfirmDelete(null);
    }
  };

  const openAddFor = (p: AiApiProviderId) => {
    setEditEntry(null);
    setAddProvider(p);
    setShowAdd(true);
  };

  const openEdit = (e: AiApiEntryClient) => {
    setShowAdd(false);
    setEditEntry(e);
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
                Your keys, your models, your limits — for Jarvis
              </p>
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => openAddFor("gemini")}
          className="h-8 gap-1.5 text-xs rounded-lg shrink-0 shadow-xs"
        >
          <Plus className="size-3.5" />
          Add API key
        </Button>
      </div>

      <div className="nice-scroll flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto w-full px-3 sm:px-5 py-5 space-y-5">
          {loading ? (
            <LoadingSkeletons />
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
                    Applies immediately to Jarvis and resets every midnight (IST).
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
                      </TabsTrigger>
                      <TabsTrigger value="10" className="text-xs">
                        10 / day
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

              {/* ============ The 3 provider cards ============ */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {PROVIDER_ORDER.map((p) => (
                  <ProviderCard
                    key={p}
                    provider={p}
                    entries={(config?.entries || []).filter((e) => e.provider === p)}
                    defaultId={effectiveDefaultId(config)}
                    busyEntry={busyEntry}
                    confirmDelete={confirmDelete}
                    onAdd={() => openAddFor(p)}
                    onEdit={openEdit}
                    onSetDefault={setDefaultEntry}
                    onAskDelete={(id) => setConfirmDelete(id)}
                    onCancelDelete={() => setConfirmDelete(null)}
                    onConfirmDelete={deleteEntry}
                  />
                ))}
              </div>

              {noKeys && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-[11.5px] font-medium text-amber-600 dark:text-amber-400">
                  No API keys yet — connect at least one above to unlock Jarvis. One
                  key can power multiple selected models.
                </p>
              )}

              <p className="text-[11px] text-muted-foreground leading-relaxed px-1 pb-4">
                Keys are validated against the provider when you add or edit them and are
                only ever sent to that provider, directly from the server — never to
                other users or third parties.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Add dialog */}
      {showAdd && (
        <ApiKeyDialog
          key={`add-${addProvider}`}
          mode="add"
          lockedProvider={addProvider}
          onClose={() => setShowAdd(false)}
          onSaved={(cfg) => {
            setConfig(cfg);
            setShowAdd(false);
            toast.success("API key verified & connected — pick it in the chat composer");
          }}
        />
      )}

      {/* Edit dialog */}
      {editEntry && (
        <ApiKeyDialog
          key={`edit-${editEntry.id}`}
          mode="edit"
          entry={editEntry}
          lockedProvider={editEntry.provider}
          onClose={() => setEditEntry(null)}
          onSaved={(cfg) => {
            setConfig(cfg);
            setEditEntry(null);
            toast.success("Connection updated in place");
          }}
        />
      )}
    </div>
  );
}

/* ---------------- loading skeletons (no spinners) ---------------- */

function LoadingSkeletons() {
  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border/70 px-3 py-2.5 space-y-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
      <Card className="border-border/70 shadow-xs">
        <CardHeader className="pb-3 space-y-2">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="flex justify-end">
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="border-border/70 shadow-xs">
            <CardHeader className="pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="size-8 rounded-lg" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------- stat chip ---------------- */

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-bold text-foreground"
        title={value}
      >
        {accent && <span className={cn("size-2 rounded-full shrink-0", accent)} />}
        <span className="truncate">{value}</span>
      </p>
    </div>
  );
}

/* ---------------- one provider card (Gemini / OpenAI / OpenRouter) ---------------- */

function ProviderCard({
  provider,
  entries,
  defaultId,
  busyEntry,
  confirmDelete,
  onAdd,
  onEdit,
  onSetDefault,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  provider: AiApiProviderId;
  entries: AiApiEntryClient[];
  defaultId: string | null;
  busyEntry: string | null;
  confirmDelete: string | null;
  onAdd: () => void;
  onEdit: (e: AiApiEntryClient) => void;
  onSetDefault: (id: string) => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
}) {
  const meta = PROVIDER_META[provider];
  return (
    <Card className="border-border/70 shadow-xs flex flex-col">
      <CardHeader className="pb-2.5 space-y-0">
        <div className="flex items-center gap-2">
          <ProviderLogo provider={provider} className="size-8" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-[13px] truncate">{meta.short}</CardTitle>
            <p className="text-[10px] text-muted-foreground truncate">
              {entries.length ? `${entries.reduce((n, e) => n + e.models.length, 0)} models` : "Not connected"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-2 pb-3">
        {entries.map((e) => {
          const isDefault = defaultId === e.id;
          const busy = busyEntry === e.id;
          return (
            <div
              key={e.id}
              className={cn(
                "rounded-xl border p-2.5 transition-colors",
                isDefault ? "border-primary/40 bg-primary/5" : "border-border/60 bg-muted/30"
              )}
            >
              {/* INFO ROW — full name + default badge (nothing crammed) */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[12.5px] font-semibold leading-tight text-foreground"
                    title={e.name}
                  >
                    {e.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[9.5px] text-muted-foreground">
                    {e.maskedKey}
                  </p>
                </div>
                {isDefault && (
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-emerald-500">
                    Default
                  </span>
                )}
              </div>

              {/* MODEL CHIPS */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1" title={e.models.join(", ")}>
                {e.models.slice(0, 2).map((m) => (
                  <span
                    key={m}
                    className="max-w-[130px] truncate rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
                    title={m}
                  >
                    {m}
                  </span>
                ))}
                {e.models.length > 2 && (
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                    +{e.models.length - 2}
                  </span>
                )}
              </div>

              {/* FOOTER — status left, action icons bottom-right */}
              <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
                {isDefault ? (
                  <span className="whitespace-nowrap text-[9px] font-medium text-emerald-500/90">
                    Used by Jarvis
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetDefault(e.id)}
                    disabled={busy}
                    className="text-[9px] font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    Set default
                  </button>
                )}

                <div className="flex items-center gap-0.5">
                  {/* models · three-dot dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        aria-label={`All models of ${e.name}`}
                        title="View all models"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={6}
                      className="nice-scroll max-h-[260px] w-[250px] overflow-y-auto"
                    >
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Models ({e.models.length})
                      </DropdownMenuLabel>
                      {e.models.map((m) => (
                        <DropdownMenuItem
                          key={m}
                          className="font-mono text-[11px] h-6.5"
                          onSelect={(ev) => ev.preventDefault()}
                        >
                          <span className="truncate">{m}</span>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit(e)} className="gap-2 text-xs">
                        <Pencil className="size-3.5" />
                        Edit connection…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* edit */}
                  <button
                    type="button"
                    onClick={() => onEdit(e)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                    title="Edit this connection"
                  >
                    <Pencil className="size-3.5" />
                  </button>

                  {/* delete with inline confirm */}
                  {confirmDelete === e.id ? (
                    <div className="flex items-center gap-1 px-1 animate-in fade-in duration-150">
                      <span className="text-[9px] text-destructive/80">Remove?</span>
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(e.id)}
                        disabled={busy}
                        className="text-[9px] font-bold text-destructive hover:underline disabled:opacity-60"
                      >
                        {busy ? "…" : "Yes"}
                      </button>
                      <button
                        type="button"
                        onClick={onCancelDelete}
                        className="text-[9px] font-medium text-muted-foreground hover:underline"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAskDelete(e.id)}
                      disabled={busy}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {entries.length === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            className="group flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/70 px-3 py-5 text-center transition-all hover:border-primary/50 hover:bg-primary/5"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
              <Plus className="size-4" />
            </span>
            <span className="text-[11px] font-semibold text-foreground">Connect {meta.short}</span>
            <span className="text-[9.5px] text-muted-foreground leading-snug">{meta.hint}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 px-2 py-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Plus className="size-3" />
            Add another {meta.short} key
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- add / edit key dialog ---------------- */

function ApiKeyDialog({
  mode,
  entry,
  lockedProvider,
  onClose,
  onSaved,
}: {
  mode: "add" | "edit";
  entry?: AiApiEntryClient;
  lockedProvider: AiApiProviderId;
  onClose: () => void;
  onSaved: (cfg: AiApisClientConfig) => void;
}) {
  const [provider, setProvider] = useState<AiApiProviderId>(lockedProvider);
  const [name, setName] = useState(entry?.name || "");
  /* Edit mode: the key field comes PRE-FILLED with the masked current key (dots).
     As long as it's untouched we keep the stored key; clearing & pasting replaces it. */
  const keySentinel = mode === "edit" ? entry?.maskedKey || null : null;
  const [apiKey, setApiKey] = useState(keySentinel || "");
  const keyDirty = keySentinel ? apiKey.trim() !== keySentinel : apiKey.trim().length > 0;
  const [fetching, setFetching] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modelSearch, setModelSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Edit mode: immediately pull the live catalog using the stored key (no paste needed) */
  useEffect(() => {
    if (mode !== "edit" || !entry) return;
    let cancelled = false;
    (async () => {
      setFetching(true);
      try {
        const res = await fetch("/api/natural/apis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "fetchEntryModels", entryId: entry.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not fetch models");
        if (cancelled) return;
        setFetchedModels(data.models);
        const live = new Set(data.models as string[]);
        /* keep the user's previous selection as far as it's still live */
        setSelected(new Set(entry.models.filter((m) => live.has(m))));
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Stored key failed re-validation");
          setFetchedModels(entry.models); /* fall back: still let them trim locally */
          setSelected(new Set(entry.models));
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, entry]);

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
    if (mode === "edit" && !keyDirty) {
      setError("That's your saved key — clear it and paste a new one to re-validate.");
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
      if (mode === "add") setFetchedModels(null);
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
      const res = await fetch("/api/natural/apis", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        /* Server re-validates the effective key with the provider before saving */
        body: JSON.stringify(
          mode === "edit"
            ? {
                entryUpdate: {
                  id: entry!.id,
                  name: name.trim(),
                  apiKey: keyDirty && apiKey.trim().length >= 8 ? apiKey.trim() : null,
                  models: Array.from(selected),
                },
              }
            : {
                action: "save",
                name: name.trim(),
                provider,
                apiKey: apiKey.trim(),
                models: Array.from(selected),
              }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data);
    } catch (err: any) {
      setError(err?.message || "Could not save API key");
    } finally {
      setSaving(false);
    }
  };

  const meta = PROVIDER_META[provider];

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ProviderLogo provider={lockedProvider} className="size-7" />
            {mode === "edit" ? `Edit · ${meta.short}` : `Add a ${meta.short} key`}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Verified against the provider before saving. Never shared, never logged.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          {/* 1. Provider — brand logos for instant recognition; locked in edit mode */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              1 · Provider
            </p>
            <Tabs
              value={provider}
              onValueChange={(v) => {
                if (mode === "edit") return;
                setProvider(v as AiApiProviderId);
                setFetchedModels(null);
                setSelected(new Set());
                setError(null);
              }}
            >
              <TabsList className="grid h-11 w-full grid-cols-3">
                {PROVIDER_ORDER.map((p) => (
                  <TabsTrigger
                    key={p}
                    value={p}
                    disabled={mode === "edit" && p !== lockedProvider}
                    className="gap-1.5 text-xs font-semibold"
                  >
                    <span className="flex size-4 items-center justify-center rounded-[4px] bg-white p-px shadow-2xs">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={PROVIDER_META[p].logo} alt="" className="size-full object-contain" />
                    </span>
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
              3 · API key{" "}
              {mode === "edit" && (
                <span className="ml-1 font-normal normal-case text-muted-foreground/70">
                  (saved key is pre-filled — clear & paste to replace)
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (mode === "add") setFetchedModels(null);
                }}
                placeholder={mode === "edit" ? "Your saved key (keep, or clear & paste a new one)" : "Paste your key…"}
                className="h-9 text-xs font-mono"
                autoComplete="off"
              />
              <Button
                variant="outline"
                onClick={fetchModels}
                disabled={fetching || !apiKey.trim() || (mode === "edit" && !keyDirty)}
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

          {/* 4. Live model catalog — one key can power many selected models */}
          {fetching && !fetchedModels ? (
            <div className="space-y-1.5">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-7 w-full rounded-lg" />
              <Skeleton className="h-7 w-2/3 rounded-lg" />
            </div>
          ) : (
            fetchedModels && (
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
                <div className="nice-scroll max-h-56 scroll-smooth overflow-y-auto rounded-xl border border-border/70">
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
            )
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
                {mode === "edit" ? "Verify & update connection" : "Verify & save connection"}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
