"use client";

/**
 * Gmail-style Email client — folders (Inbox/Sent/Drafts/Trash/Spam), thread
 * list, conversation view + 100% threaded replies. Sync streams NDJSON
 * progress while pulling from Gmail over IMAP; sending uses SMTP.
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
  FileText,
  Trash2,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EmailAccountClient, EmailFolderId, EmailThreadRow } from "@/lib/email/types";
import { ThreadView } from "./thread-view";
import { ComposeDialog } from "./compose-dialog";
import { AccountsDialog } from "./accounts-dialog";

/* ------------------------------------------------------- date + initials */

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString();
}

export const AVATAR_COLORS = ["#f97316", "#0ea5e9", "#8b5cf6", "#10b981", "#ef4444", "#f59e0b", "#14b8a6", "#ec4899"];
export const colorFor = (s: string) => AVATAR_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];

const FOLDERS: { id: EmailFolderId; label: string; icon: typeof InboxIcon }[] = [
  { id: "inbox", label: "Inbox", icon: InboxIcon },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "trash", label: "Trash", icon: Trash2 },
  { id: "spam", label: "Spam", icon: ShieldAlert },
];

interface SyncProgress {
  accountEmail: string;
  folder: string | null;
  fetched: number;
  total: number;
  boxIndex: number;
  boxesSeen: number;
  done: number;
}

/* ------------------------------------------------------------- shell */

export function EmailClient() {
  const [accounts, setAccounts] = useState<EmailAccountClient[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState<EmailFolderId>("inbox");
  const [threads, setThreads] = useState<EmailThreadRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState<EmailThreadRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const folderRef = useRef(folder);
  folderRef.current = folder;

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
        }
      } finally {
        setListLoading(false);
      }
    },
    [activeAccount, folder]
  );

  useEffect(() => {
    if (!activeAccount) return;
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

  /* --------- streaming sync from Gmail --------- */
  const sync = useCallback(async () => {
    if (!activeAccount || syncing) return;
    setSyncing(true);
    setProgress({ accountEmail: activeAccount.emailAddress, folder: null, fetched: 0, total: 0, boxIndex: 0, boxesSeen: 0, done: 0 });
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: activeAccount.id }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Sync failed");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const raw of lines) {
          const t = raw.trim();
          if (!t) continue;
          try {
            const evt = JSON.parse(t);
            if (evt.type === "account") {
              setProgress((p) => (p ? { ...p, accountEmail: evt.email } : p));
            } else if (evt.type === "connect") {
              setProgress((p) => (p ? { ...p, folder: "connecting" } : p));
            } else if (evt.type === "box") {
              setProgress((p) =>
                p
                  ? {
                      ...p,
                      folder: evt.folder,
                      fetched: evt.fetched ?? 0,
                      total: evt.total ?? 0,
                      boxIndex: evt.folder && p.folder !== evt.folder ? p.boxIndex + 1 : p.boxIndex,
                      boxesSeen: Math.max(p.boxesSeen, p.folder !== evt.folder ? p.boxIndex + 1 : p.boxIndex),
                    }
                  : p
              );
            } else if (evt.type === "error") {
              toast.error(`Sync error: ${evt.message}`);
            }
          } catch { /* ignore partial line */ }
        }
      }
      toast.success("Synced with Gmail");
      await loadThreads(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
      setTimeout(() => setProgress(null), 900);
    }
  }, [activeAccount, syncing, loadThreads]);

  /* --------- thread select / star / delete --------- */
  const openThread = useCallback(
    (t: EmailThreadRow) => {
      if (t.folder === "drafts") {
        // drafts open in the compose editor (Gmail behavior)
        fetch(`/api/email/messages?accountId=${t.accountId}&thread=${encodeURIComponent(t.threadKey)}`)
          .then((r) => r.json())
          .then((d) => {
            const last = (d.messages ?? []).at(-1);
            if (last) {
              setDraftSeed({
                threadKey: t.threadKey,
                to: last.toAddresses.map((a: any) => a.address).join(", "),
                cc: last.ccAddresses.map((a: any) => a.address).join(", "),
                subject: last.subject ||
                  t.subject,
                text: last.bodyText || "",
              });
              setComposeOpen(true);
            }
          })
          .catch(() => undefined);
        return;
      }
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

  const [draftSeed, setDraftSeed] = useState<{ threadKey: string; to: string; cc: string; subject: string; text: string } | null>(null);

  const toggleStar = useCallback((t: EmailThreadRow, starred: boolean) => {
    setThreads((prev) => prev.map((x) => (x.threadKey === t.threadKey ? { ...x, isStarred: starred } : x)));
    setSelected((cur) => (cur && cur.threadKey === t.threadKey ? { ...cur, isStarred: starred } : cur));
    fetch("/api/email/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, isStarred: starred }),
    }).catch(() => undefined);
  }, []);

  const deleteThread = useCallback(
    (t: EmailThreadRow) => {
      setThreads((prev) => prev.filter((x) => !(x.threadKey === t.threadKey)));
      setSelected((cur) => (cur && cur.threadKey === t.threadKey ? null : cur));
      setMobileThread((m) => (selected?.threadKey === t.threadKey ? false : m));
      fetch("/api/email/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, folder: t.folder }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          toast(d.mode === "purge" ? "Deleted forever" : "Moved to Trash");
        })
        .catch(() => undefined);
    },
    [selected]
  );

  /* ------------------------- progress % for the sync bar ------------------------- */
  const syncPct = useMemo(() => {
    if (!progress) return 0;
    const boxFrac = progress.total > 0 ? progress.fetched / progress.total : progress.folder ? 0.5 : 0;
    return Math.min(99, Math.round(((progress.boxIndex + boxFrac) / 5) * 100));
  }, [progress]);

  const syncLabel = useMemo(() => {
    if (!progress) return "";
    if (progress.folder === "connecting" || !progress.folder) return `Connecting to ${progress.accountEmail}…`;
    const f = FOLDERS.find((x) => x.id === progress.folder)?.label ?? progress.folder;
    return progress.total
      ? `${f} — ${progress.fetched}/${progress.total} messages`
      : `Syncing ${f}…`;
  }, [progress]);

  /* ------------------------------ onboarding ------------------------------ */
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
            You will need a Gmail <b>App Password</b>.
          </p>
          <Button className="mt-5" onClick={() => setAccountsOpen(true)}>
            <Settings className="mr-2 size-4" /> Configure email
          </Button>
          <AccountsDialog open={accountsOpen} onOpenChange={setAccountsOpen} onSaved={loadAccounts} />
        </div>
      </div>
    );
  }

  const unreadInInbox = threads.filter((t) => t.unread).length;

  /* ---------------------------------------- layout ---------------------------------------- */
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* toolbar — compact on mobile */}
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2 sm:gap-2 sm:px-3">
        {mobileThread ? (
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileThread(false)} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
        ) : null}
        <Button onClick={() => setComposeOpen(true)} className="hidden rounded-xl shadow-sm md:inline-flex" disabled={!activeAccount}>
          <PenSquare className="mr-2 size-4" /> New email
        </Button>
        <button
          onClick={() => activeAccount && setAccountsOpen(true)}
          className="flex min-w-0 items-center gap-1.5 truncate rounded-lg px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={`Email account: ${activeAccount?.emailAddress ?? "none"}`}
        >
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: colorFor(activeAccount?.emailAddress ?? "?") }}
          >
            {(activeAccount?.emailAddress ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden max-w-[180px] truncate sm:inline">{activeAccount?.emailAddress ?? "No account"}</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size={syncing ? "sm" : "icon"}
            onClick={sync}
            disabled={syncing || !activeAccount}
            title="Sync from Gmail (IMAP)"
            className="min-w-9"
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {syncing ? <span className="ml-1 text-xs tabular-nums">{syncPct}%</span> : null}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAccountsOpen(true)} title="Email configuration">
            <Settings className="size-4" />
          </Button>
        </div>
      </div>

      {/* sync progress bar — determinate, streaming from the server */}
      <div className={cn("h-0.5 w-full overflow-hidden bg-transparent transition-all", syncing && "h-1")}>
        {syncing && (
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${syncPct}%` }}
          />
        )}
      </div>
      {syncing && progress && (
        <div className="border-b border-border/60 bg-accent/30 px-3 py-1 text-[11px] text-muted-foreground">{syncLabel}</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* folders rail — desktops */}
        <div className={cn("hidden w-44 shrink-0 border-r border-border p-2 md:block")}>
          {FOLDERS.map((f) => {
            const badge = f.id === "inbox" && folder === "inbox" && unreadInInbox > 0 ? unreadInInbox : 0;
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
                {badge > 0 && (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* thread list pane */}
        <div className={cn("w-full min-w-0 flex-col border-r border-border md:flex md:w-[360px] md:shrink-0", mobileThread ? "hidden" : "flex")}>
          {/* folder chips — mobile + tablet */}
          <div className="flex gap-1 overflow-x-auto px-2 py-1.5 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FOLDERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFolder(f.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  folder === f.id
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <f.icon className="size-3.5" />
                {f.label}
              </button>
            ))}
          </div>

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
                {folder === "inbox" ? "No emails yet — hit Sync to pull from Gmail." : `Nothing in ${FOLDERS.find((x) => x.id === folder)?.label ?? folder}.`}
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
                      <div className="flex items-center gap-0.5">
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
                        <button
                          className="rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteThread(t);
                          }}
                          aria-label={t.folder === "trash" ? "Delete forever" : "Move to trash"}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
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
            <ThreadView
              key={selected.threadKey + selected.folder}
              thread={selected}
              account={activeAccount!}
              onRefreshed={() => loadThreads(true)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-sm text-muted-foreground">
              <InboxIcon className="mb-3 size-10 opacity-30" />
              Select a conversation to read
            </div>
          )}
        </div>
      </div>

      {/* mobile compose FAB — like the Gmail app */}
      <button
        onClick={() => {
          setDraftSeed(null);
          setComposeOpen(true);
        }}
        disabled={!activeAccount}
        aria-label="New email"
        className="fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95 md:hidden"
      >
        <PenSquare className="size-6" />
      </button>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={(v) => {
          setComposeOpen(v);
          if (!v) setDraftSeed(null);
        }}
        accountId={activeAccount?.id ?? null}
        initial={draftSeed}
        onSent={() => {
          if (draftSeed) {
            // after replying from a draft, purge that draft remotely + locally
            fetch("/api/email/messages", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accountId: activeAccount?.id, threadKey: draftSeed.threadKey, folder: "drafts", mode: "purge" }),
            }).catch(() => undefined);
          }
          if (folderRef.current === "sent" || folderRef.current === "drafts") loadThreads(true);
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
