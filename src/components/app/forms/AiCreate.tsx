"use client";

// New form, built by AI (docs/ai-form-builder.md, docs/form-kinds-plan.md): the site and one line on what it's for;
// Claude picks the kind (shown as a pill to change) and writes questions for this business and kind, then builds it
// with the kind's recipe, and the form opens in the builder with a short summary of what to replace. No templates.

import { useEffect, useState } from "react";
import { KINDS, type AskQuestion, type Brief, type BuildSummary, type Kind } from "@/lib/forms/aiBuild";
import type { Form } from "@/lib/forms/schema";
import { AiMark } from "../Ai";
import { ErrorNote, errorText, must, postJson, type ViewProps } from "../ui";
import { Ic } from "./ic";
import { BTN, Dialog, Dots, EYEBROW, GHOST, GHOST_SM, IN } from "./parts";

const hostOf = (u: string | null | undefined) => {
  try {
    return u?.trim() ? new URL(/^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

type Stage = "start" | "reading" | "questions" | "building";
/** A picked answer: black with white text, and it stays white on hover. */
const PICKED = "press inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-full border border-ink bg-ink px-[10px] text-[12px] whitespace-nowrap text-card";
/** The summary the builder shows once, the first time the form opens. */
export const SUMMARY_KEY = "claritia:form-ai-summary:";

const STEPS = ["Reading what you sell", "Writing the questions", "Adding prices, scores and results", "Checking every path and outcome", "Fixing what didn't pass"];

export function AiCreate({ sb, session, ws, navigate, site, kits, meetingType, onClose, onBlank, note: initialNote = "" }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { site: string; kits: { id: string; source_url: string | null; scan_status: string | null; tokens?: object | null }[]; meetingType: string | null; onClose: () => void; onBlank?: () => void; note?: string }) {
  const [stage, setStage] = useState<Stage>("start");
  const [url, setUrl] = useState(site);
  const [kind, setKind] = useState<Kind | null>(null);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  // The brand kit the form takes: one made from this exact site, or a scan of it started now (it fills in while Claude
  // builds). Never another site's kit.
  const [kit, setKit] = useState<string | null>(null);

  useEffect(() => {
    if (stage !== "building") return;
    const t = setInterval(() => setTick((n) => Math.min(n + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, [stage]);

  /** Questions for this kind (or, with none, the kind the AI picks and its questions). */
  const ask = async (b: Brief | null, k: Kind | null) => {
    const r = await postJson<{ kind: Kind; questions: AskQuestion[] }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "ask", brief: b, note, ...(k ? { kind: k } : {}) });
    setKind(r.kind);
    setQuestions(r.questions);
    setAnswers({});
  };
  const rekind = async (k: Kind) => {
    setPicking(false);
    if (k === kind) return;
    setError("");
    setStage("reading");
    try {
      await ask(brief, k);
    } catch (e) {
      setError(errorText(e));
    }
    setStage("questions");
  };

  const start = async () => {
    if (!note.trim()) return;
    setError("");
    setStage("reading");
    try {
      const want = hostOf(url);
      const mine = want ? kits.find((k) => hostOf(k.source_url) === want && (k.scan_status === "scanning" || (k.scan_status === "done" && Object.keys(k.tokens ?? {}).length > 0))) : undefined;
      if (mine) setKit(mine.id);
      else if (!want) setKit(kits[0]?.id ?? null);
      else if (want) {
        const scan = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: url.trim() }).catch(() => null);
        setKit(scan?.kitId ?? null);
      }
      const read = url.trim() ? await postJson<{ brief: Brief | null; error?: string }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "read", url: url.trim() }).catch(() => ({ brief: null })) : { brief: null };
      setBrief(read.brief);
      await ask(read.brief, null);
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
      const r = await postJson<{ name: string; form: Form; summary: BuildSummary }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "build", brief, kind, note, answers, site: url.trim(), kitId: kit });
      const form = r.form;
      if (kind === "booking" && meetingType && !form.after.schedule) form.after.schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: meetingType };
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
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{stage === "reading" ? `Reading ${url.replace(/^https?:\/\//, "").replace(/\/$/, "") || "what you need"}` : "Building your form"}</h2>
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
        <div className="flex flex-wrap items-center gap-[6px]">
          {picking ? (
            KINDS.map((k) => (
              <button key={k.value} type="button" aria-pressed={k.value === kind} title={k.text} onClick={() => void rekind(k.value)} className={k.value === kind ? PICKED : GHOST_SM}>
                {k.label}
              </button>
            ))
          ) : (
            <button type="button" className={PICKED} onClick={() => setPicking(true)} aria-label="Change the kind of form">
              {KINDS.find((k) => k.value === kind)?.label ?? "Form"}
              <Ic n="down" s={11} />
            </button>
          )}
        </div>
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
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">What&apos;s it for?</h2>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-muted">What it&apos;s for</span>
        <textarea autoFocus className={`${IN} h-[72px] py-[8px]`} placeholder="A quote for kitchen remodels" value={note} onChange={(e) => setNote(e.target.value)} aria-label="What it's for" />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[12px] text-muted">Your website</span>
        <input className={IN} placeholder="acme.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Your website" />
      </label>
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center justify-end gap-[8px]">
        {onBlank ? (
          <button type="button" className={`${GHOST} mr-auto`} onClick={onBlank}>
            <Ic n="plus" />
            Blank form
          </button>
        ) : null}
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={BTN} disabled={!note.trim()} onClick={() => void start()}>
          Continue
        </button>
      </div>
    </Dialog>
  );
}
