"use client";

// On Submission (docs/on-submission.md): what happens after someone sends the form, on its own screen in Build. Show a
// message, Go to a page, or Book a meeting. A meeting is picked, never edited here: Routing is a Default meeting and
// conditions that send some leads to another meeting. The meeting then picks the rep (an Individual meeting is its
// host; a Dynamic meeting has its own rules). Try a lead runs the compiled routing (src/lib/routing/compile.ts) on
// answers typed in, so what lights up is what the router will do. The one arrow (`Arrow`) marks every "this leads to
// that".

import { useMemo, useState } from "react";
import { localZone, zoneName } from "@/lib/forms/calendar";
import type { Op } from "@/lib/forms/ops";
import type { Schedule } from "@/lib/forms/schedule";
import type { Form } from "@/lib/forms/schema";
import type { FieldDef } from "@/lib/router/conditions";
import { emptyBody, type Cond } from "@/lib/router/types";
import { compileRouting, isDynamic, traceLead, type Dest, type FormRoute } from "@/lib/routing/compile";
import { fieldOf } from "@/lib/routing/screenModel";
import { Badge, ErrorNote, type ViewProps } from "../ui";
import type { TypeRow } from "../meetings/TypesList";
import { blankCond, condWords, ConditionRows, newRowId, usable, ValueInput } from "./ConditionRows";
import type { RoutingFacts } from "./formRouting";
import { Ic } from "./ic";
import { AREA, BTN, Dd, GHOST_SM, IB_SM, IN, Seg, type DdItem } from "./parts";
import { typeLabel } from "./routes";

export type Outcome = "msg" | "url" | "book";
/** Try a lead: the answers typed in, or null when it's closed. */
export type Trial = Record<string, string> | null;

export const outcomeOf = (form: Form): Outcome => (form.after.schedule ? "book" : form.after.end.kind === "redirect" ? "url" : "msg");

/** The one arrow: "this leads to that". */
export function Arrow({ className = "text-faint" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 12" className={`h-[12px] w-[22px] shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h19M15 1.5 20 6l-5 4.5" />
    </svg>
  );
}

/** The arrow between two cards on the canvas, pointing down. */
export function ArrowDown() {
  return (
    <span aria-hidden="true" className="flex h-[40px] flex-col items-center text-line-strong">
      <i className="w-[1.5px] flex-1 rounded-full bg-current" />
      <svg viewBox="0 0 12 9" className="-mt-[6px] h-[9px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1.5 2 6 7l4.5-5" />
      </svg>
    </span>
  );
}

const active = (types: TypeRow[]) => types.filter((t) => t.active);
const hostName = (t: TypeRow, facts: RoutingFacts) => facts.people.find((p) => p.id === t.hosts[0]?.user_id)?.name ?? "No host";
/** The second line of a meeting: its host, or Dynamic. */
const meetingSub = (t: TypeRow, facts: RoutingFacts) => (isDynamic(t) ? "Dynamic" : hostName(t, facts));
const teamOf = (facts: RoutingFacts, key: string) => facts.teams.find((t) => t.keys.includes(key));

/** Who a destination is, in words: a rep's name, or a team's. */
export function destName(d: Dest | null, facts: RoutingFacts): string {
  if (!d) return "";
  if (d.kind === "user") return facts.people.find((p) => p.id === d.id)?.name ?? "Former teammate";
  return teamOf(facts, d.id)?.name ?? "Removed team";
}

/** The rep a destination would give now, for the preview: the rep, or the team member next in line. */
function repOf(d: Dest | null, facts: RoutingFacts): string | null {
  if (!d) return null;
  if (d.kind === "user") return d.id;
  const t = teamOf(facts, d.id);
  if (!t?.members.length) return null;
  const order = [...t.members].sort((a, b) => a.position - b.position);
  return order[t.next % order.length]!.user;
}

/** What the form's routing does with a lead: which row (-1 for Default), the meeting and where the meeting sends them. */
export function routeOf(s: Schedule | undefined, types: TypeRow[], facts: RoutingFacts, values: Record<string, string>) {
  const routes = s?.routes ?? [];
  const { body } = compileRouting({ ...emptyBody(), v: 2 }, { def: s?.meetingTypeId, routes, types, teamKeys: facts.teamKeys });
  const t = traceLead(body, values, facts.fields);
  const row = t.rule?.id.startsWith("f_") ? routes.findIndex((r) => t.rule!.id === `f_${r.id}` || t.rule!.id.startsWith(`f_${r.id}_`)) : -1;
  return { row, meet: t.meet, dest: t.dest };
}

// The canvas -----------------------------------------------------------------------------------------------------------

/** The On Submission card on the canvas, in Claritia's look. */
export function SubmitNode({ form, types, facts, trial }: { form: Form; types: TypeRow[]; facts: RoutingFacts; trial: Trial }) {
  const kind = outcomeOf(form);
  const s = form.after.schedule;
  const r = trial ? routeOf(s, types, facts, trial) : null;
  const chip = (id: string | undefined) => {
    const t = types.find((x) => x.id === id);
    return t ? (
      <span className="flex min-w-0 items-center justify-end gap-[6px] truncate font-medium text-ink">
        {t.name}
        <span className="font-normal text-muted">{meetingSub(t, facts)}</span>
      </span>
    ) : (
      <span className="text-faint">Pick a meeting</span>
    );
  };
  const line = (key: string, hit: boolean, left: React.ReactNode, right: React.ReactNode) => (
    <span key={key} className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,auto)] items-center gap-[6px] rounded-md px-[8px] py-[6px] text-[12px] ${hit ? "bg-signal-soft" : "bg-paper"}`}>
      <span className="min-w-0 text-muted">{left}</span>
      <Arrow className={hit ? "text-signal" : "text-faint"} />
      {right}
    </span>
  );
  return (
    <div className="w-[375px] max-w-full rounded-[10px] border border-ink bg-card text-left font-sans text-[13px] text-body ring-1 ring-ink">
      <span className="flex items-center gap-[8px] border-b border-line px-[12px] py-[10px] font-semibold text-ink">
        <Arrow className="text-ink" />
        On Submission
      </span>
      <span className="flex flex-col gap-[6px] px-[12px] pt-[10px] pb-[12px]">
        {kind === "msg" ? line("m", false, "Show a message", <span className="truncate text-ink">{form.after.end.kind === "message" ? form.after.end.title : ""}</span>) : null}
        {kind === "url" ? line("u", false, "Go to a page", <span className="truncate text-ink">{form.after.end.kind === "redirect" ? form.after.end.url : ""}</span>) : null}
        {kind === "book" && s?.tool === "claritia" ? (
          <>
            {line("d", r?.row === -1, "Default", chip(s.meetingTypeId))}
            {(s.routes ?? []).map((x, i) => line(x.id, r?.row === i, `If ${x.conds.map((c) => condWords(c, facts.fields)).join(" and ")}`, chip(x.meet)))}
            {r?.dest && isDynamic(types.find((t) => t.id === r.meet) ?? { settings: {} }) ? line("rep", true, `${types.find((t) => t.id === r.meet)?.name} routes`, <span className="font-medium text-ink">{destName(r.dest, facts)}</span>) : null}
          </>
        ) : null}
      </span>
    </div>
  );
}

const sampleTimes = () => ["9:00", "9:30", "10:30", "1:00", "2:30", "4:00"];
const initials = (n: string) =>
  n
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** What the visitor sees after sending it, in the brand's look (the canvas sets the --b-* values). */
export function SubmitResult({ form, types, facts, trial }: { form: Form; types: TypeRow[]; facts: RoutingFacts; trial: Trial }) {
  const kind = outcomeOf(form);
  const end = form.after.end;
  const h2 = (t: string) => <h2 className="m-0 font-[family-name:var(--b-hfont)] text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">{t}</h2>;
  if (kind === "url")
    return (
      <div className="flex flex-col items-start gap-[10px]">
        <span className="flex h-[30px] w-full items-center gap-[8px] rounded-full bg-[var(--b-soft)] px-[12px] text-[12px] text-[var(--b-muted)]">
          <Ic n="lock" s={12} />
          <span className="truncate">{end.kind === "redirect" ? end.url.replace(/^https?:\/\//, "") : ""}</span>
        </span>
        <i className="block h-[10px] w-[70%] rounded-[3px] bg-[var(--b-soft)]" />
        <i className="block h-[64px] w-full rounded-[var(--b-r)] bg-[var(--b-soft)]" />
      </div>
    );
  if (kind === "msg")
    return (
      <div className="flex flex-col items-start gap-[10px]">
        <span className="inline-flex size-[36px] items-center justify-center rounded-full bg-[var(--b-soft)] text-[var(--b-acc)]">
          <Ic n="check" s={18} />
        </span>
        {h2(end.kind === "message" ? end.title : "")}
        {end.kind === "message" && end.text ? <p className="m-0 text-[var(--b-muted)]">{end.text}</p> : null}
      </div>
    );
  const s = form.after.schedule!;
  const r = routeOf(s, types, facts, trial ?? {});
  const meeting = types.find((t) => t.id === r.meet);
  const repId = repOf(r.dest, facts);
  const rep = repId ? facts.people.find((p) => p.id === repId)?.name : null;
  if (!meeting) return <div className="flex flex-col gap-[8px]">{h2(s.heading || "Pick a time")}<p className="m-0 text-[13px] text-[var(--b-muted)]">No meeting picked</p></div>;
  return (
    <div className="flex flex-col items-start gap-[12px]">
      {h2(s.heading || "Pick a time")}
      <div className="flex w-full items-center gap-[10px] rounded-[var(--b-r)] bg-[var(--b-soft)] p-[10px]">
        <span aria-hidden="true" className="inline-flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--b-acc)] text-[12px] font-semibold text-[var(--b-on)]">
          {initials(rep ?? meeting.name)}
        </span>
        <span className="flex flex-col leading-[1.3]">
          <b className="text-[14px] font-semibold">{rep ?? "Their rep"}</b>
          <span className="text-[12.5px] text-[var(--b-muted)]">{typeLabel(meeting)}</span>
        </span>
      </div>
      <p className="m-0 text-[13px] text-[var(--b-muted)]">{`Times in your zone, ${zoneName(localZone())}.`}</p>
      <div className="grid w-full grid-cols-3 gap-[6px]">
        {sampleTimes().map((t, i) => (
          <span key={t} className={`flex h-[36px] items-center justify-center rounded-[var(--b-btn-r)] text-[13px] ${i === 2 ? "bg-[var(--b-acc)] text-[var(--b-on)]" : "border border-[var(--b-line)] text-[var(--b-acc)]"}`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// The panel ------------------------------------------------------------------------------------------------------------

type PanelProps = Pick<ViewProps, "navigate"> & {
  form: Form;
  apply: (ops: Op | Op[], words?: string) => boolean;
  types: TypeRow[];
  facts: RoutingFacts;
  trial: Trial;
  setTrial: (t: Trial) => void;
};

const Label = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
  <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
    {children}
  </label>
);

/** A section of the panel that opens and closes: icon, title and a one-line summary, the body full width. */
function Fold({ icon, title, summary, open, onToggle, children }: { icon: string; title: string; summary: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-[58px] w-full items-center gap-[12px] px-[20px] py-[9px] text-left transition-colors duration-[120ms] hover:bg-paper">
        <span className={`flex size-[30px] shrink-0 items-center justify-center rounded-lg transition-colors duration-[120ms] ${open ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>
          <Ic n={icon} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-medium text-ink">{title}</span>
          <span className="truncate text-[12px] text-muted">{summary}</span>
        </span>
        <Ic n="chev" className={`text-faint transition-transform duration-[200ms] ease-out ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="anim-rise-sm flex flex-col gap-[14px] px-[20px] pt-[2px] pb-[18px]">{children}</div> : null}
    </section>
  );
}

export function OnSubmissionPanel(p: PanelProps) {
  const { form, apply, types } = p;
  const kind = outcomeOf(form);
  const end = form.after.end;
  const lastMsg = end.kind === "message" ? end : { kind: "message" as const, title: "Thanks, we got it." };

  const pick = (k: Outcome) => {
    if (k === kind) return;
    if (k === "book") {
      // Books the first meeting there is as the Default; with none yet, the panel offers to make one.
      const first = active(types)[0]?.id;
      apply([...(end.kind === "redirect" ? [{ op: "set_after" as const, end: lastMsg }] : []), { op: "set_schedule", schedule: { tool: "claritia", url: "", perOwner: false, ...(first ? { meetingTypeId: first } : {}), routes: [] } }], "Books a meeting");
    } else apply([{ op: "set_schedule", schedule: null }, { op: "set_after", end: k === "url" ? { kind: "redirect", url: end.kind === "redirect" ? end.url : "https://" } : lastMsg }], k === "url" ? "Goes to a page" : "Shows a message");
  };

  const choice = (v: Outcome, icon: string, label: string) => (
    <button
      key={v}
      type="button"
      aria-pressed={kind === v}
      onClick={() => pick(v)}
      className={`flex min-w-0 flex-col items-start gap-[8px] rounded-[10px] border p-[10px] text-left text-[12.5px] font-medium text-ink transition-colors duration-[120ms] ${kind === v ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
    >
      <span className={`inline-flex size-[28px] items-center justify-center rounded-lg ${kind === v ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>
        <Ic n={icon} />
      </span>
      {label}
    </button>
  );

  const message = (
    <>
      <div className="flex flex-col gap-[6px]">
        <Label htmlFor="os-title">Title</Label>
        <input id="os-title" className={IN} value={lastMsg.title} onChange={(e) => apply({ op: "set_after", end: { ...lastMsg, title: e.target.value } })} onBlur={(e) => !e.target.value.trim() && apply({ op: "set_after", end: { ...lastMsg, title: "Thanks, we got it." } })} />
      </div>
      <div className="flex flex-col gap-[6px]">
        <Label htmlFor="os-text">Message</Label>
        <textarea id="os-text" className={AREA} rows={3} value={end.kind === "message" ? (end.text ?? "") : ""} onChange={(e) => apply({ op: "set_after", end: { kind: "message", title: lastMsg.title, ...(e.target.value ? { text: e.target.value } : {}) } })} />
      </div>
    </>
  );

  return (
    <aside aria-label="On Submission" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-[10px] border-b border-line px-[20px] pt-[14px] pb-[12px]">
        <span className="inline-flex size-[30px] items-center justify-center rounded-lg bg-paper-deep">
          <Arrow className="text-ink" />
        </span>
        <b className="text-[16px] font-semibold tracking-[-0.015em] text-ink">On Submission</b>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[28px]">
        <div className="flex flex-col gap-[16px] border-b border-line px-[20px] py-[16px]">
          <div className="grid grid-cols-3 gap-[8px]">
            {choice("msg", "msg", "Show a message")}
            {choice("url", "ext", "Go to a page")}
            {choice("book", "meet", "Book a meeting")}
          </div>
          {kind === "url" && end.kind === "redirect" ? (
            <div className="flex flex-col gap-[6px]">
              <Label htmlFor="os-url">Page</Label>
              <input id="os-url" className={IN} value={end.url} onChange={(e) => apply({ op: "set_after", end: { kind: "redirect", url: e.target.value.trim() } })} />
              {/^https:\/\/[^/\s]+\.[^/\s]+/.test(end.url) ? null : <span className="text-[12px] text-rose">The page needs https://</span>}
            </div>
          ) : null}
          {kind === "msg" ? message : null}
        </div>
        {kind === "book" && form.after.schedule ? <Booking {...p} message={message} /> : null}
      </div>
    </aside>
  );
}

function Booking(p: PanelProps & { message: React.ReactNode }) {
  const { form, apply, types, facts, trial, setTrial, navigate } = p;
  const s = form.after.schedule!;
  const [open, setOpen] = useState<Set<string>>(() => new Set(["routing"]));
  const toggle = (k: string) => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])));
  const meetings = active(types);
  const routes = useMemo(() => s.routes ?? [], [s.routes]);
  const setSched = (patch: Partial<Schedule>, words?: string) => apply({ op: "set_schedule", schedule: { ...s, tool: "claritia", url: "", perOwner: false, routes, ...patch } }, words);
  const setRoutes = (next: FormRoute[], words?: string) => setSched({ routes: next }, words);
  const problems = useMemo(() => compileRouting({ ...emptyBody(), v: 2 }, { def: s.meetingTypeId, routes, types, teamKeys: facts.teamKeys }).problems, [s.meetingTypeId, routes, types, facts.teamKeys]);
  const r = trial ? routeOf(s, types, facts, trial) : null;
  const [q, setQ] = useState("");

  if (s.tool !== "claritia") return null;
  if (!meetings.length)
    return (
      <div className="flex flex-col items-start gap-[10px] px-[20px] py-[18px]">
        <span className="inline-flex size-[40px] items-center justify-center rounded-[10px] bg-paper-deep text-ink">
          <Ic n="meet" s={18} />
        </span>
        <b className="text-[14px] font-semibold text-ink">No meetings yet</b>
        <button type="button" className={BTN} onClick={() => navigate("scheduling", "types/new")}>
          <Ic n="plus" />
          Create a meeting
        </button>
      </div>
    );

  const items = (cur: string | undefined, onPick: (id: string) => void): DdItem[] => {
    const ind = meetings.filter((t) => !isDynamic(t));
    const dyn = meetings.filter((t) => isDynamic(t));
    return [
      ...(ind.length ? [{ kind: "group" as const, label: "Individual" }] : []),
      ...ind.map((t): DdItem => ({ kind: "option", key: t.id, label: t.name, hint: hostName(t, facts), on: t.id === cur, onPick: () => onPick(t.id) })),
      ...(dyn.length ? [{ kind: "group" as const, label: "Dynamic" }] : []),
      ...dyn.map((t): DdItem => ({ kind: "option", key: t.id, label: t.name, hint: `${t.hosts.length} reps`, on: t.id === cur, onPick: () => onPick(t.id) })),
      { kind: "add", key: "new", label: "Create a meeting", onPick: () => navigate("scheduling", "types/new") },
    ];
  };
  const meetingPick = (cur: string | undefined, onPick: (id: string) => void, hit: boolean) => {
    const t = types.find((x) => x.id === cur);
    return (
      <div className="flex items-center gap-[8px] pl-[35px] max-[480px]:pl-0">
        <Arrow className={hit ? "text-signal" : "text-ink"} />
        <Dd sm ariaLabel="Meeting" label={t ? t.name : <span className="text-faint">Pick a meeting</span>} items={items(cur, onPick)} menuWidth={260} />
        {t ? <Badge>{meetingSub(t, facts)}</Badge> : null}
        {t ? (
          <button type="button" className={IB_SM} title="Open in Meetings" aria-label="Open in Meetings" onClick={() => navigate("scheduling", `types/${t.id}`)}>
            <Ic n="ext" />
          </button>
        ) : null}
        {hit ? (
          <Badge tone="green" dot>
            Match
          </Badge>
        ) : null}
      </div>
    );
  };

  // Try a lead: the fields the form's rows and their meetings' rules test.
  const used = new Set<string>();
  for (const x of routes) for (const c of x.conds) used.add(c.field);
  for (const id of [s.meetingTypeId, ...routes.map((x) => x.meet)]) for (const rule of types.find((t) => t.id === id)?.settings.dynamic?.rules ?? []) for (const c of rule.conds) used.add(c.field);
  const tested: FieldDef[] = [...used].map((k) => fieldOf(k, facts.fields)).slice(0, 6);
  const firstField = usable(facts.fields).find((f) => f.key === "lead.country") ?? usable(facts.fields)[0];
  const trialMeeting = r ? types.find((t) => t.id === r.meet) : undefined;

  return (
    <>
      <Fold icon="branch" title="Routing" summary={`Default ${types.find((t) => t.id === s.meetingTypeId)?.name ?? "not picked"}${routes.length ? `, ${routes.length} ${routes.length === 1 ? "condition" : "conditions"}` : ""}`} open={open.has("routing")} onToggle={() => toggle("routing")}>
        <div className="flex items-center justify-end">
          <button type="button" aria-pressed={!!trial} className={trial ? GHOST_SM.replace("border-line bg-card", "border-ink bg-ink").replace("text-body", "text-card") : GHOST_SM} onClick={() => setTrial(trial ? null : {})}>
            <Ic n="flow" s={12} />
            Try a lead
          </button>
        </div>
        {trial ? (
          <div className="flex flex-col gap-[10px] rounded-[10px] border border-dashed border-line-strong p-[10px]">
            <div className="grid grid-cols-2 gap-[8px] max-[480px]:grid-cols-1">
              {tested.length ? (
                tested.map((f) => (
                  <div key={f.key} className="flex min-w-0 flex-col gap-[4px]">
                    <Label>{f.label}</Label>
                    <ValueInput field={f} value={trial[f.key] ?? ""} onChange={(v) => setTrial({ ...trial, [f.key]: String(v) })} search={q} onSearch={setQ} />
                  </div>
                ))
              ) : (
                <span className="text-[12.5px] text-muted">Add a condition first</span>
              )}
            </div>
            <span className="flex flex-wrap items-center gap-[8px] font-medium text-ink">
              <Arrow className="text-signal" />
              {trialMeeting ? trialMeeting.name : "No meeting"}
              {trialMeeting && r?.dest ? (
                <>
                  <Arrow className="text-signal" />
                  {destName(r.dest, facts)}
                </>
              ) : null}
            </span>
          </div>
        ) : null}

        <div className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] transition-colors duration-[200ms] ${r?.row === -1 ? "border-signal-line bg-signal-soft" : "border-line"}`}>
          <span className="text-[12.5px] font-semibold text-ink">Default</span>
          {meetingPick(s.meetingTypeId, (id) => setSched({ meetingTypeId: id }, "Changed the Default meeting"), r?.row === -1)}
        </div>
        {routes.map((x, i) => (
          <div key={x.id} className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] transition-colors duration-[200ms] ${r?.row === i ? "border-signal-line bg-signal-soft" : "border-line"}`}>
            <ConditionRows conds={x.conds} fields={facts.fields} onChange={(conds: Cond[]) => setRoutes(routes.map((y, n) => (n === i ? { ...y, conds } : y)))} />
            <div className="flex items-center gap-[8px]">
              <div className="min-w-0 flex-1">{meetingPick(x.meet, (id) => setRoutes(routes.map((y, n) => (n === i ? { ...y, meet: id } : y))), r?.row === i)}</div>
              <button type="button" className={IB_SM} title="Delete condition" aria-label="Delete condition" onClick={() => setRoutes(routes.filter((_, n) => n !== i), "Deleted a condition")}>
                <Ic n="trash" />
              </button>
            </div>
          </div>
        ))}
        {firstField ? (
          <button type="button" className={`${GHOST_SM} self-start`} onClick={() => setRoutes([...routes, { id: newRowId("r"), conds: [blankCond(firstField)], meet: s.meetingTypeId ?? meetings[0]!.id }])}>
            <Ic n="plus" s={12} />
            Add condition
          </button>
        ) : null}
        {facts.error && !facts.ready ? <ErrorNote message={facts.error} /> : null}
        {problems.filter((x) => !/value missing/.test(x)).map((x) => (
          <span key={x} className="text-[12px] text-rose">
            {x}
          </span>
        ))}
      </Fold>
      <Fold icon="msg" title="When no times are open" summary={s.none === "later" ? "Email times later" : "Show the message"} open={open.has("none")} onToggle={() => toggle("none")}>
        <Seg
          label="When no times are open"
          value={s.none === "later" ? "later" : "message"}
          onChange={(v) => {
            const next = { ...s };
            if (v === "later") next.none = "later";
            else delete next.none;
            apply({ op: "set_schedule", schedule: next });
          }}
          options={[
            { value: "message", label: "Show the message" },
            { value: "later", label: "Email times later" },
          ]}
        />
        {p.message}
      </Fold>
    </>
  );
}
