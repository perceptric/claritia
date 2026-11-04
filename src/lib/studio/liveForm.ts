// Forms made before Form Studio, as Studio pages (docs/forms-chat-plan.md Part 8). One conversion for every place an
// older form shows up: its draft when it opens in the app, its live version when a visitor loads it, and an older
// version a visitor started on. Every field id, save key and setting carries over, and what the server does after a
// send stays exactly as it was: the meeting it books (with every route), the copy of answers, the auto-reply, alerts,
// consent and spam checks. The look is the form's brand's Studio stylesheet, the gallery style its kit was made for,
// or Claritia's plain one. Never the old tokens, skin or design-system CSS. Browser-free and deterministic: the same
// form always becomes the same page, so the version a visitor saw and the one their send is checked against match.

import { isTheme } from "../forms/gallery/themes.ts";
import { checkForm, type Form } from "../forms/schema.ts";
import type { PublicForm } from "../forms/submit.ts";
import { DEFAULT_BRAND_CSS } from "./brandDefault.ts";
import { formToPage } from "./fromForm.ts";
import { pageForm } from "./page.ts";
import { styleCssById } from "./styleCss.ts";

/** What an older form's brand kit says about its look. */
export type KitLook = { studio_css?: string | null; notes?: string[] | null } | null | undefined;

/** The Studio stylesheet for an older form: its brand's own, the gallery style its kit was made in, or the plain one. */
export function lookCss(kit: KitLook): string {
  if (kit?.studio_css?.trim()) return kit.studio_css;
  const style = (kit?.notes ?? []).find((n) => typeof n === "string" && n.startsWith("style:"))?.slice(6);
  return isTheme(style) ? styleCssById(style) : DEFAULT_BRAND_CSS;
}

/** Settings a page doesn't hold, kept from the older form as they were. */
const KEEP = ["reply", "keep", "notify", "share", "consent", "spam", "copy"] as const;

/** Whether a form is already a page, or reads the site's own form (which has no page). */
export const needsStudio = (f: unknown): boolean => !!f && typeof f === "object" && !("page" in (f as object)) && !("capture" in (f as object)) && Array.isArray((f as { steps?: unknown }).steps);

/**
 * An older form as a Studio page in `css`. `lost` says, in plain words, what the page can't hold (pictures, a route
 * the On submission tab can't show). Errors when the form itself doesn't pass the checker.
 */
export function studioForm(raw: unknown, css: string, ctx: { custom?: { key: string }[] } = {}): { form: Form; lost: string[] } | { error: string } {
  const old = checkForm(raw, ctx);
  if ("errors" in old) return { error: old.errors[0] ?? "The form can't be read." };
  const conv = formToPage(old.form);
  const { form: made } = pageForm({ html: conv.html, css: conv.css, brand: css || DEFAULT_BRAND_CSS, after: conv.after, title: conv.title });
  const next = made as Record<string, unknown>;
  for (const k of KEEP) if (old.form[k] !== undefined) next[k] = old.form[k];
  // The meeting it books, exactly as before: every route, even one the On submission tab can't show yet.
  const sch = old.form.after?.schedule;
  if (sch) next.after = { ...((next.after as object) ?? {}), schedule: sch };
  const r = checkForm(next, ctx);
  if ("errors" in r) return { error: r.errors[0] ?? "The page can't be made." };
  return { form: r.form, lost: conv.lost };
}

/** A version from before the Studio as the page visitors get, in its kit's look. The stored form when it can't be one. */
export function studioBody(body: Form, f: Pick<PublicForm, "studio_css" | "kit_notes">): { body: Form; older?: Form } {
  if (!needsStudio(body)) return { body };
  const r = studioForm(body, lookCss({ studio_css: f.studio_css, notes: f.kit_notes }));
  return "error" in r ? { body } : { body: r.form, older: body };
}

/** The live form as form_public answers it, with an older body turned into a page. */
export function studioPublic(f: PublicForm): PublicForm {
  const s = studioBody(f.body, f);
  return s.older ? { ...f, body: s.body, older: s.older } : f;
}
