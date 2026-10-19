/** Client-safe form types (no server imports). */

export type FormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "number"
  | "phone"
  | "url"
  | "date"
  | "checkbox"
  | "select"
  | "multiselect"
  | "radio";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  /** the EXISTING column this field writes into (user types it) */
  col?: string;
  /** select / multiselect / radio: static options — or dynamic from the linked table */
  options?: string[];
  optionsSource?:
    | { mode: "static" }
    | { mode: "table"; column: string };
}

export const newFieldId = () =>
  `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
