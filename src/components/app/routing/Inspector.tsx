"use client";

// The Router's inspector (docs/router-ux.md 4.2): the fields of the selected step, rule, queue or fallback. Every
// change is one `edit` on the body, so undo, autosave and the test path follow it. The spam lists live beside the body
// (saved on their own), so they don't go through undo.

import { useState } from "react";
import { BASE_FIELDS, countryName, needsValue, opsFor, REGIONS, type FieldDef } from "@/lib/router/conditions";
import { newId, type Problem } from "@/lib/router/check";
import { minutesWords } from "@/lib/router/explain";
import { defaultSla, METHODS, OPS, SLA_MINUTES, type Cond, type Method, type Op, type Rule, type RouterBody, type Sla, type WhenOut } from "@/lib/router/types";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import { Minus, Plus, Trash, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { INPUT, NumIn, PICK, Seg } from "../forms/controls";
import { Select } from "../Select";
import { Avatar, Badge, IconButton, Segmented, Toggle } from "../ui";
import type { Member } from "./api";
import {
  addMember,
  addQueue,
  addRule,
  removeMember,
  removeQueue,
  removeRule,
  setQueue,
  setRule,
  setWeight,
  newCond,
  withField,
  withOp,
  type FlowCounts,
  type Selection,
} from "./editorModel";
import { Block, ChipList, ChoiceChips, FieldPicker, fmt, Line } from "./parts";

export type Edit = (fn: (b: RouterBody) => RouterBody, key?: string) => void;

export type InspectorProps = {
  sel: Selection;
  body: RouterBody;
  edit: Edit;
  readOnly: boolean;
  members: Member[];
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  counts: FlowCounts | null;
  problems: Problem[];
  lists: { allow: string[]; block: string[] };
  onLists?: (l: { allow: string[]; block: string[] }) => void;
  onSelect: (s: Selection) => void;
};

const TITLES = { spam: "Filter out junk", account: "Same company, same rep", keep: "Keep their rep", rules: "Who gets which leads", fallback: "Everyone else goes to", sla: "Follow-up time" } as const;

export function Inspector(p: InspectorProps) {
  const { sel, body } = p;
  const rule = sel.kind === "rule" ? body.rules.list.find((r) => r.id === sel.id) : undefined;
  const queue = sel.kind === "queue" ? body.queues.find((q) => q.id === sel.id) : undefined;
  const crumb =
    sel.kind === "rule" ? ["Rules", rule?.name ?? ""] : sel.kind === "queue" ? ["Teams", queue?.name ?? ""] : [TITLES[sel.kind]];
  const mine = p.problems.filter((x) => x.where.kind === sel.kind && (!("id" in sel) || x.where.id === sel.id));
  return (
    <div className="flex flex-col">
      <div className="flex h-12 items-center gap-1.5 border-b border-line px-5 text-[13px]">
        {crumb.map((c, i) => (
          <span key={i} className={`truncate ${i === crumb.length - 1 ? "font-medium text-ink" : "text-muted"}`}>
            {i ? <span className="mr-1.5 text-faint">›</span> : null}
            {c}
          </span>
        ))}
      </div>
      {mine.length ? (
        <ul className="flex flex-col gap-1 px-5 pt-4" role="alert">
          {mine.map((x, i) => (
            <li key={i} className="flex items-center gap-2 text-[12.5px] text-rose">
              <span className="size-1.5 shrink-0 rounded-full bg-rose" />
              {x.text}
            </li>
          ))}
        </ul>
      ) : null}
      <fieldset disabled={p.readOnly} className="m-0 min-w-0 border-0 p-0">
        {sel.kind === "spam" ? <SpamInspector {...p} /> : null}
        {sel.kind === "account" ? <AccountInspector {...p} /> : null}
        {sel.kind === "keep" ? <KeepInspector {...p} /> : null}
        {sel.kind === "rules" ? <RulesInspector {...p} /> : null}
        {sel.kind === "fallback" ? <FallbackInspector {...p} /> : null}
        {sel.kind === "sla" ? <SlaInspector {...p} /> : null}
        {rule ? <RuleInspector key={rule.id} {...p} rule={rule} /> : null}
        {sel.kind === "queue" && queue ? <QueueInspector key={queue.id} {...p} id={queue.id} /> : null}
        {(sel.kind === "rule" && !rule) || (sel.kind === "queue" && !queue) ? <p className="px-5 py-6 text-[13px] text-muted">Removed</p> : null}
      </fieldset>
    </div>
  );
}

// Steps -----------------------------------------------------------------------------------------------------------

const DOMAIN = /^([^\s@]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const cleanDomain = (x: string) => {
  const v = x.trim().toLowerCase().replace(/^@/, "");
  return DOMAIN.test(v) ? v : null;
};

function SpamInspector({ body, edit, lists, onLists, readOnly }: InspectorProps) {
  const s = body.spam;
  const set = (patch: Partial<RouterBody["spam"]>, key?: string) => edit((b) => ({ ...b, spam: { ...b.spam, ...patch } }), key);
  return (
    <>
      <Block first>
        <Line label="Filter out junk">
          <Toggle label="Filter out junk" on={s.on} onChange={(on) => set({ on })} disabled={readOnly} />
        </Line>
        <Line label="Throwaway emails">
          <Toggle label="Throwaway emails" on={s.disposable} onChange={(disposable) => set({ disposable })} disabled={readOnly || !s.on} />
        </Line>
        <Line label="Fake names">
          <Toggle label="Fake names" on={s.fakeName} onChange={(fakeName) => set({ fakeName })} disabled={readOnly || !s.on} />
        </Line>
        <Line label="Personal email">
          <Toggle label="Personal email" on={s.freeMail} onChange={(freeMail) => set({ freeMail })} disabled={readOnly || !s.on} />
        </Line>
        <Line label="Too many fills">
          <Toggle label="Too many fills" on={s.tooMany} onChange={(tooMany) => set({ tooMany })} disabled={readOnly || !s.on} />
        </Line>
        {s.tooMany ? (
          <Line label="Most fills in an hour">
            <span className="w-20">
              <NumIn label="Most fills in an hour" value={s.maxPerHour} min={1} max={100} onChange={(v) => v !== undefined && set({ maxPerHour: v }, "spam:max")} />
            </span>
          </Line>
        ) : null}
      </Block>
      <Block title="Blocked">
        <ChipList label="Blocked domains and emails" placeholder="competitor.com" values={lists.block} clean={cleanDomain} disabled={readOnly || !onLists} onChange={(block) => onLists?.({ allow: lists.allow.filter((x) => !block.includes(x)), block })} />
      </Block>
      <Block title="Allowed">
        <ChipList label="Allowed domains and emails" placeholder="partner.com" values={lists.allow} clean={cleanDomain} disabled={readOnly || !onLists} onChange={(allow) => onLists?.({ allow, block: lists.block.filter((x) => !allow.includes(x)) })} />
      </Block>
    </>
  );
}

function AccountInspector({ body, edit, readOnly }: InspectorProps) {
  const a = body.account;
  const set = (patch: Partial<RouterBody["account"]>) => edit((b) => ({ ...b, account: { ...b.account, ...patch } }));
  return (
    <Block first>
      <Line label="Same company, same rep">
        <Toggle label="Same company, same rep" on={a.on} onChange={(on) => set({ on })} disabled={readOnly} />
      </Line>
      <Line label="Open opportunity owner first">
        <Toggle label="Open opportunity owner first" on={a.oppFirst} onChange={(oppFirst) => set({ oppFirst })} disabled={readOnly || !a.on} />
      </Line>
      <Line label="Set the company owner">
        <Toggle label="Set the company owner" on={a.setCompanyOwner} onChange={(setCompanyOwner) => set({ setCompanyOwner })} disabled={readOnly || !a.on} />
      </Line>
    </Block>
  );
}

const WHEN_OUT: { value: WhenOut; label: string }[] = [
  { value: "keep", label: "Keep them" },
  { value: "backup", label: "Backup" },
  { value: "route", label: "Route on" },
];

function KeepInspector({ body, edit, readOnly }: InspectorProps) {
  const k = body.keep;
  return (
    <Block first>
      <Line label="Keep their rep">
        <Toggle label="Keep their rep" on={k.on} onChange={(on) => edit((b) => ({ ...b, keep: { ...b.keep, on } }))} disabled={readOnly} />
      </Line>
      <div className="flex flex-col gap-2 pt-1">
        <span className="text-[12.5px] text-body">When the owner is out</span>
        <Segmented<WhenOut> label="When the owner is out" value={k.whenOut} options={WHEN_OUT} onChange={(whenOut) => !readOnly && edit((b) => ({ ...b, keep: { ...b.keep, whenOut } }))} />
      </div>
    </Block>
  );
}

function RulesInspector({ body, edit, readOnly, onSelect, counts }: InspectorProps) {
  return (
    <>
      <Block first>
        <Line label="Use rules">
          <Toggle label="Use rules" on={body.rules.on} onChange={(on) => edit((b) => ({ ...b, rules: { ...b.rules, on } }))} disabled={readOnly} />
        </Line>
      </Block>
      <Block title="Order">
        <ol className="flex flex-col">
          {body.rules.list.map((r, i) => (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect({ kind: "rule", id: r.id })} className="flex h-8 w-full items-center gap-2 rounded-sm px-1.5 text-left text-[13px] hover:bg-hover">
                <span className="w-4 text-right text-[12px] text-faint tabular-nums">{i + 1}</span>
                <span className="flex-1 truncate text-ink">{r.name}</span>
                {counts ? <span className="text-[12px] text-muted tabular-nums">{fmt(counts.rules[r.id] ?? 0)}</span> : null}
              </button>
            </li>
          ))}
        </ol>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => {
              const id = newId("r_");
              edit((b) => addRule(b, id));
              onSelect({ kind: "rule", id });
            }}
            className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover"
          >
            <Plus size={12} />
            Rule
          </button>
        ) : null}
      </Block>
    </>
  );
}

function FallbackInspector({ body, edit, members, readOnly }: InspectorProps) {
  const fb = body.fallback;
  const [kind, setKind] = useState<"user" | "queue">(fb?.kind ?? "user");
  const options = kind === "user" ? members.map((m) => ({ value: m.id, label: m.name })) : body.queues.map((q) => ({ value: q.id, label: q.name }));
  return (
    <Block first>
      <Segmented<"user" | "queue">
        label="Everyone else goes to"
        value={kind}
        options={[
          { value: "user", label: "A rep" },
          { value: "queue", label: "A team" },
        ]}
        onChange={(k) => !readOnly && setKind(k)}
      />
      <Select<string>
        value={fb?.kind === kind ? fb.id : ""}
        options={options}
        onChange={(id) => edit((b) => ({ ...b, fallback: { kind, id } }))}
        ariaLabel={kind === "user" ? "Rep" : "Team"}
        placeholder={kind === "user" ? "Pick a rep" : "Pick a team"}
        disabled={readOnly}
        className={`${PICK} h-8`}
      />
    </Block>
  );
}

const SLA_NEXT: { value: Sla["next"]; label: string }[] = [
  { value: "route", label: "Route again" },
  { value: "manager", label: "Manager" },
  { value: "nudge", label: "Tell the rep" },
];

function SlaInspector({ body, edit, members, readOnly }: InspectorProps) {
  const s = body.sla ?? defaultSla();
  const set = (patch: Partial<Sla>) => edit((b) => ({ ...b, sla: { ...(b.sla ?? defaultSla()), ...patch } }));
  const nudges = SLA_MINUTES.filter((m) => m < s.minutes);
  return (
    <Block first>
      <Line label="Follow-up time">
        <Toggle label="Follow-up time" on={s.on} onChange={(on) => set({ on })} disabled={readOnly} />
      </Line>
      <Line label="Act within">
        <Select<string>
          value={String(s.minutes)}
          options={SLA_MINUTES.map((m) => ({ value: String(m), label: minutesWords(m) }))}
          onChange={(v) => {
            const minutes = Number(v);
            set({ minutes, nudge: s.nudge !== null && s.nudge < minutes ? s.nudge : (nudges.filter((m) => m < minutes).at(-1) ?? null) });
          }}
          ariaLabel="Act within"
          disabled={readOnly || !s.on}
          className={`${PICK} h-8 w-36`}
        />
      </Line>
      <Line label="Nudge at">
        <Select<string>
          value={s.nudge === null ? "none" : String(s.nudge)}
          options={[{ value: "none", label: "No nudge" }, ...nudges.map((m) => ({ value: String(m), label: minutesWords(m) }))]}
          onChange={(v) => set({ nudge: v === "none" ? null : Number(v) })}
          ariaLabel="Nudge at"
          disabled={readOnly || !s.on}
          className={`${PICK} h-8 w-36`}
        />
      </Line>
      <div className="flex flex-col gap-2 pt-1">
        <span className="text-[12.5px] text-body">If the rep doesn&apos;t act</span>
        <Segmented<Sla["next"]> label="If the rep doesn't act" value={s.next} options={SLA_NEXT} onChange={(next) => !readOnly && s.on && set({ next })} />
      </div>
      {s.next === "manager" ? (
        <Select<string>
          value={s.manager ?? ""}
          options={members.map((m) => ({ value: m.id, label: m.name }))}
          onChange={(manager) => set({ manager })}
          ariaLabel="Manager"
          placeholder="Pick a manager"
          disabled={readOnly || !s.on}
          className={`${PICK} h-8`}
        />
      ) : null}
    </Block>
  );
}

// Rule ------------------------------------------------------------------------------------------------------------

function RuleInspector({ body, edit, rule, fields, forms, readOnly, counts, onSelect }: InspectorProps & { rule: Rule }) {
  const set = (patch: Partial<Rule>, key?: string) => edit((b) => setRule(b, rule.id, patch), key);
  const setCond = (i: number, c: Cond, key?: string) => set({ conds: rule.conds.map((x, j) => (j === i ? c : x)) }, key);
  const first = fields.find((f) => f.key === "lead.country") ?? fields[0] ?? BASE_FIELDS[0]!;
  const addRegion = (i: number, name: string) => {
    const r = REGIONS.find((x) => x.name === name);
    if (!r) return;
    const existing = body.territories.find((t) => t.name === r.name);
    const id = existing?.id ?? newId("t_");
    edit((b) => {
      const territories = b.territories.some((t) => t.id === id) ? b.territories : [...b.territories, { id, name: r.name, countries: r.countries }];
      const cur = b.rules.list.find((x) => x.id === rule.id)?.conds[i];
      if (!cur) return b;
      const list = Array.isArray(cur.value) ? cur.value.map(String) : [];
      return setRule({ ...b, territories }, rule.id, { conds: b.rules.list.find((x) => x.id === rule.id)!.conds.map((c, j) => (j === i ? { ...c, value: [...new Set([...list, `t:${id}`])] } : c)) });
    });
  };
  return (
    <>
      <Block first>
        <Line label="Name">
          <input aria-label="Rule name" value={rule.name} maxLength={80} onChange={(e) => set({ name: e.target.value }, `rule:${rule.id}:name`)} className={`${INPUT} h-8 w-52`} />
        </Line>
        <Line label="On">
          <Toggle label="Rule on" on={rule.on !== false} onChange={(on) => set({ on: on ? undefined : false })} disabled={readOnly} />
        </Line>
        <Line label="Match">
          <Segmented<"all" | "any">
            label="Match"
            value={rule.match}
            options={[
              { value: "all", label: "All" },
              { value: "any", label: "Any" },
            ]}
            onChange={(match) => !readOnly && set({ match })}
          />
        </Line>
      </Block>
      <Block title="Conditions">
        <ul className="flex flex-col gap-2">
          {rule.conds.map((c, i) => (
            <CondRow
              key={i}
              c={c}
              index={i}
              body={body}
              fields={fields}
              forms={forms}
              readOnly={readOnly}
              onChange={(next, key) => setCond(i, next, key)}
              onRemove={() => set({ conds: rule.conds.filter((_, j) => j !== i) })}
              onCopy={() => rule.conds.length < 30 && set({ conds: [...rule.conds.slice(0, i + 1), structuredClone(c), ...rule.conds.slice(i + 1)] })}
              onRegion={(name) => addRegion(i, name)}
            />
          ))}
        </ul>
        {!readOnly && rule.conds.length < 30 ? (
          <button type="button" onClick={() => set({ conds: [...rule.conds, newCond(first)] })} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover">
            <Plus size={12} />
            Condition
          </button>
        ) : null}
      </Block>
      <Block>
        <Line label="Send to">
          <span className="w-52">
            <Select<string>
              value={rule.queue}
              options={[...body.queues.map((q) => ({ value: q.id, label: q.name })), { value: "__new", label: "New team…" }]}
              onChange={(v) => {
                if (v !== "__new") return set({ queue: v });
                const id = newId("q_");
                edit((b) => setRule(addQueue(b, id, rule.name), rule.id, { queue: id }));
                onSelect({ kind: "queue", id });
              }}
              ariaLabel="Send to"
              placeholder="Pick a team"
              disabled={readOnly}
              className={`${PICK} h-8`}
            />
          </span>
        </Line>
      </Block>
      <Block>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-muted">Last 7 days</span>
          <span className="text-ink tabular-nums">{counts ? `${fmt(counts.rules[rule.id] ?? 0)} leads` : "—"}</span>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={async () => {
              if (!(await askConfirm(`Delete the rule "${rule.name}"?`, { ok: "Delete", danger: true }))) return;
              edit((b) => removeRule(b, rule.id));
              onSelect({ kind: "rules" });
            }}
            className="press mt-1 inline-flex h-7 items-center gap-1.5 self-start rounded-full px-2 text-[12.5px] font-medium text-rose hover:bg-rose-wash"
          >
            <Trash size={12} />
            Delete rule
          </button>
        ) : null}
      </Block>
    </>
  );
}

const OP_LABEL = Object.fromEntries(OPS.map((o) => [o.value, o.label])) as Record<Op, string>;

function CondRow({
  c,
  index,
  body,
  fields,
  forms,
  readOnly,
  onChange,
  onRemove,
  onCopy,
  onRegion,
}: {
  c: Cond;
  index: number;
  body: RouterBody;
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  readOnly: boolean;
  onChange: (c: Cond, key?: string) => void;
  onRemove: () => void;
  onCopy: () => void;
  onRegion: (name: string) => void;
}) {
  const f = fields.find((x) => x.key === c.field);
  const type = f?.type ?? "text";
  const ops = opsFor(type);
  return (
    <li
      className="flex flex-col gap-1.5 rounded-lg border border-line bg-card p-2"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && !readOnly) {
          e.preventDefault();
          onCopy();
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <FieldPicker fields={fields} value={c.field} disabled={readOnly} onChange={(nf) => onChange(withField(c, nf, f))} className="w-[44%]" />
        <span className="min-w-0 flex-1">
          <Select<Op> value={c.op} options={ops.map((o) => ({ value: o, label: OP_LABEL[o] }))} onChange={(op) => onChange(withOp(c, op, type))} ariaLabel="Test" disabled={readOnly} className={PICK} />
        </span>
        {!readOnly ? (
          <IconButton label={`Remove condition ${index + 1}`} className="size-7" onClick={onRemove}>
            <X size={13} />
          </IconButton>
        ) : null}
      </div>
      {needsValue(c.op) ? <ValueInput c={c} f={f} body={body} forms={forms} readOnly={readOnly} onChange={onChange} onRegion={onRegion} /> : null}
    </li>
  );
}

const COUNTRIES = (() => COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code), group: "Countries" })).sort((a, b) => a.label.localeCompare(b.label)))();

function ValueInput({ c, f, body, forms, readOnly, onChange, onRegion }: { c: Cond; f: FieldDef | undefined; body: RouterBody; forms: { id: string; name: string }[]; readOnly: boolean; onChange: (c: Cond, key?: string) => void; onRegion: (name: string) => void }) {
  const type = f?.type ?? "text";
  const list = Array.isArray(c.value) ? c.value.map(String) : c.value === undefined || c.value === "" ? [] : [String(c.value)];
  const key = `cond:${c.field}:${c.op}`;
  if (c.op === "one_of" || c.op === "not_one_of") {
    if (type === "country") {
      const territories = body.territories.map((t) => ({ value: `t:${t.id}`, label: t.name, group: "Regions" }));
      const regions = REGIONS.filter((r) => !body.territories.some((t) => t.name === r.name && list.includes(`t:${t.id}`))).map((r) => ({ value: r.name, label: r.name }));
      return (
        <ChoiceChips
          label="Countries"
          values={list}
          options={[...territories, ...COUNTRIES]}
          onChange={(v) => onChange({ ...c, value: v })}
          disabled={readOnly}
          onPickExtra={{ group: "Regions", options: regions.filter((r) => !territories.some((t) => t.label === r.label)), pick: onRegion }}
        />
      );
    }
    if (type === "choice" && f?.options?.length) {
      const name = (v: string) => (f.key === "lead.form" ? (forms.find((x) => x.id === v)?.name ?? "A removed form") : v);
      return <ChoiceChips label={f.label} values={list} options={f.options.map((o) => ({ value: o, label: name(o) }))} onChange={(v) => onChange({ ...c, value: v })} disabled={readOnly} />;
    }
    return <ChipList label="Values" values={list} placeholder="Type and press Enter" disabled={readOnly} onChange={(v) => onChange({ ...c, value: v })} />;
  }
  if (type === "number" && c.op === "between") return <Between value={list} readOnly={readOnly} onChange={(v) => onChange({ ...c, value: v }, key)} />;
  if (type === "number") {
    const n = typeof c.value === "number" ? c.value : undefined;
    return <NumIn label="Value" value={n} empty onChange={(v) => onChange(v === undefined ? { field: c.field, op: c.op } : { ...c, value: v }, key)} />;
  }
  if (type === "bool")
    return (
      <Seg<"true" | "false">
        label="Value"
        value={c.value === "false" ? "false" : "true"}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
        onChange={(v) => !readOnly && onChange({ ...c, value: v })}
      />
    );
  return <input aria-label="Value" value={typeof c.value === "string" || typeof c.value === "number" ? String(c.value) : list.join(", ")} maxLength={200} onChange={(e) => onChange({ ...c, value: e.target.value }, key)} className={INPUT} />;
}

/** Two number boxes. The value is set only when both hold a number; until then the condition reads as empty. */
function Between({ value, readOnly, onChange }: { value: string[]; readOnly: boolean; onChange: (v: number[]) => void }) {
  const [text, setText] = useState<[string, string]>([value[0] ?? "", value[1] ?? ""]);
  const [was, setWas] = useState(value.join());
  if (value.join() !== was) {
    setWas(value.join());
    if (value.length === 2) setText([value[0]!, value[1]!]);
  }
  const put = (i: 0 | 1, s: string) => {
    const next: [string, string] = i ? [text[0], s] : [s, text[1]];
    setText(next);
    const [a, b] = next.map((x) => (x.trim() && Number.isFinite(Number(x.replace(/,/g, ""))) ? Number(x.replace(/,/g, "")) : null));
    const v = a !== null && b !== null && a !== undefined && b !== undefined ? [a, b] : [];
    setWas(v.map(String).join());
    onChange(v);
  };
  return (
    <span className="flex items-center gap-1.5">
      <input aria-label="From" inputMode="decimal" value={text[0]} disabled={readOnly} onChange={(e) => put(0, e.target.value)} className={`${INPUT} tabular-nums`} />
      <span className="text-[12px] text-faint">–</span>
      <input aria-label="To" inputMode="decimal" value={text[1]} disabled={readOnly} onChange={(e) => put(1, e.target.value)} className={`${INPUT} tabular-nums`} />
    </span>
  );
}

// Queue -----------------------------------------------------------------------------------------------------------

function QueueInspector({ body, edit, id, members, readOnly, counts, onSelect }: InspectorProps & { id: string }) {
  const q = body.queues.find((x) => x.id === id)!;
  const byId = new Map(members.map((m) => [m.id, m]));
  const left = members.filter((m) => !q.members.some((x) => x.user === m.id));
  const usedBy = body.rules.list.filter((r) => r.queue === q.id);
  return (
    <>
      <Block first>
        <Line label="Name">
          <input aria-label="Queue name" value={q.name} maxLength={80} onChange={(e) => edit((b) => setQueue(b, q.id, { name: e.target.value }), `queue:${q.id}:name`)} className={`${INPUT} h-8 w-52`} />
        </Line>
        <div className="flex flex-col gap-2 pt-1">
          <span className="text-[12.5px] text-body">Method</span>
          <Segmented<Method> label="Method" value={q.method} options={METHODS} onChange={(method) => !readOnly && edit((b) => setQueue(b, q.id, { method }))} />
        </div>
        <Line label="Keep the order">
          <Toggle label="Keep the order" on={q.strict} onChange={(strict) => edit((b) => setQueue(b, q.id, { strict }))} disabled={readOnly} />
        </Line>
        <Line label="Only during working hours">
          <Toggle label="Only during working hours" on={q.hoursOnly} onChange={(hoursOnly) => edit((b) => setQueue(b, q.id, { hoursOnly }))} disabled={readOnly} />
        </Line>
      </Block>
      <Block title="Reps" action={<span className="text-[12px] text-muted tabular-nums">{q.members.length}</span>}>
        <ul className="flex flex-col">
          {q.members.map((m) => {
            const who = byId.get(m.user);
            return (
              <li key={m.user} className="flex h-10 items-center gap-2.5">
                <Avatar label={who?.name ?? "?"} size={24} />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${who ? "text-ink" : "text-rose"}`}>{who?.name ?? "Former teammate"}</span>
                {q.method === "weighted" ? (
                  <span className="flex items-center gap-0.5" role="group" aria-label={`Weight for ${who?.name ?? "rep"}`}>
                    <IconButton label="Less" className="size-6" disabled={readOnly || m.weight <= 1} onClick={() => edit((b) => setWeight(b, q.id, m.user, m.weight - 1))}>
                      <Minus size={12} />
                    </IconButton>
                    <span className="w-5 text-center text-[12.5px] text-ink tabular-nums" aria-live="polite">
                      {m.weight}
                    </span>
                    <IconButton label="More" className="size-6" disabled={readOnly || m.weight >= 10} onClick={() => edit((b) => setWeight(b, q.id, m.user, m.weight + 1))}>
                      <Plus size={12} />
                    </IconButton>
                  </span>
                ) : null}
                {!readOnly ? (
                  <IconButton label={`Remove ${who?.name ?? "rep"}`} className="size-7" onClick={() => edit((b) => removeMember(b, q.id, m.user))}>
                    <X size={13} />
                  </IconButton>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!readOnly && left.length ? (
          <span className="self-start">
            <Select<string>
              value=""
              options={left.map((m) => ({ value: m.id, label: m.name }))}
              onChange={(u) => edit((b) => addMember(b, q.id, u))}
              ariaLabel="Add rep"
              placeholder="Add rep"
              plainPlaceholder
              className="h-7 rounded-full border border-dashed border-line-strong px-2.5 text-[12px] font-medium text-body hover:border-ink/40 hover:text-ink"
            />
          </span>
        ) : null}
      </Block>
      <Block>
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="text-muted">Last 7 days</span>
          <span className="text-ink tabular-nums">{counts ? `${fmt(usedBy.reduce((n, r) => n + (counts.rules[r.id] ?? 0), 0))} leads` : "—"}</span>
        </div>
        {usedBy.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {usedBy.map((r) => (
              <button key={r.id} type="button" onClick={() => onSelect({ kind: "rule", id: r.id })} className="rounded-full">
                <Badge>{r.name}</Badge>
              </button>
            ))}
          </div>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            onClick={async () => {
              if (!(await askConfirm(`Delete the team "${q.name}"?`, { ok: "Delete", danger: true }))) return;
              edit((b) => removeQueue(b, q.id));
              onSelect({ kind: "rules" });
            }}
            className="press mt-1 inline-flex h-7 items-center gap-1.5 self-start rounded-full px-2 text-[12.5px] font-medium text-rose hover:bg-rose-wash"
          >
            <Trash size={12} />
            Delete team
          </button>
        ) : null}
      </Block>
    </>
  );
}
