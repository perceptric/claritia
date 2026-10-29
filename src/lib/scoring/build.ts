// The first model, built from the workspace's own data (docs/scoring-plan.md Part 3): who the leads that went on to
// meet sales are, and which actions came before those meetings. Every rule comes with the numbers behind it, and every
// finding is a plain sentence for the build screen. The assistant may adjust the result (ai.ts); this is the floor.

import { toNumber } from "../router/conditions.ts";
import type { Cond } from "../router/types.ts";
import { emptyBody, newId, type ScoreBody, type ScoreRule } from "./model.ts";
import { beforeMeeting, fitToCapacity, type LeadFacts } from "./engine.ts";

export type Finding = { source: "site" | "crm" | "leads"; text: string };
export type BuildInput = { leads: LeadFacts[]; forms: { id: string; name: string }[]; reps: number; site: { name: string | null; domain: string | null }; now: number; days: number };

const SIZES: [number, number, string][] = [[1, 10, "1 to 10"], [11, 50, "11 to 50"], [51, 200, "51 to 200"], [201, 1000, "201 to 1,000"], [1001, 5000, "1,001 to 5,000"], [5001, 10_000_000, "more than 5,000"]];
const rule = (conds: Cond[], points: number, o: Partial<ScoreRule> = {}): ScoreRule => ({ id: newId("r"), match: "all", conds, points, count: "once", cap: 3, fade: "model", on: true, ...o });
const has = (f: LeadFacts, k: string, d?: (x: string) => boolean) => f.events.some((e) => e.k === k && (!d || d((e.d ?? "").toLowerCase())));
const or = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function buildModel(input: BuildInput): { body: ScoreBody; findings: Finding[] } {
  // Each past lead as it was before it met sales, so the meeting can't explain itself.
  const leads = input.leads.map(beforeMeeting);
  const findings: Finding[] = [];
  const met = leads.filter((l) => l.met);
  const base = leads.length ? met.length / leads.length : 0;
  /** How much more often leads with this went on to meet, against all leads. Null with too few to tell. */
  const lift = (p: (f: LeadFacts) => boolean, min = 5) => {
    const xs = leads.filter(p);
    if (xs.length < min || !base) return null;
    return { n: xs.length, rate: xs.filter((x) => x.met).length / xs.length, lift: xs.filter((x) => x.met).length / xs.length / base };
  };
  const good = (p: (f: LeadFacts) => boolean) => (lift(p)?.lift ?? 0) >= 1.25;
  const top = (key: string, keep: (v: string) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const l of met) {
      const v = l.values[key];
      if (typeof v === "string" && v && keep(v)) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  };

  // The site: which forms and pages there are.
  const formNamed = (re: RegExp) => input.forms.filter((f) => re.test(f.name));
  const demo = formNamed(/demo|sales|contact|talk|quote|trial/i);
  if (input.site.domain) findings.push({ source: "site", text: `Read ${input.site.domain}${input.site.name ? `, the site of ${input.site.name}` : ""}` });
  if (demo.length) findings.push({ source: "site", text: `Buyers can ask for sales on ${or(demo.slice(0, 3).map((f) => f.name))}` });
  const pageHits = new Map<string, number>();
  for (const l of met) for (const p of new Set(l.events.filter((e) => e.k === "page" && e.d).map((e) => pathOf(e.d!)))) pageHits.set(p, (pageHits.get(p) ?? 0) + 1);
  const pages = [...pageHits.entries()].filter(([p]) => p !== "/" && !/careers|jobs|blog/.test(p)).sort((a, b) => b[1] - a[1]).map(([p]) => p).filter((p) => good((f) => has(f, "page", (d) => d.includes(p)))).slice(0, 3);
  if (pages.length) findings.push({ source: "site", text: `${or(pages)} ${pages.length > 1 ? "are the pages" : "is the page"} buyers read before they meet` });

  // Who buys: from the leads that went on to meet sales.
  const sizes = SIZES.filter(([lo, hi]) => good((f) => { const n = toNumber(f.values["company.size"]); return n !== null && n >= lo && n <= hi; }));
  const industries = top("company.industry").filter((v) => good((f) => f.values["company.industry"] === v)).slice(0, 3);
  const countries = top("lead.country").slice(0, 8);
  const seniority = top("contact.seniority").filter((v) => good((f) => f.values["contact.seniority"] === v)).slice(0, 3);
  const depts = top("contact.department").filter((v) => good((f) => f.values["contact.department"] === v)).slice(0, 3);
  const company: ScoreRule[] = [];
  const person: ScoreRule[] = [];
  if (sizes.length) {
    const lo = sizes[0]![0], hi = sizes[sizes.length - 1]![1];
    company.push(rule([{ field: "company.size", op: hi >= 10_000_000 ? "gt" : "between", value: hi >= 10_000_000 ? lo - 1 : [lo, hi] }], 12));
    findings.push({ source: "crm", text: `Buyers mostly work at companies with ${sizes[0]![2].split(" to ")[0]} to ${sizes[sizes.length - 1]![2].replace(/^.* to /, "")} people` });
  }
  if (industries.length) {
    company.push(rule([{ field: "company.industry", op: "one_of", value: industries }], 10));
    findings.push({ source: "crm", text: `Most buyers are in ${or(industries)}` });
  }
  if (countries.length) company.push(rule([{ field: "lead.country", op: "one_of", value: countries }], 5));
  if (seniority.length) {
    person.push(rule([{ field: "contact.seniority", op: "one_of", value: seniority }], 12));
    findings.push({ source: "crm", text: `Buyers are mostly ${or(seniority.map((s) => (s === "Individual" ? "individual contributors" : s === "C-level" ? "C-level" : `${s}s`)))}${depts.length ? ` in ${or(depts)}` : ""}` });
  }
  if (depts.length) person.push(rule([{ field: "contact.department", op: "one_of", value: depts }], 8));
  person.push(rule([{ field: "contact.email_class", op: "one_of", value: ["work"] }], 5));
  if (!company.length) company.push(rule([{ field: "company.size", op: "between", value: [51, 1000] }], 12), rule([{ field: "company.industry", op: "filled" }], 4));
  if (!person.length || person.length === 1) person.unshift(rule([{ field: "contact.seniority", op: "one_of", value: ["C-level", "VP", "Director"] }], 12));
  if (input.reps) findings.push({ source: "crm", text: `${input.reps} ${input.reps === 1 ? "rep follows" : "reps follow"} up new leads` });

  // What buyers do before they meet.
  const intent: ScoreRule[] = [];
  const pts = (l: { lift: number } | null, d: number) => (l ? Math.max(3, Math.min(35, Math.round(l.lift * 6))) : d);
  const askForms = demo.length ? demo : [];
  if (askForms.length) {
    const l = lift((f) => askForms.some((x) => has(f, "form", (d) => d === x.id.toLowerCase())));
    intent.push(rule([{ field: "event.form", op: "one_of", value: askForms.map((f) => f.id) }], pts(l, 30)));
    if (l && l.lift >= 2) findings.push({ source: "leads", text: `Leads who filled in ${or(askForms.slice(0, 2).map((f) => f.name))} met sales ${l.lift.toFixed(0)} times as often` });
  }
  const other = input.forms.filter((f) => !askForms.includes(f));
  if (other.length) intent.push(rule([{ field: "event.form", op: "one_of", value: other.map((f) => f.id) }], pts(lift((f) => other.some((x) => has(f, "form", (d) => d === x.id.toLowerCase()))), 8)));
  intent.push(rule([{ field: "event.meeting", op: "filled" }], 35));
  for (const p of pages.length ? pages : ["/pricing"]) intent.push(rule([{ field: "event.page", op: "contains", value: [p] }], pts(lift((f) => has(f, "page", (d) => d.includes(p))), 10), { count: "each", cap: 3 }));
  intent.push(rule([{ field: "event.click", op: "filled" }], 3, { count: "each", cap: 5 }));

  const products = new Map<string, number>();
  for (const l of leads) for (const e of l.events) if (e.k === "product" && e.d) products.set(e.d, (products.get(e.d) ?? 0) + 1);
  const usage = [...products.keys()].map((d) => ({ d, l: lift((f) => has(f, "product", (x) => x === d.toLowerCase())) })).filter((x) => x.l && x.l.lift >= 1.25).sort((a, b) => b.l!.lift - a.l!.lift).slice(0, 4);
  const usageRules = usage.map((x) => rule([{ field: "event.product", op: "contains", value: [x.d] }], pts(x.l, 10)));
  if (usage[0]) findings.push({ source: "leads", text: `Leads who did "${usage[0].d}" in the product met sales ${usage[0].l!.lift.toFixed(0)} times as often` });

  // Who should never reach sales.
  const minus: ScoreRule[] = [];
  const free = lift((f) => f.values["contact.email_class"] === "free");
  if (!free || free.lift < 0.6) minus.push(rule([{ field: "contact.email_class", op: "one_of", value: ["free"] }], -15));
  minus.push(rule([{ field: "contact.title", op: "contains", value: ["student", "intern"] }], 0, { remove: true }));
  minus.push(rule([{ field: "event.page", op: "contains", value: ["/careers", "/jobs"] }], -25, { name: "Looking for a job" }));
  minus.push(rule([{ field: "contact.lifecycle", op: "one_of", value: ["customer"] }], 0, { remove: true, name: "Is already a customer" }));
  minus.push(rule([{ field: "event.unsub", op: "filled" }], -20, { fade: "never" }));
  if (free && free.lift < 0.6) findings.push({ source: "leads", text: "Leads with personal email addresses rarely met sales" });
  findings.push({ source: "leads", text: `${leads.length.toLocaleString("en-US")} leads in the last ${input.days} days, ${met.length.toLocaleString("en-US")} met sales` });

  const b = emptyBody();
  b.groups = [
    { id: "company", name: "Company fit", side: "fit", max: 30, rules: company },
    { id: "person", name: "Person fit", side: "fit", max: 30, rules: person },
    { id: "intent", name: "Buying intent", side: "act", max: usageRules.length ? 50 : 70, rules: intent },
    ...(usageRules.length ? [{ id: "usage", name: "Product use", side: "act" as const, max: 30, rules: usageRules }] : []),
  ];
  b.minus = minus;
  b.capacity = Math.max(5, input.reps * 5 || 15);
  return { body: fitToCapacity(b, input.leads, input.now, input.days), findings };
}

const pathOf = (u: string) => {
  try {
    return new URL(u, "https://x.invalid").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return u;
  }
};
