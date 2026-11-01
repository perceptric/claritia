"use client";

// Build's panel for interactive forms (docs/interactive-forms-plan.md Part 6b). A question: its formula as chips, a
// result block, scores and pictures on choices, a slider and a unit on numbers. Nothing picked: Screens (one step at
// a time, the cover, result screens), Settings (the values formulas read, kept private or not) and Results (outcomes in
// order, the last one for everyone else).

import { useState } from "react";
import { parseFormula } from "@/lib/forms/formula";
import { htmlText } from "@/lib/forms/html";
import { allFields, FILE_KINDS, PAY_CURRENCIES, RESULT_KINDS, type FileKind, type Choice, type Cond, type Constant, type Field, type Form, type Jump, type Op as CondOp, type Outcome, type ResultBlock, type Results } from "@/lib/forms/schema";
import { KINDS } from "@/lib/forms/aiBuild";
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
      <div className={ROW}>
        Show the logo
        <Tg label="Show the logo" on={l.logo !== false} onChange={(v) => apply({ op: "set_layout", logo: v })} />
      </div>
      <div className={ROW}>
        Picture beside each step
        <Tg label="Picture beside each step" on={!!l.side} onChange={(v) => apply({ op: "set_layout", side: v ? { image: form.steps.find((x) => x.image)?.image ?? "https://" } : null })} />
      </div>
      {l.side ? (
        <>
          <Labeled label="Picture address">
            <input className={IN_SM} aria-label="Picture address" placeholder="https://" value={l.side.image} onChange={(e) => apply({ op: "set_layout", side: { ...l.side!, image: e.target.value } })} />
          </Labeled>
          <Labeled label="Picture side">
            <Seg label="Picture side" value={l.side.at ?? "left"} onChange={(v) => apply({ op: "set_layout", side: { image: l.side!.image, ...(v === "right" ? { at: "right" as const } : {}) } })} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
          </Labeled>
          <Labeled label="Step pictures">
            <div className="flex flex-col gap-[4px]">
              {form.steps.map((s, i) => (
                <input key={s.id} className={IN_SM} aria-label={`Picture for step ${i + 1}`} placeholder={`${s.title || `Step ${i + 1}`}: same picture`} value={s.image ?? ""} onChange={(e) => apply({ op: "update_step", index: i, image: e.target.value || null })} />
              ))}
            </div>
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

// Kind and email -----------------------------------------------------------------------------------------------------

/** What the form is for, and whether it needs an email (docs/form-kinds-plan.md). */
export function KindSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const { form, apply } = p;
  const email = allFields(form).find((f) => f.key === "email");
  const label = KINDS.find((k) => k.value === form.kind)?.label;
  const setOptional = (on: boolean) => {
    if (on) apply([{ op: "set_kind", emailOptional: true }, ...(email?.required ? [{ op: "update_field" as const, id: email.id, patch: { required: false } }] : [])], "Email is optional now");
    else apply([{ op: "set_kind", emailOptional: false }, ...(email ? [{ op: "update_field" as const, id: email.id, patch: { required: true } }] : [{ op: "add_field" as const, field: { key: "email" as const, type: "email" as const, label: "Email", required: true } }])], "Email is required now");
  };
  return (
    <PanelSection icon={<Ic n="form" />} title="Kind" summary={`${label ?? "Form"}, ${form.emailOptional ? "email optional" : "email required"}`} open={p.open} onToggle={p.onToggle}>
      <div className="flex flex-wrap gap-[6px]">
        {KINDS.map((k) => (
          <button key={k.value} type="button" title={k.text} aria-pressed={form.kind === k.value} onClick={() => apply({ op: "set_kind", kind: form.kind === k.value ? null : k.value })} className={form.kind === k.value ? "press inline-flex h-[26px] items-center rounded-full border border-ink bg-ink px-[10px] text-[12px] text-card" : GHOST_SM}>
            {k.label}
          </button>
        ))}
      </div>
      <div className={ROW}>
        Email optional
        <Tg label="Email optional" on={!!form.emailOptional} onChange={setOptional} />
      </div>
      <div className={ROW}>
        Save and finish later
        <Tg label="Save and finish later" on={!!form.resume} onChange={(v) => apply({ op: "set_kind", resume: v })} />
      </div>
      <div className={ROW}>
        PDF copy after sending
        <Tg label="PDF copy after sending" on={!!form.copy} onChange={(v) => apply({ op: "set_kind", copy: v })} />
      </div>
    </PanelSection>
  );
}

// Paths ---------------------------------------------------------------------------------------------------------------

const PATH_FIELDS = new Set(["choice", "dropdown", "multi", "number", "rating", "calc", "checkbox"]);

/** Paths by answer: after a step, go to a later step or send the form there (end early). */
export function PathsSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const { form, apply } = p;
  const n = form.steps.length;
  const count = form.steps.reduce((a, s) => a + (s.jumps?.length ?? 0), 0);
  const fieldsTo = (i: number) => form.steps.slice(0, i + 1).flatMap((s) => s.fields).filter((f) => PATH_FIELDS.has(f.type));
  const setJumps = (i: number, jumps: Jump[]) => apply({ op: "update_step", index: i, jumps: jumps.length ? jumps : null });
  const condFor = (f: Field): Cond => (f.type === "number" || f.type === "rating" || f.type === "calc" ? { field: f.id, op: "gte", value: "1" } : f.type === "checkbox" ? { field: f.id, op: "filled" } : f.type === "multi" ? { field: f.id, op: "any_of", values: [f.options?.[0]?.value ?? ""] } : { field: f.id, op: "is", value: f.options?.[0]?.value ?? "" });
  const targets = (i: number) => [...Array.from({ length: n - i - 2 > 0 ? n - i - 2 : 0 }, (_, k) => i + 2 + k), n];
  const where = (to: number) => (to >= n ? "End the form" : form.steps[to]?.title || `Step ${to + 1}`);
  if (n < 2)
    return (
      <PanelSection icon={<Ic n="branch" />} title="Paths" summary="Add a step first" open={p.open} onToggle={p.onToggle}>
        <span className="text-[12.5px] text-muted">Add a step first</span>
      </PanelSection>
    );
  return (
    <PanelSection icon={<Ic n="branch" />} title="Paths" summary={count ? `${count} ${count === 1 ? "path" : "paths"}` : "Steps in order"} open={p.open} onToggle={p.onToggle}>
      {form.steps.slice(0, n).map((st, i) => {
        const fs = fieldsTo(i);
        const jumps = st.jumps ?? [];
        if (!fs.length) return null;
        return (
          <div key={st.id} className="flex flex-col gap-[6px] border-t border-line pt-[8px] first:border-t-0 first:pt-0">
            <span className="text-[12px] text-muted">{`After ${st.title || `step ${i + 1}`}`}</span>
            {jumps.map((j, ji) => {
              const f = fs.find((x) => x.id === j.when.field) ?? fs[0]!;
              const num = f.type === "number" || f.type === "rating" || f.type === "calc";
              const edit = (x: Partial<Jump>) => setJumps(i, jumps.map((y, k) => (k === ji ? { ...y, ...x } : y)));
              const val = j.when.op === "any_of" ? (j.when.values?.[0] ?? "") : (j.when.value ?? "");
              return (
                <div key={ji} className="flex flex-wrap items-center gap-[4px]">
                  <Dd sm label={f.label || "Question"} ariaLabel="Answer" items={fs.map((x): DdItem => ({ kind: "option", key: x.id, label: x.label || x.key, on: x.id === f.id, onPick: () => edit({ when: condFor(x) }) }))} />
                  {num ? (
                    <>
                      <Dd sm label={j.when.op === "lt" ? "under" : "at least"} ariaLabel="Compare" items={(["gte", "lt"] as const).map((o): DdItem => ({ kind: "option", key: o, label: o === "lt" ? "under" : "at least", on: j.when.op === o, onPick: () => edit({ when: { ...j.when, op: o } }) }))} />
                      <NumBox className={`${IN_SM} w-[70px]`} aria-label="Value" value={Number(val) || 0} onChange={(v) => edit({ when: { ...j.when, value: String(v ?? 0) } })} />
                    </>
                  ) : f.type === "checkbox" ? (
                    <span className="text-[12.5px] text-muted">is ticked</span>
                  ) : (
                    <Dd
                      sm
                      label={`is ${f.options?.find((o) => o.value === val)?.label ?? val}`}
                      ariaLabel="Value"
                      items={(f.options ?? []).map((o): DdItem => ({ kind: "option", key: o.value, label: o.label, on: o.value === val, onPick: () => edit({ when: f.type === "multi" ? { field: f.id, op: "any_of", values: [o.value] } : { field: f.id, op: "is", value: o.value } }) }))}
                    />
                  )}
                  <Dd sm label={`go to ${where(j.to)}`} ariaLabel="Go to" items={targets(i).map((t): DdItem => ({ kind: "option", key: String(t), label: where(t), on: t === j.to, onPick: () => edit({ to: t }) }))} />
                  <button type="button" className="press inline-flex size-[24px] items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" aria-label="Remove path" title="Remove" onClick={() => setJumps(i, jumps.filter((_, k) => k !== ji))}>
                    <Ic n="x" s={12} />
                  </button>
                </div>
              );
            })}
            <button type="button" className={`${GHOST_SM} self-start`} onClick={() => setJumps(i, [...jumps, { when: condFor(fs[fs.length - 1]!), to: targets(i)[0]! }])}>
              <Ic n="plus" />
              Add a path
            </button>
          </div>
        );
      })}
    </PanelSection>
  );
}

// Answers with parts (docs/form-kinds-plan.md step 2) ---------------------------------------------------------------

const lines = (list: Choice[]) => list.map((c) => c.label).join("\n");
/** One choice per line, keeping each line's value when its words didn't change. */
const fromLines = (text: string, was: Choice[]): Choice[] =>
  text
    .split("\n")
    .map((l) => l.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 12)
    .map((l) => was.find((c) => c.label === l) ?? { value: l, label: l });

/** Rating and the 0 to 10 scale: how many points, stars or numbers, and the words at each end. */
export function RatingSection(p: SectionProps) {
  const { f, apply } = p;
  const r = f.rating ?? { scale: 5, style: "stars" as const };
  const set = (x: Partial<NonNullable<Field["rating"]>>) => {
    const next = { ...r, ...x };
    if (next.style === "stars") delete next.zero;
    apply({ op: "update_field", id: f.id, patch: { rating: next } });
  };
  return (
    <PanelSection icon={<Ic n="hash" />} title="Scale" summary={`${r.zero ? 0 : 1} to ${r.scale}, ${r.style === "numbers" ? "numbers" : "stars"}`} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Show as">
        <Seg label="Show as" value={r.style} onChange={(v) => set({ style: v })} options={[{ value: "stars", label: "Stars" }, { value: "numbers", label: "Numbers" }]} />
      </Labeled>
      <Labeled label="Highest">
        <NumBox aria-label="Highest" value={r.scale} onChange={(n) => n !== null && n >= 3 && n <= 10 && set({ scale: Math.round(n) })} />
      </Labeled>
      {r.style === "numbers" ? (
        <div className={ROW}>
          Start at 0
          <Tg label="Start at 0" on={!!r.zero} onChange={(v) => set({ zero: v || undefined })} />
        </div>
      ) : null}
      <Labeled label="Low end">
        <input className={IN_SM} aria-label="Low end" value={r.low ?? ""} placeholder="Not likely" onChange={(e) => set({ low: e.target.value || undefined })} />
      </Labeled>
      <Labeled label="High end">
        <input className={IN_SM} aria-label="High end" value={r.high ?? ""} placeholder="Very likely" onChange={(e) => set({ high: e.target.value || undefined })} />
      </Labeled>
    </PanelSection>
  );
}

/** Grid: the rows asked about and the columns to answer with, one per line. */
export function GridSection(p: SectionProps) {
  const { f, apply } = p;
  const g = f.grid ?? { rows: [], cols: [] };
  const [rows, setRows] = useState(lines(g.rows));
  const [cols, setCols] = useState(lines(g.cols));
  return (
    <PanelSection icon={<Ic n="data" />} title="Rows and columns" summary={`${g.rows.length} rows, ${g.cols.length} columns`} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Rows">
        <textarea className={AREA} rows={4} aria-label="Rows" value={rows} onChange={(e) => (setRows(e.target.value), apply({ op: "update_field", id: f.id, patch: { grid: { ...g, rows: fromLines(e.target.value, g.rows) } } }))} />
      </Labeled>
      <Labeled label="Columns">
        <textarea className={AREA} rows={4} aria-label="Columns" value={cols} onChange={(e) => (setCols(e.target.value), apply({ op: "update_field", id: f.id, patch: { grid: { ...g, cols: fromLines(e.target.value, g.cols) } } }))} />
      </Labeled>
    </PanelSection>
  );
}

const GROUP_KINDS: { v: Field["type"]; l: string }[] = [
  { v: "text", l: "Short text" },
  { v: "email", l: "Email" },
  { v: "phone", l: "Phone" },
  { v: "number", l: "Number" },
  { v: "date", l: "Date" },
  { v: "dropdown", l: "Choices" },
];

/** Add another: the questions in each row, how many rows, and the add button's words. */
export function GroupSection(p: SectionProps) {
  const { f, apply } = p;
  const g = f.group ?? { fields: [], max: 5 };
  const set = (x: Partial<NonNullable<Field["group"]>>) => apply({ op: "update_field", id: f.id, patch: { group: { ...g, ...x } } });
  const edit = (i: number, x: Partial<Field>) => set({ fields: g.fields.map((sf, j) => (j === i ? { ...sf, ...x } : sf)) });
  return (
    <PanelSection icon={<Ic n="dup" />} title="Each row" summary={`${g.fields.length} ${g.fields.length === 1 ? "question" : "questions"}, up to ${g.max} rows`} open={p.open} onToggle={p.onToggle}>
      <div className="flex flex-col gap-[6px]">
        {g.fields.map((sf, i) => (
          <div key={sf.id} className="flex flex-col gap-[4px] rounded-[6px] border border-line p-[8px]">
            <div className="flex items-center gap-[6px]">
              <input className={IN_SM} aria-label={`Row question ${i + 1}`} value={sf.label} onChange={(e) => edit(i, { label: e.target.value })} />
              <Dd sm label={GROUP_KINDS.find((k) => k.v === sf.type)?.l ?? "Short text"} ariaLabel="Type" items={GROUP_KINDS.map((k): DdItem => ({ kind: "option", key: k.v, label: k.l, on: k.v === sf.type, onPick: () => edit(i, { type: k.v, ...(k.v === "dropdown" ? { options: sf.options?.length ? sf.options : [{ value: "Option 1", label: "Option 1" }, { value: "Option 2", label: "Option 2" }] } : { options: undefined }) }) }))} />
              <button type="button" className={X} aria-label={`Remove ${sf.label}`} title="Remove" disabled={g.fields.length < 2} onClick={() => set({ fields: g.fields.filter((_, j) => j !== i) })}>
                <Ic n="x" s={12} />
              </button>
            </div>
            {sf.type === "dropdown" ? <textarea className={AREA} rows={2} aria-label={`${sf.label} choices`} defaultValue={lines(sf.options ?? [])} onBlur={(e) => edit(i, { options: fromLines(e.target.value, sf.options ?? []) })} /> : null}
            <div className={ROW}>
              Required
              <Tg label={`${sf.label} required`} on={sf.required} onChange={(v) => edit(i, { required: v })} />
            </div>
          </div>
        ))}
        {g.fields.length < 6 ? (
          <button type="button" className={`${GHOST_SM} self-start`} onClick={() => set({ fields: [...g.fields, { id: `g${Date.now().toString(36).slice(-6)}`, key: "q.answer" as Field["key"], type: "text", label: "Question", required: false }] })}>
            <Ic n="plus" />
            Add a question
          </button>
        ) : null}
      </div>
      <Labeled label="Most rows">
        <NumBox aria-label="Most rows" value={g.max} onChange={(n) => n !== null && n >= 1 && n <= 20 && set({ max: Math.round(n) })} />
      </Labeled>
      <Labeled label="Add button">
        <input className={IN_SM} aria-label="Add button" value={g.add ?? ""} placeholder="Add another" onChange={(e) => set({ add: e.target.value || undefined })} />
      </Labeled>
    </PanelSection>
  );
}

/** Payment: what it charges (a calculation or a fixed amount) and the currency. */
export function PaymentSection(p: SectionProps) {
  const { f, form, apply } = p;
  const pay = f.pay ?? { currency: "USD" };
  const calcs = allFields(form).filter((x) => x.type === "calc");
  const set = (x: Partial<NonNullable<Field["pay"]>>) => {
    const next = { ...pay, ...x };
    if (x.field) delete next.amount;
    if (x.amount !== undefined) delete next.field;
    apply({ op: "update_field", id: f.id, patch: { pay: next } });
  };
  const from = pay.field ? calcs.find((c) => c.id === pay.field) : null;
  return (
    <PanelSection icon={<Ic n="lock" />} title="Payment" summary={from ? `${from.label || "Total"}, ${pay.currency}` : `${pay.amount ?? 0} ${pay.currency}`} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Charge">
        <Dd
          sm
          label={from ? from.label || "Total" : "A fixed amount"}
          ariaLabel="Charge"
          items={[{ kind: "option", key: "fixed", label: "A fixed amount", on: !pay.field, onPick: () => set({ amount: pay.amount ?? 49 }) }, ...calcs.map((c): DdItem => ({ kind: "option", key: c.id, label: c.label || "Total", on: c.id === pay.field, onPick: () => set({ field: c.id }) }))]}
        />
      </Labeled>
      {pay.field ? null : (
        <Labeled label="Amount">
          <NumBox aria-label="Amount" value={pay.amount} onChange={(n) => n !== null && n > 0 && set({ amount: n })} />
        </Labeled>
      )}
      <Labeled label="Currency">
        <Dd sm label={pay.currency} ariaLabel="Currency" items={PAY_CURRENCIES.map((c): DdItem => ({ kind: "option", key: c, label: c, on: c === pay.currency, onPick: () => set({ currency: c }) }))} />
      </Labeled>
      <Labeled label="Label">
        <input className={IN_SM} aria-label="Label" value={f.label} onChange={(e) => apply({ op: "update_field", id: f.id, patch: { label: e.target.value } })} />
      </Labeled>
    </PanelSection>
  );
}
