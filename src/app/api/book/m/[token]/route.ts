import { cors } from "@/lib/forms/server";
import { cancelByGuest, guestMeeting, loadMeeting, reschedule, rescheduleSlots } from "@/lib/meetings/public";
import { failed, json, limited, liveFor, readBody, rpcOrNull, startOf } from "../../_shared";

// The guest's manage link (docs/meetings-scheduler.md 1.7): GET the meeting (and ?slots=1 the times it can move
// to); POST { action: "reschedule", start } or { action: "cancel", reason }.

type Ctx = { params: Promise<{ token: string }> };

async function load(ctx: Ctx) {
  const { token } = await ctx.params;
  const s = rpcOrNull();
  if (!s) return { error: json({ error: "Not set up." }, 503) };
  const v = await loadMeeting(s.rpc, { token });
  if (!v) return { error: json({ error: "Not found." }, 404) };
  return { ...s, v };
}

export async function GET(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  try {
    const x = await load(ctx);
    if ("error" in x) return x.error;
    const wantSlots = new URL(request.url).searchParams.get("slots") === "1";
    return json({ meeting: guestMeeting(x.v), ...(wantSlots ? { slots: await rescheduleSlots(x.rpc, x.v) } : {}) }, 200, { "Cache-Control": "no-store" });
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const stop = limited(request, "write");
  if (stop) return stop;
  const body = await readBody(request);
  if (!body) return json({ error: "Bad request." }, 400);
  try {
    const x = await load(ctx);
    if ("error" in x) return x.error;
    if (body.action === "cancel") {
      const r = await cancelByGuest(x.rpc, { view: x.v, reason: typeof body.reason === "string" ? body.reason : "" });
      if (!r.ok) return json({ error: "This meeting can't be canceled.", code: r.error }, 409);
      return json({ ok: true, meeting: guestMeeting((await loadMeeting(x.rpc, { id: x.v.meeting.id }))!) });
    }
    if (body.action === "reschedule") {
      const start = startOf(body.start);
      if (start === null) return json({ error: "Pick a time.", code: "time" }, 400);
      const r = await reschedule(x.rpc, { view: x.v, start, liveBusy: liveFor(x.rpc, x.v.meeting.workspace_id) });
      if (!r.ok) return r.error === "not_movable" ? json({ error: "This meeting can't be moved.", code: r.error }, 409) : failed(r);
      return json({ ok: true, meeting: guestMeeting((await loadMeeting(x.rpc, { id: x.v.meeting.id }))!) });
    }
    return json({ error: "Bad request." }, 400);
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
