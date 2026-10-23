import { cors } from "@/lib/forms/server";
import { validEmail } from "@/lib/meetings/guest";
import { loadLink, pollView, pollVote } from "@/lib/meetings/public";
import { json, limited, readBody, rpcOrNull, spamOk, startOf } from "../../_shared";

// A meeting poll, for guests (docs/meetings-scheduler.md 1.8b): GET the offered times with how many picked each;
// POST { name, email, picks } to vote (again with the same email replaces the vote). The host books the winner.

type Ctx = { params: Promise<{ token: string }> };

async function load(ctx: Ctx) {
  const { token } = await ctx.params;
  const s = rpcOrNull();
  if (!s) return { error: json({ error: "Not set up." }, 503) };
  const v = await loadLink(s.rpc, { token });
  if (!v || v.link.kind !== "poll") return { error: json({ error: "Not found." }, 404) };
  return { ...s, v, token };
}

export async function GET(request: Request, ctx: Ctx) {
  const stop = limited(request, "read");
  if (stop) return stop;
  try {
    const x = await load(ctx);
    if ("error" in x) return x.error;
    return json(pollView(x.v), 200, { "Cache-Control": "no-store" });
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
    if (!(await spamOk(request, x.v.ws.turnstile, body.turnstile))) return json({ error: "The spam check didn't pass. Try again.", code: "spam" }, 400);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 320) : "";
    if (!name) return json({ error: "Add your name.", code: "guest", field: "name" }, 400);
    if (!validEmail(email)) return json({ error: "Add a valid email.", code: "guest", field: "email" }, 400);
    const picks = (Array.isArray(body.picks) ? body.picks : []).map(startOf).filter((t): t is number => t !== null);
    if (!picks.length) return json({ error: "Pick at least one time.", code: "picks" }, 400);
    const r = await pollVote(x.rpc, x.token, { email, name, picks });
    if (!r.ok) return json({ error: r.error === "link_closed" ? "This poll is closed." : "Pick from the times offered.", code: r.error }, r.error === "link_closed" ? 410 : 400);
    return json({ ok: true, ...pollView((await loadLink(x.rpc, { token: x.token }))!) });
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
