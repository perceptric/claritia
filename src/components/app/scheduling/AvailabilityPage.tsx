"use client";

// Reps › Availability (once Calendar › Availability) (docs/scheduling-plan.md 11.5), Calendly's "Manage availability" on one screen. You has
// three columns side by side: Schedules (your working hours, the default, and named schedules a meeting type can
// pick, like "Demo hours"), the open schedule's week (each day a row: switch, the times, add), and Calendars (the
// connected accounts, which count as busy and where new bookings go). Date-specific hours and Days off open dialogs.
// Days off are one list for booking and routing: those days leave every booking page and Routing skips you. Team
// shows everyone's calendar and hours. Changes to a week save themselves a moment after the last one.

import { useEffect, useRef, useState } from "react";
import { DAYS, DEFAULT_AVAILABILITY, type Availability, type Day, type Range } from "@/lib/meetings/types";
import { availabilityPage } from "@/lib/nav";
import { Check, Plus, Trash, X } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText } from "../Dialogs";
import { Select } from "../Select";
import { MoreMenu } from "../StatCards";
import { Badge, Button, ErrorNote, errorText, IconButton, Input, invalidate, Loading, must, Page, postJson, Segmented, Toggle, useQuery, type ViewProps } from "../ui";
import { CLOCK_OPTIONS, ClockPick, FROM_OPTIONS, Overrides, ZonePicker } from "../meetings/HoursEditor";
import { CLOCKS, DAY_LABEL, nextRange } from "../meetings/model";
import { PROVIDERS, providerOf, useMyCalendars, type Account, type CalList } from "../meetings/MyCalendar";
import { meetingsApi, Modal, ownZone } from "../meetings/parts";
import { TeamCalendars } from "../meetings/TeamCalendars";
import { routingApi } from "../routing/api";

type ScheduleRow = Availability & { id: string; name: string };
type Whose = "you" | "team";

/** Your working hours and named schedules, shared by the page and Days off (`availability:<workspace>:me:<you>`). */
function useMyHours(sb: ViewProps["sb"], ws: string, me: string) {
  return useQuery(`availability:${ws}:me:${me}`, async () => {
    const [hours, named] = await Promise.all([
      sb.from("availability").select("tz, weekly, overrides").eq("workspace_id", ws).eq("user_id", me).maybeSingle(),
      sb.from("availability_schedules").select("id, name, tz, weekly, overrides").eq("workspace_id", ws).eq("user_id", me).order("name"),
    ]);
    return { hours: must(hours) as Availability | null, named: (named.data ?? []) as ScheduleRow[] };
  });
}

export function AvailabilityPage(props: ViewProps & { tab: string; back?: { label: string; onClick: () => void } }) {
  const { sb, session, ws, navigate } = props;
  const me = session.user.id;
  const tab = availabilityPage(props.tab);
  const whose: Whose = tab === "team" ? "team" : "you";
  const data = useMyHours(sb, ws.id, me);
  const [sel, setSel] = useState<string>("default");
  const [daysOff, setDaysOff] = useState(tab === "days-off");
  const [dates, setDates] = useState(false);
  const [error, setError] = useState("");

  const pickWhose = (w: Whose) => navigate("routing", w === "team" ? "teams/availability/team" : "teams/availability");
  const switcher = (
    <Segmented<Whose>
      size="sm"
      label="Whose"
      value={whose}
      options={[
        { value: "you", label: "You" },
        { value: "team", label: "Team" },
      ]}
      onChange={pickWhose}
    />
  );

  if (whose === "team")
    return (
      <Page title="Availability" back={props.back} flush>
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
          <div>{switcher}</div>
          <TeamCalendars sb={sb} ws={ws} role={props.role} session={session} />
        </div>
      </Page>
    );

  const named = data.data?.named ?? [];
  const open = sel === "default" ? null : (named.find((n) => n.id === sel) ?? null);
  const saved = open ? { tz: open.tz, weekly: open.weekly, overrides: open.overrides } : (data.data?.hours ?? null);
  const save = async (a: Availability) => {
    if (open) await meetingsApi(session, ws.id, "availability", { action: "schedule_save", id: open.id, name: open.name, availability: a });
    else await meetingsApi(session, ws.id, "availability", { availability: a });
    // Keep the shared copy in step, so Days off and the other screens start from what was saved.
    data.set((d) => (open ? { ...d, named: d.named.map((n) => (n.id === open.id ? { ...n, ...a } : n)) } : { ...d, hours: a }));
    invalidate("meeting_types");
  };
  const add = async () => {
    setError("");
    const name = (await askText("New schedule", { placeholder: "Demo hours", ok: "Create" }))?.trim();
    if (!name) return;
    try {
      const r = await meetingsApi<{ id?: string }>(session, ws.id, "availability", { action: "schedule_save", id: null, name, availability: data.data?.hours ?? DEFAULT_AVAILABILITY(ownZone()) });
      data.reload();
      if (r.id) setSel(r.id);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const rename = async (s: ScheduleRow, a: Availability) => {
    setError("");
    const name = (await askText("Rename schedule", { initial: s.name, ok: "Rename" }))?.trim();
    if (!name || name === s.name) return;
    try {
      await data.mutate(
        (d) => ({ ...d, named: d.named.map((n) => (n.id === s.id ? { ...n, name } : n)) }),
        () => meetingsApi(session, ws.id, "availability", { action: "schedule_save", id: s.id, name, availability: a }),
      );
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async (s: ScheduleRow) => {
    setError("");
    try {
      if (!(await askConfirm(`Delete ${s.name}?`, { body: "Meeting types that use it go back to your working hours.", ok: "Delete", danger: true }))) return;
      setSel("default");
      await data.mutate((d) => ({ ...d, named: d.named.filter((n) => n.id !== s.id) }), () => meetingsApi(session, ws.id, "availability", { action: "schedule_delete", id: s.id }));
      invalidate("meeting_types");
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Page title="Availability" back={props.back} flush>
      <div className="h-full min-h-0 overflow-y-auto md:grid md:grid-cols-[220px_minmax(0,1fr)_300px] md:overflow-hidden">
        <div className="flex flex-col gap-3 p-4 md:min-h-0 md:overflow-y-auto">
          <div>{switcher}</div>
          <h2 className="text-[13.5px] font-semibold text-ink">Schedules</h2>
          <div className="flex flex-col gap-0.5">
            <ScheduleButton on={sel === "default"} onClick={() => setSel("default")}>
              Working hours
              <Badge>Default</Badge>
            </ScheduleButton>
            {named.map((n) => (
              <ScheduleButton key={n.id} on={sel === n.id} onClick={() => setSel(n.id)}>
                <span className="truncate">{n.name}</span>
              </ScheduleButton>
            ))}
            <button type="button" onClick={() => void add()} className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-ink">
              <Plus size={13} />
              New schedule
            </button>
          </div>
          <ErrorNote message={error || data.error} />
        </div>

        <div className="flex flex-col border-line p-4 max-md:border-t md:min-h-0 md:overflow-y-auto md:border-l">
          {!data.data ? (
            <Loading />
          ) : (
            <WeekColumn
              key={sel}
              name={open?.name ?? "Working hours"}
              saved={saved}
              onSave={save}
              menu={(a) => (open ? <MoreMenu items={[{ label: "Rename", run: () => void rename(open, a) }, { label: "Delete", danger: true, run: () => void remove(open) }]} /> : null)}
              onDates={() => setDates(true)}
              onDaysOff={() => setDaysOff(true)}
              datesOpen={dates}
              onDatesClose={() => setDates(false)}
            />
          )}
        </div>

        <div className="flex flex-col border-line p-4 max-md:border-t md:min-h-0 md:overflow-y-auto md:border-l">
          <Calendars {...props} />
        </div>
      </div>
      {daysOff ? (
        <DaysOffDialog
          {...props}
          onClose={() => {
            setDaysOff(false);
            if (tab === "days-off") navigate("routing", "teams/availability");
          }}
          onSaved={() => undefined}
        />
      ) : null}
    </Page>
  );
}

function ScheduleButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors duration-[120ms] ${on ? "bg-paper-deep font-medium text-ink" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

/** The open schedule's week: a row a day with its switch, times and add, then the date-specific hours and days off. */
function WeekColumn({
  name,
  saved,
  onSave,
  menu,
  onDates,
  onDaysOff,
  datesOpen,
  onDatesClose,
}: {
  name: string;
  saved: Availability | null;
  onSave: (a: Availability) => Promise<void>;
  menu: (a: Availability) => React.ReactNode;
  onDates: () => void;
  onDaysOff: () => void;
  datesOpen: boolean;
  onDatesClose: () => void;
}) {
  const [draft, setDraft] = useState<Availability>(() => saved ?? DEFAULT_AVAILABILITY(ownZone()));
  const [base, setBase] = useState(() => JSON.stringify(saved ?? DEFAULT_AVAILABILITY(ownZone())));
  const [was, setWas] = useState(saved);
  // What this column last sent: the shared copy coming back with it isn't a change from outside.
  const [sending, setSending] = useState("");
  // Read again from outside (Days off changed the hours): start from the new hours.
  if (saved !== was) {
    setWas(saved);
    const next = saved ?? DEFAULT_AVAILABILITY(ownZone());
    if (JSON.stringify(next) !== JSON.stringify(draft) && JSON.stringify(next) !== sending) {
      setDraft(next);
      setBase(JSON.stringify(next));
    }
  }
  const [state, setState] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState("");
  const [failed, setFailed] = useState("");
  const latest = useRef(onSave);
  useEffect(() => {
    latest.current = onSave;
  });
  useEffect(() => {
    const sent = JSON.stringify(draft);
    if (sent === base || sent === failed) return;
    const t = setTimeout(async () => {
      setState("saving");
      setError("");
      setSending(sent);
      try {
        await latest.current(draft);
        setBase(sent);
        setState("saved");
      } catch (e) {
        setFailed(sent);
        setError(errorText(e));
        setState("");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [draft, base, failed]);

  const setDay = (d: Day, ranges: Range[]) => setDraft((a) => ({ ...a, weekly: { ...a.weekly, [d]: ranges } }));
  const today = new Date().toLocaleDateString("en-CA");
  const changes = draft.overrides.filter((o) => o.date >= today && o.ranges.length).length;
  return (
    <>
      <div className="mb-1.5 flex min-h-8 items-center gap-2">
        <h2 className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{name}</h2>
        {menu(draft)}
        <span role="status" className={`text-[12px] ${error ? "text-rose" : "text-muted"}`}>
          {error ? "Not saved" : state === "saving" ? "Saving" : state === "saved" ? "Saved" : ""}
        </span>
        <span className="flex-1" />
        <ZonePicker value={draft.tz} onChange={(tz) => setDraft((a) => ({ ...a, tz }))} />
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <ul className="flex flex-col">
        {DAYS.map((d) => {
          const ranges = draft.weekly[d] ?? [];
          const next = nextRange(ranges);
          return (
            <li key={d} className="grid min-h-11 grid-cols-[96px_minmax(0,1fr)_32px] items-center gap-2.5 border-b border-line sm:grid-cols-[110px_minmax(0,1fr)_32px]">
              <span className="flex items-center gap-2.5">
                <Toggle label={DAY_LABEL[d]} on={ranges.length > 0} onChange={(on) => setDay(d, on ? [["09:00", "17:00"]] : [])} />
                <span className={`text-[13px] font-medium ${ranges.length ? "text-ink" : "text-faint"}`}>{DAY_LABEL[d]}</span>
              </span>
              <span className="flex flex-col gap-1 py-1.5">
                {ranges.length ? (
                  ranges.map((r, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <ClockPick label={`${DAY_LABEL[d]} from`} value={r[0]} options={FROM_OPTIONS} onChange={(v) => setDay(d, ranges.map((x, j) => (j === i ? [v, x[1] <= v ? (CLOCKS[CLOCKS.indexOf(v) + 4] ?? "24:00") : x[1]] : x)))} />
                      <span className="text-[12px] text-faint">to</span>
                      <ClockPick label={`${DAY_LABEL[d]} to`} value={r[1]} options={CLOCK_OPTIONS.filter((c) => c.value > r[0])} onChange={(v) => setDay(d, ranges.map((x, j) => (j === i ? [x[0], v] : x)))} />
                      <IconButton label="Remove" className="size-7" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))}>
                        <X size={13} />
                      </IconButton>
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-faint">Unavailable</span>
                )}
              </span>
              {ranges.length && next ? (
                <IconButton label={`Add hours on ${DAY_LABEL[d]}`} className="size-7" onClick={() => setDay(d, [...ranges, next])}>
                  <Plus size={14} />
                </IconButton>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" className="!border-line" onClick={onDates}>
          <Plus size={13} />
          Date-specific hours
          {changes ? <span className="text-faint tabular-nums">{changes}</span> : null}
        </Button>
        <Button variant="ghost" size="sm" className="!border-line" onClick={onDaysOff}>
          <Plus size={13} />
          Days off
        </Button>
      </div>
      {datesOpen ? <DatesDialog value={draft} onClose={onDatesClose} onDone={(overrides) => (setDraft((a) => ({ ...a, overrides })), onDatesClose())} /> : null}
    </>
  );
}

/** Date-specific hours: other hours, or a day off, on one date. */
function DatesDialog({ value, onClose, onDone }: { value: Availability; onClose: () => void; onDone: (o: Availability["overrides"]) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <Modal
      title="Date-specific hours"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onDone(draft.overrides)}>Save</Button>
        </>
      }
    >
      <Overrides value={draft} onChange={setDraft} bare />
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
function DaysOffDialog({ sb, session, ws, onClose, onSaved }: ViewProps & { onClose: () => void; onSaved: () => void }) {
  const me = session.user.id;
  // Hours from the page's own data; only your away dates are read here.
  const mine = useMyHours(sb, ws.id, me);
  const rep = useQuery(`routing_reps:${ws.id}:me:${me}:out`, async () => ((must(await sb.from("router_reps").select("out_dates").eq("workspace_id", ws.id).eq("user_id", me).maybeSingle()) as { out_dates: { from: string; to: string }[] } | null)?.out_dates ?? []) as { from: string; to: string }[]);
  const data = { data: mine.data && rep.data ? { out: rep.data, hours: mine.data.hours } : null, error: mine.error || rep.error };
  const today = new Date().toLocaleDateString("en-CA");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const write = async (out: { from: string; to: string }[], add: string[], drop: string[]) => {
    const hours = data.data?.hours ?? DEFAULT_AVAILABILITY(ownZone());
    const keep = hours.overrides.filter((o) => !drop.includes(o.date) && !add.includes(o.date));
    const overrides = [...keep, ...add.map((date) => ({ date, ranges: [] as [string, string][] }))].sort((a, b) => a.date.localeCompare(b.date)).slice(-200);
    const next = { ...hours, overrides };
    // Both lists change on screen at once, both saves go out together, and both go back if either fails.
    const was = { out: rep.data, mine: mine.data };
    rep.set(out);
    if (mine.data) mine.set({ ...mine.data, hours: next });
    try {
      await Promise.all([meetingsApi(session, ws.id, "availability", { availability: next }), routingApi(session, ws.id, "rep", { user: me, patch: { out_dates: out } })]);
    } catch (e) {
      if (was.out) rep.set(was.out);
      if (was.mine) mine.set(was.mine);
      throw e;
    }
    invalidate(`routing_reps:${ws.id}`);
  };
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const [a, b] = from <= to ? [from, to] : [to, from];
      await write([...(data.data?.out ?? []).filter((d) => d.to >= today), { from: a, to: b }], dayList(a, b), []);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d: { from: string; to: string }) => {
    setError("");
    try {
      // Only days this entry turned off come back; a day off set by hand on the hours stays.
      const days = dayList(d.from, d.to).filter((x) => data.data?.hours?.overrides.some((o) => o.date === x && !o.ranges.length));
      await write((data.data?.out ?? []).filter((x) => x.from !== d.from || x.to !== d.to), [], days);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const words = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const list = (data.data?.out ?? []).filter((d) => d.to >= today).sort((a, b) => a.from.localeCompare(b.from));
  return (
    <Modal title="Days off" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">From</span>
            <Input type="date" value={from} min={today} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-muted">To</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          </label>
          <Button onClick={() => void add()} disabled={busy || !from || !to}>
            Add
          </Button>
        </div>
        <ErrorNote message={error || data.error} />
        {!data.data ? (
          <Loading />
        ) : list.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {list.map((d) => (
              <li key={`${d.from}-${d.to}`} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3.5 text-[13px]">
                <span className="flex-1 text-ink">{d.from === d.to ? words(d.from) : `${words(d.from)} to ${words(d.to)}`}</span>
                <IconButton label="Remove" className="hover:!bg-rose-wash hover:!text-rose" onClick={() => void remove(d)}>
                  <Trash size={13} />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">No days off ahead</p>
        )}
      </div>
    </Modal>
  );
}

/** Your calendars: each account, which of its calendars count as busy, and where new bookings go. */
function Calendars({ sb, session, ws }: ViewProps) {
  // Shared with the Connect your calendar line, in one query with the calendars.
  const data = useMyCalendars({ sb, session, ws });
  // Back from a provider's sign-in: /scheduling/availability/calendars?connected=google or ?error=...
  const [back] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const [error, setError] = useState(() => back.get("error")?.slice(0, 200) ?? "");
  const note = back.get("connected") ? `${providerOf(back.get("connected") as Account["provider"]).name} connected` : "";
  useEffect(() => {
    if (back.has("error") || back.has("connected")) history.replaceState(null, "", window.location.pathname);
  }, [back]);
  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const connect = (provider: string) =>
    act(async () => {
      const r = await postJson<{ url?: string }>(session, "/api/calendar/connect", { workspaceId: ws.id, provider });
      if (r.url) window.location.assign(r.url);
      else data.reload();
    });
  // A box or the calendar for new bookings changes on click; it goes back, with the error, if the save fails.
  const saveLists = (a: Account, lists: CalList[], id: string, patch: { busy?: boolean; write?: boolean }) =>
    act(async () => {
      const calendars = lists.map((l) => ({ id: l.calendar_id, busy: l.calendar_id === id && patch.busy !== undefined ? patch.busy : l.busy, write: patch.write ? l.calendar_id === id : l.write }));
      const next = new Map(calendars.map((c) => [c.id, c]));
      await data.mutate(
        (d) => ({ ...d, lists: d.lists.map((l) => (l.account_id === a.id && next.has(l.calendar_id) ? { ...l, busy: next.get(l.calendar_id)!.busy, write: next.get(l.calendar_id)!.write } : l)) }),
        () => postJson(session, "/api/calendar/lists", { workspaceId: ws.id, accountId: a.id, calendars }),
      );
    });

  const accounts = data.data?.accounts ?? [];
  const calendars = accounts.filter((a) => a.provider !== "zoom");
  const missing = PROVIDERS.filter((p) => !accounts.some((a) => a.provider === p.id));
  return (
    <>
      <div className="mb-2.5 flex min-h-8 items-center gap-2">
        <h2 className="flex-1 text-[13.5px] font-semibold text-ink">Calendars</h2>
        {note ? (
          <Badge tone="green" dot>
            {note}
          </Badge>
        ) : null}
      </div>
      <ErrorNote message={error || data.error} />
      {!data.data ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-5">
          {!calendars.length ? <p className="text-[13px] text-muted">None connected</p> : null}
          {accounts.map((a) => {
            const p = providerOf(a.provider);
            const lists = data.data!.lists.filter((l) => l.account_id === a.id);
            const writing = lists.find((l) => l.write)?.calendar_id ?? "";
            return (
              <section key={a.id} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <BrandLogo domain={p.domain} name={p.name} size={16} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium text-ink">{a.account_email}</span>
                    <span className="text-[12px] text-muted">{p.name}</span>
                  </span>
                  {a.status === "reconnect" ? (
                    <Button size="sm" onClick={() => void connect(a.provider)}>
                      Reconnect
                    </Button>
                  ) : null}
                  <MoreMenu
                    items={[
                      a.provider !== "zoom" ? { label: "Read now", run: () => void act(async () => (await postJson(session, "/api/calendar/refresh", { workspaceId: ws.id, accountId: a.id }), data.reload())) } : null,
                      {
                        label: "Disconnect",
                        danger: true,
                        run: () =>
                          void act(async () => {
                            if (!(await askConfirm(`Disconnect ${a.account_email}?`, { ok: "Disconnect", danger: true }))) return;
                            await data.mutate(
                              (d) => ({ accounts: d.accounts.filter((x) => x.id !== a.id), lists: d.lists.filter((l) => l.account_id !== a.id) }),
                              () => postJson(session, "/api/calendar/disconnect", { workspaceId: ws.id, accountId: a.id }),
                            );
                            invalidate("app_counts");
                          }),
                      },
                    ]}
                  />
                </div>
                {a.provider !== "zoom" && lists.length ? (
                  <>
                    <span className="text-[12px] text-muted">Check for conflicts</span>
                    <ul className="-mt-1 flex flex-col">
                      {lists.map((l) => (
                        <li key={l.calendar_id}>
                          <button type="button" role="checkbox" aria-checked={l.busy} onClick={() => void saveLists(a, lists, l.calendar_id, { busy: !l.busy })} className="flex h-[30px] w-full min-w-0 items-center gap-2.5 text-left text-[13px] text-ink">
                            <span className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-colors duration-[120ms] ${l.busy ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>{l.busy ? <Check size={11} /> : null}</span>
                            <span className="truncate">{l.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <span className="text-[12px] text-muted">Add new bookings to</span>
                    {lists.length <= 3 && lists.every((l) => l.name.length <= 14) ? (
                      <Segmented<string> size="sm" label="Add new bookings to" value={writing} options={lists.map((l) => ({ value: l.calendar_id, label: l.name }))} onChange={(id) => void saveLists(a, lists, id, { write: true })} />
                    ) : (
                      <Select<string>
                        value={writing}
                        options={lists.map((l) => ({ value: l.calendar_id, label: l.name }))}
                        onChange={(id) => void saveLists(a, lists, id, { write: true })}
                        ariaLabel="Add new bookings to"
                        className="h-[34px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink"
                      />
                    )}
                  </>
                ) : null}
              </section>
            );
          })}
          {missing.length ? (
            <div className="flex flex-col items-start gap-2">
              {missing.map((p) => (
                <Button key={p.id} variant="ghost" size="sm" className="!border-line" onClick={() => void connect(p.id)}>
                  <BrandLogo domain={p.domain} name={p.name} size={15} />
                  {p.id === "google" ? "Google Calendar" : p.id === "microsoft" ? "Outlook" : "Zoom"}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
