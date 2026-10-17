/**
 * Shared (client + server) types for the Email app.
 * Server rows are converted to these shapes before anything hits the browser —
 * credentials (appPassword, hosts) never leave the API.
 */

export interface EmailAccountClient {
  id: string;
  name: string;
  emailAddress: string;
  isDefault: boolean;
  lastSyncAt: string | null;
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAttachmentMeta {
  filename: string;
  size?: number;
  mime?: string;
}

/** One row of the inbox/sent list — a collapsed conversation (Gmail thread). */
export interface EmailThreadRow {
  threadKey: string;
  accountId: string;
  folder: "inbox" | "sent";
  subject: string;
  snippet: string;
  /** display names/addresses of the last senders */
  participants: EmailAddress[];
  lastDate: string;
  count: number;
  unread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

export interface EmailMessage {
  id: string;
  accountId: string;
  threadKey: string;
  messageId: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  toAddresses: EmailAddress[];
  ccAddresses: EmailAddress[];
  snippet: string;
  bodyText: string;
  bodyHtml: string | null;
  date: string;
  folder: "inbox" | "sent";
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  attachments: EmailAttachmentMeta[];
}

export interface SendEmailInput {
  accountId: string;
  to: string;
  cc?: string;
  subject: string;
  text: string;
  /** when replying: internal email id of the message being replied to */
  replyToEmailId?: string;
}

export const EMAIL_FOLDERS = [
  { id: "inbox", label: "Inbox" },
  { id: "sent", label: "Sent" },
] as const;
export type EmailFolderId = (typeof EMAIL_FOLDERS)[number]["id"];
