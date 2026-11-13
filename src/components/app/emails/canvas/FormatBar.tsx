"use client";

// The format bar above a block being typed in (docs/email-canvas-b3.md section 3): Bold, Italic, Underline, Strike,
// Link, Merge value and Clear for text; Merge value alone for headings, buttons, lists and quotes. Its buttons never
// take focus, so the caret stays in the email.

import { useState } from "react";
import type { TypeMode } from "@/lib/design/email/typing";
import { Link, User } from "../../../Icons";
import { Popover } from "../../FilterBar";
import type { Marks } from "./useTyping";

const MERGE: { tag: string; label: string }[] = [
  { tag: "first_name", label: "First name" },
  { tag: "last_name", label: "Last name" },
  { tag: "company", label: "Company" },
  { tag: "title", label: "Job title" },
];
const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();

export function FormatBar({
  box,
  below,
  mode,
  marks,
  onExec,
  onLink,
  onInsert,
  fields = MERGE,
}: {
  box: { left: number; top: number; width: number; height: number };
  below: boolean;
  mode: TypeMode;
  marks: Marks;
  onExec: (cmd: "bold" | "italic" | "underline" | "strikeThrough" | "removeFormat") => void;
  onLink: () => void;
  onInsert: (text: string) => void;
  /** The merge values Insert offers: a contact's, or a System email's meeting fields. */
  fields?: { tag: string; label: string }[];
}) {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const btn = (label: string, keys: string, on: boolean, run: () => void, face: React.ReactNode) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={keys ? `${label} (${keys})` : label}
      onMouseDown={keep}
      onClick={run}
      className={`flex size-7 items-center justify-center rounded-full text-[13px] transition-colors duration-[140ms] ${on ? "bg-signal-pale text-signal-text" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      {face}
    </button>
  );
  const rich = mode === "rich";
  return (
    <div
      data-canvas-ui=""
      data-typing-keep=""
      role="toolbar"
      aria-label="Text format"
      className="anim-rise-sm pointer-events-auto absolute flex items-center gap-0.5 rounded-full bg-card p-0.5 shadow-float"
      style={{ left: box.left, top: below ? box.top + box.height + 6 : box.top - 36 }}
    >
      {rich ? (
        <>
          {btn("Bold", "⌘B", marks.bold, () => onExec("bold"), <b>B</b>)}
          {btn("Italic", "⌘I", marks.italic, () => onExec("italic"), <i>I</i>)}
          {btn("Underline", "⌘U", marks.underline, () => onExec("underline"), <u>U</u>)}
          {btn("Strikethrough", "⇧⌘X", marks.strike, () => onExec("strikeThrough"), <s>S</s>)}
          {btn(marks.link ? "Change the link" : "Link", "⌘K", marks.link, onLink, <Link size={13} />)}
          <span className="mx-0.5 h-4 w-px bg-line" />
        </>
      ) : null}
      <button type="button" aria-label="Merge value" title="Merge value" aria-haspopup="menu" onMouseDown={keep} onClick={(e) => setOpen(open ? null : e.currentTarget)} className="flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-body hover:bg-hover hover:text-ink">
        <User size={13} />
        Merge value
      </button>
      {rich ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-line" />
          {btn("Clear formatting", "", false, () => onExec("removeFormat"), (
            <span className="text-[12px]">
              T<sub className="text-[9px]">x</sub>
            </span>
          ))}
        </>
      ) : null}
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} width={180}>
          <div role="menu" data-typing-keep="" data-canvas-ui="" className="flex flex-col p-1">
            {fields.map((m) => (
              <button
                key={m.tag}
                type="button"
                role="menuitem"
                onMouseDown={keep}
                onClick={() => {
                  setOpen(null);
                  onInsert(`{{${m.tag}}}`);
                }}
                className="flex min-h-8 items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover"
              >
                {m.label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
