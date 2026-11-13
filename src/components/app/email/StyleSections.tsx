"use client";

// The style sections of the email builder's Style panel (docs/design-system.md Parts 5.2 and 5.3): the properties in
// sections, each label colored by where its value comes from; numbers scrub and take sums, and every color, size and
// font can come from a variable. EmailStyle.tsx says which email part they style and how a value is written.

import { useRef, useState } from "react";
import { literal, type Resolved } from "@/lib/design/cascade";
import { evalSum, nudgeValue, parseLength, type Origin } from "@/lib/design/edit";
import type { Variable } from "@/lib/design/model";
import { CLIENT_LABEL, propDef, PROP_NAMES, type Group, type Prop } from "@/lib/design/props";
import { Refresh, X } from "../../Icons";
import { Select } from "../Select";
import { INPUT, PICK, Popover } from "../forms/controls";
import { FONTS, fontStack } from "@/lib/design/fonts";
import { ChevronDown, Diamond } from "../forms/icons";

// Where a value comes from, as the label's color (Part 5.3).
const ORIGIN_CLASS: Record<Origin, string> = { here: "text-ink font-medium", inherited: "text-clay", class: "text-sky", global: "text-muted", default: "text-muted", none: "text-muted" };

/**
 * What the sections and inputs need, for a form part or an email part alike: the values that show, what this level
 * itself sets, where each value comes from, and how to write one.
 */
export type StyleCtx = {
  vars: Variable[];
  resolved: Resolved;
  /** The value this level sets at this breakpoint and state, if any. */
  own: (p: Prop) => string | undefined;
  origin: (p: Prop) => Origin;
  /** Words for where a property's value comes from. */
  source: (p: Prop) => string | undefined;
  /** Whether this level sets any of these, for a section's dot. */
  setsAny: (props: Prop[]) => boolean;
  /** Write one value to several properties (linked sides); false when the value isn't allowed. */
  write: (props: Prop[], value: string, merge?: boolean) => boolean;
  /** Emails: properties the email builder doesn't offer are hidden, and those some clients ignore are marked. */
  email?: boolean;
};
type Ctx = StyleCtx;

// Sections ---------------------------------------------------------------------------------------------------------

const SHOWN: Partial<Record<Group, (display: string, position: string) => Prop[]>> = {
  layout: (d) => [
    "display",
    ...(d === "flex" ? (["flex-direction", "flex-wrap", "justify-content", "align-items", "gap"] as Prop[]) : []),
    ...(d === "grid" ? (["grid-template-columns", "row-gap", "column-gap", "justify-content", "align-items"] as Prop[]) : []),
    "align-self",
  ],
  size: () => ["width", "min-width", "max-width", "height", "min-height", "max-height", "aspect-ratio", "object-fit", "overflow"],
  position: (_, p) => ["position", ...(p && p !== "static" ? (["inset-top", "inset-right", "inset-bottom", "inset-left"] as Prop[]) : []), "z-index"],
  typography: () => ["font-family", "font-weight", "font-size", "line-height", "letter-spacing", "color", "text-align", "text-transform", "text-decoration-line", "font-style", "white-space", "text-shadow"],
  backgrounds: () => ["background-color", "background-image", "background-size", "background-position", "background-repeat"],
  effects: () => ["opacity", "box-shadow", "outline-width", "outline-style", "outline-color", "outline-offset", "cursor", "transition-duration", "transition-timing-function", "transform"],
};
const SIDES = ["top", "right", "bottom", "left"] as const;
const SPACING: Prop[] = SIDES.flatMap((s) => [`margin-${s}`, `padding-${s}`] as Prop[]);
const BORDERS: Prop[] = PROP_NAMES.filter((p) => propDef(p).group === "borders");

export function Sections({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const val = (p: Prop) => literal(ctx.resolved[p]?.value ?? "", new Map(ctx.vars.map((v) => [v.id, v])));
  const lists: { id: string; label: string; props: Prop[]; body?: React.ReactNode }[] = [
    { id: "layout", label: "Layout", props: SHOWN.layout!(val("display"), "") },
    { id: "spacing", label: "Spacing", props: SPACING, body: <BoxModel ctx={ctx} /> },
    { id: "size", label: "Size", props: SHOWN.size!("", "") },
    { id: "position", label: "Position", props: SHOWN.position!("", val("position")) },
    { id: "typography", label: "Typography", props: SHOWN.typography!("", "") },
    { id: "backgrounds", label: "Backgrounds", props: SHOWN.backgrounds!("", "") },
    { id: "borders", label: "Borders", props: BORDERS, body: <Borders ctx={ctx} /> },
    { id: "effects", label: "Effects", props: SHOWN.effects!("", "") },
  ];
  // Emails offer only what email clients can draw.
  if (ctx.email) for (const l of lists) l.props = l.props.filter((p) => propDef(p).email !== false);
  const shown = new Set(lists.flatMap((l) => l.props));
  const rest = PROP_NAMES.filter((p) => !shown.has(p) && (!ctx.email || propDef(p).email !== false));
  const more = rest.filter((p) => !q.trim() || `${p} ${propDef(p).label}`.toLowerCase().includes(q.trim().toLowerCase()));
  lists.push({
    id: "more",
    label: "More",
    props: rest,
    body: (
      <div className="flex flex-col gap-1.5">
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search" aria-label="Search properties" className={INPUT} />
        {more.map((p) => (
          <PropRow key={p} ctx={ctx} prop={p} />
        ))}
      </div>
    ),
  });
  return (
    <>
      {lists.filter((l) => l.props.length).map((l) => {
        const set = ctx.setsAny(l.props);
        const isOpen = open[l.id] ?? (set || l.id === "typography" || l.id === "spacing");
        return (
          <section key={l.id} className="border-t border-line first:border-t-0">
            <div className="flex h-9 items-center gap-1.5 px-3">
              <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [l.id]: !isOpen }))} className="flex flex-1 items-center gap-1.5 text-left">
                <ChevronDown size={12} className={`text-muted transition-transform duration-[140ms] ${isOpen ? "" : "-rotate-90"}`} />
                <h3 className="text-[12px] font-semibold text-ink">{l.label}</h3>
                {set ? <span aria-label="Has styles" className="size-1.5 rounded-full bg-clay" /> : null}
              </button>
              {set ? (
                <button type="button" aria-label={`Reset ${l.label}`} title="Reset" onClick={() => ctx.write(l.props.filter((p) => ctx.own(p) !== undefined), "")} className="press flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                  <Refresh size={11} />
                </button>
              ) : null}
            </div>
            {isOpen ? <div className="flex flex-col gap-1.5 px-3 pb-3">{l.body ?? l.props.map((p) => <PropRow key={p} ctx={ctx} prop={p} />)}</div> : null}
          </section>
        );
      })}
    </>
  );
}

// One property --------------------------------------------------------------------------------------------------------

const shortLabel = (p: Prop) => propDef(p).label.replace(/^(Border|Corner|Inset) (top|right|bottom|left)( left| right)? ?/i, (m) => m.replace(/^(Border|Inset) /i, "")).replace(/^\w/, (c) => c.toUpperCase());

export function PropRow({ ctx, prop, label, linked }: { ctx: Ctx; prop: Prop; label?: string; linked?: Prop[] }) {
  const all = linked ?? [prop];
  const origin = ctx.origin(prop);
  const own = ctx.own(prop);
  const name = label ?? propDef(prop).label;
  const kind = propDef(prop).kind;
  // Emails: the clients that ignore this property (Part 5.4).
  const ignored = ctx.email ? (propDef(prop).email || []).map((c) => CLIENT_LABEL[c]) : [];
  const scrubs = kind === "length" || kind === "number" || kind === "integer" || kind === "time";
  return (
    <div className="grid items-center gap-2" style={{ gridTemplateColumns: "88px minmax(0,1fr)" }}>
      <Scrub ctx={ctx} prop={prop} props={all} enabled={scrubs}>
        <span className={`flex min-w-0 items-center gap-1 text-[12px] ${ORIGIN_CLASS[origin]}`} title={ctx.source(prop)}>
          <span className="truncate">{name}</span>
          {ignored.length ? (
            <span role="img" aria-label={`${ignored.join(", ")} ${ignored.length === 1 ? "ignores" : "ignore"} this`} title={`${ignored.join(", ")} ${ignored.length === 1 ? "ignores" : "ignore"} this`} className="size-1.5 shrink-0 rounded-full bg-butter" />
          ) : null}
        </span>
      </Scrub>
      <div className="flex min-w-0 items-center gap-1">
        <Value ctx={ctx} prop={prop} props={all} label={name} />
        {own !== undefined ? (
          <button type="button" aria-label={`Reset ${name}`} title="Reset" onClick={() => ctx.write(all, "")} className="press flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <X size={11} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The current value to nudge from: this level's own, else what shows (when it's a plain number). */
const baseOf = (ctx: Ctx, prop: Prop) => {
  const own = ctx.own(prop);
  const shown = own ?? ctx.resolved[prop]?.value;
  const lit = shown ? literal(shown, new Map(ctx.vars.map((v) => [v.id, v]))) : undefined;
  return parseLength(lit) ? lit : undefined;
};
const unitOf = (prop: Prop) => (propDef(prop).kind === "length" && !propDef(prop).unitless ? "px" : "");

/** A label that changes the number when dragged: 1 a step, Shift 10, Alt 0.1. */
function Scrub({ ctx, prop, props, enabled, children }: { ctx: Ctx; prop: Prop; props: Prop[]; enabled: boolean; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <span
      className="cursor-ew-resize select-none"
      onPointerDown={(ev) => {
        ev.preventDefault();
        const start = ev.clientX;
        const base = baseOf(ctx, prop);
        const write = ctx.write;
        let last = 0;
        const move = (m: PointerEvent) => {
          const steps = Math.trunc((m.clientX - start) / 3);
          if (steps === last) return;
          last = steps;
          const next = nudgeValue(base, steps, { shift: m.shiftKey, alt: m.altKey }, unitOf(prop), prop);
          if (next) write(props, next, true);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      {children}
    </span>
  );
}

const WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];
const VAR_KIND: Partial<Record<string, Variable["kind"][]>> = { color: ["color"], length: ["length", "number"], font: ["font"], weight: ["number"], number: ["number"], shadow: ["shadow"] };

function Value({ ctx, prop, props, label }: { ctx: Ctx; prop: Prop; props: Prop[]; label: string }) {
  const d = propDef(prop);
  const own = ctx.own(prop);
  const r = ctx.resolved[prop];
  const varName = (v: string | undefined) => (v?.startsWith("$") ? ctx.vars.find((x) => `$${x.id}` === v)?.name : undefined);
  if (d.kind === "keyword" || d.kind === "weight" || d.kind === "font") {
    const opts =
      d.kind === "keyword"
        ? (d.keywords ?? []).map((k) => ({ value: k, label: k }))
        : d.kind === "weight"
          ? [...ctx.vars.filter((v) => v.kind === "number" && /weight/.test(v.id)).map((v) => ({ value: `$${v.id}`, label: v.name })), ...WEIGHTS.map((w) => ({ value: w, label: w }))]
          : [...ctx.vars.filter((v) => v.kind === "font").map((v) => ({ value: `$${v.id}`, label: v.name })), ...FONTS.map((f) => ({ value: fontStack(f.name), label: f.name }))];
    const shown = r ? (varName(r.value) ?? (d.kind === "font" ? (FONTS.find((f) => fontStack(f.name) === r.value)?.name ?? r.value.split(",")[0]) : r.value)) : "";
    return (
      <span className="min-w-0 flex-1">
        <Select<string> value={own ?? ""} options={opts} onChange={(v) => ctx.write(props, v)} ariaLabel={label} placeholder={shown || "Default"} className={`${PICK} ${own === undefined ? "text-muted" : ""}`} />
      </span>
    );
  }
  const kinds = VAR_KIND[d.kind];
  return (
    <>
      {d.kind === "color" ? <Swatch ctx={ctx} prop={prop} props={props} label={label} /> : null}
      <TextValue ctx={ctx} prop={prop} props={props} label={label} />
      {kinds && d.kind !== "color" ? <VarPick ctx={ctx} kinds={kinds} label={label} onPick={(v) => ctx.write(props, v)} /> : null}
    </>
  );
}

/** Text for any value: Enter or leaving the box saves, Escape puts it back, arrows nudge numbers, "16+8" is 24. */
function TextValue({ ctx, prop, props, label }: { ctx: Ctx; prop: Prop; props: Prop[]; label: string }) {
  const own = ctx.own(prop);
  const r = ctx.resolved[prop];
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  // Escape leaves the box without saving.
  const cancel = useRef(false);
  const name = (v: string | undefined) => (v?.startsWith("$") ? (ctx.vars.find((x) => `$${x.id}` === v)?.name ?? v) : v);
  const kind = propDef(prop).kind;
  const nudges = kind === "length" || kind === "number" || kind === "integer" || kind === "time";
  if (own?.startsWith("$") && draft === null)
    return (
      <span className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-full bg-lilac-wash pr-1 pl-2.5 text-[12px] font-medium text-lilac">
        <span className="truncate">{name(own)}</span>
        <button
          type="button"
          aria-label={`Detach ${label}`}
          title="Detach"
          onClick={() => ctx.write(props, literal(own, new Map(ctx.vars.map((v) => [v.id, v]))))}
          className="ml-auto flex size-5 items-center justify-center rounded-full hover:bg-lilac/10"
        >
          <X size={10} />
        </button>
      </span>
    );
  const commit = () => {
    if (cancel.current) return void (cancel.current = false);
    if (draft === null) return;
    const v = evalSum(draft);
    if (v === (own ?? "") || ctx.write(props, v)) {
      setDraft(null);
      setBad(false);
    } else setBad(true);
  };
  return (
    <input
      value={draft ?? own ?? ""}
      placeholder={r ? name(r.value) : ""}
      aria-label={label}
      aria-invalid={bad || undefined}
      title={bad ? "This value isn't allowed here" : undefined}
      onChange={(ev) => {
        setDraft(ev.target.value);
        setBad(false);
      }}
      onBlur={commit}
      onKeyDown={(ev) => {
        // Leaving the box saves, once.
        if (ev.key === "Enter") {
          (ev.target as HTMLInputElement).blur();
        } else if (ev.key === "Escape") {
          cancel.current = true;
          setDraft(null);
          setBad(false);
          (ev.target as HTMLInputElement).blur();
        } else if (nudges && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
          ev.preventDefault();
          const next = nudgeValue(draft !== null && parseLength(evalSum(draft)) ? evalSum(draft) : baseOf(ctx, prop), ev.key === "ArrowUp" ? 1 : -1, { shift: ev.shiftKey, alt: ev.altKey }, unitOf(prop), prop);
          if (next && ctx.write(props, next, true)) setDraft(null);
        }
      }}
      className={`${INPUT} min-w-0 flex-1 tabular-nums ${bad ? "border-rose" : ""}`}
    />
  );
}

/** A color's swatch: opens the variables, then any color typed. */
function Swatch({ ctx, prop, props, label }: { ctx: Ctx; prop: Prop; props: Prop[]; label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const r = ctx.resolved[prop];
  const map = new Map(ctx.vars.map((v) => [v.id, v]));
  const shown = r ? literal(r.value, map) : "transparent";
  return (
    <>
      <button ref={btn} type="button" aria-label={`${label} color`} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} className="press size-6 shrink-0 rounded-full border border-line-strong p-0.5">
        <span className="block size-full rounded-full" style={{ background: shown }} />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={`${label} color`} width={232}>
        <VarList
          vars={ctx.vars.filter((v) => v.kind === "color")}
          onPick={(v) => {
            ctx.write(props, v);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

function VarPick({ ctx, kinds, label, onPick }: { ctx: Ctx; kinds: Variable["kind"][]; label: string; onPick: (v: string) => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const list = ctx.vars.filter((v) => kinds.includes(v.kind));
  if (!list.length) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`${label} variable`}
        title="Variables"
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="press flex size-6 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
      >
        <Diamond size={12} />
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={`${label} variables`} width={232}>
        <VarList
          vars={list}
          onPick={(v) => {
            onPick(v);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

function VarList({ vars, onPick }: { vars: Variable[]; onPick: (v: string) => void }) {
  return (
    <ul className="flex max-h-[280px] flex-col overflow-y-auto py-1">
      {vars.map((v) => (
        <li key={v.id}>
          <button type="button" onClick={() => onPick(`$${v.id}`)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-hover">
            {v.kind === "color" ? <span className="size-4 shrink-0 rounded-full border border-line" style={{ background: v.value }} /> : null}
            <span className="flex-1 truncate">{v.name}</span>
            <span className="max-w-[90px] truncate font-mono text-[11px] text-muted">{v.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Spacing and borders ---------------------------------------------------------------------------------------------

/** Margin outside, padding inside. Drag a value to change it; Alt changes both sides, Shift+Alt all four. */
function BoxModel({ ctx }: { ctx: Ctx }) {
  const cell = (kind: "margin" | "padding", side: (typeof SIDES)[number]) => <BoxCell key={`${kind}-${side}`} ctx={ctx} kind={kind} side={side} />;
  return (
    <div className="relative rounded-lg border border-dashed border-line-strong bg-paper px-1.5 py-1">
      <span className="absolute top-1 left-2 text-[10.5px] text-faint">Margin</span>
      <div className="flex justify-center">{cell("margin", "top")}</div>
      <div className="flex items-center gap-1">
        {cell("margin", "left")}
        <div className="relative flex-1 rounded-md bg-card shadow-input px-1.5 py-1">
          <span className="absolute top-1 left-2 text-[10.5px] text-faint">Padding</span>
          <div className="flex justify-center">{cell("padding", "top")}</div>
          <div className="flex items-center justify-between gap-1">
            {cell("padding", "left")}
            <span className="h-5 flex-1 rounded-[3px] bg-paper-deep" />
            {cell("padding", "right")}
          </div>
          <div className="flex justify-center">{cell("padding", "bottom")}</div>
        </div>
        {cell("margin", "right")}
      </div>
      <div className="flex justify-center">{cell("margin", "bottom")}</div>
    </div>
  );
}

const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;

function BoxCell({ ctx, kind, side }: { ctx: Ctx; kind: "margin" | "padding"; side: (typeof SIDES)[number] }) {
  const prop = `${kind}-${side}` as Prop;
  const origin = ctx.origin(prop);
  const own = ctx.own(prop);
  const r = ctx.resolved[prop];
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const cancel = useRef(false);
  const group = (alt: boolean, shift: boolean): Prop[] => (alt && shift ? SIDES.map((s) => `${kind}-${s}` as Prop) : alt ? [prop, `${kind}-${OPPOSITE[side]}` as Prop] : [prop]);
  const shown = own ?? (r ? literal(r.value, new Map(ctx.vars.map((v) => [v.id, v]))) : "");
  const commit = () => {
    if (cancel.current) return void (cancel.current = false);
    if (draft === null) return;
    const v = evalSum(draft);
    if (ctx.write([prop], v)) {
      setDraft(null);
      setBad(false);
    } else setBad(true);
  };
  return (
    <input
      value={draft ?? (shown === "0px" ? "0" : shown.replace(/px$/, ""))}
      placeholder="0"
      aria-label={`${kind === "margin" ? "Margin" : "Padding"} ${side}`}
      title={ctx.source(prop)}
      aria-invalid={bad || undefined}
      onChange={(ev) => {
        setDraft(ev.target.value);
        setBad(false);
      }}
      onBlur={commit}
      onPointerDown={(ev) => {
        if (document.activeElement === ev.currentTarget) return;
        const startX = ev.clientX;
        const startY = ev.clientY;
        const base = baseOf(ctx, prop);
        const write = ctx.write;
        let last = 0;
        let moved = false;
        const move = (m: PointerEvent) => {
          const steps = Math.trunc((m.clientX - startX - (m.clientY - startY)) / 3);
          if (!moved && Math.abs(m.clientX - startX) + Math.abs(m.clientY - startY) < 3) return;
          moved = true;
          m.preventDefault();
          if (steps === last) return;
          last = steps;
          const next = nudgeValue(base, steps, {}, "px", prop);
          if (next) write(group(m.altKey, m.shiftKey), next, true);
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
      onKeyDown={(ev) => {
        // Leaving the box saves, once.
        if (ev.key === "Enter") {
          (ev.target as HTMLInputElement).blur();
        } else if (ev.key === "Escape") {
          cancel.current = true;
          setDraft(null);
          (ev.target as HTMLInputElement).blur();
        } else if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
          ev.preventDefault();
          const next = nudgeValue(baseOf(ctx, prop), ev.key === "ArrowUp" ? 1 : -1, { shift: ev.shiftKey }, "px", prop);
          if (next && ctx.write([prop], next, true)) setDraft(null);
        }
      }}
      className={`h-5 w-10 cursor-ns-resize rounded-[3px] bg-transparent text-center text-[11.5px] tabular-nums outline-none hover:bg-hover focus:cursor-text focus:bg-card ${ORIGIN_CLASS[origin]} ${bad ? "ring-1 ring-rose" : ""}`}
    />
  );
}

/** Borders: one width, style and color for every side and one radius for every corner, or each apart. */
function Borders({ ctx }: { ctx: Ctx }) {
  const own = (p: Prop) => ctx.own(p);
  const apart =
    SIDES.some((s) => ["width", "style", "color"].some((k) => own(`border-${s}-${k}` as Prop) !== own(`border-top-${k}` as Prop))) ||
    ["top-right", "bottom-right", "bottom-left"].some((c) => own(`border-${c}-radius` as Prop) !== own("border-top-left-radius"));
  const [each, setEach] = useState(apart);
  const all = (k: string) => SIDES.map((s) => `border-${s}-${k}` as Prop);
  const corners: Prop[] = ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"];
  return (
    <div className="flex flex-col gap-1.5">
      {each || apart ? (
        <>
          {SIDES.map((s) => (
            <div key={s} className="flex flex-col gap-1.5">
              <span className="pt-1 text-[11.5px] font-medium text-body capitalize">{s}</span>
              <PropRow ctx={ctx} prop={`border-${s}-width` as Prop} label="Width" />
              <PropRow ctx={ctx} prop={`border-${s}-style` as Prop} label="Style" />
              <PropRow ctx={ctx} prop={`border-${s}-color` as Prop} label="Color" />
            </div>
          ))}
          <span className="pt-1 text-[11.5px] font-medium text-body">Corners</span>
          {corners.map((p) => (
            <PropRow key={p} ctx={ctx} prop={p} label={shortLabel(p).replace(/^Corner /, "")} />
          ))}
        </>
      ) : (
        <>
          <PropRow ctx={ctx} prop="border-top-width" label="Width" linked={all("width")} />
          <PropRow ctx={ctx} prop="border-top-style" label="Style" linked={all("style")} />
          <PropRow ctx={ctx} prop="border-top-color" label="Color" linked={all("color")} />
          <PropRow ctx={ctx} prop="border-top-left-radius" label="Corners" linked={corners} />
        </>
      )}
      {apart ? null : (
        <button type="button" aria-pressed={each} onClick={() => setEach((x) => !x)} className="self-start text-[12px] text-muted hover:text-ink">
          {each ? "Same on every side" : "Each side"}
        </button>
      )}
    </div>
  );
}
