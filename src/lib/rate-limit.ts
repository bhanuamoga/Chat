import { db } from "@/db";
import { naturalChats, naturalMessages, users } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { DailyUsageInfo } from "@/lib/types";
import { parseAiApiConfig } from "@/lib/ai-config";

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
 * Every user can also choose their OWN limit on the AI APIs page:
 * 5 (default) / 10 / custom / unlimited — stored in users.ai_api_config.
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
    db
      .select({ role: users.role, aiApiConfig: users.aiApiConfig })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);

  const used = usageRow?.count ?? 0;
  const isAdmin = (userRow?.role || "").trim().toLowerCase() === "admin";

  /* Per-user limit from their AI API config (jsonb) */
  const cfg = parseAiApiConfig(userRow?.aiApiConfig);
  const rl = cfg.rateLimit;
  const unlimited = isAdmin || rl.mode === "unlimited";

  let limit = DAILY_PROMPT_LIMIT;
  if (rl.mode === "10") limit = 10;
  else if (rl.mode === "custom" && (rl.custom ?? 0) > 0) limit = Math.floor(rl.custom as number);

  if (unlimited) {
    return {
      used,
      limit,
      remaining: limit,
      reached: false,
      unlimited: true,
      resetsAt: nextDayStartIST().toISOString(),
    };
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    reached: used >= limit,
    unlimited: false,
    resetsAt: nextDayStartIST().toISOString(),
  };
}
