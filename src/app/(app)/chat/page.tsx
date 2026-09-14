import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import ChatWorkspace from "@/components/chat-workspace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Chat",
};

export default async function ChatPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return <ChatWorkspace mode="dm" me={user} />;
}
