import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthScreen } from "@/components/auth-screen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/chat");

  return <AuthScreen />;
}
