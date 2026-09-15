"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, Edit3, MoreVertical, Reply, Smile, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ReadTicks } from "@/components/chat-bits";
import { WhatsAppDocCard } from "@/components/whatsapp-doc-card";
import { formatBytes } from "@/lib/file-utils";
import { cn, formatMessageTime } from "@/lib/utils";
import { messageFileUrl, type MessageRow } from "@/lib/types";
import type { FileViewerTarget } from "@/components/file-viewer-modal";

// WhatsApp standard quick reactions
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👎"];

interface MessageBubbleProps {
  msg: MessageRow;
  own: boolean;
  isConsecutive?: boolean;
  showSender: boolean;
  tick: "sent" | "delivered" | "read" | null;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onViewFile: (file: FileViewerTarget) => void;
  meId: string;
}

export function MessageBubble({
  msg,
  own,
  isConsecutive = false,
  showSender,
  tick,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onViewFile,
  meId,
}: MessageBubbleProps) {
  const [reactionOpen, setReactionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  if (msg.messageType === "system") {
    return (
      <div className="mx-auto my-1 max-w-[85%]">
        <Badge variant="secondary" className="whitespace-normal text-center shadow-xs font-normal text-xs">
          {msg.content}
        </Badge>
      </div>
    );
  }

  const reactions = msg.reactions ?? [];
  const grouped = reactions.reduce<Record<string, { count: number; mine: boolean }>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
    acc[r.emoji].count += 1;
    if (r.userId === meId) acc[r.emoji].mine = true;
    return acc;
  }, {});

  const fileUrl = messageFileUrl(msg);
  const hasAttachment = !msg.isDeleted && Boolean(fileUrl) && msg.messageType !== "text";

  // Hover or open states
  const showControls = isHovered || menuOpen || reactionOpen;

  return (
    <div
      data-bubble-id={msg.id}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        if (!reactionOpen && !menuOpen) {
          setIsHovered(false);
        }
      }}
      className={cn(
        "group relative flex w-full max-w-full select-text transition-colors",
        own ? "justify-end" : "justify-start",
        isConsecutive ? "mt-0.5" : "mt-2"
      )}
    >
      {/* 
        Bubble + Action controls wrapper:
        inline-flex with max-w-[82%] sm:max-w-[70%] so it never overflows horizontal bounds
      */}
      <div
        className={cn(
          "relative inline-flex items-center max-w-[85%] sm:max-w-[72%] md:max-w-[65%]",
          own ? "flex-row-reverse" : "flex-row"
        )}
      >
        {/* 1. The Message Bubble */}
        <div
          className={cn(
            "relative w-full max-w-full min-w-[72px] px-2.5 pb-1 pt-1.5 shadow-xs transition-all break-words overflow-hidden",
            own
              ? cn(
                  "bg-bubble-out text-bubble-out-fg rounded-2xl",
                  isConsecutive ? "rounded-tr-md" : "rounded-tr-xs"
                )
              : cn(
                  "bg-bubble-in text-bubble-in-fg rounded-2xl border border-border/20",
                  isConsecutive ? "rounded-tl-md" : "rounded-tl-xs"
                )
          )}
        >
          {/* Sender name for group chats */}
          {showSender && !own && msg.sender && (
            <div className="text-xs font-semibold text-primary mb-0.5 truncate">{msg.sender.displayName}</div>
          )}

          {/* Reply preview banner */}
          {msg.replyTo && !msg.isDeleted && (
            <div className={cn("mb-1.5 overflow-hidden rounded-lg", own ? "bg-primary-foreground/15" : "bg-muted/80")}>
              <div className="border-l-4 border-current px-2 py-1 opacity-90">
                <div className="text-xs font-semibold truncate">{msg.replyTo.sender?.displayName ?? "Message"}</div>
                <div className="truncate text-[13px] opacity-80">{msg.replyTo.content || "Attachment"}</div>
              </div>
            </div>
          )}

          {/* Attachment: Image */}
          {hasAttachment && msg.messageType === "image" && fileUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onViewFile({
                  url: fileUrl,
                  name: msg.attachmentName || "Image",
                  size: msg.attachmentSize,
                  mime: msg.attachmentMime,
                  kind: "image",
                });
              }}
              className="block text-left w-full h-auto p-0 rounded-lg group/media focus:outline-none hover:bg-transparent overflow-hidden"
              aria-label={`View ${msg.attachmentName || "image"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={msg.attachmentName || "image"}
                className="mb-1.5 max-h-64 sm:max-h-72 w-full object-cover rounded-lg transition-opacity group-hover/media:opacity-90 cursor-pointer"
                loading="lazy"
              />
            </Button>
          )}

          {/* Attachment: Video */}
          {hasAttachment && msg.messageType === "video" && fileUrl && (
            <div className="relative mb-1.5 rounded-lg overflow-hidden bg-black group/video max-w-full">
              <video src={fileUrl} controls preload="metadata" className="max-h-64 sm:max-h-72 w-full bg-black rounded-lg" />
            </div>
          )}

          {/* Attachment: Audio */}
          {hasAttachment && msg.messageType === "audio" && fileUrl && (
            <div className={cn("mb-1.5 flex max-w-full items-center gap-2 rounded-lg p-2", own ? "bg-primary-foreground/15" : "bg-muted/60")}>
              <audio src={fileUrl} controls preload="metadata" className="h-8 w-full max-w-[200px] sm:max-w-[240px] flex-1" />
            </div>
          )}

          {/* Attachment: Document (WhatsAppDocCard fits container without overflow) */}
          {hasAttachment && msg.messageType === "document" && fileUrl && (
            <div className="mb-1.5 w-full max-w-full overflow-hidden">
              <WhatsAppDocCard
                url={fileUrl}
                name={msg.attachmentName || "Document"}
                size={msg.attachmentSize}
                mime={msg.attachmentMime}
                own={own}
                onClick={() =>
                  onViewFile({
                    url: fileUrl,
                    name: msg.attachmentName || "Document",
                    size: msg.attachmentSize,
                    mime: msg.attachmentMime,
                    kind: "document",
                  })
                }
              />
            </div>
          )}

          {/* Text body */}
          {(!hasAttachment || msg.content) && (
            <div className={cn("whitespace-pre-wrap break-words text-[14.5px] leading-snug", msg.isDeleted && "italic opacity-70")}>
              {msg.isDeleted ? "This message was deleted" : msg.content}
              {msg.isEdited && !msg.isDeleted && <span className="ml-1 text-[11px] opacity-70">edited</span>}
            </div>
          )}

          {/* Timestamp + ticks */}
          <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[11px] select-none", own ? "text-primary-foreground/80" : "text-muted-foreground")}>
            <span>{formatMessageTime(msg.createdAt)}</span>
            {own && tick && <ReadTicks state={tick} />}
          </div>
        </div>

        {/*
          2. Reaction Badges: OUTSIDE the bubble (the bubble has overflow-hidden,
          which clipped the badge) — anchored to the wrapper so the emoji sits
          fully visible at the bubble's bottom corner like WhatsApp.
        */}
        {Object.keys(grouped).length > 0 && (
          <div
            className={cn(
              "absolute -bottom-2.5 flex items-center gap-1 z-10 select-none",
              own ? "right-2" : "left-2"
            )}
          >
            <div className="flex items-center gap-1 rounded-full bg-card border border-border/60 shadow-md px-1.5 py-0.5">
              {Object.entries(grouped).map(([emoji, g]) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReact(emoji);
                  }}
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs transition-transform active:scale-90 hover:scale-110",
                    g.mine && "font-bold scale-105"
                  )}
                  title={g.mine ? "Click to remove reaction" : "Click to react"}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  {g.count > 1 && (
                    <span className="text-[10px] font-semibold text-muted-foreground leading-none">
                      {g.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 
          3. Action Buttons right next to the bubble:
          Hidden by default, shown on desktop hover or mobile tap
        */}
        <div
          className={cn(
            "flex items-center gap-0.5 mx-1 transition-opacity duration-150 shrink-0",
            showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
        >
          {/* Reaction Picker Button */}
          <Popover
            open={reactionOpen}
            onOpenChange={(open) => {
              setReactionOpen(open);
              if (!open) setIsHovered(false);
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 shadow-xs"
                aria-label="React with emoji"
                title="React"
              >
                <Smile className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align={own ? "end" : "start"}
              sideOffset={6}
              className="z-50 flex items-center gap-1 p-1 bg-card border border-border shadow-xl rounded-full w-auto"
            >
              {REACTION_EMOJIS.map((e) => (
                <Button
                  key={e}
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    onReact(e);
                    setReactionOpen(false);
                    setIsHovered(false);
                  }}
                  className="size-8 rounded-full text-lg hover:bg-muted active:scale-125"
                  aria-label={`React ${e}`}
                >
                  {e}
                </Button>
              ))}
            </PopoverContent>
          </Popover>

          {/* Quick Reply Button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              onReply();
              setIsHovered(false);
            }}
            className="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 shadow-xs"
            aria-label="Reply to message"
            title="Reply"
          >
            <Reply className="size-4" />
          </Button>

          {/* More Options Menu (Copy, Download, Edit, Delete) */}
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) setIsHovered(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 shadow-xs"
                aria-label="More options"
                title="Options"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={own ? "end" : "start"} side="top" sideOffset={6} className="w-36">
              <DropdownMenuItem
                onClick={() => {
                  navigator.clipboard?.writeText(msg.content || msg.attachmentName || "").catch(() => {});
                  setIsHovered(false);
                }}
                className="gap-2.5 py-2 cursor-pointer"
              >
                <Copy className="size-4" /> Copy
              </DropdownMenuItem>

              {fileUrl && !msg.isDeleted && (
                <DropdownMenuItem asChild className="gap-2.5 py-2 cursor-pointer">
                  <a
                    href={fileUrl}
                    download={msg.attachmentName || undefined}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setIsHovered(false)}
                  >
                    <Download className="size-4" /> Download
                  </a>
                </DropdownMenuItem>
              )}

              {/* Delete button: ALWAYS at the bottom, ONLY available for own messages */}
              {own && !msg.isDeleted && (
                <>
                  <DropdownMenuSeparator />
                  {msg.messageType === "text" && (
                    <DropdownMenuItem
                      onClick={() => {
                        onEdit();
                        setIsHovered(false);
                      }}
                      className="gap-2.5 py-2 cursor-pointer"
                    >
                      <Edit3 className="size-4" /> Edit
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => {
                      onDelete();
                      setIsHovered(false);
                    }}
                    className="gap-2.5 py-2 text-destructive focus:text-destructive cursor-pointer font-medium"
                  >
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
