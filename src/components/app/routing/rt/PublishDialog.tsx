"use client";

// Review and publish (docs/routing-workflow.md Section 17): what changes, the sources affected, the server's blocking
// errors and warnings, the test evidence for exactly this release, and that existing assignments and meetings stay
// as they are. Publishing goes through the one publish service with an operation id made when the dialog opened:
// "Published vN" shows only once the server confirms; a lost answer is checked by that id, never sent blind again.

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouterBody } from "@/lib/router/types";
import { changesBetween, effectiveSource, type PolicyRow, type SourceChange } from "@/lib/routing/screenModel";
import { Check, Warn } from "../../../Icons";
import { Modal } from "../../meetings/parts";
import { Button, Loading, type ViewProps } from "../../ui";
import { ApiError, newKey, rt, type ReviewOut, type Screen } from "./api";
import { namesOf } from "./parts";

export function PublishDialog({
  session,
  ws,
  d,
  row,
  body,
  name,
  flush,
  onTest,
  onClose,
  onPublished,
}: Pick<ViewProps, "session" | "ws"> & { d: Screen; row: PolicyRow; body: RouterBody; name: string | null; flush: () => Promise<number>; onTest: () => void; onClose: () => void; onPublished: (v: number) => void }) {
  const names = useMemo(() => namesOf(d.people, d.teams), [d.people, d.teams]);
  const [rev, setRev] = useState<ReviewOut | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"ready" | "publishing" | "unknown">("ready");
  const key = useRef(newKey("pub"));
  const flushRef = useRef(flush);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await flushRef.current();
        const r = await rt<ReviewOut>(session, ws.id, "rt_review", { policy: row.id });
        if (live) setRev(r);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Couldn't check this draft.");
      }
    })();
    return () => {
      live = false;
    };
  }, [row.id, session, ws.id]);

  const sourceChanges: SourceChange[] = d.sources
    .map((s) => ({ s, eff: effectiveSource(s, row.id) }))
    .filter((x) => x.eff.pending)
    .map(({ s, eff }) => {
      const from = s.policy_id && s.policy_id !== row.id ? d.policies.find((p) => p.id === s.policy_id)?.name : null;
      const text = !eff.connected ? "moves to another policy" : !eff.enabled ? "disconnects" : from ? `moves here from ${from}` : s.policy_id !== row.id ? "connects" : "outcome or mapping changes";
      return { name: s.name, text };
    });
  const changes = changesBetween(row.live, body, { names, fields: d.fields, rename: name, sources: sourceChanges });
  const tested = !!rev?.evidence;
  const can = !!rev && !rev.errors.length && tested && phase !== "publishing";
  const n = rev?.sources.length ?? 0;
  const who = (u: string | null | undefined) => (u ? (names.people[u] ?? "someone") : "");
  const evidenceWords = rev?.evidence ? (rev.evidence.result.state === "assigned" && rev.evidence.result.recipient ? `${who(rev.evidence.result.recipient)} suggested` : "needs review") : "";

  const publish = async () => {
    if (!rev) return;
    setPhase("publishing");
    setError("");
    try {
      const out = await rt<{ version: number }>(session, ws.id, "rt_publish", { policy: row.id, revision: rev.revision, key: key.current, fingerprint: rev.fingerprint }, { timeoutMs: 20_000 });
      onPublished(out.version);
    } catch (e) {
      if (e instanceof ApiError && e.lost) {
        setPhase("unknown");
        return;
      }
      setPhase("ready");
      setError(e instanceof Error ? e.message : "Couldn't publish.");
    }
  };
  const check = async () => {
    setError("");
    try {
      const out = await rt<{ version: number | null }>(session, ws.id, "rt_publish_status", { policy: row.id, key: key.current });
      if (out.version) return onPublished(out.version);
      setPhase("ready");
      setError("It wasn't published. You can publish again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Still no answer. Check again in a moment.");
    }
  };

  const title = rev ? `Publish v${rev.version} · affects ${n} ${n === 1 ? "source" : "sources"}` : "Publish";
  return (
    <Modal
      title={title}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {rev && !tested ? (
            <Button variant="ghost" onClick={onTest}>
              Test lead
            </Button>
          ) : null}
          {phase === "unknown" ? (
            <Button onClick={() => void check()}>Check status</Button>
          ) : (
            <Button disabled={!can} onClick={() => void publish()}>
              {phase === "publishing" ? "Publishing…" : `Publish v${rev?.version ?? (row.active_version ?? 0) + 1}`}
            </Button>
          )}
        </>
      }
    >
      {!rev && !error ? <Loading /> : null}
      {rev ? (
        <div className="flex flex-col gap-2.5 text-[13px]">
          <span className="text-[12px] font-medium text-muted">Changes</span>
          <div>
            {(changes.length ? changes : ["No changes"]).map((c, i) => (
              <Line key={i} icon={<span className="size-[5px] rounded-full border border-ink" />}>
                {c}
              </Line>
            ))}
            {rev.semantics.map((c, i) => (
              <Line key={`s${i}`} icon={<span className="size-[5px] rounded-full bg-muted" />} className="pl-4 text-body">
                {c}
              </Line>
            ))}
          </div>
          <span className="text-[12px] font-medium text-muted">Checks</span>
          <div>
            {rev.errors.map((e, i) => (
              <Line key={`e${i}`} icon={<Warn size={13} />} className="text-rose">
                {e.text}
              </Line>
            ))}
            <Line icon={tested ? <Check size={13} /> : <Warn size={13} />} className={tested ? "text-signal-text" : "text-rose"}>
              {tested ? `Tested this draft: ${evidenceWords}` : "Run Test lead on this draft before publishing"}
            </Line>
            {rev.warnings.map((w, i) => (
              <Line key={`w${i}`} icon={<Warn size={13} />} className="text-butter">
                {w.text}
              </Line>
            ))}
            <Line icon={<Check size={13} />}>Existing assignments and meetings stay as they are. Only new leads use v{rev.version}.</Line>
          </div>
          {phase === "unknown" ? <p className="text-[12.5px] text-butter">No answer yet. It may have published. Check before trying again.</p> : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[12.5px] text-rose">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

function Line({ icon, children, className = "" }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 border-t border-line py-2 first:border-t-0 ${className}`}>
      <span className="mt-[3px] inline-flex w-[13px] shrink-0 justify-center">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
