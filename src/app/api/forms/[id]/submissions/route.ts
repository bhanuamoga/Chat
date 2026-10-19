/**
 * GET    /api/forms/[id]/submissions — latest entries (owner only)
 * DELETE /api/forms/[id]/submissions?sid=  — delete one entry
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  /* owner check + resolve the backing table (real columns per field) */
  const own = await pool.query("SELECT fields, table_name FROM forms WHERE id = $1 AND user_id = $2 LIMIT 1", [id, userId]);
  if (!own.rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const fields = (own.rows[0].fields as FormField[]) ?? [];
  const tableName = own.rows[0].table_name as string | null;

  if (tableName) {
    const { rows } = await pool.query(
      `SELECT * FROM "${tableName}" ORDER BY created_at DESC LIMIT 500`
    );
    return NextResponse.json({ submissions: rows, columns: fields, table: tableName });
  }
  /* legacy shape (older forms with no backing table yet) */
  const { rows } = await pool.query(
    `SELECT s.id, s.data, s.meta, s.created_at
       FROM form_submissions s
       JOIN forms f ON f.id = s.form_id
      WHERE s.form_id = $1 AND f.user_id = $2
      ORDER BY s.created_at DESC
      LIMIT 500`,
    [id, userId]
  );
  return NextResponse.json({ submissions: rows, columns: fields, table: null });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const sid = req.nextUrl.searchParams.get("sid") || "";
  await pool.query(
    `DELETE FROM form_submissions s USING forms f
      WHERE s.form_id = f.id AND s.form_id = $1 AND s.id = $2 AND f.user_id = $3`,
    [id, sid, userId]
  );
  return NextResponse.json({ ok: true });
}
