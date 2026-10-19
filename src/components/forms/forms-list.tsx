"use client";

/** /forms — list of the user's dynamic forms + create dialog. Pure shadcn. */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BadgeCheck, ClipboardList, Code2, Copy, ExternalLink, FilePlus2,
  Loader2, PenSquare, Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";

interface FormRow {
  id: string;
  title: string;
  description: string;
  slug: string;
  active: boolean;
  fields: { id: string }[];
  submissions: number;
  updated_at: string;
}

export function FormsList() {
  const router = useRouter();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [apiRow, setApiRow] = useState<FormRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/forms", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setForms(data.forms ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Create failed");
      toast.success("Form created — add fields now");
      router.push(`/forms/${data.form.id}`);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (f: FormRow, active: boolean) => {
    setForms((prev) => prev?.map((x) => (x.id === f.id ? { ...x, active } : x)) ?? prev);
    const res = await fetch(`/api/forms/${f.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    if (!res.ok) toast.error("Could not update");
  };

  const remove = async (f: FormRow) => {
    if (!confirm(`Delete "${f.title}" and all ${f.submissions} responses?`)) return;
    const res = await fetch(`/api/forms/${f.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Delete failed");
    toast.success("Form deleted");
    load();
  };

  const publicUrl = (slug: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/f/${slug}`;

  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success(`${what} copied`));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto p-3 sm:p-6">
      {/* header */}
      <div className="mb-5 flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight">Forms</h1>
          <p className="truncate text-sm text-muted-foreground">
            Build dynamic forms, share a public link, collect answers into your database.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="shrink-0">
          <FilePlus2 className="mr-2 size-4" /> New form
        </Button>
      </div>

      {forms === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : forms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ClipboardList className="size-10 text-muted-foreground" />
            <p className="font-medium">No forms yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Click <b>New form</b>, add fields visually, then publish — anyone with the link can submit.
            </p>
            <Button onClick={() => setOpen(true)} className="mt-2">
              <FilePlus2 className="mr-2 size-4" /> Create your first form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {forms.map((f) => (
            <Card key={f.id} className="flex flex-col transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate text-base">{f.title}</CardTitle>
                  <Badge variant={f.active ? "default" : "secondary"} className="shrink-0">
                    {f.active ? "Live" : "Closed"}
                  </Badge>
                </div>
                {f.description && (
                  <CardDescription className="line-clamp-2">{f.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{f.fields?.length ?? 0} fields</Badge>
                  <Badge variant="outline">{f.submissions} responses</Badge>
                </div>
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                  <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">/f/{f.slug}</code>
                  <Button variant="ghost" size="icon" className="size-6 shrink-0" title="Copy public link" onClick={() => copy(publicUrl(f.slug), "Link")}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="flex items-center gap-1 border-t border-border/60 pt-3">
                <Button asChild variant="secondary" size="sm" className="min-w-0 flex-1">
                  <Link href={`/forms/${f.id}`}>
                    <PenSquare className="mr-1.5 size-3.5" /> Builder
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="icon" title="Open public form">
                  <a href={publicUrl(f.slug)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
                <Button variant="ghost" size="icon" title="API & token" onClick={() => setApiRow(f)}>
                  <Code2 className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" title={f.active ? "Close form" : "Re-open form"} onClick={() => toggleActive(f, !f.active)}>
                  <Switch checked={f.active} onCheckedChange={() => {}} className="pointer-events-none" />
                </Button>
                <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(f)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New form</DialogTitle>
            <DialogDescription>Name it now — you'll add fields in the builder next.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <Label htmlFor="f-title">Title</Label>
              <Input id="f-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Hackathon feedback" autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-desc">Description (optional)</Label>
              <Textarea id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shown above the fields on the public page" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={creating}>
              {creating && <Loader2 className="mr-2 size-4 animate-spin" />} Create & open builder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* api/token dialog */}
      <Dialog open={!!apiRow} onOpenChange={(v) => !v && setApiRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BadgeCheck className="size-5 text-primary" /> Public access — {apiRow?.title}
            </DialogTitle>
            <DialogDescription>Share the link, or POST from any app with the slug as your API token.</DialogDescription>
          </DialogHeader>
          {apiRow && (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">Public page (anyone can open & submit)</Label>
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{publicUrl(apiRow.slug)}</code>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => copy(publicUrl(apiRow.slug), "Link")}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">API endpoint + token (slug)</Label>
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">POST /api/public/forms/{apiRow.slug}</code>
                  <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={() => copy(apiRow.slug, "Token")}>
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs text-muted-foreground">cURL example</Label>
                <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
{`curl -X POST ${publicUrl(apiRow.slug).replace("/f/", "/api/public/forms/")} \\
  -H 'Content-Type: application/json' \\
  -d '{"::fieldId::":"Alice","::fieldId2::":"alice@mail.com"}'`}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FormsList;
