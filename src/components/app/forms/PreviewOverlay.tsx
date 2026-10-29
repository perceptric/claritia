"use client";

// Preview: the real <claritia-form> full screen, on desktop, tablet or phone. It runs as visitors see it (steps,
// checks, rules, the screen after the submit) in test mode: nothing is sent.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import type { Form } from "@/lib/forms/schema";
import { Monitor, Phone, Refresh, X } from "../../Icons";
import { Badge } from "../ui";
import { formWidth, type Device } from "./editorModel";
import { Tablet } from "./icons";
import { FormPreview } from "./shared";

export function PreviewOverlay({ form, tokens, system, device: start, onClose }: { form: Form; tokens: Partial<Tokens>; system?: unknown; device: Device; onClose: () => void }) {
  const [device, setDevice] = useState<Device>(start);
  const [run, setRun] = useState(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  const width = device === "phone" ? 390 : device === "tablet" ? 768 : Math.max(formWidth(form.layout) + 160, 960);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Preview" className="anim-fade fixed inset-0 z-[85] flex flex-col bg-paper-deep">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Preview</span>
        <Badge>Test mode</Badge>
        <div className="mx-auto flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5" role="radiogroup" aria-label="Preview device">
          {(
            [
              ["desktop", "Desktop", <Monitor key="d" size={14} />],
              ["tablet", "Tablet", <Tablet key="t" size={14} />],
              ["phone", "Phone", <Phone key="p" size={14} />],
            ] as const
          ).map(([d, label, icon]) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              aria-label={label}
              title={label}
              onClick={() => setDevice(d)}
              className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${device === d ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {icon}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Start over"
          title="Start over"
          onClick={() => setRun((r) => r + 1)}
          className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
        >
          <Refresh size={14} />
        </button>
        <button
          ref={closeBtn}
          type="button"
          aria-label="Close preview"
          title="Close"
          onClick={onClose}
          className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6 md:p-10">
        <div
          className="mx-auto overflow-hidden rounded-lg border border-line shadow-soft transition-[max-width] duration-[320ms] ease-out"
          style={{ maxWidth: width, background: cleanTokens(tokens).tokens.background }}
        >
          <div className={device === "phone" ? "px-5 py-8" : "px-10 py-14"}>
            <div className="mx-auto" style={{ maxWidth: formWidth(form.layout) }}>
              <FormPreview key={run} form={form} tokens={tokens} system={system} device={device === "desktop" ? "base" : device} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
