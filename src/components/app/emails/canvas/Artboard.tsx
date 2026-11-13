"use client";

// One email on the canvas (docs/email-canvas-b1.md section 4): the email as it would arrive, in a frame at its real
// width so mail-app styles stay apart from the app's. Its height follows its content. Far from the view it shows a
// plain white box at its last height, so a long row stays smooth. The frame never takes the pointer: the box around it
// picks, hovers and opens.

import { memo, useEffect, useRef } from "react";

type Props = {
  id: string;
  name: string;
  html: string;
  x: number;
  w: number;
  h: number;
  /** Sideways shift while another email is dragged past it. */
  shift: number;
  /** Lifted: follows the pointer while it's dragged (world offset). */
  lift: { dx: number; dy: number } | null;
  live: boolean;
  onHeight: (id: string, h: number) => void;
  onDown: (id: string, e: React.PointerEvent) => void;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
};

export const Artboard = memo(function Artboard({ id, name, html, x, w, h, shift, lift, live, onHeight, onDown, onOpen, onHover }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = frame.current;
    if (!el || !live) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const d = el.contentDocument;
      if (!d?.documentElement) return;
      onHeight(id, Math.max(200, Math.ceil(d.documentElement.scrollHeight)));
    };
    const loaded = () => {
      measure();
      const d = el.contentDocument;
      const View = d?.defaultView as (Window & typeof globalThis) | null;
      if (d?.body && View?.ResizeObserver) {
        ro = new View.ResizeObserver(measure);
        ro.observe(d.body);
      }
      // Pictures that arrive late change the height.
      d?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure, { once: true }));
    };
    el.addEventListener("load", loaded);
    if (el.contentDocument?.readyState === "complete") loaded();
    return () => {
      el.removeEventListener("load", loaded);
      ro?.disconnect();
    };
  }, [id, live, html, w, onHeight]);
  return (
    <div
      data-canvas-item=""
      data-email={id}
      role="button"
      tabIndex={-1}
      aria-label={name}
      onPointerDown={(e) => onDown(id, e)}
      onDoubleClick={() => onOpen(id)}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
      className={`absolute top-0 cursor-pointer bg-white ${lift ? "z-[3] opacity-90 shadow-float" : "shadow-rest transition-transform duration-[220ms] ease-out motion-reduce:transition-none"}`}
      style={{ left: x, width: w, height: h, transform: lift ? `translate(${lift.dx}px, ${lift.dy}px)` : shift ? `translateX(${shift}px)` : undefined }}
    >
      {live && html ? (
        <iframe ref={frame} title={name} srcDoc={html} sandbox="allow-same-origin" tabIndex={-1} className="pointer-events-none block border-0 bg-white" style={{ width: w, height: h }} />
      ) : live && !html ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-muted">This email couldn&apos;t be shown</div>
      ) : null}
    </div>
  );
});
