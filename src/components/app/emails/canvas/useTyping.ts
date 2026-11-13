"use client";

// Typing in place (docs/email-canvas-b3.md): turns on `contenteditable` for one block's part inside its email's
// frame, with the words as written (merge tags as {{first_name}}); listens to keys, input, paste, selection, clicks
// and the wheel inside the frame; writes back 300 ms after each pause and when typing ends. The page holds the frame's
// HTML while typing (a rebuild would lose the caret) and rebuilds it once typing ends.

import { useCallback, useEffect, useRef, useState } from "react";
import { addBlock, findEl, updateBlock } from "@/lib/design/email/ops";
import { newBlock, type Block, type EmailDoc } from "@/lib/design/email/doc";
import { escapeText, safeHref } from "@/lib/design/email/html";
import { cleanTyped, looksLikeMarkdown, markdownPaste, plainToRich, typeMode, typedPatch, typePart, typeSource, typable, type TypeMode } from "@/lib/design/email/typing";
import { askText, tell } from "../../Dialogs";

export type Typing = { email: string; id: string; html: string; mode: TypeMode };
export type Marks = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; link: boolean };
const NO_MARKS: Marks = { bold: false, italic: false, underline: false, strike: false, link: false };

type Opts = {
  frames: React.RefObject<Map<string, HTMLIFrameElement>>;
  /** The latest document of the email being edited, and how to change it (one undo step per typing run). */
  doc: () => EmailDoc | null;
  apply: (doc: EmailDoc, merge: string) => void;
  zoom: () => number;
  /** A click inside the frame on another part ends typing and picks that part. */
  onPick: (id: string | null) => void;
};

export function useTyping({ frames, doc, apply, zoom, onPick }: Opts) {
  const [typing, setTyping] = useState<Typing | null>(null);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [tick, setTick] = useState(0);
  const cur = useRef<{ t: Typing; el: HTMLElement; d: Document; f: HTMLIFrameElement; off: AbortController; run: string; timer: number; range: Range | null; plain: boolean } | null>(null);
  const opts = useRef({ doc, apply, zoom, onPick });
  useEffect(() => {
    opts.current = { doc, apply, zoom, onPick };
  });

  const commit = useCallback(() => {
    const c = cur.current;
    if (!c) return;
    window.clearTimeout(c.timer);
    const d = opts.current.doc();
    const b = d ? findEl(d, c.t.id)?.block : undefined;
    if (!d || !b || !typable(b)) return;
    const items = [...c.el.querySelectorAll("li")].map((li) => li.innerText);
    const patch = typedPatch(b, { html: c.el.innerHTML, text: c.el.innerText, items: c.t.mode === "items" ? items : undefined });
    if (Object.entries(patch).every(([k, v]) => JSON.stringify((b as Record<string, unknown>)[k]) === JSON.stringify(v))) return;
    opts.current.apply(updateBlock(d, c.t.id, patch), c.run);
  }, []);

  const end = useCallback(() => {
    const c = cur.current;
    if (!c) return;
    commit();
    c.off.abort();
    c.el.removeAttribute("contenteditable");
    c.d.getSelection()?.removeAllRanges();
    // The canvas takes the keys again (⌘Z, arrows).
    c.f.closest<HTMLElement>("[role='application']")?.focus({ preventScroll: true });
    cur.current = null;
    setTyping(null);
    setMarks(NO_MARKS);
  }, [commit]);

  // The selection inside the block, put back before a command from the bar.
  const restore = () => {
    const c = cur.current;
    if (!c) return null;
    const sel = c.d.getSelection();
    // A live selection in the block (keys typed in the email) stays; one lost to the bar or a dialog comes back.
    if (sel?.rangeCount && c.el.contains(sel.anchorNode)) return c;
    c.f.contentWindow?.focus();
    c.el.focus({ preventScroll: true });
    if (c.range && sel) {
      sel.removeAllRanges();
      sel.addRange(c.range);
    }
    return c;
  };
  const changed = () => {
    const c = cur.current;
    if (!c) return;
    window.clearTimeout(c.timer);
    c.timer = window.setTimeout(commit, 300);
    setTick((t) => t + 1);
  };
  const readMarks = () => {
    const c = cur.current;
    if (!c) return;
    const sel = c.d.getSelection();
    if (sel?.rangeCount && c.el.contains(sel.anchorNode)) c.range = sel.getRangeAt(0).cloneRange();
    const q = (cmd: string) => {
      try {
        return c.d.queryCommandState(cmd);
      } catch {
        return false;
      }
    };
    const a = sel?.anchorNode ? (sel.anchorNode.nodeType === 1 ? (sel.anchorNode as Element) : sel.anchorNode.parentElement)?.closest("a") : null;
    const next = { bold: q("bold"), italic: q("italic"), underline: q("underline"), strike: q("strikeThrough"), link: !!a && c.el.contains(a) };
    setMarks((m) => (m.bold === next.bold && m.italic === next.italic && m.underline === next.underline && m.strike === next.strike && m.link === next.link ? m : next));
  };

  /** Runs a format command (bold, italic, underline, strikeThrough, removeFormat) on the selection. */
  const exec = useCallback((cmd: "bold" | "italic" | "underline" | "strikeThrough" | "removeFormat") => {
    const c = restore();
    if (!c || c.t.mode !== "rich") return;
    c.d.execCommand(cmd, false);
    if (cmd === "removeFormat") c.d.execCommand("unlink", false);
    readMarks();
    changed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Puts text at the caret: a merge tag from the bar's menu. */
  const insert = useCallback((text: string) => {
    const c = restore();
    if (!c) return;
    c.d.execCommand("insertText", false, text);
    readMarks();
    changed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Asks for a link's address and puts it on the selection (or the words typed); empty removes it. */
  const link = useCallback(async () => {
    const c = cur.current;
    if (!c || c.t.mode !== "rich") return;
    const range = c.range?.cloneRange() ?? null;
    const node = range?.startContainer;
    const a = node ? (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest("a") : null;
    const was = a && c.el.contains(a) ? (a.getAttribute("href") ?? "") : "";
    const v = await askText(was ? "Change the link" : "Add a link", { initial: was, placeholder: "https://", ok: "Save" });
    if (v === null || !cur.current) return void restore();
    c.range = range;
    const k = restore();
    if (!k) return;
    if (!v.trim()) {
      if (a) {
        const sel = k.d.getSelection();
        const r = k.d.createRange();
        r.selectNodeContents(a);
        sel?.removeAllRanges();
        sel?.addRange(r);
        k.d.execCommand("unlink", false);
      }
      return changed();
    }
    const href = safeHref(v.trim());
    if (!href) return void tell("That link can't be used", "Use an address that starts with https://, mailto: or tel:.");
    if (a) a.setAttribute("href", href);
    else if (!range || range.collapsed) k.d.execCommand("insertHTML", false, `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">${escapeText(v.trim())}</a>`);
    else k.d.execCommand("createLink", false, href);
    readMarks();
    changed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Starts typing in a block of an email, with the caret at a page point (a double-click) or at the end. False when
   * the block doesn't type or its frame isn't there.
   */
  const start = useCallback(
    (email: string, id: string, html: string, at?: { x: number; y: number }): boolean => {
      if (cur.current) end();
      const d0 = opts.current.doc();
      const b = d0 ? findEl(d0, id)?.block : undefined;
      const f = frames.current?.get(email);
      const d = f?.contentDocument;
      if (!b || !typable(b) || !f || !d) return false;
      const el = d.querySelector<HTMLElement>(`.c${id}-${typePart(b)}`);
      if (!el) return false;
      const mode = typeMode(b)!;
      el.innerHTML = typeSource(b);
      el.setAttribute("contenteditable", "true");
      el.style.outline = "none";
      el.style.cursor = "text";
      d.execCommand("defaultParagraphSeparator", false, "p");
      d.execCommand("styleWithCSS", false, "false");
      const off = new AbortController();
      const t: Typing = { email, id, html, mode };
      cur.current = { t, el, d, f, off, run: `~type:${id}:${Date.now()}`, timer: 0, range: null, plain: false };
      const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void, capture = false) => d.addEventListener(type, fn as EventListener, { signal: off.signal, capture, passive: false });
      on("input", changed);
      on("selectionchange", readMarks);
      on("keydown", (e) => {
        const mod = e.metaKey || e.ctrlKey;
        const k = e.key.toLowerCase();
        if (e.key === "Escape") return (e.preventDefault(), end());
        if (e.key === "Enter" && mode === "line") return (e.preventDefault(), end());
        if (e.key === "Enter" && mode === "lines") return (e.preventDefault(), d.execCommand("insertLineBreak", false), changed());
        if (e.key === "Tab") return e.preventDefault();
        if (mod && e.shiftKey && k === "v") return void (cur.current && (cur.current.plain = true));
        if (mod && e.shiftKey && k === "x") return (e.preventDefault(), exec("strikeThrough"));
        if (mod && k === "k") return (e.preventDefault(), void link());
        if (mod && (k === "b" || k === "i" || k === "u")) {
          e.preventDefault();
          if (mode === "rich") exec(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
        }
      });
      on("paste", (e) => {
        e.preventDefault();
        const c = cur.current;
        if (!c) return;
        const plain = c.plain;
        c.plain = false;
        const text = e.clipboardData?.getData("text/plain") ?? "";
        const rich = e.clipboardData?.getData("text/html") ?? "";
        if (mode === "line" || mode === "items") return (d.execCommand("insertText", false, text.replace(/\s+/g, " ").trim()), changed());
        if (mode === "lines" || plain) return (d.execCommand("insertText", false, text), changed());
        if (rich) return (d.execCommand("insertHTML", false, cleanTyped(rich)), changed());
        if (looksLikeMarkdown(text)) {
          const m = markdownPaste(text);
          if ("inline" in m) return (d.execCommand("insertHTML", false, m.inline), changed());
          // Headings and lists become blocks right after this one; typing ends on the last new block.
          commit();
          let next = opts.current.doc();
          const f2 = next ? findEl(next, id) : null;
          if (!next || !f2?.column) return;
          let at = f2.bi! + 1;
          let last: string | null = null;
          for (const p of m.blocks) {
            const nb = { ...newBlock(p.type), ...p } as Block;
            next = addBlock(next, nb, { column: f2.column.id, index: at++ });
            last = nb.id;
          }
          opts.current.apply(next, cur.current!.run);
          end();
          if (last) opts.current.onPick(last);
          return;
        }
        d.execCommand(text.includes("\n") ? "insertHTML" : "insertText", false, text.includes("\n") ? plainToRich(text) : text);
        changed();
      });
      // A click outside the block ends typing; on another part it picks that part. Links never open.
      on(
        "mousedown",
        (e) => {
          const target = e.target as Element | null;
          if (target && el.contains(target)) return;
          end();
          const pid = target?.closest?.("[data-eid]")?.getAttribute("data-eid") ?? null;
          opts.current.onPick(pid && pid !== "email" && opts.current.doc() && findEl(opts.current.doc()!, pid) ? pid : null);
        },
        true,
      );
      on("click", (e) => (e.target as Element | null)?.closest?.("a") && e.preventDefault(), true);
      on("submit", (e) => e.preventDefault(), true);
      // The wheel keeps panning and zooming the canvas over the email.
      on("wheel", (e) => {
        e.preventDefault();
        const r = f.getBoundingClientRect();
        const z = opts.current.zoom();
        f.dispatchEvent(new WheelEvent("wheel", { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, clientX: r.left + e.clientX * z, clientY: r.top + e.clientY * z, bubbles: true, cancelable: true }));
      });
      // Focus and the caret: where the double-click landed, or at the end.
      f.contentWindow?.focus();
      el.focus({ preventScroll: true });
      const sel = d.getSelection();
      let range: Range | null = null;
      if (at) {
        const r = f.getBoundingClientRect();
        const z = opts.current.zoom();
        const hit = (d as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }).caretRangeFromPoint?.((at.x - r.left) / z, (at.y - r.top) / z) ?? null;
        if (hit && el.contains(hit.startContainer)) range = hit;
      }
      if (!range) {
        range = d.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      sel?.removeAllRanges();
      sel?.addRange(range);
      cur.current.range = range.cloneRange();
      setTyping(t);
      readMarks();
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [end, commit, exec, link, frames],
  );

  // Leaving the page ends typing (and saves it).
  useEffect(() => () => cur.current?.off.abort(), []);

  return { typing, marks, tick, start, end, exec, insert, link };
}
