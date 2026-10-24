// The built-in email check (docs/enrich-workflows-reports.md 1.2 A, step 3): the address parses, its domain isn't a
// throwaway one, and the domain takes mail (an MX record, or an A record as RFC 5321 allows). Free; DNS only.

import { promises as dns } from "node:dns";
import { cleanEmail, isRejected } from "../identity/clean.ts";
import type { EmailCheck } from "./types.ts";

export type MxLookup = (domain: string) => Promise<"yes" | "no" | "unknown">;

// Empty answers and "no such name" mean no mail server. Anything else (a timeout) tells us nothing.
const NONE = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);

export const systemMx: MxLookup = async (domain) => {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx.some((m) => m.exchange && m.exchange !== ".")) return "yes";
  } catch (e) {
    if (!NONE.has((e as { code?: string }).code ?? "")) return "unknown";
  }
  try {
    return (await dns.resolve4(domain)).length ? "yes" : "no";
  } catch (e) {
    return NONE.has((e as { code?: string }).code ?? "") ? "no" : "unknown";
  }
};

export async function checkEmail(raw: string, o: { mx?: MxLookup; timeoutMs?: number; own?: string[] } = {}): Promise<EmailCheck> {
  const c = cleanEmail(raw, { own_domains: o.own });
  if (isRejected(c)) return { ok: false, reason: c.rejected === "disposable" ? "disposable" : "invalid", class: null, domain: null };
  const domain = c.domain;
  if (!domain) return { ok: false, reason: "invalid", class: null, domain: null };
  const lookup = o.mx ?? systemMx;
  const answer = await Promise.race([lookup(domain), new Promise<"unknown">((r) => setTimeout(() => r("unknown"), o.timeoutMs ?? 1500))]);
  // A slow DNS answer never marks a real lead bad.
  if (answer === "no") return { ok: false, reason: "no_mail_server", class: c.class, domain };
  return { ok: true, reason: answer === "yes" ? "ok" : "unknown", class: c.class, domain };
}
