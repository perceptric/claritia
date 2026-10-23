"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "../Icons";
import { Pip } from "./Pip";

export type Command = { id: string; label: string; group: string; icon?: React.ReactNode; run: () => void };

/** ⌘K: a floating search, mounted while open, with Pip on the left; results slide in, arrows and Enter pick one. */
export function CommandBar({ onClose, commands }: { onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? commands.filter((c) => c.label.toLowerCase().includes(t) || c.group.toLowerCase().includes(t)) : commands;
  }, [q, commands]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="anim-fade fixed inset-0 z-[95] flex items-start justify-center bg-scrim px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="anim-rise-sm w-full max-w-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex h-14 items-center gap-3 rounded-full bg-card pr-5 pl-3 shadow-float">
          <Pip size={34} mood={q ? "thinking" : "idle"} />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Go to…"
            aria-label="Search"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(shown.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(shown[active]);
              }
            }}
          />
          <Search size={16} className="text-faint" />
        </div>
        {shown.length ? (
          <ul ref={list} role="listbox" className="mt-2 max-h-[50vh] overflow-y-auto rounded-2xl bg-card p-1.5 shadow-float">
            {shown.map((c, i) => (
              <li
                key={c.id}
                data-i={i}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
                className={`anim-rise-sm flex h-10 cursor-pointer items-center gap-3 rounded-full px-3.5 text-[13.5px] ${i === active ? "bg-hover text-ink" : "text-body"}`}
                style={{ animationDelay: `${Math.min(i, 8) * 18}ms` }}
              >
                <span className="text-muted">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                <span className="font-mono text-[11px] text-faint">{c.group}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-2xl bg-card px-5 py-4 text-[13.5px] text-muted shadow-float">No matches</p>
        )}
      </div>
    </div>
  );
}
