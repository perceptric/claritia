// The email to a workspace's owners when their sending domain moves to Amazon SES (docs/ses-plan.md Step 4): the
// records to add, then reminders at 7 and 14 days with only the records still missing. Plain, in Claritia's look.

import type { DnsRecord } from "./domains.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function moveEmail(o: { domain: string; records: DnsRecord[]; step: 0 | 1 | 2; base: string }): { subject: string; html: string; text: string } {
  // The first email lists every record; a reminder only those still missing (DMARC only when it's missing too).
  const list = o.records.filter((r) => (o.step === 0 ? r.key !== "dmarc" || r.status !== "verified" : r.status !== "verified"));
  const n = list.length;
  const what = `${n} DNS ${n === 1 ? "record" : "records"}`;
  const subject = o.step === 0 ? `Add ${what} for ${o.domain}` : `Reminder: ${what} left for ${o.domain}`;
  const link = `${o.base}/settings/sending`;
  const lead =
    o.step === 0
      ? `Claritia is moving email sending to a new provider. Add these records where ${o.domain}'s DNS is managed. Your emails keep going as they do now, and once the records check out, sending switches over on its own.`
      : `These records for ${o.domain} aren't in place yet. Your emails keep going as they do now; sending switches over once they check out.`;
  const cell = "padding:8px 10px;border-bottom:1px solid #ececec;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#333;word-break:break-all;vertical-align:top";
  const head = "padding:8px 10px;border-bottom:1px solid #ececec;font:600 12px/1.5 Inter,system-ui,sans-serif;color:#666;text-align:left";
  const rows = list.map((r) => `<tr><td style="${cell}">${esc(r.type)}</td><td style="${cell}">${esc(r.name)}</td><td style="${cell}">${esc(r.value)}</td></tr>`).join("");
  const html =
    `<!doctype html><html><body style="margin:0;background:#f6f6f4"><div style="max-width:600px;margin:0 auto;padding:32px 20px;font:15px/1.6 Inter,system-ui,sans-serif;color:#1f1f1f">` +
    `<h1 style="font:600 20px/1.3 Inter,system-ui,sans-serif;margin:0 0 12px">${esc(subject)}</h1>` +
    `<p style="margin:0 0 20px">${esc(lead)}</p>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;box-shadow:0 0 0 1px #e6e6e6"><thead><tr><th style="${head}">Type</th><th style="${head}">Name</th><th style="${head}">Value</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="margin:24px 0"><a href="${esc(link)}" style="display:inline-block;background:#333;color:#fff;text-decoration:none;font:600 14px/1 Inter,system-ui,sans-serif;padding:12px 18px;border-radius:999px">Open Settings › Domains</a></p>` +
    `<p style="margin:0;color:#777;font-size:13px">Claritia</p></div></body></html>`;
  const text = [subject, "", lead, "", ...list.map((r) => `${r.type}  ${r.name}\n      ${r.value}`), "", `Settings › Domains: ${link}`, "", "Claritia"].join("\n");
  return { subject, html, text };
}
