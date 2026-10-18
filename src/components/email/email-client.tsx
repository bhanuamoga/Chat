"use client";

/**
 * Gmail layout:
 *  LEFT  — folder navigation with total counts (Inbox/Sent/Drafts/Trash/Spam)
 *  RIGHT — search+compose row, sync/settings, All/Unread/Read tabs, and the
 *          paginated email list (50/page). Clicking a thread opens the
 *          conversation fullscreen on the right with a back arrow.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Inbox as InboxIcon,
  Send,
  PenSquare,
  RefreshCw,
  Settings,
  Star,
  Paperclip,
  Mail,
  Circle,
  FileText,
  Trash2,
  ShieldAlert,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { MobileMenuDrawer } from "@/components/nav-rail";
import type { EmailAccountClient, EmailFolderId, EmailThreadRow } from "@/lib/email/types";
import { ThreadView } from "./thread-view";
import { ComposeView } from "./compose-view";
import { AccountsDialog } from "./accounts-dialog";

/* ------------------------------------------------------- helpers */

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
}

type FolderCounts = Record<string, number>;

/* ------------------------------------------------------------- shell */

export function EmailClient() {
  const [accounts, setAccounts] = useState<EmailAccountClient[] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [folder, setFolder] = useState<EmailFolderId>("inbox");
  const [tab, setTab] = useState<"all" | "unread" | "read">("all");
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<{ total: number; totalPages: number; perPage: number; displayTotal: number }>({ total: 0, totalPages: 1, perPage: 50, displayTotal: 0 });
  const [folderCounts, setFolderCounts] = useState<FolderCounts>({});
  const [query, setQuery] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [threads, setThreads] = useState<EmailThreadRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selected, setSelected] = useState<EmailThreadRow | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [phoneList, setPhoneList] = useState(false); // mobile: folders screen → list screen
  const [draftSeed, setDraftSeed] = useState<{ threadKey: string; to: string; cc: string; subject: string; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const folderRef = useRef(folder);
  folderRef.current = folder;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

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

  /* search debounce */
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  /* --------- thread list (+ counts) --------- */
  const loadThreads = useCallback(
    async (silent = false) => {
      if (!activeAccount) return;
      if (!silent) setListLoading(true);
      try {
        const params = new URLSearchParams({ accountId: activeAccount.id, folder, state: tab, page: String(page) });
        if (qDebounced) params.set("q", qDebounced);
        if (selectedRef.current) return; // a conversation is open — don't churn the list behind it
        const res = await fetch(`/api/email/messages?${params}`);
        if (res.ok) {
          const data = await res.json();
          setThreads(data.threads ?? []);
          setPageInfo({
            total: data.total ?? 0,
            totalPages: data.totalPages ?? 1,
            perPage: data.perPage ?? 50,
            displayTotal: data.displayTotal ?? data.total ?? 0,
          });
          if (data.folderCounts) setFolderCounts(data.folderCounts);
          if (data.page && data.page !== page) setPage(data.page);
        }
      } finally {
        setListLoading(false);
      }
    },
    [activeAccount, folder, tab, page, qDebounced]
  );

  useEffect(() => {
    if (!activeAccount) return;
    loadThreads();
  }, [activeAccount?.id, folder, tab, page, qDebounced]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadThreads(true), 25000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadThreads]);

  const switchFolder = useCallback((f: EmailFolderId) => {
    setFolder(f);
    setPage(1);
    setSelected(null);
    setPhoneList(true); // mobile: folder tap opens the list as its own screen
  }, []);
  const switchTab = useCallback((t: "all" | "unread" | "read") => {
    setTab(t);
    setPage(1);
  }, []);

  /* --------- streaming sync --------- */
  const syncRound = useCallback(async (): Promise<boolean> => {
    /* returns TRUE when the server stopped on its time budget (more mail to get) */
    if (!activeAccount) return false;
    try {
      const res = await fetch("/api/email/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: activeAccount.id }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Sync failed");
        return false;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let partial = false;
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
            if (evt.type === "account") setProgress((p) => (p ? { ...p, accountEmail: evt.email } : p));
            else if (evt.type === "connect") setProgress((p) => (p ? { ...p, folder: "connecting" } : p));
            else if (evt.type === "box") {
              setProgress((p) =>
                p
                  ? {
                      ...p,
                      folder: evt.folder,
                      fetched: evt.fetched ?? 0,
                      total: evt.total ?? 0,
                      boxIndex: p.folder !== evt.folder ? p.boxIndex + 1 : p.boxIndex,
                    }
                  : p
              );
            } else if (evt.type === "done") partial = Boolean(evt.partial);
            else if (evt.type === "error" || evt.type === "fatal") toast.error(`Sync error: ${evt.message}`);
          } catch { /* partial line */ }
        }
      }
      if (partial) {
        setProgress((p) => (p ? { ...p, folder: "continuing older mail…" } : p));
        return true;
      }
      toast.success("Synced with Gmail");
      await loadThreads(true);
      return false;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
      return false;
    }
  }, [activeAccount, loadThreads]);

  const syncingRef = useRef(false);
  const sync = useCallback(async () => {
    if (!activeAccount || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setProgress({ accountEmail: activeAccount.emailAddress, folder: null, fetched: 0, total: 0, boxIndex: 0 });
    try {
      /* full mailbox can need several time-budgeted rounds — keep going until done */
      for (let round = 0; round < 20; round++) {
        const more = await syncRound();
        if (!more) break;
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setProgress((p) => (p ? { ...p } : p));
      await loadThreads(true);
      setTimeout(() => setProgress(null), 900);
    }
  }, [activeAccount, syncRound, loadThreads]);

  /* --------- thread actions --------- */
  const openThread = useCallback((t: EmailThreadRow) => {
    if (t.folder === "drafts") {
      fetch(`/api/email/messages?accountId=${t.accountId}&thread=${encodeURIComponent(t.threadKey)}`)
        .then((r) => r.json())
        .then((d) => {
          const last = (d.messages ?? []).at(-1);
          if (last) {
            setDraftSeed({
              threadKey: t.threadKey,
              to: last.toAddresses.map((a: any) => a.address).join(", "),
              cc: last.ccAddresses.map((a: any) => a.address).join(", "),
              subject: last.subject || t.subject,
              text: last.bodyText || "",
            });
            setComposeOpen(true);
          }
        })
        .catch(() => undefined);
      return;
    }
    setSelected(t);
    if (t.unread) {
      setThreads((prev) => prev.map((x) => (x.threadKey === t.threadKey ? { ...x, unread: false } : x)));
      setFolderCounts((c) => (c.unreadInbox ? { ...c, unreadInbox: Math.max(0, c.unreadInbox - 1) } : c));
      fetch("/api/email/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, isRead: true }),
      }).catch(() => undefined);
    }
  }, []);

  const toggleStar = useCallback((t: EmailThreadRow, starred: boolean) => {
    setThreads((prev) => prev.map((x) => (x.threadKey === t.threadKey ? { ...x, isStarred: starred } : x)));
    setSelected((cur) => (cur && cur.threadKey === t.threadKey ? { ...cur, isStarred: starred } : cur));
    fetch("/api/email/messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, isStarred: starred }),
    }).catch(() => undefined);
  }, []);

  const deleteThread = useCallback((t: EmailThreadRow) => {
    setThreads((prev) => prev.filter((x) => x.threadKey !== t.threadKey));
    setSelected((cur) => (cur?.threadKey === t.threadKey ? null : cur));
    setPageInfo((pi) => ({ ...pi, total: Math.max(0, pi.total - 1) }));
    fetch("/api/email/messages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: t.accountId, threadKey: t.threadKey, folder: t.folder }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        toast(d.mode === "purge" ? "Deleted forever" : "Moved to Trash");
        loadThreads(true);
      })
      .catch(() => undefined);
  }, [loadThreads]);

  /* ------------------------- sync progress % ------------------------- */
  const syncPct = useMemo(() => {
    if (!progress) return 0;
    const boxFrac = progress.total > 0 ? progress.fetched / progress.total : progress.folder ? 0.5 : 0;
    return Math.min(99, Math.round(((progress.boxIndex + boxFrac) / 5) * 100));
  }, [progress]);

  const syncLabel = useMemo(() => {
    if (!progress) return "";
    if (progress.folder === "connecting" || !progress.folder) return `Connecting to ${progress.accountEmail}…`;
    const f = FOLDERS.find((x) => x.id === progress.folder)?.label ?? progress.folder;
    return progress.total ? `${f} — ${progress.fetched}/${progress.total} messages` : `Syncing ${f}…`;
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

  const folderNav = (compact?: boolean) => (
    <nav className={cn("flex flex-col gap-0.5 p-2", compact && "px-3")}>
      {FOLDERS.map((f) => {
        const total = folderCounts?.[f.id] ?? 0;
        const unread = f.id === "inbox" ? folderCounts?.unreadInbox ?? 0 : 0;
        const active = folder === f.id;
        return (
          <Button
            key={f.id}
            variant={active ? "secondary" : "ghost"}
            onClick={() => switchFolder(f.id)}
            className={cn(
              "h-10 w-full justify-start gap-2.5 rounded-xl px-3 text-sm",
              active ? "font-semibold" : "font-normal text-muted-foreground"
            )}
          >
            <f.icon className={cn("size-4 shrink-0", active && "text-primary")} />
            <span className="min-w-0 flex-1 truncate text-left">{f.label}</span>
            {unread > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">{unread}</span>
            )}
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{total}</span>
          </Button>
        );
      })}
    </nav>
  );

  /* ---------------------------------------- layout ---------------------------------------- */
  /* Left panel content — ONE definition, used by the desktop aside AND the
     mobile folders screen (chat-page style stacked panes). */
  const panelContent = (
    <>

        {/* account row — sync + settings sit next to the email */}
        <div className="mx-2 mb-2 mt-2 flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-2">
          <button
            onClick={() => activeAccount && setAccountsOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-accent/60"
            title="Email account"
          >
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: colorFor(activeAccount?.emailAddress ?? "?") }}
            >
              {(activeAccount?.emailAddress ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-foreground">{activeAccount?.name || "Account"}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{activeAccount?.emailAddress ?? "configure…"}</span>
            </span>
          </button>
          <Button variant="ghost" size="icon" onClick={sync} disabled={syncing || !activeAccount} title="Sync from Gmail" className="size-8 shrink-0">
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setAccountsOpen(true)} title="Email configuration" className="size-8 shrink-0">
            <Settings className="size-4" />
          </Button>
        </div>

        {/* sync progress */}
        {syncing && (
          <div className="mx-2 mb-2">
            <div className="flex items-center gap-1.5">
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${syncPct}%` }} />
              </div>
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{syncPct}%</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">{syncLabel}</div>
          </div>
        )}

        {/* search bar — shadcn Input */}
        <div className="relative px-2 pb-2">
          <Search className="pointer-events-none absolute left-5 top-[13px] size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={`Search ${FOLDERS.find((x) => x.id === folder)?.label.toLowerCase() ?? "mail"}`}
            disabled={!activeAccount}
            className="h-9 rounded-xl bg-muted/40 pl-9 pr-8 text-sm"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-4 top-1.5 size-6"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* New email */}
        <div className="px-2 pb-2">
          <Button
            onClick={() => {
              setDraftSeed(null);
              setComposeOpen(true);
            }}
            disabled={!activeAccount}
            className="h-11 w-full justify-start gap-3 rounded-2xl text-sm font-semibold shadow-md"
          >
            <PenSquare className="size-4" /> New email
          </Button>
        </div>

        {/* folders with totals */}
        <div className="flex-1 overflow-y-auto border-t border-border/60 pt-2">{folderNav()}</div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* ══ LEFT — desktop: always visible aside ══ */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border md:flex">{panelContent}</aside>

      {/* ══ MOBILE screen 1 — folders (like the chat list pane) ══ */}
      <div className={cn("flex min-h-0 w-full flex-1 flex-col md:hidden", phoneList && "hidden")}>
        <div className="flex items-center gap-1 border-b border-border px-2 py-2">
          <MobileMenuDrawer />
          <span className="text-base font-semibold tracking-tight">Mail</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{panelContent}</div>
      </div>

      {/* ══ RIGHT / MOBILE screen 2 — header rows + list OR open conversation ══ */}
      <div className={cn("min-w-0 flex-1 flex-col", phoneList ? "flex" : "hidden", "md:flex")}>
        {selected ? (
          <ThreadView
            key={selected.threadKey + selected.folder}
            thread={selected}
            account={activeAccount!}
            onRefreshed={() => loadThreads(true)}
            onTrash={() => deleteThread(selected)}
            onBack={() => setSelected(null)}
            onForward={(fwd) => {
              setDraftSeed({ threadKey: "", to: "", cc: "", subject: fwd.subject, text: fwd.text });
              setComposeOpen(true);
            }}
          />
        ) : (
          <>
          {/* header row — MOBILE only (desktop lives in the left panel) */}
          <div className="flex items-center gap-2 border-b border-border px-2 py-2 md:hidden">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setPhoneList(false)} aria-label="Back to folders">
              <ArrowLeft className="size-5" />
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 focus-within:border-primary/50">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={`Search ${FOLDERS.find((x) => x.id === folder)?.label.toLowerCase() ?? "mail"}`}
                disabled={!activeAccount}
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              onClick={() => {
                setDraftSeed(null);
                setComposeOpen(true);
              }}
              disabled={!activeAccount}
              className="shrink-0 gap-2 rounded-xl text-sm font-semibold shadow-md"
            >
              <PenSquare className="size-4" /> <span className="hidden sm:inline">New email</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={sync} disabled={syncing || !activeAccount} title="Sync from Gmail">
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            </Button>
            {syncing && <span className="w-9 text-xs tabular-nums text-muted-foreground">{syncPct}%</span>}
            <Button variant="ghost" size="icon" onClick={() => setAccountsOpen(true)} title="Email configuration">
              <Settings className="size-4" />
            </Button>
          </div>

          {/* All / Unread / Read — shadcn Tabs */}
          <div className="border-b border-border px-2 py-1.5">
            <Tabs value={tab} onValueChange={(v) => switchTab(v as "all" | "unread" | "read")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unread">Unread</TabsTrigger>
                <TabsTrigger value="read">Read</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Gmail pager — top right: "1–50 of N emails" + chevrons */}
          {pageInfo.displayTotal > 0 && (
            <div className="flex items-center justify-end gap-0.5 border-b border-border px-2 py-0.5 text-xs text-muted-foreground">
              <span className="mr-1 tabular-nums">
                {Math.min((page - 1) * 50 + 1, pageInfo.displayTotal)}–{Math.min(page * 50, pageInfo.displayTotal)} of {pageInfo.displayTotal}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label="Newer"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setPage((p) => Math.min(pageInfo.totalPages, p + 1))}
                disabled={page >= pageInfo.totalPages}
                aria-label="Older"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}

          {/* sync progress (mobile — desktop shows it in the left panel) */}
          {syncing && (
            <div className="px-3 pb-1 pt-2 md:hidden">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${syncPct}%` }} />
              </div>
              <div className="mt-1 truncate text-[11px] text-muted-foreground">{syncLabel}</div>
            </div>
          )}

          {/* list */}
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
                {qDebounced
                  ? `No matches for “${qDebounced}”.`
                  : folder === "inbox"
                    ? "No emails yet — hit Sync to pull from Gmail."
                    : `Nothing in ${FOLDERS.find((x) => x.id === folder)?.label ?? folder}.`}
              </div>
            ) : (
              threads.map((t, tIdx) => {
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
                      "mail-card-in flex w-full cursor-pointer gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
                      t.unread && "bg-primary/[0.04]"
                    )}
                    style={{ animationDelay: `${Math.min(tIdx * 25, 500)}ms` }}
                  >
                    <span
                      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: colorFor(t.participants[0]?.address || t.subject) }}
                    >
                      {(names[0] || "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("truncate text-[13px]", t.unread ? "font-bold text-foreground" : "font-medium text-foreground/85")}>{names || "(unknown)"}</span>
                        {t.count > 1 && <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-bold text-muted-foreground">{t.count}</span>}
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

          </>
        )}
      </div>

      {/* mobile FAB */}
      <button
        onClick={() => {
          setDraftSeed(null);
          setComposeOpen(true);
        }}
        disabled={!activeAccount}
        aria-label="New email"
        className={cn("fixed bottom-5 right-5 z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95 md:hidden", selected && "hidden")}
      >
        <PenSquare className="size-6" />
      </button>

      {composeOpen && (
        <ComposeView
          accountId={activeAccount?.id ?? null}
          accountEmail={activeAccount?.emailAddress ?? null}
          accountName={activeAccount?.name ?? null}
          initial={draftSeed}
          onClose={() => {
            setComposeOpen(false);
            setDraftSeed(null);
          }}
          onSent={() => {
            if (draftSeed?.threadKey) {
              fetch("/api/email/messages", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountId: activeAccount?.id, threadKey: draftSeed.threadKey, folder: "drafts", mode: "purge" }),
              }).catch(() => undefined);
            }
            if (folderRef.current === "sent" || folderRef.current === "drafts") loadThreads(true);
          }}
        />
      )}
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
