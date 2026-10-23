"use client";

import { useEffect } from "react";
import { KitScope } from "./BookingCalendar";

// The frame around every booking page: the kit's look, the card, and "Powered by Claritia". In an embed
// (<claritia-book>, ?embed=1) it sits flush and tells the page around it its height, so the frame fits.

export function postToParent(msg: Record<string, unknown>) {
  try {
    if (window.parent !== window) window.parent.postMessage({ claritia: true, ...msg }, "*");
  } catch {}
}

export function BookShell({ tokens, embed, narrow, children }: { tokens: Record<string, unknown> | null; embed?: boolean; narrow?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    if (!embed) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.querySelector(".cb-page")?.getBoundingClientRect().height ?? document.documentElement.scrollHeight);
      if (h !== last) {
        last = h;
        postToParent({ type: "book:height", height: h });
      }
    };
    send();
    const ro = new ResizeObserver(send);
    const el = document.querySelector(".cb-page");
    if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [embed]);
  return (
    <KitScope tokens={tokens ?? {}} className={`cb-page ${embed ? "cb-embed" : ""}`}>
      <div className={`cb-wrap ${narrow ? "cb-narrow" : ""}`}>
        <main className="cb-card">{children}</main>
        <footer className="cb-foot">
          <a href="https://tryclaritia.com" target="_blank" rel="noopener">
            Powered by Claritia
          </a>
        </footer>
      </div>
    </KitScope>
  );
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="cb-done cb-step">
      <h1 className="cb-h" style={{ fontSize: "1.4em" }}>
        {title}
      </h1>
      {children}
    </div>
  );
}
