// Zoom (docs/meetings-scheduler.md 1.1): a meeting made with the host's own Zoom account when a type's location is
// Zoom; its join link goes on the calendar event. Zoom has no idempotency key, so the worker saves the meeting id
// the moment it's made and reuses it on a retry.

import { iso, makeHttp, type HttpOpts, type Tok } from "./http.ts";
import type { ZoomClient } from "./types.ts";

const API = "https://api.zoom.us/v2";

export function zoomClient(token: Tok | null, o: HttpOpts = {}): ZoomClient {
  const http = makeHttp("zoom", token, o);
  const minutes = (start: number, end: number) => Math.max(1, Math.round((end - start) / 60_000));
  return {
    async create(m) {
      const { data } = await http<{ id: number | string; join_url: string }>(`${API}/users/me/meetings`, {
        method: "POST",
        body: JSON.stringify({ topic: m.topic.slice(0, 200), type: 2, start_time: iso(m.start), duration: minutes(m.start, m.end), timezone: "UTC" }),
      });
      return { id: String(data.id), joinUrl: data.join_url };
    },
    async move(id, start, end) {
      await http(`${API}/meetings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ start_time: iso(start), duration: minutes(start, end), timezone: "UTC" }) });
    },
    async cancel(id) {
      await http(`${API}/meetings/${encodeURIComponent(id)}`, { method: "DELETE", ok404: true });
    },
    // meeting:write alone may not read the profile; the caller falls back to the person's own email.
    async email() {
      const r = await http<{ email?: string }>(`${API}/users/me`).catch(() => null);
      return r?.data.email ?? null;
    },
  };
}
