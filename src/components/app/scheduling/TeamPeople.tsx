"use client";

// Meetings › Availability › Team: everyone in one table (their teams, calendar, hours, today's count against their
// cap, away), with the teams as pills above it. A pill filters the table to that team: its members first, then
// everyone not in it with Add, plus how the team shares leads and which meetings and forms send to it. Away asks
// until when. Teams are Routing's (routing_teams); a person's status and cap are the same in every team.

import { useMemo, useState } from "react";
import type { Availability } from "@/lib/meetings/types";
import { teamMeetings, teamName } from "@/lib/routing/teamNames";
import { rotation } from "@/lib/router/engine";
import { Pencil, Plus, X } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Choice } from "../inbound/parts";
import { Select } from "../Select";
import { EditHours } from "../meetings/TeamCalendars";
import { hoursSummary } from "../meetings/model";
import { providerOf, type Account } from "../meetings/MyCalendar";
import { PersonAvatar, useNow, usePeople, type Person } from "../meetings/parts";
import { useMeetingTypes } from "../meetings/TypesList";
import { capOptions, capWords, repState, withoutToday } from "../reps/model";
import { routingApi } from "../routing/api";
import { StatusPopover, type Patch } from "../routing/Reps";
import { localDate } from "../routing/screensModel";
import { rt, useScreen, type Person as RtPerson, type Team } from "../routing/rt/api";
import { CreateTeam, METHOD_WORDS, usedBy } from "../routing/rt/TeamsTab";
import { toast } from "../routing/Toast";
import { Badge, Button, ErrorNote, IconButton, invalidate, Loading, must, Segmented, Td, Th, Toggle, useQuery, type Role, type ViewProps } from "../ui";

type Method = keyof typeof METHOD_WORDS;

export function TeamPeople(props: ViewProps & { onFix: () => void }) {
  const { sb, session, ws, role, onFix } = props;
  const me = session.user.id;
  const owner = (role as Role) === "owner";
  const people = usePeople(sb, ws.id);
  const screen = useScreen(session, ws.id);
  const types = useMeetingTypes(sb, ws.id);
  const cal = useQuery(`calendar_accounts:${ws.id}:team`, async () => {
    const [accounts, hours] = await Promise.all([
      sb.from("calendar_accounts").select("id, user_id, provider, account_email, status, refreshed_at").eq("workspace_id", ws.id).order("created_at"),
      sb.from("availability").select("user_id, tz, weekly, overrides").eq("workspace_id", ws.id),
    ]);
    return {
      accounts: (must(accounts) ?? []) as Account[],
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
    };
  });
  const [sel, setSel] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [away, setAway] = useState<{ user: string; anchor: HTMLElement } | null>(null);
  const [editing, setEditing] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const now = useNow();
  const today = localDate(now);

  const d = screen.data;
  const rtPeople = useMemo(() => new Map((d?.people ?? []).map((p) => [p.id, p])), [d]);
  const team = d?.teams.find((t) => t.id === sel) ?? null;

  const refresh = () => {
    invalidate(`routing_screen:${ws.id}`);
    invalidate(`routing_reps:${ws.id}`);
    invalidate("app_counts");
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save.");
  /** A team saved with its method and every member's weight, so nothing else about it changes. */
  const saveTeam = async (t: Team, members: string[], method: string, words: string) => {
    setError("");
    try {
      await rt(session, ws.id, "rt_team", { team: t.id, name: t.name, method, members: members.map((u) => ({ user: u, weight: t.members.find((m) => m.user === u)?.weight ?? 1 })), revision: t.revision });
      refresh();
      toast({ text: words });
    } catch (e) {
      fail(e);
    }
  };
  const addTo = (t: Team, u: string) => saveTeam(t, [...t.members.map((m) => m.user), u], t.method, `Added ${nameOf(u)} to ${teamName(t)}`);
  const removeFrom = async (t: Team, u: string) => {
    const live = usedBy(t, d?.policies ?? []).filter((x) => x.live);
    const meetings = teamMeetings(t.keys, types.data ?? []);
    const users = [...live.map((x) => x.name), ...meetings.map((m) => m.name)];
    if (users.length && !(await askConfirm(`Remove ${nameOf(u)} from ${teamName(t)}?`, { body: `${users.join(", ")} ${users.length === 1 ? "sends" : "send"} to this team.`, ok: "Remove" }))) return;
    await saveTeam(t, t.members.filter((m) => m.user !== u).map((m) => m.user), t.method, `Removed ${nameOf(u)} from ${teamName(t)}`);
  };
  const patchPerson = async (u: string, patch: Patch, words: string) => {
    setError("");
    try {
      await screen.mutate(
        (s) => ({ ...s, people: s.people.map((p) => (p.id === u ? ({ ...p, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === "" ? null : v])) } as RtPerson) : p)) }),
        () => routingApi(session, ws.id, "rep", { user: u, patch }),
      );
      refresh();
      toast({ text: words });
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };
  const nameOf = (u: string) => people.data?.byId.get(u)?.name ?? rtPeople.get(u)?.name ?? "them";

  if (screen.error || people.error || cal.error) return <ErrorNote message={screen.error || people.error || cal.error} />;
  if (!d || !people.data || !cal.data || !types.data) return <Loading />;

  const everyone = people.data.list;
  const awayNow = (p?: RtPerson) => !!p && repState(p, now).state !== "in";
  const awayWords = (p?: RtPerson) => {
    if (!p) return "";
    const s = repState(p, now);
    return s.until ? `Back ${new Date(s.until - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : s.state === "paused" ? "Paused" : "Away";
  };
  const teamsOf = (u: string) => d.teams.filter((t) => t.members.some((m) => m.user === u));
  // In a team: its members first, in round-robin order, then everyone else.
  const members = team ? team.members.map((m) => everyone.find((p) => p.id === m.user)).filter((p): p is Person => !!p) : everyone;
  const outside = team ? everyone.filter((p) => !team.members.some((m) => m.user === p.id)) : [];
  const can = (u: string) => {
    const p = rtPeople.get(u);
    return !!p && repState(p, now).state === "in" && !p.out && (p.cap_day === null || p.today < p.cap_day);
  };
  const next = team ? (rotation({ members: team.members.map((m) => ({ ...m })), next: team.next }).find((m) => can(m.user))?.user ?? null) : null;
  const sends = team ? [...usedBy(team, d.policies).map((x) => ({ key: `p${x.name}`, name: x.name })), ...teamMeetings(team.keys, types.data).map((m) => ({ key: m.id, name: m.name }))] : [];

  const row = (p: Person, inTeam: boolean) => {
    const rp = rtPeople.get(p.id);
    const accounts = cal.data!.accounts.filter((a) => a.user_id === p.id);
    const cals = accounts.filter((a) => a.provider !== "zoom");
    const stale = cals.some((a) => a.status === "reconnect");
    const h = cal.data!.hours.get(p.id);
    const mine = p.id === me;
    const mayEdit = owner || mine;
    const isAway = awayNow(rp);
    const theirTeams = teamsOf(p.id);
    const addable = d.teams.filter((t) => !t.members.some((m) => m.user === p.id));
    return (
      <tr key={p.id} className={inTeam ? "" : "[&>td]:bg-paper/60"}>
        <Td className="pl-5">
          <span className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar person={p} size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">
                {p.name}
                {mine ? <span className="font-normal text-muted"> (you)</span> : null}
              </span>
              <span className="truncate text-[12px] text-muted">{team && inTeam && p.id === next ? "Next in line" : p.email}</span>
            </span>
          </span>
        </Td>
        <Td>
          <span className="flex flex-wrap items-center gap-1">
            {theirTeams.map((t) => (
              <button key={t.id} type="button" onClick={() => setSel(t.id)} title={`Show ${teamName(t)}`} className="rounded-full hover:opacity-80">
                <Badge tone={t.id === sel ? "brand" : "gray"}>{teamName(t)}</Badge>
              </button>
            ))}
            {owner && addable.length && !team ? (
              <Select<string>
                ariaLabel={`Add ${p.name} to a team`}
                value=""
                down
                menuWidth={200}
                shown={
                  <span className="inline-flex items-center gap-1">
                    <Plus size={11} />
                    Team
                  </span>
                }
                options={addable.map((t) => ({ value: t.id, label: teamName(t) }))}
                onChange={(id) => {
                  const t = d.teams.find((x) => x.id === id);
                  if (t) void addTo(t, p.id);
                }}
                className="h-6 rounded-full border border-dashed border-line-strong px-2 text-[12px] font-medium text-muted transition-colors duration-[120ms] hover:border-ink/40 hover:text-ink"
              />
            ) : null}
            {!theirTeams.length && !(owner && !team) ? <span className="text-faint">None</span> : null}
          </span>
        </Td>
        <Td>
          <span className="flex items-center gap-2">
            {accounts.map((a) => (
              <span key={a.id} title={`${providerOf(a.provider).name}, ${a.account_email}`}>
                <BrandLogo domain={providerOf(a.provider).domain} name={providerOf(a.provider).name} size={16} />
              </span>
            ))}
            {stale ? (
              <Badge tone="red" dot>
                Reconnect
              </Badge>
            ) : cals.length ? (
              <Badge tone="green" dot>
                Connected
              </Badge>
            ) : (
              <Badge>Not connected</Badge>
            )}
            {!cals.length || stale ? (
              mine ? (
                <Button size="sm" variant="ghost" className="h-7" onClick={onFix}>
                  {cals.length ? "Reconnect" : "Connect"}
                </Button>
              ) : (
                <a
                  href={`mailto:${p.email}?subject=${encodeURIComponent("Connect your calendar in Claritia")}&body=${encodeURIComponent(`Hi ${p.name.split(/\s+/)[0] || p.name}, please ${cals.length ? "reconnect" : "connect"} your calendar in Claritia (Meetings, Availability) so people can book time with you.`)}`}
                  className="press inline-flex h-7 items-center rounded-full border border-line-strong px-2.5 text-[12px] font-medium text-ink hover:border-ink/40"
                >
                  Ask
                </a>
              )
            ) : null}
          </span>
        </Td>
        <Td className="min-w-[200px] max-w-[280px]">
          {h ? (
            <span className="flex flex-col py-1.5 whitespace-normal">
              <span className="text-[13px] text-ink">{hoursSummary(h.weekly)}</span>
              <span className="text-[12px] text-muted">{h.tz.replace(/_/g, " ")}</span>
            </span>
          ) : (
            <span className="text-faint">Not set</span>
          )}
        </Td>
        <Td className="tabular-nums">
          {rp ? (
            owner ? (
              <Choice<string>
                label={`${p.name}'s daily cap`}
                look="word"
                value={String(rp.cap_day ?? "none")}
                shown={rp.cap_day === null ? `${rp.today}, no cap` : `${rp.today} of ${rp.cap_day}`}
                options={capOptions(rp.cap_day).map((c) => ({ value: String(c ?? "none"), label: capWords(c) }))}
                onChange={(v) => void patchPerson(p.id, { cap_day: v === "none" ? null : Number(v) }, "Saved")}
              />
            ) : rp.cap_day === null ? (
              `${rp.today}, no cap`
            ) : (
              `${rp.today} of ${rp.cap_day}`
            )
          ) : (
            <span className="text-faint">0</span>
          )}
        </Td>
        <Td>
          <span className="flex items-center gap-2" data-away={p.id}>
            <Toggle
              label={`${p.name} away`}
              on={isAway}
              disabled={!mayEdit || !rp}
              onChange={(v) => {
                if (!rp) return;
                // On asks until when; off brings them back today.
                if (v) setAway({ user: p.id, anchor: document.querySelector(`[data-away="${p.id}"]`) as HTMLElement });
                else void patchPerson(p.id, { paused_until: "", out_dates: withoutToday(rp.out_dates, today) }, `${p.name} is back`);
              }}
            />
            {isAway ? <span className="text-[12px] text-muted">{awayWords(rp)}</span> : null}
          </span>
        </Td>
        <Td className="pr-3">
          <span className="flex items-center justify-end gap-0.5">
            {!inTeam && team && owner ? (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => void addTo(team, p.id)}>
                <Plus size={12} />
                Add
              </Button>
            ) : null}
            {owner ? (
              <IconButton label={`Edit ${p.name}'s hours`} onClick={() => setEditing(p)}>
                <Pencil size={13} />
              </IconButton>
            ) : null}
            {inTeam && team && owner ? (
              <IconButton label={`Remove ${p.name} from ${teamName(team)}`} onClick={() => void removeFrom(team, p.id)}>
                <X size={13} />
              </IconButton>
            ) : null}
          </span>
        </Td>
      </tr>
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Teams" className="flex flex-wrap gap-2">
          {[{ id: "all", name: "Everyone", n: everyone.length }, ...d.teams.map((t) => ({ id: t.id, name: teamName(t), n: t.members.length }))].map((o) => (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={o.id === sel}
              onClick={() => setSel(o.id)}
              className={`press inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-[120ms] ${o.id === sel ? "bg-ink text-paper" : "border border-line-strong bg-card text-ink hover:bg-hover"}`}
            >
              {o.name}
              <span className={`tabular-nums ${o.id === sel ? "opacity-70" : "text-faint"}`}>{o.n}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        {owner ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={13} />
            Create team
          </Button>
        ) : null}
      </div>

      {team ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[12.5px] text-muted">{sends.length ? "Used by" : "Not used by any meeting or form yet"}</span>
          {sends.map((s) => (
            <Badge key={s.key}>{s.name}</Badge>
          ))}
          <span className="flex-1" />
          <Segmented<Method>
            size="sm"
            label="How the team shares"
            value={(team.method in METHOD_WORDS ? team.method : "rr") as Method}
            options={(Object.keys(METHOD_WORDS) as Method[]).map((m) => ({ value: m, label: METHOD_WORDS[m], disabled: !owner }))}
            onChange={(m) => owner && m !== team.method && void saveTeam(team, team.members.map((x) => x.user), m, `${teamName(team)}: ${METHOD_WORDS[m].toLowerCase()}`)}
          />
        </div>
      ) : null}

      <ErrorNote message={error} />
      <div className="overflow-x-auto rounded-lg bg-card shadow-rest">
        <table className="w-full min-w-[860px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <Th className="pl-5">Person</Th>
              <Th>Teams</Th>
              <Th>Calendar</Th>
              <Th>Hours</Th>
              <Th>Today</Th>
              <Th>Away</Th>
              <Th className="w-[96px]">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {members.map((p) => row(p, true))}
            {team && !members.length ? (
              <tr>
                <td colSpan={7} className="border-b border-line-light px-5 py-3 text-[13px] text-muted">
                  Nobody in {teamName(team)} yet
                </td>
              </tr>
            ) : null}
            {team && outside.length ? (
              <>
                <tr>
                  <td colSpan={7} className="border-b border-line-light bg-paper px-5 py-1.5 text-[11.5px] font-medium text-muted">
                    Not in {teamName(team)}
                  </td>
                </tr>
                {outside.map((p) => row(p, false))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>

      {away ? (
        <StatusPopover
          anchor={away.anchor}
          rep={(() => {
            const p = rtPeople.get(away.user);
            return p ? { user_id: p.id, paused_until: p.paused_until, out_dates: p.out_dates, backup: p.backup, cap_day: p.cap_day, cap_week: p.cap_week } : undefined;
          })()}
          onClose={() => setAway(null)}
          onSave={async (patch) => {
            if (await patchPerson(away.user, patch, "Saved")) setAway(null);
          }}
        />
      ) : null}
      {editing ? (
        <EditHours
          session={session}
          ws={ws.id}
          person={editing}
          saved={cal.data.hours.get(editing.id) ?? null}
          onClose={() => setEditing(null)}
          onSaved={(a: Availability) => {
            const who = editing.id;
            setEditing(null);
            cal.set((x) => ({ ...x, hours: new Map(x.hours).set(who, { user_id: who, ...a }) }));
            invalidate("meeting_types");
          }}
        />
      ) : null}
      {creating ? (
        <CreateTeam
          people={d.people}
          teams={d.teams.map((t) => ({ id: t.id, name: teamName(t) }))}
          onClose={() => setCreating(false)}
          onCreate={async (name, ids) => {
            const out = await rt<{ id: string }>(session, ws.id, "rt_team", { name, members: ids, method: "rr" });
            refresh();
            setCreating(false);
            toast({ text: `Created ${name}` });
            setSel(out.id);
          }}
        />
      ) : null}
    </section>
  );
}
