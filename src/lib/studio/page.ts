// Studio forms as live forms (docs/forms-chat-plan.md, Part 3). A studio form is the HTML and CSS Tia wrote, in the
// brand's CSS. To publish it, the HTML is cleaned to a list of tags and attributes (nothing can run code, post
// somewhere else or load a frame), its questions are read into the form's fields (so the send path, the CRM,
// routing and meetings work as for every form), and the page rides along on the form as `page`.
// The same code runs in the browser and on the server: no DOM, a small tokenizer.

export type PageAfter = { kind: "thanks" | "page" | "meeting"; url?: string; meeting?: string; routes?: { field: string; value: string; meeting: string }[] };
/** The page on a published form: its HTML, its own CSS, the brand's CSS, each question's name to its field id. */
export type Page = { html: string; css: string; brand: string; ids: Record<string, string>; after?: PageAfter };
export type PageQuestion = { name: string; id: string; type: string; label: string; required: boolean; save?: string; options: { value: string; label: string }[] };

const MAX_HTML = 200_000;
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
const TYPES = new Set(["text", "email", "tel", "number", "url", "date", "time", "radio", "checkbox", "range", "hidden", "search", "month", "week", "datetime-local", "color"]);
const SAVE = new Set(["email", "first_name", "last_name", "name", "phone", "company", "title", "website", "country"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
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
 * The page's HTML, cleaned, and its questions in order. A question is every input, textarea and select with a name
 * (radios and check boxes sharing a name are one question); its label is the label around it or pointing at it,
 * else its placeholder, else its name. A question under a show-if is never required on the server, since the
 * server doesn't run the page's conditions.
 */
export function cleanPage(raw: string): { html: string; questions: PageQuestion[] } {
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
  let option: { value: string; text: string; q: PageQuestion; had: boolean } | null = null;
  let select: PageQuestion | null = null;

  const question = (name: string, type: string, attrs: Record<string, string>): PageQuestion => {
    let q = byName.get(name);
    if (!q) {
      const save = SAVE.has(attrs["data-cl-save"] ?? "") ? attrs["data-cl-save"] : undefined;
      q = { name, id: idFor(name, taken), type, label: "", required: false, ...(save ? { save } : {}), options: [] };
      byName.set(name, q);
      qs.push(q);
    } else if (q.type === "checkbox" && type === "checkbox") q.type = "multi";
    if ("required" in attrs && !open.some((o) => o.showIf) && !("data-cl-show-if" in attrs)) q.required = true;
    if (!q.label && attrs.placeholder) q.label = attrs.placeholder;
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
    const gt = src.indexOf(">", lt);
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
          else if (t && !x.q.label) x.q.label = t;
        }
        label = null;
      }
      if (name === "option" && option) {
        const t = words(option.text).slice(0, 200);
        option.q.options.push({ value: option.had ? option.value : t, label: t || option.value });
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
        if (/^data-cl-[a-z-]{1,20}$/.test(k)) kept.push(v ? `${k}="${esc(v.slice(0, 500))}"` : k);
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
    if (name === "form") kept.push("novalidate");
    const qName = /^[A-Za-z][\w-]{0,60}$/.test(attrs.name ?? "") ? attrs.name! : "";
    // Questions
    if (qName && (name === "input" || name === "textarea" || name === "select")) {
      const t = name === "input" ? (TYPES.has((attrs.type ?? "text").toLowerCase()) ? (attrs.type ?? "text").toLowerCase() : "text") : name;
      if (t !== "hidden") {
        const q = question(qName, t === "radio" ? "radio" : t === "checkbox" ? "checkbox" : t, attrs);
        let opt: { value: string; label: string } | undefined;
        if (t === "radio" || t === "checkbox") {
          opt = { value: attrs.value ?? "on", label: attrs.value ?? "" };
          if (!q.options.some((o) => o.value === opt!.value)) q.options.push(opt);
          else opt = q.options.find((o) => o.value === opt!.value);
        }
        if (label) label.inside.push({ q, ...(opt ? { opt } : {}) });
        if (attrs.id) byElId.set(attrs.id, { q, ...(opt ? { opt } : {}) });
        if (name === "select") select = q;
      }
    }
    if (name === "label") label = { text: "", inside: [], target: attrs.for ?? "" };
    if (name === "option" && select) option = { value: attrs.value ?? "", text: "", q: select, had: "value" in attrs };
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
    else if (t && !x.q.label) x.q.label = t;
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

/**
 * The form a studio page publishes as: one step of the page's questions, each saved to its contact field or kept as
 * the form's own answer, and what happens after the send (a thank-you, a page or a meeting with its routes).
 */
export function pageForm(p: { html: string; css: string; brand: string; after: PageAfter; title?: string }): { form: Record<string, unknown>; questions: PageQuestion[] } {
  const { html, questions } = cleanPage(p.html);
  const keys = new Set<string>();
  const fields = questions.map((q) => {
    let key = q.save && !keys.has(q.save) ? q.save : q.type === "email" && !keys.has("email") ? "email" : `q.${q.id.replace(/^[^a-z]+/, "") || "q"}`;
    if (keys.has(key)) key = `q.${q.id}`;
    keys.add(key);
    const type = q.type === "dropdown" ? "dropdown" : KIND[q.type] ?? "text";
    const opts = type === "choice" || type === "multi" || type === "dropdown";
    return { id: q.id, key, type: key === "email" ? "email" : key === "phone" ? "phone" : type, label: q.label, required: q.required, ...(opts ? { options: q.options.length ? q.options : [{ value: "yes", label: "Yes" }] } : {}) };
  });
  const ids = Object.fromEntries(questions.map((q) => [q.name, q.id]));
  const keyOf = new Map(fields.map((f) => [f.id, f.key]));
  const a = p.after;
  const schedule =
    a.kind === "meeting" && a.meeting
      ? {
          tool: "claritia",
          url: "",
          meetingTypeId: a.meeting,
          routes: (a.routes ?? [])
            .filter((r) => ids[r.field] && r.meeting && r.value)
            .map((r, i) => ({ id: `r${i + 1}`, meet: r.meeting, conds: [{ field: `answer.${keyOf.get(ids[r.field]!)}`, op: "is", value: r.value }] })),
        }
      : null;
  const end = a.kind === "page" && a.url ? { kind: "redirect", url: a.url } : { kind: "message", title: "Thanks, we got it." };
  const after: PageAfter = { kind: a.kind, ...(a.url ? { url: a.url.slice(0, 500) } : {}), ...(a.meeting ? { meeting: a.meeting } : {}), ...(a.routes?.length ? { routes: a.routes.slice(0, 30) } : {}) };
  return {
    questions,
    form: {
      steps: [{ id: "page", fields }],
      rules: [],
      layout: { labels: "above", width: "wide" },
      ...(p.title ? { title: p.title.slice(0, 300) } : {}),
      ...(keys.has("email") ? {} : { emailOptional: true }),
      submit: { label: "Submit" },
      consent: { mode: "off", label: "" },
      spam: { minSeconds: 2, turnstile: false },
      after: { end, ...(schedule ? { schedule } : {}) },
      page: { html, css: cleanPageCss(p.css), brand: cleanPageCss(p.brand), ids, after },
    },
  };
}

/** The page on a form, cleaned again (checkForm runs this on every save and publish). */
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
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .filter((x) => typeof x.field === "string" && typeof x.value === "string" && typeof x.meeting === "string")
    .map((x) => ({ field: String(x.field).slice(0, 60), value: String(x.value).slice(0, 200), meeting: String(x.meeting).slice(0, 40) }));
  const after: PageAfter = { kind, ...(typeof af.url === "string" && af.url ? { url: af.url.slice(0, 500) } : {}), ...(typeof af.meeting === "string" && af.meeting ? { meeting: af.meeting.slice(0, 40) } : {}), ...(routes.length ? { routes } : {}) };
  return { html, css: cleanPageCss(String(r.css ?? "")), brand: cleanPageCss(String(r.brand ?? "")), ids, after };
}
