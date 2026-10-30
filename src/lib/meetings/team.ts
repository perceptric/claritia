// Calendar and Routing as one system (docs/scheduling-plan.md Part 12): a meeting type hosted by a Routing team. Routing
// decides who, Calendar decides when. The team's people come from the live router's queue; the guest sees every free
// member's times; the confirm takes the queue's turn with the router's method and fresh counts (router_pick), and the
// meeting is written as a router run (meeting_team_run), so meetings and leads share one rotation and one set of caps.
// The router is never on the guest's path for long: slower than ROUTER_WAIT_MS, or failing, the type's own rotation
// picks and a job writes the run afterward with the same key. Server only.

import { enqueueJob, type Rpc } from "../jobs.ts";
import { liveRouter } from "../router/server.ts";
import type { Queue } from "../router/types.ts";
import { isOpen, pickHost, type Turns } from "./slots.ts";
import type { MeetingType } from "./types.ts";

export const ROUTER_WAIT_MS = 300;

export type Team = { queue: Queue; version: number };

/** A call with a time limit: its value, or null when it's slower or fails. */
export async function within<T>(p: Promise<T>, ms: number): Promise<{ value: T } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)));
  try {
    return await Promise.race([p.then((value) => ({ value })), late]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A type's Routing team and the type with the team's members as hosts. With no live queue to read (no router, the
 * queue removed, the router slow or down) the type keeps the members saved with it, so times are still shown.
 */
export async function teamOf(rpc: Rpc, ws: string, type: MeetingType, ms = ROUTER_WAIT_MS): Promise<{ team: Team | null; type: MeetingType }> {
  const id = type.settings.team;
  if (!id || (type.kind !== "round_robin" && type.kind !== "owner_first")) return { team: null, type };
  const live = await within(liveRouter(rpc, ws), ms);
  const queue = live?.value?.body.queues.find((q) => q.id === id);
  if (!live?.value || !queue) return { team: null, type };
  const weights = queue.method === "weighted";
  return {
    team: { queue, version: live.value.version },
    type: { ...type, hosts: queue.members.map((m) => ({ user_id: m.user, ...(weights ? { weight: Math.max(1, Math.min(10, m.weight || 1)) } : {}) })) },
  };
}

export type TeamPick = { user: string; by: "owner" | "router" | "rotation" };

/**
 * Who takes a team meeting among the members free at the start. The contact's owner first, when they're free. Then
 * the queue's turn from fresh counts. When the router can't answer in time, or no member is open to it (all at their
 * cap), the type's own rotation picks among the free: the guest chose a time that was shown, so it is never refused.
 */
export async function pickTeamHost(
  rpc: Rpc,
  o: { ws: string; team: Team | null; type: MeetingType; free: string[]; owner?: string | null; turns: () => Promise<Turns>; ms?: number },
): Promise<TeamPick | null> {
  if (!o.free.length) return null;
  if (o.owner && o.free.includes(o.owner)) return { user: o.owner, by: "owner" };
  if (o.team) {
    const candidates = o.team.queue.members.filter((m) => o.free.includes(m.user)).map((m) => ({ user: m.user, weight: m.weight }));
    const r = await within(
      (async () => {
        const { data, error } = await rpc("router_pick", { p_ws: o.ws, p_pick: { queue: o.team!.queue.id, method: o.team!.queue.method, candidates } });
        if (error) throw new Error(error.message);
        return data as { user: string } | null;
      })(),
      o.ms ?? ROUTER_WAIT_MS,
    );
    const user = r?.value?.user;
    if (user && o.free.includes(user)) return { user, by: "router" };
  }
  const user = pickHost(o.free, o.type.hosts, await o.turns());
  return user ? { user, by: "rotation" } : null;
}

/**
 * Write the meeting as the queue's run. Tried here first; when that fails or is slow, a job writes it (the key is the
 * meeting, so it's written once either way). The owner's pick isn't a new turn: their lead was counted when routed.
 */
export async function recordTeamRun(rpc: Rpc, o: { ws: string; type: MeetingType; team: Team | null; meetingId: string; contactId?: string | null; pick: TeamPick; ms?: number }): Promise<"written" | "queued" | "skipped"> {
  const queue = o.team?.queue.id ?? o.type.settings.team;
  if (!queue || o.pick.by === "owner") return "skipped";
  const args = { p_ws: o.ws, p_meeting: o.meetingId, p_contact: o.contactId ?? null, p_queue: queue, p_owner: o.pick.user, p_version: o.team?.version ?? null, p_steps: [] };
  const r = await within(
    (async () => {
      const { error } = await rpc("meeting_team_run", args);
      if (error) throw new Error(error.message);
      return true;
    })(),
    o.ms ?? ROUTER_WAIT_MS,
  );
  if (r?.value) return "written";
  await enqueueJob(rpc, { workspaceId: o.ws, kind: "meeting_team_run", key: `booking:${o.meetingId}`, payload: args, maxAttempts: 8 });
  return "queued";
}

type Upcoming = { id: string; host: string; start: string; end: string; block_start: string; block_end: string };
export type HandOff = { moved: number; kept: number };

/**
 * A lead given to a new rep (docs/scheduling-plan.md 12.6), when the person said to move their meetings too: each
 * upcoming one-host meeting moves to the new rep at the same time when they're free then (hours, calendar, live check),
 * else it stays where it is. meeting_move locks the rep and refuses an overlap; meeting_sync moves the calendar event.
 */
export async function handOffMeetings(
  rpc: Rpc,
  o: { ws: string; contact: string; user: string; liveBusy: (hosts: string[], from: number, to: number) => Promise<Set<string>>; now?: number },
): Promise<HandOff> {
  const { hostStates } = await import("./server.ts");
  const { data, error } = await rpc("meeting_upcoming_for", { p_ws: o.ws, p_contact: o.contact });
  if (error) throw new Error(error.message);
  const list = ((data ?? []) as Upcoming[]).filter((m) => m.host !== o.user);
  const out: HandOff = { moved: 0, kept: 0 };
  for (const m of list) {
    const span = { start: Date.parse(m.block_start), end: Date.parse(m.block_end) };
    const [state] = await hostStates(rpc, o.ws, [o.user], span.start, span.end, null, o.now);
    const free = !!state?.bookable && isOpen(state.input, span, { start: Date.parse(m.start), end: Date.parse(m.end) }) && !(await o.liveBusy([o.user], span.start, span.end)).has(o.user);
    if (!free) {
      out.kept++;
      continue;
    }
    const { error: moveError } = await rpc("meeting_move", { p_id: m.id, p_hosts: [o.user], p_start: m.start, p_end: m.end, p_block_start: m.block_start, p_block_end: m.block_end });
    if (moveError) {
      if (/slot_taken|not_movable|full/.test(moveError.message)) {
        out.kept++;
        continue;
      }
      throw new Error(moveError.message);
    }
    await enqueueJob(rpc, { workspaceId: o.ws, kind: "meeting_sync", key: `move:${m.id}:${Date.now()}`, payload: { meeting: m.id, action: "move" } });
    out.moved++;
  }
  return out;
}
