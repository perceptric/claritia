"use client";

// Routing's working state, held by RoutingView so it stays while someone moves between Assignment, Sales reps and
// History: the routing as loaded, the body on screen with its undo history, and Save (save and publish in one step).
// Nothing reaches the server before Save; leaving Routing with changes on screen asks first.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { problems as checkProblems, problemWords } from "@/lib/router/check";
import { withSegments } from "@/lib/router/conditions";
import { emptyBody, type RouterBody } from "@/lib/router/types";
import { errorText, invalidate } from "../ui";
import { routingApi, type Loaded } from "./api";
import { changed, saveAndPublish } from "./assignModel";
import { editorReducer, startEditor } from "./editorModel";
import { routingLoadKey } from "./useRouterData";

export type Assignment = ReturnType<typeof useAssignment>;

export function useAssignment(session: Session, ws: string) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [st, dispatch] = useReducer(editorReducer, emptyBody(), startEditor);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  /** Read the routing again; `keep` leaves the body on screen as it is (a reload after a teammate's change asks first). */
  const load = useCallback(
    async (o: { keep?: boolean } = {}) => {
      try {
        const d = await routingApi<Loaded>(sessionRef.current, ws, "load");
        setData(d);
        setLoadError("");
        if (!o.keep) dispatch({ type: "reset", body: d.draft ?? d.live?.body ?? emptyBody() });
        return d;
      } catch (e) {
        setLoadError(errorText(e));
        return null;
      }
    },
    [ws],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const body = st.body;
  const saved = data?.live?.body ?? null;
  const dirty = !!data && changed(body, saved);
  const memberSet = useMemo(() => new Set((data?.members ?? []).map((m) => m.id)), [data?.members]);
  const fields = useMemo(() => withSegments(data?.fields ?? [], body.segments), [data?.fields, body.segments]);
  const problems = useMemo(() => (data ? checkProblems(body, { members: memberSet, fields }) : []), [data, body, memberSet, fields]);

  const edit = useCallback((fn: (b: RouterBody) => RouterBody, key?: string) => dispatch({ type: "edit", edit: fn, key, at: Date.now() }), []);

  /** Save and publish. A problem is shown before anything is sent; a teammate's change in between stops it. */
  const save = useCallback(
    async (next?: RouterBody): Promise<boolean> => {
      if (!data) return false;
      const b = next ?? body;
      const ps = checkProblems(b, { members: memberSet, fields });
      if (ps.length) {
        setSaveError(problemWords(ps[0]!.text));
        return false;
      }
      setSaving(true);
      setSaveError("");
      try {
        const call = <T,>(action: string, payload: object) => routingApi<T>(sessionRef.current, ws, action, payload);
        await saveAndPublish(call, b, { revision: data.revision, saved });
        invalidate("app_counts");
        invalidate(routingLoadKey(ws));
        invalidate(`router_live:${ws}`);
        await load();
        return true;
      } catch (e) {
        const t = errorText(e);
        if (/changed the draft/i.test(t)) setConflict(true);
        else setSaveError(t);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [data, body, memberSet, fields, ws, saved, load],
  );

  /** A teammate saved first: show theirs (what's on screen is dropped). */
  const loadTheirs = useCallback(async () => {
    setConflict(false);
    await load();
  }, [load]);

  return {
    data,
    loadError,
    body,
    saved,
    dirty,
    fields,
    problems,
    saving,
    saveError,
    setSaveError,
    conflict,
    canUndo: st.past.length > 0,
    canRedo: st.future.length > 0,
    edit,
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    discard: () => dispatch({ type: "reset", body: data?.live?.body ?? data?.draft ?? emptyBody() }),
    save,
    load,
    loadTheirs,
  };
}
