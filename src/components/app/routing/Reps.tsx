"use client";

// Routing › Reps (docs/router-ux.md 4.7): each teammate's status (In, Paused, Out), today's and this week's leads
// against their caps, their queues, backup and what's missing. Reps change their own status; owners change anyone's
// status, caps and backup. Bulk pause and caps come with Undo.

import { useMemo, useState } from "react";
import { CalendarIcon, Clock, Search, X } from "../../Icons";
import { Popover } from "../FilterBar";
import { Modal, PersonAvatar, usePeople } from "../meetings/parts";
import { CheckBox } from "../records/RecordTable";
import { Badge, Button, Empty, ErrorNote, errorText, Field, Input, Loading, must, Td, Th, useLoad, type Tone, type ViewProps } from "../ui";
import { routingApi } from "./api";
import { PersonPicker, ROUTING, RouteSketch, useLiveBody, useToast } from "./screenParts";
import { dayStart, endOfDay, localDate, meter, parseCap, pauseUntil, queuesByRep, rangeWords, repStatus, repWarnings, WARNING_WORDS, weekStart, type PauseChoice, type RepRow, type Status } from "./screensModel";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { sub: string };
type Patch = { paused_until?: string; out_dates?: { from: string; to: string }[]; backup?: string; cap_day?: number | null; cap_week?: number | null };

const STATUS_TONE: Record<Status["kind"], Tone> = { in: "green", paused: "amber", out: "gray" };

/** The patch that puts a rep's pause and caps back as they were. */
const undoPatch = (r: RepRow | undefined, keys: ("paused_until" | "caps")[]): Patch => ({
  ...(keys.includes("paused_until") ? { paused_until: r?.paused_until ?? "" } : {}),
  ...(keys.includes("caps") ? { cap_day: r?.cap_day ?? null, cap_week: r?.cap_week ?? null } : {}),
});

export function RepsTab({ sb, session, ws, role, navigate }: Props) {
  const me = session.user.id;
  const owner = role === "owner";
  const people = usePeople(sb, ws.id);
  const live = useLiveBody(sb, ws.id);
  const data = useLoad(async () => {
    const since = new Date(Math.min(weekStart(), dayStart())).toISOString();
    const [reps, cals, hours, runs] = await Promise.all([
      sb.from("router_reps").select("user_id, paused_until, out_dates, backup, cap_day, cap_week").eq("workspace_id", ws.id),
      sb.from("calendar_accounts").select("user_id, provider, status").eq("workspace_id", ws.id),
      sb.from("availability").select("user_id, weekly").eq("workspace_id", ws.id),
      sb.from("router_runs").select("owner, created_at").eq("workspace_id", ws.id).eq("kind", "owner").in("by", ["queue", "fallback"]).is("undone_at", null).gte("created_at", since).limit(10000),
    ]);
    const day = dayStart();
    const counts = new Map<string, { today: number; week: number }>();
    for (const r of (must(runs) ?? []) as { owner: string; created_at: string }[]) {
      const c = counts.get(r.owner) ?? { today: 0, week: 0 };
      c.week++;
      if (Date.parse(r.created_at) >= day) c.today++;
      counts.set(r.owner, c);
    }
    return {
      reps: new Map(((must(reps) ?? []) as RepRow[]).map((r) => [r.user_id, r])),
      calendar: new Set(((must(cals) ?? []) as { user_id: string; provider: string; status: string }[]).filter((c) => c.provider !== "zoom" && c.status === "ok").map((c) => c.user_id)),
      hours: new Map(((must(hours) ?? []) as { user_id: string; weekly: Record<string, unknown[]> }[]).map((h) => [h.user_id, h.weekly])),
      counts,
    };
  }, ws.id);
  const toast = useToast();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [statusFor, setStatusFor] = useState<{ user: string; anchor: HTMLElement } | null>(null);
  const [backupFor, setBackupFor] = useState<{ user: string; anchor: HTMLElement } | null>(null);
  const [capsOpen, setCapsOpen] = useState(false);

  const queues = useMemo(() => queuesByRep(live.data?.body ?? null), [live.data]);
  const list = (people.data?.list ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.email.toLowerCase().includes(q.trim().toLowerCase()));
  const canEdit = (user: string) => owner || user === me;

  /** Save one rep; the row shows the error if it fails. */
  const save = async (user: string, patch: Patch) => {
    setErrors((e) => ({ ...e, [user]: "" }));
    try {
      await routingApi(session, ws.id, "rep", { user, patch });
      data.reload();
      return true;
    } catch (e) {
      setErrors((x) => ({ ...x, [user]: errorText(e) }));
      return false;
    }
  };

  /** Save many, with a toast offering Undo. */
  const saveMany = async (users: string[], patch: Patch, words: string, keys: ("paused_until" | "caps")[]) => {
    const before = new Map(users.map((u) => [u, data.data?.reps.get(u)]));
    setError("");
    try {
      await Promise.all(users.map((user) => routingApi(session, ws.id, "rep", { user, patch })));
      setPicked(new Set());
      data.reload();
      toast.show(words, {
        label: "Undo",
        run: () =>
          void Promise.all(users.map((user) => routingApi(session, ws.id, "rep", { user, patch: undoPatch(before.get(user), keys) })))
            .then(data.reload)
            .catch((e) => setError(errorText(e))),
      });
    } catch (e) {
      setError(errorText(e));
      data.reload();
    }
  };

  const loading = !people.data || !data.data;
  const err = people.error || data.error || live.error;
  const allPicked = list.length > 0 && list.every((p) => picked.has(p.id));
  const editable = list.filter((p) => canEdit(p.id));

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 md:px-5">
        <div className="relative w-full sm:w-60">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reps" aria-label="Search reps" className="h-9 pl-8" />
        </div>
        {picked.size ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[12.5px] text-muted tabular-nums">{picked.size} selected</span>
            <Button variant="ghost" size="sm" onClick={() => void saveMany([...picked], { paused_until: "infinity" }, `Paused ${picked.size}`, ["paused_until"])}>
              Pause selected
            </Button>
            {owner ? (
              <Button variant="ghost" size="sm" onClick={() => setCapsOpen(true)}>
                Set caps
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <div className="px-5 pt-4">
          <ErrorNote message={error} />
        </div>
      ) : null}

      {err ? (
        <div className="p-5">
          <ErrorNote message={err} />
        </div>
      ) : loading ? (
        <Loading />
      ) : !people.data!.list.length ? (
        <Empty sketch={<RouteSketch />} title="No teammates yet">
          <Button className="mt-3" onClick={() => navigate("settings", "team")}>
            Invite
          </Button>
        </Empty>
      ) : !list.length ? (
        <Empty title="No matches" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
            <thead>
              <tr>
                <Th className="w-10 pl-5">
                  <CheckBox label="Select all" on={allPicked} onClick={() => setPicked(allPicked ? new Set() : new Set(editable.map((p) => p.id)))} />
                </Th>
                <Th>Rep</Th>
                <Th>Status</Th>
                <Th>Today</Th>
                <Th className="hidden sm:table-cell">This week</Th>
                <Th className="hidden md:table-cell">Teams</Th>
                <Th className="hidden md:table-cell">Backup</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const rep = data.data!.reps.get(p.id);
                const status = repStatus(rep);
                const c = data.data!.counts.get(p.id) ?? { today: 0, week: 0 };
                const qs = queues.get(p.id) ?? [];
                const warns = repWarnings({ calendar: data.data!.calendar.has(p.id), queues: qs.length, hasRouter: !!live.data, hours: data.data!.hours.get(p.id) ?? null });
                const mine = canEdit(p.id);
                const backup = rep?.backup ? people.data!.byId.get(rep.backup) : null;
                return [
                  <tr key={p.id} className={picked.has(p.id) ? "bg-hover" : ""}>
                    <Td className="w-10 pl-5">
                      {mine ? (
                        <CheckBox
                          label={`Select ${p.name}`}
                          on={picked.has(p.id)}
                          onClick={() => {
                            const n = new Set(picked);
                            if (n.has(p.id)) n.delete(p.id);
                            else n.add(p.id);
                            setPicked(n);
                          }}
                        />
                      ) : null}
                    </Td>
                    <Td className="max-w-[240px]">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <PersonAvatar person={p} size={28} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-ink">
                            {p.name}
                            {p.id === me ? <span className="ml-1.5 text-[12px] font-normal text-faint">You</span> : null}
                          </span>
                          <span className="truncate text-[12px] text-muted">{p.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5">
                        {mine ? (
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-label={`Status: ${status.words}. Change`}
                            onClick={(e) => setStatusFor({ user: p.id, anchor: e.currentTarget })}
                            className="press rounded-full transition-[translate,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-soft"
                          >
                            <Badge tone={STATUS_TONE[status.kind]} dot>
                              {status.words}
                            </Badge>
                          </button>
                        ) : (
                          <Badge tone={STATUS_TONE[status.kind]} dot>
                            {status.words}
                          </Badge>
                        )}
                        {warns.map((w) => (
                          <span key={w} title={WARNING_WORDS[w]} aria-label={WARNING_WORDS[w]} className="flex size-5 items-center justify-center rounded-full bg-butter-wash text-[11px] font-semibold text-butter">
                            {w === "no_calendar" ? <CalendarIcon size={11} /> : w === "no_hours" ? <Clock size={11} /> : "!"}
                          </span>
                        ))}
                      </span>
                    </Td>
                    <Td>
                      <CapMeter n={c.today} cap={rep?.cap_day ?? null} max={1000} label={`${p.name}'s daily cap`} edit={owner} out={status.kind === "out"} onSave={(v) => save(p.id, { cap_day: v })} />
                    </Td>
                    <Td className="hidden sm:table-cell">
                      <CapMeter n={c.week} cap={rep?.cap_week ?? null} max={5000} label={`${p.name}'s weekly cap`} edit={owner} out={status.kind === "out"} onSave={(v) => save(p.id, { cap_week: v })} />
                    </Td>
                    <Td className="hidden max-w-[240px] md:table-cell">
                      {qs.length ? (
                        <span className="flex flex-wrap gap-1">
                          {qs.map((x) => (
                            <button key={x.id} type="button" onClick={() => navigate(ROUTING, "teams")} className="press rounded-full">
                              <Badge>{x.name}</Badge>
                            </button>
                          ))}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </Td>
                    <Td className="hidden md:table-cell">
                      {owner ? (
                        <button type="button" onClick={(e) => setBackupFor({ user: p.id, anchor: e.currentTarget })} className="press -ml-2 flex h-8 items-center gap-2 rounded-full px-2 hover:bg-hover" aria-label={`Backup for ${p.name}`}>
                          {backup ? <PersonAvatar person={backup} size={20} /> : null}
                          <span className={backup ? "text-ink" : "text-faint"}>{backup?.name ?? "—"}</span>
                        </button>
                      ) : (
                        <span className={backup ? "text-ink" : "text-faint"}>{backup?.name ?? "—"}</span>
                      )}
                    </Td>
                  </tr>,
                  errors[p.id] ? (
                    <tr key={`${p.id}-error`}>
                      <td colSpan={7} className="border-b border-line px-5 py-2">
                        <ErrorNote message={errors[p.id]!} />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}

      {statusFor ? (
        <StatusPopover
          anchor={statusFor.anchor}
          rep={data.data?.reps.get(statusFor.user)}
          onClose={() => setStatusFor(null)}
          onSave={async (patch) => {
            const ok = await save(statusFor.user, patch);
            if (ok) setStatusFor(null);
          }}
        />
      ) : null}
      {backupFor ? (
        <PersonPicker
          anchor={backupFor.anchor}
          people={(people.data?.list ?? []).filter((p) => p.id !== backupFor.user)}
          value={data.data?.reps.get(backupFor.user)?.backup ?? null}
          none="No backup"
          onClose={() => setBackupFor(null)}
          onPick={(id) => {
            const user = backupFor.user;
            setBackupFor(null);
            void save(user, { backup: id ?? "" });
          }}
        />
      ) : null}
      {capsOpen ? (
        <CapsDialog
          count={picked.size}
          onClose={() => setCapsOpen(false)}
          onSave={(day, week) => {
            setCapsOpen(false);
            void saveMany([...picked], { cap_day: day, cap_week: week }, `Caps set for ${picked.size}`, ["caps"]);
          }}
        />
      ) : null}
      {toast.node}
    </div>
  );
}

/** A small meter against a cap; owners click it to type a new cap (Enter saves, Escape cancels). */
function CapMeter({ n, cap, max, label, edit, out, onSave }: { n: number; cap: number | null; max: number; label: string; edit: boolean; out: boolean; onSave: (v: number | null) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const m = meter(n, cap);
  if (editing) {
    const v = parseCap(text, max);
    return (
      <Input
        autoFocus
        aria-label={label}
        aria-invalid={v === undefined}
        value={text}
        inputMode="numeric"
        placeholder="—"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          } else if (e.key === "Enter" && v !== undefined) {
            e.preventDefault();
            setEditing(false);
            if (v !== cap) void onSave(v);
          }
        }}
        className={`h-8 w-20 ${v === undefined ? "border-rose focus:border-rose focus:ring-rose" : ""}`}
      />
    );
  }
  const body = (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className="relative h-1.5 w-14 overflow-hidden rounded-full bg-paper-deep">
        <span className={`absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-[320ms] ease-out ${m.full ? "bg-butter" : "bg-ink"}`} style={{ transform: `scaleX(${m.fill})` }} />
      </span>
      <span className={`text-[12.5px] tabular-nums ${out ? "text-faint" : "text-body"}`}>{m.words}</span>
    </span>
  );
  if (!edit) return body;
  return (
    <button
      type="button"
      aria-label={`${label}: ${cap ?? "none"}. Change`}
      onClick={() => {
        setText(cap ? String(cap) : "");
        setEditing(true);
      }}
      className="press -mx-2 rounded-full px-2 py-1 hover:bg-hover"
    >
      {body}
    </button>
  );
}

/** Pause for a while, out of office for some dates, or back in. */
function StatusPopover({ anchor, rep, onClose, onSave }: { anchor: HTMLElement; rep: RepRow | undefined; onClose: () => void; onSave: (p: Patch) => Promise<void> }) {
  const [today] = useState(() => localDate(Date.now()));
  const [until, setUntil] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const status = repStatus(rep);
  const dates = rep?.out_dates ?? [];
  const run = async (p: Patch) => {
    setBusy(true);
    await onSave(p);
    setBusy(false);
  };
  const pause = (c: PauseChoice) => run({ paused_until: pauseUntil(c) });
  const row = "flex h-9 w-full items-center rounded-sm px-2.5 text-left hover:bg-hover disabled:opacity-45";
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="flex flex-col p-1.5" role="dialog" aria-label="Status">
        <p className="px-2.5 pt-1.5 pb-1 text-[12px] text-muted">Pause for</p>
        <button type="button" disabled={busy} className={row} onClick={() => pause("hour")}>
          1 hour
        </button>
        <button type="button" disabled={busy} className={row} onClick={() => pause("today")}>
          Rest of today
        </button>
        <form
          className="flex items-center gap-2 px-2.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (until && until >= today) void run({ paused_until: endOfDay(until) });
          }}
        >
          <input type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} aria-label="Until a date" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <Button type="submit" variant="ghost" size="sm" disabled={busy || !until || until < today}>
            Pause
          </Button>
        </form>
        <button type="button" disabled={busy} className={row} onClick={() => pause("forever")}>
          Until I turn it back on
        </button>

        <div className="my-1.5 h-px bg-line" />
        <p className="px-2.5 pt-1 pb-1 text-[12px] text-muted">Out of office</p>
        {dates.map((d, i) => (
          <div key={`${d.from}-${d.to}`} className="flex h-8 items-center gap-2 px-2.5 text-[13px]">
            <span className="flex-1">{rangeWords(d.from, d.to)}</span>
            <button type="button" disabled={busy} aria-label={`Remove ${rangeWords(d.from, d.to)}`} onClick={() => void run({ out_dates: dates.filter((_, j) => j !== i) })} className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
              <X size={12} />
            </button>
          </div>
        ))}
        <form
          className="flex flex-wrap items-center gap-1.5 px-2.5 py-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) void run({ out_dates: [...dates, { from: from <= to ? from : to, to: from <= to ? to : from }] });
          }}
        >
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Out from" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="Out until" className="h-8 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] outline-none focus:border-ink focus:ring-1 focus:ring-ink" />
          <Button type="submit" variant="ghost" size="sm" disabled={busy || !from || !to}>
            Add
          </Button>
        </form>

        {status.kind !== "in" ? (
          <>
            <div className="my-1.5 h-px bg-line" />
            <Button
              size="sm"
              disabled={busy}
              className="m-1"
              onClick={() => void run({ paused_until: "", ...(status.kind === "out" ? { out_dates: dates.filter((d) => !(d.from <= today && today <= d.to)) } : {}) })}
            >
              Back in
            </Button>
          </>
        ) : null}
      </div>
    </Popover>
  );
}

function CapsDialog({ count, onClose, onSave }: { count: number; onClose: () => void; onSave: (day: number | null, week: number | null) => void }) {
  const [day, setDay] = useState("");
  const [week, setWeek] = useState("");
  const d = parseCap(day, 1000);
  const w = parseCap(week, 5000);
  const ok = d !== undefined && w !== undefined;
  return (
    <Modal
      title={`Caps for ${count}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ok} onClick={() => ok && onSave(d, w)}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-2 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSave(d, w);
        }}
      >
        <Field label="Per day">
          <Input autoFocus inputMode="numeric" placeholder="—" value={day} onChange={(e) => setDay(e.target.value)} aria-invalid={d === undefined} />
        </Field>
        <Field label="Per week">
          <Input inputMode="numeric" placeholder="—" value={week} onChange={(e) => setWeek(e.target.value)} aria-invalid={w === undefined} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
