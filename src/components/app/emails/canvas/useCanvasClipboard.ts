"use client";

// Copy, cut and paste on the canvas (docs/email-canvas-b4.md section 8). The browser's own copy, cut and paste events
// carry the clip three ways (our JSON type, a marker inside HTML, plain words), so it survives between canvases, tabs
// and browsers; the last copy is also kept in memory for menus and browsers that keep none. A paste is read through
// the email checks (clip.ts) and lands where pastePlace says; words from other apps become blocks by B3's rules.

import { useCallback, useEffect, useRef, useState } from "react";
import { CLIP_TYPE, clipFromClipboard, clipToClipboard, makeClip, pastePlace, putClip, type Clip } from "@/lib/design/email/clip";
import { newBlock, type Block, type EmailDoc } from "@/lib/design/email/doc";
import { addBlock, findEl, removeEl, type Place } from "@/lib/design/email/ops";
import { cleanTyped, looksLikeMarkdown, markdownBlocks, plainToRich } from "@/lib/design/email/typing";
import type { CanvasEditor } from "./useCanvasEditor";

type Env = {
  editor: CanvasEditor;
  ws: string;
  /** Whether the canvas takes the keys now: no text box, dialog, typing, drag or resize. */
  active: () => boolean;
  /** The picked element (or the whole email, id null), if any. */
  picked: () => { email: string; id: string | null } | null;
  /** The email a paste goes into when nothing is picked. */
  fallback: () => string | null;
  labelOf: (email: string, id: string) => string;
  onDone: (email: string, id: string, said: string) => void;
  onCut: (said: string) => void;
  say: (text: string) => void;
};

export function useCanvasClipboard(env: Env) {
  const e = useRef(env);
  useEffect(() => {
    e.current = env;
  });
  const memory = useRef<{ clip: Clip; text: string } | null>(null);
  const [hasClip, setHasClip] = useState(false);

  /** Copies the picked element; `dt` is the copy event's clipboard (menus write what browsers allow). */
  type Target = { email: string; id: string | null } | null;
  const copy = useCallback((dt: DataTransfer | null, target?: Target): string | null => {
    const { editor: ed, ws } = e.current;
    const p = target ?? e.current.picked();
    if (!p?.id) return null;
    const doc = ed.latest(p.email);
    const clip = doc ? makeClip(doc, p.id, { kit: ed.kitNow(doc).kitId, ws, from: p.email }) : null;
    if (!clip) return null;
    const out = clipToClipboard(clip);
    if (dt) {
      dt.setData(CLIP_TYPE, out.json);
      dt.setData("text/html", out.html);
      dt.setData("text/plain", out.text);
    } else {
      try {
        void navigator.clipboard
          ?.write?.([new ClipboardItem({ "text/html": new Blob([out.html], { type: "text/html" }), "text/plain": new Blob([out.text || " "], { type: "text/plain" }) })])
          .catch(() => undefined);
      } catch {
        /* the memory copy still works */
      }
    }
    memory.current = { clip, text: out.text };
    setHasClip(true);
    return e.current.labelOf(p.email, p.id);
  }, []);

  /** Copies and removes the picked element, as one step. */
  const cut = useCallback((dt: DataTransfer | null, target?: Target) => {
    const p = target ?? e.current.picked();
    if (!p?.id || e.current.editor.readOnly(p.email)) return;
    const label = copy(dt, p);
    const doc = e.current.editor.latest(p.email);
    if (!label || !doc) return;
    const next = removeEl(doc, p.id);
    if (next === doc) return;
    e.current.editor.change({ emails: { [p.email]: { doc: next } } }, { label: `Cut ${label}` });
    e.current.onCut(`Cut ${label}`);
  }, [copy]);

  /** Where a paste goes: the picked email (and element), or the one in view. */
  const where = (target?: Target) => {
    const p = target ?? e.current.picked();
    const email = p?.email ?? e.current.fallback();
    return email ? { email, id: p?.email === email ? p.id : null } : null;
  };

  /** Puts a clip into the email being edited. */
  const pasteClip = useCallback((clip: Clip, target?: Target) => {
    const { editor: ed } = e.current;
    const w = where(target);
    if (!w) return;
    if (ed.readOnly(w.email)) return e.current.say("Sent emails can't change. Duplicate to edit.");
    const doc = ed.latest(w.email);
    if (!doc) return;
    const k = ed.kitNow(doc);
    const r = putClip(doc, clip, pastePlace(doc, w.id, clip.kind), { sameKit: !!clip.kit && clip.kit === k.kitId, system: k.system, tokens: k.tokens });
    if ("error" in r) return e.current.say(r.error === "full" ? "This email is full." : "Nothing to paste.");
    ed.change({ emails: { [w.email]: { doc: r.doc } } }, { label: "Paste" });
    e.current.onDone(w.email, r.id, `${e.current.labelOf(w.email, r.id)} pasted`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Words from another app: Markdown headings and lists as blocks, rich text kept, plain words as one Text block. */
  const pasteWords = (text: string, html: string) => {
    const { editor: ed } = e.current;
    const w = where();
    if (!w) return;
    if (ed.readOnly(w.email)) return e.current.say("Sent emails can't change. Duplicate to edit.");
    let doc = ed.latest(w.email);
    if (!doc) return;
    const parts: Record<string, unknown>[] = !html && looksLikeMarkdown(text) ? markdownBlocks(text) : [{ type: "text", html: html ? cleanTyped(html) : plainToRich(text) }];
    const made = parts.filter((p) => p.type !== "text" || (p.html as string)).map((p) => ({ ...newBlock(p.type as Block["type"]), ...p }) as Block);
    if (!made.length) return;
    let at: Place = pastePlace(doc, w.id, "block");
    let last = "";
    const start = doc;
    for (const b of made) {
      const next: EmailDoc = addBlock(doc, b, at);
      if (next === doc) break;
      doc = next;
      last = b.id;
      // The next one goes right after (a new section's block: into that section).
      const f = findEl(doc, b.id)!;
      at = { column: f.column!.id, index: f.bi! + 1 };
    }
    if (doc === start) return e.current.say("This email is full.");
    ed.change({ emails: { [w.email]: { doc } } }, { label: "Paste" });
    e.current.onDone(w.email, last, made.length > 1 ? `${made.length} blocks pasted` : "Pasted");
  };

  useEffect(() => {
    const onCopy = (ev: ClipboardEvent) => {
      if (!e.current.active() || !ev.clipboardData) return;
      if (copy(ev.clipboardData)) ev.preventDefault();
    };
    const onCut = (ev: ClipboardEvent) => {
      if (!e.current.active() || !ev.clipboardData || !e.current.picked()?.id) return;
      ev.preventDefault();
      cut(ev.clipboardData);
    };
    const onPaste = (ev: ClipboardEvent) => {
      if (!e.current.active()) return;
      const dt = ev.clipboardData;
      const json = dt?.getData(CLIP_TYPE) ?? "";
      const html = dt?.getData("text/html") ?? "";
      const text = dt?.getData("text/plain") ?? "";
      const clip = clipFromClipboard({ json, html }) ?? (memory.current && memory.current.text === text ? memory.current.clip : null);
      if (clip) {
        ev.preventDefault();
        return pasteClip(clip);
      }
      if (!text.trim() && !html.trim()) return;
      ev.preventDefault();
      pasteWords(text, html);
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copy, cut, pasteClip]);

  return {
    hasClip,
    /** Menu Copy: the memory copy, and what the browser allows on the system clipboard. */
    copy: (target?: Target) => copy(null, target),
    cut: (target?: Target) => cut(null, target),
    /** Menu Paste: the memory copy (browsers let only a paste event read the clipboard). */
    paste: (target?: Target) => memory.current && pasteClip(memory.current.clip, target),
  };
}
