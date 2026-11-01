"use client";

// Flowchart lines drawn from where the cards really are, like Miro: each edge leaves the bottom center of one node and
// enters the top center of the next, and ends in an arrowhead. Nodes are
// any element inside the container with data-node="<id>". One weight and one near-black for every line, with smooth
// S-curves where a line moves sideways. The lines are measured again whenever a node changes size,
// so they always meet the cards, whatever the columns' heights.

import { useLayoutEffect, useRef, useState } from "react";

/** bend "from": turn just under the source (a split); "to": turn just above the target (a join). */
export type Edge = { from: string; to: string; bend?: "from" | "to" };
type Drawn = { d: string; tip: string; key: string };

/** One edge's path from (x1, y1) down to (x2, y2): one smooth S-curve, under the source for a split ("from") or just
 * above the target for a join ("to"), with straight stems for the rest. */
export function elbow(x1: number, y1: number, x2: number, y2: number, bend: "from" | "to" = "from"): string {
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1}V${y2}`;
  const h = Math.max(8, Math.min(72, y2 - y1 - 8));
  const a = bend === "to" ? y2 - 8 - h : y1;
  const b = a + h;
  return `M${x1} ${y1}${a > y1 ? `V${a}` : ""}C${x1} ${a + h * 0.55} ${x2} ${b - h * 0.55} ${x2} ${b}${b < y2 ? `V${y2}` : ""}`;
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
          out.push({ key: `${e.from}>${e.to}`, d: elbow(Math.round(a.x), a.bottom, Math.round(b.x), y2 - 5, e.bend), tip: `M${Math.round(b.x) - 4} ${y2 - 6}L${Math.round(b.x)} ${y2}L${Math.round(b.x) + 4} ${y2 - 6}Z` });
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
    <svg ref={ref} className="pointer-events-none absolute inset-0 size-full overflow-visible opacity-80" aria-hidden="true">
      {drawn.map((l) => (
        <g key={l.key}>
          <path d={l.d} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-ink)" }} />
          <path d={l.tip} strokeLinejoin="round" style={{ fill: "var(--color-ink)", stroke: "var(--color-ink)", strokeWidth: 1 }} />
        </g>
      ))}
    </svg>
  );
}
