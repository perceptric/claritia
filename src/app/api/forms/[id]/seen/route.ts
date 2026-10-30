import { after } from "next/server";
import { allowed, clientIp, cors, json } from "@/lib/forms/server";
import { isBotUa } from "@/lib/reports/bots";
import { serviceClient } from "@/lib/serviceClient";

// Form views and starts (docs/enrich-workflows-reports.md 3.4). <claritia-form> sends one beacon when the form has been
// half on screen for a second and one at the first answer. Bots are dropped by user agent, each address is held to
// 60 a minute, and the database counts each visitor once per form and kind every 30 minutes. Always answers 204.
// kind "fields" is the visit's field summary (docs/forms-plan.md 1.2): which fields it reached, answered and got wrong,
// and the time in each, sent when the visitor leaves or sends the form. A later one in the same visit replaces it.
// The answer goes at once; the write follows it (after()), so the visitor's page never waits on the database.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VID = /^[A-Za-z0-9_-]{8,64}$/;
const done = () => new Response(null, { status: 204, headers: cors });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({}, 404);
  if (isBotUa(request.headers.get("user-agent"))) return done();
  if (!allowed(`seen:ip:${clientIp(request)}`, 60)) return done();
  const text = await request.text().catch(() => "");
  if (text.length > 16_000) return done();
  let b: { kind?: unknown; vid?: unknown; version?: unknown; fields?: unknown; left?: unknown; step?: unknown; sent?: unknown } = {};
  try {
    b = JSON.parse(text || "{}");
  } catch {
    return done();
  }
  const vid = typeof b.vid === "string" && VID.test(b.vid) ? b.vid : null;
  const db = serviceClient();
  if (b.kind === "fields" && vid && db && Number.isInteger(b.version) && b.fields && typeof b.fields === "object" && !Array.isArray(b.fields)) {
    const args = { p_form: id, p_vid: vid, p_version: b.version, p_fields: b.fields, p_left: typeof b.left === "string" ? b.left : null, p_step: typeof b.step === "number" ? b.step : 0, p_sent: b.sent === true };
    after(async () => {
      await db.rpc("form_field_seen", args).then(
        () => null,
        () => null,
      );
    });
    return done();
  }
  const kind = b.kind === "view" || b.kind === "start" ? b.kind : null;
  if (!kind || !vid || !db) return done();
  after(async () => {
    await db.rpc("form_seen", { p_form: id, p_vid: vid, p_kind: kind }).then(
      () => null,
      () => null,
    );
  });
  return done();
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
