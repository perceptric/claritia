"use client";

// The Workflows editor (docs/enrich-workflows-reports.md 2.4): the column of cards on the left, the picked card's
// settings on the right. One reducer holds the draft and its undo history; the draft saves itself 800 ms after the
// last change, with the revision, so a second person's save shows as a conflict instead of being overwritten.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cleanBody, problems as checkProblems } from "@/lib/workflows/check";
import { find } from "@/lib/workflows/tree";
import { newStep, type Body, type Step, type StepKind } from "@/lib/workflows/types";
import { Redo, Trash, Undo } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { toast } from "../routing/Toast";
import { Badge, Button, ErrorNote, IconButton, Page, setLeaveGuard, type Tone, type ViewProps } from "../ui";
import type { Loaded, Version } from "./data";
import { Flow, type Sel } from "./Flow";
import { StepPanel, TriggerPanel } from "./Inspector";
import { addStep, byId, duplicateStep, editorReducer, nudge, patchStep, removeStep, startEditor } from "./model";
import { HistoryDrawer, PublishDialog, TryPanel, VersionsDrawer } from "./Panels";

type SaveState = "idle" | "saving" | "saved" | "retry" | "conflict";
const STATUS: Record<"draft" | "live" | "paused", [string, Tone]> = {
  draft: ["Draft", "gray"],
  live: ["Live", "green"],
  paused: ["Paused", "amber"],
};
const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");

export function WorkflowEditor({
  sb,
  session,
  ws,
  navigate,
  data,
  reload,
}: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & {
  data: Loaded;
  reload: () => Promise<void>;
}) {
  const id = data.wf.id;
  const [st, dispatch] = useReducer(editorReducer, data.draft, startEditor);
  const [name, setName] = useState(data.wf.name);
  const [nameN, setNameN] = useState(0);
  const [sel, setSel] = useState<Sel | null>("trigger");
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [savedN, setSavedN] = useState(0);
  const [panel, setPanel] = useState<"try" | "history" | "versions" | "publish" | null>(null);
  const [lit, setLit] = useState<Set<string> | null>(null);
  const [viewing, setViewing] = useState<Version | null>(null);

  const body = st.body;
  const probs = useMemo(() => checkProblems(body), [body]);
  const edit = useCallback((b: Body, key?: string) => dispatch({ type: "set", body: b, key }), []);

  // Autosave --------------------------------------------------------------------------------------------------------
  const n = st.n + nameN;
  const latest = useRef({ body, name, n });
  const savedRef = useRef(0);
  const revRef = useRef(data.wf.draft_revision);
  const inflight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    latest.current = { body, name, n };
  });

  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const cur = latest.current;
    if (cur.n === savedRef.current) return true;
    const p = (async () => {
      setSaveState("saving");
      const { data: r, error: e } = await sb.rpc("workflow_save", {
        p_ws: ws.id,
        p_id: id,
        p_name: cur.name.trim() || "Untitled workflow",
        p_draft: cur.body,
        p_revision: revRef.current,
      });
      if (!e && r) {
        revRef.current = (r as { revision: number }).revision;
        savedRef.current = cur.n;
        setSavedN(cur.n);
        setAttempt(0);
        setSaveState("saved");
        return true;
      }
      if (e?.message.includes("Someone else")) {
        setSaveState("conflict");
        return false;
      }
      setSaveState("retry");
      setAttempt((a) => a + 1);
      return false;
    })();
    inflight.current = p;
    try {
      return await p;
    } finally {
      if (inflight.current === p) inflight.current = null;
    }
  }, [sb, ws.id, id]);

  useEffect(() => {
    if (saveState === "conflict" || saveState === "saving" || n === savedN) return;
    const t = setTimeout(() => void save(), saveState === "retry" ? Math.min(30_000, 2000 * 2 ** Math.max(0, attempt - 1)) : 800);
    return () => clearTimeout(t);
  }, [n, savedN, saveState, attempt, save]);

  useEffect(() => {
    setLeaveGuard(async () => {
      if (latest.current.n === savedRef.current) return true;
      if (await save()) return true;
      return askConfirm("Leave without saving?", { ok: "Leave", danger: true });
    });
    const before = (e: BeforeUnloadEvent) => {
      if (latest.current.n !== savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", before);
    };
  }, [save]);

  // Undo and redo from the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      if (typing(e.target) || document.querySelector('[aria-modal="true"]') || viewing) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  // Edits -------------------------------------------------------------------------------------------------------------
  const onAdd = (at: Parameters<typeof addStep>[1], kind: StepKind) => {
    const s = newStep(kind);
    edit(addStep(body, at, s));
    setSel(s.id);
  };
  const onRemove = async (sid: string) => {
    const w = find(body.steps, sid);
    const inside = w && "yes" in w.step ? w.step.yes.length + w.step.no.length : w && "a" in w.step ? w.step.a.length + w.step.b.length : 0;
    if (
      inside &&
      !(await askConfirm("Delete this step and the steps inside it?", {
        ok: "Delete",
        danger: true,
      }))
    )
      return;
    edit(removeStep(body, sid));
    if (sel === sid) setSel("trigger");
  };
  const onCopy = (sid: string) => {
    const r = duplicateStep(body, sid);
    edit(r.body);
    if (r.id) setSel(r.id);
  };

  // Status ------------------------------------------------------------------------------------------------------------
  const setStatus = async (status: "live" | "paused") => {
    if (
      status === "paused" &&
      !(await askConfirm("Pause this workflow?", {
        body: "People in it stay where they are until you resume.",
        ok: "Pause",
      }))
    )
      return;
    const { error: e } = await sb.rpc("workflow_set_status", {
      p_id: id,
      p_status: status,
    });
    if (e) return setError(e.message);
    await reload();
  };
  const del = async () => {
    if (
      !(await askConfirm(`Delete ${name || "this workflow"}?`, {
        body: "Its history goes too.",
        ok: "Delete",
        danger: true,
      }))
    )
      return;
    const { error: e } = await sb.rpc("workflow_delete", { p_id: id });
    if (e) return setError(e.message);
    savedRef.current = latest.current.n;
    navigate("workflows");
  };
  const openPublish = async () => {
    if (!(await save())) return setError("Not saved. Try again.");
    setPanel("publish");
  };
  const onPublished = async (v: number) => {
    setPanel(null);
    toast({ text: `v${v} is live` });
    await reload();
  };
  const copyToDraft = async (v: Version) => {
    if (
      !(await askConfirm(`Copy v${v.version} to the draft?`, {
        body: "It replaces the draft. Undo brings it back.",
        ok: "Copy",
      }))
    )
      return;
    edit(cleanBody(v.body));
    setViewing(null);
    setPanel(null);
  };

  const live = data.live;
  const changed = !live || JSON.stringify(live) !== JSON.stringify(body);
  const dirty = n !== savedN;
  const status = data.wf.status;
  const next = Math.max(0, ...data.versions.map((v) => v.version)) + 1;
  const shown = viewing ? cleanBody(viewing.body) : body;
  const selStep: Step | null = sel && sel !== "trigger" && !viewing ? (find(body.steps, sel)?.step ?? null) : null;

  const actions = (
    <>
      <Badge tone={STATUS[status][1]} dot>
        {STATUS[status][0]}
      </Badge>
      {live && changed ? (
        <Badge tone="amber" dot>
          Changes not live yet
        </Badge>
      ) : null}
      {saveState === "retry" ? (
        <span role="status" className="text-[12.5px] text-rose">
          Not saved. Retrying…
        </span>
      ) : saveState === "saved" && !dirty ? (
        <span key={savedN} role="status" className="anim-fade text-[12.5px] text-muted">
          Saved
        </span>
      ) : null}
      <span className="hidden items-center sm:flex">
        <IconButton label="Undo" onClick={() => dispatch({ type: "undo" })} disabled={!st.past.length || !!viewing}>
          <Undo size={14} />
        </IconButton>
        <IconButton label="Redo" onClick={() => dispatch({ type: "redo" })} disabled={!st.future.length || !!viewing}>
          <Redo size={14} />
        </IconButton>
      </span>
      <IconButton label="Delete workflow" onClick={() => void del()}>
        <Trash size={14} />
      </IconButton>
      <Button variant="ghost" size="sm" onClick={() => setPanel("history")}>
        History
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setPanel("versions")}>
        Versions
      </Button>
      <Button variant="ghost" size="sm" aria-pressed={panel === "try"} onClick={() => setPanel("try")}>
        Try a contact
      </Button>
      {status === "live" ? (
        <Button variant="ghost" size="sm" onClick={() => void setStatus("paused")}>
          Pause
        </Button>
      ) : status === "paused" ? (
        <Button variant="ghost" size="sm" onClick={() => void setStatus("live")}>
          Resume
        </Button>
      ) : null}
      <span title={probs.length ? `${probs.length} to fix` : undefined}>
        <Button size="sm" disabled={!!probs.length || !changed || !!viewing} onClick={() => void openPublish()}>
          Make live
        </Button>
      </span>
    </>
  );

  return (
    <Page
      title={name || "Untitled workflow"}
      onRename={(v: string) => {
        setName(v);
        setNameN((x) => x + 1);
      }}
      back={{ label: "Workflows", onClick: () => navigate("workflows") }}
      actions={actions}
      flush
    >
      <div className="flex h-full min-h-0 flex-col">
        {saveState === "conflict" ? (
          <Bar text="Someone else changed this workflow.">
            <Button size="sm" onClick={() => void reload()}>
              Load theirs
            </Button>
          </Bar>
        ) : viewing ? (
          <Bar text={`Viewing v${viewing.version}`}>
            <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>
              Back to the draft
            </Button>
            <Button size="sm" onClick={() => void copyToDraft(viewing)}>
              Copy to draft
            </Button>
          </Bar>
        ) : null}
        {error ? (
          <div className="flex items-center gap-2 px-4 pt-3 md:px-6">
            <div className="flex-1">
              <ErrorNote message={error} />
            </div>
            <Button variant="plain" size="sm" onClick={() => setError("")}>
              Dismiss
            </Button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-h-0 overflow-y-auto px-4 pt-8 md:px-14">
            <Flow
              body={shown}
              names={data.words}
              sel={viewing ? null : sel}
              onSelect={(s) => !viewing && setSel(s)}
              onAdd={onAdd}
              onRemove={(sid) => void onRemove(sid)}
              onCopy={onCopy}
              onNudge={(sid, d) => edit(nudge(body, sid, d))}
              counts={data.stats.steps}
              entered={data.stats.entered}
              lit={lit}
              readOnly={!!viewing}
            />
          </div>
          <aside className="min-h-[480px] overflow-y-auto border-t border-line p-5 lg:min-h-0 lg:border-t-0 lg:border-l">
            {viewing ? null : selStep ? (
              <StepPanel
                key={selStep.id}
                step={selStep}
                names={data.names}
                onPatch={(patch, key) => edit(patchStep(body, selStep.id, patch), key ? `${selStep.id}:${key}` : undefined)}
                readOnly={false}
                session={session}
                ws={ws.id}
                workflowId={id}
                onRemove={() => void onRemove(selStep.id)}
              />
            ) : (
              <TriggerPanel body={body} names={data.names} onChange={(b, key) => edit(b, key ? `trigger:${key}` : undefined)} readOnly={false} />
            )}
          </aside>
        </div>

        {panel === "try" ? <TryPanel sb={sb} session={session} ws={ws.id} body={body} names={data.words} onPath={setLit} onClose={() => setPanel(null)} /> : null}
        {panel === "history" ? <HistoryDrawer sb={sb} id={id} versions={data.versions} live={live} names={data.words} onClose={() => setPanel(null)} /> : null}
        {panel === "versions" ? (
          <VersionsDrawer
            versions={data.versions}
            live={data.wf.live_version}
            people={byId(data.names.members)}
            onOpen={(v) => {
              setViewing(v);
              setPanel(null);
            }}
            onCopy={(v) => void copyToDraft(v)}
            onClose={() => setPanel(null)}
          />
        ) : null}
        {panel === "publish" ? (
          <PublishDialog session={session} id={id} live={live} draft={body} names={data.words} next={next} onDone={(v) => void onPublished(v)} onClose={() => setPanel(null)} />
        ) : null}
      </div>
    </Page>
  );
}

function Bar({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div role="status" className="anim-rise-sm flex flex-wrap items-center gap-3 border-b border-line bg-butter-wash px-4 py-2.5 text-[13px] text-ink md:px-6">
      <span className="flex-1">{text}</span>
      {children}
    </div>
  );
}
