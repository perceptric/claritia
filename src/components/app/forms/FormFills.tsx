"use client";

// The Fills view of Results (docs/form-builder.md 7.3, docs/forms-plan.md 1.1): every submission in pages of 50, with
// search over every answer, filters (when, delivery status, booked, one answer), the columns the team picked, bulk
// actions (replay, spam, delete) and an export of every answer. A fill opens to its answers, page and UTMs, the
// contact it made and one line per destination with its state. Forms that book with Claritia calendar add booked,
// not booked and the booking rate, and each fill's meeting as its status changes (docs/meetings-scheduler.md 2.5).

import { useEffect, useMemo, useState } from "react";
import { answerText, cleanFilters, fillColumns, fromFor, RANGES, type Column, type FillFilters, type FillKind, type FillStatus } from "@/lib/forms/results";
import { everyOption, isChoice, type Form } from "@/lib/forms/schema";
import { ArrowDown, ArrowUp, ChevronRight, Download, Link as LinkIcon, Refresh, Search, Trash } from "../../Icons";
import { Sketch } from "../../sketches/Sketch";
import type { MeetingStatus } from "@/lib/meetings/types";
import { askConfirm } from "../Dialogs";
import { Popover } from "../FilterBar";
import { CheckBox } from "../records/RecordTable";
import { Select } from "../Select";
import { STATUS } from "../meetings/model";
import { Badge, Button, Empty, ErrorNote, errorText, IconButton, Loading, must, Panel, postJson, Segmented, Stat, timeAgo, useLoad, type ViewProps } from "../ui";
import { DELIVERY, Toggle, type Destination } from "./shared";

type Fill = {
  id: string;
  created_at: string;
  values: Record<string, unknown>;
  hidden: Record<string, string>;
  test: boolean;
  spam: boolean;
  spam_reason: string | null;
  form_version: number;
  contact_id: string | null;
  contacts: { email: string | null; first_name: string | null; last_name: string | null } | null;
  deliveries: { id: string; status: string; error: string | null; external_url: string | null; attempts: number; updated_at: string; destination_id: string }[];
  form_bookings: { tool: string; linked: string; start_at: string | null }[];
  booking_shown_at: string | null;
  not_booked_at: string | null;
  meetings: { id: string; status: MeetingStatus; start_at: string }[];
};
type Stats = { shown: number; booked: number; not_booked: number };
type Cursor = { at: string; id: string } | null;

const PAGE = 50;
const SELECT =
  "id, created_at, values, hidden, test, spam, spam_reason, form_version, contact_id, contacts(email, first_name, last_name), deliveries(id, status, error, external_url, attempts, updated_at, destination_id), form_bookings(tool, linked, start_at), booking_shown_at, not_booked_at, meetings(id, status, start_at)";
const PICK = "h-9 min-w-0 rounded-sm border border-line-strong bg-card px-3 text-[13px] focus:border-ink";

/** A fill that saw Claritia calendar times: its meeting's status, not booked, or still deciding (the first 10 minutes). */
function meetingState(s: Pick<Fill, "booking_shown_at" | "not_booked_at" | "meetings">, now = Date.now()): { label: string; tone: "gray" | "amber" | (typeof STATUS)[MeetingStatus]["tone"] } | null {
  const m = [...(s.meetings ?? [])].sort((a, b) => (a.status === "canceled" ? 1 : 0) - (b.status === "canceled" ? 1 : 0))[0];
  if (m) return STATUS[m.status] ?? { label: m.status, tone: "gray" };
  if (!s.booking_shown_at) return null;
  if (s.not_booked_at || now - new Date(s.booking_shown_at).getTime() > 600_000) return { label: "Not booked", tone: "amber" };
  return { label: "Times shown", tone: "gray" };
}

/** The columns a form shows before anyone picks: the first three answers after the email. */
const defaultColumns = (cols: Column[]) => cols.filter((c) => c.key !== "email" && c.field?.type !== "hidden").slice(0, 3).map((c) => c.key);


const SPAM_WORDS: Record<string, string> = { trap: "Trap", too_fast: "Too fast", marked: "Marked", turnstile: "Failed captcha", site: "Other site", rate: "Over the hourly limit" };
export function FormFills({
  sb,
  session,
  ws,
  formId,
  destinations,
  navigate,
  watch,
  books,
}: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { formId: string; destinations: Destination[]; watch: number; books: boolean }) {
  const [kind, setKind] = useState<FillKind>(watch ? "tests" : "leads");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [range, setRange] = useState("all");
  const [status, setStatus] = useState<FillStatus | "any">("any");
  const [booked, setBooked] = useState<"any" | "yes" | "no">("any");
  const [answer, setAnswer] = useState<{ key: string; value: string } | null>(null);
  const [paging, setPaging] = useState<{ key: string; pages: Cursor[] }>({ key: "", pages: [null] });
  const [picks, setPicks] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [colsAt, setColsAt] = useState<HTMLElement | null>(null);

  // Typing searches a moment after the last key.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const filters: FillFilters = useMemo(
    () =>
      cleanFilters({
        kind,
        q,
        from: fromFor(range),
        status: status === "any" ? undefined : status,
        booked: booked === "any" ? undefined : booked === "yes",
        ...(answer ? answer : {}),
      }),
    [kind, q, range, status, booked, answer],
  );
  const fkey = JSON.stringify(filters);
  // New filters start again on the first page with nothing selected.
  const pages = paging.key === fkey ? paging.pages : [null];
  const setPages = (next: Cursor[]) => setPaging({ key: fkey, pages: next });
  const selected = picks.key === fkey ? picks.ids : new Set<string>();
  const setSelected = (ids: Set<string>) => setPicks({ key: fkey, ids });
  const cursor = pages[pages.length - 1];

  const meta = useLoad(async () => {
    const [rows, form] = await Promise.all([
      sb.from("form_versions").select("version, body").eq("form_id", formId),
      sb.from("forms").select("results_columns").eq("id", formId).maybeSingle(),
    ]);
    const versions = must(rows) as { version: number; body: Form }[];
    return { versions: new Map(versions.map((r) => [r.version, r.body])), cols: fillColumns(versions), picked: (must(form) as { results_columns: string[] | null } | null)?.results_columns ?? null };
  }, formId);
  const fills = useLoad(async () => {
    const ids = must(await sb.rpc("form_fill_ids", { p_form: formId, p_filters: filters, p_after_at: cursor?.at ?? null, p_after_id: cursor?.id ?? null, p_limit: PAGE })) as string[];
    if (!ids.length) return [] as Fill[];
    const rows = must(await sb.from("submissions").select(SELECT).in("id", ids)) as unknown as Fill[];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is Fill => !!r);
  }, `${formId}:${fkey}:${cursor?.id ?? ""}:${watch}`);
  const count = useLoad(async () => Number(must(await sb.rpc("form_fill_count", { p_form: formId, p_filters: filters }))), `${formId}:${fkey}:${watch}`);
  const stats = useLoad(async () => must(await sb.rpc("form_booking_stats", { p_form: formId })) as Stats, `${formId}:booking:${watch}`);

  // After the Test button (the parent remounts this with a new `watch`): check every 2 seconds for half a minute.
  useEffect(() => {
    if (!watch) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 15) clearInterval(t);
      fills.reload();
      count.reload();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch]);

  const allCols = meta.data?.cols ?? [];
  const shownKeys = meta.data?.picked ?? defaultColumns(allCols);
  const shown = shownKeys.map((k) => allCols.find((c) => c.key === k)).filter((c): c is Column => !!c);
  const answerFields = allCols.filter((c) => c.field && (isChoice(c.field.type) || c.field.type === "checkbox" || c.field.type === "rating"));
  const answerField = answerFields.find((c) => c.key === answer?.key)?.field;
  const answerValues = answerField
    ? answerField.type === "checkbox"
      ? [{ value: "true", label: "Yes" }]
      : answerField.type === "rating"
        ? Array.from({ length: answerField.rating?.scale ?? 5 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))
        : everyOption(answerField)
    : [];
  const filtered = !!(filters.q || filters.from || filters.status || filters.booked !== undefined || filters.key);

  const rows = fills.data ?? [];
  const reload = () => {
    fills.reload();
    count.reload();
  };
  const run = async (what: string, fn: () => Promise<void>) => {
    setError("");
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  const picked = rows.filter((r) => selected.has(r.id));
  const failedIn = (list: Fill[]) => list.flatMap((s) => s.deliveries.filter((d) => d.status === "failed").map((d) => d.id));
  const replay = (ids: string[]) =>
    run("replay", async () => {
      must(await sb.rpc("deliveries_replay", { p_ids: ids }));
      fills.reload();
    });
  const markSpam = (spam: boolean) =>
    run("spam", async () => {
      const ids = picked.map((r) => r.id);
      if (spam) must(await sb.rpc("submissions_mark_spam", { p_ids: ids, p_spam: true }));
      else {
        // Back from Spam: fills that were leads before just move; the rest go through the same steps as on the way in.
        must(await sb.rpc("submissions_mark_spam", { p_ids: picked.filter((r) => r.contact_id).map((r) => r.id), p_spam: false }));
        const held = picked.filter((r) => !r.contact_id).map((r) => r.id);
        if (held.length) {
          const r = await postJson<{ released: number; errors: Record<string, string> }>(session, "/api/forms/release", { workspaceId: ws.id, ids: held });
          const first = Object.values(r.errors)[0];
          if (first) setError(first);
        }
      }
      setSelected(new Set());
      reload();
    });
  const remove = async () => {
    const n = picked.length;
    if (!(await askConfirm(`Delete ${n} ${n === 1 ? "fill" : "fills"}?`, { ok: "Delete", danger: true }))) return;
    await run("delete", async () => {
      must(await sb.rpc("submissions_delete", { p_ids: picked.map((r) => r.id) }));
      setSelected(new Set());
      reload();
    });
  };
  const exportCsv = () =>
    run("export", async () => {
      const res = await fetch(`/api/forms/${formId}/export?filters=${encodeURIComponent(fkey)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The export didn't finish.");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "answers.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    });
  const saveCols = (keys: string[]) =>
    run("cols", async () => {
      must(await sb.rpc("form_results_columns", { p_form: formId, p_cols: keys }));
      meta.reload();
    });
  const destName = (id: string) => destinations.find((d) => d.id === id)?.name ?? "Removed destination";
  const total = count.data ?? 0;
  const start = (pages.length - 1) * PAGE;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Fills"
          value={kind}
          options={[
            { value: "leads", label: "Leads" },
            { value: "tests", label: "Tests" },
            { value: "spam", label: "Spam" },
          ]}
          onChange={setKind}
        />
        <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-sm border border-line-strong bg-card px-3 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
          <Search size={14} className="text-faint" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search answers" aria-label="Search answers" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        </label>
        <Button variant="ghost" size="sm" onClick={(e) => setColsAt(e.currentTarget)} disabled={!allCols.length}>
          Columns
        </Button>
        <IconButton label={busy === "export" ? "Exporting" : "Export answers"} onClick={exportCsv} disabled={!!busy || !total}>
          <Download size={14} />
        </IconButton>
        <IconButton label="Refresh" onClick={reload}>
          <Refresh size={14} />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select<string> value={range} onChange={setRange} ariaLabel="When" options={RANGES.map((r) => ({ value: r.value, label: r.label }))} className={`${PICK} w-40`} />
        <Select<FillStatus | "any">
          value={status}
          onChange={setStatus}
          ariaLabel="Delivery"
          options={[
            { value: "any", label: "Any delivery" },
            { value: "sent", label: "Sent" },
            { value: "waiting", label: "Waiting" },
            { value: "failed", label: "Failed" },
          ]}
          className={`${PICK} w-36`}
        />
        {books ? (
          <Select<"any" | "yes" | "no">
            value={booked}
            onChange={setBooked}
            ariaLabel="Booked"
            options={[
              { value: "any", label: "Booked or not" },
              { value: "yes", label: "Booked" },
              { value: "no", label: "Not booked" },
            ]}
            className={`${PICK} w-40`}
          />
        ) : null}
        {answerFields.length ? (
          <Select<string>
            value={answer?.key ?? ""}
            onChange={(key) => {
              const f = answerFields.find((c) => c.key === key)?.field;
              const first = f?.type === "checkbox" ? "true" : f?.type === "rating" ? "1" : f ? everyOption(f)[0]?.value : undefined;
              setAnswer(key && first !== undefined ? { key, value: first } : null);
            }}
            ariaLabel="Answer"
            options={[{ value: "", label: "Any answer" }, ...answerFields.map((c) => ({ value: c.key, label: c.label }))]}
            className={`${PICK} w-44`}
          />
        ) : null}
        {answer && answerValues.length ? (
          <Select<string> value={answer.value} onChange={(value) => setAnswer({ ...answer, value })} ariaLabel="Answer is" options={answerValues} className={`${PICK} w-44`} />
        ) : null}
      </div>
      <ErrorNote message={error || fills.error || count.error || meta.error} />
      {kind === "leads" && stats.data && stats.data.shown > 0 ? (
        <Panel className="grid grid-cols-3 gap-4 px-5 py-5">
          <Stat value={stats.data.booked} label="Booked" />
          <Stat value={stats.data.not_booked} label="Not booked" />
          <Stat value={`${Math.round((stats.data.booked / stats.data.shown) * 100)}%`} label="Booking rate" />
        </Panel>
      ) : null}
      {picked.length ? (
        <div className="anim-rise-sm flex flex-wrap items-center gap-2 rounded-lg border border-line bg-brand-pale px-4 py-2 text-[13px]">
          <span className="font-medium">{picked.length} selected</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {failedIn(picked).length ? (
              <Button variant="ghost" size="sm" onClick={() => replay(failedIn(picked))} disabled={!!busy}>
                <Refresh size={13} />
                Replay
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => markSpam(kind !== "spam")} disabled={!!busy}>
              {kind === "spam" ? "Not spam" : "Mark as spam"}
            </Button>
            <Button variant="danger" size="sm" onClick={remove} disabled={!!busy}>
              <Trash size={13} />
              Delete
            </Button>
            <Button variant="plain" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </span>
        </div>
      ) : null}
      {!fills.data || !meta.data ? (
        <Loading />
      ) : !rows.length ? (
        filtered ? (
          <Empty title="No matches" />
        ) : (
          <Empty sketch={<Sketch name={kind === "tests" ? "plane" : "clipboard"} size={160} />} title={kind === "spam" ? "No spam" : kind === "tests" ? "No tests yet" : "No fills yet"} />
        )
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-muted">
                <th className="w-10 py-2.5 pl-4">
                  <CheckBox
                    on={rows.every((r) => selected.has(r.id))}
                    label="Select all on this page"
                    onClick={() => setSelected(rows.every((r) => selected.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
                <th className="py-2.5 pr-3 font-medium">Contact</th>
                {shown.map((c) => (
                  <th key={c.key} className="max-w-[200px] truncate py-2.5 pr-3 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="w-20 py-2.5 pr-4 text-right font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const body = meta.data!.versions.get(s.form_version);
                const who = s.contacts ? [s.contacts.first_name, s.contacts.last_name].filter(Boolean).join(" ") || s.contacts.email : String(s.values.email ?? "—");
                const failed = s.deliveries.filter((d) => d.status === "failed");
                const isOpen = open === s.id;
                const meeting = meetingState(s);
                const labelOf = (k: string) => (body && body.steps.flatMap((x) => x.fields).find((f) => f.key === k)?.label) || allCols.find((c) => c.key === k)?.label || k;
                return (
                  <FillRow key={s.id}>
                    <tr className={`border-t border-line transition-colors duration-[140ms] hover:bg-hover ${isOpen ? "bg-hover" : ""}`}>
                      <td className="py-2.5 pl-4 align-middle">
                        <CheckBox
                          on={selected.has(s.id)}
                          label={`Select ${who}`}
                          onClick={() => {
                            const next = new Set(selected);
                            if (next.has(s.id)) next.delete(s.id);
                            else next.add(s.id);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="max-w-[240px] py-2.5 pr-3">
                        <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} className="flex w-full min-w-0 items-center gap-2 text-left">
                          <ChevronRight size={13} className={`shrink-0 text-faint transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          <span className="truncate font-medium">{who}</span>
                        </button>
                      </td>
                      {shown.map((c) => (
                        <td key={c.key} className="max-w-[200px] truncate py-2.5 pr-3 text-body">
                          {answerText(c, s.values[c.key])}
                        </td>
                      ))}
                      <td className="py-2.5 pr-3">
                        <span className="flex flex-wrap gap-1">
                          {s.form_bookings?.map((b, j) => (
                            <Badge key={`b${j}`} tone={b.linked === "tracking" ? "violet" : "gray"}>
                              {b.linked === "tracking" ? "Booked" : "Booked, maybe"}
                            </Badge>
                          ))}
                          {meeting ? <Badge tone={meeting.tone}>{meeting.label}</Badge> : null}
                          {s.spam ? <Badge tone="amber">{SPAM_WORDS[s.spam_reason ?? ""] ?? "Spam"}</Badge> : null}
                          {s.deliveries.map((d) => (
                            <Badge key={d.id} tone={DELIVERY[d.status]?.[1] ?? "gray"}>
                              {DELIVERY[d.status]?.[0] ?? d.status}
                            </Badge>
                          ))}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[11.5px] whitespace-nowrap text-muted">{timeAgo(s.created_at)}</td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={shown.length + 4} className="border-t border-line bg-paper p-0">
                          <div className="anim-rise-sm grid gap-4 px-5 py-5 md:grid-cols-2">
                            <dl className="flex flex-col gap-2 text-[13px]">
                              {Object.entries(s.values).map(([k, v]) => (
                                <div key={k} className="flex flex-col">
                                  <dt className="label-mono">{labelOf(k)}</dt>
                                  <dd className="break-words whitespace-pre-wrap text-ink">{answerText(allCols.find((c) => c.key === k), v) || "—"}</dd>
                                </div>
                              ))}
                              {Object.entries(s.hidden).map(([k, v]) => (
                                <div key={k} className="flex flex-col">
                                  <dt className="label-mono">{k}</dt>
                                  <dd className="truncate font-mono text-[12px] text-body">{v}</dd>
                                </div>
                              ))}
                            </dl>
                            <div className="flex flex-col gap-2">
                              {s.meetings?.length ? (
                                <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                                  {s.meetings.map((m) => (
                                    <li key={m.id} className="flex items-center gap-2 px-3.5 py-2.5 text-[13px]">
                                      <span className="min-w-0 flex-1 truncate font-medium">{new Date(m.start_at).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                                      <Badge tone={STATUS[m.status]?.tone ?? "gray"}>{STATUS[m.status]?.label ?? m.status}</Badge>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {s.contact_id ? (
                                <div>
                                  <Button variant="ghost" onClick={() => navigate("contacts", s.contact_id!)}>
                                    Open contact
                                  </Button>
                                </div>
                              ) : null}
                              <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                                {s.deliveries.map((d) => (
                                  <li key={d.id} className="flex flex-col gap-1 px-3.5 py-2.5 text-[13px]">
                                    <div className="flex items-center gap-2">
                                      <span className="min-w-0 flex-1 truncate font-medium">{destName(d.destination_id)}</span>
                                      {d.external_url ? (
                                        <a href={d.external_url} target="_blank" rel="noreferrer" className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" aria-label="Open the record" title="Open the record">
                                          <LinkIcon size={14} />
                                        </a>
                                      ) : null}
                                      <Badge tone={DELIVERY[d.status]?.[1] ?? "gray"}>{DELIVERY[d.status]?.[0] ?? d.status}</Badge>
                                    </div>
                                    {d.error ? <p className="text-[12px] break-words text-rose">{d.error}</p> : null}
                                    <p className="font-mono text-[11.5px] text-muted">
                                      {d.attempts} {d.attempts === 1 ? "try" : "tries"}, {timeAgo(d.updated_at)}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                              {failed.length ? (
                                <div>
                                  <Button variant="ghost" onClick={() => replay(failed.map((d) => d.id))} disabled={!!busy}>
                                    <Refresh size={14} />
                                    Replay
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </FillRow>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center gap-2 border-t border-line px-4 py-2 text-[12.5px] text-muted">
            <span className="tabular-nums">
              {start + 1}–{start + rows.length} of {count.data === undefined ? "…" : total.toLocaleString("en-US")}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <IconButton label="Previous page" disabled={pages.length < 2} onClick={() => setPages(pages.slice(0, -1))}>
                <ChevronRight size={14} className="rotate-180" />
              </IconButton>
              <IconButton
                label="Next page"
                disabled={rows.length < PAGE || start + rows.length >= total}
                onClick={() => {
                  const last = rows[rows.length - 1];
                  setPages([...pages, { at: last.created_at, id: last.id }]);
                }}
              >
                <ChevronRight size={14} />
              </IconButton>
            </span>
          </div>
        </Panel>
      )}
      {colsAt ? (
        <Popover anchor={colsAt} onClose={() => setColsAt(null)} width={280}>
          <ColumnsPicker all={allCols} shown={shownKeys} onChange={saveCols} />
        </Popover>
      ) : null}
    </div>
  );
}

const FillRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;

/** Which answers the table shows, and in what order, for the whole team. */
function ColumnsPicker({ all, shown, onChange }: { all: Column[]; shown: string[]; onChange: (keys: string[]) => void }) {
  const hidden = all.filter((c) => !shown.includes(c.key));
  const move = (i: number, by: number) => {
    const next = [...shown];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex max-h-[360px] flex-col overflow-y-auto p-2">
      {shown.map((k, i) => {
        const c = all.find((x) => x.key === k);
        if (!c) return null;
        return (
          <div key={k} className="flex h-8 items-center gap-1 rounded-sm px-1.5 hover:bg-hover">
            <span className="min-w-0 flex-1">
              <Toggle label={c.label} checked onChange={() => onChange(shown.filter((x) => x !== k))} />
            </span>
            <IconButton label={`Move ${c.label} up`} disabled={i === 0} onClick={() => move(i, -1)} className="size-6">
              <ArrowUp size={12} />
            </IconButton>
            <IconButton label={`Move ${c.label} down`} disabled={i === shown.length - 1} onClick={() => move(i, 1)} className="size-6">
              <ArrowDown size={12} />
            </IconButton>
          </div>
        );
      })}
      {hidden.map((c) => (
        <div key={c.key} className="flex h-8 items-center rounded-sm px-1.5 hover:bg-hover">
          <Toggle label={c.label} checked={false} onChange={() => onChange([...shown, c.key].slice(0, 40))} />
        </div>
      ))}
    </div>
  );
}
