import { allowed, clientIp, cors, json } from "@/lib/forms/server";
import { isBotUa } from "@/lib/reports/bots";
import { serviceClient } from "@/lib/serviceClient";

// Form views and starts (docs/enrich-workflows-reports.md 3.4). <claritia-form> sends one beacon when the form has been
// half on screen for a second and one at the first answer. Bots are dropped by user agent, each address is held to
// 60 a minute, and the database counts each visitor once per form and kind every 30 minutes. Always answers 204.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VID = /^[A-Za-z0-9_-]{8,64}$/;
const done = () => new Response(null, { status: 204, headers: cors });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({}, 404);
  if (isBotUa(request.headers.get("user-agent"))) return done();
  if (!allowed(`seen:ip:${clientIp(request)}`, 60)) return done();
  const b = (await request.json().catch(() => ({}))) as { kind?: unknown; vid?: unknown };
  const kind = b.kind === "view" || b.kind === "start" ? b.kind : null;
  const vid = typeof b.vid === "string" && VID.test(b.vid) ? b.vid : null;
  const db = serviceClient();
  if (!kind || !vid || !db) return done();
  await db.rpc("form_seen", { p_form: id, p_vid: vid, p_kind: kind }).then(
    () => null,
    () => null,
  );
  return done();
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
