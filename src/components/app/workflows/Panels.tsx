"use client";

// The editor's side pieces (docs/enrich-workflows-reports.md 2.4): Try a contact, History, Versions and Make live.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { cleanBody } from "@/lib/workflows/check";
import { diffWords, resultWords, stepWords, type Names as WordNames } from "@/lib/workflows/explain";
import { find } from "@/lib/workflows/tree";
import type { Body } from "@/lib/workflows/types";
import { Search } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Modal } from "../meetings/parts";
import { Sheet } from "../Sheet";
import { Badge, Button, ErrorNote, errorText, Input, must, postJson, Tabs, timeAgo, type Tone, useQuery } from "../ui";
import type { Version } from "./data";

/** A sheet from the right, over the editor. */
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="flex min-h-full flex-col">{children}</div>
    </Sheet>
  );
}

// Try a contact ---------------------------------------------------------------------------------------------------

type TryLine = { step: string; path: string | null; note: string | null; email: { subject: string; paragraphs: string[]; cta: string | null; suppressed: boolean } | null };
type TryOut = { entered: boolean; goal: unknown; lines: TryLine[] };
type Found = { id: string; label: string };

const PATH: Record<string, string> = { yes: "if yes", no: "if no", a: "A", b: "B" };

export function TryPanel({ sb, session, ws, body, names, onPath, onClose }: { sb: SupabaseClient; session: Session; ws: string; body: Body; names: WordNames; onPath: (ids: Set<string> | null) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [who, setWho] = useState<Found | null>(null);
  const [out, setOut] = useState<TryOut | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = q.trim().replace(/[%,()]/g, "");
    if (s.length < 2 || who) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await sb.from("contacts").select("id, email, first_name, last_name").eq("workspace_id", ws).is("deleted_at", null).or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`).limit(8);
      if (!live) return;
      setFound(((r.data ?? []) as { id: string; email: string | null; first_name: string | null; last_name: string | null }[]).map((c) => ({ id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "No name" })));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, who, sb, ws]);

  // The path follows every edit, a moment after the last one.
  const key = JSON.stringify(body);
  useEffect(() => {
    if (!who) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await postJson<TryOut>(session, "/api/workflows/try", { body: JSON.parse(key), contactId: who.id });
        if (!live) return;
        setOut(r);
        setError("");
        onPath(new Set(r.lines.map((l) => l.step)));
      } catch (e) {
        if (live) setError(errorText(e));
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [who, key, session, onPath]);

  const close = () => {
    onPath(null);
    onClose();
  };

  return (
    <Drawer title="Try a contact" onClose={close} wide>
      <div className="flex flex-col gap-3 border-b border-line p-5">
        {who ? (
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-ink">{who.label}</span>
            <Button
              variant="plain"
              size="sm"
              onClick={() => {
                setWho(null);
                setOut(null);
                onPath(null);
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a contact" className="h-10 pl-9" autoFocus aria-label="Find a contact" />
            {found.length && q.trim().length >= 2 ? (
              <ul className="absolute inset-x-0 top-11 z-10 rounded-lg border border-line bg-card p-1 shadow-float">
                {found.map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => setWho(f)} className="flex h-9 w-full items-center rounded-sm px-3 text-left text-[13px] text-ink hover:bg-hover">
                      {f.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <ErrorNote message={error} />
        {out ? (
          !out.entered ? (
            <p className="text-[13.5px] text-muted">They wouldn&apos;t enter: the entry conditions don&apos;t match.</p>
          ) : out.goal ? (
            <p className="text-[13.5px] text-muted">They wouldn&apos;t enter: they already meet a goal.</p>
          ) : !out.lines.length ? (
            <p className="text-[13.5px] text-muted">No steps yet</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {out.lines.map((l, i) => {
                const s = find(body.steps, l.step)?.step;
                return (
                  <li key={`${l.step}-${i}`} className="anim-rise-sm flex flex-col gap-2" style={i < 8 ? { animationDelay: `${i * 30}ms` } : undefined}>
                    <span className="flex items-baseline gap-2 text-[13.5px] text-ink">
                      <span className="w-5 shrink-0 text-right text-[12px] text-faint tabular-nums">{i + 1}</span>
                      <span>
                        {s ? stepWords(s, names) : "A removed step"}
                        {l.path ? <span className="text-muted">, {PATH[l.path] ?? l.path}</span> : null}
                        {l.note ? <span className="text-muted"> {l.note}</span> : null}
                      </span>
                    </span>
                    {l.email ? (
                      <div className="ml-7 flex flex-col gap-2 rounded-2xl border border-line bg-paper px-4 py-3">
                        {l.email.suppressed ? (
                          <Badge tone="amber" dot>
                            Won&apos;t send: unsubscribed or bounced
                          </Badge>
                        ) : null}
                        <span className="text-[13.5px] font-semibold text-ink">{l.email.subject}</span>
                        {l.email.paragraphs.filter(Boolean).map((p, j) => (
                          <p key={j} className="text-[13px] leading-relaxed whitespace-pre-wrap text-body">
                            {p}
                          </p>
                        ))}
                        {l.email.cta ? <span className="self-start rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] font-medium text-paper">{l.email.cta}</span> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )
        ) : null}
      </div>
    </Drawer>
  );
}

// History ---------------------------------------------------------------------------------------------------------

type Run = { id: string; version: number; status: "active" | "waiting" | "done" | "exited" | "failed"; exit_reason: string | null; error: string | null; started_at: string; ended_at: string | null; next_at: string; contacts: { email: string | null; first_name: string | null; last_name: string | null } | null };
type Done = { run_id: string; step_id: string; visit: number; status: string; result: Record<string, unknown> | null; at: string };
type Filter = "all" | "active" | "done" | "exited" | "failed";

const RUN: Record<Run["status"], [string, Tone]> = { active: ["Active", "sky"], waiting: ["Waiting", "sky"], done: ["Done", "gray"], exited: ["Exited", "amber"], failed: ["Failed", "red"] };

export function HistoryDrawer({ sb, id, versions, live, names, onClose }: { sb: SupabaseClient; id: string; versions: Version[]; live: Body | null; names: WordNames; onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const runs = useQuery(`workflow_runs:${id}:${filter}:${tick}`, async () => {
    let q = sb.from("workflow_runs").select("id, version, status, exit_reason, error, started_at, ended_at, next_at, contacts(email, first_name, last_name)").eq("workflow_id", id).order("started_at", { ascending: false }).limit(100);
    if (filter === "active") q = q.in("status", ["active", "waiting"]);
    else if (filter !== "all") q = q.eq("status", filter);
    return (must(await q) ?? []) as unknown as Run[];
  });
  // Opening a run again shows its steps at once.
  const steps = useQuery(`workflow_runs:${id}:steps:${open}:${tick}`, async () => (open ? ((must(await sb.from("workflow_steps_done").select("run_id, step_id, visit, status, result, at").eq("run_id", open).order("at")) ?? []) as Done[]) : []));
  const bodies = useMemo(() => new Map(versions.map((v) => [v.version, cleanBody(v.body)])), [versions]);

  const retry = async (run: string) => {
    if (!(await askConfirm("Try the failed step again?", { ok: "Try again" }))) return;
    const { error: e } = await sb.rpc("workflow_retry", { p_run: run });
    if (e) setError(e.message);
    else setTick((t) => t + 1);
  };

  return (
    <Drawer title="History" onClose={onClose} wide>
      <div className="border-b border-line px-5 pt-2">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "done", label: "Done" },
            { value: "exited", label: "Exited" },
            { value: "failed", label: "Failed" },
          ]}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <ErrorNote message={error || runs.error} />
        {!runs.data ? null : !runs.data.length ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted">No runs</p>
        ) : (
          <ul className="flex flex-col">
            {runs.data.map((r) => {
              const who = [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" ") || r.contacts?.email || "Deleted contact";
              const body = bodies.get(r.version) ?? live;
              return (
                <li key={r.id} className="flex flex-col">
                  <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-hover">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">{who}</span>
                      <span className="text-[12px] text-muted">
                        {timeAgo(r.started_at)}, v{r.version}
                        {r.exit_reason ? `, ${r.exit_reason}` : ""}
                      </span>
                    </span>
                    <Badge tone={RUN[r.status][1]} dot>
                      {RUN[r.status][0]}
                    </Badge>
                  </button>
                  {open === r.id ? (
                    <div className="anim-rise-sm mx-3 mb-2 flex flex-col gap-1.5 rounded-lg bg-paper px-3 py-2.5">
                      {(steps.data ?? []).map((d) => {
                        const s = body ? (find(body.steps, d.step_id)?.step ?? null) : null;
                        return (
                          <div key={`${d.step_id}-${d.visit}`} className="flex gap-3 text-[12.5px]">
                            <span className="w-16 shrink-0 text-faint tabular-nums">{new Date(d.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                            <span className={d.status === "failed" ? "text-rose" : "text-body"}>{d.status === "running" ? `${s ? stepWords(s, names) : "A step"}: working on it` : resultWords(s, d.status, d.result, names)}</span>
                          </div>
                        );
                      })}
                      {r.status === "waiting" ? <span className="text-[12.5px] text-muted">Next {timeAgo(r.next_at).replace(" ago", "")}</span> : null}
                      {r.error ? <span className="text-[12.5px] text-rose">{r.error}</span> : null}
                      {r.status === "failed" ? (
                        <Button variant="ghost" size="sm" className="self-start" onClick={() => void retry(r.id)}>
                          Try again
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

// Versions --------------------------------------------------------------------------------------------------------

export function VersionsDrawer({ versions, live, people, onOpen, onCopy, onClose }: { versions: Version[]; live: number | null; people: Record<string, string>; onOpen: (v: Version) => void; onCopy: (v: Version) => void; onClose: () => void }) {
  return (
    <Drawer title="Versions" onClose={onClose}>
      {versions.length ? (
        <ul className="flex-1 overflow-y-auto p-2">
          {versions.map((v) => (
            <li key={v.version} className="group flex items-start gap-2 rounded-lg px-3 py-2.5 hover:bg-hover">
              <button type="button" onClick={() => onOpen(v)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink tabular-nums">v{v.version}</span>
                  {live === v.version ? (
                    <Badge tone="green" dot>
                      Live
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-[12px] text-muted" title={new Date(v.published_at).toLocaleString()}>
                    {timeAgo(v.published_at)}
                  </span>
                </span>
                <span className="truncate text-[12.5px] text-muted">{(v.published_by && people[v.published_by]) || "A teammate"}</span>
                {v.note ? <span className="text-[12.5px] text-body">{v.note}</span> : null}
              </button>
              <Button variant="ghost" size="sm" onClick={() => onCopy(v)}>
                Copy to draft
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-6 text-center text-[13px] text-muted">No versions yet</p>
      )}
    </Drawer>
  );
}

// Make live -------------------------------------------------------------------------------------------------------

export function PublishDialog({ session, id, live, draft, names, next, onDone, onClose }: { session: Session; id: string; live: Body | null; draft: Body; names: WordNames; next: number; onDone: (v: number) => void; onClose: () => void }) {
  const changes = useMemo(() => diffWords(live, draft, names), [live, draft, names]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ version: number }>(session, "/api/workflows/publish", { workflowId: id, note: note.trim() || null });
      onDone(r.version);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Make v${next} live`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void go()} disabled={busy}>
            Make live
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {changes.map((c, i) => (
            <li key={i} className="text-[13px] leading-5 text-ink">
              {c}
            </li>
          ))}
        </ul>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={300} className="h-10" aria-label="Note" />
        <ErrorNote message={error} />
      </div>
    </Modal>
  );
}
