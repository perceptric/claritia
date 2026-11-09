import { after } from "next/server";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import { regionOf } from "@/lib/contacts/region";
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
import { brandPlan } from "@/lib/meetings/brandPage";
import { formBadge } from "@/lib/plans";

// The live version of a form, for <claritia-form> on any site (docs/form-builder.md Part 6). Public: answers only
// with what the form shows, plus whether the consent box applies to this visitor, and the region lists when a
// dropdown follows a country field (docs/forms-plan.md 2.2). Every form is a Form Studio page that wears its own
// stylesheet: a version from before the Studio is turned into one as it's read, and kept as one for good after the
// answer goes out (src/lib/studio/persist.ts). A personal link (?p=, src/lib/share/personal.ts) also gets the details
// Claritia knows about its person, for the contact questions the form asks; that answer is never cached.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Forms this server is already keeping as pages, so a busy form starts it once. */
const keeping = new Set<string>();

/**
 * What the plan changes on the live form, kept a minute: whether the booking calendar wears the form's style (paid
 * plans; Free gets the plain calendar) and the Claritia badge (full on Free, small on Starter, none from Pro).
 */
type PlanLook = { calBrand: boolean; badge: "full" | "small" | "none" };
const planCache = new Map<string, { at: number; look: PlanLook }>();
async function planLook(db: NonNullable<ReturnType<typeof serviceClient>>, ws: string): Promise<PlanLook> {
  const hit = planCache.get(ws);
  if (hit && Date.now() - hit.at < 60_000) return hit.look;
  const r = await db.from("workspace_billing").select("plan").eq("workspace_id", ws).maybeSingle();
  // A plan that can't be read keeps the form's style and shows no badge, and isn't kept.
  if (r.error) return { calBrand: true, badge: "none" };
  const plan = (r.data as { plan?: string } | null)?.plan ?? "free";
  const look: PlanLook = { calBrand: brandPlan(plan), badge: formBadge(plan) };
  if (planCache.size > 5000) planCache.clear();
  planCache.set(ws, { at: Date.now(), look });
  return look;
}

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
    const { calBrand, badge } = await planLook(db, f.workspace_id);
    return json(
      // tokens: always empty, only so a form script cached from before 123 (5 minutes at most) doesn't stop on it.
      { id: f.id, version: f.version, status, ...(closed ? { closed } : {}), body: publicForm(f.body), tokens: {}, logo_url: f.logo_url, strict: regionOf(country ?? "", "") === "strict", turnstile: turnstileSiteKey() || undefined, ...formServices(f.body), ...(usesRegions(f.body) ? { regions: allRegions() } : {}), ...(known ? { known } : {}), calBrand, badge },
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
