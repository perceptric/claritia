"use client";

// The form's own routing for On Submission (src/lib/routing/formRules.ts): the policy this form routes with, its If →
// Then rows and Otherwise, saved to the policy's draft through the same calls Routing uses (rt_save at the revision
// read, a conflict reloads). A form that shares its policy with other sources, or uses the default one, gets its own
// policy at its first edit: a copy named after the form, with this form moved onto it. Publishing the form publishes
// that policy too, after the test the router asks for, so the rows on screen are the rules leads meet.

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RouterBody } from "@/lib/router/types";
import { otherwiseOf, policyOf, rowsOf, sampleValues, sharedWith, withOtherwise, withRows, type Row, type Then } from "@/lib/routing/formRules";
import { hasChanges, toV2, withScope } from "@/lib/routing/screenModel";
import { invalidate } from "../ui";
import { ApiError, newKey, rt, useScreen, type ReviewOut, type Screen } from "../routing/rt/api";

export type FormRouting = ReturnType<typeof useFormRouting>;
type Save = "saved" | "saving" | "error";

export function useFormRouting(session: Session, ws: string, formId: string, formName: string, booking: { book: boolean; meeting: string | null }) {
  const screen = useScreen(session, ws);
  const d = screen.data;
  const source = useMemo(() => d?.sources.find((s) => s.kind === "form" && s.form_id === formId) ?? null, [d, formId]);
  const pid = policyOf(source);
  const row = d?.policies.find((p) => p.id === pid) ?? null;
  const teamKeys = useMemo(() => new Set(d?.teams.flatMap((t) => t.keys) ?? []), [d]);
  const own = !!row && !row.is_default && !sharedWith(d?.sources ?? [], row.id, formId).length;
  const owner = d?.role === "owner";

  const [body, setBody] = useState<RouterBody | null>(null);
  const [save, setSave] = useState<Save>("saved");
  const [error, setError] = useState("");
  const seen = useRef<string | null>(null);
  const rev = useRef(0);
  /** A policy just made for this form takes the form's name with its first save. */
  const rename = useRef(false);
  // The body on screen comes from the policy once per policy; later reads never overwrite what's being edited.
  useEffect(() => {
    if (!d || seen.current === (row?.id ?? "")) return;
    seen.current = row?.id ?? "";
    const base = row ? (row.draft ?? row.live) : null;
    setBody(base ? toV2(base, { reviewer: d.me, teamKeys }) : null);
    rev.current = row?.draft_revision ?? 0;
  }, [d, row, teamKeys]);

  const latest = useRef<RouterBody | null>(null);
  const policy = useRef<string | null>(null);
  // The policy edits go to: this form's own, once it has one.
  const ownId = own ? row!.id : null;
  useEffect(() => {
    if (ownId) policy.current = ownId;
    else if (policy.current && d && !d.policies.some((p) => p.id === policy.current)) policy.current = null;
  }, [ownId, d]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const bookRef = useRef(booking);
  useEffect(() => {
    bookRef.current = booking;
  }, [booking]);

  /** One write at a time, in order. */
  const queue = useCallback(<T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.current.then(fn, fn);
    chain.current = p.catch(() => undefined);
    return p;
  }, []);

  /** This form's own policy: the one it has, or a copy of the shared one (or a new one), with the form moved onto it. */
  const ensureOwn = useCallback(async (): Promise<string> => {
    if (policy.current) return policy.current;
    const made = row
      ? await rt<{ id: string }>(session, ws, "rt_duplicate", {
          policy: row.id,
          key: newKey("dup"),
        })
      : await rt<{ id: string }>(session, ws, "rt_create", {
          name: formName.slice(0, 80) || "Form",
          start: "conditions",
          key: newKey("new"),
        });
    const fresh = await rt<Screen>(session, ws, "rt_screen");
    const mine = fresh.policies.find((p) => p.id === made.id);
    rev.current = mine?.draft_revision ?? 0;
    if (!latest.current) {
      const base = mine ? (mine.draft ?? mine.live) : null;
      latest.current = base ? toV2(base, { reviewer: fresh.me, teamKeys }) : null;
    }
    const src = fresh.sources.find((s) => s.kind === "form" && s.form_id === formId) ?? null;
    const b = bookRef.current;
    await rt(session, ws, "rt_stage", {
      policy: made.id,
      source: { kind: "form", form: formId },
      enabled: true,
      outcome: b.book && b.meeting ? "assign_and_calendar" : "assign_only",
      meeting: b.book ? b.meeting : null,
      revision: src?.draft_revision ?? null,
    });
    policy.current = made.id;
    seen.current = made.id;
    rename.current = true;
    return made.id;
  }, [row, session, ws, formName, formId, teamKeys]);

  const write = useCallback(
    () =>
      queue(async () => {
        try {
          const id = await ensureOwn();
          const next = latest.current;
          if (!next) return;
          const out = await rt<{ revision: number }>(session, ws, "rt_save", {
            policy: id,
            body: withScope(next),
            ...(rename.current ? { name: formName.slice(0, 80) || "Form" } : {}),
            revision: rev.current,
          });
          rev.current = out.revision;
          rename.current = false;
          setSave("saved");
          setError("");
          invalidate(`routing_screen:${ws}`);
        } catch (e) {
          setSave("error");
          if (e instanceof ApiError && e.code === "draft_conflict") {
            // Someone else saved first: show theirs.
            seen.current = null;
            setError("Someone else changed this routing. Showing theirs.");
            screen.reload();
          } else setError(e instanceof Error ? e.message : "Couldn't save.");
        }
      }),
    [queue, ensureOwn, session, ws, formName, screen],
  );

  /** Change the rules: on screen at once, saved a moment after the last change. */
  const change = useCallback(
    (fn: (b: RouterBody) => RouterBody) => {
      const base = latest.current ?? body;
      if (!base) {
        // No policy yet: make one, then apply the change to its starting rules.
        setSave("saving");
        void queue(async () => {
          try {
            await ensureOwn();
            if (latest.current) {
              latest.current = fn(latest.current);
              setBody(latest.current);
            }
          } catch (e) {
            setSave("error");
            setError(e instanceof Error ? e.message : "Couldn't save.");
          }
        }).then(() => void write());
        return;
      }
      const next = fn(base);
      latest.current = next;
      setBody(next);
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void write(), 600);
    },
    [body, queue, ensureOwn, write],
  );
  useEffect(() => {
    latest.current = body;
  }, [body]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      await write();
    }
    await chain.current;
  }, [write]);

  /** The form books a meeting or not, or its meeting changed: the form's connection follows, live with the next publish. */
  const stage = useCallback(
    async (book: boolean, meeting: string | null) => {
      const id = policy.current;
      if (!id || !owner) return;
      await queue(async () => {
        const fresh = await rt<Screen>(session, ws, "rt_screen");
        const src = fresh.sources.find((s) => s.kind === "form" && s.form_id === formId) ?? null;
        await rt(session, ws, "rt_stage", {
          policy: id,
          source: { kind: "form", form: formId },
          enabled: true,
          outcome: book && meeting ? "assign_and_calendar" : "assign_only",
          meeting: book ? meeting : null,
          revision: src?.draft_revision ?? null,
        }).catch((e) => setError(e instanceof Error ? e.message : "Couldn't save."));
        invalidate(`routing_screen:${ws}`);
      });
    },
    [owner, queue, session, ws, formId],
  );

  /**
   * Publish this form's policy when it has changes: check it, run the test the router asks for when there isn't one
   * for this exact draft (a lead that matches the first finished row), then publish at the checked fingerprint.
   */
  const publish = useCallback(async () => {
    const id = policy.current;
    if (!id || !owner) return;
    await flush();
    const fresh = await rt<Screen>(session, ws, "rt_screen");
    const p = fresh.policies.find((x) => x.id === id);
    if (!p || !hasChanges(p)) return;
    let r = await rt<ReviewOut>(session, ws, "rt_review", { policy: id });
    if (r.errors.length) throw new Error(`Routing: ${r.errors.map((e) => e.text).join(" ")}`);
    if (!r.evidence) {
      const b = p.draft ?? p.live;
      const keys = new Set(fresh.teams.flatMap((t) => t.keys));
      const src = fresh.sources.find((s) => s.kind === "form" && s.form_id === formId);
      await rt(session, ws, "rt_test", {
        policy: id,
        version: "draft",
        revision: r.revision,
        source: src?.id ?? null,
        email: "maya@globex.com",
        values: sampleValues(rowsOf(b), fresh.fields, keys),
      });
      r = await rt<ReviewOut>(session, ws, "rt_review", { policy: id });
    }
    await rt(
      session,
      ws,
      "rt_publish",
      {
        policy: id,
        revision: r.revision,
        key: newKey("pub"),
        fingerprint: r.fingerprint,
      },
      { timeoutMs: 20_000 },
    );
    invalidate(`routing_screen:${ws}`);
    screen.reload();
  }, [owner, flush, session, ws, formId, screen]);

  const rows = useMemo(() => rowsOf(body), [body]);
  return {
    ready: !!d,
    loadError: screen.error,
    error,
    save,
    owner,
    body,
    rows,
    otherwise: otherwiseOf(body),
    people: d?.people ?? [],
    teams: d?.teams ?? [],
    fields: d?.fields ?? [],
    teamKeys,
    changed: !!row && hasChanges(row),
    setRows: (next: Row[]) => change((b) => withRows(b, next, d?.fields ?? [])),
    setOtherwise: (t: Then) => change((b) => withOtherwise(b, t)),
    stage,
    publish,
    flush,
  };
}
