"use client";

// The side panel (docs/enrich-workflows-reports.md 2.4): the trigger with who can enter and the goals, or the picked
// step's settings. Labels and controls only; the card's own line says what the step does.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { docFromBody, newBlock, newSection } from "@/lib/design/email/doc";
import { EmailBuilder } from "../email/EmailBuilder";
import { useState } from "react";
import { BASE_FIELDS, needsValue, opsFor } from "@/lib/router/conditions";
import { OPS, type Cond } from "@/lib/router/types";
import { stepProblems } from "@/lib/workflows/check";
import { MERGE_KEYS } from "@/lib/workflows/engine";
import { STEP_KINDS, TRIGGERS, UPDATABLE, type Body, type EmailBody, type Goal, type Step, type Trigger, type TriggerKind } from "@/lib/workflows/types";
import { Copy, Plus, Trash } from "../../Icons";
import { AiMark } from "../Ai";
import { askLines } from "../Dialogs";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, errorText, IconButton, Input, postJson, Segmented, Toggle } from "../ui";
import type { Names } from "./model";

const label = "text-[12px] font-medium text-muted";
const area = "min-h-24 w-full rounded-sm border border-line-strong bg-card px-3 py-2 text-[13.5px] leading-relaxed text-ink outline-none focus:border-ink";

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{name}</span>
      {children}
    </label>
  );
}

/** A set of pill toggles; none picked means any. */
function Pills({ options, value, onChange, disabled }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={`press inline-flex h-7 items-center rounded-full border px-2.5 text-[12px] font-medium transition-colors duration-[140ms] disabled:opacity-60 ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-body hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Trigger ----------------------------------------------------------------------------------------------------------

const LIFECYCLES = ["subscriber", "lead", "mql", "sql", "opportunity", "customer", "evangelist"].map((v) => ({ value: v, label: v.length <= 3 ? v.toUpperCase() : v[0]!.toUpperCase() + v.slice(1) }));
const FIELD_KEYS = [...UPDATABLE].map((k) => ({ value: k, label: k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }));

function blankTrigger(kind: TriggerKind): Trigger {
  switch (kind) {
    case "form":
    case "not_booked":
      return { kind, forms: [] };
    case "meeting":
      return { kind, events: ["booked"], types: [] };
    case "outcome":
      return { kind, outcomes: [] };
    case "band":
      return { kind, bands: ["hot"] };
    case "routed":
      return { kind, result: "routed" };
    case "segment":
      return { kind, segment: "", on: "entered" };
    case "field":
      return { kind, key: "lifecycle" };
    case "clicked":
      return { kind, emails: [] };
    case "date":
      return { kind, field: "", days: 0, time: "09:00" };
    case "broadcast":
      return { kind, segment: "", at: "" };
    default:
      return { kind: "manual" };
  }
}

/** A local datetime-local value from an ISO time, and back. */
const toLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function TriggerPanel({ body, names, onChange, readOnly }: { body: Body; names: Names; onChange: (b: Body, key?: string) => void; readOnly: boolean }) {
  const t = body.trigger;
  const set = (patch: Partial<Trigger>) => onChange({ ...body, trigger: { ...t, ...patch } as Trigger });
  const goal = (kind: Goal["kind"]) => body.goals.find((g) => g.kind === kind);
  const setGoal = (kind: Goal["kind"], g: Goal | null) => onChange({ ...body, goals: [...body.goals.filter((x) => x.kind !== kind), ...(g ? [g] : [])] });
  return (
    <div className="flex flex-col gap-5">
      <Row name="Starts">
        <Select value={t.kind} options={TRIGGERS.map((x) => ({ value: x.kind, label: x.label }))} onChange={(k) => onChange({ ...body, trigger: blankTrigger(k) })} ariaLabel="Starts" className="h-9 w-full" disabled={readOnly} />
      </Row>
      {t.kind === "form" || t.kind === "not_booked" ? (
        <Row name="Forms">
          <Pills options={names.forms.map((f) => ({ value: f.id, label: f.name }))} value={t.forms} onChange={(forms) => set({ forms })} disabled={readOnly} />
        </Row>
      ) : null}
      {t.kind === "meeting" ? (
        <>
          <Row name="When it's">
            <Pills
              options={[
                { value: "booked", label: "Booked" },
                { value: "canceled", label: "Canceled" },
                { value: "held", label: "Held" },
                { value: "no_show", label: "No-show" },
              ]}
              value={t.events}
              onChange={(events) => set({ events: events as typeof t.events })}
              disabled={readOnly}
            />
          </Row>
          <Row name="Meeting types">
            <Pills options={names.types.map((x) => ({ value: x.id, label: x.name }))} value={t.types} onChange={(types) => set({ types })} disabled={readOnly} />
          </Row>
        </>
      ) : null}
      {t.kind === "outcome" ? (
        <Row name="Outcomes">
          <Pills options={names.outcomes.map((o) => ({ value: o, label: o }))} value={t.outcomes} onChange={(outcomes) => set({ outcomes })} disabled={readOnly} />
        </Row>
      ) : null}
      {t.kind === "band" ? (
        <Row name="Turns">
          <Pills options={["hot", "warm", "cold"].map((b) => ({ value: b, label: b[0]!.toUpperCase() + b.slice(1) }))} value={t.bands} onChange={(bands) => set({ bands })} disabled={readOnly} />
        </Row>
      ) : null}
      {t.kind === "routed" ? (
        <Row name="When">
          <Segmented value={t.result} options={[{ value: "routed", label: "Gets a rep" }, { value: "unassigned", label: "No rep found" }, { value: "any", label: "Either" }]} onChange={(result) => set({ result })} />
        </Row>
      ) : null}
      {t.kind === "segment" || t.kind === "broadcast" ? (
        <Row name="Segment">
          <Select value={t.segment} options={names.segments.map((s) => ({ value: s.id, label: s.name }))} onChange={(segment) => set({ segment })} ariaLabel="Segment" className="h-9 w-full" placeholder="Pick a segment" disabled={readOnly} />
        </Row>
      ) : null}
      {t.kind === "segment" ? <Segmented value={t.on} options={[{ value: "entered", label: "Joins" }, { value: "left", label: "Leaves" }]} onChange={(on) => set({ on })} /> : null}
      {t.kind === "broadcast" ? (
        <Row name="Goes">
          <Input type="datetime-local" value={toLocal(t.at)} onChange={(e) => set({ at: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="h-9" disabled={readOnly} />
        </Row>
      ) : null}
      {t.kind === "field" ? (
        <>
          <Row name="Field">
            <Select value={t.key} options={FIELD_KEYS} onChange={(key) => set({ key })} ariaLabel="Field" className="h-9 w-full" disabled={readOnly} />
          </Row>
          <Row name="Changes to">
            {t.key === "lifecycle" ? (
              <Select value={t.to ?? ""} options={[{ value: "", label: "Anything" }, ...LIFECYCLES]} onChange={(to) => set({ to: to || undefined })} ariaLabel="Changes to" className="h-9 w-full" disabled={readOnly} />
            ) : (
              <Input value={t.to ?? ""} onChange={(e) => set({ to: e.target.value || undefined })} placeholder="Anything" className="h-9" disabled={readOnly} />
            )}
          </Row>
        </>
      ) : null}
      {t.kind === "date" ? (
        <>
          <Row name="Date field">
            <Select value={t.field} options={names.dateFields.map((d) => ({ value: d.key, label: d.label }))} onChange={(field) => set({ field })} ariaLabel="Date field" className="h-9 w-full" placeholder="Pick a date field" disabled={readOnly} />
          </Row>
          <div className="grid grid-cols-2 gap-3">
            <Row name="Days from it">
              <Input type="number" value={t.days} onChange={(e) => set({ days: Math.round(Number(e.target.value) || 0) })} className="h-9" disabled={readOnly} />
            </Row>
            <Row name="At">
              <Input type="time" value={t.time} onChange={(e) => set({ time: e.target.value || "09:00" })} className="h-9" disabled={readOnly} />
            </Row>
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <span className={label}>Who can go through</span>
        <Segmented
          value={body.entry.mode}
          options={[
            { value: "once", label: "Once" },
            { value: "repeat", label: "Again later" },
          ]}
          onChange={(mode) => onChange({ ...body, entry: { ...body.entry, mode } })}
        />
        {body.entry.mode === "repeat" ? (
          <Row name="Days between">
            <Input type="number" min={1} value={body.entry.gapDays} onChange={(e) => onChange({ ...body, entry: { ...body.entry, gapDays: Math.max(1, Math.round(Number(e.target.value) || 1)) } }, "gap")} className="h-9 w-28" disabled={readOnly} />
          </Row>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <span className={label}>Ends early when</span>
        <div className="flex items-center justify-between gap-3 text-[13px] text-ink">
          They book a meeting
          <Toggle label="Ends when they book a meeting" on={!!goal("meeting_booked")} onChange={(v) => setGoal("meeting_booked", v ? { kind: "meeting_booked" } : null)} disabled={readOnly} />
        </div>
        <Row name="Their stage is">
          <Pills
            options={LIFECYCLES}
            value={(goal("lifecycle") as Extract<Goal, { kind: "lifecycle" }> | undefined)?.stages ?? []}
            onChange={(stages) => setGoal("lifecycle", stages.length ? { kind: "lifecycle", stages } : null)}
            disabled={readOnly}
          />
        </Row>
        {names.outcomes.length ? (
          <Row name="Qualify says">
            <Pills
              options={names.outcomes.map((o) => ({ value: o, label: o }))}
              value={(goal("outcome") as Extract<Goal, { kind: "outcome" }> | undefined)?.outcomes ?? []}
              onChange={(outcomes) => setGoal("outcome", outcomes.length ? { kind: "outcome", outcomes } : null)}
              disabled={readOnly}
            />
          </Row>
        ) : null}
      </div>
    </div>
  );
}

// Conditions -------------------------------------------------------------------------------------------------------

const FIELDS = BASE_FIELDS.filter((f) => f.key !== "lead.form" && f.key !== "company.type");

export function Conditions({ conds, onChange, readOnly }: { conds: Cond[]; onChange: (c: Cond[]) => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {conds.map((c, i) => {
        const def = FIELDS.find((f) => f.key === c.field) ?? FIELDS[0]!;
        const ops = opsFor(def.type).map((o) => ({ value: o, label: OPS.find((x) => x.value === o)?.label ?? o }));
        const set = (patch: Partial<Cond>) => onChange(conds.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        const list = c.op === "one_of" || c.op === "not_one_of";
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
            <div className="flex items-center gap-1.5">
              <Select value={def.key} options={FIELDS.map((f) => ({ value: f.key, label: f.label }))} onChange={(field) => set({ field, op: opsFor(FIELDS.find((f) => f.key === field)!.type)[0]!, value: "" })} ariaLabel="Field" className="h-8 flex-1" disabled={readOnly} />
              {!readOnly ? (
                <IconButton label="Remove" onClick={() => onChange(conds.filter((_, j) => j !== i))}>
                  <Trash size={13} />
                </IconButton>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <Select value={c.op} options={ops} onChange={(op) => set({ op })} ariaLabel="Test" className="h-8 w-36" disabled={readOnly} />
              {needsValue(c.op) ? (
                def.options && list ? (
                  <Pills options={def.options.map((o) => ({ value: o, label: o }))} value={Array.isArray(c.value) ? c.value.map(String) : []} onChange={(value) => set({ value })} disabled={readOnly} />
                ) : (
                  <Input
                    aria-label="Value"
                    value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}
                    onChange={(e) => set({ value: list ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : e.target.value })}
                    className="h-8 flex-1"
                    disabled={readOnly}
                  />
                )
              ) : null}
            </div>
          </div>
        );
      })}
      {!readOnly ? (
        <button type="button" onClick={() => onChange([...conds, { field: "contact.title", op: "contains", value: "" }])} className="press inline-flex h-8 w-fit items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:text-ink">
          <Plus size={13} /> Condition
        </button>
      ) : null}
    </div>
  );
}

// Email --------------------------------------------------------------------------------------------------------------

/** Where the email builder opens from: who is signed in and the workspace. */
export type BuilderCtx = { session: Session; sb: SupabaseClient; ws: string };

export function EmailForm({ email, onChange, readOnly, builder }: { email: EmailBody; onChange: (e: EmailBody, key?: string) => void; readOnly: boolean; builder?: BuilderCtx }) {
  const [open, setOpen] = useState(false);
  const subject = (
    <Row name="Subject">
      <Input value={email.subject} onChange={(e) => onChange({ ...email, subject: e.target.value }, "subject")} className="h-9" disabled={readOnly} />
    </Row>
  );
  const built = open && builder && email.doc ? (
    <EmailBuilder session={builder.session} sb={builder.sb} workspaceId={builder.ws} subject={email.subject} doc={email.doc} onChange={(doc) => onChange({ ...email, doc }, "doc")} onClose={() => setOpen(false)} />
  ) : null;
  // Built with blocks: the subject here, the rest in the builder.
  if (email.doc)
    return (
      <div className="flex flex-col gap-4">
        {subject}
        <div className="flex items-center gap-2">
          <Button disabled={readOnly || !builder} onClick={() => setOpen(true)}>
            Open the builder
          </Button>
          <span className="text-[12.5px] text-muted">{email.doc.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0)} blocks</span>
        </div>
        {built}
      </div>
    );
  return (
    <div className="flex flex-col gap-4">
      {subject}
      <Row name="Preview text">
        <Input value={email.preheader} onChange={(e) => onChange({ ...email, preheader: e.target.value }, "preheader")} className="h-9" disabled={readOnly} />
      </Row>
      <Row name="Email">
        <textarea
          value={email.paragraphs.join("\n\n")}
          onChange={(e) => onChange({ ...email, paragraphs: e.target.value.split(/\n{2,}/) }, "body")}
          className={`${area} min-h-48`}
          disabled={readOnly}
        />
      </Row>
      <div className="flex flex-wrap gap-1.5">
        {MERGE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={readOnly}
            onClick={() => {
              const last = email.paragraphs.length - 1;
              onChange({ ...email, paragraphs: email.paragraphs.map((p, i) => (i === last ? `${p}{{${k}|}}` : p)) }, "body");
            }}
            className="press inline-flex h-7 items-center rounded-full border border-line-strong bg-card px-2.5 font-mono text-[11.5px] text-body hover:text-ink disabled:opacity-60"
          >
            {`{{${k}}}`}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Row name="Button">
          <Input value={email.cta_label} onChange={(e) => onChange({ ...email, cta_label: e.target.value }, "cta")} className="h-9" disabled={readOnly} />
        </Row>
        <Row name="Button link">
          <Input value={email.cta_url} onChange={(e) => onChange({ ...email, cta_url: e.target.value }, "url")} placeholder="https://" className="h-9" disabled={readOnly} />
        </Row>
      </div>
      {builder && !readOnly ? (
        <Button
          variant="ghost"
          className="self-start"
          onClick={() => {
            // The words so far become blocks, with the footer marketing email needs.
            const doc = docFromBody(email);
            doc.sections.push(newSection([newBlock("footer")]));
            onChange({ ...email, doc });
            setOpen(true);
          }}
        >
          Design with blocks
        </Button>
      ) : null}
    </div>
  );
}

// Steps --------------------------------------------------------------------------------------------------------------

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => ({ value: String(i), label: d }));
const EVENTS = [
  { value: "meeting.booked", label: "They book a meeting" },
  { value: "email.clicked", label: "They click an email" },
  { value: "form.submitted", label: "They send a form" },
  { value: "lead.outcome", label: "Qualify decides" },
  { value: "segment.entered", label: "They join a segment" },
];

export function StepPanel(p: {
  step: Step;
  names: Names;
  onPatch: (patch: Partial<Step>, key?: string) => void;
  readOnly: boolean;
  session: Session;
  ws: string;
  /** For the email builder. */
  sb?: SupabaseClient;
  workflowId: string | null;
  onRemove: () => void;
}) {
  const s = p.step;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const probs = stepProblems(s);
  const people = [{ value: "owner", label: "Their rep" }, ...p.names.members.map((m) => ({ value: m.id, label: m.name || m.email }))];

  const draft = async () => {
    if (s.kind !== "email") return;
    const brief = await askLines("What should this email say?", { placeholder: "Who it's for, what you offer, and what's true about it", ok: "Write it" });
    if (!brief) return;
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ steps: { subject: string; preheader: string; paragraphs: string[]; cta_label: string; cta_url: string; review_notes: string[] }[] }>(p.session, "/api/workflows/draft", { workspaceId: p.ws, brief, count: 1 });
      const d = r.steps[0];
      if (d) p.onPatch({ email: { subject: d.subject, preheader: d.preheader, paragraphs: d.paragraphs, cta_label: d.cta_label, cta_url: d.cta_url }, ai: true, notes: d.review_notes, approved: false } as Partial<Step>);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const secret = async () => {
    if (!p.workflowId) return;
    try {
      const r = await postJson<{ secret: string }>(p.session, "/api/workflows/secret", { workflowId: p.workflowId });
      await navigator.clipboard.writeText(r.secret);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{STEP_KINDS.find((k) => k.kind === s.kind)?.label}</span>
        {s.kind === "email" && s.ai ? <AiMark size={14} /> : null}
        {!p.readOnly ? (
          <IconButton label="Delete" onClick={p.onRemove} className="ml-auto">
            <Trash size={13} />
          </IconButton>
        ) : null}
      </div>
      {probs.length ? (
        <ul className="flex flex-col gap-1">
          {probs.map((x) => (
            <li key={x} className="text-[12.5px] text-butter">
              {x}
            </li>
          ))}
        </ul>
      ) : null}

      {s.kind === "email" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={s.from} options={[{ value: "team", label: "From the team" }, { value: "owner", label: "From their rep" }]} onChange={(from) => p.onPatch({ from } as Partial<Step>)} />
            {!p.readOnly ? (
              <Button variant="ghost" onClick={() => void draft()} disabled={busy}>
                <AiMark size={13} /> Write with AI
              </Button>
            ) : null}
          </div>
          {p.names.templates.length && !p.readOnly ? (
            <Select
              value=""
              options={p.names.templates.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(id) => {
                const t = p.names.templates.find((x) => x.id === id);
                if (t) p.onPatch({ email: t.body as EmailBody, approved: false } as Partial<Step>);
              }}
              ariaLabel="Use a template"
              placeholder="Use a template"
              plainPlaceholder
              className="h-9 w-full"
            />
          ) : null}
          <EmailForm email={s.email} onChange={(email, key) => p.onPatch({ email } as Partial<Step>, key)} readOnly={p.readOnly} builder={p.sb ? { session: p.session, sb: p.sb, ws: p.ws } : undefined} />
          {s.notes?.length ? (
            <div className="flex flex-col gap-1 rounded-lg bg-butter-wash px-3 py-2.5">
              <span className={label}>Check before approving</span>
              {s.notes.map((n) => (
                <span key={n} className="text-[12.5px] text-body">
                  {n}
                </span>
              ))}
            </div>
          ) : null}
          {!p.readOnly ? (
            s.approved ? (
              <div className="flex items-center gap-2">
                <Badge tone="green" dot>
                  Approved
                </Badge>
                <Button variant="ghost" onClick={() => p.onPatch({ approved: false } as Partial<Step>)}>
                  Unapprove
                </Button>
              </div>
            ) : (
              <Button onClick={() => p.onPatch({ approved: true } as Partial<Step>)} disabled={stepProblems({ ...s, approved: true }).length > 0}>
                Approve
              </Button>
            )
          ) : null}
        </>
      ) : null}

      {s.kind === "wait" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Row name="Days">
              <Input type="number" min={0} value={s.days} onChange={(e) => p.onPatch({ days: Math.max(0, Math.round(Number(e.target.value) || 0)) } as Partial<Step>, "days")} className="h-9" disabled={p.readOnly} />
            </Row>
            <Row name="Hours">
              <Input type="number" min={0} max={23} value={s.hours} onChange={(e) => p.onPatch({ hours: Math.min(23, Math.max(0, Math.round(Number(e.target.value) || 0))) } as Partial<Step>, "hours")} className="h-9" disabled={p.readOnly} />
            </Row>
          </div>
          <Row name="Then on">
            <Pills options={WEEK} value={(s.weekday ?? []).map(String)} onChange={(v) => p.onPatch({ weekday: v.length ? v.map(Number).sort() : undefined } as Partial<Step>)} disabled={p.readOnly} />
          </Row>
          <Row name="At">
            <Input type="time" value={s.at ?? ""} onChange={(e) => p.onPatch({ at: e.target.value || undefined } as Partial<Step>)} className="h-9 w-32" disabled={p.readOnly} />
          </Row>
        </>
      ) : null}

      {s.kind === "wait_until" ? (
        <>
          <Row name="Until">
            <Select value={s.event} options={EVENTS} onChange={(event) => p.onPatch({ event } as Partial<Step>)} ariaLabel="Until" className="h-9 w-full" disabled={p.readOnly} />
          </Row>
          <Row name="At most, days">
            <Input type="number" min={1} value={s.days} onChange={(e) => p.onPatch({ days: Math.max(1, Math.round(Number(e.target.value) || 1)) } as Partial<Step>, "days")} className="h-9 w-28" disabled={p.readOnly} />
          </Row>
        </>
      ) : null}

      {s.kind === "branch" ? (
        <>
          <Segmented value={s.match} options={[{ value: "all", label: "All of these" }, { value: "any", label: "Any of these" }]} onChange={(match) => p.onPatch({ match } as Partial<Step>)} />
          <Conditions conds={s.conds} onChange={(conds) => p.onPatch({ conds } as Partial<Step>)} readOnly={p.readOnly} />
        </>
      ) : null}

      {s.kind === "split" ? (
        <Row name="Share on A, %">
          <Input type="number" min={1} max={99} value={s.percent} onChange={(e) => p.onPatch({ percent: Math.min(99, Math.max(1, Math.round(Number(e.target.value) || 50))) } as Partial<Step>, "pct")} className="h-9 w-28" disabled={p.readOnly} />
        </Row>
      ) : null}

      {s.kind === "update" ? (
        <>
          <Row name="Field">
            <Select value={s.field} options={FIELD_KEYS} onChange={(field) => p.onPatch({ field, value: "" } as Partial<Step>)} ariaLabel="Field" className="h-9 w-full" disabled={p.readOnly} />
          </Row>
          <Row name="Set to">
            {s.field === "lifecycle" ? (
              <Select value={s.value} options={LIFECYCLES} onChange={(value) => p.onPatch({ value } as Partial<Step>)} ariaLabel="Set to" className="h-9 w-full" disabled={p.readOnly} />
            ) : (
              <Input value={s.value} onChange={(e) => p.onPatch({ value: e.target.value } as Partial<Step>, "value")} className="h-9" disabled={p.readOnly} />
            )}
          </Row>
        </>
      ) : null}

      {s.kind === "list" ? (
        <>
          <Segmented value={s.action} options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }]} onChange={(action) => p.onPatch({ action } as Partial<Step>)} />
          <Row name="List">
            <Select value={s.segment} options={p.names.segments.filter((g) => g.kind === "static").map((g) => ({ value: g.id, label: g.name }))} onChange={(segment) => p.onPatch({ segment } as Partial<Step>)} ariaLabel="List" className="h-9 w-full" placeholder="Pick a list" disabled={p.readOnly} />
          </Row>
        </>
      ) : null}

      {s.kind === "task" ? (
        <>
          <Row name="Task">
            <Input value={s.title} onChange={(e) => p.onPatch({ title: e.target.value } as Partial<Step>, "title")} className="h-9" disabled={p.readOnly} />
          </Row>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Row name="For">
              <Select value={s.assignee} options={people} onChange={(assignee) => p.onPatch({ assignee } as Partial<Step>)} ariaLabel="For" className="h-9 w-full" disabled={p.readOnly} />
            </Row>
            <Row name="Due in days">
              <Input type="number" min={0} value={s.dueDays} onChange={(e) => p.onPatch({ dueDays: Math.max(0, Math.round(Number(e.target.value) || 0)) } as Partial<Step>, "due")} className="h-9" disabled={p.readOnly} />
            </Row>
          </div>
        </>
      ) : null}

      {s.kind === "slack" ? (
        <>
          <Row name="To">
            <Select value={s.to} options={people} onChange={(to) => p.onPatch({ to } as Partial<Step>)} ariaLabel="To" className="h-9 w-full" disabled={p.readOnly} />
          </Row>
          <Row name="Message">
            <textarea value={s.text} onChange={(e) => p.onPatch({ text: e.target.value } as Partial<Step>, "text")} className={area} disabled={p.readOnly} />
          </Row>
        </>
      ) : null}

      {s.kind === "webhook" ? (
        <>
          <Row name="Address">
            <Input value={s.url} onChange={(e) => p.onPatch({ url: e.target.value } as Partial<Step>, "url")} placeholder="https://" className="h-9" disabled={p.readOnly} />
          </Row>
          {p.workflowId ? (
            <Button variant="ghost" onClick={() => void secret()}>
              <Copy size={13} /> Copy signing secret
            </Button>
          ) : null}
        </>
      ) : null}

      <ErrorNote message={error} />
    </div>
  );
}
