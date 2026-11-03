"use client";

// The email builder's version menu (docs/design-system.md Part 7.2): every AI change, and the email before the AI's
// first one, to bring back. Bringing one back is an undoable change like any other.

import type { SupabaseClient } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import { readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import { History } from "../../Icons";
import { AiTag } from "../Ai";
import { IconButton, timeAgo, useQuery } from "../ui";
import { Popover } from "../forms/controls";

type Version = { id: string; doc: unknown; note: string; by_ai: boolean; created_at: string };

export function Versions({ sb, workspaceId, versionRef, onRestore }: { sb: SupabaseClient; workspaceId: string; versionRef: string; onRestore: (doc: EmailDoc) => void }) {
  const btn = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  // Read when opened; opened again within seconds, it shows at once.
  const versions = useQuery(
    open ? `email_versions:${workspaceId}:${versionRef}` : null,
    async () => ((await sb.from("email_versions").select("id, doc, note, by_ai, created_at").eq("workspace_id", workspaceId).eq("ref", versionRef).order("created_at", { ascending: false }).limit(50)).data ?? []) as Version[],
    { staleMs: 5_000 },
  );
  const list = versions.data ?? [];
  return (
    <>
      <span ref={btn}>
        <IconButton label="Versions" onClick={() => setOpen((o) => !o)}>
          <History size={14} />
        </IconButton>
      </span>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label="Versions" width={280}>
        {list.length ? (
          <ul className="flex max-h-[320px] flex-col overflow-y-auto py-1">
            {list.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    onRestore(readEmailDoc(v.doc, { allowHtml: true }));
                    setOpen(false);
                  }}
                  className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-hover"
                >
                  <span className="flex items-center gap-1.5 text-[12.5px] text-ink">
                    {v.by_ai ? <AiTag /> : null}
                    <span className="truncate">{v.note || "Version"}</span>
                  </span>
                  <span className="text-[11.5px] text-muted">{timeAgo(v.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-[12.5px] text-muted">No versions yet</p>
        )}
      </Popover>
    </>
  );
}
