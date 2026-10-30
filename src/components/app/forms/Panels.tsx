"use client";

// Build's 400 px panel (docs/forms-plan.md), made like Calendar's meeting type panel: closed sections with an icon
// tile, a title and one gray line saying what's set, one open at a time, and a footer pinned to the bottom. A
// question: Question, Type, Choices, Saves to, Show when, Fill in for them, with Previous and Next. Nothing picked:
// Content, Layout, Styling and After submit. The button: its text and width.

import { useRef, useState } from "react";
import { cleanColor } from "@/lib/forms/brand";
import { linesToOptions, nextOption } from "./editorModel";
import { overwriteOf } from "@/lib/forms/overwrite";
import { condText, type Op } from "@/lib/forms/ops";
import { allFields, isChoice, type Choice, type Field, type Overwrite } from "@/lib/forms/schema";
import { customKindsFor } from "@/lib/forms/savesTo";
import { FIELD_KINDS } from "@/lib/records/fields";
import { VENDOR, isCrmVendor, type CrmProperty } from "@/lib/sources/properties";
import { BrandLogo } from "../BrandLogo";
import { askLines } from "../Dialogs";
import { errorText, must, postJson } from "../ui";
import { Eyebrow, Labeled, PanelFooter, PanelSection, TextLink } from "../scheduling/panel";
import type { BuildProps } from "./Build";
import { autoMap, choiceRows, claritiaDests, crmDests, earlierChoices, isChoiceKind, issuesOf, kindInfo, kindOf, kindPatch, KINDS, known, knownOp, paramOf, questionsOf, rulesReading, saveName, showOps, showRules, splitNameOps, submissionKey, type Q } from "./formModel";
import { Ic } from "./ic";
import { AREA, Box, Dd, GHOST_SM, IB, IN, IN_SM, Seg, type DdItem, Tg } from "./parts";

/** The panel's frame: the eyebrow and title, its buttons, the sections that scroll, and the footer. */
function Shell({ eyebrow, title, actions, footer, children, label }: { eyebrow: string; title: string; actions?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode; label: string }) {
  return (
    <aside aria-label={label} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-[4px] border-b border-line pt-[14px] pr-[10px] pb-[12px] pl-[20px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <Eyebrow>{eyebrow}</Eyebrow>
          <b className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</b>
        </div>
        {actions}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer}
    </aside>
  );
}

const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex min-h-[28px] items-center justify-between gap-[12px] text-[13px] text-ink">
    <span className="min-w-0">{label}</span>
    {children}
  </div>
);

const WHEN: { value: Overwrite; label: string }[] = [
  { value: "always", label: "Overwrite" },
  { value: "if_empty", label: "Fill if empty" },
  { value: "never", label: "Never change it" },
];

// The question panel ------------------------------------------------------------------------------------------------

export function QuestionPanel(p: BuildProps & { q: Q; qs: Q[]; issueCtx: Parameters<typeof issuesOf>[1]; onDuplicate: () => void }) {
  const { q, qs, form, apply, pick, setPick, setStep } = p;
  const f = q.field;
  const open = pick?.open ?? null;
  const toggle = (k: string) => setPick({ id: q.id, open: open === k ? null : k });
  const info = kindInfo(q.kind, f?.type);
  const issues = f ? issuesOf(f, p.issueCtx) : [];
  const at = qs.findIndex((x) => x.id === q.id);
  const go = (by: number) => {
    const n = qs[at + by];
    if (!n) return;
    setStep(n.step);
    setPick({ id: n.id, open: open && ["q", "type", "opts", "save", "show", "fill"].includes(open) ? open : "q" });
  };
  const patch = (x: Partial<Field>, id = f?.id) => id && apply({ op: "update_field", id, patch: x });

  let sections: React.ReactNode;
  if (q.kind === "consent") sections = <ConsentSection {...p} open={open === "q"} onToggle={() => toggle("q")} />;
  else if (!f) sections = null;
  else if (q.kind === "heading" || q.kind === "para")
    sections = (
      <>
        <PanelSection icon={<Ic n="para" />} title={q.kind === "heading" ? "Heading" : "Text"} summary={f.content?.text || f.label} open={open === "q"} onToggle={() => toggle("q")}>
          <Labeled label="Text">
            <textarea className={AREA} rows={2} value={f.content?.text ?? ""} onChange={(e) => patch({ content: { ...f.content, text: e.target.value } })} />
          </Labeled>
        </PanelSection>
        <ShowSection {...p} f={f} open={open === "show"} onToggle={() => toggle("show")} />
      </>
    );
  else
    sections = (
      <>
        <QuestionSection {...p} f={f} open={open === "q"} onToggle={() => toggle("q")} bad={issues.some((i) => i.where === "q")} />
        {q.pair ? null : <TypeSection {...p} f={f} open={open === "type"} onToggle={() => toggle("type")} />}
        {isChoiceKind(q.kind) ? <ChoicesSection {...p} f={f} open={open === "opts"} onToggle={() => toggle("opts")} bad={issues.some((i) => i.where === "opts")} /> : null}
        <SavesSection {...p} f={f} open={open === "save"} onToggle={() => toggle("save")} issues={issues.filter((i) => i.where === "save")} />
        {q.kind === "email" || q.kind === "hidden" ? null : <ShowSection {...p} f={f} open={open === "show"} onToggle={() => toggle("show")} />}
        <FillSection {...p} f={f} open={open === "fill"} onToggle={() => toggle("fill")} />
      </>
    );

  return (
    <Shell
      label="Question"
      eyebrow={`${info.l}${form.steps.length > 1 ? `, step ${q.step + 1}` : ""}`}
      title={q.label || info.l}
      actions={
        <>
          {f && !q.pair ? (
            <button type="button" className={IB} onClick={p.onDuplicate} title="Duplicate" aria-label="Duplicate">
              <Ic n="dup" />
            </button>
          ) : null}
          <button type="button" className={IB} onClick={() => p.onRemove(q.id)} title="Delete" aria-label="Delete">
            <Ic n="trash" />
          </button>
          <button type="button" className={IB} onClick={() => setPick(null)} title="Close" aria-label="Close">
            <Ic n="x" />
          </button>
        </>
      }
      footer={
        <PanelFooter>
          <span className="text-[12px] text-muted">{p.saving === "offline" ? "Kept here until saved" : "Changes save as you go"}</span>
          <span className="flex-1" />
          <button type="button" className={GHOST_SM} onClick={() => go(-1)} disabled={at <= 0}>
            <Ic n="back" />
            Previous
          </button>
          <button type="button" className={GHOST_SM} onClick={() => go(1)} disabled={at >= qs.length - 1}>
            Next
            <Ic n="flow" />
          </button>
        </PanelFooter>
      }
    >
      {sections}
    </Shell>
  );
}

type SectionProps = BuildProps & { q: Q; f: Field; open: boolean; onToggle: () => void };

function QuestionSection(p: SectionProps & { bad: boolean }) {
  const { q, f, apply, form } = p;
  const set = (patch: Partial<Field>, id = f.id) => apply({ op: "update_field", id, patch });
  const email = q.kind === "email";
  return (
    <PanelSection icon={<Ic n="text" />} title="Question" summary={`${q.label || "No question yet"}${f.required ? ", required" : ", optional"}`} tone={p.bad ? "bad" : undefined} open={p.open} onToggle={p.onToggle}>
      {q.pair ? (
        <>
          <Labeled label="First name">
            <input className={IN} value={f.label} onChange={(e) => set({ label: e.target.value })} autoFocus />
          </Labeled>
          <Labeled label="Last name">
            <input className={IN} value={q.pair.label} onChange={(e) => set({ label: e.target.value }, q.pair!.id)} />
          </Labeled>
        </>
      ) : (
        <Labeled label="Question">
          <input className={IN} value={f.label} onChange={(e) => set({ label: e.target.value })} autoFocus aria-label="Question" />
        </Labeled>
      )}
      {f.type !== "hidden" ? (
        <Labeled label="Help text">
          <input className={IN} value={f.help ?? ""} placeholder="None" onChange={(e) => set({ help: e.target.value || undefined })} />
        </Labeled>
      ) : null}
      {!isChoice(f.type) && f.type !== "hidden" && !q.pair ? (
        <Labeled label="Placeholder">
          <input className={IN} value={f.placeholder ?? ""} placeholder="None" onChange={(e) => set({ placeholder: e.target.value || undefined })} />
        </Labeled>
      ) : null}
      {q.kind === "name" ? (
        <Line label="First and last name apart">
          <Tg label="First and last name apart" on={!!q.pair} onChange={(v) => apply(splitNameOps(form, q, v), v ? "First and last name apart" : "One name box")} />
        </Line>
      ) : null}
      {f.type !== "hidden" ? (
        <>
          <Line label="Required">
            <Tg label="Required" on={f.required} disabled={email} onChange={(v) => apply([{ op: "update_field", id: f.id, patch: { required: v } }, ...(q.pair ? [{ op: "update_field" as const, id: q.pair.id, patch: { required: v } }] : [])])} />
          </Line>
          {email ? <span className="-mt-[8px] text-[12px] text-muted">The email question is always required</span> : null}
        </>
      ) : null}
    </PanelSection>
  );
}

function TypeSection(p: SectionProps) {
  const { q, f, form, apply } = p;
  const info = kindInfo(q.kind, f.type);
  const otherEmail = allFields(form).some((x) => x.key === "email" && x.id !== f.id);
  return (
    <PanelSection icon={<Ic n={info.i} />} title="Type" summary={info.l} open={p.open} onToggle={p.onToggle}>
      <div className="-ml-[8px] grid grid-cols-2 gap-[2px]">
        {KINDS.filter((k) => k.g !== "Other" || k.v === "hidden").map((k) => {
          const on = k.v === q.kind;
          const patch = on ? null : kindPatch(form, f, k.v);
          return (
            <button
              key={k.v}
              type="button"
              disabled={!on && (!patch || (k.v === "email" && otherEmail))}
              onClick={() => patch && apply({ op: "update_field", id: f.id, patch }, `${f.label || "The question"} is ${k.l.toLowerCase()} now`)}
              className={`flex h-[34px] items-center gap-[8px] rounded-lg px-[8px] text-left text-[12.5px] text-ink disabled:text-faint ${on ? "bg-hover" : "enabled:hover:bg-hover"}`}
            >
              <span className="inline-flex size-[24px] shrink-0 items-center justify-center rounded-[7px] bg-paper-deep text-body">
                <Ic n={k.i} s={13} />
              </span>
              {k.l}
              {on ? <Ic n="check" className="ml-auto" /> : null}
            </button>
          );
        })}
      </div>
    </PanelSection>
  );
}

function ChoicesSection(p: SectionProps & { bad: boolean }) {
  const { f, apply } = p;
  const opts = f.options ?? [];
  const [drag, setDrag] = useState<number | null>(null);
  const set = (options: Choice[]) => apply({ op: "update_field", id: f.id, patch: { options } });
  return (
    <PanelSection icon={<Ic n="radio" />} title="Choices" summary={`${opts.length} ${opts.length === 1 ? "choice" : "choices"}${f.other ? ", plus Other" : ""}`} tone={p.bad ? "bad" : undefined} open={p.open} onToggle={p.onToggle}>
      <div className="flex flex-col gap-[4px]">
        {opts.map((o, i) => (
          <div
            key={`${i}:${o.value}`}
            className={`flex items-center gap-[6px] ${drag === i ? "opacity-50" : ""}`}
            draggable
            onDragStart={() => setDrag(i)}
            onDragEnd={() => setDrag(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag === null || drag === i) return;
              const next = [...opts];
              const [moved] = next.splice(drag, 1);
              next.splice(i, 0, moved!);
              set(next);
              setDrag(null);
            }}
          >
            <span className="inline-flex cursor-grab text-faint" aria-hidden="true">
              <Ic n="grip" />
            </span>
            <input
              className={IN_SM}
              value={o.label}
              aria-label={`Choice ${i + 1}`}
              onChange={(e) => set(opts.map((x, j) => (j === i ? { ...x, label: e.target.value, value: x.value === x.label ? e.target.value : x.value } : x)))}
            />
            <button type="button" className="press inline-flex size-[24px] shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" onClick={() => set(opts.filter((_, j) => j !== i))} aria-label={`Remove ${o.label}`} title="Remove">
              <Ic n="x" s={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-[6px]">
        <button type="button" className={GHOST_SM} onClick={() => set([...opts, { value: nextOption(opts), label: nextOption(opts) }])}>
          <Ic n="plus" />
          Add a choice
        </button>
        <button
          type="button"
          className={GHOST_SM}
          onClick={async () => {
            const text = await askLines("Paste a list", { initial: opts.map((o) => o.label).join("\n"), placeholder: "One choice per line", ok: "Use these" });
            if (text) set(linesToOptions(text, opts));
          }}
        >
          Paste a list
        </button>
      </div>
      <Line label={'Add "Other" with a text box'}>
        <Tg label={'Add "Other" with a text box'} on={!!f.other} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { other: v || undefined } })} />
      </Line>
      {f.type !== "multi" ? (
        <Labeled label="Show as">
          <Seg label="Show as" value={f.type === "dropdown" ? "dropdown" : "choice"} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { type: v } })} options={[{ value: "choice", label: "Buttons" }, { value: "dropdown", label: "Dropdown" }]} />
        </Labeled>
      ) : null}
    </PanelSection>
  );
}

function SavesSection(p: SectionProps & { issues: ReturnType<typeof issuesOf> }) {
  const { f, form, apply, custom, crm, sb, ws } = p;
  const [search, setSearch] = useState("");
  const [crmSearch, setCrmSearch] = useState("");
  const [error, setError] = useState("");
  const set = (patch: Partial<Field>) => apply({ op: "update_field", id: f.id, patch });
  const dests = claritiaDests(form, f, custom);
  const sub = f.key.startsWith("q.");
  const policy = overwriteOf(f);
  const link = f.crm;
  const linked = link ? crm.ctx.get(link.source) : undefined;
  const prop = link && linked?.props ? linked.props.find((x) => x.name === link.property) : undefined;
  const crmName = linked?.name ?? crm.crms[0]?.name ?? "CRM";
  const vendor = (id: string) => crm.crms.find((s) => s.id === id)?.kind ?? "";
  const logo = (id: string, size = 18) => {
    const k = vendor(id);
    return isCrmVendor(k) ? <BrandLogo domain={VENDOR[k].domain} name={VENDOR[k].label} size={size} /> : null;
  };
  const removed = !!link && !!linked?.props && !prop;
  const misfit = p.issues.find((i) => i.lvl === "bad" && !(link && i.t.includes(crmName)));
  const rules = rulesReading(p.routing, f);
  const whenWord = policy ? WHEN.find((w) => w.value === policy)?.label.toLowerCase() : null;
  const summary = p.issues[0]?.t ?? (f.type === "hidden" ? saveName(f, custom) : `${saveName(f, custom)}${whenWord ? `, ${whenWord}` : ""}${link ? `, ${crmName} ${prop?.label || link.label || link.property}` : ""}`);

  const newField = async () => {
    const label = (search.trim() || f.label.replace(/\?$/, "") || "New field").slice(0, 60);
    const kind = customKindsFor(f.type)[0] ?? "text";
    setError("");
    try {
      const options = kind === "select" || kind === "multi_select" ? (f.options ?? []).map((o) => ({ value: o.value.slice(0, 200), label: o.label.slice(0, 60) })) : [];
      const made = must(await sb.rpc("field_add", { p_ws: ws.id, p_object: "contact", p_label: label, p_type: kind, p_options: options })) as { key: string };
      p.onCustom({ key: made.key, label, type: kind, options } as never);
      apply({ op: "update_field", id: f.id, patch: { key: `f.${made.key}`, overwrite: undefined } }, `Made the contact field ${label}`);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const items: DdItem[] = [
    { kind: "option", key: "sub", label: "Only this submission", on: sub, onPick: () => set({ key: submissionKey(form, f), overwrite: undefined }), search: "only this submission" },
    { kind: "group", label: "Contact" },
    ...dests.filter((d) => d.group === "Contact").map((d): DdItem => ({ kind: "option", key: d.id, label: d.label, on: f.key === d.id, why: d.why && f.key !== d.id ? d.why : null, onPick: () => set({ key: d.id as Field["key"], overwrite: undefined }), search: d.label })),
    ...(dests.some((d) => d.group === "Custom fields") ? [{ kind: "group" as const, label: "Custom fields" }] : []),
    ...dests.filter((d) => d.group === "Custom fields").map((d): DdItem => ({ kind: "option", key: d.id, label: d.label, on: f.key === d.id, why: d.why && f.key !== d.id ? d.why : null, onPick: () => set({ key: d.id as Field["key"], overwrite: undefined }), search: d.label })),
    { kind: "add", key: "new", label: `New contact field "${(search.trim() || f.label.replace(/\?$/, "") || "New field").slice(0, 60)}"`, hint: FIELD_KINDS.find((k) => k.value === (customKindsFor(f.type)[0] ?? "text"))?.label ?? kindInfo(kindOf(f), f.type).l, onPick: () => void newField() },
  ];
  const crmItems: DdItem[] = [
    { kind: "option", key: "none", label: "Don't send", on: !link, onPick: () => set({ crm: undefined }), search: "don't send" },
    ...crm.crms.flatMap((s): DdItem[] => {
      const c = crm.ctx.get(s.id);
      const props = c?.props;
      return [
        { kind: "group", label: <>{logo(s.id, 12)}{s.name}</> },
        ...(props
          ? crmDests(form, f, s.id, props).map((d): DdItem => ({ kind: "option", key: `${s.id}:${d.name}`, label: d.label, on: link?.source === s.id && link.property === d.name, why: d.why, onPick: () => set({ crm: { source: s.id, property: d.name, label: d.label } }), search: d.label }))
          : [{ kind: "option" as const, key: `${s.id}:loading`, label: crm.errors[s.id] ?? "Reading its fields", why: " ", onPick: () => {} }]),
      ];
    }),
  ];
  return (
    <PanelSection icon={<Ic n="data" />} title="Saves to" summary={summary} tone={p.issues.some((i) => i.lvl === "bad") ? "bad" : p.issues.length ? "warn" : undefined} open={p.open} onToggle={p.onToggle}>
      <Labeled label="In Claritia">
        <Dd ariaLabel="Saves to in Claritia" label={saveName(f, custom)} items={items} search={search} onSearch={setSearch} />
        {misfit ? (
          <Box tone="bad" title={misfit.t.replace(/: /, " ").replace(/^./, (c) => c.toUpperCase())}>
            <span className="text-body">Answers stay on the submission until you pick another field or change the type</span>
          </Box>
        ) : null}
        {error ? <Box tone="bad" title={error} /> : null}
      </Labeled>
      {!sub && policy && f.type !== "hidden" ? (
        <Labeled label="If the contact already has a value">
          <Seg label="If the contact already has a value" value={policy} onChange={(v) => set({ overwrite: v })} options={WHEN} />
        </Labeled>
      ) : null}
      {crm.crms.length ? (
        <Labeled label={`Also send to ${crm.crms.length === 1 ? crmName : "a CRM"}`}>
          <Dd ariaLabel={`Also send to ${crmName}`} label={link ? <>{logo(link.source)}{prop?.label || link.label || link.property}</> : "Don't send"} items={crmItems} search={crmSearch} onSearch={setCrmSearch} />
          {removed ? (
            <Box tone="bad" title={`${link!.label || link!.property} was removed in ${crmName}`}>
              <span className="text-body">{`New answers stay in Claritia. Pick another ${crmName} field.`}</span>
            </Box>
          ) : null}
          {link && prop && isChoice(f.type) && prop.options?.length && (prop.kind === "enum" || prop.kind === "multi") ? <ChoiceMap f={f} prop={prop} crmName={crmName} apply={apply} /> : null}
        </Labeled>
      ) : null}
      {rules.length ? (
        <Box tone="info" title={<><Ic n="flow" s={12} />{`Routing's ${rules[0]} rule reads this`}</>} />
      ) : null}
    </PanelSection>
  );
}

/** Each choice and the CRM value it goes as, with Match them for me. */
function ChoiceMap({ f, prop, crmName, apply }: { f: Field; prop: CrmProperty; crmName: string; apply: BuildProps["apply"] }) {
  const { rows, missing } = choiceRows(f, prop);
  const map = (value: string, to: string) => apply({ op: "update_field", id: f.id, patch: { crm: { ...f.crm!, map: { ...(f.crm!.map ?? {}), [value]: to } } } });
  return (
    <Box tone={missing ? "warn" : "info"} title={missing ? `${missing} ${missing === 1 ? "choice isn't" : "choices aren't"} in ${crmName}` : `Choices match ${crmName}`}>
      {missing ? <span className="mb-[2px] text-body">{`Pick the ${crmName} value for each. Unmatched answers stay in Claritia.`}</span> : null}
      <div className="flex w-full flex-col gap-[8px]">
        {rows.map((r) => (
          <div key={r.value} className="grid w-full grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-[8px]">
            <span className="truncate text-body">{r.label}</span>
            <Ic n="flow" s={12} />
            <Dd
              sm
              ariaLabel={`${crmName} value for ${r.label}`}
              label={r.mapped ? (prop.options?.find((o) => o.value === r.mapped)?.label ?? r.mapped) : <span className="text-muted">Not sent</span>}
              items={[
                ...(prop.options ?? []).map((o): DdItem => ({ kind: "option", key: o.value, label: o.label, on: r.mapped === o.value, onPick: () => map(r.value, o.value) })),
                { kind: "option", key: "", label: <span className="text-muted">Don&apos;t send</span>, on: r.picked && !r.mapped, onPick: () => map(r.value, "") },
              ]}
            />
          </div>
        ))}
      </div>
      {missing ? (
        <button type="button" className={`${GHOST_SM} mt-[4px]`} onClick={() => apply({ op: "update_field", id: f.id, patch: { crm: { ...f.crm!, map: autoMap(f, prop) } } }, "Matched the choices")}>
          <Ic n="wand" />
          Match them for me
        </button>
      ) : null}
    </Box>
  );
}

function ShowSection(p: SectionProps) {
  const { f, form, apply } = p;
  const { rules, simple } = showRules(form, f.id);
  const before = earlierChoices(form, f.id);
  const [mode, setMode] = useState<"always" | "when">(rules.length ? "when" : "always");
  const labelOf = (id: string) => allFields(form).find((x) => x.id === id)?.label || "a question";
  const src = simple ? allFields(form).find((x) => x.id === simple.when.field) : undefined;
  const summary = rules.length ? `When ${condText(rules[0]!.when, labelOf)}${rules.length > 1 ? `, +${rules.length - 1} more` : ""}` : "Always";
  const setWhen = (w: { field: string; op: "is" | "is_not"; value: string }) => apply(showOps(form, f.id, w));
  return (
    <PanelSection icon={<Ic n="branch" />} title="Show when" summary={summary} open={p.open} onToggle={p.onToggle}>
      <Seg
        label="Show when"
        value={rules.length ? "when" : mode}
        onChange={(v) => {
          setMode(v);
          if (v === "always") apply(showOps(form, f.id, null), "Shows always");
          else if (before.length) {
            const last = before[before.length - 1]!;
            setWhen({ field: last.id, op: "is", value: last.options?.[0]?.value ?? "" });
          }
        }}
        options={[{ value: "always", label: "Always" }, { value: "when", label: "Only when" }]}
      />
      {(rules.length || mode === "when") && !simple && rules.length ? (
        <Box tone="info" title={summary} />
      ) : (rules.length || mode === "when") && !before.length ? (
        <Box tone="info">
          <span>Add a choice question before this one to show it only for some answers</span>
        </Box>
      ) : simple ? (
        <>
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-[6px]">
            <Dd sm ariaLabel="Question" label={src?.label || "Question"} items={before.map((x): DdItem => ({ kind: "option", key: x.id, label: x.label || "Question", on: x.id === simple.when.field, onPick: () => setWhen({ field: x.id, op: simple.when.op as "is" | "is_not", value: x.options?.[0]?.value ?? "" }) }))} />
            <Dd sm ariaLabel="Is or isn't" label={simple.when.op === "is" ? "is" : "isn't"} items={(["is", "is_not"] as const).map((o): DdItem => ({ kind: "option", key: o, label: o === "is" ? "is" : "isn't", on: simple.when.op === o, onPick: () => setWhen({ field: simple.when.field, op: o, value: simple.when.value ?? "" }) }))} />
            <Dd sm ariaLabel="Answer" label={src?.options?.find((o) => o.value === simple.when.value)?.label ?? (simple.when.value || "Choice")} items={(src?.options ?? []).map((o): DdItem => ({ kind: "option", key: o.value, label: o.label, on: o.value === simple.when.value, onPick: () => setWhen({ field: simple.when.field, op: simple.when.op as "is" | "is_not", value: o.value }) }))} />
          </div>
          <span className="text-[12px] text-muted">Hidden questions are skipped, even when required</span>
        </>
      ) : null}
    </PanelSection>
  );
}

function FillSection(p: SectionProps) {
  const { f, form, apply } = p;
  const k = known(form, f);
  const param = paramOf(f);
  const summary = f.type === "hidden" ? `From ?${param} in the page address` : [k.on ? "Skipped when known" : null, f.prefill ? `From ?${param}` : null].filter(Boolean).join(", ") || "Off";
  return (
    <PanelSection icon={<Ic n="wand" />} title="Fill in for them" summary={summary} open={p.open} onToggle={p.onToggle}>
      {k.can && f.key !== "email" ? (
        <Line label="Skip it when Claritia already knows the answer">
          <Tg label="Skip it when Claritia already knows the answer" on={k.on} onChange={(v) => apply(knownOp(form, f, v))} />
        </Line>
      ) : null}
      <Labeled label="Fill from the page address">
        {f.type === "hidden" ? (
          <div className="flex items-center gap-[6px]">
            <span className="font-mono text-[11.5px] text-muted">?</span>
            <input className={`${IN_SM} font-mono text-[12px]`} value={f.hidden?.name ?? ""} placeholder="utm_source" aria-label="Page address parameter" onChange={(e) => apply({ op: "update_field", id: f.id, patch: { hidden: { from: "param", name: e.target.value.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60) } } })} />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-[12px]">
            <span className="font-mono text-[12px] text-body">{`?${param}=`}</span>
            <Tg label="Fill from the page address" on={!!f.prefill} onChange={(v) => apply({ op: "update_field", id: f.id, patch: { prefill: v || undefined } })} />
          </div>
        )}
      </Labeled>
    </PanelSection>
  );
}

function ConsentSection(p: BuildProps & { open: boolean; onToggle: () => void }) {
  const c = p.form.consent;
  const set = (op: Omit<Extract<Op, { op: "set_consent" }>, "op">) => p.apply({ op: "set_consent", ...op });
  return (
    <PanelSection icon={<Ic n="shield" />} title="Consent" summary={`${c.mode === "by_region" ? "Shown in the EU and UK" : "Shown to everyone"}, ${c.required ? "required" : "optional"}`} open={p.open} onToggle={p.onToggle}>
      <Labeled label="Text">
        <textarea className={AREA} rows={3} value={c.label} onChange={(e) => set({ label: e.target.value })} />
      </Labeled>
      <Labeled label="Show it to">
        <Seg label="Show it to" value={c.mode === "always" ? "always" : "by_region"} onChange={(v) => set({ mode: v })} options={[{ value: "by_region", label: "EU and UK visitors" }, { value: "always", label: "Everyone" }]} />
      </Labeled>
      <Line label="Required to send">
        <Tg label="Required to send" on={!!c.required} onChange={(v) => set({ required: v })} />
      </Line>
      <TextLink onClick={() => p.onSettings("consent")}>All consent settings</TextLink>
    </PanelSection>
  );
}

// Nothing picked: the form ---------------------------------------------------------------------------------------------

/** Kit colors offered as the accent: the kit's own, then the app's plain set, read from its tokens. */
const SWATCHES = ["--color-ink", "--color-signal", "--color-sky", "--color-rose", "--color-butter"];
const cornerOf = (r: number) => (r <= 3 ? "square" : r >= 16 ? "round" : "soft");
const CORNERS = { square: { radius: 2, buttonRadius: 2 }, soft: { radius: 8, buttonRadius: 8 }, round: { radius: 20, buttonRadius: 60 } } as const;

export function FormPanel(p: BuildProps & { open: string | null; setOpen: (k: string | null) => void }) {
  const { form, apply, open, setOpen, kit, kits, session, ws } = p;
  const toggle = (k: string) => setOpen(open === k ? null : k);
  const [error, setError] = useState("");
  const n = questionsOf(form).filter((q) => q.kind !== "heading" && q.kind !== "para").length;
  const steps = form.steps.length;
  const s = form.after.schedule;
  const site = (() => {
    try {
      return p.site ? new URL(/^https?:\/\//.test(p.site) ? p.site : `https://${p.site}`).hostname.replace(/^www\./, "") : "";
    } catch {
      return "";
    }
  })();
  const t = kit?.tokens ?? {};
  const corner = cornerOf(Number(t.radius ?? 6));
  const accent = (t.buttonBg || t.accent || "") as string;
  const swatchBox = useRef<HTMLDivElement>(null);
  const saveTokens = async (patch: Record<string, unknown>) => {
    setError("");
    try {
      const r = await postJson<{ id: string }>(session, "/api/forms/brand", { workspaceId: ws.id, id: kit?.id ?? null, name: kit?.name ?? (site || "Brand kit"), tokens: { ...t, ...patch } });
      if (r.id !== kit?.id) p.setKit(r.id);
      p.reloadKits();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const brandKit = kits.find((k) => k.scan_status === "done") ?? kits[0] ?? null;
  return (
    <Shell label="Form" eyebrow="Form" title={p.name}>
      <PanelSection icon={<Ic n="text" />} title="Content" summary={`${form.title || p.name}, button ${form.submit.label}`} open={open === "content"} onToggle={() => toggle("content")}>
        <Labeled label="Title">
          <input className={IN} value={form.title ?? ""} onChange={(e) => apply({ op: "set_copy", title: e.target.value })} />
        </Labeled>
        <Labeled label="Intro">
          <textarea className={AREA} rows={2} value={form.intro ?? ""} onChange={(e) => apply({ op: "set_copy", intro: e.target.value })} />
        </Labeled>
        <Labeled label="Button">
          <input className={IN} value={form.submit.label} onChange={(e) => apply({ op: "set_copy", submit: e.target.value })} />
        </Labeled>
      </PanelSection>
      <PanelSection icon={<Ic n="steps" />} title="Layout" summary={steps > 1 ? `${steps} steps, ${n} questions, ${form.layout.progress === "none" ? "no progress bar" : "progress bar"}` : `One page, ${n} questions`} open={open === "layout"} onToggle={() => toggle("layout")}>
        <Seg
          label="Layout"
          value={steps > 1 ? "steps" : "page"}
          onChange={(v) => (v === "page" ? apply(Array.from({ length: steps - 1 }, (_, i): Op => ({ op: "remove_step", index: steps - 1 - i })), "One page") : apply({ op: "add_step", title: "Step 2" }, "Steps on"))}
          options={[{ value: "page", label: "One page" }, { value: "steps", label: "Steps" }]}
        />
        {steps > 1 ? (
          <>
            <div className="flex flex-col gap-[4px]">
              {form.steps.map((st, i) => (
                <div key={st.id} className="flex items-center gap-[6px]">
                  <span className="inline-flex text-faint" aria-hidden="true">
                    <Ic n="grip" />
                  </span>
                  <input className={IN_SM} value={st.title ?? ""} placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1} name`} onChange={(e) => apply({ op: "update_step", index: i, title: e.target.value })} />
                  <span className="w-[76px] shrink-0 text-right text-[12px] text-muted">{`${st.fields.length} ${st.fields.length === 1 ? "question" : "questions"}`}</span>
                </div>
              ))}
            </div>
            <Line label="Progress bar">
              <Tg label="Progress bar" on={form.layout.progress !== "none"} onChange={(v) => apply({ op: "set_layout", progress: v ? "bar" : "none" })} />
            </Line>
          </>
        ) : null}
        <Labeled label="Labels">
          <Seg label="Labels" value={form.layout.labels} onChange={(v) => apply({ op: "set_layout", labels: v })} options={[{ value: "above", label: "Above" }, { value: "inside", label: "Inside" }]} />
        </Labeled>
        <Labeled label="Width">
          <Seg label="Width" value={form.layout.width} onChange={(v) => apply({ op: "set_layout", width: v })} options={[{ value: "narrow", label: "Narrow" }, { value: "wide", label: "Wide" }]} />
        </Labeled>
      </PanelSection>
      <PanelSection icon={<Ic n="palette" />} title="Styling" summary={kit ? `Your brand kit, ${corner} corners` : "Claritia"} open={open === "style"} onToggle={() => toggle("style")}>
        <div className="grid grid-cols-2 gap-[8px]">
          {[
            { v: "brand", l: "Your brand kit", c: (brandKit?.tokens.buttonBg || brandKit?.tokens.accent) as string | undefined, on: !!kit },
            { v: "claritia", l: "Claritia", c: undefined, on: !kit },
          ].map((x) => (
            <button
              key={x.v}
              type="button"
              aria-pressed={x.on}
              disabled={x.v === "brand" && !brandKit}
              onClick={() => p.setKit(x.v === "brand" ? (brandKit?.id ?? null) : null)}
              className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] text-left transition-colors duration-[120ms] disabled:opacity-45 ${x.on ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
            >
              <span aria-hidden="true" className="flex h-[54px] flex-col justify-center gap-[5px] rounded-[6px] border border-line bg-paper px-[10px]">
                <i className="block h-[5px] w-3/5 rounded-[3px] bg-line-strong" />
                <i className="block h-[5px] w-2/5 rounded-[3px] bg-line-strong" />
                <em className="block h-[12px] w-[44px] rounded-full bg-ink" style={x.c ? { background: x.c } : undefined} />
              </span>
              <span className="font-medium text-ink">{x.l}</span>
            </button>
          ))}
        </div>
        {kit ? (
          <>
            <Labeled label="Accent">
              <div ref={swatchBox} className="keep-light flex flex-wrap gap-[8px]">
                {[accent ? { k: "kit", bg: accent } : null, ...SWATCHES.map((v) => ({ k: v, bg: `var(${v})` }))]
                  .filter((x): x is { k: string; bg: string } => !!x)
                  .map((x) => (
                    <button
                      key={x.k}
                      type="button"
                      aria-label={x.k === "kit" ? "Your brand's accent" : `Accent ${x.k.replace("--color-", "")}`}
                      onClick={(e) => {
                        const c = cleanColor(getComputedStyle(e.currentTarget).backgroundColor);
                        if (c && c !== accent) void saveTokens({ accent: c, buttonBg: c });
                      }}
                      className={`size-[28px] rounded-full border-2 border-card ${x.k === "kit" ? "shadow-[0_0_0_2px_var(--color-ink)]" : "shadow-[0_0_0_1px_var(--color-line)]"}`}
                      style={{ background: x.bg }}
                    />
                  ))}
              </div>
            </Labeled>
            <Labeled label="Corners">
              <Seg label="Corners" value={corner} onChange={(v) => void saveTokens(CORNERS[v])} options={[{ value: "square", label: "Square" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]} />
            </Labeled>
          </>
        ) : null}
        {site ? (
          <span className="text-[12px] text-muted">
            {`Read from ${site}. `}
            <button
              type="button"
              className="text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink"
              onClick={async () => {
                setError("");
                try {
                  const r = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: site, kitId: kit?.id ?? null });
                  if (r.kitId !== kit?.id) p.setKit(r.kitId);
                  p.reloadKits();
                } catch (e) {
                  setError(errorText(e));
                }
              }}
            >
              Read it again
            </button>
          </span>
        ) : null}
        {error ? <Box tone="bad" title={error} /> : null}
      </PanelSection>
      <PanelSection
        icon={<Ic n="check" />}
        title="After submit"
        summary={s ? `Book a meeting, ${s.who === "routed" ? "for routed leads" : s.who === "match" ? "for leads that match" : "for everyone"}` : form.after.end.kind === "redirect" ? "Goes to a page" : "Shows a message"}
        open={open === "after"}
        onToggle={() => toggle("after")}
      >
        <p className="m-0 text-muted">{s ? (s.who === "routed" ? "Leads Routing sends to a rep pick a time with them. Others see the thank-you message." : "Leads pick a time after they send it.") : form.after.end.kind === "redirect" ? "Everyone goes to the page." : "Everyone sees the thank-you message."}</p>
        <button type="button" className={`${GHOST_SM} self-start`} onClick={() => p.onSettings("after")}>
          Edit in Settings
        </button>
      </PanelSection>
    </Shell>
  );
}

export function ButtonPanel(p: BuildProps) {
  const { form, apply, setPick } = p;
  const [open, setOpen] = useState(true);
  return (
    <Shell
      label="Button"
      eyebrow="Button"
      title={form.submit.label}
      actions={
        <button type="button" className={IB} onClick={() => setPick(null)} title="Close" aria-label="Close">
          <Ic n="x" />
        </button>
      }
    >
      <PanelSection icon={<Ic n="text" />} title="Text" summary={form.submit.label} open={open} onToggle={() => setOpen(!open)}>
        <Labeled label="Last step">
          <input className={IN} value={form.submit.label} autoFocus onChange={(e) => apply({ op: "set_copy", submit: e.target.value })} />
        </Labeled>
        {form.steps.length > 1 ? (
          <Labeled label="Other steps">
            <input className={`${IN} text-muted`} value="Next" disabled />
          </Labeled>
        ) : null}
        <Line label="Full width">
          <Tg label="Full width" on={!!form.submit.full} onChange={(v) => apply({ op: "set_copy", submitFull: v })} />
        </Line>
      </PanelSection>
    </Shell>
  );
}
