"use client";

// One meeting type in the 400 px panel (docs/scheduling-plan.md 11.2 and 12.1), after Calendly's event type panel:
// the name edited in place, then closed sections, each with a one-line summary, one open at a time: Duration,
// Location, Availability, Host, Limits and buffers, Booking questions, Notifications, Confirmation page and Payment.
// The footer is pinned: Saved, Preview and Save changes, which is off until something changed. Saving goes through
// /api/meetings/types like the full editor (checkType on the server); anything the panel doesn't show is in All
// settings (/scheduling/types/<id>/all). A Routing team host stores the router's queue id as settings.team.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, type Availability, type Host, type Location, type TypeSettings } from "@/lib/meetings/types";
import type { Queue } from "@/lib/router/types";
import { Bell, Bolt, CalendarIcon, Card, Check, Clock, Copy, Eye, Hourglass, Link as LinkIcon, ListIcon, MapPin, PhoneCall, Plus, Users, X } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { MoreMenu } from "../StatCards";
import { Badge, Button, ErrorNote, errorText, IconButton, Input, Segmented, setLeaveGuard, Toggle, type ViewProps } from "../ui";
import { slugify } from "../meetings/model";
import { copyText, meetingsApi, PersonAvatar, type Person } from "../meetings/parts";
import { CURRENCIES, draftOf, Questions, Reminders, type Draft } from "../meetings/TypeEditor";
import type { TypeRow } from "../meetings/TypesList";
import { confirmationWords, hostMode, KIND_WORDS, lengthWords, limitsWords, METHOD_WORDS, nextOff, offWords, PLACE_WORDS, priceWords, questionsWords, remindersWords, teamOf, weeklyWords, type HostMode } from "./model";
import { Chip, Eyebrow, Labeled, PanelFooter, PanelSection, TextLink } from "./panel";

export type HostStatus = { cal: boolean; out: { from: string; to: string }[] };
export type Named = { user_id: string; name: string } & Availability;
export type PanelData = {
  people: Person[];
  byId: Map<string, Person>;
  hours: Map<string, Availability>;
  named: Named[];
  status: Map<string, HostStatus>;
  queues: Queue[];
  wsSlug: string | null;
};

type SectionKey = "len" | "where" | "hours" | "host" | "limits" | "qs" | "notify" | "confirm" | "pay";
type LockKey = TypeRow["locked"][number];

const LENGTHS = [15, 30, 45, 60];
const BUFFERS = [0, 5, 10, 15];
const NOTICE = [60, 240, 1440];
const WINDOW = [7, 14, 30, 60];
const PER_DAY = [0, 2, 4, 8];

/** A new type: yours from You, the team's from Team; a name typed, Duration open. */
export function newDraft(me: string, team: boolean): Draft {
  return { name: "New meeting", slug: "new-meeting", kind: "one", hosts: [{ user_id: me }], settings: { ...DEFAULT_SETTINGS }, secret: false, active: true, locked: [], owner_user_id: team ? null : me };
}

const placeIcon = (kind: Location["kind"] | "phone", size = 14) =>
  kind === "google_meet" ? (
    <BrandLogo domain="meet.google.com" name="Google Meet" size={size} />
  ) : kind === "zoom" ? (
    <BrandLogo domain="zoom.us" name="Zoom" size={size} />
  ) : kind === "teams" ? (
    <BrandLogo domain="teams.microsoft.com" name="Microsoft Teams" size={size} />
  ) : kind === "in_person" ? (
    <MapPin size={size} />
  ) : kind === "link" ? (
    <LinkIcon size={size} />
  ) : (
    <PhoneCall size={size} />
  );
export { placeIcon };

const PLACES: { kind: Location["kind"]; label: string }[] = [
  { kind: "google_meet", label: "Google Meet" },
  { kind: "zoom", label: "Zoom" },
  { kind: "teams", label: "Teams" },
  { kind: "phone_guest", label: "Phone" },
  { kind: "in_person", label: "In person" },
  { kind: "link", label: "Custom link" },
];

/** The words for who takes a type, for the list and the panel's eyebrow. */
export function whoWords(t: Pick<Draft, "kind" | "hosts" | "settings">, queues: Queue[]): string {
  const team = teamOf(t.settings);
  if (team) return queues.find((q) => q.id === team)?.name ?? "Routing team";
  if (t.kind === "one") return "One person";
  if (t.kind === "group") return "Group event";
  if (t.kind === "collective") return `Everyone, ${t.hosts.length} hosts`;
  return `${KIND_WORDS[t.kind]}, ${t.hosts.length} ${t.hosts.length === 1 ? "host" : "hosts"}`;
}

/** Each host's hours for a type: their schedule of the type's name, else their working hours. */
function hoursOf(user: string | undefined, schedule: string | undefined, d: PanelData): Availability | null {
  if (!user) return null;
  if (schedule) {
    const n = d.named.find((x) => x.user_id === user && x.name.toLowerCase() === schedule.toLowerCase());
    if (n) return n;
  }
  return d.hours.get(user) ?? null;
}

export function TypePanel({
  session,
  ws,
  role,
  navigate,
  row,
  start,
  data,
  onClose,
  onSaved,
}: Pick<ViewProps, "session" | "ws" | "role" | "navigate"> & {
  row: TypeRow | null;
  /** The draft a new type starts from. */
  start: Draft;
  data: PanelData;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = session.user.id;
  const isNew = !row;
  const [draft, setDraft] = useState<Draft>(() => (row ? draftOf(row) : start));
  const [base, setBase] = useState(() => (row ? JSON.stringify(draftOf(row)) : ""));
  const [loadedFor, setLoadedFor] = useState(row?.updated_at ?? null);
  if (row && row.updated_at !== loadedFor) {
    setLoadedFor(row.updated_at);
    setDraft(draftOf(row));
    setBase(JSON.stringify(draftOf(row)));
  }
  const [open, setOpen] = useState<SectionKey | null>(isNew ? "len" : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [slugTouched] = useState(!isNew);
  const nameRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== base;

  useEffect(() => {
    setLeaveGuard(dirty ? () => askConfirm("Leave without saving?", { ok: "Leave", danger: true }) : null);
    return () => setLeaveGuard(null);
  }, [dirty]);
  useEffect(() => {
    if (!isNew) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [isNew]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement)?.closest?.("[role=dialog],[role=menu],[role=listbox]")) return;
      onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const copy = !!row?.template_id;
  const isLocked = (...k: LockKey[]) => copy && k.some((x) => draft.locked.includes(x));
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setS = <K extends keyof TypeSettings>(k: K, v: TypeSettings[K]) => setDraft((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const s = draft.settings;
  const toggle = (k: SectionKey) => setOpen((o) => (o === k ? null : k));
  const nameOf = (id: string) => data.byId.get(id)?.name ?? "Former teammate";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = data.wsSlug && draft.slug ? `${origin}/book/${data.wsSlug}/${draft.slug}` : "";

  const save = async () => {
    setError("");
    setBusy(true);
    const sent = draft;
    try {
      const r = await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "save", id: row?.id ?? null, type: sent });
      setBase(JSON.stringify(sent));
      onSaved();
      if (isNew) {
        setLeaveGuard(null);
        navigate("scheduling", `types/${r.id}`);
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!row) return;
    if (!(await askConfirm(`Delete ${draft.name || "this type"}?`, { body: "Its booking link stops working. Booked meetings stay.", ok: "Delete", danger: true }))) return;
    try {
      await meetingsApi(session, ws.id, "types", { action: "delete", id: row.id });
      setLeaveGuard(null);
      onSaved();
      navigate("scheduling", "types");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const duplicate = async () => {
    if (!row) return;
    try {
      const r = await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "duplicate", id: row.id });
      onSaved();
      navigate("scheduling", `types/${r.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  // Host -----------------------------------------------------------------------------------------------------------
  const mode = hostMode(draft.kind);
  const team = teamOf(s);
  const queue = team ? data.queues.find((q) => q.id === team) : undefined;
  const personal = !!draft.owner_user_id;
  const modes: { value: HostMode; label: string }[] = [
    { value: "one", label: "One person" },
    { value: "team", label: "A Routing team" },
    ...(personal ? [] : [{ value: "everyone" as const, label: "Everyone" }]),
  ];
  const withoutTeam = (x: TypeSettings): TypeSettings => {
    const { team: _t, ...rest } = x as TypeSettings & { team?: string };
    void _t;
    return rest;
  };
  const membersOf = (q: Queue): Host[] => q.members.filter((m) => data.byId.has(m.user)).map((m) => ({ user_id: m.user, weight: Math.min(10, Math.max(1, Math.round(m.weight || 1))), tier: 0 }));
  const pickTeam = (q: Queue) => setDraft((d) => ({ ...d, kind: d.kind === "owner_first" ? "owner_first" : "round_robin", hosts: membersOf(q).length ? membersOf(q) : d.hosts, settings: { ...d.settings, team: q.id } as TypeSettings }));
  const setMode = (m: HostMode) =>
    setDraft((d) => {
      const first = d.hosts[0]?.user_id ?? d.owner_user_id ?? me;
      if (m === "one") return { ...d, kind: d.kind === "group" ? "group" : "one", hosts: [{ user_id: first }], settings: withoutTeam(d.settings) };
      if (m === "everyone") return { ...d, kind: "collective", hosts: d.hosts.map((h) => ({ user_id: h.user_id })), settings: withoutTeam(d.settings) };
      const q = data.queues.find((x) => x.id === teamOf(d.settings)) ?? data.queues[0];
      return q ? { ...d, kind: "round_robin", hosts: membersOf(q).length ? membersOf(q) : d.hosts, settings: { ...d.settings, team: q.id } as TypeSettings } : { ...d, kind: "round_robin" };
    });
  const hostSummary =
    mode === "one"
      ? draft.hosts[0]
        ? `${nameOf(draft.hosts[0].user_id)}${draft.hosts[0].user_id === me ? " (you)" : ""}`
        : "Pick a host"
      : mode === "team"
        ? queue
          ? `${queue.name}, ${METHOD_WORDS[queue.method].toLowerCase()}`
          : team
            ? "Routing team"
            : `${KIND_WORDS[draft.kind]}, ${draft.hosts.length} ${draft.hosts.length === 1 ? "host" : "hosts"}`
        : `Everyone, ${draft.hosts.length} hosts`;
  const others = data.people.filter((p) => !draft.hosts.some((h) => h.user_id === p.id));

  // Availability ---------------------------------------------------------------------------------------------------
  const schedules = [...new Set(data.named.filter((n) => draft.hosts.some((h) => h.user_id === n.user_id)).map((n) => n.name))].sort();
  const hours = hoursOf(draft.hosts[0]?.user_id, s.schedule, data);
  const today = new Date().toLocaleDateString("en-CA");
  const kindWord = team ? "Routing team" : draft.kind === "collective" ? "Everyone" : KIND_WORDS[draft.kind];

  return (
    <aside aria-label="Meeting type" className="anim-panel absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-line bg-card shadow-[-12px_0_32px_-16px_var(--color-scrim)] md:w-[400px]">
      <div className="flex shrink-0 items-start gap-1 border-b border-line pt-3.5 pr-3 pb-3 pl-5">
        <div className="flex min-w-0 flex-1 flex-col">
          <Eyebrow>{kindWord}</Eyebrow>
          <input
            ref={nameRef}
            aria-label="Name"
            value={draft.name}
            maxLength={120}
            disabled={isLocked("name")}
            placeholder="Name"
            onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) || "" }) })}
            className="mt-0.5 w-full min-w-0 bg-transparent p-0 text-[17px] font-semibold tracking-[-0.015em] text-ink outline-none placeholder:text-faint focus:shadow-[inset_0_-1px_0_var(--color-ink)]"
          />
          <span className="mt-2 inline-flex h-6 max-w-full items-center gap-1.5 self-start rounded-full bg-paper-deep pr-1 pl-2.5 font-mono text-[11px] text-body">
            <span className="truncate">
              /{data.wsSlug ?? "…"}/{draft.slug || "…"}
            </span>
            {url && !isNew ? (
              <button
                type="button"
                aria-label={copied ? "Copied" : "Copy link"}
                title={copied ? "Copied" : "Copy link"}
                onClick={() =>
                  void copyText(url).then((ok) => {
                    if (!ok) return;
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  })
                }
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink"
              >
                {copied ? <Check size={11} className="text-signal-text" /> : <Copy size={11} />}
              </button>
            ) : null}
          </span>
        </div>
        <span className="flex h-8 items-center pr-1">
          <Toggle label={draft.active ? "Bookable" : "Turned off"} on={draft.active} onChange={(active) => set({ active })} />
        </span>
        {row ? (
          <MoreMenu
            items={[
              { label: "Duplicate", run: () => void duplicate() },
              { label: "All settings", run: () => navigate("scheduling", `types/${row.id}/all`) },
              !copy || role === "owner" ? { label: "Delete", danger: true, run: () => void remove() } : null,
            ]}
          />
        ) : null}
        <IconButton label="Close" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <div className="border-b border-line px-4 py-3">
            <ErrorNote message={error} />
          </div>
        ) : null}

        <PanelSection icon={<Clock />} title="Duration" summary={lengthWords(s.lengths)} open={open === "len"} onToggle={() => toggle("len")} locked={isLocked("lengths")}>
          <Lengths value={s.lengths} onChange={(v) => setS("lengths", v)} />
        </PanelSection>

        <PanelSection icon={<MapPin />} title="Location" summary={PLACE_WORDS[s.location.kind]} open={open === "where"} onToggle={() => toggle("where")} locked={isLocked("location")}>
          <div className="flex flex-wrap gap-1.5">
            {PLACES.map((p) => {
              const on = p.kind === "phone_guest" ? s.location.kind === "phone_guest" || s.location.kind === "phone_host" : s.location.kind === p.kind;
              return (
                <Chip key={p.kind} on={on} onClick={() => !on && setS("location", p.kind === "in_person" ? { kind: "in_person", address: "" } : p.kind === "link" ? { kind: "link", url: "" } : ({ kind: p.kind } as Location))}>
                  {placeIcon(p.kind)}
                  {p.label}
                </Chip>
              );
            })}
          </div>
          {s.location.kind === "phone_guest" || s.location.kind === "phone_host" ? (
            <>
              <Segmented<"phone_guest" | "phone_host">
                size="sm"
                label="Who calls"
                value={s.location.kind}
                options={[
                  { value: "phone_guest", label: "Guest's number" },
                  { value: "phone_host", label: "Your number" },
                ]}
                onChange={(k) => setS("location", k === "phone_host" ? { kind: "phone_host", number: "" } : { kind: "phone_guest" })}
              />
              {s.location.kind === "phone_host" ? <Input aria-label="Number" value={s.location.number} placeholder="+1 555 0100" onChange={(e) => setS("location", { kind: "phone_host", number: e.target.value })} className="h-[34px] text-[13px]" /> : null}
            </>
          ) : s.location.kind === "in_person" ? (
            <Input aria-label="Address" value={s.location.address} placeholder="Address" onChange={(e) => setS("location", { kind: "in_person", address: e.target.value })} className="h-[34px] text-[13px]" />
          ) : s.location.kind === "link" ? (
            <Input aria-label="Link" value={s.location.url} placeholder="https://" onChange={(e) => setS("location", { kind: "link", url: e.target.value })} className="h-[34px] text-[13px]" />
          ) : null}
        </PanelSection>

        <PanelSection icon={<CalendarIcon />} title="Availability" summary={weeklyWords(hours)} open={open === "hours"} onToggle={() => toggle("hours")}>
          {schedules.length && schedules.length <= 2 ? (
            <Segmented<string>
              size="sm"
              label="Schedule"
              value={s.schedule ?? ""}
              options={[{ value: "", label: "Working hours" }, ...schedules.map((n) => ({ value: n, label: n }))]}
              onChange={(v) => setDraft((d) => ({ ...d, settings: { ...d.settings, schedule: v || undefined } }))}
            />
          ) : schedules.length ? (
            <Select<string>
              value={s.schedule ?? ""}
              options={[{ value: "", label: "Working hours" }, ...schedules.map((n) => ({ value: n, label: n }))]}
              onChange={(v) => setDraft((d) => ({ ...d, settings: { ...d.settings, schedule: v || undefined } }))}
              ariaLabel="Schedule"
              className="h-[34px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink"
            />
          ) : null}
          <Week hours={hours} />
          <TextLink onClick={() => navigate("scheduling", "availability")}>Edit hours</TextLink>
        </PanelSection>

        <PanelSection icon={<Users />} title="Host" summary={hostSummary} open={open === "host"} onToggle={() => toggle("host")} locked={copy}>
          <Segmented<HostMode> size="sm" label="Who hosts" value={mode} options={modes} onChange={setMode} />
          {mode === "team" ? (
            data.queues.length ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {data.queues.map((q) => (
                    <Chip key={q.id} on={q.id === team} onClick={() => pickTeam(q)}>
                      <Users size={13} />
                      {q.name}
                    </Chip>
                  ))}
                </div>
                {queue ? (
                  <div className="flex items-center gap-2 rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px]">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-paper">
                      <Bolt size={12} />
                    </span>
                    <span className="min-w-0 flex-1 text-body">Routing picks the rep, {METHOD_WORDS[queue.method].toLowerCase()}</span>
                    <TextLink onClick={() => navigate("routing", "team")}>Edit in Routing</TextLink>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <span className="flex-1">No Routing teams yet</span>
                <TextLink onClick={() => navigate("routing", "team")}>Open Routing</TextLink>
              </div>
            )
          ) : null}
          {mode === "one" && !personal ? (
            <Select<string>
              value={draft.hosts[0]?.user_id ?? ""}
              options={data.people.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => set({ hosts: [{ user_id: v }] })}
              ariaLabel="Host"
              placeholder="Pick a host"
              className="h-[34px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink"
            />
          ) : null}
          <ul className="flex flex-col gap-2">
            {(mode === "team" && queue ? membersOf(queue).map((h) => h.user_id) : draft.hosts.map((h) => h.user_id)).map((id) => {
              const st = data.status.get(id);
              const off = nextOff(st?.out, today);
              return (
                <li key={id} className="flex items-center gap-2.5 text-[12.5px]">
                  <PersonAvatar person={data.byId.get(id)} label={id} size={26} />
                  <span className="min-w-0 flex-1 truncate text-ink">{nameOf(id)}</span>
                  {!st?.cal ? (
                    <Badge tone="amber">No calendar</Badge>
                  ) : off ? (
                    <Badge>{offWords(off)}</Badge>
                  ) : (
                    <Badge tone="green" dot>
                      Calendar
                    </Badge>
                  )}
                  {mode === "everyone" ? (
                    <IconButton label={`Remove ${nameOf(id)}`} className="size-7" onClick={() => set({ hosts: draft.hosts.filter((h) => h.user_id !== id) })}>
                      <X size={12} />
                    </IconButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {mode === "everyone" && others.length ? (
            <Select<string>
              value=""
              options={others.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => set({ hosts: [...draft.hosts, { user_id: v }] })}
              ariaLabel="Add host"
              placeholder="Add host"
              plainPlaceholder
              className="h-8 self-start rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:text-ink"
            />
          ) : null}
        </PanelSection>

        <PanelSection icon={<Hourglass />} title="Limits and buffers" summary={limitsWords(s)} open={open === "limits"} onToggle={() => toggle("limits")} locked={isLocked("bufferBefore", "bufferAfter", "notice", "window", "perDay")}>
          <div className="grid grid-cols-2 gap-3.5">
            <Labeled label="Before">
              <Choice values={BUFFERS} value={s.bufferBefore} word={(n) => (n ? `${n} min` : "None")} onChange={(v) => setS("bufferBefore", v)} label="Buffer before" short />
            </Labeled>
            <Labeled label="After">
              <Choice values={BUFFERS} value={s.bufferAfter} word={(n) => (n ? `${n} min` : "None")} onChange={(v) => setS("bufferAfter", v)} label="Buffer after" short />
            </Labeled>
          </div>
          <Labeled label="Book at least">
            <Choice values={NOTICE} value={s.notice} word={(n) => (n ? `${n >= 1440 ? (n === 1440 ? "1 day" : `${n / 1440} days`) : n >= 60 ? `${n / 60} h` : `${n} min`} ahead` : "Any time")} onChange={(v) => setS("notice", v)} label="Notice" />
          </Labeled>
          <Labeled label="Book up to">
            <Choice values={WINDOW} value={s.window} word={(n) => `${n} days`} onChange={(v) => setS("window", v)} label="Window" />
          </Labeled>
          <Labeled label="Per day">
            <Choice values={PER_DAY} value={s.perDay} word={(n) => (n ? String(n) : "No limit")} onChange={(v) => setS("perDay", v)} label="Per day" />
          </Labeled>
        </PanelSection>

        <PanelSection icon={<ListIcon />} title="Booking questions" summary={questionsWords(s.questions)} open={open === "qs"} onToggle={() => toggle("qs")} locked={isLocked("questions")}>
          <div className="flex flex-wrap gap-1.5">
            {["Name", "Email"].map((q) => (
              <span key={q} className="inline-flex h-[26px] items-center rounded-full border border-line px-2.5 text-[12px] text-body">
                {q}
              </span>
            ))}
          </div>
          <Questions value={s.questions} disabled={isLocked("questions")} onChange={(v) => setS("questions", v)} />
          {s.questions.length < 10 ? (
            <Chip on={false} onClick={() => setS("questions", [...s.questions, { id: Math.random().toString(36).slice(2, 10), label: "", type: "text", required: false }])}>
              <Plus size={13} />
              Add question
            </Chip>
          ) : null}
        </PanelSection>

        <PanelSection icon={<Bell />} title="Notifications" summary={remindersWords(s.reminders)} open={open === "notify"} onToggle={() => toggle("notify")} locked={isLocked("reminders")}>
          <span className="flex items-center gap-2 text-[12.5px] text-ink">
            <Check size={13} className="text-muted" />
            Confirmation email
          </span>
          <Reminders value={s.reminders} disabled={isLocked("reminders")} onChange={(v) => setS("reminders", v)} />
          <span className="flex items-center gap-2.5 text-[12.5px] text-ink">
            <Toggle label="No-show follow-up" on={s.noShowFollowUp !== false} disabled={isLocked("noShowFollowUp")} onChange={(v) => setS("noShowFollowUp", v)} />
            No-show follow-up
          </span>
          <TextLink onClick={() => navigate("scheduling", "settings/reminders")}>Edit reminders</TextLink>
        </PanelSection>

        <PanelSection icon={<Check />} title="Confirmation page" summary={confirmationWords(s.confirmation)} open={open === "confirm"} onToggle={() => toggle("confirm")} locked={isLocked("confirmation")}>
          <Segmented<"message" | "redirect">
            size="sm"
            label="After booking"
            value={s.confirmation.kind}
            options={[
              { value: "message", label: "Message" },
              { value: "redirect", label: "Redirect" },
            ]}
            onChange={(k) => setS("confirmation", k === "message" ? { kind: "message" } : { kind: "redirect", url: "" })}
          />
          {s.confirmation.kind === "message" ? (
            <textarea
              aria-label="Message"
              value={s.confirmation.text ?? ""}
              maxLength={500}
              rows={3}
              placeholder="You're booked."
              onChange={(e) => setS("confirmation", { kind: "message", ...(e.target.value ? { text: e.target.value } : {}) })}
              className="w-full resize-none rounded-sm border border-line-strong bg-card px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink"
            />
          ) : (
            <Input aria-label="Page" value={s.confirmation.url} placeholder="https://" onChange={(e) => setS("confirmation", { kind: "redirect", url: e.target.value })} className="h-[34px] text-[13px]" />
          )}
        </PanelSection>

        <PanelSection icon={<Card />} title="Payment" summary={priceWords(s.price)} open={open === "pay"} onToggle={() => toggle("pay")} locked={isLocked("price")}>
          <span className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink">
            Take payment
            <Toggle label="Take payment" on={!!s.price} onChange={(on) => setS("price", on ? { amount: 5000, currency: "usd" } : undefined)} />
          </span>
          {s.price ? (
            <div className="flex items-center gap-2">
              <Input
                aria-label="Amount"
                type="number"
                min={0.5}
                step={1}
                value={String(s.price.amount / 100)}
                onChange={(e) => setS("price", { ...s.price!, amount: Math.round(Number(e.target.value || 0) * 100) })}
                className="h-[34px] flex-1 text-[13px] tabular-nums"
              />
              <Select<string>
                value={s.price.currency}
                options={CURRENCIES.map((c) => ({ value: c, label: c.toUpperCase() }))}
                onChange={(c) => setS("price", { ...s.price!, currency: c })}
                ariaLabel="Currency"
                className="h-[34px] w-24 rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink"
              />
            </div>
          ) : null}
        </PanelSection>
      </div>

      <PanelFooter>
        {error && dirty ? <span className="text-[12px] text-rose">Not saved</span> : busy ? <span className="text-[12px] text-muted">Saving</span> : !dirty && !isNew ? <span className="text-[12px] text-muted">Saved</span> : null}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" disabled={!url || isNew} onClick={() => window.open(url, "_blank", "noopener")}>
          <Eye size={14} />
          Preview
        </Button>
        <Button size="sm" disabled={!dirty || busy} onClick={() => void save()}>
          Save changes
        </Button>
      </PanelFooter>
    </aside>
  );
}

/** The lengths: 15, 30, 45 and 60 as chips, more than one lets guests choose, and Other for any length. */
function Lengths({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [other, setOther] = useState(false);
  const [typed, setTyped] = useState("");
  const all = [...new Set([...LENGTHS, ...value])].sort((a, b) => a - b);
  const add = () => {
    const n = Math.round(Number(typed));
    if (n >= 5 && n <= 480 && !value.includes(n) && value.length < 6) onChange([...value, n].sort((a, b) => a - b));
    setOther(false);
    setTyped("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {all.map((n) => {
        const on = value.includes(n);
        return (
          <Chip key={n} on={on} disabled={on && value.length === 1} onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b))}>
            {n < 60 || n % 60 ? `${n} min` : `${n / 60} h`}
          </Chip>
        );
      })}
      {other ? (
        <span className="inline-flex h-[30px] items-center gap-1 rounded-full border border-ink pr-1 pl-3">
          <input
            autoFocus
            aria-label="Other length"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") {
                e.stopPropagation();
                setOther(false);
              }
            }}
            onBlur={add}
            className="w-9 bg-transparent text-[12.5px] text-ink tabular-nums outline-none"
          />
          <span className="pr-2 text-[12px] text-muted">min</span>
        </span>
      ) : value.length < 6 ? (
        <Chip on={false} onClick={() => setOther(true)}>
          Other
        </Chip>
      ) : null}
    </div>
  );
}

/** A few fixed choices as a pill track; a saved value that isn't one of them joins the choices. */
function Choice({ values, value, word, onChange, label, short = false }: { values: number[]; value: number; word: (n: number) => string; onChange: (v: number) => void; label: string; short?: boolean }) {
  const all = [...new Set([...values, value])].sort((a, b) => a - b);
  if (short)
    return (
      <Select<number>
        value={value}
        options={all.map((n) => ({ value: n, label: word(n) }))}
        onChange={onChange}
        ariaLabel={label}
        className="h-[34px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink"
      />
    );
  return <Segmented<string> size="sm" label={label} value={String(value)} options={all.map((n) => ({ value: String(n), label: word(n) }))} onChange={(v) => onChange(Number(v))} />;
}

/** A week of hours in small rows: Mon 09:00 to 17:00. */
function Week({ hours }: { hours: Availability | null }) {
  const days: [keyof Availability["weekly"], string][] = [
    ["mon", "Mon"],
    ["tue", "Tue"],
    ["wed", "Wed"],
    ["thu", "Thu"],
    ["fri", "Fri"],
    ["sat", "Sat"],
    ["sun", "Sun"],
  ];
  if (!hours) return <span className="text-[12.5px] text-muted">No hours set</span>;
  return (
    <ul className="flex flex-col gap-1.5">
      {days.map(([d, label]) => {
        const r = hours.weekly[d] ?? [];
        return (
          <li key={d} className="flex items-center gap-2.5 text-[12.5px]">
            <span className="w-[30px] text-muted">{label}</span>
            {r.length ? <span className="text-ink tabular-nums">{r.map(([a, b]) => `${a} to ${b}`).join(", ")}</span> : <span className="text-faint">Unavailable</span>}
          </li>
        );
      })}
    </ul>
  );
}
