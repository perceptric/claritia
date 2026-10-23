"use client";

// The live form beside the builder: the real <claritia-form> in a browser frame, on desktop or phone, any step or the
// screen after the submit, with the site the style comes from.

import { useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import type { Form } from "@/lib/forms/schema";
import { Monitor, Phone } from "../../Icons";
import { Badge, ErrorNote } from "../ui";
import { FormPreview, type Kit } from "./shared";

export type Brand = { site: string; kit: Kit | null; tokens: Partial<Tokens>; scan: (u: string) => void; error: string };

export function PreviewPane({ form, brand, popup, footer }: { form: Form; brand: Brand; popup?: boolean; footer?: React.ReactNode }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [view, setView] = useState<number | "done">(0);
  const step = view === "done" ? 0 : Math.min(view, form.steps.length - 1);
  const shown = (
    <div className="mx-auto" style={{ maxWidth: form.layout.width === "wide" ? 720 : 480 }}>
      <FormPreview form={form} tokens={brand.tokens} step={step} done={view === "done"} />
    </div>
  );
  const status = brand.kit?.scan_status;
  const bg = brand.tokens.background || "#ffffff";
  return (
    <section className="hidden min-h-0 flex-col bg-paper lg:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
        <div className="flex items-center gap-0.5 rounded-full border border-line-strong bg-card p-0.5" role="group" aria-label="Device">
          {(["desktop", "phone"] as const).map((d) => (
            <button key={d} type="button" aria-label={d === "desktop" ? "Desktop view" : "Phone view"} title={d === "desktop" ? "Desktop view" : "Phone view"} aria-pressed={device === d} onClick={() => setDevice(d)} className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${device === d ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {d === "desktop" ? <Monitor size={14} /> : <Phone size={14} />}
            </button>
          ))}
        </div>
        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Show">
          {[...form.steps.map((_, i) => i), "done" as const].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={(view === "done" ? "done" : step) === v}
              className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors duration-[140ms] ${(view === "done" ? "done" : step) === v ? "bg-ink text-paper" : "text-muted hover:bg-hover hover:text-ink"}`}
            >
              {v === "done" ? "After submit" : form.steps.length > 1 ? `Step ${v + 1}` : "Form"}
            </button>
          ))}
        </div>
        <SiteBox key={brand.site} brand={brand} />
      </div>
      {brand.error || (status === "failed" && brand.kit?.scan_error) ? (
        <div className="border-b border-line bg-card px-4 py-2">
          <ErrorNote message={brand.error || brand.kit?.scan_error || ""} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-6 xl:p-10">
        <div className={`mx-auto transition-[max-width] duration-[320ms] ease-out ${device === "phone" ? "max-w-[390px]" : "max-w-[880px]"}`}>
          <div className={`frame relative overflow-hidden border border-line-strong transition-[border-radius] duration-[320ms] ease-out ${device === "phone" ? "rounded-3xl" : "rounded-2xl"}`} style={{ background: bg }}>
            <div className="flex h-8 items-center gap-1.5 border-b border-line bg-card px-3.5" aria-hidden="true">
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="ml-2 truncate font-mono text-[11.5px] text-muted">{brand.site || "yoursite.com"}</span>
            </div>
            {popup ? (
              <div className="relative flex min-h-[560px] items-center justify-center bg-scrim p-6">
                <div className="anim-pop w-full max-w-[520px] rounded-2xl border border-line p-6 shadow-float" style={{ background: bg }}>
                  {shown}
                </div>
              </div>
            ) : (
              <div className={device === "phone" ? "p-5" : "p-8 xl:p-12"}>{shown}</div>
            )}
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}

function SiteBox({ brand }: { brand: { site: string; kit: Kit | null; scan: (u: string) => void } }) {
  const [site, setSite] = useState(brand.site);
  const status = brand.kit?.scan_status;
  const go = () => site.trim() && site.trim() !== brand.site && brand.scan(site.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="ml-auto flex items-center gap-2"
    >
      <span className="label-mono">Style from</span>
      <input value={site} onChange={(e) => setSite(e.target.value)} onBlur={go} placeholder="yoursite.com" aria-label="Your site" className="h-8 w-44 rounded-sm border border-line-strong bg-card px-2.5 font-mono text-[12px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink" />
      {status === "scanning" ? <Badge tone="brand">Reading</Badge> : status === "done" ? <Badge tone="green">Matched</Badge> : status === "failed" ? <Badge tone="red">Failed</Badge> : null}
    </form>
  );
}
