"use client";

// The email builder's Settings panel (docs/design-system.md Part 5.1): the picked block's words, links and images,
// the picked section's columns, who sees it (a condition) and where (desktop or phones), or, with nothing picked,
// the email's own settings. Every change is a whole new document through src/lib/design/email/ops.ts.

import { useEffect, useRef } from "react";
import { COND_FIELDS, COND_OPS, SOCIAL_KINDS, type Block, type EmailCond, type EmailDoc, type Section, type SocialKind } from "@/lib/design/email/doc";
import { cleanHtml } from "@/lib/design/email/html";
import { findEl, setColumns, setSettings, updateBlock, updateSection } from "@/lib/design/email/ops";
import { Plus, Trash } from "../../Icons";
import { askText } from "../Dialogs";
import { Select } from "../Select";
import { AreaIn, NumRow, PICK, Row, Section as Group, Seg, Switch, TextIn } from "../forms/controls";

type Change = (doc: EmailDoc, merge?: string) => void;
const MERGE = ["first_name", "last_name", "company", "title"];
const ALIGN = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
] as const;
const COND_LABEL: Record<string, string> = { first_name: "First name", last_name: "Last name", company: "Company", title: "Job title", is: "is", is_not: "is not", contains: "contains", is_set: "is known", is_not_set: "isn't known" };
const LAYOUTS: { value: string; label: string; widths: number[] }[] = [
  { value: "100", label: "1", widths: [100] },
  { value: "50,50", label: "2", widths: [50, 50] },
  { value: "33,34,33", label: "3", widths: [33, 34, 33] },
  { value: "33,67", label: "1:2", widths: [33, 67] },
  { value: "67,33", label: "2:1", widths: [67, 33] },
];

export function BlockSettings({ doc, selected, onChange, kits, kitId }: { doc: EmailDoc; selected: string | null; onChange: Change; kits: { id: string; name: string }[]; kitId: string | null }) {
  const f = selected ? findEl(doc, selected) : null;
  if (!f) return <EmailSettings doc={doc} onChange={onChange} kits={kits} kitId={kitId} />;
  if (f.block) return <BlockForm doc={doc} b={f.block} onChange={onChange} />;
  return <SectionForm doc={doc} s={f.section} onChange={onChange} />;
}

function EmailSettings({ doc, onChange, kits, kitId }: { doc: EmailDoc; onChange: Change; kits: { id: string; name: string }[]; kitId: string | null }) {
  const st = doc.settings;
  return (
    <>
      <Group title="Email" first>
        <Row label="Preview">
          <TextIn label="Preview text" value={st.preheader} onChange={(v) => onChange(setSettings(doc, { preheader: v.slice(0, 200) }), "preheader")} />
        </Row>
        <Row label="Width">
          <Seg<string> label="Width" value={String(st.width)} options={["600", "640", "700"].map((w) => ({ value: w, label: w }))} onChange={(w) => onChange(setSettings(doc, { width: Number(w) as 600 | 640 | 700 }))} />
        </Row>
        <Row label="Align">
          <Seg<"center" | "left">
            label="Align"
            value={st.align}
            options={[
              { value: "center", label: "Center" },
              { value: "left", label: "Left" },
            ]}
            onChange={(a) => onChange(setSettings(doc, { align: a }))}
          />
        </Row>
        <Switch label="Dark mode looks" on={st.darkMode === "auto"} onChange={(v) => onChange(setSettings(doc, { darkMode: v ? "auto" : "off" }))} />
        {kits.length > 1 ? (
          <Row label="Brand">
            <Select<string> value={kitId ?? ""} options={kits.map((k) => ({ value: k.id, label: k.name }))} onChange={(id) => onChange({ ...doc, kitId: id })} ariaLabel="Brand kit" className={PICK} />
          </Row>
        ) : null}
      </Group>
    </>
  );
}

function SectionForm({ doc, s, onChange }: { doc: EmailDoc; s: Section; onChange: Change }) {
  const layout = s.columns.map((c) => c.width).join(",");
  return (
    <>
      <Group title="Section" first>
        <Row label="Columns">
          <Seg<string> label="Columns" value={LAYOUTS.find((l) => l.value === layout)?.value ?? ""} options={LAYOUTS.map((l) => ({ value: l.value, label: l.label }))} onChange={(v) => onChange(setColumns(doc, s.id, LAYOUTS.find((l) => l.value === v)!.widths))} />
        </Row>
        {s.columns.length > 1 ? <Switch label="Stack on phones" on={s.stackOnPhone} onChange={(v) => onChange(updateSection(doc, s.id, { stackOnPhone: v }))} /> : null}
      </Group>
      <Who show={s.showIf} hide={s.hideOn} onShow={(c) => onChange(updateSection(doc, s.id, { showIf: c }))} onHide={(h) => onChange(updateSection(doc, s.id, { hideOn: h }))} />
    </>
  );
}

/** Who sees it, and where. */
function Who({ show, hide, onShow, onHide }: { show?: EmailCond; hide?: "phone" | "desktop"; onShow: (c: EmailCond | undefined) => void; onHide: (h: "phone" | "desktop" | undefined) => void }) {
  return (
    <Group
      title="Who sees it"
      action={
        show ? (
          <button type="button" aria-label="Remove the condition" title="Remove" onClick={() => onShow(undefined)} className="press flex size-6 items-center justify-center rounded-full text-muted hover:bg-rose-wash hover:text-rose">
            <Trash size={12} />
          </button>
        ) : (
          <button type="button" aria-label="Add a condition" title="Add a condition" onClick={() => onShow({ field: "company", op: "is_set" })} className="press flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <Plus size={12} />
          </button>
        )
      }
    >
      {show ? (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <Select<string> value={show.field} options={COND_FIELDS.map((f) => ({ value: f, label: COND_LABEL[f]! }))} onChange={(v) => onShow({ ...show, field: v as EmailCond["field"] })} ariaLabel="Field" className={PICK} />
            <Select<string>
              value={show.op}
              options={COND_OPS.map((o) => ({ value: o, label: COND_LABEL[o]! }))}
              onChange={(v) => {
                const op = v as EmailCond["op"];
                onShow(op === "is_set" || op === "is_not_set" ? { field: show.field, op } : { field: show.field, op, value: show.value || "" });
              }}
              ariaLabel="Test"
              className={PICK}
            />
          </div>
          {show.op === "is_set" || show.op === "is_not_set" ? null : <TextIn label="Value" value={show.value ?? ""} onChange={(v) => onShow({ ...show, value: v })} />}
        </div>
      ) : null}
      <Row label="Shows on">
        <Seg<string>
          label="Shows on"
          value={hide === "phone" ? "desktop" : hide === "desktop" ? "phone" : "all"}
          options={[
            { value: "all", label: "All" },
            { value: "desktop", label: "Desktop" },
            { value: "phone", label: "Phones" },
          ]}
          onChange={(v) => onHide(v === "desktop" ? "phone" : v === "phone" ? "desktop" : undefined)}
        />
      </Row>
    </Group>
  );
}

const Merge = ({ onPick }: { onPick: (tag: string) => void }) => (
  <div className="flex flex-wrap gap-1">
    {MERGE.map((k) => (
      <button
        key={k}
        type="button"
        onClick={() => onPick(`{{${k}|}}`)}
        className="press inline-flex h-6 items-center rounded-full border border-line-strong bg-card px-2 font-mono text-[11px] text-body hover:text-ink"
      >
        {`{{${k}}}`}
      </button>
    ))}
  </div>
);

function BlockForm({ doc, b, onChange }: { doc: EmailDoc; b: Block; onChange: Change }) {
  const set = (patch: Record<string, unknown>, merge?: string) => onChange(updateBlock(doc, b.id, patch as Partial<Block>), merge ? `${b.id}:${merge}` : undefined);
  const text = (label: string, key: string, value: string | undefined, o: { placeholder?: string; mono?: boolean } = {}) => (
    <Row label={label}>
      <TextIn label={label} value={value ?? ""} placeholder={o.placeholder} mono={o.mono} onChange={(v) => set({ [key]: v }, key)} />
    </Row>
  );
  const align = (value: string) => (
    <Row label="Align">
      <Seg<string> label="Align" value={value} options={ALIGN.map((a) => ({ ...a }))} onChange={(v) => set({ align: v })} />
    </Row>
  );
  const body = (() => {
    switch (b.type) {
      case "heading":
        return (
          <>
            <AreaIn label="Heading" value={b.text} rows={2} onChange={(v) => set({ text: v.replace(/\n/g, " ") }, "text")} />
            <Merge onPick={(t) => set({ text: `${b.text}${t}` })} />
            <Row label="Size">
              <Seg<string>
                label="Heading size"
                value={String(b.level)}
                options={["1", "2", "3"].map((l) => ({ value: l, label: `H${l}` }))}
                onChange={(l) => set({ level: Number(l) })}
              />
            </Row>
          </>
        );
      case "text":
        return (
          <>
            <RichText value={b.html} onChange={(html) => set({ html }, "html")} />
            <Merge onPick={(t) => set({ html: b.html.replace(/(<\/p>)?$/, (m) => `${t}${m}`) })} />
          </>
        );
      case "button":
      case "meeting":
        return (
          <>
            {text("Label", "label", b.label)}
            {text("Link", "url", b.url, { placeholder: "https://", mono: true })}
            {align(b.align)}
            {b.type === "button" ? <Switch label="Full width" on={!!b.full} onChange={(v) => set({ full: v || undefined })} /> : null}
          </>
        );
      case "image":
        return (
          <>
            {text("Image", "src", b.src, { placeholder: "https://", mono: true })}
            {text("Alt text", "alt", b.alt)}
            {text("Link", "url", b.url, { placeholder: "https://", mono: true })}
            <NumRow label="Width" value={b.width} onChange={(v) => set({ width: v })} min={20} max={1400} empty unit="px" />
            {align(b.align)}
          </>
        );
      case "logo":
        return (
          <>
            {text("Image", "src", b.src, { placeholder: "Brand kit logo", mono: true })}
            {text("Alt text", "alt", b.alt)}
            {text("Link", "url", b.url, { placeholder: "https://", mono: true })}
            <NumRow label="Width" value={b.width} onChange={(v) => set({ width: v ?? 120 })} min={40} max={400} unit="px" />
            {align(b.align)}
          </>
        );
      case "divider":
        return null;
      case "spacer":
        return <NumRow label="Height" value={b.height} onChange={(v) => set({ height: v ?? 24 })} min={4} max={200} unit="px" />;
      case "list":
        return (
          <>
            <AreaIn label="Items" value={b.items.join("\n")} rows={5} onChange={(v) => set({ items: v.split("\n").slice(0, 30) }, "items")} />
            <Switch label="Numbered" on={b.ordered} onChange={(v) => set({ ordered: v })} />
          </>
        );
      case "quote":
        return (
          <>
            <AreaIn label="Quote" value={b.text} rows={3} onChange={(v) => set({ text: v }, "text")} />
            {text("Who said it", "cite", b.cite)}
          </>
        );
      case "social":
        return (
          <>
            {b.links.map((l, i) => (
              <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)_24px] items-center gap-1.5">
                <Select<string>
                  value={l.kind}
                  options={SOCIAL_KINDS.map((k) => ({ value: k, label: k === "x" ? "X" : k[0]!.toUpperCase() + k.slice(1) }))}
                  onChange={(k) => set({ links: b.links.map((x, j) => (j === i ? { ...x, kind: k as SocialKind } : x)) })}
                  ariaLabel="Network"
                  className={PICK}
                />
                <TextIn label="Link" mono value={l.url} onChange={(v) => set({ links: b.links.map((x, j) => (j === i ? { ...x, url: v } : x)) }, `l${i}`)} />
                <button type="button" aria-label="Remove link" title="Remove" onClick={() => set({ links: b.links.filter((_, j) => j !== i) })} className="press flex size-6 items-center justify-center rounded-full text-muted hover:bg-rose-wash hover:text-rose">
                  <Trash size={11} />
                </button>
              </div>
            ))}
            {b.links.length < 8 ? (
              <button type="button" onClick={() => set({ links: [...b.links, { kind: "linkedin", url: "https://" }] })} className="press inline-flex h-7 items-center gap-1 self-start rounded-full border border-line-strong px-2.5 text-[12px] text-ink hover:border-ink">
                <Plus size={11} />
                Link
              </button>
            ) : null}
            {align(b.align)}
          </>
        );
      case "video":
        return (
          <>
            {text("Video", "url", b.url, { placeholder: "https://", mono: true })}
            {text("Picture", "thumb", b.thumb, { placeholder: "https://", mono: true })}
            {text("Alt text", "alt", b.alt)}
          </>
        );
      case "product":
        return (
          <>
            {text("Name", "title", b.title)}
            <AreaIn label="Text" value={b.text ?? ""} rows={2} onChange={(v) => set({ text: v }, "text")} />
            {text("Price", "price", b.price)}
            {text("Picture", "image", b.image, { placeholder: "https://", mono: true })}
            {text("Link", "url", b.url, { placeholder: "https://", mono: true })}
            {text("Button", "button", b.button)}
          </>
        );
      case "event":
        return (
          <>
            {text("Name", "title", b.title)}
            {text("When", "when", b.when)}
            {text("Where", "where", b.where)}
            {text("Link", "url", b.url, { placeholder: "https://", mono: true })}
            {text("Button", "button", b.button)}
          </>
        );
      case "signature":
        return (
          <>
            {text("Name", "name", b.name)}
            {text("Title", "title", b.title)}
            {text("Company", "company", b.company)}
            {text("Photo", "image", b.image, { placeholder: "https://", mono: true })}
          </>
        );
      case "footer":
        return (
          <>
            <AreaIn label="Text" value={b.text ?? ""} rows={2} onChange={(v) => set({ text: v }, "text")} />
            {text("Address", "address", b.address, { placeholder: "From Settings, Sending" })}
          </>
        );
      case "html":
        return <AreaIn label="HTML" value={b.html} rows={10} onChange={(v) => set({ html: cleanHtml(v, "block") }, "html")} />;
    }
  })();
  return (
    <>
      <Group title={TITLE[b.type]} first>
        {body}
      </Group>
      <Who show={b.showIf} hide={b.hideOn} onShow={(c) => set({ showIf: c })} onHide={(h) => set({ hideOn: h })} />
    </>
  );
}

const TITLE: Record<Block["type"], string> = {
  heading: "Heading",
  text: "Text",
  button: "Button",
  image: "Image",
  logo: "Logo",
  divider: "Divider",
  spacer: "Spacer",
  list: "List",
  quote: "Quote",
  social: "Social links",
  video: "Video",
  product: "Product",
  event: "Event",
  meeting: "Meeting link",
  signature: "Signature",
  footer: "Footer",
  html: "HTML",
};

/** Rich text: bold, italic, links and lists, kept to what emails allow (cleanHtml). */
function RichText({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef("");
  // Put the value in only when it changed from outside, so typing keeps its place.
  useEffect(() => {
    if (box.current && value !== last.current) {
      box.current.innerHTML = value;
      last.current = value;
    }
  }, [value]);
  const read = () => {
    if (!box.current) return;
    const html = cleanHtml(box.current.innerHTML, "rich");
    last.current = html;
    onChange(html);
  };
  const cmd = (name: string, arg?: string) => {
    box.current?.focus();
    document.execCommand(name, false, arg);
    read();
  };
  const btn = "press flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] text-muted hover:bg-hover hover:text-ink";
  return (
    <div className="flex flex-col gap-1">
      <div role="toolbar" aria-label="Text style" className="flex items-center gap-0.5">
        <button type="button" className={`${btn} font-semibold`} aria-label="Bold" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")}>
          B
        </button>
        <button type="button" className={`${btn} italic`} aria-label="Italic" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")}>
          I
        </button>
        <button type="button" className={btn} aria-label="Bullets" title="Bullets" onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertUnorderedList")}>
          List
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Link"
          title="Link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={async () => {
            const sel = window.getSelection();
            const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
            const url = await askText("Link to", { placeholder: "https://", ok: "Add link" });
            if (!url?.trim()) return;
            box.current?.focus();
            if (range) {
              sel!.removeAllRanges();
              sel!.addRange(range);
            }
            cmd("createLink", url.trim());
          }}
        >
          Link
        </button>
      </div>
      <div
        ref={box}
        role="textbox"
        aria-multiline="true"
        aria-label="Text"
        contentEditable
        suppressContentEditableWarning
        onInput={read}
        className="min-h-24 rounded-sm border border-line-strong bg-card px-2 py-1.5 text-[12.5px] leading-snug text-ink outline-none hover:border-ink/40 focus:border-ink focus:ring-1 focus:ring-ink [&_a]:text-clay [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_p]:mb-2"
      />
    </div>
  );
}
