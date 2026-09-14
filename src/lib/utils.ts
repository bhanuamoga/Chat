import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const AVATAR_COLORS = [
  "#00a884",
  "#25d366",
  "#8e24aa",
  "#e91e63",
  "#f44336",
  "#ff5722",
  "#ff9800",
  "#4caf50",
  "#2196f3",
  "#3f51b5",
  "#00bcd4",
  "#795548",
];

export const AVATAR_EMOJIS = [
  "😀", "😎", "🦊", "🐼", "🦁", "🐸", "🦄", "🐝",
  "🌟", "🔥", "⚡", "🎧", "🚀", "🌈", "🍕", "⚽",
  "🎮", "📚", "🎨", "💡", "🐱", "🐶", "🦋", "🌺",
];

export const CHAT_EMOJIS = [
  "😀","😁","😂","🤣","😊","😍","😘","😎","🤔","😴",
  "😭","😡","👍","👎","🙏","👏","💪","🔥","❤️","💔",
  "🎉","✨","🌟","⚡","✅","❌","👀","💯","🤝","🙌",
  "😅","😇","🥳","😜","🤯","🥺","😱","🤗","🤫","🫡",
  "👋","✋","🤙","💩","🌹","🍕","⚽","🎮","🚀","🌈",
];

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function formatChatListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDivider(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

export function isOnline(lastSeen: string | null, windowSec = 90): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < windowSec * 1000;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
