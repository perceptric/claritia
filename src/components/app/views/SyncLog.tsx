"use client";

// The sync log: every change a source brought in or sent out, with filters.

import { useState } from "react";
import { entryOf } from "@/lib/sources/catalog";
import { Refresh } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, errorText, Loading, must, Panel, Td, Th, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import { CheckBox } from "../records/RecordTable";

// Sync log ---------------------------------------------------------------------------------------------------

type LogRow = { id: number; source_id: string; direction: string; object: string; local_id: string | null; external_id: string | null; action: string; fields: string[]; error: string | null; retried_at: string | null; at: string };

const ACTION: Record<string, [string, Tone]> = { create: ["Created", "green"], update: ["Updated", "brand"], delete: ["Deleted", "gray"], suppress: ["Unsubscribed", "amber"], error: ["Error", "red"] };

export function SyncLog({ sb, ws, navigate }: Pick<ViewProps, "sb" | "ws" | "navigate">) {
  const [source, setSource] = useState("");
  const [direction, setDirection] = useState("");
  const [action, setAction] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const sources = useLoad(async () => must(await sb.from("sources").select("id, kind, name").eq("workspace_id", ws.id).order("created_at")) as { id: string; kind: string; name: string }[], ws.id);
  const rows = useLoad(async () => {
    let q = sb.from("sync_log").select("id, source_id, direction, object, local_id, external_id, action, fields, error, retried_at, at").eq("workspace_id", ws.id).order("id", { ascending: false }).limit(300);
    if (source) q = q.eq("source_id", source);
    if (direction) q = q.eq("direction", direction);
    if (action) q = q.eq("action", action);
    return must(await q) as LogRow[];
  }, `${ws.id}:${source}:${direction}:${action}`);
  const byId = new Map((sources.data ?? []).map((s) => [s.id, s]));
  const retry = async () => {
    setError("");
    try {
      must(await sb.rpc("sync_retry", { p_ids: [...picked] }));
      setPicked(new Set());
      rows.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-48" value={source} onChange={setSource} options={[{ value: "", label: "All sources" }, ...(sources.data ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        <Select className="w-36" value={direction} onChange={setDirection} options={[{ value: "", label: "In and out" }, { value: "in", label: "In" }, { value: "out", label: "Out" }]} />
        <Select className="w-40" value={action} onChange={setAction} options={[{ value: "", label: "Every change" }, ...Object.entries(ACTION).map(([value, [label]]) => ({ value, label }))]} />
        {picked.size ? (
          <Button className="ml-auto" onClick={retry}>
            <Refresh size={14} />
            Retry {picked.size}
          </Button>
        ) : null}
      </div>
      <Panel>
        {!rows.data ? (
          <Loading />
        ) : !rows.data.length ? (
          <p className="px-4 py-3 text-[13px] text-faint">—</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>{""}</Th>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Change</Th>
                  <Th>Fields</Th>
                  <Th>Record</Th>
                </tr>
              </thead>
              <tbody>
                {rows.data.map((r) => {
                  const s = byId.get(r.source_id);
                  const [label, tone] = ACTION[r.action] ?? [r.action, "gray" as Tone];
                  const canRetry = r.action === "error" && r.direction === "out" && !r.retried_at;
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <Td className="w-8">
                        {canRetry ? (
                          <CheckBox
                            label="Pick"
                            on={picked.has(r.id)}
                            onClick={() => {
                              const n = new Set(picked);
                              if (n.has(r.id)) n.delete(r.id);
                              else n.add(r.id);
                              setPicked(n);
                            }}
                          />
                        ) : null}
                      </Td>
                      <Td className="whitespace-nowrap text-faint">{timeAgo(r.at)}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <BrandLogo domain={entryOf(s?.kind ?? "")?.domain ?? ""} name={s?.name ?? "?"} size={16} />
                          {s?.name ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Badge tone={r.direction === "out" ? "violet" : "brand"}>{r.direction === "out" ? "Out" : "In"}</Badge>
                          <Badge tone={tone}>{label}</Badge>
                          {r.error ? <span className="max-w-[260px] truncate text-[12px] text-red-600">{r.error}</span> : null}
                        </span>
                      </Td>
                      <Td className="max-w-[260px] truncate font-mono text-[11px] text-muted">{r.fields.join(", ") || "—"}</Td>
                      <Td>
                        {r.local_id && r.object === "contact" ? (
                          <button type="button" className="text-[12px] underline-offset-2 hover:underline" onClick={() => navigate("contacts", r.local_id!)}>
                            Open
                          </button>
                        ) : (
                          <span className="font-mono text-[11px] text-faint">{r.external_id ?? "—"}</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
