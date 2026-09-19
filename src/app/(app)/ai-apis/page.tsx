import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AiApisClient } from "@/components/ai-apis/ai-apis-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI APIs — Bring Your Own Keys",
};

export default async function AiApisPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <AiApisClient me={user} />;
}
