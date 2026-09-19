"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Loader2,
  Plus,
  Trash2,
  Coins,
  Cpu,
  BarChart2,
  ArrowLeft,
  Search,
  Clock,
  ChevronDown,
  Check,
  KeyRound,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/chat-bits";
import { MarkdownRenderer } from "./markdown-renderer";
import { VisualDataRenderer, SourceCards } from "./visual-data-renderer";
import { MobileMenuDrawer } from "@/components/nav-rail";
import { JarvisLogo } from "@/components/jarvis-logo";
import { toast } from "sonner";
import { cn, formatChatListTime } from "@/lib/utils";
import type {
  UserRow,
  NaturalChatRow,
  NaturalMessageRow,
  DailyUsageInfo,
  AiApisClientConfig,
  SourceRef,
} from "@/lib/types";

interface NaturalChatWorkspaceProps {
  me: UserRow;
}

const QUICK_PROMPTS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to sort a list of dictionaries by a key",
  "Compare React vs Vue vs Angular — pros, cons, and use cases",
  "Create a marketing plan for a SaaS product launch",
];

/** Strip ```visual-json blocks from assistant text (including the in-progress tail while streaming). */
function stripVisualJson(text: string): string {
  return text
    .replace(/```visual-json[\s\S]*?```/g, "")
    .replace(/```visual-json[\s\S]*$/g, "")
    .trim();
}

export function NaturalChatWorkspace({ me }: NaturalChatWorkspaceProps) {
  const [chats, setChats] = useState<NaturalChatRow[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NaturalMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [thinkStartTs, setThinkStartTs] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  /* Daily prompt quota (resets at midnight IST) */
  const [usage, setUsage] = useState<DailyUsageInfo | null>(null);
  /* Live AI streaming (reasoning thought-process + answer typing out) */
  const [streaming, setStreaming] = useState<{ reasoning: string; text: string; thoughtSecs: number; sources: SourceRef[] } | null>(null);
  const streamRef = useRef<{ reasoning: string; text: string; thoughtSecs: number; sources: SourceRef[] }>({ reasoning: "", text: "", thoughtSecs: 0, sources: [] });
  const streamStartRef = useRef(0);
  const flushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Mobile: false = showing chat list (full screen), true = showing conversation */
  const [mobileViewChat, setMobileViewChat] = useState(false);

  /* BYOK: connected AI APIs + which entry/model the composer dropdown selected */
  const [apiConfig, setApiConfig] = useState<AiApisClientConfig | null>(null);
  const [selection, setSelection] = useState<{ entryId: string | null; model: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  /* ---- Auto scroll to bottom ---- */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  /* ---- 1. Fetch user's Natural chats ---- */
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch("/api/natural/chats");
      const data = await res.json();
      if (data.chats) {
        setChats(data.chats);
        if (!activeChatId && data.chats.length > 0) {
          setActiveChatId(data.chats[0].id);
        }
      }
    } catch (err) {
      console.error("[natural-chat] Failed to fetch chats:", err);
    } finally {
      setLoadingChats(false);
    }
  }, [activeChatId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  /* ---- Daily prompt quota (5/day per user, resets midnight IST) ---- */
  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch("/api/natural/usage");
      if (res.ok) setUsage(await res.json());
    } catch {
      /* silent — quota pill is optional */
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  /* ---- Connected AI APIs (BYOK) — load once, restore last selection ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/natural/apis");
        if (!res.ok) return;
        const cfg: AiApisClientConfig = await res.json();
        if (cancelled) return;
        setApiConfig(cfg);

        const valid = (sel: { entryId: string | null; model: string }) => {
          if (!sel?.entryId || !sel?.model) return false;
          const e = cfg.entries.find((x) => x.id === sel.entryId);
          return !!e && e.models.includes(sel.model);
        };

        let sel: { entryId: string | null; model: string } | null = null;
        try {
          const raw = localStorage.getItem("morr_natural_sel");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (valid(parsed)) sel = parsed;
          }
        } catch { /* ignore */ }

        if (!sel) {
          const d = cfg.defaultEntryId ? cfg.entries.find((x) => x.id === cfg.defaultEntryId) : null;
          const fb = (d && d.models.length ? d : null) || (cfg.entries.length ? cfg.entries[0] : null);
          sel = fb && fb.models.length ? { entryId: fb.id, model: fb.models[0] } : null;
        }
        setSelection(sel);
      } catch { /* composer dropdown stays on built-in default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selection) {
      try { localStorage.setItem("morr_natural_sel", JSON.stringify(selection)); } catch { /* ignore */ }
    }
  }, [selection]);

  /* Label shown in the composer dropdown + message headers */
  const currentApiLabel = useMemo(() => {
    if (!selection) return "No API key";
    const e = selection.entryId ? apiConfig?.entries.find((x) => x.id === selection.entryId) : null;
    return e ? `${e.name} · ${selection.model}` : selection.model;
  }, [selection, apiConfig]);

  /* User must connect at least one key — no built-in fallback anymore */
  const noApiKey = apiConfig !== null && apiConfig.entries.length === 0;

  /* ---- 2. Fetch messages for active chat ---- */
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);

    fetch(`/api/natural/chats/${activeChatId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.messages) {
          setMessages(data.messages);
          scrollToBottom();
        }
      })
      .catch((err) => console.error("[natural-chat] Load error:", err))
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => { cancelled = true; };
  }, [activeChatId, scrollToBottom]);

  /* ---- 3. Create new chat thread ---- */
  const handleNewChat = async (initialTitle = "New Conversation") => {
    try {
      const res = await fetch("/api/natural/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: initialTitle }),
      });
      const data = await res.json();
      if (data.chat) {
        setChats((prev) => [data.chat, ...prev]);
        setActiveChatId(data.chat.id);
        setMessages([]);
        setMobileViewChat(true);
      }
    } catch {
      toast.error("Failed to start new chat");
    }
  };

  /* ---- 4. Delete a chat thread (two-step inline confirm in the row) ---- */
  const handleAskDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(id);
  };
  const handleCancelDeleteChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
  };
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteId(null);
    try {
      await fetch(`/api/natural/chats/${id}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          setActiveChatId(remaining[0].id);
        } else {
          setActiveChatId(null);
          setMobileViewChat(false);
        }
      }
      toast.success("Chat deleted");
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  /* ---- 5. Send message & trigger Gemini 2.5 Flash ---- */
  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || input).trim();
    if (!content || generating) return;
    if (!selection || !selection.entryId) {
      toast.error("Please set a valid AI API key on the AI APIs page first.");
      return;
    }
    if (usage?.reached) {
      toast.error(
        `Daily limit reached — ${usage.limit} prompts per day. Try again tomorrow.`
      );
      return;
    }

    let targetChatId = activeChatId;

    if (!targetChatId) {
      try {
        const res = await fetch("/api/natural/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 45) }),
        });
        const data = await res.json();
        if (data.chat) {
          targetChatId = data.chat.id;
          setChats((prev) => [data.chat, ...prev]);
          setActiveChatId(data.chat.id);
          setMobileViewChat(true);
        }
      } catch {
        toast.error("Could not initialize chat");
        return;
      }
    }

    if (!targetChatId) return;

    const optimisticUserMsg: NaturalMessageRow = {
      id: `tmp-${Date.now()}`,
      chatId: targetChatId,
      role: "user",
      content,
      visualData: null,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      modelUsed: currentApiLabel,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInput("");
    setGenerating(true);
    setThinkStartTs(Date.now());
    scrollToBottom();

    try {
      const res = await fetch(`/api/natural/chats/${targetChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          apiEntryId: selection?.entryId ?? null,
          model: selection?.model ?? null,
        }),
      });

      /* Non-streaming errors (auth / 429 / 404 …) come back as JSON */
      if (!res.ok) {
        const data = await res.json().catch(() => ({}) as any);
        if (res.status === 429 && (data as any).usage) setUsage((data as any).usage);
        throw new Error((data as any).error || "Failed to generate AI response");
      }
      if (!res.body) throw new Error("No response stream from server");

      /* -------- Live streaming (AI SDK fullStream -> NDJSON lines) -------- */
      streamRef.current = { reasoning: "", text: "", thoughtSecs: 0, sources: [] };
      streamStartRef.current = Date.now();
      setStreaming({ reasoning: "", text: "", thoughtSecs: 0, sources: [] });
      /* Smooth typewriter reveal (~17fps): even a big blob reveals progressively */
      flushRef.current = setInterval(() => {
        const target = streamRef.current;
        setStreaming((prev) => {
          const reveal = (cur: string, tgt: string) => {
            if (cur.length >= tgt.length) return tgt;
            const step = Math.max(20, Math.ceil((tgt.length - cur.length) * 0.22));
            return tgt.slice(0, cur.length + step);
          };
          return {
            reasoning: reveal(prev?.reasoning ?? "", target.reasoning),
            text: reveal(prev?.text ?? "", target.text),
            thoughtSecs: target.thoughtSecs,
            sources: target.sources,
          };
        });
        scrollToBottom();
      }, 60);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let donePayload: any = null;
      let streamError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.t === "text") {
              /* seconds spent "thinking" = time until the first answer token */
              if (!streamRef.current.text && streamRef.current.thoughtSecs === 0) {
                streamRef.current.thoughtSecs = Math.max(
                  1,
                  Math.round((Date.now() - streamStartRef.current) / 1000)
                );
              }
              streamRef.current.text += ev.d;
            } else if (ev.t === "reasoning") streamRef.current.reasoning += ev.d;
            else if (ev.t === "source") {
              if (!streamRef.current.sources.some((s) => s.url === ev.url)) {
                streamRef.current.sources.push({ url: ev.url, title: ev.title, domain: ev.domain });
              }
            }
            else if (ev.t === "done") donePayload = ev;
            else if (ev.t === "error") streamError = ev.d || "Generation failed";
          } catch {
            /* ignore partial line */
          }
        }
      }

      if (flushRef.current) {
        clearInterval(flushRef.current);
        flushRef.current = null;
      }
      setStreaming(null);

      if (streamError) throw new Error(streamError);
      if (!donePayload) throw new Error("Response incomplete — please try again");

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        donePayload.userMessage,
        donePayload.assistantMessage,
      ]);

      if (donePayload.chat) {
        setChats((prev) =>
          prev.map((c) => (c.id === donePayload.chat.id ? { ...c, ...donePayload.chat } : c))
        );
      }
      if (donePayload.usage) setUsage(donePayload.usage);

      scrollToBottom();
      return;
    } catch (err: any) {
      if (flushRef.current) {
        clearInterval(flushRef.current);
        flushRef.current = null;
      }
      setStreaming(null);
      toast.error(err?.message || "Failed to generate answer");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
    } finally {
      setGenerating(false);
      setThinkStartTs(null);
    }
  };

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setMobileViewChat(true);
  };

  const handleBackToList = () => {
    setMobileViewChat(false);
  };

  return (
    <div className="flex h-dvh min-w-0 flex-1 overflow-hidden bg-background text-foreground">
      {/* ================================================================= */}
      {/*  DESKTOP LAYOUT: sidebar + chat side by side                       */}
      {/* ================================================================= */}
      <div className="hidden md:flex h-full w-full">
        {/* Desktop Sidebar */}
        <aside
          className="flex w-[300px] lg:w-[320px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
          aria-label="AI Chat History"
        >
          <SidebarHeader
            me={me}
            onNewChat={() => handleNewChat()}
          />
          <SidebarSearch search={search} setSearch={setSearch} />
          <SidebarChatList
            chats={filteredChats}
            activeChatId={activeChatId}
            loadingChats={loadingChats}
            confirmDeleteId={confirmDeleteId}
            onSelectChat={(id) => setActiveChatId(id)}
            onAskDelete={handleAskDeleteChat}
            onCancelDelete={handleCancelDeleteChat}
            onConfirmDelete={handleDeleteChat}
            onNewChat={() => handleNewChat()}
          />
          <SidebarFooter chats={chats} />
        </aside>

        {/* Desktop Chat Area */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-background" aria-label="Chat Body">
          {noApiKey && <NoApiKeyBanner />}
          <ChatViewport
            scrollRef={scrollRef}
            messages={messages}
            loadingMessages={loadingMessages}
            generating={generating}
            streaming={streaming}
            me={me}
            onSendMessage={handleSendMessage}
            modelLabel={noApiKey ? "your API key" : currentApiLabel}
            thinkStartTs={thinkStartTs}
          />
          <ChatInput
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            generating={generating}
            usage={usage}
            apiConfig={apiConfig}
            noApiKey={noApiKey}
            selection={selection}
            onSelectModel={setSelection}
            modelLabel={noApiKey ? "your API key" : currentApiLabel}
            onSend={() => handleSendMessage()}
          />
        </main>
      </div>

      {/* ================================================================= */}
      {/*  MOBILE LAYOUT: full-screen pages (chat list OR conversation)      */}
      {/* ================================================================= */}
      <div className="flex md:hidden h-full w-full flex-col">
        {!mobileViewChat ? (
          /* ===== MOBILE: Full-screen chat list ===== */
          <div className="flex flex-col h-full w-full bg-sidebar text-sidebar-foreground">
            <SidebarHeader
              me={me}
              onNewChat={() => handleNewChat()}
            />
            <SidebarSearch search={search} setSearch={setSearch} />
            <SidebarChatList
              chats={filteredChats}
              activeChatId={activeChatId}
              loadingChats={loadingChats}
              confirmDeleteId={confirmDeleteId}
              onSelectChat={handleSelectChat}
              onAskDelete={handleAskDeleteChat}
              onCancelDelete={handleCancelDeleteChat}
              onConfirmDelete={handleDeleteChat}
              onNewChat={() => handleNewChat()}
            />
            <SidebarFooter chats={chats} />
          </div>
        ) : (
          /* ===== MOBILE: Full-screen conversation ===== */
          <div className="flex flex-col h-full w-full bg-background">
            {/* Slim back strip — no bulky header, maximum chat space */}
            <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-1.5 py-1">
              <button
                type="button"
                onClick={handleBackToList}
                aria-label="Back to conversations"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="size-5" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jarvis-hero.png" alt="Jarvis" className="size-6 shrink-0 rounded-md object-cover ring-1 ring-border/70" />
              <span className="min-w-0 flex-1 truncate px-1 text-sm font-semibold text-foreground">
                {activeChat?.title || "Chat"}
              </span>
            </div>
            {noApiKey && <NoApiKeyBanner />}
            <ChatViewport
              scrollRef={scrollRef}
              messages={messages}
              loadingMessages={loadingMessages}
              generating={generating}
              streaming={streaming}
              me={me}
              onSendMessage={handleSendMessage}
              modelLabel={noApiKey ? "your API key" : currentApiLabel}
              thinkStartTs={thinkStartTs}
            />
            <ChatInput
              inputRef={inputRef}
              input={input}
              setInput={setInput}
              generating={generating}
              usage={usage}
              apiConfig={apiConfig}
              noApiKey={noApiKey}
              selection={selection}
              onSelectModel={setSelection}
              modelLabel={noApiKey ? "your API key" : currentApiLabel}
              onSend={() => handleSendMessage()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================================================================== */
/*  SHARED SUB-COMPONENTS                                                 */
/* ===================================================================== */

function SidebarHeader({ me, onNewChat }: { me: UserRow; onNewChat: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-3">
      <div className="flex items-center gap-2">
        <MobileMenuDrawer user={me} />
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/jarvis-hero.png"
            alt="Jarvis"
            className="size-9 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-border"
          />
          <div>
            <h2 className="text-sm font-semibold leading-tight">Jarvis</h2>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="default"
          size="sm"
          onClick={onNewChat}
          className="gap-1.5 h-8 text-xs px-2.5 rounded-lg shadow-xs"
        >
          <Plus className="size-3.5" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>
    </div>
  );
}

function SidebarSearch({ search, setSearch }: { search: string; setSearch: (v: string) => void }) {
  return (
    <div className="p-3 pb-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search conversations…"
          className="pl-9 h-8 text-xs"
        />
      </div>
    </div>
  );
}

function SidebarChatList({
  chats,
  activeChatId,
  loadingChats,
  confirmDeleteId,
  onSelectChat,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
  onNewChat,
}: {
  chats: NaturalChatRow[];
  activeChatId: string | null;
  loadingChats: boolean;
  confirmDeleteId: string | null;
  onSelectChat: (id: string) => void;
  onAskDelete: (id: string, e: React.MouseEvent) => void;
  onCancelDelete: (e: React.MouseEvent) => void;
  onConfirmDelete: (id: string, e: React.MouseEvent) => void;
  onNewChat: () => void;
}) {
  return (
    <ScrollArea className="flex-1 px-2 py-2">
      {loadingChats ? (
        <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
          Loading AI chats…
        </div>
      ) : chats.length === 0 ? (
        <div className="p-6 text-center text-muted-foreground space-y-2">
          <JarvisLogo className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-xs">No AI conversations yet.</p>
          <Button variant="outline" size="sm" onClick={onNewChat} className="text-xs h-7">
            Start First Chat
          </Button>
        </div>
      ) : (
        <div className="space-y-0.5">
          {chats.map((c) => {
            const isActive = c.id === activeChatId;
            return (
              <div
                key={c.id}
                onClick={() => onSelectChat(c.id)}
                className={cn(
                  "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer select-none",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="min-w-0 flex-1 pr-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {c.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                    <span>{formatChatListTime(c.updatedAt)}</span>
                    {c.totalTokens > 0 && (
                      <span className="flex items-center gap-0.5 font-mono">
                        <Coins className="size-2.5" />
                        {c.totalTokens.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {confirmDeleteId === c.id ? (
                  /* INLINE CONFIRM: Delete / Cancel replaces the icon — accidental deletes are impossible */
                  <div
                    className="flex shrink-0 items-center gap-1.5 animate-in fade-in duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => onConfirmDelete(c.id, e)}
                      className="text-[10px] font-bold text-destructive hover:underline"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={onCancelDelete}
                      className="text-[10px] font-medium text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => onAskDelete(c.id, e)}
                    aria-label="Delete conversation"
                    className="ml-auto shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ScrollArea>
  );
}

function SidebarFooter({ chats }: { chats: NaturalChatRow[] }) {
  if (chats.length === 0) return null;
  return (
    <div className="border-t border-sidebar-border px-3.5 py-2.5 bg-card/40 flex items-center justify-between text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5 font-medium">
        <Cpu className="size-3.5 text-primary" />
        Total Usage
      </span>
      <span className="font-mono font-semibold text-foreground">
        {chats.reduce((acc, c) => acc + (c.totalTokens || 0), 0).toLocaleString()} tokens
      </span>
    </div>
  );
}

function prettyModelLabel(raw: string | null | undefined): string {
  if (!raw) return "AI Assistant";
  return String(raw).replace(/^models\//, "");
}

function ChatViewport({
  scrollRef,
  messages,
  loadingMessages,
  generating,
  streaming,
  me,
  onSendMessage,
  modelLabel,
  thinkStartTs,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  messages: NaturalMessageRow[];
  loadingMessages: boolean;
  generating: boolean;
  streaming: { reasoning: string; text: string; thoughtSecs: number; sources: SourceRef[] } | null;
  me: UserRow;
  onSendMessage: (text: string) => void;
  modelLabel: string;
  thinkStartTs: number | null;
}) {
  return (
    <div ref={scrollRef} className="nice-scroll flex-1 overflow-y-auto">
      {loadingMessages ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Loading conversation…</p>
        </div>
      ) : messages.length === 0 ? (
        /* ===== Welcome / Zero State ===== */
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto text-center px-4 space-y-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/jarvis-hero.png"
            alt="Jarvis"
            className="size-24 rounded-3xl object-cover shadow-xl ring-1 ring-border"
          />

          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              How can I help you today?
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              Powered by <span className="text-foreground font-semibold">{modelLabel}</span> — get answers with charts, tables, KPIs & analytics.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left pt-2">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSendMessage(prompt)}
                className="p-3.5 rounded-xl border border-border/70 bg-card/60 hover:bg-card hover:border-primary/40 text-xs transition-all text-muted-foreground hover:text-foreground flex items-start gap-2.5 group shadow-xs text-left"
              >
                <BarChart2 className="size-4 shrink-0 text-primary/70 mt-0.5 group-hover:scale-110 transition-transform" />
                <span className="leading-snug">{prompt}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* ===== Chat Messages — true ChatGPT style, full width ===== */
        <div className="w-full">
          {messages.map((m) => {
            const isUser = m.role === "user";
            return (
              <div
                key={m.id}
                className={cn(
                  "w-full"
                )}
              >
                {/* ChatGPT style: small padding, avatar + content inline, no max-width on mobile */}
                <div className="w-full px-3 sm:px-5 py-4">
                  <div className="max-w-3xl mx-auto">
                    {/* Sender header — avatar & name on one slim line; the message spans the FULL column like the composer */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {isUser ? (
                        <UserAvatar
                          emoji={me.avatarEmoji}
                          color={me.avatarColor}
                          avatarUrl={me.avatarUrl}
                          name={me.displayName}
                          size={18}
                          className="shadow-xs"
                        />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src="/jarvis-hero.png"
                          alt="Jarvis"
                          className="size-[18px] shrink-0 rounded-md object-cover ring-1 ring-border/60"
                        />
                      )}
                      <span className="text-xs font-semibold text-foreground">
                        {isUser ? me.displayName : prettyModelLabel(m.modelUsed)}
                      </span>
                      {!isUser && (
                        <span className="text-[10px] text-emerald-500 font-medium">AI</span>
                      )}
                    </div>

                    {/* Content — full width, no left rail */}
                    <div className="w-full overflow-hidden">

                      {/* Message body — fills remaining width */}
                      {isUser ? (
                        <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap select-text">
                          {m.content}
                        </div>
                      ) : (
                        <div className="w-full overflow-hidden">
                          <MarkdownRenderer content={m.content} />
                          {m.visualData && <VisualDataRenderer data={m.visualData} />}
                        </div>
                      )}

                      {/* Token telemetry for AI messages */}
                      {!isUser && m.totalTokens > 0 && (
                        <div className="flex items-center gap-2 sm:gap-3 mt-2 text-[10px] text-muted-foreground font-mono flex-wrap">
                          <span className="flex items-center gap-1">
                            <Coins className="size-3" />
                            {m.totalTokens.toLocaleString()} tokens
                          </span>
                          <span>
                            ({m.promptTokens} in / {m.completionTokens} out)
                          </span>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      )}

                      {isUser && (
                        <span className="text-[10px] text-muted-foreground mt-1 font-mono">
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* THINKING phase — ChatGPT style: quiet line with a live timer, no spinner box */}
          {(generating || streaming) && !streaming?.text && (
            <div className="w-full px-3 sm:px-5 py-3 animate-in fade-in duration-200">
              <div className="max-w-3xl mx-auto space-y-1.5">
                <ThinkingRow startTs={thinkStartTs} />
                {streaming?.reasoning && (
                  <p className="nice-scroll max-h-40 overflow-y-auto whitespace-pre-wrap border-l-2 border-primary/30 pl-3 text-[13px] italic leading-relaxed text-muted-foreground/85 animate-in fade-in duration-300">
                    {streaming.reasoning}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ANSWER phase — thought collapses to "Thought for N seconds"; answer types line-by-line */}
          {streaming?.text && (
            <div className="w-full px-3 sm:px-5 py-3 animate-in fade-in duration-200">
              <div className="max-w-3xl mx-auto space-y-3">
                {streaming.reasoning && (
                  <details className="group">
                    <summary className="flex w-fit cursor-pointer select-none list-none items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <JarvisLogo className="size-3.5 text-primary" />
                      <span>Thought for {streaming.thoughtSecs || 1} seconds</span>
                      <ChevronDown className="size-3.5 transition-transform duration-200 group-open:rotate-180" />
                    </summary>
                    <p className="nice-scroll mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap border-l-2 border-border/70 pl-3 text-[13px] italic leading-relaxed text-muted-foreground/80 animate-in fade-in duration-300">
                      {streaming.reasoning}
                    </p>
                  </details>
                )}

                <div>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/jarvis-hero.png"
                      alt="Jarvis"
                      className="size-[18px] shrink-0 rounded-md object-cover ring-1 ring-border/60"
                    />
                    <span className="text-xs font-semibold text-foreground">Jarvis</span>
                  </div>
                  <div className="w-full text-foreground">
                    <MarkdownRenderer content={stripVisualJson(streaming.text)} />
                    <span
                      className="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-full bg-primary align-[-3px]"
                      aria-hidden
                    />
                    {streaming.sources.length > 0 && (
                      <div className="mt-3 animate-in fade-in duration-300">
                        <SourceCards sources={streaming.sources} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatInput({
  inputRef,
  input,
  setInput,
  generating,
  usage,
  apiConfig,
  noApiKey,
  selection,
  onSelectModel,
  modelLabel,
  onSend,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  setInput: (v: string) => void;
  generating: boolean;
  usage: DailyUsageInfo | null;
  apiConfig: AiApisClientConfig | null;
  noApiKey: boolean;
  selection: { entryId: string | null; model: string } | null;
  onSelectModel: (sel: { entryId: string | null; model: string }) => void;
  modelLabel: string;
  onSend: () => void;
}) {
  const reached = !!usage?.reached || noApiKey;

  return (
    <div className="shrink-0 px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
      <div className="max-w-3xl mx-auto">
        {/* Daily limit notice — shown above the input, ChatGPT style */}
        {reached && usage && (
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-600 dark:text-amber-400">
            <Clock className="size-3.5 shrink-0" />
            <span>
              You've reached today's limit ({usage.used}/{usage.limit} prompts).
              Try again tomorrow — your quota resets at midnight.
            </span>
          </div>
        )}

        {/* Alert when the user hasn't connected any key yet */}
        {noApiKey && (
          <Link
            href="/ai-apis"
            className="mb-2 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 transition-colors"
          >
            <KeyRound className="size-3.5 shrink-0" />
            <span>
              No valid API key yet —{" "}
              <span className="underline underline-offset-2 font-semibold">
                set one in AI APIs
              </span>{" "}
              to start chatting.
            </span>
          </Link>
        )}

        {/* Composer card: textarea grows with content; toolbar row sits below it */}
        <div
          className={cn(
            "flex flex-col rounded-2xl bg-muted/50 border border-border/80 px-3 pt-2.5 pb-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm",
            reached && "opacity-60 pointer-events-none"
          )}
        >
          <ChatTextarea
            ref={inputRef}
            minHeight={52}
            maxHeight={200}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            disabled={reached}
            placeholder={
              noApiKey
                ? "Add an API key on the AI APIs page to chat…"
                : usage?.reached
                ? "Daily limit reached — come back tomorrow…"
                : `Message ${modelLabel}…`
            }
            className="w-full text-sm placeholder:text-muted-foreground/60"
          />

          {/* Bottom toolbar: left = API/model picker, right = send */}
          <div className="mt-1 flex items-center justify-between gap-2">
            <ApiModelMenu
              apiConfig={apiConfig}
              selection={selection}
              disabled={generating}
              onSelect={onSelectModel}
            />
            <Button
              size="icon"
              onClick={onSend}
              disabled={!input.trim() || generating || reached}
              className="size-9 shrink-0 rounded-xl shadow-sm transition-transform active:scale-95"
              aria-label="Send message"
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROVIDER_SHORT_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  openrouter: "OpenRouter",
};

/** "Thinking… Ns" with a live ticking elapsed timer — feels like ChatGPT. */
function ThinkingRow({ startTs }: { startTs: number | null }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const read = () => setSecs(startTs ? Math.max(0, Math.floor((Date.now() - startTs) / 1000)) : 0);
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, [startTs]);
  return (
    <div className="flex items-center gap-2 text-[13.5px] font-medium text-muted-foreground">
      <JarvisLogo className="size-3.5 animate-pulse text-primary" />
      <span>
        Thinking…
        {secs > 0 && (
          <span className="ml-1.5 tabular-nums text-muted-foreground/70">{secs}s</span>
        )}
      </span>
    </div>
  );
}

/** Alert strip shown in the chat when the user has no connected API key. */
function NoApiKeyBanner() {
  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-3 sm:px-5 py-2.5 animate-in fade-in duration-200">
      <div className="max-w-3xl mx-auto flex items-center gap-2.5 text-[12px] font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="size-4 shrink-0" />
        <span>
          No valid AI API key is configured.{" "}
          <Link href="/ai-apis" className="underline underline-offset-2 font-semibold">
            Set a valid API key in AI APIs
          </Link>{" "}
          to start chatting.
        </span>
      </div>
    </div>
  );
}

/** Bottom-left composer dropdown — picks which connected API key + which model answers (fully data-driven). */
function ApiModelMenu({
  apiConfig,
  selection,
  disabled,
  onSelect,
}: {
  apiConfig: AiApisClientConfig | null;
  selection: { entryId: string | null; model: string } | null;
  disabled: boolean;
  onSelect: (sel: { entryId: string | null; model: string }) => void;
}) {
  const isSelected = (entryId: string | null, model: string) =>
    selection?.entryId === entryId && selection?.model === model;

  const entries = apiConfig?.entries || [];
  const triggerLabel = selection?.model || "Add API key…";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          aria-label="Choose AI API and model"
        >
          <JarvisLogo className="size-3.5 shrink-0 text-primary" />
          <span className="max-w-[200px] sm:max-w-[260px] truncate">{triggerLabel}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="nice-scroll max-h-[320px] w-[290px] overflow-y-auto"
      >
        {/* The user's own connected APIs — the ONLY source of models now */}
        {entries.length === 0 && (
          <div className="px-2 py-2.5 text-xs text-muted-foreground">
            No API keys yet — connect one to start chatting.
          </div>
        )}
        {entries.map((e) => (
          <div key={e.id}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="truncate">{e.name}</span>
              <span className="normal-case font-normal">
                · {PROVIDER_SHORT_LABELS[e.provider] || e.provider}
              </span>
            </DropdownMenuLabel>
            {e.models.map((m) => (
              <DropdownMenuItem
                key={`${e.id}:${m}`}
                onClick={() => onSelect({ entryId: e.id, model: m })}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate">{prettyModelLabel(m)}</span>
                {isSelected(e.id, m) && <Check className="size-3.5 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
          </div>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/ai-apis" className="flex cursor-pointer items-center gap-2 text-xs font-medium">
            <KeyRound className="size-3.5 text-primary" />
            {entries.length ? "Manage your AI APIs…" : "Add your own API key…"}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
