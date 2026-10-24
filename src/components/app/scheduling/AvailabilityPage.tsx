"use client";

// Scheduling › Availability (docs/app-structure.md 6.4), Calendly's "Manage availability" in one place:
//   Schedules  your working hours (the default) and named schedules a meeting type can pick ("Demo hours")
//   Calendars  connected Google, Microsoft and Zoom accounts, and your booking page
//   Team       everyone's week side by side
//   Days off   dates you're away: no bookings, and Routing skips you (one entry covers both)

import { useState } from "react";
import { DEFAULT_AVAILABILITY, type Availability } from "@/lib/meetings/types";
import { availabilityPage, type AvailabilityTab } from "@/lib/nav";
import { CalendarIcon, Plus, Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { Button, CardHead, Empty, ErrorNote, errorText, Input, Loading, must, Page, Panel, Tabs, useLoad, type ViewProps } from "../ui";
import { HoursEditor } from "../meetings/HoursEditor";
import { MyCalendar } from "../meetings/MyCalendar";
import { meetingsApi, Modal, ownZone } from "../meetings/parts";
import { TeamCalendars } from "../meetings/TeamCalendars";
import { routingApi } from "../routing/api";
import { weeklyWords } from "./model";

const TABS: { value: AvailabilityTab; label: string }[] = [
  { value: "schedules", label: "Schedules" },
  { value: "calendars", label: "Calendars" },
  { value: "team", label: "Team" },
  { value: "days-off", label: "Days off" },
];

export function AvailabilityPage(props: ViewProps & { tab: string }) {
  const { navigate } = props;
  const tab = availabilityPage(props.tab);
  return (
    <Page title="Availability" flush>
      <Tabs value={tab} tabs={TABS} onChange={(t) => navigate("scheduling", t === "schedules" ? "availability" : `availability/${t}`)} />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 md:p-7">
        {tab === "schedules" ? (
          <>
            <MyCalendar sb={props.sb} session={props.session} ws={props.ws} parts={["hours"]} />
            <NamedSchedules {...props} />
          </>
        ) : tab === "calendars" ? (
          <MyCalendar sb={props.sb} session={props.session} ws={props.ws} parts={["calendars", "profile"]} />
        ) : tab === "team" ? (
          <TeamCalendars sb={props.sb} ws={props.ws} role={props.role} session={props.session} />
        ) : (
          <DaysOff {...props} />
        )}
      </div>
    </Page>
  );
}

type ScheduleRow = Availability & { id: string; name: string };

/** Named schedules: a card each with its hours in words; add, change, rename and delete in a dialog. */
function NamedSchedules({ sb, session, ws }: ViewProps) {
  const me = session.user.id;
  const list = useLoad(async () => (must(await sb.from("availability_schedules").select("id, name, tz, weekly, overrides").eq("workspace_id", ws.id).eq("user_id", me).order("name")) ?? []) as ScheduleRow[], ws.id);
  const [editing, setEditing] = useState<ScheduleRow | "new" | null>(null);
  const [error, setError] = useState("");
  const remove = async (s: ScheduleRow) => {
    setError("");
    try {
      if (!(await askConfirm(`Delete ${s.name}?`, { body: "Meeting types that use it go back to your working hours.", ok: "Delete", danger: true }))) return;
      await meetingsApi(session, ws.id, "availability", { action: "schedule_delete", id: s.id });
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Other schedules" count={list.data?.length || undefined}>
        <Button variant="plain" size="sm" onClick={() => setEditing("new")}>
          <Plus size={13} />
          New schedule
        </Button>
      </CardHead>
      <div className="px-5 py-3">
        <ErrorNote message={error || list.error} />
      </div>
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <p className="px-5 pb-5 text-[13px] text-muted">None yet</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-butter-wash text-butter">
                <CalendarIcon size={14} />
              </span>
              <button type="button" onClick={() => setEditing(s)} className="flex min-w-0 flex-1 flex-col text-left">
                <span className="truncate text-[13.5px] font-medium text-ink">{s.name}</span>
                <span className="truncate text-[12.5px] text-muted">
                  {weeklyWords(s)} · {s.tz}
                </span>
              </button>
              <MoreMenu
                items={[
                  { label: "Edit", run: () => setEditing(s) },
                  { label: "Delete", danger: true, run: () => void remove(s) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      {editing ? <ScheduleDialog session={session} ws={ws.id} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} /> : null}
    </Panel>
  );
}

function ScheduleDialog({ session, ws, row, onClose, onSaved }: { session: ViewProps["session"]; ws: string; row: ScheduleRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [hours, setHours] = useState<Availability>(row ? { tz: row.tz, weekly: row.weekly, overrides: row.overrides } : DEFAULT_AVAILABILITY(ownZone()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await meetingsApi(session, ws, "availability", { action: "schedule_save", id: row?.id ?? null, name, availability: hours });
      onSaved();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title={row ? row.name : "New schedule"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <label className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[12px] font-medium text-muted">Name</span>
          <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Demo hours" className="h-9 max-w-xs" />
        </label>
        <HoursEditor value={hours} onChange={setHours} />
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}

const dayList = (from: string, to: string) => {
  const out: string[] = [];
  const end = new Date(`${to}T12:00:00Z`).getTime();
  for (let t = new Date(`${from}T12:00:00Z`).getTime(); t <= end && out.length < 62; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/**
 * Days off: one list for booking and routing. Adding dates turns those days off in your working hours (no times on
 * any booking page) and marks you away in Routing, so new leads go to someone else.
 */
function DaysOff({ sb, session, ws }: ViewProps) {
  const me = session.user.id;
  const data = useLoad(async () => {
    const [rep, hours] = await Promise.all([
      sb.from("router_reps").select("out_dates").eq("workspace_id", ws.id).eq("user_id", me).maybeSingle(),
      sb.from("availability").select("tz, weekly, overrides").eq("workspace_id", ws.id).eq("user_id", me).maybeSingle(),
    ]);
    return { out: ((must(rep) as { out_dates: { from: string; to: string }[] } | null)?.out_dates ?? []) as { from: string; to: string }[], hours: must(hours) as Availability | null };
  }, ws.id);
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const write = async (out: { from: string; to: string }[], add: string[], drop: string[]) => {
    const hours = data.data?.hours ?? DEFAULT_AVAILABILITY(ownZone());
    const keep = hours.overrides.filter((o) => !drop.includes(o.date) && !add.includes(o.date));
    const overrides = [...keep, ...add.map((date) => ({ date, ranges: [] as [string, string][] }))].sort((a, b) => a.date.localeCompare(b.date)).slice(-200);
    await meetingsApi(session, ws.id, "availability", { availability: { ...hours, overrides } });
    await routingApi(session, ws.id, "rep", { user: me, patch: { out_dates: out } });
  };
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const [a, b] = from <= to ? [from, to] : [to, from];
      await write([...(data.data?.out ?? []).filter((d) => d.to >= today), { from: a, to: b }], dayList(a, b), []);
      data.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d: { from: string; to: string }) => {
    setError("");
    try {
      // Only days this entry turned off come back; a day off set in the hours editor by hand stays.
      const days = dayList(d.from, d.to).filter((x) => data.data?.hours?.overrides.some((o) => o.date === x && !o.ranges.length));
      await write((data.data?.out ?? []).filter((x) => x.from !== d.from || x.to !== d.to), [], days);
      data.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const words = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const list = (data.data?.out ?? []).filter((d) => d.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Days off" count={list.length || undefined} />
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">From</span>
          <Input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">To</span>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </label>
        <Button onClick={() => void add()} disabled={busy || !from || !to}>
          <Plus size={14} />
          Add days off
        </Button>
      </div>
      <div className="px-5">
        <ErrorNote message={error || data.error} />
      </div>
      {!data.data ? (
        <Loading />
      ) : !list.length ? (
        <Empty title="No days off ahead" />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {list.map((d) => (
            <li key={`${d.from}-${d.to}`} className="flex items-center gap-3 px-5 py-3 text-[13.5px]">
              <span className="flex-1 text-ink">{d.from === d.to ? words(d.from) : `${words(d.from)} to ${words(d.to)}`}</span>
              <Button variant="plain" size="sm" onClick={() => void remove(d)}>
                <Trash size={13} />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
