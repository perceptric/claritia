"use client";

// The email builder's Style panel (docs/design-system.md Parts 5.2 and 5.4): the same sections and inputs as forms
// (src/components/app/forms/StylePanel.tsx), on email parts, with only what email clients can draw and a mark on
// what some clients ignore. Styles go on this element, one of its email classes, or every email on the design system.

import { useState } from "react";
import { sourceText } from "@/lib/design/cascade";
import { addEmailClass, emailOrigin, emailOwnValue, emailSetsAny, removeEmailClass, resetEmailPart, setEmailProp, type EmailEdit } from "@/lib/design/email/edit";
import type { EmailDoc } from "@/lib/design/email/doc";
import { findEl } from "@/lib/design/email/ops";
import { emailPartDef, emailPartsOf, type EmailPartKey } from "@/lib/design/email/parts";
import { resolveEmail, type EmailBp, type EmailState } from "@/lib/design/email/style";
import type { Level } from "@/lib/design/edit";
import { allVariables, type DesignSystem } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";
import { Plus, Refresh, X } from "../../Icons";
import { askText, tell } from "../Dialogs";
import { Select } from "../Select";
import { PICK } from "../forms/controls";
import { Sections, type StyleCtx } from "../forms/StylePanel";

const KIND_LABEL: Record<string, string> = { email: "Email", section: "Section", column: "Column" };

export function EmailStylePanel({
  system,
  doc,
  tokens,
  bp,
  hasKit,
  selected,
  part,
  onPart,
  state,
  onState,
  onEdit,
}: {
  system: DesignSystem;
  doc: EmailDoc;
  tokens: Partial<Tokens>;
  bp: EmailBp;
  hasKit: boolean;
  selected: string | null;
  part: EmailPartKey | null;
  onPart: (p: EmailPartKey) => void;
  state?: EmailState;
  onState: (s: EmailState | undefined) => void;
  onEdit: (e: EmailEdit, merge?: string) => void;
}) {
  const [picked, setPicked] = useState<{ id: string; level: Level }>({ id: "", level: { kind: "element" } });
  const f = selected ? findEl(doc, selected) : null;
  const id = f ? selected! : "email";
  const kind = f?.block ? f.block.type : f?.column ? "column" : f ? "section" : "email";
  const parts = emailPartsOf(kind);
  if (!parts.length) return <p className="px-4 py-10 text-center text-[12.5px] text-muted">This block has no styles</p>;
  const p = part && parts.includes(part) ? part : parts[0]!;
  const on = doc.classes?.[id] ?? [];
  const classes = system.email?.classes ?? [];
  let level: Level = picked.id === id ? picked.level : { kind: "element" };
  if (!hasKit || (level.kind === "class" && !on.includes(level.id))) level = { kind: "element" };
  const setLevel = (l: Level) => setPicked({ id, level: l });
  const e: EmailEdit = { system, doc };
  const resolved = resolveEmail(system, doc, { id, part: p }, bp, state);
  const levelKey = level.kind === "class" ? `c${level.id}` : level.kind;
  const ctx: StyleCtx = {
    email: true,
    vars: allVariables(system, tokens),
    resolved,
    own: (x) => emailOwnValue(e, level, id, p, bp, state, x),
    origin: (x) => emailOrigin(e, level, id, p, bp, state, x),
    source: (x) => {
      const r = resolved[x];
      if (!r) return undefined;
      if (r.source.level === "class") return sourceText(r.source, { ...system, classes: classes.map((c) => ({ ...c, styles: {} })) });
      return sourceText(r.source, system).replace("Form default", "Email default");
    },
    setsAny: (ps) => emailSetsAny(e, level, id, p, bp, state, ps),
    write: (ps, value, merge) => {
      let next: EmailEdit | null = e;
      for (const x of ps) next = next && setEmailProp(next, tokens, level, id, p, bp, state, x, value);
      if (!next) return false;
      onEdit(next, merge ? `${id}:${p}:${ps.join()}:${levelKey}:${bp}:${state ?? ""}` : undefined);
      return true;
    },
  };
  const add = async () => {
    const name = await askText("Add a class", { placeholder: "Class name", ok: "Add" });
    if (!name?.trim()) return;
    const r = addEmailClass(e, id, name);
    if ("error" in r) return void tell(r.error);
    onEdit(r);
    const c = r.system.email?.classes.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (c) setLevel({ kind: "class", id: c.id });
  };
  const chip = (active: boolean, tone: "ink" | "sky" | "muted") =>
    `press inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors duration-[140ms] ${
      active ? (tone === "sky" ? "bg-sky text-paper" : "bg-ink text-paper") : tone === "sky" ? "bg-sky-wash text-sky" : "bg-paper-deep text-body hover:text-ink"
    }`;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-line px-3 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="max-w-[45%] truncate text-[12.5px] font-medium text-ink">{KIND_LABEL[kind] ?? emailPartDef(parts[0]!).label}</span>
          <span className="min-w-0 flex-1">
            <Select<EmailPartKey> value={p} options={parts.map((x) => ({ value: x, label: emailPartDef(x).label }))} onChange={onPart} ariaLabel="Part" className={PICK} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted">{bp === "base" ? "Desktop" : "Phone"}</span>
          <span className="min-w-0 flex-1">
            <Select<string>
              value={state ?? ""}
              options={[
                { value: "", label: "No state" },
                { value: "hover", label: "Hover" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(v) => onState(v ? (v as EmailState) : undefined)}
              ariaLabel="State"
              className={PICK}
            />
          </span>
          <button type="button" aria-label="Reset this part" title="Reset this part" onClick={() => onEdit(resetEmailPart(e, level, id, p))} className="press flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
            <Refresh size={13} />
          </button>
        </div>
        <div role="radiogroup" aria-label="Style goes on" className="flex flex-wrap items-center gap-1">
          <button type="button" role="radio" aria-checked={level.kind === "element"} onClick={() => setLevel({ kind: "element" })} className={chip(level.kind === "element", "ink")}>
            {kind === "email" ? "This email" : "This one"}
          </button>
          {hasKit
            ? on.map((cid) => {
                const c = classes.find((x) => x.id === cid);
                if (!c) return null;
                const active = level.kind === "class" && level.id === cid;
                return (
                  <span key={cid} className={chip(active, "sky")}>
                    <button type="button" role="radio" aria-checked={active} onClick={() => setLevel({ kind: "class", id: cid })} className="truncate">
                      {c.name}
                    </button>
                    <button type="button" aria-label={`Remove ${c.name}`} title="Remove class" onClick={() => onEdit(removeEmailClass(e, id, cid))} className="-mr-1 opacity-70 hover:opacity-100">
                      <X size={10} />
                    </button>
                  </span>
                );
              })
            : null}
          {hasKit ? (
            <button type="button" aria-label="Add a class" title="Add a class" onClick={() => void add()} className="press inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-[12px] text-muted hover:border-ink hover:text-ink">
              <Plus size={11} />
              Class
            </button>
          ) : null}
          {hasKit ? (
            <button type="button" role="radio" aria-checked={level.kind === "global"} onClick={() => setLevel({ kind: "global" })} className={chip(level.kind === "global", "muted")}>
              All emails
            </button>
          ) : null}
        </div>
      </div>
      <Sections ctx={ctx} />
    </div>
  );
}
