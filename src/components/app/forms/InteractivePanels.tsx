"use client";

// Build's panel for interactive forms (docs/interactive-forms-plan.md Part 6b). A question: its formula as chips, a
// result block, scores and pictures on choices, a slider and a unit on numbers. Nothing picked: Screens (one step at
// a time, the cover, result screens), Settings (the values formulas read, kept private or not) and Results (outcomes in
// order, the last one for everyone else).

import { useState } from "react";
import { parseFormula } from "@/lib/forms/formula";
import { htmlText } from "@/lib/forms/html";
import { allFields, FILE_KINDS, RESULT_KINDS, type FileKind, type Choice, type Cond, type Constant, type Field, type Form, type Op as CondOp, type Outcome, type ResultBlock, type Results } from "@/lib/forms/schema";
import { Labeled, PanelSection } from "../scheduling/panel";
import type { BuildProps } from "./Build";
import { Ic } from "./ic";
import { AREA, Dd, GHOST_SM, IN_SM, NumBox, Seg, Tg, type DdItem } from "./parts";

type SectionProps = BuildProps & { f: Field; open: boolean; onToggle: () => void };
const ROW = "flex items-center justify-between gap-[10px] text-[12.5px] text-body";
const X = "press inline-flex size-[24px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink";

/** Fields a formula or a result can read: numbers, picks with scores, check boxes and other calcs. */
const readable = (form: Form, not?: string) => allFields(form).filter((x) => x.id !== not && ["number", "rating", "choice", "multi", "dropdown", "checkbox", "calc"].includes(x.type));
const numbers = (form: Form) => allFields(form).filter((x) => x.type === "calc" || x.type === "number");

// A formula as chips --------------------------------------------------------------------------------------------------

type Tok = { t: "field" | "const" | "op" | "num"; v: string };
/** The formula's parts in order: fields, settings, numbers and the signs between them. */
function tokens(src: string): Tok[] {
  return (src.match(/\{[^}]*\}|\d+(?:\.\d+)?|[a-z]+|<=|>=|==|!=|[-+*/(),<>]/gi) ?? []).map((x) => (x.startsWith("{@") ? { t: "const", v: x.slice(2, -1) } : x.startsWith("{") ? { t: "field", v: x.slice(1, -1) } : /^\d/.test(x) ? { t: "num", v: x } : { t: "op", v: x }));
}
const join = (toks: Tok[]) => toks.map((x) => (x.t === "field" ? `{${x.v}}` : x.t === "const" ? `{@${x.v}}` : x.v)).join(" ").replace(/\( /g, "(").replace(/ \)/g, ")").replace(/ ,/g, ",");
const SIGN: Record<string, string> = { "*": "×", "/": "÷", "-": "−" };

export function FormulaSection(p: SectionProps) {
  const { f, form, apply } = p;
  const calc = f.calc ?? { formula: "0" };
  const [raw, setRaw] = useState(false);
  const set = (formula: string) => apply({ op: "update_field", id: f.id, patch: { calc: { ...calc, formula } } });
  const toks = tokens(calc.formula === "0" ? "" : calc.formula);
  const parsed = parseFormula(calc.formula);
  const name = (x: Tok) => (x.t === "field" ? (allFields(form).find((y) => y.id === x.v)?.label ?? "Gone") : x.t === "const" ? (form.constants?.find((c) => c.id === x.v)?.name ?? "Gone") : x.t === "op" ? (SIGN[x.v] ?? x.v) : x.v);
  const add = (x: Tok) => set(join([...toks, x]));
  const items: DdItem[] = [
    { kind: "group", label: "Questions" },
    ...readable(form, f.id).map((x): DdItem => ({ kind: "option", key: x.id, label: x.label || "Untitled", onPick: () => add({ t: "field", v: x.id }) })),
    ...(form.constants?.length ? [{ kind: "group", label: "Settings" } as DdItem, ...form.constants.map((c): DdItem => ({ kind: "option", key: `@${c.id}`, label: c.name, onPick: () => add({ t: "const", v: c.id }) }))] : []),
  ];
  return (
    <PanelSection icon={<Ic n="hash" />} title="Formula" summary={toks.length ? toks.map(name).join(" ") : "Not set"} tone={"error" in parsed && toks.length ? "bad" : undefined} open={p.open} onToggle={p.onToggle}>
      {raw ? (
        <textarea className={`${AREA} font-mono text-[12px]`} rows={3} aria-label="Formula" value={calc.formula} onChange={(e) => set(e.target.value)} />
      ) : (
        <div className="flex min-h-[38px] flex-wrap items-center gap-[4px] rounded-sm border border-line-strong p-[6px]">
          {toks.map((x, i) => (
            <span key={i} className={x.t === "op" ? "px-[2px] font-mono text-muted" : `rounded-full border px-[8px] text-[12px] leading-[22px] ${x.t === "const" ? "border-signal bg-signal-soft text-signal-text" : "border-line-strong bg-paper text-ink"}`}>
              {name(x)}
            </span>
          ))}
        </div>
      )}
      {"error" in parsed && toks.length ? <p className="text-[12px] text-rose">{parsed.error}</p> : null}
      <div className="flex flex-wrap gap-[4px]">
        <Dd sm label="Add" ariaLabel="Add a question or setting" items={items} />
        {["+", "-", "*", "/", "(", ")"].map((o) => (
          <button key={o} type="button" className={GHOST_SM} onClick={() => add({ t: "op", v: o })} aria-label={`Add ${SIGN[o] ?? o}`}>
            {SIGN[o] ?? o}
          </button>
        ))}
        <button type="button" className={GHOST_SM} disabled={!toks.length} onClick={() => set(join(toks.slice(0, -1)) || "0")} aria-label="Remove the last part" title="Remove the last part">
          <Ic n="back" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-[8px]">
        <input className={`${IN_SM} w-[90px]`} inputMode="decimal" placeholder="Number" aria-label="Add a number" onKeyDown={(e) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (e.key === "Enter" && /^\d+(\.\d+)?$/.test(v)) {
            add({ t: "num", v });
            (e.target as HTMLInputElement).value = "";
          }
        }} />
        <button type="button" className="text-[12px] text-muted underline underline-offset-[3px] hover:text-ink" onClick={() => setRaw(!raw)}>
          {raw ? "Show as chips" : "Show formula"}
        </button>
      </div>
      <Labeled label="Shows as">
        <Seg label="Shows as" value={calc.format ?? "number"} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { calc: { ...calc, format: v === "number" ? undefined : v } } })} options={[{ value: "number", label: "Number" }, { value: "money", label: "Money" }, { value: "percent", label: "Percent" }]} />
      </Labeled>
      <div className={ROW}>
        Show on the form
        <Tg label="Show on the form" on={calc.show !== false} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { calc: { ...calc, show: v ? undefined : false } } })} />
      </div>
    </PanelSection>
  );
}

// A result block ------------------------------------------------------------------------------------------------------

const KIND_WORDS: Record<ResultBlock["kind"], string> = { metric: "Number", meter: "Meter", summary: "Breakdown", bars: "Bars", outcome: "Outcome", email: "Email my results" };

export function ResultSection(p: SectionProps) {
  const { f, form, apply } = p;
  const r = f.result ?? { kind: "outcome" as const };
  const set = (x: Partial<ResultBlock>) => apply({ op: "update_field", id: f.id, patch: { result: { ...r, ...x } } });
  const nums = numbers(form);
  const one = r.kind === "metric" || r.kind === "meter";
  const many = r.kind === "summary" || r.kind === "bars";
  return (
    <PanelSection icon={<Ic n="data" />} title="Result" summary={KIND_WORDS[r.kind]} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Shows">
        <Dd sm label={KIND_WORDS[r.kind]} ariaLabel="What the result shows" items={RESULT_KINDS.map((k): DdItem => ({ kind: "option", key: k, label: KIND_WORDS[k], on: k === r.kind, onPick: () => set({ kind: k }) }))} />
      </Labeled>
      {one ? (
        <Labeled label="Number">
          <Dd sm label={nums.find((x) => x.id === r.field)?.label ?? "Pick one"} ariaLabel="The number it shows" items={nums.map((x): DdItem => ({ kind: "option", key: x.id, label: x.label, on: x.id === r.field, onPick: () => set({ field: x.id }) }))} />
        </Labeled>
      ) : null}
      {r.kind === "meter" ? (
        <Labeled label="Top value">
          <NumBox aria-label="Top value" value={r.max} onChange={(n) => set({ max: n || undefined })} />
        </Labeled>
      ) : null}
      {many ? (
        <Labeled label="Numbers, in order">
          <div className="flex flex-col gap-[4px]">
            {nums.map((x) => (
              <label key={x.id} className={ROW}>
                {x.label}
                <Tg label={x.label} on={!!r.fields?.includes(x.id)} onChange={(v) => set({ fields: v ? [...(r.fields ?? []), x.id] : (r.fields ?? []).filter((y) => y !== x.id) })} />
              </label>
            ))}
          </div>
        </Labeled>
      ) : null}
      {one ? (
        <Labeled label="Label">
          <input className={IN_SM} aria-label="Label" value={f.label} onChange={(e) => apply({ op: "update_field", id: f.id, patch: { label: e.target.value } })} />
        </Labeled>
      ) : null}
    </PanelSection>
  );
}

// Choices: cards, scores, pictures, needs, a secret key ---------------------------------------------------------------

export function ChoiceExtrasSection(p: SectionProps) {
  const { f, apply } = p;
  const opts = f.options ?? [];
  const set = (options: Choice[]) => apply({ op: "update_field", id: f.id, patch: { options } });
  const edit = (i: number, x: Partial<Choice>) => set(opts.map((o, j) => (j === i ? Object.fromEntries(Object.entries({ ...o, ...x }).filter(([, v]) => v !== undefined && v !== "")) as Choice : o)));
  const scored = opts.filter((o) => o.score !== undefined).length;
  return (
    <PanelSection icon={<Ic n="hash" />} title="Scores and cards" summary={`${f.cards ? "Cards" : "List"}${scored ? `, ${scored} scored` : ""}${f.secret ? ", key kept private" : ""}`} open={p.open} onToggle={p.onToggle}>
      {f.type !== "dropdown" ? (
        <div className={ROW}>
          Big cards
          <Tg label="Big cards" on={!!f.cards} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { cards: v || undefined } })} />
        </div>
      ) : null}
      <div className="flex flex-col gap-[6px]">
        {opts.map((o, i) => (
          <div key={`${i}:${o.value}`} className="flex flex-col gap-[4px] rounded-sm border border-line p-[8px]">
            <div className="flex items-center gap-[6px]">
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{o.label}</span>
              <NumBox className={`${IN_SM} w-[84px]`} aria-label={`Score for ${o.label}`} placeholder="Score" value={o.score} onChange={(n) => edit(i, { score: n ?? undefined })} />
            </div>
            {f.cards ? <input className={IN_SM} aria-label={`Picture for ${o.label}`} placeholder="Picture, https://" value={o.image ?? ""} onChange={(e) => edit(i, { image: e.target.value.trim() || undefined })} /> : null}
            {f.type === "multi" && opts.length > 1 ? (
              <Dd
                sm
                ariaLabel={`What ${o.label} needs`}
                label={o.needs?.length ? `Needs ${o.needs.map((n) => opts.find((x) => x.value === n)?.label ?? n).join(", ")}` : "Needs nothing"}
                items={opts
                  .filter((x) => x.value !== o.value)
                  .map((x): DdItem => ({ kind: "option", key: x.value, label: x.label, on: !!o.needs?.includes(x.value), onPick: () => edit(i, { needs: o.needs?.includes(x.value) ? o.needs.filter((y) => y !== x.value) : [...(o.needs ?? []), x.value] }) }))}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className={ROW}>
        Keep scores on the server
        <Tg label="Keep scores on the server" on={!!f.secret} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { secret: v || undefined } })} />
      </div>
    </PanelSection>
  );
}

// Numbers: a slider and a unit ----------------------------------------------------------------------------------------

export function NumberExtrasSection(p: SectionProps) {
  const { f, apply } = p;
  const v = f.valid ?? {};
  return (
    <PanelSection icon={<Ic n="hash" />} title="Slider and unit" summary={`${f.slider ? `Slider ${v.min ?? 0} to ${v.max ?? 100}` : "Number box"}${f.unit ? `, ${f.unit}` : ""}`} open={p.open} onToggle={p.onToggle}>
      <div className={ROW}>
        Slider
        <Tg label="Slider" on={!!f.slider} onChange={(on) => apply({ op: "update_field", id: f.id, patch: { slider: on || undefined, ...(on && (v.min === undefined || v.max === undefined) ? { valid: { ...v, min: v.min ?? 0, max: v.max ?? 100 } } : {}) } })} />
      </div>
      <div className="grid grid-cols-3 gap-[6px]">
        {(["min", "max", "step"] as const).map((k) => (
          <Labeled key={k} label={{ min: "Lowest", max: "Highest", step: "Step" }[k]}>
            <NumBox aria-label={{ min: "Lowest", max: "Highest", step: "Step" }[k]} value={v[k]} onChange={(n) => apply({ op: "update_field", id: f.id, patch: { valid: { ...v, [k]: n ?? undefined } } })} />
          </Labeled>
        ))}
      </div>
      <Labeled label="Unit">
        <Seg label="Unit" value={f.unit ?? "none"} onChange={(u) => apply({ op: "update_field", id: f.id, patch: { unit: u === "none" ? undefined : u } })} options={[{ value: "none", label: "None" }, { value: "money", label: "Money" }, { value: "percent", label: "Percent" }]} />
      </Labeled>
    </PanelSection>
  );
}

// Nothing picked: Screens, Settings and Results -----------------------------------------------------------------------

export function ScreensSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const { form, apply } = p;
  const l = form.layout;
  const cover = l.cover;
  const setCover = (x: Partial<NonNullable<typeof cover>>) => apply({ op: "set_layout", cover: { title: cover?.title ?? "", ...cover, ...x } });
  return (
    <PanelSection icon={<Ic n="steps" />} title="Screens" summary={l.mode === "screens" ? `One step a screen${cover ? ", with a cover" : ""}` : "All on one page"} open={p.open} onToggle={p.onToggle}>
      <div className={ROW}>
        One step a screen
        <Tg label="One step a screen" on={l.mode === "screens"} onChange={(v) => apply({ op: "set_layout", mode: v ? "screens" : null })} />
      </div>
      <div className={ROW}>
        Move on after a single pick
        <Tg label="Move on after a single pick" on={!!l.auto} onChange={(v) => apply({ op: "set_layout", auto: v })} />
      </div>
      <div className={ROW}>
        Cover screen
        <Tg label="Cover screen" on={!!cover} onChange={(v) => apply({ op: "set_layout", cover: v ? { title: form.title || "Get started", button: "Start" } : null })} />
      </div>
      {cover ? (
        <>
          <Labeled label="Title">
            <input className={IN_SM} aria-label="Cover title" value={cover.title} onChange={(e) => setCover({ title: e.target.value })} />
          </Labeled>
          <Labeled label="Line">
            <input className={IN_SM} aria-label="Cover line" value={cover.text ?? ""} onChange={(e) => setCover({ text: e.target.value || undefined })} />
          </Labeled>
          <Labeled label="Button">
            <input className={IN_SM} aria-label="Cover button" value={cover.button ?? ""} placeholder="Start" onChange={(e) => setCover({ button: e.target.value || undefined })} />
          </Labeled>
        </>
      ) : null}
      <Labeled label="Result screens">
        <div className="flex flex-col gap-[4px]">
          {form.steps.map((s, i) => (
            <label key={s.id} className={ROW}>
              {s.title || `Step ${i + 1}`}
              <Tg label={`Step ${i + 1} is a result screen`} on={!!s.result} onChange={(v) => apply({ op: "update_step", index: i, result: v })} />
            </label>
          ))}
        </div>
      </Labeled>
    </PanelSection>
  );
}

const slug = (s: string, taken: Set<string>) => {
  const b = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 20) || "value";
  let k = b;
  for (let n = 2; taken.has(k); n++) k = `${b}_${n}`;
  return k;
};

export function SettingsSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const { form, apply } = p;
  const list = form.constants ?? [];
  const set = (constants: Constant[]) => apply({ op: "set_constants", constants });
  const edit = (i: number, x: Partial<Constant>) => set(list.map((c, j) => (j === i ? (Object.fromEntries(Object.entries({ ...c, ...x }).filter(([, v]) => v !== undefined)) as Constant) : c)));
  const unset = list.filter((c) => c.value === null).length;
  return (
    <PanelSection icon={<Ic n="data" />} title="Settings" summary={list.length ? `${list.length} ${list.length === 1 ? "value" : "values"}${unset ? `, ${unset} to set` : ""}` : "None"} tone={unset ? "warn" : undefined} open={p.open} onToggle={p.onToggle}>
      {list.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse text-[12.5px]">
            <thead>
              <tr className="text-left text-[11.5px] text-muted">
                <th className="py-[4px] font-normal">Name</th>
                <th className="py-[4px] font-normal">Value</th>
                <th className="py-[4px] font-normal">Private</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={c.id} className="border-t border-line">
                  <td className="py-[4px] pr-[6px]">
                    <input className={IN_SM} aria-label="Name" value={c.name} onChange={(e) => edit(i, { name: e.target.value })} />
                  </td>
                  <td className="py-[4px] pr-[6px]">
                    <NumBox className={`${IN_SM} tabular-nums ${c.value === null ? "border-butter bg-butter-wash" : ""}`} aria-label={`${c.name} value`} placeholder="Set before publishing" value={c.value} onChange={(n) => edit(i, { value: n })} />
                  </td>
                  <td className="py-[4px]">
                    <Tg label={`${c.name} is private`} on={!!c.private} onChange={(v) => edit(i, { private: v ? true : undefined })} />
                  </td>
                  <td className="py-[4px]">
                    <button type="button" className={X} aria-label={`Remove ${c.name}`} title="Remove" onClick={() => set(list.filter((_, j) => j !== i))}>
                      <Ic n="x" s={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <button type="button" className={GHOST_SM} onClick={() => set([...list, { id: slug("value", new Set(list.map((c) => c.id))), name: "New value", value: null }])}>
        <Ic n="plus" />
        Add a value
      </button>
    </PanelSection>
  );
}

const OPS: { value: CondOp; label: string; needs: "none" | "one" | "two" }[] = [
  { value: "gte", label: "is at least", needs: "one" },
  { value: "lt", label: "is under", needs: "one" },
  { value: "between", label: "is between", needs: "two" },
  { value: "is", label: "is", needs: "one" },
  { value: "empty", label: "is empty", needs: "none" },
];

export function ResultsSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const { form, apply } = p;
  const res: Results = form.results ?? { outcomes: [], show: "instant" };
  const set = (x: Partial<Results>) => {
    const next = { ...res, ...x };
    apply({ op: "set_results", results: next.outcomes.length ? next : null });
  };
  const outs = res.outcomes;
  const rules = outs.slice(0, -1);
  const fallback = outs[outs.length - 1];
  const fields = allFields(form).filter((x) => ["number", "calc", "choice", "dropdown", "multi", "checkbox", "rating"].includes(x.type));
  const editOut = (i: number, x: Partial<Outcome>) => set({ outcomes: outs.map((o, j) => (j === i ? { ...o, ...x } : o)) });
  const editCond = (i: number, k: number, x: Partial<Cond>) => editOut(i, { when: { logic: outs[i]!.when!.logic, conds: outs[i]!.when!.conds.map((c, j) => (j === k ? { ...c, ...x } : c)) } });
  const add = () => {
    const blank: Outcome = { id: slug("outcome", new Set(outs.map((o) => o.id))), title: "New outcome", when: { logic: "all", conds: [{ field: fields[0]?.id ?? "", op: "gte", value: "0" }] } };
    set({ outcomes: outs.length ? [...rules, blank, fallback!] : [blank, { id: "everyone", title: "Everyone else" }] });
  };
  const move = (i: number, by: number) => {
    const next = [...rules];
    const [o] = next.splice(i, 1);
    next.splice(i + by, 0, o!);
    set({ outcomes: [...next, fallback!] });
  };
  return (
    <PanelSection icon={<Ic n="flow" />} title="Results" summary={outs.length ? `${outs.length} outcomes` : "None"} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Show results">
        <Seg label="Show results" value={res.show} onChange={(v) => set({ show: v })} options={[{ value: "instant", label: "Right away" }, { value: "after_contact", label: "After the send" }]} />
      </Labeled>
      {rules.map((o, i) => (
        <div key={o.id} className="flex flex-col gap-[6px] rounded-sm border border-line p-[8px]">
          <div className="flex items-center gap-[4px]">
            <input className={IN_SM} aria-label="Outcome title" value={o.title} onChange={(e) => editOut(i, { title: e.target.value })} />
            <button type="button" className={X} disabled={i === 0} aria-label="Move up" title="Move up" onClick={() => move(i, -1)}>
              <Ic n="up" s={12} />
            </button>
            <button type="button" className={X} aria-label={`Remove ${o.title}`} title="Remove" onClick={() => set({ outcomes: outs.filter((_, j) => j !== i) })}>
              <Ic n="x" s={12} />
            </button>
          </div>
          {o.when?.conds.map((c, k) => {
            const op = OPS.find((x) => x.value === c.op) ?? OPS[0]!;
            return (
              <div key={k} className="flex flex-wrap items-center gap-[4px]">
                <Dd sm ariaLabel="Field" label={fields.find((x) => x.id === c.field)?.label ?? "Pick a field"} items={fields.map((x): DdItem => ({ kind: "option", key: x.id, label: x.label, on: x.id === c.field, onPick: () => editCond(i, k, { field: x.id }) }))} />
                <Dd sm ariaLabel="Test" label={op.label} items={OPS.map((x): DdItem => ({ kind: "option", key: x.value, label: x.label, on: x.value === c.op, onPick: () => editCond(i, k, { op: x.value, ...(x.needs === "none" ? { value: undefined, value2: undefined } : {}) }) }))} />
                {op.needs !== "none" ? <input className={`${IN_SM} w-[80px]`} aria-label="Value" value={c.value ?? ""} onChange={(e) => editCond(i, k, { value: e.target.value })} /> : null}
                {op.needs === "two" ? <input className={`${IN_SM} w-[80px]`} aria-label="And" value={c.value2 ?? ""} onChange={(e) => editCond(i, k, { value2: e.target.value })} /> : null}
              </div>
            );
          })}
          <AreaOrText value={o.text ?? ""} onChange={(text) => editOut(i, { text: text || undefined })} />
        </div>
      ))}
      {fallback ? (
        <div className="flex flex-col gap-[6px] rounded-sm border border-dashed border-line-strong p-[8px]">
          <span className="text-[11.5px] text-muted">Everyone else</span>
          <input className={IN_SM} aria-label="Outcome for everyone else" value={fallback.title} onChange={(e) => editOut(outs.length - 1, { title: e.target.value })} />
          <AreaOrText value={fallback.text ?? ""} onChange={(text) => editOut(outs.length - 1, { text: text || undefined })} />
        </div>
      ) : null}
      <button type="button" className={GHOST_SM} disabled={!fields.length} onClick={add}>
        <Ic n="plus" />
        Add an outcome
      </button>
    </PanelSection>
  );
}

function AreaOrText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <textarea className={AREA} rows={2} aria-label="Outcome text" placeholder="What to do next" value={value} onChange={(e) => onChange(e.target.value)} />;
}






// Files: the biggest size and the kinds taken ---------------------------------------------------------------------------

const FILE_WORDS: Record<FileKind, string> = { pdf: "PDF", image: "Pictures", office: "Office files" };

export function FileSection(p: SectionProps) {
  const { f, apply } = p;
  const cur = f.file ?? { maxMb: 10, kinds: FILE_KINDS };
  const set = (x: Partial<typeof cur>) => apply({ op: "update_field", id: f.id, patch: { file: { ...cur, ...x } } });
  return (
    <PanelSection icon={<Ic n="ext" />} title="Files" summary={`${cur.kinds.map((k) => FILE_WORDS[k]).join(", ")}, up to ${cur.maxMb} MB`} open={p.open} onToggle={p.onToggle}>
      {FILE_KINDS.map((k) => (
        <div key={k} className={ROW}>
          {FILE_WORDS[k]}
          <Tg label={FILE_WORDS[k]} on={cur.kinds.includes(k)} onChange={(v) => set({ kinds: v ? [...cur.kinds, k] : cur.kinds.filter((x) => x !== k) })} />
        </div>
      ))}
      <Labeled label="Biggest file, MB">
        <input className={IN_SM} inputMode="numeric" aria-label="Biggest file in MB" value={cur.maxMb} onChange={(e) => set({ maxMb: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
      </Labeled>
    </PanelSection>
  );
}

// An HTML section: the code, cleaned the way visitors get it -------------------------------------------------------------

export function HtmlSection(p: SectionProps) {
  const { f, apply } = p;
  const html = f.content?.html ?? "";
  return (
    <PanelSection icon={<Ic n="code" />} title="Section" summary={htmlText(html).slice(0, 60) || "Empty"} open={p.open} onToggle={p.onToggle}>
      <textarea className={`${AREA} font-mono text-[12px]`} rows={12} aria-label="Section HTML" value={html} onChange={(e) => apply({ op: "update_field", id: f.id, patch: { content: { ...f.content, html: e.target.value } } })} />
    </PanelSection>
  );
}
