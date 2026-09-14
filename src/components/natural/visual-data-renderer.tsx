"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Info,
  Sparkles,
  BarChart3,
  Table as TableIcon,
} from "lucide-react";
import type { VisualData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface VisualDataRendererProps {
  data: VisualData | null | undefined;
}

const PALETTE = ["#00a884", "#2563eb", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981"];

export function VisualDataRenderer({ data }: VisualDataRendererProps) {
  if (!data) return null;

  const hasMetrics = Array.isArray(data.metrics) && data.metrics.length > 0;
  const hasChart = data.chart && Array.isArray(data.chart.data) && data.chart.data.length > 0;
  const hasTable = data.table && Array.isArray(data.table.rows) && data.table.rows.length > 0;

  if (!hasMetrics && !hasChart && !hasTable && !data.summary && !data.callout) {
    return null;
  }

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

      {/* 3. Interactive Chart (Bar, Line, Area) */}
      {hasChart && (
        <div className="rounded-xl border border-border/80 bg-card/90 p-3 sm:p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="size-4 text-primary" />
              <h4 className="text-xs font-semibold text-foreground">{data.chart!.title}</h4>
            </div>
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              {data.chart!.type}
            </Badge>
          </div>

          <div className="w-full h-52 sm:h-60 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {data.chart!.type === "line" ? (
                <LineChart data={data.chart!.data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey={data.chart!.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  {data.chart!.yKeys.map((k, i) => (
                    <Line
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={PALETTE[i % PALETTE.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              ) : data.chart!.type === "area" ? (
                <AreaChart data={data.chart!.data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey={data.chart!.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  {data.chart!.yKeys.map((k, i) => (
                    <Area
                      key={k}
                      type="monotone"
                      dataKey={k}
                      stroke={PALETTE[i % PALETTE.length]}
                      fill={PALETTE[i % PALETTE.length]}
                      fillOpacity={0.2}
                    />
                  ))}
                </AreaChart>
              ) : (
                <BarChart data={data.chart!.data}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey={data.chart!.xKey} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={35} />
                  <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  {data.chart!.yKeys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      fill={PALETTE[i % PALETTE.length]}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
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
    </div>
  );
}
