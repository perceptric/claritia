"use client";

// The one header every form has (docs/form-ui-plan.md step 1): the way back to Forms, the name, one state pill, the
// five tabs and one button that says what to do next (Publish, Publish changes or Share). Form Studio and the older
// builder both sit under it. When the form check finds problems, the button carries their count and opens the list.

import { useEffect, useRef, useState } from "react";
import type { StudioIssue } from "./studio/studio";
import { AiMark } from "../Ai";
import { Popover } from "../FilterBar";
import { Badge, Tabs, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { BTN, EYEBROW, GHOST_SM } from "./parts";

export type FormTab = "build" | "submissions" | "share" | "sync" | "settings";
export type HeaderState = "draft" | "live" | "changed" | "offline";
export type HeaderAction = { label: string; onClick: () => void; disabled?: boolean; problems?: number };

export function StatePill({ state }: { state: HeaderState }) {
  if (state === "live")
    return (
      <Badge tone="green" dot>
        Live
      </Badge>
    );
  if (state === "changed")
    return (
      <Badge tone="amber" dot>
        Changes not live
      </Badge>
    );
  return <Badge>{state === "offline" ? "Offline" : "Draft"}</Badge>;
}

export function FormHeader({
  navigate,
  name,
  onRename,
  state,
  saving,
  tab,
  onTab,
  tabs = true,
  subs = 0,
  syncDot,
  tools,
  more,
  action,
  actionRef,
}: Pick<ViewProps, "navigate"> & {
  name: string;
  onRename?: (n: string) => void;
  state: HeaderState;
  saving?: boolean;
  tab: FormTab;
  onTab: (t: FormTab) => void;
  /** False until the form exists (a new chat in Form Studio). */
  tabs?: boolean;
  subs?: number;
  syncDot?: string;
  tools?: React.ReactNode;
  more?: React.ReactNode;
  action: HeaderAction;
  actionRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <header className="flex min-h-[48px] shrink-0 flex-wrap items-center gap-x-[8px] border-b border-line pr-[12px] pl-[16px] text-[14px] font-medium">
      <button type="button" onClick={() => navigate("forms")} className="inline-flex h-[48px] shrink-0 items-center gap-[6px] font-normal text-muted transition-colors duration-[120ms] hover:text-ink">
        <Ic n="form" />
        <span className="max-[860px]:hidden">Forms</span>
      </button>
      <span className="text-faint">/</span>
      {onRename ? <NameInput value={name} onChange={onRename} /> : <span className="max-w-[40vw] truncate text-ink">{name}</span>}
      <span className="max-[560px]:hidden">
        <StatePill state={state} />
      </span>
      {tabs ? (
        <nav aria-label="Form" className="ml-[12px] self-end max-[1100px]:order-last max-[1100px]:-mx-[16px] max-[1100px]:ml-0 max-[1100px]:w-[calc(100%+28px)] max-[1100px]:border-t max-[1100px]:border-line max-[1100px]:px-[6px]">
          <Tabs<FormTab>
            bare
            dense
            value={tab}
            onChange={onTab}
            tabs={[
              { value: "build", label: "Build", icon: <Ic n="build" /> },
              { value: "submissions", label: "Submissions", icon: <Ic n="inbox" />, count: subs },
              { value: "share", label: "Share", icon: <Ic n="share" /> },
              { value: "sync", label: "Sync", icon: <Ic n="sync" />, dot: syncDot },
              { value: "settings", label: "Settings", icon: <Ic n="gear" /> },
            ]}
          />
        </nav>
      ) : null}
      <span className="flex-1" />
      {saving ? <span className="text-[12px] font-normal whitespace-nowrap text-muted max-[860px]:hidden">Saving</span> : null}
      {tools}
      {more}
      <button ref={actionRef} type="button" data-form-action className={BTN} disabled={action.disabled} onClick={action.onClick} aria-label={action.problems ? `${action.label}, ${action.problems} ${action.problems === 1 ? "problem" : "problems"} to fix` : undefined}>
        {action.label}
        {action.problems ? <span className="-mr-[4px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose px-[5px] text-[11px] font-semibold text-card">{action.problems}</span> : null}
      </button>
    </header>
  );
}

/** The form check under the button: each problem, Fix (Tia) on the ones she can fix, Fix all, Open for On submission. */
export function FormCheck({ anchor, issues, canFix, onFix, onOpenAfter, onClose }: { anchor: HTMLElement | null; issues: StudioIssue[]; canFix: boolean; onFix: (fixes: string[]) => void; onOpenAfter: () => void; onClose: () => void }) {
  const rows = [...issues].sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  const fixable = rows.filter((i) => i.fix).map((i) => i.fix!);
  return (
    <Popover anchor={anchor} onClose={onClose} width={380}>
      <div role="dialog" aria-label="Form check" className="flex flex-col p-[6px]">
        <div className="flex min-h-[34px] items-center gap-[8px] px-[8px]">
          <span className={EYEBROW}>Form check</span>
          <span className="flex-1" />
          {canFix && fixable.length > 1 ? (
            <button type="button" className={GHOST_SM} onClick={() => (onClose(), onFix(fixable))}>
              <AiMark size={13} />
              Fix all
            </button>
          ) : null}
        </div>
        {rows.length ? (
          rows.map((i, n) => (
            <div key={`${i.text}${n}`} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-start gap-[10px] border-t border-line px-[8px] py-[9px] text-[12.5px] leading-[1.45] text-ink">
              <span className={`mt-[5px] size-[8px] rounded-full ${i.level === "error" ? "bg-rose" : "bg-faint"}`} />
              <span>{i.text}</span>
              {i.fix && canFix ? (
                <button type="button" className={GHOST_SM} onClick={() => (onClose(), onFix([i.fix!]))}>
                  <AiMark size={13} />
                  Fix
                </button>
              ) : i.after ? (
                <button type="button" className={GHOST_SM} onClick={() => (onClose(), onOpenAfter())}>
                  Open
                </button>
              ) : (
                <span />
              )}
            </div>
          ))
        ) : (
          <div className="border-t border-line px-[8px] py-[10px] text-[12.5px] text-muted">Nothing to fix</div>
        )}
      </div>
    </Popover>
  );
}

/** The form's name, typed in place in the header. */
function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const box = useRef<HTMLInputElement>(null);
  // A new name from elsewhere (Form Studio's publish) shows unless it's being typed.
  useEffect(() => {
    if (document.activeElement !== box.current) setText(value);
  }, [value]);
  return (
    <input
      ref={box}
      aria-label="Form name"
      value={text}
      maxLength={120}
      size={Math.max(8, text.length)}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim()) onChange(e.target.value.trim());
      }}
      onBlur={() => !text.trim() && setText(value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="-mx-[4px] max-w-[32vw] min-w-[60px] rounded-[4px] bg-transparent px-[4px] py-[2px] text-[14px] font-medium text-ink outline-none [field-sizing:content] hover:bg-hover focus:bg-card focus:shadow-[0_0_0_1px_var(--color-ink)] max-[860px]:max-w-[46vw]"
    />
  );
}
