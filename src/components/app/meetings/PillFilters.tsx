"use client";

// Filters as pills (the Contacts filter bar's look, without saved views): each filter in use is a pill with its
// value, which opens its choices or clears with its X, and "+ Filter" adds one. Menus open on the floating layer.

import { useState } from "react";
import { Check, ChevronDown, Plus, X } from "../../Icons";
import { Popover } from "../FilterBar";

export type PillField = { key: string; label: string; options: { value: string; label: string }[] };

export function PillFilters({ fields, values, onChange }: { fields: PillField[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [menu, setMenu] = useState<{ anchor: HTMLElement; field: string | null } | null>(null);
  const set = (key: string, value: string) => onChange({ ...values, [key]: value });
  const used = fields.filter((f) => values[f.key]);
  const free = fields.filter((f) => !values[f.key]);
  const open = menu?.field ? fields.find((f) => f.key === menu.field) : null;
  return (
    <>
      {used.map((f) => (
        <span key={f.key} className="inline-flex h-9 shrink-0 items-center rounded-full border border-ink bg-card text-[13px]">
          <button type="button" aria-haspopup="menu" onClick={(e) => setMenu({ anchor: e.currentTarget, field: f.key })} className="inline-flex h-full items-center gap-1.5 rounded-l-full pr-1 pl-3.5 hover:bg-hover">
            <span className="text-muted">{f.label}</span>
            <span className="max-w-[160px] truncate font-medium text-ink">{f.options.find((o) => o.value === values[f.key])?.label ?? values[f.key]}</span>
            <ChevronDown size={12} className="text-muted" />
          </button>
          <button type="button" aria-label={`Clear ${f.label}`} title={`Clear ${f.label}`} onClick={() => set(f.key, "")} className="inline-flex h-full items-center rounded-r-full pr-2.5 pl-1 text-muted hover:bg-hover hover:text-ink">
            <X size={12} />
          </button>
        </span>
      ))}
      {free.length ? (
        <button type="button" aria-haspopup="menu" onClick={(e) => setMenu({ anchor: e.currentTarget, field: null })} className="press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-3.5 text-[13px] font-medium text-muted hover:border-ink/40 hover:text-ink">
          <Plus size={13} />
          Filter
        </button>
      ) : null}
      {menu ? (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={220}>
          <div role="menu" className="flex flex-col p-1">
            {open ? (
              <>
                <span className="px-2.5 pt-1.5 pb-1 font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase">{open.label}</span>
                {open.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={values[open.key] === o.value}
                    onClick={() => (set(open.key, o.value), setMenu(null))}
                    className="flex h-8 items-center gap-2 rounded-md px-2.5 text-left text-ink hover:bg-hover"
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {values[open.key] === o.value ? <Check size={13} /> : null}
                  </button>
                ))}
              </>
            ) : (
              free.map((f) => (
                <button key={f.key} type="button" role="menuitem" onClick={() => setMenu({ anchor: menu.anchor, field: f.key })} className="flex h-8 items-center justify-between rounded-md px-2.5 text-left text-ink hover:bg-hover">
                  {f.label}
                  <ChevronDown size={12} className="-rotate-90 text-faint" />
                </button>
              ))
            )}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
