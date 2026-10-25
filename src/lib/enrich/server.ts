// Enrichment on the server (docs/enrich-workflows-reports.md Part 1): one contact through the waterfall and into
// its record, a form's "which fields do you know" lookup, and AI qualify. Used by the worker's jobs and the web
// routes alike; everything reaches the database through rpc.

import { enrichDomain } from "../company/coresignal.ts";
import { cachedStep } from "../ai/cache.ts";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import type { Rpc } from "../jobs.ts";
import { unseal } from "../seal.ts";
import { checkEmail, type MxLookup } from "./emailCheck.ts";
import { pdlPerson } from "./pdl.ts";
import { byRules, claudeAsk, cleanQualify, qualifyKey, qualifyPrompt, qualifySchema, readAnswer, type Ask, type Decision, type LeadFacts } from "./qualify.ts";
import { knownKeys, orderSources, type Company, type Enriched, type Person, type Source } from "./types.ts";
import { fromFirmo, runWaterfall, type Cached, type WaterfallDeps } from "./waterfall.ts";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Our server keys: lookups with them take the team's credits. A team's own key is used before them, for free. */
export type Keys = { coresignal?: string | null; pdl?: string | null };
export const keysFromEnv = (env: NodeJS.ProcessEnv = process.env): Keys => ({ coresignal: env.CORESIGNAL_API_KEY?.trim() || null, pdl: env.PDL_API_KEY?.trim() || null });

export type EnrichOpts = {
  keys?: Keys;
  fetcher?: typeof fetch;
  mx?: MxLookup;
  now?: () => number;
  /** SECRETS_KEY, to open the team's own keys; defaults to the environment. */
  secret?: string;
};

type RawSource = { step: string; on: boolean; position: number; timeoutMs: number; key: string | null };

/** The team's sources with their own keys opened, and steps with no key at all turned off. */
export function sourcesFor(raw: RawSource[] | null | undefined, keys: Keys, secret?: string): Source[] {
  return orderSources(
    (raw ?? []).map((s) => {
      let key: string | null = null;
      if (s.key) {
        try {
          key = unseal(s.key, secret);
        } catch {
          key = null;
        }
      }
      return { ...s, step: s.step as Source["step"], key };
    }),
  ).map((s) => (s.step !== "email_check" && !s.key && !keys[s.step] ? { ...s, on: false } : s));
}

/** The waterfall's database and vendor calls for one workspace. */
export function depsFor(rpc: Rpc, ws: string, o: EnrichOpts): WaterfallDeps {
  const keys = o.keys ?? keysFromEnv();
  let cache: { person: Cached<Person> | null; company: Cached<Company> | null } | null = null;
  let cacheFor = "";
  const read = async (email: string, domain: string) => {
    const k = `${email}|${domain}`;
    if (!cache || cacheFor !== k) {
      const r = await call<{ person: { data: Person | null; not_found: boolean; vendor: string } | null; company: { data: Company | null; not_found: boolean; vendor: string } | null }>(rpc, "enrich_cache_get", { p_email: email, p_domain: domain, p_days: 90 });
      cache = {
        person: r.person ? { data: r.person.data, notFound: r.person.not_found, vendor: r.person.vendor } : null,
        company: r.company ? { data: r.company.data ? fromFirmo(r.company.data, domain) : null, notFound: r.company.not_found, vendor: r.company.vendor } : null,
      };
      cacheFor = k;
    }
    return cache;
  };
  return {
    now: o.now,
    getPerson: async (email) => (await read(email, email.split("@").pop() ?? "")).person,
    getCompany: async (domain) => (await read("", domain)).company,
    putPerson: (email, vendor, data) => call(rpc, "enrich_cache_put", { p_kind: "person", p_key: email, p_vendor: vendor, p_data: data }),
    putCompany: (domain, vendor, data) => call(rpc, "enrich_cache_put", { p_kind: "company", p_key: domain, p_vendor: vendor, p_data: data }),
    spend: (n) => call<boolean>(rpc, "enrich_spend", { p_ws: ws, p_n: n }),
    refund: (n) => call(rpc, "enrich_refund", { p_ws: ws, p_n: n }),
    emailCheck: (email, timeoutMs) => checkEmail(email, { mx: o.mx, timeoutMs }),
    company: async (domain, key, signal) => fromFirmo(await enrichDomain(domain, { apiKey: key ?? keys.coresignal ?? undefined, fetcher: o.fetcher, signal }), domain),
    person: (email, key, signal) => pdlPerson(email, { apiKey: (key ?? keys.pdl)!, fetcher: o.fetcher, signal }),
  };
}

type Loaded = {
  contact: { id: string; workspace_id: string; email: string; email_class: string | null; source: string; first_name: string | null; last_name: string | null; title: string | null; seniority: string | null; department: string | null; linkedin_url: string | null; country: string | null; phone: string | null; qualify_outcome: string | null; last_run: string | null };
  company: (Company & { id?: string }) | null;
  settings: { on: boolean; sources: string[]; skip_free: boolean; rescan_days: number };
  sources: RawSource[];
  qualify: { on: boolean } | null;
};

const strip = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")) as T;

export type EnrichResult = { skipped?: string; fields: string[]; steps: Enriched["steps"]; credits: number; enriched?: Enriched };

/**
 * Look one contact up and write what's found. trigger: new (a new contact), form (a fill), backfill (an owner's
 * run), workflow (a workflow step), again (forced). Skips a contact looked at within the team's re-look days unless
 * forced. cacheOnly: records and caches only, for the submit path.
 */
export async function enrichContact(rpc: Rpc, contactId: string, o: EnrichOpts & { trigger: "new" | "form" | "backfill" | "workflow" | "again"; force?: boolean; cacheOnly?: boolean; budgetMs?: number }): Promise<EnrichResult> {
  const now = o.now ?? Date.now;
  const started = now();
  const l = await call<Loaded | null>(rpc, "enrich_load", { p_contact: contactId });
  if (!l) return { skipped: "gone", fields: [], steps: [], credits: 0 };
  const c = l.contact;
  if (!l.settings.on && o.trigger === "new") return { skipped: "off", fields: [], steps: [], credits: 0 };
  if (l.settings.skip_free && c.email_class === "free" && !o.force) return { skipped: "personal email", fields: [], steps: [], credits: 0 };
  if (!o.force && !o.cacheOnly && c.last_run && Date.parse(c.last_run) > now() - l.settings.rescan_days * 86_400_000) return { skipped: "looked up lately", fields: [], steps: [], credits: 0 };

  const domain = c.email.split("@").pop() ?? null;
  const have = {
    person: strip<Person>({ first_name: c.first_name ?? undefined, last_name: c.last_name ?? undefined, title: c.title ?? undefined, seniority: (c.seniority ?? undefined) as Person["seniority"], department: (c.department ?? undefined) as Person["department"], linkedin_url: c.linkedin_url ?? undefined, country: c.country ?? undefined, phone: c.phone ?? undefined }),
    company: l.company ? strip<Company>({ ...l.company, id: undefined } as Company) : null,
  };
  const ws = c.workspace_id;
  const e = await runWaterfall(
    { email: c.email, emailClass: c.email_class, domain, have, sources: sourcesFor(l.sources, o.keys ?? keysFromEnv(), o.secret), deadline: started + (o.budgetMs ?? 15_000), cacheOnly: o.cacheOnly },
    depsFor(rpc, ws, o),
  );
  const fields: string[] = [];
  // Write each side under the vendor that found it, so its history says where it came from.
  const vendorOf = (from: string | null) => (from === "coresignal" || from === "pdl" ? from : null);
  const pv = vendorOf(e.personFrom);
  const cv = vendorOf(e.companyFrom);
  if (pv) fields.push(...(await call<string[]>(rpc, "enrich_write", { p_contact: contactId, p_source: pv, p_person: e.person, p_company: null })));
  if (cv && e.company) fields.push(...(await call<string[]>(rpc, "enrich_write", { p_contact: contactId, p_source: cv, p_person: {}, p_company: e.company })));
  if (!o.cacheOnly || fields.length) {
    await call(rpc, "enrich_run_log", { p_ws: ws, p_contact: contactId, p_trigger: o.trigger === "form" ? "form" : o.trigger, p_steps: e.steps, p_fields: fields, p_credits: e.credits, p_ms: now() - started });
  }
  return { fields, steps: e.steps, credits: e.credits, enriched: e };
}

type LoadedEmail = {
  contact: { id: string; title?: string; seniority?: string; department?: string; country?: string; phone?: string; company_id?: string } | null;
  company: Company | null;
  settings: { on: boolean };
  sources: RawSource[];
};

/**
 * The waterfall for an email that may not be a contact yet: the team's records for it, the caches, then the vendors.
 * Null for an address that isn't one.
 */
export async function lookupEmail(rpc: Rpc, ws: string, email: string, o: EnrichOpts & { budgetMs?: number; cacheOnly?: boolean } = {}): Promise<Enriched | null> {
  const cleaned = cleanEmail(email);
  if (isRejected(cleaned)) return null;
  const l = await call<LoadedEmail>(rpc, "enrich_load_email", { p_ws: ws, p_email: cleaned.clean });
  if (l.settings && l.settings.on === false) return null;
  const have = {
    person: strip<Person>({ title: l.contact?.title, seniority: l.contact?.seniority as Person["seniority"], department: l.contact?.department as Person["department"], country: l.contact?.country, phone: l.contact?.phone }),
    company: l.company ? strip<Company>(l.company) : null,
  };
  const now = o.now ?? Date.now;
  return runWaterfall(
    { email: cleaned.clean, emailClass: cleaned.class, domain: cleaned.domain, have, sources: sourcesFor(l.sources, o.keys ?? keysFromEnv(), o.secret), deadline: now() + (o.budgetMs ?? 1500), cacheOnly: o.cacheOnly },
    depsFor(rpc, ws, o),
  );
}

/**
 * A form's lookup when someone leaves the email field: the keys among `want` the team's records, the caches and the
 * vendors know. Never the values. Off, slow or failing, it answers with fewer keys or none.
 */
export async function knownForEmail(rpc: Rpc, ws: string, email: string, want: string[], o: EnrichOpts & { budgetMs?: number; cacheOnly?: boolean } = {}): Promise<string[]> {
  if (!want.length) return [];
  const e = await lookupEmail(rpc, ws, email, o);
  return e ? knownKeys(want, e.person, e.company) : [];
}

// Qualify -------------------------------------------------------------------------------------------------------------

type QualifyLoaded = {
  contact: { id: string; workspace_id: string; email: string; email_class: string | null; title: string | null; seniority: string | null; department: string | null; country: string | null; region: string | null; score: number | null; score_band: string | null; route_status: string | null; qualify_outcome: string | null; fields: Record<string, unknown> };
  company: Record<string, unknown> | null;
  answers: Record<string, unknown>;
  settings: { on: boolean; outcomes: unknown; rules: unknown } | null;
};

const text = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : String(v));

/** The values qualify rules test, named like the router's fields. */
export function qualifyValues(l: QualifyLoaded): Record<string, unknown> {
  const c = l.contact;
  const co = l.company ?? {};
  const v: Record<string, unknown> = {
    "lead.country": co.country ?? c.country,
    "lead.score": c.score,
    "lead.band": c.score_band,
    "contact.email_class": c.email_class,
    "contact.email_domain": c.email.split("@").pop(),
    "contact.title": c.title,
    "contact.seniority": c.seniority,
    "contact.department": c.department,
    "contact.country": c.country,
    "contact.region": c.region,
    "company.name": co.name,
    "company.domain": co.domain,
    "company.industry": co.industry,
    "company.size": co.size ?? co.employees,
    "company.employees": co.employees,
    "company.country": co.country,
  };
  for (const [k, x] of Object.entries(c.fields ?? {})) v[`contact.f.${k}`] = x;
  for (const [k, x] of Object.entries(l.answers ?? {})) v[`answer.${k}`] = x;
  return v;
}

export type QualifyResult = { status: "decided" | "same" | "off" | "spam" | "none"; decision?: Decision; cached?: boolean };

/**
 * Qualify one lead: the team's rules first, then Claude through the step cache. Leads held as spam or with a
 * throwaway address never reach the model. No clear answer in time leaves the lead with no outcome.
 */
export async function qualifyContact(rpc: Rpc, contactId: string, o: { ask?: Ask | null; timeoutMs?: number; force?: boolean } = {}): Promise<QualifyResult> {
  const l = await call<QualifyLoaded | null>(rpc, "qualify_load", { p_contact: contactId });
  if (!l) return { status: "none" };
  const s = cleanQualify(l.settings as never);
  if (!s.on) return { status: "off" };
  const c = l.contact;
  if (c.qualify_outcome && !o.force) return { status: "same" };
  if (c.route_status === "spam" || c.route_status === "held") return { status: "spam" };
  const ce = cleanEmail(c.email);
  if (isRejected(ce)) return { status: "spam" };

  const ruled = byRules(s, qualifyValues(l));
  if (ruled) {
    await call(rpc, "qualify_store", { p_contact: contactId, p_outcome: ruled.outcome, p_reason: ruled.reason, p_by: ruled.by, p_facts: [] });
    return { status: "decided", decision: ruled };
  }
  const ask = o.ask === undefined ? claudeAsk() : o.ask;
  if (!ask) return { status: "none" };
  const co = l.company ?? {};
  const facts: LeadFacts = {
    answers: Object.fromEntries(Object.entries(l.answers ?? {}).map(([k, v]) => [k, text(v)])),
    person: Object.fromEntries(Object.entries({ title: c.title, seniority: c.seniority, department: c.department, country: c.country, "email type": c.email_class }).map(([k, v]) => [k, text(v)])),
    company: Object.fromEntries(Object.entries({ name: co.name, website: co.domain, industry: co.industry, size: co.size, employees: co.employees, country: co.country, founded: co.founded }).map(([k, v]) => [k, text(v)])),
    score: c.score,
  };
  const { system, user } = qualifyPrompt(s, facts);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), o.timeoutMs ?? 3000);
  try {
    const r = await cachedStep(rpc, c.workspace_id, "qualify", qualifyKey(s, facts), async () => {
      const out = await ask(system, user, qualifySchema(s), ac.signal).catch(() => null);
      const decision = out ? readAnswer(s, out.output) : null;
      // Only a usable answer is kept, so a bad or empty one is asked again next time.
      return { result: decision, model: "claude-haiku-5-5", usage: out?.usage ?? { input: 0, output: 0, cache_read: 0, cache_write: 0 }, keep: !!decision };
    });
    const d = r.result ? readAnswer(s, r.result) : null;
    if (!d) return { status: "none" };
    await call(rpc, "qualify_store", { p_contact: contactId, p_outcome: d.outcome, p_reason: d.reason, p_by: "ai", p_facts: d.facts });
    return { status: "decided", decision: d, cached: r.cached };
  } finally {
    clearTimeout(timer);
  }
}
