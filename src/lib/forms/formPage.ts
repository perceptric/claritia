import "server-only";
import { hostedFormHtml, type PagePreview } from "./hosted.ts";
import { formsScriptPath } from "./script.ts";
import { loadPublic } from "./server.ts";
import { serviceClient } from "../serviceClient.ts";

// The hosted form page as a response (/f/<id> and /f/<workspace>/<ending>), with the link's preview from the live form
// (docs/sharing-plan.md). A form that can't be read still draws, with no preview.

const ID = /^[0-9a-f-]{36}$/;

/** The live form's link preview, or none when it can't be read. */
export async function previewOf(id: string, url: string): Promise<PagePreview | undefined> {
  const db = serviceClient();
  if (!db || !ID.test(id)) return undefined;
  const f = await loadPublic(db, id).catch(() => null);
  if (!f) return undefined;
  const s = f.body.share;
  const title = s?.title || f.body.title;
  return { ...(title ? { title } : {}), ...(s?.description ? { description: s.description } : {}), ...(s?.image ? { image: s.image } : {}), url };
}

export async function formPage(request: Request, id: string): Promise<Response> {
  const framed = new URL(request.url).searchParams.has("c");
  // On a workspace's own domain the address shared is the short one the proxy saw.
  const shared = request.headers.get("x-claritia-link-url") ?? request.url.split("?")[0]!;
  const [script, preview] = await Promise.all([formsScriptPath(), framed ? undefined : previewOf(id, shared)]);
  return new Response(hostedFormHtml(id, { framed, script, preview }), {
    status: ID.test(id) ? 200 : 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", "x-robots-tag": "noindex" },
  });
}
