"use client";

// One connected tool's panel: its sync settings, its webhook address, a warehouse's query, and its field mapping.

import { useState } from "react";
import { BASES, type Basis } from "@/lib/contacts/consent";
import { TARGETS, type Target } from "@/lib/contacts/fields";
import { entryOf } from "@/lib/sources/catalog";
import { queryError, type WhQuery } from "@/lib/sources/sql";
import { Copy, Pause, Play, Refresh } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Select } from "../Select";
import { attempt, Badge, Button, CardHead, ErrorNote, errorText, Field, getJson, Input, Loading, must, Panel, postJson, Td, Th, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import { SidePanel } from "../records/SidePanel";

export type Source = {
  id: string;
  kind: string;
  name: string;
  account: string | null;
  status: string;
  settings: { objects?: Record<string, string>; every_min?: number; basis?: Basis; push_new?: string; follow_deletes?: boolean; query?: WhQuery };
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
};

type Run = { id: string; object: string; direction: string; started_at: string; finished_at: string | null; pulled: number; written: number; skipped: number; errors: number; error: string | null };

type MapRow = { col: string; sample: string; target: string };

export const STATE: Record<string, [string, Tone]> = { active: ["Active", "green"], paused: ["Paused", "gray"], error: ["Error", "red"], disconnected: ["Disconnected", "gray"] };

const EVERY = [
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 60, label: "Every hour" },
  { value: 360, label: "Every 6 hours" },
  { value: 1440, label: "Every day" },
];

const OBJECT_LABEL: Record<string, string> = { contacts: "Contacts", companies: "Companies", lists: "Lists", suppressions: "Unsubscribes", events: "Activity", records: "Records" };

// One source -------------------------------------------------------------------------------------------------

export function SourcePanel({ sb, session, wsId, source, owner, onClose, changed }: { sb: ViewProps["sb"]; session: ViewProps["session"]; wsId: string; source: Source; owner: boolean; onClose: () => void; changed: () => void }) {
  const e = entryOf(source.kind);
  const [settings, setSettings] = useState(source.settings);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const runs = useLoad(async () => must(await sb.from("source_runs").select("id, object, direction, started_at, finished_at, pulled, written, skipped, errors, error").eq("source_id", source.id).order("started_at", { ascending: false }).limit(20)) as Run[], source.id);
  const hook = useLoad(async () => (e?.hook && owner && source.status !== "disconnected" ? (await getJson<{ url: string }>(session, `/api/sources/hook-url?id=${source.id}`)).url : null), source.id);
  const [state, tone] = STATE[source.status] ?? [source.status, "gray" as Tone];
  const act = (fn: () => Promise<unknown>) =>
    attempt(fn, {
      setError,
      after: () => {
        changed();
        runs.reload();
      },
    });
  const objects = settings.objects ?? {};
  const setObject = (o: string, v: string) => setSettings({ ...settings, objects: { ...objects, [o]: v } });

  return (
    <SidePanel title={source.name} wide onClose={onClose} footer={null}>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo domain={e?.domain ?? ""} name={source.name} size={32} />
          <div className="flex flex-col">
            <span className="text-[15px] font-medium">{source.name}</span>
            {source.account ? <span className="font-mono text-[11px] text-faint">{source.account}</span> : null}
          </div>
          <Badge tone={tone}>{state}</Badge>
          <span className="ml-auto flex gap-1.5">
            {source.status !== "disconnected" && !e?.hook ? (
              <Button variant="ghost" className="h-8 px-2.5" onClick={() => act(async () => must(await sb.rpc("source_sync_now", { p_id: source.id })))} disabled={source.status === "paused"}>
                <Refresh size={14} />
                Sync now
              </Button>
            ) : null}
            {owner && source.status !== "disconnected" ? (
              <Button variant="ghost" className="h-8 px-2.5" onClick={() => act(async () => must(await sb.rpc("source_pause", { p_id: source.id, p_paused: source.status !== "paused" })))}>
                {source.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
                {source.status === "paused" ? "Resume" : "Pause"}
              </Button>
            ) : null}
            {owner && source.status !== "disconnected" ? (
              <Button
                variant="danger"
                className="h-8 px-2.5"
                onClick={() =>
                  act(async () => {
                    if (!(await askConfirm(`Disconnect ${source.name}?`, { ok: "Disconnect", danger: true }))) return;
                    must(await sb.rpc("source_disconnect", { p_id: source.id }));
                  })
                }
              >
                Disconnect
              </Button>
            ) : null}
          </span>
        </div>
        <ErrorNote message={error || (source.status !== "disconnected" ? (source.last_error ?? "") : "")} />

        {hook.data ? (
          <Field label="Webhook URL">
            <div className="flex gap-1.5">
              <Input readOnly value={hook.data} className="font-mono text-[12px]" onFocus={(ev) => ev.currentTarget.select()} />
              <Button variant="ghost" className="h-9 px-2.5" onClick={() => void navigator.clipboard.writeText(hook.data!)} aria-label="Copy">
                <Copy size={14} />
              </Button>
            </div>
          </Field>
        ) : null}

        {owner && source.status !== "disconnected" ? (
          <Panel>
            <CardHead label="Sync" />
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              {(e?.warehouse ? [] : (e?.objects ?? [])).map((o) => (
                <Field key={o} label={OBJECT_LABEL[o] ?? o}>
                  <Select
                    className="w-full"
                    value={objects[o] ?? (o === "companies" ? "off" : "in")}
                    onChange={(v) => setObject(o, v)}
                    options={[...(o === "contacts" && e?.twoWay ? [{ value: "both", label: "Both ways" }] : []), { value: "in", label: "In only" }, { value: "off", label: "Off" }]}
                  />
                </Field>
              ))}
              {!e?.hook ? (
                <Field label="Schedule">
                  <Select className="w-full" value={settings.every_min ?? 60} onChange={(v) => setSettings({ ...settings, every_min: v })} options={EVERY} />
                </Field>
              ) : null}
              <Field label="Email consent when the tool doesn't say">
                <Select className="w-full" value={settings.basis ?? "none"} onChange={(v) => setSettings({ ...settings, basis: v })} options={BASES} />
              </Field>
              {e?.twoWay && objects.contacts === "both" ? (
                <Field label={`New contacts to ${source.name}`}>
                  <Select
                    className="w-full"
                    value={settings.push_new ?? "lifecycle"}
                    onChange={(v) => setSettings({ ...settings, push_new: v })}
                    options={[
                      { value: "all", label: "All contacts" },
                      { value: "lifecycle", label: "With a lifecycle stage" },
                      { value: "none", label: "Only ones already there" },
                    ]}
                  />
                </Field>
              ) : null}
              {!e?.hook && !e?.warehouse ? (
                <Field label="When a contact is deleted there">
                  <Select
                    className="w-full"
                    value={settings.follow_deletes ? "delete" : "keep"}
                    onChange={(v) => setSettings({ ...settings, follow_deletes: v === "delete" })}
                    options={[
                      { value: "keep", label: "Keep it here" },
                      { value: "delete", label: "Delete it here" },
                    ]}
                  />
                </Field>
              ) : null}
            </div>
            <div className="flex items-center gap-3 border-t border-line px-4 py-3">
              <Button
                onClick={() =>
                  act(async () => {
                    must(await sb.rpc("source_settings_save", { p_id: source.id, p_name: source.name, p_settings: settings }));
                    setSaved(true);
                  })
                }
              >
                Save
              </Button>
              {saved ? <span className="text-[12px] text-faint">Saved</span> : null}
            </div>
          </Panel>
        ) : null}

        {e?.warehouse && source.status !== "disconnected" ? <QueryPanel sb={sb} session={session} wsId={wsId} source={source} owner={owner} changed={changed} /> : null}

        {source.status !== "disconnected" && (!e?.warehouse || (source.settings.query && ["contacts", "companies"].includes(source.settings.query.target))) ? <MappingPanel sb={sb} session={session} wsId={wsId} source={source} owner={owner} hasCompanies={!!e?.objects.includes("companies")} /> : null}

        <Panel>
          <CardHead label="Runs" count={runs.data?.length} />
          {!runs.data ? (
            <Loading />
          ) : !runs.data.length ? (
            <p className="px-4 py-3 text-[13px] text-faint">—</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>What</Th>
                    <Th className="text-right">Read</Th>
                    <Th className="text-right">Written</Th>
                    <Th className="text-right">Unchanged</Th>
                    <Th className="text-right">Errors</Th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <Td className="whitespace-nowrap text-faint">{timeAgo(r.started_at)}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Badge tone={r.direction === "out" ? "violet" : "brand"}>{r.direction === "out" ? "Out" : "In"}</Badge>
                          {OBJECT_LABEL[r.object] ?? r.object}
                          {r.error ? <span className="max-w-[240px] truncate text-[12px] text-red-600">{r.error}</span> : null}
                        </span>
                      </Td>
                      <Td className="text-right font-mono">{r.pulled.toLocaleString("en-US")}</Td>
                      <Td className="text-right font-mono">{r.written.toLocaleString("en-US")}</Td>
                      <Td className="text-right font-mono">{r.skipped.toLocaleString("en-US")}</Td>
                      <Td className="text-right font-mono">{r.errors.toLocaleString("en-US")}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </SidePanel>
  );
}

function QueryPanel({ sb, session, wsId, source, owner, changed }: { sb: ViewProps["sb"]; session: ViewProps["session"]; wsId: string; source: Source; owner: boolean; changed: () => void }) {
  const start: WhQuery = source.settings.query ?? { sql: "select email, first_name, last_name, company, updated_at\nfrom users\nwhere updated_at >= :cursor", key: "email", cursor: "updated_at", target: "contacts" };
  const [q, setQ] = useState<WhQuery>(start);
  const [test, setTest] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const objects = useLoad(async () => must(await sb.from("objects").select("key, plural").eq("workspace_id", wsId).order("plural")) as { key: string; plural: string }[], wsId);
  const targets = [
    { value: "contacts", label: "Contacts" },
    { value: "companies", label: "Companies" },
    { value: "events", label: "Activity on contacts" },
    ...(objects.data ?? []).map((o) => ({ value: `object:${o.key}`, label: o.plural })),
  ];
  const wrong = queryError(q);
  const run = (label: string, fn: () => Promise<void>) => attempt(fn, { setError, setBusy: (on) => setBusy(on ? label : "") });
  const set = (patch: Partial<WhQuery>) => {
    setQ({ ...q, ...patch });
    setSaved(false);
  };
  return (
    <Panel>
      <CardHead label="Query" />
      <div className="flex flex-col gap-3 p-4">
        <textarea
          value={q.sql}
          onChange={(e) => set({ sql: e.target.value })}
          rows={7}
          spellCheck={false}
          disabled={!owner}
          aria-label="Query"
          className="w-full rounded-md border border-line bg-panel px-3 py-2 font-mono text-[12.5px] leading-relaxed outline-none focus:border-ink"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Rows become">
            <Select className="w-full" value={q.target} onChange={(t) => set({ target: t as WhQuery["target"] })} options={targets} disabled={!owner} />
          </Field>
          <Field label="Key column">
            <Input value={q.key} onChange={(e) => set({ key: e.target.value.trim() })} disabled={!owner} className="font-mono" />
          </Field>
          <Field label="Cursor column">
            <Input value={q.cursor} onChange={(e) => set({ cursor: e.target.value.trim() })} disabled={!owner} className="font-mono" />
          </Field>
          {q.target === "events" ? (
            <Field label="Activity name">
              <Input value={q.event ?? ""} onChange={(e) => set({ event: e.target.value.trim() })} placeholder="product.signup" disabled={!owner} className="font-mono" />
            </Field>
          ) : null}
          {q.target !== "contacts" && q.target !== "companies" ? (
            <Field label="Email column">
              <Input value={q.email ?? ""} onChange={(e) => set({ email: e.target.value.trim() || undefined })} placeholder="email" disabled={!owner} className="font-mono" />
            </Field>
          ) : null}
        </div>
        <ErrorNote message={error || (q.sql.trim() ? (wrong ?? "") : "")} />
        {owner ? (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              disabled={!!wrong || !!busy}
              onClick={() => run("test", async () => setTest(await postJson<{ columns: string[]; rows: Record<string, unknown>[] }>(session, "/api/sources/test-query", { id: source.id, query: q })))}
            >
              <Play size={14} />
              {busy === "test" ? "Running…" : "Test"}
            </Button>
            <Button
              disabled={!!wrong || !!busy}
              onClick={() =>
                run("save", async () => {
                  must(await sb.rpc("source_settings_save", { p_id: source.id, p_name: source.name, p_settings: { ...source.settings, query: q } }));
                  setSaved(true);
                  changed();
                })
              }
            >
              Save query
            </Button>
            {saved ? <span className="text-[12px] text-faint">Saved</span> : null}
          </div>
        ) : null}
      </div>
      {test ? (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {test.columns.map((c) => (
                  <Th key={c}>{c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {test.rows.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  {test.columns.map((c) => (
                    <Td key={c} className="max-w-[220px] truncate font-mono text-[12px]">
                      {r[c] == null ? "—" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

const COMPANY_TARGETS = [
  { value: "skip", label: "Skip" },
  { value: "name", label: "Name" },
  { value: "domain", label: "Domain" },
  { value: "industry", label: "Industry" },
  { value: "size", label: "Size" },
  { value: "country", label: "Country" },
];

function MappingPanel({ sb, session, wsId, source, owner, hasCompanies }: { sb: ViewProps["sb"]; session: ViewProps["session"]; wsId: string; source: Source; owner: boolean; hasCompanies: boolean }) {
  const [object, setObject] = useState<"contact" | "company">("contact");
  const data = useLoad(async () => getJson<{ contact: MapRow[]; company: MapRow[] }>(session, `/api/sources/mapping?id=${source.id}`), source.id);
  const custom = useLoad(async () => must(await sb.from("fields").select("key, label").eq("workspace_id", wsId).eq("object", "contact").order("position")) as { key: string; label: string }[], wsId);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState("");
  const rows = (data.data?.[object] ?? []).map((r) => ({ ...r, target: edits[object]?.[r.col] ?? r.target }));
  const options =
    object === "contact"
      ? [...TARGETS.filter((t) => t.value !== "basis"), ...(custom.data ?? []).map((f) => ({ value: `f.${f.key}` as Target, label: f.label }))]
      : COMPANY_TARGETS;
  const choose = (col: string, t: string) => {
    const mine = { ...(edits[object] ?? {}), [col]: t };
    // One column per field.
    if (t !== "skip") for (const r of rows) if (r.col !== col && (mine[r.col] ?? r.target) === t) mine[r.col] = "skip";
    setEdits({ ...edits, [object]: mine });
  };
  const save = async () => {
    setError("");
    try {
      must(await sb.rpc("mapping_save", { p_source: source.id, p_object: object, p_rows: rows.filter((r) => r.target !== "skip").map((r) => ({ col: r.col, target: r.target })) }));
      setEdits({ ...edits, [object]: {} });
      data.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  return (
    <Panel>
      <CardHead label="Fields">
        {hasCompanies ? (
          <span className="ml-auto flex gap-1">
            {(["contact", "company"] as const).map((o) => (
              <button key={o} type="button" onClick={() => setObject(o)} className={`h-6 rounded-md px-2 text-[12px] ${object === o ? "bg-ink text-white" : "text-muted hover:bg-hover"}`}>
                {o === "contact" ? "Contacts" : "Companies"}
              </button>
            ))}
          </span>
        ) : null}
      </CardHead>
      <ErrorNote message={error} />
      {!data.data ? (
        <Loading />
      ) : !rows.length ? (
        <p className="px-4 py-3 text-[13px] text-faint">—</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>{source.name}</Th>
              <Th>Sample</Th>
              <Th>Field</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.col} className="border-t border-line">
                <Td className="font-mono text-[12px]">{r.col}</Td>
                <Td className="max-w-[220px] truncate text-muted">{r.sample || "—"}</Td>
                <Td className="w-56">
                  <Select size="sm" className={`w-full ${r.target === "skip" ? "text-faint" : ""}`} value={r.target} onChange={(v) => choose(r.col, v)} options={options as { value: string; label: string }[]} disabled={!owner} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {owner && Object.keys(edits[object] ?? {}).length ? (
        <div className="border-t border-line px-4 py-3">
          <Button onClick={save}>Save fields</Button>
        </div>
      ) : null}
    </Panel>
  );
}
