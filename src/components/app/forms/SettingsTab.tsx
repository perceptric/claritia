"use client";

// The Settings tab (docs/form-studio.md Part 3): a list of sections on the left, one card per section, and the screen
// visitors get after the submit, live, on the right.

import { useMemo, useRef, useState } from "react";
import type { Op } from "@/lib/forms/ops";
import type { Form } from "@/lib/forms/schema";
import { Segmented, type ViewProps } from "../ui";
import { FormDestinations } from "./FormDestinations";
import { AfterSubmit, afterKind, ConsentSettings, SpamSettings } from "./FormSettings";
import type { Brand } from "./Preview";
import { FormPreview, type Destination, type SourceRow } from "./shared";

export type SettingsTabProps = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & {
  form: Form;
  apply: (op: Op) => void;
  formId: string;
  dests: Destination[];
  sources: SourceRow[];
  reload: () => void;
  brand: Brand;
};

const SECTIONS = [
  { id: "after", label: "After submit" },
  { id: "destinations", label: "Destinations" },
  { id: "consent", label: "Consent" },
  { id: "spam", label: "Spam" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

const AFTER_NOTE = { message: "Message", page: "Page", meeting: "Meeting" } as const;

export function SettingsTab({ form, apply, sb, session, ws, role, navigate, formId, dests, sources, reload, brand }: SettingsTabProps) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionId>("after");
  const spy = () => {
    const el = box.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let cur: SectionId = SECTIONS[0].id;
    for (const s of SECTIONS) {
      const n = document.getElementById(s.id);
      if (n && n.getBoundingClientRect().top - top <= 140) cur = s.id;
    }
    if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) cur = SECTIONS[SECTIONS.length - 1].id;
    if (cur !== active) setActive(cur);
  };
  const go = (id: SectionId) => {
    const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    setActive(id);
  };
  const notes: Record<SectionId, string> = { after: AFTER_NOTE[afterKind(form)], destinations: String(dests.length + 1), consent: "", spam: "" };
  return (
    <div ref={box} onScroll={spy} className="h-full overflow-auto bg-paper">
      <div className="mx-auto grid max-w-[1320px] gap-6 p-4 md:p-8 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[176px_minmax(0,1fr)_400px]">
        <nav aria-label="Settings sections" className="sticky top-8 hidden flex-col gap-0.5 self-start pt-1 lg:flex">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={active === s.id ? "true" : undefined}
              onClick={() => go(s.id)}
              className={`flex h-9 items-center gap-2 rounded-full border px-3.5 text-left text-[13.5px] transition-colors duration-[140ms] ${active === s.id ? "border-line bg-card font-medium text-ink" : "border-transparent text-muted hover:bg-hover hover:text-ink"}`}
            >
              <span className="truncate">{s.label}</span>
              {notes[s.id] ? <span className="ml-auto text-[12px] text-faint tabular-nums">{notes[s.id]}</span> : null}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-6 pb-16">
          <AfterSubmit form={form} apply={apply} sb={sb} ws={ws} session={session} role={role} />
          <FormDestinations sb={sb} session={session} ws={ws} formId={formId} list={dests} sources={sources} reload={reload} navigate={navigate} />
          <ConsentSettings form={form} apply={apply} sb={sb} ws={ws} />
          <SpamSettings form={form} apply={apply} />
        </div>

        <aside aria-label="Preview" className="sticky top-8 hidden self-start xl:block">
          <AfterPreview form={form} brand={brand} />
        </aside>
      </div>
    </div>
  );
}

/** The screen after the submit, as visitors get it. With rules on who books, both sides can be seen. */
function AfterPreview({ form, brand }: { form: Form; brand: Brand }) {
  const [side, setSide] = useState<"book" | "others">("book");
  const match = form.after.schedule?.who === "match";
  const shown = useMemo<Form>(() => {
    if (!match || side === "book" || !form.after.schedule) return form;
    return { ...form, after: { end: form.after.end } };
  }, [form, match, side]);
  return (
    <div className="flex max-h-[calc(100dvh-10rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <span className="text-[12px] font-medium text-muted">Preview</span>
        {match ? (
          <span className="ml-auto">
            <Segmented
              label="Preview for"
              value={side}
              options={[
                { value: "book", label: "Matches" },
                { value: "others", label: "Others" },
              ]}
              onChange={setSide}
            />
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-paper p-4">
        <div className="overflow-hidden rounded-lg border border-line-strong" style={{ background: brand.tokens.background || "white" }}>
          <div className="flex h-7 items-center gap-1.5 border-b border-line bg-card px-3" aria-hidden="true">
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="ml-2 truncate font-mono text-[11px] text-muted">{brand.site || "yoursite.com"}</span>
          </div>
          <div className="p-5">
            <FormPreview form={shown} tokens={brand.tokens} done />
          </div>
        </div>
      </div>
    </div>
  );
}
