// <claritia-form>: the form visitors fill (docs/form-builder.md Part 6). A web component, so one script line works in
// plain HTML, Webflow, Framer, WordPress or React. It draws the published schema inside a shadow root with the brand
// kit's tokens, checks answers as people go, and sends the fill once. A send that can't reach us waits in
// localStorage with its idem key and is tried again for 24 hours; the server treats a repeat key as the same fill.
//   <script src="https://app.tryclaritia.com/forms/v1.js" async></script>
//   <claritia-form form-id="…"></claritia-form>
// Every label and answer is set as text, never as HTML. Choice lists are the component's own listbox, never <select>.

import { tokensCss, type Tokens } from "./brand.ts";
import { countryNames } from "./countries.ts";
import { allFields, safeUrl, visibility, type Field, type Form } from "./schema.ts";
import { checkAnswers, type Answers } from "./values.ts";

type Loaded = { id: string; version: number; status: "live" | "paused"; body: Form; tokens: Partial<Tokens>; strict?: boolean; turnstile?: string };
type Queued = { url: string; body: string; key: string; at: number; tries: number };

const QUEUE = "clr_form_queue";
const DAY = 86_400_000;
const SCRIPT_BASE = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    return src ? new URL(src).origin : "";
  } catch {
    return "";
  }
})();

const CSS = `
:host{display:block;all:initial;font-family:var(--clr-font);font-size:var(--clr-size);color:var(--clr-text);line-height:1.45}
*{box-sizing:border-box;font:inherit;color:inherit}
.f{background:var(--clr-bg);display:flex;flex-direction:column;gap:var(--clr-gap);max-width:var(--clr-width,480px)}
.h{font-family:var(--clr-heading-font);font-size:1.45em;font-weight:600;margin:0;line-height:1.2}
.i{margin:0;color:var(--clr-muted)}
.st{margin:0;font-size:.85em;color:var(--clr-muted)}
.g{display:grid;grid-template-columns:1fr 1fr;gap:var(--clr-gap)}
.fl{grid-column:span 2;display:flex;flex-direction:column;gap:6px;min-width:0}
.fl.half{grid-column:span 1}
@media (max-width:480px){.fl.half{grid-column:span 2}}
.lb{font-size:var(--clr-label-size);font-weight:var(--clr-label-weight)}
.rq{color:var(--clr-muted);margin-left:2px}
.hp{font-size:.85em;color:var(--clr-muted);margin:0}
.in,.bx{width:100%;min-height:var(--clr-input-h);padding:0 12px;background:var(--clr-input-bg);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius);outline:none}
textarea.in{min-height:calc(var(--clr-input-h)*2.4);padding:10px 12px;resize:vertical}
.in:focus,.bx:focus,.bx[aria-expanded=true]{border-color:var(--clr-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--clr-accent) 22%,transparent)}
.in[aria-invalid=true],.bx[aria-invalid=true]{border-color:var(--clr-error)}
.er{color:var(--clr-error);font-size:.85em;margin:0}
.bx{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}
.bx .ph{color:var(--clr-muted)}
.dd{position:relative}
.ls{position:absolute;z-index:10;left:0;right:0;top:calc(100% + 4px);max-height:260px;overflow:auto;margin:0;padding:4px;list-style:none;background:var(--clr-input-bg);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius);box-shadow:0 8px 24px rgba(0,0,0,.12)}
.ls input{margin-bottom:4px}
.op{padding:8px 10px;border-radius:calc(var(--clr-radius)*.6);cursor:pointer}
.op[aria-selected=true]{font-weight:600}
.op.on{background:color-mix(in srgb,var(--clr-accent) 12%,transparent)}
.ch{display:flex;flex-direction:column;gap:8px}
.ck{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
.ck input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--clr-accent);flex:none}
.ac{display:flex;gap:10px;align-items:center}
.bt{min-height:var(--clr-input-h);padding:0 22px;border:0;border-radius:var(--clr-btn-radius);background:var(--clr-btn-bg);color:var(--clr-btn-text);font-weight:var(--clr-btn-weight);text-transform:var(--clr-btn-case);cursor:pointer}
.bt:disabled{opacity:.6;cursor:default}
.bt.bk{background:transparent;color:var(--clr-text);border:var(--clr-border-w) solid var(--clr-border)}
.bt:focus-visible{outline:2px solid var(--clr-accent);outline-offset:2px}
.trap{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.al{color:var(--clr-error);margin:0}
.dn{display:flex;flex-direction:column;gap:6px}
@media (prefers-reduced-motion:no-preference){.f{transition:opacity .15s ease}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | undefined> = {}, ...kids: (Node | string | null | false)[]) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "text") n.textContent = String(v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids) if (k) n.append(k);
  return n;
};

function idemKey(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readQueue(): Queued[] {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE) || "[]") as Queued[];
    return Array.isArray(q) ? q.filter((x) => x && Date.now() - x.at < DAY) : [];
  } catch {
    return [];
  }
}
function writeQueue(q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20)));
    else localStorage.removeItem(QUEUE);
  } catch {}
}

/** Send one queued fill. True when it's settled (accepted, or refused for good). */
async function sendQueued(x: Queued): Promise<boolean> {
  try {
    const res = await fetch(x.url, { method: "POST", headers: { "content-type": "application/json" }, body: x.body, keepalive: true });
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);
  } catch {
    return false;
  }
}

let flushing = false;
/** Fills that couldn't be sent before, oldest first. Runs when any form loads and every so often while open. */
async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const x of readQueue()) {
      const ok = await sendQueued(x);
      const q = readQueue();
      const i = q.findIndex((y) => y.key === x.key);
      if (i < 0) continue;
      if (ok) q.splice(i, 1);
      else q[i] = { ...x, tries: x.tries + 1 };
      writeQueue(q);
      if (!ok) break;
    }
  } finally {
    flushing = false;
  }
}

const fontsAdded = new Set<string>();
function addFont(url: string) {
  if (!url || fontsAdded.has(url) || !/^https:\/\/fonts\.googleapis\.com\//.test(url)) return;
  fontsAdded.add(url);
  document.head.append(el("link", { rel: "stylesheet", href: url }));
}

export class ClaritiaForm extends HTMLElement {
  static observedAttributes = ["form-id"];
  private root: ShadowRoot;
  private data: Loaded | null = null;
  private answers: Answers = {};
  private errors: Record<string, string> = {};
  private step = 0;
  private started = Date.now();
  private key = idemKey();
  private consent = false;
  private sending = false;
  private done = false;
  private alert = "";
  private isPreview = false;
  private open: string | null = null;
  private schedule: { tool: string; url: string } | null = null;
  private filter = "";

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  /** The app's builder shows a draft without loading or sending anything. */
  set preview(p: { form: Form; tokens?: Partial<Tokens>; step?: number; done?: boolean }) {
    this.isPreview = true;
    const fresh = !this.data || this.done !== !!p.done;
    this.data = { id: "preview", version: 0, status: "live", body: p.form, tokens: p.tokens ?? {}, strict: true };
    this.step = Math.min(p.step ?? this.step, p.form.steps.length - 1);
    this.done = !!p.done;
    if (fresh) this.errors = {};
    this.render();
  }

  private get base() {
    return this.getAttribute("host") || SCRIPT_BASE || location.origin;
  }

  connectedCallback() {
    if (!this.isPreview) void this.load();
    void flushQueue();
  }

  attributeChangedCallback() {
    if (this.isConnected && !this.isPreview) void this.load();
  }

  private async load() {
    const id = this.getAttribute("form-id");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return;
    try {
      const res = await fetch(`${this.base}/api/forms/${id}`, { credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      this.data = (await res.json()) as Loaded;
    } catch {
      this.root.replaceChildren(el("p", { text: "This form couldn't load. Refresh the page to try again." }));
      return;
    }
    // Prefill from the address: ?email=… for fields set to take it.
    const params = new URLSearchParams(location.search);
    for (const f of allFields(this.data.body)) {
      const fromKey = params.get(f.key.replace(/^[fq]\./, ""));
      if (f.prefill && fromKey) this.answers[f.id] = f.type === "multi" ? fromKey.split(",") : fromKey;
    }
    this.started = Date.now();
    this.render();
    if (this.data.turnstile && this.data.body.spam.turnstile) this.loadTurnstile();
  }

  private turnstileToken = "";
  private loadTurnstile() {
    const w = window as unknown as { turnstile?: { render: (el: Element, o: object) => void } };
    const draw = () =>
      w.turnstile?.render(this.root.querySelector(".ts")!, { sitekey: this.data!.turnstile, size: "invisible", callback: (t: string) => (this.turnstileToken = t) });
    if (w.turnstile) return draw();
    const s = el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js", async: true });
    s.addEventListener("load", draw);
    document.head.append(s);
  }

  // Drawing ------------------------------------------------------------------------------------------------

  private pending = 0;
  /** Draw again on the next frame, keeping focus where the visitor moved it (a change fires before focus moves on). */
  private later() {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      const focused = (this.root.activeElement as HTMLElement | null)?.id;
      this.render();
      if (focused) (this.root.getElementById(focused) as HTMLElement | null)?.focus();
    });
  }

  private render() {
    const d = this.data;
    if (!d) return;
    const form = d.body;
    addFont(d.tokens.fontUrl ?? "");
    const style = el("style", { text: `:host{${tokensCss(d.tokens)}--clr-width:${form.layout.width === "wide" ? "720px" : "480px"}}${CSS}` });
    if (d.status === "paused") return this.root.replaceChildren(style, el("div", { class: "f" }, el("p", { class: "i", text: "This form is closed." })));
    if (this.done) return this.root.replaceChildren(style, this.endScreen(form));

    const { shown, required } = visibility(form, this.answers);
    const last = this.step === form.steps.length - 1;
    const step = form.steps[this.step];
    const wrap = el("form", { class: "f", novalidate: true, "aria-label": form.title || "Form" });
    if (form.title) wrap.append(el("h2", { class: "h", text: form.title }));
    if (form.intro) wrap.append(el("p", { class: "i", text: form.intro }));
    if (form.steps.length > 1) wrap.append(el("p", { class: "st", text: `Step ${this.step + 1} of ${form.steps.length}${step.title ? ` · ${step.title}` : ""}` }));
    const grid = el("div", { class: "g" });
    for (const f of step.fields) if (f.type !== "hidden" && shown.has(f.id)) grid.append(this.field(f, form, required.has(f.id)));
    wrap.append(grid);
    if (last && this.needsConsent()) {
      const box = el("input", { type: "checkbox", id: "clr-consent" }) as HTMLInputElement;
      box.checked = this.consent;
      box.addEventListener("change", () => (this.consent = box.checked));
      wrap.append(el("label", { class: "ck" }, box, el("span", { text: form.consent.label })));
    }
    // Spam trap: hidden from people and screen readers; bots fill it.
    wrap.append(el("div", { class: "trap", "aria-hidden": "true" }, el("input", { type: "text", name: "company_url", tabindex: "-1", autocomplete: "off" })));
    if (d.turnstile && form.spam.turnstile) wrap.append(el("div", { class: "ts" }));
    if (this.alert) wrap.append(el("p", { class: "al", role: "alert", text: this.alert }));
    const actions = el("div", { class: "ac" });
    if (this.step > 0) {
      const back = el("button", { type: "button", class: "bt bk", text: "Back" });
      back.addEventListener("click", () => {
        this.step--;
        this.alert = "";
        this.render();
      });
      actions.append(back);
    }
    actions.append(el("button", { type: "submit", class: "bt", disabled: this.sending, text: this.sending ? "Sending…" : last ? form.submit.label : "Next" }));
    wrap.append(actions);
    wrap.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.next();
    });
    this.root.replaceChildren(style, wrap);
  }

  private needsConsent() {
    const c = this.data!.body.consent;
    return c.mode === "always" || (c.mode === "by_region" && this.data!.strict !== false);
  }

  private field(f: Field, form: Form, req: boolean): HTMLElement {
    const id = `clr-${f.id}`;
    const err = this.errors[f.id];
    const box = el("div", { class: `fl${f.width === "half" ? " half" : ""}` });
    const inside = form.layout.labels === "inside" && ["text", "email", "phone", "number", "url", "textarea"].includes(f.type);
    const label = el("label", { class: "lb", for: id, text: f.label }, req ? el("span", { class: "rq", "aria-hidden": "true", text: "*" }) : null);
    if (!inside && f.type !== "checkbox") box.append(label);
    const common = { id, "aria-invalid": err ? "true" : undefined, "aria-describedby": err ? `${id}-e` : f.help ? `${id}-h` : undefined, "aria-required": req ? "true" : undefined };
    const set = (v: unknown) => {
      this.answers[f.id] = v;
      if (this.errors[f.id]) {
        delete this.errors[f.id];
        this.later();
      } else if (form.rules.some((r) => r.when.field === f.id)) this.later();
    };
    const blur = () => {
      const r = checkAnswers(form, this.answers, { steps: [this.step] });
      if (r.errors[f.id] && this.answers[f.id] !== undefined && this.answers[f.id] !== "") {
        this.errors[f.id] = r.errors[f.id];
        this.later();
      }
    };
    if (f.type === "choice" || f.type === "country") box.append(this.listbox(f, common, set));
    else if (f.type === "multi") {
      const list = el("div", { class: "ch", role: "group", "aria-labelledby": `${id}-l` });
      label.id = `${id}-l`;
      const cur = new Set((this.answers[f.id] as string[] | undefined) ?? []);
      for (const o of f.options ?? []) {
        const c = el("input", { type: "checkbox", value: o.value, id: `${id}-${(f.options ?? []).indexOf(o)}` }) as HTMLInputElement;
        c.checked = cur.has(o.value);
        c.addEventListener("change", () => {
          if (c.checked) cur.add(o.value);
          else cur.delete(o.value);
          set([...cur]);
        });
        list.append(el("label", { class: "ck" }, c, el("span", { text: o.label })));
      }
      box.append(list);
    } else if (f.type === "checkbox") {
      const c = el("input", { type: "checkbox", ...common }) as HTMLInputElement;
      c.checked = this.answers[f.id] === true;
      c.addEventListener("change", () => set(c.checked));
      box.append(el("label", { class: "ck" }, c, el("span", { text: f.label }, req ? el("span", { class: "rq", text: "*" }) : null)));
    } else {
      const types: Record<string, string> = { email: "email", phone: "tel", number: "text", url: "url", date: "date" };
      const auto: Record<string, string> = { email: "email", first_name: "given-name", last_name: "family-name", name: "name", phone: "tel", company: "organization", title: "organization-title", website: "url" };
      const input = (f.type === "textarea" ? el("textarea", { class: "in", ...common }) : el("input", { class: "in", type: types[f.type] ?? "text", ...common, inputmode: f.type === "number" ? "decimal" : undefined })) as
        | HTMLInputElement
        | HTMLTextAreaElement;
      if (auto[f.key]) input.setAttribute("autocomplete", auto[f.key]);
      const ph = inside ? f.label + (req ? " *" : "") : f.placeholder;
      if (ph) input.setAttribute("placeholder", ph);
      if (inside) input.setAttribute("aria-label", f.label);
      input.value = typeof this.answers[f.id] === "string" ? (this.answers[f.id] as string) : "";
      input.addEventListener("input", () => {
        this.answers[f.id] = input.value;
        if (this.errors[f.id]) {
          delete this.errors[f.id];
          input.removeAttribute("aria-invalid");
          box.querySelector(".er")?.remove();
        }
      });
      input.addEventListener("change", () => set(input.value));
      input.addEventListener("blur", blur);
      box.append(input);
    }
    if (f.help) box.append(el("p", { class: "hp", id: `${id}-h`, text: f.help }));
    if (err) box.append(el("p", { class: "er", id: `${id}-e`, text: err }));
    return box;
  }

  /** A single-pick list: a button that opens options, with keys (up, down, enter, escape, letters) and search for long lists. */
  private listbox(f: Field, common: Record<string, string | undefined>, set: (v: unknown) => void): HTMLElement {
    const options = f.type === "country" ? countryNames(navigator.language) : (f.options ?? []);
    const cur = typeof this.answers[f.id] === "string" ? (this.answers[f.id] as string) : "";
    const isOpen = this.open === f.id;
    const wrap = el("div", { class: "dd" });
    const btn = el("button", { type: "button", class: "bx", ...common, "aria-haspopup": "listbox", "aria-expanded": isOpen ? "true" : "false" });
    const picked = options.find((o) => o.value === cur);
    btn.append(el("span", { class: picked ? "" : "ph", text: picked?.label ?? f.placeholder ?? "Choose…" }), el("span", { "aria-hidden": "true", text: "▾" }));
    const close = (focus = true) => {
      this.open = null;
      this.filter = "";
      this.render();
      if (focus) (this.root.getElementById(`clr-${f.id}`) as HTMLElement | null)?.focus();
    };
    btn.addEventListener("click", () => {
      this.open = isOpen ? null : f.id;
      this.filter = "";
      this.render();
      const box = this.root.querySelector(".ls input, .ls .op[aria-selected=true], .ls .op") as HTMLElement | null;
      box?.focus();
    });
    wrap.append(btn);
    if (!isOpen) return wrap;
    const search = options.length > 8;
    const list = el("ul", { class: "ls", role: "listbox", "aria-label": f.label });
    const shownOpts = this.filter ? options.filter((o) => o.label.toLowerCase().includes(this.filter.toLowerCase())) : options;
    const items: HTMLElement[] = [];
    const move = (i: number) => {
      const n = Math.max(0, Math.min(items.length - 1, i));
      items.forEach((x, j) => x.classList.toggle("on", j === n));
      items[n]?.focus();
    };
    if (search) {
      const q = el("input", { class: "in", type: "text", "aria-label": `Search ${f.label}`, autocomplete: "off" }) as HTMLInputElement;
      q.value = this.filter;
      q.addEventListener("input", () => {
        this.filter = q.value;
        this.render();
        const again = this.root.querySelector(".ls input") as HTMLInputElement | null;
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
      });
      q.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(0);
        } else if (e.key === "Escape") close();
        else if (e.key === "Enter") {
          e.preventDefault();
          if (shownOpts[0]) {
            set(shownOpts[0].value);
            close();
          }
        }
      });
      list.append(el("li", { role: "presentation" }, q));
    }
    shownOpts.slice(0, 300).forEach((o, i) => {
      const li = el("li", { class: "op", role: "option", tabindex: "-1", "aria-selected": o.value === cur ? "true" : "false", text: o.label });
      li.addEventListener("click", () => {
        set(o.value);
        close();
      });
      li.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          move(i + 1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (i === 0 && search) (this.root.querySelector(".ls input") as HTMLElement).focus();
          else move(i - 1);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          set(o.value);
          close();
        } else if (e.key === "Escape" || e.key === "Tab") close(e.key === "Escape");
        else if (e.key.length === 1) {
          const j = shownOpts.findIndex((x) => x.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (j >= 0) move(j);
        }
      });
      items.push(li);
      list.append(li);
    });
    wrap.append(list);
    return wrap;
  }

  private endScreen(form: Form): HTMLElement {
    // A meeting to book: the scheduler opens in the form, with the lead filled in. In the builder, its link stands in.
    const book = this.schedule ?? (this.isPreview && form.after.schedule?.url ? { tool: form.after.schedule.tool, url: form.after.schedule.url } : null);
    if (book && (!this.isPreview || safeUrl(book.url))) {
      return el(
        "div",
        { class: "f dn", role: "status" },
        el("h2", { class: "h", text: "Pick a time" }),
        el("iframe", { src: book.url, title: "Book a meeting", style: "width:100%;min-height:680px;border:0", loading: "lazy", allow: "payment" }),
      );
    }
    const end = form.after.end;
    if (end.kind === "redirect" && !this.isPreview && safeUrl(end.url)) {
      location.assign(end.url);
      return el("div", { class: "f" }, el("p", { class: "i", text: "One moment…" }));
    }
    const title = end.kind === "message" ? end.title : "Thanks, we got it.";
    const text = end.kind === "message" ? end.text : `Then we open ${end.url}`;
    const box = el("div", { class: "f dn", role: "status", tabindex: "-1" }, el("h2", { class: "h", text: title }), text ? el("p", { class: "i", text }) : null);
    queueMicrotask(() => box.focus());
    return box;
  }

  // Sending ------------------------------------------------------------------------------------------------

  private async next() {
    const d = this.data!;
    const form = d.body;
    const r = checkAnswers(form, this.answers, { steps: [this.step] });
    this.errors = r.errors;
    this.alert = "";
    if (Object.keys(r.errors).length) {
      this.render();
      const first = this.root.querySelector("[aria-invalid=true]") as HTMLElement | null;
      first?.focus();
      return;
    }
    if (this.step < form.steps.length - 1) {
      this.step++;
      this.render();
      (this.root.querySelector(".in, .bx, input") as HTMLElement | null)?.focus();
      return;
    }
    if (this.isPreview) {
      this.done = true;
      return this.render();
    }
    await this.send();
  }

  private hiddenValues(): Record<string, string> {
    const out: Record<string, string> = {};
    const params = new URLSearchParams(location.search);
    for (const f of allFields(this.data!.body)) {
      if (f.type !== "hidden" || !f.hidden) continue;
      const v = f.hidden.from === "param" ? params.get(f.hidden.name ?? "") : f.hidden.from === "page" ? location.href : f.hidden.from === "referrer" ? document.referrer : f.hidden.value;
      if (v) out[f.id] = v.slice(0, 500);
    }
    return out;
  }

  private async send() {
    const d = this.data!;
    this.sending = true;
    this.render();
    const params = new URLSearchParams(location.search);
    const utm = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].map((k) => [k, params.get(k) ?? ""]).filter(([, v]) => v));
    const body = JSON.stringify({
      v: 1,
      version: d.version,
      key: this.key,
      answers: this.answers,
      hidden: this.hiddenValues(),
      consent: this.needsConsent() ? { given: this.consent, wording: d.body.consent.label } : {},
      page: location.href.slice(0, 1000),
      referrer: document.referrer.slice(0, 1000),
      utm,
      ms: Date.now() - this.started,
      trap: (this.root.querySelector('input[name="company_url"]') as HTMLInputElement | null)?.value ?? "",
      turnstile: this.turnstileToken || undefined,
    });
    const url = `${this.base}/api/forms/${d.id}/submit`;
    let res: Response | null = null;
    try {
      res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, credentials: "omit", keepalive: true });
    } catch {
      res = null;
    }
    this.sending = false;
    if (res && res.status === 400) {
      // The server's own check found something the browser didn't (a free email on a work email field).
      const j = (await res.json().catch(() => ({}))) as { errors?: Record<string, string>; error?: string };
      this.errors = j.errors ?? {};
      this.alert = j.errors ? "" : (j.error ?? "Check the form and try again.");
      const firstStep = d.body.steps.findIndex((s) => s.fields.some((f) => this.errors[f.id]));
      if (firstStep >= 0) this.step = firstStep;
      return this.render();
    }
    if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      this.alert = j.error ?? "This form can't take answers right now.";
      return this.render();
    }
    if (!res || !res.ok) {
      // Kept and sent later with the same key; the visitor is done either way.
      writeQueue([...readQueue().filter((x) => x.key !== this.key), { url, body, key: this.key, at: Date.now(), tries: 1 }]);
      setTimeout(() => void flushQueue(), 15_000);
    } else {
      const j = (await res.json().catch(() => ({}))) as { id?: string; schedule?: { tool: string; url: string } | null };
      if (j.schedule && /^https:\/\//.test(j.schedule.url)) this.schedule = j.schedule;
      this.dispatchEvent(new CustomEvent("claritia:submitted", { bubbles: true, composed: true, detail: { formId: d.id, submissionId: j.id ?? null } }));
    }
    this.done = true;
    this.render();
  }
}

if (typeof customElements !== "undefined" && !customElements.get("claritia-form")) customElements.define("claritia-form", ClaritiaForm);
