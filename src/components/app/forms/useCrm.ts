"use client";

// The connected CRMs' contact fields, for Saves to and the Sync tab: read live through /api/forms/crm-fields once
// per source while the page is open (the server keeps them 10 minutes). A failed read isn't kept, so it's tried again
// on the next page; while a read is out or failed, the fields count as unknown and nothing is called removed.

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { isCrmVendor, type CrmProperty } from "@/lib/sources/properties";
import type { CrmCtx } from "./formModel";
import type { SourceRow } from "./shared";

type Loaded = { properties: CrmProperty[] } | { error: string };
const loads = new Map<string, Promise<Loaded>>();

function load(session: Session, ws: string, source: string, fresh = false): Promise<Loaded> {
  const key = `${ws}:${source}`;
  const had = loads.get(key);
  if (had && !fresh) return had;
  const p: Promise<Loaded> = fetch(`/api/forms/crm-fields?workspaceId=${encodeURIComponent(ws)}&sourceId=${encodeURIComponent(source)}${fresh ? "&fresh=1" : ""}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(15_000),
  })
    .then(async (r) => {
      const d = (await r.json().catch(() => ({}))) as { properties?: CrmProperty[]; error?: string };
      return Array.isArray(d.properties) ? { properties: d.properties } : { error: d.error ?? "Couldn't read its fields." };
    })
    .catch(() => ({ error: "Couldn't reach Claritia. Try again." }));
  loads.set(key, p);
  void p.then((r) => {
    if ("error" in r && loads.get(key) === p) loads.delete(key);
  });
  return p;
}

/** Each connected CRM with its fields (null until read, or when the read failed). */
export function useCrm(sources: SourceRow[], session: Session, ws: string) {
  const crms = useMemo(() => sources.filter((s) => isCrmVendor(s.kind) && s.status !== "disconnected"), [sources]);
  const [state, setState] = useState<Record<string, Loaded>>({});
  const ids = crms.map((s) => s.id).join();
  useEffect(() => {
    let live = true;
    for (const s of crms) void load(session, ws, s.id).then((r) => live && setState((x) => ({ ...x, [s.id]: r })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, session, ws]);
  const ctx: CrmCtx = useMemo(() => {
    const m: CrmCtx = new Map();
    for (const s of crms) {
      const r = state[s.id];
      m.set(s.id, { name: s.name, props: r && "properties" in r ? r.properties : null });
    }
    return m;
  }, [crms, state]);
  const errors = Object.fromEntries(Object.entries(state).flatMap(([k, v]) => ("error" in v ? [[k, v.error]] : [])));
  return { crms, ctx, errors };
}
