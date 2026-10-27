"use client";

// What the Forms screens share: the row shapes, the live preview (the real <claritia-form>, so the builder shows
// exactly what visitors get), and small controls.

import { useEffect, useRef } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import type { Form } from "@/lib/forms/schema";
import type { Tone } from "../ui";

export type FormRow = { id: string; name: string; status: "draft" | "live" | "paused"; draft: Form; draft_rev: number; version: number; brand_kit_id: string | null; published_at: string | null };
export type Kit = { id: string; name: string; tokens: Partial<Tokens>; logo_url: string | null; notes: string[]; source_url: string | null; scan_status: "scanning" | "done" | "failed" | null; scan_error: string | null; scanned_at: string | null };
export type Destination = { id: string; kind: "source" | "slack" | "webhook"; source_id: string | null; name: string; config: { host?: string }; paused: boolean; position: number };
export type SourceRow = { id: string; kind: string; name: string; status: string };

export const STATUS: Record<FormRow["status"], [string, Tone]> = { draft: ["Draft", "gray"], live: ["Live", "green"], paused: ["Paused", "amber"] };
export const DELIVERY: Record<string, [string, Tone]> = {
  queued: ["Queued", "gray"],
  sending: ["Sending", "brand"],
  retrying: ["Retrying", "amber"],
  done: ["Sent", "green"],
  failed: ["Failed", "red"],
  held: ["Held", "amber"],
  skipped: ["Skipped", "gray"],
};

/** The form as visitors see it, from a draft that may not be finished yet. */
export function FormPreview({ form, tokens, step = 0, done = false }: { form: Form; tokens: Partial<Tokens>; step?: number; done?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    void import("@/lib/forms/element").then(() => {
      if (live && ref.current) (ref.current as unknown as { preview: unknown }).preview = { form, tokens, step, done, ...(usesRegions(form) ? { regions: allRegions() } : {}) };
    });
    return () => {
      live = false;
    };
  }, [form, tokens, step, done]);
  return <claritia-form ref={ref} />;
}

/** A color: the swatch picker next to the hex, which can also be typed. */
export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const hex = /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : "#000000";
  return (
    <label className="flex items-center gap-2">
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label={label} className="size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line-strong bg-card p-0.5" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="label-mono">{label}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-full bg-transparent font-mono text-[12px] text-ink outline-none" aria-label={`${label} hex`} />
      </span>
    </label>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-[13px] ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
      {label}
    </label>
  );
}

export function NumberInput({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] text-ink outline-none focus:border-ink focus:ring-1 focus:ring-ink"
      />
    </label>
  );
}

export function IconButton({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`press inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted disabled:pointer-events-none disabled:opacity-40 ${danger ? "hover:bg-rose-wash hover:text-rose" : "hover:bg-hover hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
