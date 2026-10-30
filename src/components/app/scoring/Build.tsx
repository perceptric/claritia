"use client";

// Scoring's first screen (docs/scoring-plan.md Part 2.1): no questions. The assistant reads the site, the CRM and the
// last 90 days of leads, and the model fills in beside it. While the server works, each source gets its own picture;
// when the model is back, what was found and each rule appear one by one, then "Review the model".

import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_FIELDS } from "@/lib/router/conditions";
import type { Finding } from "@/lib/scoring/build";
import { fitFields, type ScoreRule } from "@/lib/scoring/model";
import { pointsWords, ruleWords } from "@/lib/scoring/words";
import { Check } from "../../Icons";
import { AiMark } from "../Ai";
import { Button, ErrorNote, errorText, type ViewProps } from "../ui";
import { Dots as DotCanvas } from "../routing/Flow";
import { scoringApi, type Built } from "./api";

type Source = Finding["source"];
const SOURCES: Source[] = ["site", "crm", "leads"];
const READING: Record<Source, string> = { site: "Reading your website", crm: "Reading your CRM", leads: "Checking the last 90 days of leads" };

export function Build({ session, ws, forms, site, model, onDone }: Pick<ViewProps, "session" | "ws"> & { forms: { id: string; name: string }[]; site: { name: string | null; domain: string | null }; model: string | null; onDone: () => void }) {
  const [built, setBuilt] = useState<Built | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    setError("");
    setBuilt(null);
    setShown(0);
    scoringApi<Built>(session, ws.id, "build", { model }).then(setBuilt, (e) => setError(errorText(e)));
  }, [session, ws.id, model, run]);

  // While the server works, the sources take turns.
  useEffect(() => {
    if (built || error) return;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [built, error]);

  const sourceName: Record<Source, string> = { site: site.domain ?? "Your website", crm: "CRM", leads: "Past leads" };
  const words = useMemo(() => ({ fields: fitFields(BASE_FIELDS), forms: Object.fromEntries(forms.map((f) => [f.id, f.name])) }), [forms]);
  const steps = useMemo(() => {
    if (!built) return [];
    const out: ({ kind: "finding"; f: Finding } | { kind: "rule"; group: string; side: "fit" | "act" | "minus"; max?: number; r: ScoreRule })[] = [];
    const rules = [...built.body.groups.flatMap((g) => g.rules.map((r) => ({ kind: "rule" as const, group: g.name, side: g.side, max: g.max, r }))), ...built.body.minus.map((r) => ({ kind: "rule" as const, group: "Points taken away", side: "minus" as const, r }))];
    // A finding, then the rules it led to, so the model grows as the reading goes.
    const per = Math.max(1, Math.ceil(rules.length / Math.max(1, built.findings.length)));
    built.findings.forEach((f, i) => out.push({ kind: "finding", f }, ...rules.slice(i * per, (i + 1) * per)));
    out.push(...rules.slice(built.findings.length * per));
    return out;
  }, [built]);

  useEffect(() => {
    if (!built || shown >= steps.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setShown((n) => (reduce ? steps.length : n + 1)), reduce ? 0 : steps[shown]?.kind === "finding" ? 150 : 60);
    return () => clearTimeout(t);
  }, [built, shown, steps]);

  const visible = steps.slice(0, shown);
  const findings = visible.flatMap((s) => (s.kind === "finding" ? [s.f] : []));
  const rules = visible.flatMap((s) => (s.kind === "rule" ? [s] : []));
  const total = steps.filter((s) => s.kind === "rule").length;
  const done = !!built && shown >= steps.length;
  const current: Source = built ? (findings[findings.length - 1]?.source ?? "site") : SOURCES[tick % 3]!;
  const doneSources = new Set<Source>(built ? (done ? SOURCES : SOURCES.slice(0, SOURCES.indexOf(current))) : SOURCES.slice(0, Math.min(2, tick) % 3));
  const groups = [...new Set(rules.map((r) => `${r.side}|${r.group}`))];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-4 px-5 pt-6 pb-2 md:px-8">
          <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${done ? "bg-signal-soft text-signal" : "bg-paper-deep text-ink"}`}>
            <span className={done ? "" : "sc-breathe"}>{done ? <Check size={16} /> : <AiMark size={17} />}</span>
            {done || error ? null : <span className="sc-ring absolute -inset-1 rounded-full border-[1.5px] border-ink border-r-transparent border-b-transparent" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">Building your lead scoring model</h2>
            <p className="text-[13px] text-muted" aria-live="polite">
              {error ? "The build stopped." : done ? `Done. About ${built!.stats.perWeek} sales-ready leads a week. Your team can take ${built!.body.capacity}.` : READING[current]}
            </p>
          </div>
        </div>
        {error ? (
          <div className="flex flex-col items-start gap-2 px-5 py-4 md:px-8">
            <ErrorNote message={error} />
            <Button size="sm" variant="ghost" onClick={() => setRun((n) => n + 1)}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 px-5 py-4 md:px-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <span key={s} className={`inline-flex h-[30px] items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors duration-[200ms] ${s === current && !done ? "border-ink text-ink" : doneSources.has(s) ? "border-line text-body" : "border-line text-faint"}`}>
                    <span className={`size-2 rounded-full ${doneSources.has(s) ? "bg-signal" : s === current ? "bg-ink" : "bg-line-strong"}`} />
                    {sourceName[s]}
                  </span>
                ))}
              </div>
              <Stage source={current} built={built} />
              <ul className="flex flex-col gap-2" aria-label="What the assistant found">
                {findings.slice(-6).reverse().map((f) => (
                  <li key={f.text} className="anim-rise-sm flex items-baseline gap-2.5 text-[13px] text-ink">
                    <span className="shrink-0 rounded-full border border-line px-2 py-px text-[11px] text-muted">{sourceName[f.source]}</span>
                    {f.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative min-h-[380px] min-w-0 overflow-hidden rounded-[10px] border border-line">
              <DotCanvas />
              <div className="relative flex flex-col gap-3.5 p-4">
                <div className="grid gap-3.5 md:grid-cols-2">
                  {(["fit", "act"] as const).map((side) => (
                    <div key={side} className="flex min-w-0 flex-col gap-2.5">
                      <span className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase">{side === "fit" ? "Fit" : "Activity"}</span>
                      {groups.filter((g) => g.startsWith(`${side}|`)).map((g) => (
                        <MiniCard key={g} name={g.split("|")[1]!} max={rules.find((r) => `${r.side}|${r.group}` === g)?.max} rows={rules.filter((r) => `${r.side}|${r.group}` === g).map((r) => r.r)} words={words} />
                      ))}
                    </div>
                  ))}
                </div>
                {groups.some((g) => g.startsWith("minus|")) ? (
                  <div className="mx-auto w-full max-w-[420px]">
                    <MiniCard name="Points taken away" rows={rules.filter((r) => r.side === "minus").map((r) => r.r)} words={words} />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line px-5 py-3 md:px-8">
        <span className="block h-1.5 w-44 overflow-hidden rounded-full bg-paper-deep">
          <span className="block h-full rounded-full bg-ink transition-[width] duration-[300ms]" style={{ width: `${total ? (rules.length / total) * 100 : built ? 100 : 0}%` }} />
        </span>
        <span className="text-[12.5px] text-muted tabular-nums">{built ? (done ? `${total} rules` : `${rules.length} of ${total} rules`) : "Reading"}</span>
        <span className="flex-1" />
        {done ? (
          <Button onClick={onDone} autoFocus>
            Review the model
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MiniCard({ name, max, rows, words }: { name: string; max?: number; rows: ScoreRule[]; words: Parameters<typeof ruleWords>[1] }) {
  return (
    <div className="anim-pop rounded-[10px] border border-line bg-card px-1.5 pt-2 pb-1.5">
      <div className="flex items-center px-1.5 pb-1">
        <b className="flex-1 text-[13px] font-medium text-ink">{name}</b>
        {max ? <span className="text-[11.5px] text-muted tabular-nums">max {max}</span> : null}
      </div>
      {rows.map((r) => (
        <div key={r.id} className="sc-row flex min-h-7 items-center gap-2 rounded-[6px] px-1.5 text-[12.5px] text-ink">
          <span className="min-w-0 flex-1 truncate">{ruleWords(r, words)}</span>
          <Points r={r} />
        </div>
      ))}
    </div>
  );
}

export function Points({ r }: { r: ScoreRule }) {
  return (
    <span className={`inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11.5px] tabular-nums ${r.remove || r.points < 0 ? "bg-rose-wash text-rose" : "bg-paper-deep text-ink"} ${r.remove ? "font-medium" : "font-mono"}`}>
      {pointsWords(r)}
    </span>
  );
}

/** A picture for the source being read: a page being scanned, won deals by company size, past leads as dots. */
function Stage({ source, built }: { source: Source; built: Built | null }) {
  const dots = useMemo(() => {
    const met = built ? Math.round((built.stats.base / 100) * 180) : 22;
    return Array.from({ length: 180 }, (_, i) => ({ m: (i * 37) % 180 < met, d: (i % 30) * 22 + Math.floor(i / 30) * 70 }));
  }, [built]);
  const on = (s: Source) => (source === s ? "sc-on opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2");
  return (
    <div className="relative h-[190px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-paper" aria-hidden="true">
      <div className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-[200ms] ${on("site")}`}>
        <div className="flex h-[140px] w-[220px] flex-col gap-[7px] rounded-[8px] border border-line bg-card p-2.5 shadow-[0_8px_24px_-12px_rgb(10_10_10/0.2)]">
          <i className="block h-1.5 w-2/5 rounded-[3px] bg-paper-deep" />
          <i className="block h-3 w-4/5 rounded-[3px] bg-line-strong" />
          <i className="block h-1.5 rounded-[3px] bg-paper-deep" />
          <i className="block h-1.5 w-3/5 rounded-[3px] bg-paper-deep" />
          <span className="flex gap-1.5">
            <i className="block h-3.5 w-14 rounded-full bg-ink" />
            <i className="block h-3.5 w-14 rounded-full border border-line-strong" />
          </span>
          <i className="mt-auto block h-7 rounded-[3px] bg-paper-deep" />
        </div>
        {source === "site" ? <span className="sc-scan absolute left-1/2 h-0.5 w-[250px] -translate-x-1/2 bg-signal shadow-[0_0_12px_var(--color-signal)]" /> : null}
      </div>
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 transition-[opacity,transform] duration-[200ms] ${on("crm")}`}>
        <div className="flex h-[120px] items-end gap-3">
          {[18, 34, 92, 78, 30, 12].map((h, i) => (
            <span key={i} className="flex h-full w-[30px] flex-col items-center justify-end gap-1">
              <i className={`sc-bar block w-full rounded-t-[4px] ${i === 2 || i === 3 ? "bg-ink" : "bg-line-strong"}`} style={{ ["--h" as string]: `${h}%`, transitionDelay: `${i * 90}ms` }} />
              <small className="text-[10px] whitespace-nowrap text-muted">{["1–10", "11–50", "51–200", "201–1k", "1k–5k", "5k+"][i]}</small>
            </span>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">Customers by company size</span>
      </div>
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 transition-[opacity,transform] duration-[200ms] ${on("leads")}`}>
        <div className="grid w-[min(330px,90%)] grid-cols-[repeat(30,1fr)] gap-1">
          {dots.map((d, i) => (
            <i key={i} className={`sc-dot block aspect-square rounded-full bg-line-strong ${d.m ? "sc-m" : ""}`} style={{ ["--d" as string]: `${d.d}ms` }} />
          ))}
        </div>
        <span className="text-[11.5px] text-muted">Green dots met sales</span>
      </div>
    </div>
  );
}
