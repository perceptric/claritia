"use client";

import { templateById } from "@/lib/forms/catalog";
import { FormView } from "./FormView";

/** A template to try on the website: fully working, nothing is sent. */
export function TemplatePreview({ id }: { id: string }) {
  const t = templateById(id);
  if (!t) return null;
  return <FormView schema={t.schema} settings={t.internal ? { consent_off: true } : {}} mode="preview" badge={false} />;
}
