// The form script's second part (docs/fields-plan.md): the fields that need more than an input, loaded as
// /forms/x1.js only on forms that have one, so the main script stays small. <claritia-form> calls window.__clrX.draw
// with the field and its answer; every widget sets the answer through `set`, so checks, rules and the send work as
// for every other field. Built by scripts/build-forms.mts. Browser only.

import { track, trackInfo } from "./track.ts";
import { MEDIA_CSS, ONE_CSS, oneKeys, pickers, PICK_CSS, showMedia, splitOne } from "../studio/pageParts.ts";
import { ADDRESS_PARTS, type Choice, type Field } from "./schema.ts";

type El = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string | boolean | undefined>, ...kids: (Node | string | null | false)[]) => HTMLElementTagNameMap[K];

export type XCtx = {
  f: Field;
  id: string;
  common: Record<string, string | undefined>;
  value: unknown;
  set(v: unknown, picked?: boolean): void;
  el: El;
  root: ShadowRoot | Document;
  options: Choice[];
  /** Upload a file to the form; its answer token, or null (the error is shown). */
  upload(file: Blob, name: string): Promise<string | null>;
  /** The map service's public key, when it's set up. */
  mapToken?: string;
  /** Draw the form again (a widget that changed its own shape). */
  redraw(): void;
};

const CSS = `.xr{display:flex;flex-direction:column;gap:8px}.xw{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.xw>.in{flex:1 1 120px;min-width:0}
.xf{display:flex;flex-wrap:wrap;gap:6px}.xf button{border:0;background:none;padding:4px;cursor:pointer;border-radius:999px;color:inherit;opacity:.55;line-height:0}.xf button[aria-checked=true]{opacity:1;box-shadow:0 0 0 2px currentColor}.xf svg{width:40px;height:40px}
.xt{width:100%;border-collapse:collapse}.xt th,.xt td{padding:6px;text-align:center;font-weight:inherit}.xt th:first-child,.xt td:first-child{text-align:start}.xt .in{width:100%;min-width:80px}.xs{overflow-x:auto}
.xq{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px 12px;align-items:center}.xq .in{width:76px;text-align:center}.xm{font-variant-numeric:tabular-nums;opacity:.75}
.xb{display:flex;gap:4px;flex-wrap:wrap}.xb button{min-width:32px}.xpop{border:1px solid currentColor;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto}
.xmap{position:relative;height:260px;overflow:hidden;border-radius:8px;touch-action:none;background:#e9eef2;cursor:grab}.xmap img{position:absolute;width:256px;height:256px;user-select:none;-webkit-user-drag:none;pointer-events:none}.xmap .xpin{position:absolute;width:18px;height:18px;margin:-18px 0 0 -9px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d93025;box-shadow:0 0 0 2px #fff}.xmap .xz{position:absolute;right:8px;top:8px;display:flex;flex-direction:column;gap:4px}.xmap .xz button{width:30px;height:30px;border-radius:6px;border:0;background:#fff;color:#222;font-size:18px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)}.xmap .xc{position:absolute;left:6px;bottom:4px;font-size:10px;color:#333;background:rgba(255,255,255,.7);padding:0 4px;border-radius:3px}
.xcrop{position:relative;width:min(280px,100%);aspect-ratio:1;overflow:hidden;border-radius:8px;touch-action:none;cursor:grab;background:#0001}.xcrop img{position:absolute;left:50%;top:50%;transform-origin:center;user-select:none;pointer-events:none;max-width:none}
.xcv{width:100%;height:220px;border:1px dashed currentColor;border-radius:8px;touch-action:none;background:#fff}.xvid{width:100%;max-height:260px;border-radius:8px;background:#000}
.xg{position:relative;height:28px}.xg input{position:absolute;inset:0;width:100%;pointer-events:none;background:none;-webkit-appearance:none;appearance:none}.xg input::-webkit-slider-thumb{pointer-events:auto}.xg input::-moz-range-thumb{pointer-events:auto}`;

const FACES = [
  "M8 15c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4", // 1: sad (drawn upside down below)
  "M8.5 15.5h7",
  "M8 15h8",
  "M8 14c1 1.4 2.4 2 4 2s3-.6 4-2",
  "M7.5 13.5c1.2 2 2.7 3 4.5 3s3.3-1 4.5-3",
];
const FACE_NAMES = ["Very unhappy", "Unhappy", "Neutral", "Happy", "Very happy"];
const face = (i: number) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><circle cx="9" cy="10" r=".9" fill="currentColor"/><circle cx="15" cy="10" r=".9" fill="currentColor"/><path d="${i === 0 ? "M8 16.5c1-1.6 2.4-2.4 4-2.4s3 .8 4 2.4" : i === 1 ? "M8.5 16c1-.9 2.2-1.3 3.5-1.3s2.5.4 3.5 1.3" : FACES[i]}"/></svg>`;
const THUMB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-7c1.4 0 2.2 1 2 2.4L12.5 10H18a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/></svg>`;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const money = (n: number, cur = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
};

function draw(c: XCtx): HTMLElement {
  const { f, el } = c;
  if (f.type === "rating") return faces(c);
  if (f.type === "sum") return sum(c);
  if (f.type === "range") return range(c);
  if (f.type === "table" || f.type === "slots") return table(c);
  if (f.type === "products") return products(c);
  if (f.type === "address") return address(c);
  switch (f.ui) {
    case "amounts":
      return amounts(c);
    case "duration":
      return duration(c);
    case "rich":
      return rich(c);
    case "dropdown":
      return multiDrop(c);
    case "draw":
      return drawing(c);
    case "location":
      return location(c);
    case "map":
      return c.mapToken ? map(c) : location(c);
    case "record":
      return record(c);
    case "crop":
      return crop(c);
  }
  return el("div");
}

/** Smileys (five) or thumbs (down and up): a radio group, so arrows move and screen readers say each one. */
function faces(c: XCtx): HTMLElement {
  const { f, el } = c;
  const thumbs = f.rating?.style === "thumbs";
  const n = thumbs ? 2 : 5;
  const cur = Number(c.value);
  const g = el("div", { class: "xf", role: "radiogroup", "aria-labelledby": `${c.id}-l`, "aria-invalid": c.common["aria-invalid"] });
  for (let i = 1; i <= n; i++) {
    const on = cur === i;
    const b = el("button", { type: "button", role: "radio", "aria-checked": on ? "true" : "false", "aria-label": thumbs ? (i === 1 ? "Thumbs down" : "Thumbs up") : FACE_NAMES[i - 1], tabindex: on || (!cur && i === 1) ? "0" : "-1" });
    b.innerHTML = thumbs ? THUMB : face(i - 1);
    if (thumbs && i === 1) b.firstElementChild?.setAttribute("style", "transform:rotate(180deg)");
    const pickIt = (k: number) => {
      g.querySelectorAll("button").forEach((x, j) => {
        x.setAttribute("aria-checked", j + 1 === k ? "true" : "false");
        x.setAttribute("tabindex", j + 1 === k ? "0" : "-1");
      });
      (g.children[k - 1] as HTMLElement | undefined)?.focus();
      c.set(k, true);
    };
    b.addEventListener("click", () => pickIt(i));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const now = Number([...g.querySelectorAll("button")].findIndex((x) => x.getAttribute("aria-checked") === "true")) + 1;
      pickIt(Math.min(n, Math.max(1, (now || 1) + d)));
    });
    g.append(b);
  }
  return g;
}

/** Points to spread over the options, with what's left to give. */
function sum(c: XCtx): HTMLElement {
  const { f, el } = c;
  const total = f.total ?? 100;
  const v = { ...obj(c.value) } as Record<string, string>;
  const left = el("p", { class: "hp xm", "aria-live": "polite" });
  const show = () => {
    const used = Object.values(v).reduce((a, x) => a + (Number(x) || 0), 0);
    left.textContent = used === total ? `All ${total} points given` : `${total - used} of ${total} points left`;
  };
  const box = el("div", { class: "xq", role: "group", "aria-labelledby": `${c.id}-l` });
  for (const o of f.options ?? []) {
    const i = el("input", { class: "in", type: "number", min: "0", max: String(total), step: "1", inputmode: "numeric", "aria-label": o.label, value: v[o.value] ?? "" }) as HTMLInputElement;
    i.addEventListener("input", () => {
      if (i.value) v[o.value] = i.value;
      else delete v[o.value];
      show();
    });
    i.addEventListener("change", () => c.set({ ...v }));
    box.append(el("span", { text: o.label }), i, el("span"));
  }
  show();
  return el("div", { class: "xr" }, box, left);
}

/** A lowest and a highest number on one track, each with its own box. */
function range(c: XCtx): HTMLElement {
  const { f, el } = c;
  const lo = f.valid?.min ?? 0,
    hi = f.valid?.max ?? 100,
    step = f.valid?.step ?? 1;
  const v = obj(c.value);
  let from = Number(v.from ?? lo),
    to = Number(v.to ?? hi);
  const a = el("input", { type: "range", min: String(lo), max: String(hi), step: String(step), value: String(from), "aria-label": "Lowest" }) as HTMLInputElement;
  const b = el("input", { type: "range", min: String(lo), max: String(hi), step: String(step), value: String(to), "aria-label": "Highest" }) as HTMLInputElement;
  const na = el("input", { class: "in", type: "number", min: String(lo), max: String(hi), step: String(step), value: String(from), "aria-label": "Lowest" }) as HTMLInputElement;
  const nb = el("input", { class: "in", type: "number", min: String(lo), max: String(hi), step: String(step), value: String(to), "aria-label": "Highest" }) as HTMLInputElement;
  const sync = (keep: "a" | "b") => {
    if (from > to) {
      if (keep === "a") to = from;
      else from = to;
    }
    a.value = na.value = String(from);
    b.value = nb.value = String(to);
  };
  const save = () => c.set({ from: String(from), to: String(to) });
  a.addEventListener("input", () => ((from = Number(a.value)), sync("a")));
  b.addEventListener("input", () => ((to = Number(b.value)), sync("b")));
  na.addEventListener("input", () => ((from = Number(na.value) || lo), sync("a")));
  nb.addEventListener("input", () => ((to = Number(nb.value) || hi), sync("b")));
  for (const x of [a, b, na, nb]) x.addEventListener("change", save);
  return el("div", { class: "xr", role: "group", "aria-labelledby": `${c.id}-l` }, el("div", { class: "xg" }, a, b), el("div", { class: "xw" }, na, el("span", { text: "to" }), nb));
}

/** A table to fill in (a text box per cell) or the times that work (a box to tick per cell, many per row). */
function table(c: XCtx): HTMLElement {
  const { f, el } = c;
  const slots = f.type === "slots";
  const v = { ...obj(c.value) } as Record<string, unknown>;
  const rows = f.grid?.rows ?? [],
    cols = f.grid?.cols ?? [];
  const t = el("table", { class: "xt" });
  t.append(el("tr", {}, el("th"), ...cols.map((x) => el("th", { class: "lb", scope: "col", text: x.label }))));
  for (const r of rows) {
    const tr = el("tr", {}, el("th", { scope: "row", text: r.label }));
    for (const col of cols) {
      if (slots) {
        const list = (Array.isArray(v[r.value]) ? (v[r.value] as string[]) : String(v[r.value] ?? "").split("|").filter(Boolean)).slice();
        const box = el("input", { type: "checkbox", "aria-label": `${r.label}, ${col.label}` }) as HTMLInputElement;
        box.checked = list.includes(col.value);
        box.addEventListener("change", () => {
          const now = new Set(Array.isArray(v[r.value]) ? (v[r.value] as string[]) : String(v[r.value] ?? "").split("|").filter(Boolean));
          if (box.checked) now.add(col.value);
          else now.delete(col.value);
          if (now.size) v[r.value] = [...now];
          else delete v[r.value];
          c.set({ ...v }, true);
        });
        tr.append(el("td", {}, box));
      } else {
        const k = `${r.value}: ${col.value}`;
        const i = el("input", { class: "in", type: "text", "aria-label": `${r.label}, ${col.label}`, value: String(v[k] ?? "") }) as HTMLInputElement;
        i.addEventListener("change", () => {
          if (i.value.trim()) v[k] = i.value;
          else delete v[k];
          c.set({ ...v });
        });
        tr.append(el("td", {}, i));
      }
    }
    t.append(tr);
  }
  return el("div", { class: "xs", role: "group", "aria-labelledby": `${c.id}-l` }, t);
}

/** Products with how many of each, and the total. */
function products(c: XCtx): HTMLElement {
  const { f, el } = c;
  const v = { ...obj(c.value) } as Record<string, string>;
  const cur = f.currency ?? "USD";
  const total = el("p", { class: "hp xm", "aria-live": "polite" });
  const show = () => {
    const n = (f.options ?? []).reduce((a, o) => a + (Number(v[o.value]) || 0) * (o.score ?? 0), 0);
    total.textContent = `Total ${money(n, cur)}`;
  };
  const box = el("div", { class: "xq", role: "group", "aria-labelledby": `${c.id}-l` });
  for (const o of f.options ?? []) {
    const i = el("input", { class: "in", type: "number", min: "0", max: "999", step: "1", inputmode: "numeric", "aria-label": `How many ${o.label}`, value: v[o.value] ?? "0" }) as HTMLInputElement;
    const put = (n: number) => {
      const k = Math.max(0, Math.min(999, Math.round(n) || 0));
      i.value = String(k);
      if (k) v[o.value] = String(k);
      else delete v[o.value];
      show();
      c.set({ ...v });
    };
    i.addEventListener("change", () => put(Number(i.value)));
    const minus = el("button", { type: "button", class: "pl", "aria-label": `One less ${o.label}`, text: "−" });
    const plus = el("button", { type: "button", class: "pl", "aria-label": `One more ${o.label}`, text: "+" });
    minus.addEventListener("click", () => put((Number(i.value) || 0) - 1));
    plus.addEventListener("click", () => put((Number(i.value) || 0) + 1));
    box.append(el("span", {}, el("span", { text: o.label }), el("br"), el("span", { class: "xm", text: money(o.score ?? 0, cur) })), el("div", { class: "xb" }, minus, i, plus), el("span"));
  }
  show();
  return el("div", { class: "xr" }, box, total);
}

/** Amounts to pick (a donation, a tip), or any other amount. */
function amounts(c: XCtx): HTMLElement {
  const { f, el } = c;
  const cur = Number(c.value);
  const list = f.amounts ?? [];
  const other = Number.isFinite(cur) && c.value !== "" && c.value !== undefined && !list.includes(cur);
  const i = el("input", { class: "in", type: "number", min: "0", step: "0.01", inputmode: "decimal", placeholder: "Other amount", "aria-label": "Other amount", value: other ? String(cur) : "" }) as HTMLInputElement;
  const row = el("div", { class: "xb", role: "radiogroup", "aria-labelledby": `${c.id}-l` });
  for (const a of list) {
    const b = el("button", { type: "button", class: "pl", role: "radio", "aria-checked": cur === a ? "true" : "false", "aria-pressed": cur === a ? "true" : "false", text: f.unit === "money" ? money(a) : String(a) });
    b.addEventListener("click", () => {
      row.querySelectorAll("button").forEach((x) => {
        x.setAttribute("aria-checked", x === b ? "true" : "false");
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      i.value = "";
      c.set(String(a), true);
    });
    row.append(b);
  }
  i.addEventListener("change", () => {
    row.querySelectorAll("button").forEach((x) => {
      x.setAttribute("aria-checked", "false");
      x.setAttribute("aria-pressed", "false");
    });
    c.set(i.value);
  });
  return el("div", { class: "xr" }, row, i);
}

/** Hours and minutes; the answer is the minutes. */
function duration(c: XCtx): HTMLElement {
  const { el } = c;
  const m = Math.max(0, Math.round(Number(c.value) || 0));
  const h = el("input", { class: "in", type: "number", min: "0", step: "1", inputmode: "numeric", "aria-label": "Hours", value: c.value === undefined || c.value === "" ? "" : String(Math.floor(m / 60)) }) as HTMLInputElement;
  const mi = el("input", { class: "in", type: "number", min: "0", max: "59", step: "1", inputmode: "numeric", "aria-label": "Minutes", value: c.value === undefined || c.value === "" ? "" : String(m % 60) }) as HTMLInputElement;
  const save = () => (h.value || mi.value ? c.set(String((Number(h.value) || 0) * 60 + Math.min(59, Number(mi.value) || 0))) : c.set(""));
  h.addEventListener("change", save);
  mi.addEventListener("change", save);
  return el("div", { class: "xw", role: "group", "aria-labelledby": `${c.id}-l` }, h, el("span", { text: "hours" }), mi, el("span", { text: "minutes" }));
}

/** A long answer with bold, italic, lists and links, written as Markdown so it reads well anywhere it goes. */
function rich(c: XCtx): HTMLElement {
  const { el } = c;
  const t = el("textarea", { class: "in", ...c.common, rows: "6" }) as HTMLTextAreaElement;
  t.value = typeof c.value === "string" ? c.value : "";
  t.addEventListener("change", () => c.set(t.value));
  const wrapSel = (a: string, b = a) => {
    const s = t.selectionStart,
      e = t.selectionEnd;
    const mid = t.value.slice(s, e) || "text";
    t.value = t.value.slice(0, s) + a + mid + b + t.value.slice(e);
    t.focus();
    t.setSelectionRange(s + a.length, s + a.length + mid.length);
    c.set(t.value);
  };
  const line = (p: string) => {
    const s = t.value.lastIndexOf("\n", t.selectionStart - 1) + 1;
    t.value = t.value.slice(0, s) + p + t.value.slice(s);
    t.focus();
    c.set(t.value);
  };
  const tool = (label: string, text: string, fn: () => void, style = "") => {
    const b = el("button", { type: "button", class: "pl", "aria-label": label, title: label, text });
    if (style) b.setAttribute("style", style);
    b.addEventListener("click", fn);
    return b;
  };
  return el(
    "div",
    { class: "xr" },
    el("div", { class: "xb", role: "toolbar", "aria-label": "Formatting" }, tool("Bold", "B", () => wrapSel("**"), "font-weight:700"), tool("Italic", "I", () => wrapSel("_"), "font-style:italic"), tool("Bulleted list", "•", () => line("- ")), tool("Numbered list", "1.", () => line("1. ")), tool("Link", "Link", () => wrapSel("[", "](https://)"))),
    t,
  );
}

/** Pick many from a dropdown with a search box: the choices show as ticks in a list under the button. */
function multiDrop(c: XCtx): HTMLElement {
  const { el } = c;
  const picked = new Set(Array.isArray(c.value) ? (c.value as string[]) : []);
  const opts = c.options;
  const btn = el("button", { type: "button", class: "bx in", ...c.common, "aria-haspopup": "listbox", "aria-expanded": "false" });
  const label = () => {
    const names = opts.filter((o) => picked.has(o.value)).map((o) => o.label);
    btn.textContent = names.length ? (names.length <= 2 ? names.join(", ") : `${names.length} picked`) : "Choose…";
  };
  label();
  const pop = el("div", { class: "xpop", role: "listbox", "aria-multiselectable": "true", hidden: true });
  const q = el("input", { class: "in", type: "text", placeholder: "Search", "aria-label": "Search", autocomplete: "off" }) as HTMLInputElement;
  const list = el("div", { class: "xr" });
  const fill = () => {
    list.replaceChildren();
    const want = q.value.trim().toLowerCase();
    for (const o of opts.filter((x) => !want || x.label.toLowerCase().includes(want)).slice(0, 200)) {
      const box = el("input", { type: "checkbox" }) as HTMLInputElement;
      box.checked = picked.has(o.value);
      box.addEventListener("change", () => {
        if (box.checked) picked.add(o.value);
        else picked.delete(o.value);
        label();
      });
      list.append(el("label", { class: "ck", role: "option", "aria-selected": box.checked ? "true" : "false" }, box, el("span", { text: o.label })));
    }
  };
  const done = el("button", { type: "button", class: "pl", text: "Done" });
  const close = () => {
    pop.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    c.set([...picked], true);
  };
  done.addEventListener("click", close);
  btn.addEventListener("click", () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    fill();
    q.focus();
  });
  q.addEventListener("input", fill);
  pop.addEventListener("keydown", (e) => e.key === "Escape" && (close(), btn.focus()));
  if (opts.length > 8) pop.append(q);
  pop.append(list, done);
  return el("div", { class: "xr" }, btn, pop);
}

/** A drawing on a canvas, kept as a picture once a line is finished. */
function drawing(c: XCtx): HTMLElement {
  const { el } = c;
  const cv = el("canvas", { class: "xcv", "aria-label": "Drawing area" }) as HTMLCanvasElement;
  const state = el("p", { class: "hp", "aria-live": "polite", text: typeof c.value === "string" && c.value ? "Drawing saved" : "" });
  let ink = "#111111";
  let ctx: CanvasRenderingContext2D | null = null;
  let drawn = false;
  let t = 0;
  const size = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const img = drawn ? cv.toDataURL() : "";
    cv.width = Math.round(r.width * devicePixelRatio);
    cv.height = Math.round(r.height * devicePixelRatio);
    ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    if (img) {
      const im = new Image();
      im.onload = () => ctx?.drawImage(im, 0, 0, r.width, r.height);
      im.src = img;
    }
  };
  requestAnimationFrame(size);
  const at = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  let down = false;
  cv.addEventListener("pointerdown", (e) => {
    if (!ctx) size();
    if (!ctx) return;
    down = true;
    cv.setPointerCapture(e.pointerId);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(...at(e));
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down || !ctx) return;
    ctx.lineTo(...at(e));
    ctx.stroke();
    drawn = true;
  });
  const save = () => {
    clearTimeout(t);
    t = window.setTimeout(() => {
      state.textContent = "Saving…";
      cv.toBlob(async (b) => {
        if (!b) return;
        const tok = await c.upload(b, "drawing.png");
        state.textContent = tok ? "Drawing saved" : "";
        if (tok) c.set(tok, true);
      }, "image/png");
    }, 600);
  };
  cv.addEventListener("pointerup", () => {
    if (!down) return;
    down = false;
    save();
  });
  const colors = el("div", { class: "xb" });
  for (const [name, hex] of [["Black", "#111111"], ["Blue", "#1a5fd0"], ["Red", "#d0341a"], ["Green", "#16834a"]] as const) {
    const b = el("button", { type: "button", class: "pl", "aria-label": name, "aria-pressed": hex === ink ? "true" : "false" });
    b.style.cssText = `width:28px;min-width:28px;padding:0;background:${hex}`;
    b.addEventListener("click", () => {
      ink = hex;
      colors.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    });
    colors.append(b);
  }
  const clear = el("button", { type: "button", class: "pl", text: "Clear" });
  clear.addEventListener("click", () => {
    const r = cv.getBoundingClientRect();
    ctx?.clearRect(0, 0, r.width, r.height);
    drawn = false;
    state.textContent = "";
    c.set("");
  });
  colors.append(clear);
  return el("div", { class: "xr" }, cv, colors, state);
}

/** Where they are: one tap on "Use my location", or typed. The answer is the place's words, or "lat, lng". */
function location(c: XCtx): HTMLElement {
  const { el } = c;
  const i = el("input", { class: "in", type: "text", ...c.common, placeholder: "City, address or coordinates", value: typeof c.value === "string" ? c.value : "" }) as HTMLInputElement;
  i.addEventListener("change", () => c.set(i.value));
  const state = el("p", { class: "hp", "aria-live": "polite" });
  const b = el("button", { type: "button", class: "pl", text: "Use my location" });
  b.addEventListener("click", () => {
    if (!navigator.geolocation) return void (state.textContent = "This browser can't share a location. Type it in.");
    state.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const ll = `${p.coords.latitude.toFixed(5)}, ${p.coords.longitude.toFixed(5)}`;
        let words = ll;
        if (c.mapToken) {
          const r = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${p.coords.longitude}&latitude=${p.coords.latitude}&limit=1&access_token=${encodeURIComponent(c.mapToken)}`).catch(() => null);
          const j = (await r?.json().catch(() => null)) as { features?: { properties?: { full_address?: string } }[] } | null;
          const place = j?.features?.[0]?.properties?.full_address;
          if (place) words = `${place} (${ll})`;
        }
        i.value = words;
        state.textContent = "";
        c.set(words, true);
      },
      () => (state.textContent = "Location wasn't shared. Type it in."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
  return el("div", { class: "xr" }, el("div", { class: "xw" }, i, b), state);
}

/** A pin on a map: drag to move around, + and − to zoom, a tap to drop the pin. Map tiles come from Mapbox. */
function map(c: XCtx): HTMLElement {
  const { el } = c;
  const m = /(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)?$/.exec(typeof c.value === "string" ? c.value : "");
  let pin: [number, number] | null = m ? [Number(m[1]), Number(m[2])] : null;
  let z = pin ? 14 : 2;
  let center: [number, number] = pin ?? [20, 0];
  const box = el("div", { class: "xmap", role: "application", "aria-label": "Map. Drag to move, tap to drop a pin." });
  const tiles = el("div");
  const dot = el("div", { class: "xpin", hidden: !pin });
  const zin = el("button", { type: "button", "aria-label": "Zoom in", text: "+" });
  const zout = el("button", { type: "button", "aria-label": "Zoom out", text: "−" });
  box.append(tiles, dot, el("div", { class: "xz" }, zin, zout), el("div", { class: "xc", text: "© Mapbox © OpenStreetMap" }));
  const world = (lat: number, lng: number, zz: number) => {
    const s = 256 * 2 ** zz;
    const x = ((lng + 180) / 360) * s;
    const r = (lat * Math.PI) / 180;
    const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s;
    return [x, y] as const;
  };
  const back = (x: number, y: number, zz: number): [number, number] => {
    const s = 256 * 2 ** zz;
    const lng = (x / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / s;
    return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng];
  };
  const paint = () => {
    const w = box.clientWidth || 300,
      h = box.clientHeight || 260;
    const [cx, cy] = world(center[0], center[1], z);
    const left = cx - w / 2,
      top = cy - h / 2;
    const n = 2 ** z;
    tiles.replaceChildren();
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + w) / 256); tx++)
      for (let ty = Math.floor(top / 256); ty <= Math.floor((top + h) / 256); ty++) {
        if (ty < 0 || ty >= n) continue;
        const img = el("img", { alt: "", src: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/${z}/${((tx % n) + n) % n}/${ty}@2x?access_token=${encodeURIComponent(c.mapToken ?? "")}` });
        img.style.left = `${tx * 256 - left}px`;
        img.style.top = `${ty * 256 - top}px`;
        tiles.append(img);
      }
    dot.hidden = !pin;
    if (pin) {
      const [px, py] = world(pin[0], pin[1], z);
      dot.style.left = `${px - left}px`;
      dot.style.top = `${py - top}px`;
    }
  };
  requestAnimationFrame(paint);
  let drag: { x: number; y: number; moved: boolean } | null = null;
  box.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button")) return;
    drag = { x: e.clientX, y: e.clientY, moved: false };
    box.setPointerCapture(e.pointerId);
  });
  box.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    const [cx, cy] = world(center[0], center[1], z);
    center = back(cx - dx, cy - dy, z);
    drag.x = e.clientX;
    drag.y = e.clientY;
    paint();
  });
  box.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) return;
    const r = box.getBoundingClientRect();
    const [cx, cy] = world(center[0], center[1], z);
    pin = back(cx - r.width / 2 + (e.clientX - r.left), cy - r.height / 2 + (e.clientY - r.top), z);
    paint();
    c.set(`${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}`, true);
  });
  const zoom = (d: number) => {
    z = Math.max(1, Math.min(18, z + d));
    paint();
  };
  zin.addEventListener("click", () => zoom(1));
  zout.addEventListener("click", () => zoom(-1));
  const here = el("button", { type: "button", class: "pl", text: "Use my location" });
  here.addEventListener("click", () =>
    navigator.geolocation?.getCurrentPosition((p) => {
      pin = [p.coords.latitude, p.coords.longitude];
      center = pin;
      z = 15;
      paint();
      c.set(`${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}`, true);
    }),
  );
  const said = el("p", { class: "hp", "aria-live": "polite", text: pin ? `Pin at ${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : "" });
  return el("div", { class: "xr" }, box, el("div", { class: "xw" }, here, said));
}

/** An answer spoken (or filmed) in the browser, up to two minutes, then sent like a file. */
function record(c: XCtx): HTMLElement {
  const { f, el } = c;
  const canVideo = !!f.file?.kinds.includes("video");
  let video = false;
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let timer = 0;
  const state = el("p", { class: "hp", "aria-live": "polite", text: typeof c.value === "string" && c.value ? "Recording saved" : "" });
  const view = el("video", { class: "xvid", playsinline: true, hidden: true }) as HTMLVideoElement;
  const play = el("audio", { controls: true, hidden: true }) as HTMLAudioElement;
  const go = el("button", { type: "button", class: "pl", text: "Start recording" });
  const kind = el("div", { class: "xb", hidden: !canVideo });
  for (const [k, t] of [[false, "Audio"], [true, "Video"]] as const) {
    const b = el("button", { type: "button", class: "pl", "aria-pressed": k === video ? "true" : "false", text: t });
    b.addEventListener("click", () => {
      video = k;
      kind.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    });
    kind.append(b);
  }
  const stop = () => {
    clearInterval(timer);
    if (rec?.state === "recording") rec.stop();
  };
  go.addEventListener("click", async () => {
    if (rec?.state === "recording") return stop();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return void (state.textContent = "This browser can't record. Upload a file instead.");
    try {
      stream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { width: 640, height: 480 } } : { audio: true });
    } catch {
      state.textContent = video ? "The camera wasn't allowed." : "The microphone wasn't allowed.";
      return;
    }
    const parts: Blob[] = [];
    rec = new MediaRecorder(stream, video ? { videoBitsPerSecond: 900_000 } : { audioBitsPerSecond: 64_000 });
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    rec.onstop = async () => {
      stream?.getTracks().forEach((t) => t.stop());
      view.srcObject = null;
      const type = rec?.mimeType || (video ? "video/webm" : "audio/webm");
      const blob = new Blob(parts, { type });
      const url = URL.createObjectURL(blob);
      go.textContent = "Record again";
      if (video) {
        view.hidden = false;
        view.controls = true;
        view.muted = false;
        view.src = url;
      } else {
        play.hidden = false;
        play.src = url;
      }
      state.textContent = "Saving…";
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const tok = await c.upload(blob, `${video ? "video" : "audio"}-${Date.now()}.${video ? ext : ext === "mp4" ? "m4a" : "webm"}`);
      state.textContent = tok ? "Recording saved" : "";
      if (tok) c.set(tok, true);
    };
    if (video) {
      view.hidden = false;
      view.muted = true;
      view.controls = false;
      view.srcObject = stream;
      void view.play().catch(() => undefined);
    }
    rec.start(1000);
    const start = Date.now();
    go.textContent = "Stop";
    timer = window.setInterval(() => {
      const s = Math.round((Date.now() - start) / 1000);
      state.textContent = `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} of 2:00`;
      if (s >= 120) stop();
    }, 500);
  });
  return el("div", { class: "xr" }, kind, view, play, el("div", { class: "xb" }, go), state);
}

/** A picture cut to a square: drag to place it, the slider to zoom, then it's sent as a 640 px JPEG. */
function crop(c: XCtx): HTMLElement {
  const { el } = c;
  const pick = el("input", { type: "file", class: "in", accept: "image/png,image/jpeg,image/webp", ...c.common }) as HTMLInputElement;
  const frame = el("div", { class: "xcrop", hidden: true });
  const img = el("img", { alt: "" }) as HTMLImageElement;
  frame.append(img);
  const zoom = el("input", { type: "range", min: "1", max: "3", step: "0.01", value: "1", "aria-label": "Zoom", hidden: true }) as HTMLInputElement;
  const use = el("button", { type: "button", class: "pl", text: "Use this photo", hidden: true });
  const state = el("p", { class: "hp", "aria-live": "polite", text: typeof c.value === "string" && c.value ? c.value.slice(c.value.indexOf(":") + 1) : "" });
  let dx = 0,
    dy = 0,
    base = 1;
  const place = () => {
    const s = base * Number(zoom.value);
    img.style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${s})`;
  };
  pick.addEventListener("change", () => {
    const file = pick.files?.[0];
    if (!file) return;
    img.onload = () => {
      frame.hidden = zoom.hidden = use.hidden = false;
      const side = frame.clientWidth || 280;
      base = side / Math.min(img.naturalWidth, img.naturalHeight);
      img.style.width = `${img.naturalWidth}px`;
      img.style.height = `${img.naturalHeight}px`;
      dx = dy = 0;
      zoom.value = "1";
      place();
    };
    img.src = URL.createObjectURL(file);
  });
  zoom.addEventListener("input", place);
  let drag: { x: number; y: number } | null = null;
  frame.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX - dx, y: e.clientY - dy };
    frame.setPointerCapture(e.pointerId);
  });
  frame.addEventListener("pointermove", (e) => {
    if (!drag) return;
    dx = e.clientX - drag.x;
    dy = e.clientY - drag.y;
    place();
  });
  frame.addEventListener("pointerup", () => (drag = null));
  use.addEventListener("click", () => {
    const side = frame.clientWidth || 280;
    const out = document.createElement("canvas");
    out.width = out.height = 640;
    const g = out.getContext("2d");
    if (!g) return;
    const s = base * Number(zoom.value);
    const k = 640 / side;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, 640, 640);
    g.translate(320 + dx * k, 320 + dy * k);
    g.scale(s * k, s * k);
    g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    state.textContent = "Saving…";
    out.toBlob(async (b) => {
      if (!b) return;
      const tok = await c.upload(b, "photo.jpg");
      state.textContent = tok ? "Photo saved" : "";
      if (tok) c.set(tok, true);
    }, "image/jpeg", 0.88);
  });
  return el("div", { class: "xr" }, pick, frame, zoom, el("div", { class: "xb" }, use), state);
}

/** An address with suggestions as the street is typed (Mapbox), filling the city, postcode and country. */
function address(c: XCtx): HTMLElement {
  const { el } = c;
  const v = { ...obj(c.value) } as Record<string, string>;
  const parts: Record<string, HTMLInputElement> = {};
  const NAMES: Record<string, [string, string]> = { line1: ["Street address", "address-line1"], line2: ["Apartment, suite (optional)", "address-line2"], city: ["City", "address-level2"], region: ["State or region", "address-level1"], postal: ["Postcode", "postal-code"], country: ["Country", "country-name"] };
  const save = () => c.set({ ...v });
  for (const k of ADDRESS_PARTS) {
    const [ph, auto] = NAMES[k]!;
    const i = el("input", { class: "in", type: "text", placeholder: ph, "aria-label": ph, autocomplete: auto, value: v[k] ?? "" }) as HTMLInputElement;
    i.addEventListener("input", () => (v[k] = i.value));
    i.addEventListener("change", save);
    parts[k] = i;
  }
  const list = el("div", { class: "xpop", role: "listbox", "aria-label": "Suggested addresses", hidden: true });
  let t = 0;
  let ask = 0;
  parts.line1!.setAttribute("role", "combobox");
  parts.line1!.setAttribute("aria-autocomplete", "list");
  parts.line1!.addEventListener("input", () => {
    clearTimeout(t);
    const q = parts.line1!.value.trim();
    if (q.length < 4 || !c.mapToken) return void (list.hidden = true);
    t = window.setTimeout(async () => {
      const n = ++ask;
      // A slow or failed lookup leaves the boxes to type in, as without suggestions.
      const ctl = new AbortController();
      const stopAt = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&types=address&autocomplete=true&limit=5&language=${encodeURIComponent(navigator.language.slice(0, 2))}&access_token=${encodeURIComponent(c.mapToken!)}`, { signal: ctl.signal }).catch(() => null);
      clearTimeout(stopAt);
      const j = (await r?.json().catch(() => null)) as { features?: { properties?: { full_address?: string; name?: string; context?: Record<string, { name?: string; country_code?: string }> } }[] } | null;
      if (n !== ask) return;
      const feats = j?.features ?? [];
      list.replaceChildren();
      list.hidden = !feats.length;
      for (const ft of feats) {
        const p = ft.properties ?? {};
        const b = el("button", { type: "button", class: "pl", role: "option", text: p.full_address ?? p.name ?? "" });
        b.style.cssText = "text-align:start;white-space:normal;border-radius:6px";
        b.addEventListener("click", () => {
          const cx = p.context ?? {};
          v.line1 = p.name ?? "";
          v.city = cx.place?.name ?? cx.locality?.name ?? "";
          v.region = cx.region?.name ?? "";
          v.postal = cx.postcode?.name ?? "";
          v.country = cx.country?.name ?? "";
          for (const k of ADDRESS_PARTS) parts[k]!.value = v[k] ?? "";
          list.hidden = true;
          save();
          parts.line2!.focus();
        });
        list.append(b);
      }
    }, 250);
  });
  return el("div", { class: "mn", role: "group", "aria-labelledby": `${c.id}-l` }, parts.line1!, list, parts.line2!, el("div", { class: "xw" }, parts.city!, parts.region!), el("div", { class: "xw" }, parts.postal!, parts.country!));
}

/** A studio page's parts: its dropdowns and its photos, with their look (src/lib/studio/pageParts.ts). */
const page = { pickers, media: showMedia, split: splitOne, keys: oneKeys, css: PICK_CSS + MEDIA_CSS + ONE_CSS };
(window as unknown as { __clrX?: { draw: (c: XCtx) => HTMLElement; css: string; track: typeof track; info: typeof trackInfo; page: typeof page } }).__clrX = { draw, css: CSS, track, info: trackInfo, page };
