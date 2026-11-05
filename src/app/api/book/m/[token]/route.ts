import { cors } from "@/lib/forms/server";
import { buildIcs } from "@/lib/meetings/ics";
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
    const sp = new URL(request.url).searchParams;
    // ?ics=1: the meeting as a calendar file, for Apple Calendar and any app that opens .ics.
    if (sp.get("ics") === "1") {
      const g = guestMeeting(x.v);
      if (g.status === "canceled") return json({ error: "This meeting was canceled." }, 410);
      const file = buildIcs({
        meetingId: x.v.meeting.id,
        sequence: 0,
        method: "PUBLISH",
        start: g.start,
        end: g.end,
        stamp: Date.now(),
        summary: g.hosts.length ? `${g.name} with ${g.hosts.map((h) => h.name).join(", ")}` : g.name,
        description: `Reschedule or cancel: ${new URL(request.url).origin}/book/m/${(await ctx.params).token}`,
        location: g.join ?? g.location?.detail ?? null,
        url: g.join,
        organizer: { email: "meetings@mail.tryclaritia.com", name: g.hosts[0]?.name ?? "Claritia" },
        attendees: [{ email: g.guest.email, name: g.guest.name || null }],
      });
      return new Response(file, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="meeting.ics"', "cache-control": "no-store" } });
    }
    const wantSlots = sp.get("slots") === "1";
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
      // The cancel answers with the meeting as it is now (one call, 090); before that, read again.
      return json({ ok: true, meeting: guestMeeting((r.view ?? (await loadMeeting(x.rpc, { id: x.v.meeting.id })))!) });
    }
    if (body.action === "reschedule") {
      const start = startOf(body.start);
      if (start === null) return json({ error: "Pick a time.", code: "time" }, 400);
      const r = await reschedule(x.rpc, { view: x.v, start, liveBusy: liveFor(x.rpc, x.v.meeting.workspace_id) });
      if (!r.ok) return r.error === "not_movable" ? json({ error: "This meeting can't be moved.", code: r.error }, 409) : failed(r);
      return json({ ok: true, meeting: guestMeeting((r.view ?? (await loadMeeting(x.rpc, { id: x.v.meeting.id })))!) });
    }
    return json({ error: "Bad request." }, 400);
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
