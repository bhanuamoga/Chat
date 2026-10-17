"use client";

/** New email compose — sent over Gmail SMTP; starts a fresh thread. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
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
  const [sending, setSending] = useState(false);

  /* prefill when a draft opens the dialog */
  useEffect(() => {
    if (open) {
      setTo(initial?.to ?? "");
      setCc(initial?.cc ?? "");
      setBcc(initial?.bcc ?? "");
      setSubject(initial?.subject ?? "");
      setBody(initial?.text ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    if (!accountId || !to.trim() || !body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, to: to.trim(), cc: cc.trim(), bcc: bcc.trim(), subject: subject.trim(), text: body }),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New email</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@gmail.com, other@example.com" autoFocus />
            <span className="text-xs text-muted-foreground">Cc</span>
            <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" />
            <span className="text-xs text-muted-foreground">Bcc</span>
            <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="optional" />
            <span className="text-xs text-muted-foreground">Subject</span>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[220px] resize-y text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Discard
            </Button>
            <Button onClick={send} disabled={!to.trim() || !body.trim() || sending || !accountId}>
              <Send className="mr-2 size-4" /> {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ComposeDialog;
