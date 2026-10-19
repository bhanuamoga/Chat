"use client";

/**
 * /forms/[id] — the visual builder.
 * Toolbox of shadcn field types on the left; live canvas in the middle (fields
 * render with the SAME components the public page uses); field settings in an
 * inline editor; Preview + Submissions tabs; Publish panel with public link +
 * API token.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Calendar, ChevronDown, ChevronUp, Copy, ExternalLink, GripVertical,
  Hash, Link2, ListChecks, MailCheck, Phone, Plus, Save, Settings2, ToggleLeft, Trash2, Type,
  AlignLeft, CheckCircle2, Radio, Loader2, Inbox, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import type { FormField, FormFieldType } from "@/lib/forms/types";
import { newFieldId } from "@/lib/forms/types";
import { RenderField } from "./render-field";

const TOOLS: { type: FormFieldType; label: string; icon: typeof Type; hint: string }[] = [
  { type: "text", label: "Short text", icon: Type, hint: "one line answer" },
  { type: "textarea", label: "Long text", icon: AlignLeft, hint: "multi-line answer" },
  { type: "email", label: "Email", icon: MailCheck, hint: "valid email input" },
  { type: "number", label: "Number", icon: Hash, hint: "numeric only" },
  { type: "phone", label: "Phone", icon: Phone, hint: "telephone keypad" },
  { type: "url", label: "Link", icon: Link2, hint: "a URL" },
  { type: "date", label: "Date", icon: Calendar, hint: "date picker" },
  { type: "checkbox", label: "Checkbox", icon: CheckCircle2, hint: "yes / no" },
  { type: "select", label: "Dropdown", icon: ListChecks, hint: "pick one option" },
  { type: "multiselect", label: "Multi select", icon: ToggleLeft, hint: "pick many options" },
  { type: "radio", label: "Choice", icon: Radio, hint: "options as radios" },
];

const toolOf = (t: FormFieldType) => TOOLS.find((x) => x.type === t)!;

interface FormRow {
  id: string;
  title: string;
  description: string;
  slug: string;
  active: boolean;
  fields: FormField[];
  table_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface SubmissionRow {
  id: string;
  created_at: string;
  data?: Record<string, unknown>;
  [col: string]: unknown;
}

export function FormBuilder({ id }: { id: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [fields, setFields] = useState<FormField[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tableName, setTableName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<FormField | null>(null);
  const [optText, setOptText] = useState("");
  const [preview, setPreview] = useState(false);
  const [subs, setSubs] = useState<SubmissionRow[] | null>(null);
  const [subsTable, setSubsTable] = useState<string | null>(null);

  const loadForm = useCallback(async () => {
    const res = await fetch(`/api/forms/${id}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    if (!res.ok) return;
    const { form: f } = await res.json();
    setForm(f);
    setFields((f.fields as FormField[]) ?? []);
    setTitle(f.title);
    setDescription(f.description);
    setTableName((f.table_name as string | null) ?? "");
    setDirty(false);
  }, [id]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const loadSubs = useCallback(async () => {
    setSubs(null);
    const res = await fetch(`/api/forms/${id}/submissions`, { cache: "no-store" });
    if (res.ok) {
      const payload = await res.json();
      setSubs(payload.submissions ?? []);
      setSubsTable(payload.table ?? null);
    }
  }, [id]);

  /* ---------- local field ops ---------- */
  const touch = (next: FormField[]) => {
    setFields(next);
    setDirty(true);
  };
  const addField = (type: FormFieldType) =>
    touch([
      ...fields,
      {
        id: newFieldId(),
        type,
        label: toolOf(type).label,
        required: false,
        col: "",
        options: type === "select" || type === "radio" || type === "multiselect" ? ["Option 1", "Option 2"] : undefined,
        optionsSource: type === "select" || type === "radio" || type === "multiselect" ? { mode: "static" } : undefined,
        placeholder: ["text", "textarea", "email", "phone", "url"].includes(type) ? "" : undefined,
      },
    ]);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    touch(next);
  };
  const removeField = (i: number) => touch(fields.filter((_, x) => x !== i));
  const openSettings = (f: FormField) => {
    setEditing({ ...f });
    setOptText((f.options ?? []).join("\n"));
  };
  const applySettings = () => {
    if (!editing) return;
    const next: FormField = {
      ...editing,
      options:
        editing.type === "select" || editing.type === "radio" || editing.type === "multiselect"
          ? optText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 50)
          : undefined,
    };
    touch(fields.map((f) => (f.id === next.id ? next : f)));
    setEditing(null);
  };

  /* ---------- save / publish ---------- */
  const save = async (extra?: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, fields, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Save failed");
      setForm(data.form);
      setDirty(false);
      toast.success("Saved — public page is updated");
    } finally {
      setSaving(false);
    }
  };

  const saveTableName = async () => {
    const res = await fetch(`/api/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table_name: tableName.trim() || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Invalid table name");
    setForm(data.form);
    toast.success(tableName.trim() ? `Submissions will write into "${tableName.trim()}"` : "Table link cleared");
  };

  const publicUrl = form ? `${typeof window !== "undefined" ? window.location.origin : ""}/f/${form.slug}` : "";
  const copy = (t: string, what: string) => navigator.clipboard.writeText(t).then(() => toast.success(`${what} copied`));


  if (missing) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="font-semibold">Form not found</p>
        <Button variant="outline" onClick={() => router.push("/forms")}>
          <ArrowLeft className="mr-2 size-4" /> Back to forms
        </Button>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-3 p-4 sm:p-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* top bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-border bg-background/95 px-2.5 py-2 backdrop-blur sm:px-5">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => router.push("/forms")} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="w-full truncate bg-transparent text-base font-semibold tracking-tight outline-none sm:text-lg"
            placeholder="Form title"
          />
        </div>
        {dirty && <Badge variant="secondary" className="max-sm:hidden">unsaved</Badge>}
        <Button onClick={() => save()} disabled={saving} className="h-8 shrink-0 max-sm:px-2.5">
          {saving ? <Loader2 className="size-4 animate-spin sm:mr-2" /> : <Save className="size-4 sm:mr-2" />}
          <span className="max-sm:hidden">Save & publish</span>
        </Button>
      </div>

      <Tabs defaultValue="build" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-3 pb-6 sm:px-5">
        <TabsList className="my-3 grid w-full grid-cols-3 sm:w-96">
          <TabsTrigger value="build">Build</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="subs" onClick={loadSubs}>Submissions</TabsTrigger>
        </TabsList>

        {/* ============ BUILD ============ */}
        <TabsContent value="build" className="flex-1">
          <div className="grid min-w-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            {/* toolbox */}
            <div className="space-y-2 lg:sticky lg:top-[62px] lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add field</p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {TOOLS.map((t) => (
                  <Button
                    key={t.type}
                    variant="outline"
                    className="h-auto justify-start gap-2.5 px-3 py-2.5 text-left"
                    onClick={() => addField(t.type)}
                  >
                    <t.icon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{t.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{t.hint}</span>
                    </span>
                  </Button>
                ))}
              </div>
              {/* publish card */}
              <Card className="mt-2">
                <CardHeader className="p-3 pb-1.5">
                  <CardTitle className="text-sm">Public access</CardTitle>
                  <CardDescription className="text-xs">Anyone with the link can submit.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 p-3 pt-0">
                  <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1.5">
                    <code className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={publicUrl}>/f/{form.slug}</code>
                    <Button variant="ghost" size="icon" className="size-6" onClick={() => copy(publicUrl, "Link")}>
                      <Copy className="size-3" />
                    </Button>
                    <Button asChild variant="ghost" size="icon" className="size-6">
                      <a href={publicUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3" /></a>
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => copy(form.slug, "API token")}>
                    <Copy className="mr-2 size-3.5" /> Copy API token (slug)
                  </Button>
                </CardContent>
              </Card>

              {/* database card — the backing table this form writes into */}
              <Card className="mt-2">
                <CardHeader className="p-3 pb-1.5">
                  <CardTitle className="text-sm">Database</CardTitle>
                  <CardDescription className="text-xs">Type the EXISTING table name — submits write rows into it. No tables are created.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 p-3 pt-0">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      placeholder="e.g. leads"
                      className="h-8 flex-1 font-mono text-xs"
                      aria-label="Linked table name"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 shrink-0"
                      onClick={saveTableName}
                      disabled={(form.table_name ?? "") === tableName.trim()}
                    >
                      Link
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    letters / digits / underscore only · row insert uses the per-field <b>DB column</b> you set below
                  </p>
                  <div className="max-h-28 space-y-1 overflow-y-auto">
                    {fields.map((f) => (
                      <div key={f.id} className="flex items-center gap-1.5 text-[11px]">
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">{f.label}</span>
                        <code className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{(f as { col?: string }).col ?? "—"}</code>
                      </div>
                    ))}
                    {fields.length === 0 && <p className="text-[11px] text-muted-foreground">add fields to see columns</p>}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Accepting responses</span>
                    <Switch
                      checked={form.active}
                      onCheckedChange={(v) =>
                        void fetch(`/api/forms/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ active: v }),
                        }).then(() => setForm((p) => (p ? { ...p, active: v } : p)))
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* canvas */}
            <div className="min-w-0 space-y-2.5">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Description shown under the title</Label>
                <Textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDirty(true);
                  }}
                  placeholder="What is this form for?"
                  className="min-h-[68px]"
                />
              </div>
              {fields.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Empty canvas — pick a tool on the left to add the first field.
                  </CardContent>
                </Card>
              )}
              {fields.map((f, i) => (
                <Card key={f.id} className="group relative">
                  <CardContent className="space-y-2 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-1">
                      <GripVertical className="size-4 shrink-0 text-muted-foreground/50 sm:order-none" />
                      <Badge variant="secondary" className="min-w-0 max-w-full truncate text-[10px]">
                        <span className="mr-1.5 inline-flex items-center gap-1">
                          <span className="font-black">{i + 1}</span> <span className="truncate">{toolOf(f.type).label}</span>
                        </span>
                      </Badge>
                      {f.required && <Badge className="shrink-0 text-[10px]">required</Badge>}
                      <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => move(i, 1)} disabled={i === fields.length - 1} aria-label="Move down">
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => openSettings(f)} aria-label="Field settings">
                          <Settings2 className="size-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => removeField(i)} aria-label="Delete field">
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {/* live, exactly as the public page renders it */}
                    <RenderField field={f} value={f.type === "checkbox" ? false : ""} onChange={() => {}} disabled />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ============ PREVIEW ============ */}
        <TabsContent value="preview" className="flex-1">
          <Card className="mx-auto max-w-xl shadow-md">
            <CardHeader>
              <CardTitle className="text-xl">{title || "Untitled form"}</CardTitle>
              {description && <CardDescription className="whitespace-pre-wrap">{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-5">
              {fields.map((f) => (
                <RenderField key={f.id} field={f} value={f.type === "checkbox" ? false : ""} onChange={() => {}} disabled />
              ))}
              <Button disabled className="h-10 w-full sm:w-auto">Submit</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ SUBMISSIONS ============ */}
        <TabsContent value="subs" className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="outline">{subs?.length ?? "…"} responses</Badge>
            <Button variant="ghost" size="sm" onClick={loadSubs}>
              <RefreshCw className="mr-1.5 size-3.5" /> Refresh
            </Button>
          </div>
          {subs === null ? (
            <div className="space-y-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div>
          ) : subs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No responses yet — share the public link!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1">
              {subsTable && (
                <p className="text-xs text-muted-foreground">
                  table <code className="rounded bg-muted/60 px-1.5 py-0.5">{subsTable}</code>
                </p>
              )}
              {/* clean column grid: one column per FIELD, labeled headers */}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left">
                      <th className="whitespace-nowrap border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Submitted at</th>
                      {fields.map((f) => (
                        <th key={f.id} className="max-w-[220px] border-b border-border px-3 py-2 text-xs font-semibold">{f.label}</th>
                      ))}
                      <th className="w-10 border-b border-border px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((rowV) => (
                      <tr key={rowV.id} className="odd:bg-muted/20 transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap border-b border-border/50 px-3 py-2 text-xs tabular-nums text-muted-foreground">
                          {new Date(rowV.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                        </td>
                        {fields.map((f) => {
                          const col = (f as { col?: string }).col;
                          const cell = col ? rowV[col] : (rowV.data?.[f.id]);
                          return (
                            <td key={f.id} className="max-w-[220px] truncate border-b border-border/50 px-3 py-2" title={String(cell ?? "")}>
                              {f.type === "checkbox" ? (cell ? "Yes" : "No") : String(cell ?? "—") || "—"}
                            </td>
                          );
                        })}
                        <td className="border-b border-border/50 px-2 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="Delete response"
                            onClick={() =>
                              void fetch(`/api/forms/${id}/submissions?sid=${rowV.id}`, { method: "DELETE" }).then(() => loadSubs())
                            }
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* -------- field settings dialog -------- */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Field settings — {editing ? toolOf(editing.type).label : ""}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 py-1">
              <div className="grid gap-1.5">
                <Label>Question / label</Label>
                <Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} autoFocus />
              </div>
              {["text", "textarea", "email", "phone", "url", "number"].includes(editing.type) && (
                <div className="grid gap-1.5">
                  <Label>Placeholder</Label>
                  <Input value={editing.placeholder ?? ""} onChange={(e) => setEditing({ ...editing, placeholder: e.target.value })} />
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Help text (optional)</Label>
                <Input value={editing.helpText ?? ""} onChange={(e) => setEditing({ ...editing, helpText: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>DB column this field writes into (existing column of the linked table)</Label>
                <Input
                  value={(editing as { col?: string }).col ?? ""}
                  onChange={(e) => setEditing({ ...(editing as object), col: e.target.value } as FormField)}
                  placeholder={editing.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "column_name"}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground">leave empty to auto-derive from the label</p>
              </div>
              {(editing.type === "select" || editing.type === "radio" || editing.type === "multiselect") && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Where do the options come from?</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={((editing as { optionsSource?: { mode: string } }).optionsSource?.mode ?? "static") === "static" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditing({ ...(editing as object), optionsSource: { mode: "static" } } as FormField)}
                      >
                        Static list
                      </Button>
                      <Button
                        type="button"
                        variant={(editing as { optionsSource?: { mode: string } }).optionsSource?.mode === "table" ? "default" : "outline"}
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditing({ ...(editing as object), optionsSource: { mode: "table", column: (editing as { col?: string }).col || "" } } as FormField)}
                      >
                        From linked table
                      </Button>
                    </div>
                  </div>
                  {(editing as { optionsSource?: { mode: "table"; column: string } }).optionsSource?.mode === "table" ? (
                    <div className="grid gap-1.5">
                      <Label>Column to read options from (distinct values, live via API)</Label>
                      <Input
                        value={(editing as { optionsSource?: { mode: "table"; column: string } }).optionsSource?.column ?? ""}
                        onChange={(e) =>
                          setEditing({ ...(editing as object), optionsSource: { mode: "table", column: e.target.value } } as FormField)
                        }
                        placeholder="e.g. category"
                        className="font-mono text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">the public page calls the options API and shows up-to-date values</p>
                    </div>
                  ) : (
                    <div className="grid gap-1.5">
                      <Label>Options — one per line</Label>
                      <Textarea value={optText} onChange={(e) => setOptText(e.target.value)} className="min-h-[110px]" />
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
                <Label>Required field</Label>
                <Switch checked={editing.required} onCheckedChange={(v) => setEditing({ ...editing, required: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={applySettings}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FormBuilder;
