"use client";

// A canvas you can pan and zoom (docs/email-canvas-b1.md, sections 2, 3 and 11): an endless surface with a faint dot
// grid, a world layer drawn with one CSS transform, a screen layer for things that keep their size (labels, rings,
// the toolbar), a column of tools (Select, Hand, Fit) and a zoom control. Two-finger scroll pans; pinch or Cmd/Ctrl +
// scroll zooms toward the pointer; Space + drag, the middle button or the Hand tool pans; Shift+1, Shift+2 and Shift+0
// fit, zoom to the picked things and go to 100%; Cmd/Ctrl + = and − step. The view is kept per canvas on this computer.
// The math is in src/lib/canvas/view.ts.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { between, fitBox, offScreen, stepZoom, wheelFactor, zoomAt, type Box, type Camera, type Size } from "@/lib/canvas/view";
import { Cursor, Fit, Hand, Minus, Plus } from "../../Icons";
import { Popover } from "../FilterBar";

export type Tool = "select" | "hand";
export type SurfaceApi = {
  camera: () => Camera;
  /** Glide (or jump, with reduced motion) to a camera. */
  glide: (c: Camera) => void;
  fit: () => void;
  focus: (b: Box, maxZ?: number) => void;
  /** The screen point for a pointer event, inside the surface. */
  point: (clientX: number, clientY: number) => { x: number; y: number };
};

type Props = {
  /** Where the view is kept on this computer. */
  storageKey: string;
  /** Every item's box (Fit, Back to emails) and the picked items' box (Zoom to selection). */
  all: Box | null;
  picked: Box | null;
  /** The camera for a first visit, once the items are measured. */
  first: (view: Size) => Camera;
  /** Ready to place the camera: the items have their sizes. */
  ready: boolean;
  world: React.ReactNode;
  screen: (c: Camera, view: Size) => React.ReactNode;
  /** A key the page handles first (arrows, Enter, Delete…); return true when handled. */
  onKey?: (e: KeyboardEvent) => boolean;
  /** A press on the surface itself (not on an item and not a pan): clears the pick. */
  onBackground?: () => void;
  /** After the camera or the view changes (which items to load). */
  onView?: (c: Camera, view: Size) => void;
  label: string;
  className?: string;
  children?: React.ReactNode;
};

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable='true']");
const ZOOMS: { label: string; hint?: string; z?: number; act?: "fit" | "sel" }[] = [
  { label: "Zoom to fit", hint: "⇧1", act: "fit" },
  { label: "Zoom to selection", hint: "⇧2", act: "sel" },
  { label: "50%", z: 0.5 },
  { label: "100%", hint: "⇧0", z: 1 },
  { label: "200%", z: 2 },
];

export const Surface = forwardRef<SurfaceApi, Props>(function Surface(p, ref) {
  const stage = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState<Camera | null>(null);
  const camRef = useRef<Camera>({ x: 0, y: 0, z: 1 });
  const [view, setView] = useState<Size>({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("select");
  const [space, setSpace] = useState(false);
  const [panning, setPanning] = useState(false);
  const [zoomMenu, setZoomMenu] = useState<HTMLElement | null>(null);
  const anim = useRef(0);
  const saveT = useRef(0);
  const props = useRef(p);
  useEffect(() => {
    props.current = p;
  });

  const save = useCallback(() => {
    window.clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      try {
        localStorage.setItem(props.current.storageKey, JSON.stringify(camRef.current));
      } catch {}
    }, 300);
  }, []);
  const put = useCallback(
    (c: Camera) => {
      camRef.current = c;
      if (world.current) world.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.z})`;
      setCam(c);
      save();
    },
    [save],
  );
  const glide = useCallback(
    (to: Camera) => {
      cancelAnimationFrame(anim.current);
      if (reduced()) return put(to);
      const from = camRef.current;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / 220);
        put(between(from, to, t));
        if (t < 1) anim.current = requestAnimationFrame(tick);
      };
      anim.current = requestAnimationFrame(tick);
    },
    [put],
  );
  const size = (): Size => ({ w: stage.current?.clientWidth ?? 0, h: stage.current?.clientHeight ?? 0 });
  const fit = useCallback(() => {
    const b = props.current.all;
    if (b) glide(fitBox(b, size()));
  }, [glide]);
  const focusBox = useCallback((b: Box, maxZ = 1) => glide(fitBox(b, size(), maxZ)), [glide]);
  const zoomStep = useCallback(
    (dir: 1 | -1) => {
      const v = size();
      glide(zoomAt(camRef.current, v.w / 2, v.h / 2, stepZoom(camRef.current.z, dir)));
    },
    [glide],
  );
  const zoomTo = (z: number) => {
    const v = size();
    glide(zoomAt(camRef.current, v.w / 2, v.h / 2, z));
  };
  const point = (cx: number, cy: number) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };
  useImperativeHandle(ref, () => ({ camera: () => camRef.current, glide, fit, focus: focusBox, point }), [glide, fit, focusBox]);

  // The view's size, and the first camera once the items are measured.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView(size()));
    ro.observe(el);
    setView(size());
    return () => ro.disconnect();
  }, []);
  const placed = useRef(false);
  useLayoutEffect(() => {
    if (placed.current || !p.ready || !view.w) return;
    placed.current = true;
    let saved: Camera | null = null;
    try {
      const v = JSON.parse(localStorage.getItem(p.storageKey) ?? "null") as Camera | null;
      if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.z > 0) saved = v;
    } catch {}
    put(saved ?? p.first(view));
  }, [p, view, put]);

  // Wheel: pan, or zoom toward the pointer with Cmd/Ctrl (a trackpad pinch sends ctrlKey).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-canvas-ui]")) return;
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const c = camRef.current;
      if (e.ctrlKey || e.metaKey) {
        const at = point(e.clientX, e.clientY);
        put(zoomAt(c, at.x, at.y, c.z * wheelFactor(e.deltaY, e.deltaMode === 1)));
      } else {
        const m = e.deltaMode === 1 ? 16 : 1;
        const sideways = e.shiftKey && !e.deltaX;
        put({ ...c, x: c.x - (sideways ? e.deltaY : e.deltaX) * m, y: c.y - (sideways ? 0 : e.deltaY) * m });
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [put]);

  // Keys: Space for the hand; V and H; zoom keys; then the page's own keys.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || document.querySelector("[role='dialog'][aria-modal='true']")) return;
      if (!stage.current?.isConnected) return;
      if (props.current.onKey?.(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space" && !e.repeat) {
        setSpace(true);
        e.preventDefault();
        return;
      }
      if (e.shiftKey && e.code === "Digit1") return (e.preventDefault(), fit());
      if (e.shiftKey && e.code === "Digit2") return (e.preventDefault(), props.current.picked ? focusBox(props.current.picked) : undefined);
      if (e.shiftKey && e.code === "Digit0") return (e.preventDefault(), zoomTo(1));
      if ((mod || !e.altKey) && (e.key === "=" || e.key === "+")) return (e.preventDefault(), zoomStep(1));
      if ((mod || !e.altKey) && e.key === "-") return (e.preventDefault(), zoomStep(-1));
      if (!mod && !e.altKey && e.key.toLowerCase() === "v") return setTool("select");
      if (!mod && !e.altKey && e.key.toLowerCase() === "h") return setTool("hand");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [fit, focusBox, zoomStep]);

  // Pointer: panning (middle button, the Hand tool, Space, a finger on empty canvas) and pinching, caught before the
  // items so a pan never picks anything.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; c: Camera } | null>(null);
  const pinch = useRef<{ d: number; mid: { x: number; y: number }; c: Camera } | null>(null);
  const onDownCapture = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-canvas-ui]")) return;
    stage.current?.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 }, c: camRef.current };
      pan.current = null;
      e.stopPropagation();
      return;
    }
    cancelAnimationFrame(anim.current);
    const onItem = !!(e.target as HTMLElement).closest("[data-canvas-item]");
    if (e.button === 1 || tool === "hand" || space || (e.pointerType === "touch" && !onItem)) {
      pan.current = { x: e.clientX, y: e.clientY, c: camRef.current };
      setPanning(true);
      stage.current?.setPointerCapture(e.pointerId);
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (!onItem && e.button === 0) props.current.onBackground?.();
  };
  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      const s = pinch.current;
      const moved = { ...s.c, x: s.c.x + mid.x - s.mid.x, y: s.c.y + mid.y - s.mid.y };
      const at = point(mid.x, mid.y);
      put(zoomAt(moved, at.x, at.y, s.c.z * (d / s.d)));
      return;
    }
    if (pan.current) {
      const s = pan.current;
      put({ ...s.c, x: s.c.x + e.clientX - s.x, y: s.c.y + e.clientY - s.y });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pan.current) {
      pan.current = null;
      setPanning(false);
    }
  };

  useEffect(() => {
    if (cam && view.w) props.current.onView?.(cam, view);
  }, [cam, view]);

  const c = cam ?? { x: 0, y: 0, z: 1 };
  // The dots stay at least 12 px apart on screen: far out, every second (or fourth...) dot shows.
  const step = 24 * c.z < 12 ? 24 * c.z * Math.ceil(12 / (24 * c.z)) : 24 * c.z;
  const dots = c.z < 0.5 ? Math.max(0, (c.z - 0.2) / 0.3) : 1;
  const away = offScreen(p.all, c, view);
  const hand = tool === "hand" || space;
  return (
    <div
      ref={stage}
      tabIndex={0}
      role="application"
      aria-label={p.label}
      onPointerDownCapture={onDownCapture}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={`relative min-h-0 flex-1 touch-none overflow-hidden bg-paper-deep outline-none select-none ${panning ? "cursor-grabbing" : hand ? "cursor-grab" : ""} ${p.className ?? ""}`}
      data-hand={hand ? "" : undefined}
    >
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full text-line transition-opacity duration-[220ms]" style={{ opacity: dots }}>
        <defs>
          <pattern id="canvas-dots" width={step} height={step} patternUnits="userSpaceOnUse" patternTransform={`translate(${c.x % step} ${c.y % step})`}>
            <circle cx="1" cy="1" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#canvas-dots)" />
      </svg>
      <div ref={world} className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${c.x}px, ${c.y}px) scale(${c.z})`, visibility: cam ? "visible" : "hidden" }}>
        {p.world}
      </div>
      <div className="pointer-events-none absolute inset-0">{cam ? p.screen(c, view) : null}</div>
      {p.children}
      <div data-canvas-ui="" role="toolbar" aria-label="Tools" aria-orientation="vertical" className="absolute top-1/2 right-3 z-[4] hidden -translate-y-1/2 flex-col gap-0.5 rounded-full bg-card p-1 shadow-float md:flex">
        <ToolButton label="Select" keys="V" on={tool === "select"} onClick={() => setTool("select")}>
          <Cursor size={15} />
        </ToolButton>
        <ToolButton label="Hand" keys="H" on={tool === "hand"} onClick={() => setTool("hand")}>
          <Hand size={15} />
        </ToolButton>
        <ToolButton label="Zoom to fit" keys="⇧1" onClick={fit}>
          <Fit size={15} />
        </ToolButton>
      </div>
      <div data-canvas-ui="" role="group" aria-label="Zoom" className="absolute right-3 bottom-3 z-[4] flex items-center gap-0.5 rounded-full bg-card p-1 shadow-float">
        <ToolButton label="Zoom out" keys="⌘−" onClick={() => zoomStep(-1)}>
          <Minus size={14} />
        </ToolButton>
        <button type="button" aria-label="Zoom options" aria-haspopup="menu" onClick={(e) => setZoomMenu(zoomMenu ? null : e.currentTarget)} className="h-8 min-w-16 rounded-full px-2 text-[13px] font-medium text-ink tabular-nums hover:bg-hover">
          {Math.round(c.z * 100)}%
        </button>
        <ToolButton label="Zoom in" keys="⌘+" onClick={() => zoomStep(1)}>
          <Plus size={14} />
        </ToolButton>
      </div>
      {zoomMenu ? (
        <Popover anchor={zoomMenu} onClose={() => setZoomMenu(null)} width={200}>
          <div role="menu" className="flex flex-col p-1" data-canvas-ui="">
            {ZOOMS.map((o) => (
              <button
                key={o.label}
                type="button"
                role="menuitem"
                disabled={o.act === "sel" && !p.picked}
                onClick={() => {
                  setZoomMenu(null);
                  if (o.act === "fit") fit();
                  else if (o.act === "sel" && p.picked) focusBox(p.picked);
                  else if (o.z) zoomTo(o.z);
                }}
                className="flex h-8 items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover disabled:text-faint"
              >
                {o.label}
                {o.hint ? <span className="font-mono text-[11.5px] text-faint">{o.hint}</span> : null}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
      {away ? (
        <button data-canvas-ui="" type="button" onClick={fit} className="anim-rise-sm absolute bottom-4 left-1/2 z-[4] h-8 -translate-x-1/2 rounded-full bg-card px-3.5 text-[13px] font-medium text-ink shadow-float hover:bg-hover">
          Back to emails
        </button>
      ) : null}
    </div>
  );
});

function ToolButton({ label, keys, on, onClick, children }: { label: string; keys?: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={keys ? `${label}, ${keys}` : label}
      aria-pressed={on === undefined ? undefined : on}
      title={keys ? `${label} (${keys})` : label}
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-full transition-colors duration-[140ms] ${on ? "bg-signal-soft text-signal-text" : "text-muted hover:bg-hover hover:text-ink"}`}
    >
      {children}
    </button>
  );
}
