"use client";

// Build (docs/forms-plan.md): the form drawn as visitors see it, in the brand kit, on a dotted canvas. The bar over it
// has the steps (and After submit) and Desktop | Phone. Hover a question to copy or delete it; click it to edit it in
// the 400 px panel on the right, held in the corner bracket. A "+" between questions opens the type menu. Tags under
// a question say what logic it has, that it's skipped when known, where the consent box shows and what's wrong. The
// AI bar sits at the bottom with what it last did and Undo.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanTokens } from "@/lib/forms/brand";
import type { Op } from "@/lib/forms/ops";
import { condText } from "@/lib/forms/ops";
import { allFields, newId, questionKey, type Field, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import type { RouterBody } from "@/lib/router/types";
import type { ViewProps } from "../ui";
import type { useFormChat } from "./FormChat";
import { AskPill } from "./FormHome";
import { CONSENT_ID, consentBox, GROUP_WORDS, isContentKind, issuesOf, KINDS, known, newQuestion, questionsOf, showRules, type Kind, type Q } from "./formModel";
import { Ic } from "./ic";
import { GHOST_SM, IB_SM, Seg } from "./parts";
import { ButtonPanel, FormPanel, QuestionPanel } from "./Panels";
import type { SetupSub } from "./Setup";
import type { Kit } from "./shared";
import type { useCrm } from "./useCrm";

/** What's picked on the canvas: a question (or "button"), with the panel section that's open. */
export type Pick = { id: string; open: string | null } | null;
type Said = { words: string; undo?: boolean; err?: boolean } | null;

export type BuildProps = ViewProps & {
  form: Form;
  name: string;
  apply: (ops: Op | Op[], words?: string, changed?: string[]) => boolean;
  custom: CustomField[];
  onCustom: (c: CustomField) => void;
  crm: ReturnType<typeof useCrm>;
  routing: RouterBody | null;
  kit: Kit | null;
  kits: Kit[];
  setKit: (id: string | null) => void;
  reloadKits: () => void;
  /** Change the kits on screen before the server answers. */
  patchKits?: (fn: (kits: Kit[]) => Kit[]) => void;
  site: string;
  types: { id: string; name: string; active: boolean; settings?: { lengths?: number[] } }[];
  pick: Pick;
  setPick: (p: Pick) => void;
  step: number;
  setStep: (n: number) => void;
  said: Said;
  setSaid: (s: Said) => void;
  fresh: string[];
  chat: ReturnType<typeof useFormChat>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  saving: "saved" | "saving" | "offline";
  onUndo: () => void;
  onRemove: (qid: string) => void;
  onSettings: (s: SetupSub) => void;
};

/** The brand kit as the canvas draws it: the customer's colors and corners, Inter for every word. */
export function brandVars(kit: Kit | null): React.CSSProperties {
  const t = cleanTokens(kit?.tokens ?? {}).tokens;
  return {
    "--b-bg": t.background,
    "--b-ink": t.text,
    "--b-muted": t.muted,
    "--b-line": t.border,
    "--b-in": t.inputBg,
    "--b-acc": t.buttonBg,
    "--b-on": t.buttonText,
    "--b-r": `${t.radius}px`,
    "--b-btn-r": `${t.buttonRadius}px`,
    "--b-soft": `color-mix(in srgb, ${t.text} 5%, ${t.background})`,
    "--b-pick": `color-mix(in srgb, ${t.text} 3%, ${t.background})`,
    "--b-box": `color-mix(in srgb, ${t.muted} 75%, ${t.background})`,
  } as React.CSSProperties;
}

export function Build(p: BuildProps) {
  const { form, apply, pick, setPick, step, setStep, chat } = p;
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [insert, setInsert] = useState<{ at: number; el: HTMLElement } | null>(null);
  const steps = form.steps.length;
  const isEnd = step >= steps;
  const cur = Math.min(step, steps - 1);
  const qs = useMemo(() => questionsOf(form), [form]);
  const shown = qs.filter((q) => q.step === cur);
  const issueCtx = useMemo(() => ({ custom: p.custom, crm: p.crm.ctx }), [p.custom, p.crm.ctx]);
  const picked = pick && pick.id !== "button" ? qs.find((q) => q.id === pick.id) : null;
  const [formOpen, setFormOpen] = useState<string | null>(null);

  // Escape lets go of what's picked, unless it's closing a menu or a dialog, or leaving a text box.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !pick) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [role=dialog], [role=listbox], [role=menu]") || document.querySelector("[role=dialog], [role=listbox], [role=menu]")) return;
      setPick(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pick, setPick]);

  // What the AI bar last did, or the problem it ran into.
  const last = chat.last;
  useEffect(() => {
    if (!last) return;
    p.setSaid(last.lines.length ? { words: last.lines.length === 1 ? last.lines[0]! : `${last.lines[0]}, and ${last.lines.length - 1} more`, undo: true } : { words: last.reply || "Nothing changed. Name a question, or say what to add.", err: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);
  useEffect(() => {
    if (chat.error) p.setSaid({ words: chat.error, err: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.error]);

  /** Add a question of a kind at a place in this step's list. */
  const add = (kind: Kind, at: number) => {
    setInsert(null);
    if (kind === "consent") {
      if (!consentBox(form)) apply({ op: "set_consent", mode: "by_region" }, "Added consent", [CONSENT_ID]);
      setPick({ id: CONSENT_ID, open: "q" });
      return;
    }
    const input = newQuestion(kind, form);
    if (!input) return p.setSaid({ words: "The form already asks for an email", err: true });
    const id = newId();
    const before = shown.slice(0, at).filter((q) => q.field);
    const index = before.reduce((n, q) => n + (q.pair ? 2 : 1), 0);
    const ok = apply([{ op: "add_field", step: cur, field: input, id }, { op: "move_field", id, step: cur, index }], `Added ${KINDS.find((k) => k.v === kind)?.l.toLowerCase() ?? "a question"}`, [id]);
    if (ok) setPick({ id, open: "q" });
  };
  const duplicate = (q: Q) => {
    if (!q.field || q.pair) return;
    const f = q.field;
    const id = newId();
    const taken = new Set(allFields(form).map((x) => x.key as string));
    const { id: _drop, crm: _crm, ...rest } = f;
    void _drop;
    void _crm;
    const copy: Omit<Field, "id"> = { ...rest, label: f.label ? `${f.label} (copy)` : f.label, key: f.type === "heading" || f.type === "paragraph" ? f.key : questionKey(f.label || "answer", taken) };
    if (apply({ op: "add_field", step: q.step, after: f.id, field: copy, id }, `Copied ${f.label || "the question"}. It saves to the submission until you pick a field.`, [id])) setPick({ id, open: "q" });
  };

  const stepBar =
    steps > 1 ? (
      <>
        {form.steps.map((s, i) => (
          <span key={s.id} className="contents">
            {i ? <span aria-hidden="true" className="h-px w-[12px] shrink-0 bg-line-strong" /> : null}
            <StepPill n={String(i + 1)} on={step === i} onClick={() => (setStep(i), setPick(null))} label={s.title || `Step ${i + 1}`} />
          </span>
        ))}
        <span aria-hidden="true" className="h-px w-[12px] shrink-0 bg-line-strong" />
        <StepPill n={<Ic n="check" s={10} />} on={isEnd} onClick={() => (setStep(steps), setPick(null))} label="After submit" />
        <button type="button" className={IB_SM} onClick={() => apply({ op: "add_step", title: `Step ${steps + 1}` }, "Added a step") && setStep(steps)} title="Add a step" aria-label="Add a step">
          <Ic n="plus" />
        </button>
      </>
    ) : (
      <>
        <StepPill n="1" on={!isEnd} onClick={() => (setStep(0), setPick(null))} label="Form" />
        <span aria-hidden="true" className="h-px w-[12px] shrink-0 bg-line-strong" />
        <StepPill n={<Ic n="check" s={10} />} on={isEnd} onClick={() => (setStep(1), setPick(null))} label="After submit" />
      </>
    );

  const panel =
    pick?.id === "button" ? (
      <ButtonPanel {...p} />
    ) : picked ? (
      <QuestionPanel key={picked.id} {...p} q={picked} qs={qs} issueCtx={issueCtx} onDuplicate={() => duplicate(picked)} />
    ) : (
      <FormPanel {...p} open={formOpen} setOpen={setFormOpen} />
    );

  const busy = chat.busy;
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] grid-rows-[minmax(0,1fr)] max-[1100px]:grid-cols-[minmax(0,1fr)_340px] max-[860px]:grid-cols-1">
      <div className="fm-dots relative flex min-w-0 flex-col">
        <div className="flex h-[44px] shrink-0 items-center gap-[6px] overflow-x-auto border-b border-line bg-card px-[12px] [scrollbar-width:none]">
          {stepBar}
          <span className="flex-1" />
          <span className="max-[860px]:hidden">
            <Seg icons label="Device" value={device} onChange={setDevice} options={[{ value: "desktop", label: <Ic n="monitor" />, title: "Desktop" }, { value: "phone", label: <Ic n="phone" />, title: "Phone" }]} />
          </span>
        </div>
        <div
          className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-[16px] pt-[28px] pb-[140px]"
          onClick={(e) => {
            if (e.target === e.currentTarget && pick) setPick(null);
          }}
        >
          <div
            className={`keep-light flex max-w-full flex-col gap-[2px] rounded-[14px] bg-[var(--b-bg)] font-sans text-[var(--b-ink)] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)] transition-[width] duration-[320ms] ease-out ${device === "phone" ? "w-[375px] p-[22px]" : form.layout.width === "wide" ? "w-[720px] p-[32px]" : "w-[560px] p-[32px]"} max-[860px]:p-[22px]`}
            style={brandVars(p.kit)}
          >
            {isEnd ? (
              <EndView {...p} />
            ) : (
              <>
                {cur === 0 ? (
                  <>
                    <h2 className={`m-0 font-semibold tracking-[-0.02em] text-balance ${device === "phone" ? "text-[20px]" : "text-[24px] max-[860px]:text-[20px]"} leading-[1.2]`} onClick={() => setPick(null)}>
                      {form.title || p.name}
                    </h2>
                    {form.intro ? (
                      <p className="mt-[6px] mb-[14px] text-[14px] text-[var(--b-muted)]" onClick={() => setPick(null)}>
                        {form.intro}
                      </p>
                    ) : (
                      <span className="mb-[14px]" />
                    )}
                  </>
                ) : (
                  <h2 className="m-0 mb-[12px] text-[19px] leading-[1.2] font-semibold tracking-[-0.02em]" onClick={() => setPick(null)}>
                    {form.steps[cur]!.title || `Step ${cur + 1}`}
                  </h2>
                )}
                {steps > 1 && form.layout.progress !== "none" ? (
                  <div className="mb-[18px] h-[4px] overflow-hidden rounded-full bg-[var(--b-soft)]">
                    <i className="block h-full rounded-full bg-[var(--b-acc)] transition-[width] duration-[320ms] ease-out" style={{ width: `${Math.round(((cur + 1) / steps) * 100)}%` }} />
                  </div>
                ) : null}
                <Ins on={insert?.at === 0} onOpen={(el) => setInsert({ at: 0, el })} />
                {shown.map((q, i) => (
                  <span key={q.id} className="contents">
                    <QView q={q} form={form} picked={pick?.id === q.id} fresh={p.fresh.includes(q.id)} issueCtx={issueCtx} onPick={() => pick?.id !== q.id && setPick({ id: q.id, open: q.field && issuesOf(q.field, issueCtx).some((x) => x.where === "save") ? "save" : "q" })} onDuplicate={() => duplicate(q)} onRemove={() => p.onRemove(q.id)} labels={form.layout.labels} />
                    <Ins on={insert?.at === i + 1} onOpen={(el) => setInsert({ at: i + 1, el })} />
                  </span>
                ))}
                {shown.length ? null : <div className="py-[18px] text-center text-[var(--b-muted)]">No questions on this step</div>}
                <button
                  type="button"
                  onClick={() => setPick({ id: "button", open: "q" })}
                  className={`mt-[14px] flex h-[44px] items-center justify-center rounded-[var(--b-btn-r)] bg-[var(--b-acc)] px-[22px] text-[14px] font-medium text-[var(--b-on)] ${form.submit.full ? "w-full" : "w-fit"} ${pick?.id === "button" ? "outline-[1.5px] outline-offset-[3px] outline-[var(--b-ink)] outline-solid" : ""}`}
                >
                  {steps > 1 && cur < steps - 1 ? "Next" : form.submit.label}
                </button>
                {cur > 0 ? <div className="mt-[10px] text-center text-[13px] text-[var(--b-muted)]">Back</div> : null}
              </>
            )}
          </div>
        </div>
        {insert ? <InsertMenu form={form} anchor={insert.el} onClose={() => setInsert(null)} onAdd={(k) => add(k, insert.at)} /> : null}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-[8px] px-[16px] pt-[16px] pb-[18px]">
          {p.said && !busy ? (
            <div role="status" className={`anim-rise-sm pointer-events-auto inline-flex h-[30px] max-w-full items-center gap-[8px] rounded-full border border-line bg-card pr-[6px] pl-[12px] text-[12.5px] shadow-[0_4px_16px_rgb(0_0_0/0.08)] ${p.said.err ? "text-rose" : "text-body"}`}>
              {p.said.err ? null : (
                <span className="inline-flex size-[16px] shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
                  <Ic n="check" s={10} />
                </span>
              )}
              <span className="truncate">{p.said.words}</span>
              {p.said.undo ? (
                <button type="button" onClick={() => (p.onUndo(), chat.clear())} className="h-[22px] shrink-0 rounded-full px-[9px] font-medium text-ink hover:bg-hover">
                  Undo
                </button>
              ) : (
                <span className="w-[4px]" />
              )}
            </div>
          ) : null}
          <div className="pointer-events-auto flex w-full justify-center">
            <AskBox chat={chat} onSend={() => p.setSaid(null)} />
          </div>
        </div>
      </div>
      <div className={`flex min-h-0 flex-col border-l border-line bg-card max-[860px]:absolute max-[860px]:inset-x-0 max-[860px]:bottom-0 max-[860px]:z-20 max-[860px]:h-[62%] max-[860px]:rounded-t-2xl max-[860px]:border-t max-[860px]:border-l-0 max-[860px]:shadow-[0_-12px_32px_rgb(0_0_0/0.12)] ${pick ? "" : "max-[860px]:hidden"}`}>
        {panel}
      </div>
    </div>
  );
}

function AskBox({ chat, onSend }: { chat: ReturnType<typeof useFormChat>; onSend: () => void }) {
  const [text, setText] = useState("");
  return (
    <AskPill
      shadow
      label="Tell AI what to change"
      needText={false}
      value={text}
      onChange={setText}
      busy={chat.busy}
      placeholder={chat.busy ? "Editing the form" : "Tell AI what to change"}
      onSend={() => {
        const t = text.trim();
        if (!t) return;
        onSend();
        void chat.send(t).then(() => setText(""));
      }}
    />
  );
}

function StepPill({ n, on, onClick, label }: { n: React.ReactNode; on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`inline-flex h-[28px] shrink-0 items-center gap-[6px] rounded-full pr-[10px] pl-[6px] text-[12.5px] whitespace-nowrap transition-colors duration-[120ms] ${on ? "bg-paper-deep font-medium text-ink" : "text-muted hover:text-ink"}`}>
      <em className={`inline-flex size-[18px] items-center justify-center rounded-full text-[10.5px] font-semibold not-italic ${on ? "bg-ink text-card" : "bg-paper-deep text-body"}`}>{n}</em>
      {label}
    </button>
  );
}

/** The "+" between questions. */
function Ins({ on, onOpen }: { on: boolean; onOpen: (el: HTMLElement) => void }) {
  return (
    <div className="group/ins relative -mx-[12px] flex h-[14px] items-center justify-center">
      <span aria-hidden="true" className={`absolute inset-x-[12px] top-1/2 h-px bg-[var(--b-ink)] transition-opacity duration-[120ms] ${on ? "opacity-25" : "opacity-0 group-hover/ins:opacity-25"}`} />
      <button
        type="button"
        aria-label="Add a question here"
        onClick={(e) => {
          e.stopPropagation();
          onOpen(e.currentTarget);
        }}
        className={`relative z-[2] inline-flex size-[22px] items-center justify-center rounded-full bg-[var(--b-ink)] text-[var(--b-bg)] transition-[opacity,transform] duration-[120ms] ease-spring focus-visible:scale-100 focus-visible:opacity-100 ${on ? "scale-100 opacity-100" : "scale-[0.8] opacity-0 group-hover/ins:scale-100 group-hover/ins:opacity-100"}`}
      >
        <Ic n="plus" s={12} />
      </button>
    </div>
  );
}

/** The type menu: About them, Questions, More, with a search box. */
function InsertMenu({ form, anchor, onClose, onAdd }: { form: Form; anchor: HTMLElement; onClose: () => void; onAdd: (k: Kind) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 460;
      const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8));
      setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - 170, window.innerWidth - 348)), top });
    };
    place();
    const raf = requestAnimationFrame(place);
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !anchor.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
    };
  }, [anchor, onClose]);
  const f = q.trim().toLowerCase();
  const fields = allFields(form);
  const added = (k: Kind) => (k === "email" && fields.some((x) => x.key === "email")) || (k === "consent" && consentBox(form));
  const groups = (["Contact", "Answer", "Other"] as const).map((g) => ({ g, items: KINDS.filter((k) => k.g === g && (!f || k.l.toLowerCase().includes(f))) })).filter((x) => x.items.length);
  return createPortal(
    <div ref={box} role="dialog" aria-label="Add a question" style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: 340 }} className="anim-pop z-[95] rounded-xl border border-line bg-card p-[10px] text-ink shadow-float">
      <label className="mb-[8px] flex h-[32px] w-full items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:border-ink">
        <Ic n="search" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search question types" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
      </label>
      {groups.length ? (
        groups.map(({ g, items }) => (
          <div key={g}>
            <div className="px-[4px] pt-[6px] pb-[4px] text-[11.5px] text-faint">{GROUP_WORDS[g]}</div>
            <div className="grid grid-cols-2 gap-[2px]">
              {items.map((k) => (
                <button key={k.v} type="button" onClick={() => onAdd(k.v)} className="flex h-[34px] items-center gap-[8px] rounded-lg px-[8px] text-left text-[12.5px] hover:bg-hover">
                  <span className="inline-flex size-[24px] shrink-0 items-center justify-center rounded-[7px] bg-paper-deep text-body">
                    <Ic n={k.i} s={13} />
                  </span>
                  {k.l}
                  {added(k.v) ? <em className="ml-auto text-[11px] whitespace-nowrap text-faint not-italic">Added</em> : null}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="p-[10px] text-muted">No matches</div>
      )}
    </div>,
    document.body,
  );
}

const TAG = "inline-flex h-[20px] items-center gap-[5px] rounded-full px-[7px] text-[11px] font-medium";

/** One question as the visitor sees it, with the editor's tags and hover buttons. */
function QView({ q, form, picked, fresh, issueCtx, onPick, onDuplicate, onRemove, labels }: { q: Q; form: Form; picked: boolean; fresh: boolean; issueCtx: Parameters<typeof issuesOf>[1]; onPick: () => void; onDuplicate: () => void; onRemove: () => void; labels: "above" | "inside" }) {
  const f = q.field;
  const kind = q.kind;
  const issues = f ? issuesOf(f, issueCtx) : [];
  const tags: React.ReactNode[] = [];
  if (f) {
    const show = showRules(form, f.id);
    const label = (id: string) => allFields(form).find((x) => x.id === id)?.label || "a question";
    if (show.rules.length) tags.push(<span key="show" className={`${TAG} bg-lilac-wash text-lilac`}><Ic n="branch" s={10} />{`Shows when ${condText(show.rules[0]!.when, label).replace(/ is_not /, " isn't ")}`}</span>);
    if (known(form, f).on) tags.push(<span key="known" className={`${TAG} bg-lilac-wash text-lilac`}><Ic n="hide" s={10} />Skipped when known</span>);
  }
  if (kind === "consent") tags.push(<span key="where" className={`${TAG} bg-lilac-wash text-lilac`}><Ic n="globe" s={10} />{form.consent.mode === "by_region" ? "Shown in the EU and UK" : "Shown to everyone"}</span>);
  for (const i of issues) tags.push(<span key={i.t} className={`${TAG} ${i.lvl === "bad" ? "bg-rose-wash text-rose" : "bg-butter-wash text-butter"}`}><Ic n="warn" s={10} />{i.t}</span>);
  const optional = f && !f.required && kind !== "hidden" && !isContentKind(kind) ? <i className="text-[12.5px] font-normal text-[var(--b-muted)] not-italic">Optional</i> : null;
  const label = (text: string) => (
    <div className="mb-[7px] flex items-baseline gap-[6px] text-[13.5px] font-medium">
      {text}
      {optional}
    </div>
  );
  const input = (ph: string, tall = false, chev = false) => (
    <div className={`flex justify-between rounded-[var(--b-r)] border border-[var(--b-line)] bg-[var(--b-in)] px-[12px] text-[14px] text-[var(--b-muted)] ${tall ? "h-[84px] items-start pt-[10px]" : "h-[40px] items-center"}`}>
      {ph}
      {chev ? <Ic n="chev" /> : null}
    </div>
  );
  let body: React.ReactNode;
  if (kind === "heading") body = <div className="text-[16px] font-semibold">{f?.content?.text || f?.label}</div>;
  else if (kind === "para") body = <div className="text-[14px] text-[var(--b-muted)]">{f?.content?.text || f?.label}</div>;
  else if (kind === "consent")
    body = (
      <div className="flex items-start gap-[9px] text-[13px]">
        <span className="mt-[2px] size-[16px] shrink-0 rounded-[4px] border-[1.5px] border-[var(--b-box)]" />
        {form.consent.label}
      </div>
    );
  else if (kind === "hidden")
    body = (
      <div className="flex items-center gap-[8px] rounded-lg border border-dashed border-[var(--b-line)] px-[12px] py-[8px] font-mono text-[12.5px] text-[var(--b-muted)]">
        <Ic n="hide" />
        {`${f!.label || "Hidden field"} from ?${f!.hidden?.name || "param"}`}
      </div>
    );
  else if (q.pair)
    body = (
      <div className="grid grid-cols-2 gap-[12px]">
        <div>
          {label(f!.label || "First name")}
          {input(f!.placeholder ?? "")}
        </div>
        <div>
          {label(q.pair.label || "Last name")}
          {input(q.pair.placeholder ?? "")}
        </div>
      </div>
    );
  else if (kind === "choice" || kind === "multi")
    body = (
      <>
        {label(f!.label)}
        {f!.help ? <div className="-mt-[3px] mb-[7px] text-[12.5px] text-[var(--b-muted)]">{f!.help}</div> : null}
        <div className="flex flex-col gap-[7px]">
          {(f!.options ?? []).map((o) => (
            <span key={o.value} className="flex items-center gap-[9px] text-[14px]">
              <span className={`size-[16px] shrink-0 border-[1.5px] border-[var(--b-box)] ${kind === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
              {o.label}
            </span>
          ))}
          {f!.other ? (
            <span className="flex items-center gap-[9px] text-[14px]">
              <span className={`size-[16px] shrink-0 border-[1.5px] border-[var(--b-box)] ${kind === "multi" ? "rounded-[4px]" : "rounded-full"}`} />
              Other
            </span>
          ) : null}
        </div>
      </>
    );
  else
    body = (
      <>
        {labels === "inside" ? null : label(f!.label)}
        {f!.help ? <div className="-mt-[3px] mb-[7px] text-[12.5px] text-[var(--b-muted)]">{f!.help}</div> : null}
        {kind === "dropdown" || kind === "country" ? input(kind === "country" ? "Select a country" : "Select one", false, true) : input(labels === "inside" ? f!.label : (f!.placeholder ?? ""), kind === "long")}
      </>
    );
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      className={`group/q relative -mx-[12px] cursor-pointer rounded-[10px] px-[12px] py-[10px] transition-colors duration-[120ms] ${picked ? "bg-[var(--b-pick)]" : "hover:bg-[var(--b-soft)]"} ${fresh ? "fm-flash" : ""}`}
    >
      {picked ? (
        <>
          <span aria-hidden="true" className="anim-fade pointer-events-none absolute top-0 left-0 size-[12px] rounded-tl-[10px] border-t-[1.5px] border-l-[1.5px] border-[var(--b-ink)]" />
          <span aria-hidden="true" className="anim-fade pointer-events-none absolute right-0 bottom-0 size-[12px] rounded-br-[10px] border-r-[1.5px] border-b-[1.5px] border-[var(--b-ink)]" />
        </>
      ) : null}
      {body}
      {tags.length ? <div className="mt-[8px] flex flex-wrap gap-[6px]">{tags}</div> : null}
      <span className={`absolute top-[8px] right-[8px] z-[2] gap-[2px] ${picked ? "flex" : "hidden group-hover/q:flex"}`}>
        {q.field && !q.pair ? (
          <button type="button" title="Duplicate" aria-label="Duplicate" onClick={(e) => (e.stopPropagation(), onDuplicate())} className="inline-flex size-[26px] items-center justify-center rounded-full border border-line bg-card text-muted hover:border-line-strong hover:text-ink">
            <Ic n="dup" s={13} />
          </button>
        ) : null}
        <button type="button" title="Delete" aria-label="Delete" onClick={(e) => (e.stopPropagation(), onRemove())} className="inline-flex size-[26px] items-center justify-center rounded-full border border-line bg-card text-muted hover:border-line-strong hover:text-ink">
          <Ic n="trash" s={13} />
        </button>
      </span>
    </div>
  );
}

/** Days and times for the booking view: the next three weekdays, two times each. */
function sampleTimes(): string[] {
  const days: string[] = [];
  const d = new Date();
  while (days.length < 3) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.toLocaleDateString("en-US", { weekday: "short" }));
  }
  return ["10:00", "14:30", "09:00", "11:30", "15:00", "10:30"].map((t, i) => `${days[Math.floor(i / 2)]} ${t}`);
}

/** After submit, as the visitor sees it. */
function EndView({ form, types, onSettings }: BuildProps) {
  const s = form.after.schedule;
  const end = form.after.end;
  const tag = (t: string) => (
    <span className={`${TAG} bg-lilac-wash text-lilac`}>
      <Ic n="branch" s={10} />
      {t}
    </span>
  );
  const edit = (
    <button type="button" className={GHOST_SM} onClick={() => onSettings("after")}>
      Edit in Settings
    </button>
  );
  if (!s && end.kind === "redirect")
    return (
      <div className="flex flex-col items-start gap-[12px]">
        <span className="font-mono text-[10.5px] tracking-[0.06em] text-[var(--b-muted)] uppercase">After submit</span>
        <h2 className="m-0 text-[19px] font-semibold tracking-[-0.02em]">Goes to a page</h2>
        <div className="flex h-[40px] w-full items-center rounded-[var(--b-r)] border border-[var(--b-line)] px-[12px] text-[14px]">{end.url}</div>
        {edit}
      </div>
    );
  const type = s?.tool === "claritia" ? types.find((t) => t.id === s.meetingTypeId) : null;
  const len = type?.settings?.lengths?.[0];
  return (
    <div className="flex flex-col items-start gap-[12px]">
      <span className="inline-flex size-[36px] items-center justify-center rounded-full bg-signal-soft text-signal">
        <Ic n="check" s={18} />
      </span>
      <h2 className="m-0 text-[20px] leading-[1.2] font-semibold tracking-[-0.02em]">{s ? s.heading || "Pick a time" : end.kind === "message" ? end.title : ""}</h2>
      {s ? (
        <>
          <p className="m-0 text-[14px] text-[var(--b-muted)]">{`${type ? `${type.name}${len ? `, ${len} min` : ""}` : "A meeting"}. Times in their own zone.`}</p>
          <div className="grid w-full grid-cols-3 gap-[6px]">
            {sampleTimes().map((t) => (
              <span key={t} className="flex h-[36px] items-center justify-center rounded-full border border-[var(--b-line)] text-[13px]">
                {t}
              </span>
            ))}
          </div>
          {tag(s.who === "routed" ? "Only for leads Routing sends to a rep. Others see the message" : s.who === "match" ? "Only for leads that match. Others see the message" : "Everyone sees times")}
        </>
      ) : (
        <>
          {end.kind === "message" && end.text ? <p className="m-0 text-[14px] text-[var(--b-muted)]">{end.text}</p> : null}
          {tag("Everyone sees this")}
        </>
      )}
      {edit}
    </div>
  );
}
