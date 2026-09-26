"use client";

/**
 * Vercel Labs — independent chat experience powered by Vercel AI SDK 7 (useChat)
 * + the json-render core (model-emitted JSON spec -> real shadcn components).
 * Shares the user's BYOK entries (ai_config) via /api/natural/apis but runs its
 * own codepath end-to-end.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  FlaskConical,
  KeyRound,
  Loader2,
  Send,
  SquarePlus,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { JsonRender, splitRenderSegments } from "@/components/vercel-labs/json-render";
import { cn } from "@/lib/utils";
import type { AiApisClientConfig } from "@/lib/types";

const SEL_KEY = "vercel_labs_sel";

function prettyModel(m: string | null): string {
  return m ? m.split("/").pop() || m : "Vercel Labs";
}

/* Markdown rendering for the text segments (gfm tables, lists, headings) */
function Mdx({ text }: { text: string }) {
  return (
    <div className="prose-sm max-w-none space-y-2 text-[15px] leading-relaxed text-foreground prose-p:m-0 prose-ul:my-1 prose-ol:my-1 prose-table:my-2 prose-headings:mt-3 prose-headings:mb-1 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:text-xs [&_td]:text-xs">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export function VercelLabsClient() {
  const [config, setConfig] = useState<AiApisClientConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [sel, setSel] = useState<{ entryId: string | null; model: string | null }>({ entryId: null, model: null });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* load the shared BYOK config + restore selection */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/natural/apis", { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load AI APIs");
        const cfg = j as AiApisClientConfig;
        setConfig(cfg);
        const saved = (() => { try { return JSON.parse(localStorage.getItem(SEL_KEY) || "null"); } catch { return null; } })();
        const entry =
          cfg.entries.find((e) => e.id === saved?.entryId) ||
          cfg.entries.find((e) => e.id === cfg.defaultEntryId) ||
          cfg.entries[0] ||
          null;
        setSel({
          entryId: entry?.id ?? null,
          model: entry && saved?.model && entry.models.includes(saved.model) ? saved.model : entry?.models[0] ?? null,
        });
      } catch (e: any) {
        setConfigError(e?.message || "Failed to load AI APIs");
      }
    })();
  }, []);

  const saveSel = (s: { entryId: string | null; model: string | null }) => {
    setSel(s);
    try { localStorage.setItem(SEL_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  };

  /* AI SDK 7 transport — rebuilt only when the model selection changes */
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/vercel-labs/chat",
        body: { entryId: sel.entryId, model: sel.model },
      }),
    [sel.entryId, sel.model]
  );

  /* @ai-sdk/react and the root ai package pin slightly different provider builds in this repo;
     a structural cast keeps useChat's runtime behavior (identical code path by design) */
  const { messages, sendMessage, status, error, setMessages, stop } = useChat({ transport } as any);

  const generating = status === "submitted" || status === "streaming";

  /* auto-scroll to bottom on new tokens */
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text || generating) return;
    if (!sel.entryId || !sel.model) {
      toast.error("Connect an API key on the AI APIs page first");
      return;
    }
    setInput("");
    sendMessage({ text });
  };

  const options = useMemo(() => {
    if (!config) return [] as { entryId: string; entryLabel: string; model: string; label: string }[];
    const out: { entryId: string; entryLabel: string; model: string; label: string }[] = [];
    for (const e of config.entries) {
      for (const m of e.models) {
        out.push({ entryId: e.id, entryLabel: e.name, model: m, label: `${e.name} · ${m}` });
      }
    }
    return out;
  }, [config]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* slim header — flask, name, model select, reset */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <FlaskConical className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">Vercel Labs</p>
          <p className="truncate text-[10px] text-muted-foreground">
            AI SDK 7 · json-render → shadcn
          </p>
        </div>
        {options.length > 0 && (
          <select
            value={`${sel.entryId}|${sel.model}`}
            onChange={(e) => {
              const [entryId, model] = e.target.value.split("|");
              saveSel({ entryId, model });
            }}
            className="h-8 max-w-[180px] rounded-md border border-input bg-background px-2 text-[11px] shadow-2xs outline-none sm:max-w-[280px]"
            title="Model (shared with your AI APIs keys)"
          >
            {options.map((o) => (
              <option key={`${o.entryId}|${o.model}`} value={`${o.entryId}|${o.model}`}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-[11px]"
          onClick={() => setMessages([])}
          disabled={!messages.length || generating}
        >
          <SquarePlus className="size-3.5" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </header>

      {/* body */}
      <div ref={scrollRef} className="nice-scroll flex-1 overflow-y-auto">
        {configError ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
            <AlertTriangle className="size-6 text-destructive" />
            <p className="text-sm text-muted-foreground">{configError}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm">
              <FlaskConical className="size-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">Vercel Labs</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ask anything — it answers in markdown and can render interactive
                shadcn UI (forms, cards, tables) via the json-render core.
                {sel.model ? (
                  <>
                    {" "}Model: <span className="font-semibold text-foreground">{prettyModel(sel.model)}</span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { t: "Generate a demo-feedback survey", i: "Form with inputs, a select and a submit that sends results back to chat" },
                { t: "Compare pnpm vs npm vs bun", i: "Structured table + summary cards" },
                { t: "Build a release-checklist wizard", i: "Checklist with switches and a copy summary" },
                { t: "Stats card dashboard for chat KPIs", i: "Grouped stat cards in a grid" },
              ].map((p) => (
                <button
                  key={p.t}
                  type="button"
                  onClick={() => setInput(p.t)}
                  className="rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left shadow-2xs transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <p className="text-xs font-semibold">{p.t}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{p.i}</p>
                </button>
              ))}
            </div>
            {!config && !configError && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Loading your AI keys…
              </div>
            )}
            {config?.entries.length === 0 && (
              <a href="/ai-apis" className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-foreground hover:border-primary/40">
                <KeyRound className="size-3.5 text-primary" /> Connect an API key to start
              </a>
            )}
          </div>
        ) : (
          <div className="w-full px-3 sm:px-4">
            <div className="mx-auto w-full max-w-3xl">
              {messages.map((m) => (
                <div key={m.id} className="py-4">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {m.role === "user" ? (
                      <span className="flex size-[18px] items-center justify-center rounded-md bg-muted text-[9px] font-bold">Me</span>
                    ) : (
                      <span className="flex size-[18px] items-center justify-center rounded-md bg-primary/15 text-primary">
                        <FlaskConical className="size-2.5" />
                      </span>
                    )}
                    <span className="text-xs font-semibold text-foreground">
                      {m.role === "user" ? "You" : prettyModel(sel.model)}
                    </span>
                    {m.role === "assistant" && (
                      <span className="text-[10px] font-medium text-emerald-500">AI</span>
                    )}
                  </div>
                  <div className="w-full space-y-3">
                    {m.parts.map((p, i) => {
                      if (p.type === "reasoning") {
                        return (
                          <p key={i} className="nice-scroll max-h-40 overflow-y-auto whitespace-pre-wrap border-l-2 border-border/70 pl-3 text-[13px] italic leading-relaxed text-muted-foreground/80">
                            {p.text}
                          </p>
                        );
                      }
                      if (p.type === "text" && p.text) {
                        const segs = splitRenderSegments(p.text);
                        return segs.map((s, j) =>
                          s.kind === "ui" ? (
                            <div key={`${i}-${j}`} className="rounded-xl border border-border/60 bg-card/60 p-3.5 animate-in fade-in zoom-in-95 duration-300">
                              <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <Sparkles className="size-3 text-primary" /> json-render → shadcn
                              </p>
                              <JsonRender
                                spec={s.spec}
                                onSend={(text) => sendMessage({ text })}
                              />
                            </div>
                          ) : (
                            <Mdx key={`${i}-${j}`} text={s.content} />
                          )
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              ))}

              {generating && (
                <div className="py-3">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground">
                    <FlaskConical className="size-3.5 animate-pulse text-primary" />
                    <Sparkles className="size-3 text-primary" />
                    <span>{status === "submitted" ? "Thinking…" : "Streaming…"}</span>
                  </div>
                </div>
              )}
              {error && (
                <div className="my-3 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                  <span className="flex items-center gap-1.5"><X className="size-3.5" /> {error.message}</span>
                </div>
              )}
              <div className="h-2" />
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-2 py-2 shadow-xs focus-within:border-primary/50">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={sel.model ? `Message ${prettyModel(sel.model)}…` : "Add an API key first…"}
              rows={1}
              className="max-h-40 min-h-10 flex-1 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
            />
            {generating ? (
              <Button size="icon" variant="ghost" className="size-9 shrink-0 rounded-full" onClick={() => stop()} title="Stop">
                <SquarePlus className="size-4 rotate-45" />
              </Button>
            ) : (
              <Button size="icon" className="size-9 shrink-0 rounded-full" onClick={send} disabled={!input.trim() || !sel.model}>
                <Send className="size-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground/80">
            Vercel Labs · AI SDK 7 + json-render core · keys shared with AI APIs · <a href="/natural" className="underline">Jarvis</a>
          </p>
        </div>
      </div>
    </div>
  );
}
