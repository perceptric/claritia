// An older form, or a gallery template, as a studio page (docs/forms-chat-plan.md Part 8, "Turn into HTML"). The
// form's questions become the page's inputs and Claritia blocks in the brand's classes (.heading, .text, .label,
// .field, .choice, .check, .btn, .btn-secondary, .card), each keeping its field id (data-cl-id), so past answers stay
// tied to their questions and formulas keep working. Show-if rules, page skips and paths become data-cl-show-if, the
// end becomes the thanks section, and the booking becomes the page's after-send. What a page can't hold is listed in
// `lost`, in plain words, so nothing is dropped without a note. Plain functions: the server and the tests run them.

import type { Cond, Field, Form, Rule, Step } from "../forms/schema.ts";
import type { PageAfter } from "./page.ts";
import { writeList } from "./page.ts";
import type { StudioRoute } from "./routes.ts";

export type Converted = { html: string; css: string; after: PageAfter; title: string; lost: string[] };

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Contact fields a page saves to with data-cl-save (src/lib/studio/page.ts SAVE). */
const ROUTE_OP = new Set(["is", "is_not", "one_of", "not_one_of", "contains", "starts_with", "filled", "empty", "gt", "gte", "lt", "lte", "between"]);
const SAVE = new Set(["email", "first_name", "last_name", "name", "phone", "company", "title", "website", "country"]);

// Conditions -------------------------------------------------------------------------------------------------------
// A show-if is clauses joined with "and" (binding first) and "or", with no brackets, so every condition is kept as an
// OR of ANDs. Null means "can't be said in a show-if": the part shows always, and `lost` says so.

type Dnf = string[][];
const MAX_TERMS = 24;
const quote = (v: string) => (v.includes("'") ? `"${v.replace(/"/g, "'")}"` : `'${v}'`);
const and = (a: Dnf | null, b: Dnf | null): Dnf | null => {
  if (!a || !b) return null;
  const out: Dnf = [];
  for (const x of a) for (const y of b) out.push([...x, ...y]);
  return out.length > MAX_TERMS ? null : out;
};
const or = (a: Dnf | null, b: Dnf | null): Dnf | null => (!a || !b ? null : a.length + b.length > MAX_TERMS ? null : [...a, ...b]);
const NEG: Record<string, string> = { "==": "!=", "!=": "==", ">": "<=", ">=": "<", "<": ">=", "<=": ">" };

function negClause(c: string): Dnf | null {
  let m = /^([\w-]+)\s+(filled|empty)$/i.exec(c);
  if (m) return [[`${m[1]} ${m[2]!.toLowerCase() === "filled" ? "empty" : "filled"}`]];
  m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c);
  if (m) {
    const vals = [...m[2]!.matchAll(/'([^']*)'|"([^"]*)"/g)].map((y) => y[1] ?? y[2] ?? "");
    return [vals.map((v) => `${m![1]} != ${quote(v)}`)];
  }
  m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(c);
  return m ? [[`${m[1]} ${NEG[m[2]!]} ${m[3]}`]] : null;
}
/** Not (A or B): not A and not B, each "not (x and y)" being "not x or not y". */
function not(a: Dnf | null): Dnf | null {
  if (!a) return null;
  let out: Dnf | null = [[]];
  for (const conj of a) {
    let alt: Dnf | null = [];
    for (const c of conj) alt = or(alt, negClause(c));
    out = and(out, alt);
    if (!out) return null;
  }
  return out;
}
const text = (d: Dnf | null) => (d && d.length && d.every((x) => x.length) ? d.map((x) => x.join(" and ")).join(" or ") : "");

function condDnf(c: Cond, name: (id: string) => string | undefined): Dnf | null {
  const n = name(c.field);
  if (!n) return null;
  const v = c.value ?? "";
  switch (c.op) {
    case "is":
      return [[`${n} == ${quote(v)}`]];
    case "is_not":
      return [[`${n} != ${quote(v)}`]];
    case "filled":
      return [[`${n} filled`]];
    case "empty":
      return [[`${n} empty`]];
    case "gt":
      return [[`${n} > ${Number(v)}`]];
    case "gte":
      return [[`${n} >= ${Number(v)}`]];
    case "lt":
      return [[`${n} < ${Number(v)}`]];
    case "lte":
      return [[`${n} <= ${Number(v)}`]];
    case "between":
      return [[`${n} >= ${Number(v)}`, `${n} <= ${Number(c.value2 ?? v)}`]];
    case "any_of":
      return c.values?.length ? [[`${n} in (${c.values.map(quote).join(", ")})`]] : null;
    case "none_of":
      return c.values?.length ? [c.values.map((x) => `${n} != ${quote(x)}`)] : null;
    default:
      // Text matching (contains, starts with) and dates (before, after, within days) have no show-if words.
      return null;
  }
}
function ruleDnf(r: Rule, name: (id: string) => string | undefined): Dnf | null {
  const base = condDnf(r.when, name);
  if (!r.group?.when.length) return base;
  const parts = r.group.when.map((c) => condDnf(c, name));
  const g = r.group.logic === "all" ? parts.reduce<Dnf | null>((acc, p) => and(acc, p), [[]]) : parts.reduce<Dnf | null>((acc, p) => or(acc, p), []);
  return and(base, g);
}

// Fields -----------------------------------------------------------------------------------------------------------

/** A page name for each field: words from its label, unique, so Tia and formulas read it plainly. */
function names(form: Form): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const f of form.steps.flatMap((s) => s.fields)) {
    if (f.key && SAVE.has(f.key) && !taken.has(f.key)) {
      taken.add(f.key);
      out.set(f.id, f.key);
      continue;
    }
    const base =
      (f.label ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .split("_")
        .slice(0, 4)
        .join("_")
        .slice(0, 30) || f.id;
    let n = /^[a-z]/.test(base) ? base : `q_${base}`;
    for (let i = 2; taken.has(n); i++) n = `${base.slice(0, 27)}_${i}`;
    taken.add(n);
    out.set(f.id, n);
  }
  return out;
}

const listItems = (xs: { value: string; label: string }[] | undefined) => writeList((xs ?? []).map((o) => ({ value: o.value, label: o.label || o.value })));

function fieldHtml(f: Field, n: string, ifs: string, ctx: { name: (id: string) => string | undefined; lost: Set<string> }): string {
  const id = `q_${f.id}`;
  const show = ifs ? ` data-cl-show-if="${esc(ifs)}"` : "";
  const req = f.required ? " required" : "";
  const cid = ` data-cl-id="${f.id}"`;
  const save = f.key && SAVE.has(f.key) && n === f.key ? ` data-cl-save="${f.key}"` : "";
  const help = f.help ? `<p class="text help">${esc(f.help)}</p>` : "";
  const err = `<p class="error" data-cl-error-for="${n}"></p>`;
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  const label = `<label class="label" for="${id}">${esc(f.label)}</label>`;
  const block = (type: string, extra = "") => `<div class="q"${show}><div data-cl-field="${type}" data-cl-name="${n}" data-cl-label="${esc(f.label)}"${cid}${save}${f.required ? " data-cl-required" : ""}${extra} id="${id}"></div>${help}</div>`;
  const opts = f.options ?? [];
  const score = (o: { score?: number }) => (o.score !== undefined ? ` data-cl-score="${o.score}"` : "");
  if (f.key && f.key.startsWith("f.")) ctx.lost.add(`${f.label}: saves on the submission, not to a custom contact field`);
  if (f.prefill) ctx.lost.add(`${f.label}: no longer filled in from the link`);
  if (f.optionsBy) ctx.lost.add(`${f.label}: its list no longer follows an earlier answer`);
  switch (f.type) {
    case "heading":
      return `<h2 class="heading"${show}>${esc(f.content?.text)}</h2>`;
    case "paragraph":
      return `<p class="text"${show}>${esc(f.content?.text)}</p>`;
    case "divider":
      return `<hr${show}>`;
    case "image":
      ctx.lost.add("Pictures: a page shows only the brand's logo");
      return "";
    case "html": {
      const words = String(f.content?.html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return words ? `<p class="text"${show}>${esc(words)}</p>` : "";
    }
    case "text":
    case "email":
    case "url":
    case "number": {
      const t = f.type === "text" ? "text" : f.type;
      const mm = f.type === "number" && f.valid ? `${(f.valid as { min?: number }).min !== undefined ? ` min="${(f.valid as { min?: number }).min}"` : ""}${(f.valid as { max?: number }).max !== undefined ? ` max="${(f.valid as { max?: number }).max}"` : ""}` : "";
      const work = f.type === "email" && f.check === "work_email" ? ` data-cl-check="work_email"` : "";
      return `<div class="q"${show}>${label}${help}<input class="field" id="${id}" name="${n}" type="${t}"${ph}${mm}${req}${cid}${save}${work}>${err}</div>`;
    }
    case "textarea":
      return `<div class="q"${show}>${label}${help}<textarea class="field" id="${id}" name="${n}" rows="4"${ph}${req}${cid}></textarea>${err}</div>`;
    case "phone":
      return block("phone");
    case "date":
    case "time":
    case "daterange":
    case "address":
    case "signature":
    case "country":
      return block(f.type);
    case "rating":
      return block("rating", ` data-cl-scale="${f.rating?.scale ?? 5}" data-cl-style="${f.rating?.style ?? "stars"}"`);
    case "file":
      return block("file", ` data-cl-kinds="${(f.file?.kinds ?? ["pdf", "image", "office"]).join(" ")}" data-cl-max="${f.file?.maxMb ?? 10}"`);
    case "hidden": {
      const h = f.hidden ?? { from: "param" as const, name: n };
      return `<div data-cl-field="hidden" data-cl-name="${n}"${cid} data-cl-from="${h.from}"${h.name ? ` data-cl-param="${esc(h.name)}"` : ""}${h.value ? ` data-cl-value="${esc(h.value)}"` : ""}></div>`;
    }
    case "grid":
      return block("grid", ` data-cl-rows="${esc(listItems(f.grid?.rows))}" data-cl-cols="${esc(listItems(f.grid?.cols))}"`);
    case "ranking":
      return block("ranking", ` data-cl-options="${esc(listItems(opts))}"`);
    case "calc": {
      const formula = (f.calc?.formula ?? "").replace(/\{([a-z][a-z0-9]{0,23})\}/g, (m, x: string) => (ctx.name(x) ? `{${ctx.name(x)}}` : m));
      if (/\{@/.test(formula)) ctx.lost.add(`${f.label}: a setting it read is now a number in its formula`);
      const c = f.calc;
      return `<div class="q"${show}><div data-cl-field="calc" data-cl-name="${n}" data-cl-label="${esc(f.label)}"${cid} data-cl-formula="${esc(formula)}"${c?.format ? ` data-cl-format="${c.format}"` : ""}${c?.decimals !== undefined ? ` data-cl-decimals="${c.decimals}"` : ""}${c?.currency ? ` data-cl-currency="${c.currency}"` : ""}${c?.show === false ? " data-cl-hide" : ""} id="${id}"></div></div>`;
    }
    case "payment": {
      const p = f.pay;
      const from = p?.field ? ctx.name(p.field) : undefined;
      return `<div class="q"${show}><div data-cl-field="payment" data-cl-name="${n}" data-cl-label="${esc(f.label || "Total")}"${cid}${from ? ` data-cl-from="${from}"` : p?.amount ? ` data-cl-amount="${p.amount}"` : ""} data-cl-currency="${p?.currency ?? "USD"}" id="${id}"></div></div>`;
    }
    case "result": {
      const r = f.result;
      if (!r || r.kind === "email" || r.kind === "outcome") {
        if (r?.kind === "email") ctx.lost.add("Email my results: the results show on the page");
        return r?.kind === "outcome" ? `<div class="card"${show}><p class="text">${esc(f.label)}</p></div>` : "";
      }
      const of = (r.field ? [r.field] : (r.fields ?? [])).map((x) => ctx.name(x)).filter(Boolean).join(" ");
      return `<div class="q"${show}><div data-cl-field="result" data-cl-name="${n}" data-cl-label="${esc(f.label)}"${cid} data-cl-kind="${r.kind}" data-cl-of="${of}"${r.max ? ` data-cl-max="${r.max}"` : ""} id="${id}"></div></div>`;
    }
    case "choice":
    case "multi": {
      const t = f.type === "choice" ? "radio" : "checkbox";
      const items = opts.map((o, i) => `<label class="choice"><input type="${t}" name="${n}" value="${esc(o.value)}"${i === 0 ? `${req}${cid} data-cl-label="${esc(f.label)}"` : ""}${score(o)}> ${esc(o.label || o.value)}</label>`);
      const other = f.other ? `<label class="choice"><input type="${t}" name="${n}" value="Other"${score({})}> Other</label>` : "";
      const otherBox = f.other ? `<div class="q" data-cl-show-if="${n} == 'Other'"><label class="label" for="${id}_other">Tell us more</label><input class="field" id="${id}_other" name="${n}_other" type="text"></div>` : "";
      if (f.shuffle) ctx.lost.add(`${f.label}: choices show in the same order for everyone`);
      return `<fieldset class="q"${show}><legend class="label">${esc(f.label)}</legend>${help}<div class="choices">${items.join("")}${other}</div>${otherBox}${err}</fieldset>`;
    }
    case "dropdown":
      return `<div class="q"${show}>${label}${help}<select class="field" id="${id}" name="${n}"${req}${cid}><option value="">Choose one</option>${opts.map((o) => `<option value="${esc(o.value)}"${score(o)}>${esc(o.label || o.value)}</option>`).join("")}</select>${err}</div>`;
    case "checkbox":
      return `<div class="q"${show}><label class="check"><input type="checkbox" name="${n}" id="${id}"${req}${cid} data-cl-label="${esc(f.label)}"> ${esc(f.label)}</label>${help}${err}</div>`;
    case "group":
      ctx.lost.add(`${f.label}: its "add another" rows are one box to write in`);
      return `<div class="q"${show}>${label}${help}<textarea class="field" id="${id}" name="${n}" rows="4"${req}${cid}></textarea>${err}</div>`;
    default:
      return "";
  }
}

// The page ----------------------------------------------------------------------------------------------------------

/** The form's look, kept to layout: everything else comes from the brand's classes and variables. */
function pageCss(form: Form): string {
  const w = form.layout?.width === "wide" ? 720 : 600;
  return `.page{min-height:100%;padding-block:40px;padding-inline:16px;background:var(--brand-bg,#fff);box-sizing:border-box}
.form-card{max-width:${w}px;margin-inline:auto;display:flex;flex-direction:column;gap:22px}
.form-card>header{display:flex;flex-direction:column;gap:10px}
.logo{height:32px;width:auto;align-self:flex-start}
.q{display:flex;flex-direction:column;gap:6px;border:0;margin:0;padding:0;min-width:0}
.q legend{padding:0;margin-block-end:6px}
.choices{display:flex;flex-direction:column;gap:8px}
.help{margin:0;font-size:.9em;opacity:.75}
.error{margin:0;font-size:.9em;color:#b23a26}
.error:empty{display:none}
[data-cl-step]{display:flex;flex-direction:column;gap:22px}
.nav{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end}
.nav [data-cl-back]{margin-inline-end:auto}
.bar{height:4px;border-radius:2px;background:var(--brand-line,rgba(127,127,127,.25));overflow:hidden}
.bar i{display:block;height:100%;width:calc(var(--cl-progress,0) * 100%);background:var(--brand-primary,currentColor);transition:width .3s}
[data-cl-thanks]{display:flex;flex-direction:column;gap:12px}`;
}

/** The page for a form: one card, its pages as steps with Back and Next, and the thanks. */
export function formToPage(form: Form): Converted {
  const lost = new Set<string>();
  const nm = names(form);
  const name = (id: string) => nm.get(id);
  const fields = form.steps.flatMap((s) => s.fields);
  // Show-if per field from the rules: shown when any of its show rules holds (or all, with logic "all"), and none of
  // its hide rules does. A require rule can't be said on a page: the question stays optional.
  const ifFor = new Map<string, string>();
  for (const f of fields) {
    const rules = form.rules.filter((r) => r.then.field === f.id);
    if (!rules.length) continue;
    const shows = rules.filter((r) => r.then.action === "show").map((r) => ruleDnf(r, name));
    const hides = rules.filter((r) => r.then.action === "hide").map((r) => ruleDnf(r, name));
    if (rules.some((r) => r.then.action === "require")) lost.add(`${f.label}: required only by an answer, now optional`);
    let d: Dnf | null = [[]];
    if (shows.length) d = f.logic === "all" ? shows.reduce<Dnf | null>((acc, x) => and(acc, x), [[]]) : shows.reduce<Dnf | null>((acc, x) => or(acc, x), []);
    for (const h of hides) d = and(d, not(h));
    const t = text(d);
    if (t) ifFor.set(f.id, t);
    else if (shows.length || hides.length) lost.add(`${f.label}: shows always, its condition has no show-if words`);
  }
  // Pages that a skip or a path passes over show only when it doesn't hold.
  const stepIf = form.steps.map(() => [[]] as Dnf | null);
  const sendNow = form.steps.map(() => [] as Dnf);
  form.steps.forEach((s, i) => {
    const jumps = [...(s.skip ? [s.skip] : []), ...(s.jumps ?? [])];
    for (const j of jumps) {
      const d = condDnf(j.when, name);
      if (!d) {
        lost.add(`Page ${i + 1}: a skip on an answer with no show-if words`);
        continue;
      }
      const end = Math.min(j.to, form.steps.length);
      for (let k = i + 1; k < end; k++) stepIf[k] = and(stepIf[k]!, not(d));
      if (j.to >= form.steps.length) sendNow[i] = [...sendNow[i]!, ...d];
    }
  });
  const many = form.steps.length > 1;
  const submit = esc(form.submit?.label || "Submit");
  const stepHtml = (s: Step, i: number) => {
    const body = s.fields.map((f) => fieldHtml(f, nm.get(f.id) ?? f.id, ifFor.get(f.id) ?? "", { name, lost })).join("\n");
    if (!many) return `${body}\n<div class="nav"><button class="btn" type="submit">${submit}</button></div>`;
    const last = i === form.steps.length - 1;
    const now = text(sendNow[i]!.length ? sendNow[i]! : null);
    const buttons = [
      i > 0 ? `<button class="btn-secondary" type="button" data-cl-back>Back</button>` : "",
      last ? `<button class="btn" type="submit">${submit}</button>` : now ? `<button class="btn" type="button" data-cl-next data-cl-show-if="${esc(text(not(sendNow[i]!)))}">Next</button><button class="btn" type="submit" data-cl-show-if="${esc(now)}">${submit}</button>` : `<button class="btn" type="button" data-cl-next>Next</button>`,
    ].join("");
    const cond = text(stepIf[i]!);
    if (stepIf[i] === null) lost.add(`Page ${i + 1}: shows for everyone, its skip is too long for show-if words`);
    return `<section data-cl-step id="s${i}"${cond ? ` data-cl-show-if="${esc(cond)}"` : ""}>${s.title ? `<h2 class="heading">${esc(s.title)}</h2>` : ""}\n${body}\n<div class="nav">${buttons}</div></section>`;
  };
  const end = form.after?.end;
  const thanksText = end?.kind === "message" ? (end.text ?? "").split("\n").filter((x) => x.trim()).map((x) => `<p class="text">${esc(x)}</p>`).join("") : "";
  const sch = form.after?.schedule;
  const books = !!sch && ((sch.tool === "claritia" && !!sch.meetingTypeId) || (sch.tool !== "claritia" && !!sch.url));
  const thanks = `<section data-cl-thanks hidden id="thanks"><h2 class="heading">${esc(end?.kind === "message" ? end.title : "Thanks, we got it.")}</h2>${thanksText}${books ? `<div data-cl-book id="book"></div>` : ""}</section>`;
  const intro = form.intro ? `<p class="text">${esc(form.intro)}</p>` : "";
  const bar = many && form.layout?.progress !== "none" ? `<div class="bar" data-cl-progress aria-hidden="true"><i></i></div>` : "";
  const html = `<div class="page" id="page"><div class="form-card" id="card">
<header><img data-cl-logo alt="Brand logo" class="logo">${form.title ? `<h1 class="heading">${esc(form.title)}</h1>` : ""}${intro}${bar}</header>
<form id="form">
${form.steps.map(stepHtml).join("\n")}
</form>
${thanks}
</div></div>`;
  if (form.layout?.cover || form.layout?.side) lost.add("The cover picture: a page shows only the brand's logo");
  if (form.copy) lost.add("A copy of the answers emailed to the person");
  if ((form.constants ?? []).length) lost.add("Settings formulas read are now numbers in the formulas");
  return { html, css: pageCss(form), after: afterOf(form, name, lost), title: form.title ?? "", lost: [...lost] };
}

/** The booking or the page after the send, as the page's after-send. */
function afterOf(form: Form, name: (id: string) => string | undefined, lost: Set<string>): PageAfter {
  const end = form.after?.end;
  const sch = form.after?.schedule;
  if (sch?.tool && sch.tool !== "claritia" && sch.url) return { kind: "meeting", tool: sch.tool, link: sch.url };
  if (sch?.tool === "claritia" && sch.meetingTypeId) {
    const routes: StudioRoute[] = [];
    for (const r of (sch as { routes?: { meet?: string; conds?: Cond[] }[] }).routes ?? []) {
      const c = r.conds?.length === 1 ? r.conds[0]! : null;
      const n = c ? name(c.field) : undefined;
      // A route's ops are Routing's: any of and none of are its one of and not one of.
      const op = c ? (({ any_of: "one_of", none_of: "not_one_of" }) as Record<string, string>)[c.op] ?? c.op : "";
      if (!c || !n || !r.meet || !ROUTE_OP.has(op)) {
        lost.add("A meeting route Routing can't read from the page: set it again in On submission");
        continue;
      }
      routes.push({ field: n, op: op as StudioRoute["op"], ...(c.values?.length ? { value: c.values } : c.value !== undefined ? { value: c.value } : {}), meeting: r.meet });
    }
    return { kind: "meeting", meeting: sch.meetingTypeId, ...(routes.length ? { routes } : {}) };
  }
  if (end?.kind === "redirect") return { kind: "page", url: end.url };
  return { kind: "thanks" };
}
