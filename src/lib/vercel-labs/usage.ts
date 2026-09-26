import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { todayStartIST } from "@/lib/rate-limit";

/**
 * Vercel Labs per-user daily budget — shares Jarvis' configured limit
 * (rateLimit in users.ai_api_config), but counts labs prompts separately
 * in its own jsonb field so the counter stays exact without new tables.
 */
export async function touchPromptCount(
  userId: string,
  userRow: Pick<typeof users.$inferSelect, "aiApiConfig">
): Promise<{ used: number; limit: number | null; error: string | null }> {
  const raw = userRow.aiApiConfig as unknown as Record<string, unknown> | null;
  const rlMode = (raw?.rateLimit as { mode?: string; custom?: number } | undefined)?.mode || "5";
  const custom = (raw?.rateLimit as { custom?: number } | undefined)?.custom ?? 0;
  const limit: number | null =
    rlMode === "unlimited" ? null : rlMode === "10" ? 10 : rlMode === "custom" ? Math.max(1, custom) : 5;

  const dayKey = todayStartIST().toISOString().slice(0, 10); // YYYY-MM-DD (IST day start)
  const labsUsage = (raw?.labsUsage as { day?: string; count?: number } | undefined) || {};
  const usedToday = labsUsage.day === dayKey ? labsUsage.count || 0 : 0;

  if (limit !== null && usedToday >= limit) {
    return {
      used: usedToday,
      limit,
      error: `Vercel Labs daily limit reached (${limit}/day, resets at midnight IST). Raise it on the AI APIs page.`,
    };
  }

  /* increment (best-effort; merged back into the same jsonb) */
  const next = { ...(raw || {}), labsUsage: { day: dayKey, count: usedToday + 1 } };
  await db
    .update(users)
    .set({ aiApiConfig: next })
    .where(eq(users.id, userId))
    .catch(() => undefined);

  return { used: usedToday + 1, limit, error: null };
}
