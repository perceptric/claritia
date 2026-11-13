"use client";

// One email on the canvas (docs/email-canvas-b1.md section 4, b2.md section 2): the email as it would arrive, in a
// frame at its real width so mail-app styles stay apart from the app's. Its height follows its content. A change
// writes the new HTML into the same frame, so nothing flashes while an email is edited. Far from the view it shows a
// plain white box at its last height, so a long row stays smooth. The frame takes the pointer only while its email is
// typed in (B3); otherwise the box around it picks and hovers, and the page finds the part under the pointer through
// the frame (registered with `onFrame`).

import { memo, useEffect, useRef, useState } from "react";

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
  /** Its email is being typed in: the frame takes the pointer (B3). */
  typing?: boolean;
  onHeight: (id: string, h: number) => void;
  onDown: (id: string, e: React.PointerEvent) => void;
  onMove: (id: string, e: React.PointerEvent) => void;
  onOpen: (id: string, e: React.MouseEvent) => void;
  onHover: (id: string | null) => void;
  /** The frame, once its document is ready (and null when it goes), with a count that grows on each new HTML. */
  onFrame: (id: string, frame: HTMLIFrameElement | null, version: number) => void;
};

export const Artboard = memo(function Artboard({ id, name, html, x, w, h, shift, lift, live, typing = false, onHeight, onDown, onMove, onOpen, onHover, onFrame }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  // The frame starts from the HTML it first had; later HTML is written into it.
  const [first, setFirst] = useState(html);
  const [ready, setReady] = useState(false);
  const version = useRef(0);
  if (!live && first !== html) setFirst(html);

  useEffect(() => {
    const el = frame.current;
    if (!el || !live) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const d = el.contentDocument;
      if (d?.documentElement) onHeight(id, Math.max(200, Math.ceil(d.documentElement.scrollHeight)));
    };
    const loaded = () => {
      const d = el.contentDocument;
      if (!d?.documentElement) return;
      setReady(true);
      measure();
      const View = d.defaultView as (Window & typeof globalThis) | null;
      if (View?.ResizeObserver) {
        ro = new View.ResizeObserver(measure);
        ro.observe(d.documentElement);
      }
      d.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure, { once: true }));
      version.current += 1;
      onFrame(id, el, version.current);
    };
    el.addEventListener("load", loaded);
    if (el.contentDocument?.readyState === "complete" && el.contentDocument.body?.childElementCount) loaded();
    return () => {
      el.removeEventListener("load", loaded);
      ro?.disconnect();
      setReady(false);
      onFrame(id, null, 0);
    };
  }, [id, live, onHeight, onFrame]);

  // New HTML goes into the same frame.
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!ready || !d || !live) return;
    const inner = /<html[^>]*>([\s\S]*)<\/html>/i.exec(html)?.[1] ?? html;
    d.documentElement.innerHTML = inner;
    d.querySelectorAll("img").forEach((img) => img.addEventListener("load", () => onHeight(id, Math.max(200, Math.ceil(d.documentElement.scrollHeight))), { once: true }));
    onHeight(id, Math.max(200, Math.ceil(d.documentElement.scrollHeight)));
    version.current += 1;
    onFrame(id, frame.current, version.current);
  }, [html, ready, live, id, onHeight, onFrame]);

  return (
    <div
      data-canvas-item=""
      data-email={id}
      role="button"
      tabIndex={-1}
      aria-label={name}
      onPointerDown={(e) => onDown(id, e)}
      onPointerMove={(e) => onMove(id, e)}
      onDoubleClick={(e) => onOpen(id, e)}
      onPointerEnter={() => onHover(id)}
      onPointerLeave={() => onHover(null)}
      className={`absolute top-0 cursor-default bg-white ${lift ? "z-[3] opacity-90 shadow-float" : "shadow-rest transition-transform duration-[220ms] ease-out motion-reduce:transition-none"}`}
      style={{ left: x, width: w, height: h, transform: lift ? `translate(${lift.dx}px, ${lift.dy}px)` : shift ? `translateX(${shift}px)` : undefined }}
    >
      {live && html ? (
        <iframe ref={frame} title={name} srcDoc={first} sandbox="allow-same-origin" tabIndex={-1} className={`${typing ? "" : "pointer-events-none"} block border-0 bg-white`} style={{ width: w, height: h }} />
      ) : live && !html ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-muted">This email couldn&apos;t be shown</div>
      ) : null}
    </div>
  );
});
