// The guard (docs/studio-v2-plan.md Part 16): what every studio page wears last, after the brand's CSS and the form's
// own, wherever it shows (the Studio's canvas, the form check's hidden render, the published page, the embed and every
// preview), so whatever Tia or a template wrote can't scroll sideways, cut text off, shrink a tap below a finger, hide
// a choice from the keyboard, draw two arrows on a dropdown or two lines around a focused field. Made by code, never
// by a model, and never in the form script: the Studio draws with guardSheet(), and the server hands every visitor the
// form already guarded (servedForm, from /api/forms/<id> and the app's previews), so forms published before it get it
// too and the form script stays inside its size budget (scripts/build-forms.mts).

import type { Form } from "../forms/schema.ts";
import { declText, eachRule, guardCss, splitSelectors } from "./guardCss.ts";
import { readableCssText } from "./readable.ts";

// One arrow on every dropdown: the browser's is turned off and this one drawn (the form's own dropdowns draw theirs).
const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='gray' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const CHOICE = "label:has(input:is([type=radio],[type=checkbox]))";
/** Fields a visitor types into or opens: text boxes, text areas, dropdowns and the form's own dropdown button. */
export const TYPED = "input:not([type=radio],[type=checkbox],[type=range],[type=submit],[type=button],[type=reset],[type=file],[type=color],[type=hidden]),select,textarea,.cl-pick";

export const GUARD_CSS =
  // The page measures itself, so rows can stack on a phone wherever it's shown (a popup's box too).
  // A page sliding in never scrolls the screen sideways.
  ".cl-root{container-type:inline-size;max-width:100%;overflow-wrap:anywhere;overflow-x:clip}" +
  // Grid and flex items can always shrink; pictures, frames, tables and fields never pass their box.
  ":where(.cl-root) :where(*){min-width:0}:where(.cl-root) :where(img,video,iframe,svg,canvas,picture,table,input,select,textarea,button,pre,object,embed){max-width:100%}:where(.cl-root) pre{white-space:pre-wrap}.cl-root input:is([type=radio],[type=checkbox]){flex-shrink:0}" +
  // Taps of at least 44px: buttons, links that act as buttons and choices.
  `.cl-root :is(button,[type=submit],[type=button],[type=reset],[role=button],a.btn,a.btn-secondary,.cl-pick),.cl-root ${CHOICE}{min-height:44px!important}:where(.cl-root ${CHOICE}){display:inline-flex;align-items:center;gap:.5em}` +
  // One arrow on every dropdown.
  `.cl-root select:not([multiple],[size],.cl-native){appearance:none!important;-webkit-appearance:none!important;background-image:${ARROW}!important;background-repeat:no-repeat!important;background-position:right 14px center!important;background-size:14px 14px!important;padding-inline-end:38px!important}.cl-root[dir=rtl] select:not([multiple],[size],.cl-native){background-position:left 14px center!important}.cl-root .cl-pick{background-image:none!important}.cl-root :has(>select,>.cl-pick)::after,.cl-root :has(>select,>.cl-pick)::before{content:none!important}` +
  // Claritia's calendar fits its box from 320px up, whatever sizes the brand gave its cells.
  ".cl-root .cl-cal{max-width:100%;box-sizing:border-box}.cl-root .cl-cal .cl-days{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;max-width:100%!important}.cl-root .cl-cal .cl-days>*{flex:0 0 auto!important;max-width:none!important}.cl-root .cl-cal .cl-times{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;max-width:100%!important}.cl-root .cl-cal .cl-times>*{width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;min-height:44px!important;padding-inline:4px!important;box-sizing:border-box!important;white-space:normal!important}" +
  // On a phone: no text is cut off, and buttons and choices grow with their words.
  `@container (max-width:340px){.cl-root .cl-cal .cl-times{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@container (max-width:560px){.cl-root :is(h1,h2,h3,h4,h5,h6,p,label,legend,li,dt,dd,blockquote,figcaption){overflow:visible!important;text-overflow:clip!important;white-space:normal!important}.cl-root :is(button,a,span,strong,b,small,em,.btn,.btn-secondary):not(.cl-days *){white-space:normal!important;text-overflow:clip!important}.cl-root :is(button,.btn,.btn-secondary,${CHOICE}):not(.cl-days *){height:auto!important}}`;

const FIELDISH = /(\.field|\.input|\.cl-pick|(^|[\s>+~(,])(input|select|textarea)(?![\w-]))/i;
const CHOICEISH = /(\.choice|\.check|\.opt|\blabel\b|\.option|\.card)/i;
const NONE = /^\s*(none|0|0px|transparent)\s*(!important)?\s*$/i;
const RING = /^(border|border-color|border-width|border-bottom|border-bottom-color|border-block-end|border-block-end-color|box-shadow|outline|outline-color|background|background-color)$/;
/**
 * The page's own focus rules on fields and choice cards (a selector with :focus, or a label's :has(:focus) or
 * :focus-within, that draws a border, a shadow, an outline or a fill), each as the one rule that keeps it the only line:
 * the browser's outline goes, or, when the rule draws an outline of its own, that outline hugs the box with no gap.
 */
export function ownFocus(css: string): string[] {
  const out: string[] = [];
  eachRule(String(css ?? ""), (sel, d) => {
    if (!d.some(([k, v]) => RING.test(k) && !NONE.test(v))) return null;
    const outline = d.some(([k, v]) => /^outline(-style|-width)?$/.test(k) && !NONE.test(v));
    for (const s of splitSelectors(sel)) {
      if (!/:focus/.test(s) || /::|:root|:host|(^|[\s,(])(html|body)(?![\w-])/i.test(s)) continue;
      const choice = /:has\([^)]*:focus/.test(s) || /:focus-within/.test(s);
      if (choice ? CHOICEISH.test(s) : FIELDISH.test(s.replace(/:focus[\w-]*/g, ""))) out.push(`.cl-root :is(${s}){${outline ? "outline-offset:0!important" : "outline:none!important"}}`);
    }
    return null;
  });
  return [...new Set(out)];
}

/**
 * The guard as one page wears it, last of all: GUARD_CSS and one focus treatment for every field type. A field or a
 * choice card the page draws a focus for keeps only that one (ownFocus); any other gets one ring that hugs its box,
 * with no gap, in the brand's focus color. A choice's own radio or check box shows none: its card shows the ring.
 */
export function guardSheet(brand: string, css: string): string {
  const ring = "outline:2px solid var(--brand-focus,var(--brand-primary,currentColor))!important;outline-offset:0!important";
  return `${GUARD_CSS}:where(.cl-root :is(${TYPED}):focus-visible),:where(.cl-root ${CHOICE}:has(input:focus-visible)){${ring}}.cl-root label input:is([type=radio],[type=checkbox]):focus-visible{outline:none!important}${ownFocus(`${brand ?? ""}\n${css ?? ""}`).join("")}`;
}

// ── Embedded on another site: only the card shows (docs/studio-v2-plan.md Part 16) ─────────────────────────────

/** Claritia's own page for the form (/f/<id>, src/lib/forms/hosted.ts), outside a frame, and the app's previews. */
export const PAGE_LOOK = ":host([hosted]:not([framed]))";
/** The form in someone else's page: the inline embed, a popup, a slider, a frame. */
const EMBED_LOOK = [":host(:not([hosted]))", ":host([framed])"];
const ROOT = /^(:root|html|body)$/i;
// What a page's :root, html or body gives the text, kept wherever the form shows; the rest (background, padding,
// margins, heights, borders) paints a page, so it's kept for Claritia's own page only.
const CARRIES = /^(--|color$|color-scheme$|font|line-height$|letter-spacing$|word-spacing$|text-|-webkit-font-smoothing$|-moz-osx-font-smoothing$|direction$|accent-color$|caret-color$|tab-size$|hyphens$|quotes$)/;

/**
 * A stylesheet whose :root, html and body rules (the element's shadow turns them into its host) paint Claritia's own
 * page only: in someone else's page the host has no background, padding or margins of its own. Idempotent.
 */
export function hostRules(css: string): string {
  return eachRule(String(css ?? ""), (sel, d) => {
    const sels = splitSelectors(sel);
    if (!sels.some((s) => ROOT.test(s))) return null;
    const carry = d.filter(([k]) => CARRIES.test(k)), paint = d.filter(([k]) => !CARRIES.test(k));
    if (!paint.length) return null;
    const rest = sels.filter((s) => !ROOT.test(s));
    return `${rest.length ? `${rest.join(",")}{${declText(d)}}` : ""}${carry.length ? `:host{${declText(carry)}}` : ""}${PAGE_LOOK}{${declText(paint)}}`;
  });
}

const CLEAR = /^\s*(transparent|none|initial|inherit|unset|rgba\([^)]*,\s*0\))\s*(!important)?\s*$/i;
/** Whether the form sits in a card of its own color (.form-card or #card with a background) on its page. */
export function hasCard(css: string): boolean {
  let card = false;
  eachRule(String(css ?? ""), (sel, d) => {
    if (card || !splitSelectors(sel).some((s) => /(\.form-card|#card)(?![\w-])[^\s>+~]*$/.test(s) && !/:(hover|focus|active)|::/.test(s))) return null;
    const bg = d.find(([k]) => k === "background" || k === "background-color");
    if (bg && !CLEAR.test(bg[1])) card = true;
    return null;
  });
  return card;
}

/** In someone else's page, a form in a card shows the card only: the page around it is transparent, with no padding. */
export const embedSheet = (brand: string, css: string) =>
  hasCard(`${brand}\n${css}`) ? `${EMBED_LOOK.map((h) => `${h} .page`).join(",")}{background:transparent!important;padding:0!important;min-height:0!important;border:0!important;box-shadow:none!important}` : "";

const MARK = "/* claritia-guard */";
const unmarked = (css: string) => { const s = String(css ?? ""), i = s.indexOf(MARK); return i < 0 ? s : s.slice(0, i).trimEnd(); };

/**
 * A page as visitors get it: the brand's colors readable at the source, both stylesheets through the guard's rewrite,
 * the host painting Claritia's page only, and the guard's sheet last (marked, so guarding twice is guarding once).
 */
export function guardPage<P extends { brand: string; css: string }>(page: P): P {
  const brand = hostRules(guardCss(readableCssText(page.brand ?? "")));
  const css = hostRules(guardCss(readableCssText(unmarked(page.css), page.brand ?? "")));
  return { ...page, brand, css: `${css}\n${MARK}\n${embedSheet(brand, css)}${guardSheet(brand, css)}` };
}

/** A form as visitors get it: a studio page guarded (guardPage); any other form as it is. */
export function servedForm<F extends Pick<Form, "page">>(form: F): F {
  return form?.page && typeof form.page.css === "string" ? { ...form, page: guardPage(form.page) } : form;
}
