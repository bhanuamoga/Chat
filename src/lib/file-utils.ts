import type { MessageType } from "./types";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB per attachment

export function kindFromMime(mime: string): MessageType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function extFromName(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase().slice(0, 8) : "";
}

export function iconForFile(mime: string | null, name: string | null): string {
  const m = mime || "";
  if (m.startsWith("image/")) return "🖼️";
  if (m.startsWith("video/")) return "🎬";
  if (m.startsWith("audio/")) return "🎵";
  const ext = (name || "").split(".").pop()?.toLowerCase() || "";
  if (ext === "pdf") return "📕";
  if (["doc", "docx", "odt", "rtf", "txt", "md"].includes(ext)) return "📄";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽️";
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "🗜️";
  if (["js", "ts", "tsx", "jsx", "py", "java", "json", "html", "css"].includes(ext)) return "💻";
  if (["apk", "exe", "dmg"].includes(ext)) return "📦";
  return "📎";
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}
