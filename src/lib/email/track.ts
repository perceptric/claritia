// Tracked links and unsubscribe links in marketing email (docs/marketing-platform.md M3, docs/identity.md 5.6).
//   Unsubscribe: <base>/u/<id>.<sig>. Click: <base>/c/<id>.<sig>?u=<url>. The id is the message's uuid in
//   base64url and the signature an HMAC over it (and the URL, for clicks), so links can't be forged or pointed
//   elsewhere, and a click needs nothing stored before the send.

import { createHmac, timingSafeEqual } from "node:crypto";

/** The key for link signatures, from SECRETS_KEY. */
export function linkKey(secret = process.env.SECRETS_KEY): Buffer {
  const s = secret?.trim();
  if (!s || s.length < 32) throw new Error("Add SECRETS_KEY (32 or more random characters) on the server.");
  return createHmac("sha256", s).update("claritia:email-links:v1").digest();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOut = (id: string) => Buffer.from(id.replace(/-/g, ""), "hex").toString("base64url");
function idIn(s: string): string | null {
  if (!/^[A-Za-z0-9_-]{22}$/.test(s)) return null;
  const hex = Buffer.from(s, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID.test(id) ? id : null;
}
const sig = (key: Buffer, what: string, len: number) => createHmac("sha256", key).update(what).digest("base64url").slice(0, len);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function unsubscribeToken(messageId: string, key: Buffer): string {
  if (!UUID.test(messageId)) throw new Error("Not a message id");
  return `${idOut(messageId)}.${sig(key, `u|${messageId}`, 22)}`;
}

/** The message id in an unsubscribe token, or null if it isn't one of ours. */
export function readUnsubscribeToken(token: string, key: Buffer): string | null {
  const [a, b, extra] = token.split(".");
  if (!a || !b || extra !== undefined) return null;
  const id = idIn(a);
  return id && same(b, sig(key, `u|${id}`, 22)) ? id : null;
}

export function clickUrl(base: string, messageId: string, url: string, key: Buffer): string {
  return `${base}/c/${idOut(messageId)}.${sig(key, `c|${messageId}|${url}`, 16)}?u=${encodeURIComponent(url)}`;
}

/** The message id when the token signs this URL, else null. */
export function readClick(token: string, url: string, key: Buffer): string | null {
  const [a, b, extra] = token.split(".");
  if (!a || !b || extra !== undefined || !/^https?:\/\//i.test(url)) return null;
  const id = idIn(a);
  return id && same(b, sig(key, `c|${id}|${url}`, 16)) ? id : null;
}

const decode = (s: string) => s.replace(/&(amp|quot|#39|#x27|lt|gt);/gi, (_, e: string) => ({ amp: "&", quot: '"', "#39": "'", "#x27": "'", lt: "<", gt: ">" })[e.toLowerCase()] ?? _);
const encodeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/**
 * Point every http(s) link in <a href> through `wrap`. Leaves mailto:, tel:, anchors, links marked
 * data-clr-notrack, and links already on `skipPrefix` (our own unsubscribe links) alone.
 */
export function rewriteLinks(html: string, wrap: (url: string) => string, skipPrefix?: string): string {
  return html.replace(/<a\b[^>]*>/gi, (tag) => {
    if (/\sdata-clr-notrack\b/i.test(tag)) return tag;
    return tag.replace(/(\shref\s*=\s*)(?:"([^"]*)"|'([^']*)')/i, (whole, pre: string, dq?: string, sq?: string) => {
      const url = decode((dq ?? sq ?? "").trim());
      if (!/^https?:\/\/[^\s]+$/i.test(url) || (skipPrefix && url.startsWith(skipPrefix))) return whole;
      return `${pre}"${encodeAttr(wrap(url))}"`;
    });
  });
}
