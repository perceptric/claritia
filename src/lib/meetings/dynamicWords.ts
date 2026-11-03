// Who books a meeting, in one line, for Form Studio's On submission (docs/on-submission.md): a Dynamic meeting's
// rules ("Locations is at least 50 → Enterprise, otherwise anyone on the team"), or an Individual meeting's host.
// The routing stays on the meeting type; the form only shows it. Runs anywhere.

import { condWords, type FieldDef } from "../router/conditions.ts";
import type { Dest, MeetingLite } from "../routing/compile.ts";
import { teamName } from "../routing/teamNames.ts";
import { anyoneOn } from "../words.ts";

type Facts = { fields: FieldDef[]; teams: { name: string; keys: string[] }[]; people: { id: string; name: string }[] };

export function whoBooks(t: Pick<MeetingLite, "hosts" | "settings">, f: Facts): string {
  const person = (id: string) => f.people.find((p) => p.id === id)?.name || "A former teammate";
  const team = (key: string) => {
    const x = f.teams.find((tm) => tm.keys.includes(key));
    return x ? teamName(x) : "a removed team";
  };
  const dest = (d: Dest | null, otherwise: boolean) => (!d ? "nobody" : d.kind === "user" ? person(d.id) : otherwise ? anyoneOn(team(d.id)) : team(d.id));
  const d = t.settings.dynamic ?? (t.settings.team ? { rules: [], otherwise: { kind: "team" as const, id: t.settings.team } } : null);
  if (!d) return t.hosts[0] ? person(t.hosts[0].user_id) : "No host yet";
  const rules = d.rules.filter((r) => r.conds.length).map((r) => `${r.conds.map((c) => condWords(c, f.fields, [])).join(" and ")} → ${dest(r.to, false)}`);
  const line = rules.length ? `${rules.join("; ")}, otherwise ${dest(d.otherwise, true)}` : dest(d.otherwise, true);
  return line.charAt(0).toUpperCase() + line.slice(1);
}
