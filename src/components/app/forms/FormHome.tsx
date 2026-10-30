"use client";

// Inbound › Forms (docs/forms-plan.md): one list of forms as 72 px rows, like Calendar's meeting types. Each row has
// its thumbnail, where it lives, its last fill and send rate, the last 7 days as bars, this week's count and its
// state; the more menu opens, copies, takes offline and deletes. With no forms yet, the first screen asks what the
// form is for. New form opens a dialog: describe it, or start from one of six templates.

import { useEffect, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { buildForm, formName, readSentence, type Copy } from "@/lib/forms/interview";
import { REP } from "@/lib/forms/schedule";
import { STARTERS } from "@/lib/forms/templates";
import type { Form } from "@/lib/forms/schema";
import { CATALOG } from "@/lib/sources/catalog";
import { Send } from "../../Icons";
import { FormSketch } from "../../sketches/FormSketch";
import { AiMark } from "../Ai";
import { askConfirm } from "../Dialogs";
import { Badge, ErrorNote, errorText, IconButton, invalidate, Loading, must, postJson, useKept, useQuery, type ViewProps } from "../ui";
import { meetingTypes } from "../meetings/TypesList";
import { ago, whereWords } from "./formModel";
import { Ic } from "./ic";
import { BTN, copyText, Dialog, DialogHead, Dots, EYEBROW, GHOST, IB, Seg, SegN, Thumb, useNote } from "./parts";
import { Menu } from "./Menu";

export type ListRow = {
  id: string;
  name: string;
  status: "draft" | "live" | "paused";
  kind: "built" | "captured";
  version: number;
  fills: number;
  last_fill: string | null;
  updated_at: string;
  failed: number;
  check: string | null;
  week?: number;
  spark?: number[];
  views?: number;
  pages?: number;
  page?: string | null;
  hosted?: boolean;
  edited?: boolean;
  brand_kit_id?: string | null;
};
type KitLite = { id: string; tokens: Partial<Tokens>; source_url: string | null; scan_status: string | null };

/** What New form starts from: the tools that take leads, the site, a meeting type and whether routing is on. */
function useNewFormContext(sb: ViewProps["sb"], ws: string) {
  return useQuery(`forms:${ws}:new`, async () => {
    const [sources, sites, types, router] = await Promise.all([
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws).order("name"),
      sb.from("sites").select("domain").eq("workspace_id", ws).order("created_at").limit(1),
      meetingTypes(sb, ws),
      sb.from("routers").select("live_version, paused_at").eq("workspace_id", ws).maybeSingle(),
    ]);
    const tools = ((sources.data ?? []) as Tool[]).filter((s) => s.status !== "disconnected" && PUSHES.has(s.kind));
    const r = router.data as { live_version: number | null; paused_at: string | null } | null;
    return {
      tools,
      site: ((sites.data ?? []) as { domain: string }[])[0]?.domain ?? "",
      type: types.find((t) => t.active)?.id ?? null,
      routing: !!r?.live_version && !r.paused_at,
    };
  });
}

/** A form made from a description says so the first time it opens. */
export const MADE_KEY = "claritia:form-made:";

export function FormHome(props: ViewProps & { startNew?: boolean }) {
  const { sb, ws, navigate } = props;
  const list = useQuery(`forms:${ws.id}:home`, async () => {
    const [rows, kits] = await Promise.all([sb.rpc("forms_list", { p_ws: ws.id }), sb.from("brand_kits").select("id, tokens, source_url, scan_status").eq("workspace_id", ws.id)]);
    return { rows: must(rows) as ListRow[], kits: ((kits.data ?? []) as KitLite[]) };
  });
  // What New form needs, read with the list so the dialog opens ready.
  useNewFormContext(sb, ws.id);
  const [error, setError] = useState("");
  const [filter, setFilter] = useKept<"all" | "live" | "draft">(`forms:${ws.id}:filter`, "all");
  const [q, setQ] = useKept(`forms:${ws.id}:q`, "");
  const [dialog, setDialog] = useState(!!props.startNew);
  const [menu, setMenu] = useState<{ id: string; at: HTMLElement } | null>(null);
  const note = useNote();

  const rows = list.data?.rows;
  const kitOf = (id?: string | null) => list.data?.kits.find((k) => k.id === id);
  const live = (rows ?? []).filter((r) => r.status !== "draft").length;
  const shown = (rows ?? []).filter((r) => (filter === "all" || (filter === "live" ? r.status !== "draft" : r.status === "draft")) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
  const week = (rows ?? []).reduce((n, r) => n + (r.week ?? 0), 0);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const duplicate = (r: ListRow) =>
    act(async () => {
      const f = must(await sb.from("forms").select("draft, brand_kit_id").eq("id", r.id).maybeSingle()) as { draft: Form; brand_kit_id: string | null } | null;
      if (!f) throw new Error("That form is gone.");
      must(await sb.rpc("form_create", { p_ws: ws.id, p_name: `${r.name} (copy)`.slice(0, 120), p_draft: f.draft, p_brand_kit: f.brand_kit_id, p_kind: r.kind }));
      list.reload();
      note.show("Duplicated as a draft");
    });
  const offline = (r: ListRow, on: boolean) =>
    act(async () => {
      // The status changes on click; it goes back, with the error, if the save fails.
      await list.mutate((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, status: on ? "live" : "paused" } : x)) }), async () => must(await sb.rpc("form_set_status", { p_id: r.id, p_status: on ? "live" : "paused" })));
      invalidate("app_counts");
      note.show(on ? "Back online" : "Offline. Pages show nothing until you publish again.");
    });
  const remove = (r: ListRow) =>
    act(async () => {
      const where = whereWords({ ...r, pages: r.pages ?? 0, page: r.page ?? null, hosted: !!r.hosted });
      const body = r.status === "draft" ? "It's a draft, so nothing else changes." : `It comes off ${where.charAt(0).toLowerCase()}${where.slice(1)}. Its ${r.fills.toLocaleString("en-US")} submissions stay on your contacts.`;
      if (!(await askConfirm(`Delete ${r.name}?`, { body, ok: "Delete", danger: true }))) return;
      await list.mutate((d) => ({ ...d, rows: d.rows.filter((x) => x.id !== r.id) }), async () => must(await sb.rpc("form_delete", { p_id: r.id })));
      invalidate(`form_names:${ws.id}`);
      invalidate("app_counts");
      note.show(`${r.name} deleted`);
    });

  const header = (
    <div className="flex h-[48px] shrink-0 items-center gap-[8px] border-b border-line pr-[12px] pl-[16px] text-[14px] font-medium">
      <h1 className="text-ink">Forms</h1>
      {rows?.length ? <span className="font-normal text-faint tabular-nums">{rows.length}</span> : null}
      <span className="flex-1" />
      {rows?.length ? (
        <button type="button" className={BTN} onClick={() => setDialog(true)}>
          <Ic n="plus" />
          New form
        </button>
      ) : null}
    </div>
  );

  const body = !list.data ? (
    list.error ? (
      <div className="p-[16px]">
        <ErrorNote message={list.error} />
      </div>
    ) : (
      <Loading />
    )
  ) : !rows!.length ? (
    <FirstScreen {...props} onTemplates={() => setDialog(true)} kits={list.data.kits} />
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pt-[16px] pb-[24px] sm:px-[clamp(16px,2.5vw,28px)]">
      <div className="mb-[14px] flex flex-wrap items-center gap-[10px]">
        <label className="flex h-[32px] w-[260px] max-w-full items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:border-ink">
          <Ic n="search" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms" aria-label="Search forms" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted" />
        </label>
        <Seg
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: <>All <SegN n={rows!.length} /></> },
            { value: "live", label: <>Live <SegN n={live} /></> },
            { value: "draft", label: <>Drafts <SegN n={rows!.length - live} /></> },
          ]}
        />
        <span className="flex-1" />
        <span className="text-[12.5px] text-muted">{`${week.toLocaleString("en-US")} ${week === 1 ? "submission" : "submissions"} this week`}</span>
      </div>
      <ErrorNote message={error} />
      {shown.length ? (
        <ul className="rounded-[10px] border border-line">
          {shown.map((r) => (
            <FormRowView
              key={r.id}
              r={r}
              accent={kitOf(r.brand_kit_id)?.tokens.buttonBg || kitOf(r.brand_kit_id)?.tokens.accent}
              open={menu?.id === r.id}
              onOpen={() => navigate("forms", r.id)}
              onMenu={(at) => setMenu(menu?.id === r.id ? null : { id: r.id, at })}
            />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-[4px] px-[16px] py-[56px] text-center">
          <b className="font-medium text-ink">No matches</b>
          <span className="text-muted">Try another name</span>
        </div>
      )}
    </div>
  );

  const open = menu ? rows?.find((r) => r.id === menu.id) : null;
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      {header}
      {body}
      {open && menu ? (
        <Menu
          anchor={menu.at}
          onClose={() => setMenu(null)}
          items={[
            { icon: "build", label: "Open", run: () => navigate("forms", open.id) },
            { icon: "dup", label: "Duplicate", run: () => void duplicate(open) },
            { icon: "link", label: "Copy link", disabled: !open.version, run: () => void copyText(`${origin}/f/${open.id}`).then((ok) => note.show(ok ? "Link copied" : "Couldn't copy the link")) },
            open.status === "paused"
              ? { icon: "eye", label: "Put back online", run: () => void offline(open, true) }
              : { icon: "eye", label: "Take offline", disabled: open.status === "draft", run: () => void offline(open, false) },
            "hr",
            { icon: "trash", label: "Delete", danger: true, run: () => void remove(open) },
          ]}
        />
      ) : null}
      {dialog ? <NewForm {...props} kits={list.data?.kits ?? []} onClose={() => setDialog(false)} /> : null}
      {note.node}
    </div>
  );
}

/** One form in the list. */
function FormRowView({ r, accent, open, onOpen, onMenu }: { r: ListRow; accent?: string; open: boolean; onOpen: () => void; onMenu: (at: HTMLElement) => void }) {
  const spark = r.spark?.length === 7 ? r.spark : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...spark);
  const rate = r.views ? Math.min(100, Math.round((r.fills / r.views) * 100)) : null;
  const where = whereWords({ ...r, pages: r.pages ?? 0, page: r.page ?? null, hosted: !!r.hosted });
  const last = r.last_fill ? ago(r.last_fill) : `Edited ${ago(r.updated_at).replace(/^Just now$/, "just now").replace(/^Yesterday$/, "yesterday")}`;
  const badge =
    r.status === "draft" ? (
      <Badge>Draft</Badge>
    ) : r.status === "paused" ? (
      <Badge>Offline</Badge>
    ) : r.edited ? (
      <span title="Live, with changes not published yet">
        <Badge tone="amber" dot>
          Live, edited
        </Badge>
      </span>
    ) : (
      <Badge tone="green" dot>
        Live
      </Badge>
    );
  return (
    <li className="relative flex h-[72px] items-center gap-[14px] border-t border-line pr-[10px] pl-[14px] transition-colors duration-[120ms] first:rounded-t-[10px] first:border-t-0 last:rounded-b-[10px] hover:bg-paper">
      {open ? <CatchCorners /> : null}
      <Thumb accent={accent} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-[5px] text-left after:absolute after:inset-0">
        <span className="flex min-w-0 items-center gap-[8px] text-[13.5px] font-medium text-ink">
          <span className="truncate">{r.name}</span>
          {r.failed ? (
            <span title={`${r.failed} ${r.failed === 1 ? "lead didn't" : "leads didn't"} reach their CRM`}>
              <Badge tone="red">{`${r.failed} not synced`}</Badge>
            </span>
          ) : null}
          {r.check === "failed" ? <Badge tone="red">Check failed</Badge> : null}
        </span>
        <span className="flex items-center gap-[14px] overflow-hidden text-[12.5px] whitespace-nowrap text-muted">
          <span className="inline-flex items-center gap-[5px]">
            <Ic n="globe" />
            {where}
          </span>
          <span className="inline-flex items-center gap-[5px] max-md:hidden">
            <Ic n="clock" />
            {last}
          </span>
          {r.fills && rate !== null ? <span className="max-md:hidden">{`${rate}% of visitors send it`}</span> : null}
        </span>
      </button>
      <span aria-hidden="true" className="flex h-[22px] w-[64px] shrink-0 items-end gap-[2px] max-md:hidden">
        {spark.map((v, i) => (
          <i key={i} className={`block min-h-[2px] flex-1 rounded-[1px] ${i === 6 ? "bg-ink" : "bg-line-strong"}`} style={{ height: `${Math.round((v / max) * 100)}%` }} />
        ))}
      </span>
      <span className="flex w-[120px] shrink-0 flex-col items-end gap-[2px] max-[1100px]:hidden">
        <b className="font-medium text-ink tabular-nums">{r.week ? r.week.toLocaleString("en-US") : "None"}</b>
        <span className="text-[11.5px] text-muted">this week</span>
      </span>
      <span className="flex w-[88px] shrink-0 justify-end max-md:hidden">{badge}</span>
      <button
        type="button"
        aria-label={`More for ${r.name}`}
        title="More"
        onClick={(e) => {
          e.stopPropagation();
          onMenu(e.currentTarget);
        }}
        className={`${IB} relative z-10`}
      >
        <Ic n="more" />
      </button>
    </li>
  );
}

/** The corner bracket from the mark, on the row whose menu is open. */
export function CatchCorners({ r = 10, inset = "-1px" }: { r?: number; inset?: string }) {
  return (
    <>
      <span aria-hidden="true" className="anim-fade pointer-events-none absolute z-[1] size-[12px] border-t-[1.5px] border-l-[1.5px] border-ink" style={{ top: inset, left: inset, borderTopLeftRadius: r }} />
      <span aria-hidden="true" className="anim-fade pointer-events-none absolute z-[1] size-[12px] border-r-[1.5px] border-b-[1.5px] border-ink" style={{ bottom: inset, right: inset, borderBottomRightRadius: r }} />
    </>
  );
}

// First screen -------------------------------------------------------------------------------------------------------

function FirstScreen(props: ViewProps & { onTemplates: () => void; kits: KitLite[] }) {
  const [text, setText] = useState("");
  const [making, setMaking] = useState<string | null>(null);
  const [blank, setBlank] = useState(false);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[14px] overflow-y-auto px-[16px] py-[24px] text-center">
      <FormSketch />
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance text-ink">
        Make your first form.
        <br />
        <span className="text-faint">It takes your website&apos;s look.</span>
      </h1>
      <p className="max-w-[420px] text-muted">Say what it&apos;s for. Claritia picks the questions, saves the answers to your contacts and sends leads to the right rep.</p>
      <AskPill value={text} onChange={setText} placeholder="A demo request for work emails, then book a call" onSend={() => text.trim() && setMaking(text.trim())} shadow />
      <div className="flex flex-wrap items-center justify-center gap-[6px]">
        <button type="button" className={GHOST} onClick={props.onTemplates}>
          <Ic n="form" />
          Start from a template
        </button>
        <button type="button" className={GHOST} onClick={() => setBlank(true)}>
          <Ic n="plus" />
          Blank form
        </button>
      </div>
      {making || blank ? <NewForm {...props} start={making ? { text: making } : { starter: "blank" }} onClose={() => (setMaking(null), setBlank(false))} /> : null}
    </div>
  );
}

/** The AI box: the sparkle, a line to type in and the round send button. */
export function AskPill({ value, onChange, placeholder, onSend, busy = false, shadow = false, autoFocus = false, label = "Describe the form", needText = true, full = false }: { needText?: boolean; full?: boolean; value: string; onChange: (v: string) => void; placeholder: string; onSend: () => void; busy?: boolean; shadow?: boolean; autoFocus?: boolean; label?: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && value.trim()) onSend();
      }}
      className={`flex ${full ? "w-full" : "w-[min(560px,100%)]"} items-center gap-[8px] rounded-full border bg-card py-[6px] pr-[6px] pl-[14px] text-left transition-colors duration-[140ms] focus-within:border-ink ${busy ? "border-signal" : "border-line-strong"} ${shadow ? "shadow-[0_8px_28px_rgb(0_0_0/0.1)]" : ""}`}
    >
      <AiMark size={14} working={busy} />
      <input autoFocus={autoFocus} value={value} disabled={busy} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={label} autoComplete="off" className="h-[32px] min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted disabled:text-muted" />
      <button type="submit" disabled={busy || (needText && !value.trim())} aria-label="Send" className="inline-flex size-[32px] shrink-0 items-center justify-center rounded-full bg-ink text-card transition-opacity duration-[120ms] disabled:opacity-30">
        {busy ? <Dots /> : <Ic n="up" />}
      </button>
    </form>
  );
}

// New form ---------------------------------------------------------------------------------------------------------

type Tool = { id: string; kind: string; name: string; status: string };
const PUSHES = new Set(CATALOG.filter((e) => e.twoWay || e.pushes).map((e) => e.kind));
const CRM_KINDS = new Set(["hubspot", "salesforce", "omniscient", "pipedrive"]);
const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/**
 * New form: describe it, or pick one of the six templates and Create. Making one shows what it did, a line at a time,
 * then the form opens in Build. `start` makes one at once (from the first screen's box, or Blank form).
 */
function NewForm({ sb, session, ws, navigate, kits, onClose, start }: ViewProps & { kits: KitLite[]; onClose: () => void; start?: { text: string } | { starter: string } }) {
  const ctx = useNewFormContext(sb, ws.id);
  const [text, setText] = useState("");
  const [pick, setPick] = useState("demo");
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const started = useRef(false);
  const site = ctx.data?.site ?? "";
  const kit = kits.find((k) => k.scan_status === "done" && site && host(k.source_url) === host(site)) ?? kits.find((k) => k.scan_status === "done") ?? null;
  const siteName = host(kit?.source_url) || host(site);

  const make = async (how: { text: string } | { starter: string }) => {
    if (!ctx.data || lines) return;
    setError("");
    const c = ctx.data;
    const crm = c.tools.find((t) => CRM_KINDS.has(t.kind));
    const out: string[] = [];
    const say = (l: string) => {
      out.push(l);
      setLines([...out]);
    };
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    setLines([]);
    try {
      let kitId = kit?.id ?? null;
      if (!kit && site) {
        const r = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: host(site) }).catch(() => null);
        kitId = r?.kitId ?? null;
      }
      await wait(120);
      say(siteName ? `Read ${siteName} and took its look` : "Took Claritia's look");
      let name: string;
      let form: Form;
      let sources: string[] = [];
      let made = false;
      if ("text" in how) {
        const read = readSentence(how.text, c.tools);
        const a = read.answers;
        if (a.after.kind === "meeting") a.after = c.type ? { kind: "meeting", tool: "claritia", url: "", perOwner: false, meetingTypeId: c.type } : { kind: "message" };
        const copy = await Promise.race([
          postJson<{ copy: Copy }>(session, "/api/forms/interview", { workspaceId: ws.id, mode: "copy", answers: a, site: siteName })
            .then((r) => r.copy)
            .catch(() => ({})),
          new Promise<Copy>((r) => setTimeout(() => r({}), 12_000)),
        ]);
        form = buildForm(a, copy);
        if (form.after.schedule?.tool === "claritia" && c.routing) form.after.schedule = { ...form.after.schedule, who: "routed", routeRules: [REP] };
        name = formName(a);
        sources = a.send.sources;
        made = true;
      } else {
        const s = STARTERS.find((x) => x.key === how.starter) ?? STARTERS[0]!;
        form = s.form();
        if (s.book && c.type) form.after.schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: c.type, ...(c.routing ? { who: "routed" as const, routeRules: [REP] } : {}) };
        name = s.key === "blank" ? "Untitled form" : s.name;
      }
      const n = form.steps.reduce((sum, s) => sum + s.fields.length, 0);
      say(`Picked ${n} ${n === 1 ? "question" : "questions"} for ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name.toLowerCase()}`);
      const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: name, p_draft: form, p_brand_kit: kitId, p_kind: "built" })) as string;
      for (const s of sources) {
        const t = c.tools.find((x) => x.id === s);
        await postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "source", sourceId: s, name: t?.name ?? "Tool" }).catch(() => undefined);
      }
      await wait(100);
      say(`Matched them to your contact fields${crm && sources.includes(crm.id) ? ` and ${crm.name}` : ""}`);
      await wait(120);
      say(form.after.schedule ? (c.routing ? "Leads go to Routing, then book a call" : "Leads book a call") : c.routing ? "Leads go to Routing" : "Leads become contacts");
      await wait(150);
      try {
        if (made) sessionStorage.setItem(`${MADE_KEY}${id}`, "1");
      } catch {}
      navigate("forms", id);
    } catch (e) {
      setLines(null);
      setError(errorText(e));
    }
  };

  useEffect(() => {
    if (!start || !ctx.data || started.current) return;
    started.current = true;
    void make(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.data]);

  if (lines || start)
    return (
      <Dialog label="Making the form" onClose={() => (lines ? undefined : onClose())}>
        <span className={EYEBROW}>New form</span>
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">Making your form</h2>
        <div className="flex flex-col gap-[8px] py-[6px]">
          {(lines ?? []).map((l, i) => (
            <div key={l} className="anim-rise-sm flex items-center gap-[10px] text-ink" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal">
                <Ic n="check" s={11} />
              </span>
              {l}
            </div>
          ))}
          {error ? <ErrorNote message={error} /> : (lines?.length ?? 0) < 4 ? <span className="text-muted"><Dots /></span> : null}
        </div>
        {error ? (
          <div className="flex justify-end">
            <button type="button" className={GHOST} onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
      </Dialog>
    );

  return (
    <Dialog label="New form" onClose={onClose} wide>
      <DialogHead title="New form" onClose={onClose} />
      <AskPill full value={text} onChange={setText} placeholder="Describe the form" onSend={() => void make({ text: text.trim() })} autoFocus />
      <span className={`${EYEBROW} mt-[4px]`}>Or start from</span>
      <div className="grid grid-cols-2 gap-[10px] sm:grid-cols-3">
        {STARTERS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={pick === s.key}
            onClick={() => setPick(s.key)}
            onDoubleClick={() => void make({ starter: s.key })}
            className={`flex flex-col gap-[8px] rounded-[10px] border p-[10px] text-left transition-colors duration-[120ms] ${pick === s.key ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
          >
            <span aria-hidden="true" className="flex h-[70px] flex-col gap-[5px] rounded-[6px] border border-line bg-paper p-[9px]">
              {Array.from({ length: Math.min(3, s.questions) }, (_, i) => (
                <i key={i} className="block h-[6px] rounded-[3px] bg-line-strong" />
              ))}
              <em className="mt-auto block h-[9px] w-[46%] rounded-full bg-ink" style={kit?.tokens.buttonBg ? { background: kit.tokens.buttonBg } : undefined} />
            </span>
            <b className="font-medium text-ink">{s.name}</b>
            <span className="text-[12px] text-muted">{s.text}</span>
          </button>
        ))}
      </div>
      <ErrorNote message={error || ctx.error} />
      <div className="mt-[4px] flex flex-wrap items-center justify-end gap-[8px]">
        <span className="mr-auto text-[12px] text-muted">{siteName ? `In your brand kit, from ${siteName}` : "In Claritia's look"}</span>
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={BTN} disabled={!ctx.data} onClick={() => void make({ starter: pick })}>
          Create
        </button>
      </div>
    </Dialog>
  );
}

// The assistant's box at the bottom of Routing and Scoring screens ------------------------------------------------------

/** The assistant's box, always at the bottom of the screen. */
export function AskDock({ placeholder, onSend, busy = false, wide = false }: { placeholder: string; onSend: (text: string) => void; busy?: boolean; wide?: boolean }) {
  const [text, setText] = useState("");
  const send = (t: string) => {
    if (!t.trim() || busy) return;
    setText("");
    onSend(t);
  };
  return (
    <div className="shrink-0 border-t border-line bg-card px-4 pt-3 pb-4 md:px-8">
      <div className={`mx-auto flex flex-col gap-2.5 ${wide ? "" : "max-w-5xl"}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
          className="flex items-center gap-2 rounded-[14px] border border-line-strong bg-card py-1.5 pr-1.5 pl-3.5 transition-[border-color,box-shadow] duration-[120ms] focus-within:border-ink focus-within:shadow-[0_0_0_3px_var(--color-hover)]"
        >
          <AiMark size={15} />
          <input aria-label="Ask the assistant" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint" />
          <IconButton label="Send" type="submit" disabled={busy || !text.trim()} className="bg-ink text-paper hover:bg-ink hover:opacity-90">
            <Send size={15} />
          </IconButton>
        </form>
      </div>
    </div>
  );
}
