/**
 * GET    /api/forms/[id]/submissions — latest entries (owner only)
 * DELETE /api/forms/[id]/submissions?sid=  — delete one entry
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/db";
import { ensureFormsSchema } from "@/lib/forms/ddl";

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
  const { rows } = await pool.query(
    `SELECT s.id, s.data, s.meta, s.created_at
       FROM form_submissions s
       JOIN forms f ON f.id = s.form_id
      WHERE s.form_id = $1 AND f.user_id = $2
      ORDER BY s.created_at DESC
      LIMIT 500`,
    [id, userId]
  );
  return NextResponse.json({ submissions: rows });
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
