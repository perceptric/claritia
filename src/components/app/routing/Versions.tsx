"use client";

// Versions (docs/router-ux.md 4.6): a drawer with every published version, and one past version open read-only in the
// same flow view, with Roll back (asks first, then publishes a copy as a new version) and Compare with live.

import { useState } from "react";
import { cleanBody } from "@/lib/router/check";
import type { RouterBody } from "@/lib/router/types";
import { ArrowLeft } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, IconButton, must, timeAgo, useLoad, type Role, type ViewProps } from "../ui";
import { routingApi, type Loaded } from "./api";
import { flowCounts, type Selection } from "./editorModel";
import { Flow, FlowSkeleton } from "./Flow";
import { Inspector } from "./Inspector";
import { CompareDialog } from "./Publish";
import { toast } from "./Toast";
import { Sheet } from "../Sheet";

export function VersionsDrawer({ data, current, onOpen, onClose }: { data: Loaded; current: number | null; onOpen: (n: number) => void; onClose: () => void }) {
  const names = new Map(data.members.map((m) => [m.id, m.name]));
  return (
    <Sheet title="Versions" onClose={onClose}>
      {data.versions.length ? (
        <ul className="p-2">
          {data.versions.map((v) => (
            <li key={v.version}>
              <button
                type="button"
                onClick={() => onOpen(v.version)}
                aria-current={current === v.version ? "true" : undefined}
                className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-hover ${current === v.version ? "bg-hover" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-ink tabular-nums">v{v.version}</span>
                  {data.live?.version === v.version ? (
                    <Badge tone="green" dot>
                      Live
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-[12px] text-muted" title={new Date(v.published_at).toLocaleString()}>
                    {timeAgo(v.published_at)}
                  </span>
                </span>
                <span className="truncate text-[12.5px] text-muted">{(v.published_by && names.get(v.published_by)) || "A teammate"}</span>
                {v.note ? <span className="text-[12.5px] text-body">{v.note}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-[13px] text-muted">No versions yet</p>
      )}
    </Sheet>
  );
}

/** One past version, read-only in the flow view. */
export function VersionView({
  sb,
  session,
  ws,
  role,
  navigate,
  version,
  data,
  onRolledBack,
}: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { role: Role; version: number; data: Loaded; onRolledBack: () => void }) {
  const row = useLoad(async () => {
    const r = must(await sb.from("router_versions").select("version, body, note, published_at").eq("workspace_id", ws.id).eq("version", version).maybeSingle()) as { version: number; body: RouterBody; note: string | null; published_at: string } | null;
    if (!r) throw new Error(`v${version} is gone.`);
    return { ...r, body: cleanBody(r.body) };
  }, `${ws.id}:${version}`);
  const [sel, setSel] = useState<Selection>({ kind: "rules" });
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = data.live?.version ?? null;
  const owner = role === "owner";

  const rollBack = async () => {
    if (!(await askConfirm(`Roll back to v${version}?`, { ok: "Roll back" }))) return;
    setBusy(true);
    setError("");
    try {
      const r = await routingApi<{ version: number }>(session, ws.id, "rollback", { version });
      const before = live;
      toast({
        text: `v${r.version} is live`,
        action: before
          ? {
              label: "Undo",
              run: async () => {
                try {
                  const u = await routingApi<{ version: number }>(session, ws.id, "rollback", { version: before });
                  toast({ text: `v${u.version} is live` });
                  onRolledBack();
                } catch (e) {
                  toast({ text: errorText(e) });
                }
              },
            }
          : undefined,
      });
      onRolledBack();
      navigate("routing", "rules");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 md:px-6">
        <IconButton label="Back to the setup" onClick={() => navigate("routing", "rules")}>
          <ArrowLeft size={15} />
        </IconButton>
        <Badge>v{version} · read-only</Badge>
        {live === version ? (
          <Badge tone="green" dot>
            Live
          </Badge>
        ) : null}
        {row.data?.note ? <span className="truncate text-[12.5px] text-muted">{row.data.note}</span> : null}
        <div className="ml-auto flex items-center gap-2">
          {live && live !== version ? (
            <Button variant="ghost" size="sm" onClick={() => setComparing(true)}>
              Compare with live
            </Button>
          ) : null}
          {owner && live !== version ? (
            <Button size="sm" onClick={() => void rollBack()} disabled={busy || !row.data}>
              Roll back to v{version}
            </Button>
          ) : null}
        </div>
      </div>
      {error || row.error ? (
        <div className="px-5 pt-4">
          <ErrorNote message={error || row.error} />
        </div>
      ) : null}
      {comparing && live ? <CompareDialog session={session} ws={ws.id} from={live} to={version} onClose={() => setComparing(false)} /> : null}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-h-0 overflow-y-auto">
          {row.data ? (
            <Flow body={row.data.body} counts={live === version ? flowCounts(data.stats, row.data.body) : null} problems={[]} sel={sel} onSelect={setSel} members={data.members} path={null} runKey={0} />
          ) : row.error ? null : (
            <FlowSkeleton />
          )}
        </div>
        <aside className="relative min-h-0 overflow-y-auto border-line lg:border-l">
          {row.data ? (
            <Inspector sel={sel} body={row.data.body} edit={() => {}} readOnly members={data.members} fields={data.fields} forms={data.forms} counts={null} problems={[]} lists={data.lists} onSelect={setSel} />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
