"use client";

// A real run's drawer in Routing › Activity (docs/routing-workflow.md Sections 15, 18 and 19): what was decided and
// why, then what can be done about it, each step on its own. A review item is approved and routed by an explicit
// child attempt (pick the version, correct data, see the suggestion, confirm), assigned by hand with a reason,
// dismissed with a reason or reopened. A booking or sync that stopped is recovered on its own: reconnect the calendar,
// check the calendar for an unknown outcome, resume the booking with the same owner, retry the CRM sync. A committed
// owner can be reassigned. The server checks every action again; buttons only show what the person may do.

import { useEffect, useMemo, useRef, useState } from "react";
import { assignmentBadge, bookingBadge, fieldOf, firstName, reasonWords, recoveryActions, REVIEW_WORDS, syncBadge, type Recovery } from "@/lib/routing/screenModel";
import { askText } from "../../Dialogs";
import { Choice } from "../../inbound/parts";
import { Sheet } from "../../Sheet";
import { Badge, Button, ErrorNote, invalidate, Loading, Toggle, useQuery, type ViewProps } from "../../ui";
import { askToConnect } from "../SalesReps";
import { toast } from "../Toast";
import { ApiError, newKey, rt, type ChildPreview, type ChildResult, type ReassignPreview, type ReassignResult, type RunDetail, type Screen } from "./api";
import { Initials, namesOf, PersonChoice, timeOf } from "./parts";

type Mode = null | "child" | "assign";

const REASON_WORDS: Record<string, string> = {
  spam: "Suspected spam",
  rule: "Held by a rule",
  source_mapping_mismatch: "Form answer doesn't fit",
  multiple_companies: "Several companies match",
  no_eligible_recipient: "Nobody available",
  no_default: "No default destination",
  source_disconnected: "Form disconnected from routing",
};

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export function RunDrawer({ session, ws, run, d, onClose, onOpen }: Pick<ViewProps, "session"> & { ws: string; run: string; d: Screen; onClose: () => void; onOpen: (run: string) => void }) {
  const names = useMemo(() => namesOf(d.people, d.teams).people, [d.people, d.teams]);
  const key = `routing_run:${ws}:${run}`;
  const q = useQuery(key, () => rt<{ run: RunDetail }>(session, ws, "rt_run", { run }), { staleMs: 5_000 });
  const r = q.data?.run;
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const who = (u: string | null | undefined) => (u ? (names[u] ?? "Former teammate") : "Nobody");
  const refresh = () => {
    q.reload();
    invalidate((k) => k.startsWith(`routing_activity:${ws}`) || k === `routing_screen:${ws}`);
  };
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (done) toast({ text: done });
      refresh();
    } catch (e) {
      setError(errText(e, "That didn't work."));
    } finally {
      setBusy(false);
    }
  };

  if (!r)
    return (
      <Sheet title="Run" onClose={onClose} width={620}>
        <div className="p-4">{q.error ? <ErrorNote message={q.error} /> : <Loading />}</div>
      </Sheet>
    );

  const a = assignmentBadge(r.assignment_state, r.effect, r.kind);
  const b = bookingBadge(r.booking_state, r.booking_reason);
  const sy = syncBadge(r.sync_state);
  const actions = recoveryActions(r, { me: d.me, role: d.role });
  const review = r.review;
  const reviewOpen = !!review && !["resolved", "dismissed"].includes(review.state);

  const dismiss = async () => {
    const reason = await askText("Dismiss this item?", { placeholder: "Reason", ok: "Dismiss" });
    if (!reason?.trim()) return;
    await act(() => rt(session, ws, "rt_review_act", { run: r.id, op: "dismiss", reason: reason.trim(), revision: review?.revision }), "Dismissed");
  };
  const approve = async () => {
    if (review?.state === "open") await act(() => rt(session, ws, "rt_review_act", { run: r.id, op: "approve", revision: review.revision }));
    setMode("child");
  };
  const run1 = (x: Recovery) => {
    switch (x) {
      case "approve":
      case "resume_child":
        return void approve();
      case "assign":
      case "reassign":
        return setMode("assign");
      case "dismiss":
        return void dismiss();
      case "reopen":
        return void act(() => rt(session, ws, "rt_review_act", { run: r.id, op: "reopen", revision: review?.revision }), "Reopened");
      case "reconnect":
        return void askToConnect({ name: who(r.owner) });
      case "reconcile":
        return void act(() => rt(session, ws, "rt_reconcile", { run: r.id }), "Checking the calendar");
      case "resume_booking":
        return void act(() => rt(session, ws, "rt_resume_booking", { run: r.id }), `${firstName(who(r.owner))}'s times are on their way to the lead`);
      case "retry_sync":
        return void act(() => rt(session, ws, "rt_sync_retry", { run: r.id }), "Sync started again");
    }
  };
  const LABEL: Record<Recovery, string> = {
    approve: "Approve and route",
    resume_child: "Resume",
    assign: "Assign manually",
    dismiss: "Dismiss",
    reopen: "Reopen",
    reassign: "Reassign",
    reconnect: `Ask ${firstName(who(r.owner))} to reconnect`,
    reconcile: "Check calendar",
    resume_booking: "Resume booking",
    retry_sync: "Retry sync",
  };
  // One primary action: the review's, else the first recovery; the rest stay quiet.
  const primary = actions.find((x) => x === "approve" || x === "resume_child" || x === "reopen") ?? actions.find((x) => x !== "reassign" && x !== "dismiss" && x !== "assign") ?? null;
  const ghosts = actions.filter((x) => x !== primary);

  const lines = timeline(r, who);

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
        mode ? null : (
          <>
            {ghosts.map((x) => (
              <Button key={x} variant="ghost" disabled={busy} onClick={() => run1(x)}>
                {LABEL[x]}
              </Button>
            ))}
            {primary ? (
              <Button disabled={busy} onClick={() => run1(primary)}>
                {LABEL[primary]}
              </Button>
            ) : (
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-col gap-3 p-4 text-[13px]">
        <ErrorNote message={error} />
        <div className="rounded-[10px] border border-line">
          {(
            [
              ["Source", r.source ?? (r.reason === "manual" ? "By hand" : "Other")],
              ["Policy", r.policy ? `${r.policy}${r.version ? ` v${r.version}` : ""}` : "None"],
              ["Previous owner", r.previous_owner ? who(r.previous_owner) : "None"],
              ...(r.current_owner && r.current_owner !== r.owner && r.kind === "owner" ? ([["Owner now", who(r.current_owner)]] as [string, string][]) : []),
            ] as [string, string][]
          ).map(([k, v]) => (
            <Line key={k} k={k}>
              <span className={v === "None" ? "text-muted" : ""}>{v}</span>
            </Line>
          ))}
          <Line k="Booking">
            <Badge tone={b.tone} dot>
              {b.label}
            </Badge>
          </Line>
          {r.meeting && (r.booking_state === "pending_confirmation" || r.booking_state === "failed") ? (
            <Line k="Reference">
              <span className="font-mono text-[12px] text-muted">{r.meeting.reference}</span>
            </Line>
          ) : null}
          {sy ? (
            <Line k="CRM sync">
              <Badge tone={sy.tone} dot>
                {sy.label}
              </Badge>
            </Line>
          ) : null}
          {review ? (
            <Line k="Review">
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-muted">{who(review.reviewer)}</span>
                <Badge tone={review.state === "resolved" ? "green" : review.state === "dismissed" ? "gray" : "amber"} dot>
                  {REVIEW_WORDS[review.state] ?? review.state}
                </Badge>
              </span>
            </Line>
          ) : null}
        </div>
        {mode === "child" && review ? <ChildPanel session={session} ws={ws} r={r} d={d} who={who} onDone={(res) => (setMode(null), refresh(), res.status === "resolved" && toast({ text: `Assigned to ${who(res.owner)}` }))} onCancel={() => (setMode(null), refresh())} /> : null}
        {mode === "assign" ? <AssignPanel session={session} ws={ws} r={r} d={d} who={who} review={reviewOpen} onDone={(owner) => (setMode(null), refresh(), toast({ text: `Assigned to ${who(owner)}` }))} onCancel={() => setMode(null)} /> : null}
        <ol className="ml-1.5 flex flex-col border-l-2 border-line pl-3.5">
          {lines.map((l, i) => (
            <li key={i} className="relative py-1.5 text-[12.5px] text-ink">
              <span aria-hidden="true" className={`absolute top-[9px] -left-[21px] size-2.5 rounded-full border-2 bg-card ${l.tone === "ok" ? "border-signal" : l.tone === "warn" ? "border-butter" : "border-line-strong"}`} />
              {l.open ? (
                <button type="button" onClick={() => onOpen(l.open!)} className="text-left text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                  {l.text}
                </button>
              ) : (
                l.text
              )}
              <span className="ml-1.5 text-muted">{l.at}</span>
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}

function Line({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
      <span className="flex-1 font-medium text-ink">{k}</span>
      {children}
    </div>
  );
}

/** The run's events in order, from what the database kept: the decision, the review item, the booking and the sync. */
function timeline(r: RunDetail, who: (u: string | null | undefined) => string) {
  const t = timeOf(r.at);
  const lines: { tone: "ok" | "warn" | ""; text: string; at: string; open?: string }[] = [];
  const held = r.trace?.checks?.result === "held" || r.kind === "held";
  const manual = (r.trace as unknown as { manual?: { reason: string; by: string } } | null)?.manual;
  const override = (r.trace as unknown as { override?: { reason: string; suggested: string | null; by: string } } | null)?.override;
  const child = (r.trace as unknown as { review?: { by: string; corrections: Record<string, unknown>; clearHold: boolean; original: boolean } } | null)?.review;
  lines.push({ tone: "ok", text: r.key.startsWith("handoff:") ? `Handoff started by ${who(r.by_user)}` : r.reason === "form" ? "Submission saved" : manual ? `Reassigned by ${who(manual.by)}` : child ? `Child attempt by ${who(child.by)}` : "Routing started", at: t });
  if (r.parent_run_id) lines.push({ tone: "", text: "Child attempt of an earlier run", at: t, open: r.parent_run_id });
  if (child && Object.keys(child.corrections ?? {}).length) lines.push({ tone: "", text: `Corrected ${Object.keys(child.corrections).length === 1 ? "one value" : `${Object.keys(child.corrections).length} values`}`, at: t });
  if (child?.clearHold) lines.push({ tone: "", text: "Hold cleared", at: t });
  if (held) lines.push({ tone: "warn", text: `Held: ${(r.review ? (REASON_WORDS[r.review.reason] ?? reasonWords(r)) : reasonWords(r)).toLowerCase()}`, at: t });
  if (r.kind === "unassigned") lines.push({ tone: "warn", text: r.review ? (REASON_WORDS[r.review.reason] ?? "No eligible recipient") : "No eligible recipient", at: t });
  if (r.review) lines.push({ tone: "", text: `Review item opened for ${who(r.review.reviewer)}`, at: timeOf(r.review.at) });
  const la = r.review?.latest_action;
  if (la?.action) {
    const at = la.at ? timeOf(la.at) : "";
    const by = who(la.by);
    const words: Record<string, string> = {
      approve: `Approved by ${by}`,
      start: `Child attempt running, started by ${by}`,
      back: "Child attempt stopped before it committed",
      dismiss: `Dismissed by ${by}${la.reason ? `: ${la.reason}` : ""}`,
      reopen: `Reopened by ${by}`,
      escalated: `Reviewer left; moved to ${who(la.to)}`,
      child: "Child attempt needs review too",
      resolved: `Resolved: assigned to ${who(la.owner)}`,
    };
    if (words[la.action]) lines.push({ tone: la.action === "resolved" ? "ok" : la.action === "dismiss" ? "" : "", text: words[la.action]!, at });
  }
  for (const c of r.children ?? []) lines.push({ tone: c.kind === "owner" ? "ok" : "warn", text: c.kind === "owner" ? `Child attempt assigned to ${who(c.owner)}${c.version ? ` · v${c.version}` : ""}` : "Child attempt held for review", at: timeOf(c.at), open: c.id });
  if (r.kind === "owner" && r.owner) lines.push({ tone: "ok", text: `${r.effect === "retained" ? "Kept with" : "Assigned to"} ${who(r.owner)}${manual ? `: ${manual.reason}` : ` · ${reasonWords(r)}`}`, at: t });
  if (override) lines.push({ tone: "", text: `Chosen by ${who(override.by)}: ${override.reason}${override.suggested ? ` (suggested ${who(override.suggested)})` : ""}`, at: t });
  if (r.booking_state === "confirmed") lines.push({ tone: "ok", text: `Meeting confirmed${r.meeting ? ` · ${new Date(r.meeting.start).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}`, at: t });
  else if (r.booking_state === "pending_confirmation")
    lines.push(r.booking_reason === "outcome_unknown" ? { tone: "warn", text: "Calendar didn't answer; the meeting may exist", at: r.meeting?.failed ? timeOf(r.meeting.failed.at) : t } : { tone: "", text: "Meeting waiting for the calendar to confirm", at: t });
  else if (r.booking_state === "unavailable") lines.push({ tone: "warn", text: r.booking_reason === "no_slots" ? "No free times to offer" : "Lead saved, but calendar availability couldn't be loaded", at: t });
  else if (r.booking_state === "failed") lines.push({ tone: "warn", text: r.booking_reason === "provider_error" ? "The calendar event couldn't be made" : "Meeting not confirmed", at: t });
  else if (r.booking_state === "awaiting_selection") lines.push({ tone: "", text: "Calendar shown, no time picked yet", at: t });
  else if (r.booking_state === "cancelled") lines.push({ tone: "", text: "Meeting cancelled; the owner stays", at: t });
  else if (r.kind === "owner") lines.push({ tone: "", text: "No meeting requested", at: t });
  for (const h of r.history ?? []) lines.push({ tone: "", text: h.kind === "lead.booking_abandoned" ? "Booking left unfinished" : "Booking resumed", at: timeOf(h.at) });
  for (const k of r.tasks ?? []) lines.push({ tone: "", text: `Follow-up task ${k.done ? "done" : "created"} for ${who(k.assignee)}`, at: timeOf(k.at) });
  if (r.sync_state === "failed") lines.push({ tone: "warn", text: `CRM sync failed${r.sync?.error ? `: ${r.sync.error}` : ""}`, at: t });
  else if (r.sync_state === "complete") lines.push({ tone: "ok", text: "CRM synced", at: t });
  return lines;
}

/** Approve and route (Section 18): the version, corrections, the preview, then one confirmed child attempt. */
function ChildPanel({ session, ws, r, d, who, onDone, onCancel }: Pick<ViewProps, "session"> & { ws: string; r: RunDetail; d: Screen; who: (u: string | null | undefined) => string; onDone: (res: Extract<ChildResult, { status: "resolved" | "review" }>) => void; onCancel: () => void }) {
  const op = useRef(newKey("child"));
  const held = r.kind === "held" && r.review?.reason !== "source_mapping_mismatch";
  const [clearHold, setClearHold] = useState(held && r.review?.reason === "spam");
  const [choice, setChoice] = useState<{ policy: string; version: number } | null>(null);
  const [fix, setFix] = useState<Record<string, string>>({});
  const [pv, setPv] = useState<ChildPreview | null>(null);
  const [stale, setStale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const corrections = () => Object.fromEntries(Object.entries(fix).filter(([, v]) => v !== undefined));
  const preview = async (o: { choice?: { policy: string; version: number } | null; clear?: boolean } = {}) => {
    setBusy(true);
    setError("");
    try {
      const c = o.choice !== undefined ? o.choice : choice;
      const p = await rt<ChildPreview>(session, ws, "rt_child_preview", { run: r.id, choice: c, corrections: corrections(), clearHold: o.clear ?? clearHold });
      setPv(p);
      setStale(false);
    } catch (e) {
      setError(errText(e, "Couldn't preview."));
    } finally {
      setBusy(false);
    }
  };
  // The first preview on opening, with the run's own values; later ones follow the person's changes.
  useEffect(() => {
    rt<ChildPreview>(session, ws, "rt_child_preview", { run: r.id, clearHold: held && r.review?.reason === "spam" })
      .then((p) => {
        setPv(p);
        setStale(false);
        setFix(Object.fromEntries(p.fields.map((f) => [f.key, f.value === null || f.value === undefined ? "" : String(f.value)])));
      })
      .catch((e) => setError(errText(e, "Couldn't preview.")));
  }, [session, ws, r.id, held, r.review?.reason]);
  const confirm = async () => {
    if (!pv?.ref) return;
    setBusy(true);
    setError("");
    try {
      const out = await rt<ChildResult>(session, ws, "rt_child_run", { run: r.id, op: op.current, choice: { policy: pv.ref.policy, version: pv.ref.version }, corrections: corrections(), clearHold, ref: pv.ref });
      if (out.status === "changed") {
        setPv(out.preview);
        setChanged(true);
        return;
      }
      onDone(out);
    } catch (e) {
      // No answer: it may have committed; the same attempt id resumes it.
      setError(e instanceof ApiError && e.lost ? "No answer yet. Confirm again to resume the same attempt." : errText(e, "Couldn't route."));
    } finally {
      setBusy(false);
    }
  };
  const chosen = pv?.chosen;
  const original = pv?.options.find((x) => x.original);
  const value = chosen ? `${chosen.policy}:${chosen.version}` : "";
  return (
    <section className="rounded-[10px] border border-line bg-card" aria-label="Child attempt">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="flex-1 font-medium text-ink">Version</span>
        <Choice<string>
          label="Version"
          value={value}
          align="right"
          placeholder="None published"
          disabled={busy}
          options={(pv?.options ?? []).map((x) => ({ value: `${x.policy}:${x.version}`, label: `${x.name} v${x.version}`, hint: x.original ? (x.valid ? "Original" : (x.why ?? "Can't be used")) : "Published now" }))}
          onChange={(v) => {
            const [policy, version] = v.split(":");
            const c = { policy: policy!, version: Number(version) };
            setChoice(c);
            void preview({ choice: c });
          }}
        />
      </div>
      {original && !original.valid ? <div className="border-t border-line px-4 py-2 text-[12px] text-muted">v{original.version} can&apos;t be used: {original.why}</div> : null}
      {held ? (
        <div className="flex items-center gap-3 border-t border-line px-4 py-2.5">
          <span className="flex-1 font-medium text-ink">Clear the hold</span>
          <Toggle
            label="Clear the hold"
            on={clearHold}
            onChange={(v) => {
              setClearHold(v);
              setStale(true);
            }}
          />
        </div>
      ) : null}
      {pv?.fields.length ? (
        <div className="grid grid-cols-1 gap-2.5 border-t border-line px-4 py-3 sm:grid-cols-2">
          {pv.fields.map((f) => {
            const def = fieldOf(f.key, d.fields);
            return (
              <label key={f.key} className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-muted">
                {def.label}
                <input
                  value={fix[f.key] ?? ""}
                  placeholder="Unknown"
                  onChange={(e) => {
                    setFix({ ...fix, [f.key]: e.target.value });
                    setStale(true);
                  }}
                  className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 font-normal text-ink outline-none placeholder:text-faint focus:border-ink"
                />
              </label>
            );
          })}
        </div>
      ) : null}
      <div className={`border-t border-line px-4 py-2.5 ${stale && pv ? "opacity-45" : ""}`} aria-live="polite">
        {!pv ? (
          <Loading />
        ) : pv.state === "assigned" && pv.recipient ? (
          <div className="flex flex-wrap items-center gap-2.5">
            <Initials name={who(pv.recipient)} />
            <b className="font-semibold text-ink">Suggested recipient: {who(pv.recipient)}</b>
            <Badge tone="amber" dot>
              Not assigned yet
            </Badge>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone="amber" dot>
              Needs review
            </Badge>
            <b className="font-semibold text-ink">No recipient with these values</b>
          </div>
        )}
      </div>
      {changed ? (
        <div role="alert" className="border-t border-line bg-butter-wash px-4 py-2.5 text-[12.5px] font-medium text-butter">
          Routing changed since your preview. Review the new recipient before confirming.
        </div>
      ) : null}
      {error ? (
        <div className="border-t border-line px-4 py-2.5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper px-4 py-2.5">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        {stale ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void preview()}>
            Preview
          </Button>
        ) : null}
        <Button size="sm" disabled={busy || stale || !pv?.ref || pv.state !== "assigned"} onClick={() => (setChanged(false), void confirm())}>
          Confirm and route
        </Button>
      </div>
    </section>
  );
}

/** Assign by hand (Section 18): owner now, the person, can they take it, a reason; one commit through the committer. */
function AssignPanel({ session, ws, r, d, who, review, onDone, onCancel }: Pick<ViewProps, "session"> & { ws: string; r: RunDetail; d: Screen; who: (u: string | null | undefined) => string; review: boolean; onDone: (owner: string) => void; onCancel: () => void }) {
  const op = useRef(newKey("ra"));
  const [user, setUser] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [pv, setPv] = useState<ReassignPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pick = async (u: string | null) => {
    setUser(u);
    setPv(null);
    setError("");
    if (!u) return;
    try {
      setPv(await rt<ReassignPreview>(session, ws, "rt_reassign_preview", { run: r.id, user: u }));
    } catch (e) {
      setError(errText(e, "Couldn't check."));
    }
  };
  const confirm = async () => {
    if (!user || !pv) return;
    setBusy(true);
    setError("");
    try {
      const out = await rt<ReassignResult>(session, ws, "rt_reassign", { run: r.id, user, reason: reason.trim(), op: op.current, expectOwner: pv.contact.owner });
      if (out.status === "changed") {
        setError(`The owner changed to ${who(out.owner)} since you opened this. Look again.`);
        void pick(user);
        return;
      }
      onDone(out.owner);
    } catch (e) {
      setError(e instanceof ApiError && e.lost ? "No answer yet. Confirm again to finish the same change." : errText(e, "Couldn't reassign."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-[10px] border border-line bg-card" aria-label={review ? "Assign manually" : "Reassign"}>
      <Line k="Owner now">
        <span className={pv?.contact.owner || r.current_owner ? "" : "text-muted"}>{who(pv?.contact.owner ?? r.current_owner)}</span>
      </Line>
      <Line k="New owner">
        <PersonChoice label="New owner" value={user} people={d.people} align="right" onChange={(u) => void pick(u)} />
      </Line>
      {pv ? (
        <Line k="Can take it">
          {pv.eligible ? (
            <Badge tone="green" dot>
              Yes{pv.cap ? ` · ${pv.today} of ${pv.cap} today` : ""}
            </Badge>
          ) : (
            <span className="text-right text-rose">{pv.why}</span>
          )}
        </Line>
      ) : null}
      {pv && pv.meetings ? (
        <Line k="Meetings">
          <span className="text-muted">{pv.meetings === 1 ? "1 upcoming meeting keeps its host" : `${pv.meetings} upcoming meetings keep their hosts`}</span>
        </Line>
      ) : null}
      <div className="border-t border-line px-4 py-2.5">
        <input aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} className="h-[30px] w-full rounded-sm border border-line-strong bg-card px-2.5 text-ink outline-none placeholder:text-faint focus:border-ink" />
      </div>
      {error ? (
        <div className="border-t border-line px-4 py-2.5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="flex justify-end gap-2 border-t border-line bg-paper px-4 py-2.5">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Back
        </Button>
        <Button size="sm" disabled={busy || !pv?.eligible || !reason.trim() || user === pv?.contact.owner} onClick={() => void confirm()}>
          {review ? "Assign" : "Reassign"}
        </Button>
      </div>
    </section>
  );
}
