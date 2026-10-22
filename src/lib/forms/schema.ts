// The form schema (docs/form-builder.md Part 3). A form is JSON: steps of fields, rules, layout, consent, spam and
// what happens after the submit. One checker runs on every save, every edit the chat makes, every publish and in
// the renderer, so a form that fails it can't go live. Labels and copy are plain text; nothing in a form is ever
// read as HTML. Runs in the browser and on the server.

import { linkProblem, SCHEDULERS, type Schedule } from "./schedule.ts";

export type FieldType = "text" | "email" | "phone" | "textarea" | "number" | "choice" | "multi" | "checkbox" | "country" | "date" | "url" | "hidden" | "consent";

/**
 * Where an answer goes. Contact keys land on the contact; `f.<key>` on one of the workspace's custom contact fields;
 * `q.<slug>` stays with the submission (and goes to every destination), like "What are you looking for?".
 */
export type FieldKey = "email" | "first_name" | "last_name" | "name" | "title" | "phone" | "company" | "website" | "country" | "region" | `f.${string}` | `q.${string}`;

export type Choice = { value: string; label: string };

export type Field = {
  id: string;
  key: FieldKey;
  type: FieldType;
  label: string;
  placeholder?: string;
  help?: string;
  required: boolean;
  options?: Choice[];
  /** work_email: refuse free mail (gmail.com and the rest). */
  check?: "work_email";
  width?: "full" | "half";
  /** A hidden field's value: from a URL parameter, the page, the referrer, or a fixed value. */
  hidden?: { from: "param" | "page" | "referrer" | "static"; name?: string; value?: string };
  /** Fill from a URL parameter of the same name when it's there. */
  prefill?: boolean;
};

export type Rule = {
  id: string;
  when: { field: string; op: "is" | "is_not" | "filled" | "empty"; value?: string };
  then: { action: "show" | "hide" | "require"; field: string };
};

export type Step = { id: string; title?: string; fields: Field[] };

export type After = {
  end: { kind: "message"; title: string; text?: string } | { kind: "redirect"; url: string };
  /** Book a meeting on an outside scheduler after the submit (src/lib/forms/schedule.ts). */
  schedule?: Schedule;
};

export type Form = {
  steps: Step[];
  rules: Rule[];
  layout: { labels: "above" | "inside"; width: "narrow" | "wide" };
  title?: string;
  intro?: string;
  submit: { label: string };
  consent: { mode: "off" | "by_region" | "always"; label: string };
  spam: { minSeconds: number; turnstile: boolean };
  after: After;
};

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Long answer" },
  { value: "number", label: "Number" },
  { value: "choice", label: "Pick one" },
  { value: "multi", label: "Pick many" },
  { value: "checkbox", label: "Checkbox" },
  { value: "country", label: "Country" },
  { value: "date", label: "Date" },
  { value: "url", label: "Website" },
  { value: "hidden", label: "Hidden" },
];

/** Contact keys and the field types that can carry them. */
export const CONTACT_KEYS: { key: FieldKey; label: string; types: FieldType[] }[] = [
  { key: "email", label: "Email", types: ["email"] },
  { key: "name", label: "Full name", types: ["text"] },
  { key: "first_name", label: "First name", types: ["text"] },
  { key: "last_name", label: "Last name", types: ["text"] },
  { key: "title", label: "Job title", types: ["text", "choice"] },
  { key: "phone", label: "Phone", types: ["phone"] },
  { key: "company", label: "Company", types: ["text"] },
  { key: "website", label: "Company website", types: ["url", "text"] },
  { key: "country", label: "Country", types: ["country"] },
  { key: "region", label: "State or region", types: ["text", "choice"] },
];

export const LIMITS = { steps: 10, fields: 40, options: 100, rules: 50, label: 300, text: 1000, value: 5000 };
export const DEFAULT_CONSENT = "I agree to receive emails. I can unsubscribe at any time.";

const ID = /^[a-z0-9]{1,24}$/;
const Q_KEY = /^q\.[a-z][a-z0-9_]{0,39}$/;
const F_KEY = /^f\.[a-z][a-z0-9_]{0,39}$/;
const PARAM = /^[A-Za-z0-9_.-]{1,60}$/;

export const allFields = (f: Pick<Form, "steps">): Field[] => f.steps.flatMap((s) => s.fields);
export const newId = () => Math.random().toString(36).slice(2, 10);

/** A slug for a question's key from its label: "What are you looking for?" → q.what_are_you_looking_for. */
export function questionKey(label: string, taken: Set<string>): FieldKey {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 32) || "answer";
  let k = `q.${base}`;
  for (let i = 2; taken.has(k); i++) k = `q.${base}_${i}`;
  return k as FieldKey;
}

export function emptyForm(): Form {
  return {
    steps: [{ id: newId(), fields: [{ id: newId(), key: "email", type: "email", label: "Work email", required: true }] }],
    rules: [],
    layout: { labels: "above", width: "narrow" },
    submit: { label: "Submit" },
    consent: { mode: "by_region", label: DEFAULT_CONSENT },
    spam: { minSeconds: 2, turnstile: false },
    after: { end: { kind: "message", title: "Thanks, we got it.", text: "We'll be in touch soon." } },
  };
}

type Ctx = { custom?: { key: string }[] };

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : undefined);

/**
 * Check a form and return a clean copy, or the problems. Unknown keys are dropped, text is cut to its limit, and
 * anything that can't be fixed by dropping it is an error.
 */
export function checkForm(raw: unknown, ctx: Ctx = {}): { form: Form } | { errors: string[] } {
  const errors: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const steps: Step[] = [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const custom = new Set((ctx.custom ?? []).map((c) => c.key));
  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  if (!rawSteps.length) errors.push("A form needs at least one step.");
  if (rawSteps.length > LIMITS.steps) errors.push(`Up to ${LIMITS.steps} steps.`);
  let count = 0;
  for (const s of rawSteps.slice(0, LIMITS.steps)) {
    const so = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const sid = str(so.id, 24) ?? "";
    if (!ID.test(sid)) errors.push("A step has a bad id.");
    const fields: Field[] = [];
    for (const x of Array.isArray(so.fields) ? so.fields : []) {
      count++;
      const fo = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      const label = str(fo.label, LIMITS.label) ?? "";
      const name = label || "A field";
      const id = str(fo.id, 24) ?? "";
      const type = FIELD_TYPES.some((t) => t.value === fo.type) || fo.type === "consent" ? (fo.type as FieldType) : null;
      const key = str(fo.key, 42) ?? "";
      if (!ID.test(id) || ids.has(id)) errors.push(`${name} has a missing or repeated id.`);
      ids.add(id);
      if (!type) {
        errors.push(`${name} has an unknown type.`);
        continue;
      }
      if (type === "consent") {
        errors.push("Consent is set in the form's settings, not as a field.");
        continue;
      }
      if (!label && type !== "hidden") errors.push("Every field needs a label.");
      const contact = CONTACT_KEYS.find((c) => c.key === key);
      if (contact) {
        if (!contact.types.includes(type)) errors.push(`${name}: ${contact.label} can't be a ${FIELD_TYPES.find((t) => t.value === type)?.label.toLowerCase()} field.`);
      } else if (F_KEY.test(key)) {
        if (ctx.custom && !custom.has(key.slice(2))) errors.push(`${name} saves to a field that no longer exists.`);
      } else if (!Q_KEY.test(key)) errors.push(`${name} has a bad key.`);
      if (keys.has(key)) errors.push(`Two fields save to the same place (${name}).`);
      keys.add(key);
      const f: Field = { id, key: key as FieldKey, type, label, required: fo.required === true && type !== "hidden" };
      const placeholder = str(fo.placeholder, LIMITS.label);
      if (placeholder) f.placeholder = placeholder;
      const help = str(fo.help, LIMITS.label);
      if (help) f.help = help;
      if (fo.width === "half") f.width = "half";
      if (fo.check === "work_email" && type === "email") f.check = "work_email";
      if (fo.prefill === true) f.prefill = true;
      if (type === "choice" || type === "multi") {
        const opts: Choice[] = [];
        const seen = new Set<string>();
        for (const o of Array.isArray(fo.options) ? fo.options.slice(0, LIMITS.options) : []) {
          const oo = (typeof o === "string" ? { value: o, label: o } : o && typeof o === "object" ? o : {}) as Record<string, unknown>;
          const lab = str(oo.label, 200) ?? "";
          const val = str(oo.value, 200) || lab;
          if (!val || seen.has(val)) continue;
          seen.add(val);
          opts.push({ value: val, label: lab || val });
        }
        if (!opts.length) errors.push(`${name} needs at least one option.`);
        f.options = opts;
      }
      if (type === "hidden") {
        const h = (fo.hidden && typeof fo.hidden === "object" ? fo.hidden : {}) as Record<string, unknown>;
        type From = NonNullable<Field["hidden"]>["from"];
        const from: From = ["param", "page", "referrer", "static"].includes(h.from as string) ? (h.from as From) : "param";
        const hn = str(h.name, 60);
        if (from === "param" && (!hn || !PARAM.test(hn))) errors.push(`${name || "A hidden field"} needs the URL parameter to read.`);
        f.hidden = { from, ...(hn && from === "param" ? { name: hn } : {}), ...(from === "static" ? { value: str(h.value, 500) ?? "" } : {}) };
      }
      fields.push(f);
    }
    steps.push({ id: sid, ...(str(so.title, LIMITS.label) ? { title: str(so.title, LIMITS.label) } : {}), fields });
  }
  if (count > LIMITS.fields) errors.push(`Up to ${LIMITS.fields} fields.`);
  if (!keys.has("email")) errors.push("Add an email field, so each answer reaches a contact.");
  steps.forEach((s, i) => {
    if (!s.fields.some((f) => f.type !== "hidden")) errors.push(`Step ${i + 1} has no fields.`);
  });
  const fieldIds = new Set(steps.flatMap((s) => s.fields.map((f) => f.id)));

  const rules: Rule[] = [];
  for (const x of (Array.isArray(r.rules) ? r.rules : []).slice(0, LIMITS.rules)) {
    const ro = (x && typeof x === "object" ? x : {}) as { id?: unknown; when?: Record<string, unknown>; then?: Record<string, unknown> };
    const id = str(ro.id, 24) ?? "";
    const wf = str(ro.when?.field, 24) ?? "";
    const tf = str(ro.then?.field, 24) ?? "";
    const op = ["is", "is_not", "filled", "empty"].includes(ro.when?.op as string) ? (ro.when!.op as Rule["when"]["op"]) : null;
    const action = ["show", "hide", "require"].includes(ro.then?.action as string) ? (ro.then!.action as Rule["then"]["action"]) : null;
    if (!ID.test(id) || !op || !action) {
      errors.push("A rule is incomplete.");
      continue;
    }
    if (!fieldIds.has(wf) || !fieldIds.has(tf)) {
      errors.push("A rule points at a field that's gone.");
      continue;
    }
    if (wf === tf) {
      errors.push("A rule can't depend on its own field.");
      continue;
    }
    rules.push({ id, when: { field: wf, op, ...(op === "is" || op === "is_not" ? { value: str(ro.when?.value, 200) ?? "" } : {}) }, then: { action, field: tf } });
  }
  const emailField = steps.flatMap((s) => s.fields).find((f) => f.key === "email");
  if (emailField && rules.some((x) => x.then.field === emailField.id && x.then.action !== "require")) errors.push("The email field can't be hidden by a rule.");

  const layout = (r.layout && typeof r.layout === "object" ? r.layout : {}) as Record<string, unknown>;
  const submit = (r.submit && typeof r.submit === "object" ? r.submit : {}) as Record<string, unknown>;
  const consent = (r.consent && typeof r.consent === "object" ? r.consent : {}) as Record<string, unknown>;
  const spam = (r.spam && typeof r.spam === "object" ? r.spam : {}) as Record<string, unknown>;
  const after = (r.after && typeof r.after === "object" ? r.after : {}) as { end?: Record<string, unknown> };
  const consentMode = ["off", "by_region", "always"].includes(consent.mode as string) ? (consent.mode as Form["consent"]["mode"]) : "by_region";
  const consentLabel = str(consent.label, LIMITS.text) || DEFAULT_CONSENT;
  let end: After["end"];
  if (after.end?.kind === "redirect") {
    const url = str(after.end.url, 1000) ?? "";
    if (!safeUrl(url)) errors.push("The page to open after the submit needs a full https:// address.");
    end = { kind: "redirect", url };
  } else {
    end = { kind: "message", title: str(after.end?.title, LIMITS.label) || "Thanks, we got it.", ...(str(after.end?.text, LIMITS.text) ? { text: str(after.end?.text, LIMITS.text) } : {}) };
  }
  let schedule: Schedule | undefined;
  const sch = (after as { schedule?: Record<string, unknown> }).schedule;
  if (sch && typeof sch === "object") {
    const tool = SCHEDULERS.find((x) => x.value === sch.tool)?.value;
    const url = str(sch.url, 500) ?? "";
    const problem = tool ? linkProblem(tool, url) : "Pick a scheduler.";
    if (problem && !(sch.perOwner === true && !url)) errors.push(`Booking: ${problem}`);
    if (tool) schedule = { tool, url, perOwner: sch.perOwner === true };
    if (end.kind === "redirect") errors.push("A form can book a meeting or open a page after the submit, not both.");
  }
  const minSeconds = Math.round(Number(spam.minSeconds ?? 2));
  const form: Form = {
    steps,
    rules,
    layout: { labels: layout.labels === "inside" ? "inside" : "above", width: layout.width === "wide" ? "wide" : "narrow" },
    ...(str(r.title, LIMITS.label) ? { title: str(r.title, LIMITS.label) } : {}),
    ...(str(r.intro, LIMITS.text) ? { intro: str(r.intro, LIMITS.text) } : {}),
    submit: { label: str(submit.label, 60) || "Submit" },
    consent: { mode: consentMode, label: consentLabel },
    spam: { minSeconds: Number.isFinite(minSeconds) ? Math.min(Math.max(minSeconds, 0), 30) : 2, turnstile: spam.turnstile === true },
    after: { end, ...(schedule ? { schedule } : {}) },
  };
  return errors.length ? { errors: [...new Set(errors)] } : { form };
}

/** https only (http for localhost while testing), no credentials in the address. */
export function safeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

/** Which fields show, and which are required, given the answers so far. Rules run in order; later ones win. */
export function visibility(form: Pick<Form, "steps" | "rules">, answers: Record<string, unknown>): { shown: Set<string>; required: Set<string> } {
  const fields = allFields(form);
  const shown = new Set(fields.filter((f) => f.type !== "hidden").map((f) => f.id));
  const required = new Set(fields.filter((f) => f.required).map((f) => f.id));
  // A field that a "show" rule controls starts hidden.
  for (const r of form.rules) if (r.then.action === "show") shown.delete(r.then.field);
  const byId = new Map(fields.map((f) => [f.id, f]));
  for (const r of form.rules) {
    const src = byId.get(r.when.field);
    if (!src) continue;
    const v = answers[src.id];
    const list = Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === "" || v === false ? [] : [String(v)];
    const hit =
      r.when.op === "filled" ? list.length > 0 : r.when.op === "empty" ? list.length === 0 : r.when.op === "is" ? list.includes(r.when.value ?? "") : !list.includes(r.when.value ?? "");
    // A rule on a hidden field never fires.
    if (!hit || (src.type !== "hidden" && !shown.has(src.id))) continue;
    if (r.then.action === "show") shown.add(r.then.field);
    else if (r.then.action === "hide") shown.delete(r.then.field);
    else required.add(r.then.field);
  }
  for (const id of [...required]) if (!shown.has(id)) required.delete(id);
  return { shown, required };
}
