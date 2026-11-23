"use client";

// Segments (docs/marketing-platform.md 6.2.11): groups of contacts by any rule, AND and OR up to 3 levels deep,
// with a live count and ten of the people while editing. Dynamic segments refresh hourly; lists from a tool are
// static segments and show here too.

import { useEffect, useRef, useState } from "react";

import { filterFields } from "@/lib/records/fields";
import { Plus, Refresh, Trash, Users } from "../../Icons";
import { askConfirm } from "../Dialogs";

import { SampleStats, ToolIntro } from "../ToolIntro";
import { Badge, Button, CardHead, ErrorNote, errorText, Input, Loading, must, Page, Panel, Td, Th, timeAgo, useLoad, type ViewProps } from "../ui";
import { useMeta } from "../records/meta";
import { type Group, type Ctx, GroupEditor } from "./SegmentRules";
import { UserError } from "@/lib/errors";
type Segment = { id: string; name: string; kind: "dynamic" | "static"; rules: Group | Record<string, never>; count: number; refreshed_at: string | null; error: string | null; source_id: string | null };

export function SegmentsView({ sb, ws, id, navigate }: ViewProps) {
  if (id) return <SegmentPage key={id} sb={sb} ws={ws} id={id} navigate={navigate} />;
  return <SegmentList sb={sb} ws={ws} navigate={navigate} />;
}

function SegmentList({ sb, ws, navigate }: Pick<ViewProps, "sb" | "ws" | "navigate">) {
  const list = useLoad(async () => must(await sb.from("segments").select("id, name, kind, count, refreshed_at, error, source_id").eq("workspace_id", ws.id).order("name")) as Segment[], ws.id);
  const add = (
    <Button onClick={() => navigate("segments", "new")}>
      <Plus size={14} />
      New segment
    </Button>
  );
  return (
    <Page icon={<Users size={16} />} title="Segments" count={list.data?.length} actions={list.data?.length ? add : undefined}>
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <ToolIntro
          action={add}
          title="Group contacts by anything you know"
          lead="Mix fields, activity, website visits, consent, sources and custom objects, with AND and OR. The count updates as you build, and members update every hour."
          features={[
            { title: "Any rule", text: "“Read pricing twice this week and can be emailed”, or “Customers with a subscription over 10 seats”.", visual: <SampleStats items={[["rules", "30+"], ["levels", "3"], ["count", "live"]]} /> },
            { title: "Lists from your tools", text: "HubSpot lists and email audiences come in as segments, kept up to date." },
            { title: "Ready for journeys", text: "Joining or leaving a segment is recorded on the contact, so journeys can start from it." },
          ]}
        />
      ) : (
        <Panel>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th className="text-right">Contacts</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="cursor-pointer border-t border-line hover:bg-hover" onClick={() => navigate("segments", s.id)}>
                  <Td className="font-medium">
                    <span className="flex items-center gap-2">
                      {s.name}
                      {s.error ? <span className="truncate text-[12px] font-normal text-red-600">{s.error}</span> : null}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={s.kind === "dynamic" ? "brand" : "gray"}>{s.kind === "dynamic" ? "Dynamic" : "List"}</Badge>
                  </Td>
                  <Td className="text-right font-mono">{s.count.toLocaleString("en-US")}</Td>
                  <Td className="text-faint">{timeAgo(s.refreshed_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </Page>
  );
}

function SegmentPage({ sb, ws, id, navigate }: Pick<ViewProps, "sb" | "ws" | "navigate"> & { id: string }) {
  const isNew = id === "new";
  const seg = useLoad(async () => {
    if (isNew) return null;
    const found = must(await sb.from("segments").select("id, name, kind, rules, count, refreshed_at, error, source_id").eq("id", id).maybeSingle()) as Segment | null;
    if (!found) throw new UserError("Segment not found");
    return found;
  }, id);
  const extra = useLoad(async () => {
    const [s, o] = await Promise.all([
      sb.from("sources").select("id, name").eq("workspace_id", ws.id).neq("status", "disconnected").order("name"),
      sb.from("objects").select("key, plural").eq("workspace_id", ws.id).order("plural"),
    ]);
    return {
      sources: ((s.data ?? []) as { id: string; name: string }[]).map((x) => ({ value: x.id, label: x.name })),
      objects: ((o.data ?? []) as { key: string; plural: string }[]).map((x) => ({ value: x.key, label: x.plural })),
    };
  }, ws.id);
  // A failed reload keeps the segment on screen, so edits in progress aren't lost.
  if ((!isNew && !seg.data) || !extra.data) return seg.error || extra.error ? <ErrorNote message={seg.error || extra.error} /> : <Loading />;
  return <Builder sb={sb} wsId={ws.id} seg={seg.data ?? null} ctx={{ sb, wsId: ws.id, ...extra.data }} navigate={navigate} reload={seg.reload} />;
}

function Builder({ sb, wsId, seg, ctx, navigate, reload }: { sb: ViewProps["sb"]; wsId: string; seg: Segment | null; ctx: Ctx; navigate: ViewProps["navigate"]; reload: () => void }) {
  const isList = seg?.kind === "static";
  const start: Group = seg && "rules" in (seg.rules ?? {}) ? (seg.rules as Group) : { op: "and", rules: [] };
  const [name, setName] = useState(seg?.name ?? "");
  const [rules, setRules] = useState<Group>(isList ? { op: "and", rules: [{ kind: "field", field: "segment", op: "is", values: [seg!.id] }] } : start);
  const [live, setLive] = useState<{ count: number; sample: { id: string; email: string; name: string | null; company: string | null }[] } | null>(null);
  const [liveError, setLiveError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = useMeta(sb, wsId, "contact");
  const ticket = useRef(0);

  useEffect(() => {
    const mine = ++ticket.current;
    const t = setTimeout(async () => {
      const { data, error: e } = await sb.rpc("segment_preview", { p_ws: wsId, p_rules: rules });
      if (mine !== ticket.current) return;
      if (e) {
        setLiveError(errorText(e));
        return;
      }
      setLiveError("");
      setLive(data as never);
    }, 400);
    return () => clearTimeout(t);
  }, [sb, wsId, rules]);

  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const sid = must(await sb.rpc("segment_save", { p_ws: wsId, p_id: seg?.id ?? null, p_name: name, p_rules: rules })) as string;
      if (!seg) navigate("segments", sid);
      else reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      icon={<Users size={16} />}
      title={seg?.name ?? "New segment"}
      actions={
        <span className="flex gap-1.5">
          <Button variant="ghost" onClick={() => navigate("segments")}>
            Segments
          </Button>
          {seg && !isList ? (
            <Button variant="ghost" onClick={() => void sb.rpc("segment_refresh_now", { p_id: seg.id }).then(reload)}>
              <Refresh size={14} />
              Refresh
            </Button>
          ) : null}
          {seg ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (!(await askConfirm(`Delete ${seg.name}?`, { ok: "Delete", danger: true }))) return;
                const { error: e } = await sb.rpc("segment_delete", { p_id: seg.id });
                if (e) setError(errorText(e));
                else navigate("segments");
              }}
            >
              <Trash size={14} />
              Delete
            </Button>
          ) : null}
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          <ErrorNote message={error || seg?.error || ""} />
          {!isList ? (
            <>
              <div className="flex items-center gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name" maxLength={120} className="max-w-md" />
                <Button onClick={save} disabled={busy || !name.trim()}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              </div>
              <GroupEditor node={rules} depth={1} ctx={ctx} fields={meta.data ? filterFields(meta.data.fields) : []} anyFields={meta.data ? (filterFields(meta.data.fields) as never) : []} onChange={setRules} />
            </>
          ) : (
            <Panel>
              <CardHead label="List" />
              <p className="px-4 py-3 text-[13px] text-muted">{ctx.sources.find((s) => s.value === seg?.source_id)?.label ?? "Added by hand"}</p>
            </Panel>
          )}
        </div>
        <Panel className="self-start">
          <CardHead label="Matches" count={live ? live.count.toLocaleString("en-US") : undefined} />
          <ErrorNote message={liveError} />
          {!live ? (
            <Loading />
          ) : !live.sample.length ? (
            <p className="px-4 py-3 text-[13px] text-faint">—</p>
          ) : (
            <ul className="divide-y divide-line">
              {live.sample.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => navigate("contacts", c.id)} className="flex w-full flex-col px-4 py-2 text-left hover:bg-hover">
                    <span className="truncate text-[13px] font-medium">{c.name ?? c.email}</span>
                    <span className="truncate text-[12px] text-faint">{[c.name ? c.email : null, c.company].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
