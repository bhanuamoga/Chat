"use client";

/**
 * Conversation pane: all messages of a thread (oldest → newest, Gmail-style).
 * HTML bodies render inside sandboxed srcdoc iframes (letter look, auto-height),
 * attachments are downloadable live from Gmail, and the reply composer has
 * Cc/Bcc — replies send with proper RFC threading.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, Paperclip, Reply, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import { cn } from "@/lib/utils";
import type { EmailAccountClient, EmailMessage, EmailThreadRow } from "@/lib/email/types";
import { colorFor } from "./email-client";

const initials = (m: EmailMessage) => (m.fromName || m.fromAddress || "?").slice(0, 1).toUpperCase();

const escapeHtmlLocal = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Renders the (already sanitized) HTML body on a clean white letter canvas. */
function EmailBody({ html, fallback }: { html: string | null; fallback: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const doc = useMemo(() => {
    const inner = html ?? `<div style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${escapeHtmlLocal(fallback)}</div>`;
    return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<base target="_blank"/>
<style>
  html, body { margin: 0; padding: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         font-size: 14px; line-height: 1.55; color: #18181b; padding: 14px; word-break: break-word; }
  img { max-width: 100% !important; height: auto !important; }
  a { color: #2563eb; }
  blockquote { border-left: 3px solid #e4e4e7; margin-left: 0; padding-left: 12px; color: #52525b; }
  pre { white-space: pre-wrap; }
</style></head><body>${inner}</body></html>`;
  }, [html, fallback]);

  return (
    <iframe
      ref={ref}
      title="Email content"
      sandbox="allow-same-origin"
      srcDoc={doc}
      className="mt-3 w-full rounded-lg border border-border/50 bg-white"
      style={{ height: 160 }}
      scrolling="no"
      onLoad={(e) => {
        const el = e.currentTarget;
        requestAnimationFrame(() => {
          try {
            const h = el.contentWindow?.document.documentElement?.scrollHeight ?? 0;
            if (h > 0) el.style.height = `${Math.min(h + 4, 6000)}px`;
          } catch { /* keep default height */ }
        });
      }}
    />
  );
}

function MessageCard({
  m,
  me,
  last,
  accountId,
}: {
  m: EmailMessage;
  me: string;
  last: boolean;
  accountId: string;
}) {
  const mine = m.fromAddress.toLowerCase() === me.toLowerCase();
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        mine && "border-primary/30"
      )}
    >
      <div className="p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
          style={{ background: colorFor(m.fromAddress || m.fromName) }}
          aria-hidden
        >
          {initials(m)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-foreground">{mine ? "Me" : m.fromName || m.fromAddress}</span>
            {m.isStarred && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
            <span className="text-xs text-muted-foreground">&lt;{m.fromAddress}&gt;</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {new Date(m.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            to {m.toAddresses.map((a) => a.name || a.address).join(", ") || "—"}
            {m.ccAddresses.length > 0 && <> · cc {m.ccAddresses.map((a) => a.name || a.address).join(", ")}</>}
          </div>
        </div>
      </header>

      <EmailBody html={m.bodyHtml} fallback={m.bodyText} />

      {m.hasAttachments && m.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((a, i) => (
            <a
              key={i}
              href={`/api/email/attachment?accountId=${accountId}&id=${encodeURIComponent(m.messageId)}&i=${i}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={`Open ${a.filename}${a.size ? ` (${Math.round(a.size / 1024)} KB)` : ""}`}
            >
              <Paperclip className="size-3" /> {a.filename}
            </a>
          ))}
        </div>
      )}
      {!last && <div className="mt-3 flex justify-end"><Reply className="size-3.5 text-muted-foreground/40" /></div>}
      </div>
    </article>
  );
}

export function ThreadView({
  thread,
  account,
  onRefreshed,
  onTrash,
  onBack,
}: {
  thread: EmailThreadRow;
  account: EmailAccountClient;
  onRefreshed: () => void;
  onTrash?: () => void;
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<EmailMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/email/messages?accountId=${thread.accountId}&thread=${encodeURIComponent(thread.threadKey)}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data.messages ?? []);
    }
  }, [thread]);

  useEffect(() => {
    setMessages(null);
    load();
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const subject = useMemo(() => messages?.[0]?.subject || thread.subject, [messages, thread.subject]);
  const replyTo = useMemo(() => messages?.at(-1)?.fromAddress ?? "", [messages]);

  const sendReply = useCallback(async () => {
    const lastId = messages?.at(-1)?.id;
    if (!reply.trim() || !lastId || sending) return;
    setSending(true);
    const draft = reply.trim();
    setReply("");
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: account.id,
          replyToEmailId: lastId,
          text: draft,
          cc: cc.trim(),
          bcc: bcc.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Send failed");
        setReply(draft);
        return;
      }
      toast.success("Reply sent");
      setCc("");
      setBcc("");
      await load();
      onRefreshed();
    } finally {
      setSending(false);
    }
  }, [reply, cc, bcc, messages, sending, account.id, load, onRefreshed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* subject header — own bar so the right pane owns its full height */}
      <div className="flex items-center gap-2 border-b border-border bg-card/60 px-2 py-3 sm:px-5">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back to list"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{subject || "(no subject)"}</h2>
        {thread.count > 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{thread.count}</span>
        )}
        {onTrash && (
          <button
            className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
            onClick={onTrash}
            aria-label="Delete conversation"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
        {messages === null ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">This conversation is empty.</div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) => (
              <MessageCard key={m.id} m={m} me={account.emailAddress} last={i === messages.length - 1} accountId={account.id} />
            ))}
          </div>
        )}
      </div>

      {/* reply composer — pinned at bottom (hidden in Trash) */}
      {thread.folder === "trash" ? (
        <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
          This conversation is in Trash — nothing can be replied here.
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-border bg-card shadow-md focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              <Reply className="size-3.5" />
              Reply to <span className="font-medium text-foreground">{replyTo}</span>
              <button
                className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/10"
                onClick={() => setShowCcBcc((v) => !v)}
                type="button"
              >
                {showCcBcc ? "− Cc/Bcc" : "+ Cc/Bcc"}
              </button>
            </div>
            {showCcBcc && (
              <div className="grid gap-1.5 border-b border-border/60 px-3 py-2 sm:grid-cols-2">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc — name@gmail.com" className="h-8 text-xs" />
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc — name@gmail.com" className="h-8 text-xs" />
              </div>
            )}
            <ChatTextarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              placeholder="Type your reply… (Ctrl/⌘ + Enter to send)"
              className="w-full text-sm placeholder:text-muted-foreground/60"
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <span className="select-none text-[11px] text-muted-foreground/70">Ctrl/⌘ + Enter to send · stays in the same Gmail thread</span>
              <Button size="sm" onClick={sendReply} disabled={!reply.trim() || sending || !messages} className="h-9 rounded-full px-5 text-sm font-semibold shadow-sm">
                {sending ? "Sending…" : "Send"} <ArrowUp className="ml-1.5 size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThreadView;
