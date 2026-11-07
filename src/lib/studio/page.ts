// Studio forms as live forms (docs/forms-chat-plan.md, Part 3). A studio form is the HTML and CSS Tia wrote, in the
// brand's CSS. To publish it, the HTML is cleaned to a list of tags and attributes (nothing can run code, post
// somewhere else or load a frame), its questions are read into the form's fields (so the send path, the CRM,
// routing and meetings work as for every form), and the page rides along on the form as `page`.
// The same code runs in the browser and on the server: no DOM, a small tokenizer.

import { layoutOf, mediaOk } from "../forms/media.ts";
import { CONTACT_KEYS, DEFAULT_CONSENT, type FieldKey, type FieldType } from "../forms/schema.ts";
import { DEFAULT_NOTIFY } from "../forms/notify.ts";
import { cleanRoute, routeCond, routeField, routeKind, type StudioRoute } from "./routes.ts";

/** After the send. A meeting books with Claritia's own calendar (`meeting`, with `routes`) or an outside scheduler (`tool` and its `link`). */
/**
 * What happens after the send. `routes`: Route by answer, read top to bottom, Otherwise `meeting`
 * (src/lib/studio/routes.ts). `always`: what every send does, whatever it books: email the team, post to Slack.
 */
export type PageAfter = { kind: "thanks" | "page" | "meeting"; url?: string; meeting?: string; routes?: StudioRoute[]; tool?: string; link?: string; always?: PageAlways };
export type PageAlways = { email?: boolean; to?: string[]; slack?: boolean };
const OUTSIDE = ["calendly", "calcom", "hubspot_meetings", "savvycal", "link"];
/** The page on a published form: its HTML, its own CSS, the brand's CSS, each question's name to its field id. */
/**
 * The page on a published form: its HTML, its own CSS, the brand's CSS, each question's name to its field id, and its
 * languages (docs/studio-v2-plan.md 6.4): `lang` is the page's own, `langs` the same page in other languages.
 */
export type Page = { html: string; css: string; brand: string; ids: Record<string, string>; after?: PageAfter; lang?: string; langs?: Record<string, string> };
export const LANG_CODE = /^[a-z]{2}(-[A-Z]{2})?$/;
export type PageQuestion = {
  name: string;
  id: string;
  type: string;
  label: string;
  /** Where the label came from: a real label, aria-label, the placeholder, or only the name. */
  labelFrom: "label" | "aria" | "placeholder" | "name";
  required: boolean;
  save?: string;
  options: { value: string; label: string; score?: number }[];
  /** Two separate inputs share this name (not a group of radios or check boxes): the second would overwrite the first. */
  twice?: true;
  /** The id the question keeps across renames (data-cl-id), when the page gives one. */
  fixed?: string;
  /** A Claritia block (docs/studio-v2-plan.md 6.2): an input the form script draws, in the brand's look. */
  block?: Block;
  /** data-cl-check="work_email" on an email input: free email addresses are refused. */
  work?: true;
  /** data-cl-verify on an email input: a code is sent to it before the form sends. */
  verify?: true;
  /** data-cl-key: where the answer saves (q.<name> on the submission, f.<field> on the contact), kept from a form made before. */
  key?: string;
};

/**
 * The inputs that must work the same on every form: Tia places them as <div data-cl-field="...">. The first nine take
 * an answer; the rest are worked out (calc), charged (payment), shown from other answers (result), or a structured
 * question (grid, ranking) or a hidden value (hidden), each drawn by the form script in the brand's classes.
 */
export const BLOCKS = [
  "file", "phone", "address", "date", "time", "daterange", "rating", "signature", "country", "calc", "payment", "result", "grid", "ranking", "hidden",
  // docs/fields-plan.md: a searchable list (one pick or many, or following another answer), picture cards, rows of
  // small questions, points to spread, a range, a table to fill in, the times that work, products, amounts to pick,
  // hours and minutes, formatted text, a drawing, a location, a pin on a map, a recording, a cropped picture, and a
  // picture or a video to show.
  "list", "pictures", "group", "sum", "range", "table", "slots", "products", "amount", "duration", "rich", "draw", "location", "map", "record", "crop", "image", "video",
] as const;
type ListItem = { value: string; label: string };
export type Block = {
  type: (typeof BLOCKS)[number];
  kinds?: ("pdf" | "image" | "office" | "audio" | "video")[];
  /** file: open the camera on phones. */
  capture?: true;
  maxMb?: number;
  scale?: number;
  style?: "stars" | "numbers" | "faces" | "thumbs";
  /** rating: starts at 0 (Net Promoter Score), and the words under the two ends. */
  zero?: true;
  low?: string;
  high?: string;
  /** calc: a formula over other questions by their names in braces, {guests} * 38; and how its number shows. */
  formula?: string;
  format?: "number" | "money" | "percent";
  decimals?: number;
  currency?: string;
  /** calc: worked out and kept, not shown on the form. */
  hide?: true;
  /** payment: the calc it charges (by name) or a fixed amount. */
  from?: string;
  amount?: number;
  /** result: what it shows, the calcs it reads (by name) and a meter's top. */
  kind?: "metric" | "meter" | "summary" | "bars" | "outcome";
  of?: string[];
  max?: number;
  /** grid: the rows asked about and the columns each is answered with. ranking: the options to put in order. */
  rows?: ListItem[];
  cols?: ListItem[];
  options?: ListItem[];
  /** hidden: where its value comes from. */
  source?: { from: "param" | "page" | "referrer" | "static"; name?: string; value?: string };
  /** list and pictures: many picks; list: the answer it follows (by name) and its options for each of that answer's. */
  multi?: true;
  by?: string;
  map?: Record<string, ListItem[]>;
  /** pictures: each option's picture, in order. products: each one's price, in order. amount: the amounts offered. */
  images?: string[];
  prices?: number[];
  amounts?: number[];
  /** sum: the total the points add up to. */
  total?: number;
  /** range: the lowest, highest and step. */
  lo?: number;
  hi?: number;
  step?: number;
  /** group: the small questions in each row (label and type), and the rows allowed. */
  fields?: { label: string; type: "text" | "email" | "phone" | "number" | "date" }[];
  add?: string;
  /** image and video: the address, and the picture's words. */
  src?: string;
  alt?: string;
  /** payment: coupon codes at checkout. address: suggestions as it's typed. phone: a code is sent to it. */
  coupons?: true;
  /** payment: who takes it (data-cl-pay-with), Stripe when left out. */
  provider?: "paypal" | "square";
  auto?: true;
  verify?: true;
};
/** Blocks that take no answer from the visitor: worked out, charged or shown. */
export const SHOWN_BLOCKS = new Set(["calc", "payment", "result", "image", "video"]);
/** Blocks that are a form type drawn another way, and the type they are. */
const BLOCK_TYPE: Partial<Record<Block["type"], (b: Block) => string>> = {
  list: (b) => (b.multi ? "multi" : "dropdown"),
  pictures: (b) => (b.multi ? "multi" : "choice"),
  amount: () => "number",
  duration: () => "number",
  rich: () => "textarea",
  draw: () => "signature",
  location: () => "text",
  map: () => "text",
  record: () => "file",
  crop: () => "file",
};
const BLOCK_UI: Partial<Record<Block["type"], string>> = { amount: "amounts", duration: "duration", rich: "rich", draw: "draw", location: "location", map: "map", record: "record", crop: "crop" };
const listUi = (b: Block) => (b.type === "list" && b.multi ? "dropdown" : undefined);

/** A list written "Value::Label|Other", or just "Label|Other" when the value is the label. */
function readList(raw: string | undefined, max = 100): ListItem[] {
  return String(raw ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((x) => {
      const at = x.indexOf("::");
      const value = (at > 0 ? x.slice(0, at) : x).trim().slice(0, 200);
      const label = (at > 0 ? x.slice(at + 2) : x).trim().slice(0, 200);
      return { value, label: label || value };
    })
    .filter((o, i, all) => o.value && all.findIndex((y) => y.value === o.value) === i);
}
/** The list as the page writes it (the converter and the Studio write lists this way). */
export const writeList = (xs: ListItem[]) => xs.map((o) => (o.value === o.label ? o.label : `${o.value}::${o.label}`).replace(/\|/g, "/")).join("|");

function readBlock(attrs: Record<string, string>): Block | null {
  const type = BLOCKS.find((b) => b === attrs["data-cl-field"]);
  if (!type) return null;
  const b: Block = { type };
  const num = (k: string) => {
    const n = Number(attrs[k]);
    return attrs[k] !== undefined && attrs[k] !== "" && Number.isFinite(n) ? n : null;
  };
  const list = (k: string) => String(attrs[k] ?? "").split("|").map((x) => x.trim());
  if (type === "file" || type === "record" || type === "crop") {
    const kinds = (attrs["data-cl-kinds"] ?? "").split(/[\s,]+/).filter((k): k is NonNullable<Block["kinds"]>[number] => ["pdf", "image", "office", "audio", "video"].includes(k));
    if (type === "record") b.kinds = kinds.some((k) => k === "video") ? ["audio", "video"] : ["audio"];
    else if (type === "crop") b.kinds = ["image"];
    else if (kinds.length) b.kinds = [...new Set(kinds)];
    const mb = Math.round(Number(attrs["data-cl-max"]));
    if (Number.isFinite(mb) && mb > 0) b.maxMb = Math.min(mb, 20);
    if ("data-cl-capture" in attrs) b.capture = true;
  }
  if (type === "list" || type === "pictures") {
    b.options = readList(attrs["data-cl-options"], type === "list" ? 10000 : 30);
    if ("data-cl-multi" in attrs) b.multi = true;
  }
  if (type === "list" && /^[A-Za-z][\w-]{0,60}$/.test(attrs["data-cl-by"] ?? "")) {
    b.by = attrs["data-cl-by"];
    // One line per answer of the list it follows: "Answer=>Option|Option".
    const map: Record<string, ListItem[]> = {};
    for (const line of String(attrs["data-cl-map"] ?? "").split("\n").slice(0, 50)) {
      const at = line.indexOf("=>");
      if (at < 1) continue;
      const opts = readList(line.slice(at + 2)).slice(0, 100);
      if (opts.length) map[line.slice(0, at).trim().slice(0, 200)] = opts;
    }
    b.map = map;
  }
  if (type === "pictures") b.images = list("data-cl-images").map((u) => (/^https:\/\/\S+$/.test(u) ? u.slice(0, 1000) : ""));
  if (type === "products") {
    b.options = readList(attrs["data-cl-options"]).slice(0, 50);
    b.prices = list("data-cl-prices").map((x) => Math.max(0, Number(x) || 0));
  }
  if (type === "sum") {
    b.options = readList(attrs["data-cl-options"]).slice(0, 12);
    const t = num("data-cl-total");
    b.total = t !== null && t > 0 ? Math.min(Math.round(t), 100000) : 100;
  }
  if (type === "amount") b.amounts = list("data-cl-amounts").map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 8);
  if (type === "range") {
    const lo = num("data-cl-min"), hi = num("data-cl-max"), st = num("data-cl-step");
    b.lo = lo ?? 0;
    b.hi = hi !== null && hi > b.lo ? hi : b.lo + 100;
    if (st !== null && st > 0) b.step = st;
  }
  if (type === "table" || type === "slots") {
    b.rows = readList(attrs["data-cl-rows"]).slice(0, type === "slots" ? 14 : 20);
    b.cols = readList(attrs["data-cl-cols"]).slice(0, type === "slots" ? 24 : 8);
  }
  if (type === "group") {
    const TYPES = ["text", "email", "phone", "number", "date"] as const;
    b.fields = list("data-cl-fields")
      .map((x) => {
        const at = x.lastIndexOf("::");
        const t = (at > 0 ? x.slice(at + 2).trim() : "text") as (typeof TYPES)[number];
        return { label: (at > 0 ? x.slice(0, at) : x).trim().slice(0, 200), type: TYPES.includes(t) ? t : "text" };
      })
      .filter((x) => x.label)
      .slice(0, 6);
    const mx = num("data-cl-max");
    b.max = mx !== null && mx >= 1 ? Math.min(Math.round(mx), 20) : 5;
    if (attrs["data-cl-add"]?.trim()) b.add = attrs["data-cl-add"].trim().slice(0, 40);
  }
  if (type === "image" || type === "video") {
    b.src = String(attrs["data-cl-src"] ?? "").trim().slice(0, 1000);
    if (attrs["data-cl-alt"]) b.alt = attrs["data-cl-alt"].slice(0, 200);
  }
  if (type === "payment" && "data-cl-coupons" in attrs) b.coupons = true;
  if (type === "payment" && (attrs["data-cl-pay-with"] === "paypal" || attrs["data-cl-pay-with"] === "square")) b.provider = attrs["data-cl-pay-with"];
  if (type === "address" && "data-cl-auto" in attrs) b.auto = true;
  if (type === "phone" && "data-cl-verify" in attrs) b.verify = true;
  if (type === "rating") {
    const sc = Math.round(Number(attrs["data-cl-scale"]));
    if (Number.isFinite(sc) && sc >= 3) b.scale = Math.min(sc, 10);
    const sty = attrs["data-cl-style"];
    if (sty === "numbers" || sty === "faces" || sty === "thumbs") b.style = sty;
    if (b.style === "numbers" && attrs["data-cl-zero"] !== undefined) b.zero = true;
    const lo = words(attrs["data-cl-low"] ?? "").slice(0, 60), hi = words(attrs["data-cl-high"] ?? "").slice(0, 60);
    if (lo) b.low = lo;
    if (hi) b.high = hi;
  }
  if (type === "calc" || type === "payment") {
    const cur = (attrs["data-cl-currency"] ?? "").toUpperCase();
    if (/^[A-Z]{3}$/.test(cur)) b.currency = cur;
  }
  if (type === "calc") {
    b.formula = String(attrs["data-cl-formula"] ?? "").slice(0, 500);
    const f = attrs["data-cl-format"];
    if (f === "money" || f === "percent" || f === "number") b.format = f;
    const d = num("data-cl-decimals");
    if (d !== null) b.decimals = Math.max(0, Math.min(4, Math.round(d)));
    if ("data-cl-hide" in attrs) b.hide = true;
  }
  if (type === "payment") {
    const from = attrs["data-cl-from"];
    if (from && /^[A-Za-z][\w-]{0,60}$/.test(from)) b.from = from;
    const amount = num("data-cl-amount");
    if (!b.from && amount !== null && amount > 0) b.amount = amount;
  }
  if (type === "result") {
    const k = attrs["data-cl-kind"];
    b.kind = k === "meter" || k === "summary" || k === "bars" || k === "outcome" ? k : "metric";
    b.of = String(attrs["data-cl-of"] ?? "")
      .split(/[\s,]+/)
      .filter((x) => /^[A-Za-z][\w-]{0,60}$/.test(x))
      .slice(0, 12);
    const max = num("data-cl-max");
    if (max !== null && max > 0) b.max = max;
  }
  if (type === "grid") {
    b.rows = readList(attrs["data-cl-rows"]).slice(0, 30);
    b.cols = readList(attrs["data-cl-cols"]).slice(0, 12);
  }
  if (type === "ranking") b.options = readList(attrs["data-cl-options"]).slice(0, 20);
  if (type === "hidden") {
    const from = attrs["data-cl-from"];
    const src: Block["source"] = { from: from === "page" || from === "referrer" || from === "static" ? from : "param" };
    const n = attrs["data-cl-param"];
    if (src.from === "param") src.name = /^[\w.-]{1,60}$/.test(n ?? "") ? n : (attrs["data-cl-name"] ?? "").slice(0, 60);
    if (src.from === "static") src.value = String(attrs["data-cl-value"] ?? "").slice(0, 500);
    b.source = src;
  }
  return b;
}

const MAX_HTML = 1_000_000;
const MAX_CSS = 200_000;

const TAGS = new Set([
  "div", "section", "header", "footer", "main", "article", "aside", "nav", "figure", "figcaption", "form", "fieldset", "legend",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "strong", "b", "em", "i", "small", "u", "s", "mark", "sup", "sub", "br", "hr", "ul", "ol", "li", "blockquote",
  "label", "input", "textarea", "select", "option", "optgroup", "button", "img", "a", "progress", "meter", "output", "details", "summary", "time", "abbr",
]);
const VOID = new Set(["input", "img", "br", "hr"]);
/** Tags dropped with everything inside them. */
const DROP = new Set(["script", "style", "iframe", "object", "embed", "template", "noscript", "link", "meta", "base", "frame", "frameset", "video", "audio", "canvas", "svg", "math", "portal", "title", "head"]);
const ATTRS = new Set([
  "id", "class", "name", "type", "value", "placeholder", "required", "checked", "selected", "disabled", "hidden", "for", "min", "max", "step",
  "minlength", "maxlength", "pattern", "rows", "cols", "multiple", "autocomplete", "inputmode", "alt", "title", "role", "tabindex", "lang", "dir", "open", "datetime", "href", "src", "width", "height",
]);
const TYPES = new Set(["text", "email", "tel", "number", "url", "date", "time", "radio", "checkbox", "range", "hidden", "search", "month", "week", "datetime-local", "color", "submit"]);
const FIELD_ID = /^[a-z0-9]{1,24}$/;
/** A key a question saves to: its answer on the submission (q.) or a custom contact field (f.). */
const SAVED_KEY = /^[qf]\.[a-z][a-z0-9_]{0,39}$/;
/** The answer's key on the submission for a question with no key of its own: its id, starting with a letter. */
const ownKey = (id: string) => `q.${/^[a-z]/.test(id) ? id : `n${id}`}`;
/** Contact answers: the browser's autofill name, and the input type that brings up the right keyboard. */
const AUTOFILL: Record<string, [string, string | null]> = { email: ["email", "email"], first_name: ["given-name", null], last_name: ["family-name", null], name: ["name", null], phone: ["tel", "tel"], company: ["organization", null], title: ["organization-title", null], website: ["url", "url"], country: ["country-name", null] };
const SAVE = new Set(["email", "first_name", "last_name", "name", "phone", "company", "title", "website", "country", "region"]);
const LONG_ATTRS = new Set(["data-cl-rows", "data-cl-cols", "data-cl-options", "data-cl-formula", "data-cl-show-if", "data-cl-images", "data-cl-map", "data-cl-prices", "data-cl-fields"]);
/** A searchable list holds up to 10,000 options, so its options and map may be long. */
const attrMax = (k: string) => (k === "data-cl-options" || k === "data-cl-map" ? 400_000 : k === "data-cl-images" ? 40_000 : LONG_ATTRS.has(k) ? 4000 : 500);
/** A choice's points (a quiz's score, a price's weight): data-cl-score on the radio, check box or option. */
const scoreOf = (attrs: Record<string, string>): number | undefined => {
  const n = Number(attrs["data-cl-score"]);
  return attrs["data-cl-score"] !== undefined && attrs["data-cl-score"] !== "" && Number.isFinite(n) ? Math.max(-100000, Math.min(100000, n)) : undefined;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(10|13);/g, "\n").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const words = (s: string) => unesc(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

function safeLink(v: string): string | null {
  const t = v.trim();
  if (/^mailto:[^\s<>"]+$/i.test(t) || /^#[\w-]{1,60}$/.test(t)) return t;
  try {
    const u = new URL(t);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

/** A short id a field can take, from a question's name: lower case letters and digits, unique. */
function idFor(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "q";
  let id = /^[a-z]/.test(base) ? base : `q${base}`.slice(0, 20);
  for (let i = 2; taken.has(id); i++) id = `${base.slice(0, 18)}${i}`;
  taken.add(id);
  return id;
}

/**
 * Where a tag ends: the first > outside a quoted value, so a show-if like "total >= 3000" stays whole. A tag with an
 * unclosed quote ends at its first > instead, as before.
 */
function tagEnd(src: string, lt: number): number {
  let q = "";
  for (let k = lt + 1; k < src.length && k < lt + 20_000; k++) {
    const c = src[k];
    if (q) {
      if (c === q) q = "";
    } else if (c === '"' || c === "'") {
      // A quote starts a value only after =, so an apostrophe in a broken tag can't swallow the page.
      if (/=\s*$/.test(src.slice(Math.max(lt, k - 4), k))) q = c;
    } else if (c === ">") return k;
  }
  return src.indexOf(">", lt);
}

/**
 * The page's HTML, cleaned, and its questions in order. A question is every input, textarea and select with a name
 * (radios and check boxes sharing a name are one question); its label is the label around it or pointing at it,
 * else its placeholder, else its name. A question under a show-if is never required on the server, since the
 * server doesn't run the page's conditions.
 */
export function cleanPage(raw: string, prevIds: Record<string, string> = {}): { html: string; questions: PageQuestion[] } {
  const src = String(raw ?? "").slice(0, MAX_HTML * 2);
  let out = "";
  let i = 0;
  const open: { tag: string; showIf: boolean }[] = [];
  let dropping: string | null = null;
  const qs: PageQuestion[] = [];
  const taken = new Set<string>();
  const byName = new Map<string, PageQuestion>();
  // Text of the label being read, the questions inside it, and labels that point at an element id.
  let label: { text: string; inside: { q: PageQuestion; opt?: { value: string; label: string } }[]; target: string } | null = null;
  const forLabel = new Map<string, string>();
  const byElId = new Map<string, { q: PageQuestion; opt?: { value: string; label: string } }>();
  let option: { value: string; text: string; q: PageQuestion; had: boolean; score?: number } | null = null;
  let select: PageQuestion | null = null;

  const question = (name: string, type: string, attrs: Record<string, string>): PageQuestion => {
    let q = byName.get(name);
    if (!q) {
      const save = SAVE.has(attrs["data-cl-save"] ?? "") ? attrs["data-cl-save"] : undefined;
      const fixed = FIELD_ID.test(attrs["data-cl-id"] ?? "") ? attrs["data-cl-id"] : undefined;
      const key = SAVED_KEY.test(attrs["data-cl-key"] ?? "") ? attrs["data-cl-key"] : undefined;
      q = { name, id: "", type, label: "", labelFrom: "name", required: false, ...(save ? { save } : {}), ...(fixed ? { fixed } : {}), ...(key ? { key } : {}), ...(attrs["data-cl-check"] === "work_email" ? { work: true as const } : {}), ...("data-cl-verify" in attrs ? { verify: true as const } : {}), options: [] };
      byName.set(name, q);
      qs.push(q);
    } else if (q.type === "checkbox" && type === "checkbox") q.type = "multi";
    else if (!(q.type === "radio" && type === "radio")) q.twice = true;
    if ("required" in attrs && !open.some((o) => o.showIf) && !("data-cl-show-if" in attrs)) q.required = true;
    // A group of choices names its question with data-cl-label on its inputs (its legend is only words on screen).
    if (attrs["data-cl-label"]?.trim() && q.labelFrom !== "label") {
      q.label = attrs["data-cl-label"].trim().slice(0, 300);
      q.labelFrom = "label";
    }
    if (!q.label && attrs["aria-label"]) {
      q.label = attrs["aria-label"].slice(0, 300);
      q.labelFrom = "aria";
    }
    if (!q.label && attrs.placeholder) {
      q.label = attrs.placeholder.slice(0, 300);
      q.labelFrom = "placeholder";
    }
    return q;
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    const text = lt < 0 ? src.slice(i) : src.slice(i, lt);
    if (!dropping && text) {
      out += esc(unesc(text));
      if (label) label.text += text;
      if (option) option.text += text;
    }
    if (lt < 0) break;
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (!/^<[a-zA-Z/!]/.test(src.slice(lt, lt + 2))) {
      if (!dropping) out += "&lt;";
      i = lt + 1;
      continue;
    }
    const gt = tagEnd(src, lt);
    if (gt < 0) break;
    const tag = src.slice(lt + 1, gt);
    i = gt + 1;
    const m = /^(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)(\/?)$/.exec(tag.trim());
    if (!m) continue;
    const closing = m[1] === "/";
    const name = m[2]!.toLowerCase();
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (DROP.has(name)) {
      if (!closing && m[4] !== "/") dropping = name;
      continue;
    }
    if (!TAGS.has(name)) continue;
    if (closing) {
      const at = open.map((o) => o.tag).lastIndexOf(name);
      if (at >= 0) for (const t of open.splice(at).reverse()) out += `</${t.tag}>`;
      if (name === "label" && label) {
        const t = words(label.text).slice(0, 300);
        if (label.target) forLabel.set(label.target, t);
        for (const x of label.inside) {
          if (x.opt) x.opt.label = t || x.opt.value;
          else if (t && (!x.q.label || x.q.labelFrom === "placeholder")) {
            x.q.label = t;
            x.q.labelFrom = "label";
          }
        }
        label = null;
      }
      if (name === "option" && option) {
        const t = words(option.text).slice(0, 200);
        option.q.options.push({ value: option.had ? option.value : t, label: t || option.value, ...(option.score !== undefined ? { score: option.score } : {}) });
        option = null;
      }
      if (name === "select") select = null;
      continue;
    }
    const attrs: Record<string, string> = {};
    const kept: string[] = [];
    const re = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = re.exec(m[3]!))) {
      const k = a[1]!.toLowerCase();
      const v = unesc(a[3] ?? a[4] ?? a[5] ?? "");
      if (k in attrs) continue;
      attrs[k] = v;
      if (k.startsWith("on") || k === "srcdoc" || k === "formaction" || k === "action") continue;
      if (k === "style") {
        if (v && v.length <= 1000 && !/url\s*\(|expression|javascript:|behavior|binding|@import|[<>\\]/i.test(v)) kept.push(`style="${esc(v)}"`);
        continue;
      }
      if (k.startsWith("data-cl-")) {
        // A photo: only from the library or the starter photos, with its layout, focus and widths in their own shapes.
        if (k === "data-cl-media") {
          if (mediaOk(v)) kept.push(`${k}="${esc(v.trim())}"`);
          continue;
        }
        if (k === "data-cl-layout" || k === "data-cl-focus" || k === "data-cl-sizes") {
          if (k === "data-cl-layout" ? layoutOf(v, false) : k === "data-cl-focus" ? /^\d{1,3},\d{1,3}$/.test(v.trim()) : /^\d{3,4}(,\d{3,4}){0,3}$/.test(v.trim())) kept.push(`${k}="${esc(v.trim())}"`);
          continue;
        }
        // A grid's rows and columns, a ranking's options and a formula run longer than other settings.
        if (/^data-cl-[a-z-]{1,20}$/.test(k)) kept.push(v ? `${k}="${esc(v.slice(0, attrMax(k)))}"` : k);
        continue;
      }
      if (k.startsWith("aria-") && /^aria-[a-z]{1,20}$/.test(k)) {
        kept.push(`${k}="${esc(v.slice(0, 300))}"`);
        continue;
      }
      if (!ATTRS.has(k)) continue;
      if (k === "href") {
        const ok = name === "a" ? safeLink(v) : null;
        if (ok) kept.push(`href="${esc(ok)}"`, 'rel="noopener noreferrer"', 'target="_blank"');
      } else if (k === "src") {
        // The logo is the only picture, and the form fills it in from the brand.
      } else if (k === "type") {
        const t = v.toLowerCase();
        if (name === "button") kept.push(`type="${t === "submit" ? "submit" : "button"}"`);
        else if (name === "input") kept.push(`type="${TYPES.has(t) ? t : "text"}"`);
      } else if (k === "class") {
        const c = v.split(/\s+/).filter((x) => /^[a-zA-Z_-][a-zA-Z0-9_-]{0,60}$/.test(x)).slice(0, 12).join(" ");
        if (c) kept.push(`class="${c}"`);
      } else if (k === "name" || k === "id" || k === "for") {
        if (/^[A-Za-z][\w-]{0,60}$/.test(v)) kept.push(`${k}="${v}"`);
      } else kept.push(v ? `${k}="${esc(v.slice(0, 300))}"` : k);
    }
    if (name === "img" && !("data-cl-logo" in attrs)) continue;
    if (name === "button" && !("type" in attrs)) kept.push('type="button"');
    // The right keyboard and the browser's autofill for contact answers (docs/studio-v2-plan.md 6.4).
    if (name === "input" && attrs["data-cl-save"] && AUTOFILL[attrs["data-cl-save"]]) {
      const [auto, type] = AUTOFILL[attrs["data-cl-save"]]!;
      if (!("autocomplete" in attrs)) kept.push(`autocomplete="${auto}"`);
      const t = (attrs.type ?? "text").toLowerCase();
      if (type && (t === "text" || !("type" in attrs))) {
        const i = kept.findIndex((x) => x.startsWith("type="));
        if (i >= 0) kept.splice(i, 1);
        kept.push(`type="${type}"`);
      }
    }
    if (name === "form") kept.push("novalidate");
    const qName = /^[A-Za-z][\w-]{0,60}$/.test(attrs.name ?? "") ? attrs.name! : "";
    // A Claritia block: its question's name, label and rules are on the block.
    const block = readBlock(attrs);
    const bName = /^[A-Za-z][\w-]{0,60}$/.test(attrs["data-cl-name"] ?? "") ? attrs["data-cl-name"]! : "";
    if (block && bName) {
      const battrs: Record<string, string> = { ...(attrs["data-cl-save"] ? { "data-cl-save": attrs["data-cl-save"] } : {}), ...(attrs["data-cl-id"] ? { "data-cl-id": attrs["data-cl-id"] } : {}), ...(attrs["data-cl-key"] ? { "data-cl-key": attrs["data-cl-key"] } : {}), ...("data-cl-required" in attrs ? { required: "" } : {}), ...("data-cl-show-if" in attrs ? { "data-cl-show-if": "" } : {}) };
      const q = question(bName, `block:${block.type}`, battrs);
      q.block = block;
      if (attrs["data-cl-label"]?.trim() && q.labelFrom !== "label") {
        q.label = attrs["data-cl-label"].trim().slice(0, 300);
        q.labelFrom = "label";
      }
    }
    // Questions
    if (qName && (name === "input" || name === "textarea" || name === "select")) {
      const t = name === "input" ? (TYPES.has((attrs.type ?? "text").toLowerCase()) ? (attrs.type ?? "text").toLowerCase() : "text") : name;
      if (t !== "hidden" && t !== "submit") {
        const q = question(qName, t === "radio" ? "radio" : t === "checkbox" ? "checkbox" : t, attrs);
        let opt: { value: string; label: string } | undefined;
        if (t === "radio" || t === "checkbox") {
          const score = scoreOf(attrs);
          opt = { value: attrs.value ?? "on", label: attrs.value ?? "", ...(score !== undefined ? { score } : {}) };
          if (!q.options.some((o) => o.value === opt!.value)) q.options.push(opt);
          else opt = q.options.find((o) => o.value === opt!.value);
        }
        if (label) label.inside.push({ q, ...(opt ? { opt } : {}) });
        if (attrs.id) byElId.set(attrs.id, { q, ...(opt ? { opt } : {}) });
        if (name === "select") select = q;
      }
    }
    if (name === "label") label = { text: "", inside: [], target: attrs.for ?? "" };
    if (name === "option" && select) {
      const score = scoreOf(attrs);
      option = { value: attrs.value ?? "", text: "", q: select, had: "value" in attrs, ...(score !== undefined ? { score } : {}) };
    }
    out += `<${name}${kept.length ? ` ${kept.join(" ")}` : ""}>`;
    if (!VOID.has(name) && m[4] !== "/") open.push({ tag: name, showIf: "data-cl-show-if" in attrs });
    else if (!VOID.has(name)) out += `</${name}>`;
    if (out.length > MAX_HTML) break;
  }
  for (const t of open.reverse()) out += `</${t.tag}>`;
  // Labels that point at a question by its element's id.
  for (const [el, t] of forLabel) {
    const x = byElId.get(el);
    if (!x) continue;
    if (x.opt) x.opt.label = t || x.opt.value;
    else if (t && (!x.q.label || x.q.labelFrom === "placeholder")) {
      x.q.label = t;
      x.q.labelFrom = "label";
    }
  }
  // Each question keeps its id: the page's data-cl-id first, then the id the same name had last time, then a new one.
  for (const q of qs) if (q.fixed && !taken.has(q.fixed)) taken.add((q.id = q.fixed));
  for (const q of qs) {
    if (q.id) continue;
    const before = prevIds[q.name];
    if (before && FIELD_ID.test(before) && !taken.has(before)) taken.add((q.id = before));
    else q.id = idFor(q.name, taken);
  }
  for (const q of qs) {
    if (!q.label) q.label = q.name.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
    // A lone check box is a yes; a group of them is pick many.
    if (q.type === "checkbox" && q.options.length > 1) q.type = "multi";
    q.options = q.options.filter((o) => o.value !== "").slice(0, 100);
  }
  return { html: out.length > MAX_HTML ? "" : out, questions: qs.slice(0, 40) };
}

/** A stylesheet a page may hold: no scripts in any form, links only to https fonts and pictures, no closing tags. */
export function cleanPageCss(raw: string): string {
  const css = String(raw ?? "").slice(0, MAX_CSS);
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    .replace(/<\//g, "")
    .replace(/expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/gi, "x-blocked:")
    .replace(/@import\s+(?:url\(\s*(["']?)([^"')]+)\1\s*\)|(["'])([^"']+)\3)[^;\n]*;?/gi, (all, _q1, u1, _q2, u2) => (/^https:\/\/fonts\.googleapis\.com\//.test(String(u1 || u2 || "").trim()) ? all : ""))
    .replace(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi, (all, _q, u) => (/^https:\/\//.test(String(u).trim()) ? all : "none"));
}

const KIND: Record<string, string> = { email: "email", tel: "phone", number: "number", url: "url", date: "date", textarea: "textarea", select: "dropdown", radio: "choice", multi: "multi", checkbox: "checkbox", range: "number" };

/** A formula over names, {guests} * 38, as the form runs it, over field ids. A name the page doesn't have stays, so the check says so. */
export const formulaIds = (formula: string, byName: (n: string) => string | undefined) => formula.replace(/\{([A-Za-z][\w-]{0,60})\}/g, (m, n: string) => (byName(n) ? `{${byName(n)}}` : m));

/** A calculation, a payment or a result: worked out from other answers, never asked, never required. */
function shownField(q: PageQuestion, b: Block, byName: (n: string | undefined) => string | undefined): Record<string, unknown> {
  const base = { id: q.id, type: b.type, label: q.label, required: false };
  if (b.type === "calc")
    return {
      ...base,
      key: q.key ?? ownKey(q.id),
      calc: {
        formula: formulaIds(b.formula ?? "", (n) => byName(n)),
        ...(b.format ? { format: b.format } : {}),
        ...(b.decimals !== undefined ? { decimals: b.decimals } : {}),
        ...(b.currency ? { currency: b.currency } : {}),
        ...(b.hide ? { show: false } : {}),
      },
    };
  if (b.type === "payment") {
    const field = byName(b.from);
    // A payment that names a calc the page doesn't have keeps its name, so the form check says the calc is gone.
    return { ...base, pay: { currency: b.currency ?? "USD", ...(field ? { field } : b.from ? { field: b.from } : b.amount ? { amount: b.amount } : {}), ...(b.coupons ? { coupons: true } : {}), ...(b.provider ? { provider: b.provider } : {}) } };
  }
  if (b.type === "image" || b.type === "video") return { ...base, content: { src: b.src ?? "", ...(b.alt ? { alt: b.alt } : {}) } };
  const of = (b.of ?? []).map((n) => byName(n) ?? n);
  const kind = b.kind ?? "metric";
  return { ...base, result: { kind, ...(kind === "metric" || kind === "meter" ? (of[0] ? { field: of[0] } : {}) : of.length ? { fields: of } : {}), ...(b.max ? { max: b.max } : {}) } };
}

/**
 * The form a studio page publishes as: one step of the page's questions, each saved to its contact field or kept as
 * the form's own answer, and what happens after the send (a thank-you, a page or a meeting with its routes).
 */
export function pageForm(p: { html: string; css: string; brand: string; after: PageAfter; title?: string; prevIds?: Record<string, string>; turnstile?: boolean; lang?: string; langs?: Record<string, string> }): { form: Record<string, unknown>; questions: PageQuestion[] } {
  const { html, questions } = cleanPage(p.html, p.prevIds);
  const keys = new Set<string>();
  // Formulas, payments and results name other questions; the form runs on field ids.
  const idOfName = new Map(questions.map((q) => [q.name, q.id]));
  const markedEmail = questions.some((q) => q.save === "email");
  const byName = (n: string | undefined) => (n ? idOfName.get(n) : undefined);
  const fields = questions.map((q) => {
    const b = q.block;
    if (b && SHOWN_BLOCKS.has(b.type)) return shownField(q, b, byName);
    let type = (b ? (BLOCK_TYPE[b.type]?.(b) ?? b.type) : q.type === "dropdown" ? "dropdown" : (KIND[q.type] ?? "text")) as FieldType;
    // A contact field only takes the types it can hold (Company can't be a dropdown); anything else stays on the form.
    const fits = (k: string) => CONTACT_KEYS.some((c) => c.key === k && (c.types.includes(type) || (k === "email" && type === "text") || (k === "phone" && type === "text")));
    // The email marked data-cl-save="email" is the contact's; only a page with none gives it to its first email.
    let key: string = q.save && !keys.has(q.save) && fits(q.save) ? q.save : (q.save === "email" || (q.type === "email" && !markedEmail && !q.key)) && !keys.has("email") && fits("email") ? "email" : q.key && !keys.has(q.key) ? q.key : ownKey(q.id);
    if (keys.has(key)) key = ownKey(q.id);
    keys.add(key);
    if (key === "email") type = "email";
    if (key === "phone" && type === "text") type = "phone";
    const opts = type === "choice" || type === "multi" || type === "dropdown";
    return {
      id: q.id,
      key: key as FieldKey,
      type,
      label: q.label,
      required: q.required && type !== "hidden",
      ...(q.work && type === "email" ? { check: "work_email" } : {}),
      ...(opts ? { options: q.options.length ? q.options : [{ value: "yes", label: "Yes" }] } : {}),
      ...(b?.type === "file" || b?.type === "record" || b?.type === "crop" ? { file: { maxMb: b.maxMb ?? 10, kinds: b.kinds ?? ["pdf", "image", "office"], ...(b.capture ? { capture: true } : {}) } } : {}),
      ...(b && (BLOCK_UI[b.type] ?? listUi(b)) ? { ui: BLOCK_UI[b.type] ?? listUi(b) } : {}),
      ...(b?.type === "list" || b?.type === "pictures" || b?.type === "sum" ? { options: b.options ?? [] } : {}),
      ...(b?.type === "list" && b.by ? { optionsBy: { field: byName(b.by) ?? b.by, map: b.map ?? {} } } : {}),
      ...(b?.type === "pictures" ? { cards: true, options: (b.options ?? []).map((o, i) => ({ ...o, ...(b.images?.[i] ? { image: b.images[i] } : {}) })) } : {}),
      ...(b?.type === "products" ? { options: (b.options ?? []).map((o, i) => ({ ...o, score: b.prices?.[i] ?? 0 })), currency: b.currency ?? "USD" } : {}),
      ...(b?.type === "sum" ? { total: b.total ?? 100 } : {}),
      ...(b?.type === "amount" ? { amounts: b.amounts ?? [], unit: "money" } : {}),
      ...(b?.type === "duration" ? { valid: { min: 0 } } : {}),
      ...(b?.type === "range" ? { valid: { min: b.lo ?? 0, max: b.hi ?? 100, ...(b.step ? { step: b.step } : {}) } } : {}),
      ...(b?.type === "table" || b?.type === "slots" ? { grid: { rows: b.rows ?? [], cols: b.cols ?? [] } } : {}),
      ...(b?.type === "group" ? { group: { fields: (b.fields ?? []).map((x, i) => ({ id: `${q.id.slice(0, 18)}r${i}`, type: x.type, label: x.label, required: i === 0 })), max: b.max ?? 5, ...(b.add ? { add: b.add } : {}) } } : {}),
      ...(b?.type === "address" && b.auto ? { auto: true } : {}),
      ...((b?.type === "phone" && b.verify) || (!b && q.verify && type === "email") ? { verify: true } : {}),
      ...(b?.type === "rating" ? { rating: { scale: b.scale ?? 5, style: b.style ?? "stars", ...(b.zero ? { zero: true as const } : {}), ...(b.low ? { low: b.low } : {}), ...(b.high ? { high: b.high } : {}) } } : {}),
      ...(b?.type === "grid" ? { grid: { rows: b.rows ?? [], cols: b.cols ?? [] } } : {}),
      ...(b?.type === "ranking" ? { options: b.options ?? [] } : {}),
      ...(b?.type === "hidden" && b.source ? { hidden: b.source } : {}),
    };
  });
  const ids = Object.fromEntries(questions.map((q) => [q.name, q.id]));
  const keyOf = new Map(fields.map((f) => [f.id as string, f.key as string | undefined]));
  const a = p.after;
  const outside = a.kind === "meeting" && a.tool && OUTSIDE.includes(a.tool) ? { tool: a.tool, url: (a.link ?? "").slice(0, 500), perOwner: false } : null;
  const schedule =
    outside ??
    (a.kind === "meeting" && a.meeting
      ? {
          tool: "claritia",
          url: "",
          meetingTypeId: a.meeting,
          // Each row is one condition; a row whose question is gone or whose value is missing never routes anyone.
          routes: (a.routes ?? []).flatMap((raw, i) => {
            const r = cleanRoute(raw);
            if (!r || !r.meeting) return [];
            const field = routeField(r, (name) => (ids[name] ? keyOf.get(ids[name]!) : null));
            const c = field ? routeCond(r, field, routeKind(r.field, questions.find((q) => q.name === r.field))) : null;
            return c ? [{ id: `r${i + 1}`, meet: r.meeting, conds: [c] }] : [];
          }),
        }
      : null);
  const end = a.kind === "page" && a.url ? { kind: "redirect", url: a.url } : { kind: "message", title: "Thanks, we got it." };
  const routes = (a.routes ?? []).map(cleanRoute).filter((r): r is StudioRoute => !!r).slice(0, 30);
  const always = cleanAlways(a.always);
  const after: PageAfter = { kind: a.kind, ...(a.url ? { url: a.url.slice(0, 500) } : {}), ...(a.meeting ? { meeting: a.meeting } : {}), ...(routes.length ? { routes } : {}), ...(outside ? { tool: outside.tool, link: outside.url } : {}), ...(always ? { always } : {}) };
  // Email the team and post to Slack: the form's team alert (src/lib/forms/notify.ts), sent on every real send.
  const notify = always ? { ...DEFAULT_NOTIFY, on: !!(always.email && always.to?.length) || !!always.slack, to: always.email ? (always.to ?? []) : [], slack: !!always.slack } : null;
  return {
    questions,
    form: {
      steps: [{ id: "page", fields }],
      rules: [],
      layout: { labels: "above", width: "wide" },
      ...(p.title ? { title: p.title.slice(0, 300) } : {}),
      ...(keys.has("email") ? {} : { emailOptional: true }),
      submit: { label: "Submit" },
      // Consent by region and the spam checks, as on every form (docs/studio-v2-plan.md 6.3).
      consent: { mode: "by_region", label: DEFAULT_CONSENT },
      spam: { minSeconds: 2, turnstile: p.turnstile === true },
      after: { end, ...(schedule ? { schedule } : {}) },
      ...(notify ? { notify } : {}),
      page: { html, css: cleanPageCss(p.css), brand: cleanPageCss(p.brand), ids, after, ...pageLangs(p.lang, p.langs) },
    },
  };
}

/** The page on a form, cleaned again (checkForm runs this on every save and publish). */
/** The page's languages, cleaned: its own language code, and up to six translations with their codes. */
function pageLangs(lang: unknown, langs: unknown): { lang?: string; langs?: Record<string, string> } {
  const own = typeof lang === "string" && LANG_CODE.test(lang) ? lang : undefined;
  const out: Record<string, string> = {};
  for (const [code, html] of Object.entries(langs && typeof langs === "object" ? (langs as Record<string, unknown>) : {}).slice(0, 6))
    if (LANG_CODE.test(code) && code !== own && typeof html === "string" && html.trim()) {
      const clean = cleanPage(html).html;
      if (clean) out[code] = clean;
    }
  return { ...(own ? { lang: own } : {}), ...(Object.keys(out).length ? { langs: out } : {}) };
}

export function checkPage(raw: unknown, fieldIds: Set<string>): Page | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.html !== "string" || !r.html.trim()) return null;
  const { html } = cleanPage(r.html);
  const ids: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.ids && typeof r.ids === "object" ? (r.ids as Record<string, unknown>) : {})) if (/^[A-Za-z][\w-]{0,60}$/.test(k) && typeof v === "string" && fieldIds.has(v)) ids[k] = v;
  const af = (r.after && typeof r.after === "object" ? r.after : {}) as Record<string, unknown>;
  const kind = af.kind === "page" || af.kind === "meeting" ? af.kind : "thanks";
  const routes = (Array.isArray(af.routes) ? af.routes : [])
    .slice(0, 30)
    .map(cleanRoute)
    .filter((r): r is StudioRoute => !!r);
  const always = cleanAlways(af.always);
  const tool = typeof af.tool === "string" && OUTSIDE.includes(af.tool) ? af.tool : "";
  const after: PageAfter = { kind, ...(tool ? { tool, ...(typeof af.link === "string" && /^https:\/\//.test(af.link) ? { link: af.link.slice(0, 500) } : {}) } : {}), ...(typeof af.url === "string" && af.url ? { url: af.url.slice(0, 500) } : {}), ...(typeof af.meeting === "string" && af.meeting ? { meeting: af.meeting.slice(0, 40) } : {}), ...(routes.length ? { routes } : {}), ...(always ? { always } : {}) };
  return { html, css: cleanPageCss(String(r.css ?? "")), brand: cleanPageCss(String(r.brand ?? "")), ids, after, ...pageLangs(r.lang, r.langs) };
}

const EMAIL = /^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

/** Always do, cleaned: up to 10 team emails. Null when it was never set (the form keeps the alerts it had). */
export function cleanAlways(raw: unknown): PageAlways | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const to = [...new Set((Array.isArray(r.to) ? r.to : []).filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter((x) => EMAIL.test(x)))].slice(0, 10);
  return { email: r.email === true, to, slack: r.slack === true };
}

/** The form's team alert as Always do shows it: Email the team with its emails, and Post to Slack. */
export function alwaysOf(notify: unknown): PageAlways {
  const n = (notify && typeof notify === "object" ? notify : {}) as { on?: unknown; to?: unknown; slack?: unknown };
  const to = Array.isArray(n.to) ? n.to.filter((x): x is string => typeof x === "string") : [];
  return cleanAlways({ email: n.on === true && to.length > 0, to, slack: n.on === true && n.slack === true })!;
}

/**
 * The team alert a Studio save keeps. Email the team and Post to Slack are the same alert as the form's Settings, so
 * the last place it changed wins: Always do left as it was last saved keeps the alert Settings set (`had`), and a
 * change here keeps the alert's subject and answers. Undefined when there's nothing to keep.
 */
export function teamAlert(had: unknown, now: unknown, always: unknown, wasAlways: unknown): unknown {
  if (!had || typeof had !== "object") return now;
  if (!now || typeof now !== "object") return had;
  const before = cleanAlways(wasAlways) ?? alwaysOf(had);
  if (JSON.stringify(cleanAlways(always)) === JSON.stringify(before)) return had;
  const n = now as { on: boolean; to: string[]; slack: boolean };
  return { ...(had as object), on: n.on, to: n.to, slack: n.slack };
}
