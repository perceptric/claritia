"use client";

// The email being edited on the canvas (docs/email-canvas-b2.md section 5): its document and subject, the brand's
// design draft (for a class or "Every heading" change), one undo history for both (kept per email while the canvas is
// open, so switching emails and back keeps it), and saving: 800 ms after the last change through email_draft_save,
// and at once before leaving, opening the Email Studio or switching to another email. A draft that was sent
// meanwhile turns read-only.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EmailDoc } from "@/lib/design/email/doc";
import type { EmailEdit } from "@/lib/design/email/edit";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import { cleanTokens } from "@/lib/forms/brand";
import type { Kit } from "../../forms/shared";
import { useDesignDraft } from "../../forms/useDesignDraft";
import { docOf, type CanvasRow } from "./preview";

type Snap = { doc: EmailDoc; system: DesignSystem; subject: string };
type History = { past: Snap[]; future: Snap[] };
export type EmailDraft = {
  id: string | null;
  doc: EmailDoc | null;
  subject: string;
  system: DesignSystem;
  kit: Kit | null;
  tokens: ReturnType<typeof cleanTokens>["tokens"];
  readOnly: boolean;
  /** Changes the email. Changes with the same `merge` key within a second join one undo step; a key starting with
   * "~" (a typing run) joins however long the pauses are. */
  apply: (next: Partial<EmailEdit> & { subject?: string }, merge?: string) => void;
  /** The document as it is right now, including changes made since the last render. */
  latest: () => EmailDoc | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  error: string;
  /** Save now. True when nothing is left to save. */
  flush: () => Promise<boolean>;
  /** The brand's styles changed and aren't published yet. */
  stylesChanged: boolean;
  publishStyles: () => Promise<void>;
};

export function useEmailDraft({ sb, session, ws, row, kits, onSaved }: { sb: SupabaseClient; session: Session; ws: string; row: CanvasRow | null; kits: Kit[]; onSaved?: (id: string, doc: EmailDoc, subject: string) => void }): EmailDraft {
  const [cur, setCur] = useState<{ id: string | null; doc: EmailDoc | null; subject: string; readOnly: boolean }>(() => ({ id: row?.id ?? null, doc: row ? docOf(row) : null, subject: row?.subject ?? "", readOnly: !!row && row.status !== "draft" }));
  // Another email picked: its own document (its history comes back from the map below).
  if (cur.id !== (row?.id ?? null)) setCur({ id: row?.id ?? null, doc: row ? docOf(row) : null, subject: row?.subject ?? "", readOnly: !!row && row.status !== "draft" });
  const kit = useMemo(() => kits.find((k) => k.id === cur.doc?.kitId) ?? kits[0] ?? null, [kits, cur.doc?.kitId]);
  const tokens = useMemo(() => cleanTokens(kit?.tokens ?? {}).tokens, [kit?.tokens]);
  const design = useDesignDraft(session, ws, kit, tokens);
  const [histories, setHistories] = useState<Record<string, History>>({});
  const histRef = useRef(histories);
  const latest = useRef(cur);
  const merge = useRef<{ key: string; at: number } | null>(null);
  const timer = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const rowRef = useRef(row);
  useEffect(() => {
    latest.current = cur;
    rowRef.current = row;
    histRef.current = histories;
  });
  const history = (id: string): History => histRef.current[id] ?? { past: [], future: [] };
  const putHistory = (id: string, h: History) => {
    histRef.current = { ...histRef.current, [id]: h };
    setHistories(histRef.current);
  };

  // What waits to be saved, kept with its own email so a switch to another email still saves this one.
  const pending = useRef<{ id: string; name: string; doc: EmailDoc; subject: string } | null>(null);
  const save = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return true;
    pending.current = null;
    setSaving(true);
    const name = p.name === "Untitled email" && p.subject.trim() ? p.subject.trim().slice(0, 200) : p.name;
    const { error: e } = await sb.rpc("email_draft_save", { p_ws: ws, p_id: p.id, p_name: name, p_subject: p.subject, p_preheader: p.doc.settings.preheader ?? "", p_doc: p.doc });
    setSaving(false);
    if (e) {
      if (/not a draft/i.test(e.message)) {
        setCur((x) => (x.id === p.id ? { ...x, readOnly: true } : x));
        setError("This email was sent. Your last change wasn't saved.");
        return true;
      }
      // A newer change waits already; otherwise this one is tried again with the next save.
      pending.current ??= p;
      setError(e.message);
      return false;
    }
    setError("");
    onSaved?.(p.id, p.doc, p.subject);
    return !pending.current;
  }, [sb, ws, onSaved]);
  const flush = useCallback(async () => {
    const a = await save();
    const b = await design.flush();
    return a && b;
  }, [save, design]);

  const schedule = (n: { id: string | null; doc: EmailDoc | null; subject: string }) => {
    if (!n.id || !n.doc) return;
    pending.current = { id: n.id, name: rowRef.current?.id === n.id ? rowRef.current.name : (pending.current?.name ?? ""), doc: n.doc, subject: n.subject };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 800);
  };
  // Leaving the canvas saves what hasn't been saved yet.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => () => void saveRef.current(), []);
  // Another email picked: the last one's change saves now.
  useEffect(() => {
    if (pending.current && pending.current.id !== cur.id) void saveRef.current();
  }, [cur.id]);

  const apply = useCallback(
    (next: Partial<EmailEdit> & { subject?: string }, mergeOn?: string) => {
      const c = latest.current;
      if (!c.id || !c.doc || c.readOnly) return;
      const h = history(c.id);
      const now = Date.now();
      const joins = !!mergeOn && merge.current?.key === mergeOn && (mergeOn.startsWith("~") || now - merge.current.at < 1000);
      merge.current = mergeOn ? { key: mergeOn, at: now } : null;
      putHistory(c.id, { past: joins ? h.past : [...h.past.slice(-99), { doc: c.doc, system: design.current(), subject: c.subject }], future: [] });
      const doc = next.doc ?? c.doc;
      const subject = next.subject ?? c.subject;
      if (doc !== c.doc || subject !== c.subject) {
        const n = { ...c, doc, subject };
        latest.current = n;
        setCur(n);
        schedule(n);
      }
      if (next.system && next.system !== design.current()) design.set(next.system);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [design],
  );
  const step = (dir: "undo" | "redo") => {
    const c = latest.current;
    if (!c.id || !c.doc || c.readOnly) return;
    const h = history(c.id);
    const snap = dir === "undo" ? h.past[h.past.length - 1] : h.future[0];
    if (!snap) return;
    merge.current = null;
    const here = { doc: c.doc, system: design.current(), subject: c.subject };
    putHistory(c.id, dir === "undo" ? { past: h.past.slice(0, -1), future: [here, ...h.future] } : { past: [...h.past, here], future: h.future.slice(1) });
    const n = { ...c, doc: snap.doc, subject: snap.subject };
    latest.current = n;
    setCur(n);
    if (snap.system !== design.current()) design.set(snap.system);
    schedule(n);
  };
  const h = cur.id ? histories[cur.id] : undefined;
  const stylesChanged = !!kit && JSON.stringify(design.system) !== JSON.stringify(readSystem(kit.design_live, tokens));
  const publishStyles = async () => {
    if (!kit || !(await design.flush())) return;
    const { error: e } = await sb.rpc("brand_kit_design_publish", { p_id: kit.id });
    if (e) setError(e.message);
  };
  return {
    id: cur.id,
    doc: cur.doc,
    subject: cur.subject,
    system: design.system,
    kit,
    tokens,
    readOnly: cur.readOnly,
    apply,
    latest: () => latest.current.doc,
    undo: () => step("undo"),
    redo: () => step("redo"),
    canUndo: !!h?.past.length,
    canRedo: !!h?.future.length,
    saving: saving || design.saving,
    error: error || design.error,
    flush,
    stylesChanged,
    publishStyles,
  };
}
