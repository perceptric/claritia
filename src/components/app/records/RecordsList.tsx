"use client";

// One list screen for every record type (Contacts, Leads, Companies, custom objects): view tabs with built-in and
// saved views (shared or just for you), search, filters, table or board, group by, columns, and bulk actions.
// A view remembers its filters, columns (order and width), sort, layout and grouping.

import { useState } from "react";
import { toCsv } from "@/lib/contacts/csv";
import { cleanFilters, describe, type Filter, type FilterField } from "@/lib/filters";
import { filterFields, shown as shownText, valueOf, type AnyField } from "@/lib/records/fields";
import { Check, Download, Plus, Trash, X } from "../../Icons";
import { askConfirm, askText, tell } from "../Dialogs";
import { FilterEditor, Popover } from "../FilterBar";
import { Select } from "../Select";
import { Sketch } from "../../sketches/Sketch";
import { Button, Empty, ErrorNote, errorText, Input, invalidate, Loading, must, Page, Segmented, useDebounced, useKept, useQuery, type ViewProps } from "../ui";
import { FieldDialog } from "./FieldDialog";
import { FieldEditor } from "./FieldInput";
import { useMeta, type Meta } from "./meta";
import { DEFAULT_WIDTH, RecordBoard, RecordTable, type Column, type Row } from "./RecordTable";

export type ViewState = { filters: Filter[]; columns: Column[]; sort: { key: string; desc: boolean }; layout: "table" | "board"; group: string | null };
export type Preset = { name: string } & Partial<ViewState>;
type Saved = ViewState & { id: string; name: string; owner_id: string | null };

const PAGE = 100;
const MAX_EXPORT = 50_000;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Run `fn` on every chunk, a few at a time (bulk changes over thousands of records). */
async function inChunks<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>, at = 3) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(at, chunks.length) }, async () => {
      while (next < chunks.length) await fn(chunks[next++]!);
    }),
  );
}

/** A row with one field set the way the server stores it, for the screen to show before the server answers. */
function withValue(r: Row, key: string, v: unknown): Row | null {
  if (key === "name" || key === "company" || key === "known") return null;
  if (key.startsWith("f.")) {
    const k = key.slice(2);
    if ((r.links as Record<string, unknown> | undefined)?.[k]) return null;
    return { ...r, fields: { ...((r.fields as Record<string, unknown>) ?? {}), [k]: v } };
  }
  if (key === "owner") return { ...r, owner: v, owner_user_id: v };
  return { ...r, [key]: v };
}

const sameView = (a: ViewState, b: ViewState) =>
  JSON.stringify([a.filters, a.columns, a.sort, a.layout, a.group]) === JSON.stringify([b.filters, b.columns, b.sort, b.layout, b.group]);

function useStoredView(key: string, initial: ViewState) {
  const [v, setV] = useState<ViewState>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? { ...initial, ...(JSON.parse(raw) as Partial<ViewState>) } : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: ViewState) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  };
  return [v, set] as const;
}

export function RecordsList({
  sb,
  session,
  ws,
  object,
  screen,
  title,
  icon,
  presets = [],
  base,
  actions,
  onAdd,
  onOpen,
  nameExtra,
  intro,
  bulkExtra,
  sum,
}: Pick<ViewProps, "sb" | "session" | "ws"> & {
  object: string;
  screen: string;
  title: string;
  icon: React.ReactNode;
  presets?: Preset[];
  /** The screen's starting view: columns, sort, layout. */
  base: ViewState;
  actions?: React.ReactNode;
  onAdd?: () => void;
  onOpen: (r: Row) => void;
  nameExtra?: (r: Row) => React.ReactNode;
  /** Shown instead of an empty table when there's nothing at all yet. */
  intro?: React.ReactNode;
  bulkExtra?: (ids: () => Promise<string[]>, done: () => void, meta: Meta) => React.ReactNode;
  /** A field key to total in each board lane. */
  sum?: string;
}) {
  const meta = useMeta(sb, ws.id, object);
  const [view, setView] = useStoredView(`claritia:view:${ws.id}:${screen}`, base);
  // Kept while a record is open, so coming back finds the same view, search, page and selection.
  const keep = `records-list:${ws.id}:${screen}`;
  const [activeId, setActiveId] = useKept<string>(`${keep}:view`, "all");
  const [search, setSearch] = useKept(`${keep}:search`, "");
  const [offset, setOffset] = useKept(`${keep}:offset`, 0);
  const [selected, setSelected] = useKept<Set<string>>(`${keep}:selected`, () => new Set());
  const [allMatching, setAllMatching] = useKept(`${keep}:all`, false);
  // The server is asked once typing stops.
  const query = useDebounced(search.trim(), 250);
  const [pop, setPop] = useState<{ kind: "filter" | "columns" | "save" | "bulk_edit"; anchor: HTMLElement; index?: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [addingField, setAddingField] = useState(false);

  const fields = meta.data?.fields ?? [];
  const fieldsForFilter = filterFields(fields) as FilterField<never>[];
  const filters = meta.data ? cleanFilters(view.filters, fieldsForFilter) : view.filters.filter((f) => !f.field.startsWith("f."));
  const effective = query ? [...filters, { field: "q", op: "contains" as const, values: [query] }] : filters;
  const board = view.layout === "board";
  const groupField = fields.find((f) => f.key === view.group && (f.kind === "select" || f.kind === "user"));

  const saved = useQuery(
    `saved_views:${ws.id}:${screen}`,
    async () =>
      (must(await sb.from("saved_views").select("id, name, filters, columns, sort, layout, group_by, owner_id").eq("workspace_id", ws.id).eq("screen", screen).order("position").order("created_at")) as {
        id: string;
        name: string;
        filters: unknown;
        columns: Column[] | null;
        sort: ViewState["sort"] | null;
        layout: "table" | "board";
        group_by: string | null;
        owner_id: string | null;
      }[]).map(
        (r): Saved => ({
          id: r.id,
          name: r.name,
          owner_id: r.owner_id,
          filters: r.filters as Filter[],
          columns: r.columns ?? base.columns,
          sort: r.sort ?? base.sort,
          layout: r.layout,
          group: r.group_by ?? base.group,
        }),
      ),
  );

  const key = JSON.stringify({ effective, sort: view.sort, offset, board });
  const listKey = `records:${ws.id}:${object}:${key}`;
  const list = useQuery(
    listKey,
    async () =>
      must(
        await sb.rpc("records_list", {
          p_ws: ws.id,
          p_object: object,
          p_filters: effective,
          p_sort: view.sort.key,
          p_desc: view.sort.desc,
          p_limit: board ? 1000 : PAGE,
          p_offset: board ? 0 : offset,
        }),
      ) as { total: number; rows: Row[] },
  );
  const counts = useQuery(`records:${ws.id}:${object}:counts:${key}:${groupField?.key}`, async () =>
    board && groupField ? (must(await sb.rpc("records_group_counts", { p_ws: ws.id, p_object: object, p_filters: effective, p_group: groupField.key })) as Record<string, number>) : {},
  );

  const unselect = () => {
    setSelected(new Set());
    setAllMatching(false);
  };
  const change = (next: Partial<ViewState>) => {
    setView({ ...view, ...next });
    setOffset(0);
    unselect();
  };
  const tabs = [
    { value: "all", label: `All ${title.toLowerCase()}`, state: base },
    ...presets.map((p, i) => ({ value: `p${i}`, label: p.name, state: { ...base, ...p } as ViewState })),
    ...(saved.data ?? []).map((s) => ({ value: s.id, label: s.name, state: s as ViewState })),
  ];
  const active = tabs.find((t) => t.value === activeId) ?? tabs[0];
  const activeSaved = (saved.data ?? []).find((s) => s.id === activeId) ?? null;
  const changed = !sameView(view, active.state);

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const count = allMatching ? total : selected.size;

  /** The ids the selection means, paging through when every match is picked. */
  async function pickedRows(): Promise<Row[]> {
    if (!allMatching) return rows.filter((r) => selected.has(r.id));
    // Pages of 1,000, a few at a time, put back in order.
    const offsets: number[] = [];
    for (let at = 0; at < Math.min(total, MAX_EXPORT); at += 1000) offsets.push(at);
    const pages = new Map<number, Row[]>();
    await inChunks(offsets, 1, async ([at]) => {
      const page = must(await sb.rpc("records_list", { p_ws: ws.id, p_object: object, p_filters: effective, p_sort: view.sort.key, p_desc: view.sort.desc, p_limit: 1000, p_offset: at })) as { rows: Row[] };
      pages.set(at!, page.rows);
    }, 4);
    return offsets.flatMap((at) => pages.get(at) ?? []);
  }
  const pickedIds = async () => (await pickedRows()).map((r) => r.id);

  async function run(label: string, fn: () => Promise<void>) {
    setError("");
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  }

  /**
   * Save one field. The row changes on screen at once (a card dropped on the board stays in its new lane, and the lane
   * counts move with it); the write goes out; a failure puts the row back and shows why. Only fields the screen can't
   * show right without the server (a relation, the name) read the list again.
   */
  const save = async (r: Row, f: AnyField, v: unknown) => {
    const next = withValue(r, f.key, v ?? null);
    const write = async () => must(await sb.rpc("record_set", { p_object: object, p_id: r.id, p_key: f.key, p_value: v ?? null }));
    const lane = (x: Row) => String(valueOf(x, f.key) ?? "");
    const moved = next && board && groupField?.key === f.key ? { from: lane(r), to: lane(next) } : null;
    await run("save", async () => {
      if (!next) {
        await write();
        list.reload();
        return;
      }
      if (moved) counts.set((c) => ({ ...c, [moved.from]: Math.max(0, (c[moved.from] ?? 1) - 1), [moved.to]: (c[moved.to] ?? 0) + 1 }));
      try {
        await list.mutate((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? next : x)) }), write);
      } catch (e) {
        if (moved) counts.reload();
        throw e;
      }
      // The same record in other lists (another view, the record page) reads again when next shown.
      invalidate((k) => k.startsWith(`records:${ws.id}:${object}:`) && k !== listKey && !k.includes(":counts:"));
      if (object === "contact") invalidate("app_counts");
    });
  };

  const exportCsv = () =>
    run("export", async () => {
      const chosen = await pickedRows();
      const cols = fields.filter((f) => f.key !== "segment");
      const head = cols.map((f) => f.label);
      const body = chosen.map((r) =>
        cols.map((f) => {
          if (f.kind === "relation") return (((r.links ?? {}) as Record<string, { name: string }[]>)[f.key.slice(2)] ?? []).map((l) => l.name).join("; ");
          return shownText(f, valueOf(r, f.key));
        }),
      );
      download(`${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]));
      if (object === "contact") must(await sb.rpc("contacts_export_log", { p_ws: ws.id, p_count: chosen.length, p_filters: effective }));
    });

  const remove = async () => {
    if (!(await askConfirm(`Remove ${count.toLocaleString("en-US")} ${count === 1 ? "record" : "records"}?`, { ok: "Remove", danger: true }))) return;
    await run("remove", async () => {
      const ids = await pickedIds();
      await inChunks(ids, 5000, async (chunk) => must(await sb.rpc("records_delete", { p_ws: ws.id, p_object: object, p_ids: chunk })));
      unselect();
      invalidate(`records:${ws.id}:${object}`);
    });
  };

  const saveView = async (name: string, personal: boolean) => {
    await run("view", async () => {
      const row = must(
        await sb
          .from("saved_views")
          .insert({ workspace_id: ws.id, screen, name, filters: view.filters, columns: view.columns, sort: view.sort, layout: view.layout, group_by: view.group, owner_id: personal ? session.user.id : null })
          .select("id")
          .single(),
      ) as { id: string };
      saved.reload();
      setActiveId(row.id);
    });
  };
  const updateView = () =>
    activeSaved &&
    run("view", async () => {
      await saved.mutate(
        (l) => l.map((x) => (x.id === activeSaved.id ? { ...x, ...view } : x)),
        async () => must(await sb.from("saved_views").update({ filters: view.filters, columns: view.columns, sort: view.sort, layout: view.layout, group_by: view.group }).eq("id", activeSaved.id)),
      );
    });
  const renameView = async () => {
    if (!activeSaved) return;
    const name = await askText("Rename view", { initial: activeSaved.name, ok: "Save" });
    if (!name) return;
    await run("view", async () => {
      await saved.mutate((l) => l.map((x) => (x.id === activeSaved.id ? { ...x, name } : x)), async () => must(await sb.from("saved_views").update({ name }).eq("id", activeSaved.id)));
    });
  };
  const deleteView = async () => {
    if (!activeSaved || !(await askConfirm(`Delete the view "${activeSaved.name}"?`, { ok: "Delete", danger: true }))) return;
    await run("view", async () => {
      setActiveId("all");
      change(base);
      await saved.mutate((l) => l.filter((x) => x.id !== activeSaved.id), async () => must(await sb.from("saved_views").delete().eq("id", activeSaved.id)));
    });
  };

  const pickTab = (id: string) => {
    const t = tabs.find((x) => x.value === id);
    if (!t) return;
    setActiveId(id);
    change({ ...t.state });
  };

  if (meta.error || list.error) {
    return (
      <Page icon={icon} title={title}>
        <ErrorNote message={meta.error || list.error} />
      </Page>
    );
  }
  if (list.data && total === 0 && !effective.length && intro && activeId === "all") {
    return (
      <Page icon={icon} title={title} actions={actions}>
        {intro}
      </Page>
    );
  }

  const columns = view.columns.filter((c) => fields.some((f) => f.key === c.key));
  const editable = fields.filter((f) => f.edit);
  const groupable = fields.filter((f) => (f.kind === "select" || f.kind === "user") && f.edit);
  const cardFields = columns
    .map((c) => fields.find((f) => f.key === c.key))
    .filter((f): f is AnyField => !!f && f.key !== view.group)
    .slice(0, 3);

  const fieldDialog = addingField ? (
    <FieldDialog
      sb={sb}
      ws={ws}
      object={object}
      onClose={() => setAddingField(false)}
      onSaved={(key) => {
        setAddingField(false);
        if (key) setView({ ...view, columns: [...view.columns.filter((c) => c.key !== `f.${key}`), { key: `f.${key}`, width: DEFAULT_WIDTH }] });
      }}
    />
  ) : null;
  return (
    <Page icon={icon} title={title} count={list.data ? total.toLocaleString("en-US") : undefined} flush actions={actions}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
          {tabs.length > 1 ? <Select value={active.value} options={tabs.map((t) => ({ value: t.value, label: t.label }))} onChange={pickTab} ariaLabel="View" className="h-8 w-44" /> : null}
          <div className="w-56">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search"
              className="h-9"
            />
          </div>
          {filters.map((f, i) => (
            <span key={i} className="anim-pop inline-flex h-8 items-center gap-0.5 rounded-full border border-line-strong bg-card pr-1 text-[12.5px] transition-[translate,box-shadow] duration-[320ms] ease-out hover:-translate-y-px hover:shadow-soft">
              <button type="button" onClick={(e) => setPop({ kind: "filter", anchor: e.currentTarget, index: i })} className="h-full max-w-[300px] truncate rounded-full pr-1.5 pl-3 hover:text-ink">
                {describe(f, fieldsForFilter.find((x) => x.key === f.field))}
              </button>
              <button type="button" aria-label="Remove filter" onClick={() => change({ filters: filters.filter((_, j) => j !== i) })} className="flex size-6 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                <X size={12} />
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={(e) => setPop({ kind: "filter", anchor: e.currentTarget })} disabled={filters.length >= 20}>
            <Plus size={13} />
            Filter
          </Button>
          {changed ? (
            activeSaved ? (
              <>
                <Button variant="plain" size="sm" onClick={updateView} disabled={!!busy}>
                  Save changes
                </Button>
                <Button variant="plain" size="sm" onClick={() => change(activeSaved)}>
                  Reset
                </Button>
              </>
            ) : (
              <Button variant="plain" size="sm" onClick={(e) => setPop({ kind: "save", anchor: e.currentTarget })}>
                Save view
              </Button>
            )
          ) : null}
          {activeSaved && !changed ? (
            <>
              <Button variant="plain" size="sm" onClick={renameView}>
                Rename
              </Button>
              <Button variant="plain" size="sm" onClick={deleteView}>
                Delete view
              </Button>
            </>
          ) : null}
          <span className="ml-auto flex items-center gap-2">
            <Segmented<"table" | "board">
              value={view.layout}
              label="Layout"
              onChange={(layout) => change({ layout, group: view.group ?? groupable[0]?.key ?? null })}
              options={[
                { value: "table", label: "Table" },
                { value: "board", label: "Board" },
              ]}
            />
            {board ? (
              <Select<string>
                value={groupField?.key ?? ""}
                onChange={(group) => change({ group })}
                ariaLabel="Group by"
                placeholder="Group by"
                options={groupable.map((f) => ({ value: f.key, label: f.label }))}
                className="h-9 w-40 rounded-sm border border-line-strong bg-card px-3 text-[13px] focus:border-ink"
              />
            ) : (
              <Button variant="ghost" size="sm" onClick={(e) => setPop({ kind: "columns", anchor: e.currentTarget })}>
                Columns
              </Button>
            )}
            {onAdd ? (
              <Button size="sm" onClick={onAdd}>
                <Plus size={13} />
                New
              </Button>
            ) : null}
          </span>
        </div>

        {count ? (
          <div className="anim-rise-sm flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-1.5 text-[13px]">
            <span className="font-medium">{count.toLocaleString("en-US")} selected</span>
            {!allMatching && rows.length && rows.every((r) => selected.has(r.id)) && total > rows.length ? (
              <Button variant="plain" size="sm" onClick={() => setAllMatching(true)}>
                Select all {total.toLocaleString("en-US")}
              </Button>
            ) : null}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={(e) => setPop({ kind: "bulk_edit", anchor: e.currentTarget })} disabled={!!busy}>
                Edit field
              </Button>
              {meta.data && bulkExtra
                ? bulkExtra(pickedIds, () => {
                    unselect();
                    list.reload();
                  }, meta.data)
                : null}
              <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!!busy}>
                <Download size={13} />
                {busy === "export" ? "Exporting…" : "Export"}
              </Button>
              <Button variant="danger" size="sm" onClick={remove} disabled={!!busy}>
                <Trash size={13} />
                {busy === "remove" ? "Removing…" : "Remove"}
              </Button>
              <Button variant="plain" size="sm" onClick={unselect}>
                Clear
              </Button>
            </span>
          </div>
        ) : null}
        {error ? (
          <div className="shrink-0 p-4">
            <ErrorNote message={error} />
          </div>
        ) : null}

        {!list.data || !meta.data ? (
          <Loading />
        ) : !rows.length ? (
          <Empty icon={icon} sketch={effective.length ? undefined : <Sketch name="cards" size={160} />} title={effective.length ? "Nothing matches" : `No ${title.toLowerCase()} yet`} />
        ) : board && groupField ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <RecordBoard
              group={{ key: groupField.key, label: groupField.label, options: groupField.options }}
              rows={rows}
              counts={counts.data ?? {}}
              cardFields={cardFields}
              onOpen={onOpen}
              onMove={(r, v) => void save(r, groupField, v)}
              sum={sum ? fields.find((f) => f.key === sum) : undefined}
            />
          </div>
        ) : board ? (
          <Empty icon={icon} title="Pick a field to group by" />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <RecordTable
              sb={sb}
              wsId={ws.id}
              fields={fields}
              columns={columns}
              rows={rows}
              sort={view.sort}
              onSort={(k) => change({ sort: { key: k, desc: view.sort.key === k ? !view.sort.desc : k !== "name" } })}
              selected={selected}
              allMatching={allMatching}
              onToggle={(id) => {
                const next = new Set(allMatching ? rows.map((r) => r.id) : selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                setAllMatching(false);
                setSelected(next);
              }}
              onTogglePage={() => {
                const all = rows.every((r) => selected.has(r.id));
                setAllMatching(false);
                setSelected(all ? new Set() : new Set(rows.map((r) => r.id)));
              }}
              onOpen={onOpen}
              onSave={save}
              onColumns={(c) => setView({ ...view, columns: c })}
              nameExtra={nameExtra}
              onAddField={() => setAddingField(true)}
              scrollKey={keep}
            />
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2 text-[12px] text-muted">
              <span>
                {(offset + 1).toLocaleString("en-US")}–{(offset + rows.length).toLocaleString("en-US")} of {total.toLocaleString("en-US")}
              </span>
              <span className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => {
                    setOffset(Math.max(0, offset - PAGE));
                    unselect();
                  }}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={offset + PAGE >= total}
                  onClick={() => {
                    setOffset(offset + PAGE);
                    unselect();
                  }}
                >
                  Next
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>

      {pop?.kind === "filter" ? (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)}>
          <FilterEditor
            fields={fieldsForFilter}
            start={pop.index == null ? null : filters[pop.index]}
            onDone={(f) => {
              if (f) change({ filters: pop.index == null ? [...filters, f] : filters.map((x, j) => (j === pop.index ? f : x)) });
              setPop(null);
            }}
          />
        </Popover>
      ) : null}
      {pop?.kind === "columns" ? (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={260}>
          <ul className="max-h-96 overflow-y-auto p-1">
            {fields
              .filter((f) => f.key !== "name" && !f.hidden)
              .map((f) => {
                const on = columns.some((c) => c.key === f.key);
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setView({ ...view, columns: on ? view.columns.filter((c) => c.key !== f.key) : [...view.columns, { key: f.key, width: DEFAULT_WIDTH }] })}
                      className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left hover:bg-hover"
                    >
                      <span className={`flex size-4 items-center justify-center rounded-[5px] border transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card"}`}>{on ? <Check size={11} /> : null}</span>
                      <span className="flex-1 truncate">{f.label}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </Popover>
      ) : null}
      {pop?.kind === "save" ? (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={300}>
          <SaveView
            onDone={(name, personal) => {
              setPop(null);
              if (name) void saveView(name, personal);
            }}
          />
        </Popover>
      ) : null}
      {pop?.kind === "bulk_edit" ? (
        <Popover anchor={pop.anchor} onClose={() => setPop(null)} width={320}>
          <BulkEdit
            sb={sb}
            wsId={ws.id}
            fields={editable.filter((f) => f.kind !== "relation")}
            onDone={async (f, v) => {
              setPop(null);
              if (!f) return;
              await run("bulk", async () => {
                const ids = await pickedIds();
                await inChunks(ids, 2000, async (chunk) => must(await sb.rpc("records_bulk_set", { p_ws: ws.id, p_object: object, p_ids: chunk, p_key: f.key, p_value: v ?? null })));
                unselect();
                invalidate(`records:${ws.id}:${object}`);
                await tell(`${f.label} set on ${ids.length.toLocaleString("en-US")} ${ids.length === 1 ? "record" : "records"}`);
              });
            }}
          />
        </Popover>
      ) : null}
      {fieldDialog}
    </Page>
  );
}

function SaveView({ onDone }: { onDone: (name: string | null, personal: boolean) => void }) {
  const [name, setName] = useState("");
  const [who, setWho] = useState<"team" | "me">("team");
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onDone(name.trim(), who === "me");
      }}
    >
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="View name" maxLength={80} className="h-9" />
      <Segmented<"team" | "me">
        value={who}
        onChange={setWho}
        label="Who sees it"
        options={[
          { value: "team", label: "Everyone" },
          { value: "me", label: "Only me" },
        ]}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="plain" size="sm" onClick={() => onDone(null, false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}

function BulkEdit({ sb, wsId, fields, onDone }: { sb: ViewProps["sb"]; wsId: string; fields: AnyField[]; onDone: (f: AnyField | null, v: unknown) => void }) {
  const [key, setKey] = useState<string>("");
  const field = fields.find((f) => f.key === key);
  return (
    <div className="flex flex-col gap-3 p-3">
      <Select<string>
        value={key}
        onChange={setKey}
        ariaLabel="Field"
        placeholder="Field"
        options={fields.map((f) => ({ value: f.key, label: f.label }))}
        className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] focus:border-ink"
      />
      {field ? <FieldEditor key={field.key} sb={sb} wsId={wsId} field={field} value={null} onSave={(v) => onDone(field, v)} onCancel={() => onDone(null, null)} /> : null}
    </div>
  );
}
