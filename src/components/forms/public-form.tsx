"use client";

/** Public, unauthenticated form page — renders the shared schema with shadcn
 *  components and saves submissions straight into the owner's table. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import type { FormField } from "@/lib/forms/ddl";
import { RenderField } from "./render-field";

export function PublicForm({ slug }: { slug: string }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "sent" | "closed" | "missing">("loading");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/public/forms/${slug}`)
      .then(async (res) => {
        if (res.status === 404) return setPhase("missing");
        if (res.status === 410) return setPhase("closed");
        if (!res.ok) throw new Error();
        const { form } = await res.json();
        setTitle(form.title);
        setDescription(form.description);
        const fs = (form.fields ?? []) as FormField[];
        setFields(fs);
        setPhase("ready");
        /* dynamic dropdowns / multi-selects: fetch their option lists from the table via API */
        for (const f of fs) {
          if (f.optionsSource?.mode === "table") {
            fetch(`/api/public/forms/${slug}/options?field=${encodeURIComponent(f.id)}`)
              .then((r) => (r.ok ? r.json() : { options: [] }))
              .then((d) => {
                if (Array.isArray(d.options) && d.options.length) {
                  setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, options: d.options } : x)));
                }
              })
              .catch(() => undefined);
          }
        }
      })
      .catch(() => toast.error("Could not load this form"));
  }, [slug]);

  const submit = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/public/forms/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.error || "Submit failed");
      setPhase("sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-start justify-center bg-muted/40 px-3 py-6 sm:py-10">
      <Card className="w-full max-w-xl shadow-md">
        {phase === "loading" && (
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        )}
        {phase === "missing" && (
          <CardContent className="py-12 text-center">
            <p className="text-base font-semibold">Form not found</p>
            <p className="mt-1 text-sm text-muted-foreground">The link may have been changed or the form deleted.</p>
          </CardContent>
        )}
        {phase === "closed" && (
          <CardContent className="py-12 text-center">
            <Lock className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">This form is closed</p>
            <p className="mt-1 text-sm text-muted-foreground">The owner has stopped accepting responses.</p>
          </CardContent>
        )}
        {phase === "sent" && (
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
            <p className="mt-3 text-lg font-semibold">Submitted</p>
            <p className="mt-1 text-sm text-muted-foreground">Your response was saved. Thank you!</p>
            <Button variant="outline" className="mt-6" onClick={() => {
              setValues({});
              setPhase("ready");
            }}>
              Send another response
            </Button>
          </CardContent>
        )}
        {phase === "ready" && (
          <>
            <CardHeader>
              <CardTitle className="text-xl">{title || "Untitled form"}</CardTitle>
              {description && <CardDescription className="whitespace-pre-wrap">{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-5">
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">This form has no fields yet.</p>
              )}
              {fields.map((f) => (
                <RenderField
                  key={f.id}
                  field={f}
                  value={values[f.id] ?? (f.type === "checkbox" ? false : "")}
                  onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
                />
              ))}
              {fields.length > 0 && (
                <Button onClick={submit} disabled={sending} className="h-10 w-full sm:w-auto">
                  {sending && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Submit
                </Button>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

export default PublicForm;
