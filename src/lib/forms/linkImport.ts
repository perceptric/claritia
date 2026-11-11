// Import a Typeform or a Tally form as a Form Studio page, from the link people fill in (docs/integrations-plan.md,
// "Import from Typeform and Tally"). Both tools serve a published form's questions to anyone who opens it, so there's
// no sign-in: Typeform's form address answers its definition as JSON, and Tally's page carries its blocks. Each
// question becomes the Studio question it matches, in the page's own classes, with its label, options and required
// kept; the welcome screen and the thank-you come along. Logic jumps, scores, payments and anything with no match are
// named in the notes, so the person can check them. Pure: the route fetches, the tests pass a form in.

import { uniqueName } from "../studio/builder.ts";
import type { Imported } from "./googleImport.ts";

export type LinkTool = "google" | "typeform" | "tally";

/** Which tool a pasted link is from, and the form's id there. Null when it's none of them. */
export function formLink(raw: string): { tool: LinkTool; id: string } | null {
  const s = raw.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  if (host === "docs.google.com" && /^\/forms\//.test(path)) return { tool: "google", id: s };
  if (host === "typeform.com" || host.endsWith(".typeform.com")) {
    // The link people fill in (…/to/<id>), or the editor (admin.typeform.com/form/<id>/…).
    const m = /^\/to\/([A-Za-z0-9]{4,32})\b/.exec(path) ?? /^\/form\/([A-Za-z0-9]{4,32})\b/.exec(path);
    return m ? { tool: "typeform", id: m[1]! } : null;
  }
  if (host === "tally.so" || host === "www.tally.so") {
    // The link people fill in (/r/<id>), the embed (/embed/<id>) or the editor (/forms/<id>/edit).
    const m = /^\/(?:r|embed|forms)\/([A-Za-z0-9]{4,16})\b/.exec(path);
    return m ? { tool: "tally", id: m[1]! } : null;
  }
  return null;
}

/** Where the form's questions are read from. Fixed hosts; only the checked id goes in. */
export const typeformUrl = (id: string) => `https://form.typeform.com/forms/${encodeURIComponent(id)}`;
export const tallyUrl = (id: string) => `https://tally.so/r/${encodeURIComponent(id)}`;

// ── The page being built ────────────────────────────────────────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pipe = (xs: string[]) => esc(xs.map((x) => x.replace(/\|/g, "/")).join("|"));

type Q = { label: string; required?: boolean; help?: string };

class PageBuilder {
  notes: string[] = [];
  questions = 0;
  private taken = new Set<string>();
  private pages: string[][] = [[]];
  private cover = "";
  private thanks = "";
  private emailSaved = false;
  private phoneSaved = false;

  private named(label: string) {
    const n = uniqueName(label || "answer", this.taken);
    this.taken.add(n);
    return n;
  }
  private add(html: string) {
    this.pages[this.pages.length - 1]!.push(html);
  }
  private help(d?: string) {
    return d?.trim() ? `<p class="text">${esc(d.trim())}</p>` : "";
  }
  private req(r?: boolean) {
    return r ? " required" : "";
  }
  private err(n: string) {
    return `<p class="error" data-cl-error-for="${n}"></p>`;
  }
  private block(field: string, q: Q, extra = "", save = "") {
    const n = this.named(q.label);
    this.questions++;
    this.add(`<div class="q"><div data-cl-field="${field}" data-cl-name="${n}" data-cl-label="${esc(q.label)}"${q.required ? " data-cl-required" : ""}${save ? ` data-cl-save="${save}"` : ""}${extra} id="q_${n}"></div>${this.help(q.help)}</div>`);
  }

  newPage(title?: string, text?: string) {
    if (this.pages[this.pages.length - 1]!.length) this.pages.push([]);
    if (title?.trim()) this.heading(title, 2);
    if (text?.trim()) this.text(text);
  }
  heading(t: string, level = 3) {
    if (t.trim()) this.add(`<h${level} class="heading">${esc(t.trim())}</h${level}>`);
  }
  /** The heading just added, taken back to be a question's label (a question with no title of its own). */
  takeHeading(): string {
    const page = this.pages[this.pages.length - 1]!;
    const m = /^<h[23] class="heading">([\s\S]*)<\/h[23]>$/.exec(page[page.length - 1] ?? "");
    if (!m) return "";
    page.pop();
    return m[1]!.replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  }
  text(t: string) {
    if (t.trim()) this.add(`<p class="text">${esc(t.trim())}</p>`);
  }
  input(kind: "text" | "email" | "url" | "number", q: Q) {
    const n = this.named(q.label);
    this.questions++;
    // The first email is the contact's.
    const save = kind === "email" && !this.emailSaved ? ((this.emailSaved = true), ` data-cl-save="email" autocomplete="email"`) : "";
    const extra = kind === "email" ? ` placeholder="you@company.com"` : kind === "url" ? ` placeholder="https://" inputmode="url"` : kind === "number" ? ` inputmode="decimal" step="any"` : "";
    this.add(`<div class="q"><label class="label" for="q_${n}">${esc(q.label)}</label><input class="field" id="q_${n}" name="${n}" type="${kind}"${extra}${save}${this.req(q.required)}>${this.help(q.help)}${this.err(n)}</div>`);
  }
  long(q: Q) {
    const n = this.named(q.label);
    this.questions++;
    this.add(`<div class="q"><label class="label" for="q_${n}">${esc(q.label)}</label><textarea class="field" id="q_${n}" name="${n}" rows="4"${this.req(q.required)}></textarea>${this.help(q.help)}${this.err(n)}</div>`);
  }
  phone(q: Q) {
    const save = this.phoneSaved ? "" : ((this.phoneSaved = true), "phone");
    this.block("phone", q, "", save);
  }
  pick(kind: "radio" | "checkbox" | "select", q: Q, opts: string[]) {
    const list = [...new Set(opts.map((o) => o.trim()).filter(Boolean))];
    if (!list.length) {
      this.notes.push(`"${q.label}" had no options; it came in as Short answer.`);
      return this.input("text", q);
    }
    const n = this.named(q.label);
    this.questions++;
    if (kind === "select")
      return this.add(`<div class="q"><label class="label" for="q_${n}">${esc(q.label)}</label><select class="field" id="q_${n}" name="${n}"${this.req(q.required)}><option value="">Choose one</option>${list.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>${this.help(q.help)}${this.err(n)}</div>`);
    this.add(
      `<fieldset class="q"><legend class="label">${esc(q.label)}</legend>${this.help(q.help)}<div class="choices">${list.map((x, i) => `<label class="choice"><input type="${kind}" name="${n}" value="${esc(x)}"${i === 0 ? ` data-cl-label="${esc(q.label)}"${kind === "radio" ? this.req(q.required) : ""}` : ""}> ${esc(x)}</label>`).join("")}</div>${this.err(n)}</fieldset>`,
    );
  }
  pictures(q: Q, opts: { label: string; image: string }[]) {
    const ok = opts.filter((o) => o.label.trim());
    if (!ok.length) return this.pick("radio", q, []);
    const img = (s: string) => (/^https:\/\//.test(s) ? s : "");
    this.block("pictures", q, ` data-cl-options="${pipe(ok.map((o) => o.label))}" data-cl-images="${pipe(ok.map((o) => img(o.image)))}"`);
  }
  scale(q: Q, o: { from: number; to: number; low?: string; high?: string; style?: "numbers" | "stars" }) {
    const zero = o.from === 0;
    const top = Math.min(Math.max(o.to, 3), 10);
    if (o.to > 10 || o.to < 3) this.notes.push(`"${q.label}" went from ${o.from} to ${o.to}; it asks ${zero ? 0 : 1} to ${top} here.`);
    const style = o.style === "stars" ? "" : ` data-cl-style="numbers"`;
    this.block("rating", q, ` data-cl-scale="${top}"${style}${zero && o.style !== "stars" ? " data-cl-zero" : ""}${o.low ? ` data-cl-low="${esc(o.low)}"` : ""}${o.high ? ` data-cl-high="${esc(o.high)}"` : ""}`);
  }
  ranking(q: Q, opts: string[]) {
    if (!opts.length) return this.pick("radio", q, []);
    this.block("ranking", q, ` data-cl-options="${pipe(opts)}"`);
  }
  grid(q: Q, rows: string[], cols: string[], many = false) {
    if (!rows.length || !cols.length) {
      this.notes.push(`"${q.label}" had no rows or columns; it came in as Short answer.`);
      return this.input("text", q);
    }
    if (many) this.notes.push(`"${q.label}" let people tick several per row; it takes one per row here.`);
    this.block("grid", q, ` data-cl-rows="${pipe(rows)}" data-cl-cols="${pipe(cols)}"`);
  }
  plain(field: "date" | "time" | "signature" | "address" | "country", q: Q) {
    this.block(field, q);
  }
  file(q: Q) {
    this.block("file", q, ` data-cl-kinds="pdf image office" data-cl-max="10"`);
  }
  agree(q: Q) {
    const n = this.named(q.label);
    this.questions++;
    this.add(`<div class="q"><label class="choice"><input type="checkbox" id="q_${n}" name="${n}" value="Yes" data-cl-label="${esc(q.label)}"${this.req(q.required)}> ${esc(q.label)}</label>${this.help(q.help)}${this.err(n)}</div>`);
  }
  hidden(name: string) {
    const n = this.named(name);
    this.add(`<div data-cl-field="hidden" data-cl-name="${n}" data-cl-label="${esc(name)}" data-cl-from="param" data-cl-param="${esc(name)}"></div>`);
  }
  video(url: string, label: string) {
    if (/^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com|(www\.)?loom\.com)\//.test(url)) {
      const n = this.named(label || "video");
      this.add(`<div class="q"><div data-cl-field="video" data-cl-name="${n}" data-cl-label="${esc(label || "Video")}" data-cl-src="${esc(url)}"></div></div>`);
    } else this.notes.push(`A video${label ? ` ("${label}")` : ""} couldn't be read; add it again.`);
  }
  image(url: string, alt: string) {
    if (/^https:\/\//.test(url)) this.add(`<img src="${esc(url)}" alt="${esc(alt)}" style="max-width:100%;border-radius:8px">`);
  }
  setCover(title: string, text: string, button: string) {
    if (!title.trim() && !text.trim()) return;
    this.cover = `<section data-cl-cover id="cover">${title.trim() ? `<h1 class="heading">${esc(title.trim())}</h1>` : ""}${text.trim() ? `<p class="text">${esc(text.trim())}</p>` : ""}<button class="btn" type="button" data-cl-start>${esc(button.trim() || "Start")}</button></section>`;
  }
  setThanks(title: string, text: string) {
    this.thanks = `<section data-cl-thanks hidden id="thanks"><h2 class="heading">${esc(title.trim() || "Thanks, we got it.")}</h2>${text.trim() ? `<p class="text">${esc(text.trim())}</p>` : ""}</section>`;
  }

  finish(name: string, o: { one?: boolean; submit?: string } = {}): Imported {
    const real = this.pages.filter((p, i) => i === 0 || p.length);
    const thanks = this.thanks || `<section data-cl-thanks hidden id="thanks"><h2 class="heading">Thanks, we got it.</h2></section>`;
    const submit = `<button class="btn" type="submit">${esc(o.submit?.trim() || "Submit")}</button>`;
    const formTag = o.one && real.length <= 1 ? `<form data-cl-one>` : `<form>`;
    let body: string;
    if (real.length <= 1) body = `${real[0]!.join("")}${submit}`;
    else
      body = real
        .map((p, i) => {
          const back = `<button class="btn btn-ghost" type="button" data-cl-back>Back</button>`;
          const nav = i === 0 ? `<div class="actions"><button class="btn" type="button" data-cl-next>Next</button></div>` : i === real.length - 1 ? `<div class="actions">${back}${submit}</div>` : `<div class="actions">${back}<button class="btn" type="button" data-cl-next>Next</button></div>`;
          return `<section data-cl-step id="s${i + 1}">${p.join("")}${nav}</section>`;
        })
        .join("");
    const html = `${this.cover}${formTag}${body}${thanks}</form>`;
    const css = real.length > 1 ? "[data-cl-step]{display:flex;flex-direction:column;gap:22px}\n.actions{display:flex;flex-wrap:wrap;gap:10px}" : "";
    return { name: name.trim().slice(0, 120) || "Imported form", html, css, questions: this.questions, pages: real.length, notes: [...new Set(this.notes)] };
  }
}

// ── Typeform ────────────────────────────────────────────────────────────────────────────────────────────────────────

type TfChoice = { label?: string; attachment?: { type?: string; href?: string } };
export type TypeformField = {
  ref?: string;
  title?: string;
  type?: string;
  properties?: {
    description?: string;
    choices?: TfChoice[];
    allow_multiple_selection?: boolean;
    allow_other_choice?: boolean;
    steps?: number;
    start_at_one?: boolean;
    labels?: { left?: string; center?: string; right?: string };
    fields?: TypeformField[];
    button_text?: string;
  };
  validations?: { required?: boolean };
  attachment?: { type?: string; href?: string };
};
export type TypeformForm = {
  title?: string;
  fields?: TypeformField[];
  hidden?: string[];
  logic?: unknown[];
  welcome_screens?: { title?: string; properties?: { description?: string; button_text?: string } }[];
  thankyou_screens?: { ref?: string; title?: string; properties?: { description?: string } }[];
  variables?: Record<string, unknown>;
};

/** Typeform's words: answer recall ({{field:…}}) and its markdown marks taken out. */
export function tfText(s: unknown): string {
  return String(s ?? "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\*\*?|__?|~~/g, "")
    .replace(/\\([*_\-#.!])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();
}

/** The Typeform as a Studio page: its questions, welcome screen and thank-you, one question at a time as it was. */
export function importTypeform(f: TypeformForm): Imported {
  const b = new PageBuilder();
  const name = tfText(f.title) || "Imported form";
  const w = f.welcome_screens?.[0];
  if (w) b.setCover(tfText(w.title), tfText(w.properties?.description), tfText(w.properties?.button_text));
  let recalled = false;

  const field = (x: TypeformField, depth = 0): void => {
    if (/\{\{field:/.test(x.title ?? "")) recalled = true;
    const label = tfText(x.title) || "Question";
    const q: Q = { label, required: !!x.validations?.required, help: tfText(x.properties?.description) };
    const p = x.properties ?? {};
    const opts = (p.choices ?? []).map((c) => tfText(c.label)).filter(Boolean);
    switch (x.type) {
      case "short_text":
        return b.input("text", q);
      case "long_text":
        return b.long(q);
      case "email":
        return b.input("email", q);
      case "number":
        return b.input("number", q);
      case "website":
        return b.input("url", q);
      case "phone_number":
        return b.phone(q);
      case "date":
        return b.plain("date", q);
      case "address":
        return b.plain("address", q);
      case "file_upload":
        return b.file(q);
      case "dropdown":
        return b.pick("select", q, opts);
      case "multiple_choice":
        return b.pick(p.allow_multiple_selection ? "checkbox" : "radio", q, p.allow_other_choice ? [...opts, "Other"] : opts);
      case "picture_choice":
        if (p.allow_multiple_selection) b.notes.push(`"${label}" let people pick several pictures; it takes one here.`);
        return b.pictures(q, (p.choices ?? []).map((c) => ({ label: tfText(c.label), image: c.attachment?.href ?? "" })));
      case "yes_no":
        return b.pick("radio", q, ["Yes", "No"]);
      case "legal":
        return b.agree(q);
      case "opinion_scale": {
        const steps = p.steps ?? 11;
        const from = p.start_at_one ? 1 : 0;
        return b.scale(q, { from, to: from + steps - 1, low: tfText(p.labels?.left), high: tfText(p.labels?.right) });
      }
      case "nps":
        return b.scale(q, { from: 0, to: 10, low: tfText(p.labels?.left) || "Not likely", high: tfText(p.labels?.right) || "Very likely" });
      case "rating":
        return b.scale(q, { from: 1, to: p.steps ?? 5, style: "stars" });
      case "ranking":
        return b.ranking(q, opts);
      case "matrix": {
        const rows = (p.fields ?? []).map((r) => tfText(r.title)).filter(Boolean);
        const first = p.fields?.[0]?.properties;
        const cols = (first?.choices ?? []).map((c) => tfText(c.label)).filter(Boolean);
        return b.grid(q, rows, cols, !!first?.allow_multiple_selection);
      }
      case "statement":
        b.heading(label);
        if (q.help) b.text(q.help);
        return;
      case "group":
        // A question group is its own page with its questions.
        if (depth === 0) b.newPage(label, q.help);
        else {
          b.heading(label);
          if (q.help) b.text(q.help);
        }
        for (const y of p.fields ?? []) field(y, depth + 1);
        if (depth === 0) b.newPage();
        return;
      case "inline_group":
      case "contact_info":
        if (x.title?.trim()) b.heading(label);
        if (q.help) b.text(q.help);
        for (const y of p.fields ?? []) field(y, depth + 1);
        return;
      case "payment":
        b.notes.push(`"${label}" took a payment; add a Payment question and connect Stripe.`);
        return;
      case "calendly":
        b.notes.push(`"${label}" booked through Calendly; pick the meeting in On submission instead.`);
        return;
      default:
        b.notes.push(`"${label}" (${x.type ?? "unknown"}) had no match; it came in as Short answer.`);
        return b.input("text", q);
    }
  };
  for (const x of f.fields ?? []) field(x);
  for (const h of f.hidden ?? []) if (/^[A-Za-z0-9_]{1,40}$/.test(h)) b.hidden(h);

  // The first thank-you screen that isn't Typeform's built-in one.
  const t = (f.thankyou_screens ?? []).find((s) => s.ref !== "default_tys") ?? f.thankyou_screens?.[0];
  if (t) b.setThanks(tfText(t.title), tfText(t.properties?.description));
  if ((f.thankyou_screens ?? []).filter((s) => s.ref !== "default_tys").length > 1) b.notes.push("It had several thank-you screens; the first one came in.");
  if (f.logic?.length) b.notes.push(`Its ${f.logic.length} logic ${f.logic.length === 1 ? "rule" : "rules"} weren't copied; set them again with Show if.`);
  if (f.variables && Object.keys(f.variables).length) b.notes.push("Its score and price variables weren't copied.");
  if (recalled) b.notes.push("Questions that repeated an earlier answer lost that part; add it again with the answer picker.");
  return b.finish(name, { one: true });
}

// ── Tally ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type TallyBlock = { uuid?: string; type?: string; groupUuid?: string; groupType?: string; payload?: Record<string, unknown> };
export type TallyPage = { name?: string; blocks?: TallyBlock[] };

/** The form a Tally page carries (its Next.js data), or null when the page has none. */
export function tallyFromHtml(html: string): TallyPage | null {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  try {
    const p = (JSON.parse(m[1]!) as { props?: { pageProps?: TallyPage } }).props?.pageProps;
    return p && Array.isArray(p.blocks) ? { name: typeof p.name === "string" ? p.name : "", blocks: p.blocks } : null;
  } catch {
    return null;
  }
}

/** Tally's rich text (safeHTMLSchema: nested [text, marks] arrays) as plain words; mentions of answers left out. */
export function tallyText(v: unknown): string {
  const walk = (x: unknown): string => {
    if (typeof x === "string") return x;
    if (!Array.isArray(x)) return "";
    // A text with its marks: [content, [[mark, value], …]]. A mention mark drops the "@field" it shows.
    if (x.length === 2 && Array.isArray(x[1]) && (x[1] as unknown[]).every((m) => Array.isArray(m) && typeof (m as unknown[])[0] === "string")) {
      if ((x[1] as unknown[][]).some((m) => m[0] === "mention")) return "";
      return walk(x[0]);
    }
    return x.map(walk).join("");
  };
  return walk(v).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const OPTION_TYPES = new Set(["MULTIPLE_CHOICE_OPTION", "CHECKBOX", "DROPDOWN_OPTION", "MULTI_SELECT_OPTION", "RANKING_OPTION"]);

/** The Tally form as a Studio page: its questions, pages and thank-you page. */
export function importTally(t: TallyPage): Imported {
  const b = new PageBuilder();
  const blocks = (t.blocks ?? []).filter((x) => x && typeof x.type === "string");
  // The title people see on the form; else its name in Tally.
  let name = "";
  let label = "";
  let labelHelp = "";
  let inThanks = false;
  let thanksTitle = "";
  const thanksText: string[] = [];
  let logic = 0;
  let hiddenText = false;

  const q = (p: Record<string, unknown>, fallback: string): Q => {
    const l = label || (typeof p.placeholder === "string" && p.placeholder.trim()) || b.takeHeading() || fallback;
    const out = { label: l, required: p.isRequired === true, help: labelHelp };
    label = "";
    labelHelp = "";
    return out;
  };

  for (let i = 0; i < blocks.length; i++) {
    const x = blocks[i]!;
    const p = (x.payload ?? {}) as Record<string, unknown>;
    const type = x.type!;
    if (type === "FORM_TITLE") {
      const title = tallyText(p.safeHTMLSchema) || (typeof p.title === "string" ? p.title : "");
      if (title && !name) name = title;
      continue;
    }
    if (type === "THANK_YOU_PAGE" || (type === "PAGE_BREAK" && p.isThankYouPage === true)) {
      inThanks = true;
      continue;
    }
    if (inThanks) {
      const words = tallyText(p.safeHTMLSchema);
      if (/^HEADING_/.test(type) && !thanksTitle) thanksTitle = words;
      else if (words) thanksText.push(words);
      continue;
    }
    if (p.isHidden === true && (type === "TEXT" || /^HEADING_/.test(type))) {
      hiddenText = true;
      continue;
    }
    switch (type) {
      case "TITLE":
      case "LABEL":
        label = tallyText(p.safeHTMLSchema) || label;
        continue;
      case "PAGE_BREAK":
        b.newPage();
        continue;
      case "HEADING_1":
      case "HEADING_2":
      case "HEADING_3":
        b.heading(tallyText(p.safeHTMLSchema), type === "HEADING_1" ? 2 : 3);
        continue;
      case "TEXT": {
        const words = tallyText(p.safeHTMLSchema);
        // A text right under a question's title reads as its help line.
        const next = blocks[i + 1];
        if (label && next && /^(INPUT_|TEXTAREA|FILE_UPLOAD|SIGNATURE|LINEAR_SCALE|RATING|MATRIX)/.test(next.type ?? "")) labelHelp = words;
        else b.text(words);
        continue;
      }
      case "DIVIDER":
      case "CAPTCHA":
      case "RESPONDENT_COUNTRY":
      case "CALCULATED_FIELDS":
        if (type === "CALCULATED_FIELDS") b.notes.push("Its calculated fields weren't copied; add a Calculation question.");
        continue;
      case "CONDITIONAL_LOGIC":
        logic++;
        continue;
      case "IMAGE": {
        const imgs = (p.images as { url?: string; name?: string }[] | undefined) ?? [];
        for (const im of imgs) b.image(im.url ?? "", im.name ?? "");
        continue;
      }
      case "EMBED_VIDEO":
      case "EMBED":
        b.video(String((p.url as string) ?? (p.inputUrl as string) ?? ""), label);
        label = "";
        continue;
      case "HIDDEN_FIELDS":
        for (const h of (p.hiddenFields as { name?: string }[] | undefined) ?? []) if (h.name && /^[A-Za-z0-9_]{1,40}$/.test(h.name)) b.hidden(h.name);
        continue;
      case "INPUT_TEXT":
        b.input("text", q(p, "Short answer"));
        continue;
      case "INPUT_EMAIL":
        b.input("email", q(p, "Email"));
        continue;
      case "INPUT_LINK":
        b.input("url", q(p, "Website"));
        continue;
      case "INPUT_NUMBER":
        b.input("number", q(p, "Number"));
        continue;
      case "INPUT_PHONE_NUMBER":
        b.phone(q(p, "Phone"));
        continue;
      case "INPUT_DATE":
        b.plain("date", q(p, "Date"));
        continue;
      case "INPUT_TIME":
        b.plain("time", q(p, "Time"));
        continue;
      case "TEXTAREA":
        b.long(q(p, "Long answer"));
        continue;
      case "FILE_UPLOAD":
        b.file(q(p, "File upload"));
        continue;
      case "SIGNATURE":
        b.plain("signature", q(p, "Signature"));
        continue;
      case "LINEAR_SCALE": {
        const from = Number(p.start ?? 0);
        const to = Number(p.end ?? 10);
        b.scale(q(p, "Scale"), { from: Number.isFinite(from) ? from : 0, to: Number.isFinite(to) ? to : 10, low: typeof p.leftLabel === "string" ? p.leftLabel : "", high: typeof p.rightLabel === "string" ? p.rightLabel : "" });
        continue;
      }
      case "RATING":
        b.scale(q(p, "Rating"), { from: 1, to: Number(p.stars ?? 5) || 5, style: "stars" });
        continue;
      case "PAYMENT":
        b.notes.push(`"${label || "A payment"}" took a payment; add a Payment question and connect Stripe.`);
        label = "";
        continue;
      case "MATRIX": {
        // Its rows and columns follow it.
        const rows: string[] = [];
        const cols: string[] = [];
        let j = i + 1;
        for (; j < blocks.length && (blocks[j]!.type === "MATRIX_ROW" || blocks[j]!.type === "MATRIX_COLUMN"); j++) {
          const words = tallyText(blocks[j]!.payload?.safeHTMLSchema) || String(blocks[j]!.payload?.text ?? "");
          if (blocks[j]!.type === "MATRIX_ROW") rows.push(words);
          else cols.push(words);
        }
        i = j - 1;
        b.grid(q(p, "Grid"), rows.filter(Boolean), cols.filter(Boolean), p.allowMultiple === true);
        continue;
      }
      default:
        break;
    }
    if (OPTION_TYPES.has(type)) {
      // A choice question is its run of option blocks sharing one group.
      const opts: string[] = [];
      let required = false;
      let j = i;
      for (; j < blocks.length && blocks[j]!.type === type && blocks[j]!.groupUuid === x.groupUuid; j++) {
        const op = (blocks[j]!.payload ?? {}) as Record<string, unknown>;
        if (op.isRequired === true) required = true;
        const words = typeof op.text === "string" ? op.text : tallyText(op.safeHTMLSchema);
        if (op.isOtherOption === true) opts.push("Other");
        else if (words.trim()) opts.push(words);
      }
      i = j - 1;
      const qq = { ...q({ isRequired: required }, "Question"), required };
      if (type === "DROPDOWN_OPTION") b.pick("select", qq, opts);
      else if (type === "CHECKBOX" || type === "MULTI_SELECT_OPTION") b.pick("checkbox", qq, opts);
      else if (type === "RANKING_OPTION") b.ranking(qq, opts);
      else b.pick("radio", qq, opts);
      continue;
    }
    if (/^(INPUT_|WALLET)/.test(type)) {
      b.notes.push(`"${label || type}" had no match; it came in as Short answer.`);
      b.input("text", q(p, "Short answer"));
    }
  }
  b.setThanks(thanksTitle, thanksText.join("\n"));
  if (logic) b.notes.push(`Its ${logic} logic ${logic === 1 ? "rule" : "rules"} weren't copied; set them again with Show if.`);
  if (hiddenText) b.notes.push("Text shown only by logic wasn't copied.");
  return b.finish(name || (t.name ?? "").trim() || "Imported form");
}
