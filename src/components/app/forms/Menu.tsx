"use client";

// A more menu: rows with an icon, a line between groups, red for Delete. It opens in its own layer under its button,
// lined up with the button's right edge, so no list or panel can cut it off.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ic } from "./ic";

export type MenuItem = { icon: string; label: string; run: () => void; disabled?: boolean; danger?: boolean } | "hr";

export function Menu({ anchor, items, onClose, width = 200 }: { anchor: HTMLElement; items: MenuItem[]; onClose: () => void; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 200;
      const up = r.bottom + h + 8 > window.innerHeight && r.top > h + 8;
      setPos({ left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), top: up ? r.top - h - 4 : r.bottom + 4 });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, width]);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.contains(t)) return;
      onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    box.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div
      ref={box}
      role="menu"
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }}
      className="anim-rise-sm z-[95] flex flex-col rounded-[10px] border border-line bg-card p-[4px] text-[13px] shadow-float"
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const list = [...(box.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
        const i = list.indexOf(document.activeElement as HTMLElement);
        list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
      }}
    >
      {items.map((it, i) =>
        it === "hr" ? (
          <hr key={`hr${i}`} className="my-[4px] border-0 border-t border-line" />
        ) : (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.run();
            }}
            className={`flex h-[32px] items-center gap-[8px] rounded-md px-[10px] text-left outline-none enabled:hover:bg-hover focus-visible:bg-hover disabled:text-faint ${it.danger ? "text-rose" : "text-ink"}`}
          >
            <Ic n={it.icon} />
            {it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
