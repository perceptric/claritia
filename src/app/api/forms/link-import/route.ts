import { isMember } from "@/lib/contacts/server";
import { allowed, clientIp } from "@/lib/forms/server";
import { formLink, importTally, importTypeform, tallyFromHtml, tallyUrl, typeformUrl, type TypeformForm } from "@/lib/forms/linkImport";
import { requireUser } from "@/lib/serverAuth";
import { DEFAULT_BRAND_CSS } from "@/lib/studio/brandDefault";

// Import a Typeform or a Tally form from its link (docs/integrations-plan.md, "Import from Typeform and Tally"):
// POST { workspaceId, link }. Answers the form as a Studio page { name, html, css, brand, notes, questions }, which the
// Forms page saves the way a new form is saved (/api/studio, mode save). No sign-in: both serve a published form's
// questions to anyone who opens it. Google Forms links go to /api/forms/google-import.

const bad = (error: string, status = 400) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
const MAX = 5_000_000;

async function read(url: string, accept: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { headers: { accept, "user-agent": "Claritia form import (+https://tryclaritia.com)" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  return { status: res.status, text: text.length > MAX ? "" : text };
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  if (!allowed(`link-import:${clientIp(request)}`, 20)) return bad("Too many imports at once. Wait a minute.", 429);
  const b = ((await request.json().catch(() => null)) ?? {}) as { workspaceId?: unknown; link?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const found = formLink(String(b.link ?? ""));
  if (!found || found.tool === "google") return bad("Paste a Typeform or Tally form's link.");
  try {
    if (found.tool === "typeform") {
      const r = await read(typeformUrl(found.id), "application/json");
      if (r.status === 404) return bad("That Typeform isn't there, or it isn't published. Publish it, then paste its link.");
      if (r.status !== 200) return bad(`Typeform answered ${r.status}. Try again in a moment.`, 502);
      let form: TypeformForm;
      try {
        form = JSON.parse(r.text) as TypeformForm;
      } catch {
        return bad("Typeform's answer couldn't be read. Try again in a moment.", 502);
      }
      if (!Array.isArray(form.fields) || !form.fields.length) return bad("That Typeform has no questions to import.");
      return Response.json({ ...importTypeform(form), brand: DEFAULT_BRAND_CSS }, { headers: { "cache-control": "no-store" } });
    }
    const r = await read(tallyUrl(found.id), "text/html");
    if (r.status === 404) return bad("That Tally form isn't there, or it isn't published. Publish it, then paste its link.");
    if (r.status !== 200) return bad(`Tally answered ${r.status}. Try again in a moment.`, 502);
    const page = tallyFromHtml(r.text);
    if (!page?.blocks?.length) return bad("That Tally form couldn't be read. Paste the link people fill in (tally.so/r/…).");
    const out = importTally(page);
    if (!out.questions) return bad("That Tally form has no questions to import.");
    return Response.json({ ...out, brand: DEFAULT_BRAND_CSS }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const timedOut = (e as Error)?.name === "TimeoutError";
    return bad(timedOut ? `${found.tool === "tally" ? "Tally" : "Typeform"} took too long to answer. Try again.` : "Couldn't reach the form. Try again in a moment.", 502);
  }
}
