import { cors } from "@/lib/forms/server";
import { fillCtx, readBooking } from "@/lib/forms/booking";
import { whenAnswer } from "@/lib/meetings/whenServer";
import { heldByOthers, holds, holdToken, releaseHold, takeHold, withoutHeld } from "@/lib/meetings/holds";
import { claimBook, claimSlots } from "@/lib/forms/bookPage";
import { bookingTextConsent } from "@/lib/texts/booking";
import { failed, json, limited, liveFor, readBody, rpcOrNull, startOf } from "../../_shared";

// The booking page inside a form (docs/ending-plan.md Part 4, src/lib/forms/bookPage.ts): GET the times for one
// length (?len=30), POST a booking. The form's signed booking token in the address is the only key.

type Ctx = { params: Promise<{ token: string }> };

async function claimOf(ctx: Ctx) {
  const token = decodeURIComponent((await ctx.params).token);
  const c = readBooking(token, process.env.SECRETS_KEY);
  if (c === "expired") return { error: json({ ok: false, error: "These times have expired.", code: "link_closed", slots: [] }, 410) };
  if (!c) return { error: json({ error: "Not found." }, 404) };
  const s = rpcOrNull();
  if (!s) return { error: json({ error: "Not set up." }, 503) };
  return { ...s, token, c };
}

export async function GET(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  try {
    const x = await claimOf(ctx);
    if ("error" in x) return x.error;
    const sp = new URL(request.url).searchParams;
    if (sp.has("when")) {
      const f = await fillCtx(x.rpc, x.c.submission, x.c.type).catch(() => null);
      return json({ when: f ? await whenAnswer(x.rpc, f.workspace_id, sp.get("when") ?? "", sp.get("today") ?? "") : null }, 200, { "Cache-Control": "no-store" });
    }
    const len = Number(sp.get("len"));
    // Times other guests hold leave the list (only types that hold have any, src/lib/meetings/holds.ts).
    const [r, held] = await Promise.all([claimSlots(x.rpc, x.token, x.c, Number.isInteger(len) ? len : undefined), heldByOthers(x.rpc, x.c.type, holdToken(sp.get("hold")))]);
    return json({ slots: withoutHeld(r.slots, held) }, r.status, { "Cache-Control": "no-store" });
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
    const x = await claimOf(ctx);
    if ("error" in x) return x.error;
    const hold = holdToken(body.hold);
    const start = startOf(body.start);
    const held = await heldByOthers(x.rpc, x.c.type, hold);
    if (start !== null && held.has(start)) {
      const fresh = await claimSlots(x.rpc, x.token, x.c, Number.isInteger(Number(body.length)) ? Number(body.length) : undefined).catch(() => ({ slots: [] }));
      return failed({ error: "slot_taken", slots: withoutHeld(fresh.slots, held).filter((s) => s.start !== start) });
    }
    const r = await claimBook(x.rpc, x.token, x.c, body, { liveBusyFor: (ws) => liveFor(x.rpc, ws) });
    if (r.reply.ok) {
      await releaseHold(x.rpc, hold);
      if (r.guest) await bookingTextConsent(x.rpc, r.guest.ws, r.guest, r.guest.questions);
      // Settings › Tracking: the booking's own server event, as from the form's own calendar (128_track.sql).
      await Promise.resolve(x.rpc("track_booked", { p_sub: x.c.submission })).catch(() => undefined);
    }
    return json(r.reply, r.status);
  } catch {
    return json({ ok: false, error: "Booking didn't go through. Try again in a moment.", code: "error", slots: [] }, 503);
  }
}

/** PATCH { start, hold }: keep the picked time for this guest for 5 minutes. { ok: false } when someone else has it. */
export async function PATCH(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  const body = await readBody(request);
  const hold = holdToken(body?.hold);
  const start = startOf(body?.start);
  if (!hold || start === null) return json({ error: "Bad request." }, 400);
  try {
    const x = await claimOf(ctx);
    if ("error" in x) return x.error;
    const f = await fillCtx(x.rpc, x.c.submission, x.c.type).catch(() => null);
    if (!f?.type || !holds(f.type.kind)) return json({ ok: true });
    return json({ ok: (await takeHold(x.rpc, x.c.type, start, hold)) !== false });
  } catch {
    return json({ ok: true });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
