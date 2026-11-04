// The no-code builder in Form Studio (docs/studio-v2-plan.md, Part 9): each question type's markup in the page's
// own classes, the types a question can change into, a page's jump rules turned into the show-ifs every form already
// runs, and the answers a text shows ({first_name}). Pure and string-based, so the Studio, the tests and the form
// script share it. Browser and server.

export type QType =
  | "short" | "long" | "email" | "phone" | "address" | "name" | "company" | "jobtitle" | "website" | "country" | "birthday"
  | "choice" | "checks" | "dropdown" | "yesno" | "ranking" | "matrix" | "likert" | "agree"
  | "rating" | "scale" | "nps" | "slider" | "number" | "currency" | "percent" | "payment"
  | "date" | "time" | "datetime" | "month" | "daterange" | "file" | "image" | "signature"
  | "color" | "hidden" | "heading" | "text" | "divider";

/** What the Add list shows, in groups. */
export const QGROUPS: [string, [QType, string][]][] = [
  ["Contact", [["short", "Short answer"], ["long", "Long answer"], ["email", "Email"], ["phone", "Phone number"], ["name", "Full name"], ["company", "Company"], ["jobtitle", "Job title"], ["website", "Website"], ["address", "Address"], ["country", "Country"], ["birthday", "Date of birth"]]],
  ["Choices", [["choice", "Multiple choice"], ["checks", "Checkboxes"], ["dropdown", "Dropdown"], ["yesno", "Yes / No"], ["ranking", "Ranking"], ["matrix", "Matrix"], ["likert", "Likert scale"], ["agree", "Agreement"]]],
  ["Ratings and numbers", [["rating", "Rating"], ["scale", "Opinion scale"], ["nps", "Net Promoter Score"], ["slider", "Slider"], ["number", "Number"], ["currency", "Currency"], ["percent", "Percentage"], ["payment", "Payment"]]],
  ["Date, time and files", [["date", "Date picker"], ["time", "Time picker"], ["datetime", "Date and time"], ["month", "Month"], ["daterange", "Date range"], ["file", "File upload"], ["image", "Image upload"], ["signature", "Signature"]]],
  ["Advanced", [["color", "Color picker"], ["hidden", "Hidden field"]]],
  ["Display", [["heading", "Heading"], ["text", "Paragraph"], ["divider", "Divider"]]],
];
export const QNAME = Object.fromEntries(QGROUPS.flatMap(([, xs]) => xs)) as Record<QType, string>;

const LABEL: Record<QType, string> = {
  short: "Short answer", long: "Tell us more", email: "Email address", phone: "Phone number", address: "Address", choice: "Select one", checks: "Select all that apply",
  dropdown: "Select an option", yesno: "Yes or no?", ranking: "Rank in order of importance", rating: "How would you rate your experience?", scale: "How likely are you to recommend us?",
  number: "Quantity", payment: "Payment", date: "Select a date", time: "Select a time", file: "Upload a file", signature: "Signature",
  name: "Full name", company: "Company", jobtitle: "Job title", website: "Website", country: "Country", birthday: "Date of birth",
  matrix: "Rate each of the following", likert: "How much do you agree with each statement?", agree: "I agree to the terms and conditions",
  nps: "How likely are you to recommend us to a friend?", slider: "How satisfied are you?", currency: "Budget", percent: "Percentage",
  datetime: "Select a date and time", month: "Select a month", daterange: "Select your dates", image: "Upload an image", color: "Pick a color", hidden: "Hidden field",
  heading: "Section heading", text: "Add a short description for this section.", divider: "",
};
/** The name a new question's answer goes under, before it's made unique. */
const BASE: Record<QType, string> = {
  short: "answer", long: "details", email: "email", phone: "phone", address: "address", choice: "choice", checks: "picks", dropdown: "pick",
  yesno: "yes_no", ranking: "ranking", rating: "rating", scale: "score", number: "number", payment: "payment", date: "date", time: "time",
  file: "file", signature: "signature", name: "name", company: "company", jobtitle: "job_title", website: "website", country: "country",
  birthday: "birthday", matrix: "matrix", likert: "agreement", agree: "terms", nps: "nps", slider: "satisfaction", currency: "budget",
  percent: "percent", datetime: "date_time", month: "month", daterange: "dates", image: "image", color: "color", hidden: "ref",
  heading: "", text: "", divider: "",
};
/** The contact field a new question saves to, when the page has none yet. */
export const SAVES: Partial<Record<QType, string>> = { email: "email", phone: "phone", name: "name", company: "company", jobtitle: "title", website: "website", country: "country" };
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
    case "name":
    case "company":
    case "jobtitle": {
      const ac = { name: "name", company: "organization", jobtitle: "organization-title" }[type];
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="text" autocomplete="${ac}"${save}>${err}</div>`;
    }
    case "website":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="url" placeholder="https://" autocomplete="url" inputmode="url"${save}>${err}</div>`;
    case "birthday":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="date" autocomplete="bday">${err}</div>`;
    case "datetime":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="datetime-local">${err}</div>`;
    case "month":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="month">${err}</div>`;
    case "currency":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="number" min="0" step="0.01" placeholder="0.00" inputmode="decimal">${err}</div>`;
    case "percent":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="number" min="0" max="100" step="1" placeholder="0 to 100" inputmode="numeric">${err}</div>`;
    case "slider":
      return `<div class="q">${lab}<input id="${id}" name="${name}" type="range" min="0" max="10" step="1" value="5">${err}</div>`;
    case "color":
      return `<div class="q">${lab}<input id="${id}" name="${name}" type="color">${err}</div>`;
    case "agree":
      return `<div class="q"><label class="choice"><input type="checkbox" id="${id}" name="${name}" value="Yes" required data-cl-label="${esc(label)}"> ${esc(label)}</label>${err}</div>`;
    case "country":
      return block("country");
    case "daterange":
      return block("daterange");
    case "image":
      return block("file", ` data-cl-kinds="image" data-cl-max="10"`);
    case "matrix":
      return block("grid", ` data-cl-rows="Quality|Speed|Support" data-cl-cols="Poor|Fair|Good|Excellent"`);
    case "likert":
      return block("grid", ` data-cl-rows="Statement 1|Statement 2|Statement 3" data-cl-cols="Strongly disagree|Disagree|Neutral|Agree|Strongly agree"`);
    case "nps":
      return block("rating", ` data-cl-scale="10" data-cl-style="numbers" data-cl-zero data-cl-low="Not likely" data-cl-high="Very likely"`);
    case "hidden":
      return `<div data-cl-field="hidden" data-cl-name="${name}" data-cl-label="${name}" data-cl-from="param" data-cl-param="${name}"></div>`;
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
export const TEXT_KINDS: [string, string][] = [["text", "Short answer"], ["textarea", "Long answer"], ["email", "Email"], ["tel", "Phone number"], ["url", "Website"], ["number", "Number"]];
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
