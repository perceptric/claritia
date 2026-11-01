// The AI form builder (docs/ai-form-builder.md). No templates: Claude reads the customer's website into a business
// brief, asks a few questions written for that business and goal, then builds the whole form: HTML sections for the
// hero and proof, native questions (picture cards, sliders, numbers) and, when the goal needs one, settings,
// calculations, result screens and outcomes. The draft goes through checkForm; problems go back to Claude, up to
// twice, so only a form that passes the checker is ever saved. Prices, quotes and numbers that aren't on the site are
// left blank or listed under "Replace before publishing", never made up as facts.

import type Anthropic from "@anthropic-ai/sdk";
import { checkForm, emptyForm, unsetConstants, type Form } from "./schema.ts";

export const BUILD_MODEL = "claude-sonnet-5-5";

export type Goal = "quote" | "assess" | "recommend" | "quiz" | "book" | "leads";
export const GOALS: { value: Goal; label: string; text: string }[] = [
  { value: "quote", label: "Give a price", text: "A quote or cost calculator" },
  { value: "assess", label: "Score or assess", text: "A score with a level and next steps" },
  { value: "recommend", label: "Recommend", text: "The plan, product or service that fits" },
  { value: "quiz", label: "Quiz", text: "Questions with right answers" },
  { value: "book", label: "Book a meeting", text: "The right meeting with the right person" },
  { value: "leads", label: "Capture leads", text: "Contact, demo or signup" },
];

export type Brief = {
  name: string;
  offer: string;
  audience: string;
  services: string[];
  prices: string[];
  proof: string[];
  tone: string;
  images: string[];
};
export type AskQuestion = { id: string; question: string; kind: "choice" | "multi" | "text"; options: string[] };
export type BuildSummary = { built: string[]; assumptions: string[]; replace: string[] };

/** One model call with a JSON answer. Tests pass a fake; the route passes Claude. */
export type Caller = (p: { system: string; user: string; schema?: object; effort: "low" | "medium"; maxTokens: number; history?: Anthropic.Beta.BetaMessageParam[] }) => Promise<{ text: string; usage: Anthropic.Beta.BetaUsage } | null>;

// Reading the site --------------------------------------------------------------------------------------------------

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
  const links = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
    .map((m) => abs(m[1]!))
    .filter((u): u is string => !!u && new URL(u).hostname === host);
  return { title, text: `${meta} ${body}`.trim().slice(0, 8000), images: [...new Set(images)].slice(0, 12), links: [...new Set(links)] };
}

/** The pages worth reading after the home page: pricing, services, product, about. */
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
    prices: { type: "array", items: { type: "string" }, description: "Prices exactly as the site states them, with what they're for. Empty when the site shows none." },
    proof: { type: "array", items: { type: "string" }, description: "Customer names, numbers, reviews and awards the site states. Empty when none." },
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
  const b = JSON.parse(out.text) as Brief;
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

// Questions for the person building it -------------------------------------------------------------------------------

const ASK_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, question: { type: "string" }, kind: { type: "string", enum: ["choice", "multi", "text"] }, options: { type: "array", items: { type: "string" } } },
        required: ["id", "question", "kind", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

/** The questions when the model isn't there: still useful, never blocking. */
export function defaultQuestions(goal: Goal): AskQuestion[] {
  const who: AskQuestion = { id: "audience", question: "Who will fill it in?", kind: "choice", options: ["New customers", "Existing customers", "Both"] };
  const next: AskQuestion = { id: "next", question: "What should happen at the end?", kind: "choice", options: ["Book a call", "Email them the result", "Show a thank-you"] };
  const by: Record<Goal, AskQuestion> = {
    quote: { id: "price", question: "What drives the price?", kind: "text", options: [] },
    assess: { id: "levels", question: "What should the score measure?", kind: "text", options: [] },
    recommend: { id: "options", question: "What can it recommend?", kind: "text", options: [] },
    quiz: { id: "topic", question: "What is the quiz about?", kind: "text", options: [] },
    book: { id: "meetings", question: "Which meetings can they book?", kind: "text", options: [] },
    leads: { id: "need", question: "What do you need to know about each lead?", kind: "text", options: [] },
  };
  return [by[goal], who, next];
}

export async function askQuestions(call: Caller, brief: Brief | null, goal: Goal, note: string): Promise<AskQuestion[]> {
  const out = await call({
    system:
      "You help a business owner set up an interactive web form. From their brief and goal, ask 3 to 5 short questions whose answers you need to build it well: what drives the price or score, which options to compare, who fills it in, what happens at the end. Never ask what the brief already says. Offer choices (2 to 6, short) when the answers are a known list; use text otherwise. Plain words, no jargon.",
    user: JSON.stringify({ goal: GOALS.find((g) => g.value === goal)?.text, note, brief }),
    schema: ASK_SCHEMA,
    effort: "low",
    maxTokens: 2000,
  }).catch(() => null);
  if (!out) return defaultQuestions(goal);
  const qs = (JSON.parse(out.text) as { questions: AskQuestion[] }).questions ?? [];
  const clean = qs
    .filter((q) => q && typeof q.question === "string" && q.question.trim())
    .slice(0, 5)
    .map((q, i) => ({ id: /^[a-z0-9_]{1,24}$/.test(q.id) ? q.id : `q${i + 1}`, question: q.question.slice(0, 200), kind: q.kind === "multi" || q.kind === "text" ? q.kind : "choice", options: (q.options ?? []).map(String).slice(0, 6) }) as AskQuestion)
    .map((q) => (q.kind !== "text" && q.options.length < 2 ? { ...q, kind: "text" as const, options: [] } : q));
  return clean.length ? clean : defaultQuestions(goal);
}

// Building the form --------------------------------------------------------------------------------------------------

export const BUILD_SYSTEM = `You build an interactive web form for a business, as JSON in Claritia's form format. Answer with one JSON object {"name", "form", "summary"} and nothing else.

THE FORMAT
form = { steps, rules: [], layout, submit: {label}, consent: {mode: "by_region", label}, spam: {minSeconds: 2, turnstile: false}, after: {end: {kind: "message", title, text?}}, constants?, results? }
layout = {labels: "above", width: "wide", mode: "screens", auto: true, cover?: {title, text?, button?}}
step = {id, title?, fields: [field], result?: true}   (ids: 1 to 24 lowercase letters or digits)
field = {id, key, type, label, required, ...}
- keys: "email", "name", "first_name", "last_name", "phone", "company", "website", "title", "country" for contact details; "q.<snake_case>" for answers; "c.<id>" for sections and results.
- types: text, email, phone, textarea, number, choice, multi, dropdown, checkbox, date, url, rating, calc, html, result, heading, paragraph.
- choice and multi: options [{value, label, score?, image?}], cards: true for picture cards. value is snake_case. score is the number formulas read.
- number: valid {min, max, step}; slider: true needs min and max; unit: "money" | "percent".
- calc: calc {formula, format?: "money"|"percent", decimals?, show?: false}. A formula reads fields as {id} and settings as {@id}: + - * / ( ), comparisons, and, or, min, max, sum, round, ceil, floor, abs, if(c,a,b), ifempty(a,b). An empty answer stays empty; divide by zero is empty.
- html: content {html} - a full-width section: section, div, h1-h4, p, span, strong, em, ul, ol, li, blockquote, figure, img (https src from the brief only), a. Inline style with layout, spacing, type and color only (no url(), no position). No scripts, buttons or inputs.
  Colors, fonts and corners come from the customer's brand kit, so never write a hex color or a font name in a section. Use these instead: var(--clr-text), var(--clr-muted), var(--clr-bg), var(--clr-accent), var(--clr-btn-bg), var(--clr-btn-text), var(--clr-border), var(--clr-font), var(--clr-heading-font), var(--clr-radius). For a tinted band use color-mix(in srgb, var(--clr-accent) 8%, var(--clr-bg)).
- result: result {kind: "metric"|"meter"|"summary"|"bars"|"outcome"|"email", field?, fields?, max?} on a step with result: true, which holds only result, html, heading, paragraph and calc fields.
constants = [{id, name, value: number|null, format?: "money"|"percent", private?: true}]
results = {show: "instant"|"after_contact", outcomes: [{id, title, text?, when?: {logic: "all"|"any", conds: [{field, op, value?, value2?, values?}]}}]} - first match wins; the LAST outcome has no when (everyone else). ops: is, is_not, filled, empty, gt, gte, lt, lte, between (value, value2), any_of (values).
There must be exactly one field with key "email", and every step except result steps needs at least one question.

HOW TO BUILD IT WELL
- Start with a cover (layout.cover) or a first-step html hero tailored to this business: its offer, its audience, its words, and one picture from the brief when there is one.
- Ask only what changes the result. One idea per step. Use picture cards (cards: true) for short visual choices such as goals, types or categories, sliders for ranges, numbers for counts. Keep long lists and ordered scales as plain choices.
- For a price, score, recommendation or quiz: settings for every rate or price, calculations that read the answers, a result step with result blocks and an outcome block, and outcomes that say something specific and useful for each case. Make answers change the outcome, not only repeat it.
- Use prices from the brief as setting values. A price the site doesn't show: value null, and list it under replace.
- Contact details last, just before or after the result, with as few fields as possible.
- Plain, specific words in the business's voice. Sentence case. No emoji, no hype, no filler.
- When there's a brand_book, follow it: write in its voice and words, use its real call-to-action labels for buttons, describe pictures the way its imagery does, and follow its rules. A hero may use the primary button's gradient exactly as given (as a background), and the brand book's colors by role through the variables above.
- Never invent testimonials, customer names, ratings or statistics as facts. If a proof section helps, write it and list each such item under replace.

summary = {built: [short lines on what you made], assumptions: [what you assumed], replace: [each placeholder price, quote or number awaiting the owner's real one]}.`;

/** The first JSON object in a reply (models sometimes wrap it in a fence). */
export function firstJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in the answer.");
  return JSON.parse(t.slice(start, end + 1));
}

export type Built = { name: string; form: Form; summary: BuildSummary; rounds: number; usage: Anthropic.Beta.BetaUsage[] };

/**
 * Build, check, fix: the draft goes through checkForm, and its problems go back to the model (up to `fixes` times).
 * Returns only a form that passes, or null.
 */
export async function buildForm(call: Caller, input: { brief: Brief | null; goal: Goal; note: string; answers: Record<string, string | string[]>; site: string; book?: unknown }, fixes = 2): Promise<Built | null> {
  const user = JSON.stringify({ goal: GOALS.find((g) => g.value === input.goal)?.text, site: input.site, brief: input.brief, brand_book: input.book ?? null, owner_note: input.note, owner_answers: input.answers });
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  const usage: Anthropic.Beta.BetaUsage[] = [];
  for (let round = 0; round <= fixes; round++) {
    const out = await call({ system: BUILD_SYSTEM, user, effort: "medium", maxTokens: 20000, history }).catch(() => null);
    if (!out) return null;
    usage.push(out.usage);
    let problems: string[];
    try {
      const raw = firstJson(out.text) as { name?: unknown; form?: unknown; summary?: Partial<BuildSummary> };
      const r = checkForm({ ...emptyForm(), ...(raw.form && typeof raw.form === "object" ? raw.form : {}) });
      if ("form" in r) {
        const s = raw.summary ?? {};
        const list = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 12) : []);
        // Settings left blank are always in the list, whatever the model wrote.
        const replace = [...new Set([...list(s.replace), ...unsetConstants(r.form).map((c) => `${c.name}: set the real value`)])];
        return { name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : "New form", form: r.form, summary: { built: list(s.built), assumptions: list(s.assumptions), replace }, rounds: round + 1, usage };
      }
      problems = r.errors;
    } catch (e) {
      problems = [e instanceof Error ? e.message : "The answer wasn't valid JSON."];
    }
    history.push({ role: "assistant", content: out.text }, { role: "user", content: `The checker refused it:\n- ${problems.slice(0, 20).join("\n- ")}\nFix every problem and answer with the whole JSON object again.` });
  }
  return null;
}
