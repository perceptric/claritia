import { formCss } from "@/lib/design/form";
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

/** The design system's CSS for the form, checked and compiled here so the form script only places it. */
function cssOf(f: { body: Parameters<typeof formCss>[0]; tokens: Parameters<typeof formCss>[1]; design?: unknown }) {
  try {
    const css = formCss(f.body, f.tokens, f.design);
    return css ? { css } : {};
  } catch {
    // A design that can't compile never stops the form from loading; it shows with its kit's tokens.
    return {};
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
