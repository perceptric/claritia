"use client";

// The workflow as a column of cards (docs/enrich-workflows-reports.md 2.4), drawn on a canvas that pans and zooms
// (docs/email-unify-plan.md, E4): the trigger at the top, then each step with its one-line summary and its 7-day count,
// joined by lines with a + to add a step; paths are named Yes and No, or Path A and Path B. Branch, Split and Wait until draw their paths side by side, each as wide
// as it needs. A + between cards adds a step there from a menu you can search; dragging a card onto a + moves it.

import { useMemo, useState } from "react";
import { stepProblems } from "@/lib/workflows/check";
import { STEP_TITLE, stepDetail, triggerDetail, triggerTitle, type Names as WordNames } from "@/lib/workflows/explain";
import { pathsOf, type At, type PathName } from "@/lib/workflows/tree";
import { STEP_KINDS, STEP_LINE, type Body, type Step, type StepKind } from "@/lib/workflows/types";
import { ArrowDown, ArrowUp, Bell, Bolt, Branch, Chat, Clock, Code, Copy, Flag, Mail, Message, Plus, Shuffle, Signpost, Trash, Warn } from "../../Icons";
import { Popover } from "../FilterBar";
import { Badge } from "../ui";

export type Sel = "trigger" | string;

const ICON: Record<StepKind, (p: { size?: number }) => React.ReactNode> = {
  email: Mail,
  meeting_email: Mail,
  wait: Clock,
  wait_until: Clock,
  branch: Branch,
  split: Shuffle,
  route: Signpost,
  slack: Bell,
  webhook: Code,
  sms: Message,
  whatsapp: Chat,
  chat: Message,
  event: Flag,
  exit: Flag,
};

const PATH_WORDS: Record<PathName, string> = { yes: "Yes", no: "No", a: "Path A", b: "Path B" };
/** The card being dragged, so a + can light up and take it. */
let dragging: string | null = null;

export function Flow(p: {
  body: Body;
  names: WordNames;
  /** What's wrong with the trigger (a deleted form), in words on its card. */
  triggerProblems?: string[];
  /** Email steps whose words differ from the live version's. */
  changedSinceLive?: Set<string>;
  sel: Sel | null;
  onSelect: (s: Sel) => void;
  onAdd: (at: At, kind: StepKind) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onNudge: (id: string, d: -1 | 1) => void;
  /** Drop a dragged card at a place. */
  onMove?: (id: string, at: At) => void;
  /** A small picture of each email step, by step id. */
  thumbs?: Record<string, string>;
  counts: Record<string, number>;
  entered: number;
  lit: Set<string> | null;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col items-center pb-24">
      <button
        type="button"
        data-canvas-item=""
        data-node="trigger"
        onClick={() => p.onSelect("trigger")}
        className={`anim-rise-sm w-[380px] max-w-full rounded-2xl border bg-card px-4 py-3.5 text-left transition-[transform,box-shadow] duration-[140ms] ${p.sel === "trigger" ? "border-ink" : "border-line hover:-translate-y-px hover:shadow-soft"}`}
      >
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-signal">
          <Bolt size={12} /> Trigger
        </span>
        <span className="mt-1 block text-[14px] font-medium text-ink">{triggerTitle(p.body.trigger)}</span>
        <span className="mt-0.5 block text-[13px] text-body [overflow-wrap:anywhere]">{triggerDetail(p.body.trigger, p.names)}</span>
        {p.triggerProblems?.length ? (
          <span className="mt-1 flex items-start gap-1.5 text-[12.5px] text-butter">
            <Warn size={13} className="mt-0.5 shrink-0" />
            <span className="min-w-0">{p.triggerProblems[0]}</span>
          </span>
        ) : (
          p.entered ? <span className="mt-1 block text-[12px] text-muted tabular-nums">{p.entered.toLocaleString("en-US")} enrolled this week</span> : null
        )}
      </button>
      <List {...p} steps={p.body.steps} parent={null} path={undefined} />
    </div>
  );
}

type ListProps = Parameters<typeof Flow>[0] & { steps: Step[]; parent: string | null; path: PathName | undefined };

function List(p: ListProps) {
  return (
    <div className="flex w-full flex-col items-center">
      {p.steps.map((s, i) => (
        <div key={s.id} className="flex w-full flex-col items-center">
          <Joint words={null} readOnly={p.readOnly} onAdd={(k) => p.onAdd({ parent: p.parent, path: p.path, index: i }, k)} onDrop={p.onMove ? (id) => p.onMove!(id, { parent: p.parent, path: p.path, index: i }) : undefined} />
          <Card {...p} step={s} first={i === 0} last={i === p.steps.length - 1} />
          {pathsOf(s).length ? (
            <div className="mt-2 flex items-start gap-6">
              {pathsOf(s).map(([name, list]) => (
                <div key={name} data-path={name} className={`flex min-w-[400px] flex-col items-center rounded-2xl border border-dashed px-3 py-3 ${list.length || !p.readOnly ? "border-line" : "border-transparent"}`}>
                  <span className="label-mono">
                    {PATH_WORDS[name]}
                    {s.kind === "split" ? `, ${name === "a" ? s.percent : 100 - s.percent}%` : ""}
                  </span>
                  <List {...p} steps={list} parent={s.id} path={name} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      <Joint words={null} end readOnly={p.readOnly} onAdd={(k) => p.onAdd({ parent: p.parent, path: p.path, index: p.steps.length }, k)} onDrop={p.onMove ? (id) => p.onMove!(id, { parent: p.parent, path: p.path, index: p.steps.length }) : undefined} />
    </div>
  );
}

function Card(p: ListProps & { step: Step; first: boolean; last: boolean }) {
  const s = p.step;
  const Icon = ICON[s.kind];
  const probs = stepProblems(s);
  const on = p.sel === s.id;
  const lit = p.lit?.has(s.id);
  const title = STEP_TITLE[s.kind];
  const detail = stepDetail(s, p.names);
  return (
    <div className={`group relative w-[380px] max-w-full ${p.lit && !lit ? "opacity-45" : ""} transition-opacity duration-[320ms]`}>
      <button
        type="button"
        data-canvas-item=""
        data-node={s.id}
        draggable={!p.readOnly}
        onDragStart={(e) => {
          dragging = s.id;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", s.id);
        }}
        onDragEnd={() => (dragging = null)}
        onClick={() => p.onSelect(s.id)}
        className={`anim-rise-sm flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-[transform,box-shadow,border-color] duration-[140ms] ${on ? "border-ink" : lit ? "border-sage" : "border-line hover:-translate-y-px hover:shadow-soft"}`}
      >
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${s.kind === "email" ? "bg-clay-wash text-clay" : s.kind === "wait" || s.kind === "wait_until" ? "bg-butter-wash text-butter" : s.kind === "branch" || s.kind === "split" ? "bg-lilac-wash text-lilac" : "bg-sky-wash text-sky"}`}>
          <Icon size={14} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13.5px] font-medium text-ink">{title}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-[12.5px] text-body tabular-nums">
            <span className="min-w-0 [overflow-wrap:anywhere]">{detail}</span>
            {p.counts[s.id] ? <span className="text-muted">{p.counts[s.id]!.toLocaleString("en-US")} this week</span> : null}
          </span>
          {probs.length ? (
            <span className="mt-0.5 flex items-start gap-1.5 text-[12.5px] text-butter">
              <Warn size={13} className="mt-0.5 shrink-0" />
              <span className="min-w-0">{probs[0]}</span>
            </span>
          ) : null}
        </span>
        {(s.kind === "email" || s.kind === "meeting_email") && p.thumbs?.[s.id] ? (
          <span aria-hidden="true" className="relative h-[92px] w-[66px] shrink-0 overflow-hidden rounded-[5px] bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.05)]">
            <iframe title="" tabIndex={-1} loading="lazy" srcDoc={p.thumbs[s.id]} sandbox="" className="pointer-events-none absolute top-0 left-0 h-[840px] w-[600px] origin-top-left scale-[0.11] border-0 bg-white" />
          </span>
        ) : null}
        {s.kind === "email" && s.ai ? <Badge tone="violet">AI</Badge> : null}
        {s.kind === "email" && p.changedSinceLive?.has(s.id) ? <Badge tone="violet">Changed since publish</Badge> : null}
      </button>
      {!p.readOnly ? (
        <span className="absolute top-1/2 -right-11 hidden -translate-y-1/2 flex-col rounded-full bg-card shadow-chip shadow-soft group-hover:flex group-focus-within:flex">
          <MiniButton label="Move up" disabled={p.first} onClick={() => p.onNudge(s.id, -1)}>
            <ArrowUp size={12} />
          </MiniButton>
          <MiniButton label="Copy" onClick={() => p.onCopy(s.id)}>
            <Copy size={12} />
          </MiniButton>
          <MiniButton label="Delete" onClick={() => p.onRemove(s.id)}>
            <Trash size={12} />
          </MiniButton>
          <MiniButton label="Move down" disabled={p.last} onClick={() => p.onNudge(s.id, 1)}>
            <ArrowDown size={12} />
          </MiniButton>
        </span>
      ) : null}
    </div>
  );
}

function MiniButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

const GROUPS = ["Email", "Time", "Logic", "Lead", "Record", "Outside", "End"] as const;

/** The words between two cards, and the + that adds a step there or takes a dragged card. */
function Joint({ words, onAdd, onDrop, readOnly, end = false }: { words: string | null; onAdd: (k: StepKind) => void; onDrop?: (id: string) => void; readOnly: boolean; end?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className="flex flex-col items-center py-1"
      data-joint=""
      onDragOver={(e) => {
        if (!onDrop || !dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const id = dragging ?? e.dataTransfer.getData("text/plain");
        if (!onDrop || !id) return;
        e.preventDefault();
        dragging = null;
        onDrop(id);
      }}
    >
      <span className={`h-3 w-px ${over ? "bg-signal" : "bg-line-strong"}`} />
      {words && !end ? <span className="py-0.5 text-[11.5px] text-faint">{words}</span> : null}
      {/* The + stays in place while a card is over it (swapping it out would lose the drop); the green line shows. */}
      {!readOnly ? (
        <span className="relative flex items-center justify-center">
        {over ? <span data-drop-line="" className="pointer-events-none absolute h-[3px] w-40 rounded-full bg-signal" /> : null}
        <button
          type="button"
          aria-label="Add a step"
          title="Add a step"
          onClick={(e) => setAnchor(e.currentTarget)}
          className={`press flex size-6 items-center justify-center rounded-full bg-card shadow-outline text-muted transition-[opacity,color] duration-[140ms] hover:shadow-input-hover hover:text-ink ${over ? "opacity-0" : end ? "opacity-100" : "opacity-40 hover:opacity-100 focus-visible:opacity-100"}`}
        >
          <Plus size={12} />
        </button>
        </span>
      ) : null}
      {!end ? <span className={`h-3 w-px ${over ? "bg-signal" : "bg-line-strong"}`} /> : null}
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={300}>
          <AddMenu
            onPick={(k) => {
              setAnchor(null);
              onAdd(k);
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

/** The steps you can add, by group, each with one line; typing narrows them, Enter adds the first. */
function AddMenu({ onPick }: { onPick: (k: StepKind) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return STEP_KINDS.filter((k) => !t || `${k.label} ${STEP_LINE[k.kind]} ${k.group}`.toLowerCase().includes(t));
  }, [q]);
  return (
    <div className="flex flex-col p-1.5" role="menu" aria-label="Add a step">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && shown[0]) {
            e.preventDefault();
            onPick(shown[0].kind);
          }
        }}
        placeholder="Search steps"
        aria-label="Search steps"
        className="mb-1 h-8 w-full rounded-md bg-card px-2.5 text-[13px] text-ink shadow-input outline-none placeholder:text-faint"
      />
      <div className="flex max-h-[380px] flex-col overflow-y-auto">
        {GROUPS.filter((g) => shown.some((k) => k.group === g)).map((g) => (
          <div key={g} className="flex flex-col">
            <span className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-faint">{g}</span>
            {shown
              .filter((k) => k.group === g)
              .map((k) => {
                const Icon = ICON[k.kind];
                return (
                  <button key={k.kind} type="button" role="menuitem" onClick={() => onPick(k.kind)} className="flex items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper-deep text-muted">
                      <Icon size={12} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] font-medium text-ink">{k.label}</span>
                      <span className="text-[12px] text-muted">{STEP_LINE[k.kind]}</span>
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
        {!shown.length ? <p className="px-2.5 py-3 text-[12.5px] text-muted">No matches</p> : null}
      </div>
    </div>
  );
}
