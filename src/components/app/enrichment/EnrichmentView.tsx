"use client";

// Automation › Enrichment (docs/enrich-workflows-reports.md 1.3): where data about people and companies comes from,
// how complete it is, and how leads are qualified.
//   Overview   numbers first (fields filled this month, match rate, credits used of the cap, leads qualified), a bar
//              per field showing how many records have it, and an owner's backfill for records missing a field
//   Providers  the waterfall in the team's order (drag, or the arrows), each step on or off with its own key, time
//              limit and match rate, and Try an email through the whole waterfall
//   Rules      when to enrich, and Qualify: the team's outcomes and the rules that decide before the AI
//   History    each lookup with its steps, fields and credits

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { DEFAULT_QUALIFY, cleanQualify, type QualifySettings } from "@/lib/enrich/qualifyRules";
import { PLAN_CREDITS, STEPS, orderSources, stepOf, type Source, type StepResult } from "@/lib/enrich/types";
import { BASE_FIELDS, needsValue, opsFor } from "@/lib/router/conditions";
import { OPS } from "@/lib/router/types";
import { enrichmentPage, ENRICHMENT_TABS } from "@/lib/nav";
import { ArrowDown, ArrowUp, Grip, Plus, Search, Trash } from "../../Icons";
import { AiMark, AiTag } from "../Ai";
import { BrandLogo } from "../BrandLogo";
import { askConfirm, askText } from "../Dialogs";
import { Select } from "../Select";
import { StatCards } from "../StatCards";
import { Badge, Button, Empty, ErrorNote, errorText, IconButton, Input, Loading, must, Page, Panel, postJson, Section, Segmented, timeAgo, Toggle, useLoad, useQuery, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";

type Coverage = { key: string; label: string; object: "companies" | "contacts"; n: number; total: number };

export function EnrichmentView(props: ViewProps) {
  const page = enrichmentPage(props.id);
  const nav = { title: "Enrichment", tabs: ENRICHMENT_TABS, current: page.tab, onPick: (t: string) => props.navigate("enrichment", t === "overview" ? "" : t) };
  return (
    <Section nav={nav}>
      <Page title="Enrichment">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
          {page.tab === "overview" ? <Overview {...props} /> : page.tab === "providers" ? <Providers {...props} /> : page.tab === "rules" ? <Rules {...props} /> : <History {...props} />}
        </div>
      </Page>
    </Section>
  );
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const n = (x: number) => x.toLocaleString("en-US");

// Overview -----------------------------------------------------------------------------------------------------------

function Overview({ sb, ws, navigate, role }: ViewProps) {
  // Coverage and this month's numbers in one call (enrich_overview), beside three small reads.
  const data = useQuery(`enrichment:${ws.id}:overview`, async () => {
    const month = monthStart();
    const monthIso = month.toISOString();
    const [ov, usage, billing, settings] = await Promise.all([
      sb.rpc("enrich_overview", { p_ws: ws.id, p_month: monthIso }),
      sb.from("enrich_usage").select("lookups, matches, credits").eq("workspace_id", ws.id).eq("month", monthIso.slice(0, 10)).maybeSingle(),
      sb.from("workspace_billing").select("plan").eq("workspace_id", ws.id).maybeSingle(),
      sb.from("enrich_settings").select("credit_cap").eq("workspace_id", ws.id).maybeSingle(),
    ]);
    const o = must(ov) as Record<string, number>;
    const count = (k: string) => ({ count: o[k] ?? 0 });
    const [companies, contacts, size, industry, coCountry, domain, title, seniority, phone, ctCountry, company, qualified] = ["companies", "contacts", "size", "industry", "co_country", "domain", "title", "seniority", "phone", "ct_country", "company", "qualified"].map(count);
    const C = companies.count ?? 0;
    const P = contacts.count ?? 0;
    const u = (usage.data as { lookups: number; matches: number; credits: number } | null) ?? { lookups: 0, matches: 0, credits: 0 };
    const cap = (settings.data as { credit_cap: number | null } | null)?.credit_cap ?? PLAN_CREDITS[(billing.data as { plan?: string } | null)?.plan ?? "free"] ?? 0;
    const filled = o.filled ?? 0;
    const fields: Coverage[] = [
      { key: "size", label: "Company size", object: "companies", n: size.count ?? 0, total: C },
      { key: "industry", label: "Industry", object: "companies", n: industry.count ?? 0, total: C },
      { key: "country", label: "Company country", object: "companies", n: coCountry.count ?? 0, total: C },
      { key: "domain", label: "Website", object: "companies", n: domain.count ?? 0, total: C },
      { key: "title", label: "Job title", object: "contacts", n: title.count ?? 0, total: P },
      { key: "seniority", label: "Seniority", object: "contacts", n: seniority.count ?? 0, total: P },
      { key: "company_id", label: "Company", object: "contacts", n: company.count ?? 0, total: P },
      { key: "country", label: "Person's country", object: "contacts", n: ctCountry.count ?? 0, total: P },
      { key: "phone", label: "Phone", object: "contacts", n: phone.count ?? 0, total: P },
    ];
    return { filled, usage: u, cap, qualified: qualified.count ?? 0, fields };
  });
  const d = data.data;
  if (data.error) return <ErrorNote message={data.error} />;
  return (
    <>
      <StatCards
        cards={[
          { label: "Fields filled this month", value: d ? d.filled : null },
          { label: "Match rate", value: d ? pct(d.usage.matches, d.usage.lookups) : null, format: (x) => `${x}%`, note: d ? `${n(d.usage.matches)} of ${n(d.usage.lookups)} lookups` : undefined },
          { label: "Credits used", value: d ? d.usage.credits : null, note: d ? `of ${n(d.cap)} this month` : undefined },
          { label: "Leads qualified", value: d ? d.qualified : null, note: "This month" },
        ]}
      />
      <Panel className="overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Fields</h2>
          <span className="text-[12px] text-faint">Share of records that have each one</span>
        </div>
        {!d ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-line">
            {d.fields.map((f, i) => {
              const p = pct(f.n, f.total);
              return (
                <li key={`${f.object}-${f.key}`}>
                  <button type="button" onClick={() => navigate(f.object, "")} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-hover" title={`Open ${f.object}`}>
                    <span className="w-40 shrink-0 text-[13px] text-ink">{f.label}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                      <span className={`anim-grow-x absolute inset-y-0 left-0 rounded-full ${p >= 80 ? "bg-sage" : p >= 40 ? "bg-butter" : "bg-rose"}`} style={{ width: `${p}%`, animationDelay: `${i * 50}ms` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-[12.5px] text-muted tabular-nums">
                      {p}% <span className="text-faint">· {n(f.total - f.n)} missing</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {role === "owner" ? <Backfill {...{ sb, ws }} onDone={data.reload} /> : null}
    </>
  );
}

const MISSING: { value: string; label: string }[] = [
  { value: "any", label: "Any field" },
  { value: "title", label: "Job title" },
  { value: "company", label: "Company" },
  { value: "industry", label: "Industry" },
  { value: "size", label: "Company size" },
  { value: "seniority", label: "Seniority" },
];

function Backfill({ sb, ws, onDone }: Pick<ViewProps, "sb" | "ws"> & { onDone: () => void }) {
  const [missing, setMissing] = useState("any");
  const [error, setError] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const count = useQuery(`enrichment:${ws.id}:backfill:${missing}`, async () => (must(await sb.rpc("enrich_backfill_count", { p_ws: ws.id, p_filter: { missing } })) as number) ?? 0);
  const start = async () => {
    const c = count.data ?? 0;
    if (!(await askConfirm(`Fill ${n(c)} contacts?`, { body: `Uses up to ${n(c * 2)} credits, and stops at this month's cap.`, ok: "Fill them" }))) return;
    setError("");
    const { data, error: e } = await sb.rpc("enrich_backfill_start", { p_ws: ws.id, p_filter: { missing } });
    if (e) return setError(e.message);
    setStarted(data as number);
    onDone();
  };
  return (
    <Panel className="flex flex-wrap items-center gap-3 px-5 py-4">
      <h2 className="mr-auto text-[14px] font-semibold tracking-[-0.01em] text-ink">Fill missing fields</h2>
      <Select value={missing} options={MISSING} onChange={setMissing} ariaLabel="Missing field" className="h-9 w-44" />
      <span className="text-[13px] text-muted tabular-nums">{!count.loaded ? "…" : `${n(count.data ?? 0)} contacts`}</span>
      <Button onClick={() => void start()} disabled={!count.data}>
        Fill them
      </Button>
      {started !== null ? <span className="anim-rise-sm w-full text-[12.5px] text-sage">Started on {n(started)} contacts</span> : null}
      <ErrorNote message={error} />
    </Panel>
  );
}

// Providers ----------------------------------------------------------------------------------------------------------

const LOGO: Record<string, string> = { coresignal: "coresignal.com", pdl: "peopledatalabs.com" };
const TIMES = [1000, 1500, 2000, 3000, 4000, 6000, 8000, 10000].map((v) => ({ value: v, label: `${v / 1000} s` }));

type SavedSource = { step: string; on: boolean; position: number; timeout_ms: number; has_key: boolean };

function Providers({ sb, ws, role, session }: ViewProps) {
  const owner = role === "owner";
  const [error, setError] = useState("");
  const loaded = useQuery(`enrichment:${ws.id}:providers`, async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [src, runs] = await Promise.all([sb.from("enrich_sources").select("step, on, position, timeout_ms, has_key").eq("workspace_id", ws.id), sb.rpc("enrich_step_rates", { p_ws: ws.id, p_since: since })]);
    const saved = (must(src) ?? []) as SavedSource[];
    const rates = (must(runs) ?? {}) as Record<string, { hit: number; ran: number }>;
    return { sources: orderSources(saved.map((s) => ({ step: s.step as Source["step"], on: s.on, position: s.position, timeoutMs: s.timeout_ms }))), keys: Object.fromEntries(saved.map((s) => [s.step, s.has_key])), rates };
  });
  const [draft, setDraft] = useState<Source[] | null>(null);
  const list = draft ?? loaded.data?.sources ?? null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const save = async (next: Source[]) => {
    setDraft(next);
    setError("");
    const { error: e } = await sb.rpc("enrich_settings_save", { p_ws: ws.id, p_settings: null, p_sources: next.map((s, i) => ({ step: s.step, on: s.on, position: i, timeoutMs: s.timeoutMs })) });
    if (e) setError(e.message);
  };
  const move = (from: number, to: number) => {
    if (!list || to < 0 || to >= list.length) return;
    const next = [...list];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    void save(next);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!list || !e.over || e.active.id === e.over.id) return;
    move(
      list.findIndex((s) => s.step === e.active.id),
      list.findIndex((s) => s.step === e.over!.id),
    );
  };
  const setKey = async (step: string) => {
    const has = loaded.data?.keys[step];
    const key = await askText(has ? "Replace your key" : "Your API key", { placeholder: "Paste the key", ok: "Save" });
    if (key === null) return;
    try {
      await postJson(session, "/api/enrichment/keys", { workspaceId: ws.id, step, key });
      loaded.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const removeKey = async (step: string) => {
    if (!(await askConfirm("Remove your key?", { ok: "Remove", danger: true }))) return;
    try {
      await postJson(session, "/api/enrichment/keys", { workspaceId: ws.id, step, key: "" });
      loaded.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!list) return <Loading />;
  return (
    <>
      <ErrorNote message={error} />
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={list.map((s) => s.step)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2">
            {list.map((s, i) => (
              <ProviderRow
                key={s.step}
                s={s}
                i={i}
                last={i === list.length - 1}
                owner={owner}
                hasKey={!!loaded.data?.keys[s.step]}
                rate={loaded.data?.rates[s.step]}
                onToggle={(on) => void save(list.map((x) => (x.step === s.step ? { ...x, on } : x)))}
                onTime={(t) => void save(list.map((x) => (x.step === s.step ? { ...x, timeoutMs: t } : x)))}
                onMove={(d) => move(i, i + d)}
                onKey={() => void setKey(s.step)}
                onRemoveKey={() => void removeKey(s.step)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <TryEmail {...{ ws, session, owner }} />
    </>
  );
}

function ProviderRow(p: { s: Source; i: number; last: boolean; owner: boolean; hasKey: boolean; rate?: { hit: number; ran: number }; onToggle: (on: boolean) => void; onTime: (t: number) => void; onMove: (d: number) => void; onKey: () => void; onRemoveKey: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.s.step, disabled: !p.owner });
  const def = stepOf(p.s.step)!;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`anim-rise-sm flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-4 py-3.5 transition-shadow duration-[140ms] ${isDragging ? "relative z-10 shadow-float" : "hover:shadow-soft"} ${p.s.on ? "" : "opacity-60"}`}
    >
      {p.owner ? (
        <button type="button" {...attributes} {...listeners} aria-label={`Drag ${def.label}`} className="flex h-8 w-4 cursor-grab items-center justify-center text-faint hover:text-ink active:cursor-grabbing">
          <Grip size={14} />
        </button>
      ) : null}
      <span className="w-4 text-right text-[12px] text-faint tabular-nums">{p.i + 1}</span>
      {LOGO[p.s.step] ? <BrandLogo domain={LOGO[p.s.step]} name={def.label} size={28} /> : <span className="flex size-7 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-muted">@</span>}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{def.label}</span>
        <span className="truncate text-[12.5px] text-muted">{def.gives}</span>
      </div>
      {p.rate?.ran ? (
        <span className="text-[12.5px] text-muted tabular-nums" title={`${p.rate.hit} of ${p.rate.ran} in 30 days`}>
          {pct(p.rate.hit, p.rate.ran)}% found
        </span>
      ) : null}
      {def.byok ? (
        p.hasKey ? (
          <span className="flex items-center gap-1">
            <Badge tone="sky">Your key</Badge>
            {p.owner ? <IconButton label="Remove your key" onClick={p.onRemoveKey}><Trash size={13} /></IconButton> : null}
          </span>
        ) : p.owner ? (
          <Button variant="ghost" onClick={p.onKey}>
            Add your key
          </Button>
        ) : null
      ) : null}
      <Select value={p.s.timeoutMs} options={TIMES} onChange={p.onTime} ariaLabel={`${def.label} time limit`} className="h-8 w-20" disabled={!p.owner} />
      {p.owner ? (
        <span className="flex">
          <IconButton label="Move up" onClick={() => p.onMove(-1)} disabled={p.i === 0}><ArrowUp size={13} /></IconButton>
          <IconButton label="Move down" onClick={() => p.onMove(1)} disabled={p.last}><ArrowDown size={13} /></IconButton>
        </span>
      ) : null}
      <Toggle label={`${def.label} on`} on={p.s.on} onChange={p.onToggle} disabled={!p.owner} />
    </li>
  );
}

type Tried = { person: Record<string, string>; company: Record<string, string | number> | null; steps: StepResult[]; credits: number };

const RESULT: Record<StepResult["result"], { label: string; tone: "green" | "gray" | "amber" | "red" }> = {
  hit: { label: "Found", tone: "green" },
  miss: { label: "Not found", tone: "gray" },
  skipped: { label: "Skipped", tone: "gray" },
  error: { label: "Error", tone: "red" },
  cap: { label: "At the cap", tone: "amber" },
  time: { label: "Too slow", tone: "amber" },
};
const STEP_LABEL: Record<string, string> = { records: "Your records", cache: "Saved lookups", ...Object.fromEntries(STEPS.map((s) => [s.id, s.label])) };

function TryEmail({ ws, session, owner }: Pick<ViewProps, "ws" | "session"> & { owner: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState<Tried | null>(null);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setTried(await postJson<Tried>(session, "/api/enrichment/try", { workspaceId: ws.id, email }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const rows = tried
    ? ([
        ["Name", [tried.person.first_name, tried.person.last_name].filter(Boolean).join(" ")],
        ["Title", tried.person.title],
        ["Seniority", tried.person.seniority],
        ["Department", tried.person.department],
        ["Company", tried.company?.name],
        ["Size", tried.company?.size],
        ["Industry", tried.company?.industry],
        ["Country", tried.company?.country ?? tried.person.country],
      ] as [string, string | number | undefined][])
    : [];
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h2 className="mr-auto text-[14px] font-semibold tracking-[-0.01em] text-ink">Try an email</h2>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void run();
          }}
        >
          <label className="relative flex items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dana@acme.com" aria-label="Email" className="h-9 w-60 pl-8" disabled={!owner} />
          </label>
          <Button type="submit" disabled={busy || !email.trim() || !owner}>
            Look up
          </Button>
        </form>
      </div>
      <div className="px-5 py-4">
        <ErrorNote message={error} />
        {tried ? (
          <div className="anim-rise-sm flex flex-col gap-4">
            <ol className="flex flex-wrap gap-2">
              {tried.steps.map((s, i) => (
                <li key={`${s.step}-${i}`} className="flex items-center gap-1.5 text-[12.5px] text-body" title={s.note}>
                  <span>{STEP_LABEL[s.step] ?? s.step}</span>
                  <Badge tone={RESULT[s.result].tone}>{RESULT[s.result].label}</Badge>
                  {i < tried.steps.length - 1 ? <span className="text-faint">→</span> : null}
                </li>
              ))}
            </ol>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className={v ? "text-ink" : "text-faint"}>{v || "Empty"}</dd>
                </div>
              ))}
            </dl>
            <span className="text-[12px] text-faint tabular-nums">{tried.credits ? `${tried.credits} credit${tried.credits > 1 ? "s" : ""} used` : "No credit used"}</span>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// Rules --------------------------------------------------------------------------------------------------------------

const WHEN: { value: string; label: string }[] = [
  { value: "form", label: "Forms" },
  { value: "booking", label: "Booking pages" },
  { value: "api", label: "API" },
  { value: "manual", label: "Added by hand" },
  { value: "import", label: "Imports" },
  { value: "crm", label: "CRM sync" },
];
const AGAIN = [30, 60, 90, 180, 365].map((d) => ({ value: d, label: `${d} days` }));

type Settings = { on: boolean; sources: string[]; skip_free: boolean; rescan_days: number };
const DEFAULTS: Settings = { on: true, sources: ["form", "booking", "api", "manual"], skip_free: true, rescan_days: 90 };

function Rules(props: ViewProps) {
  return (
    <>
      <WhenRules {...props} />
      <QualifyRules {...props} />
    </>
  );
}

function WhenRules({ sb, ws, role }: ViewProps) {
  const owner = role === "owner";
  const [error, setError] = useState("");
  const loaded = useLoad(async () => ((must(await sb.from("enrich_settings").select("on, sources, skip_free, rescan_days").eq("workspace_id", ws.id).maybeSingle()) as Settings | null) ?? DEFAULTS), ws.id);
  const [draft, setDraft] = useState<Settings | null>(null);
  const s = draft ?? loaded.data;
  const save = async (next: Settings) => {
    setDraft(next);
    setError("");
    const { error: e } = await sb.rpc("enrich_settings_save", { p_ws: ws.id, p_settings: next, p_sources: null });
    if (e) setError(e.message);
  };
  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!s) return <Loading />;
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <h2 className="mr-auto text-[14px] font-semibold tracking-[-0.01em] text-ink">When to enrich</h2>
        <Toggle label="Enrich new contacts" on={s.on} onChange={(on) => void save({ ...s, on })} disabled={!owner} />
      </div>
      <div className={`flex flex-col divide-y divide-line ${s.on ? "" : "opacity-60"}`}>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <span className="mr-2 w-44 text-[13px] text-ink">New contacts from</span>
          {WHEN.map((w) => {
            const yes = s.sources.includes(w.value);
            return (
              <button
                key={w.value}
                type="button"
                aria-pressed={yes}
                disabled={!owner}
                onClick={() => void save({ ...s, sources: yes ? s.sources.filter((x) => x !== w.value) : [...s.sources, w.value] })}
                className={`press inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] disabled:opacity-60 ${yes ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-body hover:text-ink"}`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="mr-auto text-[13px] text-ink">Skip personal emails</span>
          <Toggle label="Skip personal emails" on={s.skip_free} onChange={(skip_free) => void save({ ...s, skip_free })} disabled={!owner} />
        </div>
        <div className="flex items-center gap-3 px-5 py-3">
          <span className="mr-auto text-[13px] text-ink">Look the same person up again after</span>
          <Select value={s.rescan_days} options={AGAIN} onChange={(rescan_days) => void save({ ...s, rescan_days })} ariaLabel="Look again after" className="h-8 w-28" disabled={!owner} />
        </div>
      </div>
      <ErrorNote message={error} />
    </Panel>
  );
}

const FIELDS = BASE_FIELDS.filter((f) => f.key !== "lead.qualify" && f.key !== "lead.form" && f.key !== "company.type");

function QualifyRules({ sb, ws, role, session }: ViewProps) {
  const owner = role === "owner";
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const loaded = useLoad(async () => {
    const r = must(await sb.from("qualify_settings").select("on, outcomes, rules").eq("workspace_id", ws.id).maybeSingle()) as QualifySettings | null;
    return r ? cleanQualify(r) : DEFAULT_QUALIFY;
  }, ws.id);
  const [draft, setDraft] = useState<QualifySettings | null>(null);
  const q = draft ?? loaded.data;
  if (loaded.error) return <ErrorNote message={loaded.error} />;
  if (!q) return <Loading />;
  const edit = (next: QualifySettings) => {
    setDraft(next);
    setSaved(false);
  };
  const save = async (next = q) => {
    setError("");
    try {
      const r = await postJson<{ settings: QualifySettings }>(session, "/api/enrichment/qualify", { workspaceId: ws.id, settings: next });
      setDraft(r.settings);
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const names = q.outcomes.map((o) => ({ value: o.label, label: o.label }));
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <AiMark size={16} />
        <h2 className="mr-auto text-[14px] font-semibold tracking-[-0.01em] text-ink">Qualify</h2>
        <Toggle
          label="Qualify new leads"
          on={q.on}
          onChange={(on) => {
            const next = { ...q, on };
            edit(next);
            void save(next);
          }}
          disabled={!owner}
        />
      </div>
      <div className={`flex flex-col gap-5 px-5 py-4 ${q.on ? "" : "opacity-60"}`}>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-muted">Outcomes</span>
          {q.outcomes.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label="Outcome" value={o.label} onChange={(e) => edit({ ...q, outcomes: q.outcomes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="h-9 w-40" disabled={!owner} />
              <Input aria-label="What it means" value={o.meaning} onChange={(e) => edit({ ...q, outcomes: q.outcomes.map((x, j) => (j === i ? { ...x, meaning: e.target.value } : x)) })} className="h-9 flex-1" disabled={!owner} />
              {owner ? (
                <IconButton label="Remove outcome" onClick={() => edit({ ...q, outcomes: q.outcomes.filter((_, j) => j !== i) })} disabled={q.outcomes.length <= 1}>
                  <Trash size={13} />
                </IconButton>
              ) : null}
            </div>
          ))}
          {owner && q.outcomes.length < 5 ? (
            <button type="button" onClick={() => edit({ ...q, outcomes: [...q.outcomes, { label: "", meaning: "" }] })} className="press inline-flex h-8 w-fit items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:text-ink">
              <Plus size={13} /> Outcome
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-medium text-muted">Rules that decide first</span>
          {q.rules.map((r, i) => {
            const c = r.conds[0];
            const def = FIELDS.find((f) => f.key === c?.field) ?? FIELDS[0]!;
            const ops = opsFor(def.type).map((o) => ({ value: o, label: OPS.find((x) => x.value === o)?.label ?? o }));
            const setRule = (patch: Partial<typeof r>) => edit({ ...q, rules: q.rules.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="text-muted">If</span>
                <Select value={def.key} options={FIELDS.map((f) => ({ value: f.key, label: f.label }))} onChange={(field) => setRule({ conds: [{ field, op: opsFor(FIELDS.find((f) => f.key === field)!.type)[0]!, value: "" }] })} ariaLabel="Field" className="h-8 w-40" disabled={!owner} />
                <Select value={c?.op ?? ops[0]!.value} options={ops} onChange={(op) => setRule({ conds: [{ ...c!, op }] })} ariaLabel="Test" className="h-8 w-32" disabled={!owner} />
                {c && needsValue(c.op) ? (
                  <Input aria-label="Value" value={Array.isArray(c.value) ? c.value.join(", ") : String(c.value ?? "")} onChange={(e) => setRule({ conds: [{ ...c, value: ["one_of", "not_one_of"].includes(c.op) ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : e.target.value }] })} className="h-8 w-40" disabled={!owner} />
                ) : null}
                <span className="text-muted">then</span>
                <Select value={r.outcome} options={names} onChange={(outcome) => setRule({ outcome })} ariaLabel="Outcome" className="h-8 w-36" disabled={!owner} />
                {owner ? (
                  <IconButton label="Remove rule" onClick={() => edit({ ...q, rules: q.rules.filter((_, j) => j !== i) })}>
                    <Trash size={13} />
                  </IconButton>
                ) : null}
              </div>
            );
          })}
          {owner && q.rules.length < 20 ? (
            <button
              type="button"
              onClick={() => edit({ ...q, rules: [...q.rules, { id: `q${Date.now().toString(36)}`, outcome: q.outcomes[1]?.label ?? q.outcomes[0]!.label, match: "all", conds: [{ field: "contact.email_class", op: "one_of", value: ["free"] }] }] })}
              className="press inline-flex h-8 w-fit items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[12.5px] font-medium text-body hover:text-ink"
            >
              <Plus size={13} /> Rule
            </button>
          ) : null}
        </div>
        {owner ? (
          <div className="flex items-center gap-3">
            <Button onClick={() => void save()} disabled={!draft}>
              Save
            </Button>
            {saved ? <span className="anim-rise-sm text-[12.5px] text-sage">Saved</span> : null}
          </div>
        ) : null}
        <ErrorNote message={error} />
      </div>
    </Panel>
  );
}

// History ------------------------------------------------------------------------------------------------------------

type Run = { id: number; created_at: string; trigger: string; steps: StepResult[]; fields: string[]; credits: number; ms: number; contact: { id: string; email: string; first_name: string | null; last_name: string | null; qualify_outcome: string | null; qualify_by: string | null } | null };
type Filter = "all" | "found" | "missed" | "errors";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "found", label: "Found" },
  { value: "missed", label: "Nothing found" },
  { value: "errors", label: "Errors" },
];
const VENDOR = new Set(["coresignal", "pdl"]);
const TRIGGER: Record<string, string> = { new: "New contact", form: "Form", backfill: "Backfill", try: "Tried", workflow: "Workflow", again: "Again" };

function History({ sb, ws, navigate }: ViewProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const list = useLoad(
    async () =>
      (must(
        await sb
          .from("enrich_runs")
          .select("id, created_at, trigger, steps, fields, credits, ms, contact:contacts(id, email, first_name, last_name, qualify_outcome, qualify_by)")
          .eq("workspace_id", ws.id)
          .order("created_at", { ascending: false })
          .limit(300),
      ) ?? []) as unknown as Run[],
    ws.id,
  );
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <Empty sketch={<Sketch name="cards" size={150} />} title="Nothing filled yet" />;
  const shown = list.data.filter((r) => {
    const vendor = r.steps.filter((s) => VENDOR.has(s.step));
    if (filter === "found") return r.fields.length > 0;
    if (filter === "missed") return !r.fields.length && vendor.some((s) => s.result === "miss");
    if (filter === "errors") return vendor.some((s) => s.result === "error" || s.result === "time");
    return true;
  });
  return (
    <>
      <Segmented value={filter} options={FILTERS} onChange={setFilter} label="Show" />
      <ul className="overflow-hidden rounded-2xl border border-line bg-card">
        {shown.map((r, i) => {
          const c = r.contact;
          const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email : "An email you tried";
          return (
            <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${i ? "border-t border-line" : ""}`}>
              <button type="button" disabled={!c} onClick={() => c && navigate("contacts", c.id)} className="flex min-w-0 flex-1 flex-col text-left disabled:cursor-default">
                <span className="truncate text-[13.5px] font-medium text-ink">{name}</span>
                <span className="truncate text-[12px] text-muted">{r.fields.length ? `Filled ${r.fields.map((f) => f.replace(/^company\./, "company ").replace(/_/g, " ")).join(", ")}` : "Nothing new"}</span>
              </button>
              <span className="flex flex-wrap gap-1">
                {r.steps
                  .filter((s) => VENDOR.has(s.step) && s.result !== "skipped")
                  .map((s, j) => (
                    <Badge key={j} tone={RESULT[s.result].tone}>
                      {STEP_LABEL[s.step]}: {RESULT[s.result].label}
                    </Badge>
                  ))}
              </span>
              {c?.qualify_outcome ? (
                <span className="flex items-center gap-1">
                  <Badge tone="violet">{c.qualify_outcome}</Badge>
                  {c.qualify_by === "ai" ? <AiTag /> : null}
                </span>
              ) : null}
              <span className="w-16 shrink-0 text-right text-[12px] text-faint tabular-nums">{r.credits ? `${r.credits} cr` : ""}</span>
              <span className="w-24 shrink-0 text-right text-[12px] text-faint" title={TRIGGER[r.trigger] ?? r.trigger}>
                {timeAgo(r.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
