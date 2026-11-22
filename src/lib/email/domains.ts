// Sending domains (docs/marketing-platform.md M3, Settings › Sending): the DNS records a customer adds, and the
// check that reads them back. DKIM is three SES CNAMEs (Easy DKIM), SPF rides on a custom MAIL FROM subdomain (an
// MX and a TXT record), and DMARC must exist on the domain or its organizational domain.

import { promises as dns } from "node:dns";

import { orgDomain, type DomainRow, type RecordKey, type RecordState } from "./records.ts";

export * from "./records.ts";

export type Resolver = {
  cname(name: string): Promise<string[]>;
  mx(name: string): Promise<{ exchange: string; priority: number }[]>;
  txt(name: string): Promise<string[][]>;
};

export const nodeResolver: Resolver = { cname: (n) => dns.resolveCname(n), mx: (n) => dns.resolveMx(n), txt: (n) => dns.resolveTxt(n) };

/** A lookup that found nothing (waiting), found something (the value), or failed in a way that says neither (error). */
async function look<T>(fn: () => Promise<T>): Promise<T | "missing" | "error"> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === "ENOTFOUND" || code === "ENODATA" || code === "ENONAME" || code === "NXDOMAIN" ? "missing" : "error";
  }
}

const norm = (s: string) => s.toLowerCase().replace(/\.$/, "");

/** Each record's state. "error" means DNS didn't answer; the database keeps the last state for those. */
export async function checkRecords(d: DomainRow, r: Resolver = nodeResolver): Promise<Record<RecordKey, RecordState | "error">> {
  const region = d.region ?? "us-east-1";
  const out = {} as Record<RecordKey, RecordState | "error">;
  await Promise.all(
    [0, 1, 2].map(async (i) => {
      const key = `dkim${i + 1}` as RecordKey;
      const t = d.dkim_tokens[i];
      if (!t) return void (out[key] = "waiting");
      const got = await look(() => r.cname(`${t}._domainkey.${d.domain}`));
      out[key] = typeof got === "string" ? (got === "missing" ? "waiting" : "error") : got.map(norm).includes(`${t}.dkim.amazonses.com`) ? "verified" : "wrong";
    }),
  );
  const mx = await look(() => r.mx(d.mail_from));
  out.spf_mx = typeof mx === "string" ? (mx === "missing" ? "waiting" : "error") : mx.some((m) => norm(m.exchange) === `feedback-smtp.${region}.amazonses.com`) ? "verified" : "wrong";

  const txt = await look(() => r.txt(d.mail_from));
  if (typeof txt === "string") out.spf_txt = txt === "missing" ? "waiting" : "error";
  else {
    const spf = txt.map((parts) => parts.join("").trim()).filter((s) => /^v=spf1\b/i.test(s));
    out.spf_txt = spf.length === 0 ? "waiting" : spf.length === 1 && /\binclude:amazonses\.com\b/i.test(spf[0]!) ? "verified" : "wrong";
  }

  // DMARC on the domain itself, else on its organizational domain (RFC 7489 6.6.3).
  const names = [...new Set([`_dmarc.${d.domain}`, `_dmarc.${orgDomain(d.domain)}`])];
  let dmarc: RecordState | "error" = "waiting";
  for (const name of names) {
    const got = await look(() => r.txt(name));
    if (got === "error") {
      dmarc = "error";
      break;
    }
    if (got === "missing") continue;
    const recs = got.map((parts) => parts.join("").trim()).filter((s) => /^v=DMARC1/i.test(s));
    if (recs.length === 0) continue;
    dmarc = recs.length === 1 && /;\s*p=(none|quarantine|reject)\b/i.test(recs[0]!) ? "verified" : "wrong";
    break;
  }
  out.dmarc = dmarc;
  return out;
}
