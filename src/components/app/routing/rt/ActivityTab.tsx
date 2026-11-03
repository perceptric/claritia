"use client";

// Routing › Activity (docs/routing-workflow.md Section 18): real runs only, newest first, with All runs, Needs review
// and Errors; each row shows the lead, source, policy and version, why it went where it did, the owner and the
// separate assignment and booking states (and a review item's own state while it's approved or running). A run opens
// in its drawer (RunDrawer.tsx) with its record, timeline and the actions that recover it. Dry runs never show here.

import { useState } from "react";
import { assignmentBadge, bookingBadge, firstName, reasonWords, REVIEW_WORDS } from "@/lib/routing/screenModel";
import { Badge, Button, ErrorNote, Loading, Page, useQuery, type ViewProps } from "../../ui";
import { rt, type RunRow, type Screen } from "./api";
import { Initials, namesOf, Pills, when } from "./parts";
import { RunDrawer } from "./RunDrawer";

type Filter = "all" | "review" | "errors";

export function ActivityTab({ session, ws, navigate, screen, sub }: ViewProps & { screen: { data: Screen | null }; sub: string }) {
  const d = screen.data!;
  const names = namesOf(d.people, d.teams);
  const filter: Filter = sub === "review" ? "review" : sub === "errors" ? "errors" : "all";
  const openRun = /^[0-9a-f-]{36}$/.test(sub) ? sub : null;
  const [more, setMore] = useState<RunRow[]>([]);
  const [end, setEnd] = useState(false);
  const list = useQuery(`routing_activity:${ws.id}:${filter}`, () => rt<{ runs: RunRow[] }>(session, ws.id, "rt_activity", { filter }), { staleMs: 5_000 });
  const rows = [...(list.data?.runs ?? []), ...more];
  const who = (u: string | null) => (u ? (names.people[u] ?? "Former teammate") : "");
  const loadMore = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    const r = await rt<{ runs: RunRow[] }>(session, ws.id, "rt_activity", { filter, before: last.at });
    setMore((m) => [...m, ...r.runs]);
    if (r.runs.length < 50) setEnd(true);
  };

  return (
    <Page title="Routing" flush>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-4 py-5 text-[13px] md:px-6">
        <Pills<Filter>
          label="Runs"
          value={filter}
          options={[
            { value: "all", label: "All runs" },
            { value: "review", label: "Needs review" },
            { value: "errors", label: "Errors" },
          ]}
          onChange={(v) => {
            setMore([]);
            setEnd(false);
            navigate("routing", v === "all" ? "activity" : `activity/${v}`);
          }}
        />
        <ErrorNote message={list.error} />
        {!list.data && !list.error ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {[
                    ["Lead", ""],
                    ["Source", "max-md:hidden"],
                    ["Policy", "max-md:hidden"],
                    ["Reason", "max-sm:hidden"],
                    ["Owner", "max-sm:hidden"],
                    ["Assignment", ""],
                    ["Booking", ""],
                    ["Time", "max-md:hidden"],
                  ].map(([h, c]) => (
                    <th key={h} className={`border-b border-line px-4 py-2.5 text-left text-[11.5px] font-medium whitespace-nowrap text-muted ${c}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-b-0">
                {rows.map((r) => {
                  const working = r.review && (r.review.state === "approved_pending_execution" || r.review.state === "in_progress");
                  const a = working ? { label: REVIEW_WORDS[r.review!.state]!, tone: "amber" as const } : assignmentBadge(r.assignment_state, r.effect, r.kind);
                  const b = bookingBadge(r.booking_state, r.booking_reason);
                  return (
                    <tr key={r.id} onClick={() => navigate("routing", `activity/${r.id}`)} className="cursor-pointer hover:[&_td]:bg-paper">
                      <td className="border-b border-line px-4 py-3 font-medium text-ink">{r.lead.name || r.lead.email || "Lead"}</td>
                      <td className="border-b border-line px-4 py-3 text-muted max-md:hidden">{r.source ?? (r.reason === "form" ? "Form" : r.reason === "manual" ? "By hand" : "Other")}</td>
                      <td className="border-b border-line px-4 py-3 whitespace-nowrap text-muted max-md:hidden">
                        {r.policy ?? "Routing"} {r.version ? `v${r.version}` : ""}
                      </td>
                      <td className="border-b border-line px-4 py-3 text-muted max-sm:hidden">{reasonWords(r)}</td>
                      <td className="border-b border-line px-4 py-3 max-sm:hidden">
                        {r.owner ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <Initials name={who(r.owner)} size={20} />
                            {firstName(who(r.owner))}
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td className="border-b border-line px-4 py-3">
                        <Badge tone={a.tone} dot>
                          {a.label}
                        </Badge>
                      </td>
                      <td className="border-b border-line px-4 py-3">
                        <Badge tone={b.tone} dot>
                          {b.label}
                        </Badge>
                      </td>
                      <td className="border-b border-line px-4 py-3 whitespace-nowrap text-muted max-md:hidden">{when(r.at)}</td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <span className="font-medium text-ink">No runs yet</span>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {rows.length >= 50 && !end ? (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => void loadMore()}>
              Show more
            </Button>
          </div>
        ) : null}
      </div>
      {openRun ? <RunDrawer key={openRun} session={session} ws={ws.id} run={openRun} d={d} onOpen={(id) => navigate("routing", `activity/${id}`)} onClose={() => navigate("routing", filter === "all" ? "activity" : `activity/${filter}`)} /> : null}
    </Page>
  );
}
