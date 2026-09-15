import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDailyUsage } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET /api/natural/usage — current user's daily prompt quota status
export async function GET() {
  const session = await auth();
  const userId = (session as unknown as { chatUserId?: string } | null)?.chatUserId;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getDailyUsage(userId);
  return NextResponse.json(usage);
}
