"use client";

// Small pieces shared by Reps, Log and Held: the live router body, a toast with one action (Undo, Block domain),
// a teammate picker, and the empty-state sketch.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RouterBody } from "@/lib/router/types";
import { Sketch } from "../../sketches/Sketch";
import { Check, Search } from "../../Icons";
import { Popover } from "../FilterBar";
import { PersonAvatar, type Person } from "../meetings/parts";
import { Button, Input, must, useLoad, type Route } from "../ui";

/** The Routing screen's address; typed loosely so this file doesn't depend on when nav.ts gains it. */
export const ROUTING = "routing" as Route;

/** The live version's number and body, or null when nothing is published. */
export function useLiveBody(sb: SupabaseClient, ws: string) {
  return useLoad(async () => {
    const r = must(await sb.from("routers").select("live_version").eq("workspace_id", ws).maybeSingle()) as { live_version: number | null } | null;
    if (!r?.live_version) return null;
    const v = must(await sb.from("router_versions").select("version, body").eq("workspace_id", ws).eq("version", r.live_version).maybeSingle()) as { version: number; body: RouterBody } | null;
    return v ? { version: v.version, body: v.body } : null;
  }, ws);
}

/** The empty-state sketch for Routing. */
export function RouteSketch({ size = 160 }: { size?: number }) {
  return <Sketch name="road" size={size} />;
}

type ToastState = { id: number; text: string; action?: { label: string; run: () => void } };

/** One toast at a time, bottom center, gone after 10 seconds. Read out to screen readers. */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hide = useCallback(() => setToast(null), []);
  const show = useCallback((text: string, action?: ToastState["action"]) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setToast(null), 10_000);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4">
      {toast ? (
        <div key={toast.id} role="status" className="anim-rise-sm pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-[13px] text-paper shadow-float">
          <span className="truncate">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                hide();
              }}
              className="press h-7 shrink-0 rounded-full bg-paper px-3 text-[12.5px] font-medium text-ink hover:opacity-85"
            >
              {toast.action.label}
            </button>
          ) : (
            <span className="w-1.5" />
          )}
        </div>
      ) : null}
    </div>
  );
  return { show, hide, node };
}

/** Pick a teammate: a search box and the list, in a popover under the anchor. */
export function PersonPicker({ anchor, people, value, onPick, onClose, none }: { anchor: HTMLElement; people: Person[]; value?: string | null; onPick: (id: string | null) => void; onClose: () => void; none?: string }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const shown = people.filter((p) => !t || p.name.toLowerCase().includes(t) || p.email.toLowerCase().includes(t));
  return (
    <Popover anchor={anchor} onClose={onClose} width={260}>
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search teammates" className="h-9 pl-8" />
        </div>
      </div>
      <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Teammates">
        {none ? (
          <li>
            <button type="button" role="option" aria-selected={!value} onClick={() => onPick(null)} className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left text-muted hover:bg-hover">
              <span className="flex-1">{none}</span>
              {!value ? <Check size={13} className="text-ink" /> : null}
            </button>
          </li>
        ) : null}
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" role="option" aria-selected={value === p.id} onClick={() => onPick(p.id)} className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-left hover:bg-hover">
              <PersonAvatar person={p} size={20} />
              <span className="flex-1 truncate">{p.name}</span>
              {value === p.id ? <Check size={13} className="text-ink" /> : null}
            </button>
          </li>
        ))}
        {!shown.length ? <li className="px-2.5 py-2 text-faint">No matches</li> : null}
      </ul>
    </Popover>
  );
}

/** A row of chips to filter by, each a small Select-like popover; used by the Log. */
export function FilterChip({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = options.find((o) => o.value === value && o.value !== "");
  return (
    <>
      <Button
        variant={current ? "primary" : "ghost"}
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="max-w-[220px]"
      >
        <span className="truncate">{current ? `${label}: ${current.label}` : label}</span>
      </Button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={220}>
          <ul className="max-h-72 overflow-y-auto p-1" role="listbox" aria-label={label}>
            {options.map((o) => (
              <li key={o.value || "all"}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    onChange(o.value);
                    setAnchor(null);
                  }}
                  className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left hover:bg-hover"
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.value === value ? <Check size={13} className="text-ink" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}
