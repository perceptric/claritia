"use client";

// The groups on Emails (docs/email-canvas-b1.md section 10): Ungrouped first, always there, then each group, as a
// card with a small fanned stack of its first emails, its name, how many emails it holds and when it was last edited.
// Then each automation with emails, tagged Automation (docs/email-unify-plan.md, E3); an automation whose emails have
// no copies yet (not opened since copies came) gets them here. The System emails (docs/system-emails.md) come right
// after Ungrouped, tagged System; a workspace without them gets them here. A card opens its canvas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { Badge, must, timeAgo, useQuery } from "../../ui";
import { cleanBody } from "@/lib/workflows/check";
import { emailSteps, ensurePayload, type EmailCopy } from "@/lib/workflows/stepEmails";
import { flowKeys } from "@/lib/workflows/meetingFlows";
import { ensureMeetingSetup } from "../../workflows/meetingSetup";
import { previewHtml, type CanvasKit } from "./preview";

type Mini = { id: string; status: string; doc: unknown; html: string; updated_at: string; updated_by?: string | null; system_key?: string | null };
type Card = { id: string; name: string; count: number; edited: string | null; by: string | null; minis: Mini[]; auto?: boolean; system?: boolean };
export type GroupShow = "all" | "campaigns" | "automations";
const n = (x: number) => x.toLocaleString("en-US");

export function GroupCards({ sb, ws, me, onOpen, show = "all" }: { sb: SupabaseClient; ws: string; me: string; onOpen: (id: string) => void; show?: GroupShow }) {
  const kits = useQuery(`email_canvas_kits:${ws}`, async () => (must(await sb.from("brand_kits").select("id, tokens, logo_url, design").eq("workspace_id", ws).order("created_at")) ?? []) as CanvasKit[]);
  const cards = useQuery(`email_groups:${ws}`, async () => {
    // The meeting emails and their workflows, made the first time (docs/workflows-plan.md, Part A).
    await ensureMeetingSetup(sb, ws);
    const cols = "id, status, doc, html, updated_at, updated_by";
    const [groups, loose, looseCount, flows, system] = await Promise.all([
      sb.from("email_groups").select(`id, name, created_at, emails(${cols}, group_position)`).eq("workspace_id", ws).order("created_at"),
      sb.from("emails").select(cols).eq("workspace_id", ws).eq("kind", "broadcast").is("group_id", null).neq("status", "archived").order("updated_at", { ascending: false }).limit(3),
      sb.from("emails").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "broadcast").is("group_id", null).neq("status", "archived"),
      sb.from("workflows").select(`*, emails!emails_workflow_id_fkey(${cols}, group_position, step_id)`).eq("workspace_id", ws).order("created_at"),
      sb.from("emails").select(`${cols}, group_position, system_key`).eq("workspace_id", ws).eq("kind", "system").order("group_position"),
    ]);
    const gs = (must(groups) ?? []) as { id: string; name: string; created_at: string; emails: (Mini & { group_position: number })[] }[];
    const ls = (must(loose) ?? []) as Mini[];
    const latest = (ms: Mini[], fallback: string | null) => ms.reduce<string | null>((a, m) => (!a || m.updated_at > a ? m.updated_at : a), fallback);
    // Who saved the most recently edited email (migration 160).
    const by = (ms: Mini[]) => [...ms].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]?.updated_by ?? null;
    const out: Card[] = [{ id: "ungrouped", name: "Ungrouped", count: looseCount.count ?? ls.length, edited: latest(ls, null), by: by(ls), minis: ls }];
    // The System emails: each meeting workflow's card shows the ones it sends.
    const sys = (system.error ? [] : (system.data ?? [])) as (Mini & { system_key: string })[];
    for (const g of gs) {
      const sorted = [...g.emails].sort((a, b) => a.group_position - b.group_position);
      out.push({ id: g.id, name: g.name, count: g.emails.length, edited: latest(g.emails, g.created_at), by: by(g.emails), minis: sorted.slice(0, 3) });
    }
    // Automations: their emails' copies, made now for any email step without one. A copy that can't be made leaves
    // that automation's card out until next time; it never stops the page.
    const fs = (flows.error ? [] : (flows.data ?? [])) as { id: string; name: string; created_at: string; draft: unknown; meeting_kind?: string | null; emails: (Mini & { group_position: number; step_id: string })[] }[];
    for (const f of fs) {
      const body = cleanBody(f.draft);
      const keys = f.meeting_kind ? flowKeys(body) : [];
      let ms: (Mini & { step_id?: string })[] = [...sys.filter((m) => keys.includes(m.system_key as never)), ...[...(f.emails ?? [])].sort((a, b) => a.group_position - b.group_position)];
      const need = emailSteps(body).map((s) => s.id);
      if (need.some((id) => !ms.some((m) => m.step_id === id))) {
        const r = await sb.rpc("workflow_email_ensure", { p_ws: ws, p_wf: f.id, p_steps: ensurePayload(body) });
        if (r.error) continue;
        ms = [...ms.filter((m) => m.system_key), ...((r.data ?? []) as EmailCopy[]).map((c, i) => ({ id: c.id, status: "draft", doc: c.doc, html: "", updated_at: (c as EmailCopy & { updated_at?: string }).updated_at ?? f.created_at, updated_by: null, group_position: i, step_id: c.step }))];
      }
      if (ms.length) out.push({ id: `wf:${f.id}`, name: f.name, count: ms.length, edited: latest(ms, f.created_at), by: by(ms), minis: ms.slice(0, 3), auto: true });
    }
    return out;
  });
  if (!cards.data) return null;
  return (
    <ul aria-label="Groups" className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
      {cards.data.filter((c) => show === "all" || (show === "automations" ? c.auto || c.system : !c.auto && !c.system)).map((c) => (
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
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="min-w-0 font-medium break-words text-ink">{c.name}</span>
                {c.auto ? <Badge tone="violet">Automation</Badge> : c.system ? <Badge tone="sky">System</Badge> : null}
              </span>
              <span className="text-[12.5px] text-muted">
                {n(c.count)} {c.count === 1 ? "email" : "emails"}
                {c.edited ? `, edited ${timeAgo(c.edited)}${c.by ? (c.by === me ? " by you" : " by a teammate") : ""}` : ""}
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
