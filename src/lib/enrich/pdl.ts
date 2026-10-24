// People Data Labs person enrichment by email (docs/enrich-workflows-reports.md 1.2 A, step 5).
// GET https://api.peopledatalabs.com/v5/person/enrich?email=…&min_likelihood=6 with the key in X-Api-Key. A match is
// 200 and costs a credit; no match is 404 and costs nothing (check). Field names follow PDL's person schema (check).

import { countryCode } from "../contacts/fields.ts";
import type { Department, Seniority } from "../contacts/clean.ts";
import type { Person } from "./types.ts";

export class VendorError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const SENIORITY: Record<string, Seniority> = { cxo: "C-level", owner: "C-level", partner: "C-level", vp: "VP", director: "Director", manager: "Manager", senior: "Individual", entry: "Individual", training: "Individual", unpaid: "Individual" };
const LEVEL_ORDER = ["cxo", "owner", "partner", "vp", "director", "manager", "senior", "entry", "training", "unpaid"];
const DEPARTMENT: Record<string, Department> = {
  sales: "Sales",
  marketing: "Marketing",
  engineering: "Engineering",
  design: "Product",
  product: "Product",
  finance: "Finance",
  human_resources: "HR",
  operations: "Operations",
  customer_service: "Operations",
  legal: "Other",
  education: "Other",
  health: "Other",
  media: "Marketing",
  public_relations: "Marketing",
  real_estate: "Other",
  research: "Engineering",
  trades: "Other",
};

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const titleCase = (s: string | undefined) => s?.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readPdl(d: any): Person {
  const levels: string[] = Array.isArray(d?.job_title_levels) ? d.job_title_levels.map((x: unknown) => String(x).toLowerCase()) : [];
  const level = LEVEL_ORDER.find((l) => levels.includes(l));
  const role = typeof d?.job_title_role === "string" ? d.job_title_role.toLowerCase() : "";
  const linkedin = str(d?.linkedin_url, 300);
  const country = str(d?.location_country, 80);
  return Object.fromEntries(
    Object.entries({
      first_name: titleCase(str(d?.first_name, 80)),
      last_name: titleCase(str(d?.last_name, 80)),
      title: titleCase(str(d?.job_title, 160)),
      seniority: level ? SENIORITY[level] : undefined,
      department: role ? (DEPARTMENT[role] ?? "Other") : undefined,
      linkedin_url: linkedin ? (linkedin.startsWith("http") ? linkedin : `https://${linkedin}`) : undefined,
      country: country ? countryCode(country) : undefined,
    }).filter(([, v]) => v !== undefined),
  ) as Person;
}

/** The person behind an email, or null when PDL has no match. Throws VendorError on anything else. */
export async function pdlPerson(email: string, o: { apiKey: string; fetcher?: typeof fetch; signal?: AbortSignal }): Promise<Person | null> {
  let res: Response;
  try {
    res = await (o.fetcher ?? fetch)(`https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}&min_likelihood=6`, {
      headers: { "X-Api-Key": o.apiKey, accept: "application/json" },
      signal: o.signal ?? AbortSignal.timeout(4000),
    });
  } catch (e) {
    throw new VendorError(`People Data Labs didn't answer: ${(e as Error).message}`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new VendorError(`People Data Labs ${res.status}`, res.status);
  const j = (await res.json().catch(() => null)) as { data?: unknown } | null;
  if (!j?.data) return null;
  return readPdl(j.data);
}
