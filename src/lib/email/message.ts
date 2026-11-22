// One message as SES receives it: the footer with the postal address and unsubscribe link, the preheader, tracked
// links, a plain-text part, and the one-click unsubscribe headers (RFC 8058), as raw MIME.

import { createHash, randomBytes } from "node:crypto";
import { clickUrl, rewriteLinks, unsubscribeToken } from "./track.ts";

/** What send_claim hands the send job (supabase/migrations/039_email.sql). */
export type Claimed = {
  action: "send";
  id: string;
  workspace_id: string;
  kind: "marketing" | "test";
  to: string;
  from_email: string;
  from_name: string | null;
  reply_to: string | null;
  subject: string;
  preheader: string | null;
  html: string;
  text: string | null;
  config_set: string | null;
  footer_address: string | null;
  workspace_name: string | null;
  contact: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

export type Built = { raw: string; subject: string; bodyHash: string; unsubscribeUrl: string; html: string; text: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function headerValue(v: string): string {
  if (/[\r\n]/.test(v)) throw new Error("A header can't hold a line break");
  return v;
}

// RFC 2047 encoded words, split so no word passes 75 characters and no character is cut in half.
function encodeWords(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

function address(email: string, name?: string | null): string {
  if (!/^[^@\s<>"]+@[^@\s<>"]+$/.test(email)) throw new Error(`Not an email address: ${email.slice(0, 100)}`);
  const n = name ? headerValue(name).trim() : "";
  if (!n) return email;
  if (/^[\x20-\x7e]*$/.test(n)) return `"${n.replace(/["\\]/g, "\\$&")}" <${email}>`;
  return `${encodeWords(n)} <${email}>`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();

/** Plain text from HTML: line breaks for blocks, links as "label (url)". */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const l = label.replace(/<[^>]+>/g, "").trim();
      return l && l !== href ? `${l} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)>/gi, "\n\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&(amp|quot|#39|lt|gt);/gi, (_, e: string) => ({ amp: "&", quot: '"', "#39": "'", lt: "<", gt: ">" })[e.toLowerCase()] ?? _)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildMessage(c: Claimed, o: { base: string; key: Buffer; boundary?: string }): Built {
  const unsubscribeUrl = `${o.base}/u/${unsubscribeToken(c.id, o.key)}`;
  const who = [c.workspace_name, c.footer_address].filter((x): x is string => !!x?.trim()).map((x) => x.trim());
  const footerHtml =
    `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font:12px/1.5 Arial,sans-serif;color:#6b6b6b">` +
    (who.length ? `${who.map(esc).join(" · ")}<br>` : "") +
    `<a href="${esc(unsubscribeUrl)}" style="color:#6b6b6b">Unsubscribe</a></div>`;
  const preheader = c.preheader?.trim()
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader.trim())}</div>`
    : "";

  let html = rewriteLinks(c.html, (url) => clickUrl(o.base, c.id, url, o.key), `${o.base}/u/`);
  html = /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, (b) => b + preheader) : preheader + html;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footerHtml}</body>`) : html + footerHtml;
  const text = `${(c.text?.trim() || htmlToText(c.html)).trim()}\n\n--\n${who.length ? `${who.join(" · ")}\n` : ""}Unsubscribe: ${unsubscribeUrl}\n`;

  const subject = c.subject.trim();
  const boundary = o.boundary ?? `clr_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${address(c.from_email, c.from_name)}`,
    `To: ${address(c.to)}`,
    ...(c.reply_to ? [`Reply-To: ${address(c.reply_to)}`] : []),
    `Subject: ${encodeWords(headerValue(subject))}`,
    "MIME-Version: 1.0",
    `List-Unsubscribe: <${headerValue(unsubscribeUrl)}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `X-Claritia-Message: ${c.id}`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(body, "utf8").toString("base64"))].join("\r\n");
  const raw = [...headers, "", part("text/plain", text), part("text/html", html), `--${boundary}--`, ""].join("\r\n");
  return { raw, subject, bodyHash: createHash("sha256").update(html).digest("hex"), unsubscribeUrl, html, text };
}
