"use client";

// The template gallery in New form (docs/interactive-forms-plan.md 5.1): All, Static and Interactive, goal filters,
// search, a drawing per card, and a preview that runs the real form with nothing saved. Use template makes one draft.

import { useMemo, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { GALLERY, GOALS, type GalleryTemplate, type Goal } from "@/lib/forms/gallery";
import type { Form } from "@/lib/forms/schema";
import { Badge } from "../ui";
import { Ic } from "./ic";
import { BTN, GHOST_SM, Seg } from "./parts";
import { PreviewOverlay } from "./PreviewOverlay";

type Kind = "all" | "static" | "interactive";

/** The card's small drawing: what the template does, at a glance. */
function Drawing({ t }: { t: GalleryTemplate }) {
  const line = (w: string) => <i className="block h-[5px] rounded-[3px] bg-line-strong" style={{ width: w }} />;
  const box = <i className="block h-[13px] rounded-[4px] border border-line-strong bg-card" />;
  const card = (on = false) => <i className={`block h-[26px] flex-1 rounded-[5px] border ${on ? "border-signal bg-signal-soft" : "border-line-strong bg-card"}`} />;
  const big = (v: string, tone = "text-ink") => <b className={`text-[19px] leading-none font-medium tracking-[-0.03em] tabular-nums ${tone}`}>{v}</b>;
  const meter = (pct: number) => (
    <i className="block h-[7px] overflow-hidden rounded-full bg-line">
      <i className="block h-full bg-signal" style={{ width: `${pct}%` }} />
    </i>
  );
  const button = <i className="block h-[12px] w-[56px] rounded-full bg-ink" />;
  const inner = {
    fields: [line("32%"), box, line("28%"), box, button],
    price: [<span key="c" className="flex gap-[5px]">{card(true)}{card()}{card()}</span>, line("50%"), big("$500")],
    metric: [line("44%"), <span key="m" className="flex items-baseline gap-[10px]">{big("$3,000")}{big("350%", "text-signal")}</span>, meter(70)],
    meter: [<span key="s">{big("50")}<span className="text-[12px] text-faint">/100</span></span>, meter(50), line("38%")],
    cards: [<span key="c" className="flex gap-[5px]">{card()}{card(true)}{card()}</span>, line("64%"), button],
    check: [line("80%"), line("66%"), line("52%"), button],
    slots: [
      <span key="a" className="flex gap-[4px]">{[0, 1, 2].map((i) => <i key={i} className={`block h-[13px] flex-1 rounded-full border ${i === 1 ? "border-ink bg-ink" : "border-line-strong bg-card"}`} />)}</span>,
      <span key="b" className="flex gap-[4px]">{[0, 1, 2].map((i) => <i key={i} className="block h-[13px] flex-1 rounded-full border border-line-strong bg-card" />)}</span>,
    ],
  }[t.thumb];
  return (
    <span aria-hidden="true" className="flex h-[112px] flex-col justify-center gap-[6px] border-b border-line bg-paper px-[14px]">
      {inner.map((x, i) => (
        <span key={i} className="block">
          {x}
        </span>
      ))}
    </span>
  );
}

export function FormGallery({ tokens, onUse, onBlank, busy }: { tokens?: Partial<Tokens>; onUse: (t: GalleryTemplate) => void; onBlank: () => void; busy: boolean }) {
  const [kind, setKind] = useState<Kind>("all");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ t: GalleryTemplate; form: Form } | null>(null);
  const list = useMemo(() => {
    const words = q.trim().toLowerCase();
    return GALLERY.filter((t) => (kind === "all" || t.kind === kind) && (!goal || t.goal === goal) && (!words || `${t.name} ${t.text} ${t.tags.join(" ")}`.toLowerCase().includes(words)));
  }, [kind, goal, q]);
  const count = (k: Kind) => GALLERY.filter((t) => k === "all" || t.kind === k).length;

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex flex-wrap items-center gap-[8px]">
        <Seg
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: `All ${count("all")}` },
            { value: "static", label: `Static ${count("static")}` },
            { value: "interactive", label: `Interactive ${count("interactive")}` },
          ]}
        />
        <label className="flex h-[30px] min-w-[180px] flex-1 items-center gap-[6px] rounded-full border border-line bg-card px-[10px] text-muted focus-within:border-ink sm:max-w-[260px]">
          <Ic n="search" />
          <input aria-label="Search templates" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint" />
        </label>
      </div>
      <div className="flex flex-wrap gap-[6px]" role="group" aria-label="Goal">
        {GOALS.map((g) => (
          <button key={g.value} type="button" aria-pressed={goal === g.value} onClick={() => setGoal(goal === g.value ? null : g.value)} className={`${GHOST_SM} ${goal === g.value ? "border-ink bg-ink text-card hover:text-card" : ""}`}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-3">
        <button type="button" onClick={onBlank} disabled={busy} className="flex min-h-[200px] flex-col items-center justify-center gap-[6px] rounded-[10px] border border-dashed border-line-strong text-muted transition-colors duration-[120ms] hover:border-ink hover:text-ink">
          <Ic n="plus" />
          Start blank
        </button>
        {list.map((t) => (
          <button key={t.key} type="button" disabled={busy} onClick={() => setOpen({ t, form: t.form() })} className="flex flex-col overflow-hidden rounded-[10px] border border-line bg-card text-left transition-colors duration-[120ms] hover:border-line-strong">
            <Drawing t={t} />
            <span className="flex flex-col gap-[6px] p-[12px]">
              <b className="font-medium text-ink">{t.name}</b>
              <span className="text-[12px] text-muted">{t.text}</span>
              <span className="flex flex-wrap gap-[4px]">
                <Badge tone={t.kind === "interactive" ? "green" : "gray"}>{t.kind === "interactive" ? "Interactive" : "Static"}</Badge>
                {t.tags.map((x) => (
                  <Badge key={x}>{x}</Badge>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
      {!list.length ? <p className="py-[24px] text-center text-muted">No matches</p> : null}
      {open ? (
        <div className="fixed inset-0 z-[60]">
          <PreviewOverlay
            form={open.form}
            tokens={tokens ?? {}}
            banner="Example. Nothing is saved, sent or booked."
            action={
              <button type="button" className={BTN} disabled={busy} onClick={() => onUse(open.t)}>
                Use template
              </button>
            }
            onClose={() => setOpen(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
