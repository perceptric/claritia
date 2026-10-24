// What changed between two versions, as sentences (docs/router-ux.md 4.5): shown on Publish and Compare.

import { ruleWords, type FieldDef } from "./conditions.ts";
import { minutesWords } from "./explain.ts";
import { defaultSla, type Method, type RouterBody, type Sla } from "./types.ts";

const METHOD_WORDS: Record<Method, string> = { rr: "take turns", weighted: "some get more", load: "fewest meetings first" };

export type Change = { sign: "+" | "-" | "~"; text: string };

const onOff = (v: boolean) => (v ? "on" : "off");

export function diffBodies(from: RouterBody | null, to: RouterBody, o: { names?: Record<string, string>; fields?: FieldDef[] } = {}): Change[] {
  const out: Change[] = [];
  const who = (id: string) => o.names?.[id] ?? "a teammate";
  const fields = o.fields ?? [];
  if (!from) return [{ sign: "+", text: "First version" }];

  const flags: [string, boolean, boolean][] = [
    ["Filter out junk", from.spam.on, to.spam.on],
    ["Throwaway email check", from.spam.disposable, to.spam.disposable],
    ["Fake name check", from.spam.fakeName, to.spam.fakeName],
    ["Too many fills check", from.spam.tooMany, to.spam.tooMany],
    ["Personal email check", from.spam.freeMail, to.spam.freeMail],
    ["Same company, same rep", from.account.on, to.account.on],
    ["Opportunity owner first", from.account.oppFirst, to.account.oppFirst],
    ["Set the company owner", from.account.setCompanyOwner, to.account.setCompanyOwner],
    ["Keep their rep", from.keep.on, to.keep.on],
    ["Rules", from.rules.on, to.rules.on],
  ];
  for (const [label, a, b] of flags) if (a !== b) out.push({ sign: "~", text: `${label} ${onOff(a)} → ${onOff(b)}` });
  if (from.spam.maxPerHour !== to.spam.maxPerHour) out.push({ sign: "~", text: `Fills an hour before holding ${from.spam.maxPerHour} → ${to.spam.maxPerHour}` });
  if (from.keep.whenOut !== to.keep.whenOut) {
    const w = { keep: "wait for them", backup: "whoever covers", route: "send on to a team" } as const;
    out.push({ sign: "~", text: `When their rep is away: ${w[from.keep.whenOut]} → ${w[to.keep.whenOut]}` });
  }

  const qName = (b: RouterBody, id: string) => b.queues.find((q) => q.id === id)?.name ?? "a removed queue";
  const fromRules = new Map(from.rules.list.map((r, i) => [r.id, { r, i }]));
  const toRules = new Map(to.rules.list.map((r, i) => [r.id, { r, i }]));
  for (const [id, { r, i }] of toRules) {
    const old = fromRules.get(id);
    if (!old) out.push({ sign: "+", text: `Rule "${r.name}" (${i + 1}${["st", "nd", "rd"][i] ?? "th"}) → ${qName(to, r.queue)}` });
    else {
      if (old.r.name !== r.name) out.push({ sign: "~", text: `Rule "${old.r.name}" renamed "${r.name}"` });
      const a = ruleWords(old.r, fields, from.territories);
      const b = ruleWords(r, fields, to.territories);
      if (a !== b) out.push({ sign: "~", text: `"${r.name}": ${b}` });
      if (old.r.queue !== r.queue) out.push({ sign: "~", text: `"${r.name}" sends to ${qName(to, r.queue)}` });
      if ((old.r.on !== false) !== (r.on !== false)) out.push({ sign: "~", text: `"${r.name}" ${onOff(r.on !== false)}` });
      if (old.i !== i) out.push({ sign: "~", text: `"${r.name}" moved to ${i + 1}${["st", "nd", "rd"][i] ?? "th"}` });
    }
  }
  for (const [id, { r }] of fromRules) if (!toRules.has(id)) out.push({ sign: "-", text: `Rule "${r.name}"` });

  const fromQ = new Map(from.queues.map((q) => [q.id, q]));
  for (const q of to.queues) {
    const old = fromQ.get(q.id);
    if (!old) {
      out.push({ sign: "+", text: `Team ${q.name} with ${q.members.map((m) => who(m.user)).join(", ") || "no reps"}` });
      continue;
    }
    if (old.name !== q.name) out.push({ sign: "~", text: `Team ${old.name} renamed ${q.name}` });
    if (old.method !== q.method) out.push({ sign: "~", text: `${q.name}: ${METHOD_WORDS[old.method]} → ${METHOD_WORDS[q.method]}` });
    if (old.strict !== q.strict) out.push({ sign: "~", text: `${q.name}: keep the order ${onOff(q.strict)}` });
    if (old.hoursOnly !== q.hoursOnly) out.push({ sign: "~", text: `${q.name}: only during working hours ${onOff(q.hoursOnly)}` });
    const om = new Map(old.members.map((m) => [m.user, m.weight]));
    const nm = new Map(q.members.map((m) => [m.user, m.weight]));
    for (const [u, w] of nm) {
      if (!om.has(u)) out.push({ sign: "+", text: `${who(u)} in ${q.name}` });
      else if (om.get(u) !== w && q.method === "weighted") out.push({ sign: "~", text: `${who(u)} weight ${om.get(u)} → ${w} in ${q.name}` });
    }
    for (const u of om.keys()) if (!nm.has(u)) out.push({ sign: "-", text: `${who(u)} from ${q.name}` });
  }
  for (const q of from.queues) if (!to.queues.some((x) => x.id === q.id)) out.push({ sign: "-", text: `Team ${q.name}` });

  const fb = (b: RouterBody) => (!b.fallback ? "none" : b.fallback.kind === "user" ? who(b.fallback.id) : qName(b, b.fallback.id));
  if (fb(from) !== fb(to)) out.push({ sign: "~", text: `Everyone else goes to ${fb(from)} → ${fb(to)}` });

  const ft = new Map(from.territories.map((t) => [t.id, t]));
  for (const t of to.territories) {
    const old = ft.get(t.id);
    if (!old) out.push({ sign: "+", text: `Region ${t.name}` });
    else if (old.name !== t.name || old.countries.join() !== t.countries.join()) out.push({ sign: "~", text: `Region ${t.name}` });
  }
  for (const t of from.territories) if (!to.territories.some((x) => x.id === t.id)) out.push({ sign: "-", text: `Region ${t.name}` });

  const fs = new Map((from.segments ?? []).map((x) => [x.id, x]));
  for (const x of to.segments ?? []) {
    const old = fs.get(x.id);
    if (!old) out.push({ sign: "+", text: `Company type ${x.name}` });
    else if (old.name !== x.name) out.push({ sign: "~", text: `Company type ${old.name} renamed ${x.name}` });
    else if (JSON.stringify(old.conds) !== JSON.stringify(x.conds) || old.match !== x.match) out.push({ sign: "~", text: `Company type ${x.name}: ${ruleWords({ ...x, queue: "" }, fields, to.territories)}` });
  }
  for (const x of from.segments ?? []) if (!(to.segments ?? []).some((y) => y.id === x.id)) out.push({ sign: "-", text: `Company type ${x.name}` });

  const slaWords = (x: Sla) =>
    !x.on ? "off" : `${minutesWords(x.minutes)}, then ${x.next === "route" ? "someone else" : x.next === "manager" ? `${x.manager ? who(x.manager) : "the manager"}` : "a reminder"}${x.nudge ? `, reminder at ${minutesWords(x.nudge)}` : ""}`;
  const sa = slaWords(from.sla ?? defaultSla());
  const sb = slaWords(to.sla ?? defaultSla());
  if (sa !== sb) out.push({ sign: "~", text: `Follow-up time ${sa} → ${sb}` });
  return out;
}
