/**
 * PUBLIC — dynamic options for select / multiselect / radio fields whose
 * owner chose "from table": returns up to 200 DISTINCT values of the named
 * column INSIDE the form's linked (user-typed, existing) table.
 *   GET /api/public/forms/<slug>/options?field=<fieldId> → { options: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/db";
import { ensureFormsSchema, isIdent, type FormField } from "@/lib/forms/ddl";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  await ensureFormsSchema();
  const { slug } = await ctx.params;
  const fieldId = req.nextUrl.searchParams.get("field") || "";
  const { rows } = await pool.query("SELECT fields, active, table_name FROM forms WHERE slug = $1 LIMIT 1", [slug]);
  if (!rows.length) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (!rows[0].active) return NextResponse.json({ error: "Form is closed" }, { status: 410 });

  const field = ((rows[0].fields as FormField[]) ?? []).find((f) => f.id === fieldId);
  if (!field || field.optionsSource?.mode !== "table" || !isIdent(field.optionsSource.column)) {
    return NextResponse.json({ error: "No dynamic options for this field" }, { status: 400 });
  }
  const tableName = rows[0].table_name as string | null;
  if (!tableName || !isIdent(tableName)) {
    return NextResponse.json({ error: "No table linked" }, { status: 400 });
  }
  try {
    const col = field.optionsSource.column;
    const out = await pool.query(
      `SELECT DISTINCT "${col}" AS v FROM "${tableName}"
        WHERE "${col}" IS NOT NULL AND "${col}" <> ''
        ORDER BY 1 LIMIT 200`
    );
    return NextResponse.json({ options: out.rows.map((r) => String(r.v)).filter(Boolean) });
  } catch (e) {
    console.error("[forms] dynamic options failed:", e);
    return NextResponse.json({ options: [] });
  }
}
