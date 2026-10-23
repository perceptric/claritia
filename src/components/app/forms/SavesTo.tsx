"use client";

// Where a field's answer goes (docs/form-studio.md 2.1, "Data"): a contact field, a custom contact field, only the
// fill, and also a property on a connected CRM; and what the answer does to a value the contact already has. One
// searchable picker, grouped by tool. CRM fields are read live through /api/forms/crm-fields; when that read fails
// the group shows why and everything else still works.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultOverwrite, OVERWRITES } from "@/lib/forms/overwrite";
import { contactChoices, customFit, customKindsFor, sameOptions, takenCrm, takenKeys } from "@/lib/forms/savesTo";
import { CONTACT_KEYS, isChoice, questionKey, type Field, type Form, type Overwrite } from "@/lib/forms/schema";
import { FIELD_KINDS, type CustomField, type FieldKind } from "@/lib/records/fields";
import { isCrmVendor, KIND_LABEL, propertyFit, VENDOR, type CrmProperty } from "@/lib/sources/properties";
import { Check, ChevronsUpDown, Contact, Plus, Search, X } from "../../Icons";
import { Dots } from "../Ai";
import { BrandLogo } from "../BrandLogo";
import { Popover } from "../FilterBar";
import { Select } from "../Select";
import { announceChange, Button, errorText, IconButton, Input, must } from "../ui";
import type { SourceRow } from "./shared";

export type SavesToProps = {
  field: Field;
  form: Form;
  custom: CustomField[];
  sources: SourceRow[];
  onChange: (patch: Partial<Field>) => void;
  /** For reading CRM fields; without them the CRM groups don't show. */
  session?: Session;
  workspaceId?: string;
  /** For "+ New field"; without it the row doesn't show. */
  sb?: SupabaseClient;
  /** A custom field was made here; the editor adds it to `custom`. Without it, loaded pages reload. */
  onFieldAdded?: (f: CustomField) => void;
};

type Loaded = { properties: CrmProperty[] } | { error: string };

// One read per CRM source while the page is open (the server keeps them 10 minutes); a failed read is dropped, so
// opening the picker again tries again.
const loads = new Map<string, Promise<Loaded>>();

function loadProperties(session: Session, ws: string, source: string, fresh = false): Promise<Loaded> {
  const key = `${ws}:${source}`;
  const had = loads.get(key);
  if (had && !fresh) return had;
  const p: Promise<Loaded> = fetch(`/api/forms/crm-fields?workspaceId=${encodeURIComponent(ws)}&sourceId=${encodeURIComponent(source)}${fresh ? "&fresh=1" : ""}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(15_000),
  })
    .then(async (r) => {
      const d = (await r.json().catch(() => ({}))) as { properties?: CrmProperty[]; error?: string };
      return Array.isArray(d.properties) ? { properties: d.properties } : { error: d.error ?? "Couldn't read its fields." };
    })
    .catch((e: Error) => ({ error: e?.name === "TimeoutError" ? "No answer in time. Try again." : "Couldn't reach Claritia. Try again." }));
  loads.set(key, p);
  void p.then((r) => {
    if ("error" in r && loads.get(key) === p) loads.delete(key);
  });
  return p;
}

/** The connected CRMs' fields, read when `on` turns true. */
function useCrmFields(crms: SourceRow[], session: Session | undefined, ws: string | undefined, on: boolean) {
  const [state, setState] = useState<Record<string, Loaded | "loading">>({});
  const ids = crms.map((s) => s.id).join();
  const done = (source: string) => (r: Loaded) => setState((s) => ({ ...s, [source]: r }));
  useEffect(() => {
    if (!on || !session || !ws) return;
    // Not read yet reads as loading.
    for (const s of crms) if (!(s.id in state)) void loadProperties(session, ws, s.id).then(done(s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, ids, session, ws]);
  const retry = (source: string) => {
    if (!session || !ws) return;
    setState((s) => ({ ...s, [source]: "loading" }));
    void loadProperties(session, ws, source, true).then(done(source));
  };
  return { state, retry };
}

type Row = { id: string; label: string; hint?: string; off?: string; on: boolean; pick: () => void; search: string };
type Group = { id: string; title: string; icon: React.ReactNode; rows: Row[]; status?: "loading" | string; retry?: () => void; extra?: React.ReactNode };

export function SavesTo({ field, form, custom, sources, onChange, session, workspaceId, sb, onFieldAdded }: SavesToProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [adding, setAdding] = useState<{ label: string; kind: FieldKind; busy: boolean; error: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const crms = useMemo(() => sources.filter((s) => isCrmVendor(s.kind) && s.status !== "disconnected"), [sources]);
  const linked = field.crm ? sources.find((s) => s.id === field.crm!.source) : undefined;
  // The linked CRM's fields load at once (for its pick list); the rest when the picker opens.
  const crm = useCrmFields(crms, session, workspaceId, !!anchor || !!field.crm);

  const taken = takenKeys(form, field.id);
  const own = field.key.startsWith("q.") ? field.key : questionKey(field.label || "answer", taken);
  const usedCrm = takenCrm(form, field.id);
  const customOf = (key: string) => custom.find((c) => `f.${c.key}` === key);
  const keyLabel = field.key.startsWith("q.") ? "Only on this fill" : (CONTACT_KEYS.find((c) => c.key === field.key)?.label ?? customOf(field.key)?.label ?? field.key.slice(2));
  const linkedProp = (() => {
    const s = field.crm ? crm.state[field.crm.source] : undefined;
    return s && s !== "loading" && "properties" in s ? s.properties.find((p) => p.name === field.crm!.property) : undefined;
  })();

  const setKey = (key: string) => onChange({ key: key as Field["key"], overwrite: undefined });
  const close = () => {
    setAnchor(null);
    setQuery("");
    setAdding(null);
  };

  const groups: Group[] = [
    {
      id: "contact",
      title: "Contact",
      icon: <Contact size={14} className="text-muted" />,
      rows: contactChoices(field, form).map((c) => ({ id: c.key, label: c.label, on: field.key === c.key, pick: () => setKey(c.key), search: c.label })),
    },
    {
      id: "custom",
      title: "Custom contact fields",
      icon: <Contact size={14} className="text-muted" />,
      rows: custom
        .filter((c) => !taken.has(`f.${c.key}`))
        .map((c) => {
          const off = customFit(field, c);
          return { id: `f.${c.key}`, label: c.label, hint: FIELD_KINDS.find((k) => k.value === c.type)?.label, off: off ?? undefined, on: field.key === `f.${c.key}`, pick: () => setKey(`f.${c.key}`), search: c.label };
        }),
      extra: sb && workspaceId ? <NewField field={field} adding={adding} setAdding={setAdding} create={create} /> : null,
    },
    ...crms.map((s): Group => {
      const st = crm.state[s.id];
      const vendor = s.kind as keyof typeof VENDOR;
      const props = st && st !== "loading" && "properties" in st ? st.properties : [];
      return {
        id: s.id,
        title: s.name || VENDOR[vendor].label,
        icon: <BrandLogo domain={VENDOR[vendor].domain} name={VENDOR[vendor].label} size={14} />,
        status: !st || st === "loading" ? "loading" : "error" in st ? st.error : undefined,
        retry: () => crm.retry(s.id),
        rows: props.map((p) => {
          const usedBy = usedCrm.get(`${s.id}:${p.name}`);
          const off = propertyFit(field.type, p) ?? (usedBy ? `Used by ${usedBy}` : null);
          const only = p.objects?.length === 1 ? `, ${p.objects[0]} only` : "";
          return {
            id: `${s.id}:${p.name}`,
            label: p.label,
            hint: `${KIND_LABEL[p.kind]}${only}`,
            off: off ?? undefined,
            on: field.crm?.source === s.id && field.crm.property === p.name,
            pick: () => onChange({ crm: { source: s.id, property: p.name, label: p.label.slice(0, 120), type: p.kind } }),
            search: `${p.label} ${p.name}`,
          };
        }),
      };
    }),
    {
      id: "fill",
      title: "Only on this fill",
      icon: <span className="size-3.5" />,
      rows: [{ id: own, label: "Only on this fill", on: field.key.startsWith("q."), pick: () => setKey(own), search: "Only on this fill submission answer" }],
    },
  ];

  const q = query.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, rows: q ? g.rows.filter((r) => r.search.toLowerCase().includes(q)) : g.rows }));
  const pickable = shown.flatMap((g) => g.rows.filter((r) => !r.off));

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-active="true"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  async function create() {
    if (!adding || !sb || !workspaceId || adding.busy || !adding.label.trim()) return;
    setAdding({ ...adding, busy: true, error: "" });
    try {
      const picks = adding.kind === "select" || adding.kind === "multi_select";
      const options = picks ? (field.options ?? []).map((o) => ({ value: o.value.slice(0, 200), label: o.label.slice(0, 60) })) : [];
      const made = must(await sb.rpc("field_add", { p_ws: workspaceId, p_object: "contact", p_label: adding.label.trim(), p_type: adding.kind, p_options: options })) as { key: string };
      const f: CustomField = { key: made.key, label: adding.label.trim(), type: adding.kind, options };
      if (onFieldAdded) onFieldAdded(f);
      else announceChange();
      setKey(`f.${made.key}`);
      close();
    } catch (e) {
      setAdding((a) => (a ? { ...a, busy: false, error: errorText(e) } : a));
    }
  }

  const policy = defaultOverwrite(field.key) && field.key !== "email" ? (field.overwrite ?? defaultOverwrite(field.key)!) : null;
  const crmOptions = linkedProp && isChoice(field.type) && (linkedProp.kind === "enum" || linkedProp.kind === "multi") && linkedProp.options?.length ? linkedProp.options : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Saves to</span>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={!!anchor}
          onClick={(e) => (anchor ? close() : setAnchor(e.currentTarget))}
          className="flex h-9 w-full items-center gap-2 rounded-sm border border-line-strong bg-card px-3 text-left text-[13px] text-ink"
        >
          {field.key.startsWith("q.") ? null : <Contact size={14} className="text-muted" />}
          <span className="flex-1 truncate">{keyLabel}</span>
          <ChevronsUpDown size={13} className="shrink-0 text-faint" />
        </button>
        {field.crm ? (
          <div className="flex h-9 items-center gap-2 rounded-sm border border-line bg-card pr-1 pl-3 text-[13px]">
            {linked && isCrmVendor(linked.kind) ? <BrandLogo domain={VENDOR[linked.kind].domain} name={VENDOR[linked.kind].label} size={14} /> : null}
            <span className="flex-1 truncate text-ink">{field.crm.label || field.crm.property}</span>
            {!linked ? <span className="text-[12px] text-rose">Tool removed</span> : null}
            <IconButton label="Stop sending" onClick={() => onChange({ crm: undefined })}>
              <X size={13} />
            </IconButton>
          </div>
        ) : null}
      </div>

      {policy ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-muted">When the contact already has a value</span>
          <Select<Overwrite> value={policy} options={OVERWRITES} ariaLabel="When the contact already has a value" onChange={(v) => onChange({ overwrite: v })} className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px]" />
        </div>
      ) : null}

      {crmOptions && linked && isCrmVendor(linked.kind) && !sameOptions(field.options, crmOptions) ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange({ options: crmOptions.slice(0, 100), ...(field.default && !crmOptions.some((o) => o.value === field.default) ? { default: undefined } : {}) })}
        >
          <BrandLogo domain={VENDOR[linked.kind].domain} name={VENDOR[linked.kind].label} size={13} />
          {`Use ${VENDOR[linked.kind].label}'s options`}
        </Button>
      ) : null}

      {anchor ? (
        <Popover anchor={anchor} onClose={close} width={Math.max(300, anchor.getBoundingClientRect().width)}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={14} className="text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(pickable.length - 1, a + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(0, a - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const r = pickable[active];
                  if (r) {
                    r.pick();
                    close();
                  }
                }
              }}
              placeholder="Search fields"
              aria-label="Search fields"
              className="h-10 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          <div ref={list} role="listbox" aria-label="Saves to" className="max-h-[340px] overflow-y-auto p-1.5">
            {shown.map((g) => {
              if (q && !g.rows.length && !g.status) return null;
              return (
                <div key={g.id} className="pb-1">
                  <div className="flex h-7 items-center gap-2 px-2 text-[12px] font-medium text-muted">
                    {g.icon}
                    <span className="truncate">{g.title}</span>
                  </div>
                  {g.status === "loading" ? (
                    <div className="px-2.5 py-2">
                      <Dots />
                    </div>
                  ) : g.status ? (
                    <div className="flex items-start gap-2 px-2.5 py-1.5">
                      <span role="alert" className="flex-1 text-[12.5px] text-rose">
                        {g.status}
                      </span>
                      <Button variant="plain" size="sm" onClick={g.retry}>
                        Try again
                      </Button>
                    </div>
                  ) : null}
                  {g.rows.map((r) => {
                    const i = r.off ? -1 : pickable.indexOf(r);
                    return (
                      <div
                        key={r.id}
                        role="option"
                        aria-selected={r.on}
                        aria-disabled={!!r.off}
                        data-active={i === active}
                        title={r.off}
                        onMouseEnter={() => i >= 0 && setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (r.off) return;
                          r.pick();
                          close();
                        }}
                        className={`flex h-8 items-center gap-2 rounded-sm px-2.5 ${r.off ? "cursor-default text-faint" : `cursor-pointer text-ink ${i === active ? "bg-hover" : ""}`}`}
                      >
                        <span className="flex-1 truncate">{r.label}</span>
                        <span className="shrink-0 truncate text-[12px] text-faint">{r.off ?? r.hint}</span>
                        {r.on ? <Check size={13} className="text-ink" /> : <span className="w-[13px]" />}
                      </div>
                    );
                  })}
                  {!q ? g.extra : null}
                </div>
              );
            })}
          </div>
        </Popover>
      ) : null}
    </div>
  );
}

/** "+ New field": a name and a type, made when Add is pressed, through the same path as Settings › Fields. */
function NewField({
  field,
  adding,
  setAdding,
  create,
}: {
  field: Field;
  adding: { label: string; kind: FieldKind; busy: boolean; error: string } | null;
  setAdding: (a: { label: string; kind: FieldKind; busy: boolean; error: string } | null) => void;
  create: () => void;
}) {
  const kinds = customKindsFor(field.type);
  if (!adding)
    return (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAdding({ label: field.label.slice(0, 80), kind: kinds[0], busy: false, error: "" })}
        className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-ink hover:bg-hover"
      >
        <Plus size={13} className="text-muted" />
        New field
      </button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-sm bg-paper-deep p-2">
      <Input
        autoFocus
        value={adding.label}
        maxLength={80}
        aria-label="Field name"
        placeholder="Field name"
        onChange={(e) => setAdding({ ...adding, label: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          }
        }}
        className="h-9"
      />
      <div className="flex items-center gap-2">
        <Select<FieldKind>
          value={adding.kind}
          options={kinds.map((k) => ({ value: k, label: FIELD_KINDS.find((x) => x.value === k)?.label ?? k }))}
          ariaLabel="Field type"
          onChange={(k) => setAdding({ ...adding, kind: k })}
          className="h-8 flex-1 rounded-sm border border-line-strong bg-card px-3 text-[13px]"
        />
        <Button variant="plain" size="sm" onClick={() => setAdding(null)}>
          Cancel
        </Button>
        <Button size="sm" disabled={adding.busy || !adding.label.trim()} onClick={create}>
          Add
        </Button>
      </div>
      {adding.error ? (
        <p role="alert" className="text-[12.5px] text-rose">
          {adding.error}
        </p>
      ) : null}
    </div>
  );
}
