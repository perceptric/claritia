"use client";

// Booking page › Welcome line: rich text with bold, italic, underline, strike, links and lists. What it writes is
// cleaned on every change (src/lib/meetings/welcome.ts), again on save and again when the guest page draws it.

import { useEffect, useRef, useState } from "react";
import { cleanWelcome } from "@/lib/meetings/welcome";
import { Link as LinkIcon, ListIcon } from "../../Icons";
import { askText } from "../Dialogs";

type Cmd = "bold" | "italic" | "underline" | "strikeThrough" | "insertUnorderedList" | "insertOrderedList";

const TOOLS: { cmd: Cmd; label: string; face: React.ReactNode }[] = [
  { cmd: "bold", label: "Bold", face: <span className="font-bold">B</span> },
  { cmd: "italic", label: "Italic", face: <span className="font-serif italic">I</span> },
  { cmd: "underline", label: "Underline", face: <span className="underline underline-offset-2">U</span> },
  { cmd: "strikeThrough", label: "Strikethrough", face: <span className="line-through">S</span> },
  { cmd: "insertUnorderedList", label: "Bulleted list", face: <ListIcon size={14} /> },
  { cmd: "insertOrderedList", label: "Numbered list", face: <span className="text-[11.5px] font-semibold tabular-nums">1.</span> },
];

export function WelcomeEditor({ value, disabled, placeholder, onChange }: { value: string; disabled?: boolean; placeholder?: string; onChange: (html: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  const [on, setOn] = useState<Partial<Record<Cmd, boolean>>>({});
  const [blank, setBlank] = useState(!value);

  // Put the value in only when it changed from outside, so typing keeps its place.
  useEffect(() => {
    if (box.current && value !== last.current) {
      box.current.innerHTML = value;
      last.current = value;
      setBlank(!value);
    }
  }, [value]);

  // Which styles the cursor sits in, for the toolbar's picked state.
  useEffect(() => {
    const read = () => {
      const sel = document.getSelection();
      if (!box.current || !sel?.anchorNode || !box.current.contains(sel.anchorNode)) return;
      const next: Partial<Record<Cmd, boolean>> = {};
      for (const t of TOOLS) next[t.cmd] = document.queryCommandState(t.cmd);
      setOn(next);
    };
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, []);

  const read = () => {
    if (!box.current) return;
    const html = cleanWelcome(box.current.innerHTML);
    last.current = html;
    setBlank(!html);
    onChange(html);
  };
  const run = (cmd: string, arg?: string) => {
    box.current?.focus();
    document.execCommand(cmd, false, arg);
    read();
  };
  const addLink = async () => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount && box.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    const raw = (await askText("Link to", { placeholder: "https://", ok: "Add link" }))?.trim();
    if (!raw) return;
    const url = /^(https?:|mailto:|tel:)/i.test(raw) ? raw : raw.includes("@") && !raw.includes("/") ? `mailto:${raw}` : `https://${raw}`;
    box.current?.focus();
    if (range && sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (range && !range.collapsed) run("createLink", url);
    else run("insertHTML", `<a href="${url.replace(/"/g, "%22")}">${raw.replace(/[<>&"]/g, "")}</a>&nbsp;`);
  };

  const btn = (picked: boolean) =>
    `press inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[13px] transition-colors duration-[140ms] disabled:opacity-45 ${picked ? "bg-signal-soft text-signal-text" : "text-muted hover:bg-hover hover:text-ink"}`;

  return (
    <div className={`flex flex-col overflow-hidden rounded-md bg-card shadow-input ${disabled ? "opacity-60" : ""}`}>
      <div role="toolbar" aria-label="Text style" className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        {TOOLS.map((t) => (
          <button key={t.cmd} type="button" disabled={disabled} aria-label={t.label} title={t.label} aria-pressed={!!on[t.cmd]} className={btn(!!on[t.cmd])} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t.cmd)}>
            {t.face}
          </button>
        ))}
        <button type="button" disabled={disabled} aria-label="Link" title="Link" className={btn(false)} onMouseDown={(e) => e.preventDefault()} onClick={() => void addLink()}>
          <LinkIcon size={14} />
        </button>
      </div>
      <div className="relative">
        {blank && placeholder ? <span className="pointer-events-none absolute top-2 left-3 text-[13px] text-faint">{placeholder}</span> : null}
        <div
          ref={box}
          role="textbox"
          aria-multiline="true"
          aria-label="Welcome line"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={read}
          onBlur={read}
          onPaste={(e) => {
            // Pasted text comes in plain, so another page's colors and fonts don't follow it.
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
          className="max-h-60 min-h-[84px] overflow-y-auto px-3 py-2 text-[13px] leading-relaxed text-ink outline-none [overflow-wrap:anywhere] [&_a]:text-signal-text [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}
