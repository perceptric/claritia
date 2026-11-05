// Form edits (docs/form-builder.md 4.2). Every change to a form, from a click in the builder or a tool call from the
// chat, is one op. An op is applied to a copy, and the copy is checked; the chat may only apply ops that add no new
// problems, while the builder lets a draft be unfinished and blocks only the publish. Runs in the browser and on
// the server.

import { readFormDesign, type FormDesign } from "../design/model.ts";
import { DEFAULT_KEEP, DEFAULT_NOTIFY, DEFAULT_REPLY, type Keep, type Notify, type Reply } from "./notify.ts";
import { allFields, checkForm, cleanAccess, cleanShare, cleanTrack, CONTACT_KEYS, isChoice, isContent, newId, questionKey, type After, type Choice, type Cond, type Constant, type Field, type FieldKey, type FieldType, type Form, type Results, type Rule, type SharePreview, type Step, type Track } from "./schema.ts";

export type FieldInput = Partial<Omit<Field, "id">> & { type: FieldType; label: string };

export type Op =
  | { op: "add_field"; field: FieldInput; step?: number; after?: string; id?: string }
  | { op: "update_field"; id: string; patch: Partial<Omit<Field, "id">> }
  | { op: "remove_field"; id: string }
  | { op: "move_field"; id: string; step: number; index: number }
  | { op: "add_step"; title?: string }
  | { op: "update_step"; index: number; title?: string; skip?: Step["skip"] | null; jumps?: Step["jumps"] | null; image?: string | null; result?: boolean }
  | { op: "remove_step"; index: number }
  | { op: "set_rule"; rule: Omit<Rule, "id"> & { id?: string } }
  | { op: "remove_rule"; id: string }
  | {
      op: "set_layout";
      labels?: Form["layout"]["labels"];
      width?: Form["layout"]["width"];
      progress?: Form["layout"]["progress"];
      maxWidth?: number | null;
      /** Interactive forms (docs/interactive-forms-plan.md Part 2): screens, auto-advance and the cover screen. */
      mode?: "screens" | null;
      auto?: boolean;
      cover?: Form["layout"]["cover"] | null;
      /** Split screen (docs/form-kinds-plan.md): the picture beside every step. */
      side?: Form["layout"]["side"] | null;
      /** false hides the brand's logo over the form; true shows it again. */
      logo?: boolean;
    }
  | { op: "set_kind"; kind?: Form["kind"] | null; emailOptional?: boolean; resume?: boolean; copy?: boolean }
  /** The owner's settings formulas read as {@id}, whole. */
  | { op: "set_constants"; constants: Constant[] }
  /** One setting: add or change it (value null: the owner sets it), or remove it. */
  | { op: "set_constant"; id: string; name?: string; value?: number | null; format?: Constant["format"] | "number"; private?: boolean; remove?: boolean }
  /** The outcomes and when results show, whole; null removes them. */
  | { op: "set_results"; results: Results | null }
  | { op: "set_copy"; title?: string; intro?: string; submit?: string; submitFull?: boolean }
  | { op: "set_consent"; mode?: Form["consent"]["mode"]; label?: string; topicId?: string | null; required?: boolean; confirm?: boolean }
  | { op: "set_spam"; minSeconds?: number; turnstile?: boolean; blockFree?: boolean; sites?: string[]; perHour?: number | null; bot?: "auto" | "always"; throwaway?: "refuse" | "hold" }
  | { op: "set_notify"; notify: Partial<Notify> }
  | { op: "set_reply"; reply: Partial<Reply> }
  | { op: "set_keep"; keep: Partial<Keep> }
  | { op: "set_share"; share: SharePreview }
  /** A field given as null comes off. */
  | { op: "set_access"; access: { opens?: string | null; closes?: string | null; limit?: number | null; message?: string | null } }
  /** Settings › Tracking, whole: a key left out comes off. */
  | { op: "set_track"; track: Track }
  | { op: "set_after"; end: After["end"] }
  | { op: "set_schedule"; schedule: After["schedule"] | null }
  | { op: "set_capture"; adapter?: NonNullable<Form["capture"]>["adapter"]; selector?: string }
  /** The form's own styles and classes, whole (docs/design-system.md Part 3.1). `merge` joins edits of one input into one undo step. */
  | { op: "set_design"; design: FormDesign; merge?: string };

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
        ...(op.field.options ? { options: choices(op.field.options) } : isChoice(op.field.type) && !op.field.optionsBy ? { options: [{ value: "Option 1", label: "Option 1" }] } : {}),
        ...(op.field.type === "calc" ? { calc: op.field.calc ?? { formula: "0" }, required: false } : {}),
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
      // A choice whose value changed in place (same spot, same count) keeps every rule, skip, outcome and default
      // that used the old value.
      const was = cur.options ?? [];
      if (op.patch.options && next.options && was.length === next.options.length) {
        const map = new Map<string, string>();
        const before = new Set(was.map((o) => o.value));
        const after = new Set(next.options.map((o) => o.value));
        // A value that's gone, at the spot where a new one appeared. Moving choices around renames nothing.
        was.forEach((o, i) => {
          const to = next.options![i]!.value;
          if (o.value !== to && !after.has(o.value) && !before.has(to)) map.set(o.value, to);
        });
        if (map.size) {
          renameValues(form, [cur.id, cur.key].filter((x): x is string => !!x), map);
          if (next.default && map.has(next.default)) next.default = map.get(next.default);
          next.options = next.options.map((o) => (o.needs ? { ...o, needs: o.needs.map((n) => map.get(n) ?? n) } : o));
        }
      }
      // A removed choice comes off the others' needs.
      if (next.options) {
        const have = new Set(next.options.map((o) => o.value));
        next.options = next.options.map((o) => {
          if (!o.needs) return o;
          const needs = o.needs.filter((n) => have.has(n));
          const c: Choice = { ...o, needs };
          if (!needs.length) delete c.needs;
          return c;
        });
      }
      for (const k of Object.keys(next) as (keyof Field)[]) if (next[k] === undefined || next[k] === null) delete next[k];
      if (isContent(next.type)) {
        next.key = `c.${cur.id}`;
        next.required = false;
      } else if (isContent(cur.type)) next.key = keyFor({ ...next, key: undefined }, form);
      if (next.type === "ranking") {
        delete next.optionsBy;
        if ((next.options?.length ?? 0) < 2) next.options = [{ value: "Option 1", label: "Option 1" }, { value: "Option 2", label: "Option 2" }];
      } else if (!isChoice(next.type)) {
        delete next.options;
        delete next.optionsBy;
      } else if (!next.options?.length && !next.optionsBy) next.options = [{ value: "Option 1", label: "Option 1" }];
      if (next.type !== "grid") delete next.grid;
      else next.grid ??= { rows: [{ value: "Row 1", label: "Row 1" }], cols: [{ value: "Poor", label: "Poor" }, { value: "Good", label: "Good" }, { value: "Great", label: "Great" }] };
      if (next.type !== "group") delete next.group;
      else next.group ??= { fields: [{ id: newId(), key: "q.name" as FieldKey, type: "text", label: "Name", required: true }], max: 5, add: "Add another" };
      if (next.type !== "rating") delete next.rating;
      if (next.type !== "calc") delete next.calc;
      else {
        next.calc ??= { formula: "0" };
        next.required = false;
      }
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
      form.rules = form.rules
        .filter((r) => r.when.field !== op.id && r.then.field !== op.id)
        .map((r) => {
          const left = r.group?.when.filter((c) => c.field !== op.id);
          const { group, ...rest } = r;
          return left?.length ? { ...rest, group: { logic: group!.logic, when: left } } : rest;
        });
      for (const st of form.steps) if (st.skip?.when.field === op.id) delete st.skip;
      return { form };
    }
    case "move_field": {
      const at = find(form, op.id);
      if (!at || !form.steps[op.step]) return { error: "That field or step is gone." };
      const [f] = form.steps[at.step].fields.splice(at.index, 1);
      form.steps[op.step].fields.splice(Math.max(0, Math.min(op.index, form.steps[op.step].fields.length)), 0, f);
      return { form };
    }
    case "add_step": {
      // A path to the end still ends the form after the new last step.
      const end = form.steps.length;
      for (const st of form.steps) if (st.jumps) st.jumps = st.jumps.map((j) => (j.to === end ? { ...j, to: end + 1 } : j));
      form.steps.push({ id: newId(), ...(op.title ? { title: op.title } : {}), fields: [] });
      return { form };
    }
    case "update_step":
      if (!form.steps[op.index]) return { error: "That step doesn't exist." };
      if (op.title !== undefined) {
        form.steps[op.index].title = op.title || undefined;
        if (!form.steps[op.index].title) delete form.steps[op.index].title;
      }
      if (op.skip === null) delete form.steps[op.index].skip;
      else if (op.skip) form.steps[op.index].skip = op.skip;
      if (op.jumps === null || (op.jumps && !op.jumps.length)) delete form.steps[op.index].jumps;
      else if (op.jumps) form.steps[op.index].jumps = op.jumps;
      if (op.image === null || op.image === "") delete form.steps[op.index].image;
      else if (op.image) form.steps[op.index].image = op.image;
      if (op.result === true) form.steps[op.index].result = true;
      else if (op.result === false) delete form.steps[op.index].result;
      return { form };
    case "remove_step": {
      if (!form.steps[op.index]) return { error: "That step doesn't exist." };
      if (form.steps.length === 1) return { error: "A form needs at least one step." };
      // Its fields join the step before (or after, for the first).
      const [gone] = form.steps.splice(op.index, 1);
      form.steps[Math.max(0, op.index - 1)].fields.push(...gone.fields);
      // Skips past the removed step move down one; a skip that no longer jumps past the next step comes off. Paths
      // move the same way; one to the end stays at the end.
      const n = form.steps.length;
      form.steps.forEach((st, i) => {
        if (st.skip) {
          const to = st.skip.to > op.index ? st.skip.to - 1 : st.skip.to;
          if (to <= i + 1 || to >= n) delete st.skip;
          else st.skip = { ...st.skip, to };
        }
        if (st.jumps) {
          const js = st.jumps.map((j) => ({ ...j, to: j.to > op.index ? j.to - 1 : j.to })).filter((j) => j.to > i && j.to <= n && !(j.to === i + 1 && j.to < n));
          if (js.length) st.jumps = js;
          else delete st.jumps;
        }
      });
      return { form };
    }
    case "set_rule": {
      const rule: Rule = { id: op.rule.id ?? newId(), when: op.rule.when, ...(op.rule.group?.when.length ? { group: op.rule.group } : {}), then: op.rule.then };
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
      if (op.mode === null) delete form.layout.mode;
      else if (op.mode) form.layout.mode = op.mode;
      if (op.auto === true) form.layout.auto = true;
      else if (op.auto === false) delete form.layout.auto;
      if (op.cover === null) delete form.layout.cover;
      else if (op.cover) form.layout.cover = op.cover;
      if (op.side === null) delete form.layout.side;
      else if (op.side) form.layout.side = op.side;
      if (op.logo === false) form.layout.logo = false;
      else if (op.logo === true) delete form.layout.logo;
      return { form };
    case "set_kind":
      if (op.kind === null) delete form.kind;
      else if (op.kind) form.kind = op.kind;
      if (op.emailOptional === true) form.emailOptional = true;
      else if (op.emailOptional === false) delete form.emailOptional;
      if (op.resume === true) form.resume = true;
      else if (op.resume === false) delete form.resume;
      if (op.copy === true) form.copy = true;
      else if (op.copy === false) delete form.copy;
      return { form };
    case "set_constants":
      if (op.constants.length) form.constants = op.constants;
      else delete form.constants;
      return { form };
    case "set_constant": {
      const list = form.constants ?? [];
      const cur = list.find((c) => c.id === op.id);
      if (op.remove) form.constants = list.filter((c) => c.id !== op.id);
      else {
        const next: Constant = { id: op.id, name: op.name ?? cur?.name ?? op.id, value: op.value === undefined ? (cur?.value ?? null) : op.value };
        const format = op.format === undefined ? cur?.format : op.format === "number" ? undefined : op.format;
        if (format) next.format = format;
        if (op.private ?? cur?.private) next.private = true;
        form.constants = cur ? list.map((c) => (c.id === op.id ? next : c)) : [...list, next];
      }
      if (!form.constants?.length) delete form.constants;
      return { form };
    }
    case "set_results":
      if (op.results) form.results = op.results;
      else delete form.results;
      return { form };
    case "set_copy":
      if (op.title !== undefined) form.title = op.title || undefined;
      if (op.intro !== undefined) form.intro = op.intro || undefined;
      if (op.submit !== undefined) form.submit = { ...form.submit, label: op.submit };
      if (op.submitFull !== undefined) form.submit = { label: form.submit.label, ...(op.submitFull ? { full: true } : {}) };
      if (!form.title) delete form.title;
      if (!form.intro) delete form.intro;
      return { form };
    case "set_consent":
      form.consent = { ...form.consent, ...(op.mode ? { mode: op.mode } : {}), ...(op.label !== undefined ? { label: op.label } : {}) };
      if (op.topicId) form.consent.topicId = op.topicId;
      if (op.required === true) form.consent.required = true;
      if (op.required === false) delete form.consent.required;
      if (op.confirm === true) form.consent.confirm = true;
      if (op.confirm === false) delete form.consent.confirm;
      if (op.topicId === null || form.consent.mode === "off" || form.consent.mode === "notice") delete form.consent.topicId;
      // No box, nothing to require or confirm.
      if (form.consent.mode === "off" || form.consent.mode === "notice") {
        delete form.consent.required;
        delete form.consent.confirm;
      }
      return { form };
    case "set_spam":
      form.spam = {
        ...form.spam,
        ...(op.minSeconds !== undefined ? { minSeconds: op.minSeconds } : {}),
        ...(op.turnstile !== undefined ? { turnstile: op.turnstile } : {}),
        ...(op.blockFree !== undefined ? { blockFree: op.blockFree } : {}),
        ...(op.sites !== undefined ? { sites: op.sites } : {}),
      };
      if (op.perHour === null) delete form.spam.perHour;
      else if (op.perHour !== undefined) form.spam.perHour = op.perHour;
      if (form.spam.sites && !form.spam.sites.length) delete form.spam.sites;
      if (form.spam.blockFree === false) delete form.spam.blockFree;
      if (op.bot === "always") form.spam.bot = "always";
      if (op.bot === "auto" || !form.spam.turnstile) delete form.spam.bot;
      if (op.throwaway === "hold") form.spam.throwaway = "hold";
      if (op.throwaway === "refuse") delete form.spam.throwaway;
      return { form };
    case "set_notify":
      form.notify = { ...DEFAULT_NOTIFY, ...form.notify, ...op.notify };
      return { form };
    case "set_reply":
      form.reply = { ...DEFAULT_REPLY, ...form.reply, ...op.reply };
      return { form };
    case "set_keep":
      form.keep = { ...DEFAULT_KEEP, ...form.keep, ...op.keep };
      return { form };
    case "set_share": {
      const share = cleanShare({ ...form.share, ...op.share });
      if (share) form.share = share;
      else delete form.share;
      return { form };
    }
    case "set_access": {
      const next: Record<string, unknown> = { ...form.access };
      for (const [k, v] of Object.entries(op.access)) {
        if (v === null) delete next[k];
        else if (v !== undefined) next[k] = v;
      }
      const access = cleanAccess(next);
      if (access) form.access = access;
      else delete form.access;
      return { form };
    }
    case "set_track": {
      const track = cleanTrack(op.track);
      if (track) form.track = track;
      else delete form.track;
      return { form };
    }
    case "set_after":
      form.after = { ...form.after, end: op.end };
      return { form };
    case "set_schedule":
      if (op.schedule) form.after = { ...form.after, schedule: op.schedule };
      else delete form.after.schedule;
      return { form };
    case "set_design": {
      const design = readFormDesign(op.design, new Set(allFields(form).map((f) => f.id)));
      if (Object.keys(design).length) form.design = design;
      else delete form.design;
      return { form };
    }
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

const OP_WORDS: Record<Cond["op"], string> = {
  is: "is",
  is_not: "isn't",
  filled: "is filled",
  empty: "is empty",
  contains: "contains",
  not_contains: "doesn't contain",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "is over",
  gte: "is at least",
  lt: "is under",
  lte: "is at most",
  between: "is between",
  before: "is before",
  after: "is after",
  within_days: "is within",
  any_of: "is any of",
  none_of: "is none of",
};

/** A condition in words: "Budget is between 10 and 50", "Country is any of US, CA". */
export function condText(c: Cond, label: (id: string) => string): string {
  const v = c.op === "between" ? `${c.value} and ${c.value2}` : c.op === "within_days" ? `${c.value} days` : c.values ? c.values.join(", ") : (c.value ?? "");
  return `${label(c.field)} ${OP_WORDS[c.op]}${c.op === "filled" || c.op === "empty" ? "" : ` ${v}`}`;
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
      return `Added a page${op.title ? `: ${op.title}` : ""}`;
    case "update_step":
      return op.title !== undefined ? `Renamed page ${op.index + 1}` : op.result !== undefined ? (op.result ? `Page ${op.index + 1} shows results` : `Page ${op.index + 1} asks questions again`) : `Changed where page ${op.index + 1} goes next`;
    case "remove_step":
      return `Removed page ${op.index + 1}`;
    case "set_rule":
      return `${op.rule.then.action === "show" ? "Show" : op.rule.then.action === "hide" ? "Hide" : "Require"} ${label(op.rule.then.field)} when ${condText(op.rule.when, label)}${op.rule.group?.when.length ? ` and ${op.rule.group.logic === "any" ? "any" : "all"} of ${op.rule.group.when.length} more` : ""}`;
    case "remove_rule":
      return "Removed a rule";
    case "set_layout":
      return op.mode === "screens" ? "One question per screen" : op.mode === null ? "All questions on one page" : op.cover !== undefined ? (op.cover ? "Changed the cover" : "Removed the cover") : "Changed the layout";
    case "set_kind":
      return op.emailOptional === true ? "Email is optional now" : op.emailOptional === false ? "Email is required now" : op.resume !== undefined ? (op.resume ? "People can save and finish later" : "Save and finish later is off") : op.copy !== undefined ? (op.copy ? "People get a PDF copy" : "PDF copy is off") : "Changed the kind of form";
    case "set_constants":
      return "Changed the settings";
    case "set_constant":
      return op.remove ? `Removed ${op.id}` : op.value === null ? `Added ${op.name ?? op.id} to set before publishing` : `Set ${op.name ?? op.id}${typeof op.value === "number" ? ` to ${op.value}` : ""}`;
    case "set_results":
      return op.results ? "Changed the results" : "Removed the results";
    case "set_copy":
      return op.submit ? `Button now says ${op.submit}` : "Changed the text";
    case "set_consent":
      return op.mode === "off" ? "Turned off the consent box" : "Changed the consent box";
    case "set_spam":
      return "Changed spam checks";
    case "set_notify":
      return op.notify.on === false ? "Turned off team alerts" : op.notify.on ? "Turned on team alerts" : "Changed team alerts";
    case "set_reply":
      return op.reply.on === false ? "Turned off the auto-reply" : op.reply.on ? "Turned on the auto-reply" : "Changed the auto-reply";
    case "set_keep":
      return "Changed how long submissions are kept";
    case "set_share":
      return "Changed the link preview";
    case "set_access":
      return "Changed when the form takes fills";
    case "set_track":
      return "Changed the tracking";
    case "set_after":
      return op.end.kind === "redirect" ? "Opens a page after the submit" : "Changed the thank-you message";
    case "set_schedule":
      return op.schedule ? "Books a meeting after the submit" : "No meeting after the submit";
    case "set_capture":
      return "Changed how the form is read";
    case "set_design":
      return "Changed the styles";
  }
}

/** Every condition on these fields (rules, skips, outcomes, results) that names an old choice value names the new one. */
export function renameValues(form: Form, fields: string[], map: Map<string, string>) {
  const want = new Set(fields);
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.field === "string" && want.has(o.field)) {
      if (typeof o.value === "string" && map.has(o.value)) o.value = map.get(o.value);
      if (Array.isArray(o.values)) o.values = o.values.map((x) => (typeof x === "string" ? (map.get(x) ?? x) : x));
    }
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(form.rules);
  walk(form.steps.map((s) => s.skip));
  walk(form.steps.map((s) => s.jumps));
  for (const f of form.steps.flatMap((s) => s.fields)) {
    const by = f.optionsBy;
    if (by?.map && want.has(by.field)) by.map = Object.fromEntries(Object.entries(by.map).map(([k, v]) => [map.get(k) ?? k, v]));
  }
  walk((form as { results?: unknown }).results);
  walk(form.after);
}
