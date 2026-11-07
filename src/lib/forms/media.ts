// Photos on forms (docs/forms-media-plan.md): the welcome screen's, a page's and the end screen's. A form only shows
// pictures from the workspace's library (the public "assets" bucket, src/app/api/assets/route.ts) or the starter
// photos the templates use (the website's /assets/form-photos/), so a page can't load trackers or someone else's
// files. Uploads come in three WebP widths beside the original; a photo names the widths it has. Browser and server.

/** Where the templates' starter photos are served: <name>.jpg with <name>-<width>.webp beside it. */
export const STARTER_PHOTOS = "https://tryclaritia.com/assets/form-photos/";
/** The widths an upload is made in, besides the original. */
export const PHOTO_WIDTHS = [640, 1280, 1920] as const;
/** Where a photo goes: beside the words (left or right), a band across the top, or behind the words. */
export const LAYOUTS = ["left", "right", "top", "behind"] as const;
export type Layout = (typeof LAYOUTS)[number];

const ASSET = /^\/storage\/v1\/object\/public\/assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;
const STARTER = /^[a-z0-9][a-z0-9-]{0,80}\.(jpg|webp)$/;

/** Whether a form may show this picture: an https address in the library or the starter photos, nothing else. */
export function mediaOk(raw: unknown): boolean {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 500) return false;
  if (t.startsWith(STARTER_PHOTOS)) return STARTER.test(t.slice(STARTER_PHOTOS.length));
  try {
    const u = new URL(t);
    return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && ASSET.test(u.pathname);
  } catch {
    return false;
  }
}

/** A layout a screen may take: pages take a side or the top; the welcome and end screens may also go behind. */
export function layoutOf(raw: unknown, page: boolean): Layout | null {
  const v = String(raw ?? "").trim() as Layout;
  if (!LAYOUTS.includes(v)) return null;
  return page && v === "behind" ? "top" : v;
}

/** The widths a photo has, from its data-cl-sizes ("640,1280,1920"); starter photos always have all three. */
export function widthsOf(url: string, raw: unknown): number[] {
  if (url.startsWith(STARTER_PHOTOS)) return [...PHOTO_WIDTHS];
  return String(raw ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n): n is (typeof PHOTO_WIDTHS)[number] => (PHOTO_WIDTHS as readonly number[]).includes(n));
}

/** The address of one width: the original's name with -<width>.webp. */
export const sizedUrl = (url: string, w: number) => url.replace(/\.(png|jpg|gif|webp)$/, `-${w}.webp`);

/** The picture's srcset, or "" when it has only its original. */
export const srcsetOf = (url: string, widths: number[]) => widths.map((w) => `${sizedUrl(url, w)} ${w}w`).join(", ");

/** The spot to keep in view, from data-cl-focus ("50,30": across and down, in percent); the middle by default. */
export function focusOf(raw: unknown): string {
  const m = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(String(raw ?? ""));
  if (!m) return "50% 50%";
  const c = (n: string) => Math.max(0, Math.min(100, Number(n)));
  return `${c(m[1]!)}% ${c(m[2]!)}%`;
}

/** A photo on a screen, as a form saves it. */
export type Photo = { url: string; alt: string; layout: Layout; focus?: string; sizes?: number[] };

/** A saved photo, cleaned: an allowed address, a layout the screen takes, short words, a focus and its widths. */
export function cleanPhoto(raw: unknown, page: boolean): Photo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const x = raw as Record<string, unknown>;
  const url = String(x.url ?? "").trim();
  const layout = layoutOf(x.layout, page);
  if (!mediaOk(url) || !layout) return undefined;
  const alt = String(x.alt ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  const focus = /^\d{1,3},\d{1,3}$/.test(String(x.focus ?? "")) ? String(x.focus) : undefined;
  const sizes = Array.isArray(x.sizes) ? widthsOf(url, x.sizes.join(",")) : [];
  return { url, alt, layout, ...(focus ? { focus } : {}), ...(sizes.length && !url.startsWith(STARTER_PHOTOS) ? { sizes } : {}) };
}

const attrEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** A photo as a studio page's attributes (src/lib/studio/runtime.ts draws them). */
export const photoAttrs = (p: Photo | undefined) =>
  p ? ` data-cl-media="${attrEsc(p.url)}" data-cl-layout="${p.layout}"${p.alt ? ` data-cl-alt="${attrEsc(p.alt)}"` : ""}${p.focus ? ` data-cl-focus="${p.focus}"` : ""}${p.sizes?.length ? ` data-cl-sizes="${p.sizes.join(",")}"` : ""}` : "";
