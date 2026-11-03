// The form spec (docs/forms.md Part 2): the small format New form and the builder work in. Steps of fields, with show
// logic on a field (any or all of its conditions) or on a step (one condition). Everything the spec doesn't show (CRM
// links, widths, validation, payments, calculations and the rest) rides along on each field's `raw` copy, so turning a
// saved form into a spec and back changes nothing. `toForm` turns a spec into the saved form the live form script and
// the server run (src/lib/forms/schema.ts); `fromForm` reads a saved form back. The checker (`lintSpec`) runs on every
// change: on what Claude writes, on each edit, and in the builder.

import { allFields, CONTACT_KEYS, isContent, LIMITS, questionKey, type Cond as FormCond, type Field, type FieldKey, type FieldType, type FileKind, type Form, type Jump, type Rule, type Step } from "./schema.ts";

export type SpecType =
  | "text"
  | "longtext"
  | "email"
  | "phone"
  | "number"
  | "url"
  | "date"
  | "country"
  | "radio"
  | "checkboxes"
  | "dropdown"
  | "pictures"
  | "yesno"
  | "rating"
  | "file"
  | "checkbox"
  | "hidden"
  | "heading"
  | "paragraph"
  // A field the spec can't edit (a calculation, a payment, an address and the rest): kept exactly as it was.
  | "locked";

export const SPEC_TYPES: { value: Exclude<SpecType, "locked">; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "url", label: "Link" },
  { value: "date", label: "Date" },
  { value: "country", label: "Country" },
  { value: "radio", label: "Pick one" },
  { value: "checkboxes", label: "Pick many" },
  { value: "dropdown", label: "Dropdown" },
  { value: "pictures", label: "Picture choice" },
  { value: "yesno", label: "Yes or no" },
  { value: "rating", label: "Rating" },
  { value: "file", label: "File upload" },
  { value: "checkbox", label: "Checkbox" },
  { value: "hidden", label: "Hidden" },
  { value: "heading", label: "Heading" },
  { value: "paragraph", label: "Text" },
];

/** The ops a field's show condition can use. */
export type SpecOp = "is" | "is_not" | "any_of" | "none_of" | "filled" | "empty" | "contains" | "not_contains" | "gt" | "lt";
export const SPEC_OPS: SpecOp[] = ["is", "is_not", "any_of", "none_of", "filled", "empty", "contains", "not_contains", "gt", "lt"];
/** A step's show condition uses only ops whose opposite is exact, so "skip this step" is the same test turned over. */
export const STEP_OPS: SpecOp[] = ["is", "is_not", "any_of", "none_of", "filled", "empty", "contains", "not_contains"];
const OPPOSITE: Partial<Record<SpecOp, SpecOp>> = { is: "is_not", is_not: "is", any_of: "none_of", none_of: "any_of", filled: "empty", empty: "filled", contains: "not_contains", not_contains: "contains" };

export type SpecCond = { field: string; op: SpecOp; value?: string; values?: string[] };
export type When = { match: "all" | "any"; conds: SpecCond[] };
export type SpecOption = { value: string; label: string; image?: string };

export type SpecField = {
  id: string;
  type: SpecType;
  label: string;
  /** Where the answer saves: a contact key (email, first_name and the rest), f.<custom field>, or q.<answer>. */
  key?: string;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: SpecOption[];
  /** File upload: the kinds it takes and the biggest file. */
  files?: { kinds: FileKind[]; maxMb: number };
  /** Rating: 5 stars or 0 to 10. */
  scale?: 5 | 10;
  /** Hidden: the address parameter it reads. */
  param?: string;
  show?: When;
  /** The saved field this came from: what the spec doesn't show is kept from here. */
  raw?: Field;
};

/** A step's own extras the spec keeps as they are: a picture, a result screen, paths set elsewhere (as step ids). */
type StepRaw = { image?: string; result?: true; jumps?: { when: FormCond; to: string }[]; skip?: { when: FormCond; to: string } };
export type SpecStep = { id: string; title?: string; show?: SpecCond; fields: SpecField[]; raw?: StepRaw };

export type Spec = {
  title?: string;
  intro?: string;
  submit: string;
  steps: SpecStep[];
  /** Rules the spec can't show as field logic (hide, require, nested groups): kept as they are. */
  rules?: Rule[];
};

export const layoutOf = (s: Pick<Spec, "steps">): "page" | "steps" => (s.steps.length > 1 ? "steps" : "page");

const CONTENT_SPEC: SpecType[] = ["heading", "paragraph"];
const LISTS: SpecType[] = ["radio", "checkboxes", "dropdown", "pictures", "yesno"];
export const isQuestion = (f: Pick<SpecField, "type" | "raw">) => !CONTENT_SPEC.includes(f.type) && f.type !== "hidden" && !(f.type === "locked" && f.raw && isContent(f.raw.type));
export const hasOptions = (t: SpecType) => LISTS.includes(t);
const NUMERIC: SpecType[] = ["number", "rating"];
const YES_NO: SpecOption[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];
const ID = /^[a-z0-9]{1,24}$/;
const KEY = /^(q|f)\.[a-z][a-z0-9_]{0,39}$/;

export const specFields = (s: Pick<Spec, "steps">): SpecField[] => s.steps.flatMap((st) => st.fields);
export const newSpecId = () => Math.random().toString(36).slice(2, 10);

/** The ops a condition on this kind of field can use. */
export function opsFor(t: SpecType, step = false): SpecOp[] {
  const base: SpecOp[] = hasOptions(t) || t === "country" ? ["is", "is_not", "any_of", "none_of", "filled", "empty"] : NUMERIC.includes(t) ? ["is", "is_not", "gt", "lt", "filled", "empty"] : t === "checkbox" ? ["filled", "empty"] : ["is", "is_not", "contains", "not_contains", "filled", "empty"];
  return step ? base.filter((o) => STEP_OPS.includes(o)) : base;
}

const needsValue = (op: SpecOp) => op !== "filled" && op !== "empty";
const needsValues = (op: SpecOp) => op === "any_of" || op === "none_of";

/** A condition in words, for the builder and the outline. */
export function condText(c: SpecCond, fields: SpecField[]): string {
  const f = fields.find((x) => x.id === c.field);
  const name = f?.label || "a question";
  const label = (v: string) => f?.options?.find((o) => o.value === v)?.label ?? v;
  const words: Record<SpecOp, string> = { is: "is", is_not: "is not", any_of: "is any of", none_of: "is none of", filled: "is answered", empty: "is not answered", contains: "contains", not_contains: "doesn't contain", gt: "is more than", lt: "is less than" };
  const v = needsValues(c.op) ? (c.values ?? []).map(label).join(", ") : needsValue(c.op) ? label(c.value ?? "") : "";
  return `${name} ${words[c.op]}${v ? ` ${v}` : ""}`;
}

// ── The checker ─────────────────────────────────────────────────────────────────────────────────────────────────

export type Problem = { at?: string; text: string };

/**
 * Every problem with a spec. A spec with none can be turned into a form that passes the form checker. Conditions point
 * back to an earlier field only, so logic can never loop; a step's condition reads a field on an earlier step.
 */
export function lintSpec(s: Spec, opts: { needEmail?: boolean } = {}): Problem[] {
  const out: Problem[] = [];
  const seen = new Set<string>();
  const keys = new Set<string>();
  const before = new Map<string, { step: number; f: SpecField }>();
  if (!s.steps.length) out.push({ text: "A form needs at least one page." });
  if (s.steps.length > LIMITS.steps) out.push({ text: `Up to ${LIMITS.steps} pages.` });
  if (specFields(s).length > LIMITS.fields) out.push({ text: `Up to ${LIMITS.fields} questions.` });
  if (!s.submit.trim()) out.push({ text: "The button needs words." });
  const stepIds = new Set<string>();
  s.steps.forEach((st, si) => {
    if (!ID.test(st.id) || stepIds.has(st.id)) out.push({ at: st.id, text: `Page ${si + 1} has a missing or repeated id.` });
    stepIds.add(st.id);
    if (!st.fields.length) out.push({ at: st.id, text: `Page ${si + 1} has no questions.` });
    if (st.show) {
      if (si === 0) out.push({ at: st.id, text: "The first page always shows." });
      const src = before.get(st.show.field);
      if (!src || src.step >= si) out.push({ at: st.id, text: `Page ${si + 1} shows on a question that isn't on an earlier page.` });
      else if (!STEP_OPS.includes(st.show.op) || !opsFor(src.f.type, true).includes(st.show.op)) out.push({ at: st.id, text: `Page ${si + 1} has a condition that can't be used on a page.` });
      else out.push(...condProblems(st.show, src.f, `Page ${si + 1}`));
      // Two steps in a row with conditions can't be told apart once the form runs: one must always show.
      if (si > 0 && s.steps[si - 1]!.show) out.push({ at: st.id, text: `Pages ${si} and ${si + 1} both have conditions. Let one of them always show.` });
    }
    for (const f of st.fields) {
      const name = f.label.trim() || "A question";
      if (!ID.test(f.id) || seen.has(f.id)) out.push({ at: f.id, text: `${name} has a missing or repeated id.` });
      seen.add(f.id);
      if (f.type !== "locked") {
        if (!f.label.trim() && f.type !== "hidden") out.push({ at: f.id, text: CONTENT_SPEC.includes(f.type) ? `${f.type === "heading" ? "A heading" : "A text block"} is empty.` : "Every question needs a label." });
        if (f.label.length > (f.type === "paragraph" ? LIMITS.text : LIMITS.label)) out.push({ at: f.id, text: `${name} is too long.` });
        if (hasOptions(f.type) && f.type !== "yesno") {
          const opts = f.options ?? [];
          if (!opts.length) out.push({ at: f.id, text: `${name} needs at least one option.` });
          if (opts.length > LIMITS.options) out.push({ at: f.id, text: `${name} has too many options.` });
          const vals = new Set<string>();
          for (const o of opts) {
            if (!o.value.trim() || !o.label.trim()) out.push({ at: f.id, text: `${name} has an empty option.` });
            if (vals.has(o.value)) out.push({ at: f.id, text: `${name} has the same option twice.` });
            vals.add(o.value);
            if (o.image && !/^https:\/\/[^\s"'<>]+$/.test(o.image)) out.push({ at: f.id, text: `${name} has a picture that isn't an https address.` });
          }
        }
        if (f.type === "file" && f.files && (!f.files.kinds.length || f.files.maxMb < 1 || f.files.maxMb > 20)) out.push({ at: f.id, text: `${name} needs file kinds and a size up to 20 MB.` });
        if (f.type === "hidden" && f.param !== undefined && !/^[A-Za-z0-9_.-]{1,60}$/.test(f.param)) out.push({ at: f.id, text: `${name} reads a bad address parameter.` });
        if (f.required && (CONTENT_SPEC.includes(f.type) || f.type === "hidden")) out.push({ at: f.id, text: `${name} can't be required.` });
        const key = keyFor(f);
        if (key) {
          const contact = CONTACT_KEYS.find((c) => c.key === key);
          if (contact) {
            if (!contact.types.includes(v1Type(f))) out.push({ at: f.id, text: `${name} can't save as ${contact.label.toLowerCase()}.` });
          } else if (!KEY.test(key)) out.push({ at: f.id, text: `${name} saves to a place that can't be read.` });
          if (keys.has(key)) out.push({ at: f.id, text: `Two questions save as ${CONTACT_KEYS.find((c) => c.key === key)?.label.toLowerCase() ?? key}.` });
          keys.add(key);
        }
      }
      if (f.show) {
        if (!f.show.conds.length) out.push({ at: f.id, text: `${name} has logic with no conditions.` });
        if (f.show.conds.length > LIMITS.conds) out.push({ at: f.id, text: `${name} has too many conditions.` });
        for (const c of f.show.conds) {
          const src = before.get(c.field);
          if (!src) out.push({ at: f.id, text: `${name} shows on a question that isn't before it.` });
          else if (!isQuestion(src.f) && src.f.type !== "hidden") out.push({ at: f.id, text: `${name} shows on a heading or text block.` });
          else if (!opsFor(src.f.type).includes(c.op)) out.push({ at: f.id, text: `${name} has a condition that doesn't fit ${src.f.label || "its question"}.` });
          else out.push(...condProblems(c, src.f, name, f.id));
        }
      }
      before.set(f.id, { step: si, f });
    }
  });
  if (opts.needEmail && !specFields(s).some((f) => keyFor(f) === "email")) out.push({ text: "Add an email question, so each answer becomes a contact." });
  return out;
}

function condProblems(c: SpecCond, src: SpecField, name: string, at?: string): Problem[] {
  if (!SPEC_OPS.includes(c.op)) return [{ at, text: `${name} has a condition that can't be read.` }];
  if (needsValues(c.op)) {
    if (!c.values?.length) return [{ at, text: `${name} has a condition with no picks.` }];
    const vals = optionValues(src);
    if (vals && c.values.some((v) => !vals.includes(v))) return [{ at, text: `${name} has a condition on an option ${src.label || "its question"} doesn't have.` }];
    return [];
  }
  if (needsValue(c.op)) {
    if (!(c.value ?? "").trim()) return [{ at, text: `${name} has a condition with no value.` }];
    if ((c.op === "gt" || c.op === "lt") && !Number.isFinite(Number(c.value))) return [{ at, text: `${name} compares to something that isn't a number.` }];
    const vals = optionValues(src);
    if (vals && (c.op === "is" || c.op === "is_not") && !vals.includes(c.value!)) return [{ at, text: `${name} has a condition on an option ${src.label || "its question"} doesn't have.` }];
  }
  return [];
}

const optionValues = (f: SpecField): string[] | null => (f.type === "yesno" ? YES_NO.map((o) => o.value) : hasOptions(f.type) ? (f.options ?? []).map((o) => o.value) : null);

// ── To the saved form ───────────────────────────────────────────────────────────────────────────────────────────

const TO_V1: Record<Exclude<SpecType, "locked">, FieldType> = {
  text: "text",
  longtext: "textarea",
  email: "email",
  phone: "phone",
  number: "number",
  url: "url",
  date: "date",
  country: "country",
  radio: "choice",
  checkboxes: "multi",
  dropdown: "dropdown",
  pictures: "choice",
  yesno: "choice",
  rating: "rating",
  file: "file",
  checkbox: "checkbox",
  hidden: "hidden",
  heading: "heading",
  paragraph: "paragraph",
};

export const v1Type = (f: SpecField): FieldType => (f.type === "locked" ? (f.raw?.type ?? "text") : TO_V1[f.type]);

/** The key a field saves to: its own, the one it came with, or none yet (made from its label when turned into a form). */
function keyFor(f: SpecField): string | undefined {
  if (f.type === "locked") return f.raw && !isContent(f.raw.type) ? f.raw.key : undefined;
  if (CONTENT_SPEC.includes(f.type)) return undefined;
  return f.key ?? (f.raw && f.raw.type === TO_V1[f.type] ? f.raw.key : undefined);
}

function toField(f: SpecField, taken: Set<string>, keepKey: boolean): Field {
  if (f.type === "locked" && f.raw) return f.raw;
  const type = v1Type(f);
  if (CONTENT_SPEC.includes(f.type)) {
    const level = f.raw?.type === "heading" ? f.raw.content?.level : undefined;
    return { id: f.id, key: `c.${f.id}`, type, label: f.type === "heading" ? "Heading" : "Text", required: false, content: { text: f.label, ...(f.type === "heading" ? { level: level ?? 2 } : {}), ...(f.raw?.content?.align ? { align: f.raw.content.align } : {}) } };
  }
  // The saved field it came from, when it's still the same type: its CRM link, width, checks and the rest stay.
  const base: Partial<Field> = f.raw && f.raw.type === type ? { ...f.raw } : f.raw ? pickKept(f.raw) : {};
  let key = keepKey ? keyFor(f) : undefined;
  if (!key) key = questionKey(f.label || "answer", taken);
  taken.add(key);
  const out: Field = { ...base, id: f.id, key: key as FieldKey, type, label: f.label, required: !!f.required && type !== "hidden" } as Field;
  for (const k of ["placeholder", "help"] as const) {
    if (f[k]?.trim()) out[k] = f[k]!.trim();
    else delete out[k];
  }
  delete out.logic;
  if (f.type === "radio" || f.type === "checkboxes" || f.type === "dropdown" || f.type === "pictures") {
    const old = new Map((f.raw?.options ?? []).map((o) => [o.value, o]));
    out.options = (f.options ?? []).map((o) => ({ ...(old.get(o.value) ?? {}), value: o.value, label: o.label, ...(o.image ? { image: o.image } : {}) }));
    for (const o of out.options) if (!(f.options ?? []).find((x) => x.value === o.value)?.image) delete o.image;
    if (f.type === "pictures") out.cards = true;
    else if (f.type !== "checkboxes") delete out.cards;
  } else if (f.type === "yesno") {
    out.options = YES_NO.map((o) => ({ ...o }));
    delete out.cards;
  } else delete out.options;
  if (f.type === "rating") out.rating = f.scale === 10 ? { ...(f.raw?.rating ?? {}), scale: 10, style: "numbers", zero: true } : { ...(f.raw?.rating ?? {}), scale: 5, style: "stars" };
  if (f.type === "rating" && f.scale !== 10) delete out.rating!.zero;
  if (f.type === "file") out.file = { maxMb: f.files?.maxMb ?? out.file?.maxMb ?? 10, kinds: f.files?.kinds.length ? f.files.kinds : (out.file?.kinds ?? ["pdf", "image", "office"]) };
  if (f.type === "hidden") out.hidden = { ...(out.hidden ?? { from: "param" }), ...(f.param ? { from: "param" as const, name: f.param } : {}) };
  return out;
}

/** The parts of a field that fit any type. */
function pickKept(r: Field): Partial<Field> {
  const { width, crm, hideLabel, labels, size, hideOnPhone, prefill, source, overwrite } = r;
  return Object.fromEntries(Object.entries({ width, crm, hideLabel, labels, size, hideOnPhone, prefill, source, overwrite }).filter(([, v]) => v !== undefined)) as Partial<Field>;
}

const formCond = (c: SpecCond): FormCond => ({ field: c.field, op: c.op, ...(needsValues(c.op) ? { values: c.values ?? [] } : needsValue(c.op) ? { value: c.value ?? "" } : {}) });

/**
 * The saved form for a spec, on top of `base` (its settings: consent, spam, alerts, what happens after the send,
 * design and the rest stay as they are). Field logic becomes show rules; a step's condition becomes a path on the step
 * before it: when the condition doesn't hold, go past the step.
 */
export function toForm(s: Spec, base: Form): Form {
  // Each key goes to the first field that has it; a field without one (or with one already taken) gets an answer key
  // made from its label.
  const owner = new Map<string, string>();
  for (const f of specFields(s)) {
    const k = keyFor(f);
    if (k && !owner.has(k)) owner.set(k, f.id);
  }
  const taken = new Set(owner.keys());
  const steps: Step[] = s.steps.map((st) => ({
    id: st.id,
    ...(st.title?.trim() ? { title: st.title.trim() } : {}),
    ...(st.raw?.image ? { image: st.raw.image } : {}),
    ...(st.raw?.result ? { result: true as const } : {}),
    fields: st.fields.map((f) => {
      const own = keyFor(f);
      const mine = own && owner.get(own) === f.id;
      return toField(f, taken, !!mine);
    }),
  }));
  const ids = new Set(steps.flatMap((st) => st.fields.map((f) => f.id)));
  const shows = new Set(specFields(s).filter((f) => f.show?.conds.length).map((f) => f.id));
  // Rules kept from the saved form, while every field they name is still there; a field the spec now gives logic to
  // drops its old show rules.
  const kept = (s.rules ?? []).filter((r) => ids.has(r.then.field) && ids.has(r.when.field) && (r.group?.when ?? []).every((c) => ids.has(c.field)) && !(r.then.action === "show" && shows.has(r.then.field)));
  const ruleIds = new Set(kept.map((r) => r.id));
  let n = 0;
  const ruleId = () => {
    let id = `r${++n}`;
    while (ruleIds.has(id)) id = `r${++n}`;
    ruleIds.add(id);
    return id;
  };
  const rules: Rule[] = [];
  for (const f of specFields(s)) {
    if (!f.show?.conds.length) continue;
    const conds = f.show.conds.map(formCond);
    if (f.show.match === "any" || conds.length === 1) for (const c of conds) rules.push({ id: ruleId(), when: c, then: { action: "show", field: f.id } });
    else rules.push({ id: ruleId(), when: conds[0]!, group: { logic: "all", when: conds.slice(1) }, then: { action: "show", field: f.id } });
  }
  rules.push(...kept);
  // "All of its rules" stays only on a field the spec gives no logic to, for the rules it kept.
  for (const st of steps) for (const f of st.fields) if (shows.has(f.id) || !kept.some((r) => r.then.field === f.id)) delete f.logic;
  // Paths: a step's condition first; else the paths it came with, by step id, while they still point forward.
  const index = new Map(s.steps.map((st, i) => [st.id, i]));
  const at = (to: string) => (to === "end" ? steps.length : (index.get(to) ?? -1));
  s.steps.forEach((st, i) => {
    const next = s.steps[i + 1];
    if (next?.show) {
      const flip = OPPOSITE[next.show.op]!;
      steps[i]!.jumps = [{ when: formCond({ ...next.show, op: flip }), to: i + 2 }];
      return;
    }
    const keep = (j: { when: FormCond; to: string }) => {
      const to = at(j.to);
      return to > i + 1 || (to === steps.length && to > i);
    };
    const jumps: Jump[] = (st.raw?.jumps ?? []).filter(keep).map((j) => ({ when: j.when, to: at(j.to) }));
    if (jumps.length) steps[i]!.jumps = jumps;
    if (st.raw?.skip && keep(st.raw.skip) && at(st.raw.skip.to) < steps.length) steps[i]!.skip = { when: st.raw.skip.when, to: at(st.raw.skip.to) };
  });
  const out: Form = { ...base, steps, rules };
  if (s.title?.trim()) out.title = s.title.trim();
  else delete out.title;
  if (s.intro?.trim()) out.intro = s.intro.trim();
  else delete out.intro;
  out.submit = { ...base.submit, label: s.submit.trim() || "Submit" };
  return out;
}

// ── From the saved form ─────────────────────────────────────────────────────────────────────────────────────────

const FROM_V1: Partial<Record<FieldType, SpecType>> = {
  text: "text",
  textarea: "longtext",
  email: "email",
  phone: "phone",
  number: "number",
  url: "url",
  date: "date",
  country: "country",
  choice: "radio",
  multi: "checkboxes",
  dropdown: "dropdown",
  rating: "rating",
  file: "file",
  checkbox: "checkbox",
  hidden: "hidden",
  heading: "heading",
  paragraph: "paragraph",
};

function fromField(f: Field): SpecField {
  let type: SpecType = FROM_V1[f.type] ?? "locked";
  // Options that follow another answer, or calculations' scores: the spec can't show them, so the field stays as it is.
  if (f.optionsBy || f.calc || f.group || f.grid) type = "locked";
  if (type === "radio" && f.cards) type = "pictures";
  else if (type === "radio" && !f.cards && f.options?.length === 2 && f.options[0]!.value === "yes" && f.options[1]!.value === "no" && f.options[0]!.label === "Yes" && f.options[1]!.label === "No") type = "yesno";
  if (type === "locked") return { id: f.id, type, label: f.label, raw: f };
  if (type === "heading" || type === "paragraph") return { id: f.id, type, label: f.content?.text ?? "", raw: f };
  const out: SpecField = { id: f.id, type, label: f.label, key: f.key, raw: f };
  if (f.required) out.required = true;
  if (f.placeholder) out.placeholder = f.placeholder;
  if (f.help) out.help = f.help;
  if (type === "radio" || type === "checkboxes" || type === "dropdown" || type === "pictures") out.options = (f.options ?? []).map((o) => ({ value: o.value, label: o.label, ...(o.image ? { image: o.image } : {}) }));
  if (type === "rating") out.scale = f.rating?.scale === 10 ? 10 : 5;
  if (type === "file" && f.file) out.files = { kinds: [...f.file.kinds], maxMb: f.file.maxMb };
  if (type === "hidden" && f.hidden?.from === "param" && f.hidden.name) out.param = f.hidden.name;
  return out;
}

/** A form condition the spec can read: one of its ops, with the value or picks the op needs. */
function specCond(c: FormCond): SpecCond | null {
  if (!SPEC_OPS.includes(c.op as SpecOp)) return null;
  const op = c.op as SpecOp;
  if (needsValues(op)) return { field: c.field, op, values: [...(c.values ?? [])] };
  if (needsValue(op)) return { field: c.field, op, value: c.value ?? "" };
  return { field: c.field, op };
}

/** Read a saved form as a spec. Anything the spec can't show is kept on the side and comes back unchanged. */
export function fromForm(form: Form): Spec {
  const steps: SpecStep[] = form.steps.map((st) => ({ id: st.id, ...(st.title ? { title: st.title } : {}), fields: st.fields.map(fromField) }));
  const byId = new Map(steps.flatMap((st) => st.fields.map((f) => [f.id, f] as const)));
  // Show rules become a field's logic when they all fit: one rule per condition (any), or one rule with an "all" group.
  const left: Rule[] = [];
  const byField = new Map<string, Rule[]>();
  for (const r of form.rules) {
    if (r.then.action !== "show" || !byId.has(r.then.field)) {
      left.push(r);
      continue;
    }
    byField.set(r.then.field, [...(byField.get(r.then.field) ?? []), r]);
  }
  for (const [id, rs] of byField) {
    const f = byId.get(id)!;
    const all = f.raw?.logic === "all";
    const when = (r: Rule) => [r.when, ...(r.group?.when ?? [])].map(specCond);
    let show: When | null = null;
    if (!all && rs.every((r) => !r.group)) {
      const conds = rs.map((r) => specCond(r.when));
      if (conds.every(Boolean)) show = { match: "any", conds: conds as SpecCond[] };
    } else if (!all && rs.length === 1 && rs[0]!.group?.logic === "all") {
      const conds = when(rs[0]!);
      if (conds.every(Boolean)) show = { match: "all", conds: conds as SpecCond[] };
    } else if (all && rs.every((r) => !r.group)) {
      const conds = rs.map((r) => specCond(r.when));
      if (conds.every(Boolean)) show = { match: rs.length === 1 ? "any" : "all", conds: conds as SpecCond[] };
    }
    if (show && f.type !== "locked") f.show = show;
    else left.push(...rs);
  }
  // A step's condition: the only path on the step before it, going past it, on a test that turns over exactly.
  const idAt = (i: number) => (i >= form.steps.length ? "end" : form.steps[i]!.id);
  form.steps.forEach((st, i) => {
    const raw: StepRaw = {};
    if (st.image) raw.image = st.image;
    if (st.result) raw.result = true;
    const j = st.jumps ?? [];
    const next = steps[i + 1];
    const flip = j.length === 1 && !st.skip && j[0]!.to === i + 2 && next && i + 1 > 0 ? specCond(j[0]!.when) : null;
    if (flip && STEP_OPS.includes(flip.op) && OPPOSITE[flip.op]) next!.show = { ...flip, op: OPPOSITE[flip.op]! };
    else {
      if (j.length) raw.jumps = j.map((x) => ({ when: x.when, to: idAt(x.to) }));
      if (st.skip) raw.skip = { when: st.skip.when, to: idAt(st.skip.to) };
    }
    if (Object.keys(raw).length) steps[i]!.raw = raw;
  });
  const out: Spec = { submit: form.submit.label, steps };
  if (form.title) out.title = form.title;
  if (form.intro) out.intro = form.intro;
  if (left.length) out.rules = left;
  return out;
}

// ── Edits ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** A field as an edit gives it: everything but the id and the saved copy. */
export type FieldInput = Omit<SpecField, "id" | "raw">;

/** One change to a spec. The AI's edits and the builder's clicks are the same list. */
export type Edit =
  | { op: "add_field"; step: string; after?: string; field: FieldInput & { id?: string } }
  | { op: "update_field"; id: string; set: Partial<Omit<FieldInput, "show">> & { show?: When | null } }
  | { op: "remove_field"; id: string }
  | { op: "move_field"; id: string; step: string; index: number }
  | { op: "add_step"; after?: string; title?: string; id?: string }
  | { op: "update_step"; id: string; title?: string; show?: SpecCond | null }
  | { op: "remove_step"; id: string }
  | { op: "move_step"; id: string; index: number }
  | { op: "set_form"; title?: string; intro?: string; submit?: string };

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Apply edits in order, all or none. Each edit must find what it names; the result must pass the checker, so an edit
 * can never leave a broken form behind. Removing a field also removes the conditions that read it.
 */
export function applyEdits(s: Spec, edits: Edit[], opts: { needEmail?: boolean } = {}): { spec: Spec } | { error: string } {
  const next = clone(s);
  for (const e of edits) {
    const err = applyOne(next, e);
    if (err) return { error: err };
  }
  const problems = lintSpec(next, opts);
  if (problems.length) return { error: problems[0]!.text };
  return { spec: next };
}

function stepOf(s: Spec, id: string) {
  return s.steps.find((st) => st.id === id);
}
function where(s: Spec, fieldId: string): { st: SpecStep; i: number } | null {
  for (const st of s.steps) {
    const i = st.fields.findIndex((f) => f.id === fieldId);
    if (i >= 0) return { st, i };
  }
  return null;
}
function freshId(s: Spec, want?: string): string {
  const taken = new Set([...s.steps.map((x) => x.id), ...specFields(s).map((f) => f.id)]);
  if (want && ID.test(want) && !taken.has(want)) return want;
  let id = newSpecId();
  while (taken.has(id)) id = newSpecId();
  return id;
}

function cleanInput(f: Partial<Omit<FieldInput, "show">> & { show?: When | null }): Partial<FieldInput> {
  const out: Partial<FieldInput> = {};
  if (typeof f.type === "string" && (SPEC_TYPES.some((t) => t.value === f.type) || f.type === "locked")) out.type = f.type;
  if (typeof f.label === "string") out.label = f.label.slice(0, LIMITS.text);
  if (typeof f.key === "string" && f.key) out.key = f.key;
  if (typeof f.required === "boolean") out.required = f.required;
  for (const k of ["placeholder", "help", "param"] as const) if (typeof f[k] === "string") out[k] = f[k]!.slice(0, LIMITS.label);
  if (Array.isArray(f.options))
    out.options = f.options
      .filter((o) => o && typeof o === "object")
      .slice(0, LIMITS.options)
      .map((o) => ({ value: String(o.value ?? o.label ?? "").slice(0, 200), label: String(o.label ?? o.value ?? "").slice(0, 200), ...(typeof o.image === "string" && o.image ? { image: o.image } : {}) }));
  if (f.files && typeof f.files === "object") out.files = { kinds: (f.files.kinds ?? []).filter((k) => k === "pdf" || k === "image" || k === "office"), maxMb: Math.round(Number(f.files.maxMb) || 10) };
  if (f.scale === 5 || f.scale === 10) out.scale = f.scale;
  if (f.show && typeof f.show === "object") out.show = f.show;
  return out;
}

function applyOne(s: Spec, e: Edit): string | null {
  switch (e.op) {
    case "add_field": {
      const st = stepOf(s, e.step);
      if (!st) return "That page isn't on the form.";
      const input = cleanInput(e.field);
      if (!input.type) return "Say what kind of question to add.";
      const f: SpecField = { label: "", ...input, type: input.type, id: freshId(s, e.field.id) } as SpecField;
      if (f.type === "locked") return "That kind of question can't be added here.";
      if (f.type === "yesno") delete f.options;
      if (f.type === "file" && !f.files) f.files = { kinds: ["pdf", "image", "office"], maxMb: 10 };
      if (f.type === "rating" && !f.scale) f.scale = 5;
      const at = e.after ? st.fields.findIndex((x) => x.id === e.after) : st.fields.length - 1;
      if (e.after && at < 0) return "The question to add after isn't on that page.";
      st.fields.splice(at + 1, 0, f);
      return null;
    }
    case "update_field": {
      const w = where(s, e.id);
      if (!w) return "That question isn't on the form.";
      const f = w.st.fields[w.i]!;
      if (f.type === "locked") return "That question can only be moved or deleted here.";
      const set = cleanInput(e.set);
      const next: SpecField = { ...f, ...set };
      if (e.set.show === null) delete next.show;
      if (set.type && set.type !== f.type) {
        if (!hasOptions(set.type) || set.type === "yesno") delete next.options;
        else if (!next.options?.length) next.options = [{ value: "option_1", label: "Option 1" }];
        if (set.type !== "file") delete next.files;
        else if (!next.files) next.files = { kinds: ["pdf", "image", "office"], maxMb: 10 };
        if (set.type !== "rating") delete next.scale;
        else next.scale ??= 5;
        if (CONTENT_SPEC.includes(set.type)) {
          delete next.key;
          delete next.required;
          delete next.show;
        }
        // A contact key that doesn't fit the new type goes back to an answer on the fill.
        const contact = CONTACT_KEYS.find((c) => c.key === keyFor(next));
        if (contact && !contact.types.includes(v1Type(next))) next.key = undefined;
      }
      w.st.fields[w.i] = next;
      return null;
    }
    case "remove_field": {
      const w = where(s, e.id);
      if (!w) return "That question isn't on the form.";
      w.st.fields.splice(w.i, 1);
      dropReads(s, e.id);
      return null;
    }
    case "move_field": {
      const w = where(s, e.id);
      const to = stepOf(s, e.step);
      if (!w || !to) return "That question or page isn't on the form.";
      const [f] = w.st.fields.splice(w.i, 1);
      to.fields.splice(Math.max(0, Math.min(e.index, to.fields.length)), 0, f!);
      return null;
    }
    case "add_step": {
      const at = e.after ? s.steps.findIndex((x) => x.id === e.after) : s.steps.length - 1;
      if (e.after && at < 0) return "That page isn't on the form.";
      s.steps.splice(at + 1, 0, { id: freshId(s, e.id), ...(e.title?.trim() ? { title: e.title.trim().slice(0, LIMITS.label) } : {}), fields: [] });
      return null;
    }
    case "update_step": {
      const st = stepOf(s, e.id);
      if (!st) return "That page isn't on the form.";
      if (e.title !== undefined) {
        if (e.title.trim()) st.title = e.title.slice(0, LIMITS.label);
        else delete st.title;
      }
      if (e.show === null) delete st.show;
      else if (e.show) st.show = e.show;
      return null;
    }
    case "remove_step": {
      const i = s.steps.findIndex((x) => x.id === e.id);
      if (i < 0) return "That page isn't on the form.";
      if (s.steps.length === 1) return "A form needs at least one page.";
      const [gone] = s.steps.splice(i, 1);
      // Its questions join the step before (or the next one, for the first step).
      const into = s.steps[Math.max(0, i - 1)]!;
      if (i === 0) into.fields.unshift(...gone!.fields);
      else into.fields.push(...gone!.fields);
      if (i === 0) delete s.steps[0]!.show;
      return null;
    }
    case "move_step": {
      const i = s.steps.findIndex((x) => x.id === e.id);
      if (i < 0) return "That page isn't on the form.";
      const [st] = s.steps.splice(i, 1);
      s.steps.splice(Math.max(0, Math.min(e.index, s.steps.length)), 0, st!);
      return null;
    }
    case "set_form": {
      if (e.title !== undefined) s.title = e.title.slice(0, LIMITS.label);
      if (e.intro !== undefined) s.intro = e.intro.slice(0, LIMITS.text);
      if (e.submit !== undefined) s.submit = e.submit.slice(0, 60);
      return null;
    }
  }
  return "That change can't be read.";
}

/** Conditions that read a field go when it goes. */
function dropReads(s: Spec, id: string) {
  for (const st of s.steps) {
    if (st.show?.field === id) delete st.show;
    for (const f of st.fields) {
      if (!f.show) continue;
      f.show.conds = f.show.conds.filter((c) => c.field !== id);
      if (!f.show.conds.length) delete f.show;
    }
  }
  if (s.rules) s.rules = s.rules.filter((r) => r.then.field !== id && r.when.field !== id && !(r.group?.when ?? []).some((c) => c.field === id));
}

/** What reads a field, in words, so a delete can say what changes first. */
export function readersOf(s: Spec, id: string): string[] {
  const out: string[] = [];
  s.steps.forEach((st, i) => {
    if (st.show?.field === id) out.push(st.title || `Page ${i + 1}`);
    for (const f of st.fields) if (f.show?.conds.some((c) => c.field === id)) out.push(f.label || "a question");
  });
  return out;
}

// ── Layout: one page or steps ───────────────────────────────────────────────────────────────────────────────────

const CONTACT_LAST = new Set(["email", "first_name", "last_name", "name", "phone"]);
export const questionCount = (s: Pick<Spec, "steps">) => specFields(s).filter(isQuestion).length;

/**
 * One page: every question on one step. A step's condition moves onto each of its questions (with the question's own
 * conditions when they all must hold). Null when that can't be said exactly: a question that shows on any of several
 * answers, on a step that has its own condition.
 */
export function toOnePage(s: Spec): Spec | null {
  if (s.steps.length === 1) return s;
  const fields: SpecField[] = [];
  for (const st of s.steps) {
    for (const f of st.fields) {
      const g = clone(f);
      if (st.show && isQuestion(g)) {
        if (g.show && g.show.match === "any" && g.show.conds.length > 1) return null;
        g.show = { match: "all", conds: [clone(st.show), ...(g.show?.conds ?? [])] };
      } else if (st.show && !isQuestion(g)) {
        // A heading or text block on a step with a condition: it goes, since it can't show on a condition.
        if (g.type === "heading" || g.type === "paragraph") continue;
      }
      fields.push(g);
    }
  }
  // Step titles past the first become headings, so the page keeps its sections.
  const withHeads: SpecField[] = [];
  let i = 0;
  for (const st of s.steps) {
    const own = fields.filter((f) => st.fields.some((x) => x.id === f.id));
    if (i > 0 && st.title?.trim() && !st.show) withHeads.push({ id: newSpecId(), type: "heading", label: st.title.trim() });
    withHeads.push(...own);
    i++;
  }
  const out: Spec = { ...clone(s), steps: [{ id: s.steps[0]!.id, ...(s.steps[0]!.title ? { title: s.steps[0]!.title } : {}), fields: withHeads }] };
  return lintSpec(out).length ? null : out;
}

/**
 * Steps from one page: about four questions a step, a heading starting a new step, contact details on the last step
 * (when moving them keeps every condition pointing back). Step titles come from the headings, or "About you" for
 * contact details.
 */
export function toSteps(s: Spec, per = 4): Spec {
  if (s.steps.length > 1) return s;
  const all = clone(s.steps[0]!.fields);
  const contact = all.filter((f) => CONTACT_LAST.has(keyFor(f) ?? ""));
  const rest = all.filter((f) => !contact.includes(f));
  const groups: { title?: string; fields: SpecField[] }[] = [];
  let cur: { title?: string; fields: SpecField[] } = { fields: [] };
  for (const f of rest) {
    if (f.type === "heading" && cur.fields.some(isQuestion)) {
      groups.push(cur);
      cur = { title: f.label, fields: [] };
      continue;
    }
    if (f.type === "heading" && !cur.fields.length) {
      cur.title = f.label;
      continue;
    }
    cur.fields.push(f);
    if (cur.fields.filter(isQuestion).length >= per) {
      groups.push(cur);
      cur = { fields: [] };
    }
  }
  if (cur.fields.length) groups.push(cur);
  if (contact.length) groups.push({ title: "About you", fields: contact });
  const steps = groups.filter((g) => g.fields.length).map((g, i) => ({ id: i === 0 ? s.steps[0]!.id : newSpecId(), ...(g.title ? { title: g.title } : i === 0 && s.steps[0]!.title ? { title: s.steps[0]!.title } : {}), fields: g.fields }));
  const out: Spec = { ...clone(s), steps: steps.length ? steps : clone(s.steps) };
  if (!lintSpec(out).length) return out;
  // Contact details moved last broke a condition: keep the page's order.
  const plain: Spec = { ...clone(s), steps: chunk(all, per).map((fields, i) => ({ id: i === 0 ? s.steps[0]!.id : newSpecId(), fields })) };
  return lintSpec(plain).length ? s : plain;
}

function chunk(fields: SpecField[], per: number): SpecField[][] {
  const out: SpecField[][] = [];
  let cur: SpecField[] = [];
  for (const f of fields) {
    cur.push(f);
    if (cur.filter(isQuestion).length >= per) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The layout rules (docs/forms.md, Screen 2), checked in code after Claude picks: more than 8 questions on one page
 * become steps; 4 questions or fewer in steps (with no step conditions) become one page; a step over 6 questions is
 * split. Returns the spec and what was changed, in words.
 */
export function fitLayout(s: Spec): { spec: Spec; changed: string | null } {
  const n = questionCount(s);
  if (s.steps.length === 1 && n > 8) return { spec: toSteps(s), changed: `${n} questions are too many for one page, so it's split into pages.` };
  if (s.steps.length > 1 && n <= 4 && !s.steps.some((st) => st.show)) {
    const one = toOnePage(s);
    if (one) return { spec: one, changed: `${n} questions fit on one page.` };
  }
  if (s.steps.length > 1 && s.steps.some((st) => st.fields.filter(isQuestion).length > 6)) {
    const out = clone(s);
    const steps: SpecStep[] = [];
    for (const st of out.steps) {
      if (st.fields.filter(isQuestion).length <= 6 || steps.length + 2 > LIMITS.steps) {
        steps.push(st);
        continue;
      }
      const parts = chunk(st.fields, 5);
      parts.forEach((fields, i) => steps.push({ ...(i === 0 ? st : { id: newSpecId(), ...(st.title ? { title: st.title } : {}) }), fields }));
    }
    out.steps = steps;
    if (!lintSpec(out).length) return { spec: out, changed: "Long pages are split, five questions a page." };
  }
  return { spec: s, changed: null };
}

/** The rough sketch: each step's title and its questions in a few words. */
export function outline(s: Spec): { title: string; items: string[] }[] {
  return s.steps.map((st, i) => ({ title: st.title?.trim() || (s.steps.length === 1 ? s.title?.trim() || "Your form" : `Page ${i + 1}`), items: st.fields.filter(isQuestion).map((f) => f.label) }));
}

/** A spec that's just a title, for the preview before the form is written. */
export function placeholderSpec(title: string): Spec {
  return { title, submit: "Submit", steps: [{ id: "s1", fields: [{ id: "email", type: "email", label: "Work email", key: "email", required: true }] }] };
}

/** The ids every field and step has, so the checker's errors can point at them. */
export const allIds = (s: Spec) => new Set([...s.steps.map((st) => st.id), ...specFields(s).map((f) => f.id)]);

/** Fields of the saved form as the spec reads them, for code that only has the form. */
export const formQuestions = (form: Form) => allFields(form).filter((f) => !isContent(f.type) && f.type !== "hidden");
