// A test fill (docs/form-builder.md Part 10): answers for every field a real visitor would see, so the Test button
// runs the whole path (the contact, the consent, every destination) with a lead marked as a test.

import { regionsOf } from "./regions.ts";
import { allFields, optionsFor, visibility, type Form } from "./schema.ts";

export function sampleAnswers(form: Form, email: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const pick: Record<string, string> = { first_name: "Test", last_name: "Lead", name: "Test Lead", title: "Head of Growth", company: "Claritia test", region: "CA", country: "US" };
  for (const f of allFields(form)) {
    if (f.type === "hidden" || f.type === "calc") continue;
    const first = optionsFor(f, out, { regions: regionsOf })[0]?.value;
    if (f.key === "email") out[f.id] = email;
    else if (pick[f.key] && (f.type === "text" || f.type === "country")) out[f.id] = pick[f.key];
    else if (f.type === "choice" || f.type === "dropdown") out[f.id] = first;
    else if (f.type === "multi") out[f.id] = first ? [first] : [];
    else if (f.type === "rating") out[f.id] = f.rating?.scale ?? 5;
    else if (f.type === "checkbox") out[f.id] = true;
    else if (f.type === "phone") out[f.id] = "+1 415 555 0100";
    else if (f.type === "number") out[f.id] = "10";
    else if (f.type === "date") out[f.id] = new Date().toISOString().slice(0, 10);
    else if (f.type === "url") out[f.id] = "https://example.com";
    else if (f.type === "country") out[f.id] = "US";
    else out[f.id] = "This is a test from Claritia.";
  }
  // Fields that rules hide stay out, as they would for a visitor.
  const { shown } = visibility(form, out, { regions: regionsOf });
  for (const id of Object.keys(out)) if (!shown.has(id)) delete out[id];
  return out;
}
