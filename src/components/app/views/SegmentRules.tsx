"use client";

// The segment rule editor: groups of rules with and/or, and each kind of rule's own fields.

import { useState } from "react";
import { describe, type Filter } from "@/lib/filters";
import { filterFields } from "@/lib/records/fields";
import { Plus, X } from "../../Icons";
import { FilterEditor, Popover } from "../FilterBar";
import { Select } from "../Select";
import { Button, Input, Segmented, type ViewProps } from "../ui";
import { useMeta } from "../records/meta";

export type Group = { op: "and" | "or"; rules: Node[] };

type Leaf =
  | ({ kind: "field" } & Filter)
  | { kind: "event"; event: string; op: "at_least" | "none"; count?: number; days: number }
  | { kind: "visit"; path?: string; op: "at_least" | "none"; count?: number; days: number }
  | { kind: "consent"; state: "sendable" | "not_sendable" | "suppressed" }
  | { kind: "source"; source_id: string; op: "in" | "not_in" }
  | { kind: "object"; object: string; op: "has" | "has_not"; filters: Filter[] };

type Node = Group | Leaf;

export type Ctx = { sb: ViewProps["sb"]; wsId: string; sources: { value: string; label: string }[]; objects: { value: string; label: string }[] };

const isGroup = (n: Node): n is Group => "rules" in n;

const EVENTS = [
  { value: "email.clicked", label: "Clicked an email" },
  { value: "email.opened", label: "Opened an email" },
  { value: "form.submitted", label: "Filled a form" },
  { value: "meeting.booked", label: "Booked a meeting" },
  { value: "webinar.attended", label: "Attended a webinar" },
  { value: "contact.created", label: "Became a contact" },
  { value: "segment.entered", label: "Joined a segment" },
];

const KINDS = [
  { value: "field", label: "Field" },
  { value: "event", label: "Activity" },
  { value: "visit", label: "Website visit" },
  { value: "consent", label: "Email consent" },
  { value: "source", label: "Source" },
  { value: "object", label: "Custom object" },
];

function fresh(kind: string, ctx: Ctx): Leaf | null {
  if (kind === "event") return { kind: "event", event: "email.clicked", op: "at_least", count: 1, days: 30 };
  if (kind === "visit") return { kind: "visit", path: "", op: "at_least", count: 1, days: 30 };
  if (kind === "consent") return { kind: "consent", state: "sendable" };
  if (kind === "source") return ctx.sources[0] ? { kind: "source", source_id: ctx.sources[0].value, op: "in" } : null;
  if (kind === "object") return ctx.objects[0] ? { kind: "object", object: ctx.objects[0].value, op: "has", filters: [] } : null;
  return null;
}

type EditorProps = { ctx: Ctx; fields: ReturnType<typeof filterFields>; anyFields: Parameters<typeof FilterEditor>[0]["fields"] };

export function GroupEditor({ node, depth, onChange, onRemove, ...p }: EditorProps & { node: Group; depth: number; onChange: (g: Group) => void; onRemove?: () => void }) {
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const set = (i: number, n: Node | null) => onChange({ ...node, rules: n ? node.rules.map((x, j) => (j === i ? n : x)) : node.rules.filter((_, j) => j !== i) });
  return (
    <div className={`flex flex-col gap-2 border border-line p-3 ${depth > 1 ? "bg-canvas" : "bg-panel"}`}>
      <div className="flex items-center gap-2">
        <Segmented<"and" | "or">
          value={node.op}
          onChange={(op) => onChange({ ...node, op })}
          label="Match"
          options={[
            { value: "and", label: "All of" },
            { value: "or", label: "Any of" },
          ]}
        />
        {onRemove ? (
          <button type="button" aria-label="Remove group" onClick={onRemove} className="ml-auto flex size-7 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink">
            <X size={14} />
          </button>
        ) : null}
      </div>
      {node.rules.map((r, i) =>
        isGroup(r) ? (
          <GroupEditor key={i} node={r} depth={depth + 1} onChange={(g) => set(i, g)} onRemove={() => set(i, null)} {...p} />
        ) : (
          <RuleRow key={i} rule={r} onChange={(n) => set(i, n)} onRemove={() => set(i, null)} {...p} />
        ),
      )}
      <div className="flex gap-1.5">
        <Button variant="ghost" className="h-8 px-2.5" onClick={(e) => setAdding(e.currentTarget)}>
          <Plus size={14} />
          Rule
        </Button>
        {depth < 3 ? (
          <Button variant="ghost" className="h-8 px-2.5" onClick={() => onChange({ ...node, rules: [...node.rules, { op: node.op === "and" ? "or" : "and", rules: [] }] })}>
            <Plus size={14} />
            Group
          </Button>
        ) : null}
      </div>
      {adding ? (
        <Popover anchor={adding} onClose={() => setAdding(null)}>
          <FilterEditor
            fields={p.anyFields}
            start={null}
            onDone={(f) => {
              if (f) onChange({ ...node, rules: [...node.rules, { kind: "field", ...f }] });
              setAdding(null);
            }}
          />
          <div className="flex flex-wrap gap-1 border-t border-line p-2">
            {KINDS.filter((k) => k.value !== "field").map((k) => {
              const leaf = fresh(k.value, p.ctx);
              return leaf ? (
                <button
                  key={k.value}
                  type="button"
                  className="h-7 rounded-md border border-line px-2 text-[12px] hover:border-ink"
                  onClick={() => {
                    onChange({ ...node, rules: [...node.rules, leaf] });
                    setAdding(null);
                  }}
                >
                  {k.label}
                </button>
              ) : null;
            })}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

const num = (v: string, fallback: number) => (/^\d{1,4}$/.test(v) ? Number(v) : fallback);

function RuleRow({ rule, onChange, onRemove, ctx, fields, anyFields }: EditorProps & { rule: Leaf; onChange: (l: Leaf) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState<HTMLElement | null>(null);
  let body: React.ReactNode = null;
  if (rule.kind === "field") {
    const f = fields.find((x) => x.key === rule.field);
    body = (
      <>
        <button type="button" onClick={(e) => setEditing(e.currentTarget)} className="h-8 rounded-md border border-line bg-panel px-2.5 text-[13px] hover:border-ink">
          {describe(rule, f as never)}
        </button>
        {editing ? (
          <Popover anchor={editing} onClose={() => setEditing(null)}>
            <FilterEditor
              fields={anyFields}
              start={rule}
              onDone={(x) => {
                if (x) onChange({ kind: "field", ...x });
                setEditing(null);
              }}
            />
          </Popover>
        ) : null}
      </>
    );
  } else if (rule.kind === "event" || rule.kind === "visit") {
    body = (
      <>
        <Select
          size="sm"
          value={rule.op}
          onChange={(op) => onChange({ ...rule, op })}
          options={[
            { value: "at_least", label: rule.kind === "event" ? "Did" : "Visited" },
            { value: "none", label: rule.kind === "event" ? "Didn't" : "Didn't visit" },
          ]}
        />
        {rule.kind === "event" ? (
          <Select size="sm" value={rule.event} onChange={(event) => onChange({ ...rule, event })} options={EVENTS} />
        ) : (
          <Input className="h-8 !w-44" value={rule.path ?? ""} onChange={(e) => onChange({ ...rule, path: e.target.value.slice(0, 300) })} placeholder="/pricing or /blog/*" aria-label="Page" />
        )}
        {rule.op === "at_least" ? (
          <>
            <Input className="h-8 !w-14 text-right" value={String(rule.count ?? 1)} onChange={(e) => onChange({ ...rule, count: num(e.target.value, 1) })} aria-label="Times" />
            <span className="text-[13px] text-muted">or more times</span>
          </>
        ) : null}
        <span className="text-[13px] text-muted">in</span>
        <Input className="h-8 !w-16 text-right" value={String(rule.days)} onChange={(e) => onChange({ ...rule, days: num(e.target.value, 30) })} aria-label="Days" />
        <span className="text-[13px] text-muted">days</span>
      </>
    );
  } else if (rule.kind === "consent") {
    body = (
      <Select
        size="sm"
        value={rule.state}
        onChange={(state) => onChange({ ...rule, state })}
        options={[
          { value: "sendable", label: "Can be emailed" },
          { value: "not_sendable", label: "Can't be emailed" },
          { value: "suppressed", label: "Unsubscribed or bounced" },
        ]}
      />
    );
  } else if (rule.kind === "source") {
    body = (
      <>
        <Select
          size="sm"
          value={rule.op}
          onChange={(op) => onChange({ ...rule, op })}
          options={[
            { value: "in", label: "In" },
            { value: "not_in", label: "Not in" },
          ]}
        />
        <Select size="sm" value={rule.source_id} onChange={(source_id) => onChange({ ...rule, source_id })} options={ctx.sources} />
      </>
    );
  } else if (rule.kind === "object") {
    body = <ObjectRule rule={rule} onChange={onChange} ctx={ctx} />;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label-mono w-32 shrink-0 whitespace-nowrap text-faint">{KINDS.find((k) => k.value === rule.kind)?.label}</span>
      {body}
      <button type="button" aria-label="Remove rule" onClick={onRemove} className="ml-auto flex size-7 items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink">
        <X size={14} />
      </button>
    </div>
  );
}

function ObjectRule({ rule, onChange, ctx }: { rule: Extract<Leaf, { kind: "object" }>; onChange: (l: Leaf) => void; ctx: Ctx }) {
  const meta = useMeta(ctx.sb, ctx.wsId, rule.object);
  const [editing, setEditing] = useState<{ anchor: HTMLElement; index: number | null } | null>(null);
  const fields = meta.data ? filterFields(meta.data.fields) : [];
  return (
    <>
      <Select
        size="sm"
        value={rule.op}
        onChange={(op) => onChange({ ...rule, op })}
        options={[
          { value: "has", label: "Has" },
          { value: "has_not", label: "Has no" },
        ]}
      />
      <Select size="sm" value={rule.object} onChange={(object) => onChange({ ...rule, object, filters: [] })} options={ctx.objects} />
      {rule.filters.map((f, i) => (
        <span key={i} className="inline-flex h-8 items-center gap-1 border border-line bg-panel pr-1 pl-2.5 text-[13px]">
          <button type="button" onClick={(e) => setEditing({ anchor: e.currentTarget, index: i })}>
            {describe(f, fields.find((x) => x.key === f.field) as never)}
          </button>
          <button type="button" aria-label="Remove" onClick={() => onChange({ ...rule, filters: rule.filters.filter((_, j) => j !== i) })} className="text-faint hover:text-ink">
            <X size={12} />
          </button>
        </span>
      ))}
      <Button variant="ghost" className="h-8 px-2" onClick={(e) => setEditing({ anchor: e.currentTarget, index: null })} aria-label="Add a condition">
        <Plus size={14} />
      </Button>
      {editing && meta.data ? (
        <Popover anchor={editing.anchor} onClose={() => setEditing(null)}>
          <FilterEditor
            fields={fields as never}
            start={editing.index === null ? null : rule.filters[editing.index]}
            onDone={(f) => {
              if (f) onChange({ ...rule, filters: editing.index === null ? [...rule.filters, f] : rule.filters.map((x, j) => (j === editing.index ? f : x)) });
              setEditing(null);
            }}
          />
        </Popover>
      ) : null}
    </>
  );
}
