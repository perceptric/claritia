import { cors } from "@/lib/forms/server";
import { readBooking } from "@/lib/forms/booking";
import { claimBook, claimSlots } from "@/lib/forms/bookPage";
import { bookingTextConsent } from "@/lib/texts/booking";
import { json, limited, liveFor, readBody, rpcOrNull } from "../../_shared";

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
    const len = Number(new URL(request.url).searchParams.get("len"));
    const r = await claimSlots(x.rpc, x.token, x.c, Number.isInteger(len) ? len : undefined);
    return json({ slots: r.slots }, r.status, { "Cache-Control": "no-store" });
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
    const r = await claimBook(x.rpc, x.token, x.c, body, { liveBusyFor: (ws) => liveFor(x.rpc, ws) });
    if (r.reply.ok) {
      if (r.guest) await bookingTextConsent(x.rpc, r.guest.ws, r.guest, r.guest.questions);
      // Settings › Tracking: the booking's own server event, as from the form's own calendar (128_track.sql).
      await Promise.resolve(x.rpc("track_booked", { p_sub: x.c.submission })).catch(() => undefined);
    }
    return json(r.reply, r.status);
  } catch {
    return json({ ok: false, error: "Booking didn't go through. Try again in a moment.", code: "error", slots: [] }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
