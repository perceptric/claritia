"use client";

// The email builder's canvas (docs/design-system.md Part 5.1): the compiled email itself in a frame at the chosen
// width, so it is what a mail app gets. Phones get the phone width (the email's own media rules apply); dark shows
// the dark rules. A click picks the block, column or section under the pointer and the part clicked; outlines are
// drawn inside the frame. The frame never runs scripts and its links never open.

import { useEffect, useRef, useState } from "react";
import type { EmailPartKey } from "@/lib/design/email/parts";

export type CanvasPick = { id: string; part: EmailPartKey | null };

export function EmailCanvas({
  html,
  width,
  selected,
  onPick,
  onClear,
}: {
  html: string;
  width: number;
  selected: string | null;
  onPick: (p: CanvasPick) => void;
  onClear: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const [hover, setHover] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // The frame starts from the first HTML; later HTML is written into it.
  const [first] = useState(html);
  const picks = useRef({ onPick, onClear });
  useEffect(() => {
    picks.current = { onPick, onClear };
  });

  // New HTML goes into the same frame, so it doesn't flash.
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!ready || !d) return;
    const inner = /<html[^>]*>([\s\S]*)<\/html>/i.exec(html)?.[1] ?? html;
    d.documentElement.innerHTML = inner;
  }, [html, ready]);

  // Outlines for the picked and hovered elements, and the frame's height.
  useEffect(() => {
    const d = frame.current?.contentDocument;
    if (!ready || !d) return;
    let s = d.getElementById("clr-pick") as HTMLStyleElement | null;
    if (!s) {
      s = d.createElement("style");
      s.id = "clr-pick";
    }
    const esc = (x: string) => x.replace(/[^a-z0-9]/g, "");
    // The app's accent for outlines, from its tokens.
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-clay").trim() || "currentColor";
    s.textContent = [
      "[data-eid]{cursor:default}",
      "a{cursor:default!important}",
      hover && hover !== selected ? `[data-eid="${esc(hover)}"]{outline:1px solid ${accent}!important;outline-offset:-1px}` : "",
      selected ? `[data-eid="${esc(selected)}"]{outline:2px solid ${accent}!important;outline-offset:-2px}` : "",
    ].join("\n");
    d.head?.append(s);
    const raf = requestAnimationFrame(() => setHeight(Math.max(200, d.documentElement.scrollHeight)));
    return () => cancelAnimationFrame(raf);
  }, [html, ready, hover, selected]);

  const wire = () => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    setReady(true);
    const target = (e: Event) => (e.target instanceof d.defaultView!.Element ? (e.target as Element) : null);
    d.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        const t = target(e);
        const el = t?.closest("[data-eid]");
        if (!el) return picks.current.onClear();
        const id = el.getAttribute("data-eid")!;
        // The part: the nearest element inside it with a part class (c<id>-<part>).
        let part: EmailPartKey | null = null;
        for (let n: Element | null = t; n && n !== el.parentElement; n = n.parentElement) {
          const m = [...n.classList].map((c) => /^c([a-z0-9]+)-([a-z-]+)$/.exec(c)).find((x) => x && x[1] === id);
          if (m) {
            part = m[2] as EmailPartKey;
            break;
          }
        }
        picks.current.onPick({ id, part });
      },
      true,
    );
    d.addEventListener("mouseover", (e) => setHover(target(e)?.closest("[data-eid]")?.getAttribute("data-eid") ?? null));
    d.addEventListener("mouseleave", () => setHover(null));
    // Forms and links inside an HTML block never go anywhere.
    d.addEventListener("submit", (e) => e.preventDefault(), true);
    const ro = new (d.defaultView as unknown as typeof window).ResizeObserver(() => setHeight(Math.max(200, d.documentElement.scrollHeight)));
    ro.observe(d.documentElement);
  };

  return (
    <div className="min-h-0 overflow-auto bg-paper-deep" onClick={onClear}>
      <div className="flex justify-center px-8 py-8">
        <iframe
          ref={frame}
          title="Email"
          srcDoc={first}
          sandbox="allow-same-origin"
          onLoad={wire}
          onClick={(e) => e.stopPropagation()}
          className="block rounded-lg border border-line bg-card shadow-soft transition-[width] duration-[320ms] ease-out"
          style={{ width, height }}
        />
      </div>
    </div>
  );
}
