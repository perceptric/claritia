// The no-code builder in Form Studio (docs/studio-v2-plan.md, Part 9): each question type's markup in the page's
// own classes, the types a question can change into, a page's jump rules turned into the show-ifs every form already
// runs, and the answers a text shows ({first_name}). Pure and string-based, so the Studio, the tests and the form
// script share it. Browser and server.

export type QType =
  | "short" | "long" | "email" | "phone" | "address" | "choice" | "checks" | "dropdown" | "yesno" | "ranking"
  | "rating" | "scale" | "number" | "payment" | "date" | "time" | "file" | "signature" | "heading" | "text" | "divider";

/** What the Add list shows, in groups. */
export const QGROUPS: [string, [QType, string][]][] = [
  ["Contact", [["short", "Short answer"], ["long", "Long answer"], ["email", "Email"], ["phone", "Phone number"], ["address", "Address"]]],
  ["Choices", [["choice", "Multiple choice"], ["checks", "Checkboxes"], ["dropdown", "Dropdown"], ["yesno", "Yes / No"], ["ranking", "Ranking"]]],
  ["Ratings and numbers", [["rating", "Rating"], ["scale", "Opinion scale"], ["number", "Number"], ["payment", "Payment"]]],
  ["Date, time and files", [["date", "Date picker"], ["time", "Time picker"], ["file", "File upload"], ["signature", "Signature"]]],
  ["Display", [["heading", "Heading"], ["text", "Paragraph"], ["divider", "Divider"]]],
];
export const QNAME = Object.fromEntries(QGROUPS.flatMap(([, xs]) => xs)) as Record<QType, string>;

const LABEL: Record<QType, string> = {
  short: "Short answer", long: "Tell us more", email: "Email address", phone: "Phone number", address: "Address", choice: "Select one", checks: "Select all that apply",
  dropdown: "Select an option", yesno: "Yes or no?", ranking: "Rank in order of importance", rating: "How would you rate your experience?", scale: "How likely are you to recommend us?",
  number: "Quantity", payment: "Payment", date: "Select a date", time: "Select a time", file: "Upload a file", signature: "Signature",
  heading: "Section heading", text: "Add a short description for this section.", divider: "",
};
/** The name a new question's answer goes under, before it's made unique. */
const BASE: Record<QType, string> = {
  short: "answer", long: "details", email: "email", phone: "phone", address: "address", choice: "choice", checks: "picks", dropdown: "pick",
  yesno: "yes_no", ranking: "ranking", rating: "rating", scale: "score", number: "number", payment: "payment", date: "date", time: "time",
  file: "file", signature: "signature", heading: "", text: "", divider: "",
};
export const isLayout = (t: QType) => t === "heading" || t === "text" || t === "divider";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A name no other question on the page has: email, email_2, email_3. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const b = (base.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "") || "answer").replace(/^(\d)/, "q$1").slice(0, 40);
  if (!used.has(b)) return b;
  for (let i = 2; ; i++) if (!used.has(`${b}_${i}`)) return `${b}_${i}`;
}

/**
 * A new question's HTML in the classes every page's brand styles (q, label, field, choices, choice, help, error), as
 * Form Studio writes it. `name` is its answer's name; `save` is "email" for the page's first email.
 */
export function questionHtml(type: QType, name: string, o: { save?: string } = {}): string {
  const id = `q_${name}`;
  const label = LABEL[type];
  const err = `<p class="error" data-cl-error-for="${name}"></p>`;
  const lab = `<label class="label" for="${id}">${esc(label)}</label>`;
  const save = o.save ? ` data-cl-save="${o.save}"` : "";
  const block = (field: string, extra = "") => `<div class="q"><div data-cl-field="${field}" data-cl-name="${name}" data-cl-label="${esc(label)}"${save}${extra} id="${id}"></div></div>`;
  const choices = (t: "radio" | "checkbox", opts: string[]) =>
    `<fieldset class="q"><legend class="label">${esc(label)}</legend><div class="choices">${opts.map((x, i) => `<label class="choice"><input type="${t}" name="${name}" value="${esc(x)}"${i === 0 ? ` data-cl-label="${esc(label)}"` : ""}> ${esc(x)}</label>`).join("")}</div>${err}</fieldset>`;
  switch (type) {
    case "short":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="text"${save}>${err}</div>`;
    case "email":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="email" placeholder="you@company.com" autocomplete="email"${save}>${err}</div>`;
    case "number":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="number" inputmode="numeric">${err}</div>`;
    case "long":
      return `<div class="q">${lab}<textarea class="field" id="${id}" name="${name}" rows="4"></textarea>${err}</div>`;
    case "dropdown":
      return `<div class="q">${lab}<select class="field" id="${id}" name="${name}"><option value="">Choose one</option>${["Option 1", "Option 2", "Option 3"].map((x) => `<option value="${x}">${x}</option>`).join("")}</select>${err}</div>`;
    case "choice":
      return choices("radio", ["Option 1", "Option 2", "Option 3"]);
    case "checks":
      return choices("checkbox", ["Option 1", "Option 2", "Option 3"]);
    case "yesno":
      return choices("radio", ["Yes", "No"]);
    case "ranking":
      return block("ranking", ` data-cl-options="Option 1|Option 2|Option 3"`);
    case "rating":
      return block("rating", ` data-cl-scale="5"`);
    case "scale":
      return block("rating", ` data-cl-scale="10" data-cl-style="numbers"`);
    case "payment":
      return block("payment", ` data-cl-amount="49" data-cl-currency="USD"`);
    case "phone":
    case "address":
    case "date":
    case "time":
    case "signature":
      return block(type);
    case "file":
      return block("file", ` data-cl-kinds="pdf image office" data-cl-max="10"`);
    case "heading":
      return `<h2 class="heading">${esc(label)}</h2>`;
    case "text":
      return `<p class="text">${esc(label)}</p>`;
    case "divider":
      return `<hr>`;
  }
}
export const baseName = (t: QType) => BASE[t];

/** The kinds a question can turn into and keep its answers: text boxes among themselves, picks among themselves. */
export const TEXT_KINDS: [string, string][] = [["text", "Short answer"], ["textarea", "Long answer"], ["email", "Email"], ["tel", "Phone number"], ["number", "Number"]];
export const PICK_KINDS: [string, string][] = [["radio", "Multiple choice"], ["checkbox", "Checkboxes"], ["select", "Dropdown"]];

// Jumps: "If size is More than 50, go to page 3" skips the pages in between. Written as show-ifs on those pages, the
// rule every live form already runs, so a jump needs nothing new on the sites the form is on.

export type Jump = { name: string; value: string; to: number };
const quote = (v: string) => (v.includes("'") ? `"${v.replace(/"/g, "'")}"` : `'${v}'`);

/** A question's jumps, kept on it as data-cl-jump: value=>step id, one per line. */
export function readJumps(raw: string | null | undefined): { value: string; to: string }[] {
  return String(raw ?? "")
    .split("\n")
    .map((l) => {
      const i = l.lastIndexOf("=>");
      return i > 0 ? { value: l.slice(0, i), to: l.slice(i + 2).trim() } : null;
    })
    .filter((x): x is { value: string; to: string } => !!x && !!x.value && !!x.to);
}
export const writeJumps = (js: { value: string; to: string }[]) => js.map((j) => `${j.value.replace(/\n/g, " ")}=>${j.to}`).join("\n");

/**
 * Each page's show-if with the jumps: `own` is the page's own condition (kept apart in data-cl-own), `jumps` are every
 * question's jumps with the page index they're on (`from`) and the one they go to (`to`). A page between the two is
 * skipped for that answer. The page's own condition and the skips are both kept: (A or B) and not-X is written as
 * A and not-X or B and not-X, since show-ifs have no brackets.
 */
export function stepShowIfs(steps: { own: string }[], jumps: (Jump & { from: number })[]): string[] {
  return steps.map((st, i) => {
    const skip = jumps.filter((j) => j.from < i && i < j.to).map((j) => `${j.name} != ${quote(j.value)}`);
    const uniq = [...new Set(skip)];
    if (!uniq.length) return st.own;
    const tail = uniq.join(" and ");
    return st.own.trim() ? st.own.split(/\s+or\s+/i).map((p) => `${p.trim()} and ${tail}`).join(" or ") : tail;
  });
}

export { pipeText } from "./runtime.ts";

// Options: a choice's saved value follows its words when it was made from them, so a renamed option saves what it
// says; the show-ifs and jumps that name the old value follow it.

/**
 * Whether an option's value is its words (or a placeholder like option-2), so it follows a rename. A value written
 * on purpose (sunny for "Sunny", ent for "Enterprise") stays, so past answers and the tools it goes to still match.
 */
export const valueFollows = (value: string, label: string) => value === label.trim() || /^option[-_ ]?\d+$/i.test(value);
/** A value no other option of the question has. */
export function uniqueValue(v: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const b = v.trim().slice(0, 200) || "Option";
  if (!used.has(b)) return b;
  for (let i = 2; ; i++) if (!used.has(`${b} ${i}`)) return `${b} ${i}`;
}
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A show-if with one question's old value written as the new one: size == 'Big' becomes size == 'Large'. */
export function renameValueIn(expr: string, name: string, from: string, to: string): string {
  if (!expr || from === to) return expr;
  const q = to.includes("'") ? `"${to.replace(/"/g, "'")}"` : `'${to}'`;
  return expr.replace(new RegExp(`(\\b${reEsc(name)}\\s*(?:==|!=)\\s*)(?:'${reEsc(from)}'|"${reEsc(from)}"|${reEsc(from)}(?=\\s|$))`, "g"), `$1${q}`);
}
