"use client";

// One routing run in a side panel (RunPanel), opened from Routing › History and the contact page's "Why?", and the
// "Routed by … Why?" line under a contact's owner (docs/router-ux.md 4.8 and 4.10). The list itself is History.tsx.

import { useState } from "react";
import { explain } from "@/lib/router/explain";
import { askConfirm } from "../Dialogs";
import { PersonAvatar, usePeople, type Person } from "../meetings/parts";
import { Select } from "../Select";
import { Sheet } from "../Sheet";
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, useQuery, type ViewProps } from "../ui";
import { useFormNames } from "../shared";
import { routingApi } from "./api";
import { RunLines, type LinkTo } from "./Lines";
import { ROUTING, useLiveBody } from "./screenParts";
import { decisionOf, factsOf, fromWords, leadOf, routedBy, type RunRow } from "./screensModel";

const COLS = "id, contact_id, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, created_at, undone_at";

/** The names of teammates by id, for runs whose facts don't hold them. */
const namesOf = (people: Person[] | undefined) => Object.fromEntries((people ?? []).map((p) => [p.id, p.name]));

/** The result cell: the owner's avatar and name, or a Held or Unassigned pill. */
export function ResultCell({ row, people }: { row: Pick<RunRow, "kind" | "owner" | "facts">; people?: Map<string, Person> }) {
  if (row.kind === "held") return <Badge tone="amber">Held</Badge>;
  if (row.kind === "unassigned" || !row.owner) return <Badge tone="red">Unassigned</Badge>;
  const p = people?.get(row.owner);
  const name = p?.name ?? row.facts?.reps?.[row.owner]?.name ?? "Former teammate";
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PersonAvatar person={p} label={name} size={22} />
      <span className="truncate text-ink">{name}</span>
    </span>
  );
}

/**
 * Under the Owner field on a contact's page (docs/router-ux.md 4.10): "Routed by US mid-market · Why?", with Why?
 * opening the contact's latest run. Nothing when the contact was never routed.
 */
export function RoutedBy({ sb, session, ws, role, navigate, contact }: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { contact: string }) {
  const latest = useQuery(
    `router_runs:${ws.id}:contact:${contact}`,
    async () => must(await sb.from("router_runs").select(COLS).eq("workspace_id", ws.id).eq("contact_id", contact).order("created_at", { ascending: false }).limit(1).maybeSingle()) as unknown as RunRow | null,
  );
  const sla = useQuery(`router_slas:${ws.id}:contact:${contact}`, async () => {
    const row = must(await sb.from("router_slas").select("run_id, user_id, status, due_at").eq("workspace_id", ws.id).eq("contact_id", contact).order("started_at", { ascending: false }).limit(1).maybeSingle()) as unknown as SlaRow | null;
    if (!row) return null;
    const due = new Date(row.due_at);
    return { ...row, words: dueWords(due), soon: due.getTime() - Date.now() < 15 * 60_000 };
  });
  const [open, setOpen] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState("");
  const r = latest.data;
  if (!r) return null;
  const t = sla.data;
  // Mark contacted: the reply-by pill goes at once; it comes back with the error if the write fails.
  const mark = async () => {
    setMarking(true);
    setMarkError("");
    try {
      await sla.mutate((s) => (s ? { ...s, status: "met" as const } : s), () => routingApi(session, ws.id, "contacted", { contact }));
      invalidate(`router_slas:${ws.id}`);
      invalidate("app_counts");
    } catch (e) {
      setMarkError(errorText(e));
    } finally {
      setMarking(false);
    }
  };
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 px-2 text-[12px] text-faint">
      <span className="truncate">{routedBy(r)}</span>
      <button type="button" onClick={() => setOpen(r.id)} className="shrink-0 font-medium text-muted underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
        Why?
      </button>
      {t?.status === "open" ? (
        <span className="flex basis-full items-center gap-2 pt-1">
          <Badge tone={t.soon ? "amber" : "gray"}>Reply by {t.words}</Badge>
          <Button size="sm" variant="plain" disabled={marking} onClick={() => void mark()}>
            Mark contacted
          </Button>
        </span>
      ) : t?.status === "missed" ? (
        <span className="basis-full pt-1">
          <Badge tone="red">Response time missed</Badge>
        </span>
      ) : null}
      {markError ? <span className="basis-full text-rose">{markError}</span> : null}
      {open ? (
        <RunPanel
          sb={sb}
          session={session}
          ws={ws}
          role={role}
          navigate={navigate}
          runId={open}
          onClose={() => setOpen(null)}
          onRouted={() => {
            latest.reload();
            invalidateRouted(ws.id);
          }}
        />
      ) : null}
    </span>
  );
}

type SlaRow = { run_id: string; user_id: string; status: "open" | "met" | "missed" | "closed"; due_at: string };

/** "3:40 PM" today, "Tue 3:40 PM" later. */
function dueWords(d: Date): string {
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/**
 * One run in a side panel: who the lead is, where it came from, the sentences with names as links, the owner, and
 * Open contact, Route again and Test draft.
 */
export function RunPanel({ sb, session, ws, role, navigate, runId, onClose, onRouted }: Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate"> & { runId: string; onClose: () => void; onRouted?: (run: string) => void }) {
  const [id, setId] = useState(runId);
  const [was, setWas] = useState(runId);
  if (runId !== was) {
    setWas(runId);
    setId(runId);
  }
  const people = usePeople(sb, ws.id);
  const live = useLiveBody(sb, ws.id);
  const forms = useFormNames(sb, ws.id);
  const run = useQuery(`router_run:${ws.id}:${id}`, async () => {
    const r = must(await sb.from("router_runs").select(COLS).eq("workspace_id", ws.id).eq("id", id).maybeSingle()) as unknown as RunRow | null;
    if (!r) throw new Error("This run is gone.");
    return { r };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const r = run.data?.r;
  const names = namesOf(people.data?.list);
  const lines = r ? explain(decisionOf(r), factsOf(r, names), { territories: live.data?.body.territories }) : [];
  const lead = r ? leadOf(r) : null;
  const onLink: LinkTo = (p) => {
    if (p.kind === "user") navigate(ROUTING, "teams");
    else if (p.kind === "company") navigate("companies", p.id);
    else navigate(ROUTING, "");
  };

  const again = async () => {
    if (!r?.contact_id || !(await askConfirm(`Route ${lead?.name ?? "this lead"} again?`, { ok: "Route again" }))) return;
    setBusy(true);
    setError("");
    try {
      const out = await routingApi<{ routed?: number; run?: string; status?: string }>(session, ws.id, "route", { contacts: [r.contact_id] });
      if (out.run) {
        setId(out.run);
        invalidateRouted(ws.id);
        onRouted?.(out.run);
      } else if (out.status) setError(out.status === "gone" ? "This contact is gone." : "Couldn't route it. Try again.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // Give the lead to another rep; with a meeting coming up, ask once whether it moves too (docs/scheduling-plan.md 12.6).
  const giveTo = async (user: string) => {
    if (!r?.contact_id) return;
    setBusy(true);
    setError("");
    try {
      const soon = await sb.from("meetings").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("contact_id", r.contact_id).eq("status", "booked").gt("start_at", new Date().toISOString());
      const moveMeetings = (soon.count ?? 0) > 0 && (await askConfirm("Move their upcoming meeting too?", { ok: "Move it" }));
      const out = await routingApi<{ moved?: number; kept?: number }>(session, ws.id, "held", { op: "assign", contacts: [r.contact_id], user, moveMeetings });
      const name = people.data?.byId.get(user)?.name ?? "them";
      if (moveMeetings && out.kept) setError(`${name} isn't free at that time. The meeting stays where it is.`);
      invalidateRouted(ws.id);
      run.reload();
      onRouted?.(id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={lead ? [lead.name, lead.company].filter(Boolean).join(" · ") : "Run"}
      onClose={onClose}
      footer={
        r?.contact_id ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("contacts", r.contact_id!)}>
              Open contact
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(ROUTING, "", `test=${r.contact_id}`)}>
              Test draft
            </Button>
            {role === "owner" ? (
              <Select<string>
                value=""
                options={(people.data?.list ?? []).map((p) => ({ value: p.id, label: p.name }))}
                onChange={(u) => void giveTo(u)}
                ariaLabel="Give to"
                placeholder="Give to"
                plainPlaceholder
                disabled={busy}
                className="h-8 rounded-full border border-line px-3 text-[12.5px]"
              />
            ) : null}
            <Button size="sm" onClick={again} disabled={busy}>
              {busy ? "Routing…" : "Route again"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-5" aria-live="polite">
        <ErrorNote message={error || run.error || people.error} />
        {!r ? (
          run.error ? null : <Loading />
        ) : (
          <>
            <p className="text-[12.5px] text-muted">
              {[fromWords(r, forms.data ?? undefined), new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), r.version ? `v${r.version}` : null, r.ms != null ? `${r.ms} ms` : null]
                .filter(Boolean)
                .join(" · ")}
              {r.undone_at ? (
                <span className="ml-2 align-middle">
                  <Badge>Taken back</Badge>
                </span>
              ) : null}
            </p>
            <RunLines lines={lines} onLink={onLink} />
            <div className="flex items-center gap-3 border-t border-line pt-4 text-[13px]">
              <span className="w-16 text-muted">Owner</span>
              <ResultCell row={r} people={people.data?.byId} />
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** After a lead is routed or given to someone: the log, Held, the contact's run and the sidebar count. */
export function invalidateRouted(ws: string) {
  invalidate(`router_runs:${ws}`);
  invalidate(`routing_held:${ws}`);
  invalidate(`router_slas:${ws}`);
  invalidate("app_counts");
}
