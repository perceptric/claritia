// The DNS records for a sending domain (Settings › Sending). Pure, so the browser can show them; the check that
// reads them back is in domains.ts.

import psl from "psl";

export type RecordKey = "dkim1" | "dkim2" | "dkim3" | "spf_mx" | "spf_txt" | "dmarc";
export type RecordState = "verified" | "waiting" | "wrong";
export type DnsRecord = { key: RecordKey; type: "CNAME" | "MX" | "TXT"; name: string; value: string };
export type DomainRow = { domain: string; mail_from: string; region: string | null; dkim_tokens: string[] };

export const RECORD_KEYS: RecordKey[] = ["dkim1", "dkim2", "dkim3", "spf_mx", "spf_txt", "dmarc"];

/** The organizational domain: mail.acme.co.uk → acme.co.uk. */
export const orgDomain = (domain: string) => (psl.get(domain) as string | null) ?? domain;

/** The records to add. DKIM rows appear once SES has made the keys. */
export function recordsFor(d: DomainRow): DnsRecord[] {
  const region = d.region ?? "us-east-1";
  const out: DnsRecord[] = d.dkim_tokens.slice(0, 3).map((t, i) => ({
    key: `dkim${i + 1}` as RecordKey,
    type: "CNAME",
    name: `${t}._domainkey.${d.domain}`,
    value: `${t}.dkim.amazonses.com`,
  }));
  out.push(
    { key: "spf_mx", type: "MX", name: d.mail_from, value: `10 feedback-smtp.${region}.amazonses.com` },
    { key: "spf_txt", type: "TXT", name: d.mail_from, value: "v=spf1 include:amazonses.com ~all" },
    { key: "dmarc", type: "TXT", name: `_dmarc.${orgDomain(d.domain)}`, value: `v=DMARC1; p=none; rua=mailto:dmarc@${orgDomain(d.domain)}` },
  );
  return out;
}
