import type { ThemePreset } from "@/components/theme-provider";

/**
 * tweakcn theme presets — single source of truth for theme metadata.
 * Components never hardcode theme colors; they read from here + CSS tokens
 * (actual palettes live in globals.css, taken 1:1 from tweakcn themes).
 */
export const THEME_PRESETS: {
  id: ThemePreset;
  label: string;
  hint: string;
  /** swatch preview (theme data, mirrors globals.css --primary per preset) */
  swatchClass: string;
}[] = [
  { id: "nature", label: "Nature", hint: "tweakcn • nature green", swatchClass: "bg-green-600" },
  { id: "vercel", label: "Vercel", hint: "tweakcn • monochrome", swatchClass: "bg-foreground" },
  { id: "twitter", label: "Twitter", hint: "tweakcn • twitter blue", swatchClass: "bg-sky-500" },
];

export const MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof MODES)[number];
