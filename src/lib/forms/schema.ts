// The form schema (docs/form-builder.md Part 3). A form is JSON: steps of fields, rules, layout, consent, spam and
// what happens after the submit. One checker runs on every save, every edit the chat makes, every publish and in
// the renderer, so a form that fails it can't go live. Labels and copy are plain text; nothing in a form is ever
// read as HTML. Runs in the browser and on the server.

import { readFormDesign, type FormDesign } from "../design/model.ts";
import { CONST_ID, evalFormula, parseFormula, type Ast } from "./formula.ts";
import { cleanHtml } from "./html.ts";
import { linkProblem, SCHEDULERS, WORK_EMAIL, type MatchRule, type Schedule } from "./schedule.ts";
import { cleanCondition } from "../router/check.ts";
import { checkPage, type Page } from "../studio/page.ts";
import { cleanKeep, cleanNotify, cleanReply, cleanSites, type Keep, type Notify, type Reply } from "./notify.ts";

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
  // Worked out from other answers by a formula (docs/forms-plan.md 2.3); the server works it out again.
  | "calc"
  // A file the visitor uploads (docs/forms-plan.md 3.1): kept private, the answer is the upload's token.
  | "file"
  // Content blocks: shown on the form, they take no answer and save nothing (docs/form-studio.md 2.4).
  | "heading"
  | "paragraph"
  | "divider"
  | "image"
  // A result block (docs/interactive-forms-plan.md Part 4): a number, a meter, a breakdown, bars or the outcome.
  | "result"
  // An HTML section the AI writes (docs/forms.md): a hero, pictures and words, cleaned by html.ts.
  | "html"
  // docs/form-kinds-plan.md step 2: put the options in order; street, city, postcode and country; one choice per row
  // of a grid; a time of day; a first and last date; "add another" rows of small questions; a drawn signature.
  | "ranking"
  | "address"
  | "grid"
  | "time"
  | "daterange"
  | "group"
  | "signature"
  // A payment block (docs/form-kinds-plan.md step 3): the total shows on the form, and Stripe Checkout opens after the
  // send, on the workspace's own account.
  | "payment";

/** Currencies a payment block takes (Stripe's, by its code). */
export const PAY_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "NZD", "SGD", "INR", "JPY", "CHF", "SEK", "NOK", "DKK", "BRL", "MXN", "ZAR", "AED"];
/** Currencies Stripe counts in whole units (no cents). */
const ZERO_DECIMAL = new Set(["JPY"]);

/** Answers that are more than one value (an address, a grid, a date range, group rows): kept on the fill only. */
export const STRUCTURED: FieldType[] = ["ranking", "address", "grid", "daterange", "group", "signature"];
/** The parts of an address answer, in order. */
export const ADDRESS_PARTS = ["line1", "line2", "city", "region", "postal", "country"] as const;
/** The question types a group row can hold. */
export const GROUP_TYPES: FieldType[] = ["text", "email", "phone", "number", "dropdown", "date"];

export const CONTENT_TYPES: FieldType[] = ["heading", "paragraph", "divider", "image", "result", "html", "payment"];
export const isContent = (t: FieldType) => CONTENT_TYPES.includes(t);
/** Types that hold one choice from a list: cards or a dropdown. */
export const isChoice = (t: FieldType) => t === "choice" || t === "multi" || t === "dropdown";

/**
 * Where an answer goes. Contact keys land on the contact; `f.<key>` on one of the workspace's custom contact fields;
 * `q.<slug>` stays with the submission (and goes to every destination), like "What are you looking for?".
 */
export type FieldKey = "email" | "first_name" | "last_name" | "name" | "title" | "phone" | "company" | "website" | "country" | "region" | `f.${string}` | `q.${string}` | `c.${string}`;

/** score: the number a formula reads when this choice is picked. */
/** image: a picture card's https address. needs: other options (pick many) that must be picked with this one. */
export type Choice = { value: string; label: string; score?: number; image?: string; needs?: string[] };

/**
 * Options that follow another field's answer (docs/forms-plan.md 2.2): a list per answer of the parent, or the
 * built-in regions of the country picked.
 */
export type OptionsBy = { field: string; map?: Record<string, Choice[]>; preset?: "regions" };

/** A calculated field: the formula, how its result shows, and whether it shows at all. */
export type Calc = { formula: string; format?: "number" | "money" | "percent"; decimals?: number; currency?: string; show?: false };

/**
 * A setting the owner sets once and formulas read as {@id} (docs/interactive-forms-plan.md 3.2): a base fee, a rate.
 * value null: not set yet, so formulas that read it stay empty and the form can't be published. private: the value
 * never leaves the server, so the browser can't work out what reads it before the submit.
 */
export type Constant = { id: string; name: string; value: number | null; format?: "number" | "money" | "percent"; private?: true };

/** One result a visitor can reach. The first whose conditions hold wins; the last has none and is the default. */
export type Outcome = { id: string; title: string; text?: string; when?: { logic: "all" | "any"; conds: Cond[] }; meeting?: string };
/** instant: the result shows before contact details. after_contact: only after them. summary_first: a summary, then the rest. */
export type Results = { outcomes: Outcome[]; show: "instant" | "after_contact" | "summary_first" };

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

/**
 * A CRM property the answer also goes to, on a connected CRM source. `map`: for pick lists, the CRM value each of the
 * field's choices goes as ("" sends nothing for that choice); a choice not in the map goes as itself.
 */
export type CrmLink = { source: string; property: string; label?: string; type?: string; map?: Record<string, string> };

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
  /** zero: the scale starts at 0 (0 to 10 for NPS). */
  rating?: { scale: number; style: "stars" | "numbers"; low?: string; high?: string; zero?: true };
  /** Grid: the rows asked about, each answered with one of the columns. */
  grid?: { rows: Choice[]; cols: Choice[] };
  /** Payment: the amount from a calc (its value, in the currency's main unit) or a fixed amount, and the currency. */
  pay?: { field?: string; amount?: number; currency: string };
  /** Group: the small questions in each row, and how many rows. */
  group?: { fields: Field[]; min?: number; max: number; add?: string };
  /** How this field's rules combine for each action: any one of them (the default) or all of them. */
  logic?: "all";
  /** Content blocks: the heading or paragraph text, the heading level, the picture and its words. */
  content?: { text?: string; level?: 1 | 2 | 3; src?: string; alt?: string; align?: "left" | "center"; html?: string };
  optionsBy?: OptionsBy;
  calc?: Calc;
  /** Pick one and pick many: big cards (with pictures when the options have them) in place of a list. */
  cards?: true;
  /** Number: a slider with a box beside it (needs a min and a max); unit: shown with the number. */
  slider?: true;
  unit?: "money" | "percent";
  /** A result block's settings. */
  result?: ResultBlock;
  /** Pick one and pick many: the choices' scores stay on the server (a quiz's answer key). */
  secret?: true;
  /** File upload: the biggest file in MB (up to 20) and the kinds it takes. */
  file?: { maxMb: number; kinds: FileKind[] };
};

/**
 * What a result block shows. metric: one calc. meter: a calc out of max. summary: the listed calcs as lines, the last
 * as the total. bars: the listed calcs side by side. outcome: the outcome's title and text. email: "Email my results".
 */
export type FileKind = "pdf" | "image" | "office";
export const FILE_KINDS: FileKind[] = ["pdf", "image", "office"];
/** A file answer: the upload's id and the name it was sent with. */
export const FILE_ANSWER = /^up_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[^\n/\\]{1,120}$/;

export type ResultBlock = { kind: "metric" | "meter" | "summary" | "bars" | "outcome" | "email"; field?: string; fields?: string[]; max?: number };
export const RESULT_KINDS: ResultBlock["kind"][] = ["metric", "meter", "summary", "bars", "outcome", "email"];

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

export type Op =
  | "is"
  | "is_not"
  | "filled"
  | "empty"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "before"
  | "after"
  | "within_days"
  | "any_of"
  | "none_of";

/** One condition on one field. value2 is the top of "between"; values are the picks of "any of" and "none of". */
export type Cond = { field: string; op: Op; value?: string; value2?: string; values?: string[] };

/**
 * when: the rule's condition. group: more conditions that must also hold, all of them or any one (one level deep),
 * so "country is US and (size over 50 or budget over 10k)" is one rule.
 */
export type Rule = {
  id: string;
  when: Cond;
  group?: { logic: "all" | "any"; when: Cond[] };
  then: { action: "show" | "hide" | "require"; field: string };
};

/**
 * skip: when the condition holds at the end of this step, jump forward to step `to` (0-based). jumps: paths by
 * answer, checked in order before skip; `to` equal to the number of steps sends the form now (end early). image: the
 * picture beside this step on a split screen (over layout.side).
 */
/** result: a result screen, worked out live from the answers so far; it holds result blocks, text and calcs only. */
export type Jump = { when: Cond; to: number };
export type Step = { id: string; title?: string; fields: Field[]; skip?: Jump; jumps?: Jump[]; result?: true; image?: string };

/** What a form is for (docs/form-kinds-plan.md): the AI builds each kind from its own recipe. */
export const FORM_KINDS = ["lead", "quote", "order", "booking", "qualify", "quiz", "survey", "testimonial", "registration", "application", "support", "consent", "internal"] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** What each op compares: any answer, text, a number, a date, or picks from a list. */
export const OP_KIND: Record<Op, "any" | "text" | "number" | "date" | "list"> = {
  is: "any",
  is_not: "any",
  filled: "any",
  empty: "any",
  contains: "text",
  not_contains: "text",
  starts_with: "text",
  ends_with: "text",
  gt: "number",
  gte: "number",
  lt: "number",
  lte: "number",
  between: "number",
  before: "date",
  after: "date",
  within_days: "date",
  any_of: "list",
  none_of: "list",
};
const OP_LIST = /* @__PURE__ */ Object.keys(OP_KIND) as Op[];
const TEXTY: FieldType[] = ["text", "email", "phone", "textarea", "url", "hidden"];
const NUMERIC: FieldType[] = ["number", "rating", "calc", "hidden"];
const LISTY: FieldType[] = ["choice", "multi", "dropdown", "country"];

/** The ops a condition on this type of field can use. */
export function opsFor(type: FieldType): Op[] {
  return OP_LIST.filter((op) => {
    const k = OP_KIND[op];
    return k === "any" || (k === "text" && TEXTY.includes(type)) || (k === "number" && NUMERIC.includes(type)) || (k === "date" && type === "date") || (k === "list" && LISTY.includes(type));
  });
}

/** Field types a formula can read. */
export const CALC_INPUTS: FieldType[] = ["number", "rating", "choice", "multi", "dropdown", "checkbox", "calc"];

export type After = {
  end: { kind: "message"; title: string; text?: string } | { kind: "redirect"; url: string };
  /** Book a meeting after the submit: Claritia calendar in the form, or an outside scheduler (src/lib/forms/schedule.ts). */
  schedule?: Schedule;
};

export type Form = {
  /** A studio form (docs/forms-chat-plan.md): the page Tia wrote, drawn in place of the fields. */
  page?: Page;
  steps: Step[];
  rules: Rule[];
  /** progress: how steps show where you are (a bar unless set). maxWidth: px, over the narrow or wide width. */
  layout: {
    labels: "above" | "inside";
    width: "narrow" | "wide";
    progress?: "bar" | "dots" | "none";
    maxWidth?: number;
    /** screens: one step at a time, full size, big type (docs/interactive-forms-plan.md Part 2). auto: a single pick moves on. */
    mode?: "screens";
    auto?: true;
    /** A first screen with a title, a line and a Start button. */
    cover?: { title: string; text?: string; button?: string };
    /** false hides the brand's logo over the form (it shows by default when the brand kit has one). */
    logo?: false;
    /** Split screen: a picture beside every step (a step's own image wins), on the left unless at is "right". */
    side?: { image: string; at?: "right" };
  };
  /** What the form is for; the builder shows it and the AI keeps to its recipe. */
  kind?: FormKind;
  /** No email needed: polls, anonymous surveys and internal forms. A fill without one is kept with no contact. */
  emailOptional?: true;
  /** "Save and finish later": a link by email that opens the form where they stopped. */
  resume?: true;
  /** After the send, a link to download a PDF copy of the answers. */
  copy?: true;
  title?: string;
  intro?: string;
  /** full: the button spans the form's width. */
  submit: { label: string; full?: boolean };
  /**
   * notice: no box, the label shows under the button and the lead is kept on legitimate interest. required: the box
   * must be ticked to send the form wherever it shows. confirm: an opt-in is confirmed by email before marketing
   * emails go (double opt-in).
   */
  consent: { mode: "off" | "by_region" | "always" | "notice"; label: string; /** An opt-in joins this email topic. */ topicId?: string; required?: true; confirm?: true };
  /**
   * blockFree: free email addresses are refused. sites: the only pages that may send it. perHour: the most a form takes
   * in an hour. bot: with turnstile on, "always" shows the check to everyone; otherwise it runs unseen and only asks
   * when a fill looks like a bot. throwaway: "hold" keeps fills from throwaway addresses in Spam instead of refusing
   * them with a message.
   */
  spam: { minSeconds: number; turnstile: boolean; blockFree?: boolean; sites?: string[]; perHour?: number; bot?: "always"; throwaway?: "hold" };
  after: After;
  /** Team alerts and the auto-reply (src/lib/forms/notify.ts). */
  notify?: Notify;
  reply?: Reply;
  /** How long submissions are kept. */
  keep?: Keep;
  capture?: Capture;
  /** The link's preview in chats and social posts: its title, line and picture (docs/sharing-plan.md). */
  share?: SharePreview;
  /** Settings › Access (src/lib/forms/access.ts): when it opens and closes, the most fills it takes, what it says when closed. */
  access?: Access;
  /** The form's own styles and classes on its elements (docs/design-system.md Part 3.1). */
  design?: FormDesign;
  /** Settings formulas read as {@id}, and the results a visitor can reach (docs/interactive-forms-plan.md). */
  constants?: Constant[];
  results?: Results;
};

export type SharePreview = { title?: string; description?: string; image?: string };
/** opens, closes: ISO times. limit: the most real fills (spam and tests aside). message: shown while it's closed or paused. */
export type Access = { opens?: string; closes?: string; limit?: number; message?: string };

export function cleanAccess(raw: unknown): Access | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const time = (v: unknown) => (typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : undefined);
  const opens = time(r.opens);
  let closes = time(r.closes);
  // A close before the open would never take a fill: the close goes.
  if (opens && closes && Date.parse(closes) <= Date.parse(opens)) closes = undefined;
  const n = Number(r.limit);
  const limit = Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 1_000_000) : undefined;
  const message = str(r.message, 500);
  const out: Access = { ...(opens ? { opens } : {}), ...(closes ? { closes } : {}), ...(limit ? { limit } : {}), ...(message ? { message } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** A link preview, cleaned: a title up to 90, a line up to 200, an https picture. Undefined when it says nothing. */
export function cleanShare(raw: unknown): SharePreview | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const title = str(r.title, 90);
  const description = str(r.description, 200);
  const image = typeof r.image === "string" && /^https:\/\/[^\s"'<>]{4,1000}$/.test(r.image.trim()) ? r.image.trim() : undefined;
  const out: SharePreview = { ...(title ? { title } : {}), ...(description ? { description } : {}), ...(image ? { image } : {}) };
  return Object.keys(out).length ? out : undefined;
}

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
  { value: "calc", label: "Calculation" },
  { value: "file", label: "File upload" },
  { value: "ranking", label: "Ranking" },
  { value: "address", label: "Address" },
  { value: "grid", label: "Grid" },
  { value: "time", label: "Time" },
  { value: "daterange", label: "Date range" },
  { value: "group", label: "Repeating group" },
  { value: "signature", label: "Signature" },
  { value: "payment", label: "Payment" },
  { value: "result", label: "Result" },
  { value: "html", label: "Section" },
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

export const LIMITS = { steps: 10, fields: 40, options: 100, rules: 50, label: 300, text: 1000, value: 5000, constants: 50, outcomes: 12, conds: 10 };
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

/** A pick list's choice-to-CRM-value map, cleaned: text keys and values, at most 100 of them. */
function cleanValueMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 100)) {
    const key = str(k, 200);
    const val = typeof v === "string" ? (str(v, 200) ?? "") : null;
    if (key && val !== null) out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A list of choices, cleaned: no repeats, a label for each, a score when it's a number. */
function choices(raw: unknown, max: number): Choice[] {
  const opts: Choice[] = [];
  const seen = new Set<string>();
  for (const o of Array.isArray(raw) ? raw.slice(0, max) : []) {
    const oo = (typeof o === "string" ? { value: o, label: o } : o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    const lab = str(oo.label, 200) ?? "";
    const val = str(oo.value, 200) || lab;
    if (!val || seen.has(val)) continue;
    seen.add(val);
    const score = typeof oo.score === "number" && Number.isFinite(oo.score) ? oo.score : typeof oo.score === "string" && oo.score.trim() !== "" && Number.isFinite(Number(oo.score)) ? Number(oo.score) : undefined;
    const image = str(oo.image, 1000);
    const needs = Array.isArray(oo.needs) ? [...new Set(oo.needs.filter((x): x is string => typeof x === "string" && x !== val))].slice(0, 10) : [];
    opts.push({ value: val, label: lab || val, ...(score !== undefined ? { score } : {}), ...(image && image.startsWith("https://") && safeUrl(image) ? { image } : {}), ...(needs.length ? { needs } : {}) });
  }
  return opts;
}

function readOptionsBy(raw: unknown): OptionsBy | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const field = str(r.field, 24) ?? "";
  if (r.preset === "regions") return { field, preset: "regions" };
  const map: Record<string, Choice[]> = {};
  const m = (r.map && typeof r.map === "object" && !Array.isArray(r.map) ? r.map : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(m).slice(0, 50)) {
    const key = str(k, 200);
    const list = choices(v, LIMITS.options);
    if (key && list.length) map[key] = list;
  }
  return { field, map };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isNum = (v: unknown) => typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v));

/** One condition, checked against the fields it can read. Returns the clean condition or the problem. */
function readCond(raw: unknown, types: Map<string, FieldType>): Cond | string {
  const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const field = str(c.field, 24) ?? "";
  const type = types.get(field);
  if (!type) return "A rule points at a field that's gone.";
  const op = OP_LIST.includes(c.op as Op) ? (c.op as Op) : null;
  if (!op) return "A rule is incomplete.";
  if (!opsFor(type).includes(op)) return "A rule compares a field in a way that doesn't fit its type.";
  const kind = OP_KIND[op];
  const value = str(typeof c.value === "number" ? String(c.value) : c.value, 200) ?? "";
  if (op === "is" || op === "is_not") return { field, op, value };
  if (op === "filled" || op === "empty") return { field, op };
  if (kind === "text") return value ? { field, op, value } : "A rule needs the words to look for.";
  if (op === "between") {
    const value2 = str(typeof c.value2 === "number" ? String(c.value2) : c.value2, 40) ?? "";
    if (!isNum(value) || !isNum(value2)) return "A rule compares with a number that isn't one.";
    return Number(value) <= Number(value2) ? { field, op, value, value2 } : "A rule's lowest number is above its highest.";
  }
  if (kind === "number") return isNum(value) ? { field, op, value } : "A rule compares with a number that isn't one.";
  if (op === "within_days") return /^\d{1,4}$/.test(value) ? { field, op, value } : "A rule needs a number of days.";
  if (kind === "date") return DAY_RE.test(value) ? { field, op, value } : "A rule needs a date.";
  const values = [...new Set((Array.isArray(c.values) ? c.values : []).map((x) => str(x, 200) ?? "").filter(Boolean))].slice(0, 50);
  return values.length ? { field, op, values } : "A rule needs at least one choice to match.";
}

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
  if (type === "html") {
    const html = cleanHtml(typeof c.html === "string" ? c.html : "");
    if (!html) errors.push(`${name === "A field" ? "A section" : name} is empty or too long.`);
    content.html = html;
  }
  if (type === "result") {
    const ro = (fo.result && typeof fo.result === "object" ? fo.result : {}) as Record<string, unknown>;
    const kind = RESULT_KINDS.includes(ro.kind as ResultBlock["kind"]) ? (ro.kind as ResultBlock["kind"]) : "metric";
    const field = str(ro.field, 24);
    const fields = Array.isArray(ro.fields) ? [...new Set(ro.fields.filter((x): x is string => typeof x === "string" && ID.test(x)))].slice(0, 12) : [];
    const max = Number(ro.max);
    f.result = { kind, ...(field && ID.test(field) ? { field } : {}), ...(fields.length ? { fields } : {}), ...(Number.isFinite(max) && max > 0 ? { max } : {}) };
    if ((kind === "metric" || kind === "meter") && !f.result.field) errors.push(`${name === "A field" ? "A result" : name} needs the number it shows.`);
    if ((kind === "summary" || kind === "bars") && !fields.length) errors.push(`${name === "A field" ? "A result" : name} needs the numbers it shows.`);
    if (kind === "meter" && !f.result.max) errors.push(`${name === "A field" ? "A meter" : name} needs its top value.`);
  }
  if (type === "payment") {
    const po = (fo.pay && typeof fo.pay === "object" ? fo.pay : {}) as Record<string, unknown>;
    const field = str(po.field, 24);
    const amount = Number(po.amount);
    const currency = (str(po.currency, 3) ?? "USD").toUpperCase();
    f.pay = { currency: PAY_CURRENCIES.includes(currency) ? currency : "USD", ...(field && ID.test(field) ? { field } : Number.isFinite(amount) && amount > 0 ? { amount: Math.min(Math.round(amount * 100) / 100, 100000) } : {}) };
    if (!f.pay.field && !f.pay.amount) errors.push(`${name === "A field" ? "A payment" : name} needs an amount or a calculation to charge.`);
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
  if (!rawSteps.length) errors.push("A form needs at least one page.");
  if (rawSteps.length > LIMITS.steps) errors.push(`Up to ${LIMITS.steps} pages.`);
  let count = 0;
  for (const s of rawSteps.slice(0, LIMITS.steps)) {
    const so = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const sid = str(so.id, 24) ?? "";
    if (!ID.test(sid)) errors.push("A page has a bad id.");
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
      const f: Field = { id, key: key as FieldKey, type, label, required: fo.required === true && type !== "hidden" && type !== "calc" };
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
        else {
          f.crm = { source, property, ...(str(crm.label, 120) ? { label: str(crm.label, 120) } : {}), ...(str(crm.type, 40) ? { type: str(crm.type, 40) } : {}) };
          const map = cleanValueMap(crm.map);
          if (map && isChoice(type)) f.crm.map = map;
        }
      }
      if (type === "rating") {
        const ro = (fo.rating && typeof fo.rating === "object" ? fo.rating : {}) as Record<string, unknown>;
        const scale = Math.round(Number(ro.scale ?? 5));
        const zero = ro.zero === true && ro.style === "numbers";
        f.rating = {
          scale: Number.isFinite(scale) ? Math.min(Math.max(scale, 3), 10) : 5,
          style: ro.style === "numbers" ? "numbers" : "stars",
          ...(zero ? { zero: true as const } : {}),
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
        f.options = choices(fo.options, LIMITS.options);
        const by = readOptionsBy(fo.optionsBy);
        if (by) f.optionsBy = by;
        else if (!f.options.length) errors.push(`${name} needs at least one option.`);
      }
      if ((type === "choice" || type === "multi") && fo.cards === true) f.cards = true;
      if ((type === "choice" || type === "multi") && fo.secret === true) f.secret = true;
      if (type === "multi" && f.options?.some((o) => o.needs?.some((n) => !f.options!.some((x) => x.value === n)))) errors.push(`${name} has a choice that needs one it doesn't have.`);
      if (type === "number" || type === "calc") {
        if (fo.unit === "money" || fo.unit === "percent") f.unit = fo.unit;
      }
      if (type === "file") {
        const fl = (fo.file && typeof fo.file === "object" ? fo.file : {}) as Record<string, unknown>;
        const mb = Math.round(Number(fl.maxMb ?? 10));
        const kinds = Array.isArray(fl.kinds) ? [...new Set(fl.kinds.filter((k): k is FileKind => FILE_KINDS.includes(k as FileKind)))] : [];
        f.file = { maxMb: Number.isFinite(mb) ? Math.min(Math.max(mb, 1), 20) : 10, kinds: kinds.length ? kinds : ["pdf", "image", "office"] };
      }
      if (STRUCTURED.includes(type) && !key.startsWith("q.")) errors.push(`${name} keeps its answer on the fill: use a q. key.`);
      if (type === "ranking") {
        f.options = choices(fo.options, 12);
        if (f.options.length < 2) errors.push(`${name} needs at least two things to rank.`);
      }
      if (type === "grid") {
        const g = (fo.grid && typeof fo.grid === "object" ? fo.grid : {}) as Record<string, unknown>;
        f.grid = { rows: choices(g.rows, 12), cols: choices(g.cols, 7) };
        if (!f.grid.rows.length || f.grid.cols.length < 2) errors.push(`${name} needs rows and at least two columns.`);
      }
      if (type === "group") {
        const g = (fo.group && typeof fo.group === "object" ? fo.group : {}) as Record<string, unknown>;
        const sub: Field[] = [];
        const subIds = new Set<string>();
        for (const x of (Array.isArray(g.fields) ? g.fields : []).slice(0, 6)) {
          const so = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
          const sid = str(so.id, 24) ?? "";
          const st = GROUP_TYPES.includes(so.type as FieldType) ? (so.type as FieldType) : null;
          const sl = str(so.label, LIMITS.label) ?? "";
          if (!ID.test(sid) || subIds.has(sid) || !st || !sl) {
            errors.push(`${name} has a row question that can't be read.`);
            continue;
          }
          subIds.add(sid);
          const sf: Field = { id: sid, key: `q.${sid}` as FieldKey, type: st, label: sl, required: so.required === true };
          if (st === "dropdown") {
            sf.options = choices(so.options, LIMITS.options);
            if (!sf.options.length) errors.push(`${name}: ${sl} needs options.`);
          }
          sub.push(sf);
        }
        if (!sub.length) errors.push(`${name} needs at least one question in each row.`);
        const max = Math.round(Number(g.max ?? 5));
        const min = Math.round(Number(g.min ?? 0));
        f.group = { fields: sub, max: Number.isFinite(max) ? Math.min(Math.max(max, 1), 20) : 5, ...(Number.isFinite(min) && min > 0 ? { min: Math.min(min, 20) } : {}), ...(str(g.add, 40) ? { add: str(g.add, 40) } : {}) };
        if (f.group.min && f.group.min > f.group.max) errors.push(`${name} needs more rows than it allows.`);
      }
      if (type === "number" && fo.slider === true) {
        f.slider = true;
        if (f.valid?.min === undefined || f.valid?.max === undefined || f.valid.max <= f.valid.min) errors.push(`${name}: a slider needs a lowest and a highest value.`);
      }
      if (type === "calc") {
        const co = (fo.calc && typeof fo.calc === "object" ? fo.calc : {}) as Record<string, unknown>;
        const formula = str(co.formula, 500) ?? "";
        const parsed = parseFormula(formula);
        if ("error" in parsed) errors.push(`${name}: ${parsed.error}`);
        const decimals = Math.round(Number(co.decimals));
        const currency = str(co.currency, 3)?.toUpperCase();
        const format = co.format === "money" || co.format === "percent" ? co.format : undefined;
        f.calc = {
          formula,
          ...(format ? { format } : {}),
          ...(co.decimals !== undefined && Number.isFinite(decimals) ? { decimals: Math.min(Math.max(decimals, 0), 4) } : {}),
          ...(format === "money" && currency && /^[A-Z]{3}$/.test(currency) ? { currency } : {}),
          ...(co.show === false ? { show: false as const } : {}),
        };
      }
      const def = str(fo.default, LIMITS.label);
      if (def && type !== "hidden" && type !== "checkbox" && type !== "calc" && !f.optionsBy && !STRUCTURED.includes(type)) {
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
    if (so.result === true && fields.some((x) => !isContent(x.type) && x.type !== "calc")) errors.push("A result screen holds results, text and calculations only.");
    const img = typeof so.image === "string" && so.image.startsWith("https://") && safeUrl(so.image) ? so.image.slice(0, 1000) : "";
    steps.push({ id: sid, ...(str(so.title, LIMITS.label) ? { title: str(so.title, LIMITS.label) } : {}), fields, ...(so.result === true ? { result: true as const } : {}), ...(img ? { image: img } : {}) });
  }
  if (count > LIMITS.fields) errors.push(`Up to ${LIMITS.fields} fields.`);
  if (!keys.has("email") && r.emailOptional !== true) errors.push("Add an email field, so each answer reaches a contact.");
  steps.forEach((s, i) => {
    if (s.result ? !s.fields.some((f) => f.type === "result") : !s.fields.some((f) => f.type !== "hidden" && !isContent(f.type))) errors.push(s.result ? `Page ${i + 1} has no results to show.` : `Page ${i + 1} has no fields.`);
  });
  const fieldIds = new Set(steps.flatMap((s) => s.fields.map((f) => f.id)));
  const contentIds = new Set(steps.flatMap((s) => s.fields.filter((f) => isContent(f.type)).map((f) => f.id)));
  const flat = steps.flatMap((s) => s.fields);
  const types = new Map(flat.filter((f) => !isContent(f.type)).map((f) => [f.id, f.type]));
  const byId = new Map(flat.map((f) => [f.id, f]));
  const constants = cleanConstants(r.constants, errors);
  const constIds = new Set(constants.map((c) => c.id));
  for (const f of flat) {
    const name = f.label || "A field";
    const by = f.optionsBy;
    if (by) {
      const parent = byId.get(by.field);
      if (!parent || parent.id === f.id || !["choice", "dropdown", "country"].includes(parent.type)) errors.push(`${name} follows a field that's gone or isn't a single pick.`);
      else if (by.preset === "regions" && parent.type !== "country") errors.push(`${name}: regions follow a country field.`);
      else if (!by.preset && !Object.keys(by.map ?? {}).length) errors.push(`${name} needs options for at least one answer of ${parent.label || "the field it follows"}.`);
      else if (!by.preset && parent.type !== "country") {
        const ok = new Set((parent.options ?? []).map((o) => o.value));
        if (Object.keys(by.map ?? {}).some((k) => !ok.has(k))) errors.push(`${name} has options for an answer ${parent.label || "the field it follows"} doesn't have.`);
      }
    }
    if (f.result) {
      const refs = [f.result.field, ...(f.result.fields ?? [])].filter((x): x is string => !!x);
      if (refs.some((x) => !["calc", "number"].includes(byId.get(x)?.type ?? ""))) errors.push(`${name} shows a number that's gone.`);
    }
    if (f.calc) {
      const parsed = parseFormula(f.calc.formula);
      if ("refs" in parsed)
        for (const ref of parsed.refs) {
          const t = types.get(ref);
          if (ref.startsWith("@")) {
            if (!constIds.has(ref.slice(1))) errors.push(`${name} uses a setting that's gone: ${ref.slice(1)}.`);
          } else if (ref === f.id) errors.push(`${name} can't use its own answer.`);
          else if (!t || !CALC_INPUTS.includes(t)) errors.push(`${name} uses a field that's gone or isn't a number, pick or checkbox.`);
        }
    }
  }
  // A calc that reads itself through others could never finish.
  const reads = (f: Field) => {
    const p = f.calc ? parseFormula(f.calc.formula) : null;
    return p && "refs" in p ? p.refs : [];
  };
  const state = new Map<string, 1 | 2>();
  const loops = (id: string): boolean => {
    if (state.get(id) === 2) return false;
    if (state.get(id) === 1) return true;
    state.set(id, 1);
    const f = byId.get(id);
    const hit = !!f && reads(f).some((r) => byId.get(r)?.type === "calc" && loops(r));
    state.set(id, 2);
    return hit;
  };
  for (const f of flat) if (f.calc && loops(f.id)) errors.push(`${f.label || "A calculation"} goes round in a loop with another calculation.`);

  const rules: Rule[] = [];
  for (const x of (Array.isArray(r.rules) ? r.rules : []).slice(0, LIMITS.rules)) {
    const ro = (x && typeof x === "object" ? x : {}) as { id?: unknown; when?: Record<string, unknown>; group?: Record<string, unknown>; then?: Record<string, unknown> };
    const id = str(ro.id, 24) ?? "";
    const wf = str(ro.when?.field, 24) ?? "";
    const tf = str(ro.then?.field, 24) ?? "";
    const action = ["show", "hide", "require"].includes(ro.then?.action as string) ? (ro.then!.action as Rule["then"]["action"]) : null;
    if (!ID.test(id) || !action || !OP_LIST.includes(ro.when?.op as Op)) {
      errors.push("A rule is incomplete.");
      continue;
    }
    if (!fieldIds.has(wf) || !fieldIds.has(tf)) {
      errors.push("A rule points at a field that's gone.");
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
    const when = readCond(ro.when, types);
    const groupIn = Array.isArray(ro.group?.when) ? (ro.group.when as unknown[]).slice(0, 5) : [];
    const group = groupIn.map((c) => readCond(c, types));
    const bad = [when, ...group].find((c): c is string => typeof c === "string");
    if (bad) {
      errors.push(bad);
      continue;
    }
    if ([when as Cond, ...(group as Cond[])].some((c) => c.field === tf)) {
      errors.push("A rule can't depend on its own field.");
      continue;
    }
    rules.push({ id, when: when as Cond, ...(group.length ? { group: { logic: ro.group?.logic === "any" ? "any" : "all", when: group as Cond[] } } : {}), then: { action, field: tf } });
  }
  rawSteps.slice(0, LIMITS.steps).forEach((raw, i) => {
    const sk = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).skip : null) as { when?: Record<string, unknown>; to?: unknown } | null;
    if (!sk || typeof sk !== "object" || !steps[i]) return;
    const field = str(sk.when?.field, 24) ?? "";
    const to = Math.round(Number(sk.to));
    const earlier = steps.slice(0, i + 1).some((s) => s.fields.some((f) => f.id === field && !isContent(f.type)));
    const when = readCond(sk.when, types);
    if (!earlier || typeof when === "string") errors.push(earlier && typeof when === "string" && when !== "A rule is incomplete." ? `Page ${i + 1}: ${when}` : `Page ${i + 1} skips on a field that isn't on it or before it.`);
    else if (!Number.isFinite(to) || to <= i + 1 || to >= steps.length) errors.push(`Page ${i + 1} skips to a page that isn't after the next one.`);
    else steps[i].skip = { when, to };
  });
  // Paths by answer: to a later step (past the next one) or, at the number of steps, the end (send now).
  rawSteps.slice(0, LIMITS.steps).forEach((raw, i) => {
    const js = (raw && typeof raw === "object" ? (raw as Record<string, unknown>).jumps : null) as unknown;
    if (!Array.isArray(js) || !js.length || !steps[i]) return;
    const out: Jump[] = [];
    for (const j of js.slice(0, 10) as { when?: Record<string, unknown>; to?: unknown }[]) {
      const field = str(j?.when?.field, 24) ?? "";
      const to = Math.round(Number(j?.to));
      const earlier = steps.slice(0, i + 1).some((st) => st.fields.some((f) => f.id === field && !isContent(f.type)));
      const when = readCond(j?.when, types);
      if (!earlier || typeof when === "string") errors.push(earlier && typeof when === "string" && when !== "A rule is incomplete." ? `Page ${i + 1}: ${when}` : `Page ${i + 1} has a path on a field that isn't on it or before it.`);
      else if (!Number.isFinite(to) || to <= i || to > steps.length || (to === i + 1 && to < steps.length)) errors.push(`Page ${i + 1} has a path to a page that isn't after it.`);
      else out.push({ when, to });
    }
    if (out.length) steps[i].jumps = out;
  });
  const emailField = steps.flatMap((s) => s.fields).find((f) => f.key === "email");
  // One payment block, charging a calculation the form has.
  const pays = steps.flatMap((s) => s.fields).filter((f) => f.type === "payment");
  if (pays.length > 1) errors.push("A form takes one payment.");
  for (const p of pays) if (p.pay?.field && !steps.some((s) => s.fields.some((f) => f.id === p.pay!.field && f.type === "calc"))) errors.push("The payment charges a calculation that's gone.");
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
      if (sch.who === "routed") {
        const picked = [...new Set((Array.isArray(sch.routeRules) ? sch.routeRules : []).filter((x): x is string => typeof x === "string" && /^[\w-]{1,40}$/.test(x)))].slice(0, 50);
        if (!picked.length) errors.push("Booking: pick at least one routing rule, or show it to everyone.");
        schedule.who = "routed";
        schedule.routeRules = picked;
      }
      const heading = str(sch.heading, LIMITS.label);
      if (heading) schedule.heading = heading;
      if (tool === "claritia" && sch.none === "later") schedule.none = "later";
      // The form's routing: rows of conditions, each to a meeting. A row with a value missing is kept as a draft;
      // the compile leaves it out, so it never routes anyone.
      if (tool === "claritia" && Array.isArray(sch.routes)) {
        schedule.routes = sch.routes
          .slice(0, 30)
          .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
          .filter((x) => typeof x.id === "string" && /^[\w-]{1,24}$/.test(x.id) && typeof x.meet === "string" && /^[0-9a-f-]{36}$/.test(x.meet))
          .map((x) => ({ id: x.id as string, meet: x.meet as string, conds: (Array.isArray(x.conds) ? x.conds : []).slice(0, 10).map(cleanCondition).filter((c): c is NonNullable<typeof c> => !!c) }));
      }
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
  const form: Form = {
    steps,
    rules,
    layout: {
      labels: layout.labels === "inside" ? "inside" : "above",
      width: layout.width === "wide" ? "wide" : "narrow",
      ...(layout.progress === "dots" || layout.progress === "none" ? { progress: layout.progress } : {}),
      ...(Number.isFinite(Number(layout.maxWidth)) && Number(layout.maxWidth) >= 280 ? { maxWidth: Math.min(Math.round(Number(layout.maxWidth)), 1200) } : {}),
      ...(layout.mode === "screens" ? { mode: "screens" as const } : {}),
      ...(layout.auto === true ? { auto: true as const } : {}),
      ...((c) => (c ? { cover: c } : {}))(cleanCover(layout.cover)),
      ...((x) => (x ? { side: x } : {}))(cleanSide(layout.side)),
      ...(layout.logo === false ? { logo: false as const } : {}),
    },
    ...(FORM_KINDS.includes(r.kind as FormKind) ? { kind: r.kind as FormKind } : {}),
    ...(r.emailOptional === true ? { emailOptional: true as const } : {}),
    ...(r.resume === true ? { resume: true as const } : {}),
    ...(r.copy === true ? { copy: true as const } : {}),
    ...(str(r.title, LIMITS.label) ? { title: str(r.title, LIMITS.label) } : {}),
    ...(str(r.intro, LIMITS.text) ? { intro: str(r.intro, LIMITS.text) } : {}),
    submit: { label: str(submit.label, 60) || "Submit", ...(submit.full === true ? { full: true } : {}) },
    consent: {
      mode: consentMode,
      label: consentLabel,
      ...(topicId ? { topicId } : {}),
      ...(consent.required === true && consentMode !== "off" && consentMode !== "notice" ? { required: true as const } : {}),
      ...(consent.confirm === true && consentMode !== "off" && consentMode !== "notice" ? { confirm: true as const } : {}),
    },
    spam: {
      minSeconds: Number.isFinite(minSeconds) ? Math.min(Math.max(minSeconds, 0), 30) : 2,
      turnstile: spam.turnstile === true,
      ...(spam.blockFree === true ? { blockFree: true } : {}),
      ...((s) => (s.length ? { sites: s } : {}))(cleanSites(spam.sites)),
      ...(Number.isFinite(Number(spam.perHour)) && Number(spam.perHour) >= 1 ? { perHour: Math.min(Math.round(Number(spam.perHour)), 10000) } : {}),
      ...(spam.bot === "always" && spam.turnstile === true ? { bot: "always" as const } : {}),
      ...(spam.throwaway === "hold" ? { throwaway: "hold" as const } : {}),
    },
    after: { end, ...(schedule ? { schedule } : {}) },
    ...((n) => (n ? { notify: n } : {}))(cleanNotify(r.notify, errors)),
    ...((n) => (n ? { reply: n } : {}))(cleanReply(r.reply, errors, flat.some((f) => f.key === "email"))),
    ...((n) => (n ? { keep: n } : {}))(cleanKeep(r.keep)),
    ...(capture ? { capture } : {}),
    ...((d) => (Object.keys(d).length ? { design: d } : {}))(readFormDesign(r.design, new Set(flat.map((f) => f.id)))),    ...(constants.length ? { constants } : {}),
    ...((x) => (x ? { results: x } : {}))(cleanResults(r.results, byId, errors)),
    ...((x) => (x ? { share: x } : {}))(cleanShare(r.share)),
    ...((x) => (x ? { access: x } : {}))(cleanAccess(r.access)),
    ...((pg) => (pg ? { page: pg } : {}))(checkPage(r.page, new Set(flat.map((f) => f.id)))),
  };
  return errors.length ? { errors: [...new Set(errors)] } : { form };
}

/** A split screen's picture: https only. */
function cleanSide(raw: unknown): NonNullable<Form["layout"]["side"]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const x = raw as Record<string, unknown>;
  const image = typeof x.image === "string" && x.image.startsWith("https://") && safeUrl(x.image) ? x.image.slice(0, 1000) : "";
  return image ? { image, ...(x.at === "right" ? { at: "right" as const } : {}) } : undefined;
}

/** https only (http for localhost while testing), no credentials in the address. */
function cleanCover(raw: unknown): NonNullable<Form["layout"]["cover"]> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  const title = str(c.title, LIMITS.label);
  if (!title) return undefined;
  const text = str(c.text, LIMITS.text);
  const button = str(c.button, 40);
  return { title, ...(text ? { text } : {}), ...(button ? { button } : {}) };
}

/** The owner's settings, cleaned: a unique name for each, a number or not set yet. */
function cleanConstants(raw: unknown, errors: string[]): Constant[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length > LIMITS.constants) errors.push(`Up to ${LIMITS.constants} settings.`);
  const out: Constant[] = [];
  for (const x of raw.slice(0, LIMITS.constants)) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const name = str(o.name, 80) || id;
    if (!CONST_ID.test(id)) {
      errors.push(`${name || "A setting"} needs a short name of letters, numbers and _.`);
      continue;
    }
    if (out.some((c) => c.id === id)) {
      errors.push(`Two settings are called ${id}.`);
      continue;
    }
    const v = o.value === null || o.value === undefined || o.value === "" ? null : Number(o.value);
    if (v !== null && !Number.isFinite(v)) {
      errors.push(`${name} needs a number.`);
      continue;
    }
    const format = o.format === "money" || o.format === "percent" ? o.format : undefined;
    out.push({ id, name, value: v, ...(format ? { format } : {}), ...(o.private === true ? { private: true as const } : {}) });
  }
  return out;
}

/** The results section, cleaned: outcomes with conditions on real fields, and exactly one default at the end. */
function cleanResults(raw: unknown, byId: Map<string, Field>, errors: string[]): Results | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.outcomes) ? r.outcomes : [];
  if (!list.length) {
    errors.push("Results need at least one outcome.");
    return undefined;
  }
  if (list.length > LIMITS.outcomes) errors.push(`Up to ${LIMITS.outcomes} outcomes.`);
  const outcomes: Outcome[] = [];
  const ids = new Set<string>();
  for (const x of list.slice(0, LIMITS.outcomes)) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const id = str(o.id, 24) ?? "";
    const title = str(o.title, LIMITS.label) ?? "";
    if (!/^[a-z0-9_]{1,24}$/.test(id) || ids.has(id)) {
      errors.push("An outcome has a bad id.");
      continue;
    }
    ids.add(id);
    if (!title) errors.push("Each outcome needs a title.");
    const text = str(o.text, LIMITS.text);
    // A meeting type's id: the outcome books that meeting; who hosts still comes from the meeting's own rules.
    const meeting = typeof o.meeting === "string" && /^[0-9a-f-]{36}$/.test(o.meeting) ? o.meeting : undefined;
    if (o.meeting !== undefined && o.meeting !== null && o.meeting !== "" && !meeting) errors.push(`${title || "An outcome"} books a meeting that's gone.`);
    const w = (o.when && typeof o.when === "object" ? o.when : null) as { logic?: unknown; conds?: unknown } | null;
    let when: Outcome["when"];
    if (w && Array.isArray(w.conds) && w.conds.length) {
      if (w.conds.length > LIMITS.conds) errors.push(`${title || "An outcome"}: up to ${LIMITS.conds} conditions.`);
      const conds: Cond[] = [];
      for (const c of w.conds.slice(0, LIMITS.conds)) {
        const t = byId.get((c as Record<string, unknown>)?.field as string)?.type;
        const got = t ? readCond(c, new Map([[(c as Cond).field, t]])) : `${title || "An outcome"} reads a field that's gone.`;
        if (typeof got === "string") errors.push(got);
        else conds.push(got);
      }
      when = { logic: w.logic === "any" ? "any" : "all", conds };
    }
    outcomes.push({ id, title, ...(text ? { text } : {}), ...(when ? { when } : {}), ...(meeting ? { meeting } : {}) });
  }
  const defaults = outcomes.filter((o) => !o.when);
  if (defaults.length !== 1 || outcomes[outcomes.length - 1]?.when) errors.push("Results need one default outcome, last in the list.");
  const show = r.show === "after_contact" || r.show === "summary_first" ? r.show : "instant";
  return { outcomes, show };
}

/** Settings the owner still has to set; the form can't be published until there are none. */
export const unsetConstants = (form: Pick<Form, "constants">): Constant[] => (form.constants ?? []).filter((c) => c.value === null);

/** The form as the browser gets it: private settings have no value and secret scores are gone, so both stay on the server. */
export function publicForm<T extends Pick<Form, "constants" | "steps">>(form: T): T {
  const secret = form.steps.some((st) => st.fields.some((x) => x.secret));
  if (!form.constants?.some((c) => c.private) && !secret) return form;
  return {
    ...form,
    ...(form.constants ? { constants: form.constants.map((c) => (c.private ? { ...c, value: null } : c)) } : {}),
    steps: form.steps.map((st) => ({ ...st, fields: st.fields.map((x) => (x.secret && x.options ? { ...x, options: x.options.map((o) => ({ value: o.value, label: o.label, ...(o.image ? { image: o.image } : {}), ...(o.needs ? { needs: o.needs } : {}) })) } : x)) })),
  };
}

export function safeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.username || u.password) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
  } catch {
    return false;
  }
}

/**
 * What answers are checked against besides the form: the visitor's day (for "within N days"; the server takes the
 * browser's when it's within a day of its own), and the built-in regions of a country.
 */
export type RunCtx = { today?: string; regions?: (country: string) => string[] | undefined };

/** The options a field shows for the answers so far: its own, or the list for its parent's answer. */
export function optionsFor(f: Field, answers: Record<string, unknown>, ctx: RunCtx = {}): Choice[] {
  const by = f.optionsBy;
  if (!by) return f.options ?? [];
  const p = answers[by.field];
  if (typeof p !== "string" || !p) return [];
  if (by.preset === "regions") return (ctx.regions?.(p) ?? []).map((r) => ({ value: r, label: r }));
  return by.map?.[p] ?? [];
}

/** Every option a field can ever show, for labels in Results and the editor. */
export const everyOption = (f: Field): Choice[] => (f.optionsBy?.map ? [...(f.options ?? []), ...Object.values(f.optionsBy.map).flat()] : (f.options ?? []));

const asts = /* @__PURE__ */ new Map<string, Ast | null>();
function astOf(formula: string): Ast | null {
  if (!asts.has(formula)) {
    const p = parseFormula(formula);
    if (asts.size > 500) asts.clear();
    asts.set(formula, "ast" in p ? p.ast : null);
  }
  return asts.get(formula)!;
}

const hasCalc = (form: Pick<Form, "steps">) => form.steps.some((s) => s.fields.some((f) => f.type === "calc"));

/** Each calc field's result from the answers given; a calc's own answer is never read. */
function calcs(form: Pick<Form, "steps" | "constants">, answers: Record<string, unknown>): Record<string, number | null> {
  const byId = new Map(allFields(form).map((f) => [f.id, f]));
  const consts = new Map((form.constants ?? []).map((c) => [c.id, c.value]));
  const out: Record<string, number | null> = {};
  const busy = new Set<string>();
  const numOf = (id: string): number | null => {
    if (id.startsWith("@")) return consts.get(id.slice(1)) ?? null;
    const f = byId.get(id);
    if (!f) return null;
    if (f.type === "calc") {
      if (!(id in out)) {
        if (busy.has(id)) return null;
        busy.add(id);
        const ast = astOf(f.calc?.formula ?? "");
        const v = ast === null ? null : evalFormula(ast, numOf);
        const p = 10 ** (f.calc?.decimals ?? 2);
        out[id] = v === null ? null : Math.round(v * p) / p;
      }
      return out[id]!;
    }
    const raw = answers[id];
    if (f.type === "checkbox") return raw === true ? 1 : 0;
    const list = (Array.isArray(raw) ? raw : raw === undefined || raw === null || raw === "" ? [] : [raw]).map(String);
    if (!list.length) return null;
    const score = (v: string) => (f.options ?? []).find((o) => o.value === v)?.score ?? (Number.isFinite(Number(v)) ? Number(v) : f.type === "multi" ? 0 : null);
    if (f.type === "multi") return list.reduce((a, v) => a + (score(v) ?? 0), 0);
    if (isChoice(f.type)) return score(list[0]!);
    const n = Number(list[0]!.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  for (const f of byId.values()) if (f.type === "calc") numOf(f.id);
  return out;
}

/**
 * The answers with every calc worked out. Twice: once from all the answers, then again from only the fields that
 * show, so a field a rule hid never counts. The browser and the server run this same function.
 */
export function withCalcs(form: Pick<Form, "steps" | "rules" | "constants">, answers: Record<string, unknown>, ctx: RunCtx = {}): Record<string, unknown> {
  if (!hasCalc(form)) return answers;
  const first = { ...answers, ...calcs(form, answers) };
  const { shown } = rawVisibility(form, first, ctx);
  const kept: Record<string, unknown> = {};
  for (const f of allFields(form)) if ((f.type === "hidden" || shown.has(f.id)) && answers[f.id] !== undefined) kept[f.id] = answers[f.id];
  return { ...answers, ...calcs(form, kept) };
}

/** Which fields show, and which are required, given the answers so far. Rules run in order; later ones win. */
export function visibility(form: Pick<Form, "steps" | "rules" | "constants">, answers: Record<string, unknown>, ctx: RunCtx = {}): { shown: Set<string>; required: Set<string> } {
  return rawVisibility(form, withCalcs(form, answers, ctx), ctx);
}

function rawVisibility(form: Pick<Form, "steps" | "rules">, answers: Record<string, unknown>, ctx: RunCtx): { shown: Set<string>; required: Set<string> } {
  const fields = allFields(form);
  const shown = new Set(fields.filter((f) => f.type !== "hidden" && !(f.type === "calc" && f.calc?.show === false)).map((f) => f.id));
  const required = new Set(fields.filter((f) => f.required).map((f) => f.id));
  // A field that a "show" rule controls starts hidden.
  for (const r of form.rules) if (r.then.action === "show") shown.delete(r.then.field);
  const byId = new Map(fields.map((f) => [f.id, f]));
  // A field set to "all" acts only when every one of its rules for that action matches; the last one decides.
  const group = (r: Rule) => `${r.then.field}|${r.then.action}`;
  const last = new Map<string, number>();
  form.rules.forEach((r, i) => last.set(group(r), i));
  const missed = new Set<string>();
  // A condition on a hidden field never holds. A calc that doesn't show still counts.
  const holds = (c: Cond) => {
    const src = byId.get(c.field);
    return !!src && whenHits(c, answers[src.id], ctx) && (src.type === "hidden" || src.type === "calc" || shown.has(src.id));
  };
  form.rules.forEach((r, i) => {
    const all = byId.get(r.then.field)?.logic === "all";
    const hit = holds(r.when) && (!r.group || (r.group.logic === "any" ? r.group.when.some(holds) : r.group.when.every(holds)));
    if (all) {
      if (!hit) missed.add(group(r));
      if (last.get(group(r)) !== i || missed.has(group(r))) return;
    } else if (!hit) return;
    if (r.then.action === "show") shown.add(r.then.field);
    else if (r.then.action === "hide") shown.delete(r.then.field);
    else required.add(r.then.field);
  });
  // A list that follows another field shows only when it has options for that answer.
  for (const f of fields) if (f.optionsBy && !optionsFor(f, answers, ctx).length) shown.delete(f.id);
  for (const id of [...required]) if (!shown.has(id)) required.delete(id);
  return { shown, required };
}

/** Today as YYYY-MM-DD in UTC. */
export const utcDay = (at = Date.now()) => new Date(at).toISOString().slice(0, 10);
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

/** Whether a condition holds for an answer. */
export function whenHits(when: Cond, v: unknown, ctx: RunCtx = {}): boolean {
  const list = Array.isArray(v) ? v.map(String) : v === undefined || v === null || v === "" || v === false ? [] : [String(v)];
  const op = when.op;
  const val = when.value ?? "";
  if (op === "filled") return list.length > 0;
  if (op === "empty") return list.length === 0;
  if (op === "is") return list.includes(val);
  if (op === "is_not") return !list.includes(val);
  if (op === "any_of" || op === "none_of") return list.some((x) => (when.values ?? []).includes(x)) === (op === "any_of");
  // By name, not through OP_KIND, so the form script doesn't carry the checker's tables.
  if (op === "contains" || op === "not_contains" || op === "starts_with" || op === "ends_with") {
    const q = val.toLowerCase();
    const has = list.some((x) => {
      const t = x.toLowerCase();
      return op === "starts_with" ? t.startsWith(q) : op === "ends_with" ? t.endsWith(q) : t.includes(q);
    });
    return op === "not_contains" ? !has : has;
  }
  const first = list[0];
  if (first === undefined) return false;
  if (op === "before" || op === "after" || op === "within_days") {
    if (!DAY_RE.test(first)) return false;
    if (op === "before") return first < val;
    if (op === "after") return first > val;
    return Math.abs(dayNum(first) - dayNum(ctx.today && DAY_RE.test(ctx.today) ? ctx.today : utcDay())) <= Number(val);
  }
  const n = Number(first.replace(/,/g, ""));
  const x = Number(val);
  if (!Number.isFinite(n)) return false;
  return op === "gt" ? n > x : op === "gte" ? n >= x : op === "lt" ? n < x : op === "lte" ? n <= x : n >= x && n <= Number(when.value2);
}

/**
 * The step to show after `from` given the answers: the step's skip target when its condition holds (and the field
 * it reads is on a step already passed), else the next one. Returns form.steps.length when the form is done.
 */
export function nextStep(form: Pick<Form, "steps" | "rules" | "constants" | "results">, from: number, answers: Record<string, unknown>, ctx: RunCtx = {}): number {
  const skip = form.steps[from]?.skip;
  let to = from + 1;
  const vals = () => withCalcs(form, answers, ctx);
  const before = (field: string) => form.steps.slice(0, from + 1).some((s) => s.fields.some((f) => f.id === field));
  // Paths first, in order; one at the number of steps ends the form here.
  const hit = (form.steps[from]?.jumps ?? []).find((j) => j.to > from && j.to <= form.steps.length && before(j.when.field) && whenHits(j.when, vals()[j.when.field], ctx));
  if (hit) return hit.to >= form.steps.length ? form.steps.length : skipHidden(form, hit.to);
  if (skip && skip.to > from + 1 && skip.to < form.steps.length) {
    if (before(skip.when.field) && whenHits(skip.when, vals()[skip.when.field], ctx)) to = skip.to;
  }
  return skipHidden(form, to);
}

/** A result screen shows live only when results show right away; otherwise its blocks show after the send. */
function skipHidden(form: Pick<Form, "steps" | "results">, to: number): number {
  while (to < form.steps.length && !stepShows(form, to)) to++;
  return to;
}

/** Whether a step is shown before the send: every step, except a result screen when results wait for the send. */
export const stepShows = (form: Pick<Form, "steps" | "results">, i: number): boolean => !(form.steps[i]?.result && form.results?.show !== "instant");

/**
 * The outcome these answers reach: the first whose conditions hold, else the default. Calcs are worked out first, and
 * a condition on a field the visitor didn't see never holds, so a hidden answer can't pick a result. The browser shows
 * this live; the server runs it again on submit and keeps its own answer.
 */
export function pickOutcome(form: Pick<Form, "steps" | "rules" | "constants" | "results">, answers: Record<string, unknown>, ctx: RunCtx = {}): Outcome | null {
  const outs = form.results?.outcomes;
  if (!outs?.length) return null;
  const vals = withCalcs(form, answers, ctx);
  const { shown } = rawVisibility(form, vals, ctx);
  const byId = new Map(allFields(form).map((f) => [f.id, f]));
  const holds = (c: Cond) => {
    const src = byId.get(c.field);
    return !!src && (src.type === "hidden" || src.type === "calc" || shown.has(src.id)) && whenHits(c, vals[src.id], ctx);
  };
  for (const o of outs) {
    if (!o.when) return o;
    const hit = o.when.logic === "any" ? o.when.conds.some(holds) : o.when.conds.every(holds);
    if (hit) return o;
  }
  return outs[outs.length - 1]!;
}

/** The formula engine's version, kept with every saved result. */
export const ENGINE = 1;

/**
 * What a submission reached, worked out on the server from the checked answers (by field id): the outcome and every
 * calc by field key. Settings are listed too, for the saved copy only; never send them to the browser.
 */
export function resultOf(form: Form, answers: Record<string, unknown>, ctx: RunCtx = {}): { outcome: Outcome | null; values: Record<string, number | null>; constants: Record<string, number | null> } | null {
  const all = allFields(form);
  const calcFields = all.filter((f) => f.type === "calc");
  // Plain number questions a result block shows count too.
  const shown = new Set(all.flatMap((f) => (f.result ? [f.result.field, ...(f.result.fields ?? [])] : [])).filter((x): x is string => !!x));
  const nums = all.filter((f) => f.type === "number" && shown.has(f.id));
  if (!form.results && !calcFields.length && !nums.length) return null;
  const vals = withCalcs(form, answers, ctx);
  const values: Record<string, number | null> = {};
  for (const f of [...calcFields, ...nums]) values[f.key] = numOf(vals[f.id]);
  const constants: Record<string, number | null> = {};
  for (const c of form.constants ?? []) constants[c.id] = c.value;
  return { outcome: pickOutcome(form, answers, ctx), values, constants };
}

/**
 * What reads a field, in plain words, so a delete can say what it breaks first: calculations, rules, skips, result
 * blocks and outcomes (docs/interactive-forms-plan.md 6b).
 */
export function usedBy(form: Pick<Form, "steps" | "rules" | "results"> & { after?: Form["after"] }, id: string): string[] {
  const out: string[] = [];
  const reads = (c: { field: string }) => c.field === id;
  for (const f of allFields(form)) {
    if (f.id === id) continue;
    if (f.calc) {
      const p = parseFormula(f.calc.formula);
      if ("refs" in p && p.refs.includes(id)) out.push(`the calculation ${f.label || "Total"}`);
    }
    if (f.result && (f.result.field === id || f.result.fields?.includes(id))) out.push(`a result block${f.label ? ` (${f.label})` : ""}`);
    if (f.optionsBy?.field === id) out.push(`the choices of ${f.label || "a dropdown"}`);
    if (f.pay?.field === id) out.push("the payment");
  }
  // Booking: which meeting or who sees the calendar, by this answer.
  let books = false;
  const walk = (v: unknown) => {
    if (books || !v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    if (o.field === id) books = true;
    else Object.values(o).forEach(walk);
  };
  walk(form.after?.schedule);
  if (books) out.push("the booking step");
  if (form.rules.some((r) => reads(r.when) || !!r.group?.when.some(reads))) out.push("a show or hide rule");
  form.steps.forEach((s, i) => {
    if (s.skip && reads(s.skip.when)) out.push(`the skip after step ${i + 1}`);
    if (s.jumps?.some((j) => reads(j.when))) out.push(`a path after step ${i + 1}`);
  });
  for (const o of form.results?.outcomes ?? []) if (o.when?.conds.some(reads)) out.push(`the outcome ${o.title}`);
  return [...new Set(out)];
}

/** A number answer as a number: typed answers arrive as text ("42"). */
export function numOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * What a fill pays: the payment block's amount (a fixed one, or its calc worked out on the server from the checked
 * answers), in the currency's smallest unit for Stripe. Null with no payment block, or nothing to charge.
 */
export function payAmount(form: Form, answers: Record<string, unknown>, ctx: RunCtx = {}): { amount: number; currency: string } | null {
  const block = allFields(form).find((f) => f.type === "payment" && f.pay);
  if (!block?.pay) return null;
  // A payment a rule hides isn't charged (a form that offers "Send an invoice" beside "Pay by card").
  if (!visibility(form, answers, ctx).shown.has(block.id)) return null;
  const major = block.pay.field ? numOf(withCalcs(form, answers, ctx)[block.pay.field]) : (block.pay.amount ?? null);
  if (major === null || !Number.isFinite(major) || major <= 0) return null;
  const minor = Math.round(major * (ZERO_DECIMAL.has(block.pay.currency) ? 1 : 100));
  // Stripe's smallest charge is about 50 cents; anything less isn't charged.
  if (minor < 50) return null;
  return { amount: Math.min(minor, 99_999_999), currency: block.pay.currency.toLowerCase() };
}
