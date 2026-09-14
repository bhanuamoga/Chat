"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Loader2,
  Sparkles,
  Bot,
  User as UserIcon,
  Plus,
  Trash2,
  Coins,
  Cpu,
  BarChart2,
  ArrowLeft,
  Search,
  Pencil,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import { UserAvatar } from "@/components/chat-bits";
import { MarkdownRenderer } from "./markdown-renderer";
import { VisualDataRenderer } from "./visual-data-renderer";
import { MobileMenuDrawer } from "@/components/nav-rail";
import { ModeToggle, ThemeMenu } from "@/components/theme-toggle";
import { toast } from "sonner";
import { cn, formatChatListTime } from "@/lib/utils";
import type { UserRow, NaturalChatRow, NaturalMessageRow } from "@/lib/types";

interface NaturalChatWorkspaceProps {
  me: UserRow;
}

const QUICK_PROMPTS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to sort a list of dictionaries by a key",
  "Compare React vs Vue vs Angular — pros, cons, and use cases",
  "Create a marketing plan for a SaaS product launch",
];

export function NaturalChatWorkspace({ me }: NaturalChatWorkspaceProps) {
  const [chats, setChats] = useState<NaturalChatRow[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NaturalMessageRow[]>([]);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);

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
        setShowSidebar(false);
      }
    } catch {
      toast.error("Failed to start new chat");
    }
  };

  /* ---- 4. Delete a chat thread ---- */
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/natural/chats/${id}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (activeChatId === id) {
        const remaining = chats.filter((c) => c.id !== id);
        setActiveChatId(remaining.length > 0 ? remaining[0].id : null);
        if (remaining.length === 0) setShowSidebar(true);
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
          setShowSidebar(false);
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
      modelUsed: "gemini-2.5-flash",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMsg]);
    setInput("");
    setGenerating(true);
    scrollToBottom();

    try {
      const res = await fetch(`/api/natural/chats/${targetChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate AI response");
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        data.userMessage,
        data.assistantMessage,
      ]);

      if (data.chat) {
        setChats((prev) =>
          prev.map((c) => (c.id === data.chat.id ? { ...c, ...data.chat } : c))
        );
      }

      scrollToBottom();
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate answer");
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
    } finally {
      setGenerating(false);
    }
  };

  const filteredChats = chats.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const isMobileSidebarVisible = !activeChatId || showSidebar;

  return (
    <div className="flex h-dvh min-w-0 flex-1 overflow-hidden bg-background text-foreground">
      {/* ====================== LEFT SIDEBAR ====================== */}
      <aside
        className={cn(
          "flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
          /* Mobile: full width or hidden */
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[85vw] max-md:max-w-[340px]",
          "max-md:shadow-2xl",
          isMobileSidebarVisible ? "max-md:flex" : "max-md:hidden",
          /* Desktop: always visible */
          "md:relative md:flex md:w-[300px] lg:w-[320px]"
        )}
        aria-label="AI Chat History"
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <MobileMenuDrawer user={me} />
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold leading-tight">AI Chat</h2>
                <span className="text-[10px] text-muted-foreground font-mono">
                  Gemini 2.5 Flash
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <ModeToggle compact />
            <ThemeMenu />
            <Button
              variant="default"
              size="sm"
              onClick={() => {
                handleNewChat();
              }}
              className="gap-1.5 h-8 text-xs px-2.5 rounded-lg shadow-xs"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </div>

        {/* Search */}
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

        {/* Conversation list */}
        <ScrollArea className="flex-1 px-2 py-2">
          {loadingChats ? (
            <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
              Loading AI chats…
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground space-y-2">
              <Bot className="size-8 mx-auto text-muted-foreground/60" />
              <p className="text-xs">No AI conversations yet.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleNewChat()}
                className="text-xs h-7"
              >
                Start First Chat
              </Button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredChats.map((c) => {
                const isActive = c.id === activeChatId;
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveChatId(c.id);
                      setShowSidebar(false);
                    }}
                    className={cn(
                      "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer select-none",
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
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

                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(c.id, e)}
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1 rounded-md transition-opacity"
                      title="Delete conversation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Token Telemetry Footer */}
        {chats.length > 0 && (
          <div className="border-t border-sidebar-border px-3.5 py-2.5 bg-card/40 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Cpu className="size-3.5 text-primary" />
              Total Usage
            </span>
            <span className="font-mono font-semibold text-foreground">
              {chats.reduce((acc, c) => acc + (c.totalTokens || 0), 0).toLocaleString()} tokens
            </span>
          </div>
        )}
      </aside>

      {/* Mobile sidebar backdrop */}
      {isMobileSidebarVisible && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ====================== RIGHT MAIN CHAT ====================== */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-background" aria-label="Chat Body">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 sm:px-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {/* Mobile: back button OR hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="size-9 md:hidden shrink-0"
              onClick={() => {
                if (activeChatId) {
                  setActiveChatId(null);
                  setShowSidebar(true);
                }
              }}
              aria-label="Back to conversations"
            >
              <ArrowLeft className="size-5" />
            </Button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs shrink-0">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-foreground leading-tight">
                  {activeChat?.title || "New Chat"}
                </h3>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                  <span className="text-emerald-500 font-medium">Gemini 2.5 Flash</span>
                  {activeChat && activeChat.totalTokens > 0 && (
                    <>
                      <span>·</span>
                      <span className="font-mono">
                        {activeChat.totalTokens.toLocaleString()} tokens
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleNewChat()}
              className="gap-1.5 h-8 text-xs rounded-lg"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </Button>
          </div>
        </div>

        {/* Message Viewport — ChatGPT style: full-width centered messages */}
        <div
          ref={scrollRef}
          className="nice-scroll flex-1 overflow-y-auto"
        >
          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">Loading conversation…</p>
            </div>
          ) : messages.length === 0 ? (
            /* ===== Welcome / Zero State — ChatGPT style ===== */
            <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto text-center px-4 space-y-6">
              <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                <Sparkles className="size-7" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  How can I help you today?
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                  Powered by <span className="text-foreground font-semibold">Gemini 2.5 Flash</span> — get answers with charts, tables, KPIs & analytics.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full text-left pt-2">
                {QUICK_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3.5 rounded-xl border border-border/70 bg-card/60 hover:bg-card hover:border-primary/40 text-xs transition-all text-muted-foreground hover:text-foreground flex items-start gap-2.5 group shadow-xs text-left"
                  >
                    <BarChart2 className="size-4 shrink-0 text-primary/70 mt-0.5 group-hover:scale-110 transition-transform" />
                    <span className="leading-snug">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ===== Chat Messages — ChatGPT style ===== */
            <div className="w-full">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "py-4",
                      isUser ? "bg-background" : "bg-muted/30"
                    )}
                  >
                    <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-3">
                      {/* Avatar */}
                      <div className="shrink-0 pt-0.5">
                        {isUser ? (
                          <UserAvatar
                            emoji={me.avatarEmoji}
                            color={me.avatarColor}
                            avatarUrl={me.avatarUrl}
                            name={me.displayName}
                            size={28}
                            className="shadow-xs"
                          />
                        ) : (
                          <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shadow-xs">
                            <Bot className="size-3.5" />
                          </div>
                        )}
                      </div>

                      {/* Content — full width for AI, right-aligned for user */}
                      <div className={cn("min-w-0 flex-1", isUser ? "flex flex-col items-end" : "")}>
                        {/* Sender label */}
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-xs font-semibold text-foreground">
                            {isUser ? me.displayName : "Gemini 2.5 Flash"}
                          </span>
                          {!isUser && (
                            <span className="text-[10px] text-emerald-500 font-medium">
                              AI
                            </span>
                          )}
                        </div>

                        {/* Message body */}
                        {isUser ? (
                          <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap select-text text-right max-w-[85%]">
                            {m.content}
                          </div>
                        ) : (
                          <div className="w-full">
                            {/* Render markdown content */}
                            <MarkdownRenderer content={m.content} />

                            {/* Render Visual Analytics (charts, KPIs, tables) */}
                            {m.visualData && (
                              <VisualDataRenderer data={m.visualData} />
                            )}
                          </div>
                        )}

                        {/* Token telemetry for AI messages */}
                        {!isUser && m.totalTokens > 0 && (
                          <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground font-mono">
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

                        {/* Timestamp for user messages */}
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
                );
              })}

              {/* Generating Animation — ChatGPT style */}
              {generating && (
                <div className="py-4 bg-muted/30 animate-in fade-in duration-200">
                  <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-3">
                    <div className="size-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Bot className="size-3.5 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Loader2 className="size-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground font-medium">
                        Thinking…
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ====================== BOTTOM INPUT — ChatGPT style ====================== */}
        <div className="shrink-0 p-3 sm:p-4 bg-background border-t border-border/50">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 rounded-2xl bg-muted/50 border border-border/80 px-3 py-2 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm">
              <ChatTextarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Message Gemini 2.5 Flash…"
                className="w-full text-sm placeholder:text-muted-foreground/60"
              />
              <Button
                size="icon"
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || generating}
                className="size-9 shrink-0 rounded-xl shadow-sm transition-transform active:scale-95"
                aria-label="Send message"
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-[10px] text-center text-muted-foreground/50 mt-1.5">
              Gemini 2.5 Flash can make mistakes. Consider checking important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
