"use client";

// What the Forms screens share: the row shapes, the live preview (the real <claritia-form>, so a sheet shows exactly
// what visitors get), and small controls.

import { useEffect, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { allRegions, usesRegions } from "@/lib/forms/regions";
import type { Form } from "@/lib/forms/schema";
import type { Tone } from "../ui";

export type FormRow = { id: string; name: string; status: "draft" | "live" | "paused"; draft: Form; draft_rev: number; version: number; brand_kit_id: string | null; published_at: string | null };
export type Kit = { id: string; name: string; tokens: Partial<Tokens>; logo_url: string | null; notes: string[]; source_url: string | null; scan_status: "scanning" | "done" | "failed" | null; scan_error: string | null; scanned_at: string | null; design?: unknown; design_live?: unknown; design_rev?: number; social?: { kind: string; url: string }[] };
export type Destination = { id: string; kind: "source" | "slack" | "webhook"; source_id: string | null; name: string; config: { host?: string; rules?: unknown }; paused: boolean; position: number };
export type SourceRow = { id: string; kind: string; name: string; status: string };

export const STATUS: Record<FormRow["status"], [string, Tone]> = { draft: ["Draft", "gray"], live: ["Published", "green"], paused: ["Paused", "amber"] };

/** The form as visitors see it (a Form Studio page in its own stylesheet), from a draft that may not be finished yet. */
export function FormPreview({ form, logo, step = 0, done = false, answers }: { form: Form; logo?: string | null; step?: number; done?: boolean; answers?: Record<string, unknown> }) {
  const ref = useRef<HTMLElement>(null);
  // After a deploy, a page opened before it can't load the form script's new file: say so instead of a blank box.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    import("@/lib/forms/element").then(
      () => {
        if (live && ref.current) (ref.current as unknown as { preview: unknown }).preview = { form, logo: logo ?? null, step, done, ...(usesRegions(form) ? { regions: allRegions() } : {}), ...(answers ? { answers } : {}) };
      },
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [form, logo, step, done, answers]);
  if (failed)
    return (
      <div role="alert" className="flex flex-col items-start gap-[8px] text-[13px] text-muted">
        Claritia was just updated. Refresh to see the preview.
        <button type="button" className="press inline-flex h-[28px] items-center rounded-full bg-card shadow-outline px-[12px] text-[12.5px] font-medium text-ink" onClick={() => location.reload()}>
          Refresh
        </button>
      </div>
    );
  return <claritia-form ref={ref} />;
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-[13px] ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
      {label}
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
