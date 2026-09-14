import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import ChatWorkspace from "@/components/chat-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Group Chat",
};

export default async function GroupsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <ChatWorkspace mode="group" me={user} />;
}
