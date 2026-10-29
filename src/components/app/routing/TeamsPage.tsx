"use client";

// Routing › Teams (docs/router-ux-v2.md Part 4 and Part 11): the teams that share leads, as cards with their reps'
// faces, how they share, who's next in line and "Deal 20 leads" (made-up leads dealt to the faces like cards, so the
// way a team shares shows in two seconds). Below, every rep: status, limits, who covers for them (today's Reps).
// Changing how a team shares saves to the draft; it goes live with Make live on Rules.

import { useEffect, useMemo, useState } from "react";
import { dealPreview } from "@/lib/router/deal";
import { METHODS, type Method, type Queue } from "@/lib/router/types";
import { Shuffle, Plus } from "../../Icons";
import { Badge, Button, ErrorNote, Loading, must, Page, Segmented, useLoad, type ViewProps } from "../ui";
import { PersonAvatar, usePeople } from "../meetings/parts";
import { reducedMotion } from "./parts";
import { RepsTab } from "./Reps";
import { useRouterData } from "./useRouterData";

const SHARE: Record<Method, string> = { rr: "Everyone ends up with the same number", weighted: "Some reps get a bigger share", load: "The rep with the fewest meetings goes first" };

export function TeamsPage(props: ViewProps) {
  const { sb, session, ws, role, navigate } = props;
  const r = useRouterData(session, ws.id);
  const people = usePeople(sb, ws.id);
  const turns = useLoad(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const rows = (must(await sb.from("router_runs").select("queue_id, owner").eq("workspace_id", ws.id).eq("kind", "owner").is("undone_at", null).not("queue_id", "is", null).gte("created_at", since).limit(20000)) ?? []) as { queue_id: string; owner: string }[];
    const out = new Map<string, Map<string, number>>();
    for (const x of rows) {
      const m = out.get(x.queue_id) ?? new Map<string, number>();
      m.set(x.owner, (m.get(x.owner) ?? 0) + 1);
      out.set(x.queue_id, m);
    }
    return out;
  }, ws.id);
  const owner = role === "owner";
  const queues = r.body?.queues ?? [];
  return (
    <Page
      title="Team"
      count={queues.length || undefined}
      actions={
        owner ? (
          <Button variant="ghost" onClick={() => navigate("routing", "")}>
            <Plus size={14} />
            New team
          </Button>
        ) : null
      }
      flush
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-5 md:p-7">
        <ErrorNote message={r.error} />
        {r.data?.draft && r.data.live ? (
          <div className="flex items-center gap-3 rounded-2xl border border-butter/40 bg-butter-wash/50 px-4 py-2.5 text-[13px]">
            <span className="size-2 rounded-full bg-butter" />
            <span className="flex-1 text-ink">You have changes that aren&apos;t live.</span>
            <Button size="sm" onClick={() => navigate("routing", "")}>
              Review and make live
            </Button>
          </div>
        ) : null}
        {!r.data ? (
          <Loading />
        ) : !queues.length ? (
          <p className="text-[13.5px] text-muted">No teams yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {queues.map((q, i) => (
              <TeamCard
                key={q.id}
                q={q}
                i={i}
                people={people.data?.byId}
                counts={turns.data?.get(q.id)}
                canEdit={owner}
                saving={r.saving}
                onMethod={(method) => void r.change((b) => ({ ...b, queues: b.queues.map((x) => (x.id === q.id ? { ...x, method } : x)) }))}
              />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-line">
        <RepsTab sb={sb} session={session} ws={ws} role={role} navigate={navigate} sub="" />
      </div>
    </Page>
  );
}

function TeamCard({ q, i, people, counts, canEdit, saving, onMethod }: { q: Queue; i: number; people?: Map<string, import("../meetings/parts").Person>; counts?: Map<string, number>; canEdit: boolean; saving: boolean; onMethod: (m: Method) => void }) {
  const [dealt, setDealt] = useState<string[] | null>(null);
  const [shown, setShown] = useState(0);
  const name = (id: string) => people?.get(id)?.name ?? "Former teammate";
  // Next in line: the fewest leads from this team in 30 days, by the team's share.
  const next = useMemo(() => {
    if (!q.members.length) return null;
    const score = (u: string, w: number) => (counts?.get(u) ?? 0) / (q.method === "weighted" ? Math.max(1, w) : 1);
    return [...q.members].sort((a, b) => score(a.user, a.weight) - score(b.user, b.weight))[0]!.user;
  }, [q, counts]);
  const deal = () => {
    const order = dealPreview(q, 20);
    setDealt(order);
    if (reducedMotion()) setShown(order.length);
    else setShown(0);
  };
  useEffect(() => {
    if (!dealt || shown >= dealt.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 70);
    return () => clearTimeout(t);
  }, [dealt, shown]);
  const piles = new Map<string, number>();
  for (const u of dealt?.slice(0, shown) ?? []) piles.set(u, (piles.get(u) ?? 0) + 1);
  const last = dealt && shown ? dealt[shown - 1] : null;

  return (
    <section className="lift anim-rise-sm flex flex-col gap-4 rounded-2xl border border-line bg-card p-5" style={{ animationDelay: `${i * 60}ms` }}>
      <header className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{q.name}</h2>
          <span className="text-[12.5px] text-muted">{SHARE[q.method]}</span>
        </div>
        {q.strict ? <Badge>Keeps the order</Badge> : null}
        {q.hoursOnly ? <Badge tone="sky">Work hours only</Badge> : null}
      </header>
      <Segmented<Method> label={`How ${q.name} shares leads`} value={q.method} options={METHODS} onChange={(m) => canEdit && !saving && m !== q.method && onMethod(m)} />
      <ul className="flex flex-wrap items-end gap-4">
        {q.members.map((m) => {
          const pile = piles.get(m.user) ?? 0;
          return (
            <li key={m.user} className="flex w-16 flex-col items-center gap-1.5">
              <span className="relative flex h-10 w-8 items-end justify-center" aria-hidden="true">
                {Array.from({ length: Math.min(pile, 8) }).map((_, k) => (
                  <span key={k} className="anim-pop absolute h-5 w-7 rounded-[4px] border border-line bg-paper shadow-soft" style={{ bottom: k * 3, transform: `rotate(${((k * 37) % 9) - 4}deg)` }} />
                ))}
              </span>
              <span className={`relative rounded-full transition-transform duration-[320ms] ease-spring ${last === m.user ? "-translate-y-1" : ""}`}>
                <PersonAvatar person={people?.get(m.user)} label={name(m.user)} size={36} />
                {!dealt && next === m.user ? <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-sage text-[9px] font-semibold text-paper">1</span> : null}
              </span>
              <span className="w-full truncate text-center text-[11.5px] text-body">{name(m.user).split(" ")[0]}</span>
              <span className="text-[11px] text-faint tabular-nums">{dealt ? pile : q.method === "weighted" ? `${m.weight}x` : `${counts?.get(m.user) ?? 0} in 30d`}</span>
            </li>
          );
        })}
      </ul>
      <footer className="flex items-center gap-2 text-[12.5px] text-muted">
        <span className="flex-1">{dealt ? `${Math.min(shown, dealt.length)} of 20 dealt` : next ? `Next in line: ${name(next)}` : "No reps yet"}</span>
        {q.members.length ? (
          <Button variant="ghost" size="sm" onClick={deal}>
            <Shuffle size={13} />
            Deal 20 leads
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
