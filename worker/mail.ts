// Reading test emails: the text of a mail, and the code or link a step asks for.

export type InboxMail = { subject: string; text: string; html: string; receivedAt: string };

/** Text of an email, with tags taken out of the HTML when there's no plain text. */
function mailText(m: InboxMail) {
  if (m.text.trim()) return m.text;
  return m.html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

/** A code right after words like "code" or "verification": 4 to 8 letters and digits, with at least one digit. */
export function codeNearWords(m: InboxMail): string | null {
  const text = `${m.subject}\n${mailText(m)}`.replace(/\s+/g, " ");
  for (const k of text.matchAll(/\b(?:code|pin|otp|passcode|one-time|verification|verify)\b/gi)) {
    const after = text.slice(k.index! + k[0].length, k.index! + k[0].length + 50);
    const hit = /(?<![A-Za-z0-9-])(?=[A-Za-z0-9-]*\d)([A-Za-z0-9]{3,8}(?:-[A-Za-z0-9]{3,4})?)(?![A-Za-z0-9-])/.exec(after);
    if (hit && hit[1]!.length >= 4) return hit[1]!;
  }
  return null;
}

/** Any 4 to 8 digit number on its own, in an email about signing in or verifying. A welcome email's order number never counts. */
export function anyDigits(m: InboxMail): string | null {
  if (!/code|verif|otp|\bpin\b|passcode|confirm|sign.?in|log.?in/i.test(`${m.subject}\n${mailText(m)}`)) return null;
  const digits = /(?<![\d.,/:#-])(\d{4,8})(?![\d.,/:-])/.exec(`${m.subject}\n${mailText(m)}`);
  return digits ? digits[1]! : null;
}

/** A link in an email. With a pattern, the first link that matches. Otherwise the first sign-in, confirm or reset style link, then any link. */
export function extractLink(m: InboxMail, pattern?: RegExp): string | null {
  const links: string[] = [];
  for (const h of m.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) links.push(h[1]!.replace(/&amp;/g, "&"));
  for (const t of mailText(m).matchAll(/https?:\/\/[^\s<>"')\]]+/g)) links.push(t[0]);
  const web = links.filter((l) => /^https?:\/\//i.test(l));
  if (pattern) return web.find((l) => pattern.test(l)) ?? null;
  const useful = web.filter((l) => !/unsubscribe|preferences|privacy|terms/i.test(l));
  return useful.find((l) => /verify|confirm|activate|magic|login|log-in|sign-?in|reset|token|auth|invite/i.test(l)) ?? useful[0] ?? null;
}
