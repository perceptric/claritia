"use client";

// A run's sentences (src/lib/router/explain.ts), one row per step: ✓, ✗ or –, the step's name, and the sentence with
// names as links. Used by the Test panel, the run panel in Log, Replay's before and after, and the contact page.

import { useState } from "react";
import type { Line, Part } from "@/lib/router/explain";
import { Check, ChevronRight, X } from "../../Icons";

export type LinkTo = (p: Exclude<Part, string>) => void;

function Parts({ parts, onLink }: { parts: Part[]; onLink?: LinkTo }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <span key={i}>{p}</span>
        ) : onLink && p.id ? (
          <button key={i} type="button" onClick={() => onLink(p)} className="font-medium text-ink underline decoration-line underline-offset-2 transition-colors duration-[140ms] hover:decoration-ink">
            {p.text}
          </button>
        ) : (
          <span key={i} className="font-medium text-ink">
            {p.text}
          </span>
        ),
      )}
    </>
  );
}

function Mark({ mark }: { mark: Line["mark"] }) {
  if (mark === "ok")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success" aria-label="Decided">
        <Check size={11} />
      </span>
    );
  if (mark === "miss")
    return (
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-hover text-muted" aria-label="Passed on">
        <X size={10} />
      </span>
    );
  return (
    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-faint" aria-label="Nothing to do">
      –
    </span>
  );
}

function Row({ line, onLink, diff }: { line: Line; onLink?: LinkTo; diff?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`flex gap-2.5 py-1.5 ${diff ? "-mx-2 rounded-lg bg-warning-soft px-2" : ""}`}>
      <Mark mark={line.mark} />
      <div className="min-w-0 flex-1 text-[13px] leading-5">
        <span className="mr-1.5 text-[12px] font-medium text-muted">{line.title}</span>
        <span className="text-body">
          <Parts parts={line.parts} onLink={onLink} />
        </span>
        {line.more?.length ? (
          <div>
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-muted transition-colors duration-[140ms] hover:text-ink">
              <ChevronRight size={12} className={`transition-transform duration-[140ms] ${open ? "rotate-90" : ""}`} />
              {line.step === "rules" ? `${line.more.length} ${line.more.length === 1 ? "rule" : "rules"} skipped` : "Others"}
            </button>
            {open ? (
              <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3 text-[12.5px] text-muted">
                {line.more.map((m, i) => (
                  <li key={i}>
                    <Parts parts={m} onLink={onLink} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** The lines of a run. `differs`: step names to mark (Replay's before and after). */
export function RunLines({ lines, onLink, differs }: { lines: Line[]; onLink?: LinkTo; differs?: Set<string> }) {
  return (
    <ul className="flex flex-col" aria-live="polite">
      {lines.map((l, i) => (
        <Row key={`${l.step}-${i}`} line={l} onLink={onLink} diff={differs?.has(l.step)} />
      ))}
    </ul>
  );
}

/** The steps whose sentence differs between two runs of the same lead. */
export function differing(a: Line[], b: Line[]): Set<string> {
  const text = (l?: Line) => (l ? `${l.mark}|${l.parts.map((p) => (typeof p === "string" ? p : p.text)).join("")}` : "");
  const steps = new Set([...a.map((l) => l.step), ...b.map((l) => l.step)]);
  return new Set([...steps].filter((s) => text(a.find((l) => l.step === s)) !== text(b.find((l) => l.step === s))));
}
