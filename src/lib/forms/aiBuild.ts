// The AI form builder (docs/ai-form-builder.md). No templates: Claude reads the customer's website into a business
// brief, asks a few questions written for that business and goal, then builds the whole form: HTML sections for the
// hero and proof, native questions (picture cards, sliders, numbers) and, when the goal needs one, settings,
// calculations, result screens and outcomes. The draft goes through checkForm; problems go back to Claude, up to
// twice, so only a form that passes the checker is ever saved. Prices, quotes and numbers that aren't on the site are
// left blank or listed under "Replace before publishing", never made up as facts.

import type Anthropic from "@anthropic-ai/sdk";
import { allFields, checkForm, emptyForm, FORM_KINDS, unsetConstants, type Form, type FormKind } from "./schema.ts";

export const BUILD_MODEL = "claude-sonnet-5-5";

/**
 * What a form is for (docs/form-kinds-plan.md). The AI picks one from the site and the owner's line, and builds with
 * its recipe: the parts it leans on, whether it needs an email, and what it must have.
 */
export type Kind = FormKind;
export type KindInfo = { value: Kind; label: string; text: string; email: "required" | "optional"; recipe: string };
export const KINDS: KindInfo[] = [
  { value: "lead", label: "Lead", text: "Contact, demo, waitlist or gated content", email: "required", recipe: "Short: what they need, a qualifying question or two, contact details. Book a call or say what happens next." },
  { value: "quote", label: "Quote", text: "A price or cost calculator", email: "required", recipe: "Settings for every rate or price, sliders and picture cards for what drives the price, a calc for the total, a result step with a metric and a summary, outcomes by size of job." },
  { value: "order", label: "Order", text: "Products, custom orders, donations or tickets", email: "required", recipe: "Picture cards for products with prices as settings, numbers for quantities, a calc for the total, a result step with a summary, delivery or pickup (an address for delivery, a date and time), contact details last." },
  { value: "booking", label: "Booking", text: "Meetings, appointments, classes or rentals", email: "required", recipe: "What they want booked (picture cards), when (date), a few details, contact details; the booking step follows." },
  { value: "qualify", label: "Qualify", text: "Score a lead or find the right plan", email: "required", recipe: "Choices with scores, a calc for the score, outcomes by score or answer (each with specific advice), a result step with a meter and the outcome, paths that end early for a clear no." },
  { value: "quiz", label: "Quiz", text: "Graded or personality quiz", email: "optional", recipe: "One question per screen with picture cards, scores on the right or matching answers, a calc for the score, outcomes for each result type, a result step with the outcome; email optional to get the result sent." },
  { value: "survey", label: "Survey", text: "NPS, feedback, polls or research", email: "optional", recipe: "A rating first (for NPS: numbers 0 to 10), a grid to rate several things at once, ranking for priorities, short follow-ups by the answer (paths or show rules), one open text question, email optional. No result step." },
  { value: "testimonial", label: "Testimonial", text: "Reviews and customer quotes", email: "required", recipe: "A rating, an open text question for the quote, name, title and company, a photo upload (file), consent to publish it." },
  { value: "registration", label: "Registration", text: "Events, courses, memberships or intake", email: "required", recipe: "Which session or option (cards), attendee details, a group to add guests, dietary or access needs, consent; one step per topic." },
  { value: "application", label: "Application", text: "Jobs, grants, vendors or speakers", email: "required", recipe: "Several steps: about you, experience, the role or program questions, a file upload for a resume or deck, links. Long text where it counts." },
  { value: "support", label: "Support", text: "Tickets, returns, bugs or complaints", email: "required", recipe: "What it's about (cards), details by type (show rules), order or account number, a file upload for a screenshot or photo, how urgent." },
  { value: "consent", label: "Consent", text: "Releases, waivers or patient intake", email: "required", recipe: "The terms in a section, details of the person, the specific permissions as checkboxes, a required signature, a required consent box (consent mode always, required)." },
  { value: "internal", label: "Internal", text: "Reports, time off, expenses or IT requests", email: "optional", recipe: "Plain and quick: who, what, a date range for time off, numbers, a group for expense lines, a file upload when receipts or screenshots help. No hero, no result step." },
];
const OLD_GOALS: Record<string, Kind> = { leads: "lead", assess: "qualify", recommend: "qualify", book: "booking" };
/** A kind from what a client sent, old goal names included. */
export const kindOf = (v: unknown): Kind | null => (typeof v === "string" ? (FORM_KINDS.includes(v as Kind) ? (v as Kind) : (OLD_GOALS[v] ?? null)) : null);
const info = (k: Kind) => KINDS.find((x) => x.value === k)!;

/** The kind from the owner's words, when the model isn't there to pick. */
export function guessKind(note: string): Kind {
  const t = note.toLowerCase();
  const by: [Kind, RegExp][] = [
    ["survey", /\b(nps|survey|feedback|poll|csat|satisfaction|research)\b/],
    ["quiz", /\b(quiz|trivia|personality|test your)\b/],
    ["quote", /\b(quote|estimate|calculat|pricing|cost|roi)\w*/],
    ["order", /\b(order|buy|purchase|donat|ticket|pre-?order)\w*/],
    ["booking", /\b(book|appointment|reserv|schedul|rental|rent)\w*/],
    ["qualify", /\b(qualif|score|assess|readiness|which plan|plan finder|recommend)\w*/],
    ["testimonial", /\b(testimonial|review|case study)\b/],
    ["registration", /\b(regist|enrol|sign ?up for|rsvp|attend|membership|intake)\w*/],
    ["application", /\b(appl(y|ication)|job|hiring|grant|scholarship|vendor|speaker)\w*/],
    ["support", /\b(support|ticket|bug|return|refund|warranty|complain)\w*/],
    ["consent", /\b(consent|waiver|release|nda|liability|patient)\w*/],
    ["internal", /\b(time off|leave request|expense|daily report|weekly report|incident|it request|employee)\b/],
  ];
  return by.find(([, re]) => re.test(t))?.[0] ?? "lead";
}

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
export function defaultQuestions(kind: Kind): AskQuestion[] {
  const who: AskQuestion = { id: "audience", question: "Who will fill it in?", kind: "choice", options: ["New customers", "Existing customers", "Both"] };
  const next: AskQuestion = { id: "next", question: "What should happen at the end?", kind: "choice", options: ["Book a call", "Email them the result", "Show a thank-you"] };
  const by: Record<Kind, AskQuestion> = {
    lead: { id: "need", question: "What do you need to know about each lead?", kind: "text", options: [] },
    quote: { id: "price", question: "What drives the price?", kind: "text", options: [] },
    order: { id: "items", question: "What can people order, and at what prices?", kind: "text", options: [] },
    booking: { id: "meetings", question: "What can people book?", kind: "text", options: [] },
    qualify: { id: "levels", question: "What makes a good fit?", kind: "text", options: [] },
    quiz: { id: "topic", question: "What is the quiz about, and what results can people get?", kind: "text", options: [] },
    survey: { id: "measure", question: "What do you want to measure?", kind: "choice", options: ["How likely they are to recommend you", "How happy they are", "What to build next", "One quick question"] },
    testimonial: { id: "about", question: "What should the quote be about?", kind: "text", options: [] },
    registration: { id: "event", question: "What are people signing up for?", kind: "text", options: [] },
    application: { id: "role", question: "What are people applying for?", kind: "text", options: [] },
    support: { id: "topics", question: "What do people usually need help with?", kind: "text", options: [] },
    consent: { id: "terms", question: "What are people agreeing to?", kind: "text", options: [] },
    internal: { id: "request", question: "What does the team send in with it?", kind: "text", options: [] },
  };
  return kind === "internal" ? [by.internal] : [by[kind], who, ...(info(kind).email === "required" ? [next] : [])];
}

const ASK_KIND_SCHEMA = {
  type: "object",
  properties: { kind: { type: "string", enum: [...FORM_KINDS] }, questions: (ASK_SCHEMA as { properties: { questions: object } }).properties.questions },
  required: ["kind", "questions"],
  additionalProperties: false,
};

/**
 * The questions for the person building it, written for this business and kind. With no kind given, the model picks
 * the kind from the brief and the owner's line in the same call.
 */
export async function askQuestions(call: Caller, brief: Brief | null, kind: Kind | null, note: string): Promise<{ kind: Kind; questions: AskQuestion[] }> {
  const kinds = KINDS.map((k) => `${k.value}: ${k.text}`).join("\n");
  const out = await call({
    system: `You help a business owner set up a web form. ${kind ? "" : `First pick what kind of form it is from their line and their business:\n${kinds}\nThen `}ask 3 to 5 short questions whose answers you need to build it well for that kind: what drives the price or score, which options to offer, who fills it in, what happens at the end. Never ask what the brief or their line already says. Offer choices (2 to 6, short) when the answers are a known list; use text otherwise. Plain words, no jargon.`,
    user: JSON.stringify({ ...(kind ? { kind: `${kind}: ${info(kind).text}` } : {}), owner_line: note, brief }),
    schema: kind ? ASK_SCHEMA : ASK_KIND_SCHEMA,
    effort: "low",
    maxTokens: 2000,
  }).catch(() => null);
  const fallback = kind ?? guessKind(note);
  if (!out) return { kind: fallback, questions: defaultQuestions(fallback) };
  let parsed: { kind?: unknown; questions?: AskQuestion[] };
  try {
    parsed = JSON.parse(out.text) as typeof parsed;
  } catch {
    return { kind: fallback, questions: defaultQuestions(fallback) };
  }
  const picked = kind ?? kindOf(parsed.kind) ?? fallback;
  const clean = (parsed.questions ?? [])
    .filter((q) => q && typeof q.question === "string" && q.question.trim())
    .slice(0, 5)
    .map((q, i) => ({ id: /^[a-z0-9_]{1,24}$/.test(q.id) ? q.id : `q${i + 1}`, question: q.question.slice(0, 200), kind: q.kind === "multi" || q.kind === "text" ? q.kind : "choice", options: (q.options ?? []).map(String).slice(0, 6) }) as AskQuestion)
    .map((q) => (q.kind !== "text" && q.options.length < 2 ? { ...q, kind: "text" as const, options: [] } : q));
  return { kind: picked, questions: clean.length ? clean : defaultQuestions(picked) };
}

// Building the form --------------------------------------------------------------------------------------------------

export const BUILD_SYSTEM = `You build an interactive web form for a business, as JSON in Claritia's form format. Answer with one JSON object {"name", "form", "summary"} and nothing else.

THE FORMAT
form = { kind, steps, rules: [], layout, submit: {label}, consent: {mode: "by_region", label}, spam: {minSeconds: 2, turnstile: false}, after: {end: {kind: "message", title, text?}}, constants?, results?, emailOptional? }
layout = {labels: "above", width: "wide", mode: "screens", auto: true, cover?: {title, text?, button?}, side?: {image, at?: "right"}}
step = {id, title?, fields: [field], result?: true, image?, jumps?: [{when: cond, to}]}   (ids: 1 to 24 lowercase letters or digits)
- side: a split screen, the picture beside every step (image: an https address from the brief's pictures only). A step's image replaces it for that step.
- jumps: paths by answer after this step, checked in order: to is a later step's index (0-based, past the next one), or the number of steps to send the form right there (end early, for a clear "not a fit").
- emailOptional: true when the kind doesn't need an email (polls, anonymous surveys, quizzes, internal forms); the email question is then optional or left out.
field = {id, key, type, label, required, ...}
- keys: "email", "name", "first_name", "last_name", "phone", "company", "website", "title", "country" for contact details; "q.<snake_case>" for answers; "c.<id>" for sections and results.
- types: text, email, phone, textarea, number, choice, multi, dropdown, checkbox, date, url, rating, calc, html, result, heading, paragraph, file, ranking, address, grid, time, daterange, group, signature.
- rating: rating {scale: 3 to 10, style: "stars"|"numbers", zero?: true (numbers from 0, for NPS 0 to 10), low?, high?}.
- ranking: options to put in order. grid: grid {rows: [{value, label}], cols: [{value, label}]} (one column per row, e.g. rate each from Poor to Great). address: street, city, region, postcode, country. time, daterange: a time of day, a first and last date. group: group {fields: [{id, type: text|email|phone|number|dropdown|date, label, required, options?}], max: 1 to 20, add?: "Add a guest"} for "add another" rows. signature: a drawn signature. file: file {maxMb, kinds: ["pdf"|"image"|"office"]}. These keep their answer on the fill: key "q.<snake_case>".
- choice and multi: options [{value, label, score?, image?}], cards: true for picture cards. value is snake_case. score is the number formulas read.
- number: valid {min, max, step}; slider: true needs min and max; unit: "money" | "percent".
- calc: calc {formula, format?: "money"|"percent", decimals?, show?: false}. A formula reads fields as {id} and settings as {@id}: + - * / ( ), comparisons, and, or, min, max, sum, round, ceil, floor, abs, if(c,a,b), ifempty(a,b). An empty answer stays empty; divide by zero is empty.
- html: content {html} - a full-width section: section, div, h1-h4, p, span, strong, em, ul, ol, li, blockquote, figure, img (https src from the brief only), a. Inline style with layout, spacing, type and color only (no url(), no position). No scripts, buttons or inputs.
  Colors, fonts and corners come from the customer's brand kit, so never write a hex color or a font name in a section. Use these instead: var(--clr-text), var(--clr-muted), var(--clr-bg), var(--clr-accent), var(--clr-btn-bg), var(--clr-btn-text), var(--clr-border), var(--clr-font), var(--clr-heading-font), var(--clr-radius). For a tinted band use color-mix(in srgb, var(--clr-accent) 8%, var(--clr-bg)).
- result: result {kind: "metric"|"meter"|"summary"|"bars"|"outcome"|"email", field?, fields?, max?} on a step with result: true, which holds only result, html, heading, paragraph and calc fields.
constants = [{id, name, value: number|null, format?: "money"|"percent", private?: true}]
results = {show: "instant"|"after_contact", outcomes: [{id, title, text?, when?: {logic: "all"|"any", conds: [{field, op, value?, value2?, values?}]}}]} - first match wins; the LAST outcome has no when (everyone else). ops: is, is_not, filled, empty, gt, gte, lt, lte, between (value, value2), any_of (values).
There must be exactly one field with key "email" (unless emailOptional is true; then at most one, not required), and every step except result steps needs at least one question.

HOW TO BUILD IT WELL
- Build the kind you're given, following its recipe. Set form.kind to it.
- When the brief has pictures and the kind is visual (quiz, quote, order, booking, qualify, lead), use a split screen (layout.side) with the best picture, and step images where a different picture fits a step better.
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
/** What each kind must have, so the fix loop catches a quote with no price or a survey with nothing to rate. */
export function kindProblems(form: Form, kind: Kind): string[] {
  const fields = allFields(form);
  const has = (t: string) => fields.some((f) => f.type === t);
  const out: string[] = [];
  if ((kind === "quote" || kind === "order") && !has("calc")) out.push(`A ${kind} form needs a calc field for the total.`);
  if ((kind === "qualify" || kind === "quiz") && !form.results?.outcomes?.length) out.push(`A ${kind} form needs results with outcomes.`);
  if (kind === "survey" && !fields.some((f) => f.type === "rating" || f.type === "choice")) out.push("A survey needs a rating or a choice to answer.");
  if (kind === "testimonial" && !has("textarea")) out.push("A testimonial form needs a long text question for the quote.");
  if (kind === "application" && !has("file")) out.push("An application needs a file upload.");
  if (kind === "consent" && form.consent.mode !== "always") out.push('A consent form needs consent mode "always" with required: true.');
  if (kind === "consent" && !has("signature")) out.push("A consent form needs a required signature field.");
  if (info(kind).email === "required" && form.emailOptional) out.push(`A ${kind} form needs the email: leave emailOptional out.`);
  return out;
}

export async function buildForm(call: Caller, input: { brief: Brief | null; kind: Kind; note: string; answers: Record<string, string | string[]>; site: string; book?: unknown }, fixes = 2): Promise<Built | null> {
  const k = info(input.kind);
  const user = JSON.stringify({ kind: k.value, kind_is: k.text, recipe: k.recipe, email: k.email, site: input.site, brief: input.brief, brand_book: input.book ?? null, owner_note: input.note, owner_answers: input.answers });
  const history: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: user }];
  const usage: Anthropic.Beta.BetaUsage[] = [];
  for (let round = 0; round <= fixes; round++) {
    const out = await call({ system: BUILD_SYSTEM, user, effort: "medium", maxTokens: 20000, history }).catch(() => null);
    if (!out) return null;
    usage.push(out.usage);
    let problems: string[];
    try {
      const raw = firstJson(out.text) as { name?: unknown; form?: unknown; summary?: Partial<BuildSummary> };
      const r = checkForm({ ...emptyForm(), ...(raw.form && typeof raw.form === "object" ? raw.form : {}), kind: input.kind });
      const missing = "form" in r ? kindProblems(r.form, input.kind) : [];
      // The kind's must-haves count only while there are rounds left to fix them; the last round keeps a valid form.
      if ("form" in r && (!missing.length || round === fixes)) {
        const s = raw.summary ?? {};
        const list = (x: unknown) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 12) : []);
        // Settings left blank are always in the list, whatever the model wrote.
        const replace = [...new Set([...list(s.replace), ...unsetConstants(r.form).map((c) => `${c.name}: set the real value`)])];
        return { name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : "New form", form: r.form, summary: { built: list(s.built), assumptions: list(s.assumptions), replace }, rounds: round + 1, usage };
      }
      problems = "errors" in r ? r.errors : missing;
    } catch (e) {
      problems = [e instanceof Error ? e.message : "The answer wasn't valid JSON."];
    }
    history.push({ role: "assistant", content: out.text }, { role: "user", content: `The checker refused it:\n- ${problems.slice(0, 20).join("\n- ")}\nFix every problem and answer with the whole JSON object again.` });
  }
  return null;
}
