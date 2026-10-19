/**
 * Forms schema self-ensure (same pattern as email): tables ensure themselves
 * idempotently on first API hit — serverless-safe, no migrations needed.
 *
 *  forms            — the user's dynamic form: title, description, ordered
 *                     field schema (jsonb), a public slug (that's the share
 *                     token: 32 random hex chars), active switch.
 *  form_submissions — every saved entry (untilled jsonb keyed by field id).
 */
import { pool } from "@/db";

const DDL = `
CREATE TABLE IF NOT EXISTS forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled form',
  description text NOT NULL DEFAULT '',
  fields jsonb NOT NULL DEFAULT '[]',
  slug text NOT NULL UNIQUE,
  table_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forms_user_idx ON forms(user_id);

CREATE TABLE IF NOT EXISTS form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS form_sub_form_idx ON form_submissions(form_id, created_at DESC);
`;

let ensured: Promise<void> | null = null;

/** add table_name to databases created before the backing-table feature */
const PATCH = "ALTER TABLE forms ADD COLUMN IF NOT EXISTS table_name text";

export function ensureFormsSchema(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL + PATCH).then(() => undefined);
  }
  return ensured;
}

/** Server helpers — keep this module SERVER-ONLY (it imports the pool). */
export type { FormField, FormFieldType } from "./types";

export const newSlug = () =>
  Array.from({ length: 32 }, () =>
    "0123456789abcdef".charAt(Math.floor(Math.random() * 16))
  ).join("");

/* ---------------- dynamic backing tables (real columns per field) ---------- */

/** PostgreSQL-safe identifier from any human label. */
export function sanitizeIdent(s: string): string {
  let x = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!x) x = "col";
  if (/^[0-9]/.test(x)) x = `f_${x}`;
  return x.slice(0, 48);
}

/** Unique, stable table name for a form: form_data_<title> (fallback last id chunk). */
export function tableNameFor(title: string, formId: string): string {
  const base = sanitizeIdent(title || "form").slice(0, 40).replace(/_+$/, "") || "form";
  return `form_data_${base}_${formId.replace(/-/g, "").slice(0, 6)}`;
}

/**
 * Ensure the per-form TABLE exists with one column per field.
 * Never drops columns (old data stays); adds missing ones with ALTER TABLE.
 * `columns` = [{col, label, type}] — col already sanitized & unique.
 */
export async function ensureFormDataTable(
  tableName: string,
  columns: { col: string; label: string; type: string }[]
): Promise<void> {
  const defs = columns
    .map((c) => `"${c.col}" ${c.type === "checkbox" ? "boolean" : "text"}`)
    .join(", ");
  await pool.query(
    `CREATE TABLE IF NOT EXISTS "${tableName}" (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       created_at timestamptz NOT NULL DEFAULT now()${defs ? ", " + defs : ""}
     )`
  );
  const { rows } = await pool.query(
    `SELECT column_name AS c FROM information_schema.columns WHERE table_name = $1`,
    [tableName]
  );
  const have = new Set(rows.map((r: { c: string }) => r.c));
  for (const c of columns) {
    if (!have.has(c.col)) {
      await pool.query(
        `ALTER TABLE "${tableName}" ADD COLUMN "${c.col}" ${c.type === "checkbox" ? "boolean" : "text"}`
      );
    }
  }
}

/**
 * Give every field a unique stable column name (from its label), so the
 * backing table mirrors exactly what the builder shows: label → column.
 */
export function deriveColumns(
  fields: { id: string; label: string; type: string; col?: string }[]
): { col: string; label: string; type: string }[] {
  const used = new Set<string>();
  return fields.map((f) => {
    let base = f.col && /^[a-z_][a-z0-9_]*$/.test(f.col) ? f.col : sanitizeIdent(f.label);
    let col = base;
    for (let n = 2; used.has(col); n++) col = `${base}_${n}`.slice(0, 48);
    used.add(col);
    return { col, label: f.label, type: f.type };
  });
}

/** a raw SQL identifier the user typed: letters/digits/underscore, no leading digit */
export function isIdent(x: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(x) && x.length <= 63;
}
