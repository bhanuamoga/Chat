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
import {
  ResponsiveContainer,
  BarChart,
  AreaChart,
  LineChart,
  ComposedChart,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  RadarChart,
  Radar,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  Bar,
  Area,
  Line,
  Cell,
} from "recharts";
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
  uid: string;
};

const Ctx = createContext<FormCtx | null>(null);
const useFormCtx = () => useContext(Ctx);

/* ---------------------------------------------------------------- utils */

const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));

const interpolate = (template: string, values: Record<string, unknown>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, k) => str(values[k]));

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[110px] rounded-xl border border-border/80 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      {label != null && (
        <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{String(label)}</p>
      )}
      <div className="space-y-1">
        {payload.map((e: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span className="size-2 shrink-0 rounded-full" style={{ background: e.stroke || e.color || e.payload?.fill || "var(--chart-1)" }} />
              <span className="truncate">{String(e.name ?? "")}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {typeof e.value === "number" ? e.value.toLocaleString() : String(e.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "chart" node — Recharts-backed, kinds: bar | area | line | mixed (bars+lines) */
function ChartNode({ node, uid }: { node: SpecNode; uid: string }) {
  const p = node.props || {};
  const kind = str(p.kind, "bar");
  const gid = `${uid}-g`;
  const data = (Array.isArray(p.data) ? p.data : []) as Record<string, unknown>[];
  const xKey = str(p.xKey, "name");
  if (!data.length) {
    return <Skeleton className="h-40 w-full rounded-lg" />;
  }
  const numericKeys = Object.keys(data[0]).filter((k) => k !== xKey && typeof data[0][k] === "number");
  if (!numericKeys.length) return null;
  const axis = {
    tick: { fontSize: 11, fill: "var(--muted-foreground)" },
    tickLine: false,
    axisLine: { stroke: "color-mix(in srgb, var(--muted-foreground) 25%, transparent)" },
    tickMargin: 6,
  } as const;
  const grid = <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />;
  const tip = <RechartsTooltip content={<ChartTip />} cursor={{ fill: "color-mix(in srgb, var(--muted) 50%, transparent)" }} />;
  const legend = numericKeys.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} /> : null;
  const defs = (count: number, prefix: string, alpha: [number, number]) => (
    <defs>
      {Array.from({ length: count }).map((_, i) => (
        <linearGradient key={i} id={`${gid}-${prefix}-${i}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={alpha[0]} />
          <stop offset="100%" stopColor={CHART_PALETTE[i % CHART_PALETTE.length]} stopOpacity={alpha[1]} />
        </linearGradient>
      ))}
    </defs>
  );

  let chart: React.ReactNode = null;
  if (kind === "pie" || kind === "donut") {
    const valueKey = numericKeys[0];
    const total = data.reduce((s, r) => s + (Number(r[valueKey]) || 0), 0);
    chart = (
      <PieChart>
        <Pie
          data={data}
          dataKey={valueKey}
          nameKey={xKey}
          cx="50%"
          cy="50%"
          innerRadius={kind === "donut" ? "55%" : 0}
          outerRadius="72%"
          paddingAngle={2}
          stroke="none"
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Pie>
        {kind === "donut" && (
          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--foreground)", fontSize: 14, fontWeight: 700 }}>
            {total.toLocaleString()}
          </text>
        )}
        <RechartsTooltip content={<ChartTip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
      </PieChart>
    );
  } else if (kind === "radial") {
    const valueKey = numericKeys[0];
    chart = (
      <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="95%" barSize={12} data={data}>
        <RadialBar dataKey={valueKey} cornerRadius={8} background={{ fill: "color-mix(in srgb, var(--muted) 60%, transparent)" }}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </RadialBar>
        {tip}
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
      </RadialBarChart>
    );
  } else if (kind === "gauge") {
    /* { value: 0-100, label? } — single circular progress gauge with center text */
    const value = Math.max(0, Math.min(100, Number(p.value ?? (data[0]?.[numericKeys[0]] as number) ?? 0)));
    const label = str(p.label, `${value}%`);
    chart = (
      <RadialBarChart cx="50%" cy="50%" innerRadius="62%" outerRadius="92%" startAngle={90} endAngle={-270} barSize={14} data={[{ v: 100 }, { v: value }]}>
        <RadialBar dataKey="v" cornerRadius={10}>
          <Cell fill="color-mix(in srgb, var(--muted) 55%, transparent)" />
          <Cell fill="var(--chart-2)" />
        </RadialBar>
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--foreground)", fontSize: 16, fontWeight: 700 }}>
          {label}
        </text>
      </RadialBarChart>
    );
  } else if (kind === "radar") {
    chart = (
      <RadarChart cx="50%" cy="50%" outerRadius="72%" data={data}>
        <PolarGrid stroke="color-mix(in srgb, var(--muted-foreground) 20%, transparent)" />
        <PolarAngleAxis dataKey={xKey} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <PolarRadiusAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} />
        {numericKeys.map((k, i) => (
          <Radar key={k} dataKey={k} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} fill={CHART_PALETTE[i % CHART_PALETTE.length]} fillOpacity={0.3} strokeWidth={2} />
        ))}
        {tip}
        {legend}
      </RadarChart>
    );
  } else if (kind === "scatter") {
    /* rows { x, y } (or numeric series in `lines` style) — one scatter cloud per numeric series after x */
    const yKeys = numericKeys.filter((k) => k !== "x");
    const xk = "x";
    chart = (
      <ScatterChart margin={{ top: 8, bottom: 8 }}>
        {grid}
        <XAxis dataKey={xk} type="number" {...axis} />
        <YAxis type="number" {...axis} width={44} />
        {tip}
        {yKeys.map((k, i) => (
          <Scatter key={k} name={k} data={data} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
        ))}
        {yKeys.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} /> : null}
      </ScatterChart>
    );
  } else if (kind === "gantt") {
    /* rows { task, start, duration } — horizontal stacked bars */
    const startBar = "start" in data[0] ? "start" : xKey;
    const durBar = "duration" in data[0] ? "duration" : numericKeys[numericKeys.length - 1];
    chart = (
      <BarChart data={data} layout="vertical" margin={{ top: 8, left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
        <XAxis type="number" {...axis} />
        <YAxis dataKey="task" type="category" width={96} {...axis} />
        {tip}
        <Bar dataKey={startBar} stackId="g" fill="transparent" />
        <Bar dataKey={durBar} stackId="g" radius={[0, 8, 8, 0]} maxBarSize={18}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    );
  } else if (kind === "area") {
    chart = (
      <AreaChart data={data} margin={{ top: 8 }}>
        {defs(numericKeys.length, "a", [0.35, 0.03])}
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        {tip}
        {numericKeys.map((k, i) => (
          <Area key={k} type="monotone" dataKey={k} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2.25} dot={false} activeDot={{ r: 3.5 }} fill={`url(#${gid}-a-${i})`} />
        ))}
        {legend}
      </AreaChart>
    );
  } else if (kind === "line") {
    chart = (
      <LineChart data={data} margin={{ top: 8 }}>
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        {tip}
        {numericKeys.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={CHART_PALETTE[i % CHART_PALETTE.length]} strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        ))}
        {legend}
      </LineChart>
    );
  } else if (kind === "mixed") {
    /* bars + lines in one ComposedChart */
    const bars: string[] = Array.isArray(p.bars) && (p.bars as string[]).length ? (p.bars as string[]) : numericKeys.slice(0, 1);
    const lines: string[] = Array.isArray(p.lines) && (p.lines as string[]).length ? (p.lines as string[]) : numericKeys.slice(1);
    chart = (
      <ComposedChart data={data} margin={{ top: 8 }}>
        {defs(bars.length, "mb", [0.95, 0.6])}
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        {tip}
        {bars.map((k, i) => (
          <Bar key={k} dataKey={k} fill={`url(#${gid}-mb-${i})`} radius={[8, 8, 0, 0]} maxBarSize={44} />
        ))}
        {lines.map((k, i) => (
          <Line key={k} type="monotone" dataKey={k} stroke={CHART_PALETTE[(bars.length + i) % CHART_PALETTE.length]} strokeWidth={2.5} dot={{ r: 2.5, strokeWidth: 0 }} activeDot={{ r: 4 }} />
        ))}
        {bars.length + lines.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} /> : null}
      </ComposedChart>
    );
  } else {
    /* bar (default): single series -> per-BLOCK chart-1..5 */
    chart = (
      <BarChart data={data} margin={{ top: 8 }}>
        {defs(numericKeys.length === 1 ? data.length : numericKeys.length, "b", [0.95, 0.6])}
        {grid}
        <XAxis dataKey={xKey} {...axis} />
        <YAxis {...axis} width={44} />
        {tip}
        {numericKeys.map((k, i) =>
          numericKeys.length === 1 ? (
            <Bar key={k} dataKey={k} radius={[8, 8, 0, 0]} maxBarSize={52}>
              {data.map((_, bi) => (
                <Cell key={bi} fill={`url(#${gid}-b-${bi})`} />
              ))}
            </Bar>
          ) : (
            <Bar key={k} dataKey={k} fill={`url(#${gid}-b-${i})`} radius={[8, 8, 0, 0]} maxBarSize={44} />
          )
        )}
        {legend}
      </BarChart>
    );
  }
  return (
    <div className="w-full pt-1" style={{ height: 256 }}>
      <ResponsiveContainer width="100%" height="100%">
        {chart as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/** "statChart" — stat card with a mini sparkline behind the value */
function StatChartNode({ node }: { node: SpecNode }) {
  const p = node.props || {};
  const values = (Array.isArray(p.values) ? (p.values as number[]) : []) as number[];
  const data = values.map((v, i) => ({ i, v }));
  return (
    <Card className="gap-0 overflow-hidden py-3 shadow-2xs">
      <CardContent className="px-4 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{str(p.k)}</p>
        <p className="text-lg font-bold tracking-tight">{str(p.v)}</p>
        {!!p.hint && <p className="text-[10px] text-muted-foreground/80">{str(p.hint)}</p>}
      </CardContent>
      {data.length > 1 && (
        <div className="h-10 w-full px-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <Area type="monotone" dataKey="v" stroke="var(--chart-2)" strokeWidth={2} dot={false} fill="var(--chart-2)" fillOpacity={0.25} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

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
      <div className="max-w-full overflow-x-auto rounded-lg border border-border/70">
        <table className="w-max min-w-full text-[12.5px]">
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
  td: (n) => <td className="whitespace-nowrap px-3 py-1.5">{n.text}</td>,
  th: (n) => <th className="whitespace-nowrap px-3 py-1.5 text-left font-semibold">{n.text}</th>,

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
  if (node.type === "chart") {
    const ctx = useFormCtx();
    return <ChartNode node={node} uid={ctx?.uid || "jr0"} />;
  }
  if (node.type === "statChart") return <StatChartNode node={node} />;
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
  const uid = React.useRef(`jr${Math.random().toString(36).slice(2, 8)}`).current;
  const ctx = useMemo<FormCtx>(
    () => ({
      uid,
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
export type RenderSegment =
  | { kind: "text"; content: string }
  | { kind: "ui"; spec: UiSpec }
  | { kind: "ui-pending" };

export function splitRenderSegments(text: string): RenderSegment[] {
  /* UNCLOSED fence (still streaming) — never flash raw JSON: hide it, show a pending chip */
  const openMatch = text.match(/```jsonrender\s*$/i) || text.match(/```jsonrender\s*[\s\S]+$/i);
  const closed = /```jsonrender\s*([\s\S]*?)\s*```/.test(text);
  if (!closed) {
    const openIdx = text.search(/```jsonrender\s*$/i);
    if (openIdx >= 0) {
      const before = text.slice(0, openIdx).trim();
      const out: RenderSegment[] = [];
      if (before) out.push({ kind: "text", content: before });
      out.push({ kind: "ui-pending" });
      return out;
    }
    const openIdx2 = text.indexOf("```jsonrender");
    if (openIdx2 >= 0 && !closed) {
      const before = text.slice(0, openIdx2).trim();
      const out: RenderSegment[] = [];
      if (before) out.push({ kind: "text", content: before });
      out.push({ kind: "ui-pending" });
      return out;
    }
    return [{ kind: "text", content: text }];
  }
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
