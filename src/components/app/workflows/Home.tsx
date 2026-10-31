"use client";

// Workflows (docs/workflows.md): folders on the left, each holding workflows, and the open one in the workflow editor
// on the right. Folders are made, renamed, moved and deleted here; a workflow moves between them from its menu. The
// first visit, with no workflows, is the build screen: Claritia reads the brand, the product's events and the CRM,
// then makes one journey per lifecycle moment, its emails in the brand's voice and waiting for approval. Before
// migration 100 there are no folders: the workflows show by stage, as they did.

import { useCallback, useEffect, useRef, useState } from "react";
import { STAGES, type Facts, type Stage } from "@/lib/workflows/lifecycle";
import type { Brand } from "@/lib/workflows/journeys";
import { Check, Folder, Plus } from "../../Icons";
import { AiMark } from "../Ai";
import { askConfirm, askText } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { Button, Empty, ErrorNote, errorText, Loading, must, Page, postJson, useLoad, useQuery, type ViewProps } from "../ui";
import { Dots } from "../routing/Flow";
import { loadWorkflow } from "./data";
import { WorkflowEditor } from "./Editor";

type Plan = {
  key: string;
  name: string;
  stage: Stage | null;
  line: string;
  emails: number;
};
type Loaded = { facts: Facts; brand: Brand; plan: Plan[]; owner: boolean };
type Row = {
  id: string;
  name: string;
  status: "draft" | "live" | "paused";
  stage: Stage;
  journey: string | null;
  folder_id?: string | null;
};
type FolderRow = { id: string; name: string; position: number };
/** A group in the left column: a folder (with its id) or, before folders, a stage. */
type Group = { key: string; folder: FolderRow | null; label: string; rows: Row[] };

const emailsApi = <T,>(session: ViewProps["session"], ws: string, action: string) => postJson<T>(session, "/api/emails", { workspaceId: ws, action });

/** The left column's groups: the folders in order, then workflows in no folder. Before folders: by stage. */
export function groupsOf(rows: Row[], folders: FolderRow[] | null): Group[] {
  if (!folders) return [...STAGES, { value: null, label: "Workflows" }].map((st) => ({ key: st.value ?? "other", folder: null, label: st.label, rows: rows.filter((r) => r.stage === st.value) })).filter((g) => g.rows.length);
  const ids = new Set(folders.map((f) => f.id));
  const out: Group[] = [...folders].sort((a, b) => a.position - b.position).map((f) => ({ key: f.id, folder: f, label: f.name, rows: rows.filter((r) => r.folder_id === f.id) }));
  const loose = rows.filter((r) => !r.folder_id || !ids.has(r.folder_id));
  if (loose.length) out.push({ key: "none", folder: null, label: "No folder", rows: loose });
  return out;
}

export function WorkflowsHome(props: ViewProps) {
  const { sb, session, ws, navigate } = props;
  const [tick, setTick] = useState(0);
  const data = useLoad(async () => {
    // Folders first: made from the old groups the first time (migration 100). Without it, null: grouped by stage.
    const started = await sb.rpc("workflow_folders_start", { p_ws: ws.id });
    const [info, rows, folders] = await Promise.all([
      emailsApi<Loaded>(session, ws.id, "load"),
      started.error ? sb.from("workflows").select("id, name, status, stage, journey").eq("workspace_id", ws.id).order("created_at") : sb.from("workflows").select("id, name, status, stage, journey, folder_id").eq("workspace_id", ws.id).order("created_at"),
      started.error ? Promise.resolve(null) : sb.from("workflow_folders").select("id, name, position").eq("workspace_id", ws.id).order("position"),
    ]);
    return { info, rows: (must(rows) ?? []) as Row[], folders: folders ? ((must(folders) ?? []) as FolderRow[]) : null };
  }, `${ws.id}:${tick}`);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  const [error, setError] = useState("");
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError("");
    const { error: e } = await fn();
    if (e) setError(e.message);
    reload();
  };

  if (!data.data)
    return (
      <Page title="Workflows">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { info, rows, folders } = data.data;
  if (!rows.length) {
    if (!info.owner)
      return (
        <Page title="Workflows">
          <Empty title="No workflows yet">A workspace owner can build them here.</Empty>
        </Page>
      );
    return (
      <Page title="Workflows" flush>
        <BuildScreen {...props} info={info} onDone={reload} />
      </Page>
    );
  }
  const open = rows.find((r) => r.id === props.id) ?? rows[0]!;
  const missing = info.owner ? info.plan.filter((p) => !rows.some((r) => r.journey === p.key)) : [];
  const groups = groupsOf(rows, folders);
  const newFolder = async () => {
    const name = await askText("New folder", { placeholder: "Folder name", ok: "Create" });
    if (name?.trim()) await act(() => sb.rpc("workflow_folder_save", { p_ws: ws.id, p_id: null, p_name: name.trim() }));
  };
  return (
    <Page title="Workflows" flush>
      <div className="grid h-full min-h-0 md:grid-cols-[248px_minmax(0,1fr)]">
        <nav aria-label="Folders" className="flex min-h-0 gap-1 overflow-auto border-line p-2 md:flex-col md:border-r">
          <ErrorNote message={error} />
          {groups.map((g, gi) => (
            <div key={g.key} className="flex shrink-0 gap-1 md:flex-col">
              <div className="group/f hidden min-h-[30px] items-center gap-1.5 pt-2 pr-0.5 pl-2 md:flex">
                {g.folder ? <Folder size={13} className="shrink-0 text-faint" /> : null}
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-muted">{g.label}</p>
                {g.folder ? (
                  <span className="opacity-0 transition-opacity duration-[140ms] group-hover/f:opacity-100 focus-within:opacity-100">
                    <MoreMenu
                      label={`${g.label} folder`}
                      items={[
                        {
                          label: "Rename",
                          run: () =>
                            void askText("Rename folder", { initial: g.label, ok: "Save" }).then((name) => (name?.trim() ? act(() => sb.rpc("workflow_folder_save", { p_ws: ws.id, p_id: g.folder!.id, p_name: name.trim() })) : undefined)),
                        },
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
                  </span>
                ) : null}
              </div>
              {g.rows.map((r) => (
                <div key={r.id} className={`group/w flex min-w-[160px] items-center rounded-lg transition-colors duration-[140ms] md:min-w-0 ${r.id === open.id ? "bg-paper-deep" : "hover:bg-hover"}`}>
                  <button
                    type="button"
                    onClick={() => navigate("workflows", r.id)}
                    aria-current={r.id === open.id ? "page" : undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-[13px] ${r.id === open.id ? "font-medium text-ink" : "text-body"}`}
                  >
                    {r.status === "live" ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Live" /> : <span className="size-1.5 shrink-0" />}
                    <span className="truncate">{r.name}</span>
                  </button>
                  {folders && folders.length > 1 ? (
                    <span className="opacity-0 transition-opacity duration-[140ms] group-hover/w:opacity-100 focus-within:opacity-100">
                      <MoreMenu label={`Move ${r.name}`} items={folders.filter((f) => f.id !== r.folder_id).map((f) => ({ label: `Move to ${f.name}`, run: () => void act(() => sb.rpc("workflow_set_folder", { p_ws: ws.id, p_id: r.id, p_folder: f.id })) }))} />
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
          {missing.length ? <BuildMore session={session} ws={ws.id} count={missing.length} onDone={reload} /> : null}
          <div className="mt-1 flex shrink-0 flex-wrap gap-1 px-1">
            <Button variant="ghost" size="sm" onClick={() => navigate("workflows", "new")}>
              <Plus size={13} />
              New workflow
            </Button>
            {folders ? (
              <Button variant="ghost" size="sm" onClick={() => void newFolder()}>
                <Folder size={13} />
                New folder
              </Button>
            ) : null}
          </div>
        </nav>
        <div className="min-h-0 min-w-0">
          <OpenJourney key={open.id} {...props} id={open.id} onChanged={reload} />
        </div>
      </div>
    </Page>
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
      home={{ label: "Workflows", go: () => (onChanged(), navigate("workflows")) }}
    />
  );
}

function BuildMore({ session, ws, count, onDone }: { session: ViewProps["session"]; ws: string; count: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-2 flex shrink-0 flex-col gap-1 px-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await emailsApi(session, ws, "build");
            onDone();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <AiMark />
        {busy ? "Building" : `Build ${count} more`}
      </Button>
      <ErrorNote message={error} />
    </div>
  );
}

/** The first visit: what Claritia read, one source at a time, then the journeys it made. */
function BuildScreen({ session, ws, info, onDone }: ViewProps & { info: Loaded; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [made, setMade] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  const { facts, brand, plan } = info;
  const stages = Object.entries(facts.stages).filter(([k]) => k !== "none");
  const steps = [
    {
      title: `Reading ${brand.name || "your brand"}`,
      body:
        brand.colors.length || brand.font
          ? [...brand.colors.map((c) => ({ swatch: c, text: c })), ...(brand.font ? [{ text: brand.font }] : []), ...(brand.logo_url ? [{ text: "Logo" }] : [])]
          : [{ text: "No brand kit yet. The emails use your workspace name." }],
    },
    {
      title: "Reading what people do in your product, last 30 days",
      body: facts.events.length
        ? facts.events.slice(0, 6).map((e) => ({ text: `${e.name}, ${e.people}` }))
        : [
            {
              text: "No product events yet. Add claritia.track() to your app for trial journeys.",
            },
          ],
    },
    {
      title: "Reading your CRM",
      body: [{ text: `${facts.contacts} contacts` }, ...stages.slice(0, 5).map(([k, n]) => ({ text: `${k}, ${n}` })), { text: `${facts.meetings} meetings in 30 days` }],
    },
    {
      title: "Writing the journeys in your voice",
      body: plan.map((p) => ({
        text: `${p.name}, ${p.emails} ${p.emails === 1 ? "email" : "emails"}`,
      })),
    },
  ];

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    setError("");
    setMade(null);
    emailsApi<{ made: { id: string }[] }>(session, ws.id, "build").then(
      (r) => setMade(r.made.length),
      (e) => setError(errorText(e)),
    );
  }, [session, ws.id, run]);
  // The sources appear one at a time; the last waits for the build.
  useEffect(() => {
    if (error || shown >= steps.length || (shown === steps.length - 1 && made === null)) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 120 : 150);
    return () => clearTimeout(t);
  }, [shown, made, error, steps.length]);
  const done = made !== null && shown >= steps.length;

  return (
    <div className="relative h-full min-h-0 overflow-y-auto">
      <Dots />
      <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-5 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:px-8 md:py-14">
        <div className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
          <p className="label-mono">Workflows</p>
          <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink text-balance">
            Lifecycle emails,
            <br />
            <span className="text-faint">built from your brand and your product.</span>
          </h1>
          {done ? (
            <div className="anim-rise-sm flex items-center gap-3">
              <Button onClick={onDone}>Review the journeys</Button>
              <span className="text-[13px] text-muted">{made === 1 ? "1 journey" : `${made} journeys`}, each email waiting for your approval</span>
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-col gap-2">
              <ErrorNote message={error} />
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setRun((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>
        <ol className="flex flex-col gap-3">
          {steps.slice(0, Math.min(shown + 1, steps.length)).map((st, i) => {
            const ok = i < shown;
            return (
              <li key={st.title} className="anim-rise-sm flex flex-col gap-2.5 rounded-[10px] border border-line bg-card px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  {ok ? (
                    <span className="flex size-[18px] items-center justify-center rounded-full bg-signal-soft text-signal-text">
                      <Check size={11} />
                    </span>
                  ) : (
                    <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" aria-label="Working" />
                  )}
                  <b className="text-[13.5px] font-medium text-ink">{st.title}</b>
                </div>
                {ok ? (
                  <div className="flex flex-wrap gap-1.5">
                    {st.body.map((x, j) => (
                      <span
                        key={j}
                        className="anim-rise-sm inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-body"
                        style={{ animationDelay: `${j * 70}ms` }}
                      >
                        {"swatch" in x && x.swatch ? <i className="size-3 rounded-[4px] border border-line" style={{ background: x.swatch }} /> : null}
                        {x.text}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
