"use client";

// Submissions (docs/forms-plan.md 1.1): the funnel for the last 30 days (saw the form, started, sent, booked), then
// Leads, Left early and Spam. Leads and Spam are fills in pages of 50 with search, a date range, the columns the team
// picked, check boxes and a black bulk bar; a row opens its 400 px panel with the answers, the lead, where it synced
// (with Try again), where it came from, and Mark as spam or Delete. Left early is visits that started the form and
// didn't send it, with the field they were in, never their answers.

import { useEffect, useMemo, useState } from "react";
import { answerText, cleanFilters, csvHead, csvRow, fillColumns, fromFor, RANGES, type Column } from "@/lib/forms/results";
import { allFields, type Form } from "@/lib/forms/schema";
import { entryOf } from "@/lib/sources/catalog";
import { Popover } from "../FilterBar";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { usePeople } from "../meetings/parts";
import { Badge, ErrorNote, errorText, Loading, must, postJson, useLoad, type ViewProps } from "../ui";
import { Eyebrow, PanelFooter, PanelSection } from "../scheduling/panel";
import { ago } from "./formModel";
import { Ic } from "./ic";
import { GHOST, GHOST_SM, GHOST_SM_RED, IB, LINK, Seg, SegN, useNote, Tg } from "./parts";
import type { Destination, SourceRow } from "./shared";

type Fill = {
  id: string;
  created_at: string;
  values: Record<string, unknown>;
  hidden: Record<string, string>;
  spam: boolean;
  spam_reason: string | null;
  form_version: number;
  contact_id: string | null;
  contacts: { email: string | null; first_name: string | null; last_name: string | null; owner_user_id: string | null; score: number | null } | null;
  deliveries: { id: string; status: string; error: string | null; external_url: string | null; destination_id: string; updated_at: string }[];
  meetings: { id: string; status: string; start_at: string }[];
};
type Left = { started_at: string; left_field: string | null; step: number };
type View = "leads" | "partial" | "spam";

const SELECT = "id, created_at, values, hidden, spam, spam_reason, form_version, contact_id, contacts(email, first_name, last_name, owner_user_id, score), deliveries(id, status, error, external_url, destination_id, updated_at), meetings(id, status, start_at)";
const PAGE = 50;
export const SPAM_WORDS: Record<string, string> = {
  trap: "Filled the hidden box",
  too_fast: "Faster than a person can type",
  marked: "Marked by you",
  turnstile: "Failed the bot check",
  site: "Not on your site list",
  rate: "Over the hourly limit",
  throwaway: "Throwaway email",
  routing: "Failed the spam check",
};
const SPAM_WHY: Record<string, string> = {
  trap: "It filled a box people never see.",
  too_fast: "It was sent faster than a person can type.",
  marked: "Someone on the team marked it.",
  turnstile: "It didn't pass the bot check.",
  site: "It came from a site that isn't on the form's list.",
  rate: "The form took more fills than its hourly limit.",
  throwaway: "The email is a throwaway inbox.",
  routing: "It failed the spam check before routing.",
};

const slot = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export function Submissions(props: ViewProps & { form: Form; formId: string; dests: Destination[]; sources: SourceRow[]; onFix: (fieldId: string) => void; start?: View }) {
  const { sb, session, ws, form, formId, dests, sources, navigate } = props;
  const [view, setView] = useState<View>(props.start ?? "leads");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("30");
  const [rows, setRows] = useState<Fill[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [rangeAt, setRangeAt] = useState<HTMLElement | null>(null);
  const [colsAt, setColsAt] = useState<HTMLElement | null>(null);
  const note = useNote();
  const people = usePeople(sb, ws.id);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const from = useMemo(() => fromFor(range), [range]);
  const filters = useMemo(() => cleanFilters({ kind: view === "spam" ? "spam" : "leads", q, from }), [view, q, from]);
  const fkey = JSON.stringify(filters);

  // The funnel: views and starts from the form's beacons, sends and bookings from its fills.
  const funnel = useLoad(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const day = since.toISOString().slice(0, 10);
    const [daily, sent, booked] = await Promise.all([
      sb.from("form_daily").select("views, starts").eq("form_id", formId).gte("day", day),
      sb.rpc("form_fill_count", { p_form: formId, p_filters: { kind: "leads", from: since.toISOString() } }),
      sb.rpc("form_fill_count", { p_form: formId, p_filters: { kind: "leads", from: since.toISOString(), booked: true } }),
    ]);
    const d = (daily.data ?? []) as { views: number; starts: number }[];
    return { views: d.reduce((a, x) => a + x.views, 0), starts: d.reduce((a, x) => a + x.starts, 0), sent: Number(sent.data ?? 0), booked: Number(booked.data ?? 0) };
  }, `${formId}:${tick}`);
  const counts = useLoad(async () => {
    const [leads, spam, left] = await Promise.all([
      sb.rpc("form_fill_count", { p_form: formId, p_filters: cleanFilters({ kind: "leads", from }) }),
      sb.rpc("form_fill_count", { p_form: formId, p_filters: cleanFilters({ kind: "spam", from }) }),
      sb.rpc("form_left_early", { p_form: formId, p_from: from ? from.slice(0, 10) : null, p_limit: 100 }),
    ]);
    return { leads: Number(leads.data ?? 0), spam: Number(spam.data ?? 0), left: (left.data ?? { count: 0, rows: [] }) as { count: number; rows: Left[] } };
  }, `${formId}:${from}:${tick}`);
  const meta = useLoad(async () => {
    // The columns come from the last 50 versions' questions (not every body ever published).
    const [vers, f] = await Promise.all([sb.from("form_versions").select("version, body").eq("form_id", formId).order("version", { ascending: false }).limit(50), sb.from("forms").select("results_columns").eq("id", formId).maybeSingle()]);
    return { cols: fillColumns((vers.data ?? []) as { version: number; body: Form }[]), picked: (f.data as { results_columns: string[] | null } | null)?.results_columns ?? null };
  }, `${formId}:${tick}`);

  // A page of fills; Show more adds the next one.
  const loadPage = async (after: Fill | null) => {
    const ids = must(await sb.rpc("form_fill_ids", { p_form: formId, p_filters: filters, p_after_at: after?.created_at ?? null, p_after_id: after?.id ?? null, p_limit: PAGE })) as string[];
    if (!ids.length) return [] as Fill[];
    const got = (must(await sb.from("submissions").select(SELECT).in("id", ids)) ?? []) as unknown as Fill[];
    const by = new Map(got.map((r) => [r.id, r]));
    return ids.map((id) => by.get(id)).filter((r): r is Fill => !!r);
  };
  useEffect(() => {
    if (view === "partial") return;
    let live = true;
    loadPage(null)
      .then((r) => {
        if (!live) return;
        setRows(r);
        setMore(r.length === PAGE);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fkey, tick, view]);

  const fields = allFields(form);
  const allCols = meta.data?.cols ?? fields.filter((f) => f.type !== "heading" && f.type !== "paragraph").map((f): Column => ({ key: f.key, label: f.label || f.key, field: f }));
  const hasCompany = allCols.some((c) => c.key === "company");
  const answerCols = allCols.filter((c) => !["email", "name", "first_name", "last_name", "company"].includes(c.key) && c.field?.type !== "hidden");
  const pickedKeys = meta.data?.picked ?? answerCols.filter((c) => c.field && (c.field.type === "choice" || c.field.type === "dropdown")).slice(0, 1).map((c) => c.key);
  const shownCols = pickedKeys.map((k) => answerCols.find((c) => c.key === k)).filter((c): c is Column => !!c);
  const destName = (id: string) => dests.find((d) => d.id === id)?.name ?? "Removed destination";
  const destLogo = (id: string) => {
    const d = dests.find((x) => x.id === id);
    const kind = d?.kind === "source" ? sources.find((s) => s.id === d.source_id)?.kind : d?.kind === "slack" ? "slack" : "";
    const domain = kind === "slack" ? "slack.com" : (entryOf(kind ?? "")?.domain ?? "");
    return domain ? <BrandLogo domain={domain} name={d?.name ?? ""} size={18} /> : <span className="inline-flex size-[18px] items-center justify-center rounded-[5px] bg-paper-deep text-body"><Ic n="code" s={11} /></span>;
  };
  const nameOf = (s: Fill) => [s.contacts?.first_name, s.contacts?.last_name].filter(Boolean).join(" ") || String(s.values.name ?? [s.values.first_name, s.values.last_name].filter(Boolean).join(" ") ?? "");
  const emailOf = (s: Fill) => s.contacts?.email ?? String(s.values.email ?? "");
  const rep = (s: Fill) => (s.contacts?.owner_user_id ? (people.data?.byId.get(s.contacts.owner_user_id)?.name ?? "Former teammate") : s.contact_id ? "Not routed" : "");
  const meeting = (s: Fill) => {
    const m = [...(s.meetings ?? [])].sort((a, b) => (a.status === "canceled" ? 1 : 0) - (b.status === "canceled" ? 1 : 0))[0];
    if (!m) return <span className="text-faint">None</span>;
    if (m.status === "canceled") return <Badge>Booked, then canceled</Badge>;
    return (
      <Badge tone="green" dot>
        {slot(m.start_at)}
      </Badge>
    );
  };
  const syncCell = (s: Fill) => {
    const failed = s.deliveries.find((d) => d.status === "failed");
    if (failed) return <Badge tone="red">Not synced</Badge>;
    const done = s.deliveries.find((d) => d.status === "done");
    if (done)
      return (
        <Badge tone="green" dot>
          {destName(done.destination_id)}
        </Badge>
      );
    if (s.deliveries.length) return <Badge>Sending</Badge>;
    return <span className="text-faint">None</span>;
  };

  const run = async (fn: () => Promise<unknown>, words?: string) => {
    setError("");
    try {
      await fn();
      if (words) note.show(words);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const reload = () => setTick((t) => t + 1);
  /** Rows leave the list at once; the counts are read again; a failure reads the list again. */
  const drop = async (ids: string[], fn: () => Promise<void>) => {
    const was = rows;
    setRows((r) => (r ? r.filter((x) => !ids.includes(x.id)) : r));
    setOpen(null);
    setSel(new Set());
    try {
      await fn();
    } catch (e) {
      setRows(was);
      throw e;
    }
    counts.reload();
    funnel.reload();
  };
  const picked = (rows ?? []).filter((r) => sel.has(r.id));
  const replay = (list: Fill[]) =>
    run(async () => {
      const ids = list.flatMap((s) => s.deliveries.filter((d) => d.status === "failed").map((d) => d.id));
      if (!ids.length) return;
      must(await sb.rpc("deliveries_replay", { p_ids: ids }));
      reload();
    }, "Sent again");
  const markSpam = (list: Fill[], spam: boolean) =>
    run(
      () =>
        drop(
          list.map((r) => r.id),
          async () => {
            if (spam) must(await sb.rpc("submissions_mark_spam", { p_ids: list.map((r) => r.id), p_spam: true }));
            else {
              // A lead from before (marked by hand) only leaves Spam. A fill with no lead yet, or one the routing spam
              // check caught, goes through the server: it becomes a lead and is routed.
              const server = (r: Fill) => !r.contact_id || r.spam_reason === "routing";
              const marked = list.filter((r) => !server(r)).map((r) => r.id);
              if (marked.length) must(await sb.rpc("submissions_mark_spam", { p_ids: marked, p_spam: false }));
              const rest = list.filter(server).map((r) => r.id);
              if (rest.length) {
                const r = await postJson<{ released: number; errors: Record<string, string> }>(session, "/api/forms/release", { workspaceId: ws.id, ids: rest });
                const first = Object.values(r.errors)[0];
                if (first) throw new Error(first);
              }
            }
          },
        ),
      spam ? "Moved to Spam. The contact's alerts and emails stop." : "Let in. Routing, alerts and the auto-reply run now.",
    );
  const remove = async (list: Fill[]) => {
    const n = list.length;
    if (!(await askConfirm(`Delete ${n === 1 ? "this submission" : `${n} submissions`}?`, { body: "The answers go. The contacts stay. HubSpot keeps what it already has.", ok: "Delete", danger: true }))) return;
    await run(() => drop(list.map((r) => r.id), async () => void must(await sb.rpc("submissions_delete", { p_ids: list.map((r) => r.id) }))), n === 1 ? "Submission deleted" : `${n} submissions deleted`);
  };
  const exportAll = () =>
    run(async () => {
      const res = await fetch(`/api/forms/${formId}/export?filters=${encodeURIComponent(fkey)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The export didn't finish.");
      download(await res.blob(), /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "answers.csv");
    }, "Export started. It downloads in a moment.");
  const exportPicked = () => {
    const cols = allCols;
    const lines = [...csvHead(cols), ...picked.map((s) => csvRow(cols, s))].map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","));
    download(new Blob([lines.join("\n")], { type: "text/csv" }), "answers.csv");
    note.show("Exported");
  };
  // The columns change at once; they go back if the save fails.
  const saveCols = (keys: string[]) =>
    run(async () => {
      const was = meta.data;
      if (was) meta.set({ ...was, picked: keys });
      try {
        must(await sb.rpc("form_results_columns", { p_form: formId, p_cols: keys }));
      } catch (e) {
        if (was) meta.set(was);
        throw e;
      }
    });

  const f = funnel.data;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}% of` : "");
  const steps: [string, number | undefined, string, number][] = [
    ["Saw the form", f?.views, "Last 30 days", 100],
    ["Started", f?.starts, f && f.views ? `${pct(f.starts, f.views)} views` : "", f && f.views ? (f.starts / f.views) * 100 : 0],
    ["Sent", f?.sent, f && f.starts ? `${pct(f.sent, f.starts)} starts` : "", f && f.views ? (f.sent / f.views) * 100 : 0],
    ["Booked", f?.booked, f && f.sent ? `${pct(f.booked, f.sent)} sends` : "", f && f.views ? (f.booked / f.views) * 100 : 0],
  ];
  const openRow = rows?.find((r) => r.id === open) ?? null;
  const all = rows ?? [];
  const head = view === "spam" ? ["Sent", "Name", "Why", "From"] : ["Sent", "Name", ...(hasCompany ? ["Company"] : []), ...shownCols.map((c) => c.label), "Rep", "Meeting", "Sync"];
  const leftLabel = (id: string | null) => (id ? (fields.find((x) => x.id === id)?.label || "A question that's gone") : "Before the first question");

  return (
    <>
      <div className="grid shrink-0 grid-cols-4 border-b border-line max-[860px]:grid-cols-2">
        {steps.map(([label, n, sub, w], i) => (
          <div key={label} className={`relative flex flex-col gap-[2px] border-line px-[16px] py-[12px] ${i ? "border-l" : ""} max-[860px]:[&:nth-child(3)]:border-l-0 max-[860px]:[&:nth-child(n+3)]:border-t`}>
            <span className="text-[12px] text-muted">{label}</span>
            <b className="text-[20px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{n === undefined ? "–" : n.toLocaleString("en-US")}</b>
            <em className={`text-[11.5px] font-medium not-italic ${i ? "text-signal" : "text-muted"}`}>{sub || " "}</em>
            <div className="mt-[6px] h-[3px] overflow-hidden rounded-full bg-paper-deep">
              <i className="block h-full bg-ink" style={{ width: `${Math.min(100, Math.max(w ? 1 : 0, w))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className={`relative grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] ${openRow ? "grid-cols-[minmax(0,1fr)_400px] max-[860px]:grid-cols-1" : "grid-cols-[minmax(0,1fr)]"}`}>
        <div className="flex min-h-0 min-w-0 flex-col">
          {sel.size && view !== "partial" ? (
            <div className="anim-rise-sm flex shrink-0 items-center gap-[8px] bg-ink px-[16px] py-[8px] text-card">
              <b className="font-semibold">{`${sel.size} selected`}</b>
              <span className="flex-1" />
              <BulkBtn onClick={exportPicked}>Export</BulkBtn>
              {view === "spam" ? <BulkBtn onClick={() => void markSpam(picked, false)}>Not spam</BulkBtn> : <BulkBtn onClick={() => void replay(picked)}>{`Send to ${dests.find((d) => d.kind === "source")?.name ?? "CRM"} again`}</BulkBtn>}
              <BulkBtn onClick={() => void remove(picked)}>Delete</BulkBtn>
              <BulkBtn onClick={() => setSel(new Set())} label="Clear">
                <Ic n="x" />
              </BulkBtn>
            </div>
          ) : (
            <div className="flex shrink-0 flex-wrap items-center gap-[8px] border-b border-line px-[16px] py-[10px]">
              <Seg
                label="Submissions"
                value={view}
                onChange={(v) => (setView(v), setOpen(null), setSel(new Set()), setRows(null))}
                options={[
                  { value: "leads", label: <>Leads <SegN n={counts.data?.leads ?? "–"} /></> },
                  { value: "partial", label: <>Left early <SegN n={counts.data?.left.count ?? "–"} /></> },
                  { value: "spam", label: <>Spam <SegN n={counts.data?.spam ?? "–"} /></> },
                ]}
              />
              {view !== "partial" ? (
                <label className={`flex h-[32px] max-w-full items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:border-ink ${openRow ? "w-[170px]" : "w-[240px]"}`}>
                  <Ic n="search" />
                  <input value={text} onChange={(e) => (setText(e.target.value), setSel(new Set()))} placeholder="Search" aria-label="Search submissions" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
                </label>
              ) : null}
              <span className="flex-1" />
              <button type="button" className={GHOST} onClick={(e) => setRangeAt(e.currentTarget)}>
                <Ic n="cal" />
                {RANGES.find((r) => r.value === range)?.label.replace(/^Last /, "") ?? "Any time"}
              </button>
              {openRow || view === "partial" ? null : (
                <button type="button" className={GHOST} onClick={(e) => setColsAt(e.currentTarget)}>
                  Columns
                </button>
              )}
              {view !== "partial" ? (
                <button type="button" className={openRow ? IB : GHOST} onClick={() => void exportAll()} title="Export CSV" aria-label="Export CSV">
                  <Ic n="down" />
                  {openRow ? null : "Export CSV"}
                </button>
              ) : null}
            </div>
          )}
          <ErrorNote message={error || funnel.error || counts.error} />
          <div className="min-h-0 flex-1 overflow-auto">
            {view === "partial" ? (
              !counts.data ? (
                <Loading />
              ) : counts.data.left.rows.length ? (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {["Started", "Where they left", "Step"].map((h) => (
                        <Th key={h}>{h}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {counts.data.left.rows.map((r, i) => (
                      <tr key={`${r.started_at}${i}`}>
                        <Td>{ago(r.started_at)}</Td>
                        <Td>{leftLabel(r.left_field)}</Td>
                        <Td>{form.steps.length > 1 ? `Step ${r.step + 1}` : "One page"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyLine title="Nobody left early" />
              )
            ) : !rows ? (
              <Loading />
            ) : !rows.length ? (
              <EmptyLine title={q ? "No matches" : view === "spam" ? "No spam" : "Nothing here yet"} />
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <Th className="w-[36px]">
                      <Check on={sel.size > 0 && sel.size === all.length} label="Select all" onClick={() => setSel(sel.size === all.length ? new Set() : new Set(all.map((r) => r.id)))} />
                    </Th>
                    {head.map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const who = (
                      <div className="flex flex-col leading-[1.3]">
                        <b className="font-medium text-ink">{nameOf(s) || emailOf(s)}</b>
                        {nameOf(s) ? <span className="text-[12px] text-muted">{emailOf(s)}</span> : null}
                      </div>
                    );
                    const cells: React.ReactNode[] =
                      view === "spam"
                        ? [ago(s.created_at), who, <Badge key="w" tone="amber">{SPAM_WORDS[s.spam_reason ?? ""] ?? "Spam"}</Badge>, (s.hidden.page ?? "").replace(/^https?:\/\//, "") || "Hosted page"]
                        : [
                            ago(s.created_at),
                            who,
                            ...(hasCompany ? [String(s.values.company ?? "") || <span key="c" className="text-faint">None</span>] : []),
                            ...shownCols.map((c) => answerText(c, s.values[c.key]) || <span key={c.key} className="text-faint">None</span>),
                            rep(s) || <span key="r" className="text-faint">None</span>,
                            meeting(s),
                            syncCell(s),
                          ];
                    return (
                      <tr key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className={`group cursor-pointer ${open === s.id ? "[&>td]:bg-paper-deep" : "hover:[&>td]:bg-paper"}`}>
                        <Td className="w-[36px]">
                          <Check
                            on={sel.has(s.id)}
                            label={`Select ${nameOf(s) || emailOf(s)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const n = new Set(sel);
                              if (n.has(s.id)) n.delete(s.id);
                              else n.add(s.id);
                              setSel(n);
                            }}
                          />
                        </Td>
                        {cells.map((c, i) => (
                          <Td key={i}>{c}</Td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {rows && more && view !== "partial" ? (
              <div className="flex justify-center py-[12px]">
                <button
                  type="button"
                  className={GHOST_SM}
                  onClick={() =>
                    void loadPage(rows[rows.length - 1] ?? null).then((r) => {
                      setRows([...rows, ...r]);
                      setMore(r.length === PAGE);
                    })
                  }
                >
                  Show more
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {openRow ? (
          <RowPanel
            key={`${openRow.id}:${openRow.spam}`}
            s={openRow}
            form={form}
            name={nameOf(openRow) || emailOf(openRow)}
            rep={rep(openRow)}
            dests={dests}
            destName={destName}
            destLogo={destLogo}
            onClose={() => setOpen(null)}
            onContact={() => openRow.contact_id && navigate("contacts", openRow.contact_id)}
            onReplay={() => void replay([openRow])}
            onSpam={(v) => void markSpam([openRow], v)}
            onDelete={() => void remove([openRow])}
            onFix={props.onFix}
          />
        ) : null}
      </div>
      {rangeAt ? (
        <Popover anchor={rangeAt} onClose={() => setRangeAt(null)} width={200}>
          <div role="listbox" className="flex flex-col p-[4px]">
            {RANGES.map((r) => (
              <button key={r.value} type="button" role="option" aria-selected={range === r.value} onClick={() => (setRange(r.value), setRangeAt(null), setSel(new Set()))} className={`flex h-[32px] items-center justify-between rounded-md px-[10px] text-left hover:bg-hover ${range === r.value ? "font-medium" : ""}`}>
                {r.label}
                {range === r.value ? <Ic n="check" /> : null}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
      {colsAt ? (
        <Popover anchor={colsAt} onClose={() => setColsAt(null)} width={260}>
          <div className="flex max-h-[320px] flex-col overflow-y-auto p-[8px]">
            {answerCols.length ? (
              answerCols.map((c) => (
                <div key={c.key} className="flex h-[32px] items-center justify-between gap-[8px] rounded-md px-[6px] hover:bg-hover">
                  <span className="truncate">{c.label}</span>
                  <Tg label={c.label} on={pickedKeys.includes(c.key)} onChange={(v) => void saveCols(v ? [...pickedKeys, c.key] : pickedKeys.filter((k) => k !== c.key))} />
                </div>
              ))
            ) : (
              <p className="px-[6px] py-[8px] text-muted">No other answers</p>
            )}
          </div>
        </Popover>
      ) : null}
      {note.node}
    </>
  );
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

const Th = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`sticky top-0 z-[1] border-b border-line bg-paper px-[12px] py-[9px] text-left text-[12px] font-medium whitespace-nowrap text-muted ${className}`}>{children}</th>
);
const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`h-[52px] max-w-[220px] truncate border-b border-line px-[12px] whitespace-nowrap ${className}`}>{children}</td>
);
const EmptyLine = ({ title }: { title: string }) => (
  <div className="flex flex-col items-center px-[16px] py-[56px] text-center">
    <b className="font-medium text-ink">{title}</b>
  </div>
);

function Check({ on, label, onClick }: { on: boolean; label: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} className={`inline-flex size-[16px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] align-middle text-card ${on ? "border-ink bg-ink" : "border-line-strong"}`}>
      {on ? <Ic n="check" s={10} /> : null}
    </button>
  );
}

function BulkBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="press h-[28px] rounded-full border border-card/20 px-[12px] text-[12.5px] text-card hover:bg-card/10">
      {children}
    </button>
  );
}

/** One fill: its answers, the lead, where it went, where it came from. */
function RowPanel({ s, form, name, rep, dests, destName, destLogo, onClose, onContact, onReplay, onSpam, onDelete, onFix }: {
  s: Fill;
  form: Form;
  name: string;
  rep: string;
  dests: Destination[];
  destName: (id: string) => string;
  destLogo: (id: string) => React.ReactNode;
  onClose: () => void;
  onContact: () => void;
  onReplay: () => void;
  onSpam: (spam: boolean) => void;
  onDelete: () => void;
  onFix: (fieldId: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(s.spam ? "why" : "answers");
  const toggle = (k: string) => setOpen(open === k ? null : k);
  const fields = allFields(form);
  const asked = fields.filter((f) => f.type !== "heading" && f.type !== "paragraph" && f.type !== "hidden");
  const answers = asked
    .flatMap((f, i): (readonly [string, string])[] => {
      // A first and last name side by side read as one name.
      if (f.key === "last_name" && asked[i - 1]?.key === "first_name") return [];
      if (f.key === "first_name" && asked[i + 1]?.key === "last_name") return [["Full name", [s.values.first_name, s.values.last_name].filter(Boolean).join(" ")] as const];
      return [[f.label || f.key, answerText({ key: f.key, label: f.label, field: f }, s.values[f.key])] as const];
    })
    .filter(([, v]) => v);
  const failed = s.deliveries.filter((d) => d.status === "failed");
  const m = s.meetings?.find((x) => x.status !== "canceled");
  const fix = failed.map((d) => fields.find((f) => f.crm && d.error && (d.error.includes(f.crm.label ?? "\u0000") || d.error.includes(f.crm.property)))).find(Boolean);
  const crmName = dests.find((d) => d.kind === "source")?.name ?? "the CRM";
  const page = (s.hidden.page ?? "").replace(/^https?:\/\//, "");
  return (
    <aside aria-label="Submission" className="flex min-h-0 flex-col border-l border-line bg-card max-[860px]:absolute max-[860px]:inset-x-0 max-[860px]:bottom-0 max-[860px]:z-20 max-[860px]:h-[70%] max-[860px]:rounded-t-2xl max-[860px]:border-t max-[860px]:border-l-0 max-[860px]:shadow-[0_-12px_32px_rgb(0_0_0/0.12)]">
      <div className="flex items-start gap-[4px] border-b border-line pt-[14px] pr-[10px] pb-[12px] pl-[20px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
          <Eyebrow>{ago(s.created_at)}</Eyebrow>
          <b className="truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{name}</b>
          <div className="mt-[4px] flex flex-wrap gap-[6px]">
            {s.spam ? <Badge tone="amber">{SPAM_WORDS[s.spam_reason ?? ""] ?? "Spam"}</Badge> : s.contacts?.score != null ? <Badge>{`Score ${s.contacts.score}`}</Badge> : null}
            {m ? (
              <Badge tone="green" dot>
                {`Booked ${slot(m.start_at)}`}
              </Badge>
            ) : null}
          </div>
        </div>
        <button type="button" className={IB} onClick={onClose} aria-label="Close" title="Close">
          <Ic n="x" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PanelSection icon={<Ic n="msg" />} title="Answers" summary={`${answers.length} answered`} open={open === "answers"} onToggle={() => toggle("answers")}>
          {answers.map(([q, a]) => (
            <div key={q} className="flex flex-col gap-[2px]">
              <span className="text-[12px] text-muted">{q}</span>
              <p className="m-0 break-words whitespace-pre-wrap text-ink">{a}</p>
            </div>
          ))}
        </PanelSection>
        {s.spam ? (
          <PanelSection icon={<Ic n="shield" />} title="Why it's spam" summary={SPAM_WORDS[s.spam_reason ?? ""] ?? "Spam"} open={open === "why"} onToggle={() => toggle("why")}>
            <p className="m-0 text-muted">{SPAM_WHY[s.spam_reason ?? ""] ?? "It looked like spam."}</p>
            <button type="button" className={`${GHOST_SM} self-start`} onClick={() => onSpam(false)}>
              Not spam, let it in
            </button>
          </PanelSection>
        ) : (
          <PanelSection icon={<Ic n="user" />} title="Lead" summary={rep && rep !== "Not routed" ? `Routed to ${rep}` : "Not routed"} open={open === "lead"} onToggle={() => toggle("lead")}>
            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-[10px] gap-y-[6px] text-[12.5px]">
              <span className="text-muted">Contact</span>
              <span>
                {s.contact_id ? (
                  <button type="button" className={LINK} onClick={onContact}>
                    {name}
                  </button>
                ) : (
                  "None"
                )}
              </span>
              <span className="text-muted">Routed to</span>
              <span>{rep || "Not yet"}</span>
              <span className="text-muted">Score</span>
              <span>{s.contacts?.score ?? "None"}</span>
              <span className="text-muted">Meeting</span>
              <span>{m ? slot(m.start_at) : "None"}</span>
            </div>
          </PanelSection>
        )}
        {s.spam ? null : (
          <PanelSection
            icon={<Ic n="sync" />}
            title="Sync"
            summary={failed.length ? `Didn't reach ${destName(failed[0]!.destination_id)}` : s.deliveries.length ? `Claritia and ${destName(s.deliveries[0]!.destination_id)}` : "Claritia"}
            tone={failed.length ? "bad" : undefined}
            open={open === "sync"}
            onToggle={() => toggle("sync")}
          >
            <div className="flex items-center gap-[10px] text-[12.5px]">
              <BrandLogo domain="tryclaritia.com" name="Claritia" size={18} />
              <span className="min-w-0 flex-1">
                <b className="block font-medium text-ink">Claritia contact</b>
                <span className="text-[12px] text-muted">{`Made ${ago(s.created_at).toLowerCase()}`}</span>
              </span>
              {s.contact_id ? (
                <Badge tone="green" dot>
                  Saved
                </Badge>
              ) : (
                <Badge>Waiting</Badge>
              )}
            </div>
            {s.deliveries.map((d) => (
              <div key={d.id} className="flex items-center gap-[10px] text-[12.5px]">
                {destLogo(d.destination_id)}
                <span className="min-w-0 flex-1">
                  <b className="block font-medium text-ink">{destName(d.destination_id)}</b>
                  <span className="block text-[12px] whitespace-normal text-muted">{d.status === "failed" ? d.error || "It didn't go" : d.status === "done" ? "Contact updated" : "Sends when they finish the form"}</span>
                </span>
                {d.status === "failed" ? (
                  <button type="button" className={GHOST_SM} onClick={onReplay}>
                    Try again
                  </button>
                ) : d.status === "done" ? (
                  <Badge tone="green" dot>
                    Sent
                  </Badge>
                ) : (
                  <Badge>Waiting</Badge>
                )}
              </div>
            ))}
            {fix ? (
              <button type="button" className={LINK} onClick={() => onFix(fix.id)}>
                {`Fix how ${fix.label} maps to ${crmName}`}
              </button>
            ) : null}
          </PanelSection>
        )}
        <PanelSection icon={<Ic n="globe" />} title="Where it came from" summary={page || "Hosted page"} open={open === "src"} onToggle={() => toggle("src")}>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-[10px] gap-y-[6px] text-[12.5px]">
            <span className="text-muted">Page</span>
            <span className="truncate font-mono text-[11.5px]">{page || "Hosted page"}</span>
            <span className="text-muted">Campaign</span>
            <span>{s.hidden.utm_campaign || s.hidden.utm_source || "None"}</span>
            <span className="text-muted">Came from</span>
            <span className="truncate">{(s.hidden.referrer ?? "").replace(/^https?:\/\//, "") || "Typed in or a bookmark"}</span>
          </div>
        </PanelSection>
      </div>
      <PanelFooter>
        {s.spam ? (
          <button type="button" className={GHOST_SM} onClick={() => onSpam(false)}>
            Not spam
          </button>
        ) : (
          <button type="button" className={GHOST_SM} onClick={() => onSpam(true)}>
            Mark as spam
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={GHOST_SM_RED} onClick={onDelete}>
          <Ic n="trash" />
          Delete
        </button>
      </PanelFooter>
    </aside>
  );
}
