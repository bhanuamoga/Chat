import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { NaturalChatWorkspace } from "@/components/natural";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Natural Chat — AI Analytics & Assistant",
};

export default async function NaturalPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <NaturalChatWorkspace me={user} />;
}
