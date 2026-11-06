// Webex and Whereby for meeting types (docs/integrations-plan.md, Next step 12), like Zoom (providers/zoom.ts) but on
// the team's own connection in Settings › Integrations: a Webex meeting or a Whereby room per booking, moved with the
// booking and taken down when it's canceled. Neither takes an idempotency key, so the worker keeps the meeting's id
// the moment it's made and uses it again on a retry (worker-intel/jobs/calendars.ts).
// Endpoints are from each tool's docs and are checked against a real account before launch (check).

import type { Ctx } from "../sources/types.ts";

export type VideoKind = "webex" | "whereby";
export type VideoMade = { id: string; joinUrl: string };

export interface VideoClient {
  create(m: { topic: string; start: number; end: number }): Promise<VideoMade>;
  /** A new time. Whereby's rooms end at a set time, so a move makes a new room: the answer then has its new link. */
  move(id: string, start: number, end: number, topic: string): Promise<VideoMade | null>;
  cancel(id: string): Promise<void>;
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const gone = (e: unknown) => [404, 410].includes((e as { status?: number })?.status ?? 0);

const WEBEX = "https://webexapis.com/v1";

export function webexClient(ctx: Ctx): VideoClient {
  return {
    async create(m) {
      const d = await ctx.api<{ id: string; webLink: string }>(`${WEBEX}/meetings`, {
        method: "POST",
        body: JSON.stringify({ title: m.topic.slice(0, 128), start: iso(m.start), end: iso(m.end), timezone: "UTC", enabledAutoRecordMeeting: false, allowAnyUserToBeCoHost: false }),
      });
      if (!d?.id || !d.webLink) throw new Error("Webex didn't make the meeting.");
      return { id: d.id, joinUrl: d.webLink };
    },
    async move(id, start, end, topic) {
      await ctx.api(`${WEBEX}/meetings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ title: topic.slice(0, 128), start: iso(start), end: iso(end), timezone: "UTC" }) });
      return null;
    },
    async cancel(id) {
      await ctx.api(`${WEBEX}/meetings/${encodeURIComponent(id)}`, { method: "DELETE" }).catch((e) => {
        if (!gone(e)) throw e;
      });
    },
  };
}

const WHEREBY = "https://api.whereby.dev/v1";
/** A room stays open an hour past the meeting's end, so a meeting that runs over isn't cut off. */
const GRACE = 3_600_000;

export function wherebyClient(ctx: Ctx): VideoClient {
  const auth = { authorization: `Bearer ${ctx.secret("api_key")}` };
  const create = async (m: { start: number; end: number }) => {
    const d = await ctx.api<{ meetingId: string; roomUrl: string }>(`${WHEREBY}/meetings`, {
      method: "POST",
      auth: false,
      headers: auth,
      body: JSON.stringify({ startDate: iso(m.start), endDate: iso(m.end + GRACE), isLocked: false, roomMode: "normal" }),
    });
    if (!d?.meetingId || !d.roomUrl) throw new Error("Whereby didn't make the room.");
    return { id: String(d.meetingId), joinUrl: d.roomUrl };
  };
  const cancel = async (id: string) => {
    await ctx.api(`${WHEREBY}/meetings/${encodeURIComponent(id)}`, { method: "DELETE", auth: false, headers: auth }).catch((e) => {
      if (!gone(e)) throw e;
    });
  };
  return {
    create,
    async move(id, start, end) {
      const made = await create({ start, end });
      await cancel(id).catch(() => undefined);
      return made;
    },
    cancel,
  };
}

export const videoClient = (kind: VideoKind, ctx: Ctx): VideoClient => (kind === "webex" ? webexClient(ctx) : wherebyClient(ctx));
