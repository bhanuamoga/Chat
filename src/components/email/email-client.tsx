"use client";

/**
 * Gmail-style Email client — inbox/sent threads + conversation view + reply.
 * Sync from Gmail over IMAP, send over SMTP. Accounts configured separately
 * in the settings dialog (email_accounts table).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Inbox as InboxIcon,
  Send,
  PenSquare,
  RefreshCw,
  Settings,
  Star,
  Paperclip,
  ArrowLeft,
  Mail,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EmailAccountClient, EmailThreadRow } from "@/lib/email/types";
import { ThreadView } from "./thread-view";
import { ComposeDialog } from "./compose-dialog";
import { AccountsDialog } from "./accounts-dialog";

/* ------------------------------------------------------- date + initials */

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString();
}

export const AVATAR_COLORS = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#f59e0b", "#14b8a6", "#ec4899"];
export const colorFor = (s: string) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

/* ------------------------------------------------------------- shell */

export function EmailClient() {
  const [accounts, setAccounts] = useState<EmailAccountClient[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [threads, setThreads] = useState<EmailThreadRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState<EmailThreadRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeAccount = useMemo(
    () => (accounts ?? []).find((a) => a.id === accountId) ?? (accounts ?? []).find((a) => a.isDefault) ?? null,
    [accounts, accountId]
  );

  /* --------- accounts --------- */
  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/email/config");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      const def = (data.accounts ?? []).find((a: EmailAccountClient) => a.isDefault) ?? data.accounts?.[0];
      setAccountId((cur) => cur ?? def?.id ?? null);
      if (!(data.accounts ?? []).length) setAccountsOpen(true);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  /* --------- thread list --------- */
  const loadThreads = useCallback(
    async (silent = false) => {
      if (!activeAccount) return;
      if (!silent) setListLoading(true);
      try {
        const res = await fetch(`/api/email/messages?accountId=${activeAccount.id}&folder=${folder}`);
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads ?? []);
          if (selected) {
            const still = (data.threads ?? []).find((t: EmailThreadRow) => t.threadKey === selected.threadKey) ?? null;
            setSelected(still);
          }
        }
      } finally {
        setListLoading(false);
      }
    },
    [activeAccount, folder, selected]
  );

  useEffect(() => {
    setThreads([]);
    setSelected(null);
    setMobileThread(false);
    loadThreads();
  }, [activeAccount?.id, folder]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadThreads(true), 20000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadThreads]);

  /* --------- sync from Gmail --------- */
  const sync = useCallback(async () => {
    if (!activeAccount || syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: activeAccount.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Sync failed");
      const failed = (data.results ?? []).find((r: any) => !r.ok);
      if (failed) toast.error(`Sync error: ${failed.error}`);
      else toast.success("Inbox synced with Gmail");
      await loadThreads(true);
    } finally {
      setSyncing(false);
    }
  }, [activeAccount, syncing, loadThreads]);

  const openThread = useCallback(
    (t: EmailThreadRow) => {
      setSelected(t);
      setMobileThread(true);
      if (t.unread) {
        setThreads((prev) => prev.map((x) => (x.threadKey === t.threadKey ? { ...x, unread: false } : x)));
        fetch("/api/email/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, isRead: true }),
        }).catch(() => undefined);
      }
    },
    []
  );

  const toggleStar = useCallback((t: EmailThreadRow, starred: boolean) => {
    setThreads((prev) => prev.map((x) => (x.threadKey === t.threadKey ? { ...x, isStarred: starred } : x)));
    setSelected((cur) => (cur && cur.threadKey === t.threadKey ? { ...cur, isStarred: starred } : cur));
    fetch("/api/email/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, isStarred: starred }),
    }).catch(() => undefined);
  }, []);

  /* ------------------------------ no account onboarding ------------------------------ */
  if (accounts && accounts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Mail className="size-7" />
          </div>
          <h2 className="text-lg font-semibold">Connect your Gmail</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sync your inbox over IMAP and send over SMTP — with 100% Gmail reply threads.
            You will need a Gmail <b>App Password</b> (Google account → Security → 2-Step → App passwords).
          </p>
          <Button className="mt-5" onClick={() => setAccountsOpen(true)}>
            <Settings className="mr-2 size-4" /> Configure email
          </Button>
          <AccountsDialog open={accountsOpen} onOpenChange={setAccountsOpen} onSaved={loadAccounts} />
        </div>
      </div>
    );
  }

  /* ---------------------------------------- main layout ---------------------------------------- */
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Button onClick={() => setComposeOpen(true)} className="rounded-xl shadow-sm" disabled={!activeAccount}>
          <PenSquare className="mr-2 size-4" /> New email
        </Button>
        <div className="mx-1 h-6 w-px bg-border" />
        <button
          onClick={() => activeAccount && setAccountsOpen(true)}
          className="min-w-0 truncate rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Email accounts"
        >
          {activeAccount ? (
            <>
              <span className="font-medium text-foreground">{activeAccount.name || activeAccount.emailAddress}</span>
              <span className="hidden sm:inline"> · {activeAccount.emailAddress}</span>
            </>
          ) : (
            "No account"
          )}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={sync} disabled={syncing || !activeAccount} title="Sync from Gmail (IMAP)">
            <RefreshCw className={cn("mr-1.5 size-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAccountsOpen(true)} title="Email configuration">
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* folders */}
        <div className={cn("w-44 shrink-0 border-r border-border p-2", mobileThread ? "hidden md:block" : "hidden sm:block")}>
          {(
            [
              { id: "inbox", label: "Inbox", icon: InboxIcon },
              { id: "sent", label: "Sent", icon: Send },
            ] as const
          ).map((f) => {
            const unreadN = f.id === "inbox" ? threads.filter((t) => t.unread).length : 0;
            return (
              <button
                key={f.id}
                onClick={() => setFolder(f.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  folder === f.id ? "bg-accent font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )}
              >
                <f.icon className="size-4" />
                {f.label}
                {unreadN > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{unreadN}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* thread list */}
        <div className={cn("w-full min-w-0 flex-col border-r border-border md:flex md:w-[360px] md:shrink-0", mobileThread ? "hidden" : "flex")}>
          <div className="flex-1 overflow-y-auto">
            {listLoading && !threads.length ? (
              <div className="space-y-1 p-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-16 text-center text-sm text-muted-foreground">
                <InboxIcon className="mb-3 size-8 opacity-40" />
                {folder === "inbox" ? "No emails yet — hit Sync to pull from Gmail." : "Nothing here yet."}
              </div>
            ) : (
              threads.map((t) => {
                const names = t.participants.map((p) => p.name || p.address).join(", ");
                const star = t.isStarred;
                return (
                  <div
                    key={t.threadKey + t.folder}
                    role="button"
                    tabIndex={0}
                    onClick={() => openThread(t)}
                    onKeyDown={(e) => e.key === "Enter" && openThread(t)}
                    className={cn(
                      "flex w-full cursor-pointer gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                      selected?.threadKey === t.threadKey && selected?.folder === t.folder && "bg-accent",
                      t.unread && "bg-primary/[0.04]"
                    )}
                  >
                    <span
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: colorFor(t.participants[0]?.address || t.subject) }}
                    >
                      {(names[0] || "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("truncate text-[13px]", t.unread ? "font-bold text-foreground" : "font-medium text-foreground/85")}>{names || "(unknown)"}</span>
                        {t.count > 1 && <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{t.count}</span>}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{fmtDate(t.lastDate)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={cn("truncate text-xs", t.unread ? "font-semibold text-foreground" : "text-foreground/75")}>{t.subject}</span>
                        {t.hasAttachments && <Paperclip className="size-3 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{t.snippet}</span>
                    </span>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <button
                        className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-amber-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(t, !star);
                        }}
                        aria-label="Star"
                      >
                        <Star className={cn("size-4", star && "fill-amber-400 text-amber-400")} />
                      </button>
                      {t.unread && <Circle className="size-2 fill-primary text-primary" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* conversation pane */}
        <div className={cn("min-w-0 flex-1 flex-col", mobileThread ? "flex" : "hidden md:flex")}>
          {selected ? (
            <>
              <div className="flex items-center gap-1 border-b border-border px-2 py-1.5 md:hidden">
                <Button variant="ghost" size="icon" onClick={() => setMobileThread(false)} aria-label="Back to list">
                  <ArrowLeft className="size-4" />
                </Button>
                <span className="truncate text-sm font-medium">{selected.subject}</span>
              </div>
              <ThreadView
                key={selected.threadKey + selected.folder}
                thread={selected}
                account={activeAccount!}
                onRefreshed={() => loadThreads(true)}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-sm text-muted-foreground">
              <InboxIcon className="mb-3 size-10 opacity-30" />
              Select a conversation to read
            </div>
          )}
        </div>
      </div>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        accountId={activeAccount?.id ?? null}
        onSent={() => {
          if (folder === "sent") loadThreads(true);
        }}
      />
      <AccountsDialog
        open={accountsOpen}
        onOpenChange={setAccountsOpen}
        onSaved={async () => {
          await loadAccounts();
        }}
      />
    </div>
  );
}
