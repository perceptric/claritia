"use client";

// The design system's own panels in the builder's left rail (docs/design-system.md Parts 5.1 and 5.5): Styles lists
// every class with its uses on this form, to rename, pick or delete; Variables lists the kit's built-in variables
// and the team's own, to add, rename, change (with a dark value for colors) or delete. Both end with Publish styles,
// which sends the draft to every live form on the design system, and the style guide.

import { useRef, useState } from "react";
import { addVariable, classUses, deleteClass, deleteVariable, renameClass, updateVariable, variableUses, type Edit } from "@/lib/design/edit";
import { allVariables, BUILT_IN, type Variable } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";
import { Pencil, Trash } from "../../Icons";
import { askConfirm, askText, tell } from "../Dialogs";
import { Select } from "../Select";
import { INPUT, PICK } from "./controls";

export type StylesLive = {
  /** The draft differs from what live forms use. */
  changed: boolean;
  publish: () => Promise<void>;
  openGuide: () => void;
};

const KIND_LABEL: Record<Variable["kind"], string> = { color: "Color", length: "Size", font: "Font", number: "Number", shadow: "Shadow" };
const FIRST_VALUE: Record<Variable["kind"], string> = { color: "#3355ff", length: "16px", font: "Inter, sans-serif", number: "1", shadow: "0 4px 12px rgba(0,0,0,0.12)" };

function Footer({ live, hasKit }: { live: StylesLive; hasKit: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-3">
      <button type="button" onClick={live.openGuide} className="press h-8 rounded-full border border-line-strong px-3 text-[12.5px] font-medium text-ink hover:border-ink">
        Style guide
      </button>
      {hasKit ? (
        <button
          type="button"
          disabled={!live.changed || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await live.publish();
            } finally {
              setBusy(false);
            }
          }}
          className="press ml-auto h-8 rounded-full bg-ink px-3.5 text-[12.5px] font-medium text-paper disabled:opacity-40"
        >
          {busy ? "Publishing…" : live.changed ? "Publish styles" : "Published"}
        </button>
      ) : null}
    </div>
  );
}

// Styles (classes) --------------------------------------------------------------------------------------------------

export function StylesPanel({ e, hasKit, onEdit, onPick, live }: { e: Edit; hasKit: boolean; onEdit: (e: Edit) => void; onPick: (classId: string) => void; live: StylesLive }) {
  const { system } = e;
  if (!hasKit) return <p className="px-4 py-10 text-center text-[12.5px] text-muted">Save the theme to a brand kit to make classes</p>;
  return (
    <div className="flex min-h-full flex-col">
      <ul className="flex flex-1 flex-col py-1">
        {system.classes.length ? null : <li className="px-4 py-10 text-center text-[12.5px] text-muted">No classes yet</li>}
        {system.classes.map((c) => {
          const uses = classUses(e.design, c.id);
          const base = c.with?.map((w) => system.classes.find((x) => x.id === w)?.name).filter(Boolean);
          return (
            <li key={c.id} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-hover">
              <button type="button" onClick={() => onPick(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="inline-flex h-6 max-w-[60%] items-center truncate rounded-full bg-sky-wash px-2.5 text-[12px] font-medium text-sky">{c.name}</span>
                {base?.length ? <span className="truncate text-[11.5px] text-muted">on {base.join(", ")}</span> : null}
                <span className="ml-auto shrink-0 text-[11.5px] text-muted tabular-nums">{uses ? uses : "Unused here"}</span>
              </button>
              <button
                type="button"
                aria-label={`Rename ${c.name}`}
                title="Rename"
                onClick={async () => {
                  const name = await askText("Rename class", { initial: c.name, ok: "Rename" });
                  if (name === null) return;
                  const r = renameClass(system, c.id, name);
                  if ("error" in r) return void tell(r.error);
                  onEdit({ ...e, system: r });
                }}
                className="press flex size-6 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 hover:bg-card hover:text-ink focus:opacity-100"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${c.name}`}
                title="Delete"
                onClick={async () => {
                  if (!(await askConfirm(`Delete ${c.name}?`, { body: "Every form using it loses its styles once styles are published.", ok: "Delete", danger: true }))) return;
                  onEdit(deleteClass(e, c.id));
                }}
                className="press flex size-6 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 hover:bg-rose-wash hover:text-rose focus:opacity-100"
              >
                <Trash size={12} />
              </button>
            </li>
          );
        })}
      </ul>
      <Footer live={live} hasKit={hasKit} />
    </div>
  );
}

// Variables ---------------------------------------------------------------------------------------------------------

export function VariablesPanel({ e, tokens, hasKit, onEdit, onTheme, live }: { e: Edit; tokens: Partial<Tokens>; hasKit: boolean; onEdit: (e: Edit, merge?: string) => void; onTheme: () => void; live: StylesLive }) {
  const { system } = e;
  const vars = allVariables(system, tokens);
  const builtIn = vars.slice(0, BUILT_IN.length);
  const own = vars.slice(BUILT_IN.length);
  const add = async (kind: Variable["kind"]) => {
    const name = await askText(`New ${KIND_LABEL[kind].toLowerCase()} variable`, { placeholder: "Name", ok: "Add" });
    if (!name?.trim()) return;
    const r = addVariable(system, name, kind, FIRST_VALUE[kind]);
    if ("error" in r) return void tell(r.error);
    onEdit({ ...e, system: r });
  };
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        <h3 className="px-3 pt-3 pb-1 text-[12px] font-semibold text-ink">Theme</h3>
        <ul className="flex flex-col pb-2">
          {builtIn.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={onTheme} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-hover">
                <VarSample v={v} />
                <span className="flex-1 truncate text-[12.5px] text-ink">{v.name}</span>
                <span className="max-w-[96px] truncate font-mono text-[11px] text-muted">{v.value}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 border-t border-line px-3 pt-3 pb-1">
          <h3 className="flex-1 text-[12px] font-semibold text-ink">Yours</h3>
          {hasKit ? (
            <span className="w-[112px]">
              <Select<string>
                value=""
                options={(Object.keys(KIND_LABEL) as Variable["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                onChange={(k) => void add(k as Variable["kind"])}
                ariaLabel="Add a variable"
                placeholder="Add"
                plainPlaceholder
                className={PICK}
              />
            </span>
          ) : null}
        </div>
        {!hasKit ? <p className="px-4 py-6 text-center text-[12.5px] text-muted">Save the theme to a brand kit to add variables</p> : null}
        {hasKit && !own.length ? <p className="px-4 py-6 text-center text-[12.5px] text-muted">No variables yet</p> : null}
        <ul className="flex flex-col pb-3">
          {own.map((v) => (
            <VarRow key={v.id} v={v} e={e} onEdit={onEdit} />
          ))}
        </ul>
      </div>
      <Footer live={live} hasKit={hasKit} />
    </div>
  );
}

function VarSample({ v }: { v: Variable }) {
  if (v.kind === "color") return <span className="size-4 shrink-0 rounded-full border border-line" style={{ background: v.value }} />;
  if (v.kind === "font")
    return (
      <span className="flex size-4 shrink-0 items-center justify-center text-[12px] text-ink" style={{ fontFamily: v.value }}>
        Aa
      </span>
    );
  return <span className="size-4 shrink-0 rounded-[3px] border border-dashed border-line-strong" />;
}

function VarRow({ v, e, onEdit }: { v: Variable; e: Edit; onEdit: (e: Edit, merge?: string) => void }) {
  const [value, setValue] = useState<string | null>(null);
  const [dark, setDark] = useState<string | null>(null);
  const [bad, setBad] = useState("");
  const cancel = useRef(false);
  const commit = (patch: { value?: string; dark?: string }) => {
    if (cancel.current) return void (cancel.current = false);
    const r = updateVariable(e.system, v.id, patch);
    if ("error" in r) return setBad(r.error);
    setBad("");
    setValue(null);
    setDark(null);
    onEdit({ ...e, system: r }, `var:${v.id}`);
  };
  // Enter leaves the box, and leaving saves.
  const keys = (reset: () => void) => (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") {
      ev.currentTarget.blur();
    } else if (ev.key === "Escape") {
      cancel.current = true;
      reset();
      setBad("");
      ev.currentTarget.blur();
    }
  };
  return (
    <li className="group flex flex-col gap-1 px-3 py-1.5 hover:bg-hover">
      <div className="flex items-center gap-2">
        <VarSample v={v} />
        <span className="flex-1 truncate text-[12.5px] text-ink">{v.name}</span>
        <span className="text-[11px] text-muted">{KIND_LABEL[v.kind]}</span>
        <button
          type="button"
          aria-label={`Rename ${v.name}`}
          title="Rename"
          onClick={async () => {
            const name = await askText("Rename variable", { initial: v.name, ok: "Rename" });
            if (name === null) return;
            const r = updateVariable(e.system, v.id, { name });
            if ("error" in r) return void tell(r.error);
            onEdit({ ...e, system: r });
          }}
          className="press flex size-6 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 hover:bg-card hover:text-ink focus:opacity-100"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          aria-label={`Delete ${v.name}`}
          title="Delete"
          onClick={async () => {
            const uses = variableUses(e, v.id);
            if (!uses) return onEdit(deleteVariable(e, v.id));
            const to = await askText(`${v.name} is used ${uses === 1 ? "once" : `${uses} times`}. Replace it with`, { initial: v.value, ok: "Delete" });
            if (to === null) return;
            onEdit(deleteVariable(e, v.id, to.trim() || v.value));
          }}
          className="press flex size-6 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 hover:bg-rose-wash hover:text-rose focus:opacity-100"
        >
          <Trash size={12} />
        </button>
      </div>
      <div className="flex items-center gap-1.5 pl-6">
        <input
          value={value ?? v.value}
          aria-label={`${v.name} value`}
          aria-invalid={!!bad || undefined}
          onChange={(ev) => setValue(ev.target.value)}
          onBlur={() => (value !== null ? commit({ value }) : (cancel.current = false))}
          onKeyDown={keys(() => setValue(null))}
          className={`${INPUT} min-w-0 flex-1 font-mono text-[11.5px] ${bad ? "border-rose" : ""}`}
        />
        {v.kind === "color" ? (
          <input
            value={dark ?? v.dark ?? ""}
            placeholder="Dark"
            aria-label={`${v.name} dark value`}
            onChange={(ev) => setDark(ev.target.value)}
            onBlur={() => (dark !== null ? commit({ dark }) : (cancel.current = false))}
            onKeyDown={keys(() => setDark(null))}
            className={`${INPUT} w-[84px] font-mono text-[11.5px]`}
          />
        ) : null}
      </div>
      {bad ? <p className="pl-6 text-[11.5px] text-rose">{bad}</p> : null}
    </li>
  );
}

