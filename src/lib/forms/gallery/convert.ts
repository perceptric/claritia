// A gallery template as the app's form (../schema.ts), the step before it becomes a Form Studio page
// (src/lib/studio/templatePage.ts). Every template converts to a form checkForm passes (tests/formGallery.test.ts).

import { DEFAULT_CONSENT, type Choice, type Cond, type Field, type FieldKey, type Form, type Op, type Rule, type Step } from "../schema.ts";
import type { Cond as GCond, FormField, FormTemplate, GalleryPhoto } from "./types.ts";
import { sizedUrl, STARTER_PHOTOS } from "../media.ts";

const BUILTIN: Record<string, FieldKey> = { email: "email", phone: "phone", title: "title", company: "company", website: "website", country: "country", region: "region" };
const opts = (xs: string[] = [], points?: number[]): Choice[] => xs.map((x, i) => ({ value: x, label: x, ...(points?.[i] !== undefined ? { score: points[i] } : {}) }));

/** A starter photo's address, and its 640 wide copy for a picture card. */
const starter = (name: string) => `${STARTER_PHOTOS}${name}.jpg`;
const pics = (o: Choice[], images?: string[]) => (images?.length ? o.map((c, i) => (images[i] ? { ...c, image: sizedUrl(starter(images[i]!), 640) } : c)) : o);
/** A template's photo as the form saves it. */
const photo = (p?: GalleryPhoto) => (p ? { url: starter(p.name), alt: p.alt, layout: p.layout, ...(p.focus ? { focus: p.focus } : {}) } : undefined);

/** The app's field (or fields: a full name is first and last) for one gallery question. */
function fieldsFor(f: FormField, id: () => string): Field[] {
  const q = `q.${f.key}` as FieldKey;
  const key = f.map && BUILTIN[f.map] ? BUILTIN[f.map]! : q;
  const base = { id: id(), key, label: f.label, required: !!f.required, ...(f.help ? { help: f.help.slice(0, 300) } : {}), ...(f.placeholder ? { placeholder: f.placeholder } : {}) };
  const half = f.half ? { width: "half" as const } : {};
  switch (f.kind) {
    case "short_text":
      return [{ ...base, type: "text", ...half }];
    case "long_text":
      return [{ ...base, key: q, type: "textarea" }];
    case "email":
      return [{ ...base, key: f.map === "email" ? "email" : q, type: "email", ...(f.map === "email" && /work/i.test(f.label) ? { check: "work_email" as const } : {}), ...half }];
    case "phone":
      return [{ ...base, type: "phone", ...half }];
    case "url":
      return [{ ...base, type: "url", ...half }];
    case "number":
      return [{ ...base, key: q, type: "number", ...half, ...(f.min !== undefined || f.max !== undefined ? { valid: { ...(f.min !== undefined ? { min: f.min } : {}), ...(f.max !== undefined ? { max: f.max } : {}) } } : {}) }];
    case "money":
      return [{ ...base, key: q, type: "number", unit: "money", ...half, ...(f.min !== undefined ? { valid: { min: f.min } } : {}) }];
    case "single":
      return [{ ...base, key: f.map === "title" ? "title" : q, type: "choice", options: pics(opts(f.options, f.points), f.images), ...(f.images?.length ? { cards: true as const } : {}), ...(f.other ? { other: true } : {}) }];
    case "multi":
      return [{ ...base, key: q, type: "multi", options: pics(opts(f.options, f.points), f.images), ...(f.images?.length ? { cards: true as const } : {}) }];
    case "dropdown":
      return [{ ...base, key: f.map === "title" ? "title" : q, type: "dropdown", options: opts(f.options, f.points), ...half }];
    case "yes_no":
      return [{ ...base, key: q, type: "choice", options: opts(f.options?.length === 2 ? f.options : ["Yes", "No"], f.points) }];
    case "agree":
      return [{ ...base, key: q, type: "checkbox" }];
    case "rating":
      return [{ ...base, key: q, type: "rating", rating: { scale: Math.min(Math.max(f.max ?? 5, 3), 10), style: "stars" } }];
    case "nps":
      return [{ ...base, key: q, type: "rating", rating: { scale: 10, style: "numbers", zero: true, low: f.minLabel ?? "Not likely", high: f.maxLabel ?? "Very likely" } }];
    case "scale":
      return [{ ...base, key: q, type: "rating", rating: { scale: Math.min(Math.max((f.max ?? 5) - (f.min ?? 1) + 1, 3), 10), style: "numbers", ...(f.minLabel ? { low: f.minLabel } : {}), ...(f.maxLabel ? { high: f.maxLabel } : {}) } }];
    case "ranking":
      return [{ ...base, key: q, type: "ranking", options: opts(f.options) }];
    case "matrix":
      return [{ ...base, key: q, type: "grid", grid: { rows: opts(f.rows), cols: opts(f.options) } }];
    case "date":
      return [{ ...base, key: q, type: "date", ...half }];
    case "time":
      return [{ ...base, key: q, type: "time", ...half }];
    case "date_range":
      return [{ ...base, key: q, type: "daterange" }];
    case "name":
      if (f.map === "name")
        return [
          { id: base.id, key: "first_name", type: "text", label: "First name", required: !!f.required, width: "half" },
          { id: id(), key: "last_name", type: "text", label: "Last name", required: false, width: "half" },
        ];
      return [{ ...base, key: q, type: "text" }];
    case "address":
      return [{ ...base, key: q, type: "address" }];
    case "file":
      return [{ ...base, key: q, type: "file", file: { maxMb: 10, kinds: ["pdf", "image", "office"] } }];
    case "signature":
      return [{ ...base, key: q, type: "signature" }];
    case "statement":
      return [{ id: base.id, key: `c.${base.id}` as FieldKey, type: "paragraph", label: "Text", required: false, content: { text: [f.label, f.help].filter(Boolean).join("\n\n").slice(0, 1000) } }];
    case "hidden":
      return [{ ...base, key: q, type: "hidden", required: false, hidden: { from: "param", name: f.key } }];
    case "calc":
      // The formula names other answers by key; templateForm swaps in their ids once every field has one.
      return [{ ...base, key: q, type: "calc", required: false, calc: { formula: f.formula ?? "0", ...(f.format ? { format: f.format } : {}), ...(f.format === "money" ? { currency: f.currency ?? "USD" } : {}), ...(f.visible === false ? { show: false as const } : {}) } }];
    case "payment":
      return [{ id: base.id, key: `c.${base.id}` as FieldKey, type: "payment", label: f.label, required: false, pay: { currency: f.currency ?? "USD", ...(f.amount ? { amount: f.amount } : { field: f.from ?? "" }) } }];
    default:
      return [];
  }
}

const OPS: Record<GCond["op"], Op> = { is: "is", not: "is_not", any: "any_of", answered: "filled", empty: "empty", gte: "gte", lte: "lte" };

function condFor(c: GCond, target: Field | undefined, source: FormField | undefined): Cond | null {
  if (!target || !source) return null;
  const op = OPS[c.op];
  const word = (v: unknown) => (v === true ? (source.options?.[0] ?? "Yes") : v === false ? (source.options?.[1] ?? "No") : String(v));
  if (op === "filled" || op === "empty") return { field: target.id, op };
  if (op === "any_of") return { field: target.id, op, values: (Array.isArray(c.value) ? c.value : [c.value]).map(word) };
  return { field: target.id, op, value: word(c.value) };
}

/** The template as a form: its pages as steps, its show-if logic as rules, its end screen and consent. */
export function templateForm(t: FormTemplate): Form {
  let n = 0;
  const id = () => `t${(n++).toString(36)}`;
  const byKey = new Map<string, { app: Field; src: FormField }>();
  const steps: Step[] = t.schema.pages.map((p, i) => {
    const fields: Field[] = [];
    for (const f of p.fields) {
      const made = fieldsFor(f, id);
      if (made[0]) byKey.set(f.key, { app: made[0], src: f });
      fields.push(...made);
    }
    return { id: `s${i}`, ...(p.title ? { title: p.title } : {}), fields, ...(p.photo ? { photo: photo(p.photo) } : {}) };
  });
  // Calculations and payments name answers by key: swap in the app's field ids.
  const idOf = (k: string) => byKey.get(k)?.app.id;
  for (const st of steps)
    for (const f of st.fields) {
      if (f.type === "calc" && f.calc) f.calc.formula = f.calc.formula.replace(/\{([a-z][a-z0-9_]*)\}/g, (m, k: string) => (idOf(k) ? `{${idOf(k)}}` : m));
      if (f.type === "payment" && f.pay?.field) f.pay.field = idOf(f.pay.field) ?? f.pay.field;
    }
  const rules: Rule[] = [];
  for (const p of t.schema.pages)
    for (const f of p.fields) {
      if (!f.show) continue;
      const self = byKey.get(f.key)?.app;
      const src = byKey.get(f.show.key);
      const when = condFor(f.show, src?.app, src?.src);
      if (!self || !when) continue;
      // The email can't hide behind a rule: it stays, and stays optional, so the send never stops on it.
      if (self.key === "email") {
        self.required = false;
        continue;
      }
      rules.push({ id: `r${rules.length}`, when, then: { action: "show", field: self.id } });
    }
  // Page paths: skips past pages that don't apply, and paths by answer, on an answer from this page or one before.
  t.schema.pages.forEach((p, i) => {
    const at = (j: { when: GCond; to: number }) => {
      const src = byKey.get(j.when.key);
      const when = condFor(j.when, src?.app, src?.src);
      return when ? { when, to: j.to } : null;
    };
    const skip = p.skip ? at(p.skip) : null;
    if (skip) steps[i]!.skip = skip;
    const jumps = (p.jumps ?? []).map(at).filter((j): j is NonNullable<typeof j> => !!j);
    if (jumps.length) steps[i]!.jumps = jumps;
  });
  const end = t.schema.end;
  const bands = end.score?.length ? [...end.score].sort((a, b) => b.min - a.min) : [];
  return {
    steps,
    rules,
    layout: {
      labels: "above",
      width: "narrow",
      ...(steps.length > 1 ? { progress: "bar" as const } : {}),
      ...(t.schema.cover ? { cover: { title: t.schema.cover.title, ...(t.schema.cover.text ? { text: t.schema.cover.text } : {}), ...(t.schema.cover.button ? { button: t.schema.cover.button } : {}), ...(t.schema.cover.photo ? { photo: photo(t.schema.cover.photo) } : {}) } } : {}),
      ...(t.schema.one ? { mode: "screens" as const } : {}),
    },
    title: t.schema.title,
    ...(t.schema.intro ? { intro: t.schema.intro } : {}),
    // Anonymous surveys (an exit interview, a safety check) ask for no email.
    ...(steps.some((s) => s.fields.some((f) => f.key === "email")) ? {} : { emailOptional: true as const }),
    ...(t.schema.resume ? { resume: true as const } : {}),
    ...(t.schema.copy ? { copy: true as const } : {}),
    submit: { label: t.schema.submit },
    consent: { mode: t.internal ? "off" : "by_region", label: DEFAULT_CONSENT },
    spam: { minSeconds: 2, turnstile: false },
    after: {
      end: end.redirect
        ? { kind: "redirect", url: end.redirect }
        : { kind: "message", title: end.title.slice(0, 300), ...(end.text || bands.length ? { text: (end.text || bands.map((b) => `${b.title}: ${b.text}`).join("\n")).slice(0, 1000) } : {}), ...(end.photo ? { photo: photo(end.photo) } : {}) },
    },
  };
}
