"use client";

// An email's versions on the canvas (docs/email-canvas-b5.md section 4): a small pill beside its name says Latest, or
// the time of the version showing. It opens the versions, newest first: Tia's changes tagged, Restores and saved
// points for hand edits. Hovering one shows it on the artboard; picking one keeps it showing until Restore or Back
// to latest.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { History } from "../../../Icons";
import { AiTag } from "../../Ai";
import { Popover } from "../../FilterBar";
import { timeAgo, useQuery } from "../../ui";

export type Version = { id: string; doc: unknown; subject: string; note: string; by_ai: boolean; created_at: string };

export const versionTime = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });

export function VersionPill({ sb, ws, email, viewing, onHover, onPick }: { sb: SupabaseClient; ws: string; email: string; viewing: Version | null; onHover: (v: Version | null) => void; onPick: (v: Version) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const list = useQuery(anchor ? `email_versions:${ws}:em:${email}` : null, async () => ((await sb.from("email_versions").select("id, doc, subject, note, by_ai, created_at").eq("workspace_id", ws).eq("ref", `em:${email}`).order("created_at", { ascending: false }).limit(50)).data ?? []) as Version[], { staleMs: 3000 });
  return (
    <>
      <button
        type="button"
        data-canvas-ui=""
        data-version-pill=""
        aria-label="Versions"
        aria-haspopup="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`pointer-events-auto inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11.5px] font-medium transition-colors duration-[140ms] ${viewing ? "bg-signal-pale text-signal-text" : "bg-paper-deep text-muted hover:text-ink"}`}
      >
        <History size={11} />
        {viewing ? versionTime(viewing.created_at) : "Latest"}
      </button>
      {anchor ? (
        <Popover
          anchor={anchor}
          onClose={() => {
            setAnchor(null);
            onHover(null);
          }}
          width={280}
        >
          <div role="menu" data-canvas-ui="" aria-label="Versions" className="flex flex-col p-1" onPointerLeave={() => onHover(null)}>
            {list.data && !list.data.length ? <p className="px-2.5 py-3 text-[12.5px] text-muted">No versions yet</p> : null}
            {(list.data ?? []).map((v) => (
              <button
                key={v.id}
                type="button"
                role="menuitem"
                onPointerEnter={() => onHover(v)}
                onClick={() => {
                  setAnchor(null);
                  onPick(v);
                }}
                className={`flex min-h-10 flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left hover:bg-hover ${viewing?.id === v.id ? "bg-signal-pale" : ""}`}
              >
                <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink">
                  {versionTime(v.created_at)} <span className="font-normal text-faint">{timeAgo(v.created_at)}</span>
                  {v.by_ai ? <AiTag /> : null}
                </span>
                <span className="text-[12px] break-words text-muted">{v.note || (v.by_ai ? "Tia" : "Edited")}</span>
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
