import { db } from "@/db";
import { naturalChats, naturalMessages, users } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { DailyUsageInfo } from "@/lib/types";

/** Max Natural Chat prompts a single user may send per day (IST day). */
export const DAILY_PROMPT_LIMIT = 5;

/** Asia/Kolkata is UTC+5:30 with no DST — safe fixed offset. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Start of the current calendar day in IST, expressed as a UTC instant. */
export function todayStartIST(): Date {
  const istShifted = new Date(Date.now() + IST_OFFSET_MS);
  istShifted.setUTCHours(0, 0, 0, 0);
  return new Date(istShifted.getTime() - IST_OFFSET_MS);
}

/** Start of the NEXT calendar day in IST (when the quota resets). */
export function nextDayStartIST(): Date {
  return new Date(todayStartIST().getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Count how many Natural Chat prompts (role = 'user' messages) this user has
 * sent since the start of the current IST day. No extra table needed — the
 * usage is derived from the message history itself, so it resets automatically
 * every day at midnight IST.
 *
 * Admins (users.role = 'admin', set manually in the DB) bypass the limit.
 */
export async function getDailyUsage(userId: string): Promise<DailyUsageInfo> {
  const since = todayStartIST();

  const [[usageRow], [userRow]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(naturalMessages)
      .innerJoin(naturalChats, eq(naturalMessages.chatId, naturalChats.id))
      .where(
        and(
          eq(naturalChats.userId, userId),
          eq(naturalMessages.role, "user"),
          gte(naturalMessages.createdAt, since)
        )
      ),
    db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  const used = usageRow?.count ?? 0;
  const isAdmin = (userRow?.role || "").trim().toLowerCase() === "admin";

  return {
    used,
    limit: DAILY_PROMPT_LIMIT,
    remaining: isAdmin ? DAILY_PROMPT_LIMIT : Math.max(0, DAILY_PROMPT_LIMIT - used),
    reached: isAdmin ? false : used >= DAILY_PROMPT_LIMIT,
    resetsAt: nextDayStartIST().toISOString(),
  };
}
