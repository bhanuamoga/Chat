"use client";

/**
 * Vercel Labs — json-render core.
 * Parses a model-emitted SpecNode tree and renders it with REAL shadcn components.
 * Interactive controls write into a shared form-state; "send" buttons interpolate
 * {{field}} templates and hand the message back to the chat (AI SDK useChat.append).
 */
import React, { createContext, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------- types */

export type SpecNode = {
  type: string;
  text?: string;
  children?: (string | SpecNode)[];
  props?: Record<string, unknown>;
};

export type UiSpec = { root: SpecNode };

type FormCtx = {
  values: Record<string, unknown>;
  setValue: (field: string, value: unknown) => void;
  send: (template: string) => void;
};

const Ctx = createContext<FormCtx | null>(null);
const useFormCtx = () => useContext(Ctx);

/* ---------------------------------------------------------------- utils */

const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));

const interpolate = (template: string, values: Record<string, unknown>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => str(values[k]));

function Node({ n, idx }: { n: string | SpecNode; idx?: number }) {
  if (typeof n === "string") return <span key={idx}>{n}</span>;
  return <SpecNodeRenderer key={idx} node={n} />;
}

function Kids({ list }: { list?: (string | SpecNode)[] }) {
  if (!list) return null;
  return (
    <>
      {list.map((c, i) => (
        <Node key={i} n={c} />
      ))}
    </>
  );
}

/** wrap an interactive control so it registers into the shared form state */
function useField(node: SpecNode, fallback: unknown) {
  const ctx = useFormCtx();
  const field = str(node.props?.field);
  const value = field && ctx ? (field in ctx.values ? ctx.values[field] : fallback) : fallback;
  const set = (v: unknown) => ctx && field && ctx.setValue(field, v);
  return { value, set };
}

/* ------------------------------------------------------------- registry */

type Renderer = (node: SpecNode, kids: React.ReactNode) => React.ReactNode;

const RENDERERS: Record<string, Renderer> = {
  section: (_, k) => <div className="flex flex-col gap-3">{k}</div>,
  heading: (n) => {
    const lvl = Number(n.props?.level) || 2;
    const cls =
      lvl === 1
        ? "text-xl font-bold tracking-tight"
        : lvl === 3
          ? "text-sm font-semibold"
          : "text-base font-semibold tracking-tight";
    return <p className={cn(cls, "text-foreground")}>{n.text}</p>;
  },
  text: (n) => <p className="text-sm leading-relaxed text-foreground/90">{n.text}</p>,
  badge: (n) => <Badge variant={(str(n.props?.variant, "default") as any)}>{n.text}</Badge>,
  separator: () => <Separator className="my-1" />,
  row: (_, k) => <div className="flex flex-wrap items-center gap-2">{k}</div>,
  column: (_, k) => <div className="flex flex-col gap-2">{k}</div>,
  grid: (n, k) => {
    const cols = Math.min(Math.max(Number(n.props?.cols) || 2, 2), 4);
    return (
      <div className={cn("grid gap-3", cols === 2 ? "grid-cols-2" : cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-4")}>
        {k}
      </div>
    );
  },

  card: (_, k) => <Card className="gap-4 py-4 shadow-2xs">{k}</Card>,
  cardHeader: (_, k) => <CardHeader className="px-4">{k}</CardHeader>,
  cardTitle: (n) => <CardTitle className="text-base">{n.text}</CardTitle>,
  cardDescription: (n) => <CardDescription>{n.text}</CardDescription>,
  cardContent: (_, k) => <CardContent className="space-y-3 px-4">{k}</CardContent>,
  cardFooter: (_, k) => <CardFooter className="gap-2 px-4">{k}</CardFooter>,

  alert: (n) => (
    <Alert variant={(str(n.props?.variant, "default") as any)}>
      <AlertTitle>{str(n.props?.title, "Note")}</AlertTitle>
      <AlertDescription>{n.text}</AlertDescription>
    </Alert>
  ),

  button: (n) => {
    const ctx = useFormCtx();
    // eslint-disable-next-line react-hooks/rules-of-hooks -- registry is a stable component map
    return (
      <Button
        size="sm"
        variant={(str(n.props?.variant, "default") as any)}
        onClick={() => {
          const action = str(n.props?.action, "toast");
          const msg = str(n.props?.message, n.text || "OK");
          if (action === "send" && ctx?.send) {
            ctx.send(interpolate(msg, ctx.values));
          } else {
            toast.success(msg);
          }
        }}
      >
        {n.text}
      </Button>
    );
  },

  field: (n, k) => (
    <div className="space-y-1.5 text-left">
      {!!n.props?.label && <Label>{str(n.props?.label)}</Label>}
      {k}
    </div>
  ),
  label: (n) => <Label className="text-xs">{n.text}</Label>,

  input: (n) => {
    const { value, set } = useField(n, "");
    return (
      <Input
        type={str(n.props?.inputType, "text")}
        placeholder={str(n.props?.placeholder)}
        value={str(value)}
        onChange={(e) => set(e.target.value)}
        className="h-10"
      />
    );
  },
  textarea: (n) => {
    const { value, set } = useField(n, "");
    return (
      <Textarea
        placeholder={str(n.props?.placeholder)}
        value={str(value)}
        onChange={(e) => set(e.target.value)}
        rows={3}
      />
    );
  },
  /* styled native select (project bundle has no shadcn Select); visually matches shadcn inputs */
  select: (n) => {
    const { value, set } = useField(n, "");
    const options: string[] = Array.isArray(n.props?.options) ? (n.props!.options as string[]) : [];
    return (
      <select
        value={str(value)}
        onChange={(e) => set(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-2xs outline-none transition-colors focus-visible:border-ring"
      >
        <option value="">{str(n.props?.placeholder, "Choose…")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  },
  switch: (n) => {
    const { value, set } = useField(n, false);
    return (
      <div className="flex items-center gap-2.5">
        <Switch checked={!!value} onCheckedChange={(v) => set(v)} />
        <Label className="text-sm font-normal">{str(n.props?.label)}</Label>
      </div>
    );
  },
  checkbox: (n) => {
    const { value, set } = useField(n, false);
    return (
      <div className="flex items-center gap-2.5">
        <Checkbox checked={!!value} onCheckedChange={(v) => set(v === true)} />
        <Label className="text-sm font-normal">{str(n.props?.label)}</Label>
      </div>
    );
  },

  kv: (n) => (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{str(n.props?.k)}</span>
      <span className="truncate font-medium">{str(n.props?.v)}</span>
    </div>
  ),
  stat: (n) => (
    <Card className="gap-0 py-3 shadow-2xs">
      <CardContent className="space-y-0.5 px-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{str(n.props?.k)}</p>
        <p className="text-lg font-bold tracking-tight">{str(n.props?.v)}</p>
        {!!n.props?.hint && <p className="text-[10px] text-muted-foreground/80">{str(n.props?.hint)}</p>}
      </CardContent>
    </Card>
  ),

  list: (_, k) => <ul className="list-disc space-y-1 pl-5 text-sm">{k}</ul>,
  li: (n) => <li>{n.text}</li>,

  table: (n, k) => {
    const head: string[] = Array.isArray(n.props?.head) ? (n.props!.head as string[]) : [];
    return (
      <div className="overflow-hidden rounded-lg border border-border/70">
        <table className="w-full text-[12.5px]">
          {head.length > 0 && (
            <thead>
              <tr className="bg-muted/50">
                {head.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>{k}</tbody>
        </table>
      </div>
    );
  },
  tr: (_, k) => <tr className="border-t border-border/50">{k}</tr>,
  td: (n) => <td className="px-3 py-1.5">{n.text}</td>,
  th: (n) => <th className="px-3 py-1.5 text-left font-semibold">{n.text}</th>,

  tabs: (n) => {
    const tabs = Array.isArray(n.props?.tabs) ? (n.props!.tabs as { label: string; content: SpecNode }[]) : [];
    if (!tabs.length) return null;
    return (
      <Tabs defaultValue="t0" className="w-full">
        <TabsList>
          {tabs.map((t, i) => (
            <TabsTrigger key={i} value={`t${i}`}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t, i) => (
          <TabsContent key={i} value={`t${i}`} className="mt-2.5">
            <SpecNodeRenderer node={t.content} />
          </TabsContent>
        ))}
      </Tabs>
    );
  },

  skeleton: (n) => <Skeleton className={cn("h-4 w-full", str(n.props?.className))} />,
};

function SpecNodeRenderer({ node }: { node: SpecNode }) {
  const render = RENDERERS[node.type];
  if (!render) {
    return (
      <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
        unsupported: {node.type}
        <Kids list={node.children} />
      </div>
    );
  }
  const kids = <Kids list={node.children} />;
  return <>{render(node, kids)}</>;
}

/* ------------------------------------------------------------- exports */

/** Render a parsed UiSpec. `onSend(text)` pipes button actions back into the chat. */
export function JsonRender({ spec, onSend }: { spec: UiSpec; onSend?: (text: string) => void }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const ctx = useMemo<FormCtx>(
    () => ({
      values,
      setValue: (field, value) => setValues((v) => ({ ...v, [field]: value })),
      send: (template) => {
        if (onSend) onSend(template);
        else toast.success(template);
      },
    }),
    [values, onSend]
  );
  return (
    <Ctx.Provider value={ctx}>
      <div className="w-full max-w-full overflow-hidden rounded-xl">
        <SpecNodeRenderer node={spec.root} />
      </div>
    </Ctx.Provider>
  );
}

/**
 * Split assistant text into markdown segments and jsonrender specs:
 * [{ kind: "text", content }, { kind: "ui", spec }]
 */
export function splitRenderSegments(text: string): ({ kind: "text"; content: string } | { kind: "ui"; spec: UiSpec })[] {
  const fence = /```jsonrender\s*([\s\S]*?)\s*```/;
  const match = text.match(fence);
  if (!match) return [{ kind: "text", content: text }];
  const before = text.slice(0, match.index).trim();
  const after = text.slice((match.index || 0) + match[0].length).trim();
  let spec: UiSpec | null = null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed && typeof parsed === "object" && parsed.root) spec = parsed as UiSpec;
  } catch {
    /* model emitted malformed json — show the raw text instead */
  }
  const out: ({ kind: "text"; content: string } | { kind: "ui"; spec: UiSpec })[] = [];
  if (before) out.push({ kind: "text", content: before });
  if (spec) out.push({ kind: "ui", spec });
  else out.push({ kind: "text", content: match[0] });
  if (after) out.push({ kind: "text", content: after });
  return out;
}
