import type { Metadata } from "next";
import { VercelLabsClient } from "@/components/vercel-labs/vercel-labs-client";

export const metadata: Metadata = {
  title: "Vercel Labs — AI SDK 7 + json-render shadcn chat",
  description:
    "Independent chat that streams with the Vercel AI SDK and renders model-emitted JSON specs as interactive shadcn components.",
};

export default function VercelLabsPage() {
  return <VercelLabsClient />;
}
