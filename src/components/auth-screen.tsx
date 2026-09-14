"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Paperclip,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ModeToggle, ThemeMenu } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/chat-bits";
import { MorrLogo } from "@/components/morr-logo";
import { AVATAR_COLORS, AVATAR_EMOJIS, cn } from "@/lib/utils";

const FEATURES = [
  { icon: Zap, title: "Realtime delivery", body: "Broadcast channels sync messages the moment they are sent." },
  { icon: Paperclip, title: "Any file type", body: "Documents, photos, video, audio and voice notes up to 25MB." },
  { icon: Users, title: "Groups & presence", body: "Group chats, typing indicators and live online status." },
  { icon: ShieldCheck, title: "Secure sessions", body: "NextAuth sessions with Supabase Auth user sync." },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0]);
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: "signin" | "signup") => {
    setMode(next);
    setError(null);
  };

  const credentialsSignIn = async (em: string, pw: string) => {
    try {
      const res = await signIn("credentials", {
        email: em.trim().toLowerCase(),
        password: pw,
        redirect: false,
      });

      if (res?.error) {
        const errMsg = "Incorrect email or password. Please try again.";
        setError(errMsg);
        toast.error(errMsg);
        return false;
      }

      toast.success("Signed in successfully! Redirecting…");
      // Successful sign in: Navigate to chat workspace immediately
      window.location.href = "/chat";
      return true;
    } catch (err: any) {
      const msg = err?.message || "Sign-in request failed.";
      setError(msg);
      toast.error(msg);
      return false;
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      const msg = "Enter a valid email address.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (password.length < 6) {
      const msg = "Password must be at least 6 characters.";
      setError(msg);
      toast.error(msg);
      return;
    }

    setBusy(true);
    try {
      if (mode === "signin") {
        await credentialsSignIn(email, password);
        return;
      }
      if (!name.trim()) {
        const msg = "Enter your full name.";
        setError(msg);
        toast.error(msg);
        setBusy(false);
        return;
      }
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name.trim(), email: email.trim(), password, avatarEmoji: emoji, avatarColor: color }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? "Unable to create your account.";
        setError(msg);
        toast.error(msg);
        setBusy(false);
        return;
      }
      toast.success("Account created successfully! Signing you in…");
      await credentialsSignIn(email, password);
    } catch (err: any) {
      const msg = err?.message || "Something went wrong. Please try again.";
      setError(msg);
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* brand panel */}
      <aside className="relative hidden flex-col justify-between border-r border-sidebar-border bg-sidebar p-10 lg:flex">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <MorrLogo className="size-6 text-primary-foreground" />
            </span>
            <span className="text-lg font-semibold tracking-tight">Morr Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <ModeToggle />
            <ThemeMenu />
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            Realtime messaging, built for teams that move fast.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            A production-grade chat workspace with direct messages, groups, file sharing and presence — powered by Next.js and Supabase Realtime.
          </p>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{feature.title}</span>
                  <span className="block text-sm text-muted-foreground">{feature.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Next.js · Supabase Realtime · NextAuth sessions
        </p>
      </aside>

      {/* form panel */}
      <main className="chat-surface flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <MorrLogo className="size-5 text-primary-foreground" />
              </span>
              <span className="text-base font-semibold tracking-tight">Morr Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <ModeToggle />
              <ThemeMenu />
            </div>
          </div>

          <Card className="animate-pop-in shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">
                {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
              </CardTitle>
              <CardDescription>
                {mode === "signin"
                  ? "Enter your credentials to continue to your conversations."
                  : "Set up your profile to start messaging your team."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <Tabs value={mode} onValueChange={(value) => reset(value as typeof mode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>
              </Tabs>

              <form className="space-y-4" onSubmit={submit} noValidate>
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Ada Lovelace"
                      autoComplete="name"
                      maxLength={40}
                      disabled={busy}
                      autoFocus
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={busy}
                    autoFocus={mode === "signin"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 6 characters"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      disabled={busy}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 size-9 text-muted-foreground"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                </div>

                {mode === "signup" && (
                  <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">Profile picture</Label>
                    <div className="flex items-center gap-3">
                      <UserAvatar emoji={emoji} color={color} name={name || "New user"} size={44} />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap gap-1">
                          {AVATAR_EMOJIS.slice(0, 12).map((option) => (
                            <Button
                              key={option}
                              type="button"
                              variant={emoji === option ? "secondary" : "ghost"}
                              size="icon"
                              className="size-7 text-base"
                              onClick={() => setEmoji(option)}
                              aria-label={`Avatar ${option}`}
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {AVATAR_COLORS.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setColor(option)}
                              className={cn("size-5 rounded-full transition", color === option && "ring-2 ring-ring ring-offset-2 ring-offset-card")}
                              style={{ background: option }}
                              aria-label={`Accent ${option}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {mode === "signin" ? "Sign in" : "Create account"}
                  {!busy && <ArrowRight className="size-4" />}
                </Button>
              </form>

              <p className="text-center text-xs text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    New to Morr Chat?{" "}
                    <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => reset("signup")}>
                      Create an account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => reset("signin")}>
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Sessions are managed by NextAuth and synced with your Supabase Auth identity.
          </p>
        </div>
      </main>
    </div>
  );
}
