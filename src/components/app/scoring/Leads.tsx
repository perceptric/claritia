"use client";

// Scoring › Leads (docs/scoring-plan.md Part 2.2): every scored lead with its grade or score, fit and activity, and
// status, and the Why panel: each rule that added or took away points, kept with the score when the worker wrote it.

import { useState } from "react";
import { Search } from "../../Icons";
import { Badge, ErrorNote, Loading, must, timeAgo, useLoad, type ViewProps } from "../ui";
import { BAND } from "./api";

type Reasons = { fit: number; act: number; removed?: string; hits: { g: string; w: string; p: number; n?: number; at?: string; cap?: boolean }[] };
type Row = { id: string; first_name: string | null; last_name: string | null; email: string | null; title: string | null; score: number | null; score_band: keyof typeof BAND | null; score_grade: string | null; fit_score: number | null; engagement_score: number | null; score_reasons: Reasons | null; scored_at: string | null; company: { name: string | null } | null };
type Filter = "all" | keyof typeof BAND;

export function Leads({ sb, ws, navigate }: Pick<ViewProps, "sb" | "ws" | "navigate">) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useLoad(async () => {
    let q = sb.from("contacts").select("id, first_name, last_name, email, title, score, score_band, score_grade, fit_score, engagement_score, score_reasons, scored_at, company:companies(name)").eq("workspace_id", ws.id).is("deleted_at", null).not("score_model", "is", null);
    if (filter !== "all") q = q.eq("score_band", filter);
    if (query.trim()) {
      const s = query.trim().replace(/[%,()]/g, " ");
      q = q.or(`first_name.ilike.%${s}%,last_name.ilike.%${s}%,email.ilike.%${s}%`);
    }
    return must(await q.order("score", { ascending: false, nullsFirst: false }).limit(200)) as unknown as Row[];
  }, `${ws.id}:${filter}:${query}`);
  const rows = list.data ?? [];
  const sel = rows.find((r) => r.id === open) ?? rows[0] ?? null;
  const name = (r: Row) => [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed lead";
  const grades = rows.some((r) => r.score_grade);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 md:px-5">
        <label className="flex h-8 w-full items-center gap-1.5 rounded-sm border border-line px-2.5 text-muted focus-within:border-ink sm:w-56">
          <Search size={14} />
          <input aria-label="Search leads" placeholder="Search leads" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
        </label>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Status">
          {(["all", "hot", "warm", "cold", "out"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`h-[30px] rounded-full px-3 text-[12.5px] transition-colors duration-[120ms] ${filter === k ? "bg-ink text-paper" : "text-muted hover:bg-hover hover:text-ink"}`}>
              {k === "all" ? "All" : BAND[k].label}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote message={list.error} />
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-h-0 overflow-auto">
          {!list.data ? (
            <Loading />
          ) : !rows.length ? (
            <div className="flex flex-col items-center gap-1 px-4 py-16 text-center">
              <h3 className="text-[15px] font-semibold text-ink">{filter === "all" && !query ? "No scores yet" : "No leads match"}</h3>
              {filter === "all" && !query ? <p className="text-[13px] text-muted">Scores appear a few minutes after you publish the model.</p> : null}
            </div>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="px-4 py-2.5 font-medium">Lead</th>
                  <th className="px-3 py-2.5 font-medium">{grades ? "Grade" : "Score"}</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Fit</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Activity</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(r.id))} className={`cursor-pointer border-t border-line ${sel?.id === r.id ? "bg-paper-deep" : "hover:bg-hover"}`}>
                    <td className="px-4 py-2.5">
                      <div className="truncate text-ink">{name(r)}</div>
                      <div className="truncate text-[12px] text-muted">{[r.title, r.company?.name].filter(Boolean).join(", ")}</div>
                    </td>
                    <td className="px-3 py-2.5">{grades ? <span className={`rounded-full px-2 py-0.5 font-mono text-[12px] ${r.score_band === "hot" ? "bg-signal-soft text-signal-text" : "bg-paper-deep text-ink"}`}>{r.score_grade ?? "—"}</span> : <span className="font-medium text-ink tabular-nums">{r.score ?? "—"}</span>}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <Meter v={r.fit_score ?? 0} />
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <Meter v={r.engagement_score ?? 0} />
                    </td>
                    <td className="px-3 py-2.5">{r.score_band ? <Badge tone={BAND[r.score_band].tone}>{BAND[r.score_band].label}</Badge> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="min-h-0 overflow-y-auto border-t border-line lg:border-t-0 lg:border-l">{sel ? <Why r={sel} name={name(sel)} open={() => navigate("contacts", sel.id)} /> : null}</aside>
      </div>
    </div>
  );
}

function Meter({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="block h-[5px] w-14 overflow-hidden rounded-full bg-paper-deep">
        <span className="block h-full rounded-full bg-ink" style={{ width: `${v}%` }} />
      </span>
      <span className="text-[12px] text-muted tabular-nums">{v}</span>
    </span>
  );
}

function Why({ r, name, open }: { r: Row; name: string; open: () => void }) {
  const why = r.score_reasons;
  const groups = [...new Set((why?.hits ?? []).map((h) => h.g))];
  return (
    <div className="flex flex-col">
      <div className="flex h-12 items-center border-b border-line px-5">
        <button type="button" onClick={open} className="truncate text-[13px] font-medium text-ink hover:underline">
          {name}
        </button>
      </div>
      <div className="flex flex-col gap-2 border-b border-line px-5 py-4">
        <div className="flex items-end justify-between">
          <span className="text-[40px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">{r.score_grade ?? r.score ?? "—"}</span>
          {r.score_band ? <Badge tone={BAND[r.score_band].tone}>{BAND[r.score_band].label}</Badge> : null}
        </div>
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          Fit
          <Meter v={r.fit_score ?? 0} />
        </div>
        <div className="flex items-center justify-between text-[12.5px] text-muted">
          Activity
          <Meter v={r.engagement_score ?? 0} />
        </div>
        {why?.removed ? <span className="text-[12.5px] text-muted">Removed by: {why.removed}</span> : null}
        {r.scored_at ? <span className="text-[12px] text-faint">Scored {timeAgo(r.scored_at)}</span> : null}
      </div>
      <div className="flex flex-col px-5 py-4">
        <span className="text-[12px] text-muted">Why</span>
        {groups.length ? (
          groups.map((g) => (
            <div key={g} className="flex flex-col">
              <div className="flex justify-between pt-3 text-[12px] font-semibold text-ink">
                {g}
                {why!.hits.some((h) => h.g === g && h.cap) ? <span className="font-normal text-muted">Group max reached</span> : null}
              </div>
              <ul>
                {why!.hits.filter((h) => h.g === g).map((h, i) => (
                  <li key={i} className="flex items-baseline gap-2.5 border-b border-line py-1.5 text-[13px] text-ink">
                    <span className="min-w-0 flex-1">
                      {h.w}
                      {h.at ? <span className="text-[12px] text-muted"> {h.n ? `${h.n} times, last ` : ""}{timeAgo(h.at)}</span> : null}
                    </span>
                    <span className={`font-mono text-[12px] tabular-nums ${h.p < 0 ? "text-rose" : "text-ink"}`}>{h.p > 0 ? `+${h.p}` : h.p === 0 ? "Remove" : h.p}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <span className="pt-2 text-[13px] text-muted">No rules matched.</span>
        )}
      </div>
    </div>
  );
}
