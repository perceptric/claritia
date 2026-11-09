import { createHash, randomBytes } from "node:crypto";
import { templateById, templateTheme } from "./gallery/catalog.ts";
import { filterTemplates } from "./gallery/filter.ts";
import { studioTemplate } from "./gallery/studioList.ts";
import { THEMES } from "./gallery/themes.ts";
import { checkForm, type Form } from "./schema.ts";
import { pageForm, type PageQuestion } from "../studio/page.ts";
import { styleCssById } from "../studio/styleCss.ts";
import { templateDraft } from "../studio/templatePage.ts";

// Forms made from chat before signing up (docs/mcp.md, 142_guest_forms.sql): the form from a template or from the
// page ChatGPT or Claude wrote, in one of the website's styles, checked like any form, and refused when it asks for a
// password, a card or a code. The key that holds it is shown once: the app keeps it to change the form, the person
// gets it as the claim link.

export const STYLE_IDS = THEMES.map((t) => t.id);

/** A new key and its hash. The key starts clm_ so it's easy to spot. */
export function newGuestKey(): { key: string; hash: string } {
  const key = `clm_${randomBytes(32).toString("base64url")}`;
  return { key, hash: guestKeyHash(key) };
}

export const GUEST_KEY = /^clm_[A-Za-z0-9_-]{43}$/;
export const guestKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export const guestIpHash = (ip: string) => createHash("sha256").update(`guest-form:${ip || "unknown"}`).digest("hex");

// What a form made without an account may never ask: sign-ins, cards, bank details and the like.
const RISKY = /\b(pass ?words?|passcodes?|pins?|pin codes?|cvv|cvc|security codes?|card numbers?|credit cards?|debit cards?|expiry date|expiration date|routing numbers?|bank accounts?|account numbers?|iban|sort codes?|social security|ssn|seed phrases?|recovery phrases?|private keys?|2fa|one[- ]time (?:codes?|passwords?)|verification codes?|log ?in|sign ?in|user ?names?)\b/i;

/** Why a form made without an account is refused, or null. */
export function guestRisk(html: string, questions: Pick<PageQuestion, "label" | "name" | "type">[]): string | null {
  if (/<input\b[^>]*\btype\s*=\s*["']?password/i.test(html)) return "Forms made without an account can't ask for a password.";
  for (const q of questions) {
    const words = `${q.label} ${q.name.replace(/[_-]+/g, " ")}`;
    if (RISKY.test(words)) return `Forms made without an account can't ask for sign-ins, card or bank details, or codes ("${q.label}"). Sign in to Claritia to make this one.`;
  }
  return null;
}

/** Templates for a request, best match first. Rare words count more (yoga over class); a word in the name counts most. */
let INDEX: { t: ReturnType<typeof filterTemplates>[number]; name: string; text: string; n: number }[] | null = null;
const index = () =>
  (INDEX ??= filterTemplates({}, "", "popular").map((t) => {
    const c = studioTemplate(t);
    const qs = t.schema.pages.flatMap((pg) => pg.fields.flatMap((f) => [f.label, ...(f.options ?? [])]));
    return { t, name: t.name.toLowerCase(), text: `${c.words} ${qs.join(" ")}`.toLowerCase(), n: c.n };
  }));

export function findTemplates(query: string, n = 6): { id: string; name: string; blurb: string; questions: number }[] {
  const all = index();
  const words = [...new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))];
  const idf = new Map(words.map((w) => [w, Math.log((all.length + 1) / (1 + all.filter((x) => x.text.includes(w) || x.name.includes(w)).length))]));
  return all
    .map((x, i) => ({ x, i, s: words.reduce((sum, w) => sum + (x.name.includes(w) ? 2 * idf.get(w)! : x.text.includes(w) ? idf.get(w)! : 0), 0) }))
    .filter((r) => !words.length || r.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, n)
    .map(({ x }) => ({ id: x.t.id, name: x.t.name, blurb: x.t.blurb, questions: x.n }));
}

/** The form to make: from a template, or from the page the app wrote; checked, in the style picked. */
export function guestForm(p: { name: string; template?: string; html?: string; css?: string; style?: string }): { form: Form; questions: string[] } | { error: string } {
  const style = p.style && STYLE_IDS.includes(p.style) ? p.style : undefined;
  let form: Form;
  if (p.template) {
    const t = templateById(p.template);
    if (!t) return { error: `No template ${p.template}. Call find_form_template to get one.` };
    try {
      form = templateDraft(t, styleCssById(style ?? templateTheme(t)));
    } catch (e) {
      return { error: e instanceof Error ? e.message : "This template can't be used right now." };
    }
  } else if (p.html && p.html.trim()) {
    const made = pageForm({ html: p.html, css: p.css ?? "", brand: styleCssById(style ?? "paper"), after: { kind: "thanks" }, title: p.name });
    if (!made.questions.length) return { error: "The page has no questions to send." };
    // Checked on the page as written, before cleaning changes its inputs, and on each question's own name.
    const risk = guestRisk(p.html, made.questions);
    if (risk) return { error: risk };
    const checked = checkForm(made.form);
    if ("errors" in checked) return { error: `The page was refused: ${checked.errors.join(" ")}` };
    form = checked.form;
  } else return { error: "Pass template (from find_form_template) or html (the whole page)." };
  const page = form.page as { html?: string } | undefined;
  const qs = pageQuestions(form);
  const risk = guestRisk(page?.html ?? "", qs);
  if (risk) return { error: risk };
  return { form, questions: qs.map((q) => q.label) };
}

/** The questions a page form asks, from its fields. */
function pageQuestions(form: Form): { label: string; name: string; type: string }[] {
  const out: { label: string; name: string; type: string }[] = [];
  for (const step of form.steps ?? []) for (const f of step.fields ?? []) if (f.type !== "hidden") out.push({ label: f.label ?? "", name: f.key ?? "", type: f.type });
  return out;
}
