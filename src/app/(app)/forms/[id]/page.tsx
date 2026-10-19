import type { Metadata } from "next";
import { FormBuilder } from "@/components/forms/form-builder";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Form builder",
  description: "Arrange fields, publish, get your API token.",
};

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FormBuilder id={id} />;
}
