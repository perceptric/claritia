"use client";

// The groups on Campaigns (docs/email-canvas-b1.md section 10): Ungrouped first, always there, then each group, as a
// card with a small fanned stack of its first emails, its name, how many emails it holds and when it was last edited.
// A card opens its canvas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { must, timeAgo, useQuery } from "../../ui";
import { previewHtml, type CanvasKit } from "./preview";

type Mini = { id: string; status: string; doc: unknown; html: string; updated_at: string };
type Card = { id: string; name: string; count: number; edited: string | null; minis: Mini[] };
const n = (x: number) => x.toLocaleString("en-US");

export function GroupCards({ sb, ws, onOpen }: { sb: SupabaseClient; ws: string; onOpen: (id: string) => void }) {
  const kits = useQuery(`email_canvas_kits:${ws}`, async () => (must(await sb.from("brand_kits").select("id, tokens, logo_url, design").eq("workspace_id", ws).order("created_at")) ?? []) as CanvasKit[]);
  const cards = useQuery(`email_groups:${ws}`, async () => {
    const cols = "id, status, doc, html, updated_at";
    const [groups, loose, looseCount] = await Promise.all([
      sb.from("email_groups").select(`id, name, created_at, emails(${cols}, group_position)`).eq("workspace_id", ws).order("created_at"),
      sb.from("emails").select(cols).eq("workspace_id", ws).eq("kind", "broadcast").is("group_id", null).neq("status", "archived").order("updated_at", { ascending: false }).limit(3),
      sb.from("emails").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "broadcast").is("group_id", null).neq("status", "archived"),
    ]);
    const gs = (must(groups) ?? []) as { id: string; name: string; created_at: string; emails: (Mini & { group_position: number })[] }[];
    const ls = (must(loose) ?? []) as Mini[];
    const latest = (ms: Mini[], fallback: string | null) => ms.reduce<string | null>((a, m) => (!a || m.updated_at > a ? m.updated_at : a), fallback);
    const out: Card[] = [{ id: "ungrouped", name: "Ungrouped", count: looseCount.count ?? ls.length, edited: latest(ls, null), minis: ls }];
    for (const g of gs) {
      const sorted = [...g.emails].sort((a, b) => a.group_position - b.group_position);
      out.push({ id: g.id, name: g.name, count: g.emails.length, edited: latest(g.emails, g.created_at), minis: sorted.slice(0, 3) });
    }
    return out;
  });
  if (!cards.data) return null;
  return (
    <ul aria-label="Groups" className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {cards.data.map((c) => (
        <li key={c.id}>
          <a
            href={`/emails/campaigns/group/${c.id}`}
            onClick={(e) => {
              e.preventDefault();
              onOpen(c.id);
            }}
            className="group flex h-full flex-col gap-2.5 rounded-xl bg-card p-3 shadow-rest transition-[box-shadow,transform] duration-[150ms] ease-out hover:-translate-y-0.5 hover:shadow-hover motion-reduce:transform-none"
          >
            <Stack minis={c.minis} kits={kits.data ?? []} />
            <span className="flex flex-col gap-0.5 px-0.5">
              <span className="font-medium break-words text-ink">{c.name}</span>
              <span className="text-[12.5px] text-muted">
                {n(c.count)} {c.count === 1 ? "email" : "emails"}
                {c.edited ? `, edited ${timeAgo(c.edited)}` : ""}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Up to three emails, small and fanned; they spread a little on hover. */
function Stack({ minis, kits }: { minis: Mini[]; kits: CanvasKit[] }) {
  const htmls = useMemo(() => minis.map((m) => previewHtml(m, kits)), [minis, kits]);
  if (!minis.length) return <div className="flex h-[150px] items-center justify-center rounded-lg bg-paper-deep text-[12.5px] text-faint">No emails yet</div>;
  const k = minis.length;
  return (
    <div className="relative h-[150px] overflow-hidden rounded-lg bg-paper-deep">
      {minis.map((m, i) => {
        const turn = k === 1 ? 0 : (i - (k - 1) / 2) * 5;
        return (
          <div
            key={m.id}
            aria-hidden="true"
            className="absolute top-[18px] left-1/2 h-[140px] w-24 overflow-hidden rounded-[4px] bg-white shadow-[0_2px_6px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.05)] transition-transform duration-[220ms] ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-50%) rotate(${turn}deg)`, zIndex: i === Math.floor(k / 2) ? 2 : 1 }}
          >
            {htmls[i] ? <iframe title="" tabIndex={-1} loading="lazy" srcDoc={htmls[i]} sandbox="" className="pointer-events-none absolute top-0 left-0 h-[875px] w-[600px] origin-top-left scale-[0.16] border-0 bg-white" /> : null}
          </div>
        );
      })}
    </div>
  );
}
