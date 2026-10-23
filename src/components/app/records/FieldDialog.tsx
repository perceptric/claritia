"use client";

// Add or change a custom field, from the table's + column, the record page or Settings › Fields (docs/crm.md).
// Like Omniscient's field page in one dialog: the name, the type, colored options for pick lists, what a link points
// at, a one-line description shown on hover, the group and whether it's required.

import { useEffect, useState } from "react";
import { FIELD_KINDS, OPTION_COLORS, optionsOf, type CustomField, type FieldKind, type Option } from "@/lib/records/fields";
import { Plus, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, errorText, Field, IconButton, Input, must, Segmented, type Tone, type ViewProps } from "../ui";

const GLYPH: Record<FieldKind, string> = {
  text: "Aa",
  long_text: "¶",
  number: "#",
  currency: "$",
  percent: "%",
  date: "D",
  datetime: "DT",
  select: "◉",
  multi_select: "☰",
  checkbox: "✓",
  url: "↗",
  email: "@",
  phone: "☏",
  user: "U",
  relation: "⇄",
  rating: "▪▪",
};

const slug = (l: string) => l.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "option";

export function FieldDialog({
  sb,
  ws,
  object,
  objects: given,
  start,
  onClose,
  onSaved,
}: Pick<ViewProps, "sb" | "ws"> & {
  object: string;
  /** What a linked-record field can point at; loaded when not given. */
  objects?: { value: string; label: string }[];
  start?: CustomField;
  onClose: () => void;
  /** The field's key once it's saved, or null once it's deleted. */
  onSaved: (key: string | null) => void;
}) {
  const [label, setLabel] = useState(start?.label ?? "");
  const [type, setType] = useState<FieldKind>(start?.type ?? "text");
  const [options, setOptions] = useState<Option[]>(() => (start ? optionsOf(start) : [{ value: "", label: "", color: "gray" }]));
  const [description, setDescription] = useState(start?.config?.description ?? "");
  const [group, setGroup] = useState(start?.group_name ?? start?.group ?? "");
  const [required, setRequired] = useState(!!start?.required);
  const [target, setTarget] = useState(start?.config?.target ?? "contact");
  const [multiple, setMultiple] = useState<"one" | "many">(start?.config?.multiple ? "many" : "one");
  const [currency, setCurrency] = useState(start?.config?.currency ?? "USD");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<{ value: string; label: string }[] | null>(null);
  useEffect(() => {
    if (given || type !== "relation" || loaded) return;
    void sb
      .from("objects")
      .select("key, plural")
      .eq("workspace_id", ws.id)
      .order("created_at")
      .then(({ data }) => setLoaded(((data ?? []) as { key: string; plural: string }[]).map((o) => ({ value: o.key, label: o.plural }))));
  }, [given, type, loaded, sb, ws.id]);
  const objects = given ?? [{ value: "contact", label: "Contacts" }, { value: "company", label: "Companies" }, ...(loaded ?? [])];
  const picks = type === "select" || type === "multi_select";
  const clean = options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label);
  const ready = !!label.trim() && (!picks || clean.length > 0);

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const seen = new Set<string>();
    const opts = clean
      .map((o) => ({ value: o.value || slug(o.label), label: o.label.slice(0, 60), ...(o.color && o.color !== "gray" ? { color: o.color } : {}), ...(o.kind ? { kind: o.kind } : {}) }))
      .filter((o) => !seen.has(o.value) && seen.add(o.value));
    const config = {
      ...(type === "relation" ? { target, multiple: multiple === "many" } : {}),
      ...(type === "currency" ? { currency: currency.toUpperCase().slice(0, 3) } : {}),
      description: description.trim().slice(0, 200),
    };
    try {
      if (start) {
        must(await sb.rpc("field_update", { p_ws: ws.id, p_object: object, p_key: start.key, p_label: label.trim(), p_options: picks ? opts : null, p_config: config, p_required: required, p_group: group.trim() }));
        onSaved(start.key);
      } else {
        const made = must(await sb.rpc("field_add", { p_ws: ws.id, p_object: object, p_label: label.trim(), p_type: type, p_options: picks ? opts : [], p_config: config, p_required: required, p_group: group.trim() || null })) as { key: string };
        onSaved(made.key);
      }
      window.dispatchEvent(new Event("claritia:changed"));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!start || !(await askConfirm(`Delete "${start.label}"?`, { body: "Its values go from every record.", ok: "Delete", danger: true }))) return;
    try {
      must(await sb.rpc("field_delete", { p_ws: ws.id, p_object: object, p_key: start.key }));
      window.dispatchEvent(new Event("claritia:changed"));
      onSaved(null);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const setOption = (i: number, patch: Partial<Option>) => setOptions((l) => l.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const nextColor = (c?: string) => OPTION_COLORS[(OPTION_COLORS.indexOf((c ?? "gray") as (typeof OPTION_COLORS)[number]) + 1) % OPTION_COLORS.length];

  return (
    <div className="anim-fade fixed inset-0 z-[80] flex items-start justify-center overflow-auto bg-scrim px-4 py-[8vh]" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={start ? "Edit field" : "New field"}
        className="anim-rise-sm w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-card shadow-float"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <h2 className="serif flex-1 text-[22px] text-ink">{start ? "Edit field" : "New field"}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={14} />
          </IconButton>
        </div>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-auto p-5">
          <Field label="Name">
            <Input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Budget, Renewal date, Plan…" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="label-mono">Type</span>
            <div className="grid grid-cols-4 gap-1.5">
              {FIELD_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  disabled={!!start}
                  aria-pressed={type === k.value}
                  onClick={() => setType(k.value)}
                  className={`press flex h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[11.5px] transition-colors duration-[140ms] ${type === k.value ? "border-ink bg-card text-ink ring-1 ring-ink" : "border-line bg-card text-body hover:border-line-strong hover:bg-paper"} disabled:cursor-default ${start && type !== k.value ? "opacity-40" : ""}`}
                >
                  <span className="font-mono text-[12px]">{GLYPH[k.value]}</span>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          {picks ? (
            <div className="flex flex-col gap-1.5">
              <span className="label-mono">Options</span>
              <ul className="flex flex-col gap-1">
                {options.map((o, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <button type="button" aria-label="Change color" title="Change color" onClick={() => setOption(i, { color: nextColor(o.color) })} className="press shrink-0 rounded-full">
                      <Badge tone={(o.color as Tone) || "gray"}>{o.label.trim() ? o.label.slice(0, 14) : "Color"}</Badge>
                    </button>
                    <Input
                      value={o.label}
                      onChange={(e) => setOption(i, { label: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setOptions((l) => [...l.slice(0, i + 1), { value: "", label: "", color: OPTION_COLORS[(i + 1) % OPTION_COLORS.length] }, ...l.slice(i + 1)]);
                        }
                      }}
                      placeholder={`Option ${i + 1}`}
                      aria-label={`Option ${i + 1}`}
                      maxLength={60}
                    />
                    <button type="button" aria-label="Remove option" onClick={() => setOptions((l) => l.filter((_, j) => j !== i))} disabled={options.length === 1} className="press flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-rose disabled:opacity-30">
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div>
                <Button type="button" variant="plain" onClick={() => setOptions((l) => [...l, { value: "", label: "", color: OPTION_COLORS[l.length % OPTION_COLORS.length] }])}>
                  <Plus size={14} />
                  Add option
                </Button>
              </div>
            </div>
          ) : null}
          {type === "relation" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Links to">
                <Select<string> value={target} onChange={setTarget} disabled={!!start} ariaLabel="Links to" options={objects} className="h-10 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] focus:border-ink disabled:opacity-60" />
              </Field>
              <Field label="How many">
                <Segmented<"one" | "many">
                  value={multiple}
                  onChange={setMultiple}
                  options={[
                    { value: "one", label: "One" },
                    { value: "many", label: "Many" },
                  ]}
                />
              </Field>
            </div>
          ) : null}
          {type === "currency" ? (
            <Field label="Currency">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="w-28" />
            </Field>
          ) : null}
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Group">
              <Input value={group} onChange={(e) => setGroup(e.target.value)} maxLength={60} />
            </Field>
            <Field label="Required">
              <Segmented<"no" | "yes">
                value={required ? "yes" : "no"}
                onChange={(v) => setRequired(v === "yes")}
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                ]}
              />
            </Field>
          </div>
          <ErrorNote message={error} />
        </div>
        <div className="flex items-center gap-2 border-t border-line bg-paper px-5 py-3">
          {start && !start.system ? (
            <Button type="button" variant="danger" onClick={remove}>
              Delete
            </Button>
          ) : null}
          <Button type="button" variant="plain" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ready || busy}>
            {busy ? "Saving…" : start ? "Save" : "Add field"}
          </Button>
        </div>
      </form>
    </div>
  );
}
