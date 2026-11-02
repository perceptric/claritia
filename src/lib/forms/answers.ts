// Checking what a visitor sent. The browser runs this page by page for quick errors; the server runs it again on
// the whole form and keeps only what passes, so a hand-made request can't store anything a real visitor couldn't.

import { allFields, hasValue, shown } from "./logic.ts";
import type { Answer, Answers, FileRef, FormField, FormSchema } from "./types.ts";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : undefined);
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const num = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string" || !v.trim()) return undefined;
  const n = Number(v.replace(/[,\s$€£¥]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};
const pick = (f: FormField, v: string): string | undefined => {
  const o = f.options?.find((x) => x.toLowerCase() === v.trim().toLowerCase());
  if (o) return o;
  return f.other && v.trim() ? v.trim().slice(0, 200) : undefined;
};

export function normalizeUrl(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const p = new URL(u);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(p.hostname) ? u.slice(0, 2000) : undefined;
  } catch {
    return undefined;
  }
}

/** One answer, cleaned. `value` is undefined for blank; `error` says what to fix. */
export function checkOne(f: FormField, raw: unknown): { value?: Answer; error?: string } {
  const bad = (error: string) => ({ error });
  if (raw == null || raw === "") return {};
  switch (f.kind) {
    case "short_text":
    case "hidden": {
      const s = str(raw, 500);
      return s === undefined ? bad("Enter text.") : { value: s || undefined };
    }
    case "long_text": {
      const s = str(raw, 10000);
      return s === undefined ? bad("Enter text.") : { value: s || undefined };
    }
    case "email": {
      const s = str(raw, 320);
      if (!s) return {};
      return EMAIL_RE.test(s) && s.length <= 254 ? { value: s } : bad("Enter a valid email.");
    }
    case "phone": {
      const s = str(raw, 40);
      if (!s) return {};
      const digits = s.replace(/\D/g, "");
      return /^[+\d\s().\-/]+$/.test(s) && digits.length >= 6 && digits.length <= 16 ? { value: s } : bad("Enter a valid phone number.");
    }
    case "url": {
      const s = str(raw, 2000);
      if (!s) return {};
      const u = normalizeUrl(s);
      return u ? { value: u } : bad("Enter a website like acme.com.");
    }
    case "number":
    case "money": {
      const n = num(raw);
      if (n === undefined) return bad("Enter a number.");
      if (f.min !== undefined && n < f.min) return bad(`Enter ${f.min} or more.`);
      if (f.max !== undefined && n > f.max) return bad(`Enter ${f.max} or less.`);
      return { value: n };
    }
    case "rating":
    case "nps":
    case "scale": {
      const n = num(raw);
      const lo = f.kind === "nps" ? 0 : f.kind === "rating" ? 1 : (f.min ?? 1);
      const hi = f.kind === "nps" ? 10 : f.kind === "rating" ? (f.max ?? 5) : (f.max ?? 5);
      return n !== undefined && Number.isInteger(n) && n >= lo && n <= hi ? { value: n } : bad("Pick a value.");
    }
    case "single":
    case "dropdown": {
      if (typeof raw !== "string") return bad("Pick one.");
      if (!raw.trim()) return {};
      const v = pick(f, raw);
      return v ? { value: v } : bad("Pick one of the options.");
    }
    case "multi": {
      if (!Array.isArray(raw)) return bad("Pick from the list.");
      const out: string[] = [];
      for (const x of raw) {
        if (typeof x !== "string" || !x.trim()) continue;
        const v = pick(f, x);
        if (!v) return bad("Pick from the list.");
        if (!out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
      }
      if (out.length > (f.options?.length ?? 0) + (f.other ? 1 : 0)) return bad("Pick from the list.");
      return { value: out.length ? out : undefined };
    }
    case "ranking": {
      if (!Array.isArray(raw)) return bad("Put the options in order.");
      const opts = f.options ?? [];
      const out = raw.map((x) => opts.find((o) => typeof x === "string" && o.toLowerCase() === x.toLowerCase())).filter((x): x is string => !!x);
      return out.length === opts.length && new Set(out).size === opts.length ? { value: out } : bad("Put every option in order.");
    }
    case "yes_no":
    case "agree": {
      const v = raw === true || raw === "yes" || raw === "true" ? true : raw === false || raw === "no" || raw === "false" ? false : undefined;
      if (v === undefined) return bad("Pick yes or no.");
      return f.kind === "agree" && !v ? {} : { value: v };
    }
    case "matrix": {
      if (typeof raw !== "object" || Array.isArray(raw)) return bad("Answer each row.");
      const out: Record<string, string> = {};
      for (const [row, col] of Object.entries(raw as Record<string, unknown>)) {
        const r = f.rows?.find((x) => x === row);
        const c = typeof col === "string" ? f.options?.find((x) => x === col) : undefined;
        if (!r || (col !== "" && col != null && !c)) return bad("Answer each row.");
        if (c) out[r] = c;
      }
      return { value: Object.keys(out).length ? out : undefined };
    }
    case "date": {
      const s = str(raw, 10);
      if (!s) return {};
      return validDate(s) ? { value: s } : bad("Enter a date.");
    }
    case "time": {
      const s = str(raw, 5);
      if (!s) return {};
      return TIME_RE.test(s) ? { value: s } : bad("Enter a time.");
    }
    case "date_range": {
      if (typeof raw !== "object" || Array.isArray(raw)) return bad("Enter the dates.");
      const r = raw as Record<string, unknown>;
      const from = str(r.from, 10) ?? "";
      const to = str(r.to, 10) ?? "";
      if (!from && !to) return {};
      if (!validDate(from) || !validDate(to)) return bad("Enter both dates.");
      return from <= to ? { value: { from, to } } : bad("The end comes before the start.");
    }
    case "name": {
      if (typeof raw !== "object" || Array.isArray(raw)) return bad("Enter a name.");
      const r = raw as Record<string, unknown>;
      const first = str(r.first, 100) ?? "";
      const last = str(r.last, 100) ?? "";
      return { value: first || last ? { first, last } : undefined };
    }
    case "address": {
      if (typeof raw !== "object" || Array.isArray(raw)) return bad("Enter an address.");
      const r = raw as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const k of ["line1", "line2", "city", "region", "postal", "country"]) {
        const v = str(r[k], 200);
        if (v) out[k] = v;
      }
      return { value: Object.keys(out).length ? out : undefined };
    }
    case "file":
    case "signature": {
      if (!Array.isArray(raw)) return bad("Add a file.");
      const files = raw as FileRef[];
      const max = f.kind === "signature" ? 1 : (f.maxFiles ?? 1);
      if (files.length > max) return bad(max === 1 ? "Add one file." : `Add up to ${max} files.`);
      for (const x of files) {
        if (!x || typeof x.name !== "string" || typeof x.size !== "number" || typeof x.type !== "string" || typeof x.path !== "string") return bad("Add the file again.");
        if (x.size > MAX_FILE_BYTES) return bad("Files can be up to 10 MB.");
      }
      return { value: files.length ? files.map((x) => ({ name: x.name.slice(0, 200), path: x.path, size: x.size, type: x.type.slice(0, 100) })) : undefined };
    }
    default:
      return {};
  }
}

/** A required field with nothing in it says so. A name needs a first name, an address its first line and city. */
function missing(f: FormField, v: Answer | undefined): boolean {
  if (!f.required) return false;
  if (!hasValue(v)) return true;
  if (f.kind === "name") return !(v as Record<string, string>).first;
  if (f.kind === "address") return !((v as Record<string, string>).line1 && (v as Record<string, string>).city);
  if (f.kind === "matrix") return (f.rows ?? []).some((r) => !(v as Record<string, string>)[r]);
  if (f.kind === "date_range") return !(v as Record<string, string>).from;
  return false;
}

const REQUIRED: Partial<Record<FormField["kind"], string>> = {
  single: "Pick one.",
  dropdown: "Pick one.",
  multi: "Pick at least one.",
  yes_no: "Pick yes or no.",
  agree: "Tick the box to go on.",
  rating: "Pick a rating.",
  nps: "Pick a score.",
  scale: "Pick a value.",
  file: "Add a file.",
  signature: "Sign here.",
  matrix: "Answer each row.",
};

/**
 * The answers that pass, and an error per field that doesn't. `page` limits the check to one page (the browser's
 * Next button); without it every page is checked. Answers to fields hidden by logic are dropped.
 */
export function checkAnswers(s: FormSchema, raw: Record<string, unknown>, opts: { page?: number } = {}): { answers: Answers; errors: Record<string, string> } {
  const clean: Answers = {};
  const errors: Record<string, string> = {};
  const fields = allFields(s);
  for (const f of fields) {
    if (f.kind === "statement") continue;
    const r = checkOne(f, raw[f.key]);
    if (r.error) errors[f.key] = r.error;
    else if (r.value !== undefined) clean[f.key] = r.value;
  }
  const view = shown(s, clean);
  const onPage = opts.page === undefined ? null : new Set((s.pages[opts.page]?.fields ?? []).map((f) => f.key));
  const out: Answers = {};
  const errs: Record<string, string> = {};
  for (const f of fields) {
    if (!view.keys.has(f.key) || (onPage && !onPage.has(f.key))) continue;
    if (errors[f.key]) errs[f.key] = errors[f.key];
    else if (missing(f, view.answers[f.key])) errs[f.key] = REQUIRED[f.kind] ?? "Fill this in.";
    if (view.answers[f.key] !== undefined && !errs[f.key]) out[f.key] = view.answers[f.key];
  }
  return { answers: out, errors: errs };
}

/** An answer as one line of text, for tables, CSV and emails. */
export function answerText(f: Pick<FormField, "kind">, v: Answer | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || typeof v === "string") return String(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : (x as FileRef).name)).join(f.kind === "ranking" ? " > " : ", ");
  if (f.kind === "name") return [v.first, v.last].filter(Boolean).join(" ");
  if (f.kind === "date_range") return `${v.from} to ${v.to}`;
  if (f.kind === "address") return ["line1", "line2", "city", "region", "postal", "country"].map((k) => v[k]).filter(Boolean).join(", ");
  return Object.entries(v)
    .map(([k, x]) => `${k}: ${x}`)
    .join("; ");
}
