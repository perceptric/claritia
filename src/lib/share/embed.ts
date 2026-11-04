// The code a form or a meeting goes on a website with (Share, docs/sharing-plan.md): one script tag, then the
// <claritia-form> or <claritia-book> element in the mode picked. The element reads these attributes
// (src/lib/forms/element.ts, src/lib/meetings/bookElement.ts). Runs in the browser and on the server.

export type FormMode = "inline" | "full" | "popup" | "slider" | "popover" | "sidetab";
export type Opens = "click" | "10" | "30" | "exit";

export type FormEmbed = {
  mode: FormMode;
  /** Popup and slider: a click on the site's button, a number of seconds, or leaving the page. */
  opens?: Opens;
  /** Popup: small, medium or large. */
  size?: "s" | "m" | "l";
  /** Slider: which side it comes from. */
  side?: "left" | "right";
  /** The button text for a click (popup, slider) and the side tab's text. */
  text?: string;
  /** Popover: its icon and the short note beside it. */
  icon?: "chat" | "calendar" | "form" | "logo";
  note?: string;
  /** Popup, slider, popover: not again by itself for someone who sent it. */
  once?: boolean;
  /** Over the page on a phone: the whole screen (default), or as on a computer. */
  phoneFull?: boolean;
  /** In the page: a fixed width in pixels (it never grows past the space it's in), else it fills the space. */
  width?: number | null;
  /** In the page: a fixed height in pixels (the form scrolls inside it), else it fits the form. */
  height?: number | null;
};

export type MeetingMode = "inline" | "button" | "link";
export type MeetingEmbed = { mode: MeetingMode; text?: string; phoneFull?: boolean };

/** Text safe inside a double-quoted attribute or between tags. */
export const safe = (s: string, max = 60) =>
  s
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const scriptTag = (origin: string) => `<script src="${origin}/forms/v1.js" async></script>`;

const OVER = new Set<FormMode>(["popup", "slider", "popover", "sidetab"]);
/** Whether a mode shows over the page (so the phone setting applies). */
export const overPage = (m: FormMode) => OVER.has(m);

/** The attributes and the button a form needs for its mode. */
export function formEmbedCode(origin: string, formId: string, o: FormEmbed): string {
  const id = safe(formId, 80);
  const attrs: string[] = [`form-id="${id}"`];
  const opens = o.opens ?? "click";
  const popupAttr = opens === "click" ? "click" : opens === "exit" ? "exit" : `delay:${opens}`;
  let button = "";
  switch (o.mode) {
    case "full":
      attrs.push("full");
      break;
    case "popup":
      attrs.push(`popup="${popupAttr}"`, `size="${o.size ?? "m"}"`);
      break;
    case "slider":
      attrs.push(`slider="${o.side === "left" ? "left" : "right"}"`, `popup="${popupAttr}"`);
      break;
    case "popover":
      attrs.push("popover", `icon="${o.icon ?? "chat"}"`);
      if (o.note?.trim()) attrs.push(`note="${safe(o.note)}"`);
      break;
    case "sidetab":
      attrs.push(`side-tab="${safe(o.text || "Contact us", 40)}"`);
      break;
  }
  if ((o.mode === "popup" || o.mode === "slider") && opens === "click") button = `\n<button data-claritia-open="${id}">${safe(o.text || "Open the form")}</button>`;
  if (o.once && (o.mode === "popup" || o.mode === "slider") && opens !== "click") attrs.push("once");
  if (overPage(o.mode) && o.phoneFull === false) attrs.push(`mobile="keep"`);
  if (o.mode === "inline") {
    const px = (n: number | null | undefined, lo: number, hi: number) => (typeof n === "number" && Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : null);
    const w = px(o.width, 280, 2000);
    const h = px(o.height, 200, 4000);
    const style = [w ? `width:${w}px;max-width:100%` : "", h ? `height:${h}px;overflow:auto` : ""].filter(Boolean).join(";");
    if (style) attrs.push(`style="${style}"`);
  }
  return `${scriptTag(origin)}\n<claritia-form ${attrs.join(" ")}></claritia-form>${button}`;
}

/** A meeting type's calendar: in the page, a floating button, or the site's own link or button. `type` is "<workspace>/<type>". */
export function meetingEmbedCode(origin: string, type: string, o: MeetingEmbed): string {
  const t = safe(type, 120);
  const keep = o.phoneFull === false ? ` mobile="keep"` : "";
  if (o.mode === "button") return `${scriptTag(origin)}\n<claritia-book type="${t}" mode="button" text="${safe(o.text || "Book a meeting")}"${keep}></claritia-book>`;
  if (o.mode === "link") return `${scriptTag(origin)}\n<a href="#" data-claritia-book="${t}"${o.phoneFull === false ? ` data-mobile="keep"` : ""}>${safe(o.text || "Book a meeting")}</a>`;
  return `${scriptTag(origin)}\n<claritia-book type="${t}"></claritia-book>`;
}

/** The site builders Share has steps for. */
export type Plat = "webflow" | "wordpress" | "framer" | "squarespace" | "shopify" | "html";
export const PLATS: { v: Plat; l: string; domain?: string; how: string }[] = [
  { v: "webflow", l: "Webflow", domain: "webflow.com", how: "A Code Embed element" },
  { v: "wordpress", l: "WordPress", domain: "wordpress.org", how: "A Custom HTML block" },
  { v: "framer", l: "Framer", domain: "framer.com", how: "An Embed, set to HTML" },
  { v: "squarespace", l: "Squarespace", domain: "squarespace.com", how: "An Embed block" },
  { v: "shopify", l: "Shopify", domain: "shopify.com", how: "The page's HTML view" },
  { v: "html", l: "Any site", how: "The page's HTML" },
];

/**
 * How to put the code on a site in each builder, step by step. `over`: the code shows over the page (a popup, slider,
 * popover, side tab or floating button), so it goes in the site's footer code where the builder has one.
 */
export function embedSteps(p: Plat, over: boolean): string[] {
  switch (p) {
    case "webflow":
      return over
        ? ["Open Site settings, then Custom code.", "Paste the code in Footer code (Before </body> tag).", "Click Save, then publish the site."]
        : ["Open the page in the Webflow Designer.", "Open the Add panel and drag a Code Embed element to where the form goes.", "Paste the code, then click Save and close.", "Publish the site. The form shows on the published site."];
    case "wordpress":
      return [over ? "Open any page in the WordPress editor." : "Open the page in the WordPress editor.", over ? "Click + at the end of the page and add a Custom HTML block." : "Click + where the form goes and add a Custom HTML block.", "Paste the code.", "Click Update or Publish."];
    case "framer":
      return over
        ? ["Open Site settings, then General, then Custom code.", "Paste the code in End of <body> tag.", "Click Save, then publish the site."]
        : ["Open the page in Framer.", "Click Insert, search for Embed and drag it to where the form goes.", "In the right panel, set the type to HTML and paste the code.", "Set its width to Fill, or a fixed width of 600 or more.", "Set its height to Fit, or a fixed height tall enough for the whole form.", "Publish the site."];
    case "squarespace":
      return over
        ? ["Open Settings, then Advanced, then Code injection.", "Paste the code in Footer.", "Click Save. Code injection needs the Business plan or higher."]
        : ["Edit the page and click Add block where the form goes.", "Search for Embed and add it.", "Open the Code snippet tab, click Embed data and paste the code.", "Click Save, then preview the page."];
    case "shopify":
      return over
        ? ["In Shopify, go to Online Store, then Themes.", "Click … next to your theme, then Edit code, and open theme.liquid.", "Paste the code just before </body>.", "Click Save. It shows on every page of your store."]
        : ["In Shopify, go to Online Store, then Pages, and open the page.", "Click the </> button to see the page's HTML.", "Paste the code where the form goes.", "Click Save."];
    default:
      return over
        ? ["Open your site's HTML.", "Paste the code just before </body>. Put it in your shared footer to show it on every page.", "Save and publish."]
        : ["Open the page's HTML.", "Paste the code where the form should show.", "Save and publish."];
  }
}

/** A Studio page's code in one block to paste into a page: the brand's stylesheet, then the form's, then its HTML. */
export function pageHtmlCss(p: { html: string; css: string; brand: string }): string {
  return `<style>\n${p.brand.trim()}\n\n${p.css.trim()}\n</style>\n${p.html.trim()}\n`;
}
