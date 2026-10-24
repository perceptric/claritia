"use client";

// Replay (docs/router-ux.md 4.4): the draft on past leads, with each lead's own facts, compared with what really
// happened. Changes are grouped (from → to); each group opens its leads, and each lead its Before and After side by
// side with the lines that differ marked. "Publish draft" goes on to the publish dialog with the summary attached.

import type { Session } from "@supabase/supabase-js";
import { useState } from "react";
import type { RouterBody } from "@/lib/router/types";
import { ArrowLeft, ChevronRight } from "../../Icons";
import { Modal } from "../meetings/parts";
import { Select } from "../Select";
import { Button, errorText } from "../ui";
import { routingApi, type ReplayOut } from "./api";
import { differing, RunLines } from "./Lines";
import { CountUp } from "./parts";

export type ReplaySummary = { days: number; total: number; changed: number };

type Group = ReplayOut["groups"][number];
type Lead = Group["runs"][number];

export function ReplayPanel({
  session,
  ws,
  body,
  last,
  canPublish,
  onDone,
  onPublish,
  onClose,
}: {
  session: Session;
  ws: string;
  body: RouterBody;
  /** The last replay in this session, shown again when the panel reopens. */
  last: ReplayOut | null;
  canPublish: boolean;
  onDone: (r: ReplayOut) => void;
  onPublish: () => void;
  onClose: () => void;
}) {
  const [days, setDays] = useState(last?.days ?? 30);
  const [out, setOut] = useState<ReplayOut | null>(last);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);

  const run = async () => {
    setBusy(true);
    setError("");
    setLead(null);
    setOpen(null);
    try {
      const r = await routingApi<ReplayOut>(session, ws, "replay", { days, draft: body });
      setOut(r);
      onDone(r);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Replay draft"
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Close
          </Button>
          {canPublish ? (
            <Button onClick={onPublish} disabled={busy}>
              Publish draft
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="w-40">
            <Select<number>
              value={days}
              options={[
                { value: 7, label: "Last 7 days" },
                { value: 30, label: "Last 30 days" },
                { value: 90, label: "Last 90 days" },
              ]}
              onChange={setDays}
              ariaLabel="Range"
              className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] text-ink hover:border-ink/40"
            />
          </span>
          <Button variant="ghost" onClick={() => void run()} disabled={busy}>
            {out ? "Run again" : "Run"}
          </Button>
        </div>

        {busy ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-deep" role="progressbar" aria-label="Replaying">
            <div className="anim-shimmer h-full w-full rounded-full bg-ink/40" />
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="flex items-center gap-3 rounded-lg bg-rose-wash px-3.5 py-2.5 text-[13px] text-rose">
            <span className="flex-1">Replay stopped. {error}</span>
            <button type="button" onClick={() => void run()} className="font-medium underline underline-offset-2">
              Resume
            </button>
          </div>
        ) : null}

        {out && !busy ? (
          out.total === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-muted">No leads in this range.</p>
          ) : lead ? (
            <LeadCompare lead={lead} onBack={() => setLead(null)} />
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5" aria-live="polite">
                <Num label="Leads" value={out.total} />
                <Num label="Same" value={out.same} />
                <Num label="Change" value={out.changed} />
                <Num label="Now held" value={out.held} />
                <Num label="Unassigned" value={out.unassigned} />
              </dl>
              {out.groups.length ? (
                <div className="flex flex-col">
                  <div className="flex h-8 items-center border-b border-line text-[12px] text-muted">
                    <span className="flex-1">Change</span>
                    <span>Leads</span>
                  </div>
                  <ul>
                    {out.groups.map((g) => {
                      const k = `${g.from}>${g.to}`;
                      const on = open === k;
                      return (
                        <li key={k} className="border-b border-line">
                          <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : k)} className="flex h-11 w-full items-center gap-2 text-left text-[13.5px] hover:bg-hover">
                            <ChevronRight size={13} className={`shrink-0 text-faint transition-transform duration-[140ms] ${on ? "rotate-90" : ""}`} />
                            <span className="flex-1 truncate text-ink">
                              {g.fromName} <span className="text-faint">→</span> {g.toName}
                            </span>
                            <span className="text-muted tabular-nums">{g.count}</span>
                          </button>
                          {on ? (
                            <ul className="anim-rise-sm flex flex-col pb-2 pl-6">
                              {g.runs.map((r) => (
                                <li key={r.run}>
                                  <button type="button" onClick={() => setLead(r)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-[13px] text-body hover:bg-hover hover:text-ink">
                                    <span className="flex-1 truncate">{r.name}</span>
                                    <ChevronRight size={12} className="text-faint" />
                                  </button>
                                </li>
                              ))}
                              {g.count > g.runs.length ? <li className="px-2 py-1 text-[12px] text-faint">{g.count - g.runs.length} more</li> : null}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-[13.5px] text-muted">No changes</p>
              )}
            </>
          )
        ) : null}
      </div>
    </Modal>
  );
}

function Num({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <dd className="text-[24px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
        <CountUp value={value} />
      </dd>
      <dt className="text-[12px] text-muted">{label}</dt>
    </div>
  );
}

function LeadCompare({ lead, onBack }: { lead: Lead; onBack: () => void }) {
  const diff = differing(lead.before, lead.after);
  return (
    <div className="anim-rise-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="press inline-flex h-7 items-center gap-1 rounded-full pr-2.5 pl-1.5 text-[12.5px] font-medium text-body hover:bg-hover hover:text-ink">
          <ArrowLeft size={13} />
          Changes
        </button>
        <span className="truncate text-[13.5px] font-medium text-ink">{lead.name}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">Before</span>
          <RunLines lines={lead.before} differs={diff} />
        </section>
        <section className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">After</span>
          <RunLines lines={lead.after} differs={diff} />
        </section>
      </div>
    </div>
  );
}
