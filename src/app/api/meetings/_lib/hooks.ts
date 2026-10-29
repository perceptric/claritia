import type { Rpc } from "@/lib/jobs";
import { cleanHandle, handleProblem } from "@/lib/meetings/handles";
import { checkEndpoint, newSecret, openEndpoint, sampleBody, sealEndpoint, sendWebhook, WEBHOOK_EVENTS, isEvent } from "@/lib/meetings/webhooks";
import { call, Refused, roleOf, saveProfile, type Actor } from "./host";

// The Booking page and Webhooks tabs (docs/scheduling-plan.md Parts 4 and 5). Everyone sets their own page; owners
// set the team's handle and the webhooks.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function owner(rpc: Rpc, a: Actor) {
  const { role } = await roleOf(rpc, a);
  if (role !== "owner") throw new Refused(403, "Only workspace owners can change this.");
}

// Booking page -------------------------------------------------------------------------------------------------

export async function bookingInfo(rpc: Rpc, a: Actor) {
  await roleOf(rpc, a);
  // The team's handle exists from the first visit.
  await call(rpc, "booking_slug_ensure", { p_ws: a.ws });
  return call<Record<string, unknown>>(rpc, "booking_page_info", { p_ws: a.ws, p_user: a.user });
}

/** Whether a handle is free for you (team: for the team), with what's wrong when it isn't. */
export async function handleCheck(rpc: Rpc, a: Actor, raw: unknown, team: boolean): Promise<{ handle: string; free: boolean; problem: string | null }> {
  await roleOf(rpc, a);
  const h = cleanHandle(String(raw ?? ""));
  const problem = handleProblem(h);
  if (problem) return { handle: h, free: false, problem };
  const free = await call<boolean>(rpc, "booking_handle_free", { p_handle: h, p_ws: a.ws, p_user: team ? null : a.user });
  return { handle: h, free, problem: free ? null : "That name is taken." };
}

/** Save your page: the profile, then the handle, in that order (a handle needs a profile). */
export async function savePage(rpc: Rpc, a: Actor, profile: unknown, handle: unknown): Promise<{ handle: string }> {
  await saveProfile(rpc, a, profile);
  const h = cleanHandle(String(handle ?? ""));
  const problem = handleProblem(h);
  if (problem) throw new Refused(400, problem);
  return { handle: await call<string>(rpc, "booking_handle_set", { p_ws: a.ws, p_user: a.user, p_handle: h }) };
}

export async function saveTeamHandle(rpc: Rpc, a: Actor, handle: unknown): Promise<{ handle: string }> {
  await owner(rpc, a);
  const h = cleanHandle(String(handle ?? ""));
  const problem = handleProblem(h);
  if (problem) throw new Refused(400, problem);
  return { handle: await call<string>(rpc, "booking_handle_set", { p_ws: a.ws, p_user: null, p_handle: h }) };
}

// Webhooks -----------------------------------------------------------------------------------------------------

export async function listWebhooks(rpc: Rpc, a: Actor) {
  const { role } = await roleOf(rpc, a);
  return { owner: role === "owner", endpoints: await call<unknown[]>(rpc, "webhooks_list", { p_ws: a.ws }), events: WEBHOOK_EVENTS };
}

/** Add an endpoint. The secret comes back once, here. */
export async function addWebhook(rpc: Rpc, a: Actor, raw: unknown, key?: string): Promise<{ id: string; secret: string }> {
  await owner(rpc, a);
  const r = checkEndpoint(raw);
  if ("error" in r) throw new Refused(400, r.error);
  if (!r.url) throw new Refused(400, "Add the address.");
  const secret = newSecret();
  const s = sealEndpoint(r.url, secret, key);
  const id = await call<string>(rpc, "webhook_save", {
    p_ws: a.ws, p_id: null, p_host: s.host, p_sealed: s.sealed, p_hint: s.hint,
    p_events: r.events ?? [...WEBHOOK_EVENTS], p_description: r.description ?? "", p_active: true, p_by: a.user,
  });
  return { id, secret };
}

/** Change an endpoint's address, events, note or pause. A new address keeps the secret. */
export async function changeWebhook(rpc: Rpc, a: Actor, id: unknown, raw: unknown, key?: string): Promise<{ ok: true }> {
  await owner(rpc, a);
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Not found.");
  const r = checkEndpoint(raw);
  if ("error" in r) throw new Refused(400, r.error);
  let sealed: ReturnType<typeof sealEndpoint> | null = null;
  if (r.url) {
    const was = await call<string | null>(rpc, "webhook_sealed", { p_ws: a.ws, p_id: id });
    if (!was) throw new Refused(404, "Not found.");
    sealed = sealEndpoint(r.url, openEndpoint(was, key).secret, key);
  }
  await call(rpc, "webhook_save", {
    p_ws: a.ws, p_id: id, p_host: sealed?.host ?? null, p_sealed: sealed?.sealed ?? null, p_hint: sealed?.hint ?? null,
    p_events: r.events, p_description: r.description, p_active: r.active, p_by: a.user,
  });
  return { ok: true };
}

/** A new secret for an endpoint, shown once. The old one stops working at once. */
export async function rollSecret(rpc: Rpc, a: Actor, id: unknown, key?: string): Promise<{ secret: string }> {
  await owner(rpc, a);
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Not found.");
  const was = await call<string | null>(rpc, "webhook_sealed", { p_ws: a.ws, p_id: id });
  if (!was) throw new Refused(404, "Not found.");
  const secret = newSecret();
  const s = sealEndpoint(openEndpoint(was, key).url, secret, key);
  await call(rpc, "webhook_save", { p_ws: a.ws, p_id: id, p_host: s.host, p_sealed: s.sealed, p_hint: s.hint, p_events: null, p_description: null, p_active: null, p_by: a.user });
  return { secret };
}

export async function deleteWebhook(rpc: Rpc, a: Actor, id: unknown): Promise<{ ok: true }> {
  await owner(rpc, a);
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Not found.");
  await call(rpc, "webhook_delete", { p_ws: a.ws, p_id: id });
  return { ok: true };
}

export async function webhookSends(rpc: Rpc, a: Actor, id: unknown) {
  await owner(rpc, a);
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Not found.");
  return { sends: await call<unknown[]>(rpc, "webhook_deliveries_list", { p_ws: a.ws, p_endpoint: id, p_limit: 50 }) };
}

/** Send a sample right away and say how it went. It shows with the endpoint's other sends. */
export async function testWebhook(rpc: Rpc, a: Actor, id: unknown, event: unknown, key?: string) {
  await owner(rpc, a);
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Not found.");
  const was = await call<string | null>(rpc, "webhook_sealed", { p_ws: a.ws, p_id: id });
  if (!was) throw new Refused(404, "Not found.");
  const ev = isEvent(event) ? event : "meeting.booked";
  const body = sampleBody(ev, a.ws);
  const sendId = await call<string>(rpc, "webhook_test_add", { p_ws: a.ws, p_endpoint: id, p_event: ev, p_body: body });
  const ep = openEndpoint(was, key);
  const r = await sendWebhook({ url: ep.url, secret: ep.secret, delivery: sendId, body });
  const status = r.status === "done" ? "done" : "failed";
  const error = r.status === "done" ? null : r.error;
  await call(rpc, "webhook_done", { p_id: sendId, p_status: status, p_code: r.code, p_error: error });
  return { status, code: r.code, error };
}

export async function resendWebhook(rpc: Rpc, a: Actor, send: unknown) {
  await owner(rpc, a);
  if (typeof send !== "string" || !UUID.test(send)) throw new Refused(404, "Not found.");
  await call(rpc, "webhook_resend", { p_ws: a.ws, p_id: send });
  return { ok: true };
}
