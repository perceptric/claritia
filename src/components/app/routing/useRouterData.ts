"use client";

// The router as the pages outside the editor see it (Overview, Teams, Regions, Company types): loaded once with
// /api/routing load, and changed by saving the draft. Their changes join the editor's draft; nothing goes live until
// Make live on Rules.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { cleanBody } from "@/lib/router/check";
import { emptyBody, type RouterBody } from "@/lib/router/types";
import { errorText } from "../ui";
import { routingApi, type Loaded } from "./api";

export function useRouterData(session: Session, ws: string) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });
  const reload = useCallback(async () => {
    try {
      setData(await routingApi<Loaded>(sessionRef.current, ws, "load"));
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [ws]);
  useEffect(() => {
    void reload();
  }, [reload]);

  /** The body being worked on: the draft when there is one, else what's live, else a fresh one. */
  const body: RouterBody | null = data ? (data.draft ?? data.live?.body ?? emptyBody()) : null;

  /** Change the draft with `fn`, from the latest saved draft. A change made elsewhere meanwhile is kept. */
  const change = useCallback(
    async (fn: (b: RouterBody) => RouterBody): Promise<boolean> => {
      setSaving(true);
      setError("");
      try {
        const fresh = await routingApi<Loaded>(sessionRef.current, ws, "load");
        const base = fresh.draft ?? fresh.live?.body ?? emptyBody();
        await routingApi(sessionRef.current, ws, "save_draft", { body: cleanBody(fn(base)), revision: fresh.revision });
        await reload();
        return true;
      } catch (e) {
        setError(errorText(e));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [ws, reload],
  );

  return { data, body, error, saving, reload, change };
}
