// New form's AI steps (docs/forms.md Part 6). Four calls, each through the step cache in the route:
//   brief  the website, read into a short business brief (kept per site)
//   plan   one page or steps, with Claude's thinking shown as it goes, and the rough sketch
//   build  the whole form as a spec, checked by lintSpec; problems go back for one fix round
//   edit   small changes to the spec (an answer to a follow-up question, a line in the builder), all or none
// Claude answers in JSON that matches a schema. Code checks everything after: the layout rules, the spec checker, and
// edits that must apply cleanly. Nothing is made up as fact: prices and customer names come from the brief or not at all.

import type Anthropic from "@anthropic-ai/sdk";
import { CONTACT_KEYS } from "./schema.ts";
import { applyEdits, fitLayout, lintSpec, newSpecId, SPEC_OPS, SPEC_TYPES, type Edit, type FieldInput, type Spec, type SpecCond, type SpecField, type SpecOp, type SpecType, type When } from "./spec.ts";

export const BUILD_MODEL = "claude-sonnet-5-5";

export type Brief = { name: string; offer: string; audience: string; services: string[]; prices: string[]; proof: string[]; tone: string; images: string[] };

/** One model call with a JSON answer. Tests pass a fake; the route passes Claude. `onThinking` gets thinking as it streams. */
export type Caller = (p: {
  system: string;
  user: string;
  schema?: object;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  history?: Anthropic.Beta.BetaMessageParam[];
  onThinking?: (text: string) => void;
}) => Promise<{ text: string; thinking?: string; usage: Anthropic.Beta.BetaUsage } | null>;

// ── Reading the site ────────────────────────────────────────────────────────────────────────────────────────────

/** The words, pictures and inner links of one page, from its HTML. */
export function readPage(html: string, base: string): { title: string; text: string; images: string[]; links: string[] } {
  const title = /<title[^>]*>([^<]{0,200})/i.exec(html)?.[1]?.trim() ?? "";
  const meta = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,400})/i.exec(html)?.[1] ?? "";
  const og = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const abs = (u: string) => {
    try {
      const x = new URL(u, base);
      return x.protocol === "https:" ? x.href : null;
    } catch {
      return null;
    }
  };
  const images = [og, ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])]
    .map((u) => (u ? abs(u) : null))
    .filter((u): u is string => !!u && !/\.svg($|\?)|logo|icon|sprite|pixel|tracking|1x1/i.test(u));
  const host = new URL(base).hostname;
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => abs(m[1]!)).filter((u): u is string => !!u && new URL(u).hostname === host);
  return { title, text: `${meta} ${body}`.trim().slice(0, 8000), images: [...new Set(images)].slice(0, 12), links: [...new Set(links)] };
}

/** The pages worth reading after the home page: pricing, services, product, about, customers. */
export function pickPages(links: string[], max = 4): string[] {
  const rank = (u: string) => {
    const p = new URL(u).pathname.toLowerCase();
    if (p === "/" || p.length > 60) return 99;
    const order = [/pric|plan/, /service|solution|offer/, /product|feature|how/, /about|story|team/, /case|customer|review|testimonial/];
    const i = order.findIndex((re) => re.test(p));
    return i < 0 ? 99 : i;
  };
  return links
    .filter((u) => rank(u) < 99)
    .sort((a, b) => rank(a) - rank(b))
    .filter((u, i, all) => all.findIndex((x) => rank(x) === rank(u)) === i)
    .slice(0, max);
}

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    offer: { type: "string", description: "What they sell, one sentence." },
    audience: { type: "string", description: "Who buys it, one sentence." },
    services: { type: "array", items: { type: "string" }, description: "Up to 8 products, services or plans, as named on the site." },
    prices: { type: "array", items: { type: "string" }, description: "Prices exactly as the site states them. Empty when none." },
    proof: { type: "array", items: { type: "string" }, description: "Customer names, numbers and reviews the site states. Empty when none." },
    tone: { type: "string", description: "Their voice in a few words." },
    images: { type: "array", items: { type: "string" }, description: "Up to 4 of the given picture addresses that show the business best. Only addresses from the list." },
  },
  required: ["name", "offer", "audience", "services", "prices", "proof", "tone", "images"],
  additionalProperties: false,
};

export async function writeBrief(call: Caller, site: { url: string; pages: { url: string; title: string; text: string }[]; images: string[] }): Promise<Brief | null> {
  const user = `Site: ${site.url}\n\n${site.pages.map((p) => `# ${p.url}\n${p.title}\n${p.text.slice(0, 5000)}`).join("\n\n")}\n\nPictures:\n${site.images.join("\n") || "none"}`;
  const out = await call({
    system: "You read a company's website and write a short business brief for the AI that builds its web forms. Only facts the pages state; never guess prices, numbers or customers. Plain words.",
    user,
    schema: BRIEF_SCHEMA,
    effort: "low",
    maxTokens: 3000,
  });
  if (!out) return null;
  const b = parseJson(out.text) as Partial<Brief> | null;
  if (!b) return null;
  const ok = new Set(site.images);
  return {
    name: String(b.name ?? "").slice(0, 120),
    offer: String(b.offer ?? "").slice(0, 400),
    audience: String(b.audience ?? "").slice(0, 400),
    services: (b.services ?? []).map(String).slice(0, 8),
    prices: (b.prices ?? []).map(String).slice(0, 12),
    proof: (b.proof ?? []).map(String).slice(0, 8),
    tone: String(b.tone ?? "").slice(0, 200),
    images: (b.images ?? []).filter((u) => ok.has(u)).slice(0, 4),
  };
}

/** The first JSON object in a reply, or null. */
export function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

const briefText = (b: Brief | null, book?: unknown) =>
  b
    ? `Business: ${b.name}\nSells: ${b.offer}\nBuyers: ${b.audience}\nServices: ${b.services.join("; ") || "none listed"}\nPrices on the site: ${b.prices.join("; ") || "none"}\nProof on the site: ${b.proof.join("; ") || "none"}\nVoice: ${b.tone}\nPictures from the site: ${b.images.join(" ") || "none"}${book ? `\nBrand book: ${JSON.stringify(book).slice(0, 2000)}` : ""}`
    : "No website was read.";

// ── Plan: one page or steps ─────────────────────────────────────────────────────────────────────────────────────

export type Plan = { name: string; layout: "page" | "steps"; why: string; steps: { title: string; items: string[] }[]; needsEmail: boolean; changed?: string };

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "The form's name, 2 to 5 words." },
    layout: { type: "string", enum: ["page", "steps"] },
    why: { type: "string", description: "One short sentence on why this layout fits." },
    steps: {
      type: "array",
      description: "The rough sketch. One entry for a one-page form.",
      items: { type: "object", properties: { title: { type: "string" }, items: { type: "array", items: { type: "string" }, description: "Each question in 2 to 5 words." } }, required: ["title", "items"], additionalProperties: false },
    },
    needs_email: { type: "boolean", description: "False only for anonymous polls, surveys and internal forms." },
  },
  required: ["name", "layout", "why", "steps", "needs_email"],
  additionalProperties: false,
};

const PLAN_SYSTEM = `You plan web forms for a marketing platform. Read the business brief and what the owner wants, think about the best layout, then answer in JSON.

Best practices for the layout:
- One page when the form is short: 5 questions or fewer and no branching.
- Steps when there are more than 7 questions, when answers change what comes next, or when questions qualify a lead before asking for contact details.
- In steps: easy questions first, contact details last, 3 to 5 questions a step, 2 to 5 steps, a short title on each.
- Ask only what the business will use. Fewer questions get more answers.
- A file upload only when the form needs a file (a resume, a photo, a brief, an ID).
Plain words. Never invent prices, customers or facts that aren't in the brief.`;

/** The layout rules, checked in code on Claude's plan (the same ones fitLayout runs on the built form). */
export function checkPlan(p: Plan): Plan {
  const n = p.steps.reduce((a, s) => a + s.items.length, 0);
  if (p.layout === "page" && n > 8) {
    const items = p.steps.flatMap((s) => s.items);
    const steps = Array.from({ length: Math.ceil(items.length / 4) }, (_, i) => ({ title: `Step ${i + 1}`, items: items.slice(i * 4, i * 4 + 4) }));
    return { ...p, layout: "steps", steps, changed: `${n} questions are too many for one page, so it's in steps.` };
  }
  if (p.layout === "steps" && n <= 4) return { ...p, layout: "page", steps: [{ title: p.steps[0]?.title || p.name, items: p.steps.flatMap((s) => s.items) }], changed: `${n} questions fit on one page.` };
  if (p.layout === "page" && p.steps.length > 1) return { ...p, steps: [{ title: p.steps[0]!.title, items: p.steps.flatMap((s) => s.items) }] };
  return p;
}

export async function planForm(call: Caller, input: { brief: Brief | null; note: string; book?: unknown }, onThinking?: (t: string) => void): Promise<{ plan: Plan; thinking: string } | null> {
  const out = await call({
    system: PLAN_SYSTEM,
    user: `${briefText(input.brief, input.book)}\n\nThe owner wants: ${input.note}`,
    schema: PLAN_SCHEMA,
    effort: "medium",
    maxTokens: 16000,
    onThinking,
  });
  if (!out) return null;
  const r = parseJson(out.text) as { name?: string; layout?: string; why?: string; steps?: { title?: string; items?: string[] }[]; needs_email?: boolean } | null;
  if (!r || !Array.isArray(r.steps) || !r.steps.length) return null;
  const plan: Plan = {
    name: String(r.name ?? "").trim().slice(0, 120) || "New form",
    layout: r.layout === "steps" ? "steps" : "page",
    why: String(r.why ?? "").trim().slice(0, 300),
    steps: r.steps.slice(0, 10).map((s) => ({ title: String(s.title ?? "").slice(0, 120), items: (s.items ?? []).map(String).slice(0, 15) })),
    needsEmail: r.needs_email !== false,
  };
  return { plan: checkPlan(plan), thinking: out.thinking ?? "" };
}

// ── Build: the whole form ───────────────────────────────────────────────────────────────────────────────────────

export type FollowUp = { id: string; question: string; kind: "choice" | "multi" | "text"; options: string[] };
export type Thanks = { title: string; text: string };
export type Built = { name: string; spec: Spec; thanks: Thanks; questions: FollowUp[]; changed: string | null; rounds: number };

const AI_TYPES = SPEC_TYPES.map((t) => t.value);
const SAVES = ["", ...CONTACT_KEYS.map((c) => c.key)];
const COND_SCHEMA = {
  type: "object",
  properties: {
    field: { type: "string", description: "The id of an earlier question. Empty for none." },
    op: { type: "string", enum: SPEC_OPS },
    value: { type: "string", description: "For is, is_not, contains, not_contains, gt, lt. An option's value for list questions." },
    values: { type: "array", items: { type: "string" }, description: "For any_of and none_of: option values." },
  },
  required: ["field", "op", "value", "values"],
  additionalProperties: false,
};
const FIELD_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", description: "Short, lowercase letters and digits only, unique in the form." },
    type: { type: "string", enum: AI_TYPES },
    label: { type: "string", description: "The question, short. For heading and paragraph: the text shown." },
    saves_as: { type: "string", enum: SAVES, description: "The contact field it fills, or empty to keep the answer on the submission." },
    required: { type: "boolean" },
    placeholder: { type: "string" },
    help: { type: "string", description: "Empty unless the question truly needs a hint." },
    options: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" }, image: { type: "string", description: "https picture address from the brief, or empty." } }, required: ["value", "label", "image"], additionalProperties: false } },
    file_kinds: { type: "array", items: { type: "string", enum: ["pdf", "image", "office"] } },
    max_mb: { type: "integer", description: "File upload: 1 to 20. 0 otherwise." },
    scale: { type: "integer", description: "Rating: 5 (stars) or 10 (0 to 10). 0 otherwise." },
    show: { type: "object", description: "Show this question only when the conditions hold. Empty conds: always shows.", properties: { match: { type: "string", enum: ["all", "any"] }, conds: { type: "array", items: COND_SCHEMA } }, required: ["match", "conds"], additionalProperties: false },
  },
  required: ["id", "type", "label", "saves_as", "required", "placeholder", "help", "options", "file_kinds", "max_mb", "scale", "show"],
  additionalProperties: false,
};
const STEP_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    show: { ...COND_SCHEMA, description: "Show this step only when the condition holds. Field empty: always shows." },
    fields: { type: "array", items: FIELD_SCHEMA },
  },
  required: ["id", "title", "show", "fields"],
  additionalProperties: false,
};
const BUILD_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    title: { type: "string", description: "The heading over the form." },
    intro: { type: "string", description: "One short line under the heading, or empty." },
    submit: { type: "string", description: "The button's words, 1 to 4 words." },
    steps: { type: "array", items: STEP_SCHEMA },
    thanks: { type: "object", properties: { title: { type: "string" }, text: { type: "string" } }, required: ["title", "text"], additionalProperties: false },
    questions: {
      type: "array",
      description: "0 to 3 questions for the owner, about choices that change the form. Not about wording.",
      items: { type: "object", properties: { id: { type: "string" }, question: { type: "string" }, kind: { type: "string", enum: ["choice", "multi", "text"] }, options: { type: "array", items: { type: "string" } } }, required: ["id", "question", "kind", "options"], additionalProperties: false },
    },
  },
  required: ["name", "title", "intro", "submit", "steps", "thanks", "questions"],
  additionalProperties: false,
};

const FORMAT = `The form format:
- Question types: text, longtext, email, phone, number, url, date, country, radio (pick one), checkboxes (pick many), dropdown (long lists), pictures (pick one, each option with an https picture from the brief), yesno, rating (scale 5 or 10), file (file_kinds and max_mb), checkbox (one tick box, like agreeing to terms), hidden (not shown), heading and paragraph (text on the form, not questions).
- saves_as puts the answer on the contact: email, first_name, last_name, name, phone, company, title, website, country, region. Each at most once. Every other answer stays on the submission (saves_as empty).
- Logic: a question's show holds conditions on earlier questions (match all or any). A step's show is one condition on a question from an earlier step, using is, is_not, any_of, none_of, filled, empty, contains or not_contains. Two steps in a row can't both have a condition. The first step always shows.
- Conditions on list questions use the option values. gt and lt compare numbers.
- Ids: lowercase letters and digits, unique across steps and questions.`;

const BUILD_SYSTEM = `You build web forms for a marketing platform. Answer with the whole form in JSON.

${FORMAT}

How to build it:
- Follow the plan's layout and sketch.
- Use the type that fits each question: radio for 2 to 6 options, dropdown for more, checkboxes when several can apply, yesno for yes or no, rating for scores.
- Add logic where an answer changes what's worth asking. Don't add logic for its own sake.
- A file upload only when the form needs a file.
- Required only for what the business can't do without. Email is required when the form takes leads.
- Contact details last. Labels short, in the business's voice. No help text unless needed.
- The thank-you says what happens next, in one short line.
- Never invent prices, customers, numbers or claims that aren't in the brief.`;

const ID_RE = /^[a-z0-9]{1,24}$/;

/** Claude's form JSON as a spec: ids made safe (and the conditions that use them renamed), empty extras dropped. */
export function specFromAi(raw: unknown): { name: string; spec: Spec; thanks: Thanks; questions: FollowUp[] } | null {
  const r = raw as {
    name?: string;
    title?: string;
    intro?: string;
    submit?: string;
    steps?: { id?: string; title?: string; show?: AiCond; fields?: AiField[] }[];
    thanks?: Thanks;
    questions?: FollowUp[];
  } | null;
  if (!r || !Array.isArray(r.steps) || !r.steps.length) return null;
  const ren = new Map<string, string>();
  const used = new Set<string>();
  const safe = (want: unknown): string => {
    const base = String(want ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 24);
    let id = ID_RE.test(base) && !used.has(base) ? base : newSpecId();
    while (used.has(id)) id = newSpecId();
    used.add(id);
    if (typeof want === "string" && !ren.has(want)) ren.set(want, id);
    return id;
  };
  const steps = r.steps.slice(0, 10).map((st) => ({ st, id: safe(st.id), fields: (st.fields ?? []).slice(0, 40).map((f) => ({ f, id: safe(f.id) })) }));
  const cond = (c: AiCond | undefined): SpecCond | undefined => {
    if (!c || !c.field || !SPEC_OPS.includes(c.op as SpecOp)) return undefined;
    const field = ren.get(c.field) ?? c.field;
    const op = c.op as SpecOp;
    if (op === "any_of" || op === "none_of") return { field, op, values: (c.values ?? []).map(String) };
    if (op === "filled" || op === "empty") return { field, op };
    return { field, op, value: String(c.value ?? "") };
  };
  const spec: Spec = {
    ...(r.title?.trim() ? { title: r.title.trim().slice(0, 300) } : {}),
    ...(r.intro?.trim() ? { intro: r.intro.trim().slice(0, 1000) } : {}),
    submit: (r.submit ?? "").trim().slice(0, 60) || "Submit",
    steps: steps.map(({ st, id, fields }) => {
      const show = cond(st.show);
      return {
        id,
        ...(st.title?.trim() ? { title: st.title.trim().slice(0, 300) } : {}),
        ...(show ? { show } : {}),
        fields: fields.map(({ f, id }) => fieldFromAi(f, id, cond)).filter((x): x is SpecField => !!x),
      };
    }),
  };
  return {
    name: String(r.name ?? "").trim().slice(0, 120) || spec.title || "New form",
    spec,
    thanks: { title: String(r.thanks?.title ?? "").trim().slice(0, 300) || "Thanks, we got it.", text: String(r.thanks?.text ?? "").trim().slice(0, 1000) },
    questions: (r.questions ?? [])
      .slice(0, 3)
      .map((q, i) => ({ id: String(q.id || `q${i + 1}`).slice(0, 40), question: String(q.question ?? "").slice(0, 300), kind: q.kind === "multi" || q.kind === "text" ? q.kind : ("choice" as const), options: (q.options ?? []).map(String).slice(0, 6) }))
      .filter((q) => q.question && (q.kind === "text" || q.options.length >= 2)),
  };
}

type AiCond = { field?: string; op?: string; value?: string; values?: string[] };
type AiField = { id?: string; type?: string; label?: string; saves_as?: string; required?: boolean; placeholder?: string; help?: string; options?: { value?: string; label?: string; image?: string }[]; file_kinds?: string[]; max_mb?: number; scale?: number; show?: { match?: string; conds?: AiCond[] } };

function fieldFromAi(f: AiField, id: string, cond: (c: AiCond | undefined) => SpecCond | undefined): SpecField | null {
  if (!AI_TYPES.includes(f.type as Exclude<SpecType, "locked">)) return null;
  const type = f.type as SpecType;
  const out: SpecField = { id, type, label: String(f.label ?? "").trim() };
  if (f.saves_as && CONTACT_KEYS.some((c) => c.key === f.saves_as)) out.key = f.saves_as;
  if (f.required === true && type !== "heading" && type !== "paragraph" && type !== "hidden") out.required = true;
  if (f.placeholder?.trim()) out.placeholder = f.placeholder.trim().slice(0, 300);
  if (f.help?.trim()) out.help = f.help.trim().slice(0, 300);
  if (type === "radio" || type === "checkboxes" || type === "dropdown" || type === "pictures") {
    const seen = new Set<string>();
    out.options = (f.options ?? [])
      .map((o) => {
        const label = String(o.label ?? o.value ?? "").trim().slice(0, 200);
        const value = String(o.value ?? "").trim().slice(0, 200) || label;
        return { value, label: label || value, ...(o.image && /^https:\/\/[^\s"'<>]+$/.test(o.image) ? { image: o.image } : {}) };
      })
      .filter((o) => o.value && !seen.has(o.value) && (seen.add(o.value), true));
  }
  if (type === "file") out.files = { kinds: [...new Set((f.file_kinds ?? []).filter((k): k is "pdf" | "image" | "office" => k === "pdf" || k === "image" || k === "office"))], maxMb: Math.min(20, Math.max(1, Math.round(Number(f.max_mb) || 10))) };
  if (type === "file" && !out.files!.kinds.length) out.files!.kinds = ["pdf", "image", "office"];
  if (type === "rating") out.scale = Number(f.scale) === 10 ? 10 : 5;
  const conds = (f.show?.conds ?? []).map(cond).filter((c): c is SpecCond => !!c);
  if (conds.length) out.show = { match: f.show?.match === "all" ? "all" : "any", conds } satisfies When;
  return out;
}

const problemsText = (spec: Spec, needEmail: boolean) =>
  lintSpec(spec, { needEmail })
    .map((p) => `- ${p.text}`)
    .join("\n");

/**
 * Build the whole form: Claude writes it, the checker reads it, and its problems go back once for a fix. The layout
 * rules run last. Returns only a spec the checker passes, or null.
 */
export async function buildForm(call: Caller, input: { brief: Brief | null; note: string; plan: Plan; book?: unknown }): Promise<Built | null> {
  const user = `${briefText(input.brief, input.book)}\n\nThe owner wants: ${input.note}\n\nThe plan: ${input.plan.layout === "steps" ? "steps" : "one page"}. ${input.plan.why}\n${input.plan.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.items.join(", ")}`).join("\n")}\n${input.plan.needsEmail ? "It takes leads, so it needs an email question saved as email." : "It doesn't need an email."}`;
  const first = await call({ system: BUILD_SYSTEM, user, schema: BUILD_SCHEMA, effort: "medium", maxTokens: 32000 });
  if (!first) return null;
  let got = specFromAi(parseJson(first.text));
  let rounds = 1;
  const issues = got ? problemsText(got.spec, input.plan.needsEmail) : "The answer wasn't a form in the format.";
  if (!got || issues) {
    // One fix round, with the checker's words.
    const fix = await call({
      system: BUILD_SYSTEM,
      user,
      schema: BUILD_SCHEMA,
      effort: "medium",
      maxTokens: 32000,
      history: [
        { role: "user", content: user },
        { role: "assistant", content: first.text },
        { role: "user", content: `The form has problems. Fix them and answer with the whole form again.\n${issues}` },
      ],
    });
    rounds = 2;
    got = fix ? specFromAi(parseJson(fix.text)) : null;
    if (!got || problemsText(got.spec, input.plan.needsEmail)) return null;
  }
  const fitted = fitLayout(got.spec);
  return { name: got.name, spec: fitted.spec, thanks: got.thanks, questions: got.questions, changed: fitted.changed, rounds };
}

// ── Edit: small changes ─────────────────────────────────────────────────────────────────────────────────────────

const EDIT_SCHEMA = {
  type: "object",
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add_field", "replace_field", "remove_field", "move_field", "add_step", "update_step", "remove_step", "set_form"] },
          id: { type: "string", description: "The question or step it changes." },
          step: { type: "string", description: "add_field and move_field: the step's id." },
          after: { type: "string", description: "add_field: the question to add after, or empty for the end. add_step: the step to add after." },
          index: { type: "integer", description: "move_field: the place in the step, from 0." },
          title: { type: "string", description: "add_step, update_step and set_form." },
          intro: { type: "string", description: "set_form only." },
          submit: { type: "string", description: "set_form only: the button's words." },
          field: { ...FIELD_SCHEMA, description: "add_field and replace_field: the whole question." },
          show: { ...COND_SCHEMA, description: "update_step: the step's condition. Field empty: always shows." },
        },
        required: ["op", "id", "step", "after", "index", "title", "intro", "submit", "field", "show"],
        additionalProperties: false,
      },
    },
    reply: { type: "string", description: "What changed, in a few words. Or why nothing could." },
  },
  required: ["edits", "reply"],
  additionalProperties: false,
};

const EDIT_SYSTEM = `You change a web form a little at a time. You get the form as JSON and what the owner wants. Answer with the smallest list of edits that does it. Keep everything else exactly as it is. Fields you don't name don't change.

${FORMAT}

Edits:
- add_field: step, after (or empty), field.
- replace_field: id, field (the whole question as it should be, with the same id).
- remove_field: id.
- move_field: id, step, index.
- add_step: after, title. Then add_field to put questions on it (use the id you give it in "id").
- update_step: id, title, show.
- remove_step: id (its questions join the step before).
- set_form: title, intro, submit (empty strings for parts that stay).
Unused properties: empty strings, 0 and empty lists. When nothing needs to change, answer with no edits and say why.`;

/** Claude's edits as spec edits. */
export function editsFromAi(raw: unknown, spec: Spec): { edits: Edit[]; reply: string } | null {
  const r = raw as { edits?: AiEdit[]; reply?: string } | null;
  if (!r || !Array.isArray(r.edits)) return null;
  const condOf = (c: AiCond | undefined): SpecCond | undefined => {
    if (!c?.field || !SPEC_OPS.includes(c.op as SpecOp)) return undefined;
    const op = c.op as SpecOp;
    if (op === "any_of" || op === "none_of") return { field: c.field, op, values: (c.values ?? []).map(String) };
    if (op === "filled" || op === "empty") return { field: c.field, op };
    return { field: c.field, op, value: String(c.value ?? "") };
  };
  const edits: Edit[] = [];
  for (const e of r.edits.slice(0, 30)) {
    const field = e.field ? fieldFromAi(e.field, String(e.field.id ?? e.id ?? ""), condOf) : null;
    const input = (f: SpecField): FieldInput => {
      const { id: _id, raw: _raw, ...rest } = f;
      void _id;
      void _raw;
      return rest;
    };
    switch (e.op) {
      case "add_field":
        if (!field) return null;
        edits.push({ op: "add_field", step: String(e.step ?? ""), ...(e.after ? { after: e.after } : {}), field: { ...input(field), ...(e.field?.id ? { id: String(e.field.id) } : {}) } });
        break;
      case "replace_field": {
        if (!field) return null;
        const cur = spec.steps.flatMap((s) => s.fields).find((f) => f.id === e.id);
        // A question that saved somewhere keeps saving there unless Claude names another place.
        const set: Partial<Omit<FieldInput, "show">> & { show?: When | null } = { ...input(field), show: field.show ?? null };
        if (!field.key && cur?.key) set.key = cur.key;
        edits.push({ op: "update_field", id: String(e.id ?? ""), set });
        break;
      }
      case "remove_field":
        edits.push({ op: "remove_field", id: String(e.id ?? "") });
        break;
      case "move_field":
        edits.push({ op: "move_field", id: String(e.id ?? ""), step: String(e.step ?? ""), index: Math.max(0, Math.round(Number(e.index) || 0)) });
        break;
      case "add_step":
        edits.push({ op: "add_step", ...(e.after ? { after: e.after } : {}), ...(e.title ? { title: e.title } : {}), ...(e.id ? { id: e.id } : {}) });
        break;
      case "update_step":
        edits.push({ op: "update_step", id: String(e.id ?? ""), ...(e.title ? { title: e.title } : {}), show: condOf(e.show) ?? null });
        break;
      case "remove_step":
        edits.push({ op: "remove_step", id: String(e.id ?? "") });
        break;
      case "set_form":
        edits.push({ op: "set_form", ...(e.title ? { title: e.title } : {}), ...(e.intro ? { intro: e.intro } : {}), ...(e.submit ? { submit: e.submit } : {}) });
        break;
      default:
        return null;
    }
  }
  return { edits, reply: String(r.reply ?? "").slice(0, 300) };
}

type AiEdit = { op?: string; id?: string; step?: string; after?: string; index?: number; title?: string; intro?: string; submit?: string; field?: AiField; show?: AiCond };

/** The spec as Claude reads it: ids, types, labels and logic, nothing it doesn't need. */
export function specForAi(s: Spec): unknown {
  return {
    title: s.title ?? "",
    intro: s.intro ?? "",
    submit: s.submit,
    steps: s.steps.map((st) => ({
      id: st.id,
      title: st.title ?? "",
      ...(st.show ? { show: st.show } : {}),
      fields: st.fields.map((f) =>
        f.type === "locked"
          ? { id: f.id, type: "locked", label: f.label, note: "Can't be changed here; leave it." }
          : { id: f.id, type: f.type, label: f.label, ...(f.key ? { saves_as: f.key } : {}), ...(f.required ? { required: true } : {}), ...(f.options ? { options: f.options } : {}), ...(f.files ? { file_kinds: f.files.kinds, max_mb: f.files.maxMb } : {}), ...(f.scale ? { scale: f.scale } : {}), ...(f.show ? { show: f.show } : {}) },
      ),
    })),
  };
}

export type Edited = { spec: Spec; reply: string; changed: number };

/**
 * Change the spec from plain words. The edits apply all or none; when they don't, the problem goes back once. Returns
 * the new spec, or the reason nothing changed.
 */
export async function editForm(call: Caller, input: { spec: Spec; ask: string; brief?: Brief | null; needEmail: boolean }): Promise<Edited | { error: string }> {
  const user = `${input.brief ? `${briefText(input.brief)}\n\n` : ""}The form:\n${JSON.stringify(specForAi(input.spec))}\n\nThe owner wants: ${input.ask}`;
  const first = await call({ system: EDIT_SYSTEM, user, schema: EDIT_SCHEMA, effort: "low", maxTokens: 16000 });
  if (!first) return { error: "Couldn't make that change. Try saying it another way." };
  const tryApply = (text: string): Edited | { error: string } => {
    const got = editsFromAi(parseJson(text), input.spec);
    if (!got) return { error: "The answer couldn't be read." };
    if (!got.edits.length) return { spec: input.spec, reply: got.reply, changed: 0 };
    const r = applyEdits(input.spec, got.edits, { needEmail: input.needEmail });
    return "error" in r ? r : { spec: r.spec, reply: got.reply, changed: got.edits.length };
  };
  const once = tryApply(first.text);
  if (!("error" in once)) return once;
  const again = await call({
    system: EDIT_SYSTEM,
    user,
    schema: EDIT_SCHEMA,
    effort: "low",
    maxTokens: 16000,
    history: [
      { role: "user", content: user },
      { role: "assistant", content: first.text },
      { role: "user", content: `Those edits didn't apply: ${once.error} Answer with edits that do.` },
    ],
  });
  if (!again) return once;
  return tryApply(again.text);
}
