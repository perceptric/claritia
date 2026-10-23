import { cors } from "@/lib/forms/server";
import { checkGuest } from "@/lib/meetings/guest";
import { bookOneOff, bookType, guestSlots, linkGuestType, loadLink, oneOffSlots } from "@/lib/meetings/public";
import { startCheckout } from "@/lib/meetings/pay";
import { payStripe } from "@/lib/meetings/payServer";
import { stripeClient } from "@/lib/billing";
import { base, booked, failed, json, limited, liveFor, readBody, rpcOrNull, spamOk, startOf } from "../../_shared";

// A one-off or single-use link, for guests (docs/meetings-scheduler.md 1.8b): GET what it offers (?len= for a
// single-use link's type); POST a booking. Either kind books once; after that it answers that it's used.

type Ctx = { params: Promise<{ token: string }> };

async function load(ctx: Ctx) {
  const { token } = await ctx.params;
  const s = rpcOrNull();
  if (!s) return { error: json({ error: "Not set up." }, 503) };
  const v = await loadLink(s.rpc, { token });
  if (!v || v.link.kind === "poll" || (v.link.kind === "single_use" && !v.type)) return { error: json({ error: "Not found." }, 404) };
  return { ...s, v };
}

export async function GET(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  try {
    const x = await load(ctx);
    if ("error" in x) return x.error;
    const { v } = x;
    const type = linkGuestType(v);
    const open = !v.link.used && !v.link.closed;
    const len = Number(new URL(request.url).searchParams.get("len") ?? type.lengths[0]);
    const slots = !open ? [] : v.link.kind === "one_off" ? await oneOffSlots(x.rpc, v) : await guestSlots(x.rpc, { ws: v.link.workspace_id, type: v.type!, length: len });
    return json({ kind: v.link.kind, type, slots, used: v.link.used, closed: v.link.closed }, 200, { "Cache-Control": "no-store" });
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
    const { v, rpc } = x;
    if (!(await spamOk(request, v.ws.turnstile, body.turnstile))) return json({ error: "The spam check didn't pass. Try again.", code: "spam" }, 400);
    const gt = linkGuestType(v);
    const g = checkGuest(body, gt.questions, gt.location);
    if ("error" in g) return json({ error: g.error, code: "guest", field: g.field }, 400);
    const start = startOf(body.start);
    if (start === null) return json({ error: "Pick a time.", code: "time" }, 400);
    const live = liveFor(rpc, v.link.workspace_id);
    if (v.link.kind === "one_off") {
      const r = await bookOneOff(rpc, { view: v, start, guest: g.guest, liveBusy: live });
      return r.ok ? booked(r, { profiles: v.profiles, confirmation: v.type?.settings.confirmation }) : failed(r);
    }
    const type = v.type!;
    const r = await bookType(rpc, { ws: v.link.workspace_id, type, length: Number(body.length), start, guest: g.guest, source: "page", linkId: v.link.id, payReady: !!v.ws.pay?.ready, liveBusy: live });
    if (!r.ok) return failed(r);
    let checkout: string | undefined;
    if (r.pending) {
      const stripe = stripeClient();
      const co = stripe ? await startCheckout(rpc, payStripe(stripe), { meetingId: r.meetingId, token: r.token, base: base() }) : { ok: false as const };
      if (!co.ok) {
        if (!stripe) await rpc("meeting_status", { p_id: r.meetingId, p_status: "canceled", p_reason: "Checkout could not start.", p_by: null });
        return json({ ok: false, error: "Payment couldn't start. Try again in a moment.", code: "payment", slots: [] }, 503);
      }
      checkout = co.url;
    }
    return booked(r, { profiles: v.profiles, confirmation: type.settings.confirmation, checkout });
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
