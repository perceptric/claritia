// What the signed-in Meetings screens change (docs/meetings-scheduler.md 1.2, 1.4, 1.7 and 1.8b): meeting types and
// managed types, hours, booking profiles, the host's actions on a meeting, and "copy times". Each takes the jobs
// queue's Rpc (the service client in the routes, Postgres in tests) and the caller, checks the caller's place in the
// workspace and the input, then writes through the functions in supabase/migrations/058_meetings_screens.sql.

import type { Rpc } from "../../../../lib/jobs.ts";
import { checkAvailability, checkType } from "../../../../lib/meetings/check.ts";
import { manageToken, manageUrl } from "../../../../lib/meetings/links.ts";
import { hostStates, offer } from "../../../../lib/meetings/server.ts";
import { slots as engine } from "../../../../lib/meetings/slots.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../../../../lib/meetings/types.ts";
import { bookUrl, canEditType, checkProfile, slugify, timesText, uniqueSlug } from "../../../../components/app/meetings/model.ts";

export type Actor = { ws: string; user: string };
type Role = "owner" | "member";
type TypeRow = MeetingType & { created_by: string | null };

/** A refusal the route sends back as is: a status and a line for the person. */
export class Refused extends Error {
  status: number;
  errors?: string[];
  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Errors the database functions raise, in plain words.
const WORDS: Record<string, [number, string]> = {
  not_member: [404, "Workspace not found."],
  not_found: [404, "Not found."],
  slug_taken: [409, "That link name is taken."],
  bad_change: [409, "That change isn't possible for this meeting now."],
  not_started: [409, "The meeting hasn't started yet."],
  bad_template: [400, "Only one-person and group types can be given to people."],
  name_taken: [409, "You already have a schedule with that name."],
  handle_taken: [409, "That name is taken."],
  bad_handle: [400, "Use 3 to 40 lowercase letters, numbers and dashes."],
  no_profile: [409, "Save your page first."],
  too_many: [409, "A workspace can have up to 10 webhooks."],
  no_address: [400, "Add the address."],
};

export async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) {
    const code = Object.keys(WORDS).find((k) => error.message.includes(k));
    if (code) throw new Refused(WORDS[code]![0], WORDS[code]![1]);
    throw new Error(error.message);
  }
  return data as T;
}

export async function members(rpc: Rpc, ws: string): Promise<{ id: string; role: Role }[]> {
  if (!UUID.test(ws)) return [];
  return (await call<{ id: string; role: Role }[] | null>(rpc, "meetings_members", { p_ws: ws })) ?? [];
}

/** The caller's role, or a refusal when they aren't in the workspace. */
export async function roleOf(rpc: Rpc, a: Actor): Promise<{ role: Role; ids: Set<string> }> {
  const all = await members(rpc, a.ws);
  const me = all.find((m) => m.id === a.user);
  if (!me) throw new Refused(404, "Workspace not found.");
  return { role: me.role, ids: new Set(all.map((m) => m.id)) };
}

async function typeOf(rpc: Rpc, ws: string, id: unknown): Promise<TypeRow> {
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Meeting type not found.");
  const t = await call<TypeRow | null>(rpc, "meeting_type_get", { p_ws: ws, p_id: id });
  if (!t) throw new Refused(404, "Meeting type not found.");
  return t;
}

// Meeting types ----------------------------------------------------------------------------------------------------

/**
 * Create (no id) or change a type. Hosts must be members (checkType). Only owners set what a managed type locks;
 * a personal copy keeps its owner as host and its template's locked settings (the database holds that line too).
 */
export async function saveType(rpc: Rpc, a: Actor, raw: unknown, id?: string | null): Promise<{ id: string }> {
  const { role, ids } = await roleOf(rpc, a);
  const cur = id ? await typeOf(rpc, a.ws, id) : null;
  if (cur && !canEditType(role, a.user, cur)) throw new Refused(403, "Only its hosts and owners can change this type.");
  const r = (raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {}) as Record<string, unknown>;
  if (cur?.template_id) {
    r.hosts = cur.hosts;
    r.owner_user_id = cur.owner_user_id;
  }
  const checked = checkType(r, ids);
  if ("errors" in checked) throw new Refused(400, checked.errors[0]!, checked.errors);
  const t = checked.type;
  if (role !== "owner") t.locked = cur?.locked ?? [];
  if (!cur && role !== "owner" && !t.hosts.some((h) => h.user_id === a.user)) throw new Refused(403, "Add yourself as a host, or ask an owner.");
  const saved = await call<string>(rpc, "meeting_type_save", { p_ws: a.ws, p_id: cur?.id ?? null, p_type: t, p_by: a.user });
  return { id: saved };
}

export async function deleteType(rpc: Rpc, a: Actor, id: unknown): Promise<void> {
  const { role } = await roleOf(rpc, a);
  const cur = await typeOf(rpc, a.ws, id);
  if (!canEditType(role, a.user, cur)) throw new Refused(403, "Only its hosts and owners can delete this type.");
  if (cur.template_id && role !== "owner") throw new Refused(403, "An owner gave you this type; ask them to remove it.");
  await call(rpc, "meeting_type_delete", { p_ws: a.ws, p_id: cur.id });
}

/** A copy of a type with a free link name, as a plain type of its own (not managed). */
export async function duplicateType(rpc: Rpc, a: Actor, id: unknown): Promise<{ id: string }> {
  const { role } = await roleOf(rpc, a);
  const cur = await typeOf(rpc, a.ws, id);
  const hosts = cur.template_id ? [{ user_id: a.user }] : cur.hosts;
  const base = slugify(`${cur.slug}-copy`);
  const taken = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const slug = uniqueSlug(base, taken);
    try {
      return await saveType(rpc, a, { ...cur, id: undefined, name: `${cur.name} copy`.slice(0, 120), slug, hosts, owner_user_id: cur.template_id ? a.user : cur.owner_user_id, locked: role === "owner" ? cur.locked : [] }, null);
    } catch (e) {
      if (e instanceof Refused && e.status === 409) {
        taken.add(slug);
        continue;
      }
      throw e;
    }
  }
  throw new Refused(409, "That link name is taken.");
}

/** Owners give a template to people: each gets their own copy, kept in step; people no longer picked lose theirs. */
export async function pushType(rpc: Rpc, a: Actor, id: unknown, users: unknown): Promise<{ made: number; kept: number; removed: number }> {
  const { role, ids } = await roleOf(rpc, a);
  if (role !== "owner") throw new Refused(403, "Only owners can give types to people.");
  const cur = await typeOf(rpc, a.ws, id);
  const list = [...new Set(Array.isArray(users) ? users.filter((u): u is string => typeof u === "string") : [])];
  if (list.some((u) => !ids.has(u))) throw new Refused(400, "Someone picked isn't in this workspace.");
  return call(rpc, "meeting_type_push", { p_ws: a.ws, p_template: cur.id, p_users: list });
}

// Hours and profile ------------------------------------------------------------------------------------------------

/** Your own hours; owners can set anyone's. */
export async function saveAvailability(rpc: Rpc, a: Actor, user: unknown, raw: unknown): Promise<void> {
  const { role, ids } = await roleOf(rpc, a);
  const who = typeof user === "string" && user ? user : a.user;
  if (!ids.has(who)) throw new Refused(404, "Person not found.");
  if (who !== a.user && role !== "owner") throw new Refused(403, "Only owners can change someone else's hours.");
  const r = checkAvailability(raw);
  if ("errors" in r) throw new Refused(400, r.errors[0]!, r.errors);
  await call(rpc, "availability_save", { p_ws: a.ws, p_user: who, p_tz: r.availability.tz, p_weekly: r.availability.weekly, p_overrides: r.availability.overrides });
}

/**
 * A named schedule (docs/app-structure.md 6.4): your own, or anyone's for owners. `id` null adds one; the hours are
 * checked like the default hours. Returns the schedule's id.
 */
export async function saveSchedule(rpc: Rpc, a: Actor, user: unknown, id: unknown, name: unknown, raw: unknown): Promise<string> {
  const { role, ids } = await roleOf(rpc, a);
  const who = typeof user === "string" && user ? user : a.user;
  if (!ids.has(who)) throw new Refused(404, "Person not found.");
  if (who !== a.user && role !== "owner") throw new Refused(403, "Only owners can change someone else's hours.");
  const n = typeof name === "string" ? name.trim().slice(0, 60) : "";
  if (!n) throw new Refused(400, "Name the schedule.");
  if (/^working hours$/i.test(n)) throw new Refused(409, "Working hours is your default schedule.");
  const r = checkAvailability(raw);
  if ("errors" in r) throw new Refused(400, r.errors[0]!, r.errors);
  const sid = typeof id === "string" && UUID.test(id) ? id : null;
  return call<string>(rpc, "schedule_save", { p_ws: a.ws, p_user: who, p_id: sid, p_name: n, p_tz: r.availability.tz, p_weekly: r.availability.weekly, p_overrides: r.availability.overrides });
}

export async function deleteSchedule(rpc: Rpc, a: Actor, user: unknown, id: unknown): Promise<void> {
  const { role, ids } = await roleOf(rpc, a);
  const who = typeof user === "string" && user ? user : a.user;
  if (!ids.has(who)) throw new Refused(404, "Person not found.");
  if (who !== a.user && role !== "owner") throw new Refused(403, "Only owners can change someone else's hours.");
  if (typeof id !== "string" || !UUID.test(id)) throw new Refused(404, "Schedule not found.");
  await call(rpc, "schedule_delete", { p_ws: a.ws, p_user: who, p_id: id });
}

export async function saveProfile(rpc: Rpc, a: Actor, raw: unknown): Promise<void> {
  await roleOf(rpc, a);
  const r = checkProfile(raw);
  if ("errors" in r) throw new Refused(400, r.errors[0]!, r.errors);
  const p = r.profile;
  await call(rpc, "booking_profile_save", { p_ws: a.ws, p_user: a.user, p_slug: p.slug, p_name: p.name, p_headline: p.headline, p_photo: p.photo_url });
}

/** The workspace's booking address, made from its name the first time. */
export async function workspaceSlug(rpc: Rpc, a: Actor): Promise<string> {
  await roleOf(rpc, a);
  return call<string>(rpc, "booking_slug_ensure", { p_ws: a.ws });
}

// The host's actions on a meeting ----------------------------------------------------------------------------------

export type HostAction = "held" | "no_show" | "cancel";

/**
 * Held, no-show or cancel. The status change and its job are one database call, so a double click or two people
 * at once can't queue a second calendar cancel; held and no-show are refused before the start. Paid meetings come
 * back with their payment so the route can refund them.
 */
export async function hostAction(rpc: Rpc, a: Actor, meeting: unknown, action: unknown, reason?: unknown): Promise<{ status: string; was: string; payment: Record<string, unknown> | null }> {
  await roleOf(rpc, a);
  if (typeof meeting !== "string" || !UUID.test(meeting)) throw new Refused(404, "Meeting not found.");
  const status = action === "cancel" ? "canceled" : action === "held" || action === "no_show" ? action : null;
  if (!status) throw new Refused(400, "Pick held, no-show or cancel.");
  const why = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  return call(rpc, "meeting_host_action", { p_ws: a.ws, p_id: meeting, p_status: status, p_reason: why || null, p_by: a.user });
}

/**
 * The guest's own link to move or cancel (/book/m/<token>), for the host to send again: from the sealed copy the
 * emails use (manageToken), so the link in the guest's emails keeps working.
 */
export async function hostLink(rpc: Rpc, a: Actor, meeting: unknown, origin: string, secret?: string): Promise<{ url: string }> {
  await roleOf(rpc, a);
  if (typeof meeting !== "string" || !UUID.test(meeting)) throw new Refused(404, "Meeting not found.");
  const m = await call<{ id: string; token_hash: string; token_sealed: string | null }>(rpc, "meeting_manage_info", { p_ws: a.ws, p_id: meeting, p_by: a.user });
  return { url: manageUrl(origin.replace(/\/+$/, ""), await manageToken(rpc, m, secret)) };
}

// Copy times (1.8b) ------------------------------------------------------------------------------------------------

/** The type's next free times as text for an email, each with a link that opens the booking page at that time. */
export async function copyTimes(rpc: Rpc, a: Actor, o: { type: unknown; length?: unknown; tz?: unknown; origin: string; now?: number; max?: number; hour12?: boolean }): Promise<{ text: string; count: number }> {
  await roleOf(rpc, a);
  const t = await typeOf(rpc, a.ws, o.type);
  const length = t.settings.lengths.includes(Number(o.length)) ? Number(o.length) : t.settings.lengths[0]!;
  const tz = typeof o.tz === "string" && o.tz.length <= 60 && isZone(o.tz) ? o.tz : "UTC";
  const ws = await call<string>(rpc, "booking_slug_ensure", { p_ws: a.ws });
  const { slots } = await offer(rpc, { ws: a.ws, type: t, length, now: o.now });
  const starts = slots.map((s) => s.start);
  const text = timesText({ name: t.name, length, starts, tz, max: o.max, hour12: o.hour12, url: (start) => bookUrl(o.origin, ws, t.slug, { start, length }) });
  return { text, count: text.split("\n").filter((l) => / https?:\/\//.test(l)).length };
}

function isZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Free starts to pick from for a one-off meeting or a poll: a type's offer when one is named, else the caller's own
 * free times for a length over the next two weeks (their hours, calendars and meetings).
 */
export async function freeStarts(rpc: Rpc, a: Actor, o: { type?: unknown; length?: unknown; now?: number }): Promise<{ starts: number[]; length: number }> {
  await roleOf(rpc, a);
  const now = o.now ?? Date.now();
  if (o.type) {
    const t = await typeOf(rpc, a.ws, o.type);
    const length = t.settings.lengths.includes(Number(o.length)) ? Number(o.length) : t.settings.lengths[0]!;
    return { starts: (await offer(rpc, { ws: a.ws, type: t, length, now })).slots.map((s) => s.start), length };
  }
  const length = Math.round(Number(o.length));
  if (!(length >= 5 && length <= 480)) throw new Refused(400, "Pick a length.");
  const settings = { ...DEFAULT_SETTINGS, lengths: [length], notice: 60, window: 14, step: length % 30 === 0 ? 30 : 15 };
  const [me] = await hostStates(rpc, a.ws, [a.user], now, now + 15 * 86_400_000);
  if (!me?.bookable) throw new Refused(409, me?.why === "reconnect" ? "Reconnect your calendar first." : me?.why === "no_hours" ? "Set your hours first." : "Connect your calendar first.");
  return { starts: engine({ kind: "one", hosts: [me.input], length, settings, now }).map((s) => s.start), length };
}
