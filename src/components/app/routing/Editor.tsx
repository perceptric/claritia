"use client";

// The Router's flowchart editor (docs/router-ux.md 4.2 and 7.2, /routing/flow): the top bar, the flow on the left and
// the inspector on the right, with the Test panel sliding over the inspector. Routing › Assignment is the main
// screen; this one keeps the full flow for teams that want it. One reducer holds the draft body and its undo history; problems are
// checked in the browser on every change; the draft saves itself 800 ms after the last change, with the revision so a
// second owner's save shows as a conflict instead of being overwritten.

import type { Session } from "@supabase/supabase-js";
import { withSegments } from "@/lib/router/conditions";
import { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from "react";
import { problems as checkProblems, problemWords } from "@/lib/router/check";
import type { Line } from "@/lib/router/explain";
import { emptyBody, type RouterBody } from "@/lib/router/types";
import { BarChart, Bell, History, Pause, Play, Redo, Undo } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, IconButton, invalidate, setLeaveGuard, type ViewProps } from "../ui";
import { routingApi, type Loaded, type ReplayOut } from "./api";
import { editorReducer, flowCounts, pathOf, setupItems, startEditor, type Selection } from "./editorModel";
import { Flow } from "./Flow";
import { Inspector } from "./Inspector";
import { AlertsDialog, CompareDialog, PublishDialog } from "./Publish";
import { ReplayPanel } from "./Replay";
import { TestPanel } from "./TestPanel";
import { toast } from "./Toast";
import { VersionsDrawer } from "./Versions";

/** What Setup can ask of the editor: start from a draft read again (after the assistant or Start over). */
export type EditorHandle = { reset: (d: Loaded) => void };

type SaveState = "idle" | "saving" | "saved" | "retry" | "conflict";

/** Save the draft; a conflict (409) is told apart from other failures. */
async function saveDraft(session: Session, ws: string, body: RouterBody, revision: number): Promise<{ ok: true; revision: number } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch("/api/routing", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ workspaceId: ws, action: "save_draft", body, revision }),
    });
    const data = (await res.json().catch(() => ({}))) as { revision?: number; error?: string };
    if (res.ok && typeof data.revision === "number") return { ok: true, revision: data.revision };
    return { ok: false, status: res.status, error: data.error ?? "Something went wrong." };
  } catch (e) {
    return { ok: false, status: 0, error: errorText(e) };
  }
}

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");

export function RouterEditor({
  sb,
  session,
  ws,
  role,
  navigate,
  data,
  refresh,
  handle,
}: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & {
  data: Loaded;
  refresh: (remount: boolean) => Promise<void>;
  handle?: React.Ref<EditorHandle>;
  /** Always the flowchart with its side panel (/routing/flow). */
  layout?: "flow";
}) {
  const readOnly = role !== "owner";
  const [st, dispatch] = useReducer(editorReducer, data.draft ?? data.live?.body ?? emptyBody(), startEditor);
  const [savedN, setSavedN] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [attempt, setAttempt] = useState(0);
  const [hasDraft, setHasDraft] = useState(!!data.draft);
  const [error, setError] = useState("");
  const [lists, setLists] = useState(data.lists);
  const memberSet = useMemo(() => new Set(data.members.map((m) => m.id)), [data.members]);
  const probs = useMemo(() => checkProblems(st.body, { members: memberSet, fields: data.fields }), [st.body, memberSet, data.fields]);
  const [sel, setSel] = useState<Selection>(() => {
    const first = !data.live ? setupItems(checkProblems(data.draft ?? emptyBody(), { members: new Set(data.members.map((m) => m.id)), fields: data.fields }))[0] : undefined;
    return first?.at ?? { kind: "rules" };
  });

  // Panels and dialogs.
  const [startTest] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("test")));
  const [testing, setTesting] = useState(startTest !== null);
  const [versions, setVersions] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [replay, setReplay] = useState<ReplayOut | null>(null);
  const [testLines, setTestLines] = useState<Line[] | null>(null);
  const [runKey, setRunKey] = useState(0);
  const testButton = useRef<HTMLSpanElement>(null);
  const testPanel = useRef<HTMLDivElement>(null);

  const edit = useCallback((fn: (b: RouterBody) => RouterBody, key?: string) => dispatch({ type: "edit", edit: fn, key, at: Date.now() }), []);
  const onLines = useCallback((l: Line[] | null) => {
    setTestLines(l);
    setRunKey((k) => k + 1);
  }, []);

  // Autosave --------------------------------------------------------------------------------------------------------
  const latest = useRef({ body: st.body, n: st.n });
  const savedRef = useRef(0);
  const revRef = useRef(data.revision);
  const inflight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    latest.current = { body: st.body, n: st.n };
  });


  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const { body, n } = latest.current;
    if (n === savedRef.current) return true;
    const p = (async () => {
      setSaveState("saving");
      const r = await saveDraft(session, ws.id, body, revRef.current);
      if (r.ok) {
        revRef.current = r.revision;
        savedRef.current = n;
        setSavedN(n);
        setHasDraft(true);
        setAttempt(0);
        setSaveState("saved");
        invalidate("app_counts");
        return true;
      }
      if (r.status === 409) {
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
  }, [session, ws.id]);

  useEffect(() => {
    if (readOnly || saveState === "conflict" || saveState === "saving" || st.n === savedN) return;
    const t = setTimeout(() => void save(), saveState === "retry" ? Math.min(30_000, 2000 * 2 ** Math.max(0, attempt - 1)) : 800);
    return () => clearTimeout(t);
  }, [st.n, savedN, saveState, attempt, readOnly, save]);

  // Leaving with unsaved changes saves first, and asks when that fails.
  useEffect(() => {
    if (readOnly) return;
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
  }, [readOnly, save]);

  // A change from outside (the assistant, Start over) shows in place: the flow keeps its selection and scroll.
  const reset = useCallback((d: Loaded) => {
    revRef.current = d.revision;
    const n = latest.current.n + 1;
    savedRef.current = n;
    setSavedN(n);
    dispatch({ type: "reset", body: d.draft ?? d.live?.body ?? emptyBody() });
    setHasDraft(!!d.draft);
    setLists(d.lists);
    setSaveState("idle");
  }, []);
  useImperativeHandle(handle, () => ({ reset }), [reset]);

  const loadTheirs = async () => {
    try {
      const d = await routingApi<Loaded>(session, ws.id, "load");
      revRef.current = d.revision;
      const n = latest.current.n + 1;
      savedRef.current = n;
      setSavedN(n);
      dispatch({ type: "reset", body: d.draft ?? d.live?.body ?? emptyBody() });
      setHasDraft(!!d.draft);
      setSaveState("saved");
      void refresh(false);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const keepMine = async () => {
    try {
      const d = await routingApi<Loaded>(session, ws.id, "load");
      revRef.current = d.revision;
      setSaveState("idle");
      void save();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const startOver = async () => {
    if (!data.live || !(await askConfirm(`Start over from v${data.live.version}?`, { ok: "Start over", danger: true }))) return;
    try {
      await routingApi(session, ws.id, "drop_draft");
      savedRef.current = latest.current.n;
      await refresh(true);
    } catch (e) {
      setError(errorText(e));
    }
  };

  // Spam lists save on their own, a moment after the last change.
  const listsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLists = (l: { allow: string[]; block: string[] }) => {
    setLists(l);
    if (listsTimer.current) clearTimeout(listsTimer.current);
    listsTimer.current = setTimeout(() => {
      routingApi(session, ws.id, "lists", l).catch((e) => setError(errorText(e)));
    }, 600);
  };
  useEffect(
    () => () => {
      if (listsTimer.current) clearTimeout(listsTimer.current);
    },
    [],
  );

  // Panels ------------------------------------------------------------------------------------------------------------
  const openTest = useCallback(() => setTesting(true), []);
  const closeTest = useCallback(() => {
    setTesting(false);
    setTestLines(null);
    requestAnimationFrame(() => testButton.current?.querySelector("button")?.focus());
  }, []);

  const openPublish = async () => {
    setReplaying(false);
    // What's missing is shown here, once, on the part that needs it.
    if (probs.length) {
      const w = probs[0]!.where;
      if (w.kind !== "segment") {
        const at = (w.id ? { kind: w.kind, id: w.id } : { kind: w.kind }) as Selection;
        setSel(at);
      }
      toast({ text: problemWords(probs[0]!.text) });
      return;
    }
    if (!(await save())) return setError("Not saved. Try again.");
    setPublishing(true);
  };

  const onPublished = async (version: number) => {
    setPublishing(false);
    const before = data.live?.version ?? null;
    savedRef.current = latest.current.n;
    toast({
      text: `v${version} is live`,
      action: before
        ? {
            label: "Undo",
            run: async () => {
              try {
                const r = await routingApi<{ version: number }>(session, ws.id, "rollback", { version: before });
                toast({ text: `v${r.version} is live` });
                await refresh(true);
              } catch (e) {
                toast({ text: errorText(e) });
              }
            },
          }
        : undefined,
    });
    invalidate("app_counts");
    await refresh(true);
  };

  // Keys: Cmd+Z and Cmd+Shift+Z, T for Test, Escape closes the Test panel and returns focus to its button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dialog = !!document.querySelector('[aria-modal="true"]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (typing(e.target) || dialog || readOnly) return;
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
        return;
      }
      if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target) && !dialog) {
        e.preventDefault();
        openTest();
        return;
      }
      if (e.key === "Escape" && testing && !dialog) {
        const a = document.activeElement as HTMLElement | null;
        if (a?.getAttribute("aria-expanded") === "true") return;
        if (!a || a === document.body || testPanel.current?.contains(a)) closeTest();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly, testing, openTest, closeTest]);

  const pause = async (paused: boolean) => {
    if (paused && !(await askConfirm("Pause routing?", { body: "New leads keep the owner they come with until you turn it back on.", ok: "Pause" }))) return;
    try {
      await routingApi(session, ws.id, "pause", { paused });
      await refresh(false);
    } catch (e) {
      setError(errorText(e));
    }
  };

  // What the screen shows ---------------------------------------------------------------------------------------------
  const counts = useMemo(() => flowCounts(data.stats, st.body), [data.stats, st.body]);
  const liveRules = useMemo(() => new Set(data.live?.body.rules.list.map((r) => r.id) ?? []), [data.live]);
  const setup = useMemo(() => (!data.live ? setupItems(probs) : []), [data.live, probs]);
  const path = useMemo(() => (testLines ? pathOf(testLines) : null), [testLines]);
  const dirty = st.n !== savedN;
  const draft = hasDraft || dirty;
  const moved = !!data.live && hasDraft && data.draftBase !== null && data.live.version > data.draftBase;
  const next = Math.max(0, ...data.versions.map((v) => v.version), data.live?.version ?? 0) + 1;
  const canPublish = !readOnly && draft;

  const bars = (
    <>
      {saveState === "conflict" ? (
        <Bar text="Someone else changed the draft.">
          <Button variant="ghost" size="sm" onClick={() => void loadTheirs()}>
            Load theirs
          </Button>
          <Button size="sm" onClick={() => void keepMine()}>
            Keep mine
          </Button>
        </Bar>
      ) : moved && data.live ? (
        <Bar text={`v${data.live.version} is live. Your draft is based on v${data.draftBase}.`}>
          <Button variant="ghost" size="sm" onClick={() => setReviewing(true)}>
            Review changes
          </Button>
          {!readOnly ? (
            <Button size="sm" onClick={() => void startOver()}>
              Start over from v{data.live.version}
            </Button>
          ) : null}
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
    </>
  );
  const dialogs = (
    <>
      {versions ? (
        <VersionsDrawer
          data={data}
          current={null}
          onClose={() => setVersions(false)}
          onOpen={(n) => {
            setVersions(false);
            navigate("routing", `versions/${n}`);
          }}
        />
      ) : null}
      {replaying ? (
        <ReplayPanel session={session} ws={ws.id} body={st.body} last={replay} canPublish={canPublish} onDone={setReplay} onPublish={() => void openPublish()} onClose={() => setReplaying(false)} />
      ) : null}
      {publishing ? (
        <PublishDialog
          session={session}
          ws={ws.id}
          next={next}
          replay={replay ? { days: replay.days, total: replay.total, changed: replay.changed } : null}
          onReplay={() => {
            setPublishing(false);
            setReplaying(true);
          }}
          onPublished={(v) => void onPublished(v)}
          onClose={() => setPublishing(false)}
        />
      ) : null}
      {alerts ? <AlertsDialog session={session} ws={ws.id} label={data.alert.label} slack={data.slack ?? { ready: false, team: null }} onSaved={() => void refresh(false)} onClose={() => setAlerts(false)} /> : null}
      {reviewing && data.live && data.draftBase ? <CompareDialog session={session} ws={ws.id} from={data.draftBase} to={data.live.version} onClose={() => setReviewing(false)} /> : null}
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 md:px-6">
        <h2 className="text-[14px] font-medium text-ink">Lead routing</h2>
        {!data.live ? <Badge tone="amber">Draft</Badge> : draft ? <Badge tone="amber">Unpublished changes</Badge> : data.paused ? <Badge>Paused</Badge> : <Badge tone="green" dot>Live</Badge>}
        {!readOnly && data.live ? (
          <IconButton label={data.paused ? "Turn routing on" : "Pause routing"} onClick={() => void pause(!data.paused)}>
            {data.paused ? <Play size={14} /> : <Pause size={14} />}
          </IconButton>
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
        {!readOnly ? (
          <span className="ml-1 hidden items-center sm:flex">
            <IconButton label="Undo" onClick={() => dispatch({ type: "undo" })} disabled={!st.past.length}>
              <Undo size={14} />
            </IconButton>
            <IconButton label="Redo" onClick={() => dispatch({ type: "redo" })} disabled={!st.future.length}>
              <Redo size={14} />
            </IconButton>
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!readOnly ? (
            <IconButton label={data.alert.label ? `Alerts: ${data.alert.label}` : "Alerts"} onClick={() => setAlerts(true)}>
              <Bell size={15} />
            </IconButton>
          ) : null}
          <IconButton label="Versions" onClick={() => setVersions(true)}>
            <History size={15} />
          </IconButton>
          <span ref={testButton} className="contents">
            <IconButton label="Test with a contact" aria-pressed={testing} onClick={() => (testing ? closeTest() : openTest())} aria-keyshortcuts="T">
              <Play size={15} />
            </IconButton>
          </span>
          {!readOnly ? (
            <IconButton label="Test on past leads" onClick={() => setReplaying(true)}>
              <BarChart size={15} />
            </IconButton>
          ) : null}
          {!readOnly ? (
            <Button size="sm" disabled={!canPublish} onClick={() => void openPublish()}>
              Publish
            </Button>
          ) : null}
        </div>
      </div>

      {bars}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-h-0 overflow-y-auto">
          <Flow
            body={st.body}
            counts={data.stats ? counts : null}
            problems={probs}
            sel={sel}
            onSelect={setSel}
            edit={readOnly ? undefined : edit}
            members={data.members}
            path={path}
            runKey={runKey}
            liveRules={liveRules}
            setup={setup}
          />
        </div>
        <aside className="relative min-h-[480px] overflow-hidden border-t border-line lg:min-h-0 lg:border-t-0 lg:border-l">
          <div className="h-full overflow-y-auto">
            <Inspector
              sel={sel}
              body={st.body}
              edit={edit}
              readOnly={readOnly}
              members={data.members}
              fields={withSegments(data.fields, st.body.segments)}
              forms={data.forms}
              meetings={data.meetings ?? []}
              counts={data.stats ? counts : null}
              problems={probs}
              lists={lists}
              onLists={readOnly ? undefined : onLists}
              onSelect={setSel}
            />
          </div>
          {testing ? (
            <div ref={testPanel}>
              <TestPanel sb={sb} session={session} ws={ws.id} body={st.body} hasLive={!!data.live} members={data.members} fields={withSegments(data.fields, st.body.segments)} start={startTest} onLines={onLines} onClose={closeTest} />
            </div>
          ) : null}
        </aside>
      </div>

      {dialogs}
    </div>
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
