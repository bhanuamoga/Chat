/**
 * Email schema self-ensure — the repo has no migrations folder (tables are
 * created with `drizzle-kit push` at setup time), so email tables ensure
 * themselves idempotently on first API hit (Vercel-serverless safe).
 */
import { pool } from "@/db";

const DDL = `
CREATE TABLE IF NOT EXISTS email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email_address text NOT NULL,
  app_password text NOT NULL,
  imap_host text NOT NULL DEFAULT 'imap.gmail.com',
  imap_port integer NOT NULL DEFAULT 993,
  smtp_host text NOT NULL DEFAULT 'smtp.gmail.com',
  smtp_port integer NOT NULL DEFAULT 587,
  is_default boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_acc_user_idx ON email_accounts(user_id);

CREATE TABLE IF NOT EXISTS emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  message_id text NOT NULL,
  thread_key text NOT NULL,
  in_reply_to text,
  ref_ids text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  to_addresses jsonb NOT NULL DEFAULT '[]',
  cc_addresses jsonb NOT NULL DEFAULT '[]',
  subject text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  date timestamptz NOT NULL,
  folder text NOT NULL DEFAULT 'inbox',
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_user_idx ON emails(user_id);
CREATE INDEX IF NOT EXISTS emails_acc_idx ON emails(account_id);
CREATE INDEX IF NOT EXISTS emails_thread_idx ON emails(thread_key);
CREATE INDEX IF NOT EXISTS emails_date_idx ON emails(date);
CREATE INDEX IF NOT EXISTS emails_folder_idx ON emails(folder);
CREATE UNIQUE INDEX IF NOT EXISTS emails_acc_msg_uniq ON emails(account_id, message_id);
`;

let ensured: Promise<void> | null = null;

export function ensureEmailSchema(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(
      () => undefined,
      (err) => {
        ensured = null; // allow retry on transient failure
        throw err;
      }
    );
  }
  return ensured;
}
