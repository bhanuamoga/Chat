"use client";

/**
 * Conversation pane: all messages of a thread (oldest → newest, Gmail-style).
 * HTML bodies render inside sandboxed srcdoc iframes (letter look, auto-height),
 * attachments are downloadable live from Gmail, and the reply composer has
 * Cc/Bcc — replies send with proper RFC threading.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Reply, Send, Star, Trash2, X, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import { cn } from "@/lib/utils";
import type { EmailAccountClient, EmailMessage, EmailThreadRow } from "@/lib/email/types";
import { colorFor } from "./email-client";
import { AttachmentViewer, type AttachmentTarget } from "./attach-viewer";

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
         font-size: 14px; line-height: 1.55; color: #18181b; padding: 0; word-break: break-word; }
  #mkw { padding: 10px 12px; }
  @media (max-width: 560px) { #mkw { padding: 2px 1px; } }
  img { max-width: 100% !important; height: auto !important; }
  a { color: #2563eb; }
  blockquote { border-left: 3px solid #e4e4e7; margin-left: 0; padding-left: 12px; color: #52525b; }
  pre { white-space: pre-wrap; overflow-x: auto; }
</style></head><body><div id="mkw">${inner}</div></body></html>`;
  }, [html, fallback]);

  return (
    <iframe
      ref={ref}
      title="Email content"
      sandbox="allow-same-origin"
      srcDoc={doc}
      className="mt-2 w-full bg-white sm:mt-3 sm:rounded-lg sm:border sm:border-border/50"
      style={{ height: 160 }}
      scrolling="no"
      onLoad={(e) => {
        const el = e.currentTarget;
        const fit = () => {
          try {
            const w = el.contentWindow;
            const wrap = w?.document.getElementById("mkw");
            if (!w || !wrap) return;
            /* natural size first */
            wrap.style.transform = "";
            wrap.style.width = "";
            const cw = el.clientWidth || w.innerWidth;
            const sw = wrap.scrollWidth + 28; /* padding x2 */
            if (cw > 0 && sw > cw) {
              /* newsletter is wider than the phone: fit-to-width like Gmail mobile */
              const z = Math.max(cw / sw, 0.42);
              wrap.style.transform = `scale(${z})`;
              wrap.style.transformOrigin = "0 0";
              wrap.style.width = `${(100 / z).toFixed(2)}%`;
              wrap.style.boxSizing = "border-box";
            }
            const h = wrap.getBoundingClientRect().height;
            if (h > 0) el.style.height = `${Math.min(Math.ceil(h) + 6, 6000)}px`;
          } catch { /* keep default height */ }
        };
        requestAnimationFrame(() => {
          fit();
          /* re-fit when the phone flips / shell resizes */
          try {
            const ro = new ResizeObserver(() => fit());
            ro.observe(el);
          } catch { /* ResizeObserver unsupported — one-shot fit stays */ }
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
  order,
  onOpenAttachment,
}: {
  m: EmailMessage;
  me: string;
  last: boolean;
  accountId: string;
  order: number;
  onOpenAttachment: (t: AttachmentTarget) => void;
}) {
  const mine = m.fromAddress.toLowerCase() === me.toLowerCase();
  return (
    <article
      className={cn(
        "mail-card-in overflow-hidden border-b border-border/60 bg-card",
        "sm:rounded-xl sm:border sm:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        mine && "sm:border-primary/30"
      )}
      style={{ animationDelay: `${Math.min(order * 45, 360)}ms` }}
    >
      <div className="px-3.5 py-3.5 sm:p-5">
      {/* header — 3 clean rows: name+date · address · recipients */}
      <header className="flex items-start gap-2.5 sm:gap-3">
        <span
          className="flex size-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold text-white shadow-sm sm:size-10"
          style={{ background: colorFor(m.fromAddress || m.fromName) }}
          aria-hidden
        >
          {initials(m)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[15px] font-semibold leading-tight text-foreground sm:text-sm">
              {mine ? "Me" : m.fromName || m.fromAddress}
            </span>
            {m.isStarred && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
            <span className="ml-auto shrink-0 tabular-nums text-[11px] text-muted-foreground">
              {new Date(m.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">&lt;{m.fromAddress}&gt;</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
            to {m.toAddresses.map((a) => a.name || a.address).join(", ") || "—"}
            {m.ccAddresses.length > 0 && <> · cc {m.ccAddresses.map((a) => a.name || a.address).join(", ")}</>}
          </div>
        </div>
      </header>

      <EmailBody html={m.bodyHtml} fallback={m.bodyText} />

      {m.hasAttachments && m.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((a, i) => (
            <button
              key={i}
              onClick={() =>
                onOpenAttachment({
                  emailRowId: m.id,
                  accountId,
                  messageId: m.messageId,
                  index: i,
                  filename: a.filename,
                  mime: a.mime,
                  size: a.size,
                })
              }
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={`Open ${a.filename}${a.size ? ` (${Math.round(a.size / 1024)} KB)` : ""}`}
            >
              <Paperclip className="size-3" /> {a.filename}
            </button>
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
  onForward,
}: {
  thread: EmailThreadRow;
  account: EmailAccountClient;
  onRefreshed: () => void;
  onTrash?: () => void;
  onBack?: () => void;
  onForward?: (fwd: { subject: string; text: string }) => void;
}) {
  const [messages, setMessages] = useState<EmailMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [viewer, setViewer] = useState<AttachmentTarget | null>(null);
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
      setReplyOpen(false);
      await load();
      onRefreshed();
    } finally {
      setSending(false);
    }
  }, [reply, cc, bcc, messages, sending, account.id, load, onRefreshed]);

  return (
    <div className="mail-slide-in flex min-h-0 flex-1 flex-col">
      {/* subject header — own bar so the right pane owns its full height */}
      <div className="flex items-center gap-1.5 border-b border-border bg-card/60 px-2.5 py-2.5 sm:gap-2 sm:px-5 sm:py-3">
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-foreground sm:text-lg">{subject || "(no subject)"}</h2>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground sm:text-xs">{thread.folder}</span>
        {thread.count > 1 && (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground sm:text-xs">{thread.count}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {onTrash && (
            <button
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              onClick={onTrash}
              aria-label="Delete conversation"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Close conversation"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-0 overflow-y-auto p-0 sm:space-y-4 sm:px-4 sm:py-4">
        {messages === null ? (
          <div className="mx-auto w-full max-w-5xl space-y-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">This conversation is empty.</div>
        ) : (
          <div className="mx-auto w-full max-w-5xl space-y-4">
            {messages.map((m, i) => (
              <MessageCard
                key={m.id}
                m={m}
                me={account.emailAddress}
                last={i === messages.length - 1}
                accountId={account.id}
                order={i}
                onOpenAttachment={setViewer}
              />
            ))}
          </div>
        )}

        {/* reply — NOT sticky: lives in the flow at the end of the conversation.
            A Gmail-style Reply button reveals the composer (web + mobile alike). */}
        {messages !== null && messages.length > 0 && thread.folder !== "trash" && !replyOpen && (
          <div className="mx-auto w-full max-w-5xl px-3 pb-6 pt-3 sm:px-4">
            <div className="flex gap-2">
            <Button
              variant="outline"
              className="mail-card-in gap-2 rounded-full border-border bg-card px-5 shadow-sm"
              onClick={() => {
                setReplyOpen(true);
                requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
              }}
            >
              <Reply className="size-4" /> Reply
            </Button>
            <Button
              variant="outline"
              className="mail-card-in gap-2 rounded-full border-border bg-card px-5 shadow-sm"
              style={{ animationDelay: "60ms" }}
              onClick={() => {
                const last = messages[messages.length - 1];
                const quoted =
                  `---------- Forwarded message ---------\nFrom: ${last.fromName ? `${last.fromName} ` : ""}<${last.fromAddress}>\n` +
                  `Date: ${new Date(last.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}\n` +
                  `Subject: ${last.subject || "(no subject)"}\n\n${(last.bodyText || "").trim()}\n`;
                onForward?.({
                  subject: /^fwd:/i.test(last.subject || "") ? last.subject : `Fwd: ${last.subject || "(no subject)"}`,
                  text: quoted,
                });
              }}
            >
              <ArrowUp className="size-4 -rotate-45" /> Forward
            </Button>
            </div>
          </div>
        )}
        {messages !== null && messages.length > 0 && thread.folder !== "trash" && replyOpen && (
        <div className="px-0 py-2 sm:px-4 sm:py-3">
          <div className="mail-card-in mx-auto w-full max-w-5xl border border-border/70 bg-card p-3.5 shadow-sm transition-shadow sm:rounded-2xl sm:p-4 focus-within:border-primary/50 focus-within:shadow-md focus-within:ring-1 focus-within:ring-primary/20">
            {/* row 1 — who we're replying to */}
            <div className="flex items-center gap-2 text-sm">
              <Reply className="size-4 text-primary" />
              <span className="text-muted-foreground">Reply to</span>
              <span className="truncate font-medium text-foreground">{replyTo}</span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setShowCcBcc((v) => !v)}
                className="ml-auto h-7 px-2 text-xs font-semibold text-primary"
              >
                {showCcBcc ? "− Cc/Bcc" : "+ Cc/Bcc"}
              </Button>
            </div>
            {showCcBcc && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc — name@gmail.com" className="h-9 text-sm" />
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc — name@gmail.com" className="h-9 text-sm" />
              </div>
            )}
            {/* row 2 — the message */}
            <ChatTextarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              placeholder="Type your reply…"
              autoFocus
              className="mt-2 w-full text-sm placeholder:text-muted-foreground/60"
            />
            {/* row 3 — hint + send */}
            <div className="mt-2 flex items-center gap-3 border-t border-border/60 pt-3">
              <span className="hidden select-none text-xs text-muted-foreground/70 sm:inline">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]">Ctrl</kbd>
                {" + "}
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-sans text-[10px]">Enter</kbd>
                {" to send · stays in the same Gmail thread"}
              </span>
              <Button
                onClick={sendReply}
                disabled={!reply.trim() || sending || !messages}
                className="ml-auto h-9 gap-2 rounded-md px-4 text-sm font-medium shadow-sm transition-transform active:scale-95"
              >
                {sending ? "Sending…" : "Send"}
                {!sending && <Send className="size-4" />}
              </Button>
            </div>
            <div className="mt-2 flex justify-start">
              <button
                type="button"
                onClick={() => setReplyOpen(false)}
                className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                collapse reply
              </button>
            </div>
          </div>
        </div>
        )}
        {thread.folder === "trash" && (
          <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
            This conversation is in Trash — nothing can be replied here.
          </div>
        )}
      </div>
      {viewer && <AttachmentViewer target={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

export default ThreadView;
