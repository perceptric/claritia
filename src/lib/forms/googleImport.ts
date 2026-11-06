// Import a Google Form as a Form Studio page (docs/integrations-plan.md, Next step 13). The form is read with Google
// Forms' API (forms.get), and each item becomes the Studio question it matches, in the page's own classes, with its
// label, options and required kept. Page breaks become pages. Anything with no match comes in as Short answer and
// is named in the notes, so the person can check it. Runs anywhere (the route reads the form; the tests pass one).

import { uniqueName } from "../studio/builder.ts";

type Opt = { value?: string; isOther?: boolean };
type Question = {
  required?: boolean;
  choiceQuestion?: { type?: "RADIO" | "CHECKBOX" | "DROP_DOWN"; options?: Opt[] };
  textQuestion?: { paragraph?: boolean };
  scaleQuestion?: { low?: number; high?: number; lowLabel?: string; highLabel?: string };
  dateQuestion?: { includeTime?: boolean; includeYear?: boolean };
  timeQuestion?: { duration?: boolean };
  fileUploadQuestion?: Record<string, unknown>;
  ratingQuestion?: { ratingScaleLevel?: number; iconType?: string };
  rowQuestion?: { title?: string };
};
export type GoogleItem = {
  itemId?: string;
  title?: string;
  description?: string;
  questionItem?: { question?: Question };
  questionGroupItem?: { questions?: Question[]; grid?: { columns?: { type?: "RADIO" | "CHECKBOX"; options?: Opt[] } } };
  pageBreakItem?: Record<string, unknown>;
  textItem?: Record<string, unknown>;
  imageItem?: { image?: { contentUri?: string; altText?: string } };
  videoItem?: { video?: { youtubeUri?: string }; caption?: string };
};
export type GoogleForm = {
  formId?: string;
  info?: { title?: string; documentTitle?: string; description?: string };
  settings?: { emailCollectionType?: string; quizSettings?: { isQuiz?: boolean } };
  items?: GoogleItem[];
};

/** The API's form id, from the form's edit link (docs.google.com/forms/d/<id>/edit) or the id itself. */
export function googleFormId(link: string): string | null {
  const s = link.trim();
  if (/\/forms\/d\/e\//.test(s)) return null;
  const m = /docs\.google\.com\/forms\/d\/([A-Za-z0-9_-]{20,})/.exec(s);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (xs: string[]) => esc(xs.map((x) => x.replace(/\|/g, "/")).join("|"));

export type Imported = { name: string; html: string; css: string; questions: number; pages: number; notes: string[] };

/** The Google Form as a Studio page: its questions, pages and words. */
export function importGoogleForm(f: GoogleForm): Imported {
  const name = (f.info?.title || f.info?.documentTitle || "Imported form").trim().slice(0, 120);
  const notes: string[] = [];
  const taken = new Set<string>();
  const pages: string[][] = [[]];
  let questions = 0;
  const add = (html: string) => pages[pages.length - 1]!.push(html);
  const named = (label: string) => {
    const n = uniqueName(label || "answer", taken);
    taken.add(n);
    return n;
  };
  const lab = (id: string, label: string) => `<label class="label" for="${id}">${esc(label)}</label>`;
  const err = (n: string) => `<p class="error" data-cl-error-for="${n}"></p>`;
  const help = (d?: string) => (d?.trim() ? `<p class="text">${esc(d.trim())}</p>` : "");
  const req = (r?: boolean) => (r ? " required" : "");
  const block = (field: string, label: string, n: string, r: boolean | undefined, extra = "", d?: string) =>
    `<div class="q"><div data-cl-field="${field}" data-cl-name="${n}" data-cl-label="${esc(label)}"${r ? " data-cl-required" : ""}${extra} id="q_${n}"></div>${help(d)}</div>`;

  add(`<h2 class="heading">${esc(name)}</h2>`);
  if (f.info?.description?.trim()) add(`<p class="text">${esc(f.info.description.trim())}</p>`);
  // Google asked for the email: it's the contact's, first.
  if (f.settings?.emailCollectionType && f.settings.emailCollectionType !== "DO_NOT_COLLECT") {
    const n = named("email");
    add(`<div class="q">${lab(`q_${n}`, "Email")}<input class="field" id="q_${n}" name="${n}" type="email" placeholder="you@company.com" autocomplete="email" data-cl-save="email" required>${err(n)}</div>`);
    questions++;
  }
  if (f.settings?.quizSettings?.isQuiz) notes.push("This was a quiz: its answer key and points weren't copied.");

  const question = (label: string, q: Question, d?: string) => {
    const n = named(label);
    const id = `q_${n}`;
    questions++;
    const c = q.choiceQuestion;
    if (c) {
      const opts = (c.options ?? []).map((o) => (o.isOther ? "Other" : (o.value ?? "").trim())).filter(Boolean);
      if (c.type === "DROP_DOWN")
        return add(`<div class="q">${lab(id, label)}<select class="field" id="${id}" name="${n}"${req(q.required)}><option value="">Choose one</option>${opts.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>${help(d)}${err(n)}</div>`);
      const t = c.type === "CHECKBOX" ? "checkbox" : "radio";
      return add(
        `<fieldset class="q"><legend class="label">${esc(label)}</legend>${help(d)}<div class="choices">${opts.map((x, i) => `<label class="choice"><input type="${t}" name="${n}" value="${esc(x)}"${i === 0 ? ` data-cl-label="${esc(label)}"${req(q.required)}` : ""}> ${esc(x)}</label>`).join("")}</div>${err(n)}</fieldset>`,
      );
    }
    if (q.textQuestion)
      return add(q.textQuestion.paragraph
        ? `<div class="q">${lab(id, label)}<textarea class="field" id="${id}" name="${n}" rows="4"${req(q.required)}></textarea>${help(d)}${err(n)}</div>`
        : `<div class="q">${lab(id, label)}<input class="field" id="${id}" name="${n}" type="text"${req(q.required)}>${help(d)}${err(n)}</div>`);
    if (q.scaleQuestion) {
      const s = q.scaleQuestion;
      const zero = (s.low ?? 1) === 0;
      const high = Math.min(Math.max(s.high ?? 5, 3), 10);
      if ((s.high ?? 5) < 3) notes.push(`"${label}" went from ${s.low ?? 1} to ${s.high}; it asks 1 to 3 here.`);
      return add(block("rating", label, n, q.required, ` data-cl-scale="${high}" data-cl-style="numbers"${zero ? " data-cl-zero" : ""}${s.lowLabel ? ` data-cl-low="${esc(s.lowLabel)}"` : ""}${s.highLabel ? ` data-cl-high="${esc(s.highLabel)}"` : ""}`, d));
    }
    if (q.ratingQuestion) return add(block("rating", label, n, q.required, ` data-cl-scale="${Math.min(Math.max(q.ratingQuestion.ratingScaleLevel ?? 5, 3), 10)}"`, d));
    if (q.dateQuestion) {
      if (q.dateQuestion.includeTime) notes.push(`"${label}" asked a date and a time; it asks the date here.`);
      return add(block("date", label, n, q.required, "", d));
    }
    if (q.timeQuestion) {
      if (q.timeQuestion.duration) notes.push(`"${label}" asked how long; it asks a time of day here.`);
      return add(block("time", label, n, q.required, "", d));
    }
    if (q.fileUploadQuestion) return add(block("file", label, n, q.required, ` data-cl-kinds="pdf image office" data-cl-max="10"`, d));
    notes.push(`"${label}" had no match; it came in as Short answer.`);
    return add(`<div class="q">${lab(id, label)}<input class="field" id="${id}" name="${n}" type="text"${req(q.required)}>${help(d)}${err(n)}</div>`);
  };

  for (const it of f.items ?? []) {
    const title = (it.title ?? "").trim();
    if (it.pageBreakItem) {
      pages.push([]);
      if (title) add(`<h2 class="heading">${esc(title)}</h2>`);
      if (it.description?.trim()) add(`<p class="text">${esc(it.description.trim())}</p>`);
    } else if (it.questionItem?.question) question(title || "Question", it.questionItem.question, it.description);
    else if (it.questionGroupItem) {
      const g = it.questionGroupItem;
      const rows = (g.questions ?? []).map((q) => (q.rowQuestion?.title ?? "").trim()).filter(Boolean);
      const cols = (g.grid?.columns?.options ?? []).map((o) => (o.value ?? "").trim()).filter(Boolean);
      const n = named(title || "grid");
      questions++;
      if (g.grid?.columns?.type === "CHECKBOX") notes.push(`"${title || "A grid"}" let people tick several per row; it takes one per row here.`);
      add(block("grid", title || "Grid", n, (g.questions ?? []).some((q) => q.required), ` data-cl-rows="${list(rows)}" data-cl-cols="${list(cols)}"`, it.description));
    } else if (it.textItem) {
      if (title) add(`<h3 class="heading">${esc(title)}</h3>`);
      if (it.description?.trim()) add(`<p class="text">${esc(it.description.trim())}</p>`);
    } else if (it.videoItem) {
      const u = it.videoItem.video?.youtubeUri ?? "";
      if (/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(u)) add(`<div class="q"><div data-cl-field="video" data-cl-name="${named(title || "video")}" data-cl-label="${esc(title || "Video")}" data-cl-src="${esc(u)}"></div></div>`);
      else notes.push(`The video "${title || "untitled"}" couldn't be read; add it again.`);
    } else if (it.imageItem) {
      // Google's image links last a few minutes, so a copy of the link would break: the image is named instead.
      notes.push(`The image${title ? ` "${title}"` : ""} wasn't copied; add it again from the Add list.`);
    } else if (title) {
      question(title, {}, it.description);
    }
  }

  const real = pages.filter((p, i) => i === 0 || p.length);
  const submit = `<button class="btn" type="submit">Submit</button>`;
  let html: string;
  if (real.length <= 1) html = `<form>${real[0]!.join("")}${submit}</form>`;
  else
    html = `<form>${real
      .map((p, i) => {
        const nav = i === 0 ? `<div class="actions"><button class="btn" type="button" data-cl-next>Next</button></div>` : i === real.length - 1 ? `<div class="actions"><button class="btn btn-ghost" type="button" data-cl-back>Back</button>${submit}</div>` : `<div class="actions"><button class="btn btn-ghost" type="button" data-cl-back>Back</button><button class="btn" type="button" data-cl-next>Next</button></div>`;
        return `<section data-cl-step id="s${i + 1}">${p.join("")}${nav}</section>`;
      })
      .join("")}</form>`;
  const css = real.length > 1 ? "[data-cl-step]{display:flex;flex-direction:column;gap:22px}\n.actions{display:flex;flex-wrap:wrap;gap:10px}" : "";
  return { name, html, css, questions, pages: real.length, notes };
}

/** What Google's API answered, in words: a form the person can't open, or one that isn't there. */
export function googleError(status: number, message?: string): string {
  if (status === 403) return "Your Google account can't open that form. Sign in with the account that owns it, or ask its owner to add you as an editor.";
  if (status === 404) return "That Google Form isn't there. Paste the link from the form's edit page.";
  if (status === 401) return "Sign in to Google again.";
  return `Google answered ${status}${message ? `: ${message}` : ""}.`;
}
