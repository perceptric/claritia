"use client";

// The email builder (docs/design-system.md Part 5): full screen over the step or template it came from. Left: Add
// (blocks), Layers and Variables. Middle: the compiled email at desktop or phone width, light or dark. Right:
// Settings (words, links, who sees it) and Style. Every change is a whole new document (and design system draft) on
// one undo stack; typing in one box is one step. The document goes back to the caller as it changes, which saves it;
// style changes save to the brand kit's draft and go live with Publish styles.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { compileEmail } from "@/lib/design/email/compile";
import { newBlock, readBlock, readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import type { EmailEdit } from "@/lib/design/email/edit";
import { addBlock, duplicateEl, findEl, moveBlock, moveSection, removeEl, type Place } from "@/lib/design/email/ops";
import { insertComponent } from "@/lib/design/email/components";
import { BLOCK_TYPES, type BlockType, type EmailPartKey } from "@/lib/design/email/parts";
import type { EmailBp, EmailState } from "@/lib/design/email/style";
import { designFonts } from "@/lib/design/form";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import { CLIENT_LABEL, type Client } from "@/lib/design/props";
import { Select } from "../Select";
import { cleanTokens } from "@/lib/forms/brand";
import { ArrowDown, ArrowUp, Copy, FileText, Monitor, Moon, Phone, Redo, Send, Sun, Trash, Undo, X } from "../../Icons";
import { askConfirm, askLines, tell } from "../Dialogs";
import { importAny } from "@/lib/design/email/import";
import { EMAIL_TEMPLATES, TEMPLATE_FOLDERS } from "@/lib/design/email/templates";
import { Button, ErrorNote, IconButton, postJson, errorText } from "../ui";
import { VariablesPanel } from "../forms/DesignPanels";
import { fontUrl } from "../forms/editorModel";
import { CheckSquare, Diamond, ElementIcon, Layers, PlusSquare } from "../forms/icons";
import type { Kit } from "../forms/shared";
import { useDesignDraft } from "../forms/useDesignDraft";
import { BlockSettings } from "./BlockSettings";
import { AiPanel } from "./AiPanel";
import { Versions } from "./Versions";
import { AiMark } from "../Ai";
import { CheckList } from "./CheckList";
import { checkEmailDesign } from "@/lib/design/check";
import { EmailCanvas } from "./EmailCanvas";
import { EmailStylePanel } from "./EmailStyle";

type Snap = { doc: EmailDoc; system: DesignSystem };
type Rail = "add" | "templates" | "layers" | "variables" | "checks";

const BLOCKS: { type: BlockType; label: string; icon: string }[] = [
  { type: "heading", label: "Heading", icon: "heading" },
  { type: "text", label: "Text", icon: "text" },
  { type: "button", label: "Button", icon: "link" },
  { type: "image", label: "Image", icon: "image" },
  { type: "logo", label: "Logo", icon: "image" },
  { type: "divider", label: "Divider", icon: "divider" },
  { type: "spacer", label: "Spacer", icon: "short" },
  { type: "list", label: "List", icon: "checklist" },
  { type: "quote", label: "Quote", icon: "long" },
  { type: "social", label: "Social links", icon: "globe" },
  { type: "video", label: "Video", icon: "image" },
  { type: "product", label: "Product", icon: "star" },
  { type: "event", label: "Event", icon: "calendar" },
  { type: "meeting", label: "Meeting link", icon: "calendar" },
  { type: "signature", label: "Signature", icon: "user" },
  { type: "footer", label: "Footer", icon: "short" },
  { type: "html", label: "HTML", icon: "hash" },
];
export const BLOCK_LABEL = Object.fromEntries(BLOCKS.map((b) => [b.type, b.label])) as Record<BlockType, string>;

export function EmailBuilder({
  session,
  sb,
  workspaceId,
  subject,
  doc: start,
  onChange,
  versionRef,
  onClose,
}: {
  session: Session;
  sb: SupabaseClient;
  workspaceId: string;
  subject: string;
  doc: EmailDoc;
  /** The document as it changes; with the subject when the AI changed it, in the same call. */
  onChange: (doc: EmailDoc, subject?: string) => void;
  /** Where the AI's versions of this email are kept ("wf:<workflow>:<step>" or "tpl:<template>"). */
  versionRef?: string;
  onClose: () => void;
}) {
  const [kits, setKits] = useState<Kit[]>([]);
  const [error, setError] = useState("");
  const [kitTick, setKitTick] = useState(0);
  const loadKits = useCallback(() => setKitTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    void sb
      .from("brand_kits")
      .select("id, name, tokens, logo_url, notes, source_url, scan_status, scan_error, scanned_at, design, design_live, design_rev, social")
      .eq("workspace_id", workspaceId)
      .order("created_at")
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) setError(e.message);
        else setKits((data ?? []) as Kit[]);
      });
    return () => {
      live = false;
    };
  }, [sb, workspaceId, kitTick]);

  const [doc, setDoc] = useState<EmailDoc>(() => readEmailDoc(start, { allowHtml: true }));
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0] ?? null;
  const tokens = useMemo(() => cleanTokens(kit?.tokens ?? {}).tokens, [kit?.tokens]);
  const draft = useDesignDraft(session, workspaceId, kit, tokens);
  const system = draft.system;

  // One undo stack for the document and the design system's draft.
  const [past, setPast] = useState<Snap[]>([]);
  const [future, setFuture] = useState<Snap[]>([]);
  const latest = useRef(doc);
  const merge = useRef<{ key: string; at: number } | null>(null);
  const put = useCallback(
    (d: EmailDoc, subject?: string) => {
      latest.current = d;
      setDoc(d);
      onChange(d, subject);
    },
    [onChange],
  );
  const apply = useCallback(
    (next: Partial<EmailEdit> & { subject?: string }, mergeOn?: string) => {
      const now = Date.now();
      const joins = !!mergeOn && merge.current?.key === mergeOn && now - merge.current.at < 1000;
      merge.current = mergeOn ? { key: mergeOn, at: now } : null;
      if (!joins) setPast((p) => [...p.slice(-99), { doc: latest.current, system: draft.current() }]);
      setFuture([]);
      if (next.doc && next.doc !== latest.current) put(next.doc, next.subject);
      if (next.system && next.system !== draft.current()) draft.set(next.system);
    },
    [draft, put],
  );
  const undo = useCallback(() => {
    const snap = past[past.length - 1];
    if (!snap) return;
    merge.current = null;
    setFuture((f) => [{ doc: latest.current, system: draft.current() }, ...f]);
    setPast((p) => p.slice(0, -1));
    put(snap.doc);
    if (snap.system !== draft.current()) draft.set(snap.system);
  }, [past, draft, put]);
  const redo = useCallback(() => {
    const snap = future[0];
    if (!snap) return;
    merge.current = null;
    setPast((p) => [...p, { doc: latest.current, system: draft.current() }]);
    setFuture((f) => f.slice(1));
    put(snap.doc);
    if (snap.system !== draft.current()) draft.set(snap.system);
  }, [future, draft, put]);

  const assetCtx = useMemo(() => ({ session, sb, workspaceId }), [session, sb, workspaceId]);
  const [rail, setRail] = useState<Rail>("add");
  const [side, setSide] = useState<"settings" | "style" | "ai">("settings");
  const [device, setDevice] = useState<EmailBp>("base");
  const [dark, setDark] = useState(false);
  const [client, setClient] = useState<Client | "">("");
  const [selected, setSelected] = useState<string | null>(null);
  const [part, setPart] = useState<EmailPartKey | null>(null);
  const [state, setState] = useState<EmailState | undefined>(undefined);
  const sel = selected && findEl(doc, selected) ? selected : null;

  const logo = kit?.logo_url ?? null;
  const compiled = useMemo(() => {
    try {
      return compileEmail(system, doc, { tokens, logo, preview: true, forceDark: dark, client: client || undefined, fontUrl: client && client !== "apple" ? undefined : fontUrl(designFonts(system, doc.styles ?? null)) });
    } catch (e) {
      return { html: `<!doctype html><html><body><p>${errorText(e)}</p></body></html>`, text: "", size: 0, notes: [] };
    }
  }, [system, doc, tokens, logo, dark, client]);

  /** Where a new block goes: after the picked block, at the end of the picked section, or before the footer. */
  const placeFor = (): Place => {
    const f = sel ? findEl(latest.current, sel) : null;
    if (f?.block && f.column) return { column: f.column.id, index: f.bi! + 1 };
    if (f?.column) return { column: f.column.id, index: f.column.blocks.length };
    if (f) return { column: f.section.columns[0]!.id, index: f.section.columns[0]!.blocks.length };
    const footerAt = latest.current.sections.findIndex((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "footer")));
    return { section: footerAt >= 0 ? footerAt : latest.current.sections.length };
  };
  const add = (type: BlockType) => {
    // A Social block starts with the links the brand scan found.
    const b = type === "social" && kit?.social?.length ? (readBlock({ ...newBlock(type), links: kit.social }, new Set(), false) ?? newBlock(type)) : newBlock(type);
    apply({ doc: addBlock(latest.current, b, placeFor()) });
    setSelected(b.id);
    setPart(null);
  };
  const remove = useCallback(
    (id: string) => {
      apply({ doc: removeEl(latest.current, id) });
      setSelected(null);
    },
    [apply],
  );
  const duplicate = useCallback(
    (id: string) => {
      const r = duplicateEl(latest.current, id);
      if (!r.id) return;
      apply({ doc: r.doc });
      setSelected(r.id);
    },
    [apply],
  );
  const nudge = (id: string, dir: -1 | 1) => {
    const f = findEl(latest.current, id);
    if (!f) return;
    if (f.block && f.column) apply({ doc: moveBlock(latest.current, id, { column: f.column.id, index: f.bi! + (dir > 0 ? 2 : -1) }) });
    else if (!f.column) apply({ doc: moveSection(latest.current, id, f.si + (dir > 0 ? 2 : -1)) });
  };

  // Keys: Cmd+Z and Shift+Cmd+Z, Delete, Cmd+D, Escape. Never while typing.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable], [role=listbox]") || document.querySelector("[aria-modal=true][data-dialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (sel) setSelected(null);
        else onClose();
      } else if (sel && (e.key === "Backspace" || e.key === "Delete")) {
        e.preventDefault();
        remove(sel);
      } else if (sel && mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate(sel);
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [sel, undo, redo, remove, duplicate, onClose]);

  const [sending, setSending] = useState(false);
  const test = async () => {
    setSending(true);
    setError("");
    try {
      if (!(await draft.flush())) return;
      await postJson(session, "/api/email/test", { workspaceId, subject, doc: latest.current });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSending(false);
    }
  };
  const stylesChanged = !!kit && JSON.stringify(system) !== JSON.stringify(readSystem(kit.design_live, tokens));
  const publishStyles = async () => {
    if (!kit) return;
    try {
      if (!(await draft.flush())) return;
      const { error: e } = await sb.rpc("brand_kit_design_publish", { p_id: kit.id });
      if (e) throw new Error(e.message);
      loadKits();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const rails: { id: Rail; label: string; icon: React.ReactNode }[] = [
    { id: "add", label: "Add", icon: <PlusSquare size={16} /> },
    { id: "templates", label: "Templates", icon: <FileText size={16} /> },
    { id: "layers", label: "Layers", icon: <Layers size={16} /> },
    { id: "variables", label: "Variables", icon: <Diamond size={16} /> },
    { id: "checks", label: "Checks", icon: <CheckSquare size={16} /> },
  ];
  const width = device === "phone" ? 390 : doc.settings.width + 64;
  const checks = useMemo(() => {
    try {
      return checkEmailDesign(system, doc, tokens);
    } catch {
      return [];
    }
  }, [system, doc, tokens]);
  const notes = checks.filter((n) => n.level === "block");

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Email builder" className="anim-fade fixed inset-0 z-[85] flex flex-col bg-paper">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-3">
        <IconButton label="Close" onClick={onClose}>
          <X size={15} />
        </IconButton>
        <span className="min-w-0 truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">{subject || "Email"}</span>
        <span className="hidden pl-1 text-[12px] text-muted sm:inline">{draft.saving ? "Saving…" : `${Math.round(compiled.size / 1024)} KB`}</span>
        <span className="flex-1" />
        <IconButton label="Undo" onClick={undo} disabled={!past.length}>
          <Undo size={14} />
        </IconButton>
        <IconButton label="Redo" onClick={redo} disabled={!future.length}>
          <Redo size={14} />
        </IconButton>
        <div role="radiogroup" aria-label="Device" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
          {(
            [
              ["base", "Desktop", <Monitor key="d" size={14} />],
              ["phone", "Phone", <Phone key="p" size={14} />],
            ] as const
          ).map(([d, label, icon]) => (
            <button key={d} type="button" role="radio" aria-checked={device === d} aria-label={label} title={label} onClick={() => setDevice(d)} className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${device === d ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {icon}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Light or dark" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
          {(
            [
              [false, "Light", <Sun key="l" size={14} />],
              [true, "Dark", <Moon key="k" size={14} />],
            ] as const
          ).map(([d, label, icon]) => (
            <button key={label} type="button" role="radio" aria-checked={dark === d} aria-label={label} title={label} onClick={() => setDark(d)} className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${dark === d ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {icon}
            </button>
          ))}
        </div>
        <span className="w-[150px]">
          <Select<string>
            value={client}
            options={[{ value: "", label: "Every mail app" }, ...(Object.keys(CLIENT_LABEL) as Client[]).map((c) => ({ value: c, label: CLIENT_LABEL[c] }))]}
            onChange={(v) => setClient(v as Client | "")}
            ariaLabel="Client view"
            className="h-8 w-full rounded-full px-2.5 text-[12.5px] font-medium text-ink hover:bg-hover"
          />
        </span>
        {stylesChanged ? (
          <Button variant="ghost" onClick={() => void publishStyles()}>
            Publish styles
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={async () => {
            const source = await askLines("Import an email", { placeholder: "Paste HTML, MJML or an .eml file", ok: "Import" });
            if (!source?.trim()) return;
            const r = importAny(source);
            if (!r.doc.sections.some((x) => x.columns.some((c) => c.blocks.some((b) => b.type !== "footer")))) return void tell("Nothing to import", "No words, pictures or buttons were found.");
            apply({ doc: { ...r.doc, ...(latest.current.kitId ? { kitId: latest.current.kitId } : {}) } });
            setSelected(null);
            if (r.notes.length) void tell("Imported", r.notes.join(" "));
          }}
        >
          Import
        </Button>
        <Button variant="ghost" disabled={sending} onClick={() => void test()}>
          <Send size={13} />
          {sending ? "Sending…" : "Test"}
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
      {error || draft.error || notes.length ? (
        <div className="border-b border-line bg-card px-4 py-2">
          <ErrorNote message={error || draft.error || notes[0]!.text} />
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[44px_248px_minmax(0,1fr)_300px]">
        <nav aria-label="Panels" className="flex flex-col items-center gap-1 border-r border-line bg-card py-2">
          {rails.map((r) => (
            <button key={r.id} type="button" aria-label={r.id === "checks" && checks.length ? `${r.label}, ${checks.length}` : r.label} title={r.label} aria-pressed={rail === r.id} onClick={() => setRail(r.id)} className={`press relative flex size-8 items-center justify-center rounded-full transition-colors duration-[140ms] ${rail === r.id ? "bg-ink text-paper" : "text-muted hover:bg-hover hover:text-ink"}`}>
              {r.icon}
              {r.id === "checks" && checks.length ? <span aria-hidden="true" className="absolute top-0.5 right-0.5 size-2 rounded-full bg-butter" /> : null}
            </button>
          ))}
        </nav>
        <aside aria-label={rails.find((r) => r.id === rail)?.label} className="flex min-h-0 flex-col border-r border-line bg-card">
          <div className="flex h-11 shrink-0 items-center border-b border-line px-3">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{rails.find((r) => r.id === rail)?.label}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rail === "add" ? (
              <>
                <div className="grid grid-cols-2 gap-1.5 p-3">
                  {BLOCKS.map((b) => (
                    <button key={b.type} type="button" onClick={() => add(b.type)} className="press flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-line bg-card text-[12px] text-ink transition-[box-shadow,border-color] duration-[140ms] hover:border-line-strong hover:shadow-soft">
                      <ElementIcon name={b.icon} size={16} className="text-muted" />
                      {b.label}
                    </button>
                  ))}
                </div>
                {system.email?.components?.length ? (
                  <div className="flex flex-col gap-1 px-3 pb-3">
                    <p className="mb-0.5 text-[12px] font-medium text-muted">Components</p>
                    {system.email.components.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const at = (() => {
                            const f = sel ? findEl(latest.current, sel) : null;
                            if (f) return f.si + 1;
                            const footerAt = latest.current.sections.findIndex((s) => s.columns.some((col) => col.blocks.some((b) => b.type === "footer")));
                            return footerAt >= 0 ? footerAt : latest.current.sections.length;
                          })();
                          const r = insertComponent(latest.current, system, c.id, at);
                          if (!r) return;
                          apply({ doc: r.doc });
                          setSelected(r.id);
                        }}
                        className="press flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-left text-[12.5px] text-ink hover:border-line-strong hover:shadow-soft"
                      >
                        <Layers size={13} className="text-muted" />
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
            {rail === "layers" ? <LayerList doc={doc} selected={sel} onSelect={(id) => (setSelected(id), setPart(null))} onNudge={nudge} onDuplicate={duplicate} onRemove={remove} /> : null}
            {rail === "templates" ? (
              <div className="flex flex-col gap-3 p-3">
                {TEMPLATE_FOLDERS.map((g) => (
                  <div key={g} className="flex flex-col gap-1">
                    <p className="text-[12px] font-medium text-muted">{g}</p>
                    {EMAIL_TEMPLATES.filter((t) => t.group === g).map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={async () => {
                          if (!(await askConfirm(`Start from ${t.name}?`, { body: "It takes the place of this email. Undo brings it back.", ok: "Use template" }))) return;
                          apply({ doc: { ...t.make(), ...(latest.current.kitId ? { kitId: latest.current.kitId } : {}) } });
                          setSelected(null);
                        }}
                        className="press flex h-8 items-center rounded-lg border border-line bg-card px-3 text-left text-[12.5px] text-ink hover:border-line-strong hover:shadow-soft"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
            {rail === "checks" ? (
              <CheckList
                notes={checks}
                onPick={(id) => {
                  setSelected(id && findEl(doc, id) ? id : null);
                  setSide("settings");
                }}
              />
            ) : null}
            {rail === "variables" ? (
              <VariablesPanel
                e={{ system, design: {} }}
                tokens={tokens}
                hasKit={!!kit}
                onEdit={(e, m) => apply({ system: e.system }, m)}
                onTheme={() => setError("Change the brand kit's colors and fonts in a form's Theme panel.")}
                live={{ changed: stylesChanged, publish: publishStyles, openGuide: () => setRail("add") }}
              />
            ) : null}
          </div>
        </aside>
        <EmailCanvas
          html={compiled.html}
          width={width}
          selected={sel}
          onPick={(p) => {
            setSelected(p.id === "email" ? null : p.id);
            setPart(p.part);
          }}
          onClear={() => {
            setSelected(null);
            setPart(null);
          }}
        />
        <aside aria-label="Inspector" className="flex min-h-0 flex-col border-l border-line bg-card">
          <div role="tablist" aria-label="Inspector" className="flex h-11 shrink-0 items-center gap-1 border-b border-line px-2">
            {(["settings", "style", "ai"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={side === k} onClick={() => setSide(k)} className={`press inline-flex h-7 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${side === k ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
                {k === "ai" ? <AiMark size={12} /> : null}
                {k === "settings" ? "Settings" : k === "style" ? "Style" : "AI"}
              </button>
            ))}
            <span className="flex-1" />
            {versionRef ? <Versions sb={sb} workspaceId={workspaceId} versionRef={versionRef} onRestore={(d) => apply({ doc: { ...d, ...(latest.current.kitId && !d.kitId ? { kitId: latest.current.kitId } : {}) } })} /> : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {side === "ai" ? (
              <AiPanel
                session={session}
                workspaceId={workspaceId}
                versionRef={versionRef}
                doc={() => latest.current}
                subject={subject}
                system={system}
                tokens={tokens}
                onResult={(r) => apply({ doc: readEmailDoc(r.doc, { allowHtml: true }), ...(r.system ? { system: readSystem(r.system, tokens) } : {}), ...(r.subject && r.subject !== subject ? { subject: r.subject } : {}) })}
              />
            ) : side === "settings" ? (
              <BlockSettings
                doc={doc}
                system={system}
                selected={sel}
                onChange={(d, m) => apply({ doc: d }, m)}
                onEdit={(e) => apply(e)}
                kits={kits.map((k) => ({ id: k.id, name: k.name }))}
                kitId={kit?.id ?? null}
                assets={assetCtx}
              />
            ) : (
              <EmailStylePanel
                system={system}
                doc={doc}
                tokens={tokens}
                bp={device}
                hasKit={!!kit}
                selected={sel}
                part={part}
                onPart={setPart}
                state={state}
                onState={setState}
                onEdit={(e, m) => apply(e, m)}
              />
            )}
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/** Sections, columns and blocks in order; move, copy or remove from here. */
function LayerList({
  doc,
  selected,
  onSelect,
  onNudge,
  onDuplicate,
  onRemove,
}: {
  doc: EmailDoc;
  selected: string | null;
  onSelect: (id: string) => void;
  onNudge: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const row = (id: string, label: string, depth: number) => (
    <li key={id} className={`group flex h-8 items-center gap-1 pr-1 ${selected === id ? "bg-ink text-paper" : "text-ink hover:bg-hover"}`} style={{ paddingLeft: 12 + depth * 14 }}>
      <button type="button" onClick={() => onSelect(id)} className="min-w-0 flex-1 truncate text-left text-[12.5px]">
        {label}
      </button>
      <span className={`flex items-center ${selected === id ? "" : "opacity-0 group-hover:opacity-100"}`}>
        {(
          [
            ["Move up", <ArrowUp key="u" size={12} />, () => onNudge(id, -1)],
            ["Move down", <ArrowDown key="d" size={12} />, () => onNudge(id, 1)],
            ["Duplicate", <Copy key="c" size={12} />, () => onDuplicate(id)],
            ["Delete", <Trash key="t" size={12} />, () => onRemove(id)],
          ] as const
        ).map(([label, icon, act]) => (
          <button key={label} type="button" aria-label={label} title={label} onClick={act} className="press flex size-6 items-center justify-center rounded-full hover:bg-hover">
            {icon}
          </button>
        ))}
      </span>
    </li>
  );
  return (
    <ul className="flex flex-col py-1">
      {doc.sections.map((s, i) => [
        row(s.id, `Section ${i + 1}${s.columns.length > 1 ? `, ${s.columns.length} columns` : ""}`, 0),
        ...s.columns.flatMap((c) => c.blocks.map((b) => row(b.id, b.type === "heading" ? b.text || BLOCK_LABEL[b.type] : BLOCK_LABEL[b.type], s.columns.length > 1 ? 2 : 1))),
      ])}
    </ul>
  );
}

export { BLOCK_TYPES };
