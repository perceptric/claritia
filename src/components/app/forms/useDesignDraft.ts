"use client";

// The design system's draft while the builder is open (docs/design-system.md Part 8.3): the brand kit's styles,
// changed at once on screen and saved a moment after the last change. A save names the rev it started from; when
// someone else saved first, their version comes back and replaces this one, with an error saying so.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";
import type { Kit } from "./shared";

export type DesignDraft = {
  system: DesignSystem;
  /** The latest draft, for handlers that run before a render. */
  current: () => DesignSystem;
  set: (next: DesignSystem) => void;
  saving: boolean;
  error: string;
  /** Save now, before publishing or leaving. True when nothing is left to save. */
  flush: () => Promise<boolean>;
};

export function useDesignDraft(session: Session, workspaceId: string, kit: Kit | null, tokens: Partial<Tokens>): DesignDraft {
  const kitId = kit?.id ?? null;
  const [cur, setCur] = useState(() => ({ kitId, system: readSystem(kit?.design, tokens), rev: kit?.design_rev ?? 0 }));
  // Another kit picked: its own draft.
  if (cur.kitId !== kitId) setCur({ kitId, system: readSystem(kit?.design, tokens), rev: kit?.design_rev ?? 0 });
  const latest = useRef(cur.system);
  const rev = useRef(cur.rev);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    latest.current = cur.system;
    rev.current = cur.rev;
  }, [cur]);

  // A reload that brings a newer save from someone else is taken when nothing here is waiting to save.
  const kitRev = kit?.design_rev ?? 0;
  const kitDesign = kit?.design;
  useEffect(() => {
    if (kitId && !pending.current && kitRev > rev.current) {
      rev.current = kitRev;
      setCur({ kitId, system: readSystem(kitDesign, tokens), rev: kitRev });
    }
  }, [kitId, kitRev, kitDesign, tokens]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!pending.current || !kitId) return true;
    pending.current = false;
    const sent = latest.current;
    setSaving(true);
    try {
      const res = await fetch("/api/design/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ workspaceId, kitId, design: sent, rev: rev.current }),
      });
      const data = (await res.json().catch(() => ({}))) as { rev?: number; design?: unknown; error?: string };
      if (res.status === 409 && typeof data.rev === "number") {
        const theirs = readSystem(data.design, tokens);
        rev.current = data.rev;
        latest.current = theirs;
        setCur({ kitId, system: theirs, rev: data.rev });
        setError(data.error ?? "Someone else changed these styles.");
        return false;
      }
      if (!res.ok || typeof data.rev !== "number") {
        pending.current = true;
        setError(data.error ?? "Try again in a moment.");
        return false;
      }
      rev.current = data.rev;
      setError("");
      // Changes made while this save was on its way go in the next one.
      if (latest.current !== sent) {
        pending.current = true;
        setTick((t) => t + 1);
      } else setCur((c) => ({ ...c, rev: data.rev! }));
      return !pending.current;
    } catch {
      pending.current = true;
      setError("Try again in a moment.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [kitId, session, workspaceId, tokens]);

  useEffect(() => {
    if (!pending.current) return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [cur.system, tick, save]);

  const set = useCallback(
    (next: DesignSystem) => {
      if (!kitId) return;
      latest.current = next;
      pending.current = true;
      setCur((c) => ({ ...c, system: next }));
    },
    [kitId],
  );
  const current = useCallback(() => latest.current, []);
  return { system: cur.system, current, set, saving, error, flush: save };
}
