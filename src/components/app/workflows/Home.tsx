"use client";

// Email › Workflows (docs/workflows.md): every workflow, in folders. It opens on the folders, each a card with a small
// fanned stack of its emails; a folder opens on its workflows, each a card with its emails, state and trigger; a
// workflow opens in the editor at full width, with the folder as its way back. Folders are made, renamed, moved and
// deleted from their cards; a workflow moves between folders from its card. The emails of every workflow are edited in
// it (and on the canvas through Open full editor), so there's no Emails page beside it. Addresses: /emails/automations
// (folders), /emails/automations/folder/<id> (one folder; "none" for workflows in no folder), /emails/automations/<id>.

import { useCallback, useMemo, useState } from "react";
import { cleanBody } from "@/lib/workflows/check";
import { triggerTitle } from "@/lib/workflows/explain";
import { flowKeys, isRequiredFlow } from "@/lib/workflows/meetingFlows";
import { startingItems } from "@/lib/workflows/templates";
import { withFooter } from "@/lib/workflows/stepEmails";
import { readEmailDoc } from "@/lib/design/email/doc";
import { Folder, Plus } from "../../Icons";
import { askConfirm, askText } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, Loading, must, Page, useQuery, type ViewProps } from "../ui";
import { Modal } from "../meetings/parts";
import { previewHtml, type CanvasKit } from "../emails/canvas/preview";
import { loadWorkflow } from "./data";
import { WorkflowEditor } from "./Editor";
import { ensureMeetingSetup } from "./meetingSetup";

type Row = { id: string; name: string; status: "draft" | "live" | "paused"; folder_id: string | null; meeting_kind: string | null; draft: unknown; updated_at: string };
type FolderRow = { id: string; name: string; position: number };
type Mini = { id: string; doc: unknown; html: string; status: string; system_key?: string | null };
type HomeData = { rows: Row[]; folders: FolderRow[]; minis: Record<string, Mini[]>; kits: CanvasKit[] };

const NONE = "none";

/** The folders in order, then "No folder" when some workflows have none. */
export function groupsOf(rows: Pick<Row, "folder_id">[], folders: FolderRow[]): { id: string; name: string; folder: FolderRow | null; count: number }[] {
  const ids = new Set(folders.map((f) => f.id));
  const out = [...folders].sort((a, b) => a.position - b.position).map((f) => ({ id: f.id, name: f.name, folder: f, count: rows.filter((r) => r.folder_id === f.id).length }));
  const loose = rows.filter((r) => !r.folder_id || !ids.has(r.folder_id)).length;
  return loose ? [...out, { id: NONE, name: "No folder", folder: null, count: loose }] : out;
}

async function loadHome(sb: ViewProps["sb"], ws: string): Promise<HomeData> {
  // Folders from the old groups the first time (100), the two starting form drafts (119), and the meeting workflows
  // with their emails (164, 165). Each call that fails leaves what's there.
  const started = await sb.rpc("workflow_folders_start", { p_ws: ws });
  if (!started.error) await sb.rpc("workflow_defaults", { p_ws: ws, p_items: startingItems() });
  await ensureMeetingSetup(sb, ws);
  const [rows, folders, mails, kits] = await Promise.all([
    sb.from("workflows").select("*").eq("workspace_id", ws).order("created_at"),
    sb.from("workflow_folders").select("id, name, position").eq("workspace_id", ws).order("position"),
    sb.from("emails").select("id, doc, html, status, workflow_id, system_key, group_position").eq("workspace_id", ws).in("kind", ["journey", "system"]).order("group_position"),
    sb.from("brand_kits").select("id, tokens, logo_url, design").eq("workspace_id", ws).order("created_at"),
  ]);
  const list = (must(rows) ?? []) as Row[];
  const all = (mails.data ?? []) as (Mini & { workflow_id: string | null })[];
  const minis: Record<string, Mini[]> = {};
  for (const r of list) {
    const keys = r.meeting_kind ? flowKeys(cleanBody(r.draft)) : [];
    minis[r.id] = [...all.filter((m) => m.system_key && keys.includes(m.system_key as never)), ...all.filter((m) => m.workflow_id === r.id)];
  }
  return { rows: list, folders: (folders.data ?? []) as FolderRow[], minis, kits: (kits.data ?? []) as CanvasKit[] };
}

export function WorkflowsHome(props: ViewProps & { describe?: (done: () => void) => React.ReactNode }) {
  const { sb, ws, navigate, describe } = props;
  const id = props.id ?? "";
  const data = useQuery(`workflows_home:${ws.id}`, () => loadHome(sb, ws.id), { staleMs: 0 });
  const [describing, setDescribing] = useState(false);
  const [error, setError] = useState("");
  const reload = data.reload;
  const act = useCallback(
    async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
      setError("");
      const { error: e } = await fn();
      if (e) setError(e.message);
      reload();
    },
    [reload],
  );

  // One workflow, at full width.
  if (/^[0-9a-f-]{36}$/.test(id)) {
    const row = data.data?.rows.find((r) => r.id === id);
    const folder = row?.folder_id ? data.data?.folders.find((f) => f.id === row.folder_id) : null;
    return <OpenWorkflow key={id} {...props} id={id} back={{ label: folder?.name ?? "Workflows", go: () => (reload(), navigate("workflows", folder ? `folder/${folder.id}` : "")) }} />;
  }
  if (!data.data)
    return (
      <Page title="Workflows">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { rows, folders, minis, kits } = data.data;
  const newIn = (folder: string | null) => navigate("workflows", "new", folder ? `folder=${folder}` : undefined);
  const newFolder = async () => {
    const name = (await askText("Name the folder", { placeholder: "Onboarding", ok: "Create" }))?.trim();
    if (name) await act(() => sb.rpc("workflow_folder_save", { p_ws: ws.id, p_id: null, p_name: name }));
  };
  const describeModal =
    describing && describe ? (
      <Modal title="Describe a workflow" onClose={() => setDescribing(false)} wide>
        {describe(() => setDescribing(false))}
      </Modal>
    ) : null;
  const newMenu = (folder: string | null) => (
    <span className="flex flex-wrap items-center gap-2">
      {describe ? (
        <Button variant="ghost" onClick={() => setDescribing(true)}>
          Describe a workflow
        </Button>
      ) : null}
      <Button onClick={() => newIn(folder)}>
        <Plus size={14} /> New workflow
      </Button>
    </span>
  );

  if (!rows.length)
    return (
      <Page title="Workflows">
        <ToolIntro title={"Follow up on every form\nand every meeting"} sketch="plane" action={<Button onClick={() => newIn(null)}>New workflow</Button>} />
        {describe ? <div className="mx-auto -mt-6 w-full max-w-xl">{describe(() => undefined)}</div> : null}
      </Page>
    );

  // One folder: its workflows.
  if (id.startsWith("folder/")) {
    const fid = id.slice(7);
    const folder = folders.find((f) => f.id === fid) ?? null;
    const known = new Set(folders.map((f) => f.id));
    const list = fid === NONE ? rows.filter((r) => !r.folder_id || !known.has(r.folder_id)) : rows.filter((r) => r.folder_id === fid);
    return (
      <Page title={folder?.name ?? "No folder"} back={{ label: "Workflows", onClick: () => navigate("workflows") }} actions={newMenu(folder?.id ?? null)}>
        {describeModal}
        <ErrorNote message={error} />
        <ul aria-label="Workflows" className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
          {list.map((r) => {
            const body = cleanBody(r.draft);
            const n = minis[r.id]?.length ?? 0;
            return (
              <li key={r.id} className="relative">
                <a
                  href={`/emails/automations/${r.id}`}
                  data-workflow={r.id}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("workflows", r.id);
                  }}
                  className="group flex h-full flex-col gap-2.5 rounded-xl bg-card p-3 shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out hover:-translate-y-0.5 hover:shadow-hover motion-reduce:transform-none"
                >
                  <Stack minis={minis[r.id] ?? []} kits={kits} />
                  <span className="flex flex-wrap items-center gap-1.5 px-0.5 pr-8">
                    <span className="min-w-0 font-medium break-words text-ink">{r.name}</span>
                    {isRequiredFlow(r.meeting_kind) ? <Badge tone="violet">Always on</Badge> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[12.5px] text-muted">
                    <Badge tone={r.status === "live" ? "green" : r.status === "paused" ? "amber" : "gray"} dot>
                      {r.status === "live" ? "Live" : r.status === "paused" ? "Paused" : "Draft"}
                    </Badge>
                    <span>{triggerTitle(body.trigger)}</span>
                    {n ? <span>{n === 1 ? "1 email" : `${n} emails`}</span> : null}
                  </span>
                </a>
                {folders.length > 1 || (folders.length && fid === NONE) ? (
                  <span className="absolute top-[calc(150px+14px)] right-2">
                    <MoreMenu
                      small
                      label={`${r.name} options`}
                      items={[...folders.filter((f) => f.id !== r.folder_id).map((f) => ({ label: `Move to ${f.name}`, run: () => void act(() => sb.rpc("workflow_set_folder", { p_ws: ws.id, p_id: r.id, p_folder: f.id })) }))]}
                    />
                  </span>
                ) : null}
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => newIn(folder?.id ?? null)} className="flex h-full min-h-[214px] w-full flex-col items-center justify-center gap-1.5 rounded-xl text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-[140ms] hover:bg-hover hover:text-ink">
              <Plus size={14} /> New workflow
            </button>
          </li>
        </ul>
      </Page>
    );
  }

  // The folders.
  const groups = groupsOf(rows, folders);
  return (
    <Page
      title="Workflows"
      actions={
        <span className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => void newFolder()}>
            New folder
          </Button>
          {newMenu(null)}
        </span>
      }
    >
      {describeModal}
      <ErrorNote message={error} />
      <ul aria-label="Folders" className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5">
        {groups.map((g, gi) => {
          const inside = rows.filter((r) => (g.folder ? r.folder_id === g.folder.id : !folders.some((f) => f.id === r.folder_id)));
          const all = inside.flatMap((r) => minis[r.id] ?? []);
          const live = inside.filter((r) => r.status === "live").length;
          return (
            <li key={g.id} className="relative">
              <a
                href={`/emails/automations/folder/${g.id}`}
                data-folder={g.id}
                onClick={(e) => {
                  e.preventDefault();
                  navigate("workflows", `folder/${g.id}`);
                }}
                className="group flex h-full flex-col gap-2.5 rounded-xl bg-card p-3 shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out hover:-translate-y-0.5 hover:shadow-hover motion-reduce:transform-none"
              >
                <Stack minis={all} kits={kits} />
                <span className="flex items-center gap-1.5 px-0.5 pr-8">
                  <Folder size={14} className="shrink-0 text-muted" />
                  <span className="min-w-0 font-medium break-words text-ink">{g.name}</span>
                </span>
                <span className="px-0.5 text-[12.5px] text-muted">
                  {g.count === 1 ? "1 workflow" : `${g.count} workflows`}
                  {live ? `, ${live} live` : ""}
                  {all.length ? `, ${all.length === 1 ? "1 email" : `${all.length} emails`}` : ""}
                </span>
              </a>
              {g.folder ? (
                <span className="absolute top-[calc(150px+14px)] right-2">
                  <MoreMenu
                    small
                    label={`${g.name} folder`}
                    items={[
                      { label: "New workflow here", run: () => newIn(g.folder!.id) },
                      {
                        label: "Rename",
                        run: () =>
                          void askText("Rename the folder", { initial: g.name, ok: "Save" }).then((name) =>
                            name?.trim() && name.trim() !== g.name ? act(() => sb.rpc("workflow_folder_save", { p_ws: ws.id, p_id: g.folder!.id, p_name: name.trim() })) : undefined,
                          ),
                      },
                      gi > 0 ? { label: "Move left", run: () => void act(() => sb.rpc("workflow_folder_move", { p_ws: ws.id, p_id: g.folder!.id, p_by: -1 })) } : null,
                      gi < folders.length - 1 ? { label: "Move right", run: () => void act(() => sb.rpc("workflow_folder_move", { p_ws: ws.id, p_id: g.folder!.id, p_by: 1 })) } : null,
                      {
                        label: "Delete",
                        danger: true,
                        run: () =>
                          void askConfirm(`Delete ${g.name}?`, { body: g.count ? "Its workflows stay, outside any folder." : undefined, ok: "Delete", danger: true }).then((ok) => (ok ? act(() => sb.rpc("workflow_folder_delete", { p_ws: ws.id, p_id: g.folder!.id })) : undefined)),
                      },
                    ]}
                  />
                </span>
              ) : null}
            </li>
          );
        })}
        <li>
          <button type="button" onClick={() => void newFolder()} className="flex h-full min-h-[214px] w-full flex-col items-center justify-center gap-1.5 rounded-xl text-[13px] text-muted shadow-[inset_0_0_0_1px_var(--color-line)] transition-colors duration-[140ms] hover:bg-hover hover:text-ink">
            <Plus size={14} /> New folder
          </button>
        </li>
      </ul>
    </Page>
  );
}

/** Up to three of the emails, small and fanned; they spread a little on hover. */
function Stack({ minis, kits }: { minis: Mini[]; kits: CanvasKit[] }) {
  const shown = useMemo(() => minis.slice(0, 3), [minis]);
  const htmls = useMemo(
    () =>
      shown.map((m) => {
        if (!m.doc) return "";
        const doc = readEmailDoc(m.doc, { allowHtml: true });
        return previewHtml({ doc: m.system_key ? doc : withFooter(doc), status: "draft", html: "", system_key: m.system_key ?? null }, kits);
      }),
    [shown, kits],
  );
  if (!shown.length) return <div className="flex h-[150px] items-center justify-center rounded-lg bg-paper-deep text-[12.5px] text-faint">No emails</div>;
  const k = shown.length;
  return (
    <div className="relative h-[150px] overflow-hidden rounded-lg bg-paper-deep">
      {shown.map((m, i) => {
        const turn = k === 1 ? 0 : (i - (k - 1) / 2) * 6;
        return (
          <div
            key={m.id}
            aria-hidden="true"
            className="absolute top-[18px] left-1/2 h-[140px] w-24 overflow-hidden rounded-[4px] bg-white shadow-[0_2px_6px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.05)] transition-transform duration-[220ms] ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-50%) rotate(${turn}deg)`, zIndex: i === Math.floor(k / 2) ? 2 : 1 }}
          >
            {htmls[i] ? <iframe title="" tabIndex={-1} loading="lazy" srcDoc={htmls[i]} sandbox="" className="pointer-events-none absolute top-0 left-0 h-[875px] w-[600px] origin-top-left scale-[0.16] border-0 bg-white" /> : null}
          </div>
        );
      })}
    </div>
  );
}

function OpenWorkflow({ sb, session, ws, navigate, id, back }: ViewProps & { id: string; back: { label: string; go: () => void } }) {
  const res = useQuery(`workflow:${ws.id}:${id}`, () => loadWorkflow(sb, ws.id, id), { staleMs: 0 });
  const { reload, set } = res;
  if (!res.data)
    return (
      <Page title="Workflow" back={{ label: back.label, onClick: back.go }}>
        <ErrorNote message={res.error} />
        {res.error ? null : <Loading />}
      </Page>
    );
  return <WorkflowEditor patch={set} sb={sb} session={session} ws={ws} navigate={navigate} data={res.data} reload={async () => reload()} home={back} />;
}
