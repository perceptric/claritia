"use client";

// The style guide (docs/design-system.md Part 5.5): every variable, and a sample form drawn by the real
// <claritia-form> with one field for each class, so the whole design system shows in one place. Picking a part
// styles it for every form (or for its class), never for one element, so editing here changes it everywhere.

import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Edit } from "@/lib/design/edit";
import { designFonts, formCss } from "@/lib/design/form";
import { allVariables, type Breakpoint, type DesignSystem, type FormDesign, type RuleKey, type State, type Variable } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import { X } from "../../Icons";
import { FormCanvas, type Picked } from "./FormCanvas";
import { fontUrl } from "./editorModel";
import { Sections, StylePanel, type StyleCtx } from "./StylePanel";
import { Seg, PICK } from "./controls";
import { Select } from "../Select";
import { BookingCalendar, KitScope } from "@/components/book/BookingCalendar";
import { BOOK_PART_KEYS, bookPartDef, resolveBook, setBookProp, type BookPartKey } from "@/lib/design/book";
import type { Resolved } from "@/lib/design/cascade";
import type { Prop } from "@/lib/design/props";
import { sampleSlots, type GuestType } from "@/lib/meetings/guest";

/** The sample form: common fields, then one field for each class (with its base classes for a combo). */
function sample(system: DesignSystem): Form {
  const classField = system.classes.map((c, i) => ({ id: `k${i}`, key: `q.class_${i}`, type: "text" as const, label: c.name, required: false, help: c.with ? "Combo" : undefined }));
  const r = checkForm({
    ...emptyForm(),
    title: "Style guide",
    intro: "Every style in this design system.",
    steps: [
      {
        id: "s1",
        fields: [
          { id: "g1", key: "c.g1", type: "heading", label: "Heading", required: false, content: { text: "Heading", level: 2 } },
          { id: "g2", key: "c.g2", type: "paragraph", label: "Text", required: false, content: { text: "Body text for paragraphs and notes." } },
          { id: "g3", key: "email", type: "email", label: "Work email", required: true, placeholder: "name@company.com", help: "Help text" },
          { id: "g4", key: "q.name", type: "text", label: "Name", required: false, width: "half" },
          { id: "g5", key: "q.company", type: "text", label: "Company", required: false, width: "half" },
          { id: "g6", key: "q.size", type: "dropdown", label: "Team size", required: false, options: [{ value: "1", label: "Just me" }, { value: "2", label: "2 to 10" }] },
          { id: "g7", key: "q.goal", type: "choice", label: "Goal", required: false, options: [{ value: "a", label: "More leads" }, { value: "b", label: "Better leads" }] },
          { id: "g8", key: "q.message", type: "textarea", label: "Message", required: false },
          { id: "g9", key: "c.g9", type: "divider", label: "Divider", required: false },
          ...classField,
        ],
      },
    ],
  });
  if ("errors" in r) return emptyForm();
  const classes: FormDesign["classes"] = Object.fromEntries(system.classes.map((c, i) => [`k${i}`, [...(c.with ?? []), c.id]]));
  return { ...r.form, ...(system.classes.length ? { design: { classes } } : {}) };
}

export function StyleGuide({
  system,
  tokens,
  hasKit,
  bp,
  onEdit,
  onClose,
}: {
  system: DesignSystem;
  tokens: Partial<Tokens>;
  hasKit: boolean;
  bp: Breakpoint;
  onEdit: (system: DesignSystem, merge?: string) => void;
  onClose: () => void;
}) {
  const form = useMemo(() => sample(system), [system]);
  const t = useMemo(() => cleanTokens(tokens).tokens, [tokens]);
  const css = useMemo(() => formCss(form, t, system, { device: bp, preview: true }), [form, t, system, bp]);
  const fontKey = fontUrl(designFonts(system, null));
  const fonts = useMemo(() => (fontKey ? [fontKey] : []), [fontKey]);
  const [part, setPart] = useState<Picked>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, setState] = useState<State | undefined>(undefined);
  const [view, setView] = useState<"form" | "booking">("form");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.("input, textarea, [role=listbox], [role=dialog]:not([aria-label='Style guide'])")) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", esc, true);
    return () => window.removeEventListener("keydown", esc, true);
  }, [onClose]);
  const vars = allVariables(system, tokens);
  const group = (kind: Variable["kind"]) => vars.filter((v) => v.kind === kind);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Style guide" className="anim-fade fixed inset-0 z-[85] flex flex-col bg-paper-deep">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">Style guide</span>
        <span className="mx-auto w-[220px]">
          <Seg<"form" | "booking">
            label="What to style"
            value={view}
            options={[
              { value: "form", label: "Forms" },
              { value: "booking", label: "Booking pages" },
            ]}
            onChange={setView}
          />
        </span>
        <button ref={closeBtn} type="button" aria-label="Close" title="Close" onClick={onClose} className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <X size={15} />
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[264px_minmax(0,1fr)_300px]">
        <aside aria-label="Variables" className="min-h-0 overflow-y-auto border-r border-line bg-card px-4 py-4">
          <h3 className="pb-2 text-[12px] font-semibold text-ink">Colors</h3>
          <div className="grid grid-cols-2 gap-2 pb-4">
            {group("color").map((v) => (
              <div key={v.id} className="flex flex-col gap-1">
                <span className="h-10 rounded-lg border border-line" style={{ background: v.value }} />
                <span className="truncate text-[11.5px] text-ink">{v.name}</span>
                <span className="truncate font-mono text-[10.5px] text-muted">{v.value}</span>
              </div>
            ))}
          </div>
          <h3 className="pb-2 text-[12px] font-semibold text-ink">Fonts</h3>
          <div className="flex flex-col gap-2 pb-4">
            {group("font").map((v) => (
              <div key={v.id} className="flex flex-col">
                <span className="truncate text-[20px] text-ink" style={{ fontFamily: v.value }}>
                  Aa Bb Cc
                </span>
                <span className="truncate text-[11.5px] text-muted">{v.name}</span>
              </div>
            ))}
          </div>
          <h3 className="pb-2 text-[12px] font-semibold text-ink">Sizes</h3>
          <ul className="flex flex-col gap-1.5 pb-4">
            {[...group("length"), ...group("number"), ...group("shadow")].map((v) => (
              <li key={v.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-[12px] text-ink">{v.name}</span>
                <span className="max-w-[110px] truncate font-mono text-[11px] text-muted">{v.value}</span>
              </li>
            ))}
          </ul>
        </aside>
        {view === "booking" ? (
          <BookingView system={system} tokens={tokens} hasKit={hasKit} bp={bp} onEdit={onEdit} />
        ) : (
        <DndContext sensors={sensors}>
          <FormCanvas
            form={form}
            t={t}
            device={bp === "base" ? "desktop" : bp}
            zoom="fit"
            css={css}
            fonts={fonts}
            selected={selected}
            hovered={null}
            dragging={null}
            editing={null}
            part={part}
            state={state}
            onPick={(id, p) => {
              setSelected(id === "form" ? [] : [id]);
              setPart({ id, part: p });
            }}
            onClear={() => {
              setSelected([]);
              setPart(null);
            }}
            onHover={() => {}}
            onEdit={() => {}}
            onCommit={() => {}}
            onNudge={() => {}}
            onDuplicate={() => {}}
            onRemove={() => {}}
            apply={() => {}}
            locked
          />
        </DndContext>
        )}
        {view === "booking" ? null : (
        <aside aria-label="Style" className="min-h-0 overflow-y-auto border-l border-line bg-card">
          <StylePanel
            form={form}
            system={system}
            tokens={tokens}
            bp={bp}
            hasKit={hasKit}
            part={part}
            onPart={setPart}
            state={state}
            onState={setState}
            onEdit={(e: Edit, merge) => onEdit(e.system, merge)}
            kitOnly
          />
        </aside>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Booking pages ------------------------------------------------------------------------------------------------------

const SAMPLE: GuestType = { slug: "intro", name: "Intro call", kind: "one", lengths: [30], location: { kind: "google_meet" }, questions: [], price: null, seats: null, hosts: [{ name: "Alex Kim", photo: null }] };

/** The booking calendar with sample times, and the booking parts' styles for every booking page. */
function BookingView({ system, tokens, hasKit, bp, onEdit }: { system: DesignSystem; tokens: Partial<Tokens>; hasKit: boolean; bp: Breakpoint; onEdit: (system: DesignSystem, merge?: string) => void }) {
  const [part, setPart] = useState<BookPartKey>("day");
  const [state, setState] = useState<"" | "hover" | "checked">("");
  const [now] = useState(() => Date.now());
  const load = useCallback(async (length: number) => sampleSlots(length, "UTC", now, 21), [now]);
  const at = bp === "phone" ? "phone" : "base";
  const st = state || undefined;
  const resolved = resolveBook(system, part, at, st);
  const key = (st ? `${at}:${st}` : at) as RuleKey;
  const own = (p: Prop) => system.book?.globals[part]?.[key]?.[p];
  const ctx: StyleCtx = {
    vars: allVariables(system, tokens),
    resolved: resolved as Resolved,
    own,
    origin: (p) => (own(p) !== undefined ? "here" : resolved[p]?.source.level === "global" ? "inherited" : resolved[p] ? "default" : "none"),
    source: (p) => (resolved[p] ? (resolved[p]!.source.level === "global" ? "All booking pages" : "Booking page default") : undefined),
    setsAny: (ps) => ps.some((p) => own(p) !== undefined),
    write: (ps, value, merge) => {
      let next: DesignSystem | null = system;
      for (const p of ps) next = next && setBookProp(next, tokens, part, at, st, p, value);
      if (!next) return false;
      onEdit(next, merge ? `book:${part}:${ps.join()}:${key}` : undefined);
      return true;
    },
  };
  return (
    <>
      <div className="min-h-0 overflow-auto bg-paper-deep p-6">
        <div className="mx-auto" style={{ maxWidth: bp === "phone" ? 390 : bp === "tablet" ? 768 : 1000 }}>
          <KitScope tokens={tokens as Record<string, unknown>} design={system} className="cb-page cb-embed">
            <div className="cb-wrap">
              <main className="cb-card">
                <BookingCalendar type={SAMPLE} load={load} />
              </main>
            </div>
          </KitScope>
        </div>
      </div>
      <aside aria-label="Style" className="min-h-0 overflow-y-auto border-l border-line bg-card">
        {hasKit ? (
          <>
            <div className="flex flex-col gap-2.5 border-b border-line px-3 py-3">
              <Select<BookPartKey> value={part} options={BOOK_PART_KEYS.map((k) => ({ value: k, label: bookPartDef(k).label }))} onChange={setPart} ariaLabel="Part" className={PICK} />
              <Select<string>
                value={state}
                options={[{ value: "", label: "No state" }, { value: "hover", label: "Hover" }, ...(bookPartDef(part).selected ? [{ value: "checked", label: "Picked" }] : [])]}
                onChange={(v) => setState(v as "" | "hover" | "checked")}
                ariaLabel="State"
                className={PICK}
              />
            </div>
            <Sections ctx={ctx} />
          </>
        ) : (
          <p className="px-4 py-10 text-center text-[12.5px] text-muted">Save the theme to a brand kit to style booking pages</p>
        )}
      </aside>
    </>
  );
}
