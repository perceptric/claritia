"use client";

// Forms (docs/form-builder.md): the list of forms, and the builder for one. The builder keeps the draft on the left
// and the real form on the right; drafts save as you go, Publish checks the draft on the server and makes it live,
// and Test sends a fill marked as a test through every destination.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { applyOp, type Op } from "@/lib/forms/ops";
import { checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import { TEMPLATES } from "@/lib/forms/templates";
import type { CustomField } from "@/lib/records/fields";
import { Copy, Inbox, Pause, Play, Plus, Redo, Send, Trash, Undo } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { SampleStats, SampleTags, ToolIntro } from "../ToolIntro";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Page, Panel, postJson, setLeaveGuard, Tabs, Td, Th, timeAgo, useLoad, type ViewProps } from "../ui";
import { FormBuild } from "./FormBuild";
import { FormDesign } from "./FormDesign";
import { FormDestinations } from "./FormDestinations";
import { FormFills } from "./FormFills";
import { FormSettings } from "./FormSettings";
import { copy, FormPreview, IconButton, STATUS, type Destination, type FormRow, type Kit, type SourceRow } from "./shared";

type ListRow = { id: string; name: string; status: FormRow["status"]; version: number; updated_at: string; fills: number; last_fill: string | null; failed: number };

export function FormsView(props: ViewProps) {
  if (props.id) return <FormPage key={props.id} {...props} />;
  return <FormList {...props} />;
}

function FormList({ sb, ws, navigate }: ViewProps) {
  const list = useLoad(async () => must(await sb.rpc("forms_list", { p_ws: ws.id })) as ListRow[], ws.id);
  const [error, setError] = useState("");
  const create = async (name: string, draft: Form) => {
    setError("");
    try {
      const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: name, p_draft: draft })) as string;
      navigate("forms", id);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const templates = (
    <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      <button type="button" onClick={() => void create("Untitled form", emptyForm())} className="flex flex-col gap-1 bg-panel p-4 text-left hover:bg-hover">
        <span className="flex items-center gap-2 text-[14px] font-medium">
          <Plus size={14} />
          Blank form
        </span>
        <span className="text-[12.5px] text-muted">One email field</span>
      </button>
      {TEMPLATES.map((t) => (
        <button key={t.key} type="button" onClick={() => void create(t.name, t.form())} className="flex flex-col gap-1 bg-panel p-4 text-left hover:bg-hover">
          <span className="text-[14px] font-medium">{t.name}</span>
          <span className="text-[12.5px] text-muted">{t.text}</span>
        </button>
      ))}
    </div>
  );
  return (
    <Page icon={<Inbox size={14} />} title="Forms" count={list.data?.length}>
      <ErrorNote message={error || list.error} />
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <div className="flex flex-col gap-8">
          <ToolIntro
            title="Forms that look like your site and send leads anywhere"
            lead="Pick a template or start blank. The form takes your site's fonts and colors, checks every answer, and sends each lead to Claritia and to your CRM, Slack or a webhook, with every delivery logged."
            features={[
              { title: "Your brand", text: "Fonts, colors and corners from a brand kit, so the form fits the page it sits on.", visual: <SampleStats items={[["fields", "4"], ["steps", "2"], ["kb", "9"]]} /> },
              { title: "Leads go anywhere", text: "HubSpot, Salesforce, Omniscient, Slack and webhooks, one record per person, retried until it lands.", visual: <SampleTags rows={[["HubSpot", "Sent"], ["Slack", "Sent"], ["Webhook", "Retrying"]]} /> },
              { title: "Nothing lost", text: "Every fill is saved before it's sent on. A fill sent twice counts once, and a failed delivery can be replayed." },
            ]}
          />
          {templates}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Panel>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>State</Th>
                  <Th className="text-right">Fills, 30 days</Th>
                  <Th>Last fill</Th>
                  <Th>Changed</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((f) => (
                  <tr key={f.id} className="cursor-pointer border-t border-line hover:bg-hover" onClick={() => navigate("forms", f.id)}>
                    <Td className="font-medium">
                      <span className="flex items-center gap-2">
                        {f.name}
                        {f.failed ? <Badge tone="red">{`${f.failed} failed`}</Badge> : null}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={STATUS[f.status][1]}>{STATUS[f.status][0]}</Badge>
                    </Td>
                    <Td className="text-right font-mono">{f.fills.toLocaleString("en-US")}</Td>
                    <Td className="text-faint">{timeAgo(f.last_fill)}</Td>
                    <Td className="text-faint">{timeAgo(f.updated_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <section className="flex flex-col gap-2">
            <h3 className="label-mono">New form</h3>
            {templates}
          </section>
        </div>
      )}
    </Page>
  );
}

type Tab = "build" | "design" | "destinations" | "settings" | "share" | "fills";

function FormPage(props: ViewProps) {
  const { sb, ws, id } = props;
  const data = useLoad(async () => {
    const [f, kits, sources, dests, custom] = await Promise.all([
      sb.from("forms").select("id, name, status, draft, draft_rev, version, brand_kit_id, published_at").eq("id", id).maybeSingle(),
      sb.from("brand_kits").select("id, name, tokens, logo_url, notes").eq("workspace_id", ws.id).order("created_at"),
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name"),
      sb.from("form_destinations").select("id, kind, source_id, name, config, paused, position").eq("form_id", id).order("position"),
      sb.from("fields").select("key, label, type, options").eq("workspace_id", ws.id).eq("object", "contact").order("position"),
    ]);
    const row = must(f) as FormRow | null;
    const published = row?.version ? ((must(await sb.from("form_versions").select("body").eq("form_id", id).eq("version", row.version).maybeSingle()) as { body: Form } | null)?.body ?? null) : null;
    return { row, published, kits: must(kits) as Kit[], sources: must(sources) as SourceRow[], dests: must(dests) as Destination[], custom: must(custom) as CustomField[] };
  }, id);
  if (data.error && !data.data) return <ErrorNote message={data.error} />;
  if (!data.data) return <Loading />;
  if (!data.data.row) return <Empty title="Form not found" />;
  return <Builder {...props} initial={data.data.row} published={data.data.published} kits={data.data.kits} sources={data.data.sources} dests={data.data.dests} custom={data.data.custom} reload={data.reload} />;
}

function Builder({
  sb,
  session,
  ws,
  navigate,
  initial,
  published,
  kits,
  sources,
  dests,
  custom,
  reload,
}: ViewProps & { initial: FormRow; published: Form | null; kits: Kit[]; sources: SourceRow[]; dests: Destination[]; custom: CustomField[]; reload: () => void }) {
  const start = useMemo(() => {
    const d = initial.draft as Partial<Form>;
    return d && Array.isArray(d.steps) ? (d as Form) : emptyForm();
  }, [initial.draft]);
  const [form, setForm] = useState<Form>(start);
  const [name, setName] = useState(initial.name);
  const [kitId, setKitId] = useState<string | null>(initial.brand_kit_id);
  const [tokens, setTokens] = useState<Partial<Tokens>>(kits.find((k) => k.id === initial.brand_kit_id)?.tokens ?? {});
  const [past, setPast] = useState<Form[]>([]);
  const [future, setFuture] = useState<Form[]>([]);
  const [tab, setTab] = useState<Tab>("build");
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [watch, setWatch] = useState(0);
  const [preview, setPreview] = useState<{ step: number; done: boolean }>({ step: 0, done: false });
  const rev = useRef(initial.draft_rev);
  const dirty = useRef(false);

  const apply = useCallback(
    (op: Op) => {
      const r = applyOp(form, op);
      if ("error" in r) return setError(r.error);
      setError("");
      setPast((p) => [...p.slice(-99), form]);
      setFuture([]);
      setForm(r.form);
      setSaved(false);
      dirty.current = true;
    },
    [form],
  );
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [form, ...f]);
    setForm(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSaved(false);
    dirty.current = true;
  }, [past, form]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, form]);
    setForm(future[0]);
    setFuture((f) => f.slice(1));
    setSaved(false);
    dirty.current = true;
  }, [future, form]);

  // Cmd+Z and Shift+Cmd+Z, except while typing in a field (the browser's own undo works there).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]");
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Save the draft a moment after the last change.
  const save = useCallback(async () => {
    if (!dirty.current) return true;
    dirty.current = false;
    try {
      rev.current = must(await sb.rpc("form_save", { p_id: initial.id, p_name: name, p_draft: form, p_rev: rev.current, p_brand_kit: kitId })) as number;
      setSaved(true);
      return true;
    } catch (e) {
      dirty.current = true;
      setError(errorText(e));
      return false;
    }
  }, [sb, initial.id, name, form, kitId]);
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [saved, save, form, name, kitId]);
  useEffect(() => {
    setLeaveGuard(async () => (dirty.current ? (await save()) || askConfirm("Leave without saving?", { ok: "Leave", danger: true }) : true));
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", before);
    };
  }, [save]);

  const checked = useMemo(() => checkForm(form, { custom }), [form, custom]);
  const changed = !published || JSON.stringify("form" in checked ? checked.form : form) !== JSON.stringify(published);

  const publish = async () => {
    setBusy("publish");
    setProblems([]);
    setError("");
    try {
      if (!(await save())) return;
      await postJson(session, "/api/forms/publish", { workspaceId: ws.id, id: initial.id });
      reload();
    } catch (e) {
      const msg = errorText(e);
      setProblems("errors" in checked ? checked.errors : [msg]);
    } finally {
      setBusy("");
    }
  };
  const test = async () => {
    setBusy("test");
    setError("");
    try {
      await postJson(session, "/api/forms/test", { workspaceId: ws.id, id: initial.id });
      setTab("fills");
      setWatch((w) => w + 1);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const setStatus = async (s: "live" | "paused") => {
    try {
      must(await sb.rpc("form_set_status", { p_id: initial.id, p_status: s }));
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async () => {
    if (!(await askConfirm(`Delete ${name}?`, { body: "Its fills and contacts stay.", ok: "Delete", danger: true }))) return;
    try {
      must(await sb.rpc("form_delete", { p_id: initial.id }));
      dirty.current = false;
      navigate("forms");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const saveKit = async (kitName: string, t: Partial<Tokens>) => {
    const r = await postJson<{ id: string; tokens: Tokens; notes: string[] }>(session, "/api/forms/brand", { workspaceId: ws.id, id: kitId, name: kitName, tokens: t });
    setTokens(r.tokens);
    if (r.id !== kitId) {
      setKitId(r.id);
      setSaved(false);
      dirty.current = true;
    }
    reload();
    return { notes: r.notes };
  };

  const [label, tone] = STATUS[initial.status];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "build", label: "Build" },
    { value: "design", label: "Design" },
    { value: "destinations", label: "Destinations", count: dests.length + 1 },
    { value: "settings", label: "Settings" },
    { value: "share", label: "Share" },
    { value: "fills", label: "Fills" },
  ];

  return (
    <Page
      icon={<Inbox size={14} />}
      title={name}
      back={{ label: "Forms", onClick: () => navigate("forms") }}
      flush
      actions={
        <span className="flex items-center gap-1.5">
          <span className="hidden font-mono text-[10.5px] text-faint sm:inline">{saved ? "Saved" : "Saving…"}</span>
          <IconButton label="Undo" onClick={undo} disabled={!past.length}>
            <Undo size={14} />
          </IconButton>
          <IconButton label="Redo" onClick={redo} disabled={!future.length}>
            <Redo size={14} />
          </IconButton>
          <Badge tone={tone}>{label}</Badge>
          {initial.version && changed ? <Badge tone="amber">Unpublished changes</Badge> : null}
          {initial.version ? (
            <IconButton label={initial.status === "paused" ? "Turn on" : "Pause"} onClick={() => setStatus(initial.status === "paused" ? "live" : "paused")}>
              {initial.status === "paused" ? <Play size={14} /> : <Pause size={14} />}
            </IconButton>
          ) : null}
          <IconButton label="Delete form" onClick={remove} danger>
            <Trash size={14} />
          </IconButton>
          {initial.version ? (
            <Button variant="ghost" disabled={!!busy} onClick={test}>
              <Send size={14} />
              Test
            </Button>
          ) : null}
          <Button disabled={!!busy || (!!initial.version && !changed)} onClick={publish}>
            {busy === "publish" ? "Publishing…" : "Publish"}
          </Button>
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <Tabs value={tab} tabs={tabs} onChange={setTab} />
        {error || problems.length ? (
          <div className="border-b border-line bg-panel px-4 py-2">
            <ErrorNote message={error || problems[0]} />
            {problems.length > 1 ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-danger">
                {problems.slice(1).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {tab === "fills" ? (
          <div className="paper min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <FormFills key={watch} sb={sb} formId={initial.id} destinations={dests} navigate={navigate} watch={watch} />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(360px,1fr)_minmax(320px,1fr)]">
            <div className="min-h-0 overflow-auto border-line p-4 md:border-r md:p-5">
              {tab === "build" ? (
                <div className="flex flex-col gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="label-mono">Name</span>
                    <input
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setSaved(false);
                        dirty.current = true;
                      }}
                      className="h-9 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] text-ink outline-none focus:border-ink"
                    />
                  </label>
                  <FormBuild form={form} apply={apply} custom={custom} selected={selected} select={setSelected} />
                </div>
              ) : tab === "design" ? (
                <FormDesign
                  form={form}
                  apply={apply}
                  kits={kits}
                  kitId={kitId}
                  setKit={(k) => {
                    setKitId(k);
                    setSaved(false);
                    dirty.current = true;
                  }}
                  tokens={tokens}
                  setTokens={setTokens}
                  saveKit={saveKit}
                />
              ) : tab === "destinations" ? (
                <FormDestinations sb={sb} session={session} ws={ws} formId={initial.id} list={dests} sources={sources} reload={reload} navigate={navigate} />
              ) : tab === "settings" ? (
                <FormSettings form={form} apply={apply} />
              ) : (
                <Share id={initial.id} origin={origin} live={!!initial.version} />
              )}
            </div>
            <div className="paper min-h-0 overflow-auto p-4 md:p-8">
              <div className="mb-4 flex items-center gap-2">
                {form.steps.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPreview({ step: i, done: false })}
                    className={`h-7 rounded-md px-2.5 text-[12px] font-medium ${!preview.done && preview.step === i ? "bg-ink text-white" : "border border-line bg-panel text-muted hover:text-ink"}`}
                  >
                    {form.steps.length > 1 ? `Step ${i + 1}` : "Form"}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreview({ step: preview.step, done: true })}
                  className={`h-7 rounded-md px-2.5 text-[12px] font-medium ${preview.done ? "bg-ink text-white" : "border border-line bg-panel text-muted hover:text-ink"}`}
                >
                  After submit
                </button>
              </div>
              <div className="border border-line bg-panel p-6" style={{ background: tokens.background }}>
                <FormPreview form={form} tokens={tokens} step={Math.min(preview.step, form.steps.length - 1)} done={preview.done} />
              </div>
            </div>
          </div>
        )}
      </div>
    </Page>
  );
}

function Share({ id, origin, live }: { id: string; origin: string; live: boolean }) {
  const [copied, setCopied] = useState("");
  if (!live) return <Empty title="Publish the form to share it" />;
  const embed = `<script src="${origin}/forms/v1.js" async></script>\n<claritia-form form-id="${id}"></claritia-form>`;
  const link = `${origin}/f/${id}`;
  const react = `useEffect(() => {\n  const s = document.createElement("script");\n  s.src = "${origin}/forms/v1.js";\n  document.head.append(s);\n}, []);\nreturn <claritia-form form-id="${id}" />;`;
  const block = (key: string, title: string, text: string) => (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="label-mono">{title}</h3>
        <Button variant="plain" className="ml-auto" onClick={async () => setCopied((await copy(text)) ? key : "")}>
          <Copy size={14} />
          {copied === key ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-[#161615] p-4 font-mono text-[12px] leading-relaxed text-[#e8e8e3]">{text}</pre>
    </section>
  );
  return (
    <div className="flex flex-col gap-6">
      {block("embed", "Embed", embed)}
      {block("link", "Link", link)}
      {block("react", "React", react)}
      <div>
        <Button variant="ghost" onClick={() => window.open(link, "_blank", "noopener")}>
          Open
        </Button>
      </div>
    </div>
  );
}

