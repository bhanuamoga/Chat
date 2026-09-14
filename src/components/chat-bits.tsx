"use client";

import { Check, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, initials } from "@/lib/utils";
import type { MessageRow } from "@/lib/types";
import { messageFileUrl } from "@/lib/types";

/**
 * Themed user avatar — supports user uploaded profile photos (avatarUrl)
 * with graceful fallback to custom emoji + color background.
 */
export function UserAvatar({
  emoji,
  color,
  avatarUrl,
  name,
  size = 40,
  className,
  ring = false,
}: {
  emoji: string;
  color: string;
  avatarUrl?: string | null;
  name: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  return (
    <Avatar
      className={cn("shrink-0", ring && "ring-2 ring-ring ring-offset-2 ring-offset-background", className)}
      style={{ width: size, height: size }}
      aria-label={name}
      title={name}
    >
      {avatarUrl && (
        <AvatarImage
          src={avatarUrl}
          alt={name}
          className="size-full object-cover rounded-full"
        />
      )}
      <AvatarFallback
        className="font-semibold text-white select-none"
        style={{
          fontSize: size * 0.42,
          background: `linear-gradient(135deg, ${color}, ${color}99)`,
        }}
      >
        {emoji || initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * WhatsApp Authentic Ticks:
 * - single gray tick (✓): sent to server / recipient offline
 * - double gray ticks (✓✓): delivered to recipient's device (online) but not yet read
 * - double blue ticks (✓✓): read / seen by recipient
 */
export function ReadTicks({ state }: { state: "sent" | "delivered" | "read" }) {
  if (state === "sent") {
    return <Check className="size-3.5 opacity-65" aria-label="Sent" />;
  }
  return (
    <CheckCheck
      className={cn("size-3.5", state === "read" ? "text-sky-500 font-bold" : "opacity-65")}
      aria-label={state === "read" ? "Read" : "Delivered"}
    />
  );
}

export function ConnectionBadge({ supabase, sse }: { supabase: boolean; sse: boolean }) {
  const live = supabase || sse;
  return (
    <Badge
      variant={live ? "success" : "secondary"}
      className="gap-1.5"
      title={
        supabase
          ? "Connected via Supabase Realtime Broadcast"
          : sse
            ? "Connected via Realtime"
            : "Connecting…"
      }
    >
      <span className={cn("size-2 rounded-full", live ? "bg-success live-dot" : "bg-muted-foreground")} />
      {supabase ? "Realtime" : sse ? "Live" : "Connecting…"}
    </Badge>
  );
}

export function previewText(m: MessageRow, groupPrefix: string | null): string {
  const prefix = groupPrefix ? `${groupPrefix}: ` : "";
  if (m.isDeleted) return `${prefix}This message was deleted`;
  if (m.messageType === "system") return m.content;
  const caption = m.content?.trim();
  switch (m.messageType) {
    case "image":
      return `${prefix}Photo${caption ? ` — ${caption}` : ""}`;
    case "video":
      return `${prefix}Video${caption ? ` — ${caption}` : ""}`;
    case "audio":
      return `${prefix}${caption || (m.attachmentName?.startsWith("voice-note") ? "Voice message" : "Audio")}`;
    case "document":
      return `${prefix}${caption || m.attachmentName || "Document"}`;
    default:
      return `${prefix}${m.content}`;
  }
}

export function replyPreview(m: MessageRow): string {
  if (m.isDeleted) return "Deleted message";
  const url = messageFileUrl(m);
  if (m.messageType !== "text" && url) {
    return previewText(m, null);
  }
  return m.content || "Message";
}

/** Clean WhatsApp-style chat list skeleton */
export function ChatListSkeleton() {
  return (
    <div className="flex flex-col gap-0 divide-y divide-border/30 px-2 py-1" aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-3 py-3 animate-pulse">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-12 rounded-md" />
            </div>
            <Skeleton className="h-3.5 w-44 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Realistic WhatsApp chat bubble skeleton: staggered outgoing & incoming bubbles */
export function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4 max-w-3xl mx-auto w-full animate-pulse" aria-label="Loading messages">
      <div className="mx-auto my-1">
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="flex justify-start">
        <div className="w-[65%] sm:w-[50%] flex flex-col gap-1.5 p-3 rounded-2xl rounded-tl-sm bg-muted/60 border border-border/40">
          <Skeleton className="h-3.5 w-[90%] rounded-md" />
          <Skeleton className="h-3.5 w-[65%] rounded-md" />
          <div className="flex justify-end pt-1">
            <Skeleton className="h-2.5 w-10 rounded-md" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-[60%] sm:w-[45%] flex flex-col gap-1.5 p-3 rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/20">
          <Skeleton className="h-3.5 w-[85%] rounded-md" />
          <div className="flex justify-end pt-1">
            <Skeleton className="h-2.5 w-12 rounded-md" />
          </div>
        </div>
      </div>
      <div className="flex justify-start">
        <div className="w-[70%] sm:w-[55%] flex flex-col gap-1.5 p-3 rounded-2xl rounded-tl-sm bg-muted/60 border border-border/40">
          <Skeleton className="h-3.5 w-[95%] rounded-md" />
          <Skeleton className="h-3.5 w-[80%] rounded-md" />
          <Skeleton className="h-3.5 w-[40%] rounded-md" />
          <div className="flex justify-end pt-1">
            <Skeleton className="h-2.5 w-10 rounded-md" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-[50%] sm:w-[35%] flex flex-col gap-1.5 p-3 rounded-2xl rounded-tr-sm bg-primary/20 border border-primary/20">
          <Skeleton className="h-3.5 w-[75%] rounded-md" />
          <div className="flex justify-end pt-1">
            <Skeleton className="h-2.5 w-12 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
