// The guard (docs/studio-v2-plan.md Part 16): what every studio page wears last, after the brand's CSS and the form's
// own, wherever it shows (the Studio's canvas, the form check's hidden render, the published page, the embed and every
// preview), so whatever Tia or a template wrote can't scroll sideways, cut text off, shrink a tap below a finger, hide
// a choice from the keyboard or draw two arrows on a dropdown. Two parts: GUARD_CSS here, a stylesheet that loads last
// (the form script carries it, src/lib/forms/element.ts, so it stays small), and guardCss() (guardCss.ts), which
// rewrites what a stylesheet can't undo from outside. Made by code, never by a model.

// One arrow on every dropdown: the browser's is turned off and this one drawn (the form's own dropdowns draw theirs).
const ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 6l4 4 4-4' fill='none' stroke='gray' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
const CHOICE = "label:has(input:is([type=radio],[type=checkbox]))";

export const GUARD_CSS =
  // The page measures itself, so rows can stack on a phone wherever it's shown.
  // A page sliding in never scrolls the screen sideways.
  ":host{container-type:inline-size}.cl-root{max-width:100%;overflow-wrap:anywhere;overflow-x:clip}" +
  // Grid and flex items can always shrink; pictures, frames, tables and fields never pass their box.
  ":where(.cl-root) :where(*){min-width:0}:where(.cl-root) :where(img,video,iframe,svg,canvas,picture,table,input,select,textarea,button,pre,object,embed){max-width:100%}:where(.cl-root) pre{white-space:pre-wrap}.cl-root input:is([type=radio],[type=checkbox]){flex-shrink:0}" +
  // Taps of at least 44px: buttons, links that act as buttons and choices.
  `.cl-root :is(button,[type=submit],[type=button],[type=reset],[role=button],a.btn,a.btn-secondary,.cl-pick),.cl-root ${CHOICE}{min-height:44px!important}:where(.cl-root ${CHOICE}){display:inline-flex;align-items:center;gap:.5em}` +
  // The keyboard reaches every choice, and the choice card shows where it is.
  `.cl-root ${CHOICE}:has(input:focus-visible){outline:2px solid currentColor;outline-offset:2px}` +
  // One arrow on every dropdown.
  `.cl-root select:not([multiple]):not([size]){appearance:none!important;-webkit-appearance:none!important;background-image:${ARROW}!important;background-repeat:no-repeat!important;background-position:right 14px center!important;background-size:14px 14px!important;padding-inline-end:38px!important}.cl-root[dir=rtl] select:not([multiple]):not([size]){background-position:left 14px center!important}.cl-root select::-ms-expand{display:none}.cl-root .cl-pick{background-image:none!important}.cl-root :has(>select,>.cl-pick)::after,.cl-root :has(>select,>.cl-pick)::before{content:none!important}` +
  // Claritia's calendar fits its box from 320px up, whatever sizes the brand gave its cells.
  ".cl-root .cl-cal{max-width:100%;box-sizing:border-box}.cl-root .cl-cal .cl-days{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;max-width:100%!important}.cl-root .cl-cal .cl-days>*{flex:0 0 auto!important;max-width:none!important}.cl-root .cl-cal .cl-times{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;max-width:100%!important}.cl-root .cl-cal .cl-times>*{width:100%!important;min-width:0!important;max-width:100%!important;height:auto!important;min-height:44px!important;padding-inline:4px!important;box-sizing:border-box!important;white-space:normal!important}" +
  // On a phone: no text is cut off, and buttons and choices grow with their words.
  `@container (max-width:340px){.cl-root .cl-cal .cl-times{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@container (max-width:560px){.cl-root :is(h1,h2,h3,h4,h5,h6,p,label,legend,li,dt,dd,blockquote,figcaption){overflow:visible!important;text-overflow:clip!important;white-space:normal!important}.cl-root :is(button,a,span,strong,b,small,em,.btn,.btn-secondary):not(.cl-days *){white-space:normal!important;text-overflow:clip!important}.cl-root :is(button,.btn,.btn-secondary,${CHOICE}):not(.cl-days *){height:auto!important}}`;
