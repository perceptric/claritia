// Warm-up for new sending domains (docs/email-studio-plan.md Part 10, migration 155): 500 a day the first week, then
// twice as many each week, and no cap from week 8. The same rule as domain_warm_cap, so the Send panel can say how
// many days a big first campaign takes before it sends.

const WEEK = 7 * 86_400_000;

/** The day's cap for a domain verified at `since`, or null once it's warm. */
export function warmCap(since: number, at: number): number | null {
  const weeks = Math.max(Math.floor((at - since) / WEEK), 0);
  return weeks >= 7 ? null : 500 * 2 ** weeks;
}

/** How many days `ready` people take to reach, with `leftToday` left today: 1 means it all goes today. */
export function warmDays(ready: number, warm: { since: string; left_today: number } | null | undefined, now: number): { days: number; last: Date } {
  if (!warm || ready <= warm.left_today) return { days: 1, last: new Date(now) };
  const since = Date.parse(warm.since);
  let left = ready - warm.left_today;
  for (let day = 1; day <= 90; day++) {
    const at = now + day * 86_400_000;
    const cap = warmCap(since, at);
    left -= cap ?? left;
    if (left <= 0) return { days: day + 1, last: new Date(at) };
  }
  return { days: 91, last: new Date(now + 90 * 86_400_000) };
}
