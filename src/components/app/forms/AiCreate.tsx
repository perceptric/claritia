"use client";

// New form, built live (docs/new-form-studio.md). A full page: a short conversation on the left, the real form on the
// right. Describe the form and pick its styling (a saved brand, Claritia's, or a website to learn); the brand fills
// the preview in seconds. Claude sketches the whole form from the line and the site (one page or steps, shown as a
// real form), asks only what it still needs, one question at a time, and folds each answer into the preview. Last:
// what happens after the send. Create form saves it and opens the builder.

import { useEffect, useMemo, useState } from "react";
import { KINDS, type AskQuestion, type Brief, type BuildSummary, type Kind } from "@/lib/forms/aiBuild";
import type { Tokens } from "@/lib/forms/brand";
import { applyAfter, outline, placeholderForm, toOnePage, toSteps, type AfterChoice } from "@/lib/forms/newForm";
import type { Form } from "@/lib/forms/schema";
import { AiMark } from "../Ai";
import { Select, type Option } from "../Select";
import { ErrorNote, errorText, must, postJson, type ViewProps } from "../ui";
import { useMeetingTypes } from "../meetings/TypesList";
import { Ic } from "./ic";
import { BTN, EYEBROW, GHOST, GHOST_SM, IB, IN, Seg } from "./parts";
import { FormPreview } from "./shared";

export type KitLite = { id: string; tokens?: Partial<Tokens> | null; source_url: string | null; scan_status: string | null };

const hostOf = (u: string | null | undefined) => {
  try {
    return u?.trim() ? new URL(/^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const hasLook = (k: KitLite) => Object.keys(k.tokens ?? {}).length > 0;

/** A picked answer: black with white text, and it stays white on hover. */
const PICKED = "press inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-full border border-ink bg-ink px-[10px] text-[12px] whitespace-nowrap text-card";
/** The summary the builder shows once, the first time the form opens. */
export const SUMMARY_KEY = "claritia:form-ai-summary:";

type Stage = "start" | "sketching" | "questions" | "after" | "creating";
type Style = string | "claritia" | "learn";

/** The waiting animation: dots going round, each one swelling as the wave passes. Still under reduced motion. */
function Throbber({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-[14px] text-muted">
      <span className="relative block size-[64px]" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="nf-dot absolute top-1/2 left-1/2 block size-[9px] rounded-full bg-ink" style={{ transform: `rotate(${i * 45}deg) translate(26px) rotate(${-i * 45}deg)`, animationDelay: `${i * 110}ms` }} />
        ))}
      </span>
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

export function AiCreate({ sb, session, ws, navigate, site, kits: start, onClose, onBlank, note: initialNote = "" }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { site: string; kits: KitLite[]; meetingType?: string | null; onClose: () => void; onBlank?: () => void; note?: string }) {
  const [kits, setKits] = useState<KitLite[]>(start);
  const usable = kits.filter((k) => hasLook(k) || k.scan_status === "scanning");
  const [note, setNote] = useState(initialNote);
  const [style, setStyle] = useState<Style>(() => (usable[0]?.id ?? "learn"));
  const [url, setUrl] = useState(usable.length ? "" : site);
  const [learning, setLearning] = useState(false);
  const [stage, setStage] = useState<Stage>("start");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Form | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [summary, setSummary] = useState<BuildSummary | null>(null);
  const [questions, setQuestions] = useState<AskQuestion[]>([]);
  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [said, setSaid] = useState<{ q: string; a: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [after, setAfter] = useState<AfterChoice>({ kind: "thanks" });
  const [afterUrl, setAfterUrl] = useState("");
  const types = useMeetingTypes(sb, ws.id).data ?? [];

  const kit = kits.find((k) => k.id === style) ?? null;
  const tokens: Partial<Tokens> = (kit?.tokens as Partial<Tokens> | null) ?? {};
  const siteUrl = kit ? (kit.source_url ?? "") : style === "learn" ? url.trim() : "";
  // A website already learned shows as the pick to use, with no message.
  const known = style === "learn" && hostOf(url) ? kits.find((k) => hostOf(k.source_url) === hostOf(url) && (hasLook(k) || k.scan_status === "scanning")) : undefined;

  // While a brand is being read, check back so the preview takes it as soon as it's ready.
  const reading = kit?.scan_status === "scanning" || !kit || !hasLook(kit);
  useEffect(() => {
    if (!kit || !reading) return;
    let n = 0;
    const t = setInterval(async () => {
      if (++n > 60) return clearInterval(t);
      const { data } = await sb.from("brand_kits").select("id, tokens, source_url, scan_status").eq("id", kit.id).maybeSingle();
      if (data) setKits((ks) => ks.map((k) => (k.id === kit.id ? (data as KitLite) : k)));
    }, 3000);
    return () => clearInterval(t);
  }, [sb, kit, reading]);

  const learn = async () => {
    if (!hostOf(url) || learning) return;
    setLearning(true);
    setError("");
    try {
      const r = await postJson<{ kitId: string; tokens?: Partial<Tokens> }>(session, "/api/forms/scan", { workspaceId: ws.id, url: url.trim() });
      setKits((ks) => [{ id: r.kitId, tokens: r.tokens ?? {}, source_url: url.trim(), scan_status: r.tokens ? "done" : "scanning" }, ...ks.filter((k) => k.id !== r.kitId)]);
      setStyle(r.kitId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLearning(false);
    }
  };

  const sketch = async () => {
    if (!note.trim()) return;
    setError("");
    setStage("sketching");
    try {
      const r = await postJson<{ brief: Brief | null; kind: Kind; name: string; form: Form; summary: BuildSummary; questions: AskQuestion[] }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "sketch", note: note.trim(), url: siteUrl, kitId: kit?.id ?? null });
      setBrief(r.brief);
      setKind(r.kind);
      setName(r.name);
      setDraft(r.form);
      setSummary(r.summary);
      setQuestions(r.questions);
      setAt(0);
      setSaid([]);
      setAnswer("");
      setStage(r.questions.length ? "questions" : "after");
    } catch (e) {
      setError(errorText(e));
      setStage("start");
    }
  };

  const q = questions[at];
  const next = () => {
    setAnswer("");
    if (at + 1 < questions.length) setAt(at + 1);
    else setStage("after");
  };
  const reply = async () => {
    if (!q || !draft || busy) return;
    const a = answer;
    if (Array.isArray(a) ? !a.length : !a.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ name: string; form: Form; summary: BuildSummary }>(session, "/api/forms/ai", { workspaceId: ws.id, mode: "refine", form: draft, kind, brief, question: q.question, answer: a, kitId: kit?.id ?? null });
      setDraft(r.form);
      setName(r.name || name);
      setSummary(r.summary);
      setSaid((s) => [...s, { q: q.question, a: Array.isArray(a) ? a.join(", ") : a }]);
      next();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const pick = (v: string) => {
    if (!q) return;
    if (q.kind === "multi") {
      const cur = Array.isArray(answer) ? answer : [];
      setAnswer(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    } else setAnswer(v);
  };
  const on = (v: string) => (Array.isArray(answer) ? answer.includes(v) : answer === v);

  // What the preview shows: the draft with the after-send choice, or the brand on a placeholder before the sketch.
  const shown = useMemo(() => {
    if (!draft) return placeholderForm(note.trim() ? note.trim().replace(/^./, (c) => c.toUpperCase()) : "Your form");
    return stage === "after" || stage === "creating" ? applyAfter(draft, after.kind === "page" ? { kind: "page", url: /^https:\/\//.test(afterUrl) ? afterUrl : "https://example.com" } : after) : draft;
  }, [draft, note, stage, after, afterUrl]);
  const steps = draft ? outline(draft) : [];
  const multi = steps.filter((s) => !s.result).length > 1;
  const hasResults = !!draft?.steps.some((s) => s.result);
  const newMeeting = after.kind === "meeting" && !after.meetingTypeId;

  const create = async () => {
    if (!draft) return;
    if (after.kind === "page" && !/^https:\/\/[^\s]+\.[^\s]+/.test(afterUrl)) return setError("Enter the page's full address, starting with https://.");
    setError("");
    setStage("creating");
    try {
      const form = applyAfter(draft, after.kind === "page" ? { kind: "page", url: afterUrl } : after);
      const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: (name || "New form").slice(0, 120), p_draft: form, p_brand_kit: kit?.id ?? null, p_kind: "built" })) as string;
      try {
        if (summary) sessionStorage.setItem(`${SUMMARY_KEY}${id}`, JSON.stringify(summary));
      } catch {}
      // A meeting still to make: the form opens on On Submission, where it's made.
      navigate("forms", id, newMeeting ? "open=submission" : undefined);
    } catch (e) {
      setError(errorText(e));
      setStage("after");
    }
  };

  const styleOptions: Option<string>[] = [
    ...usable.map((k) => ({ value: k.id, label: hostOf(k.source_url) || "Your brand", group: "Your brands" })),
    { value: "claritia", label: "Claritia", group: "More" },
    { value: "learn", label: "Learn from a website", group: "More" },
  ];
  const kindLabel = KINDS.find((k) => k.value === kind)?.label;
  const thinking = stage === "sketching" || busy || stage === "creating";

  return (
    <div role="dialog" aria-modal="true" aria-label="New form" className="anim-fade absolute inset-0 z-[60] grid grid-cols-[minmax(340px,440px)_minmax(0,1fr)] bg-card max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(420px,1fr)] max-[860px]:overflow-y-auto">
      {/* The conversation */}
      <section className="flex min-h-0 flex-col border-r border-line max-[860px]:border-r-0 max-[860px]:border-b">
        <div className="flex h-[48px] shrink-0 items-center gap-[8px] border-b border-line px-[16px]">
          <span className={EYEBROW}>New form</span>
          <span className="flex-1" />
          {onBlank && stage === "start" ? (
            <button type="button" className={GHOST_SM} onClick={onBlank}>
              <Ic n="plus" />
              Blank form
            </button>
          ) : null}
          <button type="button" className={IB} onClick={onClose} aria-label="Close" title="Close" disabled={stage === "creating"}>
            <Ic n="x" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[20px] py-[20px]">
          <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
            Let&apos;s build something exciting.
            {stage !== "start" ? <span className="text-faint"> {kindLabel ? `${kindLabel} form.` : ""}</span> : null}
          </h2>

          {/* 1. The line and the styling */}
          <label className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-muted">Describe your form</span>
            <textarea autoFocus className={`${IN} h-[84px] py-[8px]`} placeholder="A patient intake form with consent, medical history and an insurance card upload" value={note} disabled={stage !== "start"} onChange={(e) => setNote(e.target.value)} aria-label="Describe your form" />
          </label>
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] text-muted">Styling</span>
            <Select value={style} options={styleOptions} onChange={(v) => setStyle(v)} ariaLabel="Styling" disabled={stage !== "start"} />
            {style === "learn" && stage === "start" ? (
              <form
                className="flex flex-col gap-[6px]"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (known) setStyle(known.id);
                  else void learn();
                }}
              >
                <div className="flex gap-[6px]">
                  <input className={IN} placeholder="yourcompany.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Website to learn from" />
                  <button type="submit" className={GHOST} disabled={!hostOf(url) || learning}>
                    <AiMark size={13} working={learning} />
                    {learning ? "Reading" : "Learn"}
                  </button>
                </div>
                {known ? (
                  <button type="button" className={`${GHOST_SM} self-start`} onClick={() => setStyle(known.id)}>
                    <Ic n="check" />
                    {hostOf(known.source_url)}
                  </button>
                ) : null}
              </form>
            ) : null}
          </div>
          {stage === "start" ? (
            <button type="button" className={`${BTN} self-start`} disabled={!note.trim() || learning} onClick={() => void sketch()}>
              <AiMark size={13} />
              Sketch it
            </button>
          ) : null}

          {/* 2. The rough sketch */}
          {draft ? (
            <div className="anim-rise-sm flex flex-col gap-[10px] border-t border-line pt-[16px]">
              <b className="font-medium text-ink">Here&apos;s the rough sketch</b>
              <Seg label="Layout" value={multi ? "steps" : "page"} onChange={(v) => setDraft(v === "page" ? toOnePage(draft) : toSteps(draft))} options={[{ value: "page", label: "One page" }, { value: "steps", label: "Steps" }]} />
              <ol className="flex flex-col gap-[4px]">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-[8px] text-[13px] text-ink">
                    <span className="inline-flex size-[20px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] text-muted">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="text-[12px] text-muted">{s.result ? "Results" : `${s.questions} ${s.questions === 1 ? "question" : "questions"}`}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {/* 3. A few more questions */}
          {said.length || (stage === "questions" && q) ? (
            <div className="flex flex-col gap-[10px] border-t border-line pt-[16px]">
              <b className="font-medium text-ink">A few more questions</b>
              {said.map((x, i) => (
                <div key={i} className="flex flex-col gap-[2px]">
                  <span className="text-[12px] text-muted">{x.q}</span>
                  <span className="text-[13px] text-ink">{x.a}</span>
                </div>
              ))}
              {stage === "questions" && q ? (
                <div key={q.id} className="anim-rise-sm flex flex-col gap-[8px]">
                  <span className="text-ink">{q.question}</span>
                  {q.kind === "text" ? (
                    <textarea className={`${IN} h-[64px] py-[8px]`} aria-label={q.question} value={typeof answer === "string" ? answer : ""} onChange={(e) => setAnswer(e.target.value)} disabled={busy} />
                  ) : (
                    <div className="flex flex-wrap gap-[6px]">
                      {q.options.map((o) => (
                        <button key={o} type="button" aria-pressed={on(o)} disabled={busy} onClick={() => pick(o)} className={on(o) ? PICKED : GHOST_SM}>
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-[6px]">
                    <button type="button" className={BTN} disabled={busy || (Array.isArray(answer) ? !answer.length : !answer.trim())} onClick={() => void reply()}>
                      {busy ? "Adding it" : "Next"}
                    </button>
                    <button type="button" className={GHOST} disabled={busy} onClick={next}>
                      Skip
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* 4. After the send */}
          {stage === "after" || stage === "creating" ? (
            <div className="anim-rise-sm flex flex-col gap-[10px] border-t border-line pt-[16px]">
              <b className="font-medium text-ink">What happens after they send it?</b>
              <div className="flex flex-wrap gap-[6px]">
                {(
                  [
                    ["thanks", "Show a thank-you"],
                    ["page", "Go to a page"],
                    ...(hasResults ? [["results", "Email them their results"]] : []),
                    ["meeting", "Book a meeting"],
                  ] as [AfterChoice["kind"], string][]
                ).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={after.kind === k} onClick={() => setAfter(k === "meeting" ? { kind: "meeting", meetingTypeId: types.find((t) => t.active)?.id ?? null } : k === "page" ? { kind: "page", url: afterUrl } : ({ kind: k } as AfterChoice))} className={after.kind === k ? PICKED : GHOST_SM}>
                    {l}
                  </button>
                ))}
              </div>
              {after.kind === "page" ? <input className={IN} placeholder="https://yourcompany.com/thanks" value={afterUrl} onChange={(e) => setAfterUrl(e.target.value)} aria-label="Page to open" /> : null}
              {after.kind === "meeting" ? (
                <>
                  <Select
                    value={after.meetingTypeId ?? "new"}
                    options={[...types.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name })), { value: "new", label: "A new meeting" }]}
                    onChange={(v) => setAfter({ kind: "meeting", meetingTypeId: v === "new" ? null : v })}
                    ariaLabel="Meeting"
                  />
                  {newMeeting ? <span className="text-[12.5px] text-muted">You can create a new meeting once the form is created.</span> : null}
                </>
              ) : null}
              <button type="button" className={`${BTN} self-start`} disabled={stage === "creating"} onClick={() => void create()}>
                {stage === "creating" ? "Creating" : "Create form"}
              </button>
            </div>
          ) : null}
          <ErrorNote message={error} />
        </div>
      </section>

      {/* The live preview */}
      <section aria-label="Live preview" className="relative flex min-h-0 flex-col bg-paper">
        <div className="flex h-[48px] shrink-0 items-center border-b border-line bg-card px-[16px]">
          <span className={EYEBROW}>Live preview</span>
        </div>
        <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-[16px] py-[28px]">
          {!draft && style === "learn" && !kit ? (
            <div className="self-center">
              <Throbber label={stage === "sketching" ? "Sketching your form" : "Waiting for your brand"} />
            </div>
          ) : (
            <div className={`keep-light w-full max-w-[1040px] transition-opacity duration-[200ms] ${thinking ? "opacity-40" : ""}`}>
              <div className="rounded-[14px] p-[24px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)]" style={{ background: (tokens as { background?: string }).background }}>
                <FormPreview form={shown} tokens={tokens} />
              </div>
            </div>
          )}
          {thinking && (draft || kit || style !== "learn") ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Throbber label={stage === "sketching" ? "Sketching your form" : stage === "creating" ? "Creating it" : "Adding your answer"} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
