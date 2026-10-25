"use client";

// Workflows (docs/enrich-workflows-reports.md 2.4): the list, the template picker that creates one, and the editor.
// /workflows lists them, /workflows/new picks a template (?template=broadcast opens that one), /workflows/<id> edits.

import { useCallback, useEffect, useState } from "react";
import { triggerWords } from "@/lib/workflows/explain";
import { cleanBody } from "@/lib/workflows/check";
import { TEMPLATES, templateByKey } from "@/lib/workflows/templates";
import { emptyBody, type Body } from "@/lib/workflows/types";
import { Branch, Plus } from "../../Icons";
import { SampleStats, ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, Loading, must, Page, Panel, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import { loadNames, loadWorkflow, wordsOf } from "./data";
import { WorkflowEditor } from "./Editor";

type Row = { id: string; name: string; status: "draft" | "live" | "paused"; draft: unknown; updated_at: string };
type Overview = Record<string, { active: number; days: number[] }>;

const STATUS: Record<Row["status"], [string, Tone]> = { draft: ["Draft", "gray"], live: ["Live", "green"], paused: ["Paused", "amber"] };

export function WorkflowsView(p: ViewProps) {
  if (p.id === "new") return <TemplatePicker {...p} />;
  if (p.id) return <EditorPage key={p.id} {...p} />;
  return <WorkflowList {...p} />;
}

function WorkflowList({ sb, ws, navigate }: ViewProps) {
  const list = useLoad(async () => {
    const [rows, over, names] = await Promise.all([
      sb.from("workflows").select("id, name, status, draft, updated_at").eq("workspace_id", ws.id).order("updated_at", { ascending: false }),
      sb.rpc("workflows_overview", { p_ws: ws.id }),
      loadNames(sb, ws.id),
    ]);
    return { rows: (must(rows) ?? []) as Row[], over: (over.data ?? {}) as Overview, words: wordsOf(names) };
  }, ws.id);
  const add = (
    <Button onClick={() => navigate("workflows", "new")}>
      <Plus size={14} /> New workflow
    </Button>
  );
  return (
    <Page icon={<Branch size={16} />} title="Workflows" count={list.data?.rows.length} actions={list.data?.rows.length ? add : undefined}>
      <ErrorNote message={list.error} />
      {!list.data ? (
        <Loading />
      ) : !list.data.rows.length ? (
        <ToolIntro
          sketch="plane"
          action={add}
          title={"Follow up with every lead,\nthe moment they act"}
          lead="A workflow starts when someone sends a form, books, doesn't book or changes stage. It sends emails you approved, waits, branches, routes and creates tasks, and stops as soon as they reach the goal."
          features={[
            { title: "Never twice", text: "Each step runs once per person, even when a server restarts mid-send." },
            { title: "Try a contact first", text: "See the exact path someone would take and each email as they'd read it. Nothing is sent." },
            { title: "Stops at the goal", text: "People leave the moment they book, reach a stage or unsubscribe.", visual: <SampleStats items={[["in it now", "412"], ["booked", "96"], ["sent", "1,830"]]} /> },
          ]}
        />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {list.data.rows.map((w) => {
              const o = list.data!.over[w.id];
              return (
                <li key={w.id}>
                  <button type="button" onClick={() => navigate("workflows", w.id)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-hover">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">{w.name}</span>
                      <span className="truncate text-[12.5px] text-muted">{triggerWords(cleanBody(w.draft).trigger, list.data!.words)}</span>
                    </span>
                    <Spark days={o?.days ?? []} />
                    <span className="hidden w-20 text-right text-[12.5px] text-muted tabular-nums sm:block">{o?.active ? `${o.active.toLocaleString("en-US")} in it` : ""}</span>
                    <span className="hidden w-16 text-right text-[12px] text-faint md:block">{timeAgo(w.updated_at)}</span>
                    <Badge tone={STATUS[w.status][1]} dot>
                      {STATUS[w.status][0]}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </Page>
  );
}

/** Entries per day for 30 days, as a thin line. */
function Spark({ days }: { days: number[] }) {
  const max = Math.max(1, ...days);
  if (!days.some((d) => d > 0)) return <span className="hidden w-24 sm:block" />;
  const pts = days.map((d, i) => `${(i / (days.length - 1)) * 96},${22 - (d / max) * 20}`).join(" ");
  return (
    <svg width="96" height="24" viewBox="0 0 96 24" aria-label="Entries, 30 days" className="hidden shrink-0 text-ink sm:block">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function TemplatePicker({ sb, ws, navigate }: ViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const make = useCallback(
    async (name: string, body: Body) => {
      const { data, error: e } = await sb.rpc("workflow_save", { p_ws: ws.id, p_id: null, p_name: name, p_draft: body, p_revision: null });
      if (e) throw new Error(e.message);
      navigate("workflows", (data as { id: string }).id);
    },
    [sb, ws.id, navigate],
  );
  const create = (name: string, body: Body) => {
    setBusy(true);
    setError("");
    make(name, body).catch((e) => {
      setError(errorText(e));
      setBusy(false);
    });
  };
  // ?template=broadcast (the Create menu's Broadcast) makes that one at once.
  const [asked] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("template")));
  useEffect(() => {
    const t = asked ? templateByKey(asked) : undefined;
    if (t) make(t.name, t.body()).catch((e) => setError(errorText(e)));
  }, [asked, make]);

  if (asked && templateByKey(asked) && !error)
    return (
      <Page title="New workflow" back={{ label: "Workflows", onClick: () => navigate("workflows") }}>
        <Loading />
      </Page>
    );
  return (
    <Page icon={<Branch size={16} />} title="New workflow">
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card name="Start blank" line="A trigger and nothing else" disabled={busy} onClick={() => create("Untitled workflow", emptyBody())} />
        {TEMPLATES.map((t) => (
          <Card key={t.key} name={t.name} line={t.line} disabled={busy} onClick={() => create(t.name, t.body())} />
        ))}
      </div>
    </Page>
  );
}

function Card({ name, line, onClick, disabled }: { name: string; line: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="lift anim-rise flex flex-col gap-1 rounded-2xl border border-line bg-card p-5 text-left disabled:opacity-60"
    >
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
      <span className="text-[12.5px] text-muted">{line}</span>
    </button>
  );
}

function EditorPage({ sb, session, ws, navigate, id }: ViewProps) {
  const [tick, setTick] = useState(0);
  const res = useLoad(() => loadWorkflow(sb, ws.id, id), `${id}:${tick}`);
  const reload = useCallback(async () => setTick((t) => t + 1), []);
  if (res.error && !res.data)
    return (
      <Page icon={<Branch size={16} />} title="Workflows">
        <ErrorNote message={res.error} />
      </Page>
    );
  if (!res.data)
    return (
      <Page title="Workflow" back={{ label: "Workflows", onClick: () => navigate("workflows") }}>
        <Loading />
      </Page>
    );
  const w = res.data.wf;
  return <WorkflowEditor key={`${w.draft_revision}:${w.status}:${w.live_version}`} sb={sb} session={session} ws={ws} navigate={navigate} data={res.data} reload={reload} />;
}
