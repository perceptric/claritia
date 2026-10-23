"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "@/components/Icons";

// The guest's time zone: detected, and switchable from a searchable list (the page's own listbox, never <select>).

const FALLBACK = [
  "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Athens", "Africa/Johannesburg", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "UTC",
];

function zones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all?.length) return all.includes("UTC") ? all : [...all, "UTC"];
  } catch {}
  return FALLBACK;
}

export function detectZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

const city = (z: string) => (z === "UTC" ? "UTC" : (z.split("/").pop() ?? z).replace(/_/g, " "));
function offsetLabel(z: string, now: number): string {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "shortOffset" }).formatToParts(now).find((x) => x.type === "timeZoneName");
    return p?.value ?? "";
  } catch {
    return "";
  }
}
export function zoneName(z: string, now = Date.now()): string {
  try {
    const p = new Intl.DateTimeFormat(undefined, { timeZone: z, timeZoneName: "long" }).formatToParts(now).find((x) => x.type === "timeZoneName");
    return p?.value ? `${p.value} (${city(z)})` : city(z);
  } catch {
    return city(z);
  }
}

export function ZonePicker({ value, onChange, hour12 }: { value: string; onChange: (z: string) => void; hour12: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const all = useMemo(() => zones(), []);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/\s+/g, "_");
    const hits = s ? all.filter((z) => z.toLowerCase().includes(s)) : all;
    return hits.slice(0, 200);
  }, [q, all]);
  const clock = (z: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, { timeZone: z, hour: "numeric", minute: "2-digit", hour12 }).format(now || Date.now());
    } catch {
      return "";
    }
  };
  const pick = (z: string) => {
    onChange(z);
    setOpen(false);
    setQ("");
  };
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div className="cb-pop" ref={box}>
      <button type="button" className="cb-zbtn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Globe size={15} />
        <span suppressHydrationWarning>{zoneName(value)}</span>
      </button>
      {open && (
        <div className="cb-menu" role="dialog" aria-label="Time zone">
          <input
            className="cb-in"
            autoFocus
            value={q}
            placeholder="Search"
            aria-label="Search time zones"
            aria-controls="cb-zones"
            aria-activedescendant={shown[active] ? `cb-z-${active}` : undefined}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(shown.length - 1, a + 1)));
              else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
              else if (e.key === "Enter" && shown[active]) (e.preventDefault(), pick(shown[active]));
              else if (e.key === "Escape") setOpen(false);
            }}
          />
          <ul className="cb-opts" role="listbox" id="cb-zones" ref={list} aria-label="Time zones">
            {shown.map((z, i) => (
              <li
                key={z}
                id={`cb-z-${i}`}
                data-i={i}
                role="option"
                aria-selected={z === value}
                className={`cb-opt ${i === active ? "cb-act" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(z)}
              >
                <span>{z.replace(/_/g, " ")}</span>
                <small>
                  {offsetLabel(z, now || Date.now())} {clock(z)}
                </small>
              </li>
            ))}
            {!shown.length && <li className="cb-opt cb-muted">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
