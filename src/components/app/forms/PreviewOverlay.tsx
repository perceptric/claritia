"use client";

// Preview: the real <claritia-form> over the form's screen, on desktop or phone, filled as a test. It runs as
// visitors see it (steps, checks, rules, the screen after the submit) and sends nothing.

import { useEffect, useRef, useState } from "react";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import type { Form } from "@/lib/forms/schema";
import { Ic } from "./ic";
import { GHOST_SM, IB, Seg } from "./parts";
import { FormPreview } from "./shared";

export function PreviewOverlay({ form, tokens, crmName, onClose }: { form: Form; tokens: Partial<Tokens>; crmName?: string; onClose: () => void }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [run, setRun] = useState(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Preview" className="anim-fade absolute inset-0 z-[55] flex flex-col bg-paper">
      <div className="flex h-[44px] shrink-0 items-center gap-[6px] border-b border-line bg-card px-[12px]">
        <span className="inline-flex h-[24px] min-w-0 items-center gap-[6px] truncate rounded-full bg-butter-wash px-[10px] text-[12px] font-medium text-butter">
          <Ic n="eye" s={12} />
          <span className="truncate">{`Test fill. It won't count or reach ${crmName ?? "your CRM"}.`}</span>
        </span>
        <span className="flex-1" />
        <Seg icons label="Device" value={device} onChange={setDevice} options={[{ value: "desktop", label: <Ic n="monitor" />, title: "Desktop" }, { value: "phone", label: <Ic n="phone" />, title: "Phone" }]} />
        <button type="button" className={GHOST_SM} onClick={() => setRun((r) => r + 1)}>
          Start over
        </button>
        <button ref={closeBtn} type="button" className={IB} onClick={onClose} aria-label="Close preview" title="Close">
          <Ic n="x" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-[16px] pt-[28px] pb-[40px]">
        <div
          className={`keep-light max-w-full rounded-[14px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)] transition-[width] duration-[320ms] ease-out ${device === "phone" ? "w-[375px] p-[22px]" : form.layout.width === "wide" ? "w-[720px] p-[32px]" : "w-[560px] p-[32px]"}`}
          style={{ background: cleanTokens(tokens).tokens.background }}
        >
          <FormPreview key={`${run}:${device}`} form={form} tokens={tokens} device={device === "phone" ? "phone" : "base"} />
        </div>
      </div>
    </div>
  );
}
