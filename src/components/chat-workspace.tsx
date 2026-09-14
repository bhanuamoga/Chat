"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  FileText,
  ImagePlus,
  Info,
  Loader2,
  MessageSquarePlus,
  Mic,
  Music4,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  Sticker,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import type {
  ConversationWithMeta,
  MessageRow,
  MessageType,
  RealtimeEvent,
  UserRow,
} from "@/lib/types";
import { messageFileUrl } from "@/lib/types";
import { useRealtime } from "@/lib/realtime-client";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ConnectionStatus } from "@/components/connection-status";
import { MobileMenuDrawer } from "@/components/nav-rail";
import {
  AVATAR_COLORS,
  AVATAR_EMOJIS,
  CHAT_EMOJIS,
  cn,
  formatChatListTime,
  formatDivider,
  formatMessageTime,
  isOnline,
} from "@/lib/utils";
import { MAX_UPLOAD_BYTES, formatBytes, iconForFile } from "@/lib/file-utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChatTextarea } from "@/components/ui/chat-textarea";
import { ModeToggle, ThemeMenu } from "@/components/theme-toggle";
import { FileViewerModal, type FileViewerTarget } from "@/components/file-viewer-modal";
import { WhatsAppDocCard } from "@/components/whatsapp-doc-card";
import { MessageBubble } from "@/components/message-bubble";
import { ProfileDialog } from "@/components/profile-dialog";
import {
  ChatListSkeleton,
  ConnectionBadge,
  MessagesSkeleton,
  ReadTicks,
  UserAvatar,
  previewText,
  replyPreview,
} from "@/components/chat-bits";

/* --------------------------------- shell ---------------------------------- */

type PendingFile = {
  url: string;
  name: string;
  size: number;
  mime: string;
  kind: MessageType;
  storage: string;
};

export type ChatWorkspaceMode = "dm" | "group";

/**
 * ChatWorkspace — the shared conversation UI rendered by both the
 * "Chat" (`/chat`, mode="dm") and "Group Chat" (`/groups`, mode="group")
 * pages. Both pages have identical capabilities (messaging, editing,
 * reactions, files, voice notes, profile editing) — the only difference
 * is which conversation type is listed and which "new…" action is shown.
 *
 * Authentication is guaranteed by the parent route layout (see
 * `src/app/(app)/layout.tsx` + `src/proxy.ts`), so `me` is always a
 * resolved, signed-in user here — no session/auth branching needed.
 */
export default function ChatWorkspace({ mode, me: initialMe }: { mode: ChatWorkspaceMode; me: UserRow }) {
  // Local, optimistically-updatable copy of the signed-in profile (avatar,
  // name, bio edits reflect immediately without a full page reload).
  const [me, setMe] = useState<UserRow>(initialMe);
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showChatInfo, setShowChatInfo] = useState(false);

  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<MessageRow | null>(null);
  const [editing, setEditing] = useState<MessageRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MessageRow | null>(null);

  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [viewerFile, setViewerFile] = useState<FileViewerTarget | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadName, setUploadName] = useState("");

  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  const [typingMap, setTypingMap] = useState<Record<string, { userId: string; userName: string; ts: number }>>({});
  const [presenceMap, setPresenceMap] = useState<Record<string, string>>({});
  const [rtStatus, setRtStatus] = useState({ supabase: false, sse: false });
  const [sending, setSending] = useState(false);

  const meRef = useRef<UserRow | null>(null);
  meRef.current = me;
  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const shouldScrollNextRef = useRef(false);
  const lastActiveIdRef = useRef<string | null>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStreamRef = useRef<MediaStream | null>(null);

  const convIds = useMemo(() => conversations.map((c) => c.id), [conversations]);
  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId]
  );

  /* ------------------------------- fetching ------------------------------- */

  const fetchUsers = useCallback(async () => {
    try {
      const r = await fetch("/api/users");
      const j = await r.json();
      setAllUsers(j.users ?? []);
      return (j.users ?? []) as UserRow[];
    } catch {
      return [] as UserRow[];
    }
  }, []);

  const fetchConversations = useCallback(
    async (userId: string) => {
      setListLoading(true);
      try {
        const r = await fetch(`/api/conversations?userId=${userId}&type=${mode}`);
        const j = await r.json();
        if (j.conversations) setConversations(j.conversations);
      } catch {
        // keep previous list on transient failure
      } finally {
        setListLoading(false);
      }
    },
    [mode]
  );

  const fetchMessages = useCallback(async (convId: string, isBackground = false) => {
    if (!isBackground) {
      setMessagesLoading(true);
    }
    try {
      const r = await fetch(`/api/conversations/${convId}/messages?limit=120`);
      const j = await r.json();
      if (j.messages) {
        setMessages((prev) => {
          // If in background, preserve any optimistic messages that haven't saved yet
          if (isBackground) {
            const serverIds = new Set((j.messages as MessageRow[]).map((m) => m.id));
            const pendingOptimistic = prev.filter((m) => m.id.startsWith("tmp-") && !serverIds.has(m.id));
            return [...j.messages, ...pendingOptimistic];
          }
          return j.messages;
        });
      }
    } finally {
      if (!isBackground) {
        setMessagesLoading(false);
      }
    }
  }, []);

  const markRead = useCallback(async (convId: string, userId: string) => {
    try {
      await fetch(`/api/conversations/${convId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)));
    } catch {
      // ignore
    }
  }, []);

  /* --------------------------------- boot --------------------------------- */

  // `me` is resolved server-side by the route layout, so we can load
  // straight into this page's conversation list (filtered by `mode`).
  useEffect(() => {
    fetchConversations(me.id);
    fetchUsers();
    setActiveId(null);
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, mode]);

  useEffect(() => {
    if (!me) return;
    const beat = () => {
      fetch(`/api/users/${me.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heartbeat: true }),
      }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, 15000);
    const onFocus = () => beat();
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me]);

  useEffect(() => {
    if (!activeId || !me) return;
    setMessages([]);
    setReplyTo(null);
    setEditing(null);
    setPendingFile(null);
    // When switching to a new chat, we always want to start at the bottom
    shouldScrollNextRef.current = true;
    isAtBottomRef.current = true;
    lastActiveIdRef.current = activeId;
    fetchMessages(activeId);
    markRead(activeId, me.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Track user scroll position so we never force-scroll down when reading past messages
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 120; // within 120px from bottom counts as "at bottom"
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    isAtBottomRef.current = atBottom;
  }, []);

  // WhatsApp-style smart scroll:
  // ONLY auto-scroll down if:
  //  1. The user explicitly sent a message (shouldScrollNextRef was set true), OR
  //  2. The chat just opened/switched, OR
  //  3. The user was ALREADY at the bottom when a new incoming message arrived.
  // If the user scrolled UP to read history, DO NOT FORCE SCROLL!
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (shouldScrollNextRef.current || isAtBottomRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: shouldScrollNextRef.current ? "smooth" : "auto",
          });
        }
      });
      shouldScrollNextRef.current = false;
    }
  }, [messages, activeId]);

  useEffect(() => {
    const t = setInterval(() => {
      setTypingMap((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 4500) next[k] = v;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, []);

  /* ------------------------------ realtime ------------------------------- */

  const handleRealtime = useCallback((e: RealtimeEvent) => {
    const meId = meRef.current?.id;
    const active = activeRef.current;
    switch (e.type) {
      case "message:new": {
        const msg = e.message;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === e.conversationId
              ? {
                  ...c,
                  lastMessage: msg,
                  updatedAt: msg.createdAt,
                  unreadCount: e.conversationId === active || msg.senderId === meId ? 0 : c.unreadCount + 1,
                }
              : c
          )
        );
        if (e.conversationId === active) {
          setMessages((prev) => {
            // Check if there is an optimistic temporary message from this sender with matching content
            const optIndex = prev.findIndex(
              (m) =>
                m.id.startsWith("tmp-") &&
                m.senderId === msg.senderId &&
                (m.content === msg.content || (m.attachmentName && m.attachmentName === msg.attachmentName))
            );
            if (optIndex !== -1) {
              const updated = [...prev];
              updated[optIndex] = msg;
              return updated;
            }
            if (prev.some((m) => m.id === msg.id)) {
              return prev;
            }
            return [...prev, msg];
          });
          if (meId && msg.senderId !== meId) {
            fetch(`/api/conversations/${e.conversationId}/read`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: meId }),
            }).catch(() => {});
          }
        }
        break;
      }
      case "message:update": {
        setMessages((prev) => prev.map((m) => (m.id === e.message.id ? { ...m, ...e.message } : m)));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === e.conversationId && c.lastMessage?.id === e.message.id
              ? { ...c, lastMessage: { ...c.lastMessage, ...e.message } }
              : c
          )
        );
        break;
      }
      case "message:delete": {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === e.messageId
              ? { ...m, isDeleted: true, content: "This message was deleted", imageUrl: null, attachmentUrl: null }
              : m
          )
        );
        break;
      }
      case "message:reaction": {
        setMessages((prev) => prev.map((m) => (m.id === e.messageId ? { ...m, reactions: e.reactions } : m)));
        break;
      }
      case "typing": {
        if (e.userId === meId) break;
        if (e.isTyping) {
          setTypingMap((prev) => ({
            ...prev,
            [e.conversationId]: { userId: e.userId, userName: e.userName, ts: Date.now() },
          }));
        } else {
          setTypingMap((prev) => {
            if (!prev[e.conversationId]) return prev;
            const next = { ...prev };
            delete next[e.conversationId];
            return next;
          });
        }
        break;
      }
      case "presence": {
        setPresenceMap((prev) => ({ ...prev, [e.userId]: e.lastSeen }));
        setAllUsers((prev) => prev.map((u) => (u.id === e.userId ? { ...u, lastSeen: e.lastSeen } : u)));
        break;
      }
      case "conversation:new":
      case "conversation:update": {
        if (meId) {
          fetch(`/api/conversations?userId=${meId}&type=${mode}`)
            .then((r) => r.json())
            .then((j) => {
              if (j.conversations) setConversations(j.conversations);
            })
            .catch(() => {});
          const updatedConvId = "conversationId" in e ? e.conversationId : e.conversation.id;
          if (active && (!updatedConvId || updatedConvId === active)) {
            fetchMessages(active, true);
          }
        }
        break;
      }
      case "read": {
        if (e.userId === meId) break;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === e.conversationId
              ? {
                  ...c,
                  participants: c.participants.map((p) =>
                    p.userId === e.userId ? { ...p, lastReadAt: e.lastReadAt } : p
                   ),
                 }
               : c
           )
         );
         break;
       }
     }
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [mode]);

  useRealtime(me.id, activeId, convIds, handleRealtime, setRtStatus);

  /* ------------------------------- actions -------------------------------- */

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!me || !activeId) return;
      const now = Date.now();
      // Throttle typing signals while typing, but send immediately when stopped (isTyping === false)
      if (isTyping && now - lastTypingSent.current < 800) return;
      lastTypingSent.current = now;
      fetch(`/api/conversations/${activeId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: me.id, isTyping }),
      }).catch(() => {});
    },
    [me, activeId]
  );

  const handleInputChange = (v: string) => {
    setInput(v);
    sendTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    // Clear typing indicator 2.5 seconds after user stops typing
    typingTimeout.current = setTimeout(() => sendTyping(false), 2500);
  };

  const postMessage = useCallback(
    async (opts: { content: string; file?: PendingFile | null; replyToId?: string | null }): Promise<MessageRow | null> => {
      const meNow = meRef.current;
      const convId = activeRef.current;
      if (!meNow || !convId) return null;
      const r = await fetch(`/api/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: meNow.id,
          content: opts.content,
          messageType: opts.file ? opts.file.kind : "text",
          attachmentUrl: opts.file?.url ?? null,
          attachmentName: opts.file?.name ?? null,
          attachmentSize: opts.file?.size ?? null,
          attachmentMime: opts.file?.mime ?? null,
          replyToId: opts.replyToId ?? null,
        }),
      });
      const j = await r.json();
      return (j.message as MessageRow) ?? null;
    },
    []
  );

  const sendMessage = useCallback(async () => {
    if (!me || !activeId || sending || uploading) return;
    const text = input.trim();
    const file = pendingFile;

    if (editing) {
      if (!text) return;
      setSending(true);
      try {
        await fetch(`/api/messages/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, senderId: me.id }),
        });
        setEditing(null);
        setInput("");
      } finally {
        setSending(false);
      }
      return;
    }

    if (!text && !file) return;
    setSending(true);
    // User explicitly sent a message -> scroll down!
    shouldScrollNextRef.current = true;
    isAtBottomRef.current = true;
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: MessageRow = {
      id: optimisticId,
      conversationId: activeId,
      senderId: me.id,
      content: text,
      messageType: file ? file.kind : "text",
      imageUrl: null,
      attachmentUrl: file?.url ?? null,
      attachmentName: file?.name ?? null,
      attachmentSize: file?.size ?? null,
      attachmentMime: file?.mime ?? null,
      replyToId: replyTo?.id ?? null,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: me,
      replyTo: replyTo,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setReplyTo(null);
    setPendingFile(null);
    sendTyping(false);

    try {
      const real = await postMessage({ content: text, file, replyToId: optimistic.replyToId });
      if (real) setMessages((prev) => prev.map((m) => (m.id === optimisticId ? real : m)));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }, [me, activeId, input, pendingFile, replyTo, editing, sending, uploading, sendTyping, postMessage]);

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!me) return;
    await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction: emoji, userId: me.id }),
    }).catch(() => {});
  };

  const confirmDelete = async () => {
    if (!me || !pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await fetch(`/api/messages/${id}?senderId=${me.id}`, { method: "DELETE" }).catch(() => {});
  };

  const uploadOne = useCallback(
    (file: File, convId: string): Promise<PendingFile> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const form = new FormData();
        form.append("file", file);
        form.append("conversationId", convId);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          try {
            const j = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && j.url) {
              resolve({ url: j.url, name: j.name, size: j.size, mime: j.mime, kind: j.kind as MessageType, storage: j.storage });
            } else reject(new Error(j.error || "Upload failed"));
          } catch {
            reject(new Error("Upload failed"));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("POST", "/api/uploads");
        xhr.send(form);
      }),
    []
  );

  const handlePickedFiles = useCallback(
    async (list: FileList | null) => {
      if (!list || list.length === 0 || !activeId || !me) return;
      const files = Array.from(list);
      for (const f of files) {
        if (f.size > MAX_UPLOAD_BYTES) {
          alert(`"${f.name}" is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB`);
          return;
        }
      }
      setShowAttachMenu(false);
      if (files.length === 1) {
        const f = files[0];
        setUploading(true);
        setUploadProgress(0);
        setUploadName(f.name);
        try {
          const up = await uploadOne(f, activeId);
          setPendingFile(up);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Upload failed");
        } finally {
          setUploading(false);
          setUploadProgress(0);
          setUploadName("");
        }
        return;
      }
      setUploading(true);
      shouldScrollNextRef.current = true;
      isAtBottomRef.current = true;
      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          setUploadName(`${f.name} (${i + 1}/${files.length})`);
          setUploadProgress(0);
          const up = await uploadOne(f, activeId);
          const caption = i === 0 ? input.trim() : "";
          const optimisticId = `tmp-${Date.now()}-${i}`;
          const optimistic: MessageRow = {
            id: optimisticId,
            conversationId: activeId,
            senderId: me.id,
            content: caption,
            messageType: up.kind,
            imageUrl: null,
            attachmentUrl: up.url,
            attachmentName: up.name,
            attachmentSize: up.size,
            attachmentMime: up.mime,
            replyToId: null,
            isEdited: false,
            isDeleted: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sender: me,
          };
          setMessages((prev) => [...prev, optimistic]);
          try {
            const real = await postMessage({ content: caption, file: up });
            if (real) setMessages((prev) => prev.map((m) => (m.id === optimisticId ? real : m)));
          } catch {
            setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          }
        }
        setInput("");
      } catch (e) {
        alert(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadName("");
      }
    },
    [activeId, me, input, uploadOne, postMessage]
  );

  const startRecording = useCallback(async () => {
    if (!activeId || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStreamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
      sendTyping(true);
    } catch {
      alert("Microphone access is required for voice messages");
    }
  }, [activeId, recording, sendTyping]);

  const stopRecording = useCallback(
    async (cancel: boolean) => {
      const rec = recorderRef.current;
      if (recTimerRef.current) {
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
      }
      setRecording(false);
      sendTyping(false);
      if (!rec) return;
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        try {
          rec.stop();
        } catch {
          resolve();
        }
      });
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
      if (cancel || chunksRef.current.length === 0) {
        chunksRef.current = [];
        return;
      }
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      chunksRef.current = [];
      if (!activeId || !me) return;
      const file = new File([blob], `voice-note-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}.webm`, {
        type: blob.type || "audio/webm",
      });
      setUploading(true);
      setUploadName("Voice message");
      setUploadProgress(50);
      try {
        shouldScrollNextRef.current = true;
        isAtBottomRef.current = true;
        const up = await uploadOne(file, activeId);
        const optimisticId = `tmp-voice-${Date.now()}`;
        const optimistic: MessageRow = {
          id: optimisticId,
          conversationId: activeId,
          senderId: me.id,
          content: "",
          messageType: "audio",
          imageUrl: null,
          attachmentUrl: up.url,
          attachmentName: up.name,
          attachmentSize: up.size,
          attachmentMime: up.mime,
          replyToId: null,
          isEdited: false,
          isDeleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sender: me,
        };
        setMessages((prev) => [...prev, optimistic]);
        const real = await postMessage({ content: "", file: { ...up, kind: "audio" } });
        if (real) setMessages((prev) => prev.map((m) => (m.id === optimisticId ? real : m)));
      } catch {
        alert("Voice message upload failed");
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadName("");
      }
    },
    [activeId, me, uploadOne, postMessage, sendTyping]
  );

  useEffect(
    () => () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      recStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    []
  );

  const createDM = async (otherId: string) => {
    const r = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: me.id, type: "dm", otherUserId: otherId }),
    });
    const j = await r.json();
    if (j.conversation) {
      await fetchConversations(me.id);
      setActiveId(j.conversation.id);
      setShowNewChat(false);
    }
  };

  /* -------------------------------- derived ------------------------------- */

  const filteredConvs = useMemo(() => {
    let list = conversations;
    if (filter === "unread") list = list.filter((c) => c.unreadCount > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.displayName.toLowerCase().includes(q) ||
          c.lastMessage?.content.toLowerCase().includes(q) ||
          (c.lastMessage?.attachmentName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [conversations, filter, search]);

  const groupedMessages = useMemo(() => {
    const groups: { divider: string; items: MessageRow[] }[] = [];
    let lastDay = "";
    for (const m of messages) {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        groups.push({ divider: formatDivider(m.createdAt), items: [] });
        lastDay = day;
      }
      groups[groups.length - 1].items.push(m);
    }
    return groups;
  }, [messages]);

  const tickFor = useCallback(
    (m: MessageRow): "sent" | "delivered" | "read" | null => {
      if (!me || m.senderId !== me.id || !activeConv) return null;
      const others = activeConv.participants.filter((p) => p.userId !== me.id);
      if (others.length === 0) return "sent";
      const mt = new Date(m.createdAt).getTime();
      // 1. If recipient read the message -> Double Blue Ticks ('read')
      const allRead = others.every((p) => new Date(p.lastReadAt).getTime() >= mt);
      if (allRead) return "read";

      // 2. If recipient is currently online (or was online after message was sent) -> Double Gray Ticks ('delivered')
      const anyDelivered = others.some((p) => {
        const lastSeen = p.user?.id ? (presenceMap[p.user.id] ?? p.user.lastSeen) : null;
        if (!lastSeen) return false;
        return isOnline(lastSeen) || new Date(lastSeen).getTime() >= mt;
      });
      if (anyDelivered) return "delivered";

      // 3. Recipient is offline and has not seen the message yet -> Single Gray Tick ('sent')
      return "sent";
    },
    [me, activeConv, presenceMap]
  );

  const activeTyping = activeId ? typingMap[activeId] : undefined;
  const pageTitle = mode === "dm" ? "Chats" : "Group Chats";
  const searchPlaceholder = mode === "dm" ? "Search or start a new chat" : "Search groups";

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="flex h-dvh min-w-0 flex-1 overflow-hidden bg-background text-foreground">
      {/* ------------------------------- sidebar ------------------------------ */}
      <aside
        className={cn(
          "flex w-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-[340px] lg:w-[380px] xl:w-[400px]",
          activeId ? "hidden md:flex" : "flex"
        )}
        aria-label={pageTitle}
      >
        <div className="flex items-center justify-between gap-2 border-b border-sidebar-border p-3">
          <div className="flex items-center gap-1.5">
            <MobileMenuDrawer user={me} onOpenProfile={() => setShowProfile(true)} />
            {/* Desktop profile button — hidden on mobile since user profile is already in the drawer */}
            <Button variant="ghost" className="hidden md:flex h-auto gap-2.5 px-2 py-1.5" onClick={() => setShowProfile(true)} aria-label="Open profile">
              <span className="relative">
                <UserAvatar emoji={me.avatarEmoji} color={me.avatarColor} avatarUrl={me.avatarUrl} name={me.displayName} size={36} />
                <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-sidebar bg-success" aria-label="You are online" />
              </span>
              <span className="max-w-28 truncate text-sm font-semibold">{me.displayName}</span>
            </Button>
          </div>
          <div className="flex items-center gap-0.5">
            <div className="mr-1 hidden sm:block">
              <ConnectionBadge supabase={rtStatus.supabase} sse={rtStatus.sse} />
            </div>
            <ModeToggle compact />
            <ThemeMenu />
            {mode === "dm" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowNewChat(true)} aria-label="New chat">
                    <MessageSquarePlus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New chat</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowNewGroup(true)} aria-label="New group">
                    <Users className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New group</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="space-y-2 p-3 pb-1">
          <h1 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{pageTitle}</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9"
              aria-label="Search conversations"
            />
            {search && (
              <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" onClick={() => setSearch("")} aria-label="Clear search">
                <X className="size-4" />
              </Button>
            )}
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)} aria-label="Filter conversations">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="unread">Unread</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="mt-1 flex-1">
          {listLoading && conversations.length === 0 ? (
            <ChatListSkeleton />
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-8 py-16 text-center">
              <Avatar className="size-14">
                <AvatarFallback className="text-2xl">💭</AvatarFallback>
              </Avatar>
              <p className="text-sm text-muted-foreground">
                {search ? "No chats match your search." : "No chats yet — start a new conversation!"}
              </p>
              <Button onClick={() => setShowNewChat(true)}>
                <Plus className="size-4" /> Start chatting
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col p-2 pt-1">
              {filteredConvs.map((c) => {
                const typing = typingMap[c.id];
                const lastSeenRef = c.otherUser ? (presenceMap[c.otherUser.id] ?? c.otherUser.lastSeen) : null;
                const online = isOnline(lastSeenRef);
                const isActive = c.id === activeId;
                return (
                  <li key={c.id}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      className="h-auto w-full justify-start gap-3 rounded-xl px-3 py-2.5"
                      onClick={() => setActiveId(c.id)}
                      aria-label={`Open ${c.displayName}`}
                    >
                      <span className="relative shrink-0">
                        <UserAvatar emoji={c.displayAvatarEmoji} color={c.displayAvatarColor} avatarUrl={c.displayAvatarUrl} name={c.displayName} size={48} />
                        {c.type === "dm" && online && (
                          <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-sidebar bg-success" />
                        )}
                        {c.type === "group" && (
                          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-sidebar bg-muted text-[10px]">
                            <Users className="size-3" />
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-[15px] font-medium">{c.displayName}</span>
                          <span className={cn("shrink-0 text-[11px]", c.unreadCount > 0 ? "font-semibold text-success" : "text-muted-foreground")}>
                            {typing ? "" : formatChatListTime(c.lastMessage?.createdAt ?? c.updatedAt)}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("flex min-w-0 items-center gap-1 truncate text-[13px]", typing ? "font-medium text-success" : "text-muted-foreground")}>
                            {typing ? (
                              <span className="flex items-center gap-1 text-success font-medium">
                                <span>{`${typing.userName.split(" ")[0]} is typing…`}</span>
                              </span>
                            ) : c.lastMessage ? (
                              <>
                                {c.lastMessage.senderId === me.id && c.lastMessage.messageType !== "system" && (
                                  <span className="shrink-0">
                                    <ReadTicks
                                      state={(() => {
                                        const others = c.participants.filter((p) => p.userId !== me.id);
                                        if (others.length === 0) return "sent";
                                        const mt = new Date(c.lastMessage!.createdAt).getTime();
                                        return others.every((p) => new Date(p.lastReadAt).getTime() >= mt) ? "read" : "delivered";
                                      })()}
                                    />
                                  </span>
                                )}
                                <span className="truncate">
                                  {previewText(c.lastMessage, c.type === "group" && c.lastMessage.senderId !== me.id ? (c.lastMessage.sender?.displayName?.split(" ")[0] ?? null) : null)}
                                </span>
                              </>
                            ) : (
                              "No messages yet"
                            )}
                          </span>
                          {c.unreadCount > 0 && !typing && (
                            <Badge className="shrink-0">{c.unreadCount > 99 ? "99+" : c.unreadCount}</Badge>
                          )}
                        </span>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

      </aside>

      {/* -------------------------------- chat -------------------------------- */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-background" aria-label="Chat">
        {!activeConv ? (
          <WelcomePane
            mode={mode}
            onNewChat={() => (mode === "dm" ? setShowNewChat(true) : setShowNewGroup(true))}
            supabase={rtStatus.supabase}
            sse={rtStatus.sse}
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border bg-card p-2 sm:gap-3 sm:p-3">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId(null)} aria-label="Back to chats">
                <ArrowLeft className="size-5" />
              </Button>
              <Button variant="ghost" className="h-auto min-w-0 flex-1 justify-start gap-3 px-2" onClick={() => setShowChatInfo(true)} aria-label="Open chat info">
                <UserAvatar emoji={activeConv.displayAvatarEmoji} color={activeConv.displayAvatarColor} avatarUrl={activeConv.displayAvatarUrl} name={activeConv.displayName} size={40} />
                <span className="flex min-w-0 flex-col items-start">
                  <span className="w-full truncate text-left text-[15px] font-semibold sm:text-base">{activeConv.displayName}</span>
                  <span className="w-full truncate text-left text-xs text-muted-foreground">
                    {activeTyping ? (
                      <span className="text-success font-medium animate-pulse">
                        {activeTyping.userName} is typing…
                      </span>
                    ) : activeConv.type === "dm" && activeConv.otherUser ? (
                      isOnline(presenceMap[activeConv.otherUser.id] ?? activeConv.otherUser.lastSeen) ? (
                        <span className="text-success font-medium">online</span>
                      ) : (
                        `last seen ${formatChatListTime(presenceMap[activeConv.otherUser.id] ?? activeConv.otherUser.lastSeen)}`
                      )
                    ) : (
                      activeConv.participants.map((p) => p.user?.displayName?.split(" ")[0]).filter(Boolean).join(", ")
                    )}
                  </span>
                </span>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => setShowChatInfo(true)} aria-label="Chat info">
                    <Info className="size-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Chat info</TooltipContent>
              </Tooltip>
            </div>

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="chat-surface nice-scroll flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 sm:px-6 lg:px-12 xl:px-20 max-w-full"
              role="log"
              aria-label="Messages"
              aria-live="polite"
            >
              {messagesLoading ? (
                <MessagesSkeleton />
              ) : (
                <div className="flex flex-col">
                  {groupedMessages.map((g) => (
                    <div key={g.divider} className="contents">
                      <div className="mx-auto my-3">
                        <Badge variant="secondary" className="shadow-xs font-normal text-[11px] px-3 py-0.5 rounded-md bg-card/80 border border-border/40 text-muted-foreground">{g.divider}</Badge>
                      </div>
                      {g.items.map((m, idx) => {
                        const prevMsg = idx > 0 ? g.items[idx - 1] : null;
                        const isConsecutive = prevMsg && prevMsg.senderId === m.senderId && prevMsg.messageType !== "system";
                        return (
                          <MessageBubble
                            key={m.id}
                            msg={m}
                            own={m.senderId === me.id}
                            isConsecutive={Boolean(isConsecutive)}
                            showSender={activeConv.type === "group" && !isConsecutive}
                            tick={tickFor(m)}
                            onReply={() => {
                              setReplyTo(m);
                              setEditing(null);
                            }}
                            onEdit={() => {
                              setEditing(m);
                              setInput(m.content);
                              setReplyTo(null);
                            }}
                            onDelete={() => setPendingDelete(m)}
                            onReact={(emoji) => toggleReaction(m.id, emoji)}
                            onViewFile={(target) => setViewerFile(target)}
                            meId={me.id}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {activeTyping && (
                    <div className="animate-chat-in mt-1.5 flex w-fit items-center gap-2 rounded-2xl rounded-tl-xs bg-bubble-in border border-border/30 px-3.5 py-2.5 shadow-xs" aria-label={`${activeTyping.userName} is typing`}>
                      <span className="text-xs text-muted-foreground font-medium italic">
                        {activeTyping.userName} is typing
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="typing-dot size-1.5 rounded-full bg-success" />
                        <span className="typing-dot size-1.5 rounded-full bg-success" />
                        <span className="typing-dot size-1.5 rounded-full bg-success" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {uploading && (
              <Card className="m-2 mb-0 gap-2 rounded-xl py-3 sm:m-3 sm:mb-0">
                <CardContent className="flex items-center gap-2 px-4 py-0 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="max-w-[60%] truncate">{uploadName || "Uploading…"}</span>
                  <span className="ml-auto tabular-nums">{uploadProgress}%</span>
                </CardContent>
                <CardContent className="px-4 py-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </CardContent>
              </Card>
            )}

            {(replyTo || editing || pendingFile) && !uploading && (
              <div className="border-t border-border/80 bg-card/95 backdrop-blur-sm px-3 py-2 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {pendingFile && (
                  <FilePreviewCard
                    file={pendingFile}
                    onRemove={() => setPendingFile(null)}
                    onOpenViewer={() =>
                      setViewerFile({
                        url: pendingFile.url,
                        name: pendingFile.name,
                        size: pendingFile.size,
                        mime: pendingFile.mime,
                        kind: pendingFile.kind,
                      })
                    }
                  />
                )}
                {replyTo && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/80 p-2 border-l-4 border-primary">
                    <div className="min-w-0 pl-1">
                      <div className="text-xs font-semibold text-primary">{replyTo.sender?.displayName ?? "Message"}</div>
                      <div className="truncate text-[13px] text-muted-foreground">{replyPreview(replyTo)}</div>
                    </div>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-full" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
                {editing && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/80 p-2 border-l-4 border-amber-500">
                    <div className="text-[13px] pl-1 font-medium text-amber-500">Editing message…</div>
                    <Button variant="ghost" size="icon" className="size-7 shrink-0 rounded-full" onClick={() => { setEditing(null); setInput(""); }} aria-label="Cancel edit">
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="p-2 sm:p-2.5 bg-transparent">
              {recording ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => stopRecording(true)} aria-label="Cancel recording" className="text-destructive hover:text-destructive">
                    <Trash2 className="size-5" />
                  </Button>
                  <div className="flex flex-1 items-center gap-3 rounded-full bg-card border border-border px-4 py-2.5 shadow-sm">
                    <span className="size-2.5 animate-pulse rounded-full bg-destructive" />
                    <span className="text-sm tabular-nums">
                      {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
                    </span>
                    <div className="hidden flex-1 items-center gap-1 px-2 sm:flex" aria-hidden>
                      {[0.4, 0.8, 0.5, 1, 0.6, 0.9, 0.45, 0.75, 1, 0.55, 0.85, 0.5, 0.7, 0.95, 0.6].map((h, i) => (
                        <span key={i} className="w-1 animate-pulse rounded-full bg-primary" style={{ height: `${8 + h * 16}px`, animationDelay: `${i * 80}ms` }} />
                      ))}
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground sm:ml-0">Recording…</span>
                  </div>
                  <Button size="icon" className="size-12 shrink-0 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-md" onClick={() => stopRecording(false)} aria-label="Send voice message">
                    <Send className="size-5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* WhatsApp-style Pill Input Bar */}
                  <div className="flex flex-1 items-center min-h-[50px] rounded-[28px] bg-card border border-border/70 px-3 py-1 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                    <EmojiPopover onPick={(e) => handleInputChange(input + e)} />

                    <input
                      ref={docRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handlePickedFiles(e.target.files);
                        e.target.value = "";
                      }}
                      aria-label="Choose documents"
                    />
                    <input
                      ref={mediaRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handlePickedFiles(e.target.files);
                        e.target.value = "";
                      }}
                      aria-label="Choose photos or videos"
                    />
                    <input
                      ref={audioRef}
                      type="file"
                      accept="audio/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handlePickedFiles(e.target.files);
                        e.target.value = "";
                      }}
                      aria-label="Choose audio files"
                    />

                    <div className="mx-2 flex-1 flex items-center py-1">
                      <ChatTextarea
                        value={input}
                        onChange={(e) => handleInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        placeholder={pendingFile ? "Add a caption…" : "Message"}
                        aria-label="Message input"
                      />
                    </div>

                    {/* Attachment paperclip button inside pill */}
                    <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                          aria-label="Attach file"
                        >
                          <Paperclip className="size-5 -rotate-45" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="top" align="end" className="w-64 p-1.5 shadow-lg">
                        <AttachRow
                          icon={<FileText className="size-5" />}
                          label="Document"
                          hint="pdf, zip, doc, txt…"
                          onClick={() => {
                            setShowAttachMenu(false);
                            docRef.current?.click();
                          }}
                        />
                        <AttachRow
                          icon={<ImagePlus className="size-5" />}
                          label="Photos & videos"
                          hint="jpg, png, mp4…"
                          onClick={() => {
                            setShowAttachMenu(false);
                            mediaRef.current?.click();
                          }}
                        />
                        <AttachRow
                          icon={<Music4 className="size-5" />}
                          label="Audio"
                          hint="mp3, wav, ogg…"
                          onClick={() => {
                            setShowAttachMenu(false);
                            audioRef.current?.click();
                          }}
                        />
                        <p className="px-3 pb-1 pt-2 text-[11px] text-muted-foreground">
                          Up to {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB per file • multi-select supported
                        </p>
                      </PopoverContent>
                    </Popover>

                    {/* Camera icon inside pill - hidden while typing on mobile for WhatsApp look */}
                    {!input.trim() && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full text-muted-foreground hover:text-foreground shrink-0"
                        onClick={() => mediaRef.current?.click()}
                        aria-label="Take or pick photo/video"
                      >
                        <Camera className="size-5" />
                      </Button>
                    )}
                  </div>

                  {/* Circular Send (dark/black like WhatsApp) or Mic Button */}
                  {input.trim() || pendingFile ? (
                    <Button
                      size="icon"
                      className="size-12 shrink-0 rounded-full bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-md transition-all active:scale-95"
                      onClick={sendMessage}
                      disabled={sending || uploading}
                      aria-label="Send message"
                    >
                      {sending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5 fill-current" />}
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      className="size-12 shrink-0 rounded-full bg-slate-900 hover:bg-black text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 shadow-md transition-all active:scale-95"
                      onClick={startRecording}
                      aria-label="Record voice message"
                    >
                      <Mic className="size-5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <Sheet open={showChatInfo && !!activeConv} onOpenChange={(o) => !o && setShowChatInfo(false)}>
          <SheetContent side="right" className="w-full sm:w-[380px] sm:max-w-md gap-0 p-0 flex flex-col h-full bg-card">
            {activeConv && (
              <>
                <SheetHeader className="border-b border-border px-5 py-4 text-left shrink-0 bg-card">
                  <SheetTitle className="text-base font-semibold">Chat info</SheetTitle>
                  <SheetDescription className="text-xs">
                    {activeConv.type === "group" ? `Group • ${activeConv.participants.length} members` : "Direct message"}
                  </SheetDescription>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto nice-scroll min-h-0">
                  <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
                    <UserAvatar emoji={activeConv.displayAvatarEmoji} color={activeConv.displayAvatarColor} avatarUrl={activeConv.displayAvatarUrl} name={activeConv.displayName} size={88} />
                    <div className="mt-1 text-lg font-semibold text-foreground">{activeConv.displayName}</div>
                    <div className="text-xs text-muted-foreground max-w-xs">
                      {activeConv.type === "group" ? (activeConv.description || "No description") : (activeConv.otherUser?.bio || "")}
                    </div>
                    {activeConv.type === "dm" && activeConv.otherUser && (
                      <div className="text-xs text-muted-foreground">{activeConv.otherUser.email ?? activeConv.otherUser.phone ?? "No contact info"}</div>
                    )}
                  </div>
                  <Separator />
                  {activeConv.type === "group" && (
                    <>
                      <div className="px-5 py-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Members ({activeConv.participants.length})
                        </div>
                        <ul className="flex flex-col divide-y divide-border/40">
                          {activeConv.participants.map((p) => (
                            <li key={p.userId} className="flex items-center gap-3 py-2.5">
                              <UserAvatar emoji={p.user?.avatarEmoji ?? "😀"} color={p.user?.avatarColor ?? AVATAR_COLORS[0]} avatarUrl={p.user?.avatarUrl} name={p.user?.displayName ?? "?"} size={38} />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {p.user?.displayName}
                                  {p.userId === me.id && <span className="text-muted-foreground text-xs font-normal"> (you)</span>}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">{p.user?.bio}</div>
                              </div>
                              {p.isAdmin && <Badge variant="outline" className="text-[10px] py-0">admin</Badge>}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Separator />
                    </>
                  )}
                  <SharedMedia messages={messages} onViewFile={(target) => setViewerFile(target)} />
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      </main>

      <NewChatDialog open={showNewChat} onOpenChange={setShowNewChat} users={allUsers.filter((u) => u.id !== me.id)} onPick={createDM} presenceMap={presenceMap} />
      <NewGroupDialog
        open={showNewGroup}
        onOpenChange={setShowNewGroup}
        users={allUsers.filter((u) => u.id !== me.id)}
        me={me}
        onCreated={async (id) => {
          await fetchConversations(me.id);
          setActiveId(id);
          setShowNewGroup(false);
        }}
      />
      <ProfileDialog
        open={showProfile}
        onOpenChange={setShowProfile}
        me={me}
        onSaved={(u) => {
          setMe(u);
          fetchUsers();
          fetchConversations(u.id);
        }}
      />
      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message?</DialogTitle>
            <DialogDescription>This will delete the message for everyone in this chat. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>
              <Trash2 className="size-4" /> Delete for everyone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Universal File Viewer Modal */}
      <FileViewerModal
        file={viewerFile}
        onClose={() => setViewerFile(null)}
      />
    </div>
  );
}

/* ------------------------------ file preview ------------------------------ */

function FilePreviewCard({
  file,
  onRemove,
  onOpenViewer,
}: {
  file: PendingFile;
  onRemove: () => void;
  onOpenViewer?: () => void;
}) {
  return (
    <div className="relative inline-flex items-center gap-3 rounded-2xl border border-border/80 bg-card p-2 pr-10 shadow-md max-w-full group">
      {/* Thumbnail or Icon */}
      <button
        type="button"
        onClick={onOpenViewer}
        className="relative size-16 shrink-0 rounded-xl overflow-hidden bg-muted/70 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity focus:outline-none"
        title="Click to view full screen"
      >
        {file.kind === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={file.name} className="size-full object-cover" />
        )}
        {file.kind === "video" && (
          <div className="relative size-full flex items-center justify-center bg-black">
            <Video className="size-6 text-white" />
          </div>
        )}
        {file.kind === "audio" && (
          <Music4 className="size-7 text-primary" />
        )}
        {file.kind === "document" && (
          <span className="text-3xl select-none">{iconForFile(file.mime, file.name)}</span>
        )}
      </button>

      {/* Info & View hint */}
      <div className="min-w-0 flex-1 pr-2">
        <button
          type="button"
          onClick={onOpenViewer}
          className="text-left w-full hover:underline focus:outline-none block"
          title="Click to view"
        >
          <p className="truncate text-sm font-semibold text-foreground leading-tight">{file.name}</p>
        </button>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatBytes(file.size)} • <span className="text-primary font-medium cursor-pointer" onClick={onOpenViewer}>Tap to preview</span>
        </p>
      </div>

      {/* Remove Button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={onRemove}
        aria-label="Remove attachment"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function AttachRow({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint: string; onClick: () => void }) {
  return (
    <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-2.5" onClick={onClick}>
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">{icon}</span>
      <span className="flex flex-col items-start">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      </span>
    </Button>
  );
}

function EmojiPopover({ onPick }: { onPick: (e: string) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
          aria-label="Emoji picker"
        >
          <Smile className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="grid max-h-64 w-80 grid-cols-8 gap-1 overflow-y-auto p-2.5 shadow-xl bg-card border border-border rounded-xl">
        {CHAT_EMOJIS.map((e) => (
          <Button
            key={e}
            variant="ghost"
            size="icon"
            className="size-8 text-xl hover:bg-muted/60 transition-transform active:scale-125"
            onClick={() => onPick(e)}
            aria-label={`Insert ${e}`}
          >
            {e}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------- shared media ------------------------------ */

function SharedMedia({
  messages,
  onViewFile,
}: {
  messages: MessageRow[];
  onViewFile: (file: FileViewerTarget) => void;
}) {
  const files = messages.filter((m) => !m.isDeleted && messageFileUrl(m) && m.messageType !== "text");
  if (files.length === 0) return null;
  return (
    <div className="px-5 py-4">
      <div className="mb-2 text-sm text-muted-foreground">Shared files ({files.length})</div>
      <div className="grid grid-cols-3 gap-1.5">
        {files.slice(-9).map((m) => {
          const url = messageFileUrl(m)!;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() =>
                onViewFile({
                  url,
                  name: m.attachmentName || m.messageType,
                  size: m.attachmentSize,
                  mime: m.attachmentMime,
                  kind: m.messageType,
                })
              }
              className="h-20 overflow-hidden rounded-lg bg-muted flex flex-col items-center justify-center p-1 text-center hover:opacity-85 transition-opacity cursor-pointer group"
            >
              {m.messageType === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="size-full object-cover" loading="lazy" />
              ) : m.messageType === "video" ? (
                <>
                  <Video className="size-6 text-muted-foreground group-hover:text-foreground" />
                  <span className="w-full truncate text-[10px] text-muted-foreground mt-1">{m.attachmentName || "Video"}</span>
                </>
              ) : (
                <>
                  <FileText className="size-6 text-muted-foreground group-hover:text-foreground" />
                  <span className="w-full truncate text-[10px] text-muted-foreground mt-1">{m.attachmentName || m.messageType}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- welcome --------------------------------- */

function WelcomePane({
  mode,
  onNewChat,
  supabase,
  sse,
}: {
  mode: ChatWorkspaceMode;
  onNewChat: () => void;
  supabase: boolean;
  sse: boolean;
}) {
  const Icon = mode === "dm" ? MessageSquarePlus : Users;
  return (
    <div className="chat-surface flex h-full flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-10 text-center lg:px-10">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="size-8" />
      </span>

      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {mode === "dm" ? "Select a chat" : "Select a group"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {mode === "dm"
            ? "Choose an existing conversation from the sidebar, or start a new one."
            : "Choose an existing group from the sidebar, or create a new one."}{" "}
          Messages, files, typing activity and read receipts sync in realtime.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={onNewChat}>
          <Icon className="size-4" /> {mode === "dm" ? "New chat" : "New group"}
        </Button>
        <div className="flex items-center gap-1">
          <ModeToggle />
          <ThemeMenu />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Badge variant="secondary">Files & voice notes</Badge>
        <Badge variant="secondary">Presence</Badge>
        <Badge variant="secondary">Realtime sync</Badge>
      </div>
    </div>
  );
}

/* --------------------------------- dialogs --------------------------------- */

function NewChatDialog({
  open,
  onOpenChange,
  users,
  onPick,
  presenceMap,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: UserRow[];
  onPick: (id: string) => void;
  presenceMap: Record<string, string>;
}) {
  const [q, setQ] = useState("");
  const list = users.filter((u) => u.displayName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>Start a direct conversation with any contact.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts" className="pl-9" aria-label="Search contacts" />
        </div>
        <ScrollArea className="max-h-72">
          <ul className="flex flex-col gap-0.5">
            {list.map((u) => {
              const online = isOnline(presenceMap[u.id] ?? u.lastSeen);
              return (
                <li key={u.id}>
                  <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2" onClick={() => onPick(u.id)}>
                    <span className="relative">
                      <UserAvatar emoji={u.avatarEmoji} color={u.avatarColor} name={u.displayName} size={44} />
                      {online && <span className="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-card bg-success" />}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium">{u.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{online ? <span className="text-success">online</span> : u.bio}</span>
                    </span>
                  </Button>
                </li>
              );
            })}
            {list.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {users.length === 0
                  ? "No accounts yet. Share this workspace so your team can sign up."
                  : "No contacts match your search."}
              </p>
            )}
          </ul>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({
  open,
  onOpenChange,
  users,
  me,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  users: UserRow[];
  me: UserRow;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("👥");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const create = async () => {
    if (!name.trim() || selected.length === 0) return;
    setCreating(true);
    try {
      const r = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: me.id, type: "group", name: name.trim(), avatarEmoji: emoji, memberIds: selected }),
      });
      const j = await r.json();
      if (j.conversation) {
        onCreated(j.conversation.id);
        setName("");
        setSelected([]);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Create a group and add members to start chatting together.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Avatar className="size-14">
            <AvatarFallback className="bg-muted text-3xl">{emoji}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Squad" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group icon">
          {["👥", "🌴", "💻", "⚽", "🎮", "🍕", "📚", "🎉", "🚀", "🏠"].map((e) => (
            <Button key={e} variant={emoji === e ? "secondary" : "ghost"} size="icon" onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}>
              {e}
            </Button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">Add members ({selected.length} selected)</div>
        <ScrollArea className="max-h-48">
          <ul className="flex flex-col">
            {users.map((u) => (
              <li key={u.id}>
                <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2" onClick={() => toggle(u.id)} aria-pressed={selected.includes(u.id)}>
                  <UserAvatar emoji={u.avatarEmoji} color={u.avatarColor} name={u.displayName} size={38} />
                  <span className="flex-1 truncate text-left text-sm">{u.displayName}</span>
                  <span className={cn("flex size-5 items-center justify-center rounded-full border", selected.includes(u.id) ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {selected.includes(u.id) ? <Check className="size-3.5" /> : null}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button onClick={create} disabled={!name.trim() || selected.length === 0 || creating} className="w-full">
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
            {creating ? "Creating…" : `Create group (${selected.length + 1} members)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
