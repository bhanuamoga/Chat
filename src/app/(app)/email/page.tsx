import type { Metadata } from "next";
import { EmailClient } from "@/components/email/email-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Email — Gmail via IMAP + SMTP",
  description: "Gmail-style inbox: sync over IMAP, send over SMTP, 100% reply threads.",
};

export default function EmailPage() {
  return <EmailClient />;
}
