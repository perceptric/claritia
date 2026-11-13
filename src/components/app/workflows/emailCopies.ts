"use client";

// The editor's side of automation emails on the Emails canvas (docs/email-unify-plan.md, E3;
// src/lib/workflows/stepEmails.ts). On open, and whenever the email steps change (one added, copied or removed), each
// step gets its editing copy and newer words from the canvas come into the draft. Edits made here (the subject, Write
// with AI, a template, the classic builder) go to the copy 800 ms later. A save that fails is tried again with
// growing waits; `flush` waits for what's pending (before Edit email opens the canvas).

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { designOf, emailSteps, ensurePayload, mergeCopies, sameEmail, type EmailCopy } from "@/lib/workflows/stepEmails";
import type { Body, Step } from "@/lib/workflows/types";

type Sync = (fn: (b: Body) => Body) => void;

/** Steps without a design get the one their words make, kept so it stays the same between saves. */
function withDesigns(b: Body): Body {
  const fix = (steps: Step[]): Step[] =>
    steps.map((s) => {
      if (s.kind === "branch" || s.kind === "wait_until") return { ...s, yes: fix(s.yes), no: fix(s.no) };
      if (s.kind === "split") return { ...s, a: fix(s.a), b: fix(s.b) };
      return s.kind === "email" && !s.email.doc ? { ...s, email: { ...s.email, doc: designOf(s.email) } } : s;
    });
  return { ...b, steps: fix(b.steps) };
}

export function useEmailCopies({ sb, ws, id, body, sync, readOnly }: { sb: SupabaseClient; ws: string; id: string; body: Body; sync: Sync; readOnly: boolean }) {
  const [copies, setCopies] = useState<Map<string, EmailCopy>>(new Map());
  const [error, setError] = useState("");
  const latest = useRef(body);
  const copiesRef = useRef(copies);
  const pending = useRef<Promise<void> | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    latest.current = body;
    copiesRef.current = copies;
  });

  /** Make the copies match the steps and bring their words into the draft. */
  const ensure = useCallback(async () => {
    const r = await sb.rpc("workflow_email_ensure", { p_ws: ws, p_wf: id, p_steps: ensurePayload(withDesigns(latest.current)) });
    if (r.error) throw new Error(r.error.message);
    const list = (r.data ?? []) as EmailCopy[];
    const next = new Map(list.map((c) => [c.step, { ...c, made: false }]));
    copiesRef.current = next;
    setCopies(next);
    sync((b) => mergeCopies(withDesigns(b), list).body);
  }, [sb, ws, id, sync]);

  // On open, and when the set of email steps changes.
  const stepKey = emailSteps(body)
    .map((s) => s.id)
    .join(",");
  useEffect(() => {
    if (readOnly) return;
    let live = true;
    ensure()
      .then(() => live && setError(""))
      .catch(() => live && setError("The emails couldn't be linked to the Emails page. Reload to try again."));
    return () => {
      live = false;
    };
  }, [stepKey, ensure, readOnly]);

  /** Send edits made here to the copies. */
  const push = useCallback(async () => {
    const steps = emailSteps(latest.current);
    if (steps.some((s) => !s.email.doc)) {
      sync(withDesigns);
      return;
    }
    for (const s of steps) {
      const c = copiesRef.current.get(s.id);
      if (!c || sameEmail(s.email, c)) continue;
      const doc = designOf(s.email);
      const r = await sb.rpc("email_draft_save", { p_ws: ws, p_id: c.id, p_name: s.email.subject.trim() || "Email", p_subject: s.email.subject, p_preheader: s.email.preheader, p_doc: doc });
      if (r.error) throw new Error(r.error.message);
      const next = new Map(copiesRef.current);
      next.set(s.id, { ...c, subject: s.email.subject, preheader: s.email.preheader, doc });
      copiesRef.current = next;
      setCopies(next);
    }
  }, [sb, ws, sync]);

  useEffect(() => {
    if (readOnly || !copies.size) return;
    const t = setTimeout(
      () => {
        const p = push()
          .then(() => setTries(0))
          .catch(() => setTries((n) => n + 1));
        pending.current = p;
        void p.finally(() => pending.current === p && (pending.current = null));
      },
      tries ? Math.min(30_000, 1000 * 2 ** tries) : 800,
    );
    return () => clearTimeout(t);
  }, [body, copies, push, readOnly, tries]);

  const flush = useCallback(async () => {
    if (pending.current) await pending.current;
    await push();
  }, [push]);

  return { copies, error: error || (tries > 2 ? "An email's changes haven't reached the Emails page yet. Retrying." : ""), flush, resync: ensure };
}
