"use client";

// The inspector (docs/form-studio.md 2.1 and 2.2). A field selected: Content, Validation, Style, Data and Logic, each
// control saving at once through an op. Several selected: what they share. Nothing selected: the form's own settings.

import { useState } from "react";
import { countryNames } from "@/lib/forms/countries";
import type { Op } from "@/lib/forms/ops";
import { parseFormula } from "@/lib/forms/formula";
import {
  CALC_INPUTS,
  CONTACT_KEYS,
  FIELD_TYPES,
  isChoice,
  isContent,
  newId,
  OP_KIND,
  opsFor,
  questionKey,
  WIDTHS,
  type Calc,
  type Cond,
  type Field,
  type FieldKey,
  type FieldType,
  type FieldWidth,
  type Form,
  type Rule,
  type Validation,
} from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { Copy, Plus, Trash, X } from "../../Icons";
import { AreaIn, NumRow, Pick, Row, Section, Seg, Switch, TagInput, TextIn, INPUT } from "./controls";
import { condFor, formWidth, iconFor, nameOf, opsOf, ruleSources, ruleValues, setShownOps, shownMode, WIDTH_LABEL, type Shown } from "./editorModel";
import { AlignCenter, AlignLeft, ElementIcon } from "./icons";
import { Options } from "./Options";
import { SavesTo, type SavesToProps } from "./SavesTo";
import type { SourceRow } from "./shared";

type ITab = "content" | "validation" | "style" | "data" | "logic";
const TAB_LABEL: Record<ITab, string> = { content: "Content", validation: "Validation", style: "Style", data: "Data", logic: "Logic" };

export type InspectorProps = {
  form: Form;
  apply: (op: Op | Op[]) => void;
  custom: CustomField[];
  sources: SourceRow[];
  selected: string[];
  onDuplicate: (id: string) => void;
  onRemove: (ids: string[]) => void;
  /** What the Saves to picker needs for CRM fields and "+ New field". */
  link?: Pick<SavesToProps, "session" | "workspaceId" | "sb" | "onFieldAdded">;
};

export function Inspector(props: InspectorProps) {
  const { form, selected } = props;
  const [tab, setTab] = useState<ITab>("content");
  const fields = form.steps.flatMap((s) => s.fields);
  const sel = selected.map((id) => fields.find((f) => f.id === id)).filter((f): f is Field => !!f);
  if (sel.length > 1) return <Several {...props} fields={sel} />;
  if (sel.length === 1) return <FieldPanel {...props} f={sel[0]} tab={tab} setTab={setTab} />;
  return <FormPanel form={form} apply={props.apply} />;
}

function tabsFor(f: Field): ITab[] {
  if (f.type === "divider") return ["style", "logic"];
  if (isContent(f.type)) return ["content", "style", "logic"];
  if (f.type === "hidden") return ["content", "data"];
  if (f.type === "calc") return ["content", "style", "data", "logic"];
  const checks = !["choice", "dropdown", "checkbox", "country", "rating", "multi"].includes(f.type);
  return ["content", ...(checks ? (["validation"] as ITab[]) : []), "style", "data", "logic"];
}

function Header({ icon, title, children }: { icon?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-3">
      {icon ? <ElementIcon name={icon} size={14} className="text-muted" /> : null}
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {children}
    </div>
  );
}

const iconBtn = "press flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-35";

function FieldPanel({ form, apply, custom, sources, link, f, tab, setTab, onDuplicate, onRemove }: InspectorProps & { f: Field; tab: ITab; setTab: (t: ITab) => void }) {
  const tabs = tabsFor(f);
  const open = tabs.includes(tab) ? tab : tabs[0];
  const patch = (p: Partial<Omit<Field, "id">>) => apply({ op: "update_field", id: f.id, patch: p });
  const typeName = FIELD_TYPES.find((t) => t.value === f.type)?.label ?? f.type;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header icon={iconFor(f)} title={typeName}>
        <button type="button" aria-label="Duplicate" title="Duplicate" onClick={() => onDuplicate(f.id)} className={iconBtn}>
          <Copy size={13} />
        </button>
        <button type="button" aria-label="Delete" title="Delete" disabled={f.key === "email"} onClick={() => onRemove([f.id])} className={`${iconBtn} hover:bg-rose-wash hover:text-rose`}>
          <Trash size={13} />
        </button>
      </Header>
      <div role="tablist" aria-label="Field settings" className="flex h-9 shrink-0 items-end gap-0.5 border-b border-line px-2">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={open === t}
            onClick={() => setTab(t)}
            className={`relative h-8 px-2 text-[12px] font-medium transition-colors duration-[140ms] ${open === t ? "text-ink after:absolute after:right-2 after:bottom-0 after:left-2 after:h-0.5 after:rounded-full after:bg-ink" : "text-muted hover:text-ink"}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={TAB_LABEL[open]} className="min-h-0 flex-1 overflow-y-auto">
        {open === "content" ? <ContentTab form={form} f={f} patch={patch} /> : null}
        {open === "validation" ? <ValidationTab f={f} patch={patch} /> : null}
        {open === "style" ? <StyleTab form={form} f={f} patch={patch} /> : null}
        {open === "data" ? <DataTab form={form} f={f} patch={patch} custom={custom} sources={sources} link={link} /> : null}
        {open === "logic" ? <LogicTab form={form} f={f} apply={apply} /> : null}
      </div>
    </div>
  );
}

type PatchFn = (p: Partial<Omit<Field, "id">>) => void;
const TEXTY = ["text", "email", "phone", "textarea", "number", "url", "date"];

// Content -------------------------------------------------------------------------------------------------------

function ContentTab({ form, f, patch }: { form: Form; f: Field; patch: PatchFn }) {
  if (isContent(f.type)) return <BlockContent f={f} patch={patch} />;
  const taken = new Set(
    form.steps
      .flatMap((s) => s.fields)
      .filter((x) => x.id !== f.id)
      .map((x) => x.key as string),
  );
  const setType = (t: FieldType) => {
    const contact = CONTACT_KEYS.find((c) => c.key === f.key);
    const key: FieldKey = contact && !contact.types.includes(t) ? questionKey(f.label, taken) : f.key;
    patch({ type: t, key, default: undefined, valid: undefined, rating: t === "rating" ? (f.rating ?? { scale: 5, style: "stars" }) : undefined });
  };
  if (f.type === "hidden")
    return (
      <Section first>
        <Row label="Label">
          <TextIn label="Label" value={f.label} onChange={(v) => patch({ label: v })} />
        </Row>
      </Section>
    );
  if (f.type === "calc") return <CalcContent form={form} f={f} patch={patch} />;
  const types = FIELD_TYPES.filter((t) => !isContent(t.value) && t.value !== "hidden" && t.value !== "calc");
  return (
    <>
      <Section first>
        <Row label="Type">
          <Pick<string> label="Type" value={f.type} options={types} onChange={(t) => setType(t as FieldType)} />
        </Row>
        <Row label="Label">
          <TextIn label="Label" value={f.label} onChange={(v) => patch({ label: v })} />
        </Row>
        {f.type !== "checkbox" ? <Switch label="Hide label" on={!!f.hideLabel} onChange={(v) => patch({ hideLabel: v || undefined })} /> : null}
        {TEXTY.includes(f.type) || f.type === "dropdown" || f.type === "country" ? (
          <Row label="Placeholder">
            <TextIn label="Placeholder" value={f.placeholder ?? ""} onChange={(v) => patch({ placeholder: v || undefined })} />
          </Row>
        ) : null}
        <Row label="Help text">
          <TextIn label="Help text" value={f.help ?? ""} onChange={(v) => patch({ help: v || undefined })} />
        </Row>
        <DefaultValue f={f} patch={patch} />
        {form.capture ? (
          <Row label="Name on form">
            <TextIn label="Name on your form" mono value={f.source ?? ""} placeholder="email" onChange={(v) => patch({ source: v.trim() || undefined })} />
          </Row>
        ) : null}
      </Section>
      <Section title="Required">
        <Switch label="Required" on={f.required} disabled={f.key === "email"} onChange={(v) => patch({ required: v })} />
        {f.required ? (
          <Row label="Message">
            <TextIn
              label="Required message"
              value={f.valid?.requiredMessage ?? ""}
              placeholder="Fill this in."
              onChange={(v) => patch({ valid: cleanValid({ ...f.valid, requiredMessage: v || undefined }) })}
            />
          </Row>
        ) : null}
      </Section>
      {isChoice(f.type) ? (
        <Section title="Options">
          <Options field={f} form={form} patch={patch} />
        </Section>
      ) : null}
      {f.type === "rating" ? (
        <Section title="Rating">
          <NumRow
            label="Scale"
            value={f.rating?.scale ?? 5}
            min={3}
            max={10}
            onChange={(v) => v !== undefined && patch({ rating: { ...(f.rating ?? { style: "stars" }), scale: v } as Field["rating"] })}
          />
          <Row label="Style">
            <Seg
              label="Rating style"
              value={f.rating?.style ?? "stars"}
              options={[
                { value: "stars", label: "Stars" },
                { value: "numbers", label: "Numbers" },
              ]}
              onChange={(style) => patch({ rating: { ...(f.rating ?? { scale: 5 }), style } as Field["rating"] })}
            />
          </Row>
          <Row label="Low label">
            <TextIn
              label="Low label"
              value={f.rating?.low ?? ""}
              placeholder="Not likely"
              onChange={(v) => patch({ rating: { ...(f.rating ?? { scale: 5, style: "stars" }), low: v || undefined } })}
            />
          </Row>
          <Row label="High label">
            <TextIn
              label="High label"
              value={f.rating?.high ?? ""}
              placeholder="Very likely"
              onChange={(v) => patch({ rating: { ...(f.rating ?? { scale: 5, style: "stars" }), high: v || undefined } })}
            />
          </Row>
        </Section>
      ) : null}
    </>
  );
}

function DefaultValue({ f, patch }: { f: Field; patch: PatchFn }) {
  if (f.type === "checkbox" || f.type === "multi") return null;
  const NONE = "__none";
  if (f.type === "choice" || f.type === "dropdown" || f.type === "rating") {
    const options =
      f.type === "rating"
        ? Array.from({ length: f.rating?.scale ?? 5 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
        : (f.options ?? []).map((o) => ({ value: o.value, label: o.label }));
    return (
      <Row label="Default">
        <Pick<string> label="Default value" value={f.default ?? NONE} options={[{ value: NONE, label: "None" }, ...options]} onChange={(v) => patch({ default: v === NONE ? undefined : v })} />
      </Row>
    );
  }
  return (
    <Row label="Default">
      <TextIn label="Default value" value={f.default ?? ""} placeholder={f.type === "date" ? "YYYY-MM-DD" : f.type === "country" ? "US" : ""} onChange={(v) => patch({ default: v || undefined })} />
    </Row>
  );
}

function BlockContent({ f, patch }: { f: Field; patch: PatchFn }) {
  const c = f.content ?? {};
  const set = (p: Partial<NonNullable<Field["content"]>>) => patch({ content: { ...c, ...p } });
  return (
    <Section first>
      {f.type === "heading" ? (
        <>
          <Row label="Text">
            <TextIn label="Heading text" value={c.text ?? ""} onChange={(text) => set({ text })} />
          </Row>
          <Row label="Level">
            <Seg
              label="Heading level"
              value={String(c.level ?? 2)}
              options={[
                { value: "1", label: "H1" },
                { value: "2", label: "H2" },
                { value: "3", label: "H3" },
              ]}
              onChange={(v) => set({ level: Number(v) as 1 | 2 | 3 })}
            />
          </Row>
        </>
      ) : null}
      {f.type === "paragraph" ? (
        <Row label="Text" top>
          <AreaIn label="Text" rows={5} value={c.text ?? ""} onChange={(text) => set({ text })} />
        </Row>
      ) : null}
      {f.type === "image" ? (
        <>
          <Row label="Address">
            <TextIn label="Image address" mono value={c.src ?? ""} placeholder="https://" onChange={(src) => set({ src })} />
          </Row>
          {c.src && !/^https:\/\//.test(c.src) ? <p className="text-[12px] text-rose">Use an address starting with https://</p> : null}
          <Row label="Alt text">
            <TextIn label="Alt text" value={c.alt ?? ""} onChange={(alt) => set({ alt: alt || undefined })} />
          </Row>
        </>
      ) : null}
    </Section>
  );
}

// Validation ----------------------------------------------------------------------------------------------------

function cleanValid(v: Validation | undefined): Validation | undefined {
  if (!v) return undefined;
  const out = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== "" && !(Array.isArray(x) && !x.length))) as Validation;
  return Object.keys(out).length ? out : undefined;
}

function ValidationTab({ f, patch }: { f: Field; patch: PatchFn }) {
  const v = f.valid ?? {};
  const set = (p: Partial<Validation>) => patch({ valid: cleanValid({ ...v, ...p }) });
  const chars = f.type === "text" || f.type === "textarea" || f.type === "url";
  const [countries] = useState(() => countryNames("en"));
  return (
    <>
      <Section first>
        {chars ? (
          <>
            <NumRow label="Min length" value={v.min} empty min={0} max={5000} onChange={(min) => set({ min })} placeholder="None" unit="ch" />
            <NumRow label="Max length" value={v.max} empty min={1} max={5000} onChange={(max) => set({ max })} placeholder="None" unit="ch" />
          </>
        ) : null}
        {f.type === "number" ? (
          <>
            <NumRow label="Min" value={v.min} empty onChange={(min) => set({ min })} placeholder="None" />
            <NumRow label="Max" value={v.max} empty onChange={(max) => set({ max })} placeholder="None" />
            <NumRow label="Step" value={v.step} empty min={0} step={0.5} onChange={(step) => set({ step: step || undefined })} placeholder="Any" />
          </>
        ) : null}
        {f.type === "email" ? (
          <>
            <Switch label="Work email only" on={f.check === "work_email"} onChange={(on) => patch({ check: on ? "work_email" : undefined })} />
            <Row label="Domains" top>
              <TagInput
                label="Allowed domains"
                values={v.domains ?? []}
                placeholder="acme.com"
                clean={(d) => {
                  const x = d.trim().toLowerCase().replace(/^@/, "");
                  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x) ? x : null;
                }}
                onChange={(domains) => set({ domains })}
              />
            </Row>
          </>
        ) : null}
        {f.type === "phone" ? (
          <Row label="Country">
            <Pick<string>
              label="Default country"
              value={v.country ?? "__any"}
              options={[{ value: "__any", label: "Any" }, ...countries]}
              onChange={(c) => set({ country: c === "__any" ? undefined : c })}
            />
          </Row>
        ) : null}
        {f.type === "date" ? (
          <>
            <DayRow label="Earliest" value={v.earliest} onChange={(earliest) => set({ earliest })} />
            <DayRow label="Latest" value={v.latest} onChange={(latest) => set({ latest })} />
            <Switch label="Weekdays only" on={!!v.weekdays} onChange={(weekdays) => set({ weekdays: weekdays || undefined })} />
          </>
        ) : null}
        {f.type === "url" ? <Switch label="https only" on={!!v.https} onChange={(https) => set({ https: https || undefined })} /> : null}
      </Section>
      <Section title="Error">
        <Row label="Message">
          <TextIn label="Error message" value={v.message ?? ""} placeholder="Default" onChange={(message) => set({ message: message || undefined })} />
        </Row>
      </Section>
    </>
  );
}

/** A day as YYYY-MM-DD, saved once it's a whole date (or cleared). */
function DayRow({ label, value, onChange }: { label: string; value?: string; onChange: (v: string | undefined) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const bad = draft !== null && draft !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(draft);
  return (
    <Row label={label}>
      <input
        value={draft ?? value ?? ""}
        aria-label={label}
        placeholder="YYYY-MM-DD"
        aria-invalid={bad}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          if (!t) onChange(undefined);
          else if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t))) onChange(t);
        }}
        onBlur={() => setDraft(null)}
        className={`${INPUT} font-mono text-[12px] ${bad ? "border-rose" : ""}`}
      />
    </Row>
  );
}

// Style ---------------------------------------------------------------------------------------------------------

const WIDTH_TITLE: Record<FieldWidth, string> = { full: "Full width", half: "Half width", third: "One third", two_thirds: "Two thirds" };

function StyleTab({ f, patch }: { form: Form; f: Field; patch: PatchFn }) {
  const block = isContent(f.type);
  return (
    <Section first>
      {!block ? (
        <>
          <Row label="Width">
            <Seg<FieldWidth>
              label="Width"
              value={f.width ?? "full"}
              options={WIDTHS.map((w) => ({ value: w, label: WIDTH_LABEL[w], title: WIDTH_TITLE[w] }))}
              onChange={(w) => patch({ width: w === "full" ? undefined : w })}
            />
          </Row>
          {f.type !== "checkbox" ? (
            <Row label="Label">
              <Seg
                label="Label position"
                value={f.labels ?? "inherit"}
                options={[
                  { value: "inherit", label: "Form" },
                  { value: "above", label: "Above" },
                  { value: "inside", label: "Inside" },
                ]}
                onChange={(l) => patch({ labels: l === "inherit" ? undefined : l })}
              />
            </Row>
          ) : null}
          <Row label="Size">
            <Seg
              label="Size"
              value={f.size ?? "md"}
              options={[
                { value: "sm", label: "S", title: "Small" },
                { value: "md", label: "M", title: "Medium" },
                { value: "lg", label: "L", title: "Large" },
              ]}
              onChange={(s) => patch({ size: s === "md" ? undefined : s })}
            />
          </Row>
        </>
      ) : null}
      {f.type === "heading" || f.type === "paragraph" || f.type === "image" ? (
        <Row label="Align">
          <Seg
            label="Align"
            value={f.content?.align ?? "left"}
            options={[
              { value: "left", label: <AlignLeft size={13} />, title: "Left" },
              { value: "center", label: <AlignCenter size={13} />, title: "Center" },
            ]}
            onChange={(a) => patch({ content: { ...f.content, align: a === "center" ? "center" : undefined } })}
          />
        </Row>
      ) : null}
      <Switch label="Hide on phone" on={!!f.hideOnPhone} onChange={(v) => patch({ hideOnPhone: v || undefined })} />
    </Section>
  );
}

// Data ----------------------------------------------------------------------------------------------------------

const HIDDEN_FROM = [
  { value: "param", label: "URL parameter" },
  { value: "page", label: "Page address" },
  { value: "referrer", label: "Referrer" },
  { value: "static", label: "Fixed value" },
] as const;

function DataTab({ form, f, patch, custom, sources, link }: { form: Form; f: Field; patch: PatchFn; custom: CustomField[]; sources: SourceRow[]; link?: InspectorProps["link"] }) {
  return (
    <>
      {f.type === "hidden" ? (
        <Section first title="Value">
          <Row label="From">
            <Pick<string>
              label="Value from"
              value={f.hidden?.from ?? "param"}
              options={HIDDEN_FROM.map((h) => ({ value: h.value, label: h.label }))}
              onChange={(from) =>
                patch({
                  hidden: {
                    from: from as NonNullable<Field["hidden"]>["from"],
                    ...(from === "param" ? { name: f.hidden?.name || "utm_source" } : {}),
                    ...(from === "static" ? { value: f.hidden?.value ?? "" } : {}),
                  },
                })
              }
            />
          </Row>
          {f.hidden?.from === "param" || !f.hidden ? (
            <Row label="Parameter">
              <TextIn label="Parameter" mono value={f.hidden?.name ?? ""} placeholder="utm_source" onChange={(name) => patch({ hidden: { from: "param", name } })} />
            </Row>
          ) : f.hidden.from === "static" ? (
            <Row label="Value">
              <TextIn label="Fixed value" value={f.hidden.value ?? ""} onChange={(value) => patch({ hidden: { from: "static", value } })} />
            </Row>
          ) : null}
        </Section>
      ) : null}
      <Section first={f.type !== "hidden"} title="Saves to">
        <SavesTo field={f} form={form} custom={custom} sources={sources} onChange={(p) => patch(p)} {...link} />
      </Section>
      {f.type !== "hidden" ? (
        <Section>
          <Switch label="Fill from URL" on={!!f.prefill} onChange={(v) => patch({ prefill: v || undefined })} />
          {f.prefill ? <p className="font-mono text-[11.5px] text-muted">?{f.key.replace(/^[fq]\./, "")}=</p> : null}
        </Section>
      ) : null}
    </>
  );
}

// Logic ---------------------------------------------------------------------------------------------------------

function LogicTab({ form, f, apply }: { form: Form; f: Field; apply: (op: Op | Op[]) => void }) {
  const sources = ruleSources(form, f.id);
  const mode = shownMode(form, f.id);
  const shownRules = form.rules.filter((r) => r.then.field === f.id && r.then.action !== "require");
  const reqRules = form.rules.filter((r) => r.then.field === f.id && r.then.action === "require");
  const canRequire = !isContent(f.type) && f.type !== "hidden" && !f.required;
  if (!sources.length) return <p className="px-3 py-4 text-[12.5px] text-muted">Add another field first.</p>;
  const addRule = (action: Rule["then"]["action"]) => apply({ op: "set_rule", rule: { id: newId(), when: { field: sources[0].id, op: "filled" }, then: { action, field: f.id } } });
  return (
    <>
      {f.key !== "email" ? (
        <Section first title="Show this field">
          <Seg<Shown>
            label="Show this field"
            value={mode}
            options={[
              { value: "always", label: "Always" },
              { value: "show", label: "Show when" },
              { value: "hide", label: "Hide when" },
            ]}
            onChange={(m) => apply(setShownOps(form, f.id, m, newId()))}
          />
          {mode !== "always" && shownRules.length > 1 ? <MatchSeg f={f} apply={apply} /> : null}
          {mode !== "always" ? <RuleList form={form} rules={shownRules} sources={sources} apply={apply} onAdd={() => addRule(mode)} all={f.logic === "all"} /> : null}
        </Section>
      ) : null}
      {canRequire ? (
        <Section first={f.key === "email"} title="Require when">
          {reqRules.length > 1 ? <MatchSeg f={f} apply={apply} /> : null}
          {reqRules.length ? (
            <RuleList form={form} rules={reqRules} sources={sources} apply={apply} onAdd={() => addRule("require")} all={f.logic === "all"} />
          ) : (
            <button type="button" onClick={() => addRule("require")} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover">
              <Plus size={12} />
              Add condition
            </button>
          )}
        </Section>
      ) : null}
    </>
  );
}

/** Whether a field's conditions all have to hold, or any one. */
function MatchSeg({ f, apply }: { f: Field; apply: (op: Op | Op[]) => void }) {
  return (
    <Seg
      label="Match"
      value={f.logic ?? "any"}
      options={[
        { value: "any", label: "Any" },
        { value: "all", label: "All" },
      ]}
      onChange={(m) => apply({ op: "update_field", id: f.id, patch: { logic: m === "all" ? "all" : undefined } })}
    />
  );
}

function RuleList({ form, rules, sources, apply, onAdd, all = false }: { form: Form; rules: Rule[]; sources: Field[]; apply: (op: Op | Op[]) => void; onAdd: () => void; all?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rules.map((r, i) => (
        <div key={r.id} className="flex flex-col gap-1.5">
          {i > 0 ? <span className="pl-1 text-[11px] font-medium text-muted">{all ? "and" : "or"}</span> : null}
          <RuleRow form={form} rule={r} sources={sources} apply={apply} />
        </div>
      ))}
      <button type="button" onClick={onAdd} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover">
        <Plus size={12} />
        Add condition
      </button>
    </div>
  );
}

function RuleRow({ rule: r, sources, apply }: { form: Form; rule: Rule; sources: Field[]; apply: (op: Op | Op[]) => void }) {
  const put = (next: Partial<Rule>) => apply({ op: "set_rule", rule: { ...r, ...next } });
  const group = r.group;
  const setGroup = (g: Rule["group"] | undefined) => {
    const rest: Rule = { id: r.id, when: r.when, then: r.then };
    apply({ op: "set_rule", rule: g?.when.length ? { ...rest, group: g } : rest });
  };
  const fresh = (): Cond => ({ field: sources[0].id, op: "filled" });
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-paper p-2">
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1">
          <CondEditor label="When" c={r.when} sources={sources} onChange={(when) => put({ when })} />
        </span>
        <button
          type="button"
          aria-label="Remove condition"
          title="Remove"
          onClick={() => apply({ op: "remove_rule", id: r.id })}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint hover:bg-rose-wash hover:text-rose"
        >
          <X size={11} />
        </button>
      </div>
      {group ? (
        <div className="flex flex-col gap-1.5 border-l-2 border-line pl-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted">and</span>
            <Seg
              label="Group match"
              value={group.logic}
              options={[
                { value: "all", label: "All" },
                { value: "any", label: "Any" },
              ]}
              onChange={(logic) => setGroup({ ...group, logic })}
            />
            <span className="text-[11px] font-medium text-muted">of</span>
          </div>
          {group.when.map((c, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="min-w-0 flex-1">
                <CondEditor label={`Group ${i + 1}`} c={c} sources={sources} onChange={(next) => setGroup({ ...group, when: group.when.map((x, k) => (k === i ? next : x)) })} />
              </span>
              <button
                type="button"
                aria-label={`Remove group condition ${i + 1}`}
                title="Remove"
                onClick={() => setGroup({ ...group, when: group.when.filter((_, k) => k !== i) })}
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-faint hover:bg-rose-wash hover:text-rose"
              >
                <X size={11} />
              </button>
            </div>
          ))}
          {group.when.length < 5 ? (
            <button type="button" onClick={() => setGroup({ ...group, when: [...group.when, fresh()] })} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover">
              <Plus size={12} />
              Add to group
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={() => setGroup({ logic: "any", when: [fresh()] })} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12px] font-medium text-ink hover:bg-hover">
          <Plus size={12} />
          Add group
        </button>
      )}
    </div>
  );
}

/** One condition: the field, how it compares, and the value the comparison needs. */
function CondEditor({ c, sources, onChange, label }: { c: Cond; sources: Field[]; onChange: (c: Cond) => void; label: string }) {
  const src = sources.find((x) => x.id === c.field);
  const values = ruleValues(src);
  const kind = OP_KIND[c.op];
  const pickField = (field: string) => {
    const next = sources.find((x) => x.id === field);
    onChange(condFor({ field, op: "filled" }, next && opsFor(next.type).includes(c.op) && OP_KIND[c.op] !== "any" ? c.op : "filled", next));
  };
  return (
    <div className="flex flex-col gap-1">
      <Pick<string> label={`${label} field`} value={c.field} options={sources.map((x) => ({ value: x.id, label: nameOf(x) }))} onChange={pickField} />
      <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-1">
        <Pick<string> label={`${label} condition`} value={c.op} options={opsOf(src)} onChange={(op) => onChange(condFor(c, op as Cond["op"], src))} />
        {c.op === "filled" || c.op === "empty" ? null : kind === "any" ? (
          values ? (
            <Pick<string> label={`${label} value`} value={c.value ?? ""} placeholder="Pick" options={values} onChange={(value) => onChange({ ...c, value })} />
          ) : (
            <TextIn label={`${label} value`} value={c.value ?? ""} onChange={(value) => onChange({ ...c, value })} />
          )
        ) : kind === "list" ? (
          values ? (
            <Pick<string>
              label={`${label} add choice`}
              value=""
              placeholder="Add"
              options={values.filter((v) => !c.values?.includes(v.value))}
              onChange={(v) => onChange({ ...c, values: [...(c.values ?? []), v] })}
            />
          ) : (
            <TagInput
              label={`${label} choices`}
              values={c.values ?? []}
              placeholder={src?.type === "country" ? "US" : "Value"}
              clean={(v) => (src?.type === "country" ? (/^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase() : null) : v.trim() || null)}
              onChange={(vals) => onChange({ ...c, values: vals })}
            />
          )
        ) : c.op === "between" ? (
          <span className="grid grid-cols-2 gap-1">
            <TextIn label={`${label} from`} mono value={c.value ?? ""} onChange={(value) => onChange({ ...c, value })} />
            <TextIn label={`${label} to`} mono value={c.value2 ?? ""} onChange={(value2) => onChange({ ...c, value2 })} />
          </span>
        ) : (
          <TextIn
            label={`${label} value`}
            mono={kind !== "text"}
            value={c.value ?? ""}
            placeholder={c.op === "within_days" ? "Days" : kind === "date" ? "YYYY-MM-DD" : ""}
            onChange={(value) => onChange({ ...c, value })}
          />
        )}
      </div>
      {kind === "list" && values && c.values?.length ? (
        <div className="flex flex-wrap gap-1">
          {c.values.map((v) => (
            <span key={v} className="inline-flex h-5 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2 text-[11.5px] text-ink">
              {values.find((x) => x.value === v)?.label ?? v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange({ ...c, values: c.values!.filter((x) => x !== v) })} className="text-faint hover:text-ink">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Calculations --------------------------------------------------------------------------------------------------

function CalcContent({ form, f, patch }: { form: Form; f: Field; patch: PatchFn }) {
  const c: Calc = f.calc ?? { formula: "0" };
  const set = (p: Partial<Calc>) => {
    const next = { ...c, ...p } as Calc;
    for (const k of Object.keys(next) as (keyof Calc)[]) if (next[k] === undefined) delete next[k];
    patch({ calc: next });
  };
  const inputs = form.steps.flatMap((s) => s.fields).filter((x) => x.id !== f.id && CALC_INPUTS.includes(x.type));
  const parsed = parseFormula(c.formula);
  const gone = "refs" in parsed ? parsed.refs.filter((r) => !inputs.some((x) => x.id === r)) : [];
  return (
    <>
      <Section first>
        <Row label="Label">
          <TextIn label="Label" value={f.label} onChange={(v) => patch({ label: v })} />
        </Row>
        <Switch label="Hide label" on={!!f.hideLabel} onChange={(v) => patch({ hideLabel: v || undefined })} />
        <Switch label="Show on form" on={c.show !== false} onChange={(v) => set({ show: v ? undefined : false })} />
      </Section>
      <Section title="Formula">
        <AreaIn label="Formula" rows={3} value={c.formula} placeholder="{seats} * 40" onChange={(formula) => set({ formula })} />
        {"error" in parsed ? (
          <p className="text-[12px] text-rose">{parsed.error}</p>
        ) : gone.length ? (
          <p className="text-[12px] text-rose">No field {gone.map((g) => `{${g}}`).join(", ")}</p>
        ) : parsed.refs.length ? (
          <p className="text-[12px] break-words text-muted">{c.formula.replace(/\{\s*([a-z0-9]+)\s*\}/g, (_, id: string) => nameOf(inputs.find((x) => x.id === id)!))}</p>
        ) : null}
        {inputs.length ? (
          <div className="flex flex-wrap gap-1">
            {inputs.map((x) => (
              <button
                key={x.id}
                type="button"
                title={`Add {${x.id}}`}
                onClick={() => set({ formula: `${c.formula.trim() === "0" ? "" : c.formula}${c.formula.trim() && c.formula.trim() !== "0" ? " " : ""}{${x.id}}` })}
                className="press inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-line bg-card px-2 text-[11.5px] text-ink hover:border-line-strong"
              >
                <ElementIcon name={iconFor(x)} size={11} className="text-muted" />
                <span className="truncate">{nameOf(x)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Format">
        <Row label="Show as">
          <Seg
            label="Show as"
            value={c.format ?? "number"}
            options={[
              { value: "number", label: "Number" },
              { value: "money", label: "Money" },
              { value: "percent", label: "%" },
            ]}
            onChange={(v) => set({ format: v === "number" ? undefined : v, currency: v === "money" ? (c.currency ?? "USD") : undefined })}
          />
        </Row>
        {c.format === "money" ? (
          <Row label="Currency">
            <TextIn label="Currency" mono value={c.currency ?? "USD"} placeholder="USD" onChange={(v) => set({ currency: v.trim().toUpperCase().slice(0, 3) || undefined })} />
          </Row>
        ) : null}
        <NumRow label="Decimals" value={c.decimals} empty min={0} max={4} placeholder="Auto" onChange={(decimals) => set({ decimals })} />
      </Section>
    </>
  );
}

// Several selected ----------------------------------------------------------------------------------------------

function Several({ fields, apply, onRemove }: InspectorProps & { fields: Field[] }) {
  const sizable = fields.filter((f) => !isContent(f.type) && f.type !== "hidden");
  const widths = new Set(sizable.map((f) => f.width ?? "full"));
  const req = sizable.filter((f) => f.key !== "email");
  const removable = fields.filter((f) => f.key !== "email");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header title={`${fields.length} selected`}>
        <button
          type="button"
          aria-label="Delete selected"
          title="Delete"
          disabled={!removable.length}
          onClick={() => onRemove(removable.map((f) => f.id))}
          className={`${iconBtn} hover:bg-rose-wash hover:text-rose`}
        >
          <Trash size={13} />
        </button>
      </Header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section first>
          {sizable.length ? (
            <Row label="Width">
              <Seg<FieldWidth | "mixed">
                label="Width"
                value={widths.size === 1 ? [...widths][0] : "mixed"}
                options={WIDTHS.map((w) => ({ value: w, label: WIDTH_LABEL[w], title: WIDTH_TITLE[w] }))}
                onChange={(w) => apply(sizable.map((f) => ({ op: "update_field", id: f.id, patch: { width: w === "full" ? undefined : (w as FieldWidth) } })))}
              />
            </Row>
          ) : null}
          {req.length ? <Switch label="Required" on={req.every((f) => f.required)} onChange={(v) => apply(req.map((f) => ({ op: "update_field", id: f.id, patch: { required: v } })))} /> : null}
          <Switch
            label="Hide on phone"
            on={fields.every((f) => f.hideOnPhone)}
            onChange={(v) => apply(fields.map((f) => ({ op: "update_field", id: f.id, patch: { hideOnPhone: v || undefined } })))}
          />
        </Section>
      </div>
    </div>
  );
}

// Nothing selected: the form ------------------------------------------------------------------------------------

function FormPanel({ form, apply }: { form: Form; apply: (op: Op | Op[]) => void }) {
  const l = form.layout;
  const widthMode = l.maxWidth ? "custom" : l.width;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header title="Form" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section first title="Text">
          <Row label="Title">
            <TextIn label="Title" value={form.title ?? ""} onChange={(title) => apply({ op: "set_copy", title })} />
          </Row>
          <Row label="Intro" top>
            <AreaIn label="Intro" rows={3} value={form.intro ?? ""} onChange={(intro) => apply({ op: "set_copy", intro })} />
          </Row>
          <Row label="Button">
            <TextIn label="Button text" value={form.submit.label} onChange={(submit) => apply({ op: "set_copy", submit })} />
          </Row>
          <Switch label="Full-width button" on={!!form.submit.full} onChange={(submitFull) => apply({ op: "set_copy", submitFull })} />
        </Section>
        <Section title="Layout">
          <Row label="Labels">
            <Seg
              label="Labels"
              value={l.labels}
              options={[
                { value: "above", label: "Above" },
                { value: "inside", label: "Inside" },
              ]}
              onChange={(labels) => apply({ op: "set_layout", labels })}
            />
          </Row>
          <Row label="Width">
            <Seg
              label="Form width"
              value={widthMode}
              options={[
                { value: "narrow", label: "Narrow" },
                { value: "wide", label: "Wide" },
                { value: "custom", label: "Custom" },
              ]}
              onChange={(w) => apply(w === "custom" ? { op: "set_layout", maxWidth: formWidth(l) } : { op: "set_layout", width: w, maxWidth: null })}
            />
          </Row>
          {l.maxWidth ? <NumRow label="Max width" value={l.maxWidth} min={280} max={1200} step={10} unit="px" onChange={(v) => v !== undefined && apply({ op: "set_layout", maxWidth: v })} /> : null}
          <Row label="Progress">
            <Seg
              label="Step progress"
              value={l.progress ?? "bar"}
              options={[
                { value: "bar", label: "Bar" },
                { value: "dots", label: "Dots" },
                { value: "none", label: "None" },
              ]}
              onChange={(progress) => apply({ op: "set_layout", progress })}
            />
          </Row>
        </Section>
        {form.steps.length > 2 ? (
          <Section title="Skip steps">
            {form.steps.slice(0, -2).map((s, i) => (
              <StepSkip key={s.id} form={form} index={i} apply={apply} />
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

/** After a step: go on to the next one, or jump ahead to a later step when a condition holds. */
function StepSkip({ form, index, apply }: { form: Form; index: number; apply: (op: Op | Op[]) => void }) {
  const skip = form.steps[index].skip;
  const sources = form.steps.slice(0, index + 1).flatMap((s) => s.fields).filter((f) => !isContent(f.type));
  const set = (next: NonNullable<typeof skip> | null) => apply({ op: "update_step", index, skip: next });
  const later = form.steps.map((_, k) => k).filter((k) => k > index + 1);
  return (
    <div className="flex flex-col gap-1.5">
      <Row label={`After ${index + 1}`}>
        <Pick<string>
          label={`After step ${index + 1}`}
          value={skip ? String(skip.to) : "next"}
          options={[{ value: "next", label: `Step ${index + 2}` }, ...later.map((k) => ({ value: String(k), label: `Skip to step ${k + 1}` }))]}
          onChange={(v) => (v === "next" ? set(null) : sources[0] && set({ when: skip?.when ?? { field: sources[0].id, op: "filled" }, to: Number(v) }))}
        />
      </Row>
      {skip ? (
        <div className="rounded-lg border border-line bg-paper p-2">
          <CondEditor label="Skip when" c={skip.when} sources={sources} onChange={(when) => set({ ...skip, when })} />
        </div>
      ) : null}
    </div>
  );
}
