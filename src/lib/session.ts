import { cache } from "react";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toUserRow } from "@/lib/conversation-helpers";
import type { UserRow } from "@/lib/types";

/**
 * Resolves the signed-in chat profile for the current request.
 *
 * Wrapped in React's `cache()` so multiple server components rendered for
 * the same request (layout + page) share a single DB lookup instead of
 * querying Postgres twice per request.
 */
export const getSessionUser = cache(async (): Promise<UserRow | null> => {
  const session = await auth();
  const chatUserId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;
  if (!chatUserId) return null;

  const [row] = await db.select().from(users).where(eq(users.id, chatUserId)).limit(1);
  return row ? toUserRow(row) : null;
});
