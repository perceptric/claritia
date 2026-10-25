// The enrichment waterfall (docs/enrich-workflows-reports.md 1.2 A). In order: the team's own records, the shared
// caches, the email check, then each vendor the team has on. Each side (person, company) stops at its first good
// answer. A vendor that errs, is slow, or is out of time is skipped and the next one runs; nothing here ever blocks a
// lead. A credit is taken before a paid call and given back when the call finds nothing or fails, so two lookups at
// the last credit can't both go through.

import type { Firmo } from "../company/coresignal.ts";
import type { Company, EmailCheck, Enriched, Person, Source, StepId, StepResult } from "./types.ts";

export type Cached<T> = { data: T | null; notFound: boolean; vendor: string };

export type WaterfallDeps = {
  now?: () => number;
  getPerson: (email: string) => Promise<Cached<Person> | null>;
  putPerson: (email: string, vendor: string, data: Person | null) => Promise<void>;
  getCompany: (domain: string) => Promise<Cached<Company> | null>;
  putCompany: (domain: string, vendor: string, data: Company | null) => Promise<void>;
  /** Take credits under the cap; false at the cap. */
  spend: (credits: number) => Promise<boolean>;
  refund: (credits: number) => Promise<void>;
  emailCheck?: (email: string, timeoutMs: number) => Promise<EmailCheck>;
  company?: (domain: string, key: string | null, signal: AbortSignal) => Promise<Company | null>;
  person?: (email: string, key: string | null, signal: AbortSignal) => Promise<Person | null>;
};

export type WaterfallInput = {
  email: string;
  /** The address's class from cleaning: work, free, role, own or partner. */
  emailClass: string | null;
  domain: string | null;
  /** What the team's records already hold. */
  have: { person: Person; company: Company | null };
  sources: Source[];
  /** When the whole lookup must be done (ms since epoch). */
  deadline: number;
  /** Use only records and caches: the submit path, where nothing may wait on a vendor. */
  cacheOnly?: boolean;
};

const filled = (o: object | null | undefined) => !!o && Object.values(o).some((v) => v !== undefined && v !== null && v !== "");
// A person needs a vendor until the title and the seniority are known; a company until its size and industry are.
const personDone = (p: Person) => !!p.title && !!p.seniority;
const companyDone = (c: Company | null) => !!c && !!c.size && !!c.industry;
const merge = <T extends object>(base: T | null, add: T | null): T | null => {
  if (!add) return base;
  const out = { ...(base ?? {}) } as Record<string, unknown>;
  for (const [k, v] of Object.entries(add)) if (out[k] === undefined || out[k] === null || out[k] === "") out[k] = v;
  return out as T;
};

/** A Coresignal company (or a cache row in that shape) as our company. */
export function fromFirmo(f: Partial<Firmo> | null | undefined, domain: string): Company | null {
  if (!f) return null;
  const c: Company = { domain };
  if (f.name) c.name = f.name;
  if (typeof f.employees === "number") c.employees = f.employees;
  if (f.size) c.size = f.size;
  if (f.industry) c.industry = f.industry;
  if (f.country) c.country = f.country;
  if (typeof f.founded === "number") c.founded = f.founded;
  if (f.type) c.type = f.type;
  return c;
}

export async function runWaterfall(input: WaterfallInput, deps: WaterfallDeps): Promise<Enriched> {
  const now = deps.now ?? Date.now;
  const steps: StepResult[] = [];
  let person: Person = { ...input.have.person };
  let company: Company | null = input.have.company ? { ...input.have.company } : null;
  let personFrom: string | null = filled(input.have.person) ? "records" : null;
  let companyFrom: string | null = filled(input.have.company) ? "records" : null;
  let check: EmailCheck | null = null;
  let credits = 0;
  const email = input.email.trim().toLowerCase();
  const domain = input.domain?.toLowerCase() ?? null;
  // A company lookup by domain makes sense for work and role addresses; a person lookup only for work ones.
  const companyOk = !!domain && (input.emailClass === "work" || input.emailClass === "role");
  const personOk = input.emailClass === "work";

  steps.push({ step: "records", result: personDone(person) && companyDone(company) ? "hit" : filled(person) || filled(company) ? "hit" : "miss", ms: 0 });

  // Shared caches: free, and they hold "not found" too so a miss isn't paid for twice.
  const t0 = now();
  let personNotFound = false;
  let companyNotFound = false;
  if (personOk && !personDone(person)) {
    const hit = await deps.getPerson(email).catch(() => null);
    if (hit?.notFound) personNotFound = true;
    else if (hit?.data) {
      person = merge(person, hit.data)!;
      // What the cache adds is written under the vendor that found it.
      personFrom = personFrom === "records" || !personFrom ? hit.vendor : personFrom;
    }
  }
  if (companyOk && !companyDone(company)) {
    const hit = await deps.getCompany(domain!).catch(() => null);
    if (hit?.notFound) companyNotFound = true;
    else if (hit?.data) {
      company = merge(company, hit.data);
      companyFrom = companyFrom === "records" || !companyFrom ? hit.vendor : companyFrom;
    }
  }
  steps.push({ step: "cache", result: personFrom && personFrom !== "records" ? "hit" : companyFrom && companyFrom !== "records" ? "hit" : personNotFound || companyNotFound ? "hit" : "miss", ms: now() - t0 });

  for (const s of input.sources) {
    if (!s.on) {
      steps.push({ step: s.step, result: "skipped", ms: 0, note: "off" });
      continue;
    }
    if (input.cacheOnly && s.step !== "email_check") {
      steps.push({ step: s.step, result: "skipped", ms: 0, note: "cache only" });
      continue;
    }
    const left = input.deadline - now();
    if (left < 200) {
      steps.push({ step: s.step, result: "time", ms: 0 });
      continue;
    }
    const started = now();
    const budget = Math.min(s.timeoutMs, left);

    if (s.step === "email_check") {
      if (!deps.emailCheck || input.cacheOnly) {
        steps.push({ step: s.step, result: "skipped", ms: 0 });
        continue;
      }
      check = await deps.emailCheck(email, budget).catch(() => null);
      steps.push({ step: s.step, result: check ? "hit" : "error", ms: now() - started, ...(check && !check.ok ? { note: check.reason } : {}) });
      // A throwaway or dead address isn't worth paying for.
      if (check && !check.ok) {
        for (const rest of input.sources.slice(input.sources.indexOf(s) + 1)) steps.push({ step: rest.step, result: "skipped", ms: 0, note: check.reason });
        break;
      }
      continue;
    }

    const kind: "company" | "person" = s.step === "coresignal" ? "company" : "person";
    const call = kind === "company" ? deps.company : deps.person;
    const wanted = kind === "company" ? companyOk && !companyDone(company) && !companyNotFound : personOk && !personDone(person) && !personNotFound;
    if (!call || !wanted) {
      steps.push({ step: s.step, result: "skipped", ms: 0, ...(call ? {} : { note: "not set up" }) });
      continue;
    }
    // The team's own key costs us nothing, so it takes no credit.
    const paid = !s.key;
    if (paid && !(await deps.spend(1).catch(() => false))) {
      steps.push({ step: s.step, result: "cap", ms: 0 });
      continue;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), budget);
    try {
      const got = await Promise.race([
        kind === "company" ? deps.company!(domain!, s.key, ac.signal) : deps.person!(email, s.key, ac.signal),
        new Promise<never>((_, rej) => ac.signal.addEventListener("abort", () => rej(Object.assign(new Error("Took too long"), { timeout: true })))),
      ]);
      if (got && filled(got)) {
        if (kind === "company") {
          company = merge(company, { ...(got as Company), domain: domain! });
          companyFrom = companyFrom === "records" || !companyFrom ? s.step : companyFrom;
          await deps.putCompany(domain!, s.step, { ...(got as Company), domain: domain! }).catch(() => {});
        } else {
          person = merge(person, got as Person)!;
          personFrom = personFrom === "records" || !personFrom ? s.step : personFrom;
          await deps.putPerson(email, s.step, got as Person).catch(() => {});
        }
        if (paid) credits += 1;
        steps.push({ step: s.step, result: "hit", ms: now() - started });
      } else {
        if (paid) await deps.refund(1).catch(() => {});
        if (kind === "company") await deps.putCompany(domain!, s.step, null).catch(() => {});
        else await deps.putPerson(email, s.step, null).catch(() => {});
        steps.push({ step: s.step, result: "miss", ms: now() - started });
      }
    } catch (e) {
      if (paid) await deps.refund(1).catch(() => {});
      const timeout = (e as { timeout?: boolean }).timeout || ac.signal.aborted;
      steps.push({ step: s.step, result: timeout ? "time" : "error", ms: now() - started, note: (e as Error).message.slice(0, 120) });
    } finally {
      clearTimeout(timer);
    }
  }

  return { person, company, personFrom, companyFrom, check, steps, credits };
}

export type { StepId };
