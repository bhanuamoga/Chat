import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { NavRail } from "@/components/nav-rail";

export const dynamic = "force-dynamic";

/**
 * Shared shell for the authenticated app: /chat and /groups both render
 * inside this layout.
 *
 * Desktop: Left vertical rail (Logo, Chat, Group Chat, Logout).
 * Mobile: Left drawer sidebar triggered from the header (no bottom tab bar).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/");
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <NavRail user={user} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
