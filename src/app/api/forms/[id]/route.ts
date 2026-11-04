import { after } from "next/server";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import { regionOf } from "@/lib/web/policy";
import { publicForm } from "@/lib/forms/schema";
import { cors, edgeCountry, forgetPublic, json, loadPublic, turnstileSiteKey } from "@/lib/forms/server";
import { serviceClient } from "@/lib/serviceClient";
import { persistStudio } from "@/lib/studio/persist";

// The live version of a form, for <claritia-form> on any site (docs/form-builder.md Part 6). Public: answers only
// with what the form shows, plus whether the consent box applies to this visitor, and the region lists when a
// dropdown follows a country field (docs/forms-plan.md 2.2). Every form is a Form Studio page that wears its own
// stylesheet: a version from before the Studio is turned into one as it's read, and kept as one for good after the
// answer goes out (src/lib/studio/persist.ts).

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Forms this server is already keeping as pages, so a busy form starts it once. */
const keeping = new Set<string>();

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  try {
    const f = await loadPublic(db, id);
    if (!f) return json({ error: "Form not found." }, 404);
    if (f.older && !keeping.has(id)) {
      keeping.add(id);
      after(async () => {
        const r = await persistStudio(db, id);
        if (r.error) console.error(`forms: ${id} couldn't be kept as a Studio page: ${r.error}`);
        if (r.live) forgetPublic(id);
        if (!r.live) keeping.delete(id);
      });
    }
    const country = edgeCountry(request);
    return json(
      // tokens: always empty, only so a form script cached from before 123 (5 minutes at most) doesn't stop on it.
      { id: f.id, version: f.version, status: f.status, body: publicForm(f.body), tokens: {}, logo_url: f.logo_url, strict: regionOf(country ?? "", "") === "strict", turnstile: turnstileSiteKey() || undefined, ...(usesRegions(f.body) ? { regions: allRegions() } : {}) },
      200,
      { "Cache-Control": "public, max-age=30", Vary: "cf-ipcountry" },
    );
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
