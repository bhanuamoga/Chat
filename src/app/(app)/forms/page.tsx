import type { Metadata } from "next";
import { FormsList } from "@/components/forms/forms-list";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forms — dynamic form builder",
  description: "Build forms visually, share a public link or API token, collect answers into the database.",
};

export default function FormsPage() {
  return <FormsList />;
}
