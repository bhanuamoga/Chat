import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { conversationParticipants, conversations, messages, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getConversationsForUser } from "@/lib/conversation-helpers";
import { publishRealtime } from "@/lib/realtime-server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const type = searchParams.get("type"); // "dm" | "group" — powers the separate Chat / Group Chat pages
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  let list = await getConversationsForUser(userId);
  if (type === "dm" || type === "group") {
    list = list.filter((c) => c.type === type);
  }
  return NextResponse.json({ conversations: list });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId || "");
  const type = body.type === "group" ? "group" : "dm";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) return NextResponse.json({ error: "user not found" }, { status: 404 });

  if (type === "dm") {
    const otherId = String(body.otherUserId || "");
    if (!otherId || otherId === userId) {
      return NextResponse.json({ error: "otherUserId required" }, { status: 400 });
    }
    const [other] = await db.select().from(users).where(eq(users.id, otherId)).limit(1);
    if (!other) return NextResponse.json({ error: "other user not found" }, { status: 404 });

    // check existing dm between the two
    const myParts = await db
      .select()
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    for (const p of myParts) {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, p.conversationId))
        .limit(1);
      if (!conv || conv.type !== "dm") continue;
      const others = await db
        .select()
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conv.id));
      const ids = others.map((o) => o.userId).sort();
      if (ids.length === 2 && ids.includes(otherId)) {
        const list = await getConversationsForUser(userId);
        const existing = list.find((c) => c.id === conv.id);
        return NextResponse.json({ conversation: existing, existed: true });
      }
    }

    const [conv] = await db
      .insert(conversations)
      .values({ type: "dm", createdBy: userId })
      .returning();
    await db.insert(conversationParticipants).values([
      { conversationId: conv.id, userId, isAdmin: true },
      { conversationId: conv.id, userId: otherId },
    ]);
    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: null,
      content: "This is the start of your conversation.",
      messageType: "system",
    });

    const list = await getConversationsForUser(userId);
    const created = list.find((c) => c.id === conv.id)!;
    await publishRealtime({ type: "conversation:new", conversation: created });
    return NextResponse.json({ conversation: created, existed: false });
  }

  // group
  const name = String(body.name || "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "group name required" }, { status: 400 });
  const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : [];
  const avatarEmoji = String(body.avatarEmoji || "👥").slice(0, 8);

  const [conv] = await db
    .insert(conversations)
    .values({
      type: "group",
      name,
      avatarEmoji,
      createdBy: userId,
      description: String(body.description || "").slice(0, 200) || null,
    })
    .returning();

  const unique = [...new Set([userId, ...memberIds])];
  await db.insert(conversationParticipants).values(
    unique.map((uid) => ({
      conversationId: conv.id,
      userId: uid,
      isAdmin: uid === userId,
    }))
  );
  await db.insert(messages).values({
    conversationId: conv.id,
    senderId: null,
    content: `${me.displayName} created the group "${name}".`,
    messageType: "system",
  });

  const list = await getConversationsForUser(userId);
  const created = list.find((c) => c.id === conv.id)!;
  await publishRealtime({ type: "conversation:new", conversation: created });
  return NextResponse.json({ conversation: created, existed: false });
}
