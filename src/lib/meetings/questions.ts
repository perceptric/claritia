// Booking questions (docs/meetings-scheduler.md): the kinds a meeting can ask, their labels in the editor, and one
// answer checked and cleaned the same way on the page and the server. Answers are kept as text: a choice's option, a
// multi's options joined with ", ", Yes or No, a rating 1 to 5, a country's two-letter code, a date as YYYY-MM-DD.
// On the page a multi travels as its options joined with a new line (an option never holds one). Runs anywhere.

import { COUNTRY_CODES } from "../forms/countries.ts";
import type { QuestionType } from "./types.ts";

export const QUESTION_TYPES: { value: QuestionType; label: string; options?: true }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "url", label: "Website" },
  { value: "date", label: "Date" },
  { value: "choice", label: "One choice", options: true },
  { value: "multi", label: "Several choices", options: true },
  { value: "yesno", label: "Yes or no" },
  { value: "rating", label: "Rating" },
  { value: "country", label: "Country" },
  { value: "checkbox", label: "Checkbox" },
  { value: "sms", label: "Text consent" },
];
export const QUESTION_KINDS = new Set<string>(QUESTION_TYPES.map((t) => t.value));
export const hasOptions = (t: QuestionType) => t === "choice" || t === "multi";

type Q = { label: string; type: QuestionType; options?: string[] };

/** One answer, cleaned: the text to keep, "" for none, or why it can't be used. */
export function checkAnswer(q: Q, raw: unknown): { value: string } | { error: string } {
  const s = (typeof raw === "string" ? raw : Array.isArray(raw) ? raw.filter((x) => typeof x === "string").join("\n") : "").trim();
  if (!s) return { value: "" };
  switch (q.type) {
    case "textarea":
      return { value: s.slice(0, 2000) };
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? { value: s.toLowerCase() } : { error: `${q.label} needs an email address.` };
    case "phone":
      return /^\+?[\d\s().-]{6,40}$/.test(s) ? { value: s } : { error: `${q.label} needs a phone number.` };
    case "number":
      return /^-?\d{1,15}([.,]\d{1,6})?$/.test(s) ? { value: s.replace(",", ".") } : { error: `${q.label} needs a number.` };
    case "url": {
      const u = /^https?:\/\//i.test(s) ? s : `https://${s}`;
      try {
        const x = new URL(u);
        return /\./.test(x.hostname) && u.length <= 300 ? { value: x.href } : { error: `${q.label} needs a web address.` };
      } catch {
        return { error: `${q.label} needs a web address.` };
      }
    }
    case "date": {
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const d = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null;
      return d && d.toISOString().slice(0, 10) === s ? { value: s } : { error: `${q.label} needs a date.` };
    }
    case "choice":
      return (q.options ?? []).includes(s) ? { value: s } : { error: `Pick an answer for ${q.label}.` };
    case "multi": {
      const picked = [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];
      if (!picked.every((x) => (q.options ?? []).includes(x))) return { error: `Pick answers for ${q.label}.` };
      return { value: (q.options ?? []).filter((o) => picked.includes(o)).join(", ") };
    }
    case "yesno":
      return s === "Yes" || s === "No" ? { value: s } : { error: `Pick Yes or No for ${q.label}.` };
    case "rating":
      return /^[1-5]$/.test(s) ? { value: s } : { error: `Pick a rating for ${q.label}.` };
    case "country": {
      const c = s.toUpperCase();
      return COUNTRY_CODES.includes(c) ? { value: c } : { error: `Pick a country for ${q.label}.` };
    }
    case "checkbox":
    case "sms":
      return s === "Yes" ? { value: "Yes" } : { value: "" };
    default:
      return { value: s.slice(0, 300) };
  }
}
