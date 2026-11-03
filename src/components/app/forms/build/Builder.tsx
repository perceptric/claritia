"use client";

// A form's Build tab (docs/forms.md Part 5). Three parts:
//   - the outline on the left: steps and their questions, to pick, drag into place, add and delete
//   - the live form in the middle, the real form script, on the picked step
//   - the panel on the right: the picked question (its type, options, files and logic), the picked step (its title and
//     condition), Submission (what happens after the send), or, with nothing picked, the form itself and its styling
// A bar under the form takes plain words and makes small changes. Every change goes through the spec's edits, so it
// either applies cleanly or not at all.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Op } from "@/lib/forms/ops";
import { CONTACT_KEYS, type Form } from "@/lib/forms/schema";
import {
  applyEdits,
  condText,
  fromForm,
  hasOptions,
  isQuestion,
  layoutOf,
  opsFor,
  readersOf,
  SPEC_TYPES,
  specFields,
  toForm,
  toOnePage,
  toSteps,
  v1Type,
  type Edit,
  type FieldInput,
  type Spec,
  type SpecCond,
  type SpecField,
  type SpecOp,
  type SpecStep,
  type SpecType,
  type When,
} from "@/lib/forms/spec";
import type { CustomField } from "@/lib/records/fields";
import { skinForKit } from "@/lib/brand/skin";
import { AiMark } from "../../Ai";
import { askConfirm } from "../../Dialogs";
import { Select, type Option } from "../../Select";
import { errorText, postJson, type ViewProps } from "../../ui";
import type { TypeRow } from "../../meetings/TypesList";
import type { RoutingFacts } from "../formRouting";
import { Ic } from "../ic";
import { OnSubmissionPanel, type Trial } from "../OnSubmission";
import { AREA, BTN, EYEBROW, GHOST_SM, IB, IB_SM, IN, IN_SM, NumBox, Seg, Tg } from "../parts";
import { FormPreview, type Kit } from "../shared";
import { hostOf, logoOf } from "../new/NewForm";

export const SUBMIT = "submit";
export type Pick = { id: string; open: string | null } | null;

export type BuilderProps = Pick_<ViewProps, "session" | "ws" | "navigate"> & {
  form: Form;
  name: string;
  /** Put a new form in place as one undo step, with words for the line under the form. */
  replace: (next: Form, words?: string) => void;
  /** The form's own settings changes (Submission uses them). */
  apply: (ops: Op | Op[], words?: string) => boolean;
  custom: CustomField[];
  formId: string;
  kit: Kit | null;
  kits: Kit[];
  setKit: (id: string | null) => void;
  reloadKits: () => void;
  types: TypeRow[];
  facts: RoutingFacts;
  pick: Pick;
  setPick: (p: Pick) => void;
  step: number;
  setStep: (n: number) => void;
  said: { words: string; undo?: boolean; err?: boolean } | null;
  setSaid: (s: { words: string; undo?: boolean; err?: boolean } | null) => void;
  onUndo: () => void;
};
type Pick_<T, K extends keyof T> = { [P in K]: T[P] };

export function Builder(p: BuilderProps) {
  const { form, replace, pick, setPick } = p;
  const spec = useMemo(() => fromForm(form), [form]);
  const fields = useMemo(() => specFields(spec), [spec]);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  // The frame around the live form takes the form's own background.
  const [formBg, setFormBg] = useState("");
  const [trial, setTrial] = useState<Trial>(null);
  const [ask, setAsk] = useState("");
  const [asking, setAsking] = useState(false);
  const needEmail = !form.emailOptional;

  // A brand with a site and no copied look yet: copy it from the site's page source, then read the kits again.
  const askedSkin = useRef(new Set<string>());
  const { kit, reloadKits, session, ws } = p;
  useEffect(() => {
    // A measured look (from the runner's browser read) stays; a page-source one asks the runner again once.
    if (!kit || !kit.source_url || (kit.skin && (kit.skin as { via?: string }).via !== "source") || askedSkin.current.has(kit.id)) return;
    askedSkin.current.add(kit.id);
    postJson(session, "/api/forms/skin", { workspaceId: ws.id, kitId: kit.id }).then(reloadKits, () => undefined);
  }, [kit, reloadKits, session, ws.id]);

  // Back from making a meeting (?step=submit): open Submission where they left off.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("step") !== "submit") return;
    setPick({ id: SUBMIT, open: null });
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Apply edits to the spec; on success the form changes as one undo step, else the reason shows under the form. */
  const edit = (edits: Edit[], words?: string): boolean => {
    const r = applyEdits(spec, edits, { needEmail });
    if ("error" in r) {
      p.setSaid({ words: r.error, err: true });
      return false;
    }
    replace(toForm(r.spec, form), words);
    return true;
  };
  const setSpec = (next: Spec, words?: string) => replace(toForm(next, form), words);

  const pickedField = pick ? fields.find((f) => f.id === pick.id) : undefined;
  const pickedStep = pick ? spec.steps.find((s) => s.id === pick.id) : undefined;
  const onSubmit = pick?.id === SUBMIT;
  const stepOfField = (id: string) => spec.steps.findIndex((s) => s.fields.some((f) => f.id === id));
  const cur = Math.min(pickedField ? Math.max(0, stepOfField(pickedField.id)) : pickedStep ? spec.steps.indexOf(pickedStep) : p.step, spec.steps.length - 1);

  const remove = async (f: SpecField) => {
    const readers = readersOf(spec, f.id);
    if (readers.length && !(await askConfirm(`Delete ${f.label || "this question"}?`, { body: `${readers.join(", ")} ${readers.length === 1 ? "shows" : "show"} on it. That logic goes too.`, ok: "Delete", danger: true }))) return;
    if (edit([{ op: "remove_field", id: f.id }], `Deleted ${f.label || "the question"}`) && pick?.id === f.id) setPick(null);
  };
  const removeStep = async (st: SpecStep) => {
    if (!(await askConfirm(`Delete ${st.title || "this step"}?`, { body: "Its questions move to the step before.", ok: "Delete", danger: true }))) return;
    if (edit([{ op: "remove_step", id: st.id }], "Deleted the step")) setPick(null);
  };
  const add = (stepId: string, type: Exclude<SpecType, "locked">) => {
    const label = SPEC_TYPES.find((t) => t.value === type)?.label ?? "Question";
    const field: FieldInput = { type, label: type === "heading" ? "A heading" : type === "paragraph" ? "Some text" : label, ...(hasOptions(type) && type !== "yesno" ? { options: [{ value: "option_1", label: "Option 1" }, { value: "option_2", label: "Option 2" }] } : {}) };
    const before = new Set(fields.map((f) => f.id));
    const r = applyEdits(spec, [{ op: "add_field", step: stepId, field }], { needEmail });
    if ("error" in r) return p.setSaid({ words: r.error, err: true });
    const id = specFields(r.spec).find((f) => !before.has(f.id))!.id;
    setSpec(r.spec, `Added ${label.toLowerCase()}`);
    setPick({ id, open: "q" });
  };

  const send = async () => {
    const text = ask.trim();
    if (!text || asking) return;
    setAsking(true);
    p.setSaid(null);
    try {
      const r = await postJson<{ spec: Spec; reply: string; changed: number }>(p.session, "/api/forms/new", { workspaceId: p.ws.id, mode: "edit", spec, ask: text, needEmail });
      if (r.changed) {
        setSpec(r.spec, r.reply || "Changed");
        setAsk("");
      } else p.setSaid({ words: r.reply || "Nothing changed.", err: true });
    } catch (e) {
      p.setSaid({ words: errorText(e), err: true });
    } finally {
      setAsking(false);
    }
  };

  const panel = onSubmit ? (
    <OnSubmissionPanel formId={p.formId} form={form} apply={p.apply} types={p.types} facts={p.facts} navigate={p.navigate} trial={trial} setTrial={setTrial} />
  ) : pickedField ? (
    <FieldPanel key={pickedField.id} f={pickedField} spec={spec} custom={p.custom} edit={edit} onRemove={() => void remove(pickedField)} />
  ) : pickedStep ? (
    <StepPanel key={pickedStep.id} st={pickedStep} spec={spec} edit={edit} onRemove={() => void removeStep(pickedStep)} />
  ) : (
    <FormPanel {...p} spec={spec} setSpec={setSpec} edit={edit} />
  );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_380px] grid-rows-[minmax(0,1fr)] max-[1100px]:grid-cols-[220px_minmax(0,1fr)_340px] max-[860px]:grid-cols-1 max-[860px]:grid-rows-none max-[860px]:overflow-y-auto">
      <Outline spec={spec} pick={pick} setPick={setPick} setStep={p.setStep} edit={edit} onAdd={add} onSubmit={() => setPick({ id: SUBMIT, open: null })} submitOn={onSubmit} />
      <div className="relative flex min-h-0 min-w-0 flex-col border-x border-line bg-paper max-[860px]:border-x-0 max-[860px]:border-y">
        <div className="flex h-[44px] shrink-0 items-center gap-[8px] border-b border-line bg-card px-[12px]">
          <span className={EYEBROW}>{onSubmit ? "Submission" : spec.steps.length > 1 ? `Step ${cur + 1} of ${spec.steps.length}` : "Form"}</span>
          <span className="flex-1" />
          <Seg icons label="Device" value={device} onChange={setDevice} options={[{ value: "desktop", label: <Ic n="monitor" />, title: "Desktop" }, { value: "phone", label: <Ic n="phone" />, title: "Phone" }]} />
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-[16px] pt-[28px] pb-[120px]" onClick={(e) => e.target === e.currentTarget && pick && setPick(null)}>
          <div className={`keep-light h-fit shrink-0 rounded-[14px] p-[24px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)] transition-[width] duration-[320ms] ease-out ${device === "phone" ? "w-[375px]" : "w-full max-w-[760px]"}`} style={{ background: formBg || (p.kit?.tokens as { background?: string } | undefined)?.background || "#fff" }}>
            <FormPreview form={form} tokens={p.kit?.tokens ?? {}} logo={logoOf(p.kit)} skin={skinForKit(p.kit, typeof window === "undefined" ? "" : window.location.origin)} step={onSubmit ? 0 : cur} done={onSubmit} system={p.kit?.design ?? undefined} device={device === "phone" ? "phone" : undefined} onBackground={setFormBg} />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-[8px] px-[16px] pt-[16px] pb-[16px]">
          {p.said && !asking ? (
            <div role="status" className={`anim-rise-sm pointer-events-auto inline-flex h-[30px] max-w-full items-center gap-[8px] rounded-full bg-card shadow-chip pr-[6px] pl-[12px] text-[12.5px] shadow-[0_4px_16px_rgb(0_0_0/0.08)] ${p.said.err ? "text-rose" : "text-body"}`}>
              <span className="truncate">{p.said.words}</span>
              {p.said.undo ? (
                <button type="button" onClick={p.onUndo} className="h-[22px] shrink-0 rounded-full px-[9px] font-medium text-ink hover:bg-hover">
                  Undo
                </button>
              ) : (
                <button type="button" aria-label="Close" onClick={() => p.setSaid(null)} className={IB_SM}>
                  <Ic n="x" s={11} />
                </button>
              )}
            </div>
          ) : null}
          <form
            className="pointer-events-auto flex h-[44px] w-full max-w-[560px] items-center gap-[8px] rounded-full bg-card shadow-outline pr-[6px] pl-[14px] shadow-[0_8px_28px_rgb(0_0_0/0.08)]"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <AiMark size={14} working={asking} />
            <input className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" placeholder="Change anything" aria-label="Change the form" value={ask} onChange={(e) => setAsk(e.target.value)} disabled={asking} />
            <button type="submit" className={IB} aria-label="Send" title="Send" disabled={!ask.trim() || asking}>
              <Ic n="up" />
            </button>
          </form>
        </div>
      </div>
      <aside aria-label="Settings" className="flex min-h-0 flex-col overflow-y-auto bg-card">
        {panel}
      </aside>
    </div>
  );
}

// ── The outline ─────────────────────────────────────────────────────────────────────────────────────────────────

const ICONS: Record<SpecType, Parameters<typeof Ic>[0]["n"]> = {
  text: "text",
  longtext: "long",
  email: "mail",
  phone: "call",
  number: "hash",
  url: "link",
  date: "cal",
  country: "globe",
  radio: "radio",
  checkboxes: "box",
  dropdown: "drop",
  pictures: "palette",
  yesno: "check",
  rating: "hash",
  file: "ext",
  checkbox: "box",
  hidden: "hide",
  heading: "head",
  paragraph: "para",
  locked: "lock",
};

function Outline({ spec, pick, setPick, setStep, edit, onAdd, onSubmit, submitOn }: { spec: Spec; pick: Pick; setPick: (p: Pick) => void; setStep: (n: number) => void; edit: (e: Edit[], w?: string) => boolean; onAdd: (step: string, t: Exclude<SpecType, "locked">) => void; onSubmit: () => void; submitOn: boolean }) {
  const [drag, setDrag] = useState<{ kind: "field" | "step"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const steps = spec.steps.length > 1;
  const dropOnField = (stepId: string, index: number) => {
    if (drag?.kind !== "field") return;
    const st = spec.steps.find((s) => s.id === stepId)!;
    const from = st.fields.findIndex((f) => f.id === drag.id);
    edit([{ op: "move_field", id: drag.id, step: stepId, index: from >= 0 && from < index ? index - 1 : index }], "Moved");
  };
  const typeOptions: Option<string>[] = SPEC_TYPES.filter((t) => t.value !== "hidden").map((t) => ({ value: t.value, label: t.label, group: t.value === "heading" || t.value === "paragraph" ? "Text" : "Questions" }));
  return (
    <nav aria-label="Outline" className="flex min-h-0 flex-col overflow-y-auto bg-card py-[8px]">
      {spec.steps.map((st, si) => (
        <div
          key={st.id}
          className={`flex flex-col ${over === `s:${st.id}` ? "bg-hover" : ""}`}
          onDragOver={(e) => {
            if (!drag) return;
            e.preventDefault();
            setOver(`s:${st.id}`);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(null);
            if (drag?.kind === "step") edit([{ op: "move_step", id: drag.id, index: si }], "Moved the step");
            else dropOnField(st.id, st.fields.length);
            setDrag(null);
          }}
        >
          {steps ? (
            <button
              type="button"
              draggable
              onDragStart={() => setDrag({ kind: "step", id: st.id })}
              onClick={() => (setStep(si), setPick({ id: st.id, open: null }))}
              className={`mx-[8px] mt-[8px] flex h-[30px] items-center gap-[8px] rounded-md px-[8px] text-left text-[12px] font-medium ${pick?.id === st.id ? "bg-ink text-card" : "text-muted hover:bg-hover hover:text-ink"}`}
            >
              <span className="tabular-nums">{si + 1}</span>
              <span className="min-w-0 flex-1 truncate">{st.title || `Step ${si + 1}`}</span>
              {st.show ? <Ic n="branch" s={12} /> : null}
            </button>
          ) : null}
          {st.fields.map((f, fi) => (
            <button
              key={f.id}
              type="button"
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                setDrag({ kind: "field", id: f.id });
              }}
              onDragOver={(e) => {
                if (drag?.kind !== "field") return;
                e.preventDefault();
                e.stopPropagation();
                setOver(`f:${f.id}`);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOver(null);
                dropOnField(st.id, fi);
                setDrag(null);
              }}
              onClick={() => (setStep(si), setPick({ id: f.id, open: "q" }))}
              className={`mx-[8px] flex h-[32px] items-center gap-[8px] rounded-md px-[8px] text-left text-[13px] ${over === `f:${f.id}` ? "shadow-[inset_0_2px_0_var(--color-ink)]" : ""} ${pick?.id === f.id ? "bg-ink text-card" : "text-ink hover:bg-hover"} ${steps ? "pl-[20px]" : ""}`}
            >
              <span className={pick?.id === f.id ? "text-card" : "text-muted"}>
                <Ic n={ICONS[f.type]} s={13} />
              </span>
              <span className="min-w-0 flex-1 truncate">{f.label || (f.type === "hidden" ? "Hidden" : "Untitled")}</span>
              {f.show ? <Ic n="branch" s={12} /> : null}
              {f.required ? <span aria-label="Required" className="text-[12px]">*</span> : null}
            </button>
          ))}
          {adding === st.id ? (
            <div className="mx-[8px] mt-[4px] flex items-center gap-[4px]">
              <Select value="" options={[{ value: "", label: "Pick a type" }, ...typeOptions]} onChange={(v) => (v ? (onAdd(st.id, v as Exclude<SpecType, "locked">), setAdding(null)) : undefined)} ariaLabel="Question type" />
              <button type="button" className={IB_SM} aria-label="Cancel" onClick={() => setAdding(null)}>
                <Ic n="x" s={11} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(st.id)} className={`mx-[8px] flex h-[30px] items-center gap-[8px] rounded-md px-[8px] text-left text-[12.5px] text-muted hover:bg-hover hover:text-ink ${steps ? "pl-[20px]" : ""}`}>
              <Ic n="plus" s={12} />
              Add a question
            </button>
          )}
        </div>
      ))}
      <AddStep spec={spec} edit={edit} />
      <div className="mx-[8px] my-[8px] h-px bg-line" />
      <button type="button" onClick={onSubmit} className={`mx-[8px] flex h-[32px] items-center gap-[8px] rounded-md px-[8px] text-left text-[13px] ${submitOn ? "bg-ink text-card" : "text-ink hover:bg-hover"}`}>
        <Ic n="flow" s={13} />
        <span className="flex-1">Submission</span>
      </button>
    </nav>
  );
}

/** Add a step: it starts with one short question, since a step can't be empty. */
function AddStep({ spec, edit }: { spec: Spec; edit: (e: Edit[], w?: string) => boolean }) {
  const add = () => {
    const id = `st${spec.steps.length + 1}${Math.random().toString(36).slice(2, 6)}`;
    edit([{ op: "add_step", id, title: `Step ${spec.steps.length + 1}` }, { op: "add_field", step: id, field: { type: "text", label: "New question" } }], "Added a step");
  };
  return (
    <button type="button" onClick={add} className="mx-[8px] mt-[8px] flex h-[30px] items-center gap-[8px] rounded-md px-[8px] text-left text-[12.5px] text-muted hover:bg-hover hover:text-ink">
      <Ic n="plus" s={12} />
      Add a step
    </button>
  );
}

// ── Panels ──────────────────────────────────────────────────────────────────────────────────────────────────────

function Shell({ eyebrow, title, children, actions }: { eyebrow: string; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex min-h-[56px] items-center gap-[8px] border-b border-line px-[16px] py-[10px]">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={EYEBROW}>{eyebrow}</span>
          <b className="truncate text-[14px] font-semibold text-ink">{title}</b>
        </span>
        {actions}
      </div>
      <div className="flex flex-col gap-[16px] px-[16px] py-[16px]">{children}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

/** A text box that keeps its own text while typing and sends each change. */
function TextBox({ value, onChange, area = false, label, placeholder }: { value: string; onChange: (v: string) => void; area?: boolean; label: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return area ? (
    <textarea className={AREA} rows={3} aria-label={label} placeholder={placeholder} value={text} onChange={(e) => (setText(e.target.value), onChange(e.target.value))} />
  ) : (
    <input className={IN} aria-label={label} placeholder={placeholder} value={text} onChange={(e) => (setText(e.target.value), onChange(e.target.value))} />
  );
}

const slug = (s: string, taken: Set<string>) => {
  const base = s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "option";
  let v = base;
  for (let i = 2; taken.has(v); i++) v = `${base}_${i}`;
  return v;
};

function FieldPanel({ f, spec, custom, edit, onRemove }: { f: SpecField; spec: Spec; custom: CustomField[]; edit: (e: Edit[], w?: string) => boolean; onRemove: () => void }) {
  const set = (s: Partial<Omit<FieldInput, "show">> & { show?: When | null }, words?: string) => edit([{ op: "update_field", id: f.id, set: s }], words);
  const typeLabel = f.type === "locked" ? "Kept as it is" : (SPEC_TYPES.find((t) => t.value === f.type)?.label ?? "");
  const duplicate = () => {
    const { id: _id, raw: _raw, key: _key, ...rest } = f;
    void _id;
    void _raw;
    void _key;
    edit([{ op: "add_field", step: spec.steps.find((s) => s.fields.some((x) => x.id === f.id))!.id, after: f.id, field: { ...rest, label: `${f.label} (copy)` } }], "Copied");
  };
  const actions = (
    <>
      {f.type !== "locked" ? (
        <button type="button" className={IB} onClick={duplicate} aria-label="Duplicate" title="Duplicate">
          <Ic n="dup" />
        </button>
      ) : null}
      <button type="button" className={IB} onClick={onRemove} aria-label="Delete" title="Delete">
        <Ic n="trash" />
      </button>
    </>
  );
  if (f.type === "locked") return <Shell eyebrow={f.raw?.type ?? "Question"} title={f.label || "Question"} actions={actions}>{null}</Shell>;
  const content = f.type === "heading" || f.type === "paragraph";
  // Where it saves: the contact fields this type fits, the workspace's own fields, or on the submission.
  const v1 = v1Type(f);
  const saves: Option<string>[] = [
    { value: "", label: "On the submission" },
    ...CONTACT_KEYS.filter((c) => c.types.includes(v1)).map((c) => ({ value: c.key as string, label: c.label, group: "Contact" })),
    ...custom.map((c) => ({ value: `f.${c.key}`, label: c.label, group: "Your fields" })),
  ];
  const curKey = f.key && !f.key.startsWith("q.") ? f.key : "";
  return (
    <Shell eyebrow={typeLabel} title={f.label || "Untitled"} actions={actions}>
      <Labeled label={content ? "Text" : "Question"}>
        <TextBox label={content ? "Text" : "Question"} area={f.type === "paragraph"} value={f.label} onChange={(v) => set({ label: v })} />
      </Labeled>
      <Labeled label="Type">
        <Select value={f.type} options={SPEC_TYPES.map((t) => ({ value: t.value, label: t.label }))} onChange={(v) => set({ type: v as SpecType }, "Changed the type")} ariaLabel="Type" />
      </Labeled>
      {!content && f.type !== "hidden" ? (
        <div className="flex items-center justify-between gap-[8px]">
          <span className="text-[13px] text-ink">Required</span>
          <Tg label="Required" on={!!f.required} onChange={(v) => set({ required: v })} />
        </div>
      ) : null}
      {["text", "longtext", "email", "phone", "number", "url"].includes(f.type) ? (
        <Labeled label="Placeholder">
          <TextBox label="Placeholder" value={f.placeholder ?? ""} onChange={(v) => set({ placeholder: v })} />
        </Labeled>
      ) : null}
      {!content && f.type !== "hidden" ? (
        <Labeled label="Help">
          <TextBox label="Help" value={f.help ?? ""} onChange={(v) => set({ help: v })} />
        </Labeled>
      ) : null}
      {hasOptions(f.type) && f.type !== "yesno" ? <Options f={f} set={set} /> : null}
      {f.type === "file" ? (
        <>
          <Labeled label="Takes">
            <div className="flex flex-wrap gap-[6px]">
              {(["pdf", "image", "office"] as const).map((k) => {
                const on = f.files?.kinds.includes(k) ?? true;
                return (
                  <button key={k} type="button" aria-pressed={on} className={on ? `${GHOST_SM} border-ink bg-ink text-card hover:text-card` : GHOST_SM} onClick={() => set({ files: { maxMb: f.files?.maxMb ?? 10, kinds: on ? (f.files?.kinds ?? ["pdf", "image", "office"]).filter((x) => x !== k) : [...(f.files?.kinds ?? []), k] } })}>
                    {k === "pdf" ? "PDF" : k === "image" ? "Pictures" : "Office files"}
                  </button>
                );
              })}
            </div>
          </Labeled>
          <Labeled label="Biggest file, MB">
            <NumBox aria-label="Biggest file in MB" value={f.files?.maxMb ?? 10} onChange={(n) => n && set({ files: { kinds: f.files?.kinds ?? ["pdf", "image", "office"], maxMb: Math.min(20, Math.max(1, n)) } })} />
          </Labeled>
        </>
      ) : null}
      {f.type === "rating" ? (
        <Labeled label="Scale">
          <Seg label="Scale" value={String(f.scale ?? 5) as "5" | "10"} onChange={(v) => set({ scale: v === "10" ? 10 : 5 })} options={[{ value: "5", label: "5 stars" }, { value: "10", label: "0 to 10" }]} />
        </Labeled>
      ) : null}
      {f.type === "hidden" ? (
        <Labeled label="Address parameter">
          <TextBox label="Address parameter" placeholder="utm_campaign" value={f.param ?? ""} onChange={(v) => set({ param: v })} />
        </Labeled>
      ) : null}
      {!content && f.type !== "hidden" ? (
        <Labeled label="Saves to">
          <Select value={curKey} options={saves} onChange={(v) => set({ key: v || `q.${slug(f.label || "answer", new Set(specFields(spec).map((x) => (x.key ?? "").replace(/^q\./, ""))))}` })} ariaLabel="Saves to" />
        </Labeled>
      ) : null}
      {!content ? <Logic f={f} spec={spec} set={set} /> : null}
    </Shell>
  );
}

function Options({ f, set }: { f: SpecField; set: (s: Partial<Omit<FieldInput, "show">>, w?: string) => boolean }) {
  const opts = f.options ?? [];
  const taken = new Set(opts.map((o) => o.value));
  const put = (next: typeof opts, words?: string) => set({ options: next }, words);
  return (
    <Labeled label="Options">
      <div className="flex flex-col gap-[6px]">
        {opts.map((o, i) => (
          <div key={o.value} className="flex flex-col gap-[4px]">
            <div className="flex items-center gap-[4px]">
              <OptionText value={o.label} onChange={(label) => put(opts.map((x, j) => (j === i ? { ...x, label } : x)))} />
              <button type="button" className={IB_SM} aria-label={`Remove ${o.label}`} title="Remove" onClick={() => put(opts.filter((_, j) => j !== i), "Removed an option")} disabled={opts.length <= 1}>
                <Ic n="x" s={11} />
              </button>
            </div>
            {f.type === "pictures" ? <OptionText value={o.image ?? ""} placeholder="https://… picture" onChange={(image) => put(opts.map((x, j) => (j === i ? { ...x, ...(image ? { image } : { image: undefined }) } : x)))} /> : null}
          </div>
        ))}
        <button type="button" className={`${GHOST_SM} self-start`} onClick={() => put([...opts, { value: slug(`Option ${opts.length + 1}`, taken), label: `Option ${opts.length + 1}` }])}>
          <Ic n="plus" s={11} />
          Add an option
        </button>
      </div>
    </Labeled>
  );
}

function OptionText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return <input className={IN_SM} aria-label={placeholder ?? "Option"} placeholder={placeholder} value={text} onChange={(e) => (setText(e.target.value), e.target.value.trim() || placeholder ? onChange(e.target.value) : undefined)} />;
}

/** Show this question when: all or any of its conditions, each on a question before it. */
function Logic({ f, spec, set }: { f: SpecField; spec: Spec; set: (s: { show?: When | null }, w?: string) => boolean }) {
  const all = specFields(spec);
  const earlier = all.slice(0, all.findIndex((x) => x.id === f.id)).filter((x) => isQuestion(x) && x.type !== "locked");
  const show = f.show;
  if (!earlier.length) return null;
  const blank = (): SpecCond => {
    const src = earlier[earlier.length - 1]!;
    const op = opsFor(src.type)[0]!;
    return { field: src.id, op, ...(op === "is" || op === "is_not" ? { value: src.type === "yesno" ? "yes" : (src.options?.[0]?.value ?? "") } : {}) };
  };
  return (
    <Labeled label="Show this question">
      {show ? (
        <div className="flex flex-col gap-[8px] rounded-[10px] shadow-rest p-[10px]">
          {show.conds.length > 1 ? <Seg label="Match" value={show.match} onChange={(m) => set({ show: { ...show, match: m } })} options={[{ value: "all", label: "All of these" }, { value: "any", label: "Any of these" }]} /> : null}
          {show.conds.map((c, i) => (
            <CondRow key={i} c={c} sources={earlier} onChange={(n) => set({ show: { ...show, conds: show.conds.map((x, j) => (j === i ? n : x)) } })} onRemove={() => set({ show: show.conds.length > 1 ? { ...show, conds: show.conds.filter((_, j) => j !== i) } : null }, "Removed a condition")} />
          ))}
          <button type="button" className={`${GHOST_SM} self-start`} onClick={() => set({ show: { ...show, conds: [...show.conds, blank()] } })}>
            <Ic n="plus" s={11} />
            Add a condition
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-[8px]">
          <span className="text-[13px] text-ink">Always</span>
          <button type="button" className={GHOST_SM} onClick={() => set({ show: { match: "all", conds: [blank()] } }, "Added logic")}>
            <Ic n="branch" s={11} />
            Add logic
          </button>
        </div>
      )}
    </Labeled>
  );
}

const OP_WORDS: Record<SpecOp, string> = { is: "is", is_not: "is not", any_of: "is any of", none_of: "is none of", filled: "is answered", empty: "is not answered", contains: "contains", not_contains: "doesn't contain", gt: "is more than", lt: "is less than" };

function CondRow({ c, sources, onChange, onRemove, step = false }: { c: SpecCond; sources: SpecField[]; onChange: (c: SpecCond) => void; onRemove: () => void; step?: boolean }) {
  const src = sources.find((s) => s.id === c.field) ?? sources[0]!;
  const ops = opsFor(src.type, step);
  const opts = src.type === "yesno" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : src.options;
  const setOp = (op: SpecOp) => onChange({ field: c.field, op, ...(op === "any_of" || op === "none_of" ? { values: c.values ?? (c.value ? [c.value] : []) } : op === "filled" || op === "empty" ? {} : { value: c.value ?? opts?.[0]?.value ?? "" }) });
  return (
    <div className="flex flex-col gap-[4px] border-b border-line pb-[8px] last:border-b-0 last:pb-0">
      <div className="flex items-center gap-[4px]">
        <div className="min-w-0 flex-1">
          <Select value={src.id} options={sources.map((s) => ({ value: s.id, label: s.label || "Untitled" }))} onChange={(id) => {
            const n = sources.find((s) => s.id === id)!;
            const op = opsFor(n.type, step)[0]!;
            const o = n.type === "yesno" ? "yes" : n.options?.[0]?.value;
            onChange({ field: id, op, ...(op === "is" || op === "is_not" ? { value: o ?? "" } : {}) });
          }} ariaLabel="Question" />
        </div>
        <button type="button" className={IB_SM} aria-label="Remove condition" title="Remove" onClick={onRemove}>
          <Ic n="x" s={11} />
        </button>
      </div>
      <Select value={c.op} options={ops.map((o) => ({ value: o, label: OP_WORDS[o] }))} onChange={(o) => setOp(o as SpecOp)} ariaLabel="Condition" />
      {c.op === "filled" || c.op === "empty" ? null : c.op === "any_of" || c.op === "none_of" ? (
        <div className="flex flex-wrap gap-[4px]">
          {(opts ?? []).map((o) => {
            const on = (c.values ?? []).includes(o.value);
            return (
              <button key={o.value} type="button" aria-pressed={on} className={on ? `${GHOST_SM} border-ink bg-ink text-card hover:text-card` : GHOST_SM} onClick={() => onChange({ ...c, values: on ? (c.values ?? []).filter((v) => v !== o.value) : [...(c.values ?? []), o.value] })}>
                {o.label}
              </button>
            );
          })}
        </div>
      ) : opts ? (
        <Select value={c.value ?? ""} options={opts.map((o) => ({ value: o.value, label: o.label }))} onChange={(v) => onChange({ ...c, value: v })} ariaLabel="Answer" />
      ) : (
        <TextBox label="Answer" value={c.value ?? ""} onChange={(v) => onChange({ ...c, value: v })} />
      )}
    </div>
  );
}

function StepPanel({ st, spec, edit, onRemove }: { st: SpecStep; spec: Spec; edit: (e: Edit[], w?: string) => boolean; onRemove: () => void }) {
  const i = spec.steps.indexOf(st);
  const earlier = spec.steps.slice(0, i).flatMap((s) => s.fields).filter((x) => isQuestion(x) && x.type !== "locked" && opsFor(x.type, true).length);
  const prevHasShow = i > 0 && !!spec.steps[i - 1]!.show;
  const nextHasShow = !!spec.steps[i + 1]?.show;
  const blank = (): SpecCond => {
    const src = earlier[earlier.length - 1]!;
    const op = opsFor(src.type, true)[0]!;
    return { field: src.id, op, ...(op === "is" || op === "is_not" ? { value: src.type === "yesno" ? "yes" : (src.options?.[0]?.value ?? "") } : {}) };
  };
  return (
    <Shell
      eyebrow={`Step ${i + 1}`}
      title={st.title || `Step ${i + 1}`}
      actions={
        spec.steps.length > 1 ? (
          <button type="button" className={IB} onClick={onRemove} aria-label="Delete step" title="Delete step">
            <Ic n="trash" />
          </button>
        ) : null
      }
    >
      <Labeled label="Title">
        <TextBox label="Step title" value={st.title ?? ""} onChange={(v) => edit([{ op: "update_step", id: st.id, title: v }])} />
      </Labeled>
      {i > 0 && earlier.length ? (
        <Labeled label="Show this step">
          {st.show ? (
            <div className="flex flex-col gap-[8px] rounded-[10px] shadow-rest p-[10px]">
              <CondRow step c={st.show} sources={earlier} onChange={(c) => edit([{ op: "update_step", id: st.id, show: c }])} onRemove={() => edit([{ op: "update_step", id: st.id, show: null }], "Removed the condition")} />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-[8px]">
              <span className="text-[13px] text-ink">Always</span>
              <button type="button" className={GHOST_SM} disabled={prevHasShow || nextHasShow} title={prevHasShow || nextHasShow ? "A step next to it already has a condition" : undefined} onClick={() => edit([{ op: "update_step", id: st.id, show: blank() }], "Added logic")}>
                <Ic n="branch" s={11} />
                Add logic
              </button>
            </div>
          )}
          {st.show ? <span className="text-[12px] text-muted">{condText(st.show, specFields(spec))}</span> : null}
        </Labeled>
      ) : null}
    </Shell>
  );
}

function FormPanel(p: BuilderProps & { spec: Spec; setSpec: (s: Spec, w?: string) => void; edit: (e: Edit[], w?: string) => boolean }) {
  const { spec, edit, kit, kits } = p;
  const [url, setUrl] = useState("");
  const [learning, setLearning] = useState(false);
  const [error, setError] = useState("");
  const layout = layoutOf(spec);
  const flip = (to: "page" | "steps") => {
    if (to === layout) return;
    if (to === "page") {
      const one = toOnePage(spec);
      if (!one) return p.setSaid({ words: "This form's logic needs steps.", err: true });
      p.setSpec(one, "One page");
    } else p.setSpec(toSteps(spec), "Steps");
  };
  const learn = async () => {
    if (!hostOf(url) || learning) return;
    setLearning(true);
    setError("");
    try {
      const r = await postJson<{ kitId: string }>(p.session, "/api/forms/scan", { workspaceId: p.ws.id, url: url.trim() });
      p.setKit(r.kitId);
      p.reloadKits();
      setUrl("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLearning(false);
    }
  };
  const styleOptions: Option<string>[] = [...kits.filter((k) => Object.keys(k.tokens ?? {}).length || k.scan_status === "scanning").map((k) => ({ value: k.id, label: hostOf(k.source_url) || k.name || "Your brand" })), { value: "claritia", label: "Claritia" }];
  return (
    <Shell eyebrow="Form" title={p.name}>
      <Labeled label="Title">
        <TextBox label="Title" value={spec.title ?? ""} onChange={(v) => edit([{ op: "set_form", title: v }])} />
      </Labeled>
      <Labeled label="Intro">
        <TextBox label="Intro" area value={spec.intro ?? ""} onChange={(v) => edit([{ op: "set_form", intro: v }])} />
      </Labeled>
      <Labeled label="Button">
        <TextBox label="Button" value={spec.submit} onChange={(v) => edit([{ op: "set_form", submit: v }])} />
      </Labeled>
      <Labeled label="Layout">
        <Seg label="Layout" value={layout} onChange={flip} options={[{ value: "page", label: "One page" }, { value: "steps", label: "Steps" }]} />
      </Labeled>
      <Labeled label="Styling">
        <Select value={kit?.id ?? "claritia"} options={styleOptions} onChange={(v) => p.setKit(v === "claritia" ? null : v)} ariaLabel="Styling" />
        <form
          className="flex gap-[6px]"
          onSubmit={(e) => {
            e.preventDefault();
            void learn();
          }}
        >
          <input className={IN} placeholder="Learn from a website" aria-label="Website to learn from" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className={BTN} disabled={!hostOf(url) || learning}>
            <AiMark size={13} working={learning} />
            {learning ? "Reading" : "Learn"}
          </button>
        </form>
        {error ? <span className="text-[12px] text-rose">{error}</span> : null}
      </Labeled>
    </Shell>
  );
}
