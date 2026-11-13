"use client";

// Emails › Automations, the workflows (docs/workflows.md): folders on the left, each holding workflows, and the open
// one in the workflow editor on the right. Describe an automation (Tia builds a draft from words) sits in the New menu
// and on the first screen. Folders are made, renamed, moved and deleted here; a workflow moves between them by drag and drop. The
// first visit, with no workflows, offers New automation. Before migration 100 there are no folders: one list.

import { useCallback, useRef, useState } from "react";
import { ChevronRight, Folder, FolderPlus, Plus } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { startingItems } from "@/lib/workflows/templates";
import { ToolIntro } from "../ToolIntro";
import { Button, ErrorNote, IconButton, Loading, must, Page, useLoad, useQuery, type ViewProps } from "../ui";
import { Modal } from "../meetings/parts";
import { loadWorkflow } from "./data";
import { WorkflowEditor } from "./Editor";

type Row = {
  id: string;
  name: string;
  status: "draft" | "live" | "paused";
  folder_id?: string | null;
};
type FolderRow = { id: string; name: string; position: number };
/** A group in the left column: a folder (with its id), or every workflow before folders. */
type Group = { key: string; folder: FolderRow | null; label: string; rows: Row[] };

/** The left column's groups: the folders in order, then workflows in no folder. Before folders: one list. */
export function groupsOf(rows: Row[], folders: FolderRow[] | null): Group[] {
  if (!folders) return rows.length ? [{ key: "other", folder: null, label: "Automations", rows }] : [];
  const ids = new Set(folders.map((f) => f.id));
  const out: Group[] = [...folders].sort((a, b) => a.position - b.position).map((f) => ({ key: f.id, folder: f, label: f.name, rows: rows.filter((r) => r.folder_id === f.id) }));
  const loose = rows.filter((r) => !r.folder_id || !ids.has(r.folder_id));
  if (loose.length) out.push({ key: "none", folder: null, label: "No folder", rows: loose });
  return out;
}

export function WorkflowsHome(props: ViewProps & { describe?: (done: () => void) => React.ReactNode }) {
  const { sb, ws, navigate, describe } = props;
  const [describing, setDescribing] = useState(false);
  const [tick, setTick] = useState(0);
  const data = useLoad(async () => {
    // Folders first: made from the old groups the first time (migration 100). Without it, null: grouped by stage.
    const started = await sb.rpc("workflow_folders_start", { p_ws: ws.id });
    // Then the starting set, once per workspace (migration 119): Notification and Follow-up, as drafts. Before 119
    // runs the call fails and the page shows what's there.
    if (!started.error) await sb.rpc("workflow_defaults", { p_ws: ws.id, p_items: startingItems() });
    const [rows, folders] = await Promise.all([
      started.error ? sb.from("workflows").select("id, name, status").eq("workspace_id", ws.id).order("created_at") : sb.from("workflows").select("id, name, status, folder_id").eq("workspace_id", ws.id).order("created_at"),
      started.error ? Promise.resolve(null) : sb.from("workflow_folders").select("id, name, position").eq("workspace_id", ws.id).order("position"),
    ]);
    return { rows: (must(rows) ?? []) as Row[], folders: folders ? ((must(folders) ?? []) as FolderRow[]) : null };
  }, `${ws.id}:${tick}`);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  /** The folder being named in place: its key, or "new" for a new one. */
  const [naming, setNaming] = useState<string | null>(null);
  /** Drag and drop: the workflow being dragged, the folder under it, and moves shown before the reload lands. */
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // Kept with the data it was made on: once the reload brings the saved folders, the moves drop away.
  const [moved, setMoved] = useState<{ on: unknown; map: Record<string, string | null> }>({ on: null, map: {} });
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError("");
    const { error: e } = await fn();
    if (e) setError(e.message);
    reload();
  };

  if (!data.data)
    return (
      <Page title="Automations">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { folders } = data.data;
  const shown = moved.on === data.data ? moved.map : {};
  const rows = data.data.rows.map((r) => (r.id in shown ? { ...r, folder_id: shown[r.id] } : r));
  if (!rows.length)
    return (
      <Page title="Automations">
        <ToolIntro title={"Follow up on every form\nand every meeting"} sketch="plane" action={<Button onClick={() => navigate("workflows", "new")}>New automation</Button>} />
        {describe ? <div className="mx-auto -mt-6 w-full max-w-xl">{describe(() => undefined)}</div> : null}
      </Page>
    );
  const open = rows.find((r) => r.id === props.id) ?? rows[0]!;
  const groups = groupsOf(rows, folders);
  const saveFolder = (id: string | null, name: string) => act(() => sb.rpc("workflow_folder_save", { p_ws: ws.id, p_id: id, p_name: name }));
  const dropOn = (folder: string | null) => {
    const id = drag;
    setDrag(null);
    setOver(null);
    const row = rows.find((r) => r.id === id);
    if (!id || !row || (row.folder_id ?? null) === folder) return;
    setMoved({ on: data.data, map: { ...shown, [id]: folder } });
    void act(() => sb.rpc("workflow_set_folder", { p_ws: ws.id, p_id: id, p_folder: folder }));
  };
  const newIn = (folder: string | null) => navigate("workflows", "new", folder ? `folder=${folder}` : undefined);
  return (
    <Page title="Automations" flush>
      {describing && describe ? (
        <Modal title="Describe an automation" onClose={() => setDescribing(false)} wide>
          {describe(() => setDescribing(false))}
        </Modal>
      ) : null}
      <div className="grid h-full min-h-0 md:grid-cols-[256px_minmax(0,1fr)]">
        <nav aria-label="Folders" className="flex max-h-64 min-h-0 flex-col overflow-auto border-b border-line px-2 pt-2 pb-6 md:max-h-none md:border-r md:border-b-0">
          <div className="flex h-8 shrink-0 items-center gap-1 pr-0.5 pl-2">
            <p className="label-mono flex-1">Folders</p>
            <MoreMenu
              small
              label="New"
              icon={<Plus size={14} />}
              items={[{ label: "New automation", run: () => newIn(null) }, describe ? { label: "Describe an automation", run: () => setDescribing(true) } : null, folders ? { label: "New folder", run: () => setNaming("new") } : null]}
            />
          </div>
          <ErrorNote message={error} />
          {groups.map((g, gi) => {
            const shut = closed.has(g.key) && !g.rows.some((r) => r.id === open.id);
            return (
              <div
                key={g.key}
                className={`flex shrink-0 flex-col rounded-lg transition-[background-color,box-shadow] duration-[140ms] ${over === g.key ? "bg-hover shadow-[inset_0_0_0_1.5px_var(--color-ink)]" : ""}`}
                onDragOver={(e) => {
                  if (!drag || !folders) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (over !== g.key) setOver(g.key);
                  if (closed.has(g.key)) setClosed((c) => { const n = new Set(c); n.delete(g.key); return n; });
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === g.key ? null : o));
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(g.folder?.id ?? null);
                }}
              >
                {naming === g.key && g.folder ? (
                  <NameRow initial={g.label} onDone={(name) => (setNaming(null), name && name !== g.label ? void saveFolder(g.folder!.id, name) : undefined)} />
                ) : (
                  <div className="group/f flex h-8 items-center rounded-lg pr-0.5 transition-colors duration-[140ms] hover:bg-hover">
                    <button
                      type="button"
                      aria-expanded={!shut}
                      onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                      onDoubleClick={() => g.folder && setNaming(g.key)}
                      className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-1.5 text-left"
                    >
                      <ChevronRight size={12} className={`shrink-0 text-faint transition-transform duration-[140ms] motion-reduce:transition-none ${shut ? "" : "rotate-90"}`} />
                      <Folder size={14} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{g.label}</span>
                      <span className="pr-1 text-[11.5px] text-faint tabular-nums group-hover/f:hidden">{g.rows.length}</span>
                    </button>
                    {g.folder || !folders ? (
                      <span className="hidden items-center group-hover/f:flex focus-within:flex">
                        <IconButton label={`New automation in ${g.label}`} className="size-6" onClick={() => newIn(g.folder?.id ?? null)}>
                          <Plus size={13} />
                        </IconButton>
                        {g.folder ? (
                          <MoreMenu
                            small
                            label={`${g.label} folder`}
                            items={[
                              { label: "Rename", run: () => setNaming(g.key) },
                              gi > 0 ? { label: "Move up", run: () => void act(() => sb.rpc("workflow_folder_move", { p_ws: ws.id, p_id: g.folder!.id, p_by: -1 })) } : null,
                              gi < (folders?.length ?? 0) - 1 ? { label: "Move down", run: () => void act(() => sb.rpc("workflow_folder_move", { p_ws: ws.id, p_id: g.folder!.id, p_by: 1 })) } : null,
                              {
                                label: "Delete",
                                danger: true,
                                run: () =>
                                  void askConfirm(`Delete ${g.label}?`, { body: g.rows.length ? "Its workflows stay, outside any folder." : undefined, ok: "Delete", danger: true }).then((ok) => (ok ? act(() => sb.rpc("workflow_folder_delete", { p_ws: ws.id, p_id: g.folder!.id })) : undefined)),
                              },
                            ]}
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                )}
                {shut ? null : (
                  <div className="ml-[13px] flex flex-col gap-px border-l border-line py-0.5 pl-1.5">
                    {g.rows.map((r) => (
                      <div
                        key={r.id}
                        draggable={!!folders}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", r.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDrag(r.id);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        className={`group/w flex h-8 items-center rounded-lg pr-0.5 transition-[background-color,opacity] duration-[140ms] ${folders ? "cursor-grab active:cursor-grabbing" : ""} ${drag === r.id ? "opacity-40" : ""} ${r.id === open.id ? "bg-paper-deep" : "hover:bg-hover"}`}
                      >
                        <button
                          type="button"
                          onClick={() => navigate("workflows", r.id)}
                          aria-current={r.id === open.id ? "page" : undefined}
                          className={`flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left text-[13px] ${r.id === open.id ? "font-medium text-ink" : "text-body"}`}
                        >
                          <span className="truncate">{r.name}</span>
                          {r.status === "live" ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Live" /> : null}
                        </button>
                      </div>
                    ))}
                    {g.folder ? (
                      <button type="button" onClick={() => newIn(g.folder!.id)} className="flex h-8 items-center gap-2 rounded-lg px-2 text-left text-[13px] text-faint transition-colors duration-[140ms] hover:bg-hover hover:text-ink">
                        <Plus size={12} />
                        New automation
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
          {naming === "new" ? (
            <NameRow initial="" onDone={(name) => (setNaming(null), name ? void saveFolder(null, name) : undefined)} />
          ) : folders ? (
            <button type="button" onClick={() => setNaming("new")} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg pl-1.5 text-left text-[13px] text-faint transition-colors duration-[140ms] hover:bg-hover hover:text-ink">
              <span className="w-3" />
              <FolderPlus size={14} />
              New folder
            </button>
          ) : null}
        </nav>
        <div className="min-h-0 min-w-0">
          <OpenJourney key={open.id} {...props} id={open.id} onChanged={reload} />
        </div>
      </div>
    </Page>
  );
}

/** A folder name typed in place: Enter or leaving the box saves, Escape drops it. */
function NameRow({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (name: string) => {
    if (done.current) return;
    done.current = true;
    onDone(name.trim());
  };
  return (
    <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-hover pr-1 pl-1.5">
      <span className="w-3" />
      <Folder size={14} className="shrink-0 text-muted" />
      <input
        autoFocus
        value={v}
        maxLength={80}
        placeholder="Folder name"
        aria-label="Folder name"
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(v);
          if (e.key === "Escape") finish("");
        }}
        className="h-6 min-w-0 flex-1 rounded-[6px] border border-ink bg-card px-1.5 text-[13px] font-medium text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}

function OpenJourney({ sb, session, ws, navigate, id, onChanged }: ViewProps & { id: string; onChanged: () => void }) {
  const res = useQuery(`workflow:${ws.id}:${id}`, () => loadWorkflow(sb, ws.id, id), { staleMs: 0 });
  const { reload: again, set } = res;
  const reload = useCallback(async () => {
    again();
    onChanged();
  }, [again, onChanged]);
  if (!res.data)
    return (
      <div className="p-5">
        <ErrorNote message={res.error} />
        {res.error ? null : <Loading />}
      </div>
    );
  return (
    <WorkflowEditor
      patch={set}
      sb={sb}
      session={session}
      ws={ws}
      navigate={navigate}
      data={res.data}
      reload={reload}
      home={{ label: "Automations", go: () => (onChanged(), navigate("workflows")) }}
    />
  );
}
