"use client";

import { Check, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemePreset, useMode } from "@/components/theme-provider";
import { MODES, THEME_PRESETS } from "@/lib/themes";
import { cn } from "@/lib/utils";

export function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { setTheme, resolvedTheme } = useMode();
  const isDark = resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={compact ? "size-8" : undefined}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

export function ThemeMenu() {
  const { preset, setPreset } = useThemePreset();
  const { theme, setTheme } = useMode();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Theme settings">
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 p-1">
          {MODES.map((m) => (
            <Button
              key={m}
              variant={theme === m ? "secondary" : "ghost"}
              size="sm"
              className="capitalize"
              onClick={() => setTheme(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>tweakcn preset</DropdownMenuLabel>
        {THEME_PRESETS.map((p) => (
          <DropdownMenuItem key={p.id} onClick={() => setPreset(p.id)} className="gap-3">
            <span className={cn("size-4 shrink-0 rounded-full", p.swatchClass)} aria-hidden />
            <span className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{p.label}</span>
              <span className="text-[11px] text-muted-foreground">{p.hint}</span>
            </span>
            {preset === p.id && <Check className="size-4 text-success" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
