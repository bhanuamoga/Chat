/**
 * GET    /api/forms/[id] — full form (owner only)
 * PATCH  /api/forms/[id] — update {title?, description?, fields?, active?}
 * DELETE /api/forms/[id] — remove form + its submissions
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/db";
import { ensureFormsSchema, type FormField } from "@/lib/forms/ddl";

export const dynamic = "force-dynamic";

async function needUserId(): Promise<string | null> {
  const session = await auth();
  return (session as unknown as { chatUserId?: string } | null)?.chatUserId ?? null;
}

function sanitizeFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const out: FormField[] = [];
  for (const f of raw.slice(0, 100)) {
    if (!f || typeof f !== "object") continue;
    const x = f as Record<string, unknown>;
    const type = String(x.type || "text");
    if (!["text", "textarea", "email", "number", "phone", "url", "date", "checkbox", "select", "radio"].includes(type)) continue;
    out.push({
      id: String(x.id || "").slice(0, 64) || Math.random().toString(36).slice(2, 12),
      type: type as FormField["type"],
      label: String(x.label ?? "").slice(0, 200) || "Untitled",
      placeholder: x.placeholder ? String(x.placeholder).slice(0, 200) : undefined,
      helpText: x.helpText ? String(x.helpText).slice(0, 400) : undefined,
      required: Boolean(x.required),
      options:
        type === "select" || type === "radio"
          ? (Array.isArray(x.options) ? x.options : []).map((v) => String(v).slice(0, 120)).filter(Boolean).slice(0, 50)
          : undefined,
    });
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const { rows } = await pool.query("SELECT * FROM forms WHERE id = $1 AND user_id = $2 LIMIT 1", [id, userId]);
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ form: rows[0] });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body: Record<string, unknown> = await req.json().catch(() => ({}));

  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [id, userId];
  if (typeof body.title === "string") { vals.push(body.title.slice(0, 200)); sets.push(`title = $${vals.length}`); }
  if (typeof body.description === "string") { vals.push(body.description.slice(0, 2000)); sets.push(`description = $${vals.length}`); }
  if (typeof body.active === "boolean") { vals.push(body.active); sets.push(`active = $${vals.length}`); }
  if ("fields" in body) { vals.push(JSON.stringify(sanitizeFields(body.fields))); sets.push(`fields = $${vals.length}::jsonb`); }

  const { rows } = await pool.query(
    `UPDATE forms SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`,
    vals
  );
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ form: rows[0] });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await pool.query("DELETE FROM forms WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json({ ok: true });
}
