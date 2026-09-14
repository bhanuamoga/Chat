import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const result: Record<string, any> = {
    ok: true,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasAuthSecret: Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
    hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
  };

  try {
    const start = Date.now();
    await db.execute(sql`select 1`);
    result.databaseConnected = true;
    result.latencyMs = Date.now() - start;

    try {
      const userCountRes = await db.select({ count: sql<number>`count(*)` }).from(users);
      result.tablesExist = true;
      result.userCount = Number(userCountRes[0]?.count ?? 0);
    } catch (tableErr: any) {
      result.tablesExist = false;
      result.tableError = tableErr?.message || "Users table not found. Run npx drizzle-kit push";
    }
  } catch (dbErr: any) {
    result.databaseConnected = false;
    result.databaseError = dbErr?.message || "Cannot connect to database";
  }

  return NextResponse.json(result, { status: result.databaseConnected ? 200 : 503 });
}
