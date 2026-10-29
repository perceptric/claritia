// The final email for one message: tracked links, the parts meant for this person (conditions from the email
// builder), merge values, the preheader, the footer a marketing email can't drop, and the one-click unsubscribe
// headers Gmail and Yahoo require of bulk senders (RFC 8058).

import { fromHeader, type Outgoing } from "./provider.ts";
import { fillMerge } from "../workflows/merge.ts";
import { makeToken, rewriteLinks } from "./track.ts";
import { applyConditions } from "../design/email/compile.ts";

/** What send_claim hands the worker for each message (supabase/migrations/039_email.sql). */
export type Claimed = {
  id: string;
  to: string;
  contact_id: string | null;
  email_id: string;
  kind: "broadcast" | "journey" | "one_to_one" | "test";
  marketing: boolean;
  subject: string;
  preheader: string | null;
  html: string;
  text: string;
  links: string[];
  from_name: string | null;
  from_email: string;
  reply_to: string | null;
  address: string | null;
  topic: string | null;
  mail_from: string | null;
  per_second: number;
  /** Tries so far, this one included (067_resend.sql). */
  attempts?: number;
  /** Merge values for {{first_name|there}} and the rest (069_workflows.sql). */
  vars?: Record<string, string | null> | null;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export const linkBase = (env: NodeJS.ProcessEnv = process.env) => env.APP_URL?.trim().replace(/\/+$/, "") || "https://app.tryclaritia.com";

export function renderMessage(m: Claimed, o: { base: string; secret?: string }): Outgoing {
  const unsub = `${o.base}/u/${makeToken({ kind: "unsub", message: m.id, link: 0 }, o.secret)}`;
  // Merge values: as typed in the subject and text, escaped in the html.
  const vars = m.vars ?? {};
  const htmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, v ? esc(v) : v]));
  // Links take their place first, as stored (emails.links), so a part left out for this person or a merge value can
  // never move a click onto another link.
  let html = rewriteLinks(m.html, (i) => `${o.base}/c/${makeToken({ kind: "click", message: m.id, link: i }, o.secret)}`);
  let text = m.text;
  html = applyConditions(html, vars);
  text = applyConditions(text, vars);
  // An email built with blocks carries its own footer: its unsubscribe link and the sender's address go in here. If
  // this person's copy has none (a condition left it out), the fixed footer below is added as for any email.
  const ownFooter = html.includes("{{unsubscribe_url}}");
  const address = oneLine(m.address ?? "");
  html = html.replace(/\{\{unsubscribe_url\}\}/g, unsub).replace(/\{\{company_address\}\}/g, esc(address));
  text = text.replace(/\{\{unsubscribe_url\}\}/g, unsub).replace(/\{\{company_address\}\}/g, address);
  html = fillMerge(html, htmlVars);
  text = fillMerge(text, vars);
  m = { ...m, subject: fillMerge(m.subject, vars), preheader: m.preheader ? fillMerge(m.preheader, vars) : m.preheader };

  if (m.preheader?.trim()) {
    const pre = `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(oneLine(m.preheader))}</div>`;
    html = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (b) => `${b}${pre}`) : `${pre}${html}`;
  }

  const headers: Outgoing["headers"] = [];
  if (m.marketing && ownFooter) headers.push({ name: "List-Unsubscribe", value: `<${unsub}>` }, { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
  else if (m.marketing) {
    const who = [m.from_name, m.address].map((x) => oneLine(x ?? "")).filter(Boolean);
    const footer =
      `<div style="margin:32px 0 0;padding:16px 0 0;border-top:1px solid #e5e7eb;font:12px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#6b7280;text-align:center">` +
      (who.length ? `${esc(who.join(" · "))}<br>` : "") +
      `<a href="${unsub}" style="color:#6b7280;text-decoration:underline">Unsubscribe</a></div>`;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
    text = `${text.trimEnd()}\n\n--\n${who.length ? `${who.join(" · ")}\n` : ""}Unsubscribe: ${unsub}\n`;
    headers.push({ name: "List-Unsubscribe", value: `<${unsub}>` }, { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" });
  }

  return {
    from: fromHeader(m.from_name, m.from_email),
    to: m.to,
    replyTo: m.reply_to,
    subject: oneLine(m.subject),
    html,
    text,
    headers,
    tags: { message: m.id, email: m.email_id },
  };
}
