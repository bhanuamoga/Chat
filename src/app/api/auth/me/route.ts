import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toUserRow } from "@/lib/conversation-helpers";

export async function GET() {
  const session = await auth();
  const chatUserId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!session?.user || !chatUserId) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const [row] = await db.select().from(users).where(eq(users.id, chatUserId)).limit(1);
  if (!row) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toUserRow(row) });
}
