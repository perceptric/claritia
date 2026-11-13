"use client";

// The email itself in an email step's panel (docs/workflows.md, "Emails in an automation"): the email as it will
// look, in its brand, with every footer added for you. A click on its words types in place, with the same typing the
// Emails canvas uses (src/components/app/emails/canvas/useTyping.ts): bold, italic, links and merge values. The rest
// of the design (blocks, colors, pictures) is on the canvas, through Open full editor. It's one email either way.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findEl } from "@/lib/design/email/ops";
import { typable, type TypeMode } from "@/lib/design/email/typing";
import type { EmailDoc } from "@/lib/design/email/doc";
import { MERGE_KEYS } from "@/lib/workflows/merge";
import { withFooter } from "@/lib/workflows/stepEmails";
import { buildDoc, type CanvasKit } from "../emails/canvas/preview";
import { useTyping } from "../emails/canvas/useTyping";
import { Link, User } from "../../Icons";
import { Popover } from "../FilterBar";

const WIDTH = 600;
const LABEL: Record<string, string> = { first_name: "First name", last_name: "Last name", company: "Company", title: "Job title", meeting_time: "Meeting time", meeting_link: "Meeting link", reschedule_link: "Reschedule link" };
/** Merge tags as a reader sees them while not typing: the fallback. */
const fallbacks = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "" : k === "unsubscribe_url" ? "#" : (f ?? "")));

export function EmailInPanel({
  doc,
  kits,
  onChange,
  readOnly,
  fill = fallbacks,
  fields,
  footer = true,
}: {
  doc: EmailDoc;
  kits: CanvasKit[];
  onChange: (doc: EmailDoc) => void;
  readOnly: boolean;
  /** How merge fields show while not typing: their fallback, or a meeting email's sample values. */
  fill?: (html: string) => string;
  /** The merge values Insert data offers; a contact's when left out. */
  fields?: { tag: string; label: string }[];
  /** Show the Footer block added for you (an automation email); a meeting's own email has none. */
  footer?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [w, setW] = useState(360);
  const [h, setH] = useState(600);
  const latest = useRef(doc);
  useEffect(() => {
    latest.current = doc;
  });
  const zoom = w / WIDTH;
  const typer = useTyping({
    frames,
    doc: () => latest.current,
    apply: (d) => {
      latest.current = d;
      onChange(d);
    },
    zoom: () => zoom,
    onPick: () => undefined,
  });
  const built = useMemo(() => {
    try {
      return fill(buildDoc(footer ? withFooter(doc) : doc, kits, { marks: true }));
    } catch {
      return "";
    }
  }, [doc, kits, fill, footer]);
  // While typing the frame keeps its HTML, so the caret stays; it's built again once typing ends.
  const [held, setHeld] = useState<string | null>(null);
  const typing = typer.typing;
  const html = typing && held ? held : built;
  const builtRef = useRef(built);
  useEffect(() => {
    builtRef.current = built;
  });
  // A click anywhere else on the page ends typing (and saves it).
  const end = typer.end;
  useEffect(() => {
    if (!typing) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest?.("[data-email-in-panel], [data-typing-keep]")) return;
      end();
    };
    window.addEventListener("mousedown", down, true);
    return () => window.removeEventListener("mousedown", down, true);
  }, [typing, end]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const start = typer.start;
  const onLoad = useCallback(
    (f: HTMLIFrameElement) => {
      const d = f.contentDocument;
      if (!d) return;
      // The email's own height (the page around it would fill the frame, however tall).
      const bottom = Math.max(0, ...[...d.body.children].map((el) => el.getBoundingClientRect().bottom));
      setH(Math.max(160, Math.ceil(bottom)));
      if (readOnly) return;
      d.addEventListener("mousedown", (e) => {
        const id = (e.target as Element | null)?.closest?.("[data-eid]")?.getAttribute("data-eid");
        const b = id ? findEl(latest.current, id)?.block : undefined;
        if (!id || !b || !typable(b)) return;
        e.preventDefault();
        // The frame keeps the HTML it shows now, so nothing reloads under the caret.
        setHeld(builtRef.current);
        const r = f.getBoundingClientRect();
        start("panel", id, builtRef.current, { x: r.left + e.clientX * (r.width / WIDTH), y: r.top + e.clientY * (r.width / WIDTH) });
      });
      // Parts that type show it under the pointer.
      const style = d.createElement("style");
      style.textContent = "[data-eid]{cursor:default}[contenteditable='true']{outline:2px solid #0c8c5e!important;outline-offset:2px;border-radius:2px}";
      d.head.appendChild(style);
      for (const el of d.querySelectorAll<HTMLElement>("[data-eid]")) {
        const b = findEl(latest.current, el.getAttribute("data-eid")!)?.block;
        if (b && typable(b)) el.style.cursor = "text";
      }
    },
    [readOnly, start],
  );

  return (
    <div className="flex flex-col gap-2">
      {typing ? <Bar mode={typing.mode} marks={typer.marks} onExec={typer.exec} onLink={() => void typer.link()} onInsert={typer.insert} fields={fields} /> : null}
      <div ref={box} data-email-in-panel="" className="relative overflow-hidden rounded-[10px] bg-paper-deep shadow-rest" style={{ height: h * zoom }}>
        {html ? (
          <iframe
            ref={(f) => {
              if (f) frames.current.set("panel", f);
              else frames.current.delete("panel");
            }}
            title="The email"
            srcDoc={html}
            onLoad={(e) => onLoad(e.currentTarget)}
            className="absolute top-0 left-0 origin-top-left border-0 bg-white"
            style={{ width: WIDTH, height: h, transform: `scale(${zoom})` }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Bold, italic, link and merge values while typing (the canvas's format bar, in a row). */
function Bar({ mode, marks, onExec, onLink, onInsert, fields }: { mode: TypeMode; marks: { bold: boolean; italic: boolean; link: boolean }; onExec: (c: "bold" | "italic") => void; onLink: () => void; onInsert: (t: string) => void; fields?: { tag: string; label: string }[] }) {
  const [open, setOpen] = useState<HTMLElement | null>(null);
  const keep = (e: React.MouseEvent) => e.preventDefault();
  const btn = "flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[13px] text-muted hover:bg-hover hover:text-ink aria-pressed:bg-hover aria-pressed:text-ink";
  return (
    <div role="toolbar" aria-label="Format" data-typing-keep="" className="flex flex-wrap items-center gap-0.5 self-start rounded-full bg-card p-1 shadow-chip">
      {mode === "rich" ? (
        <>
          <button type="button" aria-label="Bold" aria-pressed={marks.bold} onMouseDown={keep} onClick={() => onExec("bold")} className={`${btn} font-semibold`}>
            B
          </button>
          <button type="button" aria-label="Italic" aria-pressed={marks.italic} onMouseDown={keep} onClick={() => onExec("italic")} className={`${btn} italic`}>
            I
          </button>
          <button type="button" aria-label="Link" aria-pressed={marks.link} onMouseDown={keep} onClick={onLink} className={btn}>
            <Link size={13} />
          </button>
        </>
      ) : null}
      <button type="button" aria-label="Insert data" onMouseDown={keep} onClick={(e) => setOpen(e.currentTarget)} className={`${btn} gap-1`}>
        <User size={13} /> Insert data
      </button>
      {open ? (
        <Popover anchor={open} onClose={() => setOpen(null)} width={180}>
          <div role="menu" data-typing-keep="" className="flex max-h-72 flex-col overflow-y-auto p-1">
            {(fields ?? MERGE_KEYS.map((k) => ({ tag: k, label: LABEL[k] ?? k }))).map((f) => (
              <button
                key={f.tag}
                type="button"
                role="menuitem"
                onMouseDown={keep}
                onClick={() => {
                  setOpen(null);
                  onInsert(fields ? `{{${f.tag}}}` : `{{${f.tag}|}}`);
                }}
                className="flex min-h-8 items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover"
              >
                {f.label}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}
