// A gallery template as a Form Studio page (docs/forms-chat-plan.md Part 8): Use template makes it on the server
// (src/lib/forms/gallery/make.ts) and the template sheet shows the same page in the picked brand.

import { templateForm } from "../forms/gallery/convert.ts";
import type { FormTemplate } from "../forms/gallery/types.ts";
import { checkForm, type Form } from "../forms/schema.ts";
import { DEFAULT_BRAND_CSS } from "./brandDefault.ts";
import { formToPage } from "./fromForm.ts";
import { pageForm } from "./page.ts";

/** The template as a studio form's draft, in a brand's stylesheet. Shared with the template sheet's preview. */
export function templateDraft(t: FormTemplate, brandCss: string, meeting?: string | null): Form {
  let base: Form = templateForm(t);
  if (meeting) base = { ...base, after: { ...base.after, schedule: { tool: "claritia", url: "", meetingTypeId: meeting, perOwner: false } } };
  const checked = checkForm(base);
  if ("errors" in checked) throw new Error(checked.errors[0] ?? "This form template can't be used right now.");
  const page = formToPage(checked.form);
  const { form } = pageForm({ html: page.html, css: page.css, brand: brandCss || DEFAULT_BRAND_CSS, after: page.after, title: page.title });
  // An internal form (a staff check-in) asks no consent, as the template says; a form that offers a PDF copy of the
  // answers after the send keeps it.
  const draft = checkForm({ ...form, consent: checked.form.consent, ...(checked.form.copy ? { copy: true } : {}) });
  if ("errors" in draft) throw new Error(draft.errors[0] ?? "This form template can't be used right now.");
  return draft.form;
}

