"use client";

// Routing › Sales reps: everyone who takes leads, in one table. Their calendar (connect your own, or copy a link for
// a teammate), working hours, status (Available, Away until a date, Paused), capacity per day, backup, and the rules
// they're on in Assignment. An amber note names whoever has no calendar. Days off, date-specific hours and team
// schedules stay in the availability editor (/routing/reps/availability), from "Custom hours and time off".

import { useState } from "react";
import type { Availability } from "@/lib/meetings/types";
import { BrandLogo } from "../BrandLogo";
import { askText } from "../Dialogs";
import { Popover } from "../FilterBar";
import { PROVIDERS } from "../meetings/MyCalendar";
import { copyText, meetingsApi, ownZone, usePeople, type Person } from "../meetings/parts";
import { connectCalendar } from "../scheduling/ConnectCalendar";
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, useQuery, type ViewProps } from "../ui";
import { Alert, Card, Choice, TD, TH, Who } from "../inbound/parts";
import { calendarWords, capOptions, capWords, HOUR_PRESETS, hoursWords, repState, stateBadge, STATE_WORDS, withoutToday, type RepState } from "../reps/model";
import { routingApi } from "./api";
import { StatusPopover, type Patch } from "./Reps";
import { dayStart, localDate, weekStart, type RepRow } from "./screensModel";
import { toast } from "./Toast";

type Cal = { user_id: string; provider: string; status: string };

const today = () => localDate(Date.now());

/** Reps, their calendars, hours and today's leads, in one read (`routing_reps:<ws>:inbound`). */
export function useRepsData(sb: ViewProps["sb"], ws: string) {
  return useQuery(`routing_reps:${ws}:inbound`, async () => {
    const [r, cals, hours] = await Promise.all([
      sb.rpc("routing_reps_screen", { p_ws: ws, p_day: new Date(dayStart()).toISOString(), p_since: new Date(Math.min(weekStart(), dayStart())).toISOString() }),
      sb.from("calendar_accounts").select("user_id, provider, status").eq("workspace_id", ws),
      sb.from("availability").select("user_id, tz, weekly, overrides").eq("workspace_id", ws),
    ]);
    const x = must(r) as { reps: RepRow[]; calendar: string[]; counts: { owner: string; today: number; week: number }[] };
    const calendar = new Map<string, string>();
    const reconnect = new Set<string>();
    for (const c of (must(cals) ?? []) as Cal[]) {
      if (c.provider === "zoom") continue;
      if (c.status === "ok") calendar.set(c.user_id, c.provider);
      else reconnect.add(c.user_id);
    }
    return {
      reps: new Map((x.reps ?? []).map((y) => [y.user_id, y])),
      calendar,
      reconnect,
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
      counts: new Map((x.counts ?? []).map((c) => [c.owner, { today: c.today, week: c.week }])),
    };
  });
}
export type RepsData = NonNullable<ReturnType<typeof useRepsData>["data"]>;

/** "Invite rep": one email, sent as a workspace invite. */
export async function inviteRep(sb: ViewProps["sb"], ws: string): Promise<boolean> {
  const email = await askText("Invite rep", { placeholder: "name@company.com", ok: "Invite" });
  if (!email) return false;
  must(await sb.rpc("invite_member", { p_ws: ws, p_email: email }));
  invalidate(`workspace_people:${ws}`);
  invalidate(`people:${ws}`);
  invalidate("app_counts");
  toast({ text: "Invitation sent" });
  return true;
}

/** Ask a teammate to connect: a link to their own Sales reps page, copied. */
export async function askToConnect(p: Pick<Person, "name">) {
  const ok = await copyText(`${window.location.origin}/routing/reps`);
  toast({ text: ok ? `Link copied. Send it to ${p.name.split(" ")[0]} to connect a calendar.` : "Couldn't copy the link" });
}

export function SalesReps({ sb, session, ws, role, navigate, assigned }: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { assigned: Map<string, string[]> }) {
  const me = session.user.id;
  const owner = role === "owner";
  const people = usePeople(sb, ws.id);
  const data = useRepsData(sb, ws.id);
  const [error, setError] = useState("");
  const [awayFor, setAwayFor] = useState<{ user: string; anchor: HTMLElement } | null>(null);

  const list = people.data?.list ?? [];
  const noCal = data.data ? list.filter((p) => !data.data!.calendar.has(p.id)) : [];

  const save = async (user: string, patch: Patch) => {
    setError("");
    try {
      await data.mutate(
        (d) => {
          const reps = new Map(d.reps);
          const base = reps.get(user) ?? ({ user_id: user, paused_until: null, out_dates: [], backup: null, cap_day: null, cap_week: null } as RepRow);
          const next = { ...base } as Record<string, unknown>;
          for (const [k, v] of Object.entries(patch)) next[k] = v === "" ? null : v;
          reps.set(user, next as RepRow);
          return { ...d, reps };
        },
        () => routingApi(session, ws.id, "rep", { user, patch }),
      );
      invalidate(`routing_reps:${ws.id}`);
      invalidate("app_counts");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  };
  const saveHours = async (user: string, weekly: Availability["weekly"]) => {
    setError("");
    const had = data.data?.hours.get(user);
    const availability: Availability = { tz: had?.tz ?? ownZone(), weekly, overrides: had?.overrides ?? [] };
    try {
      await data.mutate(
        (d) => ({ ...d, hours: new Map(d.hours).set(user, { user_id: user, ...availability }) }),
        () => meetingsApi(session, ws.id, "availability", { userId: user, availability }),
      );
      invalidate(`availability:${ws.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const err = people.error || data.error;
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 pt-5 pb-12 text-[13px] md:px-6">
      <ErrorNote message={error || err} />
      {noCal.length ? (
        <Alert>
          {noCal.map((p) => p.name).join(", ")} {noCal.length === 1 ? "has" : "have"} no calendar connected
        </Alert>
      ) : null}
      {!people.data || !data.data ? (
        err ? null : <Loading />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
            <thead>
              <tr>
                <th className={TH}>Rep</th>
                <th className={TH}>Calendar</th>
                <th className={`${TH} max-md:hidden`}>Working hours</th>
                <th className={TH}>Status</th>
                <th className={`${TH} max-md:hidden`}>Capacity</th>
                <th className={`${TH} max-md:hidden`}>Backup</th>
                <th className={`${TH} max-md:hidden`}>Assignment</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <RepRowView
                  key={p.id}
                  p={p}
                  me={me}
                  owner={owner}
                  people={list}
                  d={data.data!}
                  rules={assigned.get(p.id) ?? []}
                  onSave={(patch) => void save(p.id, patch)}
                  onHours={(w) => void saveHours(p.id, w)}
                  onEditHours={() => navigate("scheduling", p.id === me ? "availability" : "availability/team")}
                  onAway={(anchor) => setAwayFor({ user: p.id, anchor })}
                  onConnect={() => void askToConnect(p)}
                  session={session}
                  ws={ws.id}
                  onError={setError}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {awayFor ? (
        <StatusPopover
          anchor={awayFor.anchor}
          rep={data.data?.reps.get(awayFor.user)}
          onClose={() => setAwayFor(null)}
          onSave={async (patch) => {
            if (await save(awayFor.user, patch)) setAwayFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RepRowView({
  p,
  me,
  owner,
  people,
  d,
  rules,
  onSave,
  onHours,
  onEditHours,
  onAway,
  onConnect,
  session,
  ws,
  onError,
}: {
  p: Person;
  me: string;
  owner: boolean;
  people: Person[];
  d: RepsData;
  rules: string[];
  onSave: (patch: Patch) => void;
  onHours: (w: Availability["weekly"]) => void;
  onEditHours: () => void;
  onAway: (anchor: HTMLElement) => void;
  onConnect: () => void;
  session: ViewProps["session"];
  ws: string;
  onError: (e: string) => void;
}) {
  const [statusBox, setStatusBox] = useState<HTMLElement | null>(null);
  const rep = d.reps.get(p.id);
  const mine = p.id === me;
  const canEdit = owner || mine;
  const st = repState(rep);
  const words = STATE_WORDS[st.state];
  const hours = d.hours.get(p.id);
  const label = hoursWords(hours?.weekly);
  const preset = HOUR_PRESETS.find((h) => h.key === label);
  const cal = d.calendar.get(p.id);
  const backup = rep?.backup ? people.find((x) => x.id === rep.backup) : null;
  const pickState = (v: RepState) => {
    if (v === st.state && v !== "away") return;
    if (v === "paused") onSave({ paused_until: "infinity" });
    else if (v === "in") onSave({ paused_until: "", out_dates: withoutToday(rep?.out_dates, today()) });
    else if (statusBox) onAway(statusBox);
  };
  return (
    <tr>
      <td className={TD}>
        <Who person={p} name={p.name} after={mine ? <span className="font-normal text-muted">You</span> : null} line={p.email} />
      </td>
      <td className={TD}>
        {cal ? (
          <Badge tone="green" dot>
            {calendarWords(cal)}
          </Badge>
        ) : mine ? (
          <ConnectButton session={session} ws={ws} onError={onError} again={d.reconnect.has(p.id)} />
        ) : (
          <Button size="sm" onClick={onConnect}>
            Ask to connect
          </Button>
        )}
      </td>
      <td className={`${TD} max-md:hidden`}>
        <Choice<string>
          label={`${p.name}'s working hours`}
          value={preset ? preset.key : label}
          disabled={!canEdit}
          options={[...(preset ? [] : [{ value: label, label }]), ...HOUR_PRESETS.map((h) => ({ value: h.key, label: h.key })), { value: "__edit", label: "Custom hours and time off" }]}
          onChange={(v) => {
            if (v === "__edit") return onEditHours();
            const h = HOUR_PRESETS.find((x) => x.key === v);
            if (h) onHours(h.weekly);
          }}
        />
      </td>
      <td className={TD}>
        <span ref={setStatusBox} className="inline-flex">
          <Choice<RepState>
            label={`${p.name}'s status`}
            value={st.state}
            disabled={!canEdit}
            shown={
              <Badge tone={words.tone} dot>
                {stateBadge(st)}
              </Badge>
            }
            options={(["in", "away", "paused"] as RepState[]).map((v) => ({ value: v, label: STATE_WORDS[v].label, hint: STATE_WORDS[v].hint }))}
            onChange={pickState}
          />
        </span>
      </td>
      <td className={`${TD} max-md:hidden`}>
        <Choice<string>
          label={`Capacity for ${p.name}`}
          value={String(rep?.cap_day ?? "none")}
          disabled={!owner}
          options={capOptions(rep?.cap_day ?? null).map((c) => ({ value: String(c ?? "none"), label: capWords(c) }))}
          onChange={(v) => onSave({ cap_day: v === "none" ? null : Number(v) })}
        />
      </td>
      <td className={`${TD} max-md:hidden`}>
        <Choice<string>
          label={`Backup for ${p.name}`}
          value={rep?.backup ?? ""}
          disabled={!owner}
          align="right"
          shown={backup ? backup.name.split(" ")[0] : <span className="text-muted">None</span>}
          options={[{ value: "", label: "None" }, ...people.filter((x) => x.id !== p.id).map((x) => ({ value: x.id, label: x.name }))]}
          onChange={(v) => onSave({ backup: v })}
        />
      </td>
      <td className={`${TD} text-muted max-md:hidden`}>{rules.length ? rules.join(", ") : "Not assigned"}</td>
    </tr>
  );
}

/** Connect your own calendar: Google Calendar or Outlook, through the usual sign-in. */
export function ConnectButton({ session, ws, onError, again, look = "button" }: { session: ViewProps["session"]; ws: string; onError: (e: string) => void; again: boolean; look?: "button" | "badge" }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (provider: string) => {
    setAnchor(null);
    setBusy(true);
    try {
      await connectCalendar(session, ws, provider);
    } catch (e) {
      onError(errorText(e));
      setBusy(false);
    }
  };
  const words = again ? "Reconnect calendar" : "Connect calendar";
  return (
    <>
      {look === "badge" ? (
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          disabled={busy}
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
          className="press inline-flex h-5 items-center gap-1.5 rounded-full bg-butter-wash px-2 text-[11px] font-medium whitespace-nowrap text-butter"
        >
          <span className="size-[5px] rounded-full bg-butter" />
          {words}
        </button>
      ) : (
        <Button size="sm" aria-haspopup="menu" aria-expanded={!!anchor} disabled={busy} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
          {words}
        </Button>
      )}
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={220}>
          <div role="menu" className="flex flex-col p-1">
            {PROVIDERS.filter((x) => x.id !== "zoom").map((x) => (
              <button key={x.id} type="button" role="menuitem" onClick={() => void go(x.id)} className="flex h-9 items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover">
                <BrandLogo domain={x.domain} name={x.name} size={16} />
                {x.name}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
