// The five questions a new form starts from (docs/form-studio.md Part 1). Each answer is a click, and code turns the
// answers into the form: the same answers always build the same form, it always passes checkForm, and building one
// calls no model. A typed sentence is read here by keywords; AI only polishes the words at the end, and the form is
// whole without it. Runs in the browser and on the server.

import { linkProblem, SCHEDULERS, type SchedulerTool } from "./schedule.ts";
import { DEFAULT_CONSENT, type Choice, type Field, type FieldType, type Form } from "./schema.ts";

export type Goal = "demo" | "contact" | "trial" | "newsletter" | "event" | "download" | "partner" | "other";
export type Place = "hero" | "pricing" | "popup" | "page" | "blog";
export type Pick = "name_split" | "name" | "company" | "title" | "phone" | "company_size" | "country" | "website" | "message" | "budget" | "timeline" | "team_size" | "source";
export type After = { kind: "message" } | { kind: "redirect"; url: string } | { kind: "meeting"; tool: SchedulerTool; url: string; perOwner: boolean };
/** A question the visitor answers that the person wrote in their own words, typed by AI or by the rules below. */
export type Extra = { label: string; type: "text" | "textarea" | "choice" | "multi" | "number" | "date" | "url" | "checkbox"; options?: string[]; required: boolean };

export type Answers = {
  goal: Goal;
  /** Not asked any more; it comes from the goal or a typed sentence and sets the layout. */
  place: Place;
  fields: { pick: Pick; required: boolean }[];
  extra: Extra[];
  workOnly: boolean;
  steps: "one" | "two";
  after: After;
  /** Connected tools by source id, and the Slack or webhook address, if any. */
  send: { sources: string[]; slack: string; webhook: string };
};

/** Words the polish step may change: the form's title and intro, the button, the thank-you, and field labels by id. */
export type Copy = { title?: string; intro?: string; submit?: string; thanksTitle?: string; thanksText?: string; labels?: Record<string, string> };

export type QuestionId = "goal" | "fields" | "qualify" | "after" | "send";
export const QUESTIONS: { id: QuestionId; ask: string }[] = [
  { id: "goal", ask: "What's this form for?" },
  { id: "fields", ask: "What should it collect?" },
  { id: "qualify", ask: "Any questions to qualify them?" },
  { id: "after", ask: "After they send it?" },
  { id: "send", ask: "Where do leads go?" },
];

type GoalInfo = { label: string; name: string; picks: Pick[]; required: Pick[]; workOnly: boolean; submit: string; title: string; intro: string; thanks: string; thanksText?: string; after: After["kind"] };
export const GOALS: Record<Goal, GoalInfo> = {
  demo: { label: "Book demos", name: "Demo request", picks: ["name_split", "company", "company_size", "message"], required: ["name_split"], workOnly: true, submit: "Book a demo", title: "See it in action", intro: "Tell us a little about you and we'll set up a time.", thanks: "Thanks. Pick a time below.", after: "meeting" },
  contact: { label: "Contact sales", name: "Contact sales", picks: ["name", "company", "phone", "message"], required: ["name", "company", "message"], workOnly: true, submit: "Contact sales", title: "Talk to sales", intro: "We'll get back to you within one business day.", thanks: "Thanks. We'll be in touch within a day.", after: "message" },
  trial: { label: "Free trial", name: "Free trial", picks: ["company"], required: [], workOnly: true, submit: "Start free trial", title: "Start your free trial", intro: "No card needed.", thanks: "You're in. Check your inbox to get started.", after: "message" },
  newsletter: { label: "Newsletter", name: "Newsletter", picks: [], required: [], workOnly: false, submit: "Subscribe", title: "Get the newsletter", intro: "One email a month. No spam.", thanks: "You're subscribed.", after: "message" },
  event: { label: "Event", name: "Event signup", picks: ["name", "company", "title"], required: ["name", "company"], workOnly: false, submit: "Save my seat", title: "Save your seat", intro: "Spots are limited.", thanks: "You're in. The details are on their way.", after: "message" },
  download: { label: "Download", name: "Download", picks: ["name_split", "company", "title"], required: ["name_split"], workOnly: true, submit: "Get the guide", title: "Get the guide", intro: "Free, straight to your inbox.", thanks: "It's on its way to your inbox.", after: "message" },
  partner: { label: "Partner", name: "Partner application", picks: ["name", "company", "website", "message"], required: ["company", "website"], workOnly: true, submit: "Apply", title: "Become a partner", intro: "Tell us about your company and your customers.", thanks: "Thanks. Our partner team will reach out.", after: "message" },
  other: { label: "Other", name: "Form", picks: ["name"], required: [], workOnly: false, submit: "Send", title: "Get in touch", intro: "", thanks: "Thanks, we got it.", thanksText: "We'll be in touch soon.", after: "message" },
};
/** The goals offered as option cards, in order. Partner is still read from a sentence. */
export const GOAL_CHOICES: Goal[] = ["demo", "contact", "trial", "newsletter", "event", "download", "other"];

export const PLACES: { value: Place; label: string }[] = [
  { value: "hero", label: "Hero or landing page" },
  { value: "pricing", label: "Pricing page" },
  { value: "popup", label: "Popup" },
  { value: "page", label: "Its own page" },
  { value: "blog", label: "Inside a blog post" },
];

const opts = (list: string[]): Choice[] => list.map((v) => ({ value: v, label: v }));
type Made = Omit<Field, "required">;
/**
 * Each field a person can tick, in the order it appears on the form. "collect" ones are asked in What should it
 * collect, "qualify" ones in Any questions to qualify them.
 */
export const PICKS: { value: Pick; label: string; group: "collect" | "qualify"; make: () => Made[] }[] = [
  {
    value: "name_split",
    label: "First and last name",
    group: "collect",
    make: () => [
      { id: "first", key: "first_name", type: "text", label: "First name", width: "half" },
      { id: "last", key: "last_name", type: "text", label: "Last name", width: "half" },
    ],
  },
  { value: "name", label: "Full name", group: "collect", make: () => [{ id: "name", key: "name", type: "text", label: "Full name" }] },
  { value: "company", label: "Company", group: "collect", make: () => [{ id: "company", key: "company", type: "text", label: "Company" }] },
  { value: "title", label: "Job title", group: "collect", make: () => [{ id: "title", key: "title", type: "text", label: "Job title" }] },
  { value: "phone", label: "Phone", group: "collect", make: () => [{ id: "phone", key: "phone", type: "phone", label: "Phone" }] },
  { value: "company_size", label: "Company size", group: "collect", make: () => [{ id: "size", key: "q.company_size", type: "choice", label: "Company size", options: opts(["1-10", "11-50", "51-200", "201-1,000", "1,000+"]) }] },
  { value: "country", label: "Country", group: "collect", make: () => [{ id: "country", key: "country", type: "country", label: "Country" }] },
  { value: "website", label: "Website", group: "collect", make: () => [{ id: "website", key: "website", type: "url", label: "Company website" }] },
  { value: "budget", label: "Budget", group: "qualify", make: () => [{ id: "budget", key: "q.budget", type: "choice", label: "Budget", options: opts(["Under $1k", "$1k-$5k", "$5k-$20k", "$20k+"]) }] },
  { value: "timeline", label: "Timeline", group: "qualify", make: () => [{ id: "timeline", key: "q.timeline", type: "choice", label: "When do you want to start?", options: opts(["This month", "This quarter", "Later", "Just looking"]) }] },
  { value: "team_size", label: "Team size", group: "qualify", make: () => [{ id: "team", key: "q.team_size", type: "choice", label: "How big is your team?", options: opts(["Just me", "2-10", "11-50", "51+"]) }] },
  { value: "source", label: "How did you hear about us", group: "qualify", make: () => [{ id: "source", key: "q.heard_from", type: "choice", label: "How did you hear about us?", options: opts(["Search", "Social media", "A friend or colleague", "An event", "Other"]) }] },
  { value: "message", label: "Message", group: "collect", make: () => [{ id: "message", key: "q.message", type: "textarea", label: "How can we help?" }] },
];
export const groupOf = (p: Pick) => PICKS.find((x) => x.value === p)?.group ?? "collect";

/** The answers a goal starts with, so Skip never leaves a hole. */
export function defaults(goal: Goal = "demo"): Answers {
  const g = GOALS[goal];
  return {
    goal,
    place: goal === "newsletter" ? "blog" : goal === "event" || goal === "download" ? "page" : "hero",
    fields: g.picks.map((pick) => ({ pick, required: g.required.includes(pick) })),
    extra: [],
    workOnly: g.workOnly,
    steps: "one",
    after: g.after === "meeting" ? { kind: "meeting", tool: "calendly", url: "", perOwner: true } : { kind: "message" },
    send: { sources: [], slack: "", webhook: "" },
  };
}

/**
 * A new goal keeps what else was answered, but takes that goal's contact fields and its usual next step. Ticked
 * qualifying questions stay.
 */
export function withGoal(a: Answers, goal: Goal): Answers {
  const d = defaults(goal);
  const kept = a.fields.filter((f) => groupOf(f.pick) === "qualify" && !d.fields.some((x) => x.pick === f.pick));
  return { ...a, goal, fields: [...d.fields, ...kept], workOnly: d.workOnly, after: a.after.kind === "redirect" ? a.after : d.after, place: a.place };
}

const slug = (s: string, i: number) =>
  `q.${
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 30) || "answer"
  }${i ? `_${i + 1}` : ""}`;

/**
 * The form the answers describe. Field ids are fixed per field, so the preview doesn't jump as answers change; the
 * builder gives new fields random ids. Copy, when given, only replaces words.
 */
export function buildForm(a: Answers, copy: Copy = {}): Form {
  const g = GOALS[a.goal];
  const email: Field = { id: "email", key: "email", type: "email", label: a.workOnly ? "Work email" : "Email", required: true, ...(a.workOnly ? { check: "work_email" as const } : {}) };
  const picked = PICKS.filter((p) => a.fields.some((f) => f.pick === p.value)).flatMap((p) => {
    const req = a.fields.find((f) => f.pick === p.value)?.required ?? false;
    return p.make().map((m) => ({ ...m, required: req }) as Field);
  });
  // A full name and a split name never both show: the split one wins.
  const fields = picked.filter((f) => !(f.key === "name" && picked.some((x) => x.key === "first_name")));
  const keys = new Set(fields.map((f) => f.key as string));
  a.extra.slice(0, 10).forEach((x, i) => {
    let key = slug(x.label, 0);
    for (let n = 1; keys.has(key); n++) key = slug(x.label, n);
    keys.add(key);
    const type: FieldType = x.type;
    const choices = x.options?.map((o) => o.trim()).filter(Boolean).slice(0, 30);
    fields.push({
      id: `x${i + 1}`,
      key: key as Field["key"],
      type: (type === "choice" || type === "multi") && !choices?.length ? "text" : type,
      label: x.label.trim().slice(0, 300) || "Question",
      required: x.required,
      ...((type === "choice" || type === "multi") && choices?.length ? { options: opts([...new Set(choices)]) } : {}),
    });
  });
  // Email leads: a half-filled two-step form still gives you a lead.
  const named = fields.filter((f) => f.key === "first_name" || f.key === "last_name" || f.key === "name");
  const rest = fields.filter((f) => !named.includes(f));
  const two = a.steps === "two" && rest.length >= 1;
  const steps = two
    ? [
        { id: "s1", title: "You", fields: [email, ...named] },
        { id: "s2", title: "Your company", fields: rest },
      ]
    : [{ id: "s1", fields: [email, ...fields] }];
  for (const s of steps) for (const f of s.fields) if (copy.labels?.[f.id]) f.label = copy.labels[f.id].slice(0, 300);

  const shows = a.place === "page" || a.place === "popup";
  const thanksTitle = copy.thanksTitle || (a.after.kind === "meeting" ? "Pick a time" : g.thanks);
  const thanksText = copy.thanksText || g.thanksText;
  const meeting = a.after.kind === "meeting" ? a.after : null;
  const redirect = a.after.kind === "redirect" && !linkProblem("link", a.after.url) ? a.after.url : null;
  return {
    steps,
    rules: [],
    layout: { labels: a.goal === "newsletter" && a.place !== "page" ? "inside" : "above", width: a.place === "page" ? "wide" : "narrow" },
    ...(shows ? { title: (copy.title || g.title).slice(0, 300) } : {}),
    ...(shows && (copy.intro || g.intro) ? { intro: (copy.intro || g.intro).slice(0, 1000) } : {}),
    submit: { label: (copy.submit || g.submit).slice(0, 60) },
    consent: { mode: a.goal === "newsletter" ? "always" : "by_region", label: DEFAULT_CONSENT },
    spam: { minSeconds: 2, turnstile: false },
    after: {
      end: redirect ? { kind: "redirect", url: redirect } : { kind: "message", title: thanksTitle.slice(0, 300), ...(thanksText ? { text: thanksText.slice(0, 1000) } : {}) },
      ...(meeting ? { schedule: { tool: meeting.tool, url: meeting.url, perOwner: meeting.perOwner || !meeting.url } } : {}),
    },
  };
}

/** Ticks or unticks a field. A full name and a split name never both stay ticked. */
export function togglePick(fields: Answers["fields"], pick: Pick): Answers["fields"] {
  if (fields.some((f) => f.pick === pick)) return fields.filter((f) => f.pick !== pick);
  const other = pick === "name" ? "name_split" : pick === "name_split" ? "name" : null;
  return [...fields.filter((f) => f.pick !== other), { pick, required: false }];
}

/** Why the after-the-submit answer can't be used yet, or null. A booking link can be added later; a page can't. */
export function afterProblem(after: After): string | null {
  const url = after.kind === "message" ? "" : after.url.trim();
  if (after.kind === "redirect") return !url ? "Paste the page's address." : linkProblem("link", url) ? "Paste the full address, starting with https://." : null;
  if (after.kind === "meeting" && url) return linkProblem(after.tool, url);
  return null;
}

/** A short name for the form from its goal: "Demo request". */
export function formName(a: Answers): string {
  return GOALS[a.goal].name;
}

/**
 * The line the chat ends on: "Demo request: 4 fields, books on Calendly, sends to HubSpot". `names` are the
 * connected tools' names by source id.
 */
export function summaryLine(a: Answers, names: Record<string, string> = {}): string {
  const n = buildForm(a).steps.reduce((sum, s) => sum + s.fields.length, 0);
  const after =
    a.after.kind === "meeting"
      ? a.after.tool === "link"
        ? "books a meeting"
        : `books on ${SCHEDULERS.find((s) => s.value === (a.after as { tool: SchedulerTool }).tool)?.label ?? "a scheduler"}`
      : a.after.kind === "redirect"
        ? `goes to ${hostOf(a.after.url) || "a page"}`
        : "shows a message";
  const to = [...a.send.sources.map((id) => names[id] ?? "a tool"), ...(a.send.slack.trim() ? ["Slack"] : [])];
  const send = to.length ? `sends to ${to.length > 1 ? `${to.slice(0, -1).join(", ")} and ${to[to.length - 1]}` : to[0]}` : "saves to Claritia";
  return `${formName(a)}: ${n} field${n === 1 ? "" : "s"}, ${after}, ${send}`;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

// Reading a first sentence ---------------------------------------------------------------------------------------

const has = (t: string, re: RegExp) => re.test(t);

/** What a sentence gives away. Only what's here changes when it's laid over answers. */
export type Found = { goal?: Goal; place?: Place; picks: Pick[]; workOnly?: boolean; steps?: "one" | "two"; after?: After; sources?: string[] };

/**
 * Answers a sentence gives away, by keywords: "demo form for the pricing page with phone, sends to HubSpot". Returns
 * the answers (a goal's defaults with the sentence laid over), what it found, and which questions it settles, so
 * those are skipped. `tools` are the connected tools.
 */
export function readSentence(text: string, tools: { id: string; kind: string; name: string }[] = []): { answers: Answers; settled: QuestionId[]; found: Found } {
  const t = ` ${text.toLowerCase()} `;
  const found: Found = { picks: [] };
  const goal: Goal | null = has(t, /\bdemo/) ? "demo"
    : has(t, /\b(contact|sales|quote|talk to)/) ? "contact"
    : has(t, /\btrial|sign ?up for (the|a) (app|product)/) ? "trial"
    : has(t, /\bnewsletter|subscribe|mailing list/) ? "newsletter"
    : has(t, /\bevent|webinar|meetup|conference|rsvp/) ? "event"
    : has(t, /\bdownload|e-?book|whitepaper|guide|report|gated/) ? "download"
    : has(t, /\bpartner|reseller|affiliate|agenc/) ? "partner"
    : null;
  if (goal) found.goal = goal;
  const place: Place | null = has(t, /\bpricing/) ? "pricing" : has(t, /\bpop-?up|modal/) ? "popup" : has(t, /\bblog|article|post\b/) ? "blog" : has(t, /\bhome ?page|hero|landing/) ? "hero" : has(t, /\bown page|a link|standalone|hosted/) ? "page" : null;
  if (place) found.place = place;
  const ask: [RegExp, Pick][] = [
    [/\bphone|mobile|call\b/, "phone"],
    [/\b(company|organi[sz]ation) size|employees|headcount|over \d+ (people|employees)/, "company_size"],
    [/\b(job )?title|\brole\b/, "title"],
    [/\bcountry|location|where they/, "country"],
    [/\bwebsite|domain|url\b/, "website"],
    [/\bmessage|notes?\b|comments?|what they need|how can we help/, "message"],
    [/\bbudget/, "budget"],
    [/\btimeline|when they want|timeframe/, "timeline"],
    [/\bteam size|size of (their|the) team|how big .*team/, "team_size"],
    [/\bhow (did )?they (hear|found)|heard about|referral source/, "source"],
    [/\bfirst and last|first name/, "name_split"],
    [/\bfull name|\bname\b/, "name"],
    [/\bcompany\b(?! size)/, "company"],
  ];
  found.picks = ask.filter(([re]) => has(t, re)).map(([, p]) => p);
  if (has(t, /\b(work|business|company) e-?mails?( only)?|no (gmail|free)/)) found.workOnly = true;
  else if (has(t, /\bany e-?mail|personal e-?mail/)) found.workOnly = false;
  if (has(t, /\btwo|2|multi-?step|steps\b/) && has(t, /\bsteps?\b/)) found.steps = "two";
  else if (has(t, /\bone page|single page|short\b/)) found.steps = "one";
  const tool = SCHEDULERS.find((s) => s.value !== "link" && has(t, new RegExp(`\\b${s.label.split(" ")[0].toLowerCase().replace(".", "\\.")}`)));
  if (tool) found.after = { kind: "meeting", tool: tool.value, url: "", perOwner: true };
  else if (has(t, /\bbook (a )?(call|meeting|time)|schedul/)) found.after = { kind: "meeting", tool: "calendly", url: "", perOwner: true };
  else if (has(t, /\b(thank(s|-you)|show a) message/)) found.after = { kind: "message" };
  const sources = tools.filter((s) => has(t, new RegExp(`\\b${s.kind.replace(/[^a-z]/g, "")}|\\b${s.name.toLowerCase().replace(/[^a-z0-9 ]/g, "")}\\b`)));
  if (sources.length) found.sources = sources.map((s) => s.id);
  const r = fillFrom(defaults(goal ?? "demo"), found);
  return { answers: r.answers, settled: r.settled, found };
}

/**
 * Lays what a sentence found over answers already given, and says which questions that settles. A new goal takes its
 * own contact fields first, but keeps an after-the-submit already `answered`; named fields are added, never removed;
 * a full name and a split name never both stay.
 */
export function fillFrom(a: Answers, found: Found, answered: QuestionId[] = []): { answers: Answers; settled: QuestionId[] } {
  const settled = new Set<QuestionId>();
  let next: Answers = { ...a, fields: [...a.fields], send: { ...a.send } };
  if (found.goal) {
    if (found.goal !== a.goal) next = { ...withGoal(next, found.goal), ...(answered.includes("after") ? { after: a.after } : {}) };
    settled.add("goal");
  }
  if (found.place) next.place = found.place;
  for (const p of found.picks) {
    if (next.fields.some((f) => f.pick === p) || (p === "name" && next.fields.some((f) => f.pick === "name_split"))) continue;
    if (p === "name_split") next.fields = next.fields.filter((f) => f.pick !== "name");
    next.fields = [...next.fields, { pick: p, required: false }];
  }
  if (found.picks.some((p) => groupOf(p) === "collect")) settled.add("fields");
  if (found.picks.some((p) => groupOf(p) === "qualify")) settled.add("qualify");
  if (found.workOnly !== undefined) next.workOnly = found.workOnly;
  if (found.steps) next.steps = found.steps;
  if (found.after) {
    next.after = found.after;
    settled.add("after");
  }
  if (found.sources) {
    next.send = { ...next.send, sources: found.sources };
    settled.add("send");
  }
  return { answers: next, settled: QUESTIONS.map((q) => q.id).filter((id) => settled.has(id)) };
}

/**
 * A written question as a field, by rules: "Which CRM do you use? (HubSpot, Salesforce, Other)" is a pick-one with
 * those choices; "Tell us about…" is a long answer. The AI step does better, and this is what's used without it.
 */
export function readQuestion(raw: string): Extra {
  const text = raw.trim().replace(/\s+/g, " ").slice(0, 300);
  const list = /[(:]\s*([^()]+?,[^()]+?)\)?\s*$/.exec(text);
  const choices = list ? list[1].split(/,|\bor\b/).map((s) => s.trim()).filter(Boolean) : [];
  const label = (list ? text.slice(0, list.index) : text).trim().replace(/[:\s]+$/, "") || text;
  const l = label.toLowerCase();
  if (choices.length >= 2) return { label, type: /\b(all that|which ones|select all|any of)/.test(l) ? "multi" : "choice", options: choices.slice(0, 30), required: false };
  if (/^(tell us|describe|explain|anything else|what are you|what do you|why)/.test(l)) return { label, type: "textarea", required: false };
  if (/^how many|number of|\bhow much\b/.test(l)) return { label, type: "number", required: false };
  if (/\bwhen\b.*\b(date|start|launch)|\bdate\b/.test(l)) return { label, type: "date", required: false };
  if (/^(do you|are you|have you|would you|is your)/.test(l)) return { label, type: "choice", options: ["Yes", "No"], required: false };
  if (/\b(url|website|link)\b/.test(l)) return { label, type: "url", required: false };
  return { label, type: "text", required: false };
}

/** A written field from the AI step, cleaned to what buildForm takes, or null when it's unusable. */
export function cleanExtra(raw: unknown, fallback: string): Extra | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const types: Extra["type"][] = ["text", "textarea", "choice", "multi", "number", "date", "url", "checkbox"];
  const type = types.includes(o.type as Extra["type"]) ? (o.type as Extra["type"]) : null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 300) : fallback.trim().slice(0, 300);
  if (!type || !label) return null;
  const options = Array.isArray(o.options) ? o.options.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 30) : [];
  if ((type === "choice" || type === "multi") && options.length < 2) return { label, type: "text", required: false };
  return { label, type, ...(options.length && (type === "choice" || type === "multi") ? { options } : {}), required: false };
}

/** Copy from the AI step, cut to the schema's limits, with labels only for fields the form has. */
export function cleanCopy(raw: unknown, form: Form): Copy {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().replace(/[\u0000-\u001f]/g, " ").slice(0, max) : undefined);
  const ids = new Set(form.steps.flatMap((st) => st.fields.map((f) => f.id)));
  const labels: Record<string, string> = {};
  if (Array.isArray(o.labels))
    for (const l of o.labels as { id?: unknown; label?: unknown }[]) {
      const id = typeof l?.id === "string" ? l.id : "";
      const label = s(l?.label, 120);
      if (ids.has(id) && label) labels[id] = label;
    }
  const out: Copy = { title: s(o.title, 120), intro: s(o.intro, 300), submit: s(o.submit, 40), thanksTitle: s(o.thanks_title, 160), thanksText: s(o.thanks_text, 300), labels };
  for (const k of Object.keys(out) as (keyof Copy)[]) if (out[k] === undefined) delete out[k];
  return out;
}
