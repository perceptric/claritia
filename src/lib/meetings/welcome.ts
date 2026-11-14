// The booking page's welcome line (src/lib/meetings/look.ts): rich text with bold, italic, underline, strike, links
// and lists. Cleaned to the email Text block's allow list (src/lib/design/email/html.ts) when it's saved and again
// when the page draws it, so it can never run script or load anything. Links are https, http, mailto or tel only.
// An older welcome line is plain text, which reads the same way. Runs in the browser and on the server.

import { cleanHtml, escapeText, htmlToText } from "../design/email/html.ts";

/** Characters of text a welcome line can hold. */
export const WELCOME_MAX = 2000;
const HTML_MAX = 12_000;

/** The welcome line as safe HTML; "" when it has no words. */
export function cleanWelcome(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  // The editor writes a <div> per line in some browsers: those become paragraphs.
  const src = raw.slice(0, HTML_MAX * 2).replace(/<div\b[^>]*>/gi, "<p>").replace(/<\/div\s*>/gi, "</p>");
  const html = cleanHtml(src, "rich")
    // A page link is https, http, mailto or tel; a merge tag means nothing here, so its link goes (its words stay).
    .replace(/<a href="(?!https?:|mailto:|tel:)[^"]*">([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<\/?span>/g, "")
    .replace(/(?:<p>(?:\s|&nbsp;|<br>)*<\/p>|<br>|\s)+$/g, "")
    .replace(/^(?:<p>(?:\s|&nbsp;|<br>)*<\/p>|<br>|\s)+/g, "")
    .trim();
  const text = htmlToText(html);
  if (!text) return "";
  // Too long: the words alone, cut to the limit.
  if (text.length > WELCOME_MAX || html.length > HTML_MAX) return escapeText(text.slice(0, WELCOME_MAX)).replace(/\n/g, "<br>");
  return html;
}

/** The welcome line in one plain line, for summaries. */
export const welcomeText = (raw: unknown): string => htmlToText(cleanWelcome(raw)).replace(/\s+/g, " ").trim();

/** The welcome line ready to draw: cleaned again, links open in a new tab. */
export const welcomeHtml = (raw: unknown): string => cleanWelcome(raw).replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=');
