import { after } from "next/server";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import { regionOf } from "@/lib/web/policy";
import { accessShut, closedMessage } from "@/lib/forms/access";
import { cors, edgeCountry, forgetPublic, json, loadPublic, turnstileSiteKey } from "@/lib/forms/server";
import { emailCodesReady, smsCodesReady } from "@/lib/forms/codes";
import { allFields, publicForm, type Form } from "@/lib/forms/schema";

/** What the form's fields need from the server's services: the map key and which codes can be sent. */
function formServices(body: Form): { map?: string; codes?: { email?: boolean; sms?: boolean } } {
  const fs = allFields(body);
  const map = process.env.MAPBOX_TOKEN?.trim();
  const needsMap = fs.some((f) => (f.type === "address" && f.auto) || f.ui === "map" || f.ui === "location");
  const email = fs.some((f) => f.verify && f.type === "email") && emailCodesReady();
  const sms = fs.some((f) => f.verify && f.type === "phone") && smsCodesReady();
  return { ...(needsMap && map?.startsWith("pk.") ? { map } : {}), ...(email || sms ? { codes: { ...(email ? { email } : {}), ...(sms ? { sms } : {}) } } : {}) };
}
import { serviceClient } from "@/lib/serviceClient";
import { persistStudio } from "@/lib/studio/persist";
import { knownFor } from "@/lib/share/known";
import { readPersonal } from "@/lib/share/personal";

// The live version of a form, for <claritia-form> on any site (docs/form-builder.md Part 6). Public: answers only
// with what the form shows, plus whether the consent box applies to this visitor, and the region lists when a
// dropdown follows a country field (docs/forms-plan.md 2.2). Every form is a Form Studio page that wears its own
// stylesheet: a version from before the Studio is turned into one as it's read, and kept as one for good after the
// answer goes out (src/lib/studio/persist.ts). A personal link (?p=, src/lib/share/personal.ts) also gets the details
// Claritia knows about its person, for the contact questions the form asks; that answer is never cached.

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
    // Settings › Access: shut by its dates or its limit, the form shows as closed with its closed message.
    const shut = f.status === "live" && (await accessShut(f.body, Date.now(), () => Promise.resolve(db.rpc("form_fill_count", { p_form: f.id, p_filters: {} })).then((r) => (r.error ? null : Number(r.data)))));
    const status = shut ? "paused" : f.status;
    const closed = status === "paused" ? closedMessage(f.body) : undefined;
    const country = edgeCountry(request);
    const token = new URL(request.url).searchParams.get("p");
    const person = token ? readPersonal(token, process.env.SECRETS_KEY, f.workspace_id) : null;
    const known = person ? await knownFor(db, person, f.body).catch(() => ({})) : null;
    return json(
      // tokens: always empty, only so a form script cached from before 123 (5 minutes at most) doesn't stop on it.
      { id: f.id, version: f.version, status, ...(closed ? { closed } : {}), body: publicForm(f.body), tokens: {}, logo_url: f.logo_url, strict: regionOf(country ?? "", "") === "strict", turnstile: turnstileSiteKey() || undefined, ...formServices(f.body), ...(usesRegions(f.body) ? { regions: allRegions() } : {}), ...(known ? { known } : {}) },
      200,
      token ? { "Cache-Control": "private, no-store" } : { "Cache-Control": `public, max-age=${f.body.access ? 10 : 30}`, Vary: "cf-ipcountry" },
    );
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
