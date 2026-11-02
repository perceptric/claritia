"use client";

// One form (docs/form-templates.md): Build (outline, live preview, the picked field's settings), Share (link and
// embed code), Answers, and Settings. Changes stay local until Save; a live form re-runs the go-live check on
// every save, so an edit can't break what visitors see.

import { useEffect, useState } from "react";
import { CUSTOM_TYPE, BUILTIN_TARGETS, keyFrom } from "@/lib/forms/schema";
import { allFields } from "@/lib/forms/logic";
import { CHOICE_KINDS, KIND_LABEL, KINDS, type Cond, type FieldKind, type FormField, type FormSchema, type FormSettings } from "@/lib/forms/types";
import { ArrowDown, ArrowUp, Copy, ExternalLink, FormIcon, Plus, Trash, Wand } from "../../Icons";
import { DEFAULT_ACCENT, FormView } from "../../forms/FormView";
import { askConfirm, askLines } from "../Dialogs";
import { Select } from "../Select";
import { Badge, Button, CardHead, Empty, ErrorNote, errorText, Field, Input, Loading, must, Page, Panel, postJson, setLeaveGuard, Tabs, useLoad, type ViewProps } from "../ui";
import { FormAnswers } from "./FormAnswers";
import { STATUS } from "./FormsView";

type Row = { id: string; name: string; slug: string; status: "draft" | "live" | "closed"; schema: FormSchema; settings: FormSettings; phi: boolean; baa_confirmed_at: string | null; submissions: number; template_id: string | null };
type Draft = { name: string; schema: FormSchema; settings: FormSettings };
type Tab = "build" | "share" | "answers" | "settings";
type Custom = { key: string; label: string; type: string; options: unknown[] };
const TABS: Tab[] = ["build", "share", "answers", "settings"];
const END = "__end";
const SWATCHES = ["#0c0c0b", "#266df0", "#5b3cc4", "#007d53", "#c4161c", "#ff5a1f", "#a34a00", "#0e7490"];
const TEXTAREA = "w-full rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink";
const SEL = "h-9 w-full rounded-md border border-line bg-panel px-2.5 text-[13px] hover:border-line-strong";

function IconBtn({ label, onClick, children, disabled, danger }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={`flex size-8 items-center justify-center rounded-md border border-line bg-panel ${danger ? "text-danger hover:border-red-300 hover:bg-danger-soft" : "text-body hover:border-line-strong hover:text-ink"} disabled:pointer-events-none disabled:opacity-40`}>
      {children}
    </button>
  );
}

/** Drops keys set to undefined, so saved forms stay small. */
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as T;

function newField(kind: FieldKind, taken: Set<string>): FormField {
  const label =
    kind === "statement" ? "A note for the visitor" : kind === "agree" ? "I agree to the terms." : kind === "hidden" ? "Hidden value" : `New ${KIND_LABEL[kind].toLowerCase()} question`;
  const f: FormField = { key: keyFrom(kind === "hidden" ? "source" : label, taken), kind, label };
  if (CHOICE_KINDS.has(kind)) f.options = kind === "matrix" ? ["Poor", "Fair", "Good", "Great"] : ["Option 1", "Option 2", "Option 3"];
  if (kind === "matrix") f.rows = ["Row 1", "Row 2"];
  if (kind === "rating") f.max = 5;
  if (kind === "scale") Object.assign(f, { min: 1, max: 5 });
  if (kind === "file") f.maxFiles = 1;
  if (kind === "money") f.currency = "USD";
  if (kind === "agree" || kind === "signature") f.required = true;
  return f;
}

export function FormEditor(props: ViewProps & { formId: string; tab: string }) {
  const { sb, ws, formId, navigate } = props;
  const load = useLoad(async () => ({ row: must(await sb.from("forms").select("id, name, slug, status, schema, settings, phi, baa_confirmed_at, submissions, template_id").eq("id", formId).eq("workspace_id", ws.id).maybeSingle()) as Row | null }), formId);
  const shell = (body: React.ReactNode) => (
    <Page icon={<FormIcon size={14} />} title="Form" back={{ label: "Forms", onClick: () => navigate("forms") }}>
      {body}
    </Page>
  );
  if (load.error && !load.data) return shell(<ErrorNote message={load.error} />);
  if (!load.data) return shell(<Loading />);
  if (!load.data.row) return shell(<Empty title="Form not found" />);
  return <Editor key={load.data.row.id} {...props} initial={load.data.row} />;
}

function Editor({ sb, ws, session, navigate, formId, tab: tabProp, initial }: ViewProps & { formId: string; tab: string; initial: Row }) {
  const fields = useLoad(async () => must(await sb.from("fields").select("key, label, type, options").eq("workspace_id", ws.id).eq("object", "contact").order("position")) as Custom[], ws.id);
  const [row, setRow] = useState<Row>(initial);
  const [draft, setDraft] = useState<Draft>({ name: initial.name, schema: initial.schema, settings: initial.settings ?? {} });
  const [tab, setTab] = useState<Tab>(TABS.includes(tabProp as Tab) ? (tabProp as Tab) : "build");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const dirty = JSON.stringify({ n: row.name, s: row.schema, t: row.settings ?? {} }) !== JSON.stringify({ n: draft.name, s: draft.schema, t: draft.settings });
  useEffect(() => {
    if (!dirty) return;
    setLeaveGuard(() => askConfirm("Leave without saving?", { body: "Your changes to this form will be lost.", ok: "Leave", danger: true }));
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);

  const switchTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", `/forms/${formId}${t === "build" ? "" : `/${t}`}`);
  };

  const act = async (action: string, extra: object = {}) => postJson<Record<string, unknown>>(session, "/api/forms", { workspaceId: ws.id, id: row.id, action, ...extra });
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setErrors([]);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      const msg = errorText(e);
      setErrors([msg]);
    } finally {
      setBusy("");
    }
  };
  const save = async (): Promise<boolean> => {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ workspaceId: ws.id, id: row.id, action: "save", name: draft.name, schema: draft.schema, settings: draft.settings }),
    });
    const data = (await res.json().catch(() => ({}))) as { schema?: FormSchema; errors?: string[]; error?: string };
    if (!res.ok) {
      setErrors(data.errors ?? [data.error ?? "Something went wrong."]);
      return false;
    }
    const next: Row = { ...row, name: draft.name, schema: data.schema ?? draft.schema, settings: draft.settings };
    setRow(next);
    setDraft({ name: next.name, schema: next.schema, settings: next.settings });
    fields.reload();
    return true;
  };
  const publish = () =>
    run("publish", async () => {
      if (dirty && !(await save())) return;
      const res = await fetch("/api/forms", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ workspaceId: ws.id, id: row.id, action: "publish" }) });
      const data = (await res.json().catch(() => ({}))) as { errors?: string[]; error?: string };
      if (!res.ok) return setErrors(data.errors ?? [data.error ?? "Something went wrong."]);
      setRow((r) => ({ ...r, status: "live" }));
      setNotice("Live");
    });
  const tailor = async () => {
    const about = await askLines("Describe your business", { initial: draft.settings.about ?? "", placeholder: "We're a family dental clinic in Austin. Most new patients want cleanings, whitening or a second opinion.", ok: "Tailor" });
    if (!about) return;
    await run("tailor", async () => {
      const r = await postJson<{ schema: FormSchema }>(session, "/api/forms/tailor", { workspaceId: ws.id, id: row.id, about, schema: draft.schema });
      setDraft((d) => ({ ...d, schema: r.schema, settings: { ...d.settings, about } }));
      setSelected(null);
      setNotice("Tailored. Review, then save.");
    });
  };

  const live = row.status === "live";
  const s = draft.schema;
  const setSchema = (fn: (s: FormSchema) => FormSchema) => setDraft((d) => ({ ...d, schema: fn(d.schema) }));
  const setSettings = (patch: Partial<FormSettings>) => setDraft((d) => ({ ...d, settings: tidy({ ...d.settings, ...patch }) }));

  return (
    <Page
      icon={<FormIcon size={14} />}
      title={draft.name}
      back={{ label: "Forms", onClick: () => navigate("forms") }}
      flush
      actions={
        <span className="flex items-center gap-1.5">
          <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
          {dirty ? <Badge tone="amber">Unsaved</Badge> : null}
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          {live ? (
            <IconBtn label="Open the live form" onClick={() => window.open(`/f/${row.slug}`, "_blank", "noopener")}>
              <ExternalLink size={14} />
            </IconBtn>
          ) : null}
          <IconBtn label="Tailor to my business" onClick={tailor} disabled={!!busy}>
            <Wand size={14} />
          </IconBtn>
          <IconBtn label="Duplicate" disabled={!!busy} onClick={() => run("duplicate", async () => { const r = await act("duplicate"); navigate("forms", String(r.id)); })}>
            <Copy size={14} />
          </IconBtn>
          <IconBtn
            label="Delete form"
            danger
            disabled={!!busy}
            onClick={async () => {
              if (!(await askConfirm(`Delete ${row.name}?`, { body: "Its answers and uploaded files are deleted too. Contacts it made stay.", ok: "Delete", danger: true }))) return;
              await run("delete", async () => {
                await act("delete");
                setLeaveGuard(null);
                navigate("forms");
              });
            }}
          >
            <Trash size={14} />
          </IconBtn>
          {live ? (
            <Button variant="ghost" disabled={!!busy} onClick={() => run("close", async () => { await act("close"); setRow((r) => ({ ...r, status: "closed" })); })}>
              Close form
            </Button>
          ) : (
            <Button variant={dirty ? "ghost" : "primary"} disabled={!!busy} onClick={publish}>
              {busy === "publish" ? "Publishing…" : "Publish"}
            </Button>
          )}
          {dirty ? (
            <Button disabled={!!busy} onClick={() => run("save", async () => { if (await save()) setNotice("Saved"); })}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </span>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <Tabs<Tab>
          value={tab}
          onChange={switchTab}
          tabs={[
            { value: "build", label: "Build" },
            { value: "share", label: "Share" },
            { value: "answers", label: "Answers", count: row.submissions },
            { value: "settings", label: "Settings" },
          ]}
        />
        {errors.length || notice || busy === "tailor" ? (
          <div className="flex flex-col gap-1.5 border-b border-line bg-canvas px-4 py-2.5">
            {errors.length ? <ErrorNote message={errors.slice(0, 4).join(" ")} /> : null}
            {busy === "tailor" ? <p className="text-[13px] text-body">Tailoring…</p> : notice ? <p className="text-[13px] text-success">{notice}</p> : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {tab === "build" ? (
            <Build schema={s} settings={draft.settings} setSchema={setSchema} selected={selected} setSelected={setSelected} page={page} setPage={setPage} custom={fields.data ?? []} />
          ) : tab === "share" ? (
            <Share row={row} onPublish={publish} busy={!!busy} />
          ) : tab === "answers" ? (
            <FormAnswers sb={sb} session={session} ws={ws} navigate={navigate} formId={row.id} schema={row.schema} onCount={(n) => setRow((r) => ({ ...r, submissions: n }))} />
          ) : (
            <SettingsTab
              draft={draft}
              row={row}
              setName={(name) => setDraft((d) => ({ ...d, name }))}
              setSettings={setSettings}
              onBaa={() => run("baa", async () => { await act("baa"); setRow((r) => ({ ...r, baa_confirmed_at: new Date().toISOString() })); })}
            />
          )}
        </div>
      </div>
    </Page>
  );
}

// Build -------------------------------------------------------------------------------------------------------

function Build({ schema: s, settings, setSchema, selected, setSelected, page, setPage, custom }: { schema: FormSchema; settings: FormSettings; setSchema: (fn: (s: FormSchema) => FormSchema) => void; selected: string | null; setSelected: (k: string | null) => void; page: number; setPage: (p: number) => void; custom: Custom[] }) {
  const flat = allFields(s);
  const sel = flat.find((f) => f.key === selected) ?? null;
  const pageOf = (key: string) => s.pages.findIndex((p) => p.fields.some((f) => f.key === key));
  const pick = (key: string) => {
    setSelected(key);
    const p = pageOf(key);
    if (p >= 0) setPage(p);
  };
  const addField = (kind: FieldKind) => {
    const taken = new Set(flat.map((f) => f.key));
    const f = newField(kind, taken);
    setSchema((x) => {
      const target = sel ? pageOf(sel.key) : Math.min(page, x.pages.length - 1);
      return {
        ...x,
        pages: x.pages.map((p, i) => {
          if (i !== target) return p;
          const at = sel ? p.fields.findIndex((y) => y.key === sel.key) + 1 : p.fields.length;
          return { ...p, fields: [...p.fields.slice(0, at), f, ...p.fields.slice(at)] };
        }),
      };
    });
    setSelected(f.key);
  };
  const addPage = () => {
    setSchema((x) => ({ ...x, pages: [...x.pages, { fields: [] }] }));
    setPage(s.pages.length);
    setSelected(null);
  };
  const removePage = async (i: number) => {
    if (s.pages[i]!.fields.length && !(await askConfirm(`Delete page ${i + 1}?`, { body: "Its questions are deleted too.", ok: "Delete", danger: true }))) return;
    const gone = new Set(s.pages[i]!.fields.map((f) => f.key));
    setSchema((x) => ({ ...x, pages: x.pages.filter((_, j) => j !== i).map((p) => ({ ...p, fields: p.fields.map((f) => (f.show && gone.has(f.show.key) ? tidy({ ...f, show: undefined }) : f)) })) }));
    setPage(Math.max(0, i - 1));
    setSelected(null);
  };
  const kindOptions = KINDS.map((k) => ({ value: k.value, label: `${k.group}: ${k.label}` }));

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col border-b border-line bg-panel lg:border-r lg:border-b-0">
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <button type="button" onClick={() => setSelected(null)} className={`mb-2 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${selected === null ? "bg-hover font-medium text-ink" : "text-body hover:bg-hover"}`}>
            <span className="font-mono text-[10px] tracking-[0.1em] text-faint uppercase">Form</span>
            <span className="truncate">{s.title}</span>
          </button>
          {s.pages.map((p, i) => (
            <div key={i} className="mb-2">
              <div className="flex items-center justify-between gap-2 px-2.5 py-1">
                <button type="button" onClick={() => { setPage(i); setSelected(null); }} className={`label-mono truncate text-left ${page === i ? "text-ink" : ""}`}>
                  {p.title || `Page ${i + 1}`}
                </button>
                {s.pages.length > 1 ? (
                  <button type="button" aria-label={`Delete page ${i + 1}`} title="Delete page" onClick={() => removePage(i)} className="rounded-md p-1 text-faint hover:bg-hover hover:text-danger">
                    <Trash size={12} />
                  </button>
                ) : null}
              </div>
              {p.fields.length ? (
                p.fields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => pick(f.key)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${selected === f.key ? "bg-ink text-white" : "text-body hover:bg-hover hover:text-ink"}`}
                  >
                    <span className={`w-16 shrink-0 truncate font-mono text-[9.5px] tracking-[0.06em] uppercase ${selected === f.key ? "text-white/70" : "text-faint"}`}>{KIND_LABEL[f.kind]}</span>
                    <span className="min-w-0 flex-1 truncate">{f.label}</span>
                    {f.required ? <span className={selected === f.key ? "text-white/70" : "text-faint"}>*</span> : null}
                  </button>
                ))
              ) : (
                <p className="px-2.5 py-1.5 text-[12.5px] text-faint">No questions</p>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setSelected(END)} className={`mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${selected === END ? "bg-ink text-white" : "text-body hover:bg-hover"}`}>
            <span className={`w-16 shrink-0 font-mono text-[9.5px] tracking-[0.06em] uppercase ${selected === END ? "text-white/70" : "text-faint"}`}>End</span>
            <span className="truncate">{s.end.title}</span>
          </button>
        </div>
        <div className="flex gap-2 border-t border-line p-3">
          <Select<FieldKind | "">
            value=""
            options={kindOptions}
            onChange={(k) => k && addField(k)}
            ariaLabel="Add a question"
            placeholder="Add question"
            plainPlaceholder
            className="h-8 flex-1 rounded-md border border-line bg-panel px-2.5 text-[13px] font-medium hover:border-line-strong"
          />
          <Button variant="ghost" onClick={addPage} className="px-2.5">
            <Plus size={13} />
            Page
          </Button>
        </div>
      </aside>
      <section className="paper min-h-[480px] overflow-auto p-4 md:p-8">
        <div className="frame mx-auto max-w-[680px] border border-line bg-panel p-6 md:p-10">
          {s.pages[page] && !s.pages[page]!.fields.length && selected !== END ? (
            <Empty title="An empty page">Add a question, and it lands here.</Empty>
          ) : (
            <FormView schema={s} settings={settings} mode="preview" badge={false} selected={selected} onSelect={pick} page={page} onPage={setPage} showEnd={selected === END} />
          )}
        </div>
      </section>
      <aside className="min-h-0 overflow-auto border-t border-line bg-panel lg:border-t-0 lg:border-l">
        {selected === END ? (
          <EndPanel schema={s} setSchema={setSchema} />
        ) : sel ? (
          <FieldPanel key={sel.key} f={sel} schema={s} setSchema={setSchema} custom={custom} onRemoved={() => setSelected(null)} onKey={(k) => setSelected(k)} />
        ) : (
          <FormPanel schema={s} setSchema={setSchema} page={page} />
        )}
      </aside>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0">
      <p className="label-mono">{label}</p>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FormPanel({ schema: s, setSchema, page }: { schema: FormSchema; setSchema: (fn: (s: FormSchema) => FormSchema) => void; page: number }) {
  return (
    <>
      <Section label="Form">
        <Field label="Title">
          <Input value={s.title} maxLength={200} onChange={(e) => setSchema((x) => ({ ...x, title: e.target.value }))} />
        </Field>
        <Field label="Intro">
          <textarea rows={3} value={s.intro ?? ""} maxLength={2000} onChange={(e) => setSchema((x) => tidy({ ...x, intro: e.target.value || undefined }))} className={TEXTAREA} />
        </Field>
        <Field label="Submit button">
          <Input value={s.submit} maxLength={40} onChange={(e) => setSchema((x) => ({ ...x, submit: e.target.value }))} />
        </Field>
      </Section>
      {s.pages.length > 1 ? (
        <Section label={`Page ${page + 1}`}>
          <Field label="Page title">
            <Input value={s.pages[page]?.title ?? ""} maxLength={200} onChange={(e) => setSchema((x) => ({ ...x, pages: x.pages.map((p, i) => (i === page ? tidy({ ...p, title: e.target.value || undefined }) : p)) }))} />
          </Field>
        </Section>
      ) : null}
    </>
  );
}

function EndPanel({ schema: s, setSchema }: { schema: FormSchema; setSchema: (fn: (s: FormSchema) => FormSchema) => void }) {
  const setEnd = (patch: Partial<FormSchema["end"]>) => setSchema((x) => ({ ...x, end: tidy({ ...x.end, ...patch }) as FormSchema["end"] }));
  return (
    <>
      <Section label="End screen">
        <Field label="Title">
          <Input value={s.end.title} maxLength={200} onChange={(e) => setEnd({ title: e.target.value })} />
        </Field>
        <Field label="Message">
          <textarea rows={3} value={s.end.text} maxLength={2000} onChange={(e) => setSchema((x) => ({ ...x, end: { ...x.end, text: e.target.value } }))} className={TEXTAREA} />
        </Field>
        <Check label="Show the booking button" checked={!!s.end.booking} onChange={(v) => setEnd({ booking: v || undefined })} />
        <Field label="Send people to (optional)">
          <Input value={s.end.redirect ?? ""} placeholder="https://" onChange={(e) => setEnd({ redirect: e.target.value || undefined })} />
        </Field>
      </Section>
      {s.end.score?.length ? (
        <Section label="Score bands">
          {s.end.score.map((b, i) => (
            <div key={i} className="flex flex-col gap-2 border border-line p-3">
              <Field label="From score">
                <Input type="number" value={b.min} onChange={(e) => setEnd({ score: s.end.score!.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />
              </Field>
              <Field label="Title">
                <Input value={b.title} onChange={(e) => setEnd({ score: s.end.score!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              </Field>
              <Field label="Message">
                <textarea rows={2} value={b.text} onChange={(e) => setEnd({ score: s.end.score!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className={TEXTAREA} />
              </Field>
            </div>
          ))}
        </Section>
      ) : null}
    </>
  );
}

const OPS: { value: Cond["op"]; label: string }[] = [
  { value: "is", label: "is" },
  { value: "not", label: "is not" },
  { value: "answered", label: "is answered" },
  { value: "empty", label: "is empty" },
  { value: "gte", label: "is at least" },
  { value: "lte", label: "is at most" },
];

function FieldPanel({ f, schema: s, setSchema, custom, onRemoved, onKey }: { f: FormField; schema: FormSchema; setSchema: (fn: (s: FormSchema) => FormSchema) => void; custom: Custom[]; onRemoved: () => void; onKey: (k: string) => void }) {
  const flat = allFields(s);
  const idx = flat.findIndex((x) => x.key === f.key);
  const update = (patch: Partial<FormField>) => setSchema((x) => ({ ...x, pages: x.pages.map((p) => ({ ...p, fields: p.fields.map((y) => (y.key === f.key ? tidy({ ...y, ...patch }) : y)) })) }));
  const pageIdx = s.pages.findIndex((p) => p.fields.some((y) => y.key === f.key));
  const pos = s.pages[pageIdx]?.fields.findIndex((y) => y.key === f.key) ?? -1;
  const move = (d: number) =>
    setSchema((x) => ({
      ...x,
      pages: x.pages.map((p, i) => {
        if (i !== pageIdx) return p;
        const list = [...p.fields];
        const [y] = list.splice(pos, 1);
        list.splice(pos + d, 0, y!);
        // A field can't move above the field its condition reads.
        return { ...p, fields: list };
      }),
    }));
  const remove = () => {
    setSchema((x) => ({ ...x, pages: x.pages.map((p) => ({ ...p, fields: p.fields.filter((y) => y.key !== f.key).map((y) => (y.show?.key === f.key ? tidy({ ...y, show: undefined }) : y)) })) }));
    onRemoved();
  };
  const duplicate = () => {
    const taken = new Set(flat.map((y) => y.key));
    const copy: FormField = tidy({ ...JSON.parse(JSON.stringify(f)), key: keyFrom(f.label, taken), label: `${f.label} (copy)`.slice(0, 300), map: undefined });
    setSchema((x) => ({ ...x, pages: x.pages.map((p, i) => (i === pageIdx ? { ...p, fields: [...p.fields.slice(0, pos + 1), copy, ...p.fields.slice(pos + 1)] } : p)) }));
    onKey(copy.key);
  };
  const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 100);
  const setOptions = (opts: string[]) => update({ options: opts, points: f.points ? opts.map((_, i) => f.points![i] ?? 0) : undefined });

  // Where the answer is saved on the contact.
  const type = CUSTOM_TYPE[f.kind];
  const used = new Set(flat.filter((y) => y.key !== f.key && y.map).map((y) => y.map!));
  const mapOptions: { value: string; label: string }[] = [{ value: "", label: "Don't save on the contact" }];
  for (const [k, t] of Object.entries(BUILTIN_TARGETS)) if (t.kinds.includes(f.kind) && !used.has(k)) mapOptions.push({ value: k, label: t.label });
  if (type) for (const c of custom) if (c.type === type && !used.has(`f.${c.key}`)) mapOptions.push({ value: `f.${c.key}`, label: `${c.label} (custom)` });
  const fresh = type ? `f.${keyFrom(f.label, new Set([...custom.map((c) => c.key), ...[...used].map((u) => u.replace(/^f\./, ""))]))}` : "";
  if (f.map && !mapOptions.some((o) => o.value === f.map)) mapOptions.push({ value: f.map, label: f.map.startsWith("f.") ? `New field: ${f.map.slice(2)}` : f.map });
  if (type && !mapOptions.some((o) => o.value === fresh)) mapOptions.push({ value: fresh, label: "New contact field" });

  // Show when: any earlier question.
  const before = flat.slice(0, idx).filter((y) => !["statement", "file", "signature"].includes(y.kind));
  const src = f.show ? flat.find((y) => y.key === f.show!.key) : undefined;
  const valueChoices = src ? (src.kind === "yes_no" ? [src.options?.[0] ?? "Yes", src.options?.[1] ?? "No"] : (src.options ?? [])) : [];
  const valueOf = (v: Cond["value"]) => (v === true ? (src?.options?.[0] ?? "Yes") : v === false ? (src?.options?.[1] ?? "No") : String(v ?? ""));
  const setCondValue = (raw: string) => update({ show: { ...f.show!, value: src?.kind === "yes_no" ? raw === valueChoices[0] : ["gte", "lte"].includes(f.show!.op) ? Number(raw) : raw } });

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
        <span className="font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">{KIND_LABEL[f.kind]}</span>
        <span className="ml-auto flex gap-1">
          <IconBtn label="Move up" onClick={() => move(-1)} disabled={pos <= 0}>
            <ArrowUp size={13} />
          </IconBtn>
          <IconBtn label="Move down" onClick={() => move(1)} disabled={pos < 0 || pos >= (s.pages[pageIdx]?.fields.length ?? 0) - 1}>
            <ArrowDown size={13} />
          </IconBtn>
          <IconBtn label="Duplicate question" onClick={duplicate}>
            <Copy size={13} />
          </IconBtn>
          <IconBtn label="Delete question" onClick={remove} danger>
            <Trash size={13} />
          </IconBtn>
        </span>
      </div>
      <Section label="Question">
        <Field label={f.kind === "statement" ? "Heading" : "Label"}>
          <textarea rows={2} value={f.label} maxLength={300} onChange={(e) => update({ label: e.target.value })} className={TEXTAREA} />
        </Field>
        <Field label={f.kind === "statement" ? "Text" : "Help text"}>
          <textarea rows={2} value={f.help ?? ""} maxLength={1000} onChange={(e) => update({ help: e.target.value || undefined })} className={TEXTAREA} />
        </Field>
        {["short_text", "long_text", "email", "phone", "url", "number", "money", "dropdown"].includes(f.kind) ? (
          <Field label="Placeholder">
            <Input value={f.placeholder ?? ""} maxLength={200} onChange={(e) => update({ placeholder: e.target.value || undefined })} />
          </Field>
        ) : null}
        {f.kind !== "statement" && f.kind !== "hidden" ? <Check label="Required" checked={!!f.required} onChange={(v) => update({ required: v || undefined })} /> : null}
        {!["statement", "matrix", "address", "name", "long_text", "file", "signature", "nps", "ranking"].includes(f.kind) ? <Check label="Half width" checked={!!f.half} onChange={(v) => update({ half: v || undefined })} /> : null}
        {f.kind === "hidden" ? <p className="font-mono text-[12px] text-muted">?{f.key}=…</p> : null}
      </Section>
      {CHOICE_KINDS.has(f.kind) ? (
        <Section label={f.kind === "matrix" ? "Columns" : "Options"}>
          <textarea rows={Math.min(10, (f.options?.length ?? 2) + 1)} value={(f.options ?? []).join("\n")} onChange={(e) => setOptions(lines(e.target.value))} className={`${TEXTAREA} font-mono text-[12.5px]`} />
          {f.kind === "single" ? <Check label="Add an “Other” choice" checked={!!f.other} onChange={(v) => update({ other: v || undefined })} /> : null}
          {f.points ? (
            <Field label="Points, in order">
              <Input value={f.points.join(", ")} onChange={(e) => update({ points: (f.options ?? []).map((_, i) => Number(e.target.value.split(",")[i]?.trim()) || 0) })} />
            </Field>
          ) : null}
        </Section>
      ) : null}
      {f.kind === "matrix" ? (
        <Section label="Rows">
          <textarea rows={Math.min(10, (f.rows?.length ?? 2) + 1)} value={(f.rows ?? []).join("\n")} onChange={(e) => update({ rows: lines(e.target.value) })} className={`${TEXTAREA} font-mono text-[12.5px]`} />
        </Section>
      ) : null}
      {f.kind === "yes_no" && f.points ? (
        <Section label="Points">
          <Input value={f.points.join(", ")} onChange={(e) => update({ points: [0, 1].map((i) => Number(e.target.value.split(",")[i]?.trim()) || 0) })} />
        </Section>
      ) : null}
      {f.kind === "number" || f.kind === "money" || f.kind === "scale" || f.kind === "rating" ? (
        <Section label="Range">
          <div className="grid grid-cols-2 gap-2">
            {f.kind !== "rating" ? (
              <Field label="Lowest">
                <Input type="number" value={f.min ?? ""} onChange={(e) => update({ min: e.target.value === "" ? undefined : Number(e.target.value) })} />
              </Field>
            ) : null}
            <Field label={f.kind === "rating" ? "Stars" : "Highest"}>
              <Input type="number" value={f.max ?? ""} onChange={(e) => update({ max: e.target.value === "" ? undefined : Number(e.target.value) })} />
            </Field>
          </div>
          {f.kind === "scale" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Low label">
                <Input value={f.minLabel ?? ""} onChange={(e) => update({ minLabel: e.target.value || undefined })} />
              </Field>
              <Field label="High label">
                <Input value={f.maxLabel ?? ""} onChange={(e) => update({ maxLabel: e.target.value || undefined })} />
              </Field>
            </div>
          ) : null}
        </Section>
      ) : null}
      {f.kind === "file" ? (
        <Section label="Files">
          <Select value={f.maxFiles ?? 1} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 1 ? "One file" : `Up to ${n} files` }))} onChange={(n) => update({ maxFiles: n })} ariaLabel="How many files" className={SEL} />
        </Section>
      ) : null}
      {f.kind !== "statement" ? (
        <Section label="Save on the contact">
          <Select value={f.map ?? ""} options={mapOptions} onChange={(v) => update({ map: v || undefined })} ariaLabel="Save on the contact" className={SEL} />
        </Section>
      ) : null}
      <Section label="Show when">
        <Select
          value={f.show?.key ?? ""}
          options={[{ value: "", label: "Always" }, ...before.map((y) => ({ value: y.key, label: y.label.slice(0, 60) }))]}
          onChange={(k) => update({ show: k ? { key: k, op: "answered" } : undefined })}
          ariaLabel="Show when"
          className={SEL}
        />
        {f.show ? (
          <>
            <Select value={f.show.op} options={OPS.filter((o) => (["gte", "lte"].includes(o.value) ? ["number", "money", "rating", "nps", "scale"].includes(src?.kind ?? "") : true))} onChange={(op) => update({ show: { key: f.show!.key, op, ...(["answered", "empty"].includes(op) ? {} : { value: f.show!.value ?? valueChoices[0] }) } })} ariaLabel="Rule" className={SEL} />
            {["is", "not", "gte", "lte"].includes(f.show.op) ? (
              valueChoices.length && !["gte", "lte"].includes(f.show.op) ? (
                <Select value={valueOf(f.show.value)} options={valueChoices.map((v) => ({ value: v, label: v }))} onChange={setCondValue} ariaLabel="Value" className={SEL} />
              ) : (
                <Input value={valueOf(f.show.value)} onChange={(e) => setCondValue(e.target.value)} />
              )
            ) : null}
          </>
        ) : null}
      </Section>
    </>
  );
}

// Share -------------------------------------------------------------------------------------------------------

function CopyBox({ label, text, code }: { label: string; text: string; code?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Panel>
      <CardHead label={label}>
        <Button variant="ghost" className="h-7 px-2.5" onClick={copy}>
          <Copy size={13} />
          {copied ? "Copied" : "Copy"}
        </Button>
      </CardHead>
      {code ? (
        <pre className="overflow-x-auto bg-[#161615] p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre text-[#e8e8e3]">{text}</pre>
      ) : (
        <div className="p-4">
          <Input readOnly value={text} onFocus={(e) => e.target.select()} className="font-mono" />
        </div>
      )}
    </Panel>
  );
}

function Share({ row, onPublish, busy }: { row: Row; onPublish: () => void; busy: boolean }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/f/${row.slug}`;
  const embed = `<script src="${origin}/forms.js" async></script>\n<div data-claritia-form="${row.slug}"></div>`;
  const iframe = `<iframe src="${link}?embed=1" title="${row.name.replace(/"/g, "&quot;")}" style="width:100%;height:720px;border:0"></iframe>`;
  return (
    <div className="paper h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {row.status !== "live" ? (
          <Panel className="flex items-center justify-between gap-3 p-4">
            <p className="text-[13.5px] text-body">The link and embed start working once the form is live.</p>
            <Button onClick={onPublish} disabled={busy}>
              Publish
            </Button>
          </Panel>
        ) : null}
        <CopyBox label="Link" text={link} />
        <CopyBox label="Embed on your site" text={embed} code />
        <CopyBox label="Iframe" text={iframe} code />
      </div>
    </div>
  );
}

// Settings ----------------------------------------------------------------------------------------------------

function SettingsTab({ draft, row, setName, setSettings, onBaa }: { draft: Draft; row: Row; setName: (n: string) => void; setSettings: (p: Partial<FormSettings>) => void; onBaa: () => void }) {
  const st = draft.settings;
  const accent = st.accent ?? DEFAULT_ACCENT;
  const [hex, setHex] = useState(accent);
  const consentOn = !st.consent_off;
  return (
    <div className="paper h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <Panel>
          <CardHead label="Form" />
          <div className="flex flex-col gap-4 p-4">
            <Field label="Name">
              <Input value={draft.name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
        </Panel>
        <Panel>
          <CardHead label="Color" />
          <div className="flex flex-wrap items-center gap-2 p-4">
            {SWATCHES.map((c) => (
              <button key={c} type="button" aria-label={c} title={c} onClick={() => {
                  setHex(c);
                  setSettings({ accent: c === DEFAULT_ACCENT ? undefined : c });
                }} className={`size-8 rounded-md border ${accent === c ? "border-ink ring-2 ring-ink ring-offset-2" : "border-line"}`} style={{ background: c }} />
            ))}
            <Input
              value={hex}
              maxLength={7}
              aria-label="Color code"
              onChange={(e) => {
                setHex(e.target.value);
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) setSettings({ accent: e.target.value.toLowerCase() === DEFAULT_ACCENT ? undefined : e.target.value.toLowerCase() });
              }}
              className="w-28 font-mono"
            />
          </div>
        </Panel>
        <Panel>
          <CardHead label="Booking" />
          <div className="flex flex-col gap-2 p-4">
            <Field label="Booking link">
              <Input value={st.booking_url ?? ""} placeholder="https://calendly.com/your-team/intro" onChange={(e) => setSettings({ booking_url: e.target.value || undefined })} />
            </Field>
          </div>
        </Panel>
        <Panel>
          <CardHead label="Email consent" />
          <div className="flex flex-col gap-4 p-4">
            <Check label="Ask for consent on this form" checked={consentOn} onChange={(v) => setSettings({ consent_off: v ? undefined : true })} />
            {consentOn ? (
              <>
                <Field label="Opt-in box (EU, UK and other strict regions)">
                  <textarea rows={2} maxLength={600} value={st.consent_text ?? ""} placeholder="Email me about products, events and offers. I can unsubscribe at any time." onChange={(e) => setSettings({ consent_text: e.target.value || undefined })} className={TEXTAREA} />
                </Field>
                <Field label="Notice (everywhere else)">
                  <textarea rows={2} maxLength={600} value={st.notice_text ?? ""} placeholder="We'll use your details to reply and may email you about related products. You can unsubscribe at any time." onChange={(e) => setSettings({ notice_text: e.target.value || undefined })} className={TEXTAREA} />
                </Field>
              </>
            ) : null}
          </div>
        </Panel>
        {row.phi ? (
          <Panel>
            <CardHead label="Health data" />
            <div className="flex items-center justify-between gap-3 p-4">
              <p className="text-[13.5px] text-body">{row.baa_confirmed_at ? "BAA confirmed." : "This form collects health details. It can go live once you confirm a signed BAA with Claritia."}</p>
              {row.baa_confirmed_at ? <Badge tone="green">Confirmed</Badge> : <Button variant="ghost" onClick={onBaa}>I have a signed BAA</Button>}
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
