import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationParticipants, conversations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getConversationsForUser } from "@/lib/conversation-helpers";
import { publishRealtime } from "@/lib/realtime-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const list = await getConversationsForUser(userId);
  const conv = list.find((c) => c.id === id);
  if (!conv) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof conversations.$inferInsert> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 60);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 200);
  if (typeof body.avatarEmoji === "string") patch.avatarEmoji = body.avatarEmoji.slice(0, 8);
  patch.updatedAt = new Date();
  await db.update(conversations).set(patch).where(eq(conversations.id, id));
  await publishRealtime({ type: "conversation:update", conversationId: id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  // leave conversation (remove participant) — not full delete
  if (userId) {
    await db
      .delete(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, id),
          eq(conversationParticipants.userId, userId)
        )
      );
    await publishRealtime({ type: "conversation:update", conversationId: id });
  }
  return NextResponse.json({ ok: true });
}
