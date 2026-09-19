import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { publishRealtime } from "@/lib/realtime-server";
import { toUserRow } from "@/lib/conversation-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ user: toUserRow(u) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof users.$inferInsert> = {};

  if (typeof body.displayName === "string" && body.displayName.trim()) {
    patch.displayName = body.displayName.trim().slice(0, 40);
  }
  if (typeof body.bio === "string") patch.bio = body.bio.slice(0, 140);
  if (typeof body.avatarColor === "string") patch.avatarColor = body.avatarColor.slice(0, 20);
  if (typeof body.avatarEmoji === "string") patch.avatarEmoji = body.avatarEmoji.slice(0, 8);
  if (typeof body.avatarUrl === "string" || body.avatarUrl === null) patch.avatarUrl = body.avatarUrl;
  if (typeof body.phone === "string") patch.phone = body.phone.slice(0, 30);
  if (typeof body.address === "string") patch.address = body.address.slice(0, 160);
  if (typeof body.city === "string") patch.city = body.city.slice(0, 60);
  if (typeof body.state === "string") patch.state = body.state.slice(0, 60);
  if (typeof body.postalCode === "string") patch.postalCode = body.postalCode.slice(0, 20);
  if (typeof body.country === "string") patch.country = body.country.slice(0, 60);
  if (body.heartbeat) patch.lastSeen = new Date();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true });
  }

  const [u] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.heartbeat) {
    await publishRealtime({
      type: "presence",
      userId: u.id,
      lastSeen: u.lastSeen?.toISOString() ?? new Date().toISOString(),
      online: true,
    });
  }

  return NextResponse.json({ user: toUserRow(u) });
}
