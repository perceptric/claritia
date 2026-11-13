"use client";

// The canvas's one editor (docs/email-canvas-b4.md section 4): every email changed in this visit, a design draft for
// each brand kit touched, and one undo history for all of them, so a move between emails, a cut and paste, or a
// brand-wide style change is one step. Each email saves 800 ms after its last change through email_draft_save, each
// kit 700 ms after through the design save; hiccups are tried again on their own (3 more times); when a step moves
// blocks between emails, the email that gains saves first and the one that loses only after it worked, so a failure
// never leaves a block in neither. A draft that turns out to be sent becomes read-only; if it was gaining a block,
// the move is taken back on screen. `draft(id)` gives the B2 shape the panel and typing use.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyHistory, push, redo as redoStep, undo as undoStep, dropKit, type History, type Snap } from "@/lib/canvas/history";
import type { EmailDoc } from "@/lib/design/email/doc";
import type { EmailEdit } from "@/lib/design/email/edit";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { saveDesign } from "../../forms/designSave";
import type { Kit } from "../../forms/shared";
import { docOf as rowDocOf, type CanvasRow } from "./preview";

export type EmailDraft = {
  id: string | null;
  doc: EmailDoc | null;
  subject: string;
  system: DesignSystem;
  kit: Kit | null;
  tokens: Partial<Tokens>;
  readOnly: boolean;
  /** Read-only because Tia is changing it (B5). */
  locked: boolean;
  /** Changes the email (and its kit's styles). The same `merge` key within a second joins one undo step; a key
   * starting with "~" (a typing run) joins however long the pauses are. */
  apply: (next: Partial<EmailEdit> & { subject?: string }, merge?: string, label?: string) => void;
  /** The document as it is right now, including changes made since the last render. */
  latest: () => EmailDoc | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
  error: string;
  /** Saves everything now. True when nothing is left to save. */
  flush: () => Promise<boolean>;
  /** The brand's styles changed and aren't published yet. */
  stylesChanged: boolean;
  publishStyles: () => Promise<void>;
};

type EmailState = { id: string; doc: EmailDoc; subject: string; name: string; readOnly: boolean; savedDoc: EmailDoc; savedSubject: string };
type KitState = { id: string; system: DesignSystem; rev: number; live: DesignSystem };
type Store = { emails: Record<string, EmailState>; kits: Record<string, KitState>; hist: History; failed: Record<string, { name: string; message: string }>; locked: string[] };
export type Change = { emails?: Record<string, { doc?: EmailDoc; subject?: string }>; kits?: Record<string, DesignSystem> };
export type HistoryResult = { ids: string[]; label: string } | null;
type RpcResult = { error: { message: string; code?: string } | null; status?: number };

const DELAYS = [500, 1000, 2000];
const TIMEOUT = 15_000;
const blocks = (d: EmailDoc) => d.sections.reduce((n, s) => n + s.columns.reduce((m, c) => m + c.blocks.length, 0), 0);
const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
// A row's document, read once per row object.
const rowDocs = new WeakMap<CanvasRow, EmailDoc>();
const rowDoc = (r: CanvasRow) => {
  let d = rowDocs.get(r);
  if (!d) rowDocs.set(r, (d = rowDocOf(r)));
  return d;
};
const kitSystems = new WeakMap<Kit, { system: DesignSystem; live: DesignSystem; tokens: Partial<Tokens> }>();
const kitRead = (k: Kit) => {
  let v = kitSystems.get(k);
  if (!v) {
    const tokens = cleanTokens(k.tokens ?? {}).tokens;
    kitSystems.set(k, (v = { system: readSystem(k.design ?? {}, tokens), live: readSystem(k.design_live ?? {}, tokens), tokens }));
  }
  return v;
};
/** A hiccup worth trying again: a timeout, the network, a 5xx, 429 or 408. */
const hiccup = (r: RpcResult) => !r.status || r.status >= 500 || r.status === 429 || r.status === 408 || /timeout|network|fetch|unavailable/i.test(r.error?.message ?? "");

export function useCanvasEditor({ sb, session, ws, rows, kits, onSaved, onNotice }: { sb: SupabaseClient; session: Session; ws: string; rows: CanvasRow[]; kits: Kit[]; onSaved?: (id: string, doc: EmailDoc, subject: string, name: string) => void; onNotice?: (text: string) => void }) {
  const [store, setStore] = useState<Store>(() => ({ emails: {}, kits: {}, hist: emptyHistory(), failed: {}, locked: [] }));
  const [busy, setBusy] = useState(false);
  const s = useRef(store);
  const rowsRef = useRef(rows);
  const kitsRef = useRef(kits);
  const onSavedRef = useRef(onSaved);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => {
    rowsRef.current = rows;
    kitsRef.current = kits;
    onSavedRef.current = onSaved;
    onNoticeRef.current = onNotice;
  });
  const commit = useCallback((fn: (st: Store) => Store) => {
    const next = fn(s.current);
    if (next === s.current) return;
    s.current = next;
    setStore(next);
  }, []);

  // Reading ---------------------------------------------------------------------------------------------------------
  const kitIdOf = (doc: EmailDoc, list: Kit[]) => (list.find((k) => k.id === doc.kitId) ?? list[0])?.id ?? null;
  const fromRow = (r: CanvasRow): EmailState => {
    const d = rowDoc(r);
    return { id: r.id, doc: d, subject: r.subject, name: r.name, readOnly: r.status !== "draft", savedDoc: d, savedSubject: r.subject };
  };
  /** An email's state from the latest store, or from its row (handlers only). */
  const emailNow = (id: string): EmailState | null => {
    const e = s.current.emails[id];
    if (e) return e;
    const r = rowsRef.current.find((x) => x.id === id);
    return r ? fromRow(r) : null;
  };
  const kitNow = (kitId: string): KitState | null => {
    const k = s.current.kits[kitId];
    if (k) return k;
    const kit = kitsRef.current.find((x) => x.id === kitId);
    if (!kit) return null;
    const v = kitRead(kit);
    return { id: kitId, system: v.system, rev: kit.design_rev ?? 0, live: v.live };
  };
  const tokensOf = (kitId: string | null, list: Kit[]) => {
    const kit = list.find((k) => k.id === kitId);
    return kit ? kitRead(kit).tokens : {};
  };

  // Saving ----------------------------------------------------------------------------------------------------------
  const pending = useRef(new Map<string, { tries: number; waitFor: Set<string>; timer: number }>());
  const inflight = useRef(new Set<string>());
  const kitPending = useRef(new Map<string, { tries: number; timer: number }>());
  const kitInflight = useRef(new Set<string>());
  const waiters = useRef(new Map<string, (() => void)[]>());
  const refreshBusy = () => setBusy(inflight.current.size + kitInflight.current.size > 0);
  const note = (text: string) => onNoticeRef.current?.(text);

  const schedule = (id: string, delay = 800) => {
    const p = pending.current.get(id) ?? { tries: 0, waitFor: new Set<string>(), timer: 0 };
    window.clearTimeout(p.timer);
    p.timer = window.setTimeout(() => void runSave(id), delay);
    pending.current.set(id, p);
  };
  const blocked = (id: string) => {
    const p = pending.current.get(id);
    if (!p) return false;
    for (const w of p.waitFor) if (pending.current.has(w) || inflight.current.has(w) || s.current.failed[w]) return true;
    return false;
  };
  const wake = (done: string) => {
    for (const [id, p] of pending.current)
      if (p.waitFor.delete(done) && !blocked(id)) {
        window.clearTimeout(p.timer);
        void runSave(id);
      }
  };

  const callSave = async (st: EmailState, name: string): Promise<RpcResult> => {
    const call = sb.rpc("email_draft_save", { p_ws: ws, p_id: st.id, p_name: name, p_subject: st.subject, p_preheader: st.doc.settings.preheader ?? "", p_doc: st.doc }) as unknown as Promise<RpcResult>;
    const timeout = new Promise<RpcResult>((res) => window.setTimeout(() => res({ error: { message: "The save timed out." }, status: 0 }), TIMEOUT));
    try {
      return await Promise.race([call, timeout]);
    } catch (e) {
      return { error: { message: e instanceof Error ? e.message : "Network error" }, status: 0 };
    }
  };

  async function runSave(id: string): Promise<void> {
    const p = pending.current.get(id);
    if (!p || inflight.current.has(id) || blocked(id)) return;
    const st = emailNow(id);
    if (!st || st.readOnly) return void pending.current.delete(id);
    pending.current.delete(id);
    inflight.current.add(id);
    refreshBusy();
    const name = st.name === "Untitled email" && st.subject.trim() ? st.subject.trim().slice(0, 200) : st.name;
    const r = await callSave(st, name);
    inflight.current.delete(id);
    if (!r.error) {
      commit((x) => {
        const cur = x.emails[id];
        const failed = { ...x.failed };
        delete failed[id];
        return { ...x, failed, emails: cur ? { ...x.emails, [id]: { ...cur, name, savedDoc: st.doc, savedSubject: st.subject } } : x.emails };
      });
      onSavedRef.current?.(id, st.doc, st.subject, name);
      wake(id);
    } else if (/not a draft/i.test(r.error.message)) {
      sentMeanwhile(id, st.name);
    } else if (hiccup(r) && p.tries < DELAYS.length) {
      const again = { tries: p.tries + 1, waitFor: p.waitFor, timer: 0 };
      pending.current.set(id, again);
      again.timer = window.setTimeout(() => void runSave(id), DELAYS[p.tries]! * (1 + Math.random() * 0.2));
    } else {
      // Failed for good: the change waits for Try again (with its order kept).
      pending.current.set(id, { tries: 0, waitFor: p.waitFor, timer: 0 });
      commit((x) => ({ ...x, failed: { ...x.failed, [id]: { name: st.name, message: r.error!.message } } }));
    }
    refreshBusy();
    // A change made while this save was on its way.
    if (pending.current.has(id) && !s.current.failed[id] && !blocked(id) && !inflight.current.has(id)) schedule(id, 300);
    for (const f of waiters.current.get(id) ?? []) f();
    waiters.current.delete(id);
  }

  /** The email was sent: it turns read-only; emails waiting on it (it was gaining their blocks) go back to as saved. */
  function sentMeanwhile(id: string, name: string) {
    const losers = [...pending.current].filter(([, p]) => p.waitFor.has(id)).map(([k]) => k);
    for (const l of losers) {
      window.clearTimeout(pending.current.get(l)!.timer);
      pending.current.delete(l);
    }
    commit((x) => {
      const emails = { ...x.emails };
      const r = rowsRef.current.find((y) => y.id === id);
      emails[id] = { ...(emails[id] ?? (r ? fromRow(r) : (emails[id] as EmailState))), readOnly: true, ...(r ? { doc: rowDoc(r), subject: r.subject } : {}) };
      for (const l of losers) if (emails[l]) emails[l] = { ...emails[l]!, doc: emails[l]!.savedDoc, subject: emails[l]!.savedSubject };
      const hist = { past: x.hist.past.filter((st) => !(id in st.emails)), future: x.hist.future.filter((st) => !(id in st.emails)) };
      return { ...x, emails, hist };
    });
    const loserName = losers.map((l) => s.current.emails[l]?.name).filter(Boolean)[0];
    note(loserName ? `${name} was sent, so the block stayed in ${loserName}.` : "This email was sent. Your last change wasn't saved.");
  }

  const scheduleKit = (kitId: string, delay = 700) => {
    const p = kitPending.current.get(kitId) ?? { tries: 0, timer: 0 };
    window.clearTimeout(p.timer);
    p.timer = window.setTimeout(() => void runKitSave(kitId), delay);
    kitPending.current.set(kitId, p);
  };
  async function runKitSave(kitId: string): Promise<void> {
    const p = kitPending.current.get(kitId);
    if (!p || kitInflight.current.has(kitId)) return;
    const k = kitNow(kitId);
    if (!k) return void kitPending.current.delete(kitId);
    kitPending.current.delete(kitId);
    kitInflight.current.add(kitId);
    refreshBusy();
    const sent = k.system;
    const r = await saveDesign({ session, workspaceId: ws, kitId, design: sent, rev: k.rev });
    kitInflight.current.delete(kitId);
    const key = `kit:${kitId}`;
    if ("ok" in r) {
      commit((x) => {
        const cur = x.kits[kitId];
        const failed = { ...x.failed };
        delete failed[key];
        return { ...x, failed, kits: cur ? { ...x.kits, [kitId]: { ...cur, rev: r.rev } } : x.kits };
      });
    } else if ("conflict" in r) {
      const kit = kitsRef.current.find((y) => y.id === kitId);
      const theirs = readSystem(r.design ?? {}, kit ? kitRead(kit).tokens : {});
      commit((x) => ({ ...x, kits: { ...x.kits, [kitId]: { ...(x.kits[kitId] ?? k), system: theirs, rev: r.rev } }, hist: dropKit(x.hist, kitId) }));
      note("Someone else changed these styles.");
    } else if (r.retry && p.tries < DELAYS.length) {
      const again = { tries: p.tries + 1, timer: 0 };
      kitPending.current.set(kitId, again);
      again.timer = window.setTimeout(() => void runKitSave(kitId), DELAYS[p.tries]! * (1 + Math.random() * 0.2));
    } else {
      kitPending.current.set(kitId, { tries: 0, timer: 0 });
      commit((x) => ({ ...x, failed: { ...x.failed, [key]: { name: "The brand's styles", message: r.error } } }));
    }
    refreshBusy();
    if (kitPending.current.has(kitId) && !s.current.failed[key] && !kitInflight.current.has(kitId)) scheduleKit(kitId, 300);
    else if (s.current.kits[kitId] && s.current.kits[kitId]!.system !== sent && !kitPending.current.has(kitId) && "ok" in r) scheduleKit(kitId, 300);
  }

  /** Saves the emails (gainers before losers) and kits now. True when nothing is left to save or failed. */
  const flush = useCallback(async (): Promise<boolean> => {
    for (let round = 0; round < 8; round++) {
      const ready = [...pending.current.keys()].filter((id) => !blocked(id) && !s.current.failed[id]);
      const kitReady = [...kitPending.current.keys()].filter((k) => !s.current.failed[`kit:${k}`]);
      const flying = [...inflight.current];
      if (!ready.length && !kitReady.length && !flying.length && !kitInflight.current.size) break;
      for (const id of ready) window.clearTimeout(pending.current.get(id)!.timer);
      for (const k of kitReady) window.clearTimeout(kitPending.current.get(k)!.timer);
      const waitFlying = flying.map((id) => new Promise<void>((res) => waiters.current.set(id, [...(waiters.current.get(id) ?? []), res])));
      await Promise.all([...ready.map((id) => runSave(id)), ...kitReady.map((k) => runKitSave(k)), ...waitFlying]);
      if (kitInflight.current.size) await new Promise((r) => window.setTimeout(r, 50));
    }
    return !pending.current.size && !kitPending.current.size && !Object.keys(s.current.failed).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Tries the failed saves again, in order. */
  const retry = useCallback(() => {
    const ids = Object.keys(s.current.failed);
    commit((x) => ({ ...x, failed: {} }));
    for (const id of ids) {
      if (id.startsWith("kit:")) scheduleKit(id.slice(4), 0);
      else if (pending.current.has(id)) schedule(id, 0);
    }
    // Emails that waited on a failed one run when it's done (wake).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changing --------------------------------------------------------------------------------------------------------
  /** Saves for a set of email changes: emails that gain blocks first, emails that lose blocks after them. */
  const scheduleOrdered = (changes: Record<string, { before: EmailDoc; after: EmailDoc }>) => {
    const ids = Object.keys(changes);
    const gainers = ids.filter((id) => blocks(changes[id]!.after) > blocks(changes[id]!.before));
    for (const id of ids) {
      schedule(id);
      const loses = blocks(changes[id]!.after) < blocks(changes[id]!.before);
      if (loses && gainers.length) for (const g of gainers) if (g !== id) pending.current.get(id)!.waitFor.add(g);
    }
  };

  /** One change: one undo step over every email and kit it touches. */
  const change = useCallback((c: Change, o: { merge?: string; label: string }) => {
    const emails: Record<string, { before: Snap; after: Snap }> = {};
    const kitsStep: Record<string, { before: DesignSystem; after: DesignSystem }> = {};
    const nextEmails = { ...s.current.emails };
    const nextKits = { ...s.current.kits };
    for (const [id, n] of Object.entries(c.emails ?? {})) {
      const st = emailNow(id);
      if (!st || st.readOnly || s.current.locked.includes(id)) continue;
      const after = { doc: n.doc ?? st.doc, subject: n.subject ?? st.subject };
      if (after.doc === st.doc && after.subject === st.subject) continue;
      emails[id] = { before: { doc: st.doc, subject: st.subject }, after };
      nextEmails[id] = { ...st, doc: after.doc, subject: after.subject };
    }
    for (const [kitId, sys] of Object.entries(c.kits ?? {})) {
      const k = kitNow(kitId);
      if (!k || k.system === sys) continue;
      kitsStep[kitId] = { before: k.system, after: sys };
      nextKits[kitId] = { ...k, system: sys };
    }
    if (!Object.keys(emails).length && !Object.keys(kitsStep).length) return;
    const now = Date.now();
    commit((x) => ({ ...x, emails: nextEmails, kits: nextKits, hist: push(x.hist, { key: o.merge, at: now, label: o.label, emails, kits: kitsStep }, now) }));
    scheduleOrdered(Object.fromEntries(Object.entries(emails).map(([id, e]) => [id, { before: e.before.doc, after: e.after.doc }])));
    for (const k of Object.keys(kitsStep)) scheduleKit(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (dir: "undo" | "redo"): HistoryResult => {
    const r = dir === "undo" ? undoStep(s.current.hist) : redoStep(s.current.hist);
    if (!r) return null;
    const nextEmails = { ...s.current.emails };
    const nextKits = { ...s.current.kits };
    const changes: Record<string, { before: EmailDoc; after: EmailDoc }> = {};
    const skipped: string[] = [];
    for (const [id, snap] of Object.entries(r.restore.emails)) {
      const st = emailNow(id);
      if (!st) continue;
      if (st.readOnly || s.current.locked.includes(id)) {
        skipped.push(st.name);
        continue;
      }
      changes[id] = { before: st.doc, after: snap.doc };
      nextEmails[id] = { ...st, doc: snap.doc, subject: snap.subject };
    }
    for (const [kitId, sys] of Object.entries(r.restore.kits)) {
      const k = kitNow(kitId);
      if (k) nextKits[kitId] = { ...k, system: sys };
    }
    commit((x) => ({ ...x, hist: r.h, emails: nextEmails, kits: nextKits }));
    if (skipped.length) note(`${skipped[0]} was sent, so it stayed as it is.`);
    scheduleOrdered(changes);
    for (const k of Object.keys(r.restore.kits)) scheduleKit(k);
    return { ids: Object.keys(changes), label: r.restore.label };
  };
  const undo = useCallback(() => step("undo"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const redo = useCallback(() => step("redo"), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rows and kits from elsewhere -------------------------------------------------------------------------------------
  useEffect(() => {
    commit((x) => {
      let emails = x.emails;
      for (const [id, e] of Object.entries(x.emails)) {
        const r = rows.find((y) => y.id === id);
        if (!r) continue;
        const idle = !pending.current.has(id) && !inflight.current.has(id) && e.doc === e.savedDoc && e.subject === e.savedSubject;
        if (r.status !== "draft" && !e.readOnly) emails = { ...emails, [id]: { ...e, readOnly: true } };
        else if (idle && !sameJson(rowDoc(r), e.savedDoc)) {
          emails = { ...emails };
          delete emails[id];
        } else if (r.name !== e.name) emails = { ...emails, [id]: { ...e, name: r.name } };
      }
      let kitsNext = x.kits;
      for (const [kitId, k] of Object.entries(x.kits)) {
        const kit = kits.find((y) => y.id === kitId);
        if (!kit) continue;
        const idle = !kitPending.current.has(kitId) && !kitInflight.current.has(kitId);
        if (idle && (kit.design_rev ?? 0) > k.rev) kitsNext = { ...kitsNext, [kitId]: { id: kitId, system: kitRead(kit).system, rev: kit.design_rev ?? 0, live: kitRead(kit).live } };
        else if (!sameJson(kitRead(kit).live, k.live)) kitsNext = { ...kitsNext, [kitId]: { ...k, live: kitRead(kit).live } };
      }
      return emails === x.emails && kitsNext === x.kits ? x : { ...x, emails, kits: kitsNext };
    });
  }, [rows, kits, commit]);

  // Leaving saves; so does hiding the page.
  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      void flush();
    };
  }, [flush]);

  const publishStyles = async (kitId: string | null) => {
    if (!kitId) return;
    await flush();
    if (s.current.failed[`kit:${kitId}`]) return;
    const { error } = await sb.rpc("brand_kit_design_publish", { p_id: kitId });
    if (error) return note(error.message);
    commit((x) => (x.kits[kitId] ? { ...x, kits: { ...x.kits, [kitId]: { ...x.kits[kitId]!, live: x.kits[kitId]!.system } } } : x));
  };

  // Reading, for rendering ------------------------------------------------------------------------------------------
  const emailOf = (id: string): EmailState | null => {
    const e = store.emails[id];
    if (e) return e;
    const r = rows.find((x) => x.id === id);
    return r ? fromRow(r) : null;
  };
  const kitOf = (kitId: string | null): { state: KitState | null; kit: Kit | null } => {
    const kit = kits.find((k) => k.id === kitId) ?? null;
    if (!kitId) return { state: null, kit };
    const k = store.kits[kitId];
    if (k) return { state: k, kit };
    if (!kit) return { state: null, kit };
    const v = kitRead(kit);
    return { state: { id: kitId, system: v.system, rev: kit.design_rev ?? 0, live: v.live }, kit };
  };
  const stylesChanged = (kitId?: string | null) => (kitId ? Object.values(store.kits).filter((k) => k.id === kitId) : Object.values(store.kits)).some((k) => !sameJson(k.system, k.live));
  const failedList = Object.entries(store.failed).map(([id, f]) => ({ id, ...f }));
  const canUndo = store.hist.past.length > 0;
  const canRedo = store.hist.future.length > 0;
  const fallbackSystem = readSystem({}, {});

  /** The B2 shape for one email (or none). */
  const draft = (id: string | null): EmailDraft => {
    const e = id ? emailOf(id) : null;
    const kitId = e ? kitIdOf(e.doc, kits) : null;
    const { state, kit } = kitOf(kitId);
    const fail = id ? store.failed[id] : undefined;
    return {
      id: e ? id : null,
      doc: e?.doc ?? null,
      subject: e?.subject ?? "",
      system: state?.system ?? fallbackSystem,
      kit,
      tokens: tokensOf(kitId, kits),
      readOnly: (e?.readOnly ?? true) || (!!id && store.locked.includes(id)),
      locked: !!id && store.locked.includes(id),
      apply: (next, merge, label = "Change") => {
        if (!id) return;
        const cur = emailNow(id);
        const kNow = cur ? kitIdOf(cur.doc, kitsRef.current) : null;
        change(
          {
            emails: next.doc || next.subject !== undefined ? { [id]: { ...(next.doc ? { doc: next.doc } : {}), ...(next.subject !== undefined ? { subject: next.subject } : {}) } } : {},
            kits: next.system && kNow ? { [kNow]: next.system } : {},
          },
          { merge, label },
        );
      },
      latest: () => (id ? (emailNow(id)?.doc ?? null) : null),
      undo: () => void undo(),
      redo: () => void redo(),
      canUndo,
      canRedo,
      saving: busy,
      error: fail?.message ?? store.failed[`kit:${kitId}`]?.message ?? "",
      flush,
      stylesChanged: stylesChanged(kitId),
      publishStyles: () => publishStyles(kitId),
    };
  };

  return {
    /** An email's document as shown now (rendering). */
    docOf: (id: string) => emailOf(id)?.doc ?? null,
    /** An email's document right now, with changes since the last render (handlers). */
    latest: (id: string) => emailNow(id)?.doc ?? null,
    /** The kit an email uses, and its system as edited now (rendering). */
    kitFor: (doc: EmailDoc) => kitOf(kitIdOf(doc, kits)),
    /** The same, right now (handlers). */
    kitNow: (doc: EmailDoc) => {
      const kitId = kitIdOf(doc, kitsRef.current);
      return { kitId, system: kitId ? (kitNow(kitId)?.system ?? fallbackSystem) : fallbackSystem, tokens: tokensOf(kitId, kitsRef.current) };
    },
    readOnly: (id: string) => (emailNow(id)?.readOnly ?? true) || s.current.locked.includes(id),
    /** Emails Tia is changing can't be edited meanwhile (docs/email-canvas-b5.md section 2.4). */
    lock: (ids: string[], on: boolean) => commit((x) => ({ ...x, locked: on ? [...new Set([...x.locked, ...ids])] : x.locked.filter((y) => !ids.includes(y)) })),
    locked: store.locked,
    nameOf: (id: string) => emailNow(id)?.name ?? "",
    change,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel: store.hist.past[store.hist.past.length - 1]?.label ?? "",
    redoLabel: store.hist.future[0]?.label ?? "",
    draft,
    flush,
    retry,
    saving: busy,
    failed: failedList,
    stylesChanged,
    publishAll: async () => {
      for (const k of Object.values(s.current.kits)) if (!sameJson(k.system, k.live)) await publishStyles(k.id);
    },
  };
}

export type CanvasEditor = ReturnType<typeof useCanvasEditor>;
