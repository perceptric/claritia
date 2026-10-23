"use client";

// Forms (docs/form-builder-v2.md): the list, the new-form screen (/forms/new), and one form's page. A form's page has
// four tabs: Share (the form on your site's look, the embed code and Publish), Build (drag and drop), Connect (where
// leads go, meetings, consent and spam) and Results (fills, deliveries and the daily check). Drafts save as you go;
// Publish checks the draft on the server and makes it live.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { applyOp, type Op } from "@/lib/forms/ops";
import { ADAPTERS, checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { Copy, Inbox, Pause, Pencil, Play, Plus, Redo, Send, Trash, Undo } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText } from "../Dialogs";
import { AiAvatar, AiMark, AiTag } from "../Ai";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Page, postJson, setLeaveGuard, Tabs, timeAgo, useLoad, type ViewProps } from "../ui";
import { FormCanvas } from "./FormCanvas";
import { FormChecks } from "./FormChecks";
import { FormCreate } from "./FormCreate";
import { PreviewPane } from "./Preview";
import { FormDesign } from "./FormDesign";
import { FormFills } from "./FormFills";
import { SettingsTab } from "./SettingsTab";
import { copy, IconButton, STATUS, type Destination, type FormRow, type Kit, type SourceRow } from "./shared";

type ListRow = { id: string; name: string; status: FormRow["status"]; kind: "built" | "captured"; version: number; updated_at: string; fills: number; last_fill: string | null; failed: number; check: "running" | "passed" | "failed" | null };

export function FormsView(props: ViewProps) {
  if (props.id === "new") return <FormCreate key="new" {...props} />;
  if (props.id) return <FormPage key={props.id} {...props} />;
  return <FormList {...props} />;
}

function FormList(props: ViewProps) {
  const { sb, ws, navigate } = props;
  const list = useLoad(async () => must(await sb.rpc("forms_list", { p_ws: ws.id })) as ListRow[], ws.id);
  const [renameError, setRenameError] = useState("");
  const renameForm = async (formId: string, current: string) => {
    const next = await askText("Rename form", { initial: current, ok: "Rename" });
    if (!next || next === current) return;
    try {
      must(await sb.rpc("form_rename", { p_id: formId, p_name: next }));
      setRenameError("");
      list.reload();
    } catch (e) {
      setRenameError(errorText(e));
    }
  };
  if (list.data && !list.data.length)
    return (
      <Page icon={<Inbox size={14} />} title="Forms" count={0} flush>
        <FormCreate {...props} embedded />
      </Page>
    );
  return (
    <Page
      icon={<Inbox size={14} />}
      title="Forms"
      count={list.data?.length}
      actions={
        <Button onClick={() => navigate("forms", "new")}>
          <Plus size={14} />
          New form
        </Button>
      }
    >
      <ErrorNote message={list.error || renameError} />
      {!list.data ? (
        <Loading />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.map((f) => (
            <div key={f.id} className="group lift anim-rise-sm relative flex flex-col gap-6 rounded-2xl border border-line bg-card p-5 text-left hover:border-line-strong">
              <span className="flex items-start gap-2">
                <button type="button" onClick={() => navigate("forms", f.id)} className="min-w-0 flex-1 truncate pt-px text-left text-[14.5px] font-medium text-ink after:absolute after:inset-0 after:rounded-2xl">
                  {f.name}
                </button>
                <span className="relative z-10 -my-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                  <IconButton label="Rename" onClick={() => void renameForm(f.id, f.name)}>
                    <Pencil size={14} />
                  </IconButton>
                </span>
                <Badge tone={STATUS[f.status][1]} dot>
                  {STATUS[f.status][0]}
                </Badge>
              </span>
              <span className="flex items-end gap-4">
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="font-semibold tracking-[-0.02em] text-[34px] leading-none text-ink tabular-nums">{f.fills.toLocaleString("en-US")}</span>
                  <span className="label-mono">Fills, 30 days</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <span className="label-mono">Last fill {timeAgo(f.last_fill)}</span>
                  <span className="label-mono">Changed {timeAgo(f.updated_at)}</span>
                </span>
              </span>
              {f.failed || f.check === "failed" || f.kind === "captured" ? (
                <span className="-mt-2 flex flex-wrap gap-1.5">
                  {f.failed ? <Badge tone="red">{`${f.failed} failed`}</Badge> : null}
                  {f.check === "failed" ? <Badge tone="red">Check failed</Badge> : null}
                  {f.kind === "captured" ? <Badge>Captured</Badge> : null}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}

type Tab = "share" | "build" | "connect" | "results";

function FormPage(props: ViewProps) {
  const { sb, ws, id } = props;
  const data = useLoad(async () => {
    const [f, kits, sources, dests, custom, sites] = await Promise.all([
      sb.from("forms").select("id, name, status, draft, draft_rev, version, brand_kit_id, published_at").eq("id", id).maybeSingle(),
      sb.from("brand_kits").select("id, name, tokens, logo_url, notes, source_url, scan_status, scan_error, scanned_at").eq("workspace_id", ws.id).order("created_at"),
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name"),
      sb.from("form_destinations").select("id, kind, source_id, name, config, paused, position").eq("form_id", id).order("position"),
      sb.from("fields").select("key, label, type, options").eq("workspace_id", ws.id).eq("object", "contact").order("position"),
      sb.from("sites").select("domain").eq("workspace_id", ws.id).order("created_at").limit(1),
    ]);
    const row = must(f) as FormRow | null;
    const published = row?.version ? ((must(await sb.from("form_versions").select("body").eq("form_id", id).eq("version", row.version).maybeSingle()) as { body: Form } | null)?.body ?? null) : null;
    const site = ((sites.data ?? []) as { domain: string }[])[0]?.domain ?? "";
    return { row, published, kits: must(kits) as Kit[], sources: must(sources) as SourceRow[], dests: must(dests) as Destination[], custom: must(custom) as CustomField[], site };
  }, id);
  if (data.error && !data.data) return <ErrorNote message={data.error} />;
  if (!data.data) return <Loading />;
  if (!data.data.row) return <Empty title="Form not found" />;
  return <Builder {...props} initial={data.data.row} published={data.data.published} kits={data.data.kits} sources={data.data.sources} dests={data.data.dests} custom={data.data.custom} site={data.data.site} reload={data.reload} />;
}

/** Read and clear a one-time note the create screen left for this form. */
function takeOnce(key: string): string | null {
  try {
    const v = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    return v;
  } catch {
    return null;
  }
}

function Builder({
  sb,
  session,
  ws,
  role,
  navigate,
  initial,
  published,
  kits,
  sources,
  dests,
  custom,
  site,
  reload,
}: ViewProps & { initial: FormRow; published: Form | null; kits: Kit[]; sources: SourceRow[]; dests: Destination[]; custom: CustomField[]; site: string; reload: () => void }) {
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
  const [tab, setTab] = useState<Tab>(() => {
    const t = takeOnce(`claritia:form-tab:${initial.id}`);
    return t === "build" || t === "connect" || t === "results" ? t : "share";
  });
  const [note] = useState(() => takeOnce(`claritia:form-note:${initial.id}`) ?? "");
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [watch, setWatch] = useState(0);
  const rev = useRef(initial.draft_rev);
  const dirty = useRef(false);

  // The latest form, so two ops in a row (add a field, then move it) both land.
  const latest = useRef(form);
  const put = (f: Form) => {
    latest.current = f;
    setForm(f);
  };
  const apply = useCallback((op: Op) => {
    const cur = latest.current;
    const r = applyOp(cur, op);
    if ("error" in r) return setError(r.error);
    setError("");
    setPast((p) => [...p.slice(-99), cur]);
    setFuture([]);
    latest.current = r.form;
    setForm(r.form);
    setSaved(false);
    dirty.current = true;
  }, []);
  const undo = useCallback(() => {
    if (!past.length) return;
    setFuture((f) => [form, ...f]);
    put(past[past.length - 1]);
    setPast((p) => p.slice(0, -1));
    setSaved(false);
    dirty.current = true;
  }, [past, form]);
  const redo = useCallback(() => {
    if (!future.length) return;
    setPast((p) => [...p, form]);
    put(future[0]);
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
      setTab("results");
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
  const rename = (n: string) => {
    setName(n);
    setSaved(false);
    dirty.current = true;
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
  const kit = kits.find((k) => k.id === kitId) ?? null;
  // While a scan runs, check the kit every 2 seconds; when it lands, the form takes the new tokens.
  useEffect(() => {
    if (kit?.scan_status !== "scanning") return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [kit?.scan_status, reload]);
  const scannedAt = useRef(kit?.scanned_at ?? null);
  useEffect(() => {
    if (kit && kit.scanned_at && kit.scanned_at !== scannedAt.current) {
      scannedAt.current = kit.scanned_at;
      setTokens(kit.tokens);
    }
  }, [kit]);
  const [scanError, setScanError] = useState("");
  const scan = async (url: string) => {
    setScanError("");
    try {
      const r = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url, kitId, formId: initial.id });
      if (r.kitId !== kitId) {
        setKitId(r.kitId);
        setSaved(false);
        dirty.current = true;
      }
      reload();
    } catch (e) {
      setScanError(errorText(e));
    }
  };
  const fromChat = (next: Form, nextRev: number) => {
    setPast((p) => [...p.slice(-99), form]);
    setFuture([]);
    put(next);
    rev.current = nextRev;
    dirty.current = false;
    setSaved(true);
  };
  const siteHost = (kit?.source_url ?? site).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const brand = { site: siteHost, kit, tokens, scan: (u: string) => void scan(u), error: scanError };

  const [label, tone] = STATUS[initial.status];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "share", label: "Share" },
    { value: "build", label: "Build" },
    { value: "connect", label: "Connect" },
    { value: "results", label: "Results" },
  ];
  const look = (
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
      scan={scan}
      site={kit?.source_url ?? site}
    />
  );

  return (
    <Page
      icon={<Inbox size={14} />}
      title={name}
      onRename={rename}
      back={{ label: "Forms", onClick: () => navigate("forms") }}
      flush
      actions={
        <span className="flex items-center gap-1.5">
          <span className="hidden font-mono text-[11.5px] text-muted sm:inline">{saved ? "Saved" : "Saving…"}</span>
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
          {initial.version ? (
            <IconButton label="Send a test fill" onClick={test} disabled={!!busy}>
              <Send size={14} />
            </IconButton>
          ) : null}
          <IconButton label="Delete form" onClick={remove} danger>
            <Trash size={14} />
          </IconButton>
          <Button disabled={!!busy || (!!initial.version && !changed)} onClick={publish}>
            {busy === "publish" ? "Publishing…" : initial.version && !changed ? "Published" : "Publish"}
          </Button>
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <Tabs value={tab} tabs={tabs} onChange={setTab} />
        {error || note || problems.length ? (
          <div className="border-b border-line bg-card px-4 py-2">
            <ErrorNote message={error || problems[0] || note} />
            {problems.length > 1 ? (
              <ul className="mt-1 flex flex-col gap-0.5 px-3.5 text-[12.5px] text-rose">
                {problems.slice(1).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {tab === "share" ? (
            <div className="grid h-full min-h-0 lg:grid-cols-[1fr_380px]">
              <PreviewPane form={form} brand={brand} footer={<ChangeBox session={session} ws={ws} formId={initial.id} prepare={async () => ((await save()) ? rev.current : null)} onResult={fromChat} />} />
              <aside className="min-h-0 overflow-auto border-l border-line bg-card">
                <Embed id={initial.id} origin={origin} live={!!initial.version} form={form} apply={apply} />
              </aside>
            </div>
          ) : tab === "build" ? (
            <FormCanvas form={form} apply={apply} custom={custom} tokens={tokens} name={name} setName={rename} look={look} />
          ) : tab === "connect" ? (
            <SettingsTab form={form} apply={apply} sb={sb} session={session} ws={ws} role={role} navigate={navigate} formId={initial.id} dests={dests} sources={sources} reload={reload} brand={brand} />
          ) : (
            <div className="h-full overflow-auto bg-paper p-4 md:p-8">
              <div className="mx-auto flex max-w-5xl flex-col gap-8">
                <FormFills key={watch} sb={sb} formId={initial.id} destinations={dests} navigate={navigate} watch={watch} />
                {form.capture ? null : <FormChecks sb={sb} formId={initial.id} live={initial.status === "live"} />}
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

// Changes in plain words ----------------------------------------------------------------------------------------

const SUGGEST = ["Make it two steps", "Add a phone field", "Make it shorter", "Put the labels inside the fields"];

function ChangeBox({ session, ws, formId, prepare, onResult }: Pick<ViewProps, "session" | "ws"> & { formId: string; prepare: () => Promise<number | null>; onResult: (f: Form, rev: number) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ text: string; lines: string[]; ask: string | null }>({ text: "", lines: [], ask: null });
  const [error, setError] = useState("");
  const send = async (message: string, confirmed = false) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError("");
    try {
      const rev = await prepare();
      if (rev === null) throw new Error("The draft didn't save. Try again.");
      const r = await postJson<{ form: Form; rev: number; reply: string; lines: string[]; ask: { question: string } | null }>(session, "/api/forms/chat", { workspaceId: ws.id, id: formId, rev, message: m, confirmed });
      if (r.lines.length) onResult(r.form, r.rev);
      setReply({ text: r.reply, lines: r.lines, ask: r.ask ? m : null });
      if (!r.ask) setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-center gap-2 rounded-full border border-line-strong bg-card p-1.5 pl-2 transition-colors focus-within:border-ink"
      >
        <AiMark size={18} working={busy} className="ml-1.5" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Change anything, like “add a budget question”" aria-label="Change the form" className="h-8 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
        <Button type="submit" disabled={!text.trim() || busy}>
          {busy ? "Changing…" : "Change"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGEST.map((s) => (
          <button key={s} type="button" disabled={busy} onClick={() => void send(s)} className="press h-8 rounded-full border border-line-strong bg-card px-3 text-[12.5px] text-body transition-transform duration-[140ms] hover:-translate-y-px hover:border-ink hover:text-ink disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {reply.text ? (
        <div className="anim-rise-sm flex items-start gap-2.5 rounded-lg border border-line bg-card px-3.5 py-3 text-[13px]">
          <AiAvatar size={24} working={busy} />
          <div className="min-w-0 flex-1">
            <p className="pt-0.5">{reply.text}</p>
            {reply.lines.length ? (
              <ul className="mt-1 text-[12.5px] text-muted">
                {reply.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
            {reply.ask ? (
              <div className="mt-2 flex gap-1.5">
                <Button onClick={() => void send(reply.ask!, true)} disabled={busy}>
                  Yes
                </Button>
                <Button variant="ghost" onClick={() => setReply({ text: "", lines: [], ask: null })}>
                  No
                </Button>
              </div>
            ) : null}
          </div>
          {reply.lines.length ? <AiTag /> : null}
        </div>
      ) : null}
    </div>
  );
}

// Embed ---------------------------------------------------------------------------------------------------------

type Way = "code" | "link" | "popup" | "wordpress" | "webflow" | "framer" | "react" | "iframe";
const WAYS: { value: Way; label: string; domain?: string }[] = [
  { value: "code", label: "Code" },
  { value: "link", label: "Link" },
  { value: "popup", label: "Popup" },
  { value: "wordpress", label: "WordPress", domain: "wordpress.org" },
  { value: "webflow", label: "Webflow", domain: "webflow.com" },
  { value: "framer", label: "Framer", domain: "framer.com" },
  { value: "react", label: "React", domain: "react.dev" },
  { value: "iframe", label: "Iframe" },
];

function Embed({ id, origin, live, form, apply }: { id: string; origin: string; live: boolean; form: Form; apply: (op: Op) => void }) {
  const [way, setWay] = useState<Way>("code");
  const [trigger, setTrigger] = useState<"click" | "delay" | "exit">("click");
  const [copied, setCopied] = useState(false);
  if (form.capture) return <Capture id={id} origin={origin} live={live} form={form} apply={apply} />;
  const script = `<script src="${origin}/forms/v1.js" async></script>`;
  const tag = `<claritia-form form-id="${id}"></claritia-form>`;
  const code = `${script}\n${tag}`;
  const popupAttr = trigger === "delay" ? "delay:10" : trigger;
  const text: Record<Way, string> = {
    code,
    link: `${origin}/f/${id}`,
    popup: `${script}\n<claritia-form form-id="${id}" popup="${popupAttr}"></claritia-form>${trigger === "click" ? `\n<button data-claritia-open="${id}">${form.submit.label}</button>` : ""}`,
    wordpress: code,
    webflow: code,
    framer: code,
    react: `useEffect(() => {\n  const s = document.createElement("script");\n  s.src = "${origin}/forms/v1.js";\n  s.async = true;\n  document.head.append(s);\n}, []);\n\nreturn <claritia-form form-id="${id}" />;`,
    iframe: `<script src="${origin}/f/embed.js" data-claritia-form="${id}" async></script>`,
  };
  const steps: Partial<Record<Way, string[]>> = {
    wordpress: ["Edit the page and add a Custom HTML block where the form goes.", "Paste the code.", "Update the page."],
    webflow: ["Drag an Embed element where the form goes.", "Paste the code and save.", "Publish the site."],
    framer: ["Insert an Embed, and pick HTML.", "Paste the code.", "Publish the site."],
  };
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-medium">Put it on your site</h3>
        {live ? null : <Badge tone="amber">Live after Publish</Badge>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {WAYS.map((w) => (
          <button
            key={w.value}
            type="button"
            onClick={() => {
              setWay(w.value);
              setCopied(false);
            }}
            aria-pressed={way === w.value}
            className={`press flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2.5 text-[11.5px] transition-colors ${way === w.value ? "border-ink bg-hover font-medium text-ink ring-1 ring-ink" : "border-line bg-card text-body hover:border-line-strong"}`}
          >
            {w.domain ? <BrandLogo domain={w.domain} name={w.label} size={16} /> : <span className="font-mono text-[11px]">{w.value === "code" ? "</>" : w.value === "link" ? "URL" : w.value === "popup" ? "[ ]" : "<if>"}</span>}
            {w.label}
          </button>
        ))}
      </div>
      {way === "popup" ? (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["click", "On a button"],
              ["delay", "After 10 seconds"],
              ["exit", "When they leave"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setTrigger(v)} aria-pressed={trigger === v} className={`press h-8 rounded-full border px-3 text-[12.5px] ${trigger === v ? "border-ink bg-ink font-medium text-paper" : "border-line-strong bg-card hover:border-ink"}`}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
      {steps[way] ? (
        <ol className="flex flex-col gap-1.5 text-[13px] text-body">
          {steps[way]!.map((s, i) => (
            <li key={s} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep font-mono text-[10.5px] text-muted">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-col">
        <pre className="max-h-64 overflow-auto rounded-lg bg-[#161615] p-4 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-[#e8e8e3]">{text[way]}</pre>
        <div className="flex gap-2 pt-2">
          <Button onClick={async () => setCopied(await copy(text[way]))}>
            <Copy size={14} />
            {copied ? "Copied" : "Copy"}
          </Button>
          {way === "link" && live ? (
            <Button variant="ghost" onClick={() => window.open(text.link, "_blank", "noopener")}>
              Open
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Capture({ id, origin, live, form, apply }: { id: string; origin: string; live: boolean; form: Form; apply: (op: Op) => void }) {
  const [copied, setCopied] = useState(false);
  const cap = form.capture!;
  const snippet = `<script src="${origin}/forms/v1.js" async data-capture="${id}"></script>`;
  return (
    <div className="flex flex-col gap-5 p-5">
      <h3 className="text-[15px] font-medium">Your form</h3>
      <div className="grid grid-cols-2 gap-1.5">
        {ADAPTERS.map((a) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={cap.adapter === a.value}
            onClick={() => apply({ op: "set_capture", adapter: a.value })}
            className={`press flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${cap.adapter === a.value ? "border-ink bg-hover font-medium text-ink ring-1 ring-ink" : "border-line bg-card text-body hover:border-line-strong"}`}
          >
            {a.domain ? <BrandLogo domain={a.domain} name={a.label} size={18} /> : null}
            {a.label}
          </button>
        ))}
      </div>
      {cap.adapter === "html" || cap.adapter === "webflow" || cap.adapter === "framer" ? (
        <label className="flex flex-col gap-1.5">
          <span className="label-mono">Form selector</span>
          <input
            value={cap.selector ?? ""}
            onChange={(e) => apply({ op: "set_capture", selector: e.target.value })}
            placeholder="#demo-form"
            className="h-9 w-full rounded-sm border border-line-strong bg-card px-3 font-mono text-[12.5px] text-ink outline-none focus:border-ink focus:ring-1 focus:ring-ink"
          />
        </label>
      ) : null}
      {live ? (
        <div className="flex flex-col">
          <pre className="overflow-x-auto rounded-lg bg-[#161615] p-4 font-mono text-[11.5px] leading-relaxed text-[#e8e8e3]">{snippet}</pre>
          <div className="pt-2">
            <Button onClick={async () => setCopied(await copy(snippet))}>
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : (
        <Badge tone="amber">Live after Publish</Badge>
      )}
    </div>
  );
}
