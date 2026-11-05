// Text consent (docs/integrations-plan.md, Next step 3): a form's Text consent box (a single check box named
// sms_consent, from Form Studio's Add list) and a booking page's Text consent question. Ticked, the contact gets a
// granted sms consent with these words, and workflow texts may go to their mobile. Runs anywhere.

import { allFields, type Form } from "../forms/schema.ts";
export { SMS_WORDING } from "./words.ts";

const ticked = (v: unknown) => v === true || v === "Yes" || v === "yes" || v === "on" || (Array.isArray(v) && v.length > 0);

/** Whether a fill ticked the form's Text consent box (its answers by field key). */
export function smsConsented(form: Pick<Form, "steps">, values: Record<string, unknown>): boolean {
  return allFields(form as Form).some((f) => /^sms_consent(_\d+)?$/.test(f.key) && ticked(values[f.key]));
}
