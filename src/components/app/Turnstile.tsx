"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile: a bot check most people never see (it only shows when Cloudflare wants a click). Shown when
// TURNSTILE_SITE_KEY is set; the sign-in service checks the token when its bot protection is on (docs/signup.md).
// Calls onToken with a fresh token, or "" when it expires. Change `round` after each try (a token works once) and to
// try again after a failure. onState says whether the check is loading, ready, or failed: the script was blocked
// (an ad blocker, a strict network), it didn't load in LOAD_MS, or Cloudflare reported an error.

type Api = { render(el: HTMLElement, o: Record<string, unknown>): string; remove(id: string): void };
export type CheckState = "loading" | "ready" | "failed";
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const LOAD_MS = 12_000;

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
    const t = tag;
    // A tag that failed or hung is taken out, so the next try loads the script again.
    const fail = () => {
      clearTimeout(timer);
      t.remove();
      reject(new Error("no turnstile"));
    };
    const timer = setTimeout(fail, LOAD_MS);
    t.addEventListener("load", () => {
      clearTimeout(timer);
      if (w.turnstile) resolve(w.turnstile);
      else fail();
    });
    t.addEventListener("error", fail);
  });
}

export function Turnstile({ siteKey, round, onToken, onState }: { siteKey: string; round: number; onToken: (t: string) => void; onState?: (s: CheckState) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id = "";
    let api: Api | null = null;
    let live = true;
    const set = (t: string) => live && onToken(t);
    const state = (s: CheckState) => live && onState?.(s);
    state("loading");
    load()
      .then((t) => {
        if (!live || !box.current) return;
        api = t;
        id = t.render(box.current, {
          sitekey: siteKey,
          size: "flexible",
          appearance: "interaction-only",
          callback: (tok: string) => (set(tok), state("ready")),
          // An expired token is fetched again on its own; until then the check is loading.
          "expired-callback": () => (set(""), state("loading")),
          "error-callback": () => (set(""), state("failed")),
        });
      })
      .catch(() => (set(""), state("failed")));
    return () => {
      live = false;
      if (api && id) api.remove(id);
    };
  }, [siteKey, round, onToken, onState]);
  return <div ref={box} className="empty:hidden" />;
}

