"use client";

// Routing › Activity (docs/routing-workflow.md Section 18): real runs only, newest first, with All runs, Needs review
// and Errors; each row shows the lead, source, policy and version, why it went where it did, the owner and the
// separate assignment and booking states. A run opens with its record and a timeline from its stored trace, review
// item, meeting and follow-up task. Dry runs never show here. Approving a review item arrives with the review queue
// (stage H): its buttons say so instead of pretending.

import { useState } from "react";
import { assignmentBadge, bookingBadge, firstName, reasonWords, REVIEW_WORDS } from "@/lib/routing/screenModel";
import { Sheet } from "../../Sheet";
import { Badge, Button, ErrorNote, Loading, Page, useQuery, type ViewProps } from "../../ui";
import { askToConnect } from "../SalesReps";
import { rt, type RunDetail, type RunRow, type Screen } from "./api";
import { Initials, namesOf, Pills, timeOf, when } from "./parts";

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
                  const a = assignmentBadge(r.assignment_state, r.effect, r.kind);
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
      {openRun ? <RunDrawer session={session} ws={ws.id} run={openRun} names={names.people} onClose={() => navigate("routing", filter === "all" ? "activity" : `activity/${filter}`)} /> : null}
    </Page>
  );
}

function RunDrawer({ session, ws, run, names, onClose }: { session: ViewProps["session"]; ws: string; run: string; names: Record<string, string>; onClose: () => void }) {
  const q = useQuery(`routing_run:${ws}:${run}`, () => rt<{ run: RunDetail }>(session, ws, "rt_run", { run }), { staleMs: 5_000 });
  const r = q.data?.run;
  const who = (u: string | null | undefined) => (u ? (names[u] ?? "Former teammate") : "Nobody");
  if (!r)
    return (
      <Sheet title="Run" onClose={onClose} width={620}>
        <div className="p-4">{q.error ? <ErrorNote message={q.error} /> : <Loading />}</div>
      </Sheet>
    );
  const a = assignmentBadge(r.assignment_state, r.effect, r.kind);
  const b = bookingBadge(r.booking_state, r.booking_reason);
  const t = timeOf(r.at);
  const held = r.trace?.checks.result === "held" || r.kind === "held";
  const override = (r.trace as unknown as { override?: { reason: string; suggested: string | null; by: string } } | null)?.override;
  const lines: { tone: "ok" | "warn" | ""; text: string; at: string }[] = [];
  lines.push({ tone: "ok", text: r.key.startsWith("handoff:") ? `Handoff started by ${who(r.by_user)}` : r.reason === "form" ? "Submission saved" : "Routing started", at: t });
  if (held) lines.push({ tone: "warn", text: reasonWords(r) === "Suspected spam" ? "Held as suspected spam" : `Held: ${reasonWords(r).toLowerCase()}`, at: t });
  if (r.kind === "unassigned") lines.push({ tone: "warn", text: "No eligible recipient", at: t });
  if (r.review) lines.push({ tone: "", text: `Review item opened for ${who(r.review.reviewer)} · ${REVIEW_WORDS[r.review.state] ?? r.review.state}`, at: t });
  if (r.kind === "owner" && r.owner) lines.push({ tone: "ok", text: `${r.effect === "retained" ? "Kept with" : "Assigned to"} ${who(r.owner)} · ${reasonWords(r)}`, at: t });
  if (override) lines.push({ tone: "", text: `Chosen by ${who(override.by)}: ${override.reason}${override.suggested ? ` (suggested ${who(override.suggested)})` : ""}`, at: t });
  if (r.booking_state === "confirmed") lines.push({ tone: "ok", text: `Meeting confirmed${r.meeting ? ` · ${new Date(r.meeting.start).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}`, at: t });
  else if (r.booking_state === "pending_confirmation") lines.push({ tone: "", text: "Meeting waiting for the calendar to confirm", at: t });
  else if (r.booking_state === "unavailable") lines.push({ tone: "warn", text: r.booking_reason === "no_slots" ? "No free times to offer" : `Calendar availability couldn't be loaded: ${b.label.toLowerCase()}`, at: t });
  else if (r.booking_state === "failed") lines.push({ tone: "warn", text: "Meeting not confirmed", at: t });
  else if (r.booking_state === "awaiting_selection") lines.push({ tone: "", text: "Calendar shown, no time picked yet", at: t });
  else if (r.kind === "owner") lines.push({ tone: "", text: "No meeting requested", at: t });
  if (r.task) lines.push({ tone: "", text: `Follow-up task ${r.task.done ? "done" : "created"} for ${who(r.task.assignee)}`, at: timeOf(r.task.at) });
  const review = !!r.review && !["resolved", "dismissed"].includes(r.review.state);
  const disconnected = r.booking_state === "unavailable" && r.booking_reason === "calendar_disconnected" && r.owner;
  return (
    <Sheet
      title={r.lead.name || r.lead.email || "Run"}
      onClose={onClose}
      width={620}
      actions={
        <Badge tone={a.tone} dot>
          {a.label}
        </Badge>
      }
      footer={
        review ? (
          <>
            <Button variant="ghost" disabled title="Arrives with the review queue">
              Dismiss
            </Button>
            <Button disabled title="Arrives with the review queue">
              Approve and route
            </Button>
          </>
        ) : disconnected ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void askToConnect({ name: who(r.owner) })}>Ask {firstName(who(r.owner))} to reconnect</Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4 text-[13px]">
        <div className="rounded-[10px] border border-line">
          {(
            [
              ["Source", r.source ?? (r.reason === "manual" ? "By hand" : "Other")],
              ["Policy", `${r.policy ?? "Routing"}${r.version ? ` v${r.version}` : ""}`],
              ["Previous owner", r.previous_owner ? who(r.previous_owner) : "None"],
              ...(r.current_owner && r.current_owner !== r.owner && r.kind === "owner" ? ([["Owner now", who(r.current_owner)]] as [string, string][]) : []),
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
              <span className="flex-1 font-medium text-ink">{k}</span>
              <span className={v === "None" ? "text-muted" : ""}>{v}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
            <span className="flex-1 font-medium text-ink">Booking</span>
            <Badge tone={b.tone} dot>
              {b.label}
            </Badge>
          </div>
        </div>
        <ol className="ml-1.5 flex flex-col border-l-2 border-line pl-3.5">
          {lines.map((l, i) => (
            <li key={i} className="relative py-1.5 text-[12.5px] text-ink">
              <span aria-hidden="true" className={`absolute top-[9px] -left-[21px] size-2.5 rounded-full border-2 bg-card ${l.tone === "ok" ? "border-signal" : l.tone === "warn" ? "border-butter" : "border-line-strong"}`} />
              {l.text}
              <span className="ml-1.5 text-muted">{l.at}</span>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
