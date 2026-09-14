import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationParticipants } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { publishRealtime } from "@/lib/realtime-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const now = new Date();
  await db
    .update(conversationParticipants)
    .set({ lastReadAt: now })
    .where(
      and(
        eq(conversationParticipants.conversationId, id),
        eq(conversationParticipants.userId, userId)
      )
    );
  await publishRealtime({
    type: "read",
    conversationId: id,
    userId,
    lastReadAt: now.toISOString(),
  });
  return NextResponse.json({ ok: true });
}
