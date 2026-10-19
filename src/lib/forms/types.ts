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
  | "radio";

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  /** select + radio only */
  options?: string[];
}

export const newFieldId = () =>
  `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
