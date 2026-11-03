// Deal 20 leads (docs/router-ux-v2.md Part 11): made-up leads run through one team in memory with the engine's own
// pick, the counts going up after each one, so a team card can show how it shares leads. Nothing is written.

import { pickInQueue } from "./engine.ts";
import type { Facts, Queue, RepFacts } from "./types.ts";

const rep = (name: string, meetingsWeek = 0): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek, inHours: true });

/**
 * The rep each of `n` leads would go to, in order, starting from even counts. `meetings`: each rep's meetings this
 * week, for "Fewest meetings first" (a lead that books adds one). `away`: reps who can't take leads now.
 */
export function dealPreview(q: Queue, n: number, o: { meetings?: Record<string, number>; away?: string[]; now?: number } = {}): string[] {
  const now = o.now ?? 0;
  const reps: Record<string, RepFacts> = {};
  for (const m of q.members) reps[m.user] = { ...rep(m.user, o.meetings?.[m.user] ?? 0), ...(o.away?.includes(m.user) ? { pausedUntil: Infinity } : {}) };
  const counts: Facts["counts"] = { [q.id]: {} };
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, 200); i++) {
    const f: Facts = { now, lead: { id: "", name: "", email: null, emailClass: null, domain: null, firstName: null, lastName: null, recent: 0, disposable: false }, values: {}, owner: null, company: null, reps, counts, lists: { allow: [], block: [] } };
    const p = pickInQueue(q, f);
    if (!p.picked) break;
    const u = p.picked.user;
    out.push(u);
    const c = counts[q.id]![u] ?? { n: 0, last: 0 };
    counts[q.id]![u] = { n: c.n + 1, last: i + 1 };
    if (q.method === "load") reps[u] = { ...reps[u]!, meetingsWeek: reps[u]!.meetingsWeek + 1 };
  }
  return out;
}
