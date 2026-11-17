"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile: a bot check most people never see (it only shows when Cloudflare wants a click). Shown when
// TURNSTILE_SITE_KEY is set; the sign-in service checks the token when its bot protection is on (docs/signup.md).
// Calls onToken with a fresh token, or "" when it expires. Change `round` after each try: a token works once.

type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function load(): Promise<Api> {
  const w = window as unknown as { turnstile?: Api };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return new Promise((resolve, reject) => {
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("no turnstile"))));
    tag.addEventListener("error", () => reject(new Error("no turnstile")));
  });
}

export function Turnstile({ siteKey, round, onToken }: { siteKey: string; round: number; onToken: (t: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = "";
    let api: Api | null = null;
    let live = true;
    const set = (t: string) => live && onToken(t);
    load()
      .then((t) => {
        if (!live || !box.current) return;
        api = t;
        id = t.render(box.current, { sitekey: siteKey, size: "flexible", appearance: "interaction-only", callback: set, "expired-callback": () => set(""), "error-callback": () => set("") });
      })
      .catch(() => set(""));
    return () => {
      live = false;
      if (api && id) api.remove(id);
    };
  }, [siteKey, round, onToken]);
  return <div ref={box} className="empty:hidden" />;
}
