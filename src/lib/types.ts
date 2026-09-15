export type UserRow = {
  id: string;
  displayName: string;
  email?: string | null;
  supabaseId?: string | null;
  phone: string | null;
  avatarUrl?: string | null;
  avatarColor: string;
  avatarEmoji: string;
  bio: string;
  lastSeen: string | null;
  createdAt: string;
};

export type ConversationRow = {
  id: string;
  type: "dm" | "group";
  name: string | null;
  avatarEmoji: string | null;
  avatarColor: string | null;
  description: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ParticipantRow = {
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadAt: string;
  isAdmin: boolean;
  user?: UserRow;
};

export type MessageType = "text" | "image" | "video" | "audio" | "document" | "system";

export type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string | null;
  content: string;
  messageType: MessageType;
  imageUrl: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentSize: number | null;
  attachmentMime: string | null;
  replyToId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  sender?: UserRow | null;
  replyTo?: MessageRow | null;
  reactions?: { emoji: string; userId: string; userName?: string }[];
};

export type ConversationWithMeta = ConversationRow & {
  participants: ParticipantRow[];
  lastMessage: MessageRow | null;
  unreadCount: number;
  otherUser?: UserRow | null;
  displayName: string;
  displayAvatarEmoji: string;
  displayAvatarColor: string;
  displayAvatarUrl?: string | null;
};

export type RealtimeEvent =
  | { type: "message:new"; conversationId: string; message: MessageRow }
  | { type: "message:update"; conversationId: string; message: MessageRow }
  | { type: "message:delete"; conversationId: string; messageId: string }
  | { type: "message:reaction"; conversationId: string; messageId: string; reactions: MessageRow["reactions"] }
  | { type: "typing"; conversationId: string; userId: string; userName: string; isTyping: boolean }
  | { type: "presence"; userId: string; lastSeen: string; online: boolean }
  | { type: "conversation:new"; conversation: ConversationWithMeta }
  | { type: "conversation:update"; conversationId: string }
  | { type: "read"; conversationId: string; userId: string; lastReadAt: string };

export function messageFileUrl(m: MessageRow): string | null {
  return m.attachmentUrl ?? m.imageUrl ?? null;
}

// ---------------------------------------------------------------------------
// Natural Chat AI Types (Gemini 2.5 Flash + Visual Analytics)
// ---------------------------------------------------------------------------

export type VisualMetric = {
  label: string;
  value: string | number;
  change?: string;
  trend?: "up" | "down" | "neutral";
};

export type VisualChart = {
  type: "bar" | "line" | "area" | "pie" | "donut" | "doughnut" | "radar" | "scatter";
  title: string;
  data: Record<string, string | number>[];
  xKey: string;
  yKeys: string[];
  description?: string;
};

export type VisualTable = {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
};

export type VisualData = {
  summary?: string;
  metrics?: VisualMetric[];
  chart?: VisualChart;
  table?: VisualTable;
  callout?: {
    type: "info" | "success" | "warning" | "tip";
    text: string;
  };
};

export type DailyUsageInfo = {
  used: number;
  limit: number;
  remaining: number;
  reached: boolean;
  /** ISO instant of the next IST midnight, when the quota resets */
  resetsAt: string;
};

export type NaturalChatRow = {
  id: string;
  userId: string;
  title: string;
  model: string;
  systemPrompt: string | null;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  messageCount?: number;
};

export type NaturalMessageRow = {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  visualData: VisualData | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  modelUsed: string;
  createdAt: string;
};
