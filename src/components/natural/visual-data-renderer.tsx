"use client";

import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ZAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Info,
  Sparkles,
  BarChart3,
  ChartPie,
  Radar as RadarIcon,
  ChartScatter,
  Table as TableIcon,
  ExternalLink,
  Globe,
} from "lucide-react";
import type { SourceRef, VisualChart, VisualData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { normalizeSourceRef } from "@/lib/utils";

/** Site thumbnail: real favicon (large) with a graceful letter fallback. */
function SourceFavicon({ domain, size }: { domain: string; size: number }) {
  const [failed, setFailed] = React.useState(false);
  if (!domain || failed) {
    return (
      <span
        className="flex items-center justify-center rounded-lg bg-primary/12 font-bold uppercase text-primary"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {(domain || "↗").slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="rounded-lg object-contain drop-shadow-sm"
      style={{ width: size, height: size }}
    />
  );
}

/** Clickable source/citation cards — Perplexity-style: image on top, text below,
 *  one shadcn Card per source; duplicates (same site+title) are merged. */
export function SourceCards({ sources, bare }: { sources: SourceRef[]; bare?: boolean }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  /* normalize + dedupe (also heals legacy rows stored before normalization) */
  const seen = new Set<string>();
  const list = sources
    .map((s) => normalizeSourceRef(s))
    .filter((s) => {
      const key = `${s.domain.toLowerCase()}|${(s.title || "").toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);

  if (!list.length) return null;

  return (
    <div className={bare ? "w-full" : "w-full pt-3.5 border-t border-border/50"}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Globe className="size-3.5 text-primary" />
        Sources
        <span className="normal-case font-normal text-muted-foreground/70">
          · {list.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {list.map((s, i) => {
          const titleLine = s.title || s.domain || "Web source";
          const subLine = s.domain && s.domain !== titleLine ? s.domain : null;
          return (
            <a
              key={`${s.url}-${i}`}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group block"
            >
              <Card className="h-full overflow-hidden gap-0 border-border/70 shadow-2xs py-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                {/* image area */}
                <div className="relative flex h-20 items-center justify-center bg-gradient-to-br from-primary/[0.08] via-muted/50 to-muted/25">
                  <SourceFavicon domain={s.domain} size={34} />
                  <ExternalLink className="absolute right-2 top-2 size-3 text-muted-foreground/60 transition-colors group-hover:text-primary" />
                </div>
                {/* text area */}
                <CardContent className="px-3 py-2.5">
                  <p className="line-clamp-2 text-[12px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
                    {titleLine}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {subLine && (
                      <span className="truncate">{subLine}</span>
                    )}
                    {!subLine && s.domain && <span className="truncate">{s.domain}</span>}
                  </div>
                </CardContent>
              </Card>
            </a>
          );
        })}
      </div>
    </div>
  );
}

interface VisualDataRendererProps {
  data: VisualData | null | undefined;
}

const PALETTE = [
  "#00a884",
  "#2563eb",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#10b981",
  "#f43f5e",
  "#06b6d4",
];

/* Normalize whatever the model emits into a supported chart type */
function normalizeChartType(raw: string | undefined): string {
  const t = (raw || "bar").toLowerCase().trim();
  if (t === "doughnut" || t === "donut") return "donut";
  if (t === "circle") return "pie";
  return t;
}

function chartTypeBadgeLabel(type: string): string {
  return type.toUpperCase();
}

/** shadcn-style chart tooltip: dark border card, series dots, bold values */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-[110px] max-w-[240px] rounded-xl border border-border/80 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-sm">
      {label !== undefined && label !== null && (
        <p className="mb-1 truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {String(label)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: entry.stroke || entry.color || entry.payload?.fill || "hsl(var(--primary))" }}
              />
              <span className="truncate">{String(entry.name ?? "")}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">
              {typeof entry.value === "number" ? entry.value.toLocaleString() : String(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fully dynamic chart: chooses rendering purely from chart.type      */
/* ------------------------------------------------------------------ */
function DynamicChart({ chart }: { chart: VisualChart }) {
  const type = normalizeChartType(chart.type);
  const gid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const nameKey = chart.xKey || "name";
  const valueKeys =
    Array.isArray(chart.yKeys) && chart.yKeys.length > 0 ? chart.yKeys : ["value"];

  /* ---- Pie / Donut: slices are rows (name = xKey, value = yKeys[0]) ---- */
  if (type === "pie" || type === "donut") {
    const pieData = chart.data.map((row) => ({
      name: String(row[nameKey] ?? ""),
      value: Number(row[valueKeys[0]]) || 0,
    }));
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="46%"
            innerRadius={type === "donut" ? "52%" : 0}
            outerRadius="78%"
            paddingAngle={2}
            stroke="none"
            label={false}
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  /* ---- Radar: multi-metric profile across categories ---- */
  if (type === "radar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chart.data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid opacity={0.25} />
          <PolarAngleAxis dataKey={nameKey} tick={{ fontSize: 10 }} />
          <PolarRadiusAxis tick={{ fontSize: 9 }} />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          {valueKeys.map((k, i) => (
            <Radar
              key={k}
              name={k}
              dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              fill={PALETTE[i % PALETTE.length]}
              fillOpacity={0.28}
            />
          ))}
          {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  /* ---- Scatter: correlation between numeric x and y ---- */
  if (type === "scatter") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="x" type="number" name={nameKey} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis dataKey="y" type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} width={44} />
          <ZAxis range={[60, 120]} />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--muted-foreground) / 0.35)", strokeDasharray: "4 4" }} />
          {valueKeys.map((k, i) => (
            <Scatter
              key={k}
              name={k}
              fill={PALETTE[i % PALETTE.length]}
              data={chart.data.map((row) => ({
                x: Number(row[nameKey]) || 0,
                y: Number(row[k]) || 0,
              }))}
            />
          ))}
          {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />}
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  /* ---- Line ---- */
  if (type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chart.data}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey={nameKey} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} width={44} />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          {valueKeys.map((k, i) => (
            <Line
              key={k}
              type="monotone"
              dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2.5}
              dot={{ r: 2.5, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          ))}
          {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  /* ---- Area ---- */
  if (type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chart.data} margin={{ top: 8 }}>
          <defs>
            {valueKeys.map((k, i) => (
              <linearGradient key={k} id={`${gid}-ag-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
          <XAxis dataKey={nameKey} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} />
          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} width={44} />
          <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
          {valueKeys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 3.5 }}
              fill={`url(#${gid}-ag-${i})`}
            />
          ))}
          {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  /* ---- Bar (default fallback for any unknown type) ---- */
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chart.data} margin={{ top: 8 }}>
        <defs>
          {valueKeys.map((k, i) => (
            <linearGradient key={k} id={`${gid}-bg-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.95} />
              <stop offset="100%" stopColor={PALETTE[i % PALETTE.length]} stopOpacity={0.55} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
        <XAxis dataKey={nameKey} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickMargin={6} width={44} />
        <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
        {valueKeys.map((k, i) => (
          <Bar key={k} dataKey={k} fill={`url(#${gid}-bg-${i})`} radius={[7, 7, 0, 0]} maxBarSize={56} />
        ))}
        {valueKeys.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />}
      </BarChart>
    </ResponsiveContainer>
  );
}

function ChartIcon({ type }: { type: string }) {
  const t = normalizeChartType(type);
  const cls = "size-4 text-primary";
  if (t === "pie" || t === "donut") return <ChartPie className={cls} />;
  if (t === "radar") return <RadarIcon className={cls} />;
  if (t === "scatter") return <ChartScatter className={cls} />;
  if (t === "line" || t === "area") return <TrendingUp className={cls} />;
  return <BarChart3 className={cls} />;
}

export function VisualDataRenderer({ data }: VisualDataRendererProps) {
  if (!data) return null;

  const hasMetrics = Array.isArray(data.metrics) && data.metrics.length > 0;
  const hasChart = data.chart && Array.isArray(data.chart.data) && data.chart.data.length > 0;
  const hasTable = data.table && Array.isArray(data.table.rows) && data.table.rows.length > 0;
  const hasSources = Array.isArray(data.sources) && data.sources.length > 0;

  if (!hasMetrics && !hasChart && !hasTable && !hasSources && !data.summary && !data.callout) {
    return null;
  }

  const chartType = hasChart ? normalizeChartType(data.chart!.type) : null;

  return (
    <div className="mt-3.5 space-y-3.5 pt-3 border-t border-border/50 text-foreground w-full">
      {/* 1. Analytics Header / Summary */}
      {data.summary && (
        <div className="flex items-start gap-2 text-xs font-semibold text-primary bg-primary/10 border border-primary/20 rounded-lg p-2.5">
          <Sparkles className="size-4 shrink-0 mt-0.5 text-primary" />
          <span className="leading-tight">{data.summary}</span>
        </div>
      )}

      {/* 2. Key Metrics Cards (KPI Analytics) */}
      {hasMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.metrics!.map((m, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-border/80 bg-card/80 p-2.5 shadow-2xs flex flex-col justify-between"
            >
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {m.label}
              </span>
              <div className="flex items-baseline justify-between gap-1 mt-1">
                <span className="text-base sm:text-lg font-bold tracking-tight text-foreground">
                  {m.value}
                </span>
                {m.change && (
                  <span
                    className={`inline-flex items-center text-[10px] font-semibold ${
                      m.trend === "up"
                        ? "text-emerald-500"
                        : m.trend === "down"
                          ? "text-rose-500"
                          : "text-muted-foreground"
                    }`}
                  >
                    {m.trend === "up" ? (
                      <TrendingUp className="size-3 mr-0.5" />
                    ) : m.trend === "down" ? (
                      <TrendingDown className="size-3 mr-0.5" />
                    ) : null}
                    {m.change}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Fully Dynamic Chart — bar, line, area, pie, donut, radar, scatter */}
      {hasChart && (
        <div className="rounded-xl border border-border/80 bg-card/90 p-3 sm:p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ChartIcon type={data.chart!.type} />
              <h4 className="text-xs font-semibold text-foreground">{data.chart!.title}</h4>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              {chartTypeBadgeLabel(chartType || "bar")}
            </Badge>
          </div>

          <div className="w-full h-56 sm:h-64 pt-2">
            <DynamicChart chart={data.chart!} />
          </div>

          {data.chart!.description && (
            <p className="text-[11px] text-muted-foreground pt-1">{data.chart!.description}</p>
          )}
        </div>
      )}

      {/* 4. Structured Data Table */}
      {hasTable && (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-2xs">
          {data.table!.title && (
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-1.5 bg-muted/40">
              <TableIcon className="size-3.5 text-primary" />
              <span className="text-xs font-semibold">{data.table!.title}</span>
            </div>
          )}
          <div className="overflow-x-auto nice-scroll max-w-full">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/80 bg-muted/50 font-semibold text-muted-foreground">
                  {data.table!.headers.map((h, i) => (
                    <th key={i} className="p-2 sm:px-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-mono">
                {data.table!.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-muted/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="p-2 sm:px-3 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Smart Action Callout */}
      {data.callout && (
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 border border-border/60 p-2.5 text-xs text-foreground">
          <Info className="size-4 shrink-0 mt-0.5 text-primary" />
          <p className="leading-relaxed">{data.callout.text}</p>
        </div>
      )}

      {/* 6. Clickable source/citation cards */}
      {hasSources && <SourceCards sources={data.sources!} bare />}
    </div>
  );
}
