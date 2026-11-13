// A guest's own calendar on a booking page (docs/booking-page-plan.md, Part 6): after they sign in with Google or
// Microsoft in a small window, their busy times for the next weeks are read once and handed to the page that opened
// the window, so the times that clash with their day are marked. Nothing is stored: no token, no times.

export type Busy = [number, number];
export const OVERLAY_DAYS = 62;
export const OVERLAY_KINDS = { google: "guest_google", microsoft: "guest_microsoft" } as const;

/** The page origins a busy list may go to: the app's and the booking site's (tryclaritia.com). */
export function overlayOrigins(app: string): string[] {
  const out = new Set<string>();
  for (const u of [app, app.replace(/^(https?:\/\/)app\./, "$1")]) {
    try {
      out.add(new URL(u).origin);
    } catch {}
  }
  return [...out];
}

/** Busy spans, cleaned: numbers, in order, merged, at most 2,000. */
export function cleanBusy(raw: unknown): Busy[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((x) => (Array.isArray(x) ? [Number(x[0]), Number(x[1])] : [NaN, NaN]) as Busy)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: Busy[] = [];
  for (const [a, b] of list) {
    const last = out.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out.slice(0, 2000);
}

/** Whether a meeting from `start` for `length` minutes overlaps a busy span. */
export function clashes(busy: Busy[], start: number, length: number): boolean {
  const end = start + length * 60_000;
  return busy.some(([a, b]) => a < end && b > start);
}

/** Google's free/busy answer to spans. */
export function googleBusy(j: unknown): Busy[] {
  const cals = ((j as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> })?.calendars ?? {}) as Record<string, { busy?: { start: string; end: string }[] }>;
  return cleanBusy(Object.values(cals).flatMap((c) => (c.busy ?? []).map((b) => [Date.parse(b.start), Date.parse(b.end)])));
}

/** Microsoft's calendar view (UTC times) to spans; free and working-elsewhere events don't count. */
export function microsoftBusy(events: unknown[]): Busy[] {
  const t = (v: { dateTime?: string } | undefined) => (v?.dateTime ? Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(v.dateTime) ? v.dateTime : `${v.dateTime}Z`) : NaN);
  return cleanBusy(
    events
      .map((e) => e as { showAs?: string; start?: { dateTime?: string }; end?: { dateTime?: string } })
      .filter((e) => e.showAs !== "free" && e.showAs !== "workingElsewhere")
      .map((e) => [t(e.start), t(e.end)]),
  );
}
