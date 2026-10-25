"use client";

// Routing › Overview (docs/router-ux-v2.md Part 3.1 and 16.4, docs/app-structure.md Part 5): how routing is doing.
// A status line (on, changes not live, paused, or not set up) with Pause routing; numbers first (routed this week,
// reached out on time, no rep found, waiting for review); leads per day; where leads came from and who got them; the
// whole setup read back in plain words; and the setup as a story, read-only, with Edit setup.

import { useMemo, useState } from "react";
import { readBack } from "@/lib/router/readback";
import { REASONS, type Reason } from "@/lib/router/types";
import { Copy, Pause, Play } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { byDay, DayBars, StatCards } from "../StatCards";
import { Badge, Button, ErrorNote, errorText, Loading, must, Page, Panel, useLoad, type ViewProps } from "../ui";
import { copyText, PersonAvatar, usePeople } from "../meetings/parts";
import { routingApi } from "./api";
import { flowCounts, type Stats } from "./editorModel";
import { Flow } from "./Flow";
import { FirstScreen } from "./FirstScreen";
import { useRouterData } from "./useRouterData";
import { Report } from "../reports/Report";

const FROM_TONE: Partial<Record<Reason, string>> = { form: "bg-clay", import: "bg-sky", crm: "bg-sage", api: "bg-butter" };

export function OverviewPage(props: ViewProps) {
  const { sb, session, ws, role, navigate } = props;
  const r = useRouterData(session, ws.id);
  const people = usePeople(sb, ws.id);
  const runs = useLoad(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [rows, review, sla] = await Promise.all([
      sb.from("router_runs").select("created_at, reason, owner, kind").eq("workspace_id", ws.id).gte("created_at", since).is("undone_at", null).order("created_at", { ascending: false }).limit(20000),
      sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("route_status", ["held", "unassigned"]).is("deleted_at", null),
      sb.rpc("router_sla_stats", { p_ws: ws.id, p_days: 7 }),
    ]);
    const list = (must(rows) ?? []) as { created_at: string; reason: Reason; owner: string | null; kind: string }[];
    const slaRows = Object.values((sla.data ?? {}) as Record<string, { met: number; missed: number }>);
    const met = slaRows.reduce((a, x) => a + (x.met ?? 0), 0);
    const missed = slaRows.reduce((a, x) => a + (x.missed ?? 0), 0);
    return { list, at: Date.now(), review: review.count ?? 0, onTime: met + missed ? Math.round((met / (met + missed)) * 100) : null };
  }, ws.id);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const names = useMemo(() => Object.fromEntries((r.data?.members ?? []).map((m) => [m.id, m.name])), [r.data]);
  const week = useMemo(() => {
    const list = runs.data?.list ?? [];
    // The newest run's day is "now" enough here; the read itself is the last 30 days up to the moment it loaded.
    const since = (runs.data?.at ?? 0) - 7 * 86_400_000;
    return list.filter((x) => Date.parse(x.created_at) >= since);
  }, [runs.data]);

  if (r.error && !r.data)
    return (
      <Page title="Routing">
        <ErrorNote message={r.error} />
      </Page>
    );
  if (!r.data || !r.body)
    return (
      <Page title="Routing">
        <Loading />
      </Page>
    );
  const d = r.data;
  if (!d.live && !d.draft)
    return (
      <Page title="Routing" flush>
        <div className="h-full overflow-y-auto">
          <FirstScreen session={session} ws={ws.id} data={d} canEdit={role === "owner"} onCreated={() => navigate("routing", "rules")} />
        </div>
      </Page>
    );

  const owner = role === "owner";
  const status = !d.live ? "setup" : d.paused ? "paused" : d.draft ? "changes" : "on";
  const pause = async (paused: boolean) => {
    if (paused && !(await askConfirm("Pause routing?", { body: "New leads keep the owner they come with until you turn it back on.", ok: "Pause" }))) return;
    setBusy(true);
    setError("");
    try {
      await routingApi(session, ws.id, "pause", { paused });
      await r.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const live = d.live?.body ?? r.body;
  const paragraph = readBack(live, { names, fields: d.fields });
  const from = Object.entries(week.reduce<Record<string, number>>((m, x) => ({ ...m, [x.reason]: (m[x.reason] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const got = Object.entries(week.reduce<Record<string, number>>((m, x) => (x.owner && x.kind === "owner" ? { ...m, [x.owner]: (m[x.owner] ?? 0) + 1 } : m), {})).sort((a, b) => b[1] - a[1]);
  const maxFrom = Math.max(1, ...from.map((x) => x[1]));
  const maxGot = Math.max(1, ...got.map((x) => x[1]));

  return (
    <Page
      title="Routing"
      actions={
        <Button onClick={() => navigate("routing", "rules")}>{owner ? "Edit setup" : "Open setup"}</Button>
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className={`anim-rise-sm flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 ${status === "on" ? "border-sage/40 bg-sage-wash/50" : status === "paused" ? "border-line bg-paper-deep" : "border-butter/40 bg-butter-wash/50"}`}>
          <span key={status} className={`anim-pop inline-flex size-2.5 rounded-full ${status === "on" ? "bg-sage" : status === "paused" ? "bg-muted" : "bg-butter"}`} />
          <span className="flex-1 text-[13.5px] text-ink">
            {status === "on"
              ? `Routing is on. ${week.length.toLocaleString("en-US")} ${week.length === 1 ? "lead" : "leads"} routed this week.`
              : status === "paused"
                ? "Routing is paused. New leads keep the owner they come with."
                : status === "changes"
                  ? "You have changes that aren't live."
                  : "Your setup isn't live yet."}
          </span>
          {owner && d.live ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void pause(!d.paused)}>
              {d.paused ? <Play size={13} /> : <Pause size={13} />}
              {d.paused ? "Turn on" : "Pause routing"}
            </Button>
          ) : null}
          {status === "changes" || status === "setup" ? (
            <Button size="sm" onClick={() => navigate("routing", "rules")}>
              Review and make live
            </Button>
          ) : null}
        </div>
        <ErrorNote message={error || runs.error} />

        <StatCards
          cards={[
            { label: "Routed this week", value: runs.data ? week.length : null, note: `${(d.stats?.p95_ms ?? 0) < 1000 ? "Each in under a second" : "This week"}` },
            { label: "Reached out on time", value: runs.data ? (runs.data.onTime ?? 0) : null, format: (n) => `${n}%`, note: runs.data && runs.data.onTime === null ? "No follow-up times yet" : "Within the follow-up time, this week" },
            { label: "No rep found", value: runs.data ? week.filter((x) => x.kind === "unassigned").length : null, tone: week.some((x) => x.kind === "unassigned") ? "rose" : undefined, note: "This week" },
            { label: "Waiting for review", value: runs.data ? runs.data.review : null, tone: runs.data?.review ? "butter" : undefined, note: "Junk and leads with no rep" },
          ]}
        />

        <Panel className="px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Leads routed per day</h2>
            <span className="text-[12px] text-faint">Last 30 days</span>
          </div>
          {runs.data ? <DayBars days={byDay(runs.data.list.map((x) => x.created_at), 30)} label="Leads routed per day" /> : <div className="anim-shimmer h-36 rounded-lg bg-paper-deep" />}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel className="px-5 py-4">
            <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-ink">Where leads came from</h2>
            {!from.length ? (
              <p className="text-[13px] text-muted">No leads this week</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {from.map(([reason, n], i) => (
                  <li key={reason} className="flex items-center gap-3 text-[13px]">
                    <span className="w-28 shrink-0 text-ink">{REASONS[reason as Reason] ?? reason}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                      <span className={`anim-grow-x absolute inset-y-0 left-0 rounded-full ${FROM_TONE[reason as Reason] ?? "bg-line-strong"}`} style={{ width: `${(n / maxFrom) * 100}%`, animationDelay: `${i * 60}ms` }} />
                    </span>
                    <span className="w-10 text-right text-muted tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="px-5 py-4">
            <h2 className="mb-3 text-[14px] font-semibold tracking-[-0.01em] text-ink">Who got leads this week</h2>
            {!got.length ? (
              <p className="text-[13px] text-muted">No one yet</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {got.slice(0, 8).map(([id, n], i) => {
                  const p = people.data?.byId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-3 text-[13px]">
                      <PersonAvatar person={p} label={names[id] ?? "Former teammate"} size={22} />
                      <span className="w-24 shrink-0 truncate text-ink">{names[id] ?? "Former teammate"}</span>
                      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                        <span className="anim-grow-x absolute inset-y-0 left-0 rounded-full bg-sage" style={{ width: `${(n / maxGot) * 100}%`, animationDelay: `${i * 60}ms` }} />
                      </span>
                      <span className="w-10 text-right text-muted tabular-nums">{n}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-[14px] font-semibold tracking-[-0.01em] text-ink">Your setup in plain words</h2>
            {d.live && d.draft ? <Badge tone="amber">Live setup</Badge> : null}
            <Button
              variant="plain"
              size="sm"
              onClick={() =>
                void copyText(paragraph).then((ok) => {
                  if (!ok) return;
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                })
              }
            >
              <Copy size={13} />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="max-w-3xl text-[14px] leading-relaxed text-body">{paragraph}</p>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3">
            <h2 className="flex-1 text-[14px] font-semibold tracking-[-0.01em] text-ink">How a lead moves</h2>
            <Button variant="plain" size="sm" onClick={() => navigate("routing", "rules")}>
              {owner ? "Edit" : "Open"}
            </Button>
          </div>
          <Flow body={live} counts={flowCounts(d.stats as Partial<Stats>, live)} problems={[]} sel={null} onSelect={() => navigate("routing", "rules")} members={d.members} path={null} runKey={0} />
        </Panel>
        <Report sb={sb} ws={ws.id} navigate={navigate} show={["speed", "rules"]} />
      </div>
    </Page>
  );
}
