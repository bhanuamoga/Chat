"use client";

/**
 * One form field rendered with pure shadcn components — used by the builder's
 * live canvas AND the public form page, so preview = reality.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormField } from "@/lib/forms/types";

export function RenderField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
  disabled?: boolean;
}) {
  const req = field.required ? " *" : "";

  if (field.type === "checkbox") {
    return (
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={field.id}
          checked={value === true}
          onCheckedChange={(v) => onChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="grid">
          <Label htmlFor={field.id} className="text-sm font-medium">
            {field.label}
            {req}
          </Label>
          {field.helpText && <span className="text-xs text-muted-foreground">{field.helpText}</span>}
        </div>
      </div>
    );
  }

  const inputShell = (
    <>
      <Label htmlFor={field.id} className="text-sm font-medium">
        {field.label}
        {req}
      </Label>
      {field.helpText && <span className="text-xs text-muted-foreground">{field.helpText}</span>}
    </>
  );

  switch (field.type) {
    case "textarea":
      return (
        <div className="grid gap-1.5">
          {inputShell}
          <Textarea
            id={field.id}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className="min-h-[110px]"
          />
        </div>
      );
    case "select":
      return (
        <div className="grid gap-1.5">
          {inputShell}
          {/* native select with shadcn Input chrome (one less custom widget) */}
          <select
            id={field.id}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select…</option>
            {(field.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case "multiselect": {
      const picked = typeof value === "string" && value ? value.split(",").map((x) => x.trim()) : [];
      return (
        <div className="grid gap-1.5">
          {inputShell}
          <div className="flex flex-col gap-2">
            {(field.options ?? []).map((o) => {
              const on = picked.includes(o);
              return (
                <div key={o} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`${field.id}-${o}`}
                    checked={on}
                    disabled={disabled}
                    className="mt-0.5"
                    onCheckedChange={(v) => {
                      const next = v === true ? [...picked, o] : picked.filter((x) => x !== o);
                      onChange(next.join(", "));
                    }}
                  />
                  <Label htmlFor={`${field.id}-${o}`} className="text-sm font-normal leading-snug">{o}</Label>
                </div>
              );
            })}
            {(field.options ?? []).length === 0 && (
              <span className="text-xs text-muted-foreground">No options configured</span>
            )}
          </div>
        </div>
      );
    }
    case "radio":
      return (
        <div className="grid gap-1.5">
          {inputShell}
          <div className="flex flex-col gap-2">
            {(field.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name={field.id}
                  value={o}
                  checked={value === o}
                  onChange={() => onChange(o)}
                  disabled={disabled}
                  className="size-4 shrink-0 accent-[hsl(var(--primary))]"
                />
                {o}
              </label>
            ))}
          </div>
        </div>
      );
    default: {
      const htmlType =
        field.type === "email" ? "email" :
        field.type === "number" ? "number" :
        field.type === "phone" ? "tel" :
        field.type === "url" ? "url" :
        field.type === "date" ? "date" : "text";
      return (
        <div className="grid gap-1.5">
          {inputShell}
          <Input
            id={field.id}
            type={htmlType}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={disabled}
            className="h-10"
          />
        </div>
      );
    }
  }
}
