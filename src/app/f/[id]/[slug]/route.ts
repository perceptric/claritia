import { hostedFormHtml } from "@/lib/forms/hosted";
import { formsScriptPath } from "@/lib/forms/script";
import { serviceClient } from "@/lib/serviceClient";
import { formPage } from "@/lib/forms/formPage";

// A form by its link ending: /f/<workspace>/<ending> (supabase/migrations/117_form_links.sql). An old ending within its
// 90 days redirects to the current link; one that opens no form is a plain "Form not found" page.

const PART = /^[a-z0-9][a-z0-9-]{0,49}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; slug: string }> }) {
  const { id: ws, slug } = await params;
  const db = serviceClient();
  const missing = async () => new Response(hostedFormHtml("", { framed: false, script: await formsScriptPath() }), { status: 404, headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
  if (!db || !PART.test(ws) || !PART.test(slug)) return missing();
  const { data, error } = await db.rpc("form_by_slug", { p_ws: ws, p_slug: slug });
  const hit = !error && data && typeof data === "object" ? (data as { id: string; slug: string | null; moved?: boolean }) : null;
  if (!hit) return missing();
  const u = new URL(request.url);
  if (hit.moved) {
    // To the current ending, or to the id link once the form has none.
    const to = hit.slug ? `/f/${ws.toLowerCase()}/${hit.slug}` : `/f/${hit.id}`;
    return Response.redirect(new URL(`${to}${u.search}`, u.origin), 301);
  }
  return formPage(request, hit.id);
}
