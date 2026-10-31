"use client";

// Routing › Teams (docs/routing-workflow.md Section 12): reusable teams as pills; the open team's members in their
// stable order with their status (Accepting leads, Paused, Out of office with dates and zone), today's committed count
// against their daily cap, their calendar and who is next in the round robin; which policies use the team; add and
// remove members (the queue keeps its place); Create team. A member's status and cap are workspace-wide: they apply
// in every team, and the screen says so. Working hours and time off open the availability editor.

import { useMemo, useState } from "react";
import { rotation } from "@/lib/router/engine";
import type { RouterBody } from "@/lib/router/types";
import { ruleDest } from "@/lib/routing/screenModel";
import { Plus, X } from "../../../Icons";
import { askConfirm } from "../../Dialogs";
import { Choice } from "../../inbound/parts";
import { Modal, useNow } from "../../meetings/parts";
import { capOptions, capWords, repState, withoutToday } from "../../reps/model";
import { Badge, Button, Empty, ErrorNote, IconButton, Input, invalidate, Page, type ViewProps } from "../../ui";
import { routingApi } from "../api";
import { StatusPopover, type Patch } from "../Reps";
import { ConnectButton } from "../SalesReps";
import { localDate } from "../screensModel";
import { RouteSketch } from "../screenParts";
import { toast } from "../Toast";
import { rt, type Person, type Screen, type Team } from "./api";
import { Initials, Pills } from "./parts";

type Q = { data: Screen | null; reload: () => void; mutate: <R>(change: (prev: Screen) => Screen, write: () => Promise<R>) => Promise<R> };

/** The policies that send leads to a team, and how: "Inbound sales (1 rule)". Published config first, then the draft. */
export function usedBy(t: Team, policies: Screen["policies"]): { name: string; uses: string; live: boolean }[] {
  const keys = new Set(t.keys);
  const out: { name: string; uses: string; live: boolean }[] = [];
  for (const p of policies) {
    if (p.archived) continue;
    const b: RouterBody | null = p.draft ?? p.live;
    if (!b) continue;
    const rules = b.rules.list.filter((r) => {
      const d = ruleDest(r);
      return d?.kind === "team" && keys.has(d.key);
    }).length;
    const parts = [rules ? `${rules} ${rules === 1 ? "rule" : "rules"}` : null, b.fallback?.kind === "queue" && keys.has(b.fallback.id) ? "Everyone else" : null, b.backup?.kind === "queue" && keys.has(b.backup.id) ? "backup" : null].filter(Boolean);
    if (parts.length) out.push({ name: p.draft_name ?? p.name, uses: parts.join(", "), live: !!p.active_version });
  }
  return out;
}

export function TeamsTab({ session, ws, navigate, screen, teamId }: ViewProps & { screen: Q; teamId: string | null }) {
  const d = screen.data!;
  const owner = d.role === "owner";
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [away, setAway] = useState<{ user: string; anchor: HTMLElement } | null>(null);
  const team = d.teams.find((t) => t.id === teamId) ?? d.teams[0] ?? null;
  const people = useMemo(() => new Map(d.people.map((p) => [p.id, p])), [d.people]);

  const saveTeam = async (t: Team, members: string[], words: string) => {
    setError("");
    try {
      await rt(session, ws.id, "rt_team", { team: t.id, name: t.name, members, revision: t.revision });
      invalidate(`routing_screen:${ws.id}`);
      toast({ text: words });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the team.");
    }
  };
  const saveMember = async (user: string, patch: Patch, words: string) => {
    setError("");
    try {
      await screen.mutate(
        (s) => ({ ...s, people: s.people.map((p) => (p.id === user ? ({ ...p, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === "" ? null : v])) } as Person) : p)) }),
        () => routingApi(session, ws.id, "rep", { user, patch }),
      );
      invalidate(`routing_screen:${ws.id}`);
      invalidate(`routing_reps:${ws.id}`);
      invalidate("app_counts");
      toast({ text: words });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      return false;
    }
  };

  const zone = d.people.find((p) => p.id === d.me)?.tz ?? "UTC";
  return (
    <Page
      title="Routing"
      flush
      actions={
        owner ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={13} />
            Create team
          </Button>
        ) : null
      }
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3.5 px-4 py-5 text-[13px] md:px-6">
        <ErrorNote message={error} />
        {!team ? (
          <Empty sketch={<RouteSketch size={120} />} title="Add your first team">
            Teams share leads in turn.
          </Empty>
        ) : (
          <>
            <Pills label="Teams" value={team.id} options={d.teams.map((t) => ({ value: t.id, label: t.name, count: t.members.length }))} onChange={(id) => navigate("routing", `teams/${id}`)} />
            <TeamCard
              t={team}
              d={d}
              people={people}
              owner={owner}
              me={d.me}
              session={session}
              ws={ws.id}
              onError={setError}
              onAdd={(u) => void saveTeam(team, [...team.members.map((m) => m.user), u], `Added ${people.get(u)?.name ?? "them"}`)}
              onRemove={async (u) => {
                const who = people.get(u)?.name ?? "them";
                const live = usedBy(team, d.policies).filter((x) => x.live);
                if (live.length && !(await askConfirm(`Remove ${who} from ${team.name}?`, { body: `${live.map((x) => x.name).join(", ")} ${live.length === 1 ? "uses" : "use"} this team. New leads skip ${who.split(" ")[0]} here from now on.`, ok: "Remove" }))) return;
                void saveTeam(
                  team,
                  team.members.filter((m) => m.user !== u).map((m) => m.user),
                  `Removed ${who}. The queue keeps its place.`,
                );
              }}
              onStatus={(u, v, anchor) => {
                const p = people.get(u);
                if (!p) return;
                if (v === "accepting") void saveMember(u, { paused_until: "", out_dates: withoutToday(p.out_dates, localDate(Date.now())) }, "Saved");
                else if (v === "paused") void saveMember(u, { paused_until: "infinity" }, `${p.name} is paused in every team`);
                else if (v === "ooo" && anchor) setAway({ user: u, anchor });
                else if (v === "hours") navigate("scheduling", u === d.me ? "availability" : "availability/team");
              }}
              onCap={(u, cap) => void saveMember(u, { cap_day: cap }, "Saved")}
            />
            <span className="text-[12px] text-muted">Status and caps apply to the person in every team. Daily cap resets at midnight, {zone}.</span>
          </>
        )}
      </div>
      {away ? (
        <StatusPopover
          anchor={away.anchor}
          rep={(() => {
            const p = people.get(away.user);
            return p ? { user_id: p.id, paused_until: p.paused_until, out_dates: p.out_dates, backup: p.backup, cap_day: p.cap_day, cap_week: p.cap_week } : undefined;
          })()}
          onClose={() => setAway(null)}
          onSave={async (patch) => {
            if (await saveMember(away.user, patch, "Saved")) setAway(null);
          }}
        />
      ) : null}
      {creating ? (
        <CreateTeam
          people={d.people}
          onClose={() => setCreating(false)}
          onCreate={async (name, members) => {
            const out = await rt<{ id: string }>(session, ws.id, "rt_team", { name, members });
            invalidate(`routing_screen:${ws.id}`);
            setCreating(false);
            toast({ text: `Created ${name}` });
            navigate("routing", `teams/${out.id}`);
          }}
        />
      ) : null}
    </Page>
  );
}

function TeamCard({
  t,
  d,
  people,
  owner,
  me,
  session,
  ws,
  onError,
  onAdd,
  onRemove,
  onStatus,
  onCap,
}: {
  t: Team;
  d: Screen;
  people: Map<string, Person>;
  owner: boolean;
  me: string;
  session: ViewProps["session"];
  ws: string;
  onError: (e: string) => void;
  onAdd: (u: string) => void;
  onRemove: (u: string) => void;
  onStatus: (u: string, v: string, anchor?: HTMLElement) => void;
  onCap: (u: string, cap: number | null) => void;
}) {
  const used = usedBy(t, d.policies);
  const now = useNow();
  const can = (u: string) => {
    const p = people.get(u);
    if (!p) return false;
    const s = repState(p, now);
    return s.state === "in" && !p.out && (p.cap_day === null || p.today < p.cap_day);
  };
  // Who the next new lead from this team goes to: the first in rotation from the shared queue's place who can take it.
  const next = rotation({ members: t.members.map((m) => ({ ...m, weight: m.weight })), next: t.next }).find((m) => can(m.user))?.user ?? null;
  const addable = d.people.filter((p) => !t.members.some((m) => m.user === p.id));
  const grid = "grid grid-cols-[minmax(0,1.4fr)_1fr_110px_120px_40px] items-center gap-2.5 max-md:grid-cols-[minmax(0,1fr)_auto]";
  return (
    <section className="rounded-[10px] border border-line bg-card">
      <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{t.name}</h2>
        <span className="text-[12px] text-muted">Used by {used.length ? used.map((x) => `${x.name} (${x.uses})`).join(", ") : "no policy"}</span>
        {owner ? (
          <Choice<string>
            label="Add member"
            value=""
            placeholder="Add member"
            align="right"
            shown={
              <span className="inline-flex items-center gap-1.5">
                <Plus size={12} />
                Add member
              </span>
            }
            options={addable.length ? addable.map((p) => ({ value: p.id, label: p.name })) : [{ value: "__none", label: "Everyone is in this team" }]}
            onChange={(u) => u !== "__none" && onAdd(u)}
          />
        ) : null}
      </header>
      <div className={`${grid} px-4 py-2 text-[11.5px] font-medium text-muted`}>
        <span>Member</span>
        <span className="max-md:hidden">Status</span>
        <span className="max-md:hidden">Today</span>
        <span className="max-md:hidden">Calendar</span>
        <span />
      </div>
      {t.members.length ? null : <div className="border-t border-line px-4 py-3 text-muted">Nobody yet</div>}
      {t.members.map((m, i) => {
        const p = people.get(m.user);
        const name = p?.name ?? "Former teammate";
        const s = p ? repState(p, now) : { state: "in" as const, until: null };
        const ooo = s.state === "away" || !!p?.out;
        const status = s.state === "paused" ? { label: "Paused", tone: "gray" as const } : ooo ? { label: `Out of office${s.until ? ` until ${new Date(s.until - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`, tone: "amber" as const } : { label: "Accepting leads", tone: "green" as const };
        const mayEdit = owner || m.user === me;
        return (
          <div key={m.user} className={`${grid} border-t border-line px-4 py-2.5`}>
            <span className="flex min-w-0 items-center gap-2.5">
              <Initials name={name} size={26} />
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="truncate font-medium text-ink">{name}</span>
                <span className="truncate text-[11.5px] text-muted">{m.user === next ? "Next in round robin" : `Position ${i + 1}`}</span>
              </span>
            </span>
            <span data-status={m.user} className="max-md:col-start-2 max-md:row-start-1 max-md:justify-self-end">
              {p ? (
                <Choice<string>
                  label={`${name}'s status`}
                  value={s.state === "paused" ? "paused" : ooo ? "ooo" : "accepting"}
                  disabled={!mayEdit}
                  menuWidth={240}
                  shown={
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  }
                  options={[
                    { value: "accepting", label: "Accepting leads", hint: "Receives new leads" },
                    { value: "paused", label: "Paused", hint: "No new leads, in every team" },
                    { value: "ooo", label: "Out of office", hint: `Pick the dates, ${p.tz}` },
                    { value: "hours", label: "Working hours and time off" },
                  ]}
                  onChange={(v) => onStatus(m.user, v, (document.querySelector(`[data-status="${m.user}"]`) as HTMLElement | null) ?? undefined)}
                />
              ) : null}
            </span>
            <span className="tabular-nums max-md:hidden">
              {p ? (
                owner ? (
                  <Choice<string>
                    label={`${name}'s daily cap`}
                    look="word"
                    value={String(p.cap_day ?? "none")}
                    shown={p.cap_day === null ? `${p.today} · No limit` : `${p.today} of ${p.cap_day}`}
                    options={capOptions(p.cap_day).map((c) => ({ value: String(c ?? "none"), label: capWords(c) }))}
                    onChange={(v) => onCap(m.user, v === "none" ? null : Number(v))}
                  />
                ) : p.cap_day === null ? (
                  `${p.today} · No limit`
                ) : (
                  `${p.today} of ${p.cap_day}`
                )
              ) : null}
            </span>
            <span className="max-md:hidden">
              {p?.calendar ? (
                <Badge tone="green" dot>
                  Connected
                </Badge>
              ) : m.user === me ? (
                <ConnectButton session={session} ws={ws} onError={onError} again={!!p?.reconnect} look="badge" />
              ) : (
                <Badge tone="amber" dot>
                  Not connected
                </Badge>
              )}
            </span>
            <span className="max-md:hidden">
              {owner ? (
                <IconButton label={`Remove ${name}`} onClick={() => onRemove(m.user)}>
                  <X size={12} />
                </IconButton>
              ) : null}
            </span>
          </div>
        );
      })}
      <div className="border-t border-line px-4 py-2.5">
        <div className="font-medium text-ink">Distribution</div>
        <div className="text-[12px] text-muted">Round robin. One shared queue for every policy that uses this team.</div>
      </div>
    </section>
  );
}

/** Create team (Section 12): a name and its members, in the order picked; the order is the round robin's. */
function CreateTeam({ people, onClose, onCreate }: { people: Person[]; onClose: () => void; onCreate: (name: string, members: string[]) => Promise<void> }) {
  const [name, setName] = useState("");
  const [members, setMembers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (!name.trim()) return setError("Name the team.");
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim(), members);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the team.");
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Create team"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            Create team
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px]">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Name</span>
          <Input autoFocus value={name} maxLength={80} className="h-8" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">Members</span>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => {
              const i = members.indexOf(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={i >= 0}
                  onClick={() => setMembers(i >= 0 ? members.filter((x) => x !== p.id) : [...members, p.id])}
                  className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] ${i >= 0 ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:bg-hover"}`}
                >
                  {i >= 0 ? <span className="tabular-nums opacity-70">{i + 1}</span> : null}
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
