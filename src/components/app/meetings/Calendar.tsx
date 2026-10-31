"use client";

// Inbound › Meetings › Upcoming (once CRM › Meetings, docs/app-structure.md 3.1), after Calendly's Calendar page: whose meetings, a search, filters, All
// meetings or Booked in Claritia (All adds the busy times on connected calendars), Today, Upcoming, This week, Last
// week or a picked day, and "Showing 31 meetings". Then numbers first (booked this week, held, from forms), and the
// meetings by day with a Today pill and a line at the current time. Each meeting shows its time, type, guest, company
// and hosts; Held and No-show once it has started. A meeting opens on its own page.

import { memo, useCallback, useMemo, useState } from "react";
import type { MeetingStatus } from "@/lib/meetings/types";
import { CalendarIcon, Link as LinkIcon, Plus, Search } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Select } from "../Select";
import { StatCards } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, Empty, ErrorNote, errorText, Input, invalidate, Loading, must, Page, Segmented, useQuery, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";
import { KIND_TONE } from "../scheduling/model";
import { LinkDialog } from "./LinkDialog";
import { guestName, MEETING_COLUMNS, type Meeting } from "./MeetingsView";
import { canMark, outsideBusy, presetSpan, SOURCES, STATUS, type Preset } from "./model";
import { AvatarStack, meetingsApi, StatusBadge, useNow, usePeople } from "./parts";
import { useMeetingTypes } from "./TypesList";

const EDGE: Record<string, string> = { sky: "bg-sky", sage: "bg-sage", clay: "bg-clay", butter: "bg-butter", rose: "bg-rose", lilac: "bg-lilac" };
const PRESETS: { value: Exclude<Preset, "day">; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "week", label: "This week" },
  { value: "last_week", label: "Last week" },
];

type Busy = { start: string; end: string; ooo: boolean };
type Item = { kind: "meeting"; at: number; m: Meeting } | { kind: "busy"; at: number; b: Busy };

const clock = (t: string | number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export function MeetingsCalendar(props: ViewProps) {
  const { sb, session, ws, role, navigate } = props;
  const me = session.user.id;
  const now = useNow();
  const people = usePeople(sb, ws.id);
  const [whose, setWhose] = useState<string>(me);
  const [preset, setPreset] = useState<Preset>("upcoming");
  const [day, setDay] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [scope, setScope] = useState<"all" | "claritia">("all");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState<MeetingStatus | "">("");
  const [source, setSource] = useState("");
  const [linking, setLinking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const span = useMemo(() => presetSpan(preset, now, day), [preset, day, now]);
  // Reload when the span moves to another day, not every minute.
  const spanKey = `${new Date(span.from).toDateString()}-${preset}-${day}`;
  // The span's meetings (cached per span, so going back to a span paints at once), the shared types, and this week's
  // numbers counted by the database.
  const list = useQuery(`meetings:${ws.id}:span:${spanKey}`, async () =>
    (must(await sb.from("meetings").select(MEETING_COLUMNS).eq("workspace_id", ws.id).gte("end_at", new Date(span.from).toISOString()).lt("start_at", new Date(span.to).toISOString()).order("start_at").limit(1000)) ?? []) as unknown as Meeting[],
  );
  const allTypes = useMeetingTypes(sb, ws.id);
  const stats = useQuery(`meetings:${ws.id}:week`, async () => must(await sb.rpc("meetings_week_stats", { p_ws: ws.id, p_since: new Date(Date.now() - 7 * 86_400_000).toISOString() })) as WeekStats);
  const typeList = useMemo(() => (allTypes.data ? [...allTypes.data].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({ id: t.id, name: t.name, slug: t.slug, kind: t.kind as string, lengths: t.settings.lengths })) : null), [allTypes.data]);
  const data = { data: list.data && typeList ? { meetings: list.data, types: typeList } : null, error: list.error || allTypes.error };
  const busy = useQuery(`meetings:${ws.id}:busy:${spanKey}:${scope}:${whose}`, async () => {
    if (scope !== "all" || whose === "everyone") return [] as Busy[];
    const { data: rows } = await sb.rpc("meeting_calendar_busy", { p_ws: ws.id, p_user: whose, p_from: new Date(span.from).toISOString(), p_to: new Date(span.to).toISOString() });
    return ((rows ?? []) as Busy[]) ?? [];
  });

  const types = useMemo(() => typeList ?? [], [typeList]);
  const typeOf = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const ms = (list.data ?? []).filter(
      (m) =>
        (whose === "everyone" || m.hosts.includes(whose)) &&
        (!type || m.type_id === type) &&
        (!status || m.status === status) &&
        (!source || m.source === source) &&
        (!q || [guestName(m), m.guest_email, m.contact?.company?.name ?? "", m.type_id ? (typeOf.get(m.type_id)?.name ?? "") : ""].some((x) => x.toLowerCase().includes(q))),
    );
    const out: Item[] = ms.map((m) => ({ kind: "meeting", at: Date.parse(m.start_at), m }));
    if (scope === "all" && whose !== "everyone" && !q && !type && !status && !source) for (const b of outsideBusy(busy.data ?? [], list.data ?? [], whose)) out.push({ kind: "busy", at: Date.parse(b.start), b });
    return out.sort((a, b) => a.at - b.at);
  }, [list.data, busy.data, whose, type, status, source, query, scope, typeOf]);

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

  // Held and No-show change on click; the row goes back, with the error, if the save fails.
  const mutateList = list.mutate;
  const mark = useCallback(
    async (m: Meeting, action: "held" | "no_show") => {
      setError("");
      setBusyId(m.id);
      try {
        await mutateList((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: action } : x)), () => meetingsApi(session, ws.id, "action", { meetingId: m.id, action }));
        invalidate(`meetings:${ws.id}:week`);
        invalidate("app_counts");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusyId(null);
      }
    },
    [mutateList, session, ws.id],
  );
  const open = useCallback((id: string) => navigate("meetings", id), [navigate]);

  if (data.data && !types.length && !data.data.meetings.length && preset === "upcoming")
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
                New meeting
              </Button>
              <Button variant="ghost" onClick={() => navigate("scheduling", "availability/calendars")}>
                <CalendarIcon size={14} />
                Connect your calendar
              </Button>
            </>
          }
        />
      </Page>
    );

  const w = stats.data;
  const held = w?.held ?? 0;
  const noShow = w?.no_show ?? 0;
  const fromForms = w?.from_forms ?? 0;
  const past = { length: w?.past ?? 0 };
  const week = { length: w?.total ?? 0 };
  const count = items.filter((x) => x.kind === "meeting").length;
  const whoseOptions = [
    { value: me, label: "My meetings" },
    ...(role === "owner" ? [{ value: "everyone", label: "Everyone" }] : []),
    ...(people.data?.list ?? []).filter((p) => p.id !== me).map((p) => ({ value: p.id, label: p.name })),
  ];
  const filtered = !!(type || status || source || query.trim());

  return (
    <Page
      title="Meetings"
      flush
      actions={
        <>
          <Button onClick={() => setLinking(true)}>
            <LinkIcon size={14} />
            New link
          </Button>
        </>
      }
    >
      {linking ? <LinkDialog sb={sb} session={session} ws={ws} types={types} onClose={() => setLinking(false)} /> : null}
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Select<string> value={whose} options={whoseOptions} onChange={setWhose} ariaLabel="Whose meetings" className="h-9 w-44" />
          <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meetings" aria-label="Search meetings" className="h-9 pl-8" />
          </label>
          <Select<string> value={type} options={[{ value: "", label: "Any type" }, ...types.map((t) => ({ value: t.id, label: t.name }))]} onChange={setType} ariaLabel="Type" className="h-9 w-40" />
          <Select<string> value={status} options={[{ value: "", label: "Any status" }, ...(Object.keys(STATUS) as MeetingStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))]} onChange={(v) => setStatus(v as MeetingStatus | "")} ariaLabel="Status" className="h-9 w-36" />
          <Select<string> value={source} options={[{ value: "", label: "Any source" }, ...Object.entries(SOURCES).map(([v, l]) => ({ value: v, label: l }))]} onChange={setSource} ariaLabel="Source" className="h-9 w-36" />
          <span className="ml-auto">
            <Segmented<"all" | "claritia">
              label="Which meetings"
              value={scope}
              options={[
                { value: "all", label: "All meetings" },
                { value: "claritia", label: "Booked in Claritia" },
              ]}
              onChange={setScope}
            />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); setPreset("day"); }} aria-label="Pick a day" className={`h-9 w-40 ${preset === "day" ? "border-ink" : ""}`} />
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={preset === p.value}
              onClick={() => setPreset(p.value)}
              className={`press h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-[140ms] ${preset === p.value ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:border-ink/40"}`}
            >
              {p.label}
            </button>
          ))}
          {filtered ? (
            <Button variant="plain" size="sm" onClick={() => { setType(""); setStatus(""); setSource(""); setQuery(""); }}>
              Clear
            </Button>
          ) : null}
          <span className="ml-auto text-[12.5px] text-muted tabular-nums">
            Showing {count} {count === 1 ? "meeting" : "meetings"}
          </span>
        </div>

        <StatCards
          cards={[
            { label: "Booked this week", value: w ? w.booked : null, note: "Across the team" },
            { label: "Held", value: w ? held : null, note: past.length ? `${Math.round((noShow / past.length) * 100)}% no-shows` : "No meetings yet this week", tone: "sage" },
            { label: "Booked from forms", value: w ? fromForms : null, note: week.length ? `${Math.round((fromForms / week.length) * 100)}% of this week's bookings` : "This week" },
          ]}
        />

        <ErrorNote message={error || data.error} />
        {!data.data ? (
          <Loading />
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
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink">
                    {g.date.toLocaleDateString("en-US", { weekday: "short" })}
                    <span className="font-medium text-muted">{g.date.toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
                    {isToday ? <Badge tone="sky">Today</Badge> : null}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {g.rows.map((it, i) => (
                      <li key={it.kind === "meeting" ? it.m.id : `b-${it.b.start}-${i}`} className="flex flex-col gap-2 [contain-intrinsic-size:auto_68px] [content-visibility:auto]">
                        {i === nowAt ? <NowLine /> : null}
                        {it.kind === "meeting" ? (
                          <MeetingRow
                            m={it.m}
                            live={Date.parse(it.m.start_at) <= now && Date.parse(it.m.end_at) > now && it.m.status === "booked"}
                            markable={canMark(it.m, now)}
                            kind={it.m.type_id ? typeOf.get(it.m.type_id)?.kind : undefined}
                            typeName={it.m.type_id ? typeOf.get(it.m.type_id)?.name : undefined}
                            people={people.data?.byId}
                            busy={busyId === it.m.id}
                            onOpen={open}
                            onMark={mark}
                          />
                        ) : (
                          <div className="flex items-center gap-4 rounded-2xl border border-dashed border-line bg-paper px-5 py-3 text-[13px] text-muted">
                            <span className="w-28 shrink-0 tabular-nums">
                              {clock(it.b.start)} to {clock(it.b.end)}
                            </span>
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
      </div>
    </Page>
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

type WeekStats = { total: number; booked: number; past: number; held: number; no_show: number; from_forms: number };

/** One meeting card. Memoized: the minute ticking only redraws a card whose live or Held/No-show state changes. */
const MeetingRow = memo(function MeetingRow({
  m,
  live,
  markable,
  kind,
  typeName,
  people,
  busy,
  onOpen: openId,
  onMark: markIt,
}: {
  m: Meeting;
  live: boolean;
  markable: boolean;
  kind?: string;
  typeName?: string;
  people?: Map<string, import("./parts").Person>;
  busy: boolean;
  onOpen: (id: string) => void;
  onMark: (m: Meeting, a: "held" | "no_show") => void;
}) {
  const onOpen = () => openId(m.id);
  const onMark = (a: "held" | "no_show") => void markIt(m, a);
  const company = m.contact?.company?.name || m.contact?.company?.domain || "";
  const domain = m.contact?.company?.domain || (m.guest_email.split("@")[1] ?? "");
  const tone = kind ? KIND_TONE[kind as keyof typeof KIND_TONE] : "sky";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" ? onOpen() : null)}
      className={`group lift relative flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border bg-card py-3.5 pr-4 pl-6 ${live ? "border-clay/50 bg-clay-wash/30" : "border-line hover:border-line-strong"} ${m.status === "canceled" ? "opacity-60" : ""}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1.5 ${EDGE[tone] ?? "bg-sky"}`} />
      <span className="w-28 shrink-0 text-[13.5px] text-ink tabular-nums">
        {clock(m.start_at)} to {clock(m.end_at)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[14.5px] text-ink">
          <span className="font-semibold">{typeName ?? SOURCES[m.source]}</span> <span className="text-muted">with {guestName(m)}</span>
        </span>
        {company || domain ? (
          <span className="flex items-center gap-1.5 truncate text-[12.5px] text-muted">
            {domain ? <BrandLogo domain={domain} name={company || domain} size={14} /> : null}
            {company || domain}
          </span>
        ) : null}
      </span>
      <AvatarStack ids={m.hosts} people={people} />
      <StatusBadge status={m.status} />
      <span onClick={(e) => e.stopPropagation()} className="flex shrink-0 gap-1.5">
        {markable ? (
          <>
            <Button size="sm" variant={m.status === "held" ? "primary" : "ghost"} disabled={busy || m.status === "held"} onClick={() => onMark("held")}>
              Held
            </Button>
            <Button size="sm" variant={m.status === "no_show" ? "primary" : "ghost"} disabled={busy || m.status === "no_show"} onClick={() => onMark("no_show")}>
              No-show
            </Button>
          </>
        ) : null}
      </span>
    </div>
  );
});
