// A short way to write templates. Keys come from labels; `save` puts the answer in a custom contact field; `when`
// refers to an earlier field by its label or key. tpl() turns a draft into a FormTemplate and checks it.

import { keyFrom } from "../key.ts";
import type { Cond, FieldKind, FormEnd, FormField, FormPage, FormSchema, FormTemplate, Industry, PageJump, TemplateKit, UseCase } from "../types.ts";

type Draft = Omit<FormField, "key" | "show"> & { key?: string; save?: string; show?: Cond };
type Opts = Partial<Omit<Draft, "kind" | "label">>;

const f =
  (kind: FieldKind, defaults: Opts = {}) =>
  (label: string, o: Opts = {}): Draft => ({ kind, label, ...defaults, ...o });
const withOptions =
  (kind: FieldKind) =>
  (label: string, options: string[], o: Opts = {}): Draft => ({ kind, label, options, ...o });

// People
export const fullName = (label = "Name", o: Opts = {}): Draft => ({ kind: "name", label, required: true, map: "name", key: "name", ...o });
export const email = (label = "Work email", o: Opts = {}): Draft => ({ kind: "email", label, required: true, map: "email", key: "email", ...o });
export const phone = (label = "Phone", o: Opts = {}): Draft => ({ kind: "phone", label, map: "phone", key: "phone", ...o });
export const company = (label = "Company", o: Opts = {}): Draft => ({ kind: "short_text", label, map: "company", key: "company", ...o });
export const website = (label = "Website", o: Opts = {}): Draft => ({ kind: "url", label, map: "website", key: "website", placeholder: "acme.com", ...o });
export const jobTitle = (label = "Job title", o: Opts = {}): Draft => ({ kind: "short_text", label, map: "title", key: "job_title", ...o });
export const address = (label = "Address", o: Opts = {}): Draft => ({ kind: "address", label, map: "address", key: "address", ...o });
export const country = (label = "Country", o: Opts = {}): Draft => ({ kind: "short_text", label, map: "country", key: "country", ...o });

// Text
export const text = f("short_text");
export const long = f("long_text");
export const num = f("number");
export const money = f("money", { currency: "USD" });
export const url = f("url");
export const email2 = f("email");
export const phone2 = f("phone");

// Choice
export const one = withOptions("single");
export const many = withOptions("multi");
export const drop = withOptions("dropdown");
export const rank = withOptions("ranking");
export const yesno = f("yes_no");
export const agree = f("agree", { required: true });
export const matrix = (label: string, rows: string[], cols: string[], o: Opts = {}): Draft => ({ kind: "matrix", label, rows, options: cols, ...o });

// Scale
export const stars = f("rating", { max: 5 });
export const nps = f("nps");
export const scale = (label: string, minLabel: string, maxLabel: string, o: Opts = {}): Draft => ({ kind: "scale", label, min: 1, max: 5, minLabel, maxLabel, ...o });

// Date
export const date = f("date");
export const time = f("time");
export const range = f("date_range");

// Files and layout
export const file = f("file", { maxFiles: 1 });
export const files = f("file", { maxFiles: 5 });
export const sign = f("signature", { required: true });
export const statement = f("statement");
export const hidden = f("hidden");

/** Show a field only when an earlier one (by label or key) matches. */
export const when = (ref: string, op: Cond["op"], value?: Cond["value"]): Cond => ({ key: ref, op, value });

// Option lists used across industries.
export const TEAM_SIZE = ["Just me", "2–10", "11–50", "51–200", "201–1,000", "1,000+"];
export const TIMELINE = ["As soon as possible", "Within a month", "In 1–3 months", "In 3–6 months", "Just researching"];
export const BUDGET = ["Under $5,000", "$5,000–$15,000", "$15,000–$50,000", "$50,000–$100,000", "Over $100,000"];
export const HEARD = ["Search engine", "AI assistant", "Social media", "A friend or colleague", "Event", "Podcast or video", "Other"];
export const CONTACT_PREF = ["Email", "Phone", "Text message"];
export const DAYPART = ["Morning", "Afternoon", "Evening"];
export const AGREE5 = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

/**
 * A page path (docs/multipage-forms-plan.md): when an answer on this page or one before it (by label or key)
 * matches, go to the page with this title (or place, 0-based), or "end" to send the form there.
 */
export type Path = { when: Cond; to: string | number };
/** Go to `to` when `ref` matches: `go("Any claims?", "is", false, "Coverage")`. */
export const go = (ref: string, op: Cond["op"], value: Cond["value"], to: string | number): Path => ({ when: { key: ref, op, value }, to });

type PageDef = { title?: string; fields: Draft[]; skip?: Path; jumps?: Path[] };

type Def = {
  intro?: string;
  fields?: Draft[];
  pages?: (Draft[] | PageDef)[];
  /** A first screen with a title, a line and a Start button. */
  cover?: FormSchema["cover"];
  /** "Save and finish later". */
  resume?: boolean;
  /** A PDF copy of the answers after the send. */
  copy?: boolean;
  submit?: string;
  end: FormEnd | [string, string];
  featured?: boolean;
  phi?: boolean;
  internal?: boolean;
  simple?: boolean;
  version?: number;
  /** Menus (../taxonomy.ts): categories and teams as space-separated ids, sub-industries, other industries. */
  cats?: string;
  teams?: string;
  subs?: string;
  also?: Industry[];
  mode?: "screens";
  kit?: TemplateKit;
  seasons?: number[];
  added?: string;
};

export function tpl(id: string, industry: Industry, name: string, tags: UseCase[], blurb: string, d: Def): FormTemplate {
  const taken = new Set<string>();
  const done: FormField[] = [];
  const raw = d.pages ?? [d.fields ?? []];
  const pages: FormPage[] = raw.map((p) => {
    const list = Array.isArray(p) ? p : p.fields;
    const fields = list.map((x) => {
      const { save, show, key, ...rest } = x;
      let k = key && !taken.has(key) ? key : keyFrom(x.label, taken);
      if (key && k === key) taken.add(k);
      if (!/^[a-z]/.test(k)) k = keyFrom(`f ${k}`, taken);
      const out: FormField = { key: k, ...rest };
      if (save) out.map = `f.${save}`;
      if (show) {
        const ref = done.find((y) => y.key === show.key) ?? done.find((y) => y.label === show.key);
        if (!ref) throw new Error(`${id}: "${x.label}" shows on "${show.key}", which isn't before it`);
        out.show = { ...show, key: ref.key };
      }
      done.push(out);
      return out;
    });
    return Array.isArray(p) ? { fields } : { title: p.title, fields };
  });
  // Page paths: answers by label or key from this page or one before; pages by title or place; "end" sends.
  raw.forEach((p, i) => {
    if (Array.isArray(p) || (!p.skip && !p.jumps?.length)) return;
    const upTo = pages.slice(0, i + 1).flatMap((x) => x.fields);
    const path = (x: Path, what: string): PageJump => {
      const ref = upTo.find((y) => y.key === x.when.key) ?? upTo.find((y) => y.label === x.when.key);
      if (!ref) throw new Error(`${id}: page ${i + 1}'s ${what} is on "${x.when.key}", which isn't on it or before it`);
      const to = x.to === "end" ? pages.length : typeof x.to === "number" ? x.to : pages.findIndex((y) => y.title === x.to);
      if (to < 0) throw new Error(`${id}: page ${i + 1}'s ${what} goes to "${x.to}", which isn't a page title`);
      return { when: { ...x.when, key: ref.key }, to };
    };
    if (p.skip) pages[i]!.skip = path(p.skip, "skip");
    if (p.jumps?.length) pages[i]!.jumps = p.jumps.map((j) => path(j, "path"));
  });
  const end: FormEnd = Array.isArray(d.end) ? { title: d.end[0], text: d.end[1] } : d.end;
  return {
    id,
    version: d.version ?? 1,
    industry,
    tags,
    name,
    blurb,
    ...(d.featured ? { featured: true } : {}),
    ...(d.phi ? { phi: true } : {}),
    ...(d.internal ? { internal: true } : {}),
    ...(d.simple ? { simple: true } : {}),
    ...(d.cats ? { categories: d.cats.split(/\s+/).filter(Boolean) } : {}),
    ...(d.teams ? { teams: d.teams.split(/\s+/).filter(Boolean) } : {}),
    ...(d.subs ? { subs: d.subs.split(/\s+/).filter(Boolean) } : {}),
    ...(d.also?.length ? { also: d.also } : {}),
    ...(d.mode ? { mode: d.mode } : {}),
    ...(d.kit ? { kit: d.kit } : {}),
    ...(d.seasons?.length ? { seasons: d.seasons } : {}),
    ...(d.added ? { added: d.added } : {}),
    schema: {
      v: 1,
      title: name,
      ...(d.intro ? { intro: d.intro } : {}),
      pages,
      submit: d.submit ?? "Submit",
      end,
      ...(d.cover ? { cover: d.cover } : {}),
      ...(d.resume ? { resume: true as const } : {}),
      ...(d.copy ? { copy: true as const } : {}),
    },
  };
}

/**
 * A simple form (docs/template-wave3-plan.md Part 2): one page, 3 to 6 questions, no welcome screen, logic or payment.
 * `cats` and `teams` are space-separated ids.
 */
export const quick = (
  id: string,
  industry: Industry,
  name: string,
  tags: UseCase[],
  blurb: string,
  cats: string,
  teams: string,
  fields: Draft[],
  submit: string,
  end: FormEnd | [string, string],
  more: Partial<Def> = {},
): FormTemplate => tpl(id, industry, name, tags, blurb, { cats, teams, added: "2026-11-08", simple: true, fields, submit, end, ...more });

export const THANKS = (when = "within one business day"): [string, string] => ["Thanks, we got it", `We'll get back to you ${when}.`];
