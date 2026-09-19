import { db } from "@/db";
import { conversationParticipants, conversations, messageReactions, messages, users } from "@/db/schema";
import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { ConversationWithMeta, MessageRow, UserRow } from "./types";

export function toUserRow(u: typeof users.$inferSelect): UserRow {
  return {
    id: u.id,
    displayName: u.displayName,
    email: u.email ?? null,
    supabaseId: u.supabaseId ?? null,
    phone: u.phone,
    address: u.address ?? null,
    city: u.city ?? null,
    state: u.state ?? null,
    postalCode: u.postalCode ?? null,
    country: u.country ?? null,
    avatarUrl: u.avatarUrl ?? null,
    avatarColor: u.avatarColor ?? "#00a884",
    avatarEmoji: u.avatarEmoji ?? "😀",
    bio: u.bio ?? "",
    lastSeen: u.lastSeen?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export function toMessageRow(
  m: typeof messages.$inferSelect,
  sender?: typeof users.$inferSelect | null,
  reactions?: MessageRow["reactions"]
): MessageRow {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    content: m.content ?? "",
    messageType: (m.messageType as MessageRow["messageType"]) ?? "text",
    imageUrl: m.imageUrl,
    attachmentUrl: m.attachmentUrl ?? null,
    attachmentName: m.attachmentName ?? null,
    attachmentSize: m.attachmentSize ?? null,
    attachmentMime: m.attachmentMime ?? null,
    replyToId: m.replyToId,
    isEdited: m.isEdited ?? false,
    isDeleted: m.isDeleted ?? false,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    sender: sender ? toUserRow(sender) : sender === null ? null : undefined,
    reactions: reactions ?? [],
  };
}

export async function getConversationsForUser(
  userId: string
): Promise<ConversationWithMeta[]> {
  const parts = await db
    .select()
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));

  if (parts.length === 0) return [];

  const convIds = parts.map((p) => p.conversationId);
  const convRows = await db
    .select()
    .from(conversations)
    .where(inArray(conversations.id, convIds))
    .orderBy(desc(conversations.updatedAt));

  const allParts = await db
    .select()
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.conversationId, convIds));

  const userIds = [...new Set(allParts.map((p) => p.userId))];
  const userRows = userIds.length
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const result: ConversationWithMeta[] = [];

  for (const c of convRows) {
    const cParts = allParts.filter((p) => p.conversationId === c.id);
    const myPart = parts.find((p) => p.conversationId === c.id);

    // last message
    const [last] = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, c.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);

    let lastSender = null;
    if (last?.senderId) lastSender = userMap.get(last.senderId) ?? null;

    // unread count
    let unread = 0;
    if (myPart) {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, c.id),
            gt(messages.createdAt, myPart.lastReadAt),
            ne(messages.senderId, userId)
          )
        );
      unread = Number(rows[0]?.count ?? 0);
    }

    const participants = cParts.map((p) => ({
      conversationId: p.conversationId,
      userId: p.userId,
      joinedAt: p.joinedAt.toISOString(),
      lastReadAt: p.lastReadAt.toISOString(),
      isAdmin: p.isAdmin ?? false,
      user: userMap.get(p.userId) ? toUserRow(userMap.get(p.userId)!) : undefined,
    }));

    const type = (c.type === "group" ? "group" : "dm") as "dm" | "group";
    let otherUser: UserRow | null = null;
    let displayName = c.name ?? "Chat";
    let displayAvatarEmoji = c.avatarEmoji ?? "💬";
    let displayAvatarColor = c.avatarColor ?? "#00a884";
    let displayAvatarUrl: string | null = null;

    if (type === "dm") {
      const other = cParts.find((p) => p.userId !== userId);
      const otherRow = other ? userMap.get(other.userId) : undefined;
      if (otherRow) {
        otherUser = toUserRow(otherRow);
        displayName = otherRow.displayName;
        displayAvatarEmoji = otherRow.avatarEmoji ?? "😀";
        displayAvatarColor = otherRow.avatarColor ?? "#00a884";
        displayAvatarUrl = otherRow.avatarUrl ?? null;
      }
    }

    result.push({
      id: c.id,
      type,
      name: c.name,
      avatarEmoji: c.avatarEmoji,
      avatarColor: c.avatarColor,
      description: c.description,
      createdBy: c.createdBy,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      participants,
      lastMessage: last ? toMessageRow(last, lastSender) : null,
      unreadCount: unread,
      otherUser,
      displayName,
      displayAvatarEmoji,
      displayAvatarColor,
      displayAvatarUrl,
    });
  }

  // sort by last message time desc
  result.sort((a, b) => {
    const at = a.lastMessage?.createdAt ?? a.updatedAt;
    const bt = b.lastMessage?.createdAt ?? b.updatedAt;
    return new Date(bt).getTime() - new Date(at).getTime();
  });

  return result;
}

export async function getMessagesForConversation(
  conversationId: string,
  limit = 100,
  before?: string
): Promise<MessageRow[]> {
  const conds = [eq(messages.conversationId, conversationId)];
  if (before) {
    conds.push(sql`${messages.createdAt} < ${new Date(before)}`);
  }
  const rows = await db
    .select()
    .from(messages)
    .where(and(...conds))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  if (rows.length === 0) return [];

  const msgIds = rows.map((r) => r.id);

  const senderIds = [...new Set(rows.map((r) => r.senderId).filter(Boolean))] as string[];
  const senderRows = senderIds.length
    ? await db.select().from(users).where(inArray(users.id, senderIds))
    : [];
  const senderMap = new Map(senderRows.map((u) => [u.id, u]));

  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter(Boolean))] as string[];
  const replyRows = replyIds.length
    ? await db.select().from(messages).where(inArray(messages.id, replyIds))
    : [];
  const replyMap = new Map(replyRows.map((m) => [m.id, m]));

  // Load all message reactions from DB
  const reactionRows = msgIds.length
    ? await db
        .select({
          messageId: messageReactions.messageId,
          userId: messageReactions.userId,
          emoji: messageReactions.emoji,
          userName: users.displayName,
        })
        .from(messageReactions)
        .leftJoin(users, eq(messageReactions.userId, users.id))
        .where(inArray(messageReactions.messageId, msgIds))
    : [];

  const reactionsByMsg = new Map<string, { emoji: string; userId: string; userName?: string }[]>();
  for (const r of reactionRows) {
    if (!reactionsByMsg.has(r.messageId)) {
      reactionsByMsg.set(r.messageId, []);
    }
    reactionsByMsg.get(r.messageId)!.push({
      emoji: r.emoji,
      userId: r.userId,
      userName: r.userName ?? undefined,
    });
  }

  const chronological = [...rows].reverse();
  return chronological.map((m) => {
    const sender = m.senderId ? senderMap.get(m.senderId) ?? null : null;
    const base = toMessageRow(m, sender, reactionsByMsg.get(m.id) ?? []);
    if (m.replyToId && replyMap.get(m.replyToId)) {
      const rm = replyMap.get(m.replyToId)!;
      const rsender = rm.senderId ? senderMap.get(rm.senderId) ?? null : null;
      base.replyTo = toMessageRow(rm, rsender);
    }
    return base;
  });
}
