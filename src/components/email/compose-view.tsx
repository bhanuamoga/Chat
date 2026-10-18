"use client";

/**
 * New email — a FULL-SCREEN view (never a popup), identical flow on web +
 * mobile. Stacked default shadcn fields (From is prefilled + read-only),
 * Send sits bottom-RIGHT like Gmail, 📎 attachments row at the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ComposeInitial {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
}

interface PendingFile {
  key: string;
  name: string;
  size: number;
  mime?: string;
  url?: string;
  uploading: boolean;
}

const AVATAR_COLORS = [
  "#ef6c00", "#039be5", "#8e24aa", "#43a047", "#e53935", "#00acc1",
  "#5e35b1", "#00897b", "#f4511e", "#3949ab", "#7cb342", "#546e7a",
];
const colorFor = (s: string) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

export function ComposeView({
  accountId,
  accountEmail,
  accountName,
  initial,
  onClose,
  onSent,
}: {
  accountId: string | null;
  /** default sender — always prefilled (read-only like Gmail "From") */
  accountEmail?: string | null;
  accountName?: string | null;
  initial?: ComposeInitial | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTo(initial?.to ?? "");
    setCc(initial?.cc ?? "");
    setBcc(initial?.bcc ?? "");
    setSubject(initial?.subject ?? "");
    setBody(initial?.text ?? "");
    setFiles([]);
    const t = setTimeout(() => toRef.current?.focus(), 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of Array.from(list)) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (f.size > 20 * 1024 * 1024) {
        toast.error(`${f.name} is over 20 MB`);
        continue;
      }
      setFiles((prev) => [...prev, { key, name: f.name, size: f.size, mime: f.type || undefined, uploading: true }]);
      try {
        const form = new FormData();
        form.set("file", f);
        form.set("conversationId", "email");
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
          setFiles((prev) => prev.filter((x) => x.key !== key));
          toast.error(`Upload failed: ${f.name}`);
          continue;
        }
        setFiles((prev) => prev.map((x) => (x.key === key ? { ...x, url: data.url as string, uploading: false } : x)));
      } catch {
        setFiles((prev) => prev.filter((x) => x.key !== key));
        toast.error(`Upload failed: ${f.name}`);
      }
    }
  };

  const send = async () => {
    if (!accountId || !to.trim() || !body.trim() || sending) return;
    if (files.some((f) => f.uploading)) return toast.error("Wait — an attachment is still uploading");
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          to: to.trim(),
          cc: cc.trim(),
          bcc: bcc.trim(),
          subject: subject.trim(),
          text: body,
          attachments: files.filter((f) => f.url).map((f) => ({ url: f.url, name: f.name, mime: f.mime })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Send failed");
      toast.success("Email sent");
      onSent?.();
      onClose();
    } finally {
      setSending(false);
    }
  };

  const sendingDisabled = !to.trim() || !body.trim() || sending || !accountId || files.some((f) => f.uploading);
  const fmt = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const fromAddress = accountEmail ?? "";

  return (
    <div className="mail-slide-in fixed inset-0 z-50 flex flex-col bg-background">
      {/* top bar — close + title only; Send lives bottom-right like Gmail */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close composer">
          <X className="size-5" />
        </Button>
        <span className="text-[15px] font-semibold tracking-tight sm:text-lg">New email</span>
      </div>

      {/* form — stacked top-to-bottom, everything standard shadcn */}
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto px-3 py-3 sm:px-4">
        {/* From — always prefilled with the active account */}
        <div className="grid gap-1.5">
          <Label htmlFor="compose-from" className="text-xs text-muted-foreground">From</Label>
          <div
            id="compose-from"
            className="flex items-center gap-2.5 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm"
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: colorFor(fromAddress || "?") }}
              aria-hidden
            >
              {(fromAddress || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate font-medium text-foreground">
              {accountName ? `${accountName} ` : ""}&lt;{fromAddress}&gt;
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="compose-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="compose-to" ref={toRef} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@gmail.com, other@example.com" className="h-10" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="compose-cc" className="text-xs text-muted-foreground">Cc</Label>
          <Input id="compose-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" className="h-10" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="compose-bcc" className="text-xs text-muted-foreground">Bcc</Label>
          <Input id="compose-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="optional" className="h-10" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="compose-subject" className="text-xs text-muted-foreground">Subject</Label>
          <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-10" />
        </div>

        <Label className="text-xs text-muted-foreground" htmlFor="compose-body">Message</Label>
        <Textarea
          id="compose-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="h-full min-h-[220px] flex-1 resize-y text-sm"
        />
      </div>

      {/* attachments + toolbar pinned to the bottom — Send on the RIGHT */}
      <div className="border-t border-border bg-background">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <span
                  key={f.key}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {f.uploading ? <Loader2 className="size-3 animate-spin" /> : <FileText className="size-3" />}
                  <span className="max-w-[200px] truncate">{f.name}</span>
                  <span className="text-[10px] tabular-nums">{fmt(f.size)}</span>
                  {!f.uploading && (
                    <button
                      onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                      aria-label={`Remove ${f.name}`}
                      className="text-muted-foreground/70 transition-colors hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" type="button" title="Add attachment" className="size-10" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="size-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" onClick={onClose}>
              Discard
            </Button>
            <Button
              onClick={send}
              disabled={sendingDisabled}
              className="ml-auto h-10 gap-2 rounded-full px-6 text-sm font-medium shadow-sm transition-transform active:scale-95"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComposeView;
