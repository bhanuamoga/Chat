import type { ThemePreset } from "@/components/theme-provider";

/**
 * tweakcn-style theme presets — single source of truth for theme metadata.
 * Components never hardcode theme colors; they read from here + CSS tokens.
 */
export const THEME_PRESETS: {
  id: ThemePreset;
  label: string;
  hint: string;
  /** swatch preview (theme data, mirrors globals.css --primary per preset) */
  swatchClass: string;
}[] = [
  { id: "default", label: "Morr Emerald", hint: "tweakcn • whatsapp emerald", swatchClass: "bg-success" },
  { id: "twitter", label: "Twitter", hint: "tweakcn • twitter blue", swatchClass: "bg-sky-500" },
  { id: "vercel", label: "Vercel", hint: "tweakcn • monochrome", swatchClass: "bg-foreground" },
];

export const MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof MODES)[number];
