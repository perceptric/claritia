"use client";

// The meeting type editor (docs/meetings-scheduler.md 1.4 and 1.8b): settings on the left in sections, a live
// booking page on the right. A new type is /meetings/types/new. Saving goes through /api/meetings/types (checkType
// on the server); a personal copy of a managed type shows its locked settings with a lock and can't change them.
// Owners can lock settings on a one-person or group type and give it to people.

import { useCallback, useEffect, useState } from "react";
import { toGuestType, type Profile as GuestProfile } from "@/lib/meetings/guest";
import { sampleSlots } from "@/lib/meetings/guest";
import { slots as engine } from "@/lib/meetings/slots";
import { DEFAULT_SETTINGS, KINDS, type Availability, type Host, type Kind, type Location, type MeetingType, type TypeSettings } from "@/lib/meetings/types";
import { CalendarIcon, Check, Clock, Link as LinkIcon, Lock, Plus, Trash, Users, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { AreaIn, INPUT, LabelWidth, NumIn, NumRow, Pick, Row, Seg, Switch, TagInput, TextIn } from "../forms/controls";
import { Badge, Button, Empty, ErrorNote, errorText, IconButton, Loading, must, Page, setLeaveGuard, Toggle, useLoad, type ViewProps } from "../ui";
import { BookingCalendar } from "@/components/book/BookingCalendar";
import { LinkDialog } from "./LinkDialog";
import { minutesText, slugify } from "./model";
import { CopyButton, meetingsApi, Modal, ownZone, PersonAvatar, useNow, usePeople, useWorkspaceSlug, type Person } from "./parts";
import type { TypeRow } from "./TypesList";

type Draft = Pick<MeetingType, "name" | "slug" | "kind" | "hosts" | "settings" | "secret" | "active" | "locked" | "owner_user_id">;
type LockKey = MeetingType["locked"][number];

const POOL_KINDS: Kind[] = ["round_robin", "owner_first", "double"];
const LENGTHS = [15, 30, 45, 60, 90];
const NOTICE = [0, 30, 60, 120, 240, 480, 720, 1440, 2880, 4320, 10080];
const REMINDERS = [10, 15, 30, 60, 120, 240, 1440, 2880, 10080];
const CURRENCIES = ["usd", "eur", "gbp", "cad", "aud", "chf", "sek", "nok", "dkk", "nzd", "sgd", "jpy", "inr"];
const PLACES: { value: Location["kind"]; label: string }[] = [
  { value: "google_meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" },
  { value: "zoom", label: "Zoom" },
  { value: "phone_guest", label: "Phone, guest's number" },
  { value: "phone_host", label: "Phone, your number" },
  { value: "in_person", label: "In person" },
  { value: "link", label: "Custom link" },
];
// What an owner can lock on a managed type, and its section.
const LOCKABLE: { key: LockKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "lengths", label: "Lengths" },
  { key: "location", label: "Location" },
  { key: "step", label: "Start times" },
  { key: "notice", label: "Notice" },
  { key: "window", label: "Window" },
  { key: "bufferBefore", label: "Buffer before" },
  { key: "bufferAfter", label: "Buffer after" },
  { key: "perDay", label: "Per day" },
  { key: "perWeek", label: "Per week" },
  { key: "questions", label: "Questions" },
  { key: "reminders", label: "Reminders" },
  { key: "confirmation", label: "After booking" },
  { key: "noShowFollowUp", label: "No-show follow-up" },
  { key: "price", label: "Price" },
];

const fresh = (me: string): Draft => ({ name: "", slug: "", kind: "one", hosts: [{ user_id: me }], settings: { ...DEFAULT_SETTINGS }, secret: false, active: true, locked: [], owner_user_id: null });
const draftOf = (t: TypeRow): Draft => ({ name: t.name, slug: t.slug, kind: t.kind, hosts: t.hosts, settings: { ...DEFAULT_SETTINGS, ...t.settings }, secret: t.secret, active: t.active, locked: t.locked ?? [], owner_user_id: t.owner_user_id });

export function TypeEditor(props: ViewProps) {
  const { sb, session, ws, role, navigate, id } = props;
  const isNew = id === "new";
  const me = session.user.id;
  const people = usePeople(sb, ws.id);
  const slug = useWorkspaceSlug(session, ws.id);
  const data = useLoad(async () => {
    const [row, hours, copies, kit] = await Promise.all([
      isNew ? Promise.resolve({ data: null, error: null }) : sb.from("meeting_types").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle(),
      sb.from("availability").select("user_id, tz, weekly, overrides").eq("workspace_id", ws.id),
      isNew ? Promise.resolve({ data: [], error: null }) : sb.from("meeting_types").select("owner_user_id").eq("template_id", id),
      sb.from("brand_kits").select("tokens").eq("workspace_id", ws.id).order("created_at").limit(1),
    ]);
    const t = must(row) as TypeRow | null;
    return {
      row: t,
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
      tokens: ((kit.data ?? []) as { tokens: Record<string, unknown> | null }[])[0]?.tokens ?? null,
      copies: ((must(copies) ?? []) as { owner_user_id: string | null }[]).map((c) => c.owner_user_id).filter((x): x is string => !!x),
    };
  }, id);

  const [draft, setDraft] = useState<Draft | null>(isNew ? fresh(me) : null);
  const [base, setBase] = useState(() => (isNew ? JSON.stringify(fresh(me)) : ""));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [giving, setGiving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [tz] = useState(ownZone);
  const now = useNow();

  // The saved type, once loaded.
  const row = data.data?.row;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (row && loadedFor !== row.updated_at) {
    setLoadedFor(row.updated_at);
    setDraft(draftOf(row));
    setBase(JSON.stringify(draftOf(row)));
  }
  const dirty = !!draft && JSON.stringify(draft) !== base;

  useEffect(() => {
    setLeaveGuard(dirty ? () => askConfirm("Leave without saving?", { ok: "Leave", danger: true }) : null);
    return () => setLeaveGuard(null);
  }, [dirty]);

  const back = { label: "Meeting types", onClick: () => navigate("meetings", "types") };
  if (data.error && !data.data)
    return (
      <Page title="Meeting type" back={back}>
        <ErrorNote message={data.error} />
      </Page>
    );
  if (!isNew && data.data && !row)
    return (
      <Page title="Meeting type" back={back}>
        <Empty icon={<CalendarIcon size={18} />} title="Meeting type not found" />
      </Page>
    );
  if (!draft || !data.data)
    return (
      <Page title="Meeting type" back={back}>
        <Loading />
      </Page>
    );

  const copy = !!row?.template_id;
  const locked = new Set<LockKey>(copy ? draft.locked : []);
  const isLocked = (k: LockKey) => locked.has(k);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setS = <K extends keyof TypeSettings>(k: K, v: TypeSettings[K]) => setDraft((d) => (d ? { ...d, settings: { ...d.settings, [k]: v } } : d));
  const s = draft.settings;
  const pool = POOL_KINDS.includes(draft.kind);
  const owner = role === "owner";
  const canManage = owner && !copy && !isNew && (draft.kind === "one" || draft.kind === "group");
  const url = slug.data && draft.slug ? `${window.location.origin}/book/${slug.data}/${draft.slug}` : "";

  const save = async () => {
    setErrors([]);
    setBusy(true);
    try {
      const r = await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "save", id: isNew ? null : id, type: draft });
      setBase(JSON.stringify(draft));
      if (isNew) {
        setLeaveGuard(null);
        navigate("meetings", `types/${r.id}`);
      } else data.reload();
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await askConfirm(`Delete ${draft.name || "this type"}?`, { body: "Its booking link stops working. Booked meetings stay.", ok: "Delete", danger: true }))) return;
    try {
      await meetingsApi(session, ws.id, "types", { action: "delete", id });
      setLeaveGuard(null);
      navigate("meetings", "types");
    } catch (e) {
      setErrors([errorText(e)]);
    }
  };

  // The live preview: the hosts' real hours with these settings (calendars aside), or sample hours before any are set.
  const length = s.lengths[0] ?? 30;
  const people_ = people.data?.list ?? [];
  const profiles: GuestProfile[] = people_.map((p) => ({ user_id: p.id, slug: p.slug ?? "", name: p.name, headline: p.headline, photo_url: p.photo }));
  const guestType = toGuestType({ ...draft, slug: draft.slug || "preview" }, profiles, { pay: true });

  return (
    <Page
      title={draft.name || (isNew ? "New meeting type" : "Untitled")}
      back={back}
      flush
      actions={
        <>
          {dirty ? <Badge tone="amber">Unsaved</Badge> : null}
          {!isNew ? (
            <>
              <CopyButton label="Copy times" get={async () => (await meetingsApi<{ text: string }>(session, ws.id, "times", { typeId: id, length, tz })).text || Promise.reject(new Error("No free times in the window."))} onError={(m) => setErrors([m])} />
              <IconButton label="New link" onClick={() => setLinking(true)}>
                <LinkIcon size={15} />
              </IconButton>
              {!copy || owner ? (
                <IconButton label="Delete" className="hover:!bg-rose-wash hover:!text-rose" onClick={() => void remove()}>
                  <Trash size={15} />
                </IconButton>
              ) : null}
            </>
          ) : null}
          <Button onClick={() => void save()} disabled={busy || (!dirty && !isNew)}>
            {isNew ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      {linking && row ? <LinkDialog sb={sb} session={session} ws={ws} types={[{ id: row.id, name: row.name, slug: row.slug, kind: row.kind, lengths: row.settings.lengths }]} initialType={row.id} onClose={() => setLinking(false)} /> : null}
      {giving && row ? <GiveDialog people={people_} copies={data.data.copies} onClose={() => setGiving(false)} onGive={async (users) => (await meetingsApi(session, ws.id, "types", { action: "push", id: row.id, users }), data.reload(), setGiving(false))} /> : null}
      <div className="grid lg:h-full lg:min-h-0 lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
        <LabelWidth.Provider value={104}>
          <div className="border-line lg:min-h-0 lg:overflow-y-auto lg:border-r">
            {errors.length ? (
              <div className="px-5 pt-4">
                <ErrorNote message={errors.join(" ")} />
              </div>
            ) : null}

            <Block title="Basics" first>
              <Row label="Name">
                {isLocked("name") ? (
                  <Fixed>{draft.name}</Fixed>
                ) : (
                  <TextIn label="Name" value={draft.name} placeholder="Intro call" onChange={(name) => set({ name, ...(slugTouched ? {} : { slug: name ? slugify(name) : "" }) })} />
                )}
              </Row>
              <Row label="Link">
                <span className="flex min-w-0 flex-1 items-center rounded-sm border border-line-strong bg-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
                  <span className="max-w-[45%] shrink-0 truncate pl-2 font-mono text-[11.5px] text-faint">/{slug.data ?? "…"}/</span>
                  <input
                    aria-label="Link"
                    value={draft.slug}
                    onChange={(e) => (setSlugTouched(true), set({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60) }))}
                    className="h-7 min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12px] text-ink outline-none"
                  />
                </span>
                {url && !isNew ? <CopyButton text={url} size={13} /> : null}
              </Row>
              <Row label="Kind">
                {isLocked("kind") || copy ? (
                  <Fixed>{KINDS.find((k) => k.value === draft.kind)?.label}</Fixed>
                ) : (
                  <Pick<Kind>
                    label="Kind"
                    value={draft.kind}
                    options={KINDS}
                    onChange={(kind) => set({ kind, hosts: kind === "one" || kind === "group" ? draft.hosts.slice(0, 1) : draft.hosts })}
                  />
                )}
              </Row>
              {draft.kind === "round_robin" ? (
                <Row label="Pick">
                  <Seg<TypeSettings["rrMode"]> label="Round robin mode" value={s.rrMode} options={[{ value: "flexible", label: "Any free" }, { value: "strict", label: "Next in line" }]} onChange={(v) => setS("rrMode", v)} />
                </Row>
              ) : null}
              {draft.kind === "group" ? <NumRow label="Seats" value={s.seats} min={2} max={500} onChange={(v) => setS("seats", v ?? 10)} /> : null}
              <Hosts draft={draft} people={people.data?.byId} list={people_} readOnly={copy} onChange={(hosts) => set({ hosts })} />
            </Block>

            <Block title="When" locked={["lengths", "step", "notice", "window", "bufferBefore", "bufferAfter", "perDay", "perWeek"].some((k) => isLocked(k as LockKey))}>
              <Row label="Lengths" top>
                <Lengths value={s.lengths} disabled={isLocked("lengths")} onChange={(v) => setS("lengths", v)} />
              </Row>
              <Row label="Start every">
                <Pick<number> label="Start every" value={s.step} options={[5, 10, 15, 20, 30, 60].map((n) => ({ value: n, label: minutesText(n) }))} onChange={(v) => !isLocked("step") && setS("step", v)} />
              </Row>
              <Row label="Notice">
                <Pick<number>
                  label="Notice"
                  value={s.notice}
                  options={[...new Set([...NOTICE, s.notice])].sort((a, b) => a - b).map((n) => ({ value: n, label: n ? minutesText(n) : "None" }))}
                  onChange={(v) => !isLocked("notice") && setS("notice", v)}
                />
              </Row>
              <NumRow label="Window" unit="days" value={s.window} min={1} max={365} onChange={(v) => !isLocked("window") && setS("window", v ?? 14)} />
              <NumRow label="Buffer before" unit="min" value={s.bufferBefore} min={0} max={240} step={5} onChange={(v) => !isLocked("bufferBefore") && setS("bufferBefore", v ?? 0)} />
              <NumRow label="Buffer after" unit="min" value={s.bufferAfter} min={0} max={240} step={5} onChange={(v) => !isLocked("bufferAfter") && setS("bufferAfter", v ?? 0)} />
              <NumRow label="Per day" empty placeholder="No cap" value={s.perDay || undefined} min={0} max={50} onChange={(v) => !isLocked("perDay") && setS("perDay", v ?? 0)} />
              <NumRow label="Per week" empty placeholder="No cap" value={s.perWeek || undefined} min={0} max={250} onChange={(v) => !isLocked("perWeek") && setS("perWeek", v ?? 0)} />
            </Block>

            <Block title="Where" locked={isLocked("location")}>
              <Place value={s.location} disabled={isLocked("location")} onChange={(v) => setS("location", v)} />
            </Block>

            <Block
              title="Questions"
              locked={isLocked("questions")}
              action={
                isLocked("questions") || s.questions.length >= 10 ? null : (
                  <IconButton label="Add question" className="size-7" onClick={() => setS("questions", [...s.questions, { id: Math.random().toString(36).slice(2, 10), label: "", type: "text", required: false }])}>
                    <Plus size={14} />
                  </IconButton>
                )
              }
            >
              <Questions value={s.questions} disabled={isLocked("questions")} onChange={(v) => setS("questions", v)} />
            </Block>

            <Block title="Reminders" locked={isLocked("reminders")}>
              <Reminders value={s.reminders} disabled={isLocked("reminders")} onChange={(v) => setS("reminders", v)} />
            </Block>

            <Block title="After booking" locked={isLocked("confirmation") || isLocked("noShowFollowUp")}>
              <Row label="Show">
                <Seg<"message" | "redirect">
                  label="After booking"
                  value={s.confirmation.kind}
                  options={[
                    { value: "message", label: "Message" },
                    { value: "redirect", label: "Page" },
                  ]}
                  onChange={(k) => !isLocked("confirmation") && setS("confirmation", k === "message" ? { kind: "message" } : { kind: "redirect", url: "" })}
                />
              </Row>
              {s.confirmation.kind === "message" ? (
                <Row label="Message" top>
                  <AreaIn label="Message" value={s.confirmation.text ?? ""} placeholder="You're booked." onChange={(text) => !isLocked("confirmation") && setS("confirmation", { kind: "message", ...(text ? { text } : {}) })} />
                </Row>
              ) : (
                <Row label="Page">
                  <TextIn label="Page" value={s.confirmation.url} placeholder="https://" onChange={(u) => !isLocked("confirmation") && setS("confirmation", { kind: "redirect", url: u })} />
                </Row>
              )}
              <Switch label="No-show follow-up" on={s.noShowFollowUp !== false} disabled={isLocked("noShowFollowUp")} onChange={(on) => setS("noShowFollowUp", on)} />
            </Block>

            {pool || draft.kind === "collective" ? (
              <Block title="Reschedule">
                <Row label="Move to">
                  <Seg<TypeSettings["reschedule"]>
                    label="Reschedule"
                    value={s.reschedule}
                    options={[
                      { value: "same_host", label: "Same host" },
                      { value: "pool", label: "Anyone" },
                    ]}
                    onChange={(v) => setS("reschedule", v)}
                  />
                </Row>
              </Block>
            ) : null}

            <Block title="Price" locked={isLocked("price")}>
              <Switch label="Paid" on={!!s.price} disabled={isLocked("price")} onChange={(on) => setS("price", on ? { amount: 5000, currency: "usd" } : undefined)} />
              {s.price ? (
                <Row label="Amount">
                  <NumIn label="Amount" value={s.price.amount / 100} min={0.5} max={100000} step={1} onChange={(v) => !isLocked("price") && setS("price", { ...s.price!, amount: Math.round((v ?? 0) * 100) })} />
                  <span className="w-[84px] shrink-0">
                    <Pick<string> label="Currency" value={s.price.currency} options={CURRENCIES.map((c) => ({ value: c, label: c.toUpperCase() }))} onChange={(c) => !isLocked("price") && setS("price", { ...s.price!, currency: c })} />
                  </span>
                </Row>
              ) : null}
            </Block>

            <Block title="Visibility">
              <Switch label="Secret" on={draft.secret} onChange={(secret) => set({ secret })} />
              <Switch label="Bookable" on={draft.active} onChange={(active) => set({ active })} />
            </Block>

            {canManage ? (
              <Block title="Managed">
                <Row label="Locked" top>
                  <span className="flex flex-wrap gap-1">
                    {LOCKABLE.map((l) => {
                      const on = draft.locked.includes(l.key);
                      return (
                        <button
                          key={l.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set({ locked: on ? draft.locked.filter((k) => k !== l.key) : [...draft.locked, l.key] })}
                          className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium transition-colors duration-[140ms] ${on ? "bg-ink text-paper" : "bg-paper-deep text-body hover:text-ink"}`}
                        >
                          {on ? <Lock size={10} /> : null}
                          {l.label}
                        </button>
                      );
                    })}
                  </span>
                </Row>
                <Row label="People">
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-[12.5px] text-body tabular-nums">{data.data.copies.length}</span>
                    <Button variant="ghost" size="sm" className="ml-auto h-7 px-3" disabled={dirty} onClick={() => setGiving(true)}>
                      <Users size={13} />
                      Give to people
                    </Button>
                  </span>
                </Row>
              </Block>
            ) : null}
            <div className="h-10" />
          </div>
        </LabelWidth.Provider>
        <div className="border-t border-line bg-paper lg:min-h-0 lg:overflow-y-auto lg:border-t-0">
          <div className="mx-auto flex min-h-full max-w-[860px] items-center px-4 py-8 md:px-8 lg:py-10">
            <Preview draft={draft} hours={data.data.hours} tz={tz} now={now} guestType={guestType} tokens={data.data.tokens} />
          </div>
        </div>
      </div>
    </Page>
  );
}

/**
 * The public booking calendar (src/components/book/) with these settings over the hosts' real hours (calendars
 * aside), or sample hours before any are set, in the workspace's brand kit. Nothing is booked from it.
 */
function Preview({ draft, hours, tz, now, guestType, tokens }: { draft: Draft; hours: Map<string, Availability>; tz: string; now: number; guestType: ReturnType<typeof toGuestType>; tokens: Record<string, unknown> | null }) {
  const key = JSON.stringify([draft.hosts, draft.kind, draft.settings]);
  const load = useCallback(
    async (length: number) => {
      const [hosts, kind, settings] = JSON.parse(key) as [Host[], Kind, TypeSettings];
      const inputs = hosts.flatMap((h) => {
        const a = hours.get(h.user_id);
        return a ? [{ id: h.user_id, availability: { tz: a.tz, weekly: a.weekly, overrides: a.overrides }, busy: [], booked: [] }] : [];
      });
      const window = Math.min(settings.window, 60);
      if (!inputs.length) return sampleSlots(length, tz, now, window);
      const pools = Object.fromEntries(hosts.map((h) => [h.user_id, h.pool ?? "a"])) as Record<string, "a" | "b">;
      return engine({ kind: kind === "owner_first" ? "round_robin" : kind, hosts: inputs, length, settings: { ...settings, window }, now, pools }).map((x) => ({ start: x.start }));
    },
    [key, hours, tz, now],
  );
  return (
    <div className="w-full">
      <BookingCalendar key={guestType.lengths.join()} type={guestType} load={load} tokens={tokens} />
    </div>
  );
}

function Block({ title, children, action, first = false, locked = false }: { title: string; children: React.ReactNode; action?: React.ReactNode; first?: boolean; locked?: boolean }) {
  return (
    <section className={`flex flex-col gap-2.5 px-5 py-4 ${first ? "" : "border-t border-line"}`}>
      <div className="flex min-h-7 items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        {locked ? (
          <span aria-label="Locked" className="text-faint">
            <Lock size={12} />
          </span>
        ) : null}
        {action}
      </div>
      {children}
    </section>
  );
}

function Fixed({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm bg-paper-deep px-2 text-[12.5px] text-body">
      <Lock size={11} className="text-faint" />
      <span className="truncate">{children}</span>
    </span>
  );
}

function Hosts({ draft, people, list, readOnly, onChange }: { draft: Draft; people?: Map<string, Person>; list: Person[]; readOnly: boolean; onChange: (h: Host[]) => void }) {
  const rr = POOL_KINDS.includes(draft.kind);
  const two = draft.kind === "double";
  const single = draft.kind === "one" || draft.kind === "group";
  const left = list.filter((p) => !draft.hosts.some((h) => h.user_id === p.id));
  const put = (i: number, patch: Partial<Host>) => onChange(draft.hosts.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  if (single) {
    const p = people?.get(draft.hosts[0]?.user_id ?? "");
    return (
      <Row label="Host">
        {readOnly ? (
          <Fixed>{p?.name ?? "Former teammate"}</Fixed>
        ) : (
          <Select<string>
            value={draft.hosts[0]?.user_id ?? ""}
            options={list.map((x) => ({ value: x.id, label: x.name }))}
            onChange={(v) => onChange([{ user_id: v }])}
            ariaLabel="Host"
            placeholder="Pick a host"
            className="h-7 w-full min-w-0 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] text-ink hover:border-ink/40"
          />
        )}
      </Row>
    );
  }
  const cols = `minmax(0,1fr)${rr ? " 52px 52px" : ""}${two ? " 64px" : ""}${readOnly ? "" : " 28px"}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid items-center gap-2 px-2.5 text-[11px] text-faint" style={{ gridTemplateColumns: cols }}>
        <span className="text-[12px] text-muted">Hosts</span>
        {rr ? (
          <>
            <span>Weight</span>
            <span>Tier</span>
          </>
        ) : null}
        {two ? <span>Team</span> : null}
        {readOnly ? null : <span />}
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {draft.hosts.map((h, i) => {
          const p = people?.get(h.user_id);
          return (
            <li key={h.user_id} className="grid items-center gap-2 px-2.5 py-2" style={{ gridTemplateColumns: cols }}>
              <span className="flex min-w-0 items-center gap-2">
                <PersonAvatar person={p} label={h.user_id} size={24} />
                <span className="truncate text-[12.5px] font-medium text-ink">{p?.name ?? "Former teammate"}</span>
              </span>
              {rr ? (
                <>
                  <NumIn label="Weight" value={h.weight ?? 1} min={1} max={10} onChange={(v) => !readOnly && put(i, { weight: v ?? 1 })} />
                  <NumIn label="Tier" value={h.tier ?? 0} min={0} max={9} onChange={(v) => !readOnly && put(i, { tier: v ?? 0 })} />
                </>
              ) : null}
              {two ? (
                <Seg<"a" | "b">
                  label="Team"
                  value={h.pool ?? "a"}
                  options={[
                    { value: "a", label: "A" },
                    { value: "b", label: "B" },
                  ]}
                  onChange={(pool) => !readOnly && put(i, { pool })}
                />
              ) : null}
              {readOnly ? null : (
                <IconButton label="Remove host" className="size-7" disabled={draft.hosts.length < 2} onClick={() => onChange(draft.hosts.filter((_, j) => j !== i))}>
                  <X size={13} />
                </IconButton>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && left.length ? (
        <Select<string>
          value=""
          options={left.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(v) => onChange([...draft.hosts, { user_id: v, ...(rr ? { weight: 1, tier: 0 } : {}), ...(two ? { pool: "a" as const } : {}) }])}
          ariaLabel="Add host"
          placeholder="Add host"
          plainPlaceholder
          className="h-8 self-start rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:border-ink/40 hover:text-ink"
        />
      ) : null}
    </div>
  );
}

function Lengths({ value, disabled, onChange }: { value: number[]; disabled: boolean; onChange: (v: number[]) => void }) {
  const [other, setOther] = useState<number | undefined>(undefined);
  const all = [...new Set([...LENGTHS, ...value])].sort((a, b) => a - b);
  return (
    <span className="flex flex-wrap items-center gap-1">
      {all.map((n) => {
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            aria-pressed={on}
            disabled={disabled || (on && value.length === 1)}
            onClick={() => onChange(on ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b))}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium tabular-nums transition-colors duration-[140ms] disabled:cursor-default ${on ? "bg-ink text-paper" : "bg-paper-deep text-body hover:text-ink"} ${disabled ? "opacity-60" : ""}`}
          >
            {on ? <Check size={11} /> : null}
            {minutesText(n)}
          </button>
        );
      })}
      {!disabled && value.length < 6 ? (
        <span className="w-[72px]">
          <NumIn
            label="Other length"
            value={other}
            empty
            min={5}
            max={480}
            unit="min"
            placeholder="Other"
            onChange={(v) => {
              setOther(undefined);
              if (v && !value.includes(Math.round(v))) onChange([...value, Math.round(v)].sort((a, b) => a - b));
            }}
          />
        </span>
      ) : null}
    </span>
  );
}

function Place({ value, disabled, onChange }: { value: Location; disabled: boolean; onChange: (v: Location) => void }) {
  const pick = (kind: Location["kind"]) =>
    onChange(kind === "phone_host" ? { kind, number: "" } : kind === "in_person" ? { kind, address: "" } : kind === "link" ? { kind, url: "" } : ({ kind } as Location));
  return (
    <>
      <Row label="Location">{disabled ? <Fixed>{PLACES.find((p) => p.value === value.kind)?.label}</Fixed> : <Pick<Location["kind"]> label="Location" value={value.kind} options={PLACES} onChange={pick} />}</Row>
      {value.kind === "phone_host" ? (
        <Row label="Number">
          <TextIn label="Number" value={value.number} placeholder="+1 555 0100" onChange={(number) => !disabled && onChange({ kind: "phone_host", number })} />
        </Row>
      ) : value.kind === "in_person" ? (
        <Row label="Address">
          <TextIn label="Address" value={value.address} onChange={(address) => !disabled && onChange({ kind: "in_person", address })} />
        </Row>
      ) : value.kind === "link" ? (
        <Row label="Link">
          <TextIn label="Link" value={value.url} placeholder="https://" onChange={(url) => !disabled && onChange({ kind: "link", url })} />
        </Row>
      ) : null}
    </>
  );
}

const Q_TYPES: { value: TypeSettings["questions"][number]["type"]; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "phone", label: "Phone" },
  { value: "choice", label: "Choice" },
];

function Questions({ value, disabled, onChange }: { value: TypeSettings["questions"]; disabled: boolean; onChange: (v: TypeSettings["questions"]) => void }) {
  const put = (i: number, patch: Partial<TypeSettings["questions"][number]>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  if (!value.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {value.map((q, i) => (
        <li key={q.id} className="anim-rise-sm flex flex-col gap-2 rounded-lg border border-line p-2.5">
          <span className="flex items-center gap-1.5">
            <input aria-label="Question" value={q.label} disabled={disabled} placeholder="Question" onChange={(e) => put(i, { label: e.target.value })} className={`${INPUT} flex-1`} />
            {!disabled ? (
              <IconButton label="Remove question" className="size-7" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash size={13} />
              </IconButton>
            ) : null}
          </span>
          <span className="flex items-center gap-2">
            <span className="w-[120px]">
              <Pick label="Answer" value={q.type} options={Q_TYPES} onChange={(type) => !disabled && put(i, { type, ...(type === "choice" ? { options: q.options ?? [] } : {}) })} />
            </span>
            <span className="ml-auto flex items-center gap-2 text-[12px] text-muted">
              Required
              <Toggle label="Required" on={q.required} disabled={disabled} onChange={(required) => put(i, { required })} />
            </span>
          </span>
          {q.type === "choice" ? <TagInput label="Choices" values={q.options ?? []} placeholder="Add choices" onChange={(options) => !disabled && put(i, { options })} clean={(x) => x.trim().slice(0, 100) || null} /> : null}
        </li>
      ))}
    </ul>
  );
}

function Reminders({ value, disabled, onChange }: { value: number[]; disabled: boolean; onChange: (v: number[]) => void }) {
  const left = REMINDERS.filter((n) => !value.includes(n));
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {[...value]
        .sort((a, b) => b - a)
        .map((n) => (
          <span key={n} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12px] font-medium text-ink">
            <Clock size={11} className="text-muted" />
            {minutesText(n)} before
            {!disabled ? (
              <button type="button" aria-label={`Remove ${minutesText(n)}`} onClick={() => onChange(value.filter((x) => x !== n))} className="inline-flex size-5 items-center justify-center rounded-full text-faint hover:bg-hover hover:text-ink">
                <X size={10} />
              </button>
            ) : null}
          </span>
        ))}
      {!disabled && value.length < 4 && left.length ? (
        <Select<number>
          value={-1}
          options={left.map((n) => ({ value: n, label: `${minutesText(n)} before` }))}
          onChange={(n) => onChange([...value, n].sort((a, b) => b - a))}
          ariaLabel="Add reminder"
          placeholder="Add"
          plainPlaceholder
          className="h-7 rounded-full border border-dashed border-line-strong px-2.5 text-[12px] font-medium text-body hover:border-ink/40 hover:text-ink"
        />
      ) : null}
    </span>
  );
}

/** Owners give a managed type to people: everyone ticked gets their own copy; anyone unticked loses theirs. */
function GiveDialog({ people, copies, onClose, onGive }: { people: Person[]; copies: string[]; onClose: () => void; onGive: (users: string[]) => Promise<unknown> }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(copies));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dropping = copies.filter((c) => !picked.has(c)).length;
  return (
    <Modal
      title="Give to people"
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            className={dropping ? "!bg-rose" : ""}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onGive([...picked]);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {dropping ? `Save and remove ${dropping}` : "Save"}
          </Button>
        </>
      }
    >
      <ul className="-mx-2 flex max-h-80 flex-col overflow-y-auto">
        {people.map((p) => {
          const on = picked.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setPicked((s) => (s.has(p.id) ? new Set([...s].filter((x) => x !== p.id)) : new Set([...s, p.id])))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover"
              >
                <PersonAvatar person={p} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                  <span className="truncate text-[12px] text-muted">{p.email}</span>
                </span>
                <span className={`flex size-5 items-center justify-center rounded-full border transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>{on ? <Check size={11} /> : null}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <ErrorNote message={error} />
    </Modal>
  );
}
