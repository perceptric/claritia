// The guard's rewrite (docs/studio-v2-plan.md Part 16): what a stylesheet can't undo from outside, rewritten in the
// brand's CSS and the form's own. A radio or check box a design removes (display:none) stays reachable, out of sight;
// a fixed width never passes its box; fixed grid columns can shrink; and rows of two or more fields stack into one
// column under 560px. The Studio runs it as it draws (canvas and form check) and so does the form script
// (src/lib/forms/element.ts), on what it's given: nothing stored changes, and forms published before it get it too.
// Pure text, no DOM.

/** Visually hidden, still reached by the keyboard and read out. */
export const VH = "position:absolute;opacity:0;width:1px;height:1px;margin:0;padding:0;overflow:hidden;clip-path:inset(50%);pointer-events:none";
const FIELDS = "input:not([type=radio],[type=checkbox],[type=hidden],[type=submit],[type=button],[type=reset],[type=range]),select,textarea,.cl-pick,[data-cl-field]";

/** Splits a selector list at its top-level commas (not the ones inside :is(), :not() or [attr]). */
export const splitSelectors = (sel: string): string[] => sel.split(/,(?![^(]*\))(?![^[]*\])/).map((x) => x.trim()).filter(Boolean);

/** The declarations of a rule body, in order (a ; inside url(…) or a function stays in its value). */
export function decls(body: string): [string, string][] {
  const out: [string, string][] = [];
  for (const part of body.split(/;(?![^(]*\))/)) {
    const j = part.indexOf(":");
    if (j > 0) out.push([part.slice(0, j).trim().toLowerCase(), part.slice(j + 1).trim()]);
  }
  return out;
}
export const declText = (d: [string, string][]) => d.map(([k, v]) => `${k}:${v}`).join(";");

/**
 * Every innermost rule of a stylesheet, given to `fn` as its selector and declarations; what `fn` returns replaces the
 * rule (null keeps it). At-rule headers (@media, @supports, @container), @font-face and keyframe steps are left as they are.
 */
export function eachRule(css: string, fn: (sel: string, d: [string, string][]) => string | null): string {
  return css.replace(/([^{}]*)\{([^{}]*)\}/g, (all, head: string, body: string) => {
    // What's before the selector in the same run (an @import line, a comment, the line break) stays in front of it.
    const start = Math.max(head.lastIndexOf(";") + 1, head.lastIndexOf("*/") >= 0 ? head.lastIndexOf("*/") + 2 : 0);
    const lead = /^\s*/.exec(head.slice(start))![0].length;
    const pre = head.slice(0, start + lead);
    const sel = head.slice(start + lead).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!sel || sel.startsWith("@") || /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/i.test(sel)) return all;
    const out = fn(sel, decls(body));
    return out === null ? all : `${pre}${out}`;
  });
}

// A selector's last compound: what it picks.
const lastPart = (s: string) => s.replace(/\([^()]*\)/g, "()").split(/\s*[\s>+~]\s*/).filter(Boolean).pop() ?? "";
const TOGGLE = /\[type=["']?(radio|checkbox)["']?\]/i;
/** Whether a selector picks radios or check boxes: an input by type, or an input with no type (one in a choice). */
export function picksToggle(sel: string): boolean {
  const last = lastPart(sel);
  if (last.includes("::")) return false;
  if (TOGGLE.test(last)) return true;
  return /^input(?![\w-])/i.test(last) && !/\[type=/i.test(last);
}
const ABS = /^-?[\d.]+(px|rem|em|pt|pc|cm|mm|in|vw|ch|ex|q)$/i;
const FIXED_TRACK = /(^|[\s(,])(-?[\d.]+(?:px|rem|em|pt|ch|vw))(?=[\s),]|$)/gi;

/**
 * The form's or the brand's stylesheet with the guard's rewrites: radios and check boxes a design removes stay
 * reachable (visually hidden), fixed widths never pass their box, fixed grid columns can shrink, and rows of two or
 * more fields stack into one column under 560px. Idempotent. Pure text, so the form script runs it too.
 */
export function guardCss(css: string): string {
  const rows: string[] = [];
  const TAIL = /\n?\/\* claritia-guard rows \*\/@container \(max-width:560px\)\{[\s\S]*\}\}\s*$/;
  const out = eachRule(String(css ?? "").replace(TAIL, ""), (sel, d) => {
    let changed = false;
    // A removed radio or check box comes back for the keyboard, out of sight.
    const sels = splitSelectors(sel);
    const hides = d.some(([k, v]) => (k === "display" && /^none\b/i.test(v)) || (k === "visibility" && /^hidden\b/i.test(v)));
    let extra = "";
    if (hides && sels.some(picksToggle)) {
      const keep = sels.filter((s) => !picksToggle(s)), tog = sels.filter(picksToggle);
      const vh = d.filter(([k, v]) => !((k === "display" && /^none\b/i.test(v)) || (k === "visibility" && /^hidden\b/i.test(v))));
      extra = `${tog.join(",")}{${declText([...vh, ...VH.split(";").map((x) => x.split(":") as [string, string])])}}`;
      if (!keep.length) return extra;
      sel = keep.join(",");
      changed = true;
    }
    const has = (k: string) => d.some(([x]) => x === k);
    const next: [string, string][] = [];
    for (const [k, v0] of d) {
      let v = v0;
      const imp = /\s*!important\s*$/i.test(v) ? "!important" : "";
      const bare = v.replace(/\s*!important\s*$/i, "").trim();
      if ((k === "min-width" || k === "min-inline-size") && ABS.test(bare) && parseFloat(bare) > 0) { v = `min(${bare},100%)${imp}`; changed = true; }
      if ((k === "grid-template-columns" || k === "grid-template") && !/minmax\(0,/.test(bare)) {
        const w = bare.replace(FIXED_TRACK, (_m, a: string, n: string) => `${a}minmax(0,${n})`);
        if (w !== bare) { v = `${w}${imp}`; changed = true; }
      }
      next.push([k, v]);
    }
    // A fixed width never passes its box (a small one can't push a page sideways).
    const width = d.find(([k]) => k === "width" || k === "inline-size");
    const wv = width?.[1].replace(/\s*!important\s*$/i, "").trim() ?? "";
    if (width && ABS.test(wv) && (parseFloat(wv) >= (/px$/i.test(wv) ? 120 : 8)) && !has("max-width") && !has("max-inline-size")) { next.push(["max-width", "100%"]); changed = true; }
    // Rows: a grid with two or more columns, or a flex row, that holds fields.
    const disp = (d.find(([k]) => k === "display")?.[1] ?? "").toLowerCase();
    const cols = d.find(([k]) => k === "grid-template-columns")?.[1] ?? "";
    const dir = (d.find(([k]) => k === "flex-direction" || k === "flex-flow")?.[1] ?? "row").toLowerCase();
    const twoCols = cols && !/^\s*(none|minmax\(0,\s*1fr\)|1fr|100%|auto)\s*$/i.test(cols) && !/auto-(fill|fit)/i.test(cols);
    if (!/:hover|:focus|:active|::/.test(sel) && ((twoCols && /grid/.test(disp || "grid")) || (/flex/.test(disp) && !/column/.test(dir)))) rows.push(sel);
    const rule = changed ? `${sel}{${declText(next)}}` : null;
    return extra ? `${rule ?? `${sel}{${declText(d)}}`}${extra}` : rule;
  });
  const uniq = [...new Set(rows)];
  if (!uniq.length) return out;
  const tail = `/* claritia-guard rows */@container (max-width:560px){${uniq.map((s) => `:is(${s}):has(>:is(${FIELDS}),>* :is(${FIELDS}))`).join(",")}{grid-template-columns:minmax(0,1fr)!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important}}`;
  return `${out.trimEnd()}\n${tail}`;
}
