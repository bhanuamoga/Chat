"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, MessageSquare, Users, Sparkles, Menu, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useMode } from "@/components/theme-provider";
import { ThemeMenu } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/chat-bits";
import { MorrLogo } from "@/components/morr-logo";
import { cn } from "@/lib/utils";
import type { UserRow } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/groups", label: "Group Chat", icon: Users },
  { href: "/natural", label: "Natural Chat", icon: Sparkles, badge: "AI" },
] as const;

interface NavRailProps {
  user?: UserRow | null;
  onOpenProfile?: () => void;
}

export function NavRail({ user, onOpenProfile }: NavRailProps) {
  const pathname = usePathname();

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <>
      {/* Desktop: vertical rail */}
      <nav
        className="hidden w-20 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-4 md:flex"
        aria-label="Main navigation"
      >
        <Link
          href="/chat"
          className="mb-6 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:scale-105"
          aria-label="Morr Chat home"
        >
          <MorrLogo className="size-6 text-primary-foreground" />
        </Link>

        <div className="flex flex-1 flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex w-16 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon className="size-5" />
                    <span>{item.label}</span>
                    {"badge" in item && (
                      <span className="absolute top-1.5 right-2 size-2 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {"badge" in item ? " (Gemini 2.5 Flash)" : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Log out"
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Log out</TooltipContent>
        </Tooltip>
      </nav>
    </>
  );
}

export function MobileMenuDrawer({
  user,
  onOpenProfile,
}: {
  user?: UserRow | null;
  onOpenProfile?: () => void;
}) {
  const pathname = usePathname();
  const { setTheme, resolvedTheme } = useMode();
  const isDark = resolvedTheme === "dark";

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 md:hidden" aria-label="Open navigation menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[290px] max-w-[85vw] flex-col p-0 bg-sidebar text-sidebar-foreground">
        {/* Header */}
        <SheetHeader className="flex flex-row items-center gap-3 border-b border-sidebar-border p-4 text-left">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <MorrLogo className="size-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <SheetTitle className="text-base font-semibold leading-tight">Morr Chat</SheetTitle>
            <span className="text-xs text-muted-foreground">Workspace</span>
          </div>
        </SheetHeader>

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Menu
          </div>
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="size-5" />
                      <span>{item.label}</span>
                    </div>
                    {"badge" in item && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 font-bold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </SheetClose>
              );
            })}
          </div>

          <Separator className="my-4" />

          {/* Preferences: theme controls live here (no icons cluttered in the top bar) */}
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preferences
          </div>
          <div className="space-y-1">
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <div className="flex items-center gap-3">
                {isDark ? <Sun className="size-5 text-amber-400" /> : <Moon className="size-5 text-slate-600" />}
                <span>Theme</span>
              </div>
              <span className="text-xs capitalize text-muted-foreground">{resolvedTheme}</span>
            </button>

            {/* Appearance popup (colors/presets) — opens like the profile popup */}
            <ThemeMenu row />
          </div>
        </div>

        {/* User profile & Logout footer */}
        <div className="border-t border-sidebar-border p-3 space-y-2">
          {user && (
            <button
              onClick={onOpenProfile}
              className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-accent/60 transition-colors"
              title="Click to edit profile"
            >
              <UserAvatar emoji={user.avatarEmoji} color={user.avatarColor} avatarUrl={user.avatarUrl} name={user.displayName} size={38} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">{user.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email || "Active"}</p>
              </div>
            </button>
          )}

          <Button
            variant="destructive"
            className="w-full justify-start gap-3 bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 border border-red-500/20"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            <span>Sign Out</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
