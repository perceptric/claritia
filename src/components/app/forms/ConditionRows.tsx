"use client";

// The If rows a routing row is made of (docs/on-submission.md): field, test and value, more with "+ and", every one of
// them needed. Shared by a form's Routing (conditions to a meeting) and a Dynamic meeting's rules (conditions to a rep
// or a team). A value left empty matches nobody, so a half-made row never catches a lead.

import { useState } from "react";
import { countryNames } from "@/lib/forms/countries";
import { countryName, type FieldDef } from "@/lib/router/conditions";
import type { Cond } from "@/lib/router/types";
import { fieldOf } from "@/lib/routing/screenModel";
import { Ic } from "./ic";
import { Dd, IB_SM, IN_SM, type DdItem } from "./parts";

/** The tests a row offers for a field, in plain words. */
export function testsFor(f: FieldDef): { value: Cond["op"]; label: string }[] {
  if (f.type === "number")
    return [
      { value: "gte", label: "is at least" },
      { value: "lt", label: "is less than" },
      { value: "is", label: "is" },
    ];
  if (f.type === "text")
    return [
      { value: "contains", label: "contains" },
      { value: "is", label: "is" },
      { value: "is_not", label: "is not" },
    ];
  return [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ];
}

/** A new condition: the field's first test and no value yet. */
export const blankCond = (f: FieldDef): Cond => ({ field: f.key, op: testsFor(f)[0]!.value, value: "" });

/** The fields a row can test: the router's, without the ones that need setting up elsewhere. */
export const usable = (fields: FieldDef[]) => fields.filter((f) => f.type !== "bool" && f.key !== "company.type" && f.key !== "lead.form" && (f.type !== "choice" || (f.options?.length ?? 0) > 0));

const valueWords = (c: Cond, f: FieldDef) => {
  const v = Array.isArray(c.value) ? c.value[0] : c.value;
  return v === undefined || v === "" ? "…" : f.type === "country" ? countryName(String(v)) : String(v);
};

/** A condition in short words: "Country is United States". */
export const condWords = (c: Cond, fields: FieldDef[]) => {
  const f = fieldOf(c.field, fields);
  return `${f.label} ${testsFor(f).find((o) => o.value === c.op)?.label ?? c.op} ${valueWords(c, f)}`;
};

export const newRowId = (p: string) => `${p}${Math.random().toString(36).slice(2, 10)}`;

function groupItems(fields: FieldDef[], pick: (f: FieldDef) => void, cur: string): DdItem[] {
  const out: DdItem[] = [];
  let group = "";
  for (const f of fields) {
    if (f.group !== group) {
      group = f.group;
      out.push({ kind: "group", label: group });
    }
    out.push({ kind: "option", key: f.key, label: f.label, search: f.label, on: f.key === cur, onPick: () => f.key !== cur && pick(f) });
  }
  return out;
}

const COUNTRIES = countryNames("en-US");

/** A condition's value: a picker for countries and choices, a box for numbers and text. Numbers are saved as numbers. */
export function ValueInput({ field, value, onChange, search, onSearch }: { field: FieldDef; value: string | number; onChange: (v: string | number) => void; search: string; onSearch: (q: string) => void }) {
  if (field.type === "country")
    return (
      <Dd
        sm
        ariaLabel={field.label}
        label={value ? countryName(String(value)) : <span className="text-faint">Pick</span>}
        menuWidth={220}
        search={search}
        onSearch={onSearch}
        searchLabel="Search countries"
        items={COUNTRIES.map((c): DdItem => ({ kind: "option", key: c.value, label: c.label, search: c.label, on: c.value === value, onPick: () => onChange(c.value) }))}
      />
    );
  if (field.type === "choice") return <Dd sm ariaLabel={field.label} label={value ? String(value) : <span className="text-faint">Pick</span>} items={(field.options ?? []).map((o): DdItem => ({ kind: "option", key: o, label: o, on: o === value, onPick: () => onChange(o) }))} />;
  if (field.type === "number")
    return (
      <input
        className={IN_SM}
        inputMode="numeric"
        aria-label={field.label}
        value={value === "" ? "" : String(value)}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.]/g, "");
          onChange(t === "" ? "" : Number.isFinite(Number(t)) ? Number(t) : t);
        }}
      />
    );
  return <input className={IN_SM} aria-label={field.label} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}

/** The If lines of one row, editable (or read-only for members). */
export function ConditionRows({ conds, onChange, fields, readOnly = false }: { conds: Cond[]; onChange: (c: Cond[]) => void; fields: FieldDef[]; readOnly?: boolean }) {
  const [q, setQ] = useState("");
  const pickable = usable(fields);
  const set = (i: number, c: Cond) => onChange(conds.map((x, n) => (n === i ? c : x)));
  const next = pickable.find((f) => !conds.some((c) => c.field === f.key)) ?? pickable[0];
  return (
    <>
      {conds.map((c, i) => {
        const f = fieldOf(c.field, fields);
        const tests = testsFor(f);
        const kw = <span className={`text-[12.5px] ${i ? "font-medium text-muted" : "font-semibold text-ink"}`}>{i ? "and" : "If"}</span>;
        if (readOnly)
          return (
            <div key={i} className="flex items-baseline gap-[8px] text-[12.5px]">
              {kw}
              <span className="text-ink">{condWords(c, fields)}</span>
            </div>
          );
        return (
          <div key={i} className="grid grid-cols-[30px_minmax(0,1fr)_auto_minmax(0,1fr)_24px] items-center gap-[5px]">
            {kw}
            <Dd sm ariaLabel="Field" label={f.label} menuWidth={240} search={q} onSearch={setQ} items={groupItems(pickable, (nf) => set(i, blankCond(nf)), c.field)} />
            <span className="w-[96px]">
              <Dd sm ariaLabel="Test" label={tests.find((o) => o.value === c.op)?.label ?? c.op} items={tests.map((o): DdItem => ({ kind: "option", key: o.value, label: o.label, on: o.value === c.op, onPick: () => set(i, { ...c, op: o.value }) }))} />
            </span>
            <ValueInput field={f} value={Array.isArray(c.value) ? (c.value[0] ?? "") : (c.value ?? "")} onChange={(v) => set(i, { ...c, value: v })} search={q} onSearch={setQ} />
            {conds.length > 1 ? (
              <button type="button" className={IB_SM} aria-label="Remove this and" title="Remove" onClick={() => onChange(conds.filter((_, n) => n !== i))}>
                <Ic n="x" s={12} />
              </button>
            ) : (
              <span />
            )}
          </div>
        );
      })}
      {readOnly || !next ? null : (
        <button type="button" className="ml-[30px] h-[22px] self-start rounded-full px-[8px] text-[12px] font-medium text-muted hover:bg-hover hover:text-ink" onClick={() => onChange([...conds, blankCond(next)])}>
          + and
        </button>
      )}
    </>
  );
}
