// The form inside an email (Share › Email, docs/sharing-plan.md): the first question with each answer as a button.
// A click opens the form with that answer filled in (?clr_a=<field id>:<answer>, read by src/lib/forms/element.ts),
// and a step with only that question moves on to the next. Plain HTML with inline styles and tables, so Gmail,
// Outlook and Mailchimp show it as it is. Runs anywhere.

import { isChoice, isContent, type Field, type Form } from "../forms/schema.ts";

export type EmailQuestion = { fieldId: string; label: string; answers: { label: string; value: string }[] };

const MAX_ANSWERS = 10;

/** The form's first question when it can be answered by a click: a pick list (10 answers at most) or a rating. */
export function firstQuestion(form: Form): EmailQuestion | null {
  const f = form.steps[0]?.fields.find((x) => !isContent(x.type) && x.type !== "hidden" && x.type !== "calc");
  if (!f) return null;
  if (isChoice(f.type) && f.options?.length && f.options.length <= MAX_ANSWERS) return { fieldId: f.id, label: f.label, answers: f.options.map((o) => ({ label: o.label || o.value, value: o.value })) };
  if (f.type === "rating") {
    const scale = Math.min(Math.max(f.rating?.scale ?? 5, 2), 10);
    const from = f.rating?.zero ? 0 : 1;
    return { fieldId: f.id, label: f.label, answers: Array.from({ length: scale - from + 1 }, (_, i) => ({ label: String(from + i), value: String(from + i) })) };
  }
  return null;
}

/** The address an answer opens: the form's link with the answer to fill. */
export const answerUrl = (link: string, q: Pick<EmailQuestion, "fieldId">, value: string) => `${link}${link.includes("?") ? "&" : "?"}clr_a=${encodeURIComponent(`${q.fieldId}:${value}`)}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const COLOR = /^#[0-9a-f]{3,8}$/i;

/** The question and its buttons as email HTML. A rating sits on one row; a list stacks, one button a line. */
export function emailQuestionHtml(q: EmailQuestion, o: { link: string; color?: string; textColor?: string }): string {
  const bg = o.color && COLOR.test(o.color) ? o.color : "#0a0a0a";
  const fg = o.textColor && COLOR.test(o.textColor) ? o.textColor : "#ffffff";
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const button = (a: EmailQuestion["answers"][number], w: string) =>
    `<a href="${esc(answerUrl(o.link, q, a.value))}" style="display:block;${w}padding:12px 16px;background:${bg};color:${fg};text-decoration:none;border-radius:8px;${font};font-size:15px;font-weight:600;text-align:center">${esc(a.label)}</a>`;
  const row = q.answers.every((a) => /^\d{1,2}$/.test(a.value));
  const cells = row
    ? `<tr>${q.answers.map((a) => `<td style="padding:4px">${button(a, "min-width:24px;")}</td>`).join("")}</tr>`
    : q.answers.map((a) => `<tr><td style="padding:4px 0">${button(a, "")}</td></tr>`).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;max-width:560px;width:100%">
<tr><td style="padding:0 0 12px;${font};font-size:18px;font-weight:600;line-height:1.35;color:#0a0a0a">${esc(q.label)}</td></tr>
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${row ? "" : "width:100%"}">${cells}</table></td></tr>
</table>`;
}

/** The answer a ?clr_a value fills, checked against the form: only its first question, only one of its answers. */
export function answerFrom(form: Form, raw: string | null): { field: Field; value: string | number | string[] } | null {
  if (!raw) return null;
  const at = raw.indexOf(":");
  if (at < 1) return null;
  const q = firstQuestion(form);
  if (!q || raw.slice(0, at) !== q.fieldId) return null;
  const value = raw.slice(at + 1);
  if (!q.answers.some((a) => a.value === value)) return null;
  const field = form.steps[0]!.fields.find((f) => f.id === q.fieldId)!;
  return { field, value: field.type === "rating" ? Number(value) : field.type === "multi" ? [value] : value };
}
