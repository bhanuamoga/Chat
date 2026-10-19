/**
 * PUBLIC (no session needed) — this is what the shared form token unlocks.
 *
 * GET  /api/public/forms/[slug] → { title, description, fields, active }
 * POST /api/public/forms/[slug] → save a submission { data: { fieldId: value } }
 *
 * The 32-char slug IS the API key/token. Example:
 *   curl -X POST https://<host>/api/public/forms/<slug> \
 *     -H 'Content-Type: application/json' \
 *     -d '{"data":{"f_x123":{"value":"Alice"}}}'  — or plain {"f_x123":"Alice"}
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { ensureFormsSchema, sanitizeIdent, type FormField } from "@/lib/forms/ddl";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  await ensureFormsSchema();
  const { slug } = await ctx.params;
  const { rows } = await pool.query("SELECT title, description, fields, active FROM forms WHERE slug = $1 LIMIT 1", [slug]);
  if (!rows.length) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (!rows[0].active) return NextResponse.json({ error: "Form is closed" }, { status: 410 });
  return NextResponse.json({ form: { title: rows[0].title, description: rows[0].description, fields: rows[0].fields } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  await ensureFormsSchema();
  const { slug } = await ctx.params;
  const { rows } = await pool.query("SELECT id, user_id, title, fields, active, table_name FROM forms WHERE slug = $1 LIMIT 1", [slug]);
  if (!rows.length) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (!rows[0].active) return NextResponse.json({ error: "Form is closed" }, { status: 410 });
  const tableName: string | null = rows[0].table_name ?? null;

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  const fields = (rows[0].fields as FormField[]) ?? [];

  /* accept {"data":{...}} or the bare {fieldId: value} */
  const src: Record<string, unknown> =
    rawBody.data && typeof rawBody.data === "object" ? (rawBody.data as Record<string, unknown>) : (rawBody as Record<string, unknown>);

  const data: Record<string, unknown> = {};
  for (const field of fields) {
    let v = src[field.id];
    if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
      v = (v as Record<string, unknown>).value; // tolerate {value:..} wrapping
    }
    if (field.type === "checkbox") {
      const b = v === true || v === "true" || v === "on" || v === 1;
      if (field.required && !b) return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
      data[field.id] = b;
    } else {
      const s = String(v ?? "").trim();
      if (field.required && !s) return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
      if ((field.type === "select" || field.type === "radio") && s && field.options?.length && !field.options.includes(s)) {
        return NextResponse.json({ error: `Invalid option for "${field.label}"` }, { status: 400 });
      }
      if (field.type === "multiselect" && s && field.options?.length) {
        const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
        for (const part of parts) {
          if (!field.options.includes(part)) {
            return NextResponse.json({ error: `Invalid option for "${field.label}"` }, { status: 400 });
          }
        }
      }
      if (field.type === "number" && s && Number.isNaN(Number(s))) {
        return NextResponse.json({ error: `"${field.label}" must be a number` }, { status: 400 });
      }
      data[field.id] = s.slice(0, 10000);
    }
  }

  const meta = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    ua: req.headers.get("user-agent") || null,
  };
  await pool.query(
    `INSERT INTO form_submissions (form_id, user_id, data, meta) VALUES ($1, $2, $3, $4)`,
    [rows[0].id, rows[0].user_id, JSON.stringify(data), JSON.stringify(meta)]
  );

  /* owner-typed table: write a row into the EXISTING table (no creation!),
     mapping each field to the column the owner set in the builder */
  if (tableName) {
    try {
      const names: string[] = [];
      const values: unknown[] = [];
      for (const field of fields) {
        const col = field.col?.trim() || sanitizeIdent(field.label);
        names.push(`"${col}"`);
        values.push(field.type === "checkbox" ? Boolean(data[field.id]) : String(data[field.id] ?? ""));
      }
      if (names.length) {
        const ph = values.map((_, i) => `$${i + 1}`).join(", ");
        await pool.query(`INSERT INTO "${tableName}" (${names.join(", ")}) VALUES (${ph})`, values);
      }
    } catch (e) {
      /* table missing / column missing / type clash — entry is safely in
         form_submissions already; log so the owner can fix the mapping */
      console.error(`[forms] ${tableName} insert failed (mirror already saved):`, e);
    }
  }
  return NextResponse.json({ ok: true, message: "Saved" });
}
