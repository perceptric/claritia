"use client";

// Routing › Regions and Company types (docs/router-ux-v2.md Part 16.2): the named blocks rules are built from.
//   Regions        named places ("North America", "DACH") by country; a rule says "Country is North America"
//   Company types  named kinds of company ("Enterprise: over 1,000 people"); a rule says "Company type is Enterprise"
// Each shows which rules use it. Changes save to the draft and go live with Make live on Rules; renaming a company
// type renames it in the rules too.

import { useMemo, useState } from "react";
import { BASE_FIELDS, countryName, needsValue, opsFor, REGIONS, ruleWords, type FieldDef } from "@/lib/router/conditions";
import { newId } from "@/lib/router/check";
import { OPS, type Cond, type Op, type RouterBody, type Segment, type Territory } from "@/lib/router/types";
import { COUNTRY_CODES } from "@/lib/forms/countries";
import { Building, MapIcon, Plus, Trash, X } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { MoreMenu } from "../StatCards";
import { Badge, Button, Empty, ErrorNote, Input, Loading, Page, Segmented, type ViewProps } from "../ui";
import { Modal } from "../meetings/parts";
import { newCond, splitList, withField, withOp } from "./editorModel";
import { useRouterData } from "./useRouterData";

const usedBy = (b: RouterBody, test: (c: Cond) => boolean) => b.rules.list.filter((r) => r.conds.some(test));

function Draftbar({ show, onOpen }: { show: boolean; onOpen: () => void }) {
  if (!show) return null;
  return (
    <div className="anim-rise-sm flex items-center gap-3 rounded-2xl border border-butter/40 bg-butter-wash/50 px-4 py-2.5 text-[13px]">
      <span className="size-2 rounded-full bg-butter" />
      <span className="flex-1 text-ink">You have changes that aren&apos;t live.</span>
      <Button size="sm" onClick={onOpen}>
        Review and make live
      </Button>
    </div>
  );
}

// Regions ---------------------------------------------------------------------------------------------------------

export function RegionsPage(props: ViewProps) {
  const { session, ws, role, navigate } = props;
  const r = useRouterData(session, ws.id);
  const [editing, setEditing] = useState<Territory | "new" | null>(null);
  const owner = role === "owner";
  const b = r.body;
  const list = b?.territories ?? [];
  const remove = async (t: Territory) => {
    const rules = b ? usedBy(b, (c) => Array.isArray(c.value) && c.value.includes(`t:${t.id}`)) : [];
    if (!(await askConfirm(`Delete ${t.name}?`, { body: rules.length ? `${rules.length === 1 ? "A rule uses" : `${rules.length} rules use`} it; ${rules.length === 1 ? "that rule" : "they"} will need a new place.` : undefined, ok: "Delete", danger: true }))) return;
    await r.change((x) => ({ ...x, territories: x.territories.filter((y) => y.id !== t.id) }));
  };
  return (
    <Page
      title="Regions"
      count={list.length || undefined}
      actions={
        owner ? (
          <Button onClick={() => setEditing("new")}>
            <Plus size={14} />
            New region
          </Button>
        ) : null
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Draftbar show={!!r.data?.draft && !!r.data.live} onOpen={() => navigate("routing", "rules")} />
        <ErrorNote message={r.error} />
        {!b ? (
          <Loading />
        ) : !list.length ? (
          <Empty icon={<MapIcon size={18} />} title="No regions yet">
            {owner ? (
              <Button className="mt-3" onClick={() => setEditing("new")}>
                <Plus size={14} />
                New region
              </Button>
            ) : null}
          </Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((t, i) => {
              const rules = usedBy(b, (c) => Array.isArray(c.value) && c.value.includes(`t:${t.id}`));
              return (
                <li key={t.id} className="lift anim-rise-sm flex flex-col gap-3 rounded-2xl border border-line bg-card p-5" style={{ animationDelay: `${i * 40}ms` }}>
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-sage-wash text-sage">
                      <MapIcon size={14} />
                    </span>
                    <button type="button" disabled={!owner} onClick={() => setEditing(t)} className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold tracking-[-0.01em] text-ink">
                      {t.name}
                    </button>
                    <span className="text-[12px] text-muted tabular-nums">{t.countries.length} {t.countries.length === 1 ? "country" : "countries"}</span>
                    {owner ? (
                      <MoreMenu
                        items={[
                          { label: "Edit", run: () => setEditing(t) },
                          { label: "Delete", danger: true, run: () => void remove(t) },
                        ]}
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.countries.slice(0, 10).map((c) => (
                      <Badge key={c}>{countryName(c)}</Badge>
                    ))}
                    {t.countries.length > 10 ? <Badge>+{t.countries.length - 10}</Badge> : null}
                  </div>
                  <p className="text-[12.5px] text-faint">{rules.length ? `Used by ${rules.map((x) => `"${x.name}"`).join(", ")}` : "Not used by a rule yet"}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing ? (
        <RegionDialog
          row={editing === "new" ? null : editing}
          taken={new Set(list.filter((x) => editing === "new" || x.id !== editing.id).map((x) => x.name.toLowerCase()))}
          busy={r.saving}
          onClose={() => setEditing(null)}
          onSave={async (t) => {
            const ok = await r.change((x) => ({ ...x, territories: x.territories.some((y) => y.id === t.id) ? x.territories.map((y) => (y.id === t.id ? t : y)) : [...x.territories, t] }));
            if (ok) setEditing(null);
          }}
        />
      ) : null}
    </Page>
  );
}

const ALL_COUNTRIES = COUNTRY_CODES.map((c) => ({ code: c, name: countryName(c) }));

/** A country code from what was typed: a code ("de") or a name ("Germany"). */
const toCode = (x: string) => {
  const t = x.trim().toLowerCase();
  return ALL_COUNTRIES.find((c) => c.code.toLowerCase() === t || c.name.toLowerCase() === t)?.code ?? null;
};

function RegionDialog({ row, taken, busy, onClose, onSave }: { row: Territory | null; taken: Set<string>; busy: boolean; onClose: () => void; onSave: (t: Territory) => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [countries, setCountries] = useState<string[]>(row?.countries ?? []);
  const [typed, setTyped] = useState("");
  const matches = useMemo(() => {
    const t = typed.trim().toLowerCase();
    return t ? ALL_COUNTRIES.filter((c) => !countries.includes(c.code) && (c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t)).slice(0, 6) : [];
  }, [typed, countries]);
  const add = (codes: string[]) => setCountries((xs) => [...new Set([...xs, ...codes])]);
  const error = !name.trim() ? "" : taken.has(name.trim().toLowerCase()) ? "That name is taken." : "";
  return (
    <Modal
      title={row ? row.name : "New region"}
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || !countries.length || !!error} onClick={() => onSave({ id: row?.id ?? newId("t_"), name: name.trim(), countries })}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Name, like North America" aria-label="Name" className="h-9" />
        <div className="flex flex-wrap gap-1.5">
          {REGIONS.map((x) => (
            <button key={x.name} type="button" onClick={() => { add(x.countries); if (!name.trim()) setName(x.name); }} className="press h-7 rounded-full border border-line px-3 text-[12px] text-body hover:border-line-strong hover:text-ink">
              + {x.name}
            </button>
          ))}
        </div>
        <div className="relative">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const codes = splitList(typed).map(toCode).filter((x): x is string => !!x);
              if (codes.length) add(codes);
              else if (matches[0]) add([matches[0].code]);
              setTyped("");
            }}
            placeholder="Add a country"
            aria-label="Add a country"
            className="h-9"
          />
          {matches.length ? (
            <ul className="absolute inset-x-0 top-10 z-10 rounded-lg border border-line bg-card p-1 shadow-float" role="listbox">
              {matches.map((c) => (
                <li key={c.code}>
                  <button type="button" role="option" aria-selected={false} onClick={() => { add([c.code]); setTyped(""); }} className="flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-hover">
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {countries.map((c) => (
            <span key={c} className="inline-flex h-7 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-3 text-[12px] text-ink">
              {countryName(c)}
              <button type="button" aria-label={`Remove ${countryName(c)}`} onClick={() => setCountries((xs) => xs.filter((x) => x !== c))} className="press rounded-full p-0.5 text-faint hover:bg-hover hover:text-ink">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}

// Company types ------------------------------------------------------------------------------------------------------

const COMPANY_FIELDS = (fields: FieldDef[]) => (fields.length ? fields : BASE_FIELDS).filter((f) => f.group === "Company" && f.key !== "company.type");

export function CompanyTypesPage(props: ViewProps) {
  const { session, ws, role, navigate } = props;
  const r = useRouterData(session, ws.id);
  const [editing, setEditing] = useState<Segment | "new" | null>(null);
  const owner = role === "owner";
  const b = r.body;
  const list = b?.segments ?? [];
  const fields = COMPANY_FIELDS(r.data?.fields ?? []);
  const uses = (s: Segment) => (b ? usedBy(b, (c) => c.field === "company.type" && (Array.isArray(c.value) ? c.value : [c.value]).some((v) => String(v).toLowerCase() === s.name.toLowerCase())) : []);
  const remove = async (s: Segment) => {
    const rules = uses(s);
    if (!(await askConfirm(`Delete ${s.name}?`, { body: rules.length ? `${rules.length === 1 ? "A rule uses" : `${rules.length} rules use`} it.` : undefined, ok: "Delete", danger: true }))) return;
    await r.change((x) => ({ ...x, segments: (x.segments ?? []).filter((y) => y.id !== s.id) }));
  };
  const save = async (s: Segment) => {
    const before = list.find((x) => x.id === s.id);
    const ok = await r.change((x) => {
      const segments = (x.segments ?? []).some((y) => y.id === s.id) ? (x.segments ?? []).map((y) => (y.id === s.id ? s : y)) : [...(x.segments ?? []), s];
      // A new name follows into the rules that test the old one.
      const rename = (v: string | number) => (before && typeof v === "string" && v.toLowerCase() === before.name.toLowerCase() ? s.name : v);
      const list2 = before && before.name !== s.name ? x.rules.list.map((rule) => ({ ...rule, conds: rule.conds.map((c) => (c.field === "company.type" ? { ...c, value: Array.isArray(c.value) ? c.value.map(rename) : c.value === undefined ? undefined : rename(c.value) } : c)) })) : x.rules.list;
      return { ...x, segments, rules: { ...x.rules, list: list2 } };
    });
    if (ok) setEditing(null);
  };
  return (
    <Page
      title="Company types"
      count={list.length || undefined}
      actions={
        owner ? (
          <Button onClick={() => setEditing("new")}>
            <Plus size={14} />
            New company type
          </Button>
        ) : null
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Draftbar show={!!r.data?.draft && !!r.data.live} onOpen={() => navigate("routing", "rules")} />
        <ErrorNote message={r.error} />
        {!b ? (
          <Loading />
        ) : !list.length ? (
          <Empty icon={<Building size={18} />} title="No company types yet">
            {owner ? (
              <Button className="mt-3" onClick={() => setEditing("new")}>
                <Plus size={14} />
                New company type
              </Button>
            ) : null}
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((s, i) => {
              const rules = uses(s);
              return (
                <li key={s.id} className="lift anim-rise-sm flex items-center gap-3 rounded-2xl border border-line bg-card px-5 py-4" style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage-wash text-sage">
                    <Building size={15} />
                  </span>
                  <button type="button" disabled={!owner} onClick={() => setEditing(s)} className="flex min-w-0 flex-1 flex-col text-left">
                    <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{s.name}</span>
                    <span className="truncate text-[12.5px] text-muted">{ruleWords({ ...s, queue: "" }, r.data?.fields ?? BASE_FIELDS, b.territories)}</span>
                    <span className="truncate text-[12px] text-faint">{rules.length ? `Used by ${rules.map((x) => `"${x.name}"`).join(", ")}` : "Not used by a rule yet"}</span>
                  </button>
                  {owner ? (
                    <MoreMenu
                      items={[
                        { label: "Edit", run: () => setEditing(s) },
                        { label: "Delete", danger: true, run: () => void remove(s) },
                      ]}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing ? (
        <SegmentDialog
          row={editing === "new" ? null : editing}
          fields={fields}
          taken={new Set(list.filter((x) => editing === "new" || x.id !== editing.id).map((x) => x.name.toLowerCase()))}
          busy={r.saving}
          onClose={() => setEditing(null)}
          onSave={(s) => void save(s)}
        />
      ) : null}
    </Page>
  );
}

const OP_LABEL = Object.fromEntries(OPS.map((o) => [o.value, o.label])) as Record<Op, string>;

function SegmentDialog({ row, fields, taken, busy, onClose, onSave }: { row: Segment | null; fields: FieldDef[]; taken: Set<string>; busy: boolean; onClose: () => void; onSave: (s: Segment) => void }) {
  const [name, setName] = useState(row?.name ?? "");
  const [match, setMatch] = useState<"all" | "any">(row?.match ?? "all");
  const [conds, setConds] = useState<Cond[]>(row?.conds.length ? row.conds : fields[0] ? [newCond(fields.find((f) => f.key === "company.size") ?? fields[0])] : []);
  const error = name.trim() && taken.has(name.trim().toLowerCase()) ? "That name is taken." : "";
  const set = (i: number, c: Cond) => setConds((xs) => xs.map((x, j) => (j === i ? c : x)));
  return (
    <Modal
      title={row ? row.name : "New company type"}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim() || !conds.length || !!error} onClick={() => onSave({ id: row?.id ?? newId("s_"), name: name.trim(), match, conds })}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Name, like Enterprise" aria-label="Name" className="h-9 max-w-xs" />
        <div className="flex items-center gap-2 text-[13px] text-body">
          A company is this type when
          <Segmented<"all" | "any">
            label="Match"
            value={match}
            options={[
              { value: "all", label: "all" },
              { value: "any", label: "any" },
            ]}
            onChange={setMatch}
          />
          of these hold
        </div>
        <ul className="flex flex-col gap-2">
          {conds.map((c, i) => {
            const f = fields.find((x) => x.key === c.field) ?? fields[0];
            const type = f?.type ?? "text";
            return (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Select<string> value={c.field} options={fields.map((x) => ({ value: x.key, label: x.label }))} onChange={(k) => set(i, withField(c, fields.find((x) => x.key === k)!, f))} ariaLabel="Field" className="h-9 w-44" />
                <Select<Op> value={c.op} options={opsFor(type).map((o) => ({ value: o, label: OP_LABEL[o] }))} onChange={(op) => set(i, withOp(c, op, type))} ariaLabel="Test" className="h-9 w-36" />
                {needsValue(c.op) ? (
                  c.op === "between" ? (
                    <span className="flex items-center gap-1.5 text-[13px] text-muted">
                      <Input type="number" value={Array.isArray(c.value) ? String(c.value[0] ?? "") : ""} onChange={(e) => set(i, { ...c, value: [Number(e.target.value), Array.isArray(c.value) ? (c.value[1] ?? 0) : 0] })} aria-label="From" className="h-9 w-24" />
                      and
                      <Input type="number" value={Array.isArray(c.value) ? String(c.value[1] ?? "") : ""} onChange={(e) => set(i, { ...c, value: [Array.isArray(c.value) ? (c.value[0] ?? 0) : 0, Number(e.target.value)] })} aria-label="To" className="h-9 w-24" />
                    </span>
                  ) : (
                    <Input
                      value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")}
                      onChange={(e) => set(i, { ...c, value: c.op === "one_of" || c.op === "not_one_of" || c.op === "contains" || c.op === "starts_with" ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : type === "number" ? Number(e.target.value) : e.target.value })}
                      placeholder={type === "number" ? "1000" : type === "country" ? "US, CA" : "Value"}
                      aria-label="Value"
                      className="h-9 min-w-[140px] flex-1"
                    />
                  )
                ) : null}
                <button type="button" aria-label="Remove condition" onClick={() => setConds((xs) => xs.filter((_, j) => j !== i))} className="press rounded-full p-1.5 text-faint hover:bg-hover hover:text-ink">
                  <Trash size={13} />
                </button>
              </li>
            );
          })}
        </ul>
        {fields[0] ? (
          <Button variant="plain" size="sm" className="self-start" onClick={() => setConds((xs) => [...xs, newCond(fields[0]!)])}>
            <Plus size={13} />
            Add a condition
          </Button>
        ) : null}
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
