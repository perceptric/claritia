// Checking a style value (docs/design-system.md Part 2.3). Every value passes two checks: the safety check from
// Omniscient's style panel (nothing that could end a rule, comment, import, escape or run a script), then the
// property's own type (a length is a number with an allowed unit and in range, a color is a color...). A value can
// also name a variable as `$id`. What comes out is the clean value to save, or null. Runs in the browser and on the
// server.

import { propDef, type Prop, type PropDef } from "./props.ts";

const BAD = /[;{}<>\\`]|\/\*|\*\/|@|expression\s*\(|javascript:|vbscript:|data:/i;
const URL_FN = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
const HTTPS = /^https:\/\/[^\s'"()]{4,1500}$/;

/** The safety floor: trimmed, no rule-breaking, quotes and parentheses balanced, url() only to https. */
export function safeValue(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  let t = String(v).replace(/\s+/g, " ").trim();
  if (!t || t.length > 1000 || t.includes("!")) return null;
  let ok = true;
  t = t.replace(URL_FN, (_m, _q, u: string) => {
    if (!HTTPS.test(u.trim())) ok = false;
    return `url("${u.trim()}")`;
  });
  if (!ok) return null;
  const outside = t.replace(/url\("[^"]*"\)/g, "");
  if (/url\s*\(/i.test(outside) || BAD.test(outside)) return null;
  if ((outside.match(/"/g)?.length ?? 0) % 2 || (outside.match(/'/g)?.length ?? 0) % 2) return null;
  if ((t.match(/\(/g)?.length ?? 0) !== (t.match(/\)/g)?.length ?? 0)) return null;
  return t;
}

export const VAR_ID = /^[a-z][a-z0-9-]{0,39}$/;
/** A variable reference: `$brand`. */
export const varRef = (v: string): string | null => (v.startsWith("$") && VAR_ID.test(v.slice(1)) ? v.slice(1) : null);

const NUM = "-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)";
const num = (s: string) => Number(s);

/** A length within the property's range and units. A bare number is px (or unitless where allowed). */
function length(t: string, d: PropDef): string | null {
  if (d.auto && (t === "auto" || t === "none")) return t;
  const m = new RegExp(`^(${NUM})([a-z%]*)$`).exec(t);
  if (!m) return null;
  const n = num(m[1]!);
  let unit = m[2]!;
  if (!unit) unit = d.unitless ? "" : n === 0 ? "" : "px";
  if (unit && !(d.units ?? []).includes(unit)) return null;
  const px = unit === "em" || unit === "rem" ? n * 16 : n;
  if (unit !== "%" && unit !== "vw" && unit !== "vh" && ((d.min !== undefined && px < d.min) || (d.max !== undefined && px > d.max))) return null;
  const lo = (d.min ?? 0) < 0 ? -100 : 0;
  if ((unit === "%" || unit === "vw" || unit === "vh") && (n < lo || n > 100)) return null;
  if (!unit && d.unitless && (n < 0 || n > 10)) return null;
  return `${+n.toFixed(4)}${unit}`;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC_COLOR = /* @__PURE__ */ new RegExp(`^(rgba?|hsla?)\\(\\s*${NUM}%?(?:\\s*[,\\s]\\s*${NUM}%?){2}(?:\\s*[,/]\\s*${NUM}%?)?\\s*\\)$`, "i");
const NAMED = /* @__PURE__ */ new Set(["transparent", "currentcolor", "white", "black"]);

export function color(t: string): string | null {
  if (varRef(t)) return t;
  const l = t.toLowerCase();
  if (HEX.test(t)) return l;
  if (NAMED.has(l)) return l === "currentcolor" ? "currentColor" : l;
  if (FUNC_COLOR.test(t)) return t.replace(/\s+/g, " ");
  return null;
}

/** Split on commas that aren't inside parentheses. */
function topSplit(t: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of t) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** A color with an optional stop: `#fff 40%`. */
function stop(t: string): boolean {
  const parts = t.split(" ");
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  if (last && new RegExp(`^${NUM}(%|px)$`).test(last)) return color(parts.slice(0, -1).join(" ")) !== null;
  return color(t) !== null;
}

function gradient(t: string): boolean {
  const m = /^(linear|radial)-gradient\((.*)\)$/.exec(t);
  if (!m) return false;
  const args = topSplit(m[2]!);
  if (args.length < 2 || args.length > 6) return false;
  const first = args[0]!;
  const lead = m[1] === "linear" ? new RegExp(`^(${NUM}(deg|turn)|to (top|bottom|left|right)( (left|right))?)$`).test(first) : /^(circle|ellipse)( at (center|top|bottom|left|right))?$/.test(first);
  const stops = lead ? args.slice(1) : args;
  return stops.length >= 2 && stops.length <= 4 && stops.every(stop);
}

function image(t: string): string | null {
  if (t === "none") return t;
  if (/^url\("https:\/\/[^"]+"\)$/.test(t)) return t;
  return gradient(t) ? t : null;
}

/** Up to two shadows: `[inset] x y [blur] [spread] color`. */
function shadow(t: string, text: boolean): string | null {
  if (t === "none") return t;
  const list = topSplit(t);
  if (list.length > 2) return null;
  for (const s of list) {
    const parts = s.split(" ").filter(Boolean);
    if (!text && parts[0] === "inset") parts.shift();
    const lens: string[] = [];
    while (parts.length && new RegExp(`^${NUM}(px)?$`).test(parts[0]!)) lens.push(parts.shift()!);
    if (lens.length < 2 || lens.length > (text ? 3 : 4) || lens.some((x) => Math.abs(parseFloat(x)) > 200)) return null;
    if (parts.length && color(parts.join(" ")) === null) return null;
  }
  return t;
}

function transform(t: string): string | null {
  if (t === "none") return t;
  const fns = t.match(/[a-zA-Z]+\([^()]*\)/g) ?? [];
  if (!fns.length || fns.length > 4 || fns.join(" ") !== t) return null;
  const ok = fns.every((f) => {
    const m = /^([a-zA-Z]+)\((.*)\)$/.exec(f)!;
    const args = m[2]!.split(",").map((x) => x.trim());
    if (m[1] === "scale") return args.length <= 2 && args.every((a) => new RegExp(`^${NUM}$`).test(a) && +a >= 0 && +a <= 4);
    if (m[1] === "rotate") return args.length === 1 && new RegExp(`^${NUM}deg$`).test(args[0]!) && Math.abs(parseFloat(args[0]!)) <= 360;
    if (m[1] === "translateX" || m[1] === "translateY" || m[1] === "translate")
      return args.length <= (m[1] === "translate" ? 2 : 1) && args.every((a) => new RegExp(`^${NUM}(px|%|em)?$`).test(a) && Math.abs(parseFloat(a)) <= 400);
    return false;
  });
  return ok ? t : null;
}

const TRACK = /^(?:\d+(?:\.\d+)?(?:fr|px|%)|auto|minmax\(\d+(?:px|%)?, ?\d+(?:\.\d+)?(?:fr|px|%)\))$/;
function tracks(t: string): string | null {
  if (t === "none") return t;
  const rep = /^repeat\((\d{1,2}), ?(.+)\)$/.exec(t);
  if (rep) return +rep[1]! >= 1 && +rep[1]! <= 12 && TRACK.test(rep[2]!) ? t : null;
  const list = t.split(" ");
  return list.length <= 12 && list.every((x) => TRACK.test(x)) ? t : null;
}

const FONT = /^[A-Za-z0-9 ,'"_-]{1,200}$/;

/**
 * Check a value for a property. Returns the clean value, or null when it can't be used there. `$id` names a
 * variable; `vars`, when given, must have it with a kind that fits.
 */
export function checkValue(prop: Prop, raw: unknown, vars?: Map<string, { kind: string }>): string | null {
  const t = safeValue(raw);
  if (t === null) return null;
  const d = propDef(prop);
  const ref = varRef(t);
  if (ref) {
    if (!vars) return t;
    const v = vars.get(ref);
    const fits = v && (v.kind === d.kind || (d.kind === "weight" && v.kind === "number") || (d.kind === "number" && v.kind === "number") || (d.kind === "length" && v.kind === "number"));
    return fits ? t : null;
  }
  switch (d.kind) {
    case "length":
      return length(t, d);
    case "color":
      return color(t);
    case "keyword":
      return d.keywords?.includes(t.toLowerCase()) ? t.toLowerCase() : null;
    case "number":
    case "integer": {
      if (!new RegExp(`^${NUM}$`).test(t)) return null;
      const n = num(t);
      if (d.kind === "integer" && !Number.isInteger(n)) return null;
      return (d.min === undefined || n >= d.min) && (d.max === undefined || n <= d.max) ? String(n) : null;
    }
    case "weight":
      if (t === "normal" || t === "bold") return t;
      return /^[1-9]00$/.test(t) ? t : null;
    case "font":
      return FONT.test(t) ? t : null;
    case "image":
      return image(t);
    case "shadow":
      return shadow(t, prop === "text-shadow");
    case "ratio": {
      if (t === "auto") return t;
      const m = new RegExp(`^(${NUM})(?: ?/ ?(${NUM}))?$`).exec(t);
      return m && +m[1]! > 0 && +m[1]! <= 100 && (m[2] === undefined || (+m[2] > 0 && +m[2] <= 100)) ? t : null;
    }
    case "time": {
      const m = new RegExp(`^(${NUM})(ms|s)?$`).exec(t);
      if (!m) return null;
      const ms = m[2] === "s" ? num(m[1]!) * 1000 : num(m[1]!);
      return ms >= (d.min ?? 0) && ms <= (d.max ?? 2000) ? `${ms}ms` : null;
    }
    case "transform":
      return transform(t);
    case "tracks":
      return tracks(t);
    case "span":
      if (t === "auto") return t;
      return /^span (1[0-2]|[1-9])$/.test(t) ? t : null;
  }
  return null;
}
