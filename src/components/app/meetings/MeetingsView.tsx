"use client";

// Meetings (docs/meetings-scheduler.md 1.7 and 1.9): upcoming and past meetings with their guest, company, hosts,
// type, time, status and source; filters by host, type and status; Held and No-show once a meeting has started.
// /meetings/<id> opens one meeting, /meetings/types the meeting types and /meetings/types/<id> the type editor.

import { useMemo, useState } from "react";
import { meetingsPage } from "@/lib/nav";
import type { MeetingSource, MeetingStatus } from "@/lib/meetings/types";
import { CalendarIcon, Link as LinkIcon, Plus } from "../../Icons";
import { Select } from "../Select";
import { ToolIntro } from "../ToolIntro";
import { Button, Empty, ErrorNote, errorText, Loading, must, Page, Tabs, useLoad, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";
import { LinkDialog } from "./LinkDialog";
import { MeetingPage } from "./MeetingPage";
import { canMark, filterMeetings, SOURCES, splitMeetings, STATUS, type MeetingFilter, type MeetingRow } from "./model";
import { AvatarStack, meetingsApi, StatusBadge, useNow, usePeople, type Person } from "./parts";
import { TypeEditor } from "./TypeEditor";
import { TypesList } from "./TypesList";

export type Meeting = MeetingRow & {
  guest_email: string;
  guest_name: string | null;
  guest_tz: string | null;
  contact_id: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null; company: { name: string | null; domain: string | null } | null } | null;
};

export const MEETING_COLUMNS =
  "id, type_id, hosts, status, source, start_at, end_at, guest_email, guest_name, guest_tz, contact_id, contact:contacts!meetings_contact_id_fkey(id, first_name, last_name, company:companies!contacts_company_id_fkey(name, domain))";

export type TypeLite = { id: string; name: string; slug: string; kind: string; lengths?: number[] };

export function MeetingsView(props: ViewProps) {
  const p = meetingsPage(props.id);
  if (p.page === "meeting") return <MeetingPage {...props} id={p.id} />;
  if (p.page === "types") return <TypesList {...props} />;
  if (p.page === "type") return <TypeEditor {...props} id={p.id} />;
  return <MeetingsList {...props} />;
}

/** "Today", "Tomorrow", or "Tue 3 Nov". */
function dayLabel(iso: string, now: number) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-CA");
  const today = new Date(now);
  const tomorrow = new Date(now + 86_400_000);
  const yesterday = new Date(now - 86_400_000);
  if (key(d) === key(today)) return "Today";
  if (key(d) === key(tomorrow)) return "Tomorrow";
  if (key(d) === key(yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

export const guestName = (m: Pick<Meeting, "guest_name" | "guest_email" | "contact">) =>
  m.guest_name || [m.contact?.first_name, m.contact?.last_name].filter(Boolean).join(" ") || m.guest_email;

function MeetingsList(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const now = useNow();
  const people = usePeople(sb, ws.id);
  const data = useLoad(async () => {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const [meetings, types] = await Promise.all([
      sb.from("meetings").select(MEETING_COLUMNS).eq("workspace_id", ws.id).gte("start_at", since).order("start_at", { ascending: false }).limit(500),
      sb.from("meeting_types").select("id, name, slug, kind, lengths:settings->lengths").eq("workspace_id", ws.id).order("name"),
    ]);
    return { meetings: (must(meetings) ?? []) as unknown as Meeting[], types: (must(types) ?? []) as TypeLite[] };
  }, ws.id);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [filter, setFilter] = useState<MeetingFilter>({ host: "", type: "", status: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const split = useMemo(() => splitMeetings(data.data?.meetings ?? [], now), [data.data, now]);
  const rows = filterMeetings(split[tab], filter);
  const typeName = useMemo(() => new Map((data.data?.types ?? []).map((t) => [t.id, t.name])), [data.data]);

  const mark = async (m: Meeting, action: "held" | "no_show") => {
    setError("");
    setBusy(m.id);
    try {
      await meetingsApi(session, ws.id, "action", { meetingId: m.id, action });
      data.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  if (data.data && !data.data.types.length && !data.data.meetings.length)
    return (
      <Page icon={<CalendarIcon size={14} />} title="Meetings">
        <ToolIntro
          sketch="calendar"
          title={"Leads book time with your team\nwithout the back and forth"}
          lead="Meeting types turn your team's calendars into booking pages, round robins and one-time links. Every booking lands on the contact."
          action={
            <>
              <Button onClick={() => navigate("meetings", "types/new")}>
                <Plus size={14} />
                New meeting type
              </Button>
              <Button variant="ghost" onClick={() => navigate("settings", "calendar")}>
                <CalendarIcon size={14} />
                Connect your calendar
              </Button>
            </>
          }
        />
      </Page>
    );

  const hostOptions = [{ value: "", label: "Any host" }, ...(people.data?.list ?? []).map((p) => ({ value: p.id, label: p.name }))];
  const typeOptions = [{ value: "", label: "Any type" }, ...(data.data?.types ?? []).map((t) => ({ value: t.id, label: t.name }))];
  const statusOptions = [{ value: "", label: "Any status" }, ...(Object.keys(STATUS) as MeetingStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))];
  const filtered = filter.host || filter.type || filter.status;

  // Rows under a line for each day.
  const groups: { label: string; rows: Meeting[] }[] = [];
  for (const m of rows) {
    const label = dayLabel(m.start_at, now);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.rows.push(m);
    else groups.push({ label, rows: [m] });
  }

  return (
    <Page
      icon={<CalendarIcon size={14} />}
      title="Meetings"
      flush
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate("meetings", "types")}>
            Meeting types
          </Button>
          <Button onClick={() => setLinking(true)}>
            <LinkIcon size={14} />
            New link
          </Button>
        </>
      }
    >
      {linking ? <LinkDialog sb={sb} session={session} ws={ws} types={data.data?.types ?? []} onClose={() => setLinking(false)} /> : null}
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "upcoming", label: "Upcoming", count: data.data ? split.upcoming.length : undefined },
          { value: "past", label: "Past", count: data.data ? split.past.length : undefined },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
        <FilterPick label="Host" value={filter.host} options={hostOptions} onChange={(host) => setFilter({ ...filter, host })} />
        <FilterPick label="Type" value={filter.type} options={typeOptions} onChange={(type) => setFilter({ ...filter, type })} />
        <FilterPick label="Status" value={filter.status} options={statusOptions} onChange={(status) => setFilter({ ...filter, status: status as MeetingFilter["status"] })} />
        {filtered ? (
          <Button variant="plain" size="sm" onClick={() => setFilter({ host: "", type: "", status: "" })}>
            Clear
          </Button>
        ) : null}
      </div>
      {error || data.error ? (
        <div className="px-4 pt-3 md:px-6">
          <ErrorNote message={error || data.error} />
        </div>
      ) : null}
      {!data.data ? (
        data.error ? null : <Loading />
      ) : !rows.length ? (
        <Empty sketch={<Sketch name="calendar" size={150} />} title={filtered ? "No matches" : tab === "upcoming" ? "No upcoming meetings" : "No past meetings"}>
          {!filtered && tab === "upcoming" ? (
            <Button variant="ghost" className="mt-3" onClick={() => navigate("meetings", "types")}>
              Share a meeting type
            </Button>
          ) : null}
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                {["Guest", "Company", "Host", "Type", "Time", "Status", "Source", ""].map((h, i) => (
                  <th key={i} className="sticky top-0 z-[1] h-10 border-b border-line bg-card px-4 text-left text-[12px] font-medium whitespace-nowrap text-muted first:pl-4 md:first:pl-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.label}>
                <tr>
                  <td colSpan={8} className="bg-paper px-4 pt-4 pb-1.5 text-[12px] font-medium text-muted md:px-6">
                    {g.label}
                  </td>
                </tr>
                {g.rows.map((m) => (
                  <Row key={m.id} m={m} now={now} people={people.data?.byId} typeName={m.type_id ? typeName.get(m.type_id) : undefined} busy={busy === m.id} onOpen={() => navigate("meetings", m.id)} onMark={(a) => void mark(m, a)} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Page>
  );
}

function FilterPick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <Select<T>
      value={value}
      options={options}
      onChange={onChange}
      ariaLabel={label}
      className={`h-8 max-w-[200px] rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${value ? "border-ink bg-ink text-paper [&_svg]:text-paper" : "border-line-strong bg-card text-body hover:border-ink/40"}`}
    />
  );
}

function Row({ m, now, people, typeName, busy, onOpen, onMark }: { m: Meeting; now: number; people?: Map<string, Person>; typeName?: string; busy: boolean; onOpen: () => void; onMark: (a: "held" | "no_show") => void }) {
  const company = m.contact?.company?.name || m.contact?.company?.domain || (m.guest_email.split("@")[1] ?? "");
  const live = new Date(m.start_at).getTime() <= now && new Date(m.end_at).getTime() > now && m.status === "booked";
  return (
    <tr onClick={onOpen} className="group cursor-pointer transition-colors duration-[140ms] hover:bg-hover">
      <td className="h-14 border-b border-line py-2 pr-4 pl-4 md:pl-6">
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13.5px] font-medium text-ink">{guestName(m)}</span>
          {m.guest_name ? <span className="truncate text-[12px] text-muted">{m.guest_email}</span> : null}
        </span>
      </td>
      <td className="max-w-[180px] truncate border-b border-line px-4 text-[13.5px] text-body">{company}</td>
      <td className="border-b border-line px-4">
        <AvatarStack ids={m.hosts} people={people} />
      </td>
      <td className="max-w-[200px] truncate border-b border-line px-4 text-[13.5px] text-body">{typeName ?? (m.type_id ? "" : SOURCES[m.source])}</td>
      <td className="border-b border-line px-4 text-[13.5px] whitespace-nowrap text-ink tabular-nums">
        <span className="inline-flex items-center gap-2">
          {live ? <span className="size-1.5 rounded-full bg-clay" aria-label="Now" /> : null}
          {clock(m.start_at)} to {clock(m.end_at)}
        </span>
      </td>
      <td className="border-b border-line px-4">
        <StatusBadge status={m.status} />
      </td>
      <td className="border-b border-line px-4 text-[12.5px] text-muted">{SOURCES[m.source as MeetingSource] ?? m.source}</td>
      <td className="border-b border-line pr-4 pl-2 text-right md:pr-6" onClick={(e) => e.stopPropagation()}>
        {canMark(m, now) ? (
          <span className="inline-flex gap-1.5">
            <Button size="sm" variant={m.status === "held" ? "primary" : "ghost"} disabled={busy || m.status === "held"} onClick={() => onMark("held")}>
              Held
            </Button>
            <Button size="sm" variant={m.status === "no_show" ? "primary" : "ghost"} disabled={busy || m.status === "no_show"} onClick={() => onMark("no_show")}>
              No-show
            </Button>
          </span>
        ) : null}
      </td>
    </tr>
  );
}
