"use client";

// Publish (docs/router-ux.md 4.5) and the two small dialogs beside it: Compare (a version against live, as signed
// sentences) and Alerts (the Claritia Slack app, which messages each rep and answers /book, and the Slack channel
// webhook the router posts to).

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { Change } from "@/lib/router/diff";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Modal } from "../meetings/parts";
import { Button, ErrorNote, errorText, Field, Input } from "../ui";
import { routingApi, type ChangesOut } from "./api";
import type { ReplaySummary } from "./Replay";

/** Changes as signed sentences: + added, − removed, ~ changed. */
export function ChangeList({ changes }: { changes: Change[] | null }) {
  if (!changes)
    return (
      <div className="flex flex-col gap-1.5" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="anim-shimmer h-4 rounded-full bg-paper-deep" style={{ width: `${80 - i * 15}%`, animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  if (!changes.length) return <p className="text-[13px] text-muted">No changes</p>;
  return (
    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
      {changes.map((c, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-5">
          <span aria-label={c.sign === "+" ? "Added" : c.sign === "-" ? "Removed" : "Changed"} className={`w-3 shrink-0 text-center font-mono ${c.sign === "+" ? "text-sage" : c.sign === "-" ? "text-rose" : "text-butter"}`}>
            {c.sign === "-" ? "−" : c.sign}
          </span>
          <span className="text-ink">{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function useChanges(session: Session, ws: string, body: { from?: number | null; to?: number | "draft" }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState("");
  const key = JSON.stringify(body);
  useEffect(() => {
    let live = true;
    routingApi<ChangesOut>(session, ws, "changes", JSON.parse(key))
      .then((r) => live && setChanges(r.changes))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [session, ws, key]);
  return { changes: error ? [] : changes, error };
}

export function PublishDialog({
  session,
  ws,
  replay,
  onReplay,
  onPublished,
  onClose,
}: {
  session: Session;
  ws: string;
  /** The number the new version gets. */
  next: number;
  replay: ReplaySummary | null;
  onReplay: () => void;
  onPublished: (version: number) => void;
  onClose: () => void;
}) {
  const { changes, error: loadError } = useChanges(session, ws, { to: "draft" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const publish = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await routingApi<{ version: number }>(session, ws, "publish", { note: note.trim() || null });
      onPublished(r.version);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Make live"
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void publish()} disabled={busy}>
            Make live
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        <section className="flex flex-col gap-2">
          <h3 className="text-[12.5px] font-medium text-body">Changes</h3>
          <ChangeList changes={changes} />
          <ErrorNote message={loadError} />
        </section>
        <section className="flex items-center gap-3 text-[13px]">
          <span className="w-16 shrink-0 text-[12.5px] font-medium text-body">Past leads</span>
          <span className="flex-1 text-ink tabular-nums">{replay ? `${replay.changed} of ${replay.total} change` : "Not run"}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onReplay}>
            {replay ? "Open" : "Run now"}
          </Button>
        </section>
        <Field label="Note">
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Split EMEA from US" />
        </Field>
        <ErrorNote message={error} />
      </form>
    </Modal>
  );
}

export function CompareDialog({ session, ws, from, to, onClose }: { session: Session; ws: string; from: number; to: number; onClose: () => void }) {
  const { changes, error } = useChanges(session, ws, { from, to });
  return (
    <Modal title={`v${from} → v${to}`} onClose={onClose}>
      <ChangeList changes={changes} />
      <ErrorNote message={error} />
    </Modal>
  );
}

export function AlertsDialog({
  session,
  ws,
  label,
  slack,
  onSaved,
  onClose,
}: {
  session: Session;
  ws: string;
  label: string | null;
  slack: { ready: boolean; team: string | null };
  onSaved: () => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (u: string) => {
    setBusy(true);
    setError("");
    try {
      await routingApi(session, ws, "alert", { url: u, label: name.trim() || null });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Alerts"
      onClose={onClose}
      footer={
        <>
          {label ? (
            <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => void save("")}>
              Remove
            </Button>
          ) : null}
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save(url.trim())} disabled={busy || !url.trim()}>
            Save
          </Button>
        </>
      }
    >
      <SlackApp session={session} ws={ws} slack={slack} onSaved={onSaved} />
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) void save(url.trim());
        }}
      >
        {label ? (
          <p className="flex items-center gap-2 text-[13px] text-ink">
            <span className="size-1.5 rounded-full bg-sage" />
            {label}
          </p>
        ) : null}
        <Field label="Slack webhook address">
          <Input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="font-mono text-[12.5px]" />
        </Field>
        <Field label="Channel">
          <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="#leads" />
        </Field>
        <ErrorNote message={error} />
      </form>
    </Modal>
  );
}

/** The Claritia Slack app: "Add to Slack" goes to Slack's approve page and back to Routing. */
function SlackApp({ session, ws, slack, onSaved }: { session: Session; ws: string; slack: { ready: boolean; team: string | null }; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!slack.ready && !slack.team) return null;
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await routingApi<{ url: string }>(session, ws, "slack_install");
      window.location.href = r.url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await askConfirm("Remove Slack?", { ok: "Remove", danger: true }))) return;
    setBusy(true);
    setError("");
    try {
      await routingApi(session, ws, "slack_remove");
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-5 flex flex-col gap-2 border-b border-line pb-5">
      <div className="flex items-center gap-3">
        <BrandLogo domain="slack.com" name="Slack" size={22} />
        <span className="flex-1 text-[13px] text-ink">{slack.team ?? "Slack"}</span>
        {slack.team ? (
          <Button variant="plain" size="sm" disabled={busy} onClick={() => void remove()}>
            Remove
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => void add()}>
            Add to Slack
          </Button>
        )}
      </div>
      <ErrorNote message={error} />
    </div>
  );
}
