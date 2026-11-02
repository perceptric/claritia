// Teams on Meetings › Availability › Team: the name a team shows, which meetings send to it, and whether a new name
// is too close to one that exists ("Enterprise" and "Enterprise 2" read alike). Runs anywhere.

import { OLD_WHOLE_TEAM, WHOLE_TEAM } from "../words.ts";
import type { MeetingLite } from "./compile.ts";

/** The starting team (q_everyone) reads "Whole team" until migration 114 renames it in the database. */
export const teamName = (t: { name: string; keys: string[] }) => (t.keys.includes("q_everyone") && OLD_WHOLE_TEAM.includes(t.name) ? WHOLE_TEAM : t.name);

/** The meeting types that send to a team: as their whole team (old), a Dynamic rule's team, or where no rule matches. */
export function teamMeetings(keys: string[], types: Pick<MeetingLite, "id" | "name" | "settings">[]): { id: string; name: string }[] {
  const k = new Set(keys);
  return types
    .filter((t) => {
      const d = t.settings.dynamic;
      if (t.settings.team && k.has(t.settings.team)) return true;
      if (d?.otherwise?.kind === "team" && k.has(d.otherwise.id)) return true;
      return !!d?.rules.some((r) => r.to.kind === "team" && k.has(r.to.id));
    })
    .map((t) => ({ id: t.id, name: t.name }));
}

const plain = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const core = (s: string) => plain(s).replace(/(\s*(\d+|team|ii|iii|new|copy))+$/g, "").trim();

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length]!;
}

/**
 * The existing team a new name is too close to, or null: the same words once numbers, "team", "copy" and the like
 * are taken off the end ("Enterprise 2", "Enterprise team"), or one or two letters apart in names of 6 or more.
 * `self`: the team being renamed, left out.
 */
export function closeName(name: string, teams: { id: string; name: string }[], self?: string): string | null {
  const n = core(name);
  if (!n) return null;
  for (const t of teams) {
    if (t.id === self) continue;
    const c = core(t.name);
    if (!c) continue;
    if (c === n || (n.length >= 6 && c.length >= 6 && distance(n, c) <= 2)) return t.name;
  }
  return null;
}
