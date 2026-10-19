import type { Metadata } from "next";
import { PublicForm } from "@/components/forms/public-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Form",
  description: "Submit this form — answers are saved to the owner's table instantly.",
};

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicForm slug={slug} />;
}
