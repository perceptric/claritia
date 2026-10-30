"use client";

// Routing's first screen, in the same spirit as Scoring's (docs/routing-chat-plan.md Part 1): no questions. The
// assistant reads the team, the CRM's owners and the last 90 days of leads and writes a first setup as a draft. While
// it works, each source gets its own picture; then each step of the setup appears, and "Review the setup" opens the
// editor. Without the assistant, a basic setup (everyone takes turns) is one click.

import { useEffect, useMemo, useRef, useState } from "react";
import { planLines, type PlanLine } from "@/lib/router/readback";
import { emptyBody } from "@/lib/router/types";
import { Check } from "../../Icons";
import { AiMark } from "../Ai";
import { Button, ErrorNote, errorText, type ViewProps } from "../ui";
import { routingApi, type ChatOut, type Loaded } from "./api";
import { addQueue } from "./editorModel";
import { Dots as DotCanvas } from "./Flow";

type Source = "team" | "crm" | "leads";
const SOURCES: Source[] = ["team", "crm", "leads"];
const NAME: Record<Source, string> = { team: "Your team", crm: "CRM owners", leads: "Past leads" };
const READING: Record<Source, string> = { team: "Reading your team", crm: "Reading who owns which companies", leads: "Checking where the last 90 days of leads came from" };
const STEP: Record<PlanLine["kind"], string> = { spam: "Is it spam?", account: "Is the company already in your CRM?", keep: "Does the lead already have a rep?", rule: "Rule", fallback: "Fallback", sla: "Time to reach out" };
const ASK = "Set it up for me from my team and the leads of the last 90 days. Don't ask me anything; pick sensible defaults that I can change later.";

export function Build({ session, ws, data, onDone }: Pick<ViewProps, "session" | "ws"> & { data: Loaded; onDone: () => void }) {
  const [out, setOut] = useState<{ chat: ChatOut; lines: PlanLine[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [shown, setShown] = useState(0);
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  const names = useMemo(() => Object.fromEntries(data.members.map((m) => [m.id, m.name])), [data.members]);

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    setError("");
    setOut(null);
    setShown(0);
    (async () => {
      const chat = await routingApi<ChatOut>(session, ws.id, "chat", { message: ASK, revision: data.revision });
      const after = await routingApi<Loaded>(session, ws.id, "load");
      const body = after.draft ?? after.live?.body ?? emptyBody();
      setOut({ chat, lines: planLines(body, { names, fields: after.fields }) });
    })().catch((e) => setError(errorText(e)));
  }, [session, ws.id, data.revision, names, run]);

  useEffect(() => {
    if (out || error) return;
    const t = setInterval(() => setTick((n) => n + 1), 2200);
    return () => clearInterval(t);
  }, [out, error]);

  const steps = out ? [...out.chat.lines.map((l) => ({ kind: "found" as const, text: l })), ...out.lines.map((l) => ({ kind: "step" as const, l }))] : [];
  useEffect(() => {
    if (!out || shown >= steps.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setShown((n) => (reduce ? steps.length : n + 1)), reduce ? 0 : 380);
    return () => clearTimeout(t);
  }, [out, shown, steps.length]);

  const basic = async () => {
    setBusy(true);
    try {
      let b = addQueue(emptyBody(), "q_everyone", "All reps");
      b = { ...b, queues: b.queues.map((q) => ({ ...q, members: data.members.map((m) => ({ user: m.id, weight: 1 })) })), fallback: { kind: "queue", id: "q_everyone" } };
      await routingApi(session, ws.id, "save_draft", { body: b, revision: data.revision });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const takeLegacy = async () => {
    setBusy(true);
    try {
      await routingApi(session, ws.id, "save_draft", { body: data.legacy!.body, revision: data.revision });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const visible = steps.slice(0, shown);
  const found = visible.flatMap((s) => (s.kind === "found" ? [s.text] : []));
  const plan = visible.flatMap((s) => (s.kind === "step" ? [s.l] : []));
  const done = !!out && shown >= steps.length;
  const current: Source = out ? (done ? "leads" : SOURCES[Math.min(2, Math.floor((shown / Math.max(1, steps.length)) * 3))]!) : SOURCES[tick % 3]!;
  const doneSources = new Set<Source>(done ? SOURCES : SOURCES.slice(0, SOURCES.indexOf(current)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-4 px-5 pt-6 pb-2 md:px-8">
          <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${done ? "bg-signal-soft text-signal" : "bg-paper-deep text-ink"}`}>
            <span className={done ? "" : "sc-breathe"}>{done ? <Check size={16} /> : <AiMark size={17} />}</span>
            {done || error ? null : <span className="sc-ring absolute -inset-1 rounded-full border-[1.5px] border-ink border-r-transparent border-b-transparent" aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">Setting up lead routing</h2>
            <p className="text-[13px] text-muted" aria-live="polite">
              {error ? "The setup stopped." : done ? out!.chat.reply || "Done. Check the setup, then publish." : READING[current]}
            </p>
          </div>
        </div>
        {error ? (
          <div className="flex flex-col items-start gap-3 px-5 py-4 md:px-8">
            <ErrorNote message={error} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRun((n) => n + 1)} disabled={busy}>
                Try again
              </Button>
              <Button size="sm" onClick={() => void basic()} disabled={busy || !data.members.length}>
                Start with everyone taking turns
              </Button>
              {data.legacy ? (
                <Button size="sm" variant="ghost" onClick={() => void takeLegacy()} disabled={busy}>
                  Use my current routing
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="grid gap-5 px-5 py-4 md:px-8 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex flex-wrap gap-1.5">
                {SOURCES.map((s) => (
                  <span key={s} className={`inline-flex h-[30px] items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors duration-[200ms] ${s === current && !done ? "border-ink text-ink" : doneSources.has(s) ? "border-line text-body" : "border-line text-faint"}`}>
                    <span className={`size-2 rounded-full ${doneSources.has(s) ? "bg-signal" : s === current ? "bg-ink" : "bg-line-strong"}`} />
                    {NAME[s]}
                  </span>
                ))}
              </div>
              <Stage source={current} members={data.members.map((m) => m.name)} />
              <ul className="flex flex-col gap-2" aria-label="What the assistant set up">
                {found.slice(-6).reverse().map((t) => (
                  <li key={t} className="anim-rise-sm flex items-baseline gap-2.5 text-[13px] text-ink">
                    <span className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-signal" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative min-h-[380px] min-w-0 overflow-hidden rounded-[10px] border border-line">
              <DotCanvas />
              <div className="relative flex flex-col items-center gap-0 p-5">
                {plan.length ? <span className="flex h-8 items-center rounded-full bg-ink px-4 text-[12.5px] font-medium text-paper">New lead</span> : null}
                {plan.map((l, i) => (
                  <div key={`${l.kind}-${l.id ?? i}`} className="flex w-full max-w-[420px] flex-col items-center">
                    <span className="h-4 w-[1.5px] bg-line-strong" aria-hidden="true" />
                    <div className="anim-pop w-full rounded-[10px] border border-line bg-card px-3 py-2">
                      <b className="block text-[12.5px] font-medium text-ink">{l.kind === "rule" && l.name ? l.name : STEP[l.kind]}</b>
                      <span className="sc-row block rounded-[4px] text-[12.5px] text-muted">{l.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-line px-5 py-3 md:px-8">
        <span className="block h-1.5 w-44 overflow-hidden rounded-full bg-paper-deep">
          <span className="block h-full rounded-full bg-ink transition-[width] duration-[300ms]" style={{ width: `${steps.length ? (shown / steps.length) * 100 : 0}%` }} />
        </span>
        <span className="text-[12.5px] text-muted tabular-nums">{out ? `${plan.length} of ${out.lines.length} steps` : "Reading"}</span>
        <span className="flex-1" />
        {done ? (
          <Button onClick={onDone} autoFocus>
            Review the setup
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A picture for the source being read: leads handed out to the team, companies and their owners, leads by country. */
function Stage({ source, members }: { source: Source; members: string[] }) {
  const on = (s: Source) => (source === s ? "sc-on opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2");
  const team = (members.length ? members : ["Rep", "Rep", "Rep"]).slice(0, 5);
  const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="relative h-[190px] shrink-0 overflow-hidden rounded-[10px] border border-line bg-paper" aria-hidden="true">
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 transition-[opacity,transform] duration-[200ms] ${on("team")}`}>
        <span className="flex h-7 items-center rounded-full bg-ink px-3 text-[11.5px] font-medium text-paper">New lead</span>
        <div className="flex gap-3">
          {team.map((m, i) => (
            <span key={i} className="sc-dot flex size-10 items-center justify-center rounded-full border border-line bg-card text-[12px] font-semibold text-body" style={{ ["--d" as string]: `${i * 160}ms` }}>
              {initials(m)}
            </span>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">{team.length === 1 ? "1 rep" : `${members.length || team.length} reps`}</span>
      </div>
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 transition-[opacity,transform] duration-[200ms] ${on("crm")}`}>
        <div className="flex h-[110px] items-end gap-3">
          {[64, 88, 40, 72, 30].map((h, i) => (
            <span key={i} className="flex h-full w-[30px] flex-col items-center justify-end gap-1">
              <i className={`sc-bar block w-full rounded-t-[4px] ${i === 1 ? "bg-ink" : "bg-line-strong"}`} style={{ ["--h" as string]: `${h}%`, transitionDelay: `${i * 90}ms` }} />
              <small className="text-[10px] text-muted">{initials(team[i % team.length]!)}</small>
            </span>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">Companies each rep owns</span>
      </div>
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 transition-[opacity,transform] duration-[200ms] ${on("leads")}`}>
        <div className="grid w-[min(330px,90%)] grid-cols-[repeat(30,1fr)] gap-1">
          {Array.from({ length: 180 }, (_, i) => (
            <i key={i} className={`sc-dot block aspect-square rounded-full bg-line-strong ${(i * 37) % 180 < 30 ? "sc-m" : ""}`} style={{ ["--d" as string]: `${(i % 30) * 22 + Math.floor(i / 30) * 70}ms` }} />
          ))}
        </div>
        <span className="text-[11.5px] text-muted">Leads by where they came from</span>
      </div>
    </div>
  );
}
