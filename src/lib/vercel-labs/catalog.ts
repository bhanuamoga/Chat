/**
 * Vercel Labs — official json-render catalog.
 * defineCatalog from @json-render/core with the @json-render/shadcn catalog
 * subset + our custom chart/stat components. labsCatalog.prompt() generates
 * the exact system prompt the AI SDK route serves to the model.
 */
import { defineCatalog } from "@json-render/core";
import { schema as reactSchema } from "@json-render/react/schema";
import { shadcnComponentDefinitions as S } from "@json-render/shadcn/catalog";
import { z } from "zod";

const rows = z.array(z.record(z.string(), z.unknown()));

export const labsCatalog = defineCatalog(reactSchema, {
  components: {
    /* — shadcn building blocks (official defs, rendered by @json-render/shadcn) — */
    Card: S.Card,
    Stack: S.Stack,
    Grid: S.Grid,
    Heading: S.Heading,
    Separator: S.Separator,
    Badge: S.Badge,
    Alert: S.Alert,
    Button: S.Button,
    Accordion: S.Accordion,
    Tabs: S.Tabs,
    Input: S.Input,
    Textarea: S.Textarea,
    Select: S.Select,
    Switch: S.Switch,
    Checkbox: S.Checkbox,
    Slider: S.Slider,
    Progress: S.Progress,
    Skeleton: S.Skeleton,

    /* — chat-oriented custom components (our own implementations) — */
    Text: {
      props: z.object({
        content: z.string(),
        muted: z.boolean().nullable(),
      }),
      slots: [],
      description: "Text content paragraph",
      example: { content: "Here is your overview.", muted: null },
    },
    Label: {
      props: z.object({ text: z.string(), htmlFor: z.string().nullable() }),
      slots: [],
      description: "Small form label; pair with Input/Select/Switch",
      example: { text: "Email" },
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
        trend: z.enum(["up", "down", "neutral"]).nullable(),
      }),
      slots: [],
      description: "KPI metric display (big value + label + optional trend)",
      example: { label: "Revenue", value: "$4.2M", detail: "vs last quarter", trend: "up" },
    },
    Table: {
      props: z.object({
        data: rows,
        columns: z.array(z.object({ key: z.string(), label: z.string() })),
        emptyMessage: z.string().nullable(),
      }),
      slots: [],
      description:
        "Dynamic data table from row objects — horizontally scrollable on small screens",
      example: {
        data: [
          { name: "pnpm", score: 9.5 },
          { name: "npm", score: 8 },
        ],
        columns: [
          { key: "name", label: "Package manager" },
          { key: "score", label: "Score" },
        ],
        emptyMessage: null,
      },
    },
    Callout: {
      props: z.object({
        title: z.string().nullable(),
        text: z.string(),
        tone: z.enum(["default", "info", "warn", "error"]).nullable(),
      }),
      slots: [],
      description: "Highlighted note / takeaway / warning block",
      example: { title: "Heads up", text: "Keys rotate monthly.", tone: "info" },
    },
    Link: {
      props: z.object({ text: z.string(), href: z.string() }),
      slots: [],
      description: "External link opening in a new tab",
      example: { text: "Docs", href: "https://example.com" },
    },

    /* — charts (Recharts behind the json-render components) — */
    Chart: {
      props: z.object({
        kind: z
          .enum(["bar", "line", "area", "mixed", "pie", "donut", "radial", "radar", "scatter", "gantt"])
          .nullable(),
        title: z.string().nullable(),
        data: rows,
        xKey: z.string().nullable(),
        yKeys: z.array(z.string()).nullable(),
        bars: z.array(z.string()).nullable(),
        lines: z.array(z.string()).nullable(),
        height: z.number().nullable(),
      }),
      slots: [],
      description: [
        "Recharts-backed chart. Use kind to pick the chart:",
        "bar (single series = per-block theme colors; multiple yKeys = grouped),",
        "line / area with multiple yKeys (trend / volume over categories),",
        "mixed: bars[] + lines[] series in one ComposedChart,",
        "pie / donut (donut shows the total in the center), radial (radial progress bars),",
        "radar (spider), scatter (rows { x, y }), gantt (rows { task, start, duration }).",
        "Colors come from the active theme (chart-1..5) — never set colors.",
        "Keep 4-8 rows; plain numbers only.",
      ].join(" "),
      example: {
        kind: "bar",
        title: "Top 5 countries by wealth (T USD)",
        data: [
          { name: "USA", wealth: 145 },
          { name: "China", wealth: 92 },
          { name: "Japan", wealth: 24 },
          { name: "Germany", wealth: 18 },
          { name: "India", wealth: 16 },
        ],
        xKey: "name",
        yKeys: ["wealth"],
      },
    },
    Gauge: {
      props: z.object({
        value: z.number().nullable(),
        label: z.string().nullable(),
        detail: z.string().nullable(),
      }),
      slots: [],
      description: "Circular gauge, value from 0 to 100",
      example: { value: 78, label: "Coverage", detail: "of tests passing" },
    },
    SparklineStat: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        hint: z.string().nullable(),
        values: z.array(z.number()).nullable(),
      }),
      slots: [],
      description: "Stat card with a mini area sparkline behind it",
      example: { label: "DAU", value: "4,211", hint: "this week", values: [80, 96, 75, 120, 140] },
    },
  },
  actions: {
    sendToChat: {
      description:
        "Send a message back into the chat as the next user message. Attach via element on.press: { action: \"sendToChat\", message: \"…\" }.",
    },
  },
});

export default labsCatalog;
