"use client";

// The Elements panel: a search box and tiles in groups. Click a tile to add it under the selected field, or drag it
// onto the canvas (the Editor works out where it lands).

import { useDraggable } from "@dnd-kit/core";
import { useState } from "react";
import { Search, X } from "../../Icons";
import { ELEMENT_GROUPS, findElements, type ElementDef } from "./editorModel";
import { ElementIcon } from "./icons";

export function Elements({ onAdd }: { onAdd: (def: ElementDef) => void }) {
  const [q, setQ] = useState("");
  const list = findElements(q);
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-[1] bg-card px-3 pt-3 pb-2">
        <label className="flex h-7 items-center gap-1.5 rounded-sm border border-line-strong bg-card px-2 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
          <Search size={12} className="text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search elements"
            aria-label="Search elements"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
          />
          {q ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="text-faint hover:text-ink">
              <X size={11} />
            </button>
          ) : null}
        </label>
      </div>
      {ELEMENT_GROUPS.map((g) => {
        const items = list.filter((e) => e.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className="px-3 pb-3">
            <p className="mb-1.5 text-[12px] font-medium text-muted">{g}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((e) => (
                <Tile key={e.id} def={e} onAdd={() => onAdd(e)} />
              ))}
            </div>
          </div>
        );
      })}
      {!list.length ? <p className="px-3 py-6 text-center text-[12.5px] text-muted">No matches</p> : null}
    </div>
  );
}

function Tile({ def, onAdd }: { def: ElementDef; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `e:${def.id}`, data: { kind: "element", def } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={onAdd}
      title={def.name}
      className={`press flex h-10 min-w-0 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-left text-ink transition-[border-color,box-shadow,transform] duration-[140ms] hover:-translate-y-px hover:border-line-strong hover:shadow-soft ${isDragging ? "opacity-40" : ""}`}
    >
      <ElementIcon name={def.icon} size={15} className="shrink-0 text-body" />
      <span className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-[1.15]">{def.name}</span>
    </button>
  );
}
