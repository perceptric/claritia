"use client";

// Routing › Log (docs/router-ux.md 4.8): every run, newest first, with filters and search; new runs rise in while the
// tab is visible. A row opens the run in a side panel (RunPanel), also used by the contact page's "Why?".

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { explain, pathWords } from "@/lib/router/explain";
import { REASONS, type Reason } from "@/lib/router/types";
import { Search } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { PersonAvatar, usePeople, type Person } from "../meetings/parts";
import { Select } from "../Select";
import { Sheet } from "../Sheet";
import { Badge, Button, Empty, ErrorNote, errorText, Input, invalidate, Loading, must, Td, Th, timeAgo, useKept, useQuery, useWindowed, type ViewProps } from "../ui";
import { useFormNames } from "../shared";
import { routingApi } from "./api";
import { RunLines, type LinkTo } from "./Lines";
import { ROUTING, FilterChip, RouteSketch, useLiveBody } from "./screenParts";
import { decisionOf, factsOf, fromWords, leadOf, matchesSearch, mergeNewer, NO_FILTERS, routedBy, type LogFilters, type RunRow } from "./screensModel";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { sub: string };

const COLS = "id, contact_id, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, created_at, undone_at";
// The list reads only the parts of a run's facts it shows (the lead, the company, the form); the run panel reads all.
const LIST_COLS = "id, contact_id, reason, version, kind, owner, by, queue_id, rule_id, steps, ms, created_at, undone_at, f_lead:facts->lead, f_company:facts->company, f_values:facts->values";
type SlimRow = Omit<RunRow, "facts"> & { f_lead: unknown; f_company: unknown; f_values: unknown };
const slim = (rows: SlimRow[]): RunRow[] =>
  rows.map(({ f_lead, f_company, f_values, ...r }) => ({ ...r, facts: { lead: f_lead ?? undefined, company: f_company ?? undefined, values: f_values ?? undefined } as RunRow["facts"] }));
const PAGE = 200;
const UUID = /^[0-9a-f-]{36}$/;

/** The names of teammates by id, for runs whose facts don't hold them. */
const namesOf = (people: Person[] | undefined) => Object.fromEntries((people ?? []).map((p) => [p.id, p.name]));

/** The result cell: the owner's avatar and name, or a Held or Unassigned pill. */
export function ResultCell({ row, people }: { row: Pick<RunRow, "kind" | "owner" | "facts">; people?: Map<string, Person> }) {
  if (row.kind === "held") return <Badge tone="amber">Held</Badge>;
  if (row.kind === "unassigned" || !row.owner) return <Badge tone="red">Unassigned</Badge>;
  const p = people?.get(row.owner);
  const name = p?.name ?? row.facts?.reps?.[row.owner]?.name ?? "Former teammate";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar person={p} label={name} size={22} />
      <span className="truncate text-ink">{name}</span>
    </span>
  );
}

export function LogTab({ sb, session, ws, role, navigate, sub }: Props) {
  const people = usePeople(sb, ws.id);
  const live = useLiveBody(sb, ws.id);
  const forms = useFormNames(sb, ws.id);
  const versions = useQuery<number[]>(`router_versions:${ws.id}`, async () =>
    ((must(await sb.from("router_versions").select("version").eq("workspace_id", ws.id).order("version", { ascending: false }).limit(100)) ?? []) as { version: number }[]).map((v) => v.version),
  );
  const [filters, setFilters] = useKept<LogFilters>(`routing-log:${ws.id}:filters`, NO_FILTERS);
  const [q, setQ] = useKept(`routing-log:${ws.id}:q`, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const changeFilters = (f: LogFilters) => {
    setFilters(f);
    setError("");
  };

  const query = useCallback(
    (f: LogFilters) => {
      let x = sb.from("router_runs").select(LIST_COLS).eq("workspace_id", ws.id);
      if (f.owner) x = x.eq("owner", f.owner);
      if (f.queue) x = x.eq("queue_id", f.queue);
      if (f.rule) x = x.eq("rule_id", f.rule);
      if (f.result) x = x.eq("kind", f.result);
      if (f.reason) x = x.eq("reason", f.reason);
      if (f.version) x = x.eq("version", Number(f.version));
      if (f.days) x = x.gte("created_at", new Date(Date.now() - Number(f.days) * 86_400_000).toISOString());
      return x;
    },
    [sb, ws.id],
  );

  // The newest page for these filters, from the cache at once and fetched again in the background.
  const pageKey = `router_runs:${ws.id}:log:${JSON.stringify(filters)}`;
  const first = useQuery<RunRow[]>(pageKey, async () => slim(must(await query(filters).order("created_at", { ascending: false }).limit(PAGE)) as unknown as SlimRow[]));
  // Older pages loaded with Load more, for the filters they were loaded with.
  const [older, setOlder] = useState<{ key: string; rows: RunRow[]; more: boolean } | null>(null);
  const extra = older?.key === pageKey ? older : null;
  const rows = useMemo(() => (first.data ? [...first.data, ...(extra?.rows ?? [])] : null), [first.data, extra]);
  const more = extra ? extra.more : (first.data?.length ?? 0) === PAGE;
  const rowsRef = useRef<RunRow[] | null>(null);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  const setFirst = first.set;

  // New runs every 10 seconds while the tab is open and visible.
  useEffect(() => {
    const tick = async () => {
      const list = rowsRef.current;
      if (!list || document.visibilityState !== "visible") return;
      let x = query(filters);
      if (list[0]) x = x.gt("created_at", list[0].created_at);
      const res = await x.order("created_at", { ascending: false }).limit(50);
      if (res.error || !res.data?.length) return;
      const newer = slim(res.data as unknown as SlimRow[]);
      setFirst((cur) => (cur ? mergeNewer(cur, newer) : cur));
      setFresh(new Set(newer.map((r) => r.id)));
    };
    const t = setInterval(() => void tick(), 10_000);
    const vis = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [query, filters, setFirst]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const list = slim(must(await query(filters).lt("created_at", last.created_at).order("created_at", { ascending: false }).limit(PAGE)) as unknown as SlimRow[]);
      setOlder({ key: pageKey, rows: [...(extra?.rows ?? []), ...list], more: list.length === PAGE });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const byId = people.data?.byId;
  const body = live.data?.body;
  const shown = useMemo(() => (rows ?? []).filter((r) => matchesSearch(r, q)), [rows, q]);
  const filtered = Object.values(filters).some(Boolean) || !!q.trim();
  const set = (k: keyof LogFilters) => (v: string) => changeFilters({ ...filters, [k]: v });
  const open = useCallback((id: string) => navigate(ROUTING, `leads/${id}`), [navigate]);
  const openId = UUID.test(sub) ? sub : "";
  const { box: rowsBox, start: winStart, end: winEnd, before: winBefore, after: winAfter } = useWindowed(shown.length, { estimate: 53 });
  const listError = error || first.error;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 md:px-5">
        <div className="relative w-full sm:w-60">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search by name, email or domain" className="h-9 pl-8" />
        </div>
        <FilterChip label="Owner" value={filters.owner} onChange={set("owner")} options={[{ value: "", label: "Anyone" }, ...(people.data?.list ?? []).map((p) => ({ value: p.id, label: p.name }))]} />
        <FilterChip label="Team" value={filters.queue} onChange={set("queue")} options={[{ value: "", label: "Any team" }, ...(body?.queues ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        <FilterChip label="Rule" value={filters.rule} onChange={set("rule")} options={[{ value: "", label: "Any rule" }, ...(body?.rules.list ?? []).map((x) => ({ value: x.id, label: x.name }))]} />
        <FilterChip
          label="Result"
          value={filters.result}
          onChange={set("result")}
          options={[
            { value: "", label: "Any result" },
            { value: "owner", label: "Routed" },
            { value: "held", label: "Held" },
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
        <FilterChip label="Source" value={filters.reason} onChange={set("reason")} options={[{ value: "", label: "Any source" }, ...(Object.keys(REASONS) as Reason[]).map((k) => ({ value: k, label: REASONS[k] }))]} />
        <FilterChip label="Version" value={filters.version} onChange={set("version")} options={[{ value: "", label: "Any version" }, ...(versions.data ?? []).map((v) => ({ value: String(v), label: `v${v}` }))]} />
        <FilterChip
          label="Date"
          value={filters.days}
          onChange={set("days")}
          options={[
            { value: "", label: "Any time" },
            { value: "1", label: "Last 24 hours" },
            { value: "7", label: "Last 7 days" },
            { value: "30", label: "Last 30 days" },
          ]}
        />
        {filtered ? (
          <Button
            variant="plain"
            size="sm"
            onClick={() => {
              changeFilters(NO_FILTERS);
              setQ("");
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>

      {listError || people.error ? (
        <div className="p-5">
          <ErrorNote message={listError || people.error} />
        </div>
      ) : !rows ? (
        <Loading />
      ) : !shown.length ? (
        filtered ? <Empty title="No matches" /> : <Empty sketch={<RouteSketch />} title="No leads routed yet" />
      ) : (
        <div className={`overflow-x-auto transition-opacity duration-[140ms] ${first.fetching && !first.data ? "opacity-70" : ""}`} aria-live="polite">
          <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
            <thead>
              <tr>
                <Th className="pl-5">When</Th>
                <Th>Lead</Th>
                <Th className="hidden md:table-cell">From</Th>
                <Th>Result</Th>
                <Th className="hidden lg:table-cell">Path</Th>
                <Th className="hidden md:table-cell">Version</Th>
                <Th className="hidden text-right md:table-cell">Time</Th>
              </tr>
            </thead>
            <tbody ref={rowsBox}>
              {winBefore ? <tr aria-hidden="true" style={{ height: winBefore }} /> : null}
              {shown.slice(winStart, winEnd).map((r) => (
                <LogRow key={r.id} r={r} on={openId === r.id} fresh={fresh.has(r.id)} forms={forms.data ?? undefined} people={byId} open={open} />
              ))}
              {winAfter ? <tr aria-hidden="true" style={{ height: winAfter }} /> : null}
            </tbody>
          </table>
          {more && !q.trim() ? (
            <div className="flex justify-center border-t border-line p-3">
              <Button variant="ghost" size="sm" onClick={loadMore} disabled={busy}>
                {busy ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {openId ? <RunPanel sb={sb} session={session} ws={ws} role={role} navigate={navigate} runId={openId} onClose={() => navigate(ROUTING, "leads")} /> : null}
    </div>
  );
}

/** One run in the log. Memoized: a new run rising in doesn't redraw the other rows. */
const LogRow = memo(function LogRow({ r, on, fresh, forms, people, open }: { r: RunRow; on: boolean; fresh: boolean; forms?: Record<string, string>; people?: Map<string, Person>; open: (id: string) => void }) {
  const l = leadOf(r);
  return (
    <tr
      data-row
      tabIndex={0}
      aria-label={`${l.name}, ${timeAgo(r.created_at)}`}
      onClick={() => open(r.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(r.id);
        }
      }}
      className={`cursor-pointer outline-none transition-colors duration-[140ms] hover:bg-hover focus-visible:bg-hover ${on ? "bg-hover" : ""} ${fresh ? "anim-rise-sm" : ""} ${r.undone_at ? "opacity-60" : ""}`}
    >
      <Td className="pl-5 text-muted">
        <span title={new Date(r.created_at).toLocaleString("en-US")}>{timeAgo(r.created_at)}</span>
      </Td>
      <Td className="max-w-[260px]">
        <span className="flex min-w-0 items-center gap-2.5">
          {l.domain ? <BrandLogo domain={l.domain} name={l.company || l.domain} size={18} /> : null}
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{l.name}</span>
            <span className="truncate text-[12px] text-muted">{[l.email !== l.name ? l.email : "", l.company].filter(Boolean).join(" · ")}</span>
          </span>
        </span>
      </Td>
      <Td className="hidden max-w-[180px] truncate text-body md:table-cell">{fromWords(r, forms)}</Td>
      <Td className="max-w-[200px]">
        <ResultCell row={r} people={people} />
      </Td>
      <Td className="hidden max-w-[260px] truncate text-body lg:table-cell">{pathWords(decisionOf(r))}</Td>
      <Td className="hidden text-muted tabular-nums md:table-cell">{r.version ? `v${r.version}` : "—"}</Td>
      <Td className="hidden text-right text-muted tabular-nums md:table-cell">{r.ms != null ? `${r.ms} ms` : "—"}</Td>
    </tr>
  );
});

/**
 * Under the Owner field on a contact's page (docs/router-ux.md 4.10): "Routed by US mid-market · Why?", with Why?
 * opening the contact's latest run. Nothing when the contact was never routed.
 */
export function RoutedBy({ sb, session, ws, role, navigate, contact }: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { contact: string }) {
  const latest = useQuery(
    `router_runs:${ws.id}:contact:${contact}`,
    async () => must(await sb.from("router_runs").select(COLS).eq("workspace_id", ws.id).eq("contact_id", contact).order("created_at", { ascending: false }).limit(1).maybeSingle()) as unknown as RunRow | null,
  );
  const sla = useQuery(`router_slas:${ws.id}:contact:${contact}`, async () => {
    const row = must(await sb.from("router_slas").select("run_id, user_id, status, due_at").eq("workspace_id", ws.id).eq("contact_id", contact).order("started_at", { ascending: false }).limit(1).maybeSingle()) as unknown as SlaRow | null;
    if (!row) return null;
    const due = new Date(row.due_at);
    return { ...row, words: dueWords(due), soon: due.getTime() - Date.now() < 15 * 60_000 };
  });
  const [open, setOpen] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState("");
  const r = latest.data;
  if (!r) return null;
  const t = sla.data;
  // Mark contacted: the reply-by pill goes at once; it comes back with the error if the write fails.
  const mark = async () => {
    setMarking(true);
    setMarkError("");
    try {
      await sla.mutate((s) => (s ? { ...s, status: "met" as const } : s), () => routingApi(session, ws.id, "contacted", { contact }));
      invalidate(`router_slas:${ws.id}`);
      invalidate("app_counts");
    } catch (e) {
      setMarkError(errorText(e));
    } finally {
      setMarking(false);
    }
  };
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 px-2 text-[12px] text-faint">
      <span className="truncate">{routedBy(r)}</span>
      <button type="button" onClick={() => setOpen(r.id)} className="shrink-0 font-medium text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
        Why?
      </button>
      {t?.status === "open" ? (
        <span className="flex basis-full items-center gap-2 pt-1">
          <Badge tone={t.soon ? "amber" : "gray"}>Reply by {t.words}</Badge>
          <Button size="sm" variant="plain" disabled={marking} onClick={() => void mark()}>
            Mark contacted
          </Button>
        </span>
      ) : t?.status === "missed" ? (
        <span className="basis-full pt-1">
          <Badge tone="red">Response time missed</Badge>
        </span>
      ) : null}
      {markError ? <span className="basis-full text-rose">{markError}</span> : null}
      {open ? (
        <RunPanel
          sb={sb}
          session={session}
          ws={ws}
          role={role}
          navigate={navigate}
          runId={open}
          onClose={() => setOpen(null)}
          onRouted={() => {
            latest.reload();
            invalidateRouted(ws.id);
          }}
        />
      ) : null}
    </span>
  );
}

type SlaRow = { run_id: string; user_id: string; status: "open" | "met" | "missed" | "closed"; due_at: string };

/** "3:40 PM" today, "Tue 3:40 PM" later. */
function dueWords(d: Date): string {
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/**
 * One run in a side panel: who the lead is, where it came from, the sentences with names as links, the owner, and
 * Open contact, Route again and Test draft.
 */
export function RunPanel({ sb, session, ws, role, navigate, runId, onClose, onRouted }: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { runId: string; onClose: () => void; onRouted?: (run: string) => void }) {
  const [id, setId] = useState(runId);
  const [was, setWas] = useState(runId);
  if (runId !== was) {
    setWas(runId);
    setId(runId);
  }
  const people = usePeople(sb, ws.id);
  const live = useLiveBody(sb, ws.id);
  const forms = useFormNames(sb, ws.id);
  const run = useQuery(`router_run:${ws.id}:${id}`, async () => {
    const r = must(await sb.from("router_runs").select(COLS).eq("workspace_id", ws.id).eq("id", id).maybeSingle()) as unknown as RunRow | null;
    if (!r) throw new Error("This run is gone.");
    return { r };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const r = run.data?.r;
  const names = namesOf(people.data?.list);
  const lines = r ? explain(decisionOf(r), factsOf(r, names), { territories: live.data?.body.territories }) : [];
  const lead = r ? leadOf(r) : null;
  const onLink: LinkTo = (p) => {
    if (p.kind === "user") navigate(ROUTING, "team");
    else if (p.kind === "company") navigate("companies", p.id);
    else navigate(ROUTING, "");
  };

  const again = async () => {
    if (!r?.contact_id || !(await askConfirm(`Route ${lead?.name ?? "this lead"} again?`, { ok: "Route again" }))) return;
    setBusy(true);
    setError("");
    try {
      const out = await routingApi<{ routed?: number; run?: string; status?: string }>(session, ws.id, "route", { contacts: [r.contact_id] });
      if (out.run) {
        setId(out.run);
        invalidateRouted(ws.id);
        onRouted?.(out.run);
      } else if (out.status) setError(out.status === "gone" ? "This contact is gone." : "Couldn't route it. Try again.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Give the lead to another rep; with a meeting coming up, ask once whether it moves too (docs/scheduling-plan.md 12.6).
  const giveTo = async (user: string) => {
    if (!r?.contact_id) return;
    setBusy(true);
    setError("");
    try {
      const soon = await sb.from("meetings").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("contact_id", r.contact_id).eq("status", "booked").gt("start_at", new Date().toISOString());
      const moveMeetings = (soon.count ?? 0) > 0 && (await askConfirm("Move their upcoming meeting too?", { ok: "Move it" }));
      const out = await routingApi<{ moved?: number; kept?: number }>(session, ws.id, "held", { op: "assign", contacts: [r.contact_id], user, moveMeetings });
      const name = people.data?.byId.get(user)?.name ?? "them";
      if (moveMeetings && out.kept) setError(`${name} isn't free at that time. The meeting stays where it is.`);
      invalidateRouted(ws.id);
      run.reload();
      onRouted?.(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={lead ? [lead.name, lead.company].filter(Boolean).join(" · ") : "Run"}
      onClose={onClose}
      footer={
        r?.contact_id ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("contacts", r.contact_id!)}>
              Open contact
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTING, "", `test=${r.contact_id}`)}>
              Test draft
            </Button>
            {role === "owner" ? (
              <Select<string>
                value=""
                options={(people.data?.list ?? []).map((p) => ({ value: p.id, label: p.name }))}
                onChange={(u) => void giveTo(u)}
                ariaLabel="Give to"
                placeholder="Give to"
                plainPlaceholder
                disabled={busy}
                className="h-8 rounded-full border border-line px-3 text-[12.5px]"
              />
            ) : null}
            <Button size="sm" onClick={again} disabled={busy}>
              {busy ? "Routing…" : "Route again"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-5" aria-live="polite">
        <ErrorNote message={error || run.error || people.error} />
        {!r ? (
          run.error ? null : <Loading />
        ) : (
          <>
            <p className="text-[12.5px] text-muted">
              {[fromWords(r, forms.data ?? undefined), new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), r.version ? `v${r.version}` : null, r.ms != null ? `${r.ms} ms` : null]
                .filter(Boolean)
                .join(" · ")}
              {r.undone_at ? (
                <span className="ml-2 align-middle">
                  <Badge>Taken back</Badge>
                </span>
              ) : null}
            </p>
            <RunLines lines={lines} onLink={onLink} />
            <div className="flex items-center gap-3 border-t border-line pt-4 text-[13px]">
              <span className="w-16 text-muted">Owner</span>
              <ResultCell row={r} people={people.data?.byId} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** After a lead is routed or given to someone: the log, Held, the contact's run and the sidebar count. */
export function invalidateRouted(ws: string) {
  invalidate(`router_runs:${ws}`);
  invalidate(`routing_held:${ws}`);
  invalidate(`router_slas:${ws}`);
  invalidate("app_counts");
}
