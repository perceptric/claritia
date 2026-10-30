"use client";

// Routing › History: every lead and where it went, newest first. Filters are dropdown chips (dashed until set, then
// solid with the value and an ×): Rep, Team, Why, Result and Date. Each row reads Lead, Went to, Because (the step
// that decided, in the Rules tab's words), Result (Booked with the meeting, No time picked, Held...) and When. A row
// opens the run in the side panel; "Needs review" under Result lists the leads held or with no rep (Held.tsx).

import { useMemo, useState } from "react";
import { withSegments } from "@/lib/router/conditions";
import { Check, ChevronDown, X } from "../../Icons";
import { Popover } from "../FilterBar";
import { usePeople } from "../meetings/parts";
import { useMeetingTypes } from "../meetings/TypesList";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Page, timeAgo, useKept, useQuery, type Tone, type ViewProps } from "../ui";
import { Card, Column, TD, TH, Title, Who } from "../inbound/parts";
import { HeldTab } from "./Held";
import { RunPanel } from "./Log";
import { RouteSketch, useLiveBody } from "./screenParts";
import { decisionOf, leadOf, type RunRow } from "./screensModel";
import { becauseWords } from "./setupModel";
import { useRoutingLoad } from "./useRouterData";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { sub: string };
type Filters = { owner: string; queue: string; why: string; result: string; days: string };
const NONE: Filters = { owner: "", queue: "", why: "", result: "", days: "" };
const COLS = "id, contact_id, reason, version, kind, owner, by, queue_id, rule_id, steps, ms, created_at, undone_at, f_lead:facts->lead, f_company:facts->company";
type Slim = Omit<RunRow, "facts"> & { f_lead: unknown; f_company: unknown };
const slim = (rows: Slim[]): RunRow[] => rows.map(({ f_lead, f_company, ...r }) => ({ ...r, facts: { lead: f_lead ?? undefined, company: f_company ?? undefined } as RunRow["facts"] }));
const PAGE = 100;
const UUID = /^[0-9a-f-]{36}$/;
/** "Why" filter values for the steps that aren't a rule. */
const STEP_WHY: Record<string, string> = { "by:account": "Same company, same rep", "by:keep": "Returning lead, same rep", "by:fallback": "When no rule fits", "kind:held": "Stop junk", "by:hand": "Given by hand" };

export function HistoryTab({ sb, session, ws, role, navigate, sub }: Props) {
  const people = usePeople(sb, ws.id);
  const live = useLiveBody(sb, ws.id);
  const routing = useRoutingLoad(session, ws.id);
  const types = useMeetingTypes(sb, ws.id);
  const [f, setF] = useKept<Filters>(`routing-history:${ws.id}:filters`, NONE);
  const review = sub === "review";
  const [more, setMore] = useState<{ key: string; rows: RunRow[]; done: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const query = (x: Filters) => {
    let q = sb.from("router_runs").select(COLS).eq("workspace_id", ws.id);
    if (x.owner) q = q.eq("owner", x.owner);
    if (x.queue) q = q.eq("queue_id", x.queue);
    if (x.why.startsWith("rule:")) q = q.eq("rule_id", x.why.slice(5));
    else if (x.why.startsWith("by:")) q = q.eq("by", x.why.slice(3)).is("rule_id", null);
    else if (x.why === "kind:held") q = q.eq("kind", "held");
    if (x.result === "owner" || x.result === "held" || x.result === "unassigned") q = q.eq("kind", x.result);
    if (x.days) q = q.gte("created_at", new Date(Date.now() - Number(x.days) * 86_400_000).toISOString());
    return q;
  };
  const key = `router_runs:${ws.id}:history:${JSON.stringify(f)}`;
  const first = useQuery<RunRow[]>(review ? null : key, async () => slim(must(await query(f).order("created_at", { ascending: false }).limit(PAGE)) as unknown as Slim[]));
  const extra = more?.key === key ? more : null;
  const rows = useMemo(() => (first.data ? [...first.data, ...(extra?.rows ?? [])] : null), [first.data, extra]);
  const ids = useMemo(() => [...new Set((rows ?? []).map((r) => r.contact_id).filter((x): x is string => !!x))].slice(0, 300), [rows]);
  // Meetings these leads booked, for Result.
  const booked = useQuery(ids.length ? `meetings:${ws.id}:history:${ids.join(",")}` : null, async () => (must(await sb.from("meetings").select("contact_id, type_id, status, created_at").eq("workspace_id", ws.id).in("contact_id", ids)) ?? []) as { contact_id: string; type_id: string | null; status: string; created_at: string }[]);

  const loadMore = async () => {
    const last = rows?.[rows.length - 1];
    if (!last) return;
    setBusy(true);
    try {
      const list = slim(must(await query(f).lt("created_at", last.created_at).order("created_at", { ascending: false }).limit(PAGE)) as unknown as Slim[]);
      setMore({ key, rows: [...(extra?.rows ?? []), ...list], done: list.length < PAGE });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const body = live.data?.body ?? null;
  const draft = routing.data?.draft ?? null;
  const fields = withSegments(routing.data?.fields ?? [], body?.segments);
  const queues = [...new Map([...(body?.queues ?? []), ...(draft?.queues ?? [])].map((q) => [q.id, q])).values()];
  const ruleList = [...new Map([...(body?.rules.list ?? []), ...(draft?.rules.list ?? [])].map((r) => [r.id, r])).values()];
  const typeName = (id: string | null) => (id ? types.data?.find((t) => t.id === id)?.name : undefined);
  const result = (r: RunRow): { words: string; tone: Tone; meet?: string } => {
    if (r.kind === "held") return { words: "Held", tone: "amber" };
    if (r.kind === "unassigned") return { words: "No rep", tone: "red" };
    const m = (booked.data ?? []).filter((x) => x.contact_id === r.contact_id && x.created_at >= r.created_at && x.status !== "canceled").sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (m) return { words: "Booked", tone: "green", meet: typeName(m.type_id) };
    return r.reason === "form" ? { words: "No time picked", tone: "gray" } : { words: "Routed", tone: "gray" };
  };
  const setFilter = (k: keyof Filters) => (v: string) => {
    if (k === "result" && v === "review") return navigate("routing", "history/review");
    if (k === "result" && review) navigate("routing", "history");
    setF({ ...f, [k]: v });
  };
  const openId = UUID.test(sub) ? sub : "";
  const list = rows ?? [];

  return (
    <Page title="Routing" badge={routing.data ? routing.data.live && !routing.data.draft && !routing.data.paused ? <Badge tone="green" dot>Live</Badge> : <Badge tone="amber" dot>Draft</Badge> : null} flush>
      <Column>
        <Title>Every lead and where it went</Title>
        <div className="flex flex-wrap gap-2">
          <FilterPill label="Rep" value={f.owner} onChange={setFilter("owner")} options={(people.data?.list ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <FilterPill label="Team" value={f.queue} onChange={setFilter("queue")} options={queues.map((q) => ({ value: q.id, label: q.name }))} />
          <FilterPill
            label="Why"
            value={f.why}
            onChange={setFilter("why")}
            options={[...Object.entries(STEP_WHY).map(([value, label]) => ({ value, label })), ...ruleList.map((r) => ({ value: `rule:${r.id}`, label: r.name }))]}
          />
          <FilterPill
            label="Result"
            value={review ? "review" : f.result}
            onChange={setFilter("result")}
            options={[
              { value: "owner", label: "Went to a rep" },
              { value: "held", label: "Held" },
              { value: "unassigned", label: "No rep" },
              { value: "review", label: "Needs review" },
            ]}
          />
          <FilterPill
            label="Date"
            value={f.days}
            onChange={setFilter("days")}
            options={[
              { value: "1", label: "Last 24 hours" },
              { value: "7", label: "Last 7 days" },
              { value: "30", label: "Last 30 days" },
            ]}
          />
        </div>
        {review ? (
          <Card className="overflow-hidden">
            <HeldTab sb={sb} session={session} ws={ws} role={role} navigate={navigate} sub="" />
          </Card>
        ) : (
          <>
            <ErrorNote message={error || first.error || people.error} />
            {!rows ? (
              first.error ? null : <Loading />
            ) : !list.length ? (
              Object.values(f).some(Boolean) ? <Empty title="No matches" /> : <Empty sketch={<RouteSketch />} title="No leads routed yet" />
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full border-collapse [&_tbody_tr:last-child_td]:border-b-0">
                  <thead>
                    <tr>
                      <th className={TH}>Lead</th>
                      <th className={TH}>Went to</th>
                      <th className={TH}>Because</th>
                      <th className={TH}>Result</th>
                      <th className={`${TH} max-md:hidden`}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const l = leadOf(r);
                      const res = result(r);
                      const owner = r.kind === "owner" ? r.owner : null;
                      return (
                        <tr
                          key={r.id}
                          tabIndex={0}
                          onClick={() => navigate("routing", `history/${r.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              navigate("routing", `history/${r.id}`);
                            }
                          }}
                          className={`cursor-pointer whitespace-nowrap outline-none transition-colors duration-[140ms] hover:bg-hover focus-visible:bg-hover ${openId === r.id ? "bg-hover" : ""} ${r.undone_at ? "opacity-60" : ""}`}
                        >
                          <td className={`${TD} max-w-[240px]`}>
                            <span className="flex min-w-0 flex-col leading-[1.3]">
                              <b className="truncate text-[13px] font-medium text-ink">{l.name}</b>
                              {l.email && l.email !== l.name ? <span className="truncate text-[11.5px] text-muted">{l.email}</span> : null}
                            </span>
                          </td>
                          <td className={TD}>{owner ? <Who person={people.data?.byId.get(owner)} name={people.data?.byId.get(owner)?.name ?? "Former teammate"} size={20} /> : <span className="text-muted">Nobody</span>}</td>
                          <td className={`${TD} max-w-[280px] truncate text-muted`}>{becauseWords(decisionOf(r), { body: body ?? draft, fields })}</td>
                          <td className={TD}>
                            <Badge tone={res.tone} dot>
                              <span>
                                {res.words}
                                {res.meet ? <span className="font-normal">, {res.meet}</span> : null}
                              </span>
                            </Badge>
                          </td>
                          <td className={`${TD} text-muted max-md:hidden`}>
                            <span title={new Date(r.created_at).toLocaleString("en-US")}>{timeAgo(r.created_at)}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(extra ? !extra.done : (first.data?.length ?? 0) === PAGE) ? (
                  <div className="flex justify-center border-t border-line p-3">
                    <Button variant="ghost" size="sm" onClick={() => void loadMore()} disabled={busy}>
                      {busy ? "Loading" : "Load more"}
                    </Button>
                  </div>
                ) : null}
              </Card>
            )}
          </>
        )}
      </Column>
      {openId ? <RunPanel sb={sb} session={session} ws={ws} role={role} navigate={navigate} runId={openId} onClose={() => navigate("routing", "history")} /> : null}
    </Page>
  );
}

/** A filter as a chip: dashed with its name until set; then solid with the value and an × that clears it. */
function FilterPill({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = options.find((o) => o.value === value);
  return (
    <span className={`inline-flex h-[30px] items-center rounded-full border bg-card text-[12.5px] ${current ? "border-solid border-ink text-ink" : "border-dashed border-line-strong text-body"}`}>
      <button type="button" aria-haspopup="listbox" aria-expanded={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} className={`inline-flex h-full items-center gap-1.5 rounded-full pl-3 ${current ? "pr-1" : "pr-2"}`}>
        <span className="max-w-[200px] truncate">{current ? `${label}: ${current.label}` : label}</span>
        {current ? null : <ChevronDown size={12} className="text-muted" />}
      </button>
      {current ? (
        <button type="button" aria-label={`Clear ${label}`} title={`Clear ${label}`} onClick={() => onChange("")} className="mr-1 inline-flex size-[22px] items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <X size={11} />
        </button>
      ) : null}
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <ul role="listbox" aria-label={label} className="max-h-72 overflow-y-auto p-1">
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setAnchor(null);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-[13px] hover:bg-hover"
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value ? <Check size={13} className="text-ink" /> : null}
                </button>
              </li>
            ))}
            {!options.length ? <li className="px-2.5 py-2 text-faint">None yet</li> : null}
          </ul>
        </Popover>
      ) : null}
    </span>
  );
}
