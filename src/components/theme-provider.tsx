"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

export type ThemePreset = "default" | "twitter" | "vercel";

const PresetContext = React.createContext<{
  preset: ThemePreset;
  setPreset: (p: ThemePreset) => void;
}>({ preset: "default", setPreset: () => {} });

export function useThemePreset() {
  return React.useContext(PresetContext);
}

function PresetSync({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = React.useState<ThemePreset>("default");

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("pingchat-theme-preset") as ThemePreset | null;
      if (saved === "twitter" || saved === "vercel" || saved === "default") {
        setPresetState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = preset;
    try {
      localStorage.setItem("pingchat-theme-preset", preset);
    } catch {
      // ignore
    }
  }, [preset]);

  const setPreset = React.useCallback((p: ThemePreset) => setPresetState(p), []);

  return <PresetContext.Provider value={{ preset, setPreset }}>{children}</PresetContext.Provider>;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <PresetSync>{children}</PresetSync>
    </NextThemesProvider>
  );
}

export function useMode() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  return { theme, setTheme, resolvedTheme };
}
