"use client";

// The router as the pages outside the editor see it (Overview, Teams, Regions, Company types): loaded with
// /api/routing load (shared in the cache as `routing_load:<workspace>`), and changed by saving the draft. Their
// changes join the editor's draft; nothing goes live until Make live on Rules.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanBody } from "@/lib/router/check";
import type { RouterBody } from "@/lib/router/types";
import { cache, errorText, invalidate, useQuery } from "../ui";
import { routingApi, type Loaded } from "./api";
import { changeDraft, draftBase } from "./draftChange";

export const routingLoadKey = (ws: string) => `routing_load:${ws}`;

/** The routing load, shared by every screen that reads it (fetched again on each visit, painted from the cache). */
export function useRoutingLoad(session: Session, ws: string) {
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  // Slim: the pages outside the editor don't show stats, versions or the chat.
  return useQuery<Loaded>(routingLoadKey(ws), () => routingApi<Loaded>(sessionRef.current, ws, "load", { slim: true }), { staleMs: 0 });
}

export function useRouterData(session: Session, ws: string) {
  const q = useRoutingLoad(session, ws);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  const data = q.data;
  const { reload } = q;

  /** The body being worked on: the draft when there is one, else what's live, else a fresh one. */
  const body: RouterBody | null = data ? draftBase(data) : null;

  /**
   * Change the draft with `fn`: the screen shows the change at once and one save goes out, from the revision on
   * screen. If someone changed the draft meanwhile, it reads the latest and applies `fn` to that once more, so their
   * change is kept. A failed save puts the screen back and shows why.
   */
  const change = useCallback(
    async (fn: (b: RouterBody) => RouterBody): Promise<boolean> => {
      const key = routingLoadKey(ws);
      setSaving(true);
      setSaveError("");
      try {
        await changeDraft<Loaded>(
          cache,
          key,
          {
            load: () => routingApi<Loaded>(sessionRef.current, ws, "load", { slim: true }),
            save: (b, revision) => routingApi<{ revision: number; body: RouterBody }>(sessionRef.current, ws, "save_draft", { body: b, revision }),
            clean: cleanBody,
          },
          fn,
        );
        // Problems and counts come from the server; read them again without holding up the screen.
        invalidate(key);
        return true;
      } catch (e) {
        setSaveError(errorText(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [ws],
  );

  return { data, body, error: saveError || q.error, saving, reload, change };
}
