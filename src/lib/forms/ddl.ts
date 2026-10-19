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

export function ensureFormsSchema(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(() => undefined);
  }
  return ensured;
}

/** Server helpers — keep this module SERVER-ONLY (it imports the pool). */
export type { FormField, FormFieldType } from "./types";

export const newSlug = () =>
  Array.from({ length: 32 }, () =>
    "0123456789abcdef".charAt(Math.floor(Math.random() * 16))
  ).join("");
