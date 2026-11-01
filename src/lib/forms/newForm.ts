// The live New form (docs/new-form-studio.md): the changes that need no AI. One page or steps, what happens after the
// send, and the form the preview shows before there's a sketch. Each returns a form that passes checkForm.

import { allFields, checkForm, emptyForm, isContent, newId, type Field, type Form } from "./schema.ts";

const ok = (f: Form): Form => {
  const r = checkForm(f);
  return "form" in r ? r.form : f;
};

/** Everything on one page: the question steps join into the first; result screens stay after it. */
export function toOnePage(form: Form): Form {
  const asks = form.steps.filter((s) => !s.result);
  const results = form.steps.filter((s) => s.result);
  if (asks.length <= 1) return form;
  const first = { ...asks[0]!, fields: asks.flatMap((s) => s.fields) };
  delete first.skip;
  delete first.jumps;
  delete first.title;
  return ok({ ...form, steps: [first, ...results], layout: { ...form.layout, mode: undefined, auto: undefined } });
}

/** Steps: the questions in groups of three (contact details together, last), result screens after them. */
export function toSteps(form: Form): Form {
  const asks = form.steps.filter((s) => !s.result);
  const results = form.steps.filter((s) => s.result);
  if (asks.length > 1) return form;
  const fields = asks.flatMap((s) => s.fields);
  const contact = (f: Field) => !f.key.startsWith("q.") && !f.key.startsWith("c.") && !isContent(f.type);
  const lead = fields.filter((f) => isContent(f.type) && fields.indexOf(f) === 0);
  const qs = fields.filter((f) => !contact(f) && !lead.includes(f));
  const groups: Field[][] = [];
  for (let i = 0; i < qs.length; i += 3) groups.push(qs.slice(i, i + 3));
  const people = fields.filter(contact);
  if (people.length) groups.push(people);
  if (groups.length < 2) return form;
  // A group of only text blocks would be a step with no questions: it joins the next one.
  const steps = groups.reduce<Field[][]>((out, g) => (out.length && out[out.length - 1]!.every((f) => isContent(f.type)) ? [...out.slice(0, -1), [...out[out.length - 1]!, ...g]] : [...out, g]), []);
  steps[0] = [...lead, ...steps[0]!];
  return ok({ ...form, steps: [...steps.map((f) => ({ id: newId(), fields: f })), ...results] });
}

export type AfterChoice = { kind: "thanks" } | { kind: "page"; url: string } | { kind: "results" } | { kind: "meeting"; meetingTypeId: string | null };

/** What happens after the send, set on the draft. A meeting with no type yet is chosen in On Submission later. */
export function applyAfter(form: Form, a: AfterChoice): Form {
  const after = { ...form.after };
  delete after.schedule;
  if (a.kind === "page") after.end = { kind: "redirect", url: a.url };
  else if (after.end.kind === "redirect") after.end = { kind: "message", title: "Thanks, we got it." };
  if (a.kind === "meeting" && a.meetingTypeId) after.schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: a.meetingTypeId };
  let steps = form.steps;
  if (a.kind === "results" && !allFields(form).some((f) => f.result?.kind === "email")) {
    const email: Field = { id: newId(), key: `c.${newId()}` as Field["key"], type: "result", label: "", required: false, result: { kind: "email" } };
    const at = form.steps.findIndex((s) => s.result);
    steps = at >= 0 ? form.steps.map((s, i) => (i === at ? { ...s, fields: [...s.fields, email] } : s)) : form.steps;
  }
  return ok({ ...form, steps, after });
}

/** The form the preview shows before the sketch: a title and an email box, in the chosen brand. */
export function placeholderForm(title: string): Form {
  const f = emptyForm();
  return ok({ ...f, title: title.slice(0, 120) || "Your form" });
}

/** The sketch as the left side lists it: each step's title (or its first question) and how many questions. */
export function outline(form: Form): { title: string; questions: number; result: boolean }[] {
  return form.steps.map((s, i) => {
    const qs = s.fields.filter((f) => !isContent(f.type) && f.type !== "hidden");
    return { title: s.title || (s.result ? "Results" : qs[0]?.label || `Step ${i + 1}`), questions: qs.length, result: !!s.result };
  });
}
