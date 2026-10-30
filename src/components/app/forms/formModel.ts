// The Forms screens' logic, kept apart from the screens so it can be tested (docs/forms-plan.md): question kinds as
// the builder names them (Email, Name, Short text...) over the schema's field types and keys, the questions a step
// shows (a first and last name side by side are one question; the consent box is one too), where an answer can be
// saved and why a place can't take it, choice-to-CRM value matching, what's wrong with a question, the publish
// checks, and which Routing rules read a question. Every change still goes through src/lib/forms/ops.ts.

import { applyOp, type FieldInput, type Op } from "../../../lib/forms/ops.ts";
import { customFit, takenKeys } from "../../../lib/forms/savesTo.ts";
import { allFields, CONTACT_KEYS, FIELD_TYPES, HIDE_KEYS, hideKeyOf, isChoice, questionKey, type Choice, type Field, type FieldKey, type FieldType, type Form, type Rule } from "../../../lib/forms/schema.ts";
import type { CustomField } from "../../../lib/records/fields.ts";
import type { RouterBody } from "../../../lib/router/types.ts";
import { propertyFit, type CrmProperty } from "../../../lib/sources/properties.ts";

// Kinds ----------------------------------------------------------------------------------------------------------

export type Kind = "email" | "name" | "phone" | "company" | "country" | "text" | "long" | "number" | "date" | "choice" | "dropdown" | "multi" | "consent" | "hidden" | "heading" | "para" | "other";
export type KindGroup = "Contact" | "Answer" | "Other";

/** The question types, as the insert menu and the Type section list them, with their icon names (ic.tsx). */
export const KINDS: { v: Kind; l: string; i: string; g: KindGroup }[] = [
  { v: "email", l: "Email", i: "mail", g: "Contact" },
  { v: "name", l: "Name", i: "user", g: "Contact" },
  { v: "phone", l: "Phone", i: "call", g: "Contact" },
  { v: "company", l: "Company", i: "bldg", g: "Contact" },
  { v: "country", l: "Country", i: "globe", g: "Contact" },
  { v: "text", l: "Short text", i: "text", g: "Answer" },
  { v: "long", l: "Long text", i: "long", g: "Answer" },
  { v: "number", l: "Number", i: "hash", g: "Answer" },
  { v: "date", l: "Date", i: "cal", g: "Answer" },
  { v: "choice", l: "One choice", i: "radio", g: "Answer" },
  { v: "dropdown", l: "Dropdown", i: "drop", g: "Answer" },
  { v: "multi", l: "Many choices", i: "box", g: "Answer" },
  { v: "consent", l: "Consent", i: "shield", g: "Other" },
  { v: "hidden", l: "Hidden field", i: "hide", g: "Other" },
  { v: "heading", l: "Heading", i: "head", g: "Other" },
  { v: "para", l: "Text", i: "para", g: "Other" },
];
export const GROUP_WORDS: Record<KindGroup, string> = { Contact: "About them", Answer: "Questions", Other: "More" };

const NAME_KEYS = new Set(["name", "first_name", "last_name"]);

/** A field's kind as the builder shows it. */
export function kindOf(f: Pick<Field, "type" | "key">): Kind {
  if (f.type === "email") return "email";
  if (f.type === "text" && NAME_KEYS.has(f.key)) return "name";
  if (f.type === "text" && f.key === "company") return "company";
  const by: Partial<Record<FieldType, Kind>> = { phone: "phone", country: "country", textarea: "long", number: "number", date: "date", choice: "choice", dropdown: "dropdown", multi: "multi", hidden: "hidden", heading: "heading", paragraph: "para", text: "text", url: "text" };
  return by[f.type] ?? "other";
}

/** The kind's name and icon; a field type the menu doesn't list (rating, calculation...) keeps its own name. */
export function kindInfo(k: Kind, type?: FieldType): { l: string; i: string } {
  const hit = KINDS.find((x) => x.v === k);
  if (hit) return hit;
  return { l: FIELD_TYPES.find((t) => t.value === type)?.label ?? "Question", i: "text" };
}

export const isContentKind = (k: Kind) => k === "heading" || k === "para";
export const isChoiceKind = (k: Kind) => k === "choice" || k === "dropdown" || k === "multi";

// Questions ------------------------------------------------------------------------------------------------------

/** The consent box, which lives in the form's settings, as a question on the last step. */
export const CONSENT_ID = "consent";

/**
 * One question on the canvas. `pair` is the last name when a first and last name sit side by side; `field` is
 * missing only for the consent box.
 */
export type Q = { id: string; kind: Kind; field?: Field; pair?: Field; step: number; label: string };

export const consentBox = (form: Pick<Form, "consent">) => form.consent.mode === "by_region" || form.consent.mode === "always";

/** The questions of every step, in order. */
export function questionsOf(form: Form): Q[] {
  const out: Q[] = [];
  form.steps.forEach((s, si) => {
    for (let i = 0; i < s.fields.length; i++) {
      const f = s.fields[i]!;
      const next = s.fields[i + 1];
      if (f.key === "first_name" && f.type === "text" && next?.key === "last_name" && next.type === "text") {
        out.push({ id: f.id, kind: "name", field: f, pair: next, step: si, label: "Full name" });
        i++;
        continue;
      }
      out.push({ id: f.id, kind: kindOf(f), field: f, step: si, label: f.type === "heading" || f.type === "paragraph" ? (f.content?.text ?? f.label) : f.label });
    }
  });
  if (consentBox(form)) out.push({ id: CONSENT_ID, kind: "consent", step: form.steps.length - 1, label: "Consent" });
  return out;
}

/** What a new question of this kind starts as. Null for an email when the form has one (and for consent: settings). */
export function newQuestion(kind: Kind, form: Form): FieldInput | null {
  const taken = new Set(allFields(form).map((f) => f.key as string));
  const free = (k: FieldKey) => !taken.has(k);
  switch (kind) {
    case "email":
      return free("email") ? { type: "email", key: "email", label: "Work email", required: true, placeholder: "name@company.com" } : null;
    case "name":
      return { type: "text", label: "Full name", required: false, ...(free("name") ? { key: "name" as FieldKey } : {}) };
    case "phone":
      return { type: "phone", label: "Phone number", required: false };
    case "company":
      return { type: "text", label: "Company", required: false, ...(free("company") ? { key: "company" as FieldKey } : {}) };
    case "country":
      return { type: "country", label: "Country", required: false };
    case "text":
    case "long":
    case "number":
    case "date":
      return { type: ({ text: "text", long: "textarea", number: "number", date: "date" } as const)[kind], label: "", required: false };
    case "choice":
    case "dropdown":
    case "multi":
      return { type: kind, label: "", required: false, options: [opt("Option 1"), opt("Option 2")] };
    case "hidden":
      return { type: "hidden", label: "Hidden field", required: false, hidden: { from: "param", name: "utm_campaign" } };
    case "heading":
      return { type: "heading", label: "Heading", required: false, content: { text: "A heading", level: 2 } };
    case "para":
      return { type: "paragraph", label: "Text", required: false, content: { text: "Some text" } };
    default:
      return null;
  }
}

const opt = (v: string): Choice => ({ value: v, label: v });

/** Whether a key can carry a type: contact keys have their own types; custom and question keys take anything here. */
const keyFits = (key: string, type: FieldType) => {
  const c = CONTACT_KEYS.find((x) => x.key === key);
  return c ? c.types.includes(type) : true;
};

/** The change that makes a question another kind, keeping its key when it still fits. Null when it can't. */
export function kindPatch(form: Form, f: Field, kind: Kind): Partial<Field> | null {
  const taken = takenKeys(form, f.id);
  const own = (type: FieldType): FieldKey => (f.key !== "email" && !NAME_KEYS.has(f.key) && f.key !== "company" && keyFits(f.key, type) ? f.key : questionKey(f.label || "answer", taken));
  const choices = f.options?.length ? f.options : [opt("Option 1"), opt("Option 2")];
  switch (kind) {
    case "email":
      return taken.has("email") ? null : { type: "email", key: "email", required: true };
    case "name":
      return { type: "text", key: !taken.has("name") ? "name" : !taken.has("first_name") ? "first_name" : questionKey(f.label || "name", taken) };
    case "company":
      return { type: "text", key: !taken.has("company") ? "company" : questionKey(f.label || "company", taken) };
    case "phone":
      return { type: "phone", key: !taken.has("phone") ? "phone" : own("phone") };
    case "country":
      return { type: "country", key: !taken.has("country") ? "country" : own("country") };
    case "text":
      return { type: "text", key: own("text") };
    case "long":
      return { type: "textarea", key: own("textarea") };
    case "number":
      return { type: "number", key: own("number") };
    case "date":
      return { type: "date", key: own("date") };
    case "choice":
    case "dropdown":
    case "multi":
      return { type: kind, key: own(kind), options: choices };
    case "hidden":
      return { type: "hidden", key: own("hidden"), required: false, hidden: { from: "param", name: f.hidden?.name ?? "utm_source" } };
    default:
      return null;
  }
}

/** The ops that split a full name into first and last side by side, or join them back. */
export function splitNameOps(form: Form, q: Q, split: boolean): Op[] {
  if (!q.field) return [];
  if (split && !q.pair) {
    const taken = takenKeys(form, q.field.id);
    if (taken.has("first_name") || taken.has("last_name")) return [];
    return [
      { op: "update_field", id: q.field.id, patch: { key: "first_name", label: "First name", width: "half" } },
      { op: "add_field", after: q.field.id, field: { type: "text", key: "last_name", label: "Last name", required: q.field.required, width: "half" } },
    ];
  }
  if (!split && q.pair) {
    const taken = takenKeys(form, q.field.id);
    return [
      { op: "remove_field", id: q.pair.id },
      { op: "update_field", id: q.field.id, patch: { key: taken.has("name") ? "first_name" : "name", label: "Full name", width: undefined } },
    ];
  }
  return [];
}

/** Ops applied in order, or the first problem. */
export function runOps(form: Form, ops: Op[]): { form: Form } | { error: string } {
  let cur = form;
  for (const op of ops) {
    const r = applyOp(cur, op);
    if ("error" in r) return r;
    cur = r.form;
  }
  return { form: cur };
}

// Where answers go -------------------------------------------------------------------------------------------------

export type Dest = { id: string; label: string; group: "Contact" | "Custom fields"; why: string | null };

const CONTACT_LABEL: Record<string, string> = { email: "Email", name: "Name", first_name: "First name", last_name: "Last name", title: "Job title", phone: "Phone", company: "Company", website: "Company website", country: "Country", region: "State or region" };
const TAKES: Partial<Record<FieldType, string>> = { email: "Takes an email", phone: "Takes a phone number", country: "Takes a country", url: "Takes a link", text: "Takes text" };

/** Why a contact key can't take this field, or null. */
function contactWhy(key: string, type: FieldType): string | null {
  const c = CONTACT_KEYS.find((x) => x.key === key);
  if (!c || c.types.includes(type)) return null;
  if (NAME_KEYS.has(key)) return "Takes a name";
  return TAKES[c.types[0]!] ?? "Takes text";
}

/** Every place in Claritia a question's answer can save to, each with why it can't when it can't. */
export function claritiaDests(form: Form, f: Field, custom: Pick<CustomField, "key" | "label" | "type">[]): Dest[] {
  const others = allFields(form).filter((x) => x.id !== f.id);
  const by = (key: string) => others.find((x) => x.key === key);
  const taken = (key: string) => {
    const o = by(key);
    return o ? `${o.label || "Another question"} saves here` : null;
  };
  return [
    ...CONTACT_KEYS.map((c) => ({ id: c.key as string, label: CONTACT_LABEL[c.key] ?? c.label, group: "Contact" as const, why: contactWhy(c.key, f.type) ?? taken(c.key) })),
    ...custom.map((c) => ({ id: `f.${c.key}`, label: c.label, group: "Custom fields" as const, why: customFit(f, c) ?? taken(`f.${c.key}`) })),
  ];
}

/** Where a question saves, in words: "Contact, Email", "Contact, Company size" or "Only this submission". */
export function saveName(f: Pick<Field, "key">, custom: Pick<CustomField, "key" | "label">[]): string {
  if (f.key.startsWith("q.")) return "Only this submission";
  if (f.key.startsWith("f.")) return `Contact, ${custom.find((c) => `f.${c.key}` === f.key)?.label ?? f.key.slice(2)}`;
  return `Contact, ${CONTACT_LABEL[f.key] ?? f.key}`;
}

/** The key a question takes when it saves only to its submission. */
export const submissionKey = (form: Form, f: Field): FieldKey => (f.key.startsWith("q.") ? f.key : questionKey(f.label || "answer", takenKeys(form, f.id)));

export type CrmDest = { name: string; label: string; why: string | null };

/** A CRM's properties a question can also go to, with why one can't. */
export function crmDests(form: Form, f: Field, source: string, props: CrmProperty[]): CrmDest[] {
  const used = new Map<string, string>();
  for (const x of allFields(form)) if (x.id !== f.id && x.crm?.source === source) used.set(x.crm.property, x.label || "Another question");
  return props.map((p) => ({ name: p.name, label: p.label || p.name, why: propertyFit(f.type, p) ?? (used.has(p.name) ? `${used.get(p.name)} sends here` : null) }));
}

// Choices to CRM values ------------------------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, "");

/**
 * The CRM option a choice matches by itself: the same value or label, ignoring case, as the send does
 * (src/lib/sources/properties.ts). `loose` also ignores dash kinds and spaces, for Match them for me.
 */
function sameOption(c: Choice, options: Choice[], loose = false): string | null {
  const n = loose ? norm : (x: string) => x.trim().toLowerCase();
  const a = n(c.value);
  const b = n(c.label);
  return options.find((o) => n(o.value) === a || n(o.label) === a || n(o.value) === b || n(o.label) === b)?.value ?? null;
}

export type MapRow = { value: string; label: string; mapped: string | null; picked: boolean };

/**
 * Each choice and the CRM value it goes as: the one picked for it, else one that matches by itself, else none.
 * `missing` counts the choices with no value that nobody decided on ("Don't send" is a decision).
 */
export function choiceRows(f: Pick<Field, "options" | "crm">, p: Pick<CrmProperty, "options">): { rows: MapRow[]; missing: number } {
  const map = f.crm?.map ?? {};
  const options = p.options ?? [];
  const rows = (f.options ?? []).map((c) => {
    const picked = Object.prototype.hasOwnProperty.call(map, c.value);
    const mapped = picked ? map[c.value] || null : sameOption(c, options);
    return { value: c.value, label: c.label, mapped: mapped && (picked ? options.some((o) => o.value === mapped) : true) ? mapped : null, picked };
  });
  return { rows, missing: rows.filter((r) => !r.mapped && !(r.picked && map[r.value] === "")).length };
}

/** A number range in a choice: "11–50" is 11 to 50, "500+" is 500 and up. */
function range(s: string): [number, number] | null {
  const nums = s.replace(/,/g, "").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return null;
  return /\+\s*$/.test(s.trim()) || nums.length === 1 ? [nums[0]!, /\+\s*$/.test(s.trim()) ? Infinity : nums[0]!] : [nums[0]!, nums[1]!];
}

/**
 * Match them for me: every choice gets a CRM value. Same value or label first; then for number ranges the CRM range
 * that holds the choice's lowest number; then nothing is guessed and the choice stays "Not sent".
 */
export function autoMap(f: Pick<Field, "options" | "crm">, p: Pick<CrmProperty, "options">): Record<string, string> {
  const options = p.options ?? [];
  const out: Record<string, string> = { ...(f.crm?.map ?? {}) };
  for (const c of f.options ?? []) {
    const same = sameOption(c, options, true);
    if (same) {
      out[c.value] = same;
      continue;
    }
    const r = range(c.label) ?? range(c.value);
    if (r) {
      const hit = options.find((o) => {
        const or = range(o.label) ?? range(o.value);
        return or && r[0] >= or[0] && r[0] <= or[1];
      });
      if (hit) out[c.value] = hit.value;
    }
  }
  return out;
}

// Problems ----------------------------------------------------------------------------------------------------------

export type Issue = { lvl: "bad" | "warn"; where: "save" | "opts" | "q"; t: string };
/** Per CRM source: its name and properties (null while they load or when the read failed). */
export type CrmCtx = Map<string, { name: string; props: CrmProperty[] | null }>;

/** What's wrong with a question, worst first. */
export function issuesOf(f: Field, ctx: { custom: Pick<CustomField, "key" | "label" | "type">[]; crm: CrmCtx }): Issue[] {
  const out: Issue[] = [];
  const k = kindOf(f);
  if (f.type === "heading" || f.type === "paragraph") return out;
  const cw = contactWhy(f.key, f.type);
  if (cw) out.push({ lvl: "bad", where: "save", t: `${CONTACT_LABEL[f.key] ?? f.key}: ${cw.toLowerCase()}` });
  if (f.key.startsWith("f.")) {
    const c = ctx.custom.find((x) => `f.${x.key}` === f.key);
    const why = c ? customFit(f, c) : null;
    if (!c) out.push({ lvl: "bad", where: "save", t: "Its contact field was deleted" });
    else if (why) out.push({ lvl: "bad", where: "save", t: `${c.label}: ${why.toLowerCase()}` });
  }
  if (f.crm) {
    const c = ctx.crm.get(f.crm.source);
    const crm = c?.name ?? "The CRM";
    const p = c?.props?.find((x) => x.name === f.crm!.property);
    const label = p?.label || f.crm.label || f.crm.property;
    if (!c) out.push({ lvl: "bad", where: "save", t: `${crm} isn't connected` });
    else if (c.props && !p) out.push({ lvl: "bad", where: "save", t: `${label} was removed in ${crm}` });
    else if (p) {
      const why = propertyFit(f.type, p);
      if (why) out.push({ lvl: "bad", where: "save", t: `${crm} ${label}: ${why.toLowerCase()}` });
      else if (isChoice(f.type) && p.options?.length) {
        const n = choiceRows(f, p).missing;
        if (n) out.push({ lvl: "warn", where: "save", t: `${n} ${n === 1 ? "choice doesn't" : "choices don't"} match ${crm}` });
      }
    }
  }
  if (isChoiceKind(k) && !f.optionsBy && (f.options?.length ?? 0) < 2) out.push({ lvl: "bad", where: "opts", t: "Add at least two choices" });
  if (f.type !== "hidden" && !f.label.trim()) out.push({ lvl: "bad", where: "q", t: "Add a question" });
  return out.sort((a, b) => (a.lvl === b.lvl ? 0 : a.lvl === "bad" ? -1 : 1));
}

export type Check = { lvl: "bad" | "warn" | "ok"; t: string; s?: string; q?: string; blocks?: boolean };

/**
 * What the Publish dialog lists: a missing email and anything the checker refuses block the publish; a question
 * whose answers can't reach a field only warns (those answers stay on the submission).
 */
export function publishChecks(form: Form, errors: string[], ctx: Parameters<typeof issuesOf>[1], pages: number): Check[] {
  const out: Check[] = [];
  const fields = allFields(form);
  if (!fields.some((f) => f.key === "email")) out.push({ lvl: "bad", t: "Add an email question", s: "Without an email, a lead can't become a contact or get emails", blocks: true });
  for (const f of fields)
    for (const p of issuesOf(f, ctx)) {
      if (p.where !== "save") continue;
      out.push({ lvl: p.lvl, t: `${f.label || kindInfo(kindOf(f), f.type).l}: ${p.t}`, s: p.lvl === "bad" ? "Those answers stay on the submission only" : "Unmatched answers stay on the submission", q: f.id });
    }
  for (const e of errors) if (!/email field/i.test(e)) out.push({ lvl: "bad", t: e.replace(/\.$/, ""), blocks: true });
  if (!out.length) out.push({ lvl: "ok", t: "Ready to publish", s: pages ? `${pages} ${pages === 1 ? "page shows" : "pages show"} this form. ${pages === 1 ? "It updates" : "They update"} within a minute.` : "Its page updates within a minute." });
  return out;
}

// Show when ---------------------------------------------------------------------------------------------------------

/** The rules that show a question; `simple` when it's one "is" or "isn't" on one earlier answer, which the panel edits. */
export function showRules(form: Form, id: string): { rules: Rule[]; simple: Rule | null } {
  const rules = form.rules.filter((r) => r.then.field === id && r.then.action === "show");
  const one = rules.length === 1 ? rules[0]! : null;
  return { rules, simple: one && !one.group && (one.when.op === "is" || one.when.op === "is_not") ? one : null };
}

/** The ops that make a question show always (null) or only when an answer is or isn't a value. */
export function showOps(form: Form, id: string, when: { field: string; op: "is" | "is_not"; value: string } | null): Op[] {
  const { rules, simple } = showRules(form, id);
  if (!when) return rules.map((r) => ({ op: "remove_rule", id: r.id }));
  const keep = simple?.id;
  return [...rules.filter((r) => r.id !== keep).map((r): Op => ({ op: "remove_rule", id: r.id })), { op: "set_rule", rule: { ...(keep ? { id: keep } : {}), when, then: { action: "show", field: id } } }];
}

/** Choice questions before this one, which a "Show when" can read. */
export function earlierChoices(form: Form, id: string): Field[] {
  const all = allFields(form);
  const at = all.findIndex((f) => f.id === id);
  return (at < 0 ? all : all.slice(0, at)).filter((f) => f.type === "choice" || f.type === "dropdown" || f.type === "multi");
}

// Fill in for them ----------------------------------------------------------------------------------------------------

/** Whether "Skip it when Claritia already knows the answer" can apply, and whether it's on. */
export function known(form: Form, f: Field): { can: boolean; on: boolean } {
  const k = hideKeyOf(f.key);
  const can = HIDE_KEYS.includes(k) && f.type !== "hidden";
  return { can, on: can && !!form.enrich?.hideKnown && (form.enrich?.fields ?? []).includes(k) };
}

/** The op that turns skipping a known answer on or off for one question. */
export function knownOp(form: Form, f: Field, on: boolean): Op {
  const k = hideKeyOf(f.key);
  const list = new Set(form.enrich?.fields ?? []);
  if (on) list.add(k);
  else list.delete(k);
  return { op: "set_enrich", hideKnown: list.size > 0, fields: [...list] };
}

/** The page address parameter a question fills from: its own name for a hidden field, else its key's name. */
export const paramOf = (f: Field) => (f.type === "hidden" ? (f.hidden?.name ?? "") : f.key.replace(/^[fq]\./, ""));

// Routing ------------------------------------------------------------------------------------------------------------

/** The live Routing rules that read a question's answer (by its answer key, or the contact field it saves to). */
export function rulesReading(body: RouterBody | null | undefined, f: Pick<Field, "key">): string[] {
  if (!body?.rules?.on) return [];
  const facts = new Set([`answer.${f.key}`]);
  if (!f.key.startsWith("q.") && !f.key.startsWith("c.")) facts.add(`contact.${f.key.replace(/^f\./, "")}`);
  if (f.key === "country") facts.add("lead.country");
  return body.rules.list.filter((r) => r.on !== false && r.conds.some((c) => facts.has(c.field))).map((r) => r.name);
}

// Words ---------------------------------------------------------------------------------------------------------------

/** The moment `n` days ago, as an ISO string. */
export const daysAgo = (n: number, now = Date.now()) => new Date(now - n * 86_400_000).toISOString();

/** "12 min ago", "2 h ago", "Yesterday", "Oct 28". */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 172800) return "Yesterday";
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Where a form lives, from the pages its fills came from in the last 30 days. */
export function whereWords(r: { status: string; version: number; pages: number; page: string | null; hosted: boolean }): string {
  if (!r.version) return "Not on any page yet";
  const page = r.page ? r.page.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "") : "";
  const on = r.pages > 1 ? `${r.pages} pages` : r.pages === 1 ? page : "";
  if (r.hosted && on) return `Hosted page and ${on}`;
  return on || "Hosted page";
}
