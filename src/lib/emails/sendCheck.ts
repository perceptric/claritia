// The last check before a campaign goes (docs/email-studio-plan.md Part 10). Stops: a placeholder left in ("[date]",
// as the templates and Tia write them), and a button or link that goes nowhere or to a broken address. Warnings: an
// email that is only images, images without alt text, and merge tags without a fallback. Pure, so the Send panel
// shows the same list the server enforces. Size and the footer are checked when the email is built (compile.ts).

import { emailText } from "../design/email/compile.ts";
import type { Block, EmailDoc } from "../design/email/doc.ts";
import { mergeGaps } from "../workflows/merge.ts";

export type SendCheck = { stops: string[]; warns: string[] };

const MERGE_ONLY = /^\{\{\s*[a-z_][a-z0-9_.]{0,60}\s*(\|[^}]{0,60})?\}\}$/i;
/** A link that can go somewhere: a web address with a real host, mail, phone, or a merge tag filled when it sends. */
export function linkWorks(raw: string): boolean {
  const v = raw.trim();
  if (MERGE_ONLY.test(v)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(v) || /^tel:\+?[\d\s().-]{5,}$/i.test(v)) return true;
  const m = /^https?:\/\/([^/?#\s]+)/i.exec(v);
  if (!m) return false;
  const host = m[1]!.replace(/^[^@]*@/, "").replace(/:\d+$/, "");
  return /\{\{/.test(host) || /^([a-z0-9-]+\.)+[a-z]{2,63}$/i.test(host);
}

/** The placeholders left in some text: "[date]", "[Your name]". Merge tags and links in brackets don't count. */
export function placeholdersIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.replace(/\{\{[^}]*\}\}/g, "").matchAll(/\[([^\[\]\n]{1,60})\]/g)) {
    const inner = m[1]!.trim();
    if (/[a-z]/i.test(inner) && !/^(https?:|mailto:)/i.test(inner)) out.add(`[${inner}]`);
  }
  return [...out];
}

const blocksOf = (doc: EmailDoc): Block[] => doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*("([^"]*)"|'([^']*)')/gi)].map((m) => (m[2] ?? m[3] ?? "").replace(/&amp;/g, "&"));
const words = (s: string) => (s.match(/[a-z]{2,}/gi) ?? []).length;

export function sendCheck(doc: EmailDoc, subject: string): SendCheck {
  const stops: string[] = [];
  const warns: string[] = [];
  const blocks = blocksOf(doc);
  const left = placeholdersIn(`${subject}\n${doc.settings.preheader ?? ""}\n${emailText(doc)}`);
  if (left.length) stops.push(`Fill in ${left.slice(0, 3).join(", ")}${left.length > 3 ? ` and ${left.length - 3} more` : ""}.`);
  let brokenText = false;
  for (const b of blocks) {
    const name = "label" in b ? b.label : "button" in b ? b.button : "";
    if (b.type === "button" || b.type === "meeting") {
      if (!linkWorks(b.url)) stops.push(`The button "${name}" has no working link.`);
    } else if (b.type === "product" || b.type === "event") {
      if (b.button.trim() && !linkWorks(b.url)) stops.push(`The button "${name}" has no working link.`);
    } else if ((b.type === "image" || b.type === "logo") && b.url?.trim() && !linkWorks(b.url)) {
      stops.push("An image links to a broken address.");
    } else if (b.type === "social") {
      if (b.links.some((l) => !linkWorks(l.url))) stops.push("A social link has no working address.");
    } else if (b.type === "video" && b.url.trim() && !linkWorks(b.url)) {
      stops.push("A video links to a broken address.");
    } else if ((b.type === "text" || b.type === "html") && hrefs(b.html).some((h) => !linkWorks(h))) {
      brokenText = true;
    }
  }
  if (brokenText) stops.push("A link in the text goes to a broken address.");
  // Only images: inboxes read these as spam. The footer's words don't count.
  const pictures = blocks.filter((b) => b.type === "image" || b.type === "video").length;
  const said = emailText({ ...doc, sections: doc.sections.map((s) => ({ ...s, columns: s.columns.map((c) => ({ ...c, blocks: c.blocks.filter((b) => b.type !== "footer" && b.type !== "image" && b.type !== "logo" && b.type !== "video") })) })) });
  if (pictures && words(said) < 25) warns.push("This email is mostly pictures. Add some text so inboxes don't mark it as spam.");
  if (blocks.some((b) => (b.type === "image" || b.type === "video") && !b.alt.trim())) warns.push("An image has no alt text.");
  const gaps = [...new Set(mergeGaps(`${subject}\n${doc.settings.preheader ?? ""}\n${emailText(doc)}`))].filter((g) => !/unsubscribe_url|company_address/.test(g));
  if (gaps.length) warns.push(`Give ${gaps.slice(0, 2).join(" and ")} a fallback, like {{first_name|there}}.`);
  return { stops: [...new Set(stops)], warns };
}
