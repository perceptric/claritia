"use client";

// Forms › Settings › After submit: the form's Routing connection (docs/routing-workflow.md Sections 8 and 24). It is
// the same canonical row Routing's "Where leads come from" edits, read and staged through the same calls (rt_form_source,
// rt_stage), never a copy kept in the form. A connection made for a new form and never edited follows the form's own
// "Book a meeting" choice each time the form is published; any change here or in Routing makes it explicit and goes
// live with that policy's next publish. Disconnecting leaves a safe outcome: new leads go to Needs review.

import { useCallback, useEffect, useState } from "react";
import { effectiveSource, type SourceRow } from "@/lib/routing/screenModel";
import { askConfirm } from "../Dialogs";
import { Badge, ErrorNote, type ViewProps } from "../ui";
import { rt } from "../routing/rt/api";
import { Ic } from "./ic";
import { typeLabel } from "./routes";
import { CARD, CROW, CSTACK, Dd, GHOST_SM, GHOST_SM_RED, RowText, Seg, type DdItem } from "./parts";

const Label = ({ children }: { children: React.ReactNode }) => <span className="text-[12px] font-medium text-muted">{children}</span>;

type Conn = {
  source: (SourceRow & { auto?: boolean }) | null;
  policies: { id: string; name: string; active_version: number | null; is_default: boolean }[];
  meetingTypes: { id: string; name: string; minutes: number | null }[];
  role: "owner" | "member";
};

export function useConnection(session: ViewProps["session"], ws: string, form: string) {
  const [c, setC] = useState<Conn | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    rt<Conn>(session, ws, "rt_form_source", { form })
      .then((x) => (setC(x), setError("")))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't read the connection."));
  }, [session, ws, form]);
  useEffect(load, [load]);
  return { c, error, load };
}

export function RoutingConnection({ session, ws, navigate, form, conn, onOpenRouting }: Pick<ViewProps, "session" | "navigate"> & { ws: string; form: string; conn: ReturnType<typeof useConnection>; onOpenRouting: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const c = conn.c;
  if (!c) return conn.error ? <ErrorNote message={conn.error} /> : null;
  const s = c.source;
  if (!s) return null;
  const policyId = (s.draft?.policy_id as string | undefined) ?? s.policy_id;
  const eff = policyId ? effectiveSource(s, policyId) : null;
  const policy = c.policies.find((p) => p.id === policyId);
  const ro = c.role !== "owner" || busy;
  const pending = !!s.draft;
  const off = eff ? !eff.enabled : !s.enabled;
  const stage = async (p: { policy?: string; enabled?: boolean; outcome?: "assign_only" | "assign_and_calendar"; meeting?: string | null }) => {
    const pol = p.policy ?? policyId;
    if (!pol) return;
    setBusy(true);
    setError("");
    try {
      const outcome = p.outcome ?? eff?.outcome ?? s.outcome;
      const meeting = p.meeting !== undefined ? p.meeting : (eff?.meetingTypeId ?? s.meeting_type_id);
      await rt(session, ws, "rt_stage", {
        policy: pol,
        source: { kind: "form", form },
        enabled: p.enabled ?? !off,
        outcome,
        meeting: outcome === "assign_and_calendar" ? (meeting ?? c.meetingTypes[0]?.id ?? null) : meeting,
        ...((p.enabled ?? !off) ? {} : { whenOff: "review" }),
        revision: s.draft_revision,
      });
      conn.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the change.");
    } finally {
      setBusy(false);
    }
  };
  const meeting = c.meetingTypes.find((m) => m.id === (eff?.meetingTypeId ?? s.meeting_type_id));
  const policyItems: DdItem[] = c.policies.map((p) => ({ kind: "option", key: p.id, label: p.name, on: p.id === policyId, why: p.active_version ? null : "Not published", onPick: () => (p.id === policyId ? undefined : void stage({ policy: p.id })) }));
  const state = off ? (
    <Badge tone="amber" dot>
      Disconnected
    </Badge>
  ) : pending ? (
    <Badge tone="amber" dot>
      Waiting to publish
    </Badge>
  ) : (
    <Badge tone="green" dot>
      Live
    </Badge>
  );
  return (
    <div className={CARD}>
      <div className={CROW}>
        <RowText title="Routing" sub={off ? "New leads go to Needs review" : s.auto ? "Follows this form" : undefined} />
        {state}
      </div>
      <div className={CSTACK}>
        <Label>Policy</Label>
        {ro ? <span className="text-ink">{policy?.name ?? "None"}</span> : <Dd ariaLabel="Routing policy" label={policy?.name ?? "Choose a policy"} items={policyItems} />}
      </div>
      {!s.auto && !off ? (
        <div className={CROW}>
          <RowText title="After routing" />
          {ro ? (
            <span className="text-ink">{(eff?.outcome ?? s.outcome) === "assign_and_calendar" ? "Show the owner's calendar" : "Assign only"}</span>
          ) : (
            <Seg
              label="After routing"
              value={(eff?.outcome ?? s.outcome) === "assign_and_calendar" ? "cal" : "only"}
              onChange={(v) => void stage({ outcome: v === "cal" ? "assign_and_calendar" : "assign_only" })}
              options={[
                { value: "only", label: "Assign only" },
                { value: "cal", label: "Show calendar", disabled: !c.meetingTypes.length },
              ]}
            />
          )}
        </div>
      ) : null}
      {!s.auto && !off && (eff?.outcome ?? s.outcome) === "assign_and_calendar" ? (
        <div className={CSTACK}>
          <Label>Meeting</Label>
          {ro ? (
            <span className="text-ink">{meeting ? typeLabel({ name: meeting.name, settings: { lengths: meeting.minutes ? [meeting.minutes] : [] } }) : "None"}</span>
          ) : (
            <Dd
              ariaLabel="Meeting"
              label={meeting ? typeLabel({ name: meeting.name, settings: { lengths: meeting.minutes ? [meeting.minutes] : [] } }) : "Pick a meeting type"}
              items={c.meetingTypes.map((m) => ({ kind: "option", key: m.id, label: typeLabel({ name: m.name, settings: { lengths: m.minutes ? [m.minutes] : [] } }), on: m.id === meeting?.id, onPick: () => void stage({ meeting: m.id }) }))}
            />
          )}
        </div>
      ) : null}
      <div className={`${CROW} flex-wrap gap-[6px]`}>
        <button type="button" className={GHOST_SM} onClick={pending && policyId ? () => navigate("routing", `policies/${policyId}`) : onOpenRouting}>
          <Ic n="branch" s={12} />
          {pending ? "Publish in Routing" : "Edit in Routing"}
        </button>
        {c.role === "owner" && policyId ? (
          off ? (
            <button type="button" className={GHOST_SM} disabled={busy} onClick={() => void stage({ enabled: true })}>
              Connect
            </button>
          ) : (
            <button
              type="button"
              className={GHOST_SM_RED}
              disabled={busy}
              onClick={async () => {
                if (await askConfirm("Disconnect this form from Routing?", { body: "New leads from this form go to Needs review.", ok: "Disconnect", danger: true })) void stage({ enabled: false });
              }}
            >
              Disconnect
            </button>
          )
        ) : null}
      </div>
      {error ? (
        <div className={CSTACK}>
          <ErrorNote message={error} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * When the form's own "Book a meeting" choice changes, an explicit connection is staged to match (calendar or assign
 * only), so the two never disagree. An automatic connection already follows the form at its publish.
 */
export async function matchOutcome(session: ViewProps["session"], ws: string, form: string, conn: ReturnType<typeof useConnection>, kind: "msg" | "url" | "book", meetingTypeId: string | undefined) {
  const c = conn.c;
  const s = c?.source;
  if (!c || !s || s.auto || c.role !== "owner") return;
  const policyId = (s.draft?.policy_id as string | undefined) ?? s.policy_id;
  if (!policyId) return;
  const eff = effectiveSource(s, policyId);
  if (!eff.enabled) return;
  const want = kind === "book" ? "assign_and_calendar" : "assign_only";
  if (eff.outcome === want) return;
  const meeting = eff.meetingTypeId ?? meetingTypeId ?? c.meetingTypes[0]?.id ?? null;
  if (want === "assign_and_calendar" && !meeting) return;
  await rt(session, ws, "rt_stage", { policy: policyId, source: { kind: "form", form }, enabled: true, outcome: want, meeting, revision: s.draft_revision }).catch(() => null);
  conn.load();
}
