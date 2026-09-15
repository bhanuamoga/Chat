import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { messageReactions, messages, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { publishRealtime } from "@/lib/realtime-server";
import { toMessageRow } from "@/lib/conversation-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const [existing] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  // reaction toggle — ONE reaction per user per message:
  // picking the same emoji removes it; picking a different one replaces the old.
  if (body.reaction && body.userId) {
    const emoji = String(body.reaction).slice(0, 8);
    const userId = String(body.userId);

    const mine = await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, id),
          eq(messageReactions.userId, userId)
        )
      );

    const hasSame = mine.some((r) => r.emoji === emoji);

    if (mine.length > 0) {
      await db
        .delete(messageReactions)
        .where(
          and(
            eq(messageReactions.messageId, id),
            eq(messageReactions.userId, userId)
          )
        );
    }

    if (!hasSame) {
      await db.insert(messageReactions).values({ messageId: id, userId, emoji });
    }

    const all = await db.select().from(messageReactions).where(eq(messageReactions.messageId, id));
    // enrich with names
    const reactions = await Promise.all(
      all.map(async (r) => {
        const [u] = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
        return { emoji: r.emoji, userId: r.userId, userName: u?.displayName };
      })
    );
    await publishRealtime({
      type: "message:reaction",
      conversationId: existing.conversationId,
      messageId: id,
      reactions,
    });
    return NextResponse.json({ ok: true, reactions });
  }

  // edit content
  if (typeof body.content === "string") {
    if (body.senderId && existing.senderId !== body.senderId) {
      return NextResponse.json({ error: "not owner" }, { status: 403 });
    }
    const [updated] = await db
      .update(messages)
      .set({ content: body.content.slice(0, 4000), isEdited: true, updatedAt: new Date() })
      .where(eq(messages.id, id))
      .returning();
    let sender = null;
    if (updated.senderId) {
      const [s] = await db.select().from(users).where(eq(users.id, updated.senderId)).limit(1);
      sender = s ?? null;
    }
    const message = toMessageRow(updated, sender);
    await publishRealtime({ type: "message:update", conversationId: updated.conversationId, message });
    return NextResponse.json({ message });
  }

  return NextResponse.json({ error: "nothing to update" }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const senderId = searchParams.get("senderId");
  const [existing] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (senderId && existing.senderId !== senderId) {
    return NextResponse.json({ error: "not owner" }, { status: 403 });
  }
  await db
    .update(messages)
    .set({
      isDeleted: true,
      content: "This message was deleted",
      imageUrl: null,
      attachmentUrl: null,
      attachmentName: null,
      updatedAt: new Date(),
    })
    .where(eq(messages.id, id));
  await publishRealtime({
    type: "message:delete",
    conversationId: existing.conversationId,
    messageId: id,
  });
  return NextResponse.json({ ok: true });
}
