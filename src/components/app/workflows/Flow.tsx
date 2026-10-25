"use client";

// The workflow as a column of cards (docs/enrich-workflows-reports.md 2.4): the trigger at the top, then each step
// with its one-line meaning and its 7-day count, joined by words ("then", "if yes", "if no"). Branch, Split and Wait
// until draw their two paths side by side. A + between cards adds a step there. Like Routing's flow, it's a column of
// HTML, not a board of boxes and lines.

import { useState } from "react";
import { stepProblems } from "@/lib/workflows/check";
import { stepWords, triggerWords, waitWords, type Names as WordNames } from "@/lib/workflows/explain";
import { pathsOf, type At, type PathName } from "@/lib/workflows/tree";
import { STEP_KINDS, type Body, type Step, type StepKind } from "@/lib/workflows/types";
import { ArrowDown, ArrowUp, Bell, Branch, Building, Check, Clock, Code, Contact, Copy, Flag, Mail, Pencil, Plus, Send, Shuffle, Signpost, Sparkle, Trash } from "../../Icons";
import { Popover } from "../FilterBar";
import { Badge } from "../ui";

export type Sel = "trigger" | string;

const ICON: Record<StepKind, (p: { size?: number }) => React.ReactNode> = {
  email: Mail,
  wait: Clock,
  wait_until: Clock,
  branch: Branch,
  split: Shuffle,
  enrich: Building,
  qualify: Sparkle,
  route: Signpost,
  update: Pencil,
  list: Contact,
  task: Check,
  slack: Bell,
  webhook: Code,
  crm: Send,
  exit: Flag,
};

const PATH_WORDS: Record<PathName, string> = { yes: "If yes", no: "If no", a: "A", b: "B" };

export function Flow(p: {
  body: Body;
  names: WordNames;
  sel: Sel | null;
  onSelect: (s: Sel) => void;
  onAdd: (at: At, kind: StepKind) => void;
  onRemove: (id: string) => void;
  onCopy: (id: string) => void;
  onNudge: (id: string, d: -1 | 1) => void;
  counts: Record<string, number>;
  entered: number;
  lit: Set<string> | null;
  readOnly: boolean;
}) {
  return (
    <div className="flex flex-col items-center pb-24">
      <button
        type="button"
        onClick={() => p.onSelect("trigger")}
        className={`anim-rise-sm w-full max-w-[420px] rounded-2xl border bg-card px-4 py-3.5 text-left transition-[transform,box-shadow] duration-[140ms] ${p.sel === "trigger" ? "border-ink" : "border-line hover:-translate-y-px hover:shadow-soft"}`}
      >
        <span className="label-mono">Starts</span>
        <span className="mt-1 block text-[14px] font-medium text-ink">{triggerWords(p.body.trigger, p.names)}</span>
        <span className="mt-1 block text-[12px] text-muted tabular-nums">{p.entered ? `${p.entered.toLocaleString("en-US")} entered in 7 days` : "No one yet"}</span>
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
          <Joint words={i === 0 && p.parent ? null : "then"} readOnly={p.readOnly} onAdd={(k) => p.onAdd({ parent: p.parent, path: p.path, index: i }, k)} />
          <Card {...p} step={s} first={i === 0} last={i === p.steps.length - 1} />
          {pathsOf(s).length ? (
            <div className="mt-2 grid w-full gap-4" style={{ gridTemplateColumns: `repeat(${pathsOf(s).length}, minmax(0, 1fr))` }}>
              {pathsOf(s).map(([name, list]) => (
                <div key={name} className={`flex min-w-0 flex-col items-center rounded-2xl border border-dashed px-2 py-3 ${list.length || !p.readOnly ? "border-line" : "border-transparent"}`}>
                  <span className="label-mono">
                    {PATH_WORDS[name]}
                    {s.kind === "split" ? ` · ${name === "a" ? s.percent : 100 - s.percent}%` : ""}
                  </span>
                  <List {...p} steps={list} parent={s.id} path={name} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      <Joint words={p.steps.length ? "then" : null} end readOnly={p.readOnly} onAdd={(k) => p.onAdd({ parent: p.parent, path: p.path, index: p.steps.length }, k)} />
    </div>
  );
}

function Card(p: ListProps & { step: Step; first: boolean; last: boolean }) {
  const s = p.step;
  const Icon = ICON[s.kind];
  const probs = stepProblems(s);
  const on = p.sel === s.id;
  const lit = p.lit?.has(s.id);
  const words = s.kind === "wait" ? waitWords(s) : stepWords(s, p.names);
  return (
    <div className={`group relative w-full max-w-[420px] ${p.lit && !lit ? "opacity-45" : ""} transition-opacity duration-[320ms]`}>
      <button
        type="button"
        onClick={() => p.onSelect(s.id)}
        className={`anim-rise-sm flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-[transform,box-shadow,border-color] duration-[140ms] ${on ? "border-ink" : lit ? "border-sage" : "border-line hover:-translate-y-px hover:shadow-soft"}`}
      >
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${s.kind === "email" ? "bg-clay-wash text-clay" : s.kind === "wait" || s.kind === "wait_until" ? "bg-butter-wash text-butter" : s.kind === "branch" || s.kind === "split" ? "bg-lilac-wash text-lilac" : "bg-sky-wash text-sky"}`}>
          <Icon size={14} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium text-ink">{words}</span>
          <span className="flex items-center gap-2 text-[12px] text-muted tabular-nums">
            {STEP_KINDS.find((k) => k.kind === s.kind)?.label}
            {p.counts[s.id] ? <span>· {p.counts[s.id]!.toLocaleString("en-US")} in 7 days</span> : null}
          </span>
        </span>
        {s.kind === "email" && s.ai ? <Badge tone="violet">AI</Badge> : null}
        {s.kind === "email" && s.approved ? <Badge tone="green">Approved</Badge> : null}
        {probs.length ? (
          <Badge tone="amber" dot>
            {probs.length}
          </Badge>
        ) : null}
      </button>
      {!p.readOnly ? (
        <span className="absolute top-1/2 -right-11 hidden -translate-y-1/2 flex-col rounded-full border border-line bg-card shadow-soft group-hover:flex group-focus-within:flex">
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

/** The words between two cards, and the + that adds a step there. */
function Joint({ words, onAdd, readOnly, end = false }: { words: string | null; onAdd: (k: StepKind) => void; readOnly: boolean; end?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <div className="flex flex-col items-center py-1">
      <span className="h-3 w-px bg-line-strong" />
      {words && !end ? <span className="py-0.5 text-[11.5px] text-faint">{words}</span> : null}
      {!readOnly ? (
        <button
          type="button"
          aria-label="Add a step"
          title="Add a step"
          onClick={(e) => setAnchor(e.currentTarget)}
          className={`press flex size-6 items-center justify-center rounded-full border border-line-strong bg-card text-muted transition-[opacity,color] duration-[140ms] hover:border-ink hover:text-ink ${end ? "opacity-100" : "opacity-40 hover:opacity-100 focus-visible:opacity-100"}`}
        >
          <Plus size={12} />
        </button>
      ) : null}
      {!end ? <span className="h-3 w-px bg-line-strong" /> : null}
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={260}>
          <div className="flex max-h-[420px] flex-col overflow-y-auto p-1.5">
            {GROUPS.map((g) => (
              <div key={g} className="flex flex-col">
                <span className="px-2.5 pt-2 pb-1 text-[11.5px] font-medium text-faint">{g}</span>
                {STEP_KINDS.filter((k) => k.group === g).map((k) => {
                  const Icon = ICON[k.kind];
                  return (
                    <button
                      key={k.kind}
                      type="button"
                      onClick={() => {
                        setAnchor(null);
                        onAdd(k.kind);
                      }}
                      className="flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-left text-[13px] text-ink hover:bg-hover"
                    >
                      <Icon size={13} />
                      {k.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
