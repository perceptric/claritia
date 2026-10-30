"use client";

// Routing › Teams: one team at a time, picked from the pills at the top. Where its leads come from (the rules and the
// fallback that send to it), an amber note when nobody is in it, its people (who's next, who's skipped and why,
// today's leads against their limit, their calendar), how it shares leads, and the next five leads by the engine's
// own pick. Changes join the draft; they go live with Publish on Rules. A team's other settings (keep the order,
// work hours only, shares, its name, delete) open in the side sheet from "More".

import { useEffect, useMemo, useState } from "react";
import { ruleWords, withSegments } from "@/lib/router/conditions";
import { cleanBody, newId } from "@/lib/router/check";
import type { Method } from "@/lib/router/types";
import { ArrowRight, Plus, X } from "../../Icons";
import { Sheet } from "../Sheet";
import { PersonAvatar, usePeople } from "../meetings/parts";
import { Badge, Button, ErrorNote, IconButton, Loading, must, Page, useQuery, type ViewProps } from "../ui";
import { Alert, Card, CardRow, CardTitle, Choice, Column, NextTag, TD, TH, Title, Who } from "../inbound/parts";
import { useRepsData } from "../reps/RepsView";
import { repState, teamLine } from "../reps/model";
import { addMember, addQueue, removeMember } from "./editorModel";
import { Inspector } from "./Inspector";
import { pausedMs, repStatus, weekStart } from "./screensModel";
import { nextLeads, type RepNow } from "./setupModel";
import { useRouterData } from "./useRouterData";

export function TeamsTab(props: ViewProps) {
  const { sb, session, ws, role } = props;
  const owner = role === "owner";
  const r = useRouterData(session, ws.id);
  const people = usePeople(sb, ws.id);
  const reps = useRepsData(sb, ws.id);
  // Leads each rep took in each team over 30 days, counted by the database.
  const turns = useQuery(`router_runs:${ws.id}:turns`, async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = (must(await sb.rpc("routing_team_turns", { p_ws: ws.id, p_since: since })) ?? []) as { queue_id: string; owner: string; n: number }[];
    const out = new Map<string, Map<string, number>>();
    for (const x of rows) out.set(x.queue_id, (out.get(x.queue_id) ?? new Map<string, number>()).set(x.owner, x.n));
    return out;
  });
  // Meetings this week by host, for "Fewest meetings first".
  const meetings = useQuery(`meetings:${ws.id}:week:hosts`, async () => {
    const from = weekStart();
    const rows = (must(await sb.from("meetings").select("hosts").eq("workspace_id", ws.id).in("status", ["booked", "held"]).gte("start_at", new Date(from).toISOString()).lt("start_at", new Date(from + 7 * 86_400_000).toISOString())) ?? []) as { hosts: string[] | null }[];
    const out = new Map<string, number>();
    for (const m of rows) for (const h of m.hosts ?? []) out.set(h, (out.get(h) ?? 0) + 1);
    return out;
  });
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const body = r.body;
  const queues = useMemo(() => body?.queues ?? [], [body]);
  const t = queues.find((q) => q.id === open) ?? queues[0] ?? null;
  const name = (id: string) => people.data?.byId.get(id)?.name ?? r.data?.members.find((m) => m.id === id)?.name ?? "Former teammate";
  const first = (id: string) => name(id).split(" ")[0];

  const newTeam = () => {
    const id = newId("q_");
    setOpen(id);
    void r.change((b) => addQueue(b, id));
  };
  // "New team" from the Create menu (/routing/teams?create=1).
  const [asked] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("create") === "1");
  const ready = !!r.data && owner;
  useEffect(() => {
    if (!asked || !ready) return;
    window.history.replaceState(null, "", window.location.pathname);
    const id = newId("q_");
    const timer = setTimeout(() => {
      setOpen(id);
      void r.change((b) => addQueue(b, id));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, ready]);

  const [now] = useState(() => Date.now());
  const repNow = useMemo(() => {
    const m = new Map<string, RepNow>();
    for (const p of people.data?.list ?? []) {
      const row = reps.data?.reps.get(p.id);
      const s = repStatus(row, now);
      const paused = pausedMs(row?.paused_until);
      m.set(p.id, { pausedUntil: paused, outUntil: s.kind === "out" ? s.until : null, capDay: row?.cap_day ?? null, today: reps.data?.counts.get(p.id)?.today ?? 0, meetingsWeek: meetings.data?.get(p.id) ?? 0 });
    }
    return m;
  }, [people.data, reps.data, meetings.data, now]);

  const fields = r.data ? withSegments(r.data.fields, body?.segments) : [];
  const used = t && body ? [...(body.rules.on ? body.rules.list.filter((x) => x.on !== false && (x.then ?? "queue") === "queue" && x.queue === t.id).map((x) => ruleWords(x, fields, body.territories)) : []), ...(body.fallback?.kind === "queue" && body.fallback.id === t.id ? ["When no rule fits"] : [])] : [];
  const five = t ? nextLeads(t, { turns: turns.data?.get(t.id), reps: repNow, now }, 5) : [];
  const nx = five[0] ?? null;
  const others = (people.data?.list ?? []).filter((p) => t && !t.members.some((m) => m.user === p.id));
  const set = (method: Method) => t && void r.change((b) => ({ ...b, queues: b.queues.map((x) => (x.id === t.id ? { ...x, method } : x)) }));
  const turnWords = t && t.members.length ? [...t.members.slice(0, 3).map((m) => first(m.user)), first(t.members[0]!.user)].join(", then ").replace(/, then ([^,]*)$/, ", then $1 again") : "Everyone gets the same number";

  return (
    <Page
      title="Routing"
      badge={r.data ? r.data.live && !r.data.draft && !r.data.paused ? <Badge tone="green" dot>Live</Badge> : <Badge tone="amber" dot>Draft</Badge> : null}
      actions={
        owner ? (
          <Button variant="ghost" onClick={newTeam} disabled={!r.data || r.saving}>
            <Plus size={13} />
            New team
          </Button>
        ) : null
      }
      flush
    >
      <Column>
        <ErrorNote message={r.error || people.error || reps.error} />
        {!r.data ? (
          <Loading />
        ) : !t ? (
          <p className="py-10 text-center text-[13.5px] text-muted">No teams yet</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {queues.map((q) => (
                <Button key={q.id} variant={q.id === t.id ? "primary" : "ghost"} onClick={() => setOpen(q.id)}>
                  {q.name}
                  <span className="opacity-60 tabular-nums">{q.members.length}</span>
                </Button>
              ))}
            </div>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <Title>{t.name}</Title>
              </div>
              <button type="button" onClick={() => setSheet(true)} className="text-[12px] text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
                More
              </button>
            </div>
            <p className="-mt-2 text-muted">
              {used.length ? (
                <>
                  Gets leads from:{" "}
                  {used.map((u, i) => (
                    <span key={u}>
                      {i ? ", " : ""}
                      <b className="font-medium text-ink">{u}</b>
                    </span>
                  ))}
                </>
              ) : (
                "No step sends leads here yet"
              )}
            </p>
            {!t.members.length ? <Alert>This team has nobody in it. Its leads go to &quot;When no rule fits&quot;.</Alert> : null}
            <Card>
              <CardTitle title="People in this team">
                {owner ? (
                  <Choice<string>
                    label="Add rep"
                    value=""
                    align="right"
                    disabled={r.saving || !others.length}
                    shown={
                      <span className="inline-flex items-center gap-1">
                        <Plus size={12} />
                        Add rep
                      </span>
                    }
                    options={others.map((p) => ({ value: p.id, label: p.name }))}
                    onChange={(u) => void r.change((b) => addMember(b, t.id, u))}
                  />
                ) : null}
              </CardTitle>
              {t.members.length ? (
                <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
                  <thead>
                    <tr>
                      <th className={TH}>Rep</th>
                      <th className={TH}>Today</th>
                      <th className={`${TH} max-md:hidden`}>Calendar</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {t.members.map((m) => {
                      const row = reps.data?.reps.get(m.user);
                      const st = repState(row, now);
                      const today = reps.data?.counts.get(m.user)?.today ?? 0;
                      const cap = row?.cap_day ?? null;
                      return (
                        <tr key={m.user}>
                          <td className={TD}>
                            <Who person={people.data?.byId.get(m.user)} name={name(m.user)} after={nx === m.user ? <NextTag /> : null} line={teamLine({ state: st.state, until: st.until, today, cap })} />
                          </td>
                          <td className={`${TD} text-[15px] tabular-nums`}>
                            {today}
                            {cap !== null ? <span className="text-muted"> of {cap}</span> : null}
                          </td>
                          <td className={`${TD} max-md:hidden`}>
                            {reps.data?.calendar.has(m.user) ? (
                              <Badge tone="green" dot>
                                Connected
                              </Badge>
                            ) : (
                              <Badge tone="amber" dot>
                                Not connected
                              </Badge>
                            )}
                          </td>
                          <td className={`${TD} w-10`}>
                            {owner ? (
                              <IconButton label="Remove from team" onClick={() => void r.change((b) => removeMember(b, t.id, m.user))}>
                                <X size={13} />
                              </IconButton>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center text-muted">
                  <b className="font-medium text-ink">Nobody yet</b>
                  <span>Add the reps who should get these leads</span>
                </div>
              )}
            </Card>
            <Card>
              <CardRow label="How leads are shared">
                <Choice<Method>
                  label="How leads are shared"
                  value={t.method}
                  width={200}
                  align="right"
                  disabled={!owner || r.saving}
                  options={[
                    { value: "rr", label: "Take turns", hint: turnWords },
                    ...(t.method === "weighted" ? [{ value: "weighted" as const, label: "Some get more", hint: "Each rep's share is set in More" }] : []),
                    { value: "load", label: "Fewest meetings first", hint: "The rep with the fewest meetings this week goes next" },
                  ]}
                  onChange={set}
                />
              </CardRow>
              {five.length ? (
                <CardRow label="The next 5 leads go to">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {five.map((u, i) => (
                      <span key={i} className="flex items-center gap-1.5">
                        {i ? <ArrowRight size={11} className="text-muted" /> : null}
                        <span className="flex flex-col items-center gap-[3px] text-[10.5px] text-muted">
                          <PersonAvatar person={people.data?.byId.get(u)} label={name(u)} size={20} />
                          {first(u)}
                        </span>
                      </span>
                    ))}
                  </span>
                </CardRow>
              ) : null}
            </Card>
          </>
        )}
      </Column>
      {sheet && t && body && r.data ? (
        <Sheet title={t.name} onClose={() => setSheet(false)}>
          <Inspector
            sel={{ kind: "queue", id: t.id }}
            body={body}
            edit={(fn) => void r.change((b) => cleanBody(fn(b)))}
            readOnly={!owner}
            members={r.data.members}
            fields={fields}
            forms={r.data.forms}
            meetings={r.data.meetings ?? []}
            counts={null}
            problems={r.data.problems}
            lists={r.data.lists}
            onSelect={(s) => s.kind !== "queue" && setSheet(false)}
          />
        </Sheet>
      ) : null}
    </Page>
  );
}
