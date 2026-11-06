import { appBase } from "@/lib/billing";
import { isMember } from "@/lib/contacts/server";
import { googleError, googleFormId, importGoogleForm, type GoogleForm } from "@/lib/forms/googleImport";
import { deps } from "@/lib/sources/run";
import { oauthReady, oauthUrl } from "@/lib/sources/oauth";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { DEFAULT_BRAND_CSS } from "@/lib/studio/brandDefault";

// Import a Google Form (docs/integrations-plan.md, Next step 13): POST { workspaceId, link }. With the workspace's
// Google Forms sign-in, answers the form as a Studio page { name, html, css, brand, notes }, which the Forms page
// saves the way a new form is saved (/api/studio, mode save). Without one, answers { signIn } to sign in first.

const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = ((await request.json().catch(() => null)) ?? {}) as { workspaceId?: unknown; link?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const link = String(b.link ?? "");
  const id = googleFormId(link);
  if (!id) return bad(/\/forms\/d\/e\//.test(link) ? "That's the link people fill in. Paste the link from the form's edit page (docs.google.com/forms/d/…/edit)." : "Paste the Google Form's link.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: src } = await db.from("sources").select("id").eq("workspace_id", ws).eq("kind", "google_forms").neq("status", "disconnected").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const signIn = () =>
    oauthReady("google_forms")
      ? Response.json({ signIn: oauthUrl("google_forms", `${appBase()}/api/forms/google-import/callback`, { ws, user: auth.user.id, kind: "google_forms" }) })
      : bad("Google sign-in isn't set up yet.", 503);
  if (!src) return signIn();
  const d = await deps({ rpc: (fn, args) => db.rpc(fn, args), clean: async () => ({ custom: [] }), signal: AbortSignal.timeout(20_000) }, (src as { id: string }).id);
  if (!d) return signIn();
  try {
    const form = await d.ctx.api<GoogleForm>(`https://forms.googleapis.com/v1/forms/${encodeURIComponent(id)}`);
    return Response.json({ ...importGoogleForm(form), brand: DEFAULT_BRAND_CSS }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 0;
    // A sign-in Google turned down (no status: the sign-in error): sign in again.
    if (!status && /sign in again/i.test((e as Error).message)) return signIn();
    return bad(googleError(status || 502, (e as Error).message), status === 403 || status === 404 ? 400 : 502);
  }
}
