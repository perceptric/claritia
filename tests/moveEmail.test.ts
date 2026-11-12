// The owner email for a domain moving to Amazon SES (docs/ses-plan.md Step 4): every record first, then reminders with
// only what's missing, the counts in the subject, everything escaped, and the link to Settings › Domains.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { DnsRecord } from "../src/lib/email/domains.ts";
import { moveEmail } from "../src/lib/email/moveEmail.ts";

const rec = (key: string, type: DnsRecord["type"], name: string, value: string, status: DnsRecord["status"] = "waiting"): DnsRecord => ({ key, type, name, value, status });
const records: DnsRecord[] = [
  rec("dkim1", "CNAME", "a._domainkey.acme.com", "a.dkim.amazonses.com"),
  rec("dkim2", "CNAME", "b._domainkey.acme.com", "b.dkim.amazonses.com"),
  rec("dkim3", "CNAME", "c._domainkey.acme.com", "c.dkim.amazonses.com"),
  rec("mx", "MX", "bounce.acme.com", "10 feedback-smtp.us-east-2.amazonses.com"),
  rec("spf", "TXT", "bounce.acme.com", "v=spf1 include:amazonses.com ~all"),
  rec("dmarc", "TXT", "_dmarc.acme.com", "v=DMARC1; p=none", "verified"),
];

test("the first email lists the five records, and DMARC only when it's missing", () => {
  const m = moveEmail({ domain: "acme.com", records, step: 0, base: "https://app.tryclaritia.com" });
  assert.equal(m.subject, "Add 5 DNS records for acme.com");
  for (const r of records.slice(0, 5)) assert.ok(m.html.includes(r.name) && m.text.includes(r.value), r.key);
  assert.ok(!m.html.includes("_dmarc.acme.com"), "DMARC is already there");
  assert.ok(m.html.includes('href="https://app.tryclaritia.com/settings/sending"'));
  assert.match(m.text, /Settings › Domains: https:\/\/app\.tryclaritia\.com\/settings\/sending/);
  const noDmarc = moveEmail({ domain: "acme.com", records: records.map((r) => (r.key === "dmarc" ? { ...r, status: "waiting" as const } : r)), step: 0, base: "https://x" });
  assert.equal(noDmarc.subject, "Add 6 DNS records for acme.com");
});

test("a reminder lists only what's still missing, and says how many", () => {
  const some = records.map((r) => (r.key.startsWith("dkim") ? { ...r, status: "verified" as const } : r));
  const m = moveEmail({ domain: "acme.com", records: some, step: 1, base: "https://x" });
  assert.equal(m.subject, "Reminder: 2 DNS records left for acme.com");
  assert.ok(!m.html.includes("a._domainkey") && m.html.includes("bounce.acme.com"));
  const last = moveEmail({ domain: "acme.com", records: records.map((r) => (r.key === "spf" ? r : { ...r, status: "verified" as const })), step: 2, base: "https://x" });
  assert.equal(last.subject, "Reminder: 1 DNS record left for acme.com");
});

test("names and values are escaped", () => {
  const m = moveEmail({ domain: "a<b>.com", records: [rec("spf", "TXT", "x<script>", `"quoted" & more`)], step: 0, base: "https://x" });
  assert.ok(!m.html.includes("<script>") && m.html.includes("x&lt;script&gt;") && m.html.includes("&quot;quoted&quot; &amp; more"));
});
