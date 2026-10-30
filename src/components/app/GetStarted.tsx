"use client";

// Get started (docs/app-structure.md 1.4): a small card at the foot of the sidebar with a progress bar and the six
// first things to do. Each task is read from the workspace's data, so it ticks itself; the card hides when all six
// are done or when closed (kept on this computer), and ⌘K's "Get started" brings it back.

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "../Icons";
import { useAppCounts } from "./appCounts";
import type { Route, ViewProps } from "./ui";

export type StartTask = { key: string; label: string; done: boolean; go: [Route, string] };

const HIDE_KEY = "claritia:start-hidden";

/** The tasks and whether each is done, from counts the page reads. */
export function startTasks(c: { calendars: number; types: number; liveForms: number; routing: boolean; members: number; invites: number; sources: number }): StartTask[] {
  return [
    { key: "calendar", label: "Connect your calendar", done: c.calendars > 0, go: ["scheduling", "availability/calendars"] },
    { key: "type", label: "Make a meeting type", done: c.types > 0, go: ["scheduling", "types/new"] },
    { key: "form", label: "Put a form live", done: c.liveForms > 0, go: ["forms", ""] },
    { key: "routing", label: "Turn on routing", done: c.routing, go: ["routing", ""] },
    { key: "team", label: "Invite a teammate", done: c.members > 1 || c.invites > 0, go: ["settings", "team"] },
    { key: "crm", label: "Connect your CRM", done: c.sources > 0, go: ["settings", "sources"] },
  ];
}

export function GetStarted({ sb, ws, navigate }: Pick<ViewProps, "sb" | "ws" | "navigate">) {
  const [hidden, setHidden] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => {
      setHidden(false);
      setOpen(true);
      try {
        localStorage.removeItem(HIDE_KEY);
      } catch {}
    };
    window.addEventListener("claritia:get-started", show);
    return () => window.removeEventListener("claritia:get-started", show);
  }, []);
  // Read from the same call as the sidebar counts.
  const counts = useAppCounts(sb, ws.id).data?.start;
  const tasks = useMemo(() => (counts ? startTasks(counts) : null), [counts]);
  if (hidden || !tasks) return null;
  const done = tasks.filter((t) => t.done).length;
  if (done === tasks.length) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {}
  };
  return (
    <section aria-label="Get started" className="hidden rounded-2xl border border-line bg-card xl:block">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 flex-col gap-1.5 text-left">
          <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink">Get started</span>
          <span className="flex h-1.5 w-full gap-0.5" aria-label={`${done} of ${tasks.length} done`}>
            {tasks.map((t) => (
              <span key={t.key} className={`h-full flex-1 rounded-full transition-colors duration-[700ms] ${t.done ? "bg-sage" : "bg-paper-deep"}`} />
            ))}
          </span>
        </button>
        <button type="button" aria-label="Close" onClick={close} className="press rounded-full p-1 text-faint hover:bg-hover hover:text-ink">
          <X size={13} />
        </button>
      </div>
      {open ? (
        <ul className="anim-rise-sm flex flex-col border-t border-line p-1.5">
          {tasks.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => navigate(t.go[0], t.go[1])}
                className="flex h-8 w-full items-center gap-2 rounded-lg px-1.5 text-left text-[12.5px] hover:bg-hover"
              >
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full ${t.done ? "bg-sage text-paper" : "border border-line-strong"}`}>{t.done ? <Check size={10} /> : null}</span>
                <span className={t.done ? "text-faint line-through" : "text-ink"}>{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
