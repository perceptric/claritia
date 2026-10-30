import { designFonts, formCss } from "@/lib/design/form";
import { fontUrl } from "@/components/app/forms/editorModel";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import { regionOf } from "@/lib/web/policy";
import { cors, edgeCountry, json, loadPublic, turnstileSiteKey } from "@/lib/forms/server";
import { serviceClient } from "@/lib/serviceClient";

// The live version of a form, for <claritia-form> on any site (docs/form-builder.md Part 6). Public: answers only
// with what the form shows, plus whether the consent box applies to this visitor, and the region lists when a
// dropdown follows a country field (docs/forms-plan.md 2.2).

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  try {
    const f = await loadPublic(db, id);
    if (!f) return json({ error: "Form not found." }, 404);
    const country = edgeCountry(request);
    return json(
      { id: f.id, version: f.version, status: f.status, body: f.body, tokens: f.tokens, logo_url: f.logo_url, strict: regionOf(country ?? "", "") === "strict", turnstile: turnstileSiteKey() || undefined, ...(usesRegions(f.body) ? { regions: allRegions() } : {}), ...cssOf(f) },
      200,
      { "Cache-Control": "public, max-age=30", Vary: "cf-ipcountry" },
    );
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

type Css = { css?: string; fonts?: string[] };
type Live = { id: string; version: number; body: Parameters<typeof formCss>[0]; tokens: Parameters<typeof formCss>[1]; design?: unknown };

// Compiled once per form version and kit look: by the cached form itself, then by id, version and the kit's tokens
// and design (a kit change compiles again).
const byForm = new WeakMap<object, Css>();
const byVersion = new Map<string, { look: string; out: Css }>();

function cssOf(f: Live): Css {
  const hit = byForm.get(f);
  if (hit) return hit;
  const key = `${f.id}:${f.version}`;
  const look = JSON.stringify([f.tokens ?? null, f.design ?? null]);
  const kept = byVersion.get(key);
  const out = kept && kept.look === look ? kept.out : compiled(f);
  if (byVersion.size > 2000) byVersion.clear();
  byVersion.set(key, { look, out });
  byForm.set(f, out);
  return out;
}

/** The design system's CSS for the form, checked and compiled here so the form script only places it. */
function compiled(f: Live): Css {
  try {
    const css = formCss(f.body, f.tokens, f.design);
    if (!css) return {};
    const fonts = fontUrl(designFonts(f.design, f.body.design));
    return { css, ...(fonts ? { fonts: [fonts] } : {}) };
  } catch {
    // A design that can't compile never stops the form from loading; it shows with its kit's tokens.
    return {};
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
