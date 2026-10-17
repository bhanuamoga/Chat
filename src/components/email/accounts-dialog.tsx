"use client";

/**
 * Email configuration — the SEPARATE config panel saved to `email_accounts`.
 * Gmail App Password flow: fields persisted only after IMAP sign-in verifies.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Mail, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EmailAccountClient } from "@/lib/email/types";

export function AccountsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
}) {
  const [accounts, setAccounts] = useState<EmailAccountClient[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [imapHost, setImapHost] = useState("imap.gmail.com");
  const [imapPort, setImapPort] = useState("993");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testedOk, setTestedOk] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/email/config");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setAppPassword("");
    setShowAdvanced(false);
    setImapHost("imap.gmail.com");
    setImapPort("993");
    setSmtpHost("smtp.gmail.com");
    setSmtpPort("587");
    setTestedOk(false);
  };

  const fields = () => ({
    name: name.trim(),
    emailAddress: email.trim(),
    appPassword: appPassword.trim(),
    imapHost: imapHost.trim(),
    imapPort: Number(imapPort) || 993,
    smtpHost: smtpHost.trim(),
    smtpPort: Number(smtpPort) || 587,
  });

  const test = async () => {
    setTesting(true);
    setTestedOk(false);
    try {
      const res = await fetch("/api/email/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", ...fields() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Connection failed");
      setTestedOk(true);
      toast.success(data.smtpOk ? "IMAP + SMTP both verified ✓" : "IMAP verified (SMTP check failed)");
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/email/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", ...fields() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Save failed");
      setAccounts(data.accounts ?? []);
      resetForm();
      toast.success("Gmail account connected — hit Sync to pull emails");
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const act = async (action: string, id: string) => {
    const res = await fetch("/api/email/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Failed");
    setAccounts(data.accounts ?? []);
    onSaved?.();
  };

  const canSubmit = name.trim() && /@/.test(email) && appPassword.trim().length >= 8;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-5 text-primary" /> Email configuration
          </DialogTitle>
          <DialogDescription>
            Connect a Gmail account with an <b>App Password</b> (Google account → Security → 2-Step Verification → App passwords). Stored per user; syncs via IMAP, sends via SMTP.
          </DialogDescription>
        </DialogHeader>

        {/* existing accounts */}
        {accounts.length > 0 && (
          <div className="space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {a.name || a.emailAddress} {a.isDefault && <span className="text-xs font-normal text-muted-foreground">(default)</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.emailAddress}
                    {a.lastSyncAt && <> · synced {new Date(a.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
                  </div>
                </div>
                {!a.isDefault && (
                  <Button variant="ghost" size="icon" className="size-8" title="Set default" onClick={() => act("setDefault", a.id)}>
                    <Star className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive hover:text-destructive"
                  title="Remove account"
                  onClick={() => act("delete", a.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Separator className="my-3" />
          </div>
        )}

        {/* add account form */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bhanu Prasad" />
            </div>
            <div className="space-y-1.5">
              <Label>Gmail address</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" type="email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>App password</Label>
            <Input
              value={appPassword}
              onChange={(e) => {
                setAppPassword(e.target.value);
                setTestedOk(false);
              }}
              placeholder="xxxx xxxx xxxx xxxx"
              type="password"
            />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Not your Gmail login password — a 16-char app password from Google account settings. Passwords are stored encrypted-at-rest with the rest of the database and never shown again.
            </p>
          </div>

          <button
            className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground")}
            onClick={() => setShowAdvanced((v) => !v)}
            type="button"
          >
            {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            Advanced (custom IMAP/SMTP server)
          </button>
          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">IMAP host</Label>
                <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IMAP port</Label>
                <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SMTP host</Label>
                <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SMTP port</Label>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} inputMode="numeric" />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="outline" onClick={test} disabled={!canSubmit || testing || saving}>
              {testing ? <Loader2 className="mr-2 size-4 animate-spin" /> : testedOk ? <CheckCircle2 className="mr-2 size-4 text-emerald-500" /> : null}
              Test connection
            </Button>
            <Button onClick={save} disabled={!canSubmit || saving || testing}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Save account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AccountsDialog;
