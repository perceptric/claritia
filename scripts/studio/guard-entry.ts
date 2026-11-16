// The page side of scripts/guard-check.ts: the Studio's tune (templates-entry.ts) and the form check's measure of the
// live <claritia-form> on the page, as a visitor gets it.
import "./templates-entry.ts";
import { measureWidth, type Found } from "../../src/lib/studio/measure.ts";
import { allowedFonts } from "../../src/lib/studio/readable.ts";

(window as unknown as { measureLive: (brand: string, css: string) => Found[] }).measureLive = (brand, css) => {
  const host = document.querySelector("claritia-form")!;
  const root = host.shadowRoot!.querySelector(".cl-root") as HTMLElement;
  const out: Found[] = [];
  measureWidth(document.documentElement, root, window.innerWidth, { fonts: allowedFonts(brand, css), out, rules: new Map() });
  return out;
};
