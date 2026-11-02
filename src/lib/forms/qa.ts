// The check a form passes before it goes live (docs/form-templates.md Part 1, step 3): the schema reads, a sample
// visitor can fill in every required question on every path, and a sample email becomes a contact through the
// same code the server runs on a real submission. Nothing is written. Browser and server.

import { checkAnswers } from "./answers.ts";
import { toContact, type Ctx } from "./contact.ts";
import { allFields, meets } from "./logic.ts";
import { checkSchema } from "./schema.ts";
import type { Answer, Answers, FormField, FormSchema } from "./types.ts";

/** A valid answer for one field, as a careful visitor would give it. */
export function sampleAnswer(f: FormField): Answer | undefined {
  const opts = f.options ?? [];
  switch (f.kind) {
    case "short_text":
    case "hidden":
      return f.map === "company" ? "Acme" : f.map === "country" ? "United States" : "Sample answer";
    case "long_text":
      return "A sample answer.";
    case "email":
      return "qa@example-company.com";
    case "phone":
      return "+1 415 555 0100";
    case "url":
      return "https://example-company.com";
    case "number":
    case "money":
      return f.min !== undefined ? f.min : f.max !== undefined ? Math.min(1, f.max) : 1;
    case "single":
    case "dropdown":
      return opts[0];
    case "multi":
      return opts.slice(0, 1);
    case "ranking":
      return [...opts];
    case "yes_no":
      return true;
    case "agree":
      return true;
    case "rating":
      return f.max ?? 5;
    case "nps":
      return 9;
    case "scale":
      return f.max ?? 5;
    case "matrix":
      return Object.fromEntries((f.rows ?? []).map((r) => [r, opts[0]!]));
    case "date":
      return "2026-01-15";
    case "time":
      return "10:30";
    case "date_range":
      return { from: "2026-01-15", to: "2026-01-20" };
    case "name":
      return { first: "Sam", last: "Sample" };
    case "address":
      return { line1: "1 Main St", city: "Springfield", region: "CA", postal: "94000", country: "United States" };
    case "file":
    case "signature":
      return [{ name: "sample.pdf", path: "qa/sample.pdf", size: 1000, type: "application/pdf" }];
    default:
      return undefined;
  }
}

/** Answers that satisfy every condition they can: each condition's own value is chosen where it's a choice. */
export function sampleAnswers(s: FormSchema): Answers {
  const out: Answers = {};
  for (const f of allFields(s)) {
    if (f.show && !meets(f.show, out)) continue;
    const v = sampleAnswer(f);
    if (v !== undefined) out[f.key] = v;
  }
  return out;
}

/** What stops this form from going live. Empty means it passes. */
export function qaCheck(s: FormSchema, ctx: Ctx = { custom: [] }): string[] {
  const problems = checkSchema(s);
  if (problems.length) return problems;
  const answers = sampleAnswers(s);
  const r = checkAnswers(s, answers);
  for (const [k, e] of Object.entries(r.errors)) {
    const f = allFields(s).find((x) => x.key === k);
    problems.push(`${f?.label ?? k}: a sample answer was turned away (${e})`);
  }
  if (problems.length) return problems;
  // A form that asks for an email must turn it into a contact.
  if (allFields(s).some((f) => f.map === "email")) {
    const c = toContact(s, r.answers, ctx);
    if (!c) problems.push("The email question can be skipped, so some answers won't reach a contact. Make it required.");
    else if ("error" in c) problems.push(c.error);
  }
  return problems;
}
