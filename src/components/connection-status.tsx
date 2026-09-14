"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Check = { name: string; ok: boolean; detail: string };
type Status = {
  configured: boolean;
  url: string | null;
  hasServiceKey: boolean;
  checks: Check[];
};

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/supabase/status");
        const data = await res.json();
        if (active) setStatus(data as Status);
      } catch {
        if (active) setStatus(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking connections…
      </div>
    );
  }

  if (!status || !status.configured) {
    return (
      <Alert>
        <AlertDescription className="space-y-1.5">
          <span className="block font-medium text-foreground">Supabase not connected</span>
          <span className="block">
            The app is running on its built-in realtime stream and local file storage. To enable
            Supabase Realtime, Storage and Auth sync, set{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and{" "}
            <code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code>, then rebuild.
          </span>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">Supabase connected</Badge>
        <Badge variant="outline">{status.hasServiceKey ? "Service role key" : "Anon key only"}</Badge>
      </div>
      <ul className="space-y-1.5">
        {status.checks.map((check) => (
          <li key={check.name} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block font-medium">{check.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{check.detail}</span>
            </span>
            <Badge variant={check.ok ? "success" : "secondary"} className="shrink-0">
              {check.ok ? "Ready" : "Check"}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
