"use client";

// Meeting type templates (src/lib/meetings/templates.ts): the cards on the empty Meeting types page and the picker
// New meeting type opens. A card shows the name, length, place, kind and one line; picking one opens the new panel
// already filled in.

import { useState } from "react";
import { MEETING_TEMPLATES, TEMPLATE_GROUPS, templateSettings, type MeetingTemplate, type TemplateGroup } from "@/lib/meetings/templates";
import { Clock, Plus } from "../../Icons";
import { Modal } from "../meetings/parts";
import { KIND_WORDS, lengthWords, PLACE_WORDS } from "./model";
import { placeIcon } from "./TypePanel";

const CARD = "press flex min-h-[124px] min-w-0 flex-col gap-2 rounded-[10px] bg-card p-4 text-left shadow-outline transition-shadow duration-[140ms] hover:shadow-input-hover";

export function TemplateCard({ t, onPick }: { t: MeetingTemplate; onPick: (id: string) => void }) {
  const s = templateSettings(t);
  return (
    <button type="button" onClick={() => onPick(t.id)} className={CARD}>
      <span className="text-[14px] font-semibold text-ink [overflow-wrap:anywhere]">{t.name}</span>
      <span className="text-[12.5px] leading-snug text-muted">{t.line}</span>
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[12px] text-muted">
        <span className="inline-flex items-center gap-[5px]">
          <Clock size={12} />
          {lengthWords(s.lengths)}
        </span>
        <span className="inline-flex items-center gap-[5px]">
          {placeIcon(s.location.kind, 12)}
          {PLACE_WORDS[s.location.kind]}
        </span>
        <span>{t.kind === "group" ? `${KIND_WORDS.group}, ${s.seats} seats` : KIND_WORDS[t.kind]}</span>
      </span>
    </button>
  );
}

/** The empty page's featured templates, with See all templates and Start blank. */
export function FeaturedTemplates({ onPick, onAll }: { onPick: (id: string | null) => void; onAll: () => void }) {
  return (
    <span className="flex w-full max-w-3xl flex-col items-center gap-4">
      <span className="grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
        {MEETING_TEMPLATES.filter((t) => t.featured).map((t) => (
          <TemplateCard key={t.id} t={t} onPick={onPick} />
        ))}
      </span>
      <span className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={onAll} className="press inline-flex h-9 items-center rounded-full bg-card px-3.5 text-[13px] font-medium text-ink shadow-outline hover:shadow-input-hover">
          See all templates
        </button>
        <button type="button" onClick={() => onPick(null)} className="press inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium text-muted hover:text-ink">
          <Plus size={14} />
          Start blank
        </button>
      </span>
    </span>
  );
}

/** New meeting type: Start blank first, then every template, with group pills on top. */
export function TemplatePicker({ onPick, onClose }: { onPick: (id: string | null) => void; onClose: () => void }) {
  const [group, setGroup] = useState<TemplateGroup | "all">("all");
  const shown = MEETING_TEMPLATES.filter((t) => group === "all" || t.group === group);
  const pill = (on: boolean) => `press inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${on ? "bg-ink text-card" : "bg-card text-body shadow-outline hover:text-ink"}`;
  return (
    <Modal title="New meeting type" onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Template groups">
          {[{ key: "all" as const, label: "All" }, ...TEMPLATE_GROUPS].map((g) => (
            <button key={g.key} type="button" role="tab" aria-selected={group === g.key} onClick={() => setGroup(g.key)} className={pill(group === g.key)}>
              {g.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => onPick(null)} className="press flex min-h-[124px] min-w-0 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong p-4 text-[13px] font-medium text-muted hover:border-ink hover:text-ink">
            <Plus size={16} />
            Start blank
          </button>
          {shown.map((t) => (
            <TemplateCard key={t.id} t={t} onPick={onPick} />
          ))}
        </div>
      </div>
    </Modal>
  );
}
