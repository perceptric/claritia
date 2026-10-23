// Form edits (docs/form-builder.md 4.2). Every change to a form, from a click in the builder or a tool call from the
// chat, is one op. An op is applied to a copy, and the copy is checked; the chat may only apply ops that add no new
// problems, while the builder lets a draft be unfinished and blocks only the publish. Runs in the browser and on
// the server.

import { allFields, checkForm, CONTACT_KEYS, isChoice, isContent, newId, questionKey, type After, type Choice, type Field, type FieldKey, type FieldType, type Form, type Rule } from "./schema.ts";

export type FieldInput = Partial<Omit<Field, "id">> & { type: FieldType; label: string };

export type Op =
  | { op: "add_field"; field: FieldInput; step?: number; after?: string; id?: string }
  | { op: "update_field"; id: string; patch: Partial<Omit<Field, "id">> }
  | { op: "remove_field"; id: string }
  | { op: "move_field"; id: string; step: number; index: number }
  | { op: "add_step"; title?: string }
  | { op: "update_step"; index: number; title: string }
  | { op: "remove_step"; index: number }
  | { op: "set_rule"; rule: Omit<Rule, "id"> & { id?: string } }
  | { op: "remove_rule"; id: string }
  | { op: "set_layout"; labels?: Form["layout"]["labels"]; width?: Form["layout"]["width"]; progress?: Form["layout"]["progress"]; maxWidth?: number | null }
  | { op: "set_copy"; title?: string; intro?: string; submit?: string }
  | { op: "set_consent"; mode?: Form["consent"]["mode"]; label?: string; topicId?: string | null }
  | { op: "set_spam"; minSeconds?: number; turnstile?: boolean }
  | { op: "set_after"; end: After["end"] }
  | { op: "set_schedule"; schedule: After["schedule"] | null }
  | { op: "set_capture"; adapter?: NonNullable<Form["capture"]>["adapter"]; selector?: string };

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const LABEL_KEYS: [RegExp, FieldKey][] = [
  [/^(work |business |company )?e-?mail/i, "email"],
  [/^full name$|^name$|^your name$/i, "name"],
  [/^first name/i, "first_name"],
  [/^(last name|surname|family name)/i, "last_name"],
  [/^(job )?title|^role$|^position$/i, "title"],
  [/^(phone|mobile|telephone)/i, "phone"],
  [/^(company|organi[sz]ation)( name)?$/i, "company"],
  [/^(company )?(website|domain|url)/i, "website"],
  [/^country/i, "country"],
  [/^(state|province|region)/i, "region"],
];

/** The key a new field saves to: a contact field its label and type point at, if free, else its own question. */
export function keyFor(f: FieldInput, form: Form): FieldKey {
  const taken = new Set(allFields(form).map((x) => x.key as string));
  if (f.key && !taken.has(f.key)) return f.key;
  const byType: Partial<Record<FieldType, FieldKey>> = { email: "email", phone: "phone", country: "country", url: "website" };
  const guess = byType[f.type] ?? LABEL_KEYS.find(([re]) => re.test(f.label.trim()))?.[1];
  if (guess && !taken.has(guess) && CONTACT_KEYS.find((c) => c.key === guess)?.types.includes(f.type)) return guess;
  return questionKey(f.label, taken);
}

const choices = (list: (Choice | string)[] | undefined): Choice[] | undefined => list?.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

function find(form: Form, id: string): { step: number; index: number } | null {
  for (let s = 0; s < form.steps.length; s++) {
    const i = form.steps[s].fields.findIndex((f) => f.id === id);
    if (i >= 0) return { step: s, index: i };
  }
  return null;
}

/** Apply one op. Returns the new form, or why it can't apply. The input form is never changed. */
export function applyOp(input: Form, op: Op): { form: Form } | { error: string } {
  const form = clone(input);
  switch (op.op) {
    case "add_field": {
      const s = op.step ?? (op.after ? (find(form, op.after)?.step ?? form.steps.length - 1) : form.steps.length - 1);
      if (!form.steps[s]) return { error: "That step doesn't exist." };
      const id = op.id && /^[a-z0-9]{1,24}$/.test(op.id) && !allFields(form).some((x) => x.id === op.id) ? op.id : newId();
      const f: Field = {
        ...op.field,
        id,
        key: isContent(op.field.type) ? `c.${id}` : keyFor(op.field, form),
        label: op.field.label,
        type: op.field.type,
        required: isContent(op.field.type) ? false : (op.field.required ?? false),
        ...(op.field.options ? { options: choices(op.field.options) } : isChoice(op.field.type) ? { options: [{ value: "Option 1", label: "Option 1" }] } : {}),
      };
      const at = op.after ? form.steps[s].fields.findIndex((x) => x.id === op.after) + 1 : form.steps[s].fields.length;
      form.steps[s].fields.splice(at > 0 ? at : form.steps[s].fields.length, 0, f);
      return { form };
    }
    case "update_field": {
      const at = find(form, op.id);
      if (!at) return { error: "That field is gone." };
      const cur = form.steps[at.step].fields[at.index];
      const next = { ...cur, ...op.patch, id: cur.id } as Field;
      if (op.patch.options) next.options = choices(op.patch.options);
      for (const k of Object.keys(next) as (keyof Field)[]) if (next[k] === undefined || next[k] === null) delete next[k];
      if (isContent(next.type)) {
        next.key = `c.${cur.id}`;
        next.required = false;
      } else if (isContent(cur.type)) next.key = keyFor({ ...next, key: undefined }, form);
      if (!isChoice(next.type)) delete next.options;
      else if (!next.options?.length) next.options = [{ value: "Option 1", label: "Option 1" }];
      if (next.type !== "hidden") delete next.hidden;
      else next.hidden ??= { from: "param", name: "utm_source" };
      form.steps[at.step].fields[at.index] = next;
      return { form };
    }
    case "remove_field": {
      const at = find(form, op.id);
      if (!at) return { error: "That field is gone." };
      if (form.steps[at.step].fields[at.index].key === "email") return { error: "The email field stays, so each answer reaches a contact." };
      form.steps[at.step].fields.splice(at.index, 1);
      form.rules = form.rules.filter((r) => r.when.field !== op.id && r.then.field !== op.id);
      return { form };
    }
    case "move_field": {
      const at = find(form, op.id);
      if (!at || !form.steps[op.step]) return { error: "That field or step is gone." };
      const [f] = form.steps[at.step].fields.splice(at.index, 1);
      form.steps[op.step].fields.splice(Math.max(0, Math.min(op.index, form.steps[op.step].fields.length)), 0, f);
      return { form };
    }
    case "add_step":
      form.steps.push({ id: newId(), ...(op.title ? { title: op.title } : {}), fields: [] });
      return { form };
    case "update_step":
      if (!form.steps[op.index]) return { error: "That step doesn't exist." };
      form.steps[op.index].title = op.title || undefined;
      if (!form.steps[op.index].title) delete form.steps[op.index].title;
      return { form };
    case "remove_step": {
      if (!form.steps[op.index]) return { error: "That step doesn't exist." };
      if (form.steps.length === 1) return { error: "A form needs at least one step." };
      // Its fields join the step before (or after, for the first).
      const [gone] = form.steps.splice(op.index, 1);
      form.steps[Math.max(0, op.index - 1)].fields.push(...gone.fields);
      return { form };
    }
    case "set_rule": {
      const rule: Rule = { id: op.rule.id ?? newId(), when: op.rule.when, then: op.rule.then };
      const i = form.rules.findIndex((r) => r.id === rule.id);
      if (i >= 0) form.rules[i] = rule;
      else form.rules.push(rule);
      return { form };
    }
    case "remove_rule":
      form.rules = form.rules.filter((r) => r.id !== op.id);
      return { form };
    case "set_layout":
      form.layout = { ...form.layout, ...(op.labels ? { labels: op.labels } : {}), ...(op.width ? { width: op.width } : {}), ...(op.progress ? { progress: op.progress } : {}) };
      if (op.maxWidth === null) delete form.layout.maxWidth;
      else if (op.maxWidth !== undefined) form.layout.maxWidth = op.maxWidth;
      return { form };
    case "set_copy":
      if (op.title !== undefined) form.title = op.title || undefined;
      if (op.intro !== undefined) form.intro = op.intro || undefined;
      if (op.submit !== undefined) form.submit = { label: op.submit };
      if (!form.title) delete form.title;
      if (!form.intro) delete form.intro;
      return { form };
    case "set_consent":
      form.consent = { ...form.consent, ...(op.mode ? { mode: op.mode } : {}), ...(op.label !== undefined ? { label: op.label } : {}) };
      if (op.topicId) form.consent.topicId = op.topicId;
      if (op.topicId === null || form.consent.mode === "off" || form.consent.mode === "notice") delete form.consent.topicId;
      return { form };
    case "set_spam":
      form.spam = { ...form.spam, ...(op.minSeconds !== undefined ? { minSeconds: op.minSeconds } : {}), ...(op.turnstile !== undefined ? { turnstile: op.turnstile } : {}) };
      return { form };
    case "set_after":
      form.after = { ...form.after, end: op.end };
      return { form };
    case "set_schedule":
      if (op.schedule) form.after = { ...form.after, schedule: op.schedule };
      else delete form.after.schedule;
      return { form };
    case "set_capture":
      if (!form.capture) return { error: "This form isn't a captured form." };
      form.capture = { adapter: op.adapter ?? form.capture.adapter, ...((op.selector ?? form.capture.selector) ? { selector: op.selector ?? form.capture.selector } : {}) };
      if (!form.capture.selector) delete form.capture.selector;
      return { form };
    default:
      return { error: "Unknown change." };
  }
}

/** Apply an op only if it adds no new problems: for the chat, where every change must leave the form publishable or better. */
export function applyStrict(input: Form, op: Op, ctx: Parameters<typeof checkForm>[1] = {}): { form: Form } | { error: string } {
  const r = applyOp(input, op);
  if ("error" in r) return r;
  const was = checkForm(input, ctx);
  const before = new Set("errors" in was ? was.errors : []);
  const after = checkForm(r.form, ctx);
  if ("errors" in after) {
    const fresh = after.errors.filter((e) => !before.has(e));
    if (fresh.length) return { error: fresh.join(" ") };
    return r;
  }
  return { form: after.form };
}

/** A short line for the change list: "Added Phone", "Made Company required". */
export function describeOp(op: Op, before: Form): string {
  const label = (id: string) => allFields(before).find((f) => f.id === id)?.label || "a field";
  switch (op.op) {
    case "add_field":
      return `Added ${op.field.label}`;
    case "update_field":
      if (op.patch.required === true) return `Made ${label(op.id)} required`;
      if (op.patch.required === false) return `Made ${label(op.id)} optional`;
      if (op.patch.label) return `Renamed ${label(op.id)} to ${op.patch.label}`;
      return `Changed ${label(op.id)}`;
    case "remove_field":
      return `Removed ${label(op.id)}`;
    case "move_field":
      return `Moved ${label(op.id)}`;
    case "add_step":
      return `Added a step${op.title ? `: ${op.title}` : ""}`;
    case "update_step":
      return `Renamed step ${op.index + 1}`;
    case "remove_step":
      return `Removed step ${op.index + 1}`;
    case "set_rule":
      return `${op.rule.then.action === "show" ? "Show" : op.rule.then.action === "hide" ? "Hide" : "Require"} ${label(op.rule.then.field)} when ${label(op.rule.when.field)} ${op.rule.when.op === "filled" ? "is filled" : op.rule.when.op === "empty" ? "is empty" : `${op.rule.when.op === "is" ? "is" : "isn't"} ${op.rule.when.value}`}`;
    case "remove_rule":
      return "Removed a rule";
    case "set_layout":
      return "Changed the layout";
    case "set_copy":
      return op.submit ? `Button now says ${op.submit}` : "Changed the text";
    case "set_consent":
      return op.mode === "off" ? "Turned off the consent box" : "Changed the consent box";
    case "set_spam":
      return "Changed spam checks";
    case "set_after":
      return op.end.kind === "redirect" ? "Opens a page after the submit" : "Changed the thank-you message";
    case "set_schedule":
      return op.schedule ? "Books a meeting after the submit" : "No meeting after the submit";
    case "set_capture":
      return "Changed how the form is read";
  }
}
