// A sending domain's DNS records and their state (Settings › Sending, docs/enrich-workflows-reports.md Part 0).
//   Resend's records: a DKIM TXT at resend._domainkey, and an MX and an SPF TXT on the send. return path.
//   DMARC: a TXT at _dmarc (or on a parent domain); p=none is enough. Resend doesn't check it, we do.
// Resend's word wins for its own records. Our DNS lookup only tells "waiting" from "wrong" while Resend waits.
// Sending stays blocked until Resend says verified and a DMARC record exists.

import { promises as dns } from "node:dns";
import type { ResendDomain, ResendRecord } from "./resend.ts";

export type RecordState = "verified" | "waiting" | "wrong";
export type DnsRecord = { key: string; type: "CNAME" | "MX" | "TXT"; name: string; value: string; status: RecordState; seen?: string };
export type DomainRow = { id: string; domain: string; provider_id: string | null };

export type Resolver = {
  mx: (name: string) => Promise<{ exchange: string; priority: number }[]>;
  txt: (name: string) => Promise<string[][]>;
  cname: (name: string) => Promise<string[]>;
};

export const systemResolver: Resolver = { cname: (n) => dns.resolveCname(n), mx: (n) => dns.resolveMx(n), txt: (n) => dns.resolveTxt(n) };

/**
 * The full host for a record name Resend gives relative to the domain's zone. "send" on mail.acme.com is
 * send.mail.acme.com; "send.mail" on mail.acme.com is the same host (the name already ends with the domain's first
 * label); a full name stays as it is.
 */
export function hostOf(name: string, domain: string): string {
  const n = name.toLowerCase().replace(/\.$/, "");
  const d = domain.toLowerCase();
  if (n === d || n.endsWith(`.${d}`) || n === "@" || n === "") return n === "@" || n === "" ? d : n;
  const nl = n.split(".");
  const dl = d.split(".");
  // The longest run of the name's last labels that matches the domain's first labels, short of the whole domain.
  for (let k = Math.min(nl.length - 1, dl.length - 1); k > 0; k--) {
    if (nl.slice(nl.length - k).join(".") === dl.slice(0, k).join(".")) return [...nl, ...dl.slice(k)].join(".");
  }
  return `${n}.${d}`;
}

const dmarcRecord = (domain: string): Omit<DnsRecord, "status"> => ({ key: "dmarc", type: "TXT", name: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain}` });

/** Our record list from Resend's: DKIM, then the return path's MX and SPF, then DMARC. */
export function expectedRecords(domain: string, rs: ResendRecord[]): (Omit<DnsRecord, "status"> & { resend?: string })[] {
  const out: (Omit<DnsRecord, "status"> & { resend?: string })[] = [];
  const count: Record<string, number> = {};
  const order = (r: ResendRecord) => (r.record === "DKIM" ? 0 : r.type === "MX" ? 1 : 2);
  for (const r of [...rs].sort((a, b) => order(a) - order(b))) {
    const type = (["CNAME", "MX", "TXT"].includes(r.type) ? r.type : "TXT") as DnsRecord["type"];
    const base = r.record === "DKIM" ? "dkim" : type === "MX" ? "mx" : r.record === "SPF" ? "spf" : (r.record || type).toLowerCase().replace(/[^a-z]/g, "");
    count[base] = (count[base] ?? 0) + 1;
    out.push({ key: count[base] > 1 ? `${base}${count[base]}` : base, type, name: hostOf(r.name, domain), value: type === "MX" ? `${r.priority ?? 10} ${r.value}` : r.value, resend: r.status });
  }
  out.push(dmarcRecord(domain));
  return out;
}

// Empty answers and "no such name" mean the record isn't there yet. Anything else (a timeout) tells us nothing.
const missing = (e: unknown) => ["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"].includes((e as { code?: string }).code ?? "");
async function look<T>(f: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await f();
  } catch (e) {
    return missing(e) ? [] : null;
  }
}
const same = (a: string, b: string) => a.toLowerCase().replace(/\.$/, "") === b.toLowerCase().replace(/\.$/, "");
const squash = (s: string) => s.replace(/\s+/g, "").replace(/^"|"$/g, "");

/** Check every record against Resend's answer and DNS. */
export async function checkRecords(domain: string, rd: ResendDomain, r: Resolver = systemResolver): Promise<{ records: DnsRecord[]; status: "pending" | "verified" | "failed" }> {
  const records: DnsRecord[] = [];
  for (const w of expectedRecords(domain, rd.records)) {
    const { resend, ...rec } = w;
    if (rec.key === "dmarc") {
      const found = await dmarcOf(domain, r);
      records.push({ ...rec, status: found.ok ? "verified" : found.seen ? "wrong" : "waiting", ...(found.seen ? { seen: found.seen } : {}) });
      continue;
    }
    if (resend === "verified") {
      records.push({ ...rec, status: "verified" });
      continue;
    }
    if (rec.type === "MX") {
      const got = await look(() => r.mx(rec.name));
      const host = rec.value.split(" ").pop() ?? "";
      records.push({ ...rec, status: got?.length && !got.some((g) => same(g.exchange, host)) ? "wrong" : "waiting", ...(got?.length ? { seen: got.map((g) => `${g.priority} ${g.exchange}`).join(", ") } : {}) });
    } else if (rec.type === "CNAME") {
      const got = await look(() => r.cname(rec.name));
      records.push({ ...rec, status: got?.length && !got.some((g) => same(g, rec.value)) ? "wrong" : "waiting", ...(got?.length ? { seen: got.join(", ") } : {}) });
    } else {
      const got = (await look(() => r.txt(rec.name)))?.map((p) => p.join("")) ?? null;
      // An SPF host can hold one SPF record only; a DKIM host holds the key.
      const rel = rec.key.startsWith("spf") ? (got ?? []).filter((t) => /^v=spf1\b/i.test(t)) : (got ?? []);
      const ok = rel.some((t) => squash(t) === squash(rec.value));
      records.push({ ...rec, status: rel.length && !ok ? "wrong" : "waiting", ...(rel.length ? { seen: rel.join(" | ").slice(0, 300) } : {}) });
    }
  }
  const dmarc = records.find((x) => x.key === "dmarc")?.status === "verified";
  const status = rd.status === "failed" ? "failed" : rd.status === "verified" && dmarc ? "verified" : "pending";
  return { records, status };
}

/** A DMARC record at _dmarc.<domain>, or on a parent domain (DMARC falls back to the organizational domain). */
async function dmarcOf(domain: string, r: Resolver): Promise<{ ok: boolean; seen?: string }> {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const got = (await look(() => r.txt(`_dmarc.${parts.slice(i).join(".")}`)))?.map((p) => p.join("")) ?? [];
    if (!got.length) continue;
    const rec = got.find((t) => /^v=DMARC1\s*(;|$)/i.test(t));
    return rec ? { ok: true, seen: rec } : { ok: false, seen: got.join(" | ") };
  }
  return { ok: false };
}
