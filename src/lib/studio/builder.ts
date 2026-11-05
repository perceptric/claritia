// The no-code builder in Form Studio (docs/studio-v2-plan.md, Part 9): each question type's markup in the page's
// own classes, the types a question can change into, a page's jump rules turned into the show-ifs every form already
// runs, and the answers a text shows ({first_name}). Pure and string-based, so the Studio, the tests and the form
// script share it. Browser and server.

import { SMS_WORDING } from "../texts/words.ts";

export type QType =
  | "short" | "long" | "email" | "phone" | "address" | "name" | "company" | "jobtitle" | "website" | "country" | "birthday"
  | "choice" | "checks" | "dropdown" | "yesno" | "ranking" | "matrix" | "likert" | "agree" | "smsconsent"
  | "rating" | "scale" | "nps" | "slider" | "number" | "currency" | "percent" | "payment"
  | "date" | "time" | "datetime" | "month" | "daterange" | "file" | "image" | "signature"
  | "color" | "hidden" | "heading" | "text" | "divider"
  // docs/fields-plan.md Part 2 and 3
  | "language" | "timezone" | "social" | "unit" | "pattern" | "rich" | "range" | "amount" | "duration"
  | "pictures" | "multiselect" | "longlist" | "dependent" | "toggle" | "semantic" | "faces" | "thumbs" | "sum"
  | "availability" | "camera" | "crop" | "draw" | "record" | "quiz" | "score" | "calc"
  | "section" | "group" | "table" | "review" | "progress" | "picture" | "video"
  | "meeting" | "member" | "location" | "map" | "products";

/** What the Add list shows, in groups. */
export const QGROUPS: [string, [QType, string][]][] = [
  ["Contact", [["short", "Short answer"], ["long", "Long answer"], ["email", "Email"], ["phone", "Phone number"], ["name", "Full name"], ["company", "Company"], ["jobtitle", "Job title"], ["website", "Website"], ["social", "Social profile"], ["address", "Address"], ["country", "Country"], ["language", "Language"], ["timezone", "Time zone"], ["birthday", "Date of birth"]]],
  ["Text", [["pattern", "Formatted text"], ["rich", "Rich text"]]],
  ["Choices", [["choice", "Multiple choice"], ["checks", "Checkboxes"], ["dropdown", "Dropdown"], ["multiselect", "Multi-select dropdown"], ["longlist", "Searchable list"], ["dependent", "Dependent dropdown"], ["pictures", "Picture choice"], ["yesno", "Yes / No"], ["toggle", "Toggle"], ["ranking", "Ranking"], ["matrix", "Matrix"], ["likert", "Likert scale"], ["agree", "Agreement"], ["smsconsent", "Text consent"]]],
  ["Ratings", [["rating", "Rating"], ["scale", "Opinion scale"], ["nps", "Net Promoter Score"], ["faces", "Smiley scale"], ["thumbs", "Thumbs up or down"], ["semantic", "Semantic scale"], ["sum", "Points to spread"]]],
  ["Numbers and payments", [["number", "Number"], ["unit", "Number with unit"], ["slider", "Slider"], ["range", "Range slider"], ["currency", "Currency"], ["percent", "Percentage"], ["amount", "Amount picker"], ["products", "Product picker"], ["payment", "Payment"]]],
  ["Date and time", [["date", "Date picker"], ["time", "Time picker"], ["datetime", "Date and time"], ["month", "Month"], ["daterange", "Date range"], ["duration", "Duration"], ["availability", "Availability grid"]]],
  ["Files and media", [["file", "File upload"], ["image", "Image upload"], ["camera", "Camera photo"], ["crop", "Image with crop"], ["record", "Audio or video answer"], ["signature", "Signature"], ["draw", "Drawing"]]],
  ["Location", [["location", "Current location"], ["map", "Map pin"]]],
  ["Quiz and logic", [["quiz", "Quiz question"], ["score", "Score"], ["calc", "Calculation"], ["hidden", "Hidden field"], ["color", "Color picker"]]],
  ["Structure", [["section", "Section"], ["group", "Repeating group"], ["table", "Table input"], ["review", "Answer review"], ["progress", "Progress bar"]]],
  ["Workspace", [["meeting", "Meeting type"], ["member", "Team member"]]],
  ["Display", [["heading", "Heading"], ["text", "Paragraph"], ["divider", "Divider"], ["picture", "Image"], ["video", "Video"]]],
];
export const QNAME = Object.fromEntries(QGROUPS.flatMap(([, xs]) => xs)) as Record<QType, string>;

const LABEL: Record<QType, string> = {
  short: "Short answer", long: "Tell us more", email: "Email address", phone: "Phone number", address: "Address", choice: "Select one", checks: "Select all that apply",
  dropdown: "Select an option", yesno: "Yes or no?", ranking: "Rank in order of importance", rating: "How would you rate your experience?", scale: "How likely are you to recommend us?",
  number: "Quantity", payment: "Payment", date: "Select a date", time: "Select a time", file: "Upload a file", signature: "Signature",
  name: "Full name", company: "Company", jobtitle: "Job title", website: "Website", country: "Country", birthday: "Date of birth",
  matrix: "Rate each of the following", likert: "How much do you agree with each statement?", agree: "I agree to the terms and conditions", smsconsent: "Text consent",
  nps: "How likely are you to recommend us to a friend?", slider: "How satisfied are you?", currency: "Budget", percent: "Percentage",
  datetime: "Select a date and time", month: "Select a month", daterange: "Select your dates", image: "Upload an image", color: "Pick a color", hidden: "Hidden field",
  language: "Preferred language", timezone: "Time zone", social: "LinkedIn profile", unit: "Weight", pattern: "ZIP code", rich: "Tell us more",
  range: "Budget range", amount: "Choose an amount", duration: "How long?", pictures: "Pick one", multiselect: "Select all that apply",
  longlist: "Search and select", dependent: "Select an option", toggle: "Send me updates", semantic: "How was it?", faces: "How do you feel?",
  thumbs: "Was this helpful?", sum: "Spread 100 points by importance", availability: "When are you available?", camera: "Take a photo",
  crop: "Upload a profile picture", draw: "Draw it", record: "Record your answer", quiz: "Question 1", score: "Your score", calc: "Total",
  section: "Section", group: "Who's coming?", table: "Fill in the table", review: "", progress: "", picture: "Image", video: "Video",
  meeting: "Which meeting?", member: "Who would you like to meet?", location: "Your location", map: "Drop a pin", products: "Choose your products",
  heading: "Section heading", text: "Add a short description for this section.", divider: "",
};
/** The name a new question's answer goes under, before it's made unique. */
const BASE: Record<QType, string> = {
  short: "answer", long: "details", email: "email", phone: "phone", address: "address", choice: "choice", checks: "picks", dropdown: "pick",
  yesno: "yes_no", ranking: "ranking", rating: "rating", scale: "score", number: "number", payment: "payment", date: "date", time: "time",
  file: "file", signature: "signature", name: "name", company: "company", jobtitle: "job_title", website: "website", country: "country",
  birthday: "birthday", matrix: "matrix", likert: "agreement", agree: "terms", smsconsent: "sms_consent", nps: "nps", slider: "satisfaction", currency: "budget",
  percent: "percent", datetime: "date_time", month: "month", daterange: "dates", image: "image", color: "color", hidden: "ref",
  language: "language", timezone: "time_zone", social: "linkedin", unit: "weight", pattern: "zip", rich: "details", range: "range",
  amount: "amount", duration: "duration", pictures: "picture", multiselect: "picks", longlist: "pick", dependent: "subcategory",
  toggle: "updates", semantic: "ease", faces: "mood", thumbs: "helpful", sum: "points", availability: "availability", camera: "photo",
  crop: "photo", draw: "drawing", record: "recording", quiz: "q1", score: "score", calc: "total", section: "", group: "guests", table: "table",
  review: "", progress: "", picture: "image", video: "video", meeting: "meeting", member: "person", location: "location", map: "pin", products: "products",
  heading: "", text: "", divider: "",
};
/** The contact field a new question saves to, when the page has none yet. */
export const SAVES: Partial<Record<QType, string>> = { email: "email", phone: "phone", name: "name", company: "company", jobtitle: "title", website: "website", country: "country" };
export const isLayout = (t: QType) => t === "heading" || t === "text" || t === "divider" || t === "section" || t === "review" || t === "progress";

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
/** Languages offered by the Language field, by code; their names come from the browser in the page's language. */
const LANGS = "en es fr de it pt nl sv no da fi pl cs sk hu ro bg el tr ru uk ar he fa hi bn ur ta te mr th vi id ms tl zh ja ko sw am yo zu af ca eu gl hr sr sl lt lv et is ga cy".split(" ");
export function languageOptions(locale = "en"): string[] {
  try {
    const dn = new Intl.DisplayNames([locale], { type: "language" });
    return LANGS.map((c) => dn.of(c) ?? c).sort((a, b) => a.localeCompare(b));
  } catch {
    return LANGS;
  }
}
/** Every time zone the browser knows, as IANA names (America/New_York). */
export function timeZoneOptions(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"];
  }
}
const pipeList = (xs: string[]) => xs.map((x) => x.replace(/\|/g, "/")).join("|");

export function questionHtml(type: QType, name: string, o: { save?: string; options?: string[]; parent?: string } = {}): string {
  const id = `q_${name}`;
  const label = LABEL[type];
  const err = `<p class="error" data-cl-error-for="${name}"></p>`;
  const lab = `<label class="label" for="${id}">${esc(label)}</label>`;
  const save = o.save ? ` data-cl-save="${o.save}"` : "";
  const block = (field: string, extra = "") => `<div class="q"><div data-cl-field="${field}" data-cl-name="${name}" data-cl-label="${esc(label)}"${save}${extra} id="${id}"></div></div>`;
  const choices = (t: "radio" | "checkbox", opts: string[], scores?: number[], extra = "") =>
    `<fieldset class="q"${extra}><legend class="label">${esc(label)}</legend><div class="choices">${opts.map((x, i) => `<label class="choice"><input type="${t}" name="${name}" value="${esc(x)}"${scores ? ` data-cl-score="${scores[i] ?? 0}"` : ""}${i === 0 ? ` data-cl-label="${esc(label)}"` : ""}> ${esc(x)}</label>`).join("")}</div>${err}</fieldset>`;
  const select = (opts: string[]) => `<div class="q">${lab}<select class="field" id="${id}" name="${name}"><option value="">Choose one</option>${opts.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>${err}</div>`;
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
    case "smsconsent":
      return `<div class="q"><label class="choice"><input type="checkbox" id="${id}" name="${name}" value="Yes" data-cl-label="${esc(label)}"> ${esc(SMS_WORDING)}</label>${err}</div>`;
    case "agree":
      return `<div class="q"><label class="choice"><input type="checkbox" id="${id}" name="${name}" value="Yes" required data-cl-label="${esc(label)}"> I agree to the <a href="https://example.com/terms" target="_blank" rel="noopener">terms and conditions</a></label>${err}</div>`;
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
    case "social":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="url" placeholder="https://linkedin.com/in/yourname" inputmode="url">${err}</div>`;
    case "language":
      return block("list", ` data-cl-options="${esc(pipeList(o.options ?? languageOptions()))}"`);
    case "timezone":
      return block("list", ` data-cl-options="${esc(pipeList(o.options ?? timeZoneOptions()))}"`);
    case "longlist":
      return block("list", ` data-cl-options="${esc(pipeList(o.options ?? ["Option 1", "Option 2", "Option 3"]))}"`);
    case "multiselect":
      return block("list", ` data-cl-multi data-cl-options="${esc(pipeList(o.options ?? ["Option 1", "Option 2", "Option 3"]))}"`);
    case "dependent": {
      // The list it follows comes first: each of its answers has its own options below.
      const parent = o.parent ?? `${name}_parent`;
      const pid = `q_${parent}`;
      return `<div class="q"><label class="label" for="${pid}">Category</label><select class="field" id="${pid}" name="${parent}"><option value="">Choose one</option><option value="Category A">Category A</option><option value="Category B">Category B</option></select><p class="error" data-cl-error-for="${parent}"></p></div>${block("list", ` data-cl-by="${parent}" data-cl-map="Category A=&gt;Option 1|Option 2
Category B=&gt;Option 3|Option 4"`)}`;
    }
    case "pictures":
      return block("pictures", ` data-cl-options="Option 1|Option 2|Option 3" data-cl-images="||"`);
    case "toggle":
      return `<div class="q"><label class="choice cl-switch"><input type="checkbox" role="switch" id="${id}" name="${name}" value="Yes" data-cl-label="${esc(label)}"> ${esc(label)}</label>${err}</div>`;
    case "unit":
      return `<div class="q">${lab}<div class="cl-unit"><input class="field" id="${id}" name="${name}" type="number" inputmode="decimal" step="any"><span class="cl-unit-tx">kg</span></div>${err}</div>`;
    case "pattern":
      return `<div class="q">${lab}<input class="field" id="${id}" name="${name}" type="text" inputmode="numeric" pattern="[0-9]{5}" title="Enter 5 digits." placeholder="12345" autocomplete="postal-code">${err}</div>`;
    case "rich":
      return block("rich");
    case "range":
      return block("range", ` data-cl-min="0" data-cl-max="10000" data-cl-step="100"`);
    case "amount":
      return block("amount", ` data-cl-amounts="10|25|50|100" data-cl-currency="USD"`);
    case "duration":
      return block("duration");
    case "semantic":
      return block("rating", ` data-cl-scale="7" data-cl-style="numbers" data-cl-low="Difficult" data-cl-high="Easy"`);
    case "faces":
      return block("rating", ` data-cl-scale="5" data-cl-style="faces"`);
    case "thumbs":
      return block("rating", ` data-cl-style="thumbs"`);
    case "sum":
      return block("sum", ` data-cl-options="Price|Quality|Support" data-cl-total="100"`);
    case "availability":
      return block("slots", ` data-cl-rows="Monday|Tuesday|Wednesday|Thursday|Friday" data-cl-cols="Morning|Afternoon|Evening"`);
    case "camera":
      return block("file", ` data-cl-kinds="image" data-cl-max="10" data-cl-capture`);
    case "crop":
      return block("crop", ` data-cl-max="10"`);
    case "draw":
      return block("draw");
    case "record":
      return block("record", ` data-cl-kinds="audio" data-cl-max="20"`);
    case "location":
      return block("location");
    case "map":
      return block("map");
    case "products":
      return block("products", ` data-cl-options="Product A|Product B" data-cl-prices="20|35" data-cl-currency="USD"`);
    case "quiz":
      return choices("radio", ["Correct answer", "Wrong answer", "Wrong answer 2"], [1, 0, 0], " data-cl-quiz");
    case "score":
      return block("calc", ` data-cl-quiz data-cl-formula="0"`);
    case "calc":
      return block("calc", ` data-cl-formula="0"`);
    case "group":
      return block("group", ` data-cl-fields="Name::text|Email::email" data-cl-max="5" data-cl-add="Add another"`);
    case "table":
      return block("table", ` data-cl-rows="Item 1|Item 2|Item 3" data-cl-cols="Quantity|Notes"`);
    case "meeting":
    case "member":
      return select(o.options?.length ? o.options : type === "meeting" ? ["Intro call"] : ["Anyone"]);
    case "picture":
      return block("image", ` data-cl-src="" data-cl-alt=""`);
    case "video":
      return block("video", ` data-cl-src=""`);
    case "section":
      return `<section class="cl-section" data-cl-section><h3 class="heading">Section</h3><p class="text">Add fields to this section.</p></section>`;
    case "review":
      return `<div class="cl-review" data-cl-review></div>`;
    case "progress":
      return `<div class="cl-progress" data-cl-progress><i></i></div>`;
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
