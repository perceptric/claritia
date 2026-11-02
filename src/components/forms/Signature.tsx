"use client";

import { useEffect, useRef } from "react";

// A signature pad: draw with a mouse, finger or pen. Each stroke ends by handing back a PNG file; Clear empties it.

export function Signature({ id, onChange, invalid, disabled }: { id: string; onChange: (f: File | null) => void; invalid?: boolean; disabled?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      c.width = Math.max(1, r.width * ratio);
      c.height = Math.max(1, r.height * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0c0c0b";
    };
    fit();
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    canvas.current?.toBlob((b) => b && onChange(new File([b], "signature.png", { type: "image/png" })), "image/png");
  };
  const clear = () => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    drawn.current = false;
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={canvas}
        id={id}
        role="img"
        aria-label="Signature pad"
        className={`h-36 w-full touch-none rounded-md border bg-white ${invalid ? "border-danger" : "border-line-strong"} ${disabled ? "pointer-events-none opacity-60" : "cursor-crosshair"}`}
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          drawn.current = true;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d");
          if (!ctx) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={finish}
        onPointerLeave={finish}
      />
      <button type="button" onClick={clear} disabled={disabled} className="self-start text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
        Clear
      </button>
    </div>
  );
}
