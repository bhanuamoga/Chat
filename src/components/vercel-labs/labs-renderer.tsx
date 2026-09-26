/**
 * Vercel Labs — official json-render renderer.
 * defineRegistry + Renderer / providers from @json-render/react with the
 * @json-render/shadcn component set, plus custom Recharts-backed chart/stat
 * components (ported to the official registry from the previous hand-rolled core).
 */
"use client";

import React from "react";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  defineRegistry,
} from "@json-render/react";
import { createSpecStreamCompiler, type Spec } from "@json-render/core";
import { shadcnComponents } from "@json-render/shadcn";
import { Info, TrendingDown, TrendingUp } from "lucide-react";
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

import { labsCatalog } from "@/lib/vercel-labs/catalog";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/* --------------------------------------------------------------- palette */

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const str = (v: unknown, fb = ""): string => (typeof v === "string" ? v : v == null ? fb : String(v));

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

/* ----------------------------------------------------------- chart comp */

interface ChartProps {
  kind?: string | null;
  title?: string | null;
  data?: Record<string, unknown>[] | null;
  xKey?: string | null;
  yKeys?: string[] | null;
  bars?: string[] | null;
  lines?: string[] | null;
  height?: number | null;
}

/** "Chart" — Recharts-backed, kinds: bar | area | line | mixed | pie | donut | radial | radar | scatter | gantt */
function ChartImpl({ props }: { props: ChartProps }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const p = props;
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
    const yKeys = numericKeys.filter((k) => k !== "x");
    chart = (
      <ScatterChart margin={{ top: 8, bottom: 8 }}>
        {grid}
        <XAxis dataKey={"x"} type="number" {...axis} />
        <YAxis type="number" {...axis} width={44} />
        {tip}
        {yKeys.map((k, i) => (
          <Scatter key={k} name={k} data={data} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
        ))}
        {yKeys.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} /> : null}
      </ScatterChart>
    );
  } else if (kind === "gantt") {
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
    const bars: string[] = Array.isArray(p.bars) && p.bars.length ? p.bars : numericKeys.slice(0, 1);
    const lines: string[] = Array.isArray(p.lines) && p.lines.length ? p.lines : numericKeys.slice(1);
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
    <div className="w-full pt-1" style={{ height: p.height ?? 256 }}>
      {p.title ? <div className="mb-2 px-1 text-sm font-semibold text-foreground">{p.title}</div> : null}
      <div style={{ height: (p.height ?? 256) - (p.title ? 30 : 0) }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** "Gauge" — single circular 0..100 progress with center label */
function GaugeImpl({ props }: { props: { value?: number | null; label?: string | null; detail?: string | null } }) {
  const value = Math.max(0, Math.min(100, Number(props.value) || 0));
  return (
    <div className="w-full" style={{ height: 190 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="50%" innerRadius="62%" outerRadius="92%" startAngle={90} endAngle={-270} barSize={14} data={[{ v: 100 }, { v: value }]}>
          <RadialBar dataKey="v" cornerRadius={10}>
            <Cell fill="color-mix(in srgb, var(--muted) 55%, transparent)" />
            <Cell fill="var(--chart-2)" />
          </RadialBar>
          <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" style={{ fill: "var(--foreground)", fontSize: 18, fontWeight: 700 }}>
            {`${value}%`}
          </text>
          {props.label ? (
            <text x="50%" y="64%" textAnchor="middle" style={{ fill: "var(--muted-foreground)", fontSize: 11 }}>
              {props.label}
            </text>
          ) : null}
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** "SparklineStat" — stat card with a mini sparkline behind the value */
function SparklineStatImpl({ props }: { props: { label: string; value: string; hint?: string | null; values?: number[] | null } }) {
  const values = Array.isArray(props.values) ? props.values : [];
  const data = values.map((v, i) => ({ i, v }));
  return (
    <Card className="gap-0 overflow-hidden py-3 shadow-2xs">
      <CardContent className="px-4 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{props.label}</p>
        <p className="text-lg font-bold tracking-tight">{props.value}</p>
        {props.hint ? <p className="text-[10px] text-muted-foreground/80">{props.hint}</p> : null}
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

function MetricImpl({ props }: { props: { label: string; value: string; detail?: string | null; trend?: string | null } }) {
  return (
    <Card className="gap-0 py-4 shadow-2xs">
      <CardContent className="px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{props.label}</p>
          {props.trend === "up" ? (
            <TrendingUp className="size-3.5 text-emerald-500" />
          ) : props.trend === "down" ? (
            <TrendingDown className="size-3.5 text-rose-500" />
          ) : null}
        </div>
        <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{props.value}</p>
        {props.detail ? <p className="mt-0.5 text-[10px] text-muted-foreground/80">{props.detail}</p> : null}
      </CardContent>
    </Card>
  );
}

function TableImpl({ props }: { props: { data: Record<string, unknown>[]; columns: { key: string; label: string }[]; emptyMessage?: string | null } }) {
  const rows = props.data ?? [];
  const cols = props.columns ?? [];
  if (!rows.length)
    return <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">{props.emptyMessage ?? "No data"}</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            {cols.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
              {cols.map((c) => {
                const v = r[c.key];
                return (
                  <td key={c.key} className="whitespace-nowrap px-3 py-2 text-foreground">
                    {v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalloutImpl({ props }: { props: { title?: string | null; text: string; tone?: string | null } }) {
  const tone = props.tone ?? "default";
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "error"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : tone === "info"
          ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          : "border-border bg-muted/50 text-foreground";
  return (
    <div className={`flex gap-2.5 rounded-xl border px-3.5 py-3 ${cls}`}>
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        {props.title ? <div className="mb-0.5 text-sm font-semibold">{props.title}</div> : null}
        <div className="text-[13px] leading-relaxed opacity-90">{props.text}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- registry */

const { registry } = defineRegistry(labsCatalog, {
  components: {
    Card: shadcnComponents.Card,
    Stack: shadcnComponents.Stack,
    Grid: shadcnComponents.Grid,
    Heading: shadcnComponents.Heading,
    Separator: shadcnComponents.Separator,
    Badge: shadcnComponents.Badge,
    Alert: shadcnComponents.Alert,
    Button: shadcnComponents.Button,
    Accordion: shadcnComponents.Accordion,
    Tabs: shadcnComponents.Tabs,
    Input: shadcnComponents.Input,
    Textarea: shadcnComponents.Textarea,
    Select: shadcnComponents.Select,
    Switch: shadcnComponents.Switch,
    Checkbox: shadcnComponents.Checkbox,
    Slider: shadcnComponents.Slider,
    Progress: shadcnComponents.Progress,
    Skeleton: shadcnComponents.Skeleton,
    Text: ({ props }: any) => (
      <p className={`text-sm leading-relaxed ${props.muted ? "text-muted-foreground" : "text-foreground"}`}>{props.content}</p>
    ),
    Label: ({ props }: any) => (
      <label htmlFor={props.htmlFor ?? undefined} className="text-xs font-medium text-muted-foreground">
        {props.text}
      </label>
    ),
    Metric: MetricImpl as any,
    Table: TableImpl as any,
    Callout: CalloutImpl as any,
    Link: ({ props }: any) => (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        {props.text}
      </a>
    ),
    Chart: ChartImpl as any,
    Gauge: GaugeImpl as any,
    SparklineStat: SparklineStatImpl as any,
  },
  actions: {
    /* chat-thread wiring lives in LabsRenderer's ActionProvider handlers */
    sendToChat: async () => {},
  },
});

/* -------------------------------------------------- streaming parse */

export interface LabsSpecRender {
  lead: string;
  tail: string;
  spec: Spec | null;
  streaming: boolean;
}

const FENCE_RE = /```(?:jsonrender|spec)[ \t]*\r?\n?/;

/** Splits assistant text around the official spec fence and compiles the
 *  JSONL RFC-6902 patch stream into a live Spec via the official compiler. */
export function parseLabsOutput(text: string): LabsSpecRender {
  const m = FENCE_RE.exec(text);
  if (!m) return { lead: text, tail: "", spec: null, streaming: false };
  const lead = text.slice(0, m.index);
  const bodyStart = m.index + m[0].length;
  const close = text.indexOf("```", bodyStart);
  const closed = close !== -1;
  const body = text.slice(bodyStart, closed ? close : undefined);
  const tail = closed ? text.slice(close + 3) : "";

  let spec: Spec | null = tryWholeJson(body);
  if (!spec) {
    const compiler = createSpecStreamCompiler();
    for (const line of body.split("\n")) {
      if (!line.trim()) continue;
      try {
        compiler.push(line + "\n");
      } catch {
        /* tolerate partial stream lines */
      }
    }
    const result = compiler.getResult() as unknown as Spec;
    if (result?.root && result?.elements && Object.keys(result.elements).length) spec = result;
  }
  return { lead, tail, spec, streaming: !closed };
}

function tryWholeJson(body: string): Spec | null {
  try {
    const j = JSON.parse(body.trim());
    if (j && typeof j === "object" && j.root && j.elements) return j as Spec;
  } catch {
    /* not a single JSON object */
  }
  return null;
}

/* ----------------------------------------------------------- renderer */

export function LabsRenderer({
  spec,
  loading,
  onSend,
}: {
  spec: Spec;
  loading?: boolean;
  onSend?: (text: string) => void;
}) {
  return (
    <StateProvider initialState={(spec as any).state ?? {}}>
      <VisibilityProvider>
        <ActionProvider
          {...({ handlers: { sendToChat: async (params: any) => onSend?.(String(params?.message ?? params ?? "Continue")) } } as any)}
        >
          <Renderer
            spec={spec}
            registry={registry as any}
            loading={loading}
            fallback={() => <Skeleton className="h-16 w-full rounded-xl" />}
          />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
  );
}

export default LabsRenderer;
