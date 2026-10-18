"use client";

/**
 * New email — a FULL-SCREEN view (never a popup), identical flow on web +
 * mobile: slides in like the conversation view. Top bar: ✕ close / "New
 * email" / Send. Body: To/Cc/Bcc/Subject + stretchy message area.
 * Bottom toolbar: 📎 attachments + discard.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function ComposeView({
  accountId,
  initial,
  onClose,
  onSent,
}: {
  accountId: string | null;
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

  /* prefill when a draft / forward opens the view */
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

  return (
    <div className="mail-slide-in fixed inset-0 z-50 flex flex-col bg-background">
      {/* top bar */}
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2.5 sm:px-4">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close composer">
          <X className="size-5" />
        </Button>
        <span className="text-[15px] font-semibold tracking-tight sm:text-lg">New email</span>
        <Button
          onClick={send}
          disabled={sendingDisabled}
          className="ml-auto h-9 gap-2 rounded-full px-5 text-sm font-medium shadow-sm transition-transform active:scale-95"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>

      {/* form — centered column on desktop, full width on mobile */}
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-1.5 px-3 pb-3 sm:px-4">
        <div className="grid grid-cols-[72px_1fr] items-center gap-x-2">
          <span className="text-xs text-muted-foreground">To</span>
          <Input ref={toRef} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@gmail.com, other@example.com" className="h-10 rounded-none border-0 border-b border-border/70 bg-transparent px-0 shadow-none focus-visible:ring-0" />
          <span className="text-xs text-muted-foreground">Cc</span>
          <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" className="h-10 rounded-none border-0 border-b border-border/70 bg-transparent px-0 shadow-none focus-visible:ring-0" />
          <span className="text-xs text-muted-foreground">Bcc</span>
          <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="optional" className="h-10 rounded-none border-0 border-b border-border/70 bg-transparent px-0 shadow-none focus-visible:ring-0" />
          <span className="text-xs text-muted-foreground">Subject</span>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-10 rounded-none border-0 border-b border-border/70 bg-transparent px-0 shadow-none focus-visible:ring-0" />
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
          className="mt-2 min-h-[220px] flex-1 resize-none rounded-none border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0 max-sm:min-h-0"
        />

        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-2.5">
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

        {/* bottom toolbar */}
        <div className="flex items-center gap-1.5 border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)] pt-2.5">
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
          <span className="select-none text-[11px] text-muted-foreground/70">attachments upload to storage, so recipients get real files</span>
          <button
            onClick={onClose}
            className="ml-auto text-sm font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}

export default ComposeView;
