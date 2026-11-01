"use client";

// New form, built by AI (docs/ai-form-builder.md): the site and the goal, then the questions Claude writes for this
// business, then the build with its progress, then the form opens in the builder with a short summary of what to
// replace before publishing. No templates.

import { useEffect, useState } from "react";
import { GOALS, type AskQuestion, type Brief, type BuildSummary, type Goal } from "@/lib/forms/aiBuild";
import type { Form } from "@/lib/forms/schema";
import { AiMark } from "../Ai";
import { ErrorNote, errorText, must, postJson, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { BTN, Dialog, Dots, EYEBROW, GHOST, GHOST_SM, IN } from "./parts";

type Stage = "start" | "reading" | "questions" | "building";
/** A picked answer: black with white text, and it stays white on hover. */
const PICKED = "press inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-full border border-ink bg-ink px-[10px] text-[12px] whitespace-nowrap text-card";
/** The summary the builder shows once, the first time the form opens. */
export const SUMMARY_KEY = "claritia:form-ai-summary:";

const STEPS = ["Reading what you sell", "Writing the questions", "Adding prices, scores and results", "Checking every path and outcome", "Fixing what didn't pass"];

export function AiCreate({ sb, session, ws, navigate, site, kitId, meetingType, onClose, note: initialNote = "" }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { site: string; kitId: string | null; meetingType: string | null; onClose: () => void; note?: string }) {
  const [stage, setStage] = useState<Stage>("start");
  const [url, setUrl] = useState(site);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [note, setNote] = useState(initialNote);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  // The brand kit the form takes: the workspace's, or one scanned from this site now (it fills in while Claude builds).
  const [kit, setKit] = useState<string | null>(kitId);

  useEffect(() => {
    if (stage !== "building") return;
    const t = setInterval(() => setTick((n) => Math.min(n + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, [stage]);

  const start = async () => {
    if (!goal) return;
    setError("");
    setStage("reading");
    try {
      if (!kit && url.trim()) {
        const scan = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: url.trim() }).catch(() => null);
        if (scan?.kitId) setKit(scan.kitId);
      }
      const read = url.trim() ? await postJson<{ brief: Brief | null; error?: string }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "read", url: url.trim() }).catch(() => ({ brief: null })) : { brief: null };
      setBrief(read.brief);
      const ask = await postJson<{ questions: AskQuestion[] }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "ask", brief: read.brief, goal, note });
      setQuestions(ask.questions);
      setStage("questions");
    } catch (e) {
      setError(errorText(e));
      setStage("start");
    }
  };

  const build = async () => {
    setError("");
    setTick(0);
    setStage("building");
    try {
      const r = await postJson<{ name: string; form: Form; summary: BuildSummary }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "build", brief, goal, note, answers, site: url.trim() });
      const form = r.form;
      if (goal === "book" && meetingType && !form.after.schedule) form.after.schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: meetingType };
      const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: r.name, p_draft: form, p_brand_kit: kit, p_kind: "built" })) as string;
      try {
        sessionStorage.setItem(`${SUMMARY_KEY}${id}`, JSON.stringify(r.summary));
      } catch {}
      navigate("forms", id);
    } catch (e) {
      setError(errorText(e));
      setStage("questions");
    }
  };

  const pick = (q: AskQuestion, v: string) => {
    if (q.kind === "multi") {
      const cur = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
      setAnswers({ ...answers, [q.id]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
    } else setAnswers({ ...answers, [q.id]: v });
  };
  const on = (q: AskQuestion, v: string) => (Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).includes(v) : answers[q.id] === v);

  if (stage === "reading" || stage === "building")
    return (
      <Dialog label="Building the form" onClose={() => undefined}>
        <span className={EYEBROW}>New form</span>
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{stage === "reading" ? `Reading ${url.replace(/^https?:\/\//, "").replace(/\/$/, "") || "your goal"}` : "Building your form"}</h2>
        <div className="flex flex-col gap-[8px] py-[6px]">
          {(stage === "reading" ? ["Reading the site's pages", "Writing questions for you"] : STEPS.slice(0, tick + 1)).map((l, i, all) => (
            <div key={l} className="anim-rise-sm flex items-center gap-[10px] text-ink">
              <span className={`inline-flex size-[18px] shrink-0 items-center justify-center rounded-full ${i < all.length - 1 ? "bg-signal-soft text-signal" : "bg-paper-deep text-muted"}`}>{i < all.length - 1 ? <Ic n="check" s={11} /> : <Dots />}</span>
              {l}
            </div>
          ))}
        </div>
      </Dialog>
    );

  if (stage === "questions")
    return (
      <Dialog label="A few questions" onClose={onClose} wide>
        <span className={`${EYEBROW} inline-flex items-center gap-[6px]`}>
          <AiMark size={12} />
          {brief?.name ? `For ${brief.name}` : "A few questions"}
        </span>
        <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">A few questions first</h2>
        <div className="flex flex-col gap-[16px]">
          {questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-[8px]">
              <span className="font-medium text-ink">{q.question}</span>
              {q.kind === "text" ? (
                <textarea className={`${IN} h-[64px] py-[8px]`} aria-label={q.question} value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              ) : (
                <div className="flex flex-wrap gap-[6px]">
                  {q.options.map((o) => (
                    <button key={o} type="button" aria-pressed={on(q, o)} onClick={() => pick(q, o)} className={on(q, o) ? PICKED : GHOST_SM}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <ErrorNote message={error} />
        <div className="flex flex-wrap items-center justify-end gap-[8px]">
          <button type="button" className={GHOST} onClick={() => setStage("start")}>
            Back
          </button>
          <button type="button" className={BTN} onClick={() => void build()}>
            <AiMark size={13} />
            Build my form
          </button>
        </div>
      </Dialog>
    );

  return (
    <Dialog label="New form" onClose={onClose} wide>
      <span className={EYEBROW}>New form</span>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">What should it do?</h2>
      <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-3">
        {GOALS.map((g) => (
          <button key={g.value} type="button" aria-pressed={goal === g.value} onClick={() => setGoal(g.value)} className={`flex flex-col gap-[4px] rounded-[10px] border p-[12px] text-left transition-colors duration-[120ms] ${goal === g.value ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
            <b className="font-medium text-ink">{g.label}</b>
            <span className="text-[12px] text-muted">{g.text}</span>
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-muted">Your website</span>
        <input className={IN} placeholder="acme.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Your website" />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-muted">Anything it must include</span>
        <textarea className={`${IN} h-[64px] py-[8px]`} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Anything it must include" />
      </label>
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center justify-end gap-[8px]">
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={BTN} disabled={!goal} onClick={() => void start()}>
          Continue
        </button>
      </div>
    </Dialog>
  );
}
