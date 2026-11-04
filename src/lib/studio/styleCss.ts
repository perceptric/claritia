// A gallery style (src/lib/forms/gallery/themes.ts) as a Form Studio stylesheet: the same --brand-* variables and
// classes a brand's own stylesheet has (src/lib/studio/prompts.ts BRAND_RULES), drawn the way the website's template
// pages draw that style (claritia-site assets/forms.css), so a template used in a style looks the same in the app and
// on the form's page. Made by code, never by Claude. The first line names the style, so the Studio knows it again.

import { artBg, FONTS, fontsUrl, isTheme, themeById, type Theme } from "../forms/gallery/themes.ts";

/** Where the style drawings are served (the website's copy of themeArt); a stylesheet may only link https pictures. */
export const STYLE_ART = "https://tryclaritia.com/assets/form-art";

const MARK = /^\s*\/\* claritia-style: ([a-z]+) \*\//;

/** The style a stylesheet was made from, or null for a brand's own (or edited-away) stylesheet. */
export function styleOf(css: string | null | undefined): string | null {
  const m = MARK.exec(String(css ?? ""));
  return m && isTheme(m[1]) ? m[1]! : null;
}

/** The style's name as the Studio and the template sheet show it. */
export const styleName = (id: string) => `${themeById(id).name} style`;

/** A style's stylesheet, by its id (the template's own style when the id isn't one). */
export const styleCssById = (id: string | null | undefined) => styleCss(themeById(id));

export function styleCss(th: Theme): string {
  const px = (n: number) => `${n}px`;
  const pattern =
    th.pattern === "dots"
      ? `background-image:radial-gradient(circle,${th.patternColor} 1.2px,transparent 1.2px);background-size:18px 18px;`
      : th.pattern === "grid"
        ? `background-image:linear-gradient(${th.patternColor} 1px,transparent 1px),linear-gradient(90deg,${th.patternColor} 1px,transparent 1px);background-size:28px 28px;`
        : "";
  const hard = th.shadow === "hard";
  const cardShadow = hard ? `6px 6px 0 ${th.text}` : th.shadow === "soft" ? "0 24px 48px -28px rgb(10 10 10 / .35),0 2px 6px rgb(10 10 10 / .05)" : "none";
  const art = th.art ? `url("${STYLE_ART}/${th.id}.svg")` : "";
  const plain = th.layout === "plain";
  const out: string[] = [
    `/* claritia-style: ${th.id} */`,
    `@import url("${fontsUrl([th.font, th.head])}");`,
    `:root{--brand-primary:${th.accent};--brand-on-primary:${th.accentInk};--brand-text:${th.text};--brand-muted:${th.muted};--brand-faint:${th.faint};--brand-bg:${th.bg};--brand-surface:${th.card};--brand-field:${th.field};--brand-line:${th.border};--brand-hover:${th.hover};--brand-soft:${th.soft};--brand-focus:${th.accent};--brand-font:${FONTS[th.font].css};--brand-head:${FONTS[th.head].css};--brand-radius:${px(th.radius)};--brand-btn-radius:${px(th.btnRadius)};--brand-card-radius:${px(th.cardRadius)};--brand-bw:${px(th.bw)}${th.dark ? ";color-scheme:dark" : ""}}`,
    // The stage: the style's color (and dots or grid) around the card.
    `.page.page{font-family:var(--brand-font);color:var(--brand-text);background-color:var(--brand-bg);${pattern}padding:clamp(20px,6cqi,48px) clamp(14px,5cqi,40px);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased;container-type:inline-size}`,
    `.page .form-card{--card-pad:clamp(22px,5cqi,40px);position:relative;overflow:hidden;max-width:${th.layout === "split" ? 880 : 680}px;gap:24px;padding:var(--card-pad);background:var(--brand-surface);border:var(--brand-bw) solid var(--brand-line);border-radius:var(--brand-card-radius);box-shadow:${cardShadow};box-sizing:border-box}`,
    plain ? `.page .form-card{background:transparent;border-color:transparent;box-shadow:none;padding-inline:4px}` : "",
    // The drawing: a band across the top (cover), or a panel beside the form (split) once there's room.
    art && (th.layout === "cover" || th.layout === "split")
      ? `.page .form-card::before{content:"";display:block;height:140px;margin:calc(var(--card-pad) * -1) calc(var(--card-pad) * -1) 0;background:${artBg(th)} ${art} center/cover no-repeat;${th.layout === "cover" ? "border-bottom:var(--brand-bw) solid var(--brand-line)" : ""}}`
      : "",
    art && th.layout === "split"
      ? `@container (min-width:760px){.page .form-card{--art:clamp(220px,34cqi,330px);padding-left:calc(var(--art) + var(--card-pad))}.page .form-card::before{position:absolute;inset:0 auto 0 0;width:var(--art);height:auto;margin:0;background:${artBg(th)} ${art} center top/100% auto no-repeat}}`
      : "",
    `.page .logo{height:28px;width:auto;max-width:140px;object-fit:contain;object-position:left center}`,
    // Words.
    `.heading{font-family:var(--brand-head);font-weight:${th.headWeight};font-style:${th.headItalic ? "italic" : "normal"};letter-spacing:-.02em;line-height:1.12;color:var(--brand-text);margin:0}`,
    `h1.heading{font-size:${plain ? "clamp(34px,7cqi,46px);line-height:1.02" : "28px"}}h2.heading{font-size:20px}`,
    `[data-cl-step]>h2.heading{font-family:var(--brand-font);font-size:11.5px;font-weight:600;font-style:normal;letter-spacing:.08em;text-transform:uppercase;color:var(--brand-muted)}`,
    `[data-cl-thanks] h2.heading{font-size:26px;line-height:1.15}`,
    `.text{color:var(--brand-muted);font-size:15px;line-height:1.55;margin:0}.page .help{font-size:13px;opacity:1}`,
    `.label{display:block;font-size:14px;font-weight:500;color:var(--brand-text);padding:0}`,
    `.q:has(>.field[required])>.label::after,.q:has([required])>legend.label::after{content:" *";color:var(--brand-faint)}`,
    `.page .fields{gap:20px 14px}`,
    // Fields.
    `.field{box-sizing:border-box;width:100%;min-height:42px;padding:0 12px;border:var(--brand-bw) solid var(--brand-line);border-radius:var(--brand-radius);background:var(--brand-field);font:inherit;font-size:14px;color:var(--brand-text);outline:none;transition:border-color .15s,box-shadow .15s}`,
    `textarea.field{min-height:104px;padding:10px 12px;line-height:1.55;resize:vertical;border-radius:min(var(--brand-radius),16px)}`,
    `.field::placeholder{color:var(--brand-faint)}.field:hover{border-color:var(--brand-hover)}.field:focus{border-color:var(--brand-primary);box-shadow:0 0 0 1px var(--brand-primary)}`,
    th.input === "fill" ? `.field{border-color:transparent}.field:hover{border-color:var(--brand-hover)}` : "",
    th.input === "line"
      ? `.field{padding-inline:0;border-width:0 0 var(--brand-bw);border-radius:0;background:transparent}.field:focus{box-shadow:0 1px 0 var(--brand-primary)}textarea.field{border-width:var(--brand-bw);padding-inline:12px}`
      : "",
    hard && th.input === "box" ? `.field{box-shadow:3px 3px 0 var(--brand-text)}.field:focus{box-shadow:3px 3px 0 var(--brand-primary)}` : "",
    // Choices.
    `.page .choices{display:grid;gap:8px}`,
    `.choice{position:relative;display:flex;align-items:center;gap:10px;min-height:42px;padding:8px 12px;box-sizing:border-box;border:var(--brand-bw) solid var(--brand-line);border-radius:var(--brand-radius);background:var(--brand-field);font-size:14px;color:var(--brand-text);cursor:pointer;transition:border-color .15s,background-color .15s}`,
    `.choice:hover{border-color:var(--brand-hover)}.choice:has(input:checked){border-color:var(--brand-primary);background:var(--brand-soft)}`,
    th.input === "fill" ? `.choice{border-color:transparent}` : "",
    th.input === "line" ? `.choice{border-radius:0}` : "",
    hard ? `.choice{box-shadow:3px 3px 0 var(--brand-text)}` : "",
    `.check{display:flex;align-items:flex-start;gap:10px;font-size:14px;color:var(--brand-text);cursor:pointer}`,
    `.choice input,.check input{flex-shrink:0;width:16px;height:16px;margin:0;accent-color:var(--brand-primary)}.check input{margin-top:2px}`,
    // Buttons.
    `.btn,.btn-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 22px;border:var(--brand-bw) solid var(--brand-primary);border-radius:var(--brand-btn-radius);font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;transition:opacity .15s,transform .2s}`,
    `.btn{background:var(--brand-primary);color:var(--brand-on-primary)}.btn-secondary{border-color:var(--brand-line);background:transparent;color:var(--brand-text)}`,
    `.btn:hover,.btn-secondary:hover{opacity:.88}.btn:active,.btn-secondary:active{transform:scale(.97)}`,
    hard ? `.btn{box-shadow:3px 3px 0 var(--brand-text)}` : "",
    `.page .nav{justify-content:flex-start;gap:8px}.page .nav [data-cl-back]{margin-inline-end:0}`,
    // The rest: progress, cards, links, totals.
    `.page .bar{background:var(--brand-soft);border-radius:999px}.page .bar i{border-radius:999px;background:var(--brand-primary)}`,
    `.card{padding:16px;border:1px solid var(--brand-line);border-radius:min(var(--brand-radius),12px);background:var(--brand-soft)}`,
    `.link{color:var(--brand-text);text-decoration:underline;text-underline-offset:3px}`,
    `.cl-calc,.cl-pay{padding:14px 16px;border:var(--brand-bw) solid var(--brand-line);border-radius:min(var(--brand-radius),14px);background:var(--brand-soft)}`,
    `@media (prefers-reduced-motion:reduce){.field,.choice,.btn,.btn-secondary{transition:none}}`,
  ];
  return out.filter(Boolean).join("\n");
}
