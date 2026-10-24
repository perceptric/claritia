// The form schema (docs/form-builder.md Part 3). A form is JSON: steps of fields, rules, layout, consent, spam and
// what happens after the submit. One checker runs on every save, every edit the chat makes, every publish and in
// the renderer, so a form that fails it can't go live. Labels and copy are plain text; nothing in a form is ever
// read as HTML. Runs in the browser and on the server.

import { linkProblem, SCHEDULERS, WORK_EMAIL, type MatchRule, type Schedule } from "./schedule.ts";

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "textarea"
  | "number"
  | "choice"
  | "multi"
  | "dropdown"
  | "checkbox"
  | "country"
  | "date"
  | "url"
  | "rating"
  | "hidden"
  | "consent"
  // Content blocks: shown on the form, they take no answer and save nothing (docs/form-studio.md 2.4).
  | "heading"
  | "paragraph"
  | "divider"
  | "image";

export const CONTENT_TYPES: FieldType[] = ["heading", "paragraph", "divider", "image"];
export const isContent = (t: FieldType) => CONTENT_TYPES.includes(t);
/** Types that hold one choice from a list: cards or a dropdown. */
export const isChoice = (t: FieldType) => t === "choice" || t === "multi" || t === "dropdown";

/**
 * Where an answer goes. Contact keys land on the contact; `f.<key>` on one of the workspace's custom contact fields;
 * `q.<slug>` stays with the submission (and goes to every destination), like "What are you looking for?".
 */
export type FieldKey = "email" | "first_name" | "last_name" | "name" | "title" | "phone" | "company" | "website" | "country" | "region" | `f.${string}` | `q.${string}` | `c.${string}`;

export type Choice = { value: string; label: string };

/** Checks on an answer (docs/form-studio.md 2.1). min and max are characters for text, the value for numbers and
 * ratings, and picks for "pick many". */
export type Validation = {
  min?: number;
  max?: number;
  step?: number;
  /** Email: only these domains (work email aside). */
  domains?: string[];
  /** Date: the earliest and latest day, as YYYY-MM-DD. */
  earliest?: string;
  latest?: string;
  /** Date: Monday to Friday only. */
  weekdays?: boolean;
  /** Link: https only. */
  https?: boolean;
  /** Phone: the country it's read in when it has no +code. */
  country?: string;
  /** The error when an answer fails a check, and when a required field is empty. */
  message?: string;
  requiredMessage?: string;
};

/** What a form answer does to a contact value that's already there. */
export type Overwrite = "always" | "if_empty" | "never";

/** A CRM property the answer also goes to, on a connected CRM source. */
export type CrmLink = { source: string; property: string; label?: string; type?: string };

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
  width?: FieldWidth;
  /** A hidden field's value: from a URL parameter, the page, the referrer, or a fixed value. */
  hidden?: { from: "param" | "page" | "referrer" | "static"; name?: string; value?: string };
  /** Fill from a URL parameter of the same name when it's there. */
  prefill?: boolean;
  /** Captured forms: the field's name on the team's own form. */
  source?: string;
  /** The answer it starts with. */
  default?: string;
  /** The label is kept for screen readers but not shown. */
  hideLabel?: boolean;
  /** This field's labels, when not the form's. */
  labels?: "above" | "inside";
  size?: "sm" | "md" | "lg";
  hideOnPhone?: boolean;
  valid?: Validation;
  /** For contact and custom fields: what the answer does to a value the contact already has. */
  overwrite?: Overwrite;
  crm?: CrmLink;
  /** Pick one, pick many and dropdown: an "Other" choice with a text box, and a shuffled order. */
  other?: boolean;
  shuffle?: boolean;
  rating?: { scale: number; style: "stars" | "numbers"; low?: string; high?: string };
  /** How this field's rules combine for each action: any one of them (the default) or all of them. */
  logic?: "all";
  /** Content blocks: the heading or paragraph text, the heading level, the picture and its words. */
  content?: { text?: string; level?: 1 | 2 | 3; src?: string; alt?: string; align?: "left" | "center" };
};

export type FieldWidth = "full" | "half" | "third" | "two_thirds";
export const WIDTHS: FieldWidth[] = ["full", "half", "third", "two_thirds"];

/** A form a team already has on its site, read when it's sent (docs/form-builder.md Part 9). */
export type Capture = { adapter: "html" | "hubspot" | "marketo" | "webflow" | "framer"; selector?: string };
export const ADAPTERS: { value: Capture["adapter"]; label: string; domain: string }[] = [
  { value: "html", label: "Any HTML form", domain: "" },
  { value: "hubspot", label: "HubSpot", domain: "hubspot.com" },
  { value: "marketo", label: "Marketo", domain: "marketo.com" },
  { value: "webflow", label: "Webflow", domain: "webflow.com" },
  { value: "framer", label: "Framer", domain: "framer.com" },
];

export type Rule = {
  id: string;
  when: { field: string; op: "is" | "is_not" | "filled" | "empty"; value?: string };
  then: { action: "show" | "hide" | "require"; field: string };
};

/** skip: when the condition holds at the end of this step, jump forward to step `to` (0-based). */
export type Step = { id: string; title?: string; fields: Field[]; skip?: { when: Rule["when"]; to: number } };

export type After = {
  end: { kind: "message"; title: string; text?: string } | { kind: "redirect"; url: string };
  /** Book a meeting after the submit: Claritia calendar in the form, or an outside scheduler (src/lib/forms/schedule.ts). */
  schedule?: Schedule;
};

export type Form = {
  steps: Step[];
  rules: Rule[];
  /** progress: how steps show where you are (a bar unless set). maxWidth: px, over the narrow or wide width. */
  layout: { labels: "above" | "inside"; width: "narrow" | "wide"; progress?: "bar" | "dots" | "none"; maxWidth?: number };
  title?: string;
  intro?: string;
  /** full: the button spans the form's width. */
  submit: { label: string; full?: boolean };
  /** notice: no box, the label shows under the button and the lead is kept on legitimate interest. */
  consent: { mode: "off" | "by_region" | "always" | "notice"; label: string; /** An opt-in joins this email topic. */ topicId?: string };
  spam: { minSeconds: number; turnstile: boolean };
  after: After;
  capture?: Capture;
  /** Fill before submit (docs/enrich-workflows-reports.md 1.2 B): fields hidden when enrichment already knows them. */
  enrich?: { hideKnown: boolean; fields: string[] };
};

/** The fields fill before submit may hide (src/lib/enrich/types.ts HIDEABLE). */
export const HIDE_KEYS = ["company", "website", "title", "country", "phone", "size", "industry", "seniority", "department"];

/** The enrichment key a field answers ("company", "title"... or a custom "f.industry" as "industry"). */
export const hideKeyOf = (key: string) => key.replace(/^f\./, "");

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short answer" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "textarea", label: "Long answer" },
  { value: "number", label: "Number" },
  { value: "choice", label: "Pick one" },
  { value: "multi", label: "Pick many" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "country", label: "Country" },
  { value: "date", label: "Date" },
  { value: "url", label: "Website" },
  { value: "rating", label: "Rating" },
  { value: "hidden", label: "Hidden" },
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Text" },
  { value: "divider", label: "Divider" },
  { value: "image", label: "Image" },
];

/** Contact keys and the field types that can carry them. */
export const CONTACT_KEYS: { key: FieldKey; label: string; types: FieldType[] }[] = [
  { key: "email", label: "Email", types: ["email"] },
  { key: "name", label: "Full name", types: ["text"] },
  { key: "first_name", label: "First name", types: ["text"] },
  { key: "last_name", label: "Last name", types: ["text"] },
  { key: "title", label: "Job title", types: ["text", "choice", "dropdown"] },
  { key: "phone", label: "Phone", types: ["phone", "text"] },
  { key: "company", label: "Company", types: ["text"] },
  { key: "website", label: "Company website", types: ["url", "text"] },
  { key: "country", label: "Country", types: ["country", "text", "choice", "dropdown"] },
  { key: "region", label: "State or region", types: ["text", "choice", "dropdown"] },
];

export const LIMITS = { steps: 10, fields: 40, options: 100, rules: 50, label: 300, text: 1000, value: 5000 };
export const DEFAULT_CONSENT = "I agree to receive emails. I can unsubscribe at any time.";
export const DEFAULT_NOTICE = "By sending this, you agree we may email you about our products. You can unsubscribe at any time.";

const ID = /^[a-z0-9]{1,24}$/;
const Q_KEY = /^q\.[a-z][a-z0-9_]{0,39}$/;
const F_KEY = /^f\.[a-z][a-z0-9_]{0,39}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const CRM_PROP = /^[A-Za-z0-9_.:-]{1,100}$/;
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

/** A heading, text, divider or image, checked. */
function contentBlock(id: string, type: FieldType, fo: Record<string, unknown>, name: string, errors: string[]): Field | null {
  const c = (fo.content && typeof fo.content === "object" ? fo.content : {}) as Record<string, unknown>;
  const f: Field = { id, key: `c.${id}`, type, label: str(fo.label, LIMITS.label) || (FIELD_TYPES.find((t) => t.value === type)?.label ?? ""), required: false };
  const content: NonNullable<Field["content"]> = {};
  if (type === "heading" || type === "paragraph") {
    const text = str(c.text, type === "heading" ? LIMITS.label : LIMITS.text) ?? "";
    if (!text) errors.push(`${type === "heading" ? "A heading" : "A text block"} is empty.`);
    content.text = text;
    if (type === "heading") content.level = c.level === 1 || c.level === 3 ? c.level : 2;
  }
  if (type === "image") {
    const src = str(c.src, 1000) ?? "";
    if (!safeUrl(src) || src.startsWith("http:")) errors.push(`${name === "A field" ? "An image" : name} needs a picture address starting with https://.`);
    content.src = src;
    const alt = str(c.alt, 200);
    if (alt) content.alt = alt;
  }
  if (c.align === "center") content.align = "center";
  if (Object.keys(content).length) f.content = content;
  if (fo.hideOnPhone === true) f.hideOnPhone = true;
  if (fo.logic === "all") f.logic = "all";
  return f;
}

/** The look settings a field can carry. */
function fieldLook(f: Field, fo: Record<string, unknown>) {
  if (fo.hideLabel === true) f.hideLabel = true;
  if (fo.labels === "above" || fo.labels === "inside") f.labels = fo.labels;
  if (fo.size === "sm" || fo.size === "lg") f.size = fo.size;
  if (fo.hideOnPhone === true) f.hideOnPhone = true;
}

/** A field's checks, cleaned. Settings that don't fit the type are dropped; ones that can't hold are errors. */
function validation(type: FieldType, raw: unknown, name: string, errors: string[]): Validation | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const v: Validation = {};
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : undefined);
  const counted = type === "text" || type === "textarea" || type === "number" || type === "multi" || type === "rating" || type === "url";
  if (counted) {
    const min = num(r.min);
    const max = num(r.max);
    const whole = type !== "number";
    if (min !== undefined) v.min = whole ? Math.max(0, Math.round(min)) : min;
    if (max !== undefined) v.max = whole ? Math.max(0, Math.round(max)) : max;
    if (v.min !== undefined && v.max !== undefined && v.min > v.max) errors.push(`${name}: the lowest is above the highest.`);
  }
  if (type === "number") {
    const step = num(r.step);
    if (step !== undefined && step > 0) v.step = step;
  }
  if (type === "email" && Array.isArray(r.domains)) {
    const list = [...new Set(r.domains.map((d) => (typeof d === "string" ? d.trim().toLowerCase().replace(/^@/, "") : "")).filter((d) => DOMAIN.test(d)))].slice(0, 50);
    if (list.length) v.domains = list;
  }
  if (type === "date") {
    const e = str(r.earliest, 10);
    const l = str(r.latest, 10);
    if (e && DAY.test(e)) v.earliest = e;
    if (l && DAY.test(l)) v.latest = l;
    if (v.earliest && v.latest && v.earliest > v.latest) errors.push(`${name}: the earliest day is after the latest.`);
    if (r.weekdays === true) v.weekdays = true;
  }
  if (type === "url" && r.https === true) v.https = true;
  if (type === "phone") {
    const c = str(r.country, 2);
    if (c && /^[A-Z]{2}$/.test(c)) v.country = c;
  }
  const message = str(r.message, 200);
  if (message) v.message = message;
  const requiredMessage = str(r.requiredMessage, 200);
  if (requiredMessage) v.requiredMessage = requiredMessage;
  return Object.keys(v).length ? v : undefined;
}

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
      if (isContent(type)) {
        const block = contentBlock(id, type, fo, name, errors);
        if (block) fields.push(block);
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
      if (WIDTHS.includes(fo.width as FieldWidth) && fo.width !== "full") f.width = fo.width as FieldWidth;
      if (fo.check === "work_email" && type === "email") f.check = "work_email";
      if (fo.prefill === true) f.prefill = true;
      const src = str(fo.source, 120);
      if (src) f.source = src;
      fieldLook(f, fo);
      if (f.hideOnPhone && f.required) errors.push(`${name} is required, so it can't be hidden on phones.`);
      const valid = validation(type, fo.valid, name, errors);
      if (valid) f.valid = valid;
      if (fo.overwrite === "always" || fo.overwrite === "if_empty" || fo.overwrite === "never") {
        if (f.key.startsWith("q.")) errors.push(`${name} keeps its answer on the fill, so there's nothing to overwrite.`);
        else f.overwrite = fo.overwrite;
      }
      const crm = (fo.crm && typeof fo.crm === "object" ? fo.crm : null) as Record<string, unknown> | null;
      if (crm) {
        const source = str(crm.source, 36) ?? "";
        const property = str(crm.property, 100) ?? "";
        if (!/^[0-9a-f-]{36}$/.test(source) || !CRM_PROP.test(property)) errors.push(`${name} links to a CRM field that can't be read.`);
        else f.crm = { source, property, ...(str(crm.label, 120) ? { label: str(crm.label, 120) } : {}), ...(str(crm.type, 40) ? { type: str(crm.type, 40) } : {}) };
      }
      if (type === "rating") {
        const ro = (fo.rating && typeof fo.rating === "object" ? fo.rating : {}) as Record<string, unknown>;
        const scale = Math.round(Number(ro.scale ?? 5));
        f.rating = {
          scale: Number.isFinite(scale) ? Math.min(Math.max(scale, 3), 10) : 5,
          style: ro.style === "numbers" ? "numbers" : "stars",
          ...(str(ro.low, 60) ? { low: str(ro.low, 60) } : {}),
          ...(str(ro.high, 60) ? { high: str(ro.high, 60) } : {}),
        };
      }
      if (fo.logic === "all") f.logic = "all";
      if (isChoice(type)) {
        if (fo.other === true) f.other = true;
        if (fo.shuffle === true) f.shuffle = true;
      }
      if (type === "choice" || type === "multi" || type === "dropdown") {
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
      const def = str(fo.default, LIMITS.label);
      if (def && type !== "hidden" && type !== "checkbox") {
        if (isChoice(type) && !(f.options ?? []).some((o) => o.value === def)) errors.push(`${name} starts on a choice it doesn't have.`);
        else f.default = def;
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
    if (!s.fields.some((f) => f.type !== "hidden" && !isContent(f.type))) errors.push(`Step ${i + 1} has no fields.`);
  });
  const fieldIds = new Set(steps.flatMap((s) => s.fields.map((f) => f.id)));
  const contentIds = new Set(steps.flatMap((s) => s.fields.filter((f) => isContent(f.type)).map((f) => f.id)));

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
    if (contentIds.has(wf)) {
      errors.push("A rule can't depend on a heading, text, divider or image.");
      continue;
    }
    if (contentIds.has(tf) && action === "require") {
      errors.push("A heading, text, divider or image can't be required.");
      continue;
    }
    rules.push({ id, when: { field: wf, op, ...(op === "is" || op === "is_not" ? { value: str(ro.when?.value, 200) ?? "" } : {}) }, then: { action, field: tf } });
  }
  rawSteps.slice(0, LIMITS.steps).forEach((raw, i) => {
    const sk = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).skip : null) as { when?: Record<string, unknown>; to?: unknown } | null;
    if (!sk || typeof sk !== "object" || !steps[i]) return;
    const field = str(sk.when?.field, 24) ?? "";
    const op = ["is", "is_not", "filled", "empty"].includes(sk.when?.op as string) ? (sk.when!.op as Rule["when"]["op"]) : null;
    const to = Math.round(Number(sk.to));
    const earlier = steps.slice(0, i + 1).some((s) => s.fields.some((f) => f.id === field && !isContent(f.type)));
    if (!op || !earlier) errors.push(`Step ${i + 1} skips on a field that isn't on it or before it.`);
    else if (!Number.isFinite(to) || to <= i + 1 || to >= steps.length) errors.push(`Step ${i + 1} skips to a step that isn't after the next one.`);
    else steps[i].skip = { when: { field, op, ...(op === "is" || op === "is_not" ? { value: str(sk.when?.value, 200) ?? "" } : {}) }, to };
  });
  const emailField = steps.flatMap((s) => s.fields).find((f) => f.key === "email");
  if (emailField && rules.some((x) => x.then.field === emailField.id && x.then.action !== "require")) errors.push("The email field can't be hidden by a rule.");

  const layout = (r.layout && typeof r.layout === "object" ? r.layout : {}) as Record<string, unknown>;
  const submit = (r.submit && typeof r.submit === "object" ? r.submit : {}) as Record<string, unknown>;
  const consent = (r.consent && typeof r.consent === "object" ? r.consent : {}) as Record<string, unknown>;
  const spam = (r.spam && typeof r.spam === "object" ? r.spam : {}) as Record<string, unknown>;
  const after = (r.after && typeof r.after === "object" ? r.after : {}) as { end?: Record<string, unknown> };
  const consentMode = ["off", "by_region", "always", "notice"].includes(consent.mode as string) ? (consent.mode as Form["consent"]["mode"]) : "by_region";
  const topicId = typeof consent.topicId === "string" && /^[0-9a-f-]{36}$/.test(consent.topicId) && consentMode !== "off" && consentMode !== "notice" ? consent.topicId : undefined;
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
    const tool = sch.tool === "claritia" ? "claritia" : SCHEDULERS.find((x) => x.value === sch.tool)?.value;
    // Claritia calendar books a meeting type and takes no link; an outside scheduler needs its link (or owners' links).
    const typeId = tool === "claritia" && typeof sch.meetingTypeId === "string" && /^[0-9a-f-]{36}$/.test(sch.meetingTypeId) ? sch.meetingTypeId : undefined;
    const url = tool === "claritia" ? "" : (str(sch.url, 500) ?? "");
    const problem = tool === "claritia" ? (typeId ? null : "Pick a meeting type.") : tool ? linkProblem(tool, url) : "Pick a scheduler.";
    if (problem && !(tool !== "claritia" && sch.perOwner === true && !url)) errors.push(`Booking: ${problem}`);
    if (tool) {
      schedule = tool === "claritia" ? { tool, url, perOwner: false, ...(typeId ? { meetingTypeId: typeId } : {}) } : { tool, url, perOwner: sch.perOwner === true };
      if (sch.who === "match") {
        const rules: MatchRule[] = [];
        for (const x of (Array.isArray(sch.rules) ? sch.rules : []).slice(0, 10)) {
          const ro = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          const field = str(ro.field, 24) ?? "";
          const op = ["is", "is_not", "filled", "empty", "gte", "lte"].includes(ro.op as string) ? (ro.op as MatchRule["op"]) : null;
          if (!op || (field !== WORK_EMAIL && !fieldIds.has(field)) || contentIds.has(field)) {
            errors.push("Booking: a rule for who sees the calendar points at a field that's gone.");
            continue;
          }
          const value = str(ro.value, 200);
          if ((op === "gte" || op === "lte") && !Number.isFinite(Number(value))) {
            errors.push("Booking: a rule compares with a number that isn't one.");
            continue;
          }
          rules.push({ field, op, ...(value !== undefined && op !== "filled" && op !== "empty" ? { value } : {}) });
        }
        if (!rules.length) errors.push("Booking: add a rule for who sees the calendar, or show it to everyone.");
        schedule.who = "match";
        schedule.rules = rules;
        if (sch.any === true) schedule.any = true;
      }
      const heading = str(sch.heading, LIMITS.label);
      if (heading) schedule.heading = heading;
      if (sch.prefill === false && tool !== "claritia") schedule.prefill = false;
    }
    if (end.kind === "redirect") errors.push("A form can book a meeting or open a page after the submit, not both.");
  }
  let capture: Capture | undefined;
  const cap = r.capture as Record<string, unknown> | undefined;
  if (cap && typeof cap === "object") {
    const adapter = ADAPTERS.find((a) => a.value === cap.adapter)?.value ?? "html";
    const selector = str(cap.selector, 200);
    capture = { adapter, ...(selector ? { selector } : {}) };
    for (const f of steps.flatMap((x) => x.fields)) if (f.type !== "hidden" && !f.source) errors.push(`${f.label || "A field"} needs its name on your form.`);
  }
  const minSeconds = Math.round(Number(spam.minSeconds ?? 2));
  const en = (r.enrich && typeof r.enrich === "object" ? r.enrich : {}) as { hideKnown?: unknown; fields?: unknown };
  const enrichFields = Array.isArray(en.fields) ? [...new Set(en.fields.filter((x): x is string => typeof x === "string" && HIDE_KEYS.includes(x)))] : [];
  const form: Form = {
    steps,
    rules,
    layout: {
      labels: layout.labels === "inside" ? "inside" : "above",
      width: layout.width === "wide" ? "wide" : "narrow",
      ...(layout.progress === "dots" || layout.progress === "none" ? { progress: layout.progress } : {}),
      ...(Number.isFinite(Number(layout.maxWidth)) && Number(layout.maxWidth) >= 280 ? { maxWidth: Math.min(Math.round(Number(layout.maxWidth)), 1200) } : {}),
    },
    ...(str(r.title, LIMITS.label) ? { title: str(r.title, LIMITS.label) } : {}),
    ...(str(r.intro, LIMITS.text) ? { intro: str(r.intro, LIMITS.text) } : {}),
    submit: { label: str(submit.label, 60) || "Submit", ...(submit.full === true ? { full: true } : {}) },
    consent: { mode: consentMode, label: consentLabel, ...(topicId ? { topicId } : {}) },
    spam: { minSeconds: Number.isFinite(minSeconds) ? Math.min(Math.max(minSeconds, 0), 30) : 2, turnstile: spam.turnstile === true },
    after: { end, ...(schedule ? { schedule } : {}) },
    ...(capture ? { capture } : {}),
    ...(en.hideKnown === true || enrichFields.length ? { enrich: { hideKnown: en.hideKnown === true, fields: enrichFields } } : {}),
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
  // A field set to "all" acts only when every one of its rules for that action matches; the last one decides.
  const group = (r: Rule) => `${r.then.field}|${r.then.action}`;
  const last = new Map<string, number>();
  form.rules.forEach((r, i) => last.set(group(r), i));
  const missed = new Set<string>();
  form.rules.forEach((r, i) => {
    const src = byId.get(r.when.field);
    const all = byId.get(r.then.field)?.logic === "all";
    // A rule on a hidden field never fires.
    const hit = !!src && whenHits(r.when, answers[src.id]) && (src.type === "hidden" || shown.has(src.id));
    if (all) {
      if (!hit) missed.add(group(r));
      if (last.get(group(r)) !== i || missed.has(group(r))) return;
    } else if (!hit) return;
    if (r.then.action === "show") shown.add(r.then.field);
    else if (r.then.action === "hide") shown.delete(r.then.field);
    else required.add(r.then.field);
  });
  for (const id of [...required]) if (!shown.has(id)) required.delete(id);
  return { shown, required };
}

/** Whether a rule's condition holds for an answer. */
export function whenHits(when: Rule["when"], v: unknown): boolean {
  const list = Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === "" || v === false ? [] : [String(v)];
  return when.op === "filled" ? list.length > 0 : when.op === "empty" ? list.length === 0 : when.op === "is" ? list.includes(when.value ?? "") : !list.includes(when.value ?? "");
}

/**
 * The step to show after `from` given the answers: the step's skip target when its condition holds (and the field
 * it reads is on a step already passed), else the next one. Returns form.steps.length when the form is done.
 */
export function nextStep(form: Pick<Form, "steps">, from: number, answers: Record<string, unknown>): number {
  const skip = form.steps[from]?.skip;
  if (skip && skip.to > from + 1 && skip.to < form.steps.length) {
    const before = form.steps.slice(0, from + 1).some((s) => s.fields.some((f) => f.id === skip.when.field));
    if (before && whenHits(skip.when, answers[skip.when.field])) return skip.to;
  }
  return from + 1;
}
