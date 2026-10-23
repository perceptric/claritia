import { cors } from "@/lib/forms/server";
import { checkGuest, type GuestType } from "@/lib/meetings/guest";
import { startCheckout } from "@/lib/meetings/pay";
import { payStripe } from "@/lib/meetings/payServer";
import { readBookRef } from "@/lib/meetings/links";
import { bookType, guestTypeOf, loadTarget, preferredSlots } from "@/lib/meetings/public";
import { stripeClient } from "@/lib/billing";
import { base, booked, failed, json, limited, liveFor, readBody, rpcOrNull, spamOk, startOf } from "../../../_shared";

// A meeting type's booking page, for guests (docs/meetings-scheduler.md 1.8): GET the type and its times for one
// length (?len=30, optional ?from= and ?to= in ms, ?host= to prefer one host); POST a booking (with the link's
// host and ref when it came from a booking email). Only what a guest may see goes back.

type Ctx = { params: Promise<{ ws: string; slug: string }> };

async function target(ctx: Ctx, request: Request) {
  const { ws, slug } = await ctx.params;
  const s = rpcOrNull();
  if (!s) return { error: json({ error: "Not set up." }, 503) };
  const form = new URL(request.url).searchParams.get("form");
  const t = await loadTarget(s.rpc, ws, slug, form);
  if (!t?.type) return { error: json({ error: "Not found." }, 404) };
  return { ...s, t, type: t.type };
}

export async function GET(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  try {
    const x = await target(ctx, request);
    if ("error" in x) return x.error;
    const sp = new URL(request.url).searchParams;
    const len = Number(sp.get("len") ?? x.type.settings.lengths[0]);
    const from = sp.get("from") ? Number(sp.get("from")) : undefined;
    const to = sp.get("to") ? Number(sp.get("to")) : undefined;
    const type: GuestType = guestTypeOf(x.type, x.t.profiles);
    const slots = await preferredSlots(x.rpc, { ws: x.t.ws.id, type: x.type, length: len, from, to, host: sp.get("host"), profiles: x.t.profiles });
    return json({ type, slots }, 200, { "Cache-Control": "no-store" });
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
    const x = await target(ctx, request);
    if ("error" in x) return x.error;
    if (!(await spamOk(request, x.t.turnstile, body.turnstile))) return json({ error: "The spam check didn't pass. Try again.", code: "spam" }, 400);
    const g = checkGuest(body, x.type.settings.questions, x.type.settings.location);
    if ("error" in g) return json({ error: g.error, code: "guest", field: g.field }, 400);
    const start = startOf(body.start);
    const length = Number(body.length);
    if (start === null || !Number.isFinite(length)) return json({ error: "Pick a time.", code: "time" }, 400);
    // A booking link from a "pick a time" email: the host it named first, and the meeting joins that form fill.
    const host = typeof body.host === "string" ? body.host.slice(0, 64) : null;
    const submissionId = typeof body.ref === "string" ? readBookRef(body.ref) : null;
    const r = await bookType(x.rpc, {
      ws: x.t.ws.id,
      type: x.type,
      length,
      start,
      guest: g.guest,
      source: "page",
      submissionId,
      prefer: host ? { host, profiles: x.t.profiles } : null,
      payReady: x.t.pay,
      liveBusy: liveFor(x.rpc, x.t.ws.id),
    });
    if (!r.ok) return failed(r);
    let checkout: string | undefined;
    if (r.pending) {
      const stripe = stripeClient();
      const co = stripe ? await startCheckout(x.rpc, payStripe(stripe), { meetingId: r.meetingId, token: r.token, base: base() }) : { ok: false as const };
      if (!co.ok) {
        if (!stripe) await x.rpc("meeting_status", { p_id: r.meetingId, p_status: "canceled", p_reason: "Checkout could not start.", p_by: null });
        return json({ ok: false, error: "Payment couldn't start. Try again in a moment.", code: "payment", slots: [] }, 503);
      }
      checkout = co.url;
    }
    return booked(r, { profiles: x.t.profiles, confirmation: x.type.settings.confirmation, checkout });
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
