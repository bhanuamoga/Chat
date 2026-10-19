/**
 * GET  /api/forms        — list the caller's forms (+ submission counts)
 * POST /api/forms        — create a new form {title?, description?}
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/db";
import { ensureFormsSchema, newSlug } from "@/lib/forms/ddl";

export const dynamic = "force-dynamic";

async function needUserId(): Promise<string | null> {
  const session = await auth();
  return (session as unknown as { chatUserId?: string } | null)?.chatUserId ?? null;
}

export async function GET() {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await pool.query(
    `SELECT f.id, f.title, f.description, f.slug, f.active, f.fields, f.created_at, f.updated_at,
            (SELECT count(*)::int FROM form_submissions s WHERE s.form_id = f.id) AS submissions
       FROM forms f
      WHERE f.user_id = $1
      ORDER BY f.updated_at DESC`,
    [userId]
  );
  return NextResponse.json({ forms: rows });
}

export async function POST(req: NextRequest) {
  await ensureFormsSchema();
  const userId = await needUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: { title?: string; description?: string } = await req.json().catch(() => ({}));
  const title = (body.title || "").trim() || "Untitled form";
  const description = (body.description || "").trim();

  const { rows } = await pool.query(
    `INSERT INTO forms (user_id, title, description, slug)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, description, slug, active, fields, created_at, updated_at`,
    [userId, title.slice(0, 200), description.slice(0, 2000), newSlug()]
  );
  return NextResponse.json({ form: rows[0] });
}
