"use client";

// The canvas's panel (docs/email-canvas-b2.md section 3): Element and Layout tabs and a close X. Element shows what's
// picked (its kind and where it is), Style for (this element, one of its classes or every one on the brand), Desktop
// or Phone (the canvas's switch), Plain, Hover or Dark, then groups that open and close: Content (the Email Studio's
// own settings), Text, Layout, Fill, Stroke, Corners, Spacing and All styles (the full style sections). Each group
// writes through the style engine (src/lib/design/email/edit.ts) at the chosen level, screen and state.

import { useState } from "react";
import { literal } from "@/lib/design/cascade";
import type { Level } from "@/lib/design/edit";
import type { EmailDoc } from "@/lib/design/email/doc";
import type { EmailEdit } from "@/lib/design/email/edit";
import { findEl } from "@/lib/design/email/ops";
import { emailPartsOf, type EmailPartKey } from "@/lib/design/email/parts";
import type { EmailState } from "@/lib/design/email/style";
import { KIND_LABEL, kindOf, type LayerKind } from "@/lib/design/email/tree";
import type { Prop } from "@/lib/design/props";
import { Monitor, Phone, Refresh, X } from "../../../Icons";
import { Select } from "../../Select";
import { BlockSettings } from "../../email/BlockSettings";
import { EmailStylePanel, emailStyleCtx } from "../../email/EmailStyle";
import type { AssetCtx } from "../../email/ImagePicker";
import { PropRow, type StyleCtx } from "../../email/StyleSections";
import { INPUT, PICK } from "../../forms/controls";
import { ChevronDown } from "../../forms/icons";
import type { EmailDraft } from "./useCanvasEditor";

type Kind = Exclude<LayerKind, "body" | "container"> | "email";
type GroupId = "content" | "text" | "layout" | "fill" | "stroke" | "corners" | "spacing" | "all";
const SIDES = ["top", "right", "bottom", "left"] as const;
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
const TEXT_KINDS: Kind[] = ["heading", "text", "list", "quote", "button", "meeting", "footer", "social"];
const BOX_KINDS: Kind[] = ["button", "meeting", "section", "column", "email"];
const STROKE_KINDS: Kind[] = [...BOX_KINDS, "image", "logo", "divider"];
const CORNER_KINDS: Kind[] = [...BOX_KINDS, "image", "logo"];
const SIZE_KINDS: Kind[] = ["image", "logo", "video", "button", "meeting", "divider"];
const ROUND = "999px";

const nameOf = (k: Kind) => (k === "email" ? "Email" : KIND_LABEL[k]);
const every = (k: Kind) => (k === "email" ? "Every email" : `Every ${KIND_LABEL[k].toLowerCase()}`);

export function Inspector({
  draft,
  kits,
  pick,
  onPick,
  phone,
  onPhone,
  state,
  onState,
  tab,
  onTab,
  onClose,
  assets,
  layout,
}: {
  draft: EmailDraft;
  kits: { id: string; name: string }[];
  pick: { id: string; part: EmailPartKey | null };
  onPick: (id: string, part?: EmailPartKey | null) => void;
  phone: boolean;
  onPhone: (v: boolean) => void;
  state: EmailState | undefined;
  onState: (s: EmailState | undefined) => void;
  tab: "element" | "layout";
  onTab: (t: "element" | "layout") => void;
  onClose: () => void;
  assets?: AssetCtx;
  layout: React.ReactNode;
}) {
  return (
    <aside
      data-canvas-ui=""
      aria-label="Element"
      className="z-[6] flex min-h-0 shrink-0 flex-col bg-card max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[55%] max-lg:rounded-t-2xl max-lg:shadow-float lg:w-80 lg:shadow-[-1px_0_0_var(--color-line)]"
    >
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
        <div role="tablist" aria-label="Panel" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
          {(["element", "layout"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${tab === t ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}>
              {t === "element" ? "Element" : "Layout"}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" aria-label="Close the panel" title="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <X size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "layout" ? layout : draft.doc ? <ElementTab draft={draft} doc={draft.doc} kits={kits} pick={pick} onPick={onPick} phone={phone} onPhone={onPhone} state={state} onState={onState} assets={assets} /> : null}
      </div>
    </aside>
  );
}

function ElementTab({
  draft,
  doc,
  kits,
  pick,
  onPick,
  phone,
  onPhone,
  state,
  onState,
  assets,
}: {
  draft: EmailDraft;
  doc: EmailDoc;
  kits: { id: string; name: string }[];
  pick: { id: string; part: EmailPartKey | null };
  onPick: (id: string, part?: EmailPartKey | null) => void;
  phone: boolean;
  onPhone: (v: boolean) => void;
  state: EmailState | undefined;
  onState: (s: EmailState | undefined) => void;
  assets?: AssetCtx;
}) {
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const id = pick.id === "email" || findEl(doc, pick.id) ? pick.id : "email";
  const kind = (kindOf(doc, id) ?? "email") as Kind;
  const parts = emailPartsOf(kind);
  const part = pick.part && parts.includes(pick.part) ? pick.part : (parts[0] ?? null);
  const system = draft.system;
  const hasKit = !!draft.kit;
  const on = doc.classes?.[id] ?? [];
  const classes = system.email?.classes ?? [];
  let level = levels[id] ?? { kind: "element" };
  if (!hasKit || (level.kind === "class" && !on.includes(level.id))) level = { kind: "element" };
  const bp = phone ? "phone" : "base";
  const edit = (e: EmailEdit, merge?: string) => draft.apply(e, merge);
  const ctxFor = (p: EmailPartKey) => emailStyleCtx({ system, doc, tokens: draft.tokens, level, id, part: p, bp, state, onEdit: edit });
  const ctx = part ? ctxFor(part) : null;
  const f = id === "email" ? null : findEl(doc, id);
  const where = f && (f.block || f.column) ? { id: f.section.id, label: `Section ${f.si + 1}` } : null;
  const title = kind === "section" && f ? `Section ${f.si + 1}` : nameOf(kind);
  const isOpen = (g: GroupId, dflt: boolean) => open[`${kind}:${g}`] ?? dflt;
  const setOpenG = (g: GroupId, v: boolean) => setOpen((o) => ({ ...o, [`${kind}:${g}`]: v }));
  const g = (gid: GroupId, label: string, props: Prop[], body: React.ReactNode, dflt = false) => (
    <Group key={gid} label={label} ctx={ctx} props={props} open={isOpen(gid, dflt)} onOpen={(v) => setOpenG(gid, v)}>
      {body}
    </Group>
  );
  const darkOn = doc.settings.darkMode === "auto";
  const stateValue = state === "dark" && !darkOn ? "" : (state ?? "");

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 px-3 pb-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          {where ? (
            <span className="text-[12.5px] text-muted">
              in{" "}
              <button type="button" onClick={() => onPick(where.id)} className="text-body underline decoration-line-strong underline-offset-2 hover:text-ink">
                {where.label}
              </button>
            </span>
          ) : null}
        </div>
        {draft.readOnly ? <p className="rounded-md bg-paper-deep px-2.5 py-2 text-[12.5px] text-body">{draft.locked ? "Tia is changing this email" : "Sent emails can't change. Duplicate to edit."}</p> : null}
        {ctx && !draft.readOnly ? (
          <>
            <div className="grid items-center gap-2" style={{ gridTemplateColumns: "72px minmax(0,1fr)" }}>
              <span className="text-[12px] text-muted">Style for</span>
              <Select<string>
                value={level.kind === "class" ? `c:${level.id}` : level.kind}
                options={[
                  { value: "element", label: kind === "email" ? "This email" : `This ${nameOf(kind).toLowerCase()}` },
                  ...(hasKit ? on.flatMap((cid) => {
                    const c = classes.find((x) => x.id === cid);
                    return c ? [{ value: `c:${cid}`, label: c.name }] : [];
                  }) : []),
                  ...(hasKit ? [{ value: "global", label: every(kind) }] : []),
                ]}
                onChange={(v) => setLevels((m) => ({ ...m, [id]: v === "global" ? { kind: "global" } : v.startsWith("c:") ? { kind: "class", id: v.slice(2) } : { kind: "element" } }))}
                ariaLabel="Style for"
                className={PICK}
              />
            </div>
            {level.kind !== "element" ? <p className="text-[12px] text-signal-text">Changes every email that uses it.</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <div role="radiogroup" aria-label="Screen" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
                {([false, true] as const).map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={phone === v}
                    onClick={() => onPhone(v)}
                    className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-[140ms] ${phone === v ? (v ? "bg-signal text-white" : "bg-card text-ink shadow-chip") : "text-muted hover:text-ink"}`}
                  >
                    {v ? <Phone size={12} /> : <Monitor size={12} />}
                    {v ? "Phone" : "Desktop"}
                  </button>
                ))}
              </div>
              <span className="min-w-[96px] flex-1">
                <Select<string>
                  value={stateValue}
                  options={[{ value: "", label: "Plain" }, { value: "hover", label: "Hover" }, ...(darkOn ? [{ value: "dark", label: "Dark" }] : [])]}
                  onChange={(v) => onState(v ? (v as EmailState) : undefined)}
                  ariaLabel="State"
                  className={PICK}
                />
              </span>
            </div>
          </>
        ) : null}
      </div>
      <fieldset disabled={draft.readOnly} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70">
        <Group label="Content" ctx={null} props={[]} open={isOpen("content", true)} onOpen={(v) => setOpenG("content", v)}>
          <div className="-mx-3 -my-3">
            {kind === "email" ? (
              <div className="flex flex-col gap-1.5 px-3 pt-3">
                <label className="text-[12px] text-muted" htmlFor="canvas-subject">
                  Subject
                </label>
                <input id="canvas-subject" value={draft.subject} onChange={(e) => draft.apply({ subject: e.target.value }, "subject")} className={INPUT} />
              </div>
            ) : null}
            <BlockSettings
              doc={doc}
              system={system}
              selected={id === "email" ? null : id}
              onChange={(d, merge) => draft.apply({ doc: d }, merge)}
              onEdit={(e) => draft.apply(e)}
              kits={kits}
              kitId={doc.kitId ?? null}
              assets={assets}
            />
          </div>
        </Group>
        {ctx && part ? (
          <>
            {TEXT_KINDS.includes(kind) ? g("text", "Text", ["text-align", "font-family", "font-weight", "font-size", "line-height", "letter-spacing", "font-style", "text-decoration-line", "text-transform", "color"], <TextGroup ctx={ctx} />, true) : null}
            {SIZE_KINDS.includes(kind) ? g("layout", "Layout", ["width", "height", "object-fit"], <LayoutGroup ctx={ctx} kind={kind} />) : null}
            {BOX_KINDS.includes(kind)
              ? g(
                  "fill",
                  "Fill",
                  kind === "section" ? ["background-color", "background-image", "background-size", "background-position"] : ["background-color"],
                  <>
                    <PropRow ctx={ctx} prop="background-color" label={kind === "email" ? "Email" : "Color"} />
                    {kind === "email" ? <PropRow ctx={ctxFor("body")} prop="background-color" label="Page" /> : null}
                    {kind === "section" ? (
                      <>
                        <PropRow ctx={ctx} prop="background-image" label="Picture" />
                        <PropRow ctx={ctx} prop="background-size" label="Size" />
                        <PropRow ctx={ctx} prop="background-position" label="Position" />
                      </>
                    ) : null}
                  </>,
                )
              : null}
            {STROKE_KINDS.includes(kind) ? g("stroke", "Stroke", SIDES.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`] as Prop[]), <StrokeGroup ctx={ctx} only={kind === "divider" ? "top" : undefined} />) : null}
            {CORNER_KINDS.includes(kind) ? g("corners", "Corners", CORNERS.map((c) => `border-${c}-radius` as Prop), <CornersGroup ctx={ctx} />) : null}
            {kind !== "spacer" ? g("spacing", "Spacing", SIDES.flatMap((s) => [`padding-${s}`, `margin-${s}`] as Prop[]), <SpacingGroup ctx={ctx} />, true) : null}
            <Group label="All styles" ctx={null} props={[]} open={isOpen("all", false)} onOpen={(v) => setOpenG("all", v)}>
              <div className="-mx-3 -my-3">
                <EmailStylePanel system={system} doc={doc} tokens={draft.tokens} bp={bp} hasKit={hasKit} selected={id === "email" ? null : id} part={part} onPart={(p) => onPick(id, p)} state={state} onState={onState} onEdit={edit} />
              </div>
            </Group>
          </>
        ) : null}
      </fieldset>
    </div>
  );
}

/** A group that opens and closes, with a dot when this level sets something in it and a reset for those. */
function Group({ label, ctx, props, open, onOpen, children }: { label: string; ctx: StyleCtx | null; props: Prop[]; open: boolean; onOpen: (v: boolean) => void; children: React.ReactNode }) {
  const set = !!ctx && props.length > 0 && ctx.setsAny(props);
  return (
    <section className="border-t border-line">
      <div className="flex min-h-10 items-center gap-1.5 px-3">
        <button type="button" aria-expanded={open} onClick={() => onOpen(!open)} className="flex flex-1 items-center gap-1.5 py-2 text-left">
          <ChevronDown size={12} className={`text-muted transition-transform duration-[140ms] motion-reduce:transition-none ${open ? "" : "-rotate-90"}`} />
          <h3 className="text-[12.5px] font-medium text-ink">{label}</h3>
          {set ? <span aria-label="Has styles" className="size-1.5 rounded-full bg-signal" /> : null}
        </button>
        {set && ctx ? (
          <button type="button" aria-label={`Reset ${label}`} title="Reset" onClick={() => ctx.write(props.filter((p) => ctx.own(p) !== undefined), "")} className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <Refresh size={11} />
          </button>
        ) : null}
      </div>
      {open ? <div className="flex flex-col gap-2 px-3 pb-3">{children}</div> : null}
    </section>
  );
}

const shown = (ctx: StyleCtx, p: Prop) => {
  const v = ctx.resolved[p]?.value;
  return v ? literal(v, new Map(ctx.vars.map((x) => [x.id, x]))) : "";
};

/** A row of pill segments; `value` may match none. */
function Pills<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`h-6 flex-auto rounded-full px-2 text-[12px] font-medium whitespace-nowrap transition-colors duration-[140ms] ${value === o.value ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "88px minmax(0,1fr)" }}>
      <span className="text-[12px] text-muted">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function TextGroup({ ctx }: { ctx: StyleCtx }) {
  const weight = Number.parseInt(shown(ctx, "font-weight"), 10) || 400;
  const italic = shown(ctx, "font-style") === "italic";
  const deco = shown(ctx, "text-decoration-line");
  const toggle = (on: boolean, label: React.ReactNode, title: string, run: () => void) => (
    <button key={title} type="button" aria-pressed={on} aria-label={title} title={title} onClick={run} className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-full text-[12.5px] transition-colors duration-[140ms] ${on ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}>
      {label}
    </button>
  );
  const align = shown(ctx, "text-align");
  const tt = shown(ctx, "text-transform") || "none";
  return (
    <>
      <Labeled label="Align">
        <Pills<string>
          label="Align"
          value={align || "left"}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
            { value: "justify", label: "Justify" },
          ]}
          onChange={(v) => ctx.write(["text-align"], v)}
        />
      </Labeled>
      <PropRow ctx={ctx} prop="font-family" label="Font" />
      <PropRow ctx={ctx} prop="font-weight" label="Weight" />
      <PropRow ctx={ctx} prop="font-size" label="Size" />
      <PropRow ctx={ctx} prop="line-height" label="Line height" />
      <PropRow ctx={ctx} prop="letter-spacing" label="Letter spacing" />
      <Labeled label="Format">
        <div role="group" aria-label="Format" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
          {toggle(weight >= 600, <b>B</b>, "Bold", () => ctx.write(["font-weight"], weight >= 600 ? "400" : "700"))}
          {toggle(italic, <i>I</i>, "Italic", () => ctx.write(["font-style"], italic ? "normal" : "italic"))}
          {toggle(deco === "underline", <u>U</u>, "Underline", () => ctx.write(["text-decoration-line"], deco === "underline" ? "none" : "underline"))}
          {toggle(deco === "line-through", <s>S</s>, "Strikethrough", () => ctx.write(["text-decoration-line"], deco === "line-through" ? "none" : "line-through"))}
        </div>
      </Labeled>
      <Labeled label="Case">
        <Pills<string>
          label="Case"
          value={tt}
          options={[
            { value: "none", label: "Aa", title: "Default" },
            { value: "uppercase", label: "AA", title: "Uppercase" },
            { value: "lowercase", label: "aa", title: "Lowercase" },
            { value: "capitalize", label: "Ab", title: "Title Case" },
          ]}
          onChange={(v) => ctx.write(["text-transform"], v)}
        />
      </Labeled>
      <PropRow ctx={ctx} prop="color" label="Color" />
    </>
  );
}

function LayoutGroup({ ctx, kind }: { ctx: StyleCtx; kind: Kind }) {
  const h = shown(ctx, "height");
  const picture = kind === "image" || kind === "logo" || kind === "video";
  return (
    <>
      <PropRow ctx={ctx} prop="width" label="Width" />
      {kind !== "divider" ? <PropRow ctx={ctx} prop="height" label="Height" /> : null}
      {picture && h && h !== "auto" ? (
        <Labeled label="Fit">
          <Pills<string>
            label="Fit"
            value={shown(ctx, "object-fit") || null}
            options={[
              { value: "cover", label: "Cover" },
              { value: "contain", label: "Contain" },
              { value: "fill", label: "Fill" },
            ]}
            onChange={(v) => ctx.write(["object-fit"], v)}
          />
        </Labeled>
      ) : null}
    </>
  );
}

function StrokeGroup({ ctx, only }: { ctx: StyleCtx; only?: "top" }) {
  const sides = only ? ([only] as const) : SIDES;
  const [each, setEach] = useState(() => !only && new Set(SIDES.map((s) => shown(ctx, `border-${s}-width`))).size > 1);
  const all = (k: "width" | "style" | "color") => sides.map((s) => `border-${s}-${k}` as Prop);
  const style = shown(ctx, `border-${sides[0]}-style`);
  return (
    <>
      {each ? (
        sides.map((s) => <PropRow key={s} ctx={ctx} prop={`border-${s}-width`} label={`${s[0]!.toUpperCase()}${s.slice(1)}`} />)
      ) : (
        <PropRow ctx={ctx} prop={`border-${sides[0]}-width`} linked={all("width")} label="Width" />
      )}
      <PropRow ctx={ctx} prop={`border-${sides[0]}-color`} linked={all("color")} label="Color" />
      <Labeled label="Style">
        <Pills<string>
          label="Stroke style"
          value={style && style !== "none" ? style : null}
          options={[
            { value: "solid", label: "Solid" },
            { value: "dashed", label: "Dashed" },
            { value: "dotted", label: "Dotted" },
          ]}
          onChange={(v) => ctx.write(all("style"), v)}
        />
      </Labeled>
      {!only ? <EachToggle on={each} label="Each side" onChange={setEach} /> : null}
    </>
  );
}

function CornersGroup({ ctx }: { ctx: StyleCtx }) {
  const all = CORNERS.map((c) => `border-${c}-radius` as Prop);
  const [each, setEach] = useState(() => new Set(all.map((p) => shown(ctx, p))).size > 1);
  const radius = ctx.vars.find((v) => v.id === "radius") ?? ctx.vars.find((v) => v.kind === "length" && /radius/.test(v.id));
  const own = ctx.own("border-top-left-radius");
  const now = own === "0px" || own === "0" ? "none" : own === ROUND ? "round" : radius && own === `$${radius.id}` ? "rounded" : null;
  return (
    <>
      <Pills<string>
        label="Corners"
        value={now}
        options={[{ value: "none", label: "None" }, ...(radius ? [{ value: "rounded", label: "Rounded" }] : []), { value: "round", label: "Round" }]}
        onChange={(v) => ctx.write(all, v === "none" ? "0px" : v === "round" ? ROUND : `$${radius!.id}`)}
      />
      {each ? all.map((p, i) => <PropRow key={p} ctx={ctx} prop={p} label={["Top left", "Top right", "Bottom right", "Bottom left"][i]} />) : <PropRow ctx={ctx} prop="border-top-left-radius" linked={all} label="Radius" />}
      <EachToggle on={each} label="Each corner" onChange={setEach} />
    </>
  );
}

function SpacingGroup({ ctx }: { ctx: StyleCtx }) {
  const [each, setEach] = useState<Record<"padding" | "margin", boolean>>(() => ({
    padding: shown(ctx, "padding-top") !== shown(ctx, "padding-bottom") || shown(ctx, "padding-left") !== shown(ctx, "padding-right"),
    margin: false,
  }));
  const block = (k: "padding" | "margin") => (
    <div key={k} className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-body">{k === "padding" ? "Padding" : "Margin"}</span>
      {each[k] ? (
        SIDES.map((s) => <PropRow key={s} ctx={ctx} prop={`${k}-${s}`} label={`${s[0]!.toUpperCase()}${s.slice(1)}`} />)
      ) : (
        <>
          <PropRow ctx={ctx} prop={`${k}-left`} linked={[`${k}-left`, `${k}-right`]} label="Across" />
          <PropRow ctx={ctx} prop={`${k}-top`} linked={[`${k}-top`, `${k}-bottom`]} label="Up and down" />
        </>
      )}
      <EachToggle on={each[k]} label="Each side" onChange={(v) => setEach((m) => ({ ...m, [k]: v }))} />
    </div>
  );
  return (
    <>
      {block("padding")}
      {block("margin")}
    </>
  );
}

function EachToggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)} className={`self-start rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors duration-[140ms] ${on ? "bg-signal-pale text-signal-text" : "text-muted hover:bg-hover hover:text-ink"}`}>
      {label}
    </button>
  );
}
