"use client";

/**
 * New email compose — sent over Gmail SMTP, starts a fresh thread.
 * MOBILE: slides up from the bottom like the Gmail app (bottom sheet),
 * with every control visible: To/Cc/Bcc/Subject/body, attachment upload
 * chips at the bottom, then Discard + Send — never a cramped popup.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export function ComposeDialog({
  open,
  onOpenChange,
  accountId,
  initial,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string | null;
  /** prefill (e.g. a synced Gmail draft being edited) */
  initial?: ComposeInitial | null;
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

  /* prefill when a draft / forward opens the dialog */
  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setCc(initial?.cc ?? "");
      setBcc(initial?.bcc ?? "");
      setSubject(initial?.subject ?? "");
      setBody(initial?.text ?? "");
      setFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        setFiles((prev) =>
          prev.map((x) => (x.key === key ? { ...x, url: data.url as string, uploading: false } : x))
        );
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
      onOpenChange(false);
      onSent?.();
    } finally {
      setSending(false);
    }
  };

  const sendingDisabled = !to.trim() || !body.trim() || sending || !accountId || files.some((f) => f.uploading);
  const fmt = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl data-[state=open]:duration-300
          max-sm:left-0 max-sm:top-auto max-sm:bottom-0 max-sm:translate-x-0 max-sm:translate-y-0
          max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:border-x-0 max-sm:border-b-0
          max-sm:p-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom"
      >
        <DialogHeader>
          <DialogTitle className="text-base">New email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto">
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@gmail.com, other@example.com" autoFocus className="h-10 sm:h-9" />
            <span className="text-xs text-muted-foreground">Cc</span>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" className="h-10 sm:h-9" />
            <span className="text-xs text-muted-foreground">Bcc</span>
            <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="optional" className="h-10 sm:h-9" />
            <span className="text-xs text-muted-foreground">Subject</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-10 sm:h-9" />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[28vh] resize-y text-sm sm:min-h-[220px]"
          />

          {/* attachments row like Gmail's bottom toolbar */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <span
                  key={f.key}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {f.uploading ? <Loader2 className="size-3 animate-spin" /> : <FileText className="size-3" />}
                  <span className="max-w-[180px] truncate">{f.name}</span>
                  <span className="text-[10px]">{fmt(f.size)}</span>
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

          {/* bottom action row — visible on every screen size */}
          <div className="flex items-center gap-2 border-t border-border/60 pt-3">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              title="Add attachment"
              className="size-10"
              onClick={() => fileInputRef.current?.click()}
            >
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
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Discard
            </Button>
            <Button onClick={send} disabled={sendingDisabled} className="ml-auto active:scale-95">
              {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
