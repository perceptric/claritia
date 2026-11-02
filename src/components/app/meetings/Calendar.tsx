"use client";

// Inbound › Meetings › Upcoming (docs/meetings-scheduler.md 1.9): every meeting on the calendar. Numbers first (booked
// this week, show rate, no-shows, top source), then one row of controls: the span (Today, Upcoming, This week, Last
// week, or a picked day in the app's own picker), a search, filters as pills (host, type, status, source, booked in
// Claritia) and List or Week. The list groups by day with a line at the current time; busy times on your calendar are
// thin gray rows. A meeting opens in the side panel (J and K move, Enter opens); Join shows 10 minutes before.

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { MeetingStatus } from "@/lib/meetings/types";
import { CalendarIcon, Plus, Search, Video } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { DatePick, isoDay } from "../DatePick";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, Empty, ErrorNote, errorText, Input, invalidate, Loading, must, Page, Segmented, useQuery, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";
import { KIND_TONE } from "../scheduling/model";
import { TabBar, TabBody } from "../scheduling/frame";
import { MeetingSheet } from "./MeetingPage";
import { guestName, MEETING_COLUMNS, type Meeting } from "./MeetingsView";
import { canMark, joinOpen, joinUrl, meetingStats, outsideBusy, presetSpan, SOURCES, STATUS, timeRange, weekHours, type Preset, type StatRow } from "./model";
import { AvatarStack, meetingsApi, StatusBadge, useNow, usePeople } from "./parts";
import { PillFilters } from "./PillFilters";
import { useMeetingTypes } from "./TypesList";

const EDGE: Record<string, string> = { sky: "bg-sky", sage: "bg-sage", clay: "bg-clay", butter: "bg-butter", rose: "bg-rose", lilac: "bg-lilac" };
const PRESETS: { value: Exclude<Preset, "day">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "This week" },
  { value: "last_week", label: "Last week" },
];

type Busy = { start: string; end: string; ooo: boolean };
type Row = Meeting & { location?: unknown };
type Item = { kind: "meeting"; at: number; m: Row } | { kind: "busy"; at: number; b: Busy };
type View = "list" | "week";

const viewKey = (ws: string) => `claritia:upcoming-view:${ws}`;
const readView = (ws: string): View => {
  try {
    return localStorage.getItem(viewKey(ws)) === "week" ? "week" : "list";
  } catch {
    return "list";
  }
};

export function MeetingsCalendar(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const me = session.user.id;
  const now = useNow();
  const people = usePeople(sb, ws.id);
  const [preset, setPreset] = useState<Preset>("upcoming");
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [query, setQuery] = useState("");
  // Filters: host ("" is you), type, status, source, and "claritia" for booked in Claritia only.
  const [f, setF] = useState<Record<string, string>>({});
  const [view, setViewRaw] = useState<View>(() => (typeof window === "undefined" ? "list" : readView(ws.id)));
  const setView = (v: View) => {
    setViewRaw(v);
    try {
      localStorage.setItem(viewKey(ws.id), v);
    } catch {}
    if (v === "week" && (preset === "upcoming" || preset === "today")) setPreset("week");
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const whose = f.host || me;
  const scope = f.claritia ? "claritia" : "all";

  // The Week view always reads the whole week (Monday on) holding the span picked.
  const span = useMemo(() => {
    const s = presetSpan(preset, now, day);
    if (view !== "week") return s;
    const d = new Date(s.from);
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
    return { from: mon.getTime(), to: new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7).getTime() };
  }, [preset, day, now, view]);
  // Reload when the span moves to another day, not every minute.
  const spanKey = `${new Date(span.from).toDateString()}-${preset}-${day}-${view}`;
  const list = useQuery(`meetings:${ws.id}:span:${spanKey}`, async () =>
    (must(await sb.from("meetings").select(`${MEETING_COLUMNS}, location`).eq("workspace_id", ws.id).gte("end_at", new Date(span.from).toISOString()).lt("start_at", new Date(span.to).toISOString()).order("start_at").limit(1000)) ?? []) as unknown as Row[],
  );
  // The numbers: the last 30 days and this week's bookings, counted here from one small read.
  const stats = useQuery(`meetings:${ws.id}:stats`, async () => {
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
    return (must(await sb.from("meetings").select("status, source, start_at, created_at").eq("workspace_id", ws.id).or(`start_at.gte.${since},created_at.gte.${since}`).limit(5000)) ?? []) as StatRow[];
  });
  const allTypes = useMeetingTypes(sb, ws.id);
  const types = useMemo(() => (allTypes.data ? [...allTypes.data].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, name: t.name, kind: t.kind as string })) : []), [allTypes.data]);
  const typeOf = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const busy = useQuery(`meetings:${ws.id}:busy:${spanKey}:${scope}:${whose}`, async () => {
    if (scope !== "all" || whose === "everyone") return [] as Busy[];
    const { data: rows } = await sb.rpc("meeting_calendar_busy", { p_ws: ws.id, p_user: whose, p_from: new Date(span.from).toISOString(), p_to: new Date(span.to).toISOString() });
    return ((rows ?? []) as Busy[]) ?? [];
  });

  const filtered = !!(f.type || f.status || f.source || query.trim());
  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const ms = (list.data ?? []).filter(
      (m) =>
        (whose === "everyone" || m.hosts.includes(whose)) &&
        (!f.type || m.type_id === f.type) &&
        (!f.status || m.status === f.status) &&
        (!f.source || m.source === f.source) &&
        (!q || [guestName(m), m.guest_email, m.contact?.company?.name ?? "", m.type_id ? (typeOf.get(m.type_id)?.name ?? "") : ""].some((x) => x.toLowerCase().includes(q))),
    );
    const out: Item[] = ms.map((m) => ({ kind: "meeting", at: Date.parse(m.start_at), m }));
    if (scope === "all" && whose !== "everyone" && !filtered) for (const b of outsideBusy(busy.data ?? [], list.data ?? [], whose)) out.push({ kind: "busy", at: Date.parse(b.start), b });
    return out.sort((a, b) => a.at - b.at);
  }, [list.data, busy.data, whose, f.type, f.status, f.source, query, scope, typeOf, filtered]);
  const meetings = useMemo(() => items.flatMap((x) => (x.kind === "meeting" ? [x.m] : [])), [items]);

  const groups = useMemo(() => {
    const out: { key: string; date: Date; rows: Item[] }[] = [];
    for (const it of items) {
      const d = new Date(it.at);
      const key = d.toDateString();
      const g = out[out.length - 1];
      if (g?.key === key) g.rows.push(it);
      else out.push({ key, date: d, rows: [it] });
    }
    return out;
  }, [items]);

  // J and K move between meetings, Enter opens one; never while typing or with a dialog open.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || openId || t?.closest("input, textarea, [contenteditable=true], [role=dialog], [role=listbox]")) return;
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        setCursor((c) => {
          const n = Math.max(0, Math.min(meetings.length - 1, c + (e.key === "j" ? 1 : -1)));
          requestAnimationFrame(() => document.querySelector(`[data-meeting="${meetings[n]?.id}"]`)?.scrollIntoView({ block: "nearest" }));
          return n;
        });
      } else if (e.key === "Enter" && cursor >= 0 && meetings[cursor]) {
        e.preventDefault();
        setOpenId(meetings[cursor]!.id);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [meetings, cursor, openId]);

  // Held and No-show change on click; the row goes back, with the error, if the save fails.
  const mutateList = list.mutate;
  const mark = useCallback(
    async (m: Meeting, action: "held" | "no_show") => {
      setError("");
      setBusyId(m.id);
      try {
        await mutateList((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: action } : x)), () => meetingsApi(session, ws.id, "action", { meetingId: m.id, action }));
        invalidate(`meetings:${ws.id}:stats`);
        invalidate("app_counts");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusyId(null);
      }
    },
    [mutateList, session, ws.id],
  );
  const open = useCallback((id: string) => setOpenId(id), []);
  const cursorId = cursor >= 0 ? meetings[cursor]?.id : undefined;

  if (list.data && allTypes.data && !types.length && !list.data.length && preset === "upcoming")
    return (
      <Page title="Meetings">
        <ToolIntro
          sketch="calendar"
          title={"Leads book time with your team\nwithout the back and forth"}
          lead="Meeting types turn your team's calendars into booking pages, round robins and one-time links. Every booking lands here and on the contact."
          action={
            <>
              <Button onClick={() => navigate("scheduling", "types/new")}>
                <Plus size={14} />
                New meeting type
              </Button>
              <Button variant="ghost" onClick={() => navigate("scheduling", "availability")}>
                <CalendarIcon size={14} />
                Connect your calendar
              </Button>
            </>
          }
        />
      </Page>
    );

  const st = stats.data ? meetingStats(stats.data, now) : null;
  const count = meetings.length;
  const hostOptions = [{ value: "everyone", label: "Everyone" }, ...(people.data?.list ?? []).filter((p) => p.id !== me).map((p) => ({ value: p.id, label: p.name }))];
  const ready = !!list.data && !!allTypes.data;

  return (
    <Page title="Meetings" flush>
      {openId ? <MeetingSheet {...props} id={openId} onClose={() => setOpenId(null)} /> : null}
      <TabBody>
        <Strip
          cells={[
            { label: "Booked this week", value: st ? String(st.booked) : null },
            { label: "Show rate, 30 days", value: st ? (st.showRate === null ? "None yet" : `${st.showRate}%`) : null },
            { label: "No-shows, 30 days", value: st ? String(st.noShows) : null, warn: !!st?.noShows },
            { label: "Top source this week", value: st ? (st.topSource ? SOURCES[st.topSource] : "None yet") : null },
          ]}
        />
        <TabBar>
          <Segmented<Exclude<Preset, "day"> | "day">
            label="When"
            value={preset}
            options={[...PRESETS.filter((p) => view === "list" || p.value === "week" || p.value === "last_week"), ...(preset === "day" ? [{ value: "day" as const, label: "Day" }] : [])]}
            onChange={(v) => v !== "day" && setPreset(v)}
          />
          <DatePick label="Pick a day" value={day} on={preset === "day"} onChange={(d) => (setDay(d), setPreset("day"))} />
          <label className="relative flex w-full items-center sm:w-56">
            <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings" aria-label="Search meetings" className="h-9 rounded-full pl-8" />
          </label>
          <PillFilters
            values={f}
            onChange={setF}
            fields={[
              { key: "host", label: "Host", options: hostOptions },
              { key: "type", label: "Type", options: types.map((t) => ({ value: t.id, label: t.name })) },
              { key: "status", label: "Status", options: (Object.keys(STATUS) as MeetingStatus[]).map((s) => ({ value: s, label: STATUS[s].label })) },
              { key: "source", label: "Source", options: Object.entries(SOURCES).map(([v, l]) => ({ value: v, label: l })) },
              { key: "claritia", label: "Calendar", options: [{ value: "1", label: "Booked in Claritia" }] },
            ]}
          />
          <span className="ml-auto flex items-center gap-3">
            {count ? (
              <span className="text-[12.5px] text-muted tabular-nums">
                {count} {count === 1 ? "meeting" : "meetings"}
              </span>
            ) : null}
            <Segmented<View>
              size="sm"
              label="View"
              value={view}
              options={[
                { value: "list", label: "List" },
                { value: "week", label: "Week" },
              ]}
              onChange={setView}
            />
          </span>
        </TabBar>

        <ErrorNote message={error || list.error || allTypes.error} />
        {!ready ? (
          <Loading />
        ) : view === "week" ? (
          <WeekGrid from={span.from} items={items} typeOf={typeOf} now={now} onOpen={open} cursorId={cursorId} />
        ) : !groups.length ? (
          <Empty sketch={<Sketch name="calendar" size={150} />} title={filtered ? "No matches" : "No meetings in this span"}>
            {!filtered ? (
              <Button variant="ghost" className="mt-3" onClick={() => navigate("scheduling", "types")}>
                Share a meeting type
              </Button>
            ) : null}
          </Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => {
              const isToday = g.key === new Date(now).toDateString();
              const nowAt = isToday ? g.rows.findIndex((x) => x.at > now) : -1;
              return (
                <section key={g.key} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-ink">
                    {g.date.toLocaleDateString("en-US", { weekday: "short" })}
                    <span className="font-medium text-muted">{g.date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                    {isToday ? <Badge tone="sky">Today</Badge> : null}
                  </h2>
                  <ul className="flex flex-col overflow-hidden rounded-lg border border-line bg-card">
                    {g.rows.map((it, i) => (
                      <li key={it.kind === "meeting" ? it.m.id : `b-${it.b.start}-${i}`} className="border-line [contain-intrinsic-size:auto_56px] [content-visibility:auto] not-first:border-t">
                        {i === nowAt ? <NowLine /> : null}
                        {it.kind === "meeting" ? (
                          <MeetingRow
                            m={it.m}
                            now={now}
                            live={Date.parse(it.m.start_at) <= now && Date.parse(it.m.end_at) > now && it.m.status === "booked"}
                            markable={canMark(it.m, now)}
                            kind={it.m.type_id ? typeOf.get(it.m.type_id)?.kind : undefined}
                            typeName={it.m.type_id ? typeOf.get(it.m.type_id)?.name : undefined}
                            people={people.data?.byId}
                            busy={busyId === it.m.id}
                            current={cursorId === it.m.id}
                            onOpen={open}
                            onMark={mark}
                          />
                        ) : (
                          <div className="flex h-9 items-center gap-4 bg-paper px-4 text-[12.5px] text-faint">
                            <span className="w-[150px] shrink-0 tabular-nums">{timeRange(it.b.start, it.b.end)}</span>
                            <span>{it.b.ooo ? "Out of office" : "Busy on your calendar"}</span>
                          </div>
                        )}
                      </li>
                    ))}
                    {isToday && nowAt === -1 ? <NowLine /> : null}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </TabBody>
    </Page>
  );
}

/** Upcoming's numbers in one slim row. */
function Strip({ cells }: { cells: { label: string; value: string | null; warn?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-card md:grid-cols-4">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex min-w-0 flex-col gap-1 px-4 py-3 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "max-md:border-t md:border-l" : ""}`}>
          <span className="truncate text-[12px] text-muted">{c.label}</span>
          {c.value === null ? (
            <span className="anim-shimmer h-5 w-12 rounded-full bg-paper-deep" />
          ) : (
            <span className={`truncate text-[18px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${c.warn ? "text-rose" : "text-ink"}`}>{c.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function NowLine() {
  return (
    <div className="relative flex items-center" aria-label="Now">
      <span className="size-2 rounded-full bg-rose" />
      <span className="h-px flex-1 bg-rose" />
    </div>
  );
}

/** One meeting's row. Memoized: the minute ticking only redraws a row whose live, Join or Held/No-show state changes. */
const MeetingRow = memo(function MeetingRow({
  m,
  now,
  live,
  markable,
  kind,
  typeName,
  people,
  busy,
  current,
  onOpen: openId,
  onMark: markIt,
}: {
  m: Row;
  now: number;
  live: boolean;
  markable: boolean;
  kind?: string;
  typeName?: string;
  people?: Map<string, import("./parts").Person>;
  busy: boolean;
  current: boolean;
  onOpen: (id: string) => void;
  onMark: (m: Meeting, a: "held" | "no_show") => void;
}) {
  const onOpen = () => openId(m.id);
  const onMark = (a: "held" | "no_show") => void markIt(m, a);
  const company = m.contact?.company?.name || m.contact?.company?.domain || "";
  const domain = m.contact?.company?.domain || (m.guest_email.split("@")[1] ?? "");
  const tone = kind ? KIND_TONE[kind as keyof typeof KIND_TONE] : "sky";
  const join = joinOpen(m, now) ? joinUrl(m.location) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      data-meeting={m.id}
      aria-current={current || undefined}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" ? onOpen() : null)}
      className={`group relative flex min-h-14 cursor-pointer items-center gap-4 py-2 pr-3 pl-5 transition-colors duration-[120ms] outline-none focus-visible:bg-hover ${current ? "bg-hover" : live ? "bg-clay-wash/30" : "hover:bg-hover"} ${m.status === "canceled" ? "opacity-60" : ""}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-2 left-0 w-1 rounded-r-full ${current ? "bg-ink" : (EDGE[tone] ?? "bg-sky")}`} />
      <span className="w-[150px] shrink-0 text-[13px] whitespace-nowrap text-ink tabular-nums">{timeRange(m.start_at, m.end_at)}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] text-ink">
          <span className="font-semibold">{typeName ?? SOURCES[m.source]}</span> <span className="text-muted">with {guestName(m)}</span>
        </span>
        {company || domain ? (
          <span className="flex items-center gap-1.5 truncate text-[12px] text-muted">
            {domain ? <BrandLogo domain={domain} name={company || domain} size={13} /> : null}
            {company || domain}
          </span>
        ) : null}
      </span>
      <span className="max-sm:hidden">
        <AvatarStack ids={m.hosts} people={people} />
      </span>
      {join ? (
        <a href={join} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="press inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-paper hover:opacity-90">
          <Video size={13} />
          Join
        </a>
      ) : (
        <StatusBadge status={m.status} />
      )}
      {markable ? (
        <span onClick={(e) => e.stopPropagation()} className="flex shrink-0 gap-1.5 max-sm:hidden">
          <Button size="sm" variant={m.status === "held" ? "primary" : "ghost"} disabled={busy || m.status === "held"} onClick={() => onMark("held")}>
            Held
          </Button>
          <Button size="sm" variant={m.status === "no_show" ? "primary" : "ghost"} disabled={busy || m.status === "no_show"} onClick={() => onMark("no_show")}>
            No-show
          </Button>
        </span>
      ) : null}
    </div>
  );
});

const HOUR = 48;

/** A week from Monday: a column a day, meetings placed by their hours, busy times as gray bands. */
function WeekGrid({ from, items, typeOf, now, onOpen, cursorId }: { from: number; items: Item[]; typeOf: Map<string, { name: string; kind: string }>; now: number; onOpen: (id: string) => void; cursorId?: string }) {
  const start = new Date(from);
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
  const spans = items.map((it) => (it.kind === "meeting" ? { start: Date.parse(it.m.start_at), end: Date.parse(it.m.end_at) } : { start: Date.parse(it.b.start), end: Date.parse(it.b.end) }));
  const { from: h0, to: h1 } = weekHours(spans);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const top = (t: number, d: Date) => ((t - d.getTime()) / 3_600_000 - h0) * HOUR;
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-card">
      <div className="grid min-w-[760px] grid-cols-[52px_repeat(7,minmax(0,1fr))]">
        <span className="border-b border-line" />
        {days.map((d) => {
          const today = d.toDateString() === new Date(now).toDateString();
          return (
            <div key={d.toDateString()} className="flex h-11 items-center justify-center gap-1.5 border-b border-l border-line text-[12.5px]">
              <span className="text-muted">{d.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span className={`inline-flex size-6 items-center justify-center rounded-full font-semibold tabular-nums ${today ? "bg-ink text-paper" : "text-ink"}`}>{d.getDate()}</span>
            </div>
          );
        })}
        <div className="relative" style={{ height: hours.length * HOUR }}>
          {hours.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint tabular-nums" style={{ top: i * HOUR }}>
              {i ? new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" }) : ""}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
          const mine = items.filter((it) => it.at >= d.getTime() && it.at < end);
          const today = d.toDateString() === new Date(now).toDateString();
          return (
            <div key={d.toDateString()} className="relative border-l border-line" style={{ height: hours.length * HOUR }}>
              {hours.map((h, i) => (
                <span key={h} aria-hidden="true" className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />
              ))}
              {today && now >= d.getTime() && now < end ? <span aria-hidden="true" className="absolute inset-x-0 z-10 h-px bg-rose" style={{ top: top(now, d) }} /> : null}
              {mine.map((it, i) => {
                if (it.kind === "busy") {
                  const s = Date.parse(it.b.start);
                  const e = Date.parse(it.b.end);
                  return <span key={`b${i}`} aria-hidden="true" className="absolute inset-x-1 rounded-md bg-paper-deep/70" style={{ top: top(s, d), height: Math.max(12, ((e - s) / 3_600_000) * HOUR - 2) }} />;
                }
                const m = it.m;
                const s = Date.parse(m.start_at);
                const e = Date.parse(m.end_at);
                const t = m.type_id ? typeOf.get(m.type_id) : undefined;
                const tone = t ? KIND_TONE[t.kind as keyof typeof KIND_TONE] : "sky";
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-meeting={m.id}
                    onClick={() => onOpen(m.id)}
                    title={`${timeRange(m.start_at, m.end_at)}, ${t?.name ?? SOURCES[m.source]} with ${guestName(m)}`}
                    className={`absolute inset-x-1 flex flex-col overflow-hidden rounded-md border bg-card px-2 py-1 text-left text-[11.5px] leading-tight transition-colors duration-[120ms] hover:border-ink ${cursorId === m.id ? "border-ink" : "border-line-strong"} ${m.status === "canceled" ? "opacity-50" : ""}`}
                    style={{ top: top(s, d) + 1, height: Math.max(20, ((e - s) / 3_600_000) * HOUR - 2) }}
                  >
                    <span aria-hidden="true" className={`absolute inset-y-1 left-0 w-0.5 rounded-r-full ${EDGE[tone] ?? "bg-sky"}`} />
                    <span className="truncate font-semibold text-ink">{guestName(m)}</span>
                    <span className="truncate text-muted tabular-nums">{timeRange(m.start_at, m.end_at)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
