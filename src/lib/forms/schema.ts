// Checking a form before it's saved, and the small helpers that build one. Every save from the editor and every
// template goes through checkSchema, so a broken form can't reach a visitor. Browser and server.

import { allFields } from "./logic.ts";
import { isTheme } from "./themes.ts";
import { CHOICE_KINDS, KEY_RE, NO_ANSWER, type FieldKind, type FormField, type FormSchema, type FormSettings } from "./types.ts";

/** Built-in contact fields a form can fill, and the kinds that may fill each. */
export const BUILTIN_TARGETS: Record<string, { label: string; kinds: FieldKind[] }> = {
  email: { label: "Email", kinds: ["email"] },
  name: { label: "First and last name", kinds: ["name"] },
  first_name: { label: "First name", kinds: ["short_text"] },
  last_name: { label: "Last name", kinds: ["short_text"] },
  phone: { label: "Phone", kinds: ["phone"] },
  title: { label: "Title", kinds: ["short_text", "dropdown", "single"] },
  company: { label: "Company", kinds: ["short_text"] },
  website: { label: "Company website", kinds: ["url", "short_text"] },
  country: { label: "Country", kinds: ["short_text", "dropdown", "single"] },
  region: { label: "State or region", kinds: ["short_text", "dropdown", "single"] },
  address: { label: "Country and region", kinds: ["address"] },
};

/** The custom field type a form field becomes when it's saved on the contact. Kinds not listed can't be mapped. */
export const CUSTOM_TYPE: Partial<Record<FieldKind, string>> = {
  short_text: "text",
  long_text: "long_text",
  email: "email",
  phone: "phone",
  url: "url",
  number: "number",
  money: "currency",
  single: "select",
  dropdown: "select",
  multi: "multi_select",
  yes_no: "checkbox",
  agree: "checkbox",
  rating: "number",
  nps: "number",
  scale: "number",
  date: "date",
};

export const MAX_FIELDS = 100;
export const MAX_PAGES = 20;
const MAX_OPTIONS = 100;

/** A field key from its label: "Team size" → team_size, unique among `taken`. */
export function keyFrom(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/['’]/g, "")
      .replace(/[^\w\s]/g, " ")
      .trim()
      .split(/[\s_]+/)
      .filter(Boolean)
      .slice(0, 5)
      .join("_")
      .replace(/^[^a-z]+/, "")
      .slice(0, 36) || "field";
  let k = base;
  for (let n = 2; taken.has(k); n++) k = `${base.slice(0, 36)}_${n}`;
  taken.add(k);
  return k;
}

const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const opt = (v: unknown, max: number) => v === undefined || (typeof v === "string" && v.length <= max);

/** What's wrong with a form, in words for the editor. Empty when it's fine. */
export function checkSchema(s: FormSchema): string[] {
  const errs: string[] = [];
  if (!s || s.v !== 1 || !Array.isArray(s.pages)) return ["This form can't be read."];
  if (!text(s.title, 200)) errs.push("Give the form a title.");
  if (!opt(s.intro, 2000)) errs.push("The intro is too long.");
  if (!text(s.submit, 40)) errs.push("Name the submit button.");
  if (!s.end || !text(s.end.title, 200) || !opt(s.end.text, 2000)) errs.push("Write the thank-you message.");
  if (s.end?.redirect !== undefined && s.end.redirect !== "" && !/^https:\/\/[^\s]+$/i.test(s.end.redirect)) errs.push("The redirect must start with https://.");
  if (!s.pages.length) errs.push("Add a page.");
  if (s.pages.length > MAX_PAGES) errs.push(`Use up to ${MAX_PAGES} pages.`);
  const fields = allFields(s);
  if (fields.length > MAX_FIELDS) errs.push(`Use up to ${MAX_FIELDS} fields.`);
  if (!fields.some((f) => !NO_ANSWER.has(f.kind) && f.kind !== "hidden")) errs.push("Add a question.");
  const seen = new Set<string>();
  const maps = new Set<string>();
  for (const [pi, p] of s.pages.entries()) {
    if (!opt(p.title, 200)) errs.push(`Page ${pi + 1}'s title is too long.`);
    if (!Array.isArray(p.fields)) {
      errs.push(`Page ${pi + 1} can't be read.`);
      continue;
    }
    for (const f of p.fields) errs.push(...checkField(f, seen, maps));
  }
  const emails = fields.filter((f) => f.map === "email");
  if (emails.length > 1) errs.push("Only one field can be the contact's email.");
  if (s.end?.score?.length) {
    if (!fields.some((f) => f.points)) errs.push("Add points to a question to show a score.");
    for (const b of s.end.score) if (!Number.isFinite(b.min) || !text(b.title, 200) || !opt(b.text, 2000)) errs.push("A score band is missing its words.");
  }
  return [...new Set(errs)];
}

function checkField(f: FormField, seen: Set<string>, maps: Set<string>): string[] {
  const errs: string[] = [];
  const name = f.label ? `“${f.label.slice(0, 40)}”` : "A field";
  if (!f || typeof f !== "object") return ["A field can't be read."];
  if (!KEY_RE.test(f.key ?? "")) errs.push(`${name} needs a key of small letters, numbers and _.`);
  else if (seen.has(f.key)) errs.push(`Two fields use the key ${f.key}.`);
  if (!text(f.label, 300)) errs.push(`A ${f.kind ?? "field"} needs a label.`);
  if (!opt(f.help, 1000) || !opt(f.placeholder, 200)) errs.push(`${name}: the extra text is too long.`);
  if (CHOICE_KINDS.has(f.kind)) {
    const o = f.options ?? [];
    if (!o.length) errs.push(`${name} needs options.`);
    if (o.length > MAX_OPTIONS) errs.push(`${name}: use up to ${MAX_OPTIONS} options.`);
    if (o.some((x) => !text(x, 200))) errs.push(`${name} has an empty option.`);
    if (new Set(o.map((x) => x.trim().toLowerCase())).size !== o.length) errs.push(`${name} has the same option twice.`);
    if (f.points && f.points.length !== o.length) errs.push(`${name}: give points for each option.`);
  } else if (f.options?.length && f.kind !== "yes_no") errs.push(`${name} can't have options.`);
  if (f.kind === "yes_no" && f.points && f.points.length !== 2) errs.push(`${name}: give points for Yes and No.`);
  if (f.kind === "matrix" && !(f.rows?.length && f.rows.every((r) => text(r, 200)))) errs.push(`${name} needs rows.`);
  if ((f.kind === "scale" || f.kind === "number" || f.kind === "money") && f.min !== undefined && f.max !== undefined && f.min >= f.max) errs.push(`${name}: the lowest must be under the highest.`);
  if (f.kind === "scale" && f.max !== undefined && f.min !== undefined && f.max - f.min > 10) errs.push(`${name}: a scale has up to 11 steps.`);
  if (f.kind === "rating" && f.max !== undefined && (f.max < 3 || f.max > 10)) errs.push(`${name}: use 3 to 10 stars.`);
  if (f.kind === "file" && f.maxFiles !== undefined && (f.maxFiles < 1 || f.maxFiles > 5)) errs.push(`${name}: allow 1 to 5 files.`);
  if (f.show) {
    if (!seen.has(f.show.key)) errs.push(`${name} shows based on a field that isn't before it.`);
    if (!["is", "not", "any", "answered", "empty", "gte", "lte"].includes(f.show.op)) errs.push(`${name} has a rule that can't be read.`);
  }
  if (f.map) {
    if (f.map.startsWith("f.")) {
      if (!KEY_RE.test(f.map.slice(2)) || !CUSTOM_TYPE[f.kind]) errs.push(`${name} can't be saved on the contact.`);
    } else if (!BUILTIN_TARGETS[f.map]?.kinds.includes(f.kind)) errs.push(`${name} can't fill ${BUILTIN_TARGETS[f.map]?.label ?? f.map}.`);
    if (maps.has(f.map)) errs.push(`Two fields fill the same contact field (${f.map.replace(/^f\./, "")}).`);
    maps.add(f.map);
  }
  if (f.key) seen.add(f.key);
  return errs;
}

export function checkSettings(st: FormSettings): string[] {
  const errs: string[] = [];
  if (st.theme !== undefined && !isTheme(st.theme)) errs.push("Pick one of the styles.");
  if (st.accent !== undefined && !/^#[0-9a-f]{6}$/i.test(st.accent)) errs.push("Pick a color like #0c0c0b.");
  if (st.booking_url && !/^https:\/\/[^\s]+$/i.test(st.booking_url)) errs.push("The booking link must start with https://.");
  if (st.consent_text !== undefined && st.consent_text.length > 600) errs.push("The opt-in words are too long.");
  if (st.notice_text !== undefined && st.notice_text.length > 600) errs.push("The notice is too long.");
  if (st.about !== undefined && st.about.length > 2000) errs.push("The business description is too long.");
  return errs;
}

/** A form's address: its title in small words plus six random letters, so it can't be guessed. */
export function slugFor(title: string, rand: () => number = Math.random): string {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "form";
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let tail = "";
  for (let i = 0; i < 6; i++) tail += abc[Math.floor(rand() * abc.length)];
  return `${base}-${tail}`;
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A deep copy, so editing a template's copy never touches the template. */
export const cloneSchema = (s: FormSchema): FormSchema => JSON.parse(JSON.stringify(s)) as FormSchema;

export const blankSchema = (): FormSchema => ({
  v: 1,
  title: "Untitled form",
  pages: [
    {
      fields: [
        { key: "name", kind: "name", label: "Name", required: true, map: "name" },
        { key: "email", kind: "email", label: "Work email", required: true, map: "email" },
      ],
    },
  ],
  submit: "Submit",
  end: { title: "Thanks", text: "We got your answers." },
});

export const DEFAULT_CONSENT = "Email me about products, events and offers. I can unsubscribe at any time.";
export const DEFAULT_NOTICE = "We'll use your details to reply and may email you about related products. You can unsubscribe at any time.";
