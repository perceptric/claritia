"use client";

// Flowchart lines drawn from where the cards really are, like Miro: each edge leaves the bottom center of one node and
// enters the top center of the next, bending at right angles with round corners, and ends in an arrowhead. Nodes are
// any element inside the container with data-node="<id>". The lines are measured again whenever a node changes size,
// so they always meet the cards, whatever the columns' heights.

import { useLayoutEffect, useRef, useState } from "react";

/** bend "from": turn just under the source (a split); "to": turn just above the target (a join). */
export type Edge = { from: string; to: string; bend?: "from" | "to"; dashed?: boolean };
type Drawn = { d: string; tip: string; dashed?: boolean; key: string };

const R = 10;
const GAP = 14;

/** One edge's path from (x1, y1) down to (x2, y2), turning at y = mid. */
export function elbow(x1: number, y1: number, x2: number, y2: number, mid: number): string {
  const dx = x2 - x1;
  if (Math.abs(dx) < 1) return `M${x1} ${y1}V${y2}`;
  const s = Math.sign(dx);
  const r = Math.max(0, Math.min(R, Math.abs(dx) / 2, mid - y1, y2 - mid));
  return `M${x1} ${y1}V${mid - r}Q${x1} ${mid} ${x1 + s * r} ${mid}H${x2 - s * r}Q${x2} ${mid} ${x2} ${mid + r}V${y2}`;
}

export function FlowLines({ edges, deps }: { edges: Edge[]; deps: unknown }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const key = edges.map((e) => `${e.from}>${e.to}:${e.bend ?? ""}`).join("|");

  useLayoutEffect(() => {
    const svg = ref.current;
    const box = svg?.parentElement;
    if (!svg || !box) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const o = box.getBoundingClientRect();
        const at = (id: string) => {
          const el = box.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`);
          if (!el || !el.offsetParent) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left - o.left + r.width / 2, top: r.top - o.top, bottom: r.bottom - o.top };
        };
        const out: Drawn[] = [];
        for (const e of edges) {
          const a = at(e.from);
          const b = at(e.to);
          if (!a || !b || b.top - a.bottom < 4) continue;
          const y2 = b.top - 1;
          const mid = e.bend === "to" ? Math.max(a.bottom + 4, y2 - GAP) : Math.min(y2 - 4, a.bottom + GAP);
          out.push({ key: `${e.from}>${e.to}`, d: elbow(Math.round(a.x), a.bottom, Math.round(b.x), y2 - 5, mid), tip: `M${Math.round(b.x) - 4} ${y2 - 6}L${Math.round(b.x)} ${y2}L${Math.round(b.x) + 4} ${y2 - 6}Z`, dashed: e.dashed });
        }
        setDrawn(out);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    box.querySelectorAll("[data-node]").forEach((el) => ro.observe(el));
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, deps]);

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true">
      {drawn.map((l) => (
        <g key={l.key}>
          <path d={l.d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={l.dashed ? "4 4" : undefined} style={{ stroke: "var(--color-line-strong)" }} />
          {l.dashed ? null : <path d={l.tip} style={{ fill: "var(--color-line-strong)" }} />}
        </g>
      ))}
    </svg>
  );
}
