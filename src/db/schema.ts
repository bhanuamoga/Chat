import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    passwordHash: text("password_hash"),
    supabaseId: text("supabase_id"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    avatarColor: text("avatar_color").notNull().default("#00a884"),
    avatarEmoji: text("avatar_emoji").notNull().default("😀"),
    bio: text("bio").notNull().default("Hey there! I am using Morr Chat."),
    role: text("role").notNull().default("user"), // 'user' | 'admin' (admins bypass the daily Natural Chat prompt limit; set manually in DB)
    lastSeen: timestamp("last_seen", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("users_email_idx").on(t.email),
    index("users_supabase_idx").on(t.supabaseId),
  ]
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull().default("dm"), // 'dm' | 'group'
  name: text("name"),
  avatarEmoji: text("avatar_emoji").default("💬"),
  avatarColor: text("avatar_color").default("#00a884"),
  description: text("description"),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).defaultNow().notNull(),
    isAdmin: boolean("is_admin").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.userId] }),
    index("cp_user_idx").on(t.userId),
    index("cp_conv_idx").on(t.conversationId),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    content: text("content").notNull().default(""),
    messageType: text("message_type").notNull().default("text"),
    imageUrl: text("image_url"),
    attachmentUrl: text("attachment_url"),
    attachmentName: text("attachment_name"),
    attachmentSize: integer("attachment_size"),
    attachmentMime: text("attachment_mime"),
    replyToId: uuid("reply_to_id"),
    isEdited: boolean("is_edited").notNull().default(false),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("msg_conv_idx").on(t.conversationId),
    index("msg_created_idx").on(t.createdAt),
  ]
);

export const messageReactions = pgTable(
  "message_reactions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId, t.emoji] })]
);

// ---------------------------------------------------------------------------
// Natural Chat (AI) tables: dedicated conversation threads & rich messages
// ---------------------------------------------------------------------------

export const naturalChats = pgTable(
  "natural_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Conversation"),
    model: text("model").notNull().default("gemini-2.5-flash"),
    systemPrompt: text("system_prompt"),
    totalPromptTokens: integer("total_prompt_tokens").notNull().default(0),
    totalCompletionTokens: integer("total_completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("nat_chat_user_idx").on(t.userId),
    index("nat_chat_updated_idx").on(t.updatedAt),
  ]
);

export const naturalMessages = pgTable(
  "natural_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => naturalChats.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull().default(""),
    // Rich visual payload (charts, tables, key-metrics cards, code, analytics)
    visualData: jsonb("visual_data"),
    // Detailed token telemetry
    promptTokens: integer("prompt_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    modelUsed: text("model_used").default("gemini-2.5-flash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("nat_msg_chat_idx").on(t.chatId),
    index("nat_msg_created_idx").on(t.createdAt),
  ]
);

export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Participant = typeof conversationParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NaturalChat = typeof naturalChats.$inferSelect;
export type NaturalMessage = typeof naturalMessages.$inferSelect;
