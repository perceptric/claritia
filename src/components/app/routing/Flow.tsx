"use client";

// The router drawn as a flow (docs/router-ux.md 4.2): step cards joined by a line with each line's 7-day count, the
// branches that end a route off to the right, rules as rows inside the Rules card (drag, or Move up and Move down in
// the row's menu), queues as pills under the flow and problems on the card they belong to. While a test lead is set,
// its path lights up: the lines it took draw in (slow), each card gets ✓, ✗ or –, and steps it never reached fade.

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { newId, type Problem } from "@/lib/router/check";
import { minutesWords, type Line as RunLine } from "@/lib/router/explain";
import { defaultSla, type RouterBody, type Rule } from "@/lib/router/types";
import { ArrowDown, ArrowUp, Check, Grip, MoreHorizontal, Plus, Trash, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Popover } from "../FilterBar";
import { Badge, Toggle } from "../ui";
import type { Member } from "./api";
import { addQueue, addRule, moveRule, moveRuleTo, removeRule, sameSelection, type FlowCounts, type FlowStep, type pathOf, type Selection } from "./editorModel";
import type { Edit } from "./Inspector";
import { fmt } from "./parts";

type Path = ReturnType<typeof pathOf>;

export type FlowProps = {
  body: RouterBody;
  counts: FlowCounts | null;
  problems: Problem[];
  sel: Selection | null;
  onSelect: (s: Selection) => void;
  /** Missing when the flow is read-only. */
  edit?: Edit;
  members: Member[];
  path: Path | null;
  /** Changes with each test result, so the lit lines draw in again. */
  runKey: number;
  /** Rules that ran in the live version, for the Unused pill. */
  liveRules?: Set<string>;
  setup?: { text: string; at: Selection }[];
};

const WHEN_OUT = { keep: "When away: wait for them", backup: "When away: their backup", route: "When away: use the rules" } as const;
const SLA_NEXT_WORDS = { route: "then the next rep", manager: "then the manager", nudge: "then a reminder" } as const;

export function Flow(p: FlowProps) {
  const { body, counts, path, sel, onSelect, edit } = p;
  const names = new Map(p.members.map((m) => [m.id, m.name]));
  const problemFor = (kind: Problem["where"]["kind"], id?: string) => p.problems.find((x) => x.where.kind === kind && (id === undefined || x.where.id === id));
  const reached = (s: FlowStep) => !path || path.reached.has(s);
  const lit = (s: FlowStep) => !!path && path.reached.has(s);
  const toggle = (step: "spam" | "account" | "keep" | "rules") => (edit ? (on: boolean) => edit((b) => ({ ...b, [step]: { ...b[step], on } })) : undefined);

  const spamOn = [body.spam.disposable && "throwaway emails", "blocked domains", body.spam.fakeName && "fake names", body.spam.tooMany && "too many fills", body.spam.freeMail && "personal email"].filter(Boolean) as string[];
  const fb = body.fallback;
  const fbName = !fb ? "None" : fb.kind === "user" ? (names.get(fb.id) ?? "Former teammate") : (body.queues.find((q) => q.id === fb.id)?.name ?? "A removed queue");

  return (
    <div className="flex flex-col px-5 py-6 md:px-8">
      <div className="flex items-center gap-2.5 pl-[17px] text-[13px]">
        <span className="size-2.5 rounded-full bg-ink" aria-hidden="true" />
        <span className="font-medium text-ink">New lead</span>
        {counts ? <span className="ml-3 text-[12px] text-muted tabular-nums">{fmt(counts.total)} this week</span> : null}
      </div>
      <Connector count={null} lit={lit("spam")} runKey={p.runKey} />
      <StepCard
        title="Spam check"
        summary={spamOn.join(", ").replace(/^./, (c) => c.toUpperCase())}
        on={body.spam.on}
        onToggle={toggle("spam")}
        selected={sameSelection(sel, { kind: "spam" })}
        onClick={() => onSelect({ kind: "spam" })}
        mark={path?.marks.spam}
        faded={!reached("spam")}
        problem={problemFor("spam")?.text}
        branch={counts?.held && body.spam.on ? `${fmt(counts.held)} held for you to check` : null}
        branchLit={path?.marks.spam === "miss"}
        runKey={p.runKey}
      />
      <Connector count={counts?.afterSpam ?? null} lit={lit("account")} runKey={p.runKey} />
      <StepCard
        title="Existing company"
        summary={body.account.oppFirst ? "Goes to the deal owner, or else the company owner" : "Goes to the company owner"}
        on={body.account.on}
        onToggle={toggle("account")}
        selected={sameSelection(sel, { kind: "account" })}
        onClick={() => onSelect({ kind: "account" })}
        mark={path?.marks.account}
        faded={!reached("account")}
        problem={problemFor("account")?.text}
        branch={counts?.matched && body.account.on ? `${fmt(counts.matched)} went to their company's rep` : null}
        branchLit={path?.marks.account === "ok" && !path.reached.has("keep")}
        runKey={p.runKey}
      />
      <Connector count={counts?.afterAccount ?? null} lit={lit("keep")} runKey={p.runKey} />
      <StepCard
        title="Current rep"
        summary={WHEN_OUT[body.keep.whenOut]}
        on={body.keep.on}
        onToggle={toggle("keep")}
        selected={sameSelection(sel, { kind: "keep" })}
        onClick={() => onSelect({ kind: "keep" })}
        mark={path?.marks.keep}
        faded={!reached("keep")}
        problem={problemFor("keep")?.text}
        branch={counts?.kept && body.keep.on ? `${fmt(counts.kept)} kept their rep` : null}
        branchLit={path?.marks.keep === "ok" && !path.reached.has("rules")}
        runKey={p.runKey}
      />
      <Connector count={counts?.afterKeep ?? null} lit={lit("rules")} runKey={p.runKey} />
      <RulesCard {...p} faded={!reached("rules")} problemFor={problemFor} />
      <Connector count={counts?.noRule ?? null} lit={lit("fallback")} runKey={p.runKey} />
      <StepCard
        title="Everyone else"
        summary={fb ? `Goes to ${fbName}` : "Pick a rep or team"}
        selected={sameSelection(sel, { kind: "fallback" })}
        onClick={() => onSelect({ kind: "fallback" })}
        mark={path?.marks.fallback}
        faded={!reached("fallback")}
        problem={problemFor("fallback")?.text}
        runKey={p.runKey}
      />
      <Connector count={null} lit={false} runKey={p.runKey} />
      <StepCard
        title="Time to reach out"
        summary={body.sla ? `${minutesWords(body.sla.minutes)}, ${SLA_NEXT_WORDS[body.sla.next]}` : ""}
        on={!!body.sla?.on}
        onToggle={edit ? (on: boolean) => edit((b) => ({ ...b, sla: { ...(b.sla ?? defaultSla()), on } })) : undefined}
        selected={sameSelection(sel, { kind: "sla" })}
        onClick={() => onSelect({ kind: "sla" })}
        faded={!!path}
        problem={problemFor("sla")?.text}
        runKey={p.runKey}
      />
      <Queues {...p} problemFor={problemFor} />
    </div>
  );
}

/** The line between two cards, with its count. Lit lines draw in along the stroke (slow). */
function Connector({ lit, runKey }: { count?: number | null; lit: boolean; runKey: number }) {
  return (
    <div className="relative flex h-6 items-center pl-[21px]">
      <svg width="2" height="24" viewBox="0 0 2 24" className="absolute top-0 left-[21px] overflow-visible" aria-hidden="true">
        <path d="M1 0V24" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeLinecap="round" />
        {lit ? <path key={runKey} d="M1 0V24" pathLength={1} stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" style={{ strokeDasharray: 1, animation: "draw 700ms var(--ease-out) both" }} /> : null}
      </svg>
    </div>
  );
}

function MarkDot({ mark }: { mark: RunLine["mark"] | undefined }) {
  if (!mark) return null;
  if (mark === "ok")
    return (
      <span className="anim-pop flex size-5 shrink-0 items-center justify-center rounded-full bg-sage-wash text-sage" aria-label="Decided">
        <Check size={12} />
      </span>
    );
  if (mark === "miss")
    return (
      <span className="anim-pop flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep text-muted" aria-label="Passed on">
        <X size={11} />
      </span>
    );
  return (
    <span className="flex size-5 shrink-0 items-center justify-center text-faint" aria-label="Nothing to do">
      –
    </span>
  );
}

function StepCard({
  title,
  summary,
  on,
  onToggle,
  selected,
  onClick,
  mark,
  faded,
  problem,
  branch,
  branchLit = false,
  runKey,
  children,
}: {
  title: string;
  summary: string;
  on?: boolean;
  onToggle?: (on: boolean) => void;
  selected: boolean;
  onClick: () => void;
  mark?: RunLine["mark"];
  faded: boolean;
  problem?: string;
  branch?: string | null;
  branchLit?: boolean;
  runKey: number;
  children?: React.ReactNode;
}) {
  const off = on === false;
  return (
    <div className="flex items-start">
      <div
        className={`w-full max-w-[380px] rounded-2xl border bg-card transition-[opacity,transform,box-shadow] duration-[140ms] ease-out ${selected ? "border-ink" : "border-line hover:-translate-y-px hover:shadow-soft"} ${faded ? "opacity-40" : off ? "opacity-60" : ""}`}
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <MarkDot mark={mark} />
          <button type="button" onClick={onClick} aria-pressed={selected} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
            <span className="block text-[13.5px] font-medium text-ink">{title}</span>
            {summary && !off ? <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{summary}</span> : null}
          </button>
          {onToggle ? <Toggle label={`${title} on`} on={!off} onChange={onToggle} /> : null}
        </div>
        {problem ? (
          <button type="button" onClick={onClick} className="-mt-1 flex w-full items-center gap-2 px-4 pb-3 text-left text-[12px] text-rose">
            <span className="size-1.5 shrink-0 rounded-full bg-rose" />
            {problem}
          </button>
        ) : null}
        {children}
      </div>
      {branch ? <Branch text={branch} lit={branchLit} runKey={runKey} /> : null}
    </div>
  );
}

/** A route that ends here, off to the right with its count. */
function Branch({ text, lit, runKey }: { text: string; lit: boolean; runKey: number }) {
  return (
    <div className="mt-5 hidden shrink-0 items-center gap-2 sm:flex">
      <svg width="40" height="8" viewBox="0 0 40 8" className="overflow-visible" aria-hidden="true">
        <path d="M0 4H36M32 1l4 3-4 3" stroke="var(--color-line-strong)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {lit ? <path key={runKey} d="M0 4H36M32 1l4 3-4 3" pathLength={1} stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ strokeDasharray: 1, animation: "draw 700ms var(--ease-out) both" }} /> : null}
      </svg>
      <span className={`text-[12px] tabular-nums ${lit ? "font-medium text-ink" : "text-muted"}`}>{text}</span>
    </div>
  );
}

function RulesCard(p: FlowProps & { faded: boolean; problemFor: (k: Problem["where"]["kind"], id?: string) => Problem | undefined }) {
  const { body, edit, sel, onSelect, counts, path } = p;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onEnd = (e: DragEndEvent) => {
    if (!edit || !e.over || e.active.id === e.over.id) return;
    const to = body.rules.list.findIndex((r) => r.id === e.over!.id);
    if (to >= 0) edit((b) => moveRuleTo(b, String(e.active.id), to));
  };
  const off = !body.rules.on;
  const selected = sameSelection(sel, { kind: "rules" });
  return (
    <div className={`w-full max-w-[380px] rounded-2xl border bg-card transition-[opacity,transform,box-shadow] duration-[140ms] ease-out ${selected ? "border-ink" : "border-line"} ${p.faded ? "opacity-40" : off ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-1.5">
        <MarkDot mark={path?.marks.rules} />
        <button type="button" onClick={() => onSelect({ kind: "rules" })} aria-pressed={selected} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
          <span className="block text-[13.5px] font-medium text-ink">Rules</span>
        </button>
        {edit ? <Toggle label="Use rules" on={!off} onChange={(on) => edit((b) => ({ ...b, rules: { ...b.rules, on } }))} /> : null}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={body.rules.list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col px-2" aria-label="Rules">
            {body.rules.list.map((r, i) => (
              <RuleRow
                key={r.id}
                rule={r}
                index={i}
                last={i === body.rules.list.length - 1}
                queue={body.queues.find((q) => q.id === r.queue)?.name ?? null}
                count={counts ? (counts.rules[r.id] ?? 0) : null}
                unused={!!counts && counts.total > 0 && !!p.liveRules?.has(r.id) && !(counts.rules[r.id] ?? 0)}
                selected={sameSelection(sel, { kind: "rule", id: r.id })}
                matched={path?.rule === r.id}
                problem={p.problemFor("rule", r.id)?.text}
                onSelect={() => onSelect({ kind: "rule", id: r.id })}
                edit={edit}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      
      {edit ? (
        <div className="px-2 pt-0.5 pb-2">
          <button
            type="button"
            onClick={() => {
              const id = newId("r_");
              edit((b) => addRule(b, id));
              onSelect({ kind: "rule", id });
            }}
            className="press inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover"
          >
            <Plus size={12} />
            Add a rule
          </button>
        </div>
      ) : (
        <div className="h-2" />
      )}
    </div>
  );
}

function RuleRow({
  rule,
  index,
  last,
  queue,
  count,
  unused,
  selected,
  matched,
  problem,
  onSelect,
  edit,
}: {
  rule: Rule;
  index: number;
  last: boolean;
  queue: string | null;
  count: number | null;
  unused: boolean;
  selected: boolean;
  matched: boolean;
  problem?: string;
  onSelect: () => void;
  edit?: Edit;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id, disabled: !edit });
  const [menu, setMenu] = useState<HTMLButtonElement | null>(null);
  const off = rule.on === false;
  const close = () => {
    const m = menu;
    setMenu(null);
    m?.focus();
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex flex-col rounded-lg transition-colors duration-[140ms] ${isDragging ? "relative z-10 bg-card shadow-float" : ""} ${matched ? "bg-sage-wash" : selected ? "bg-hover" : "hover:bg-hover"}`}
    >
      <div className="flex h-9 items-center gap-1.5 pr-1">
        {edit ? (
          <button type="button" {...attributes} {...listeners} tabIndex={-1} aria-label={`Drag rule ${rule.name}`} className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-faint hover:text-ink active:cursor-grabbing">
            <Grip size={12} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="w-4 shrink-0 text-right text-[12px] text-faint tabular-nums">{index + 1}</span>
        <button type="button" onClick={onSelect} aria-pressed={selected} className={`min-w-0 flex-1 truncate text-left text-[13px] outline-none focus-visible:underline ${off ? "text-muted" : "text-ink"}`}>
          {rule.name}
        </button>
        {problem ? <span className="size-1.5 shrink-0 rounded-full bg-rose" aria-label={problem} title={problem} /> : null}
        {off ? <Badge>Off</Badge> : unused ? <Badge>Unused</Badge> : null}
        <span className={`max-w-[120px] truncate text-[12px] ${queue || rule.then === "hold" || rule.then === "owner" ? "text-muted" : "text-rose"}`}>{rule.then === "hold" ? "Held" : rule.then === "owner" ? "Company owner" : (queue ?? "Pick a team")}</span>
        {count ? <span className="w-9 text-right text-[12px] text-muted tabular-nums">{fmt(count)}</span> : null}
        {edit ? (
          <button
            type="button"
            aria-label={`More for ${rule.name}`}
            aria-expanded={!!menu}
            onClick={(e) => (menu ? close() : setMenu(e.currentTarget))}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-ink focus-visible:opacity-100 aria-expanded:opacity-100"
          >
            <MoreHorizontal size={14} />
          </button>
        ) : null}
      </div>
      {menu && edit ? (
        <Popover anchor={menu} onClose={close} width={180}>
          <ul className="p-1">
            <MenuItem
              icon={<ArrowUp size={13} />}
              label="Move up"
              disabled={index === 0}
              onClick={() => {
                edit((b) => moveRule(b, rule.id, -1));
                close();
              }}
            />
            <MenuItem
              icon={<ArrowDown size={13} />}
              label="Move down"
              disabled={last}
              onClick={() => {
                edit((b) => moveRule(b, rule.id, 1));
                close();
              }}
            />
            <MenuItem
              icon={<Trash size={13} />}
              label="Delete"
              danger
              onClick={async () => {
                close();
                if (await askConfirm(`Delete the rule "${rule.name}"?`, { ok: "Delete", danger: true })) edit((b) => removeRule(b, rule.id));
              }}
            />
          </ul>
        </Popover>
      ) : null}
    </li>
  );
}

function MenuItem({ icon, label, onClick, disabled = false, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <li>
      <button type="button" disabled={disabled} onClick={onClick} className={`flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left hover:bg-hover disabled:opacity-40 ${danger ? "text-rose" : "text-ink"}`}>
        {icon}
        {label}
      </button>
    </li>
  );
}

function Queues({ body, sel, onSelect, edit, path, problemFor }: FlowProps & { problemFor: (k: Problem["where"]["kind"], id?: string) => Problem | undefined }) {
  return (
    <div className="mt-8 flex max-w-[560px] flex-wrap items-center gap-1.5">
      <span className="mr-1.5 text-[12px] text-muted">Teams</span>
      {body.queues.map((q) => {
        const on = sameSelection(sel, { kind: "queue", id: q.id });
        const problem = problemFor("queue", q.id);
        return (
          <button
            key={q.id}
            type="button"
            aria-pressed={on}
            title={problem?.text}
            onClick={() => onSelect({ kind: "queue", id: q.id })}
            className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : path?.queue === q.id ? "border-sage bg-sage-wash text-ink" : "border-line-strong bg-card text-ink hover:bg-paper"}`}
          >
            {problem ? <span className="size-1.5 rounded-full bg-rose" aria-label={problem.text} /> : null}
            {q.name}
            <span className={`tabular-nums ${on ? "text-paper/70" : "text-muted"}`}>{q.members.length}</span>
          </button>
        );
      })}
      {edit ? (
        <button
          type="button"
          onClick={() => {
            const id = newId("q_");
            edit((b) => addQueue(b, id));
            onSelect({ kind: "queue", id });
          }}
          className="press inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:border-ink/40 hover:text-ink"
        >
          <Plus size={12} />
          Team
        </button>
      ) : null}
      {!body.queues.length && !edit ? <span className="text-[12.5px] text-faint">None</span> : null}
    </div>
  );
}

/** The flow's shape while it loads. */
export function FlowSkeleton() {
  return (
    <div className="flex flex-col px-5 py-6 md:px-8" aria-label="Loading">
      <div className="anim-shimmer mb-4 h-4 w-40 rounded-full bg-paper-deep" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col">
          <div className="anim-shimmer w-full max-w-[380px] rounded-2xl bg-paper-deep" style={{ height: i === 3 ? 132 : 60, animationDelay: `${i * 0.1}s` }} />
          {i < 4 ? <div className="ml-[21px] h-10 w-px bg-line" /> : null}
        </div>
      ))}
    </div>
  );
}
