// A short way to write templates. Keys come from labels; `save` puts the answer in a custom contact field; `when`
// refers to an earlier field by its label or key. tpl() turns a draft into a FormTemplate and checks it.

import { keyFrom } from "../key.ts";
import type { Cond, FieldKind, FormEnd, FormField, FormPage, FormTemplate, Industry, UseCase } from "../types.ts";

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

type Def = {
  intro?: string;
  fields?: Draft[];
  pages?: (Draft[] | { title?: string; fields: Draft[] })[];
  submit?: string;
  end: FormEnd | [string, string];
  featured?: boolean;
  phi?: boolean;
  internal?: boolean;
  version?: number;
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
    schema: { v: 1, title: name, ...(d.intro ? { intro: d.intro } : {}), pages, submit: d.submit ?? "Submit", end },
  };
}

export const THANKS = (when = "within one business day"): [string, string] => ["Thanks, we got it", `We'll get back to you ${when}.`];
