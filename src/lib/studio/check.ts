// The form check (docs/studio-v2-plan.md 6.3 and 6.5): no broken form goes live. It reads a studio page the way the
// form script will run it and lists what's wrong, each with words for the owner and an instruction Tia can follow to
// fix it. Errors stop Publish; warnings don't. The Studio runs it as the form changes and the server runs it again on
// Publish. Layout, contrast and fonts need a browser, so the Studio adds those (studio.ts, layoutIssues).
// Runs in the browser and on the server: no DOM.

import { cleanPage, type PageAfter, type PageQuestion } from "./page.ts";

export type Issue = { level: "error" | "warning"; code: string; text: string; fix?: string };

type Node = { tag: string; attrs: Record<string, string>; kids: Node[]; text: string; parent: Node | null };
const VOID = new Set(["input", "img", "br", "hr"]);
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** A small tree of cleaned page HTML (cleanPage's output is always well formed). */
export function pageTree(html: string): Node {
  const root: Node = { tag: "#root", attrs: {}, kids: [], text: "", parent: null };
  let at = root;
  const re = /<(\/?)([a-z][a-z0-9-]*)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const t = unesc(m[4]);
      at.kids.push({ tag: "#text", attrs: {}, kids: [], text: t, parent: at });
      continue;
    }
    const name = m[2]!.toLowerCase();
    if (m[1]) {
      for (let n: Node | null = at; n && n !== root; n = n.parent)
        if (n.tag === name) {
          at = n.parent ?? root;
          break;
        }
      continue;
    }
    const attrs: Record<string, string> = {};
    const ar = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:="([^"]*)")?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[3]!))) attrs[a[1]!.toLowerCase()] = unesc(a[2] ?? "");
    const node: Node = { tag: name, attrs, kids: [], text: "", parent: at };
    at.kids.push(node);
    if (!VOID.has(name)) at = node;
  }
  return root;
}

const all = (n: Node, test: (x: Node) => boolean, out: Node[] = []): Node[] => {
  for (const k of n.kids) {
    if (test(k)) out.push(k);
    all(k, test, out);
  }
  return out;
};
const textOf = (n: Node): string => (n.tag === "#text" ? n.text : n.kids.map(textOf).join(" ")).replace(/\s+/g, " ").trim();
const inside = (n: Node, test: (x: Node) => boolean) => {
  for (let p = n.parent; p; p = p.parent) if (test(p)) return true;
  return false;
};
const isSubmit = (n: Node) => (n.tag === "button" || n.tag === "input") && n.attrs.type === "submit";

/** The names a show-if reads, and the values it compares them with. */
export function showIfRefs(expr: string): { name: string; values: string[] }[] {
  const out: { name: string; values: string[] }[] = [];
  for (const part of expr.split(/\s+(?:and|or)\s+/i)) {
    const c = part.trim();
    let m = /^([\w-]+)\s+(?:filled|empty)$/i.exec(c);
    if (m) {
      out.push({ name: m[1]!, values: [] });
      continue;
    }
    m = /^([\w-]+)\s+in\s+\((.*)\)$/i.exec(c);
    if (m) {
      out.push({ name: m[1]!, values: [...m[2]!.matchAll(/'([^']*)'|"([^"]*)"|([^,\s]+)/g)].map((y) => y[1] ?? y[2] ?? y[3] ?? "") });
      continue;
    }
    m = /^([\w-]+)\s*(==|!=|>=|<=|>|<)\s*(?:'([^']*)'|"([^"]*)"|(\S+))$/.exec(c);
    if (m) out.push({ name: m[1]!, values: m[2] === "==" || m[2] === "!=" ? [m[3] ?? m[4] ?? m[5] ?? ""] : [] });
  }
  return out;
}

// What a form must never ask for in a box, and what it asks only with care (docs/studio-v2-plan.md 6.3).
const SENSITIVE: { code: string; test: RegExp; text: (l: string) => string; fix: string }[] = [
  { code: "password", test: /\b(pass(word|code|phrase)|pin code|\bpin\b)/i, text: (l) => `"${l}" asks for a password. Forms never ask for logins.`, fix: "Remove the question that asks for a password or PIN." },
  { code: "card", test: /(card number|credit card|debit card|\bcvv\b|\bcvc\b|card security code|card expir)/i, text: (l) => `"${l}" asks for card details. Take payments with the payment block.`, fix: "Remove the question that asks for card details." },
  { code: "bank", test: /(account number|routing number|\biban\b|sort code|\bswift\b|\bbic\b|bank details)/i, text: (l) => `"${l}" asks for bank details. Forms never collect them in a box.`, fix: "Remove the question that asks for bank details." },
  { code: "id", test: /(\bssn\b|social security|national insurance|passport number|driver'?s? licen[cs]e number|tax (id|number)|\btin\b|\bsin number|national id)/i, text: (l) => `"${l}" asks for an ID number. Forms never collect ID numbers.`, fix: "Remove the question that asks for an ID or tax number." },
  { code: "health", test: /(diagnos|medication|prescri|medical (history|record|condition)|health (record|history|condition)|allerg)/i, text: (l) => `"${l}" asks about health records. Turn on health data for this workspace first, or ask for the reason for the visit in plain words.`, fix: "Replace the health record question with a plain reason-for-visit question." },
  { code: "protected", test: /(\bage\b|date of birth|\breligio|\bethnic|\brace\b|disabilit|pregnan|marital status|sexual orientation)/i, text: (l) => `"${l}" asks about something hiring and lending laws protect. Leave it out unless the law asks for it.`, fix: "Remove the question about age, religion, ethnicity, disability or family status." },
];

export function sensitiveIssues(questions: PageQuestion[], html: string): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();
  if (/<input[^>]*type\s*=\s*["']?password/i.test(html)) out.push({ level: "error", code: "password", text: "The form has a password box. Forms never ask for logins.", fix: "Remove the password box." });
  for (const q of questions) {
    const words = `${q.label} ${q.name.replace(/[_-]+/g, " ")}`;
    for (const s of SENSITIVE) {
      if (!s.test.test(words) || seen.has(`${s.code}:${q.name}`)) continue;
      seen.add(`${s.code}:${q.name}`);
      // Age as a range or "under 18" check is fine on events and education; it's flagged where it's a free answer.
      if (s.code === "protected" && /\bage\b/i.test(words) && q.options.length) continue;
      out.push({ level: s.code === "protected" ? "warning" : "error", code: s.code, text: s.text(q.label), fix: s.fix });
    }
  }
  return out;
}

/**
 * Everything the page needs to work and to be allowed: questions with labels and their own names, a way through every
 * step, a send button, conditions and routes that point at real questions, answers and meetings, a thank-you, and
 * nothing the form must never ask for. `meetings` is the workspace's meeting types (null when unknown).
 */
export function checkStudioPage(p: { html: string; after: PageAfter; meetings: { id: string; name: string }[] | null }): Issue[] {
  const { html, questions } = cleanPage(p.html);
  const tree = pageTree(html);
  const out: Issue[] = [];
  const add = (level: Issue["level"], code: string, text: string, fix?: string) => out.push({ level, code, text, ...(fix ? { fix } : {}) });
  const byName = new Map(questions.map((q) => [q.name, q]));

  if (!questions.length) add("error", "no-questions", "The form has no questions to send.", "Add the questions this form needs.");
  for (const q of questions) {
    if (q.twice) add("error", "same-name", `Two questions are both named "${q.name}", so one answer would be lost.`, `Give each question named "${q.name}" its own name.`);
    if (["radio", "multi", "checkbox"].includes(q.type)) continue;
    if (q.labelFrom === "name") add("error", "no-label", `The question "${q.name}" has no label people can see.`, `Give the question named "${q.name}" a visible label tied to it with for and id.`);
    else if (q.labelFrom === "placeholder") add("warning", "placeholder-label", `"${q.label}" uses its placeholder as its label, which disappears as people type.`, `Give the question named "${q.name}" a visible label tied to it with for and id.`);
  }

  // A way through: steps move on, the last step sends, and there's one send button.
  const thanks = all(tree, (n) => "data-cl-thanks" in n.attrs);
  const inThanks = (n: Node) => inside(n, (x) => "data-cl-thanks" in x.attrs);
  const sends = all(tree, (n) => isSubmit(n) && !inThanks(n));
  const steps = all(tree, (n) => "data-cl-step" in n.attrs && !inThanks(n));
  if (!sends.length) add("error", "no-send", "The form has no send button.", 'Add a send button with type="submit" at the end of the form.');
  steps.forEach((s, i) => {
    const last = i === steps.length - 1;
    const next = all(s, (n) => "data-cl-next" in n.attrs).length;
    const send = all(s, isSubmit).length;
    if (!last && !next && !send) add("error", "step-stuck", `Step ${i + 1} has no way forward.`, `Add a Next button with data-cl-next to step ${i + 1}.`);
    if (last && !send && sends.length) add("warning", "send-outside", "The send button isn't on the last step.", 'Move the send button (type="submit") into the last step.');
  });
  if (!thanks.length) add("warning", "no-thanks", "There's no thank-you message after the send.", "Add a thank-you section with data-cl-thanks and hidden, after the form.");

  // Conditions point at real questions and real answers.
  for (const n of all(tree, (x) => "data-cl-show-if" in x.attrs)) {
    for (const r of showIfRefs(n.attrs["data-cl-show-if"]!)) {
      const q = byName.get(r.name);
      if (!q) {
        add("error", "show-if-gone", `A "Show if" reads "${r.name}", which isn't a question on the form.`, `Fix the show-if that reads "${r.name}" so it uses a question on the form, or remove it.`);
        continue;
      }
      if (q.options.length) for (const v of r.values) if (!q.options.some((o) => o.value === v)) add("warning", "show-if-value", `A "Show if" waits for "${v}" on "${q.label}", which isn't one of its answers.`, `Fix the show-if on "${r.name}" so it compares with one of its answers.`);
    }
  }

  // After the send: a page, or a meeting with routes that point at real answers and meetings.
  const a = p.after;
  const known = (id: string | undefined) => !p.meetings || p.meetings.some((m) => m.id === id);
  if (a.kind === "page" && !/^https:\/\/[^\s]+\.[^\s]+/.test(a.url ?? "")) add("error", "page-url", "On submission opens a page, but its address isn't a full https link.");
  if (a.kind === "meeting") {
    if (p.meetings && !p.meetings.length) add("error", "no-meetings", "On submission books a meeting, but the workspace has no meeting types yet.");
    else if (!a.meeting || !known(a.meeting)) add("error", "meeting-gone", "On submission books a meeting that isn't there any more. Pick one in On submission.");
    if (!all(tree, (n) => "data-cl-book" in n.attrs).length) add("warning", "no-book-spot", "There's no booking spot, so the calendar shows at the end of the thank-you.", "Add <div data-cl-book id=\"book\"></div> inside the thank-you section.");
    for (const r of a.routes ?? []) {
      const q = byName.get(r.field);
      if (!q) add("error", "route-gone", `A route reads "${r.field}", which isn't a question any more. Fix it in On submission.`);
      else if (q.options.length && !q.options.some((o) => o.value === r.value)) add("error", "route-value", `A route waits for "${r.value}" on "${q.label}", which isn't one of its answers any more. Fix it in On submission.`);
      if (!known(r.meeting)) add("error", "route-meeting", "A route books a meeting that isn't there any more. Fix it in On submission.");
    }
  }

  // Without an email, answers can't become contacts.
  if (!questions.some((q) => q.type === "email" || q.save === "email")) add("warning", "no-email", "There's no email question, so answers won't become contacts.", "Add an email question saved to the contact's email (data-cl-save=\"email\").");

  // The logo has words for screen readers.
  for (const n of all(tree, (x) => x.tag === "img" && "data-cl-logo" in x.attrs)) if (!(n.attrs.alt ?? "").trim()) add("warning", "logo-alt", "The logo has no words for screen readers.", "Give the logo image an alt with the brand's name.");

  // A file box of the page's own can't upload: uploads are the file block.
  if (/<input[^>]*type\s*=\s*["']?file/i.test(p.html)) add("error", "file-input", "A file box on the page can't upload files. Use the file upload block.", 'Replace the file input with the Claritia file block: <div data-cl-field="file" data-cl-name="..." data-cl-label="..."></div>.');
  // The page as written: the cleaner turns a password box into a text box, so it's read before cleaning.
  out.push(...sensitiveIssues(questions, p.html));
  // One line per problem.
  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}

export const errorsIn = (issues: Issue[]) => issues.filter((i) => i.level === "error");
export { textOf };
