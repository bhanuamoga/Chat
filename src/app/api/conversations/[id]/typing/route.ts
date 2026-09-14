import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { publishRealtime } from "@/lib/realtime-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const isTyping = Boolean(body.isTyping);
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  await publishRealtime({
    type: "typing",
    conversationId: id,
    userId,
    userName: u?.displayName ?? "Someone",
    isTyping,
  });
  return NextResponse.json({ ok: true });
}
