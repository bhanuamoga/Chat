"use client";

/**
 * Conversation pane: all messages of a thread (oldest → newest, Gmail-style),
 * each with full formatted body, plus a sticky reply composer at the bottom
 * that replies with proper RFC threading (server adds In-Reply-To + References).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, Paperclip, Reply, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import { cn } from "@/lib/utils";
import type { EmailAccountClient, EmailMessage, EmailThreadRow } from "@/lib/email/types";
import { colorFor } from "./email-client";

const initials = (m: EmailMessage) => (m.fromName || m.fromAddress || "?").slice(0, 1).toUpperCase();

function MessageCard({ m, me, last }: { m: EmailMessage; me: string; last: boolean }) {
  const mine = m.fromAddress.toLowerCase() === me.toLowerCase();
  const body = m.bodyHtml || `<div style="white-space:pre-wrap;font-family:inherit">${m.bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</div>`;
  return (
    <article className={cn("rounded-2xl border border-border bg-card p-4", mine && "border-primary/25 bg-primary/[0.04]")}>
      <header className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ background: colorFor(m.fromAddress || m.fromName) }}
          aria-hidden
        >
          {initials(m)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-foreground">
              {mine ? "Me" : m.fromName || m.fromAddress}
            </span>
            {m.isStarred && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
            <span className="text-xs text-muted-foreground">&lt;{m.fromAddress}&gt;</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {new Date(m.date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            to {m.toAddresses.map((a) => a.name || a.address).join(", ") || "—"}
            {m.ccAddresses.length > 0 && <> · cc {m.ccAddresses.map((a) => a.name || a.address).join(", ")}</>}
          </div>
        </div>
      </header>
      {/* emails are styled for a light canvas — render on white like Gmail does */}
      <div
        className="mt-3 overflow-x-auto rounded-xl bg-white p-3 text-[13px] leading-relaxed text-zinc-900 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: body }}
      />
      {m.hasAttachments && m.attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((a, i) => (
            <span key={i} className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" /> {a.filename}
            </span>
          ))}
        </div>
      )}
      {!last && <div className="mt-3 flex justify-end"><Reply className="size-3.5 text-muted-foreground/50" /></div>}
    </article>
  );
}

export function ThreadView({
  thread,
  account,
  onRefreshed,
}: {
  thread: EmailThreadRow;
  account: EmailAccountClient;
  onRefreshed: () => void;
}) {
  const [messages, setMessages] = useState<EmailMessage[] | null>(null);
  const [reply, setReply] = useState("");
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
  const replyTo = useMemo(() => {
    const last = messages?.at(-1);
    return last ? last.fromAddress : "";
  }, [messages]);

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
        body: JSON.stringify({ accountId: account.id, replyToEmailId: lastId, text: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Send failed");
        setReply(draft);
        return;
      }
      toast.success("Reply sent");
      await load();
      onRefreshed();
    } finally {
      setSending(false);
    }
  }, [reply, messages, sending, account.id, load, onRefreshed]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* subject header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="truncate text-base font-semibold text-foreground">{subject || "(no subject)"}</h2>
        {thread.count > 1 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{thread.count}</span>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-4">
        {messages === null ? (
          <div className="space-y-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-36 w-full rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">This conversation is empty.</div>
        ) : (
          messages.map((m, i) => <MessageCard key={m.id} m={m} me={account.emailAddress} last={i === messages.length - 1} />)
        )}
      </div>

      {/* reply composer — Gmail style pinned at bottom (hidden in Trash) */}
      {thread.folder === "trash" ? (
        <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
          This conversation is in Trash — nothing can be replied here.
        </div>
      ) : (
      <div className="border-t border-border p-3">
        <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-primary/50">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <Reply className="size-3.5" />
            Reply to <span className="font-medium text-foreground">{replyTo}</span>
          </div>
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
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] text-muted-foreground">Threads stay in Gmail — In-Reply-To + References are set.</span>
            <Button size="sm" onClick={sendReply} disabled={!reply.trim() || sending || !messages} className="rounded-xl">
              {sending ? "Sending…" : "Send"} <ArrowUp className="ml-1.5 size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export default ThreadView;
