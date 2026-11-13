// The times a Delay can wait until (docs/email-unify-plan.md, E1): every 15 minutes of the day, as "HH:MM" values (what
// the engine keeps in `at`), shown on the person's own 12 or 24 hour clock. Runs in the browser and on the server.

/** "13:30" as "1:30 PM" or "13:30". */
export function clockLabel(at: string, hour12: boolean): string {
  const m = /^(\d{2}):(\d{2})$/.exec(at);
  if (!m) return at;
  const h = Number(m[1]);
  if (!hour12) return at;
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Every 15 minutes from 00:00 to 23:45, with a value the picker doesn't list (an older 09:10) kept in its place. */
export function timeOptions(hour12: boolean, keep?: string): { value: string; label: string }[] {
  const all = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
  if (keep && /^\d{2}:\d{2}$/.test(keep) && !all.includes(keep)) all.push(keep), all.sort();
  return all.map((value) => ({ value, label: clockLabel(value, hour12) }));
}

/** Whether this browser shows times on a 12 hour clock. */
export function uses12h(): boolean {
  try {
    const c = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
    return c === "h12" || c === "h11";
  } catch {
    return true;
  }
}
