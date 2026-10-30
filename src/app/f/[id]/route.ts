import { hostedFormHtml } from "@/lib/forms/hosted";
import { formsScriptPath } from "@/lib/forms/script";

// A form on its own page (docs/form-builder.md Part 6): plain HTML with <claritia-form> and its script, so the page
// ships the form script alone (src/lib/forms/hosted.ts).

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const framed = new URL(request.url).searchParams.has("c");
  const html = hostedFormHtml(id, { framed, script: await formsScriptPath() });
  return new Response(html, {
    status: /^[0-9a-f-]{36}$/.test(id) ? 200 : 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "x-robots-tag": "noindex" },
  });
}
