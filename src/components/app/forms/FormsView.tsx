"use client";

// Inbound › Forms (docs/forms-plan.md): the list, and one form's screen. A form's screen is a header (the crumb, the
// name to type in, its state, Saved, undo, redo, Preview, the more menu and Publish) and five tabs with icons, kept in
// the address as ?tab=: Build (the form as visitors see it, the 400 px panel and the AI bar), Submissions, Share, Sync
// and Settings. Drafts save as you go; Publish checks the form first and makes the draft live.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOp, type Op } from "@/lib/forms/ops";
import { allFields, checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { askConfirm, tell } from "../Dialogs";
import { Badge, cache, ErrorNote, errorText, invalidate, Loading, must, postJson, setLeaveGuard, Tabs, useQuery, type ViewProps } from "../ui";
import { useLiveBody } from "../routing/screenParts";
import { useRoutingLoad } from "../routing/useRouterData";
import { firstRow, routeRows, type Routes } from "./routes";
import { Build, type Pick as Picked } from "./Build";
import { mergeKey } from "./editorModel";
import { useFormChat } from "./FormChat";
import { FormHome, MADE_KEY } from "./FormHome";
import { CONSENT_ID, publishChecks, questionsOf, rulesReading } from "./formModel";
import { Ic } from "./ic";
import { Menu } from "./Menu";
import { BTN, Dialog, DialogHead, EYEBROW, GHOST, GHOST_SM, IB, useNote } from "./parts";
import { PreviewOverlay } from "./PreviewOverlay";
import { Setup, type SetupSub } from "./Setup";
import { Share } from "./Share";
import type { Destination, FormRow, Kit, SourceRow } from "./shared";
import { Submissions } from "./Submissions";
import { Sync } from "./Sync";
import { useCrm } from "./useCrm";
import { meetingTypes } from "../meetings/TypesList";

export function FormsView(props: ViewProps) {
  if (props.id === "new") return <FormHome key="new" {...props} startNew />;
  if (props.id && props.id !== "overview") return <FormPage key={props.id} {...props} />;
  return <FormHome {...props} />;
}

export type FormData = {
  row: FormRow & { kind?: "built" | "captured" };
  published: Form | null;
  kits: Kit[];
  sources: SourceRow[];
  dests: Destination[];
  custom: CustomField[];
  site: string;
  types: { id: string; name: string; active: boolean; settings?: { lengths?: number[] } }[];
  subs: number;
  failed: Record<string, number>;
  pages: number;
};

function FormPage(props: ViewProps) {
  const { sb, ws, id } = props;
  // Everything the form's page needs, in one round of calls side by side (counts come from form_page_stats).
  const data = useQuery(`form:${ws.id}:${id}`, async (): Promise<FormData | { none: true }> => {
    const [f, kits, sources, dests, custom, sites, types, stats] = await Promise.all([
      sb.from("forms").select("id, name, status, kind, draft, draft_rev, version, brand_kit_id, published_at").eq("id", id).maybeSingle(),
      sb.from("brand_kits").select("id, name, tokens, logo_url, notes, source_url, scan_status, scan_error, scanned_at, design, design_live, design_rev").eq("workspace_id", ws.id).order("created_at"),
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name"),
      sb.from("form_destinations").select("id, kind, source_id, name, config, paused, position").eq("form_id", id).order("position"),
      sb.from("fields").select("key, label, type, options").eq("workspace_id", ws.id).eq("object", "contact").order("position"),
      sb.from("sites").select("domain").eq("workspace_id", ws.id).order("created_at").limit(1),
      meetingTypes(sb, ws.id),
      sb.rpc("form_page_stats", { p_form: id }),
    ]);
    const row = must(f) as FormData["row"] | null;
    if (!row) return { none: true };
    const list = (must(dests) ?? []) as Destination[];
    const st = must(stats) as { published: Form | null; subs: number; failed: Record<string, number>; pages: number };
    return {
      row,
      published: st.published ?? null,
      kits: (must(kits) ?? []) as Kit[],
      sources: (must(sources) ?? []) as SourceRow[],
      dests: list,
      custom: (must(custom) ?? []) as CustomField[],
      site: ((sites.data ?? []) as { domain: string }[])[0]?.domain ?? "",
      types: types as FormData["types"],
      subs: st.subs ?? 0,
      failed: st.failed ?? {},
      pages: st.pages ?? 0,
    };
  });
  if (data.error && !data.data) return <div className="p-[16px]"><ErrorNote message={data.error} /></div>;
  if (!data.data) return <Loading />;
  if ("none" in data.data) return <div className="p-[24px] text-muted">Form not found</div>;
  const patchRow = (p: Partial<FormData["row"]>) => data.set((d) => ("none" in d ? d : { ...d, row: { ...d.row, ...p } }));
  const patchKits = (fn: (kits: Kit[]) => Kit[]) => data.set((d) => ("none" in d ? d : { ...d, kits: fn(d.kits) }));
  const patchDests = (fn: (d: Destination[]) => Destination[]) => data.set((d) => ("none" in d ? d : { ...d, dests: fn(d.dests) }));
  return <Editor {...props} data={data.data} reload={data.reload} patchRow={patchRow} patchKits={patchKits} patchDests={patchDests} />;
}

export type Tab = "build" | "submissions" | "share" | "sync" | "settings";
const TABS: Tab[] = ["build", "submissions", "share", "sync", "settings"];
/** The tab in ?tab=, with the old names opening their new homes. */
function tabOf(search: string): Tab {
  const t = new URLSearchParams(search).get("tab") ?? "";
  if ((TABS as string[]).includes(t)) return t as Tab;
  return t === "results" ? "submissions" : t === "connect" ? "sync" : "build";
}

type Saving = "saved" | "saving" | "offline";

function Editor(props: ViewProps & { data: FormData; reload: () => void; patchRow: (p: Partial<FormData["row"]>) => void; patchKits: (fn: (kits: Kit[]) => Kit[]) => void; patchDests: (fn: (d: Destination[]) => Destination[]) => void }) {
  const { sb, session, ws, navigate, data, reload, patchRow, patchKits, patchDests } = props;
  const row = data.row;
  const start = useMemo(() => {
    const d = row.draft as Partial<Form>;
    return d && Array.isArray(d.steps) ? (d as Form) : emptyForm();
  }, [row.draft]);
  const [form, setFormState] = useState<Form>(start);
  const [name, setName] = useState(row.name);
  const [kitId, setKitId] = useState<string | null>(row.brand_kit_id);
  const [custom, setCustom] = useState<CustomField[]>(data.custom);
  const [past, setPast] = useState<Form[]>([]);
  const [future, setFuture] = useState<Form[]>([]);
  const [saving, setSaving] = useState<Saving>("saved");
  const [error, setError] = useState("");
  const [tab, setTabRaw] = useState<Tab>(() => (typeof window === "undefined" ? "build" : tabOf(window.location.search)));
  const [sub, setSub] = useState<SetupSub>("after");
  const [pick, setPick] = useState<Picked>(null);
  const [step, setStep] = useState(0);
  const [dialog, setDialog] = useState<"publish" | "versions" | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [preview, setPreview] = useState(false);
  // A form just made from a description says so once.
  const [said, setSaid] = useState<{ words: string; undo?: boolean; err?: boolean } | null>(() => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem(`${MADE_KEY}${row.id}`)) {
        sessionStorage.removeItem(`${MADE_KEY}${row.id}`);
        return { words: "Made from your words. Change anything here or below." };
      }
    } catch {}
    return null;
  });
  const [fresh, setFresh] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const note = useNote();
  const rev = useRef(row.draft_rev);
  const dirty = useRef(false);
  const latest = useRef(form);
  const merge = useRef<{ key: string; at: number } | null>(null);
  const crm = useCrm(data.sources, session, ws.id);
  const live = useLiveBody(sb, ws.id);
  // Routing as the After submit step reads it: live when a version is published and not paused.
  const rload = useRoutingLoad(session, ws.id);
  const [pv, setPv] = useState("");
  const routes = useMemo((): Routes => {
    const l = rload.data;
    const body = l?.live?.body ?? live.data?.body ?? null;
    const rows = body ? routeRows(body, l?.members ?? [], l?.fields ?? []) : [];
    const pick = rows.find((r) => r.id === pv) ?? firstRow(rows);
    return { on: !!body && !!l?.live && !l.paused, rows, pv: pick?.id ?? "", setPv, types: data.types, open: () => navigate("routing") };
  }, [rload.data, live.data, pv, data.types, navigate]);
  const kit = data.kits.find((k) => k.id === kitId) ?? null;
  // While the site is being read, check back every 2 seconds so the form takes the brand as soon as it's ready.
  const scanning = data.kits.some((k) => k.scan_status === "scanning");
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(reload, 2000);
    return () => clearInterval(t);
  }, [scanning, reload]);

  const setTab = (t: Tab) => {
    setTabRaw(t);
    try {
      const u = new URL(window.location.href);
      if (t === "build") u.searchParams.delete("tab");
      else u.searchParams.set("tab", t);
      history.replaceState(null, "", u);
    } catch {}
  };

  const put = (f: Form) => {
    latest.current = f;
    setFormState(f);
    dirty.current = true;
    setSaving("saving");
  };

  /** Apply ops as one undo step. Returns false when one can't apply (the reason shows in the AI bar's line). */
  const apply = useCallback((input: Op | Op[], words?: string, changed: string[] = []): boolean => {
    const ops = Array.isArray(input) ? input : [input];
    if (!ops.length) return true;
    const cur = latest.current;
    let next = cur;
    for (const op of ops) {
      const r = applyOp(next, op);
      if ("error" in r) {
        setSaid({ words: r.error, err: true });
        return false;
      }
      next = r.form;
    }
    const key = ops.length === 1 ? mergeKey(ops[0]!) : "";
    const now = Date.now();
    const joins = !!key && merge.current?.key === key && now - merge.current.at < 1000;
    merge.current = key ? { key, at: now } : null;
    if (!joins) setPast((p) => [...p.slice(-99), cur]);
    setFuture([]);
    put(next);
    if (words) setSaid({ words, undo: true });
    if (changed.length) {
      setFresh(changed);
      setTimeout(() => setFresh([]), 1900);
    }
    return true;
  }, []);
  const undo = useCallback(() => {
    if (!past.length) return;
    merge.current = null;
    setFuture((f) => [latest.current, ...f]);
    put(past[past.length - 1]!);
    setPast((p) => p.slice(0, -1));
    setSaid({ words: "Undone" });
  }, [past]);
  const redo = useCallback(() => {
    if (!future.length) return;
    merge.current = null;
    setPast((p) => [...p, latest.current]);
    put(future[0]!);
    setFuture((f) => f.slice(1));
    setSaid(null);
  }, [future]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]") || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Save the draft a moment after the last change; when it doesn't go, keep it here and try again every 5 seconds.
  const save = useCallback(async () => {
    if (!dirty.current) return true;
    dirty.current = false;
    const sent = latest.current;
    try {
      rev.current = must(await sb.rpc("form_save", { p_id: row.id, p_name: name, p_draft: sent, p_rev: rev.current, p_brand_kit: kitId })) as number;
      if (!dirty.current) setSaving("saved");
      return true;
    } catch (e) {
      dirty.current = true;
      const msg = errorText(e);
      if (/fetch|network|failed to|timeout|load failed/i.test(msg)) setSaving("offline");
      else {
        setSaving("offline");
        setError(msg);
      }
      return false;
    }
  }, [sb, row.id, name, kitId]);
  useEffect(() => {
    if (saving !== "saving") return;
    const t = setTimeout(() => void save(), 700);
    return () => clearTimeout(t);
  }, [saving, save, form, name, kitId]);
  useEffect(() => {
    if (saving !== "offline") return;
    const t = setInterval(() => void save(), 5000);
    return () => clearInterval(t);
  }, [saving, save]);
  useEffect(() => {
    setLeaveGuard(async () => (!dirty.current || (await save()) ? true : askConfirm("Leave without saving?", { ok: "Leave", danger: true })));
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", before);
    return () => {
      setLeaveGuard(null);
      window.removeEventListener("beforeunload", before);
    };
  }, [save]);
  const rename = (n: string) => {
    setName(n);
    dirty.current = true;
    setSaving("saving");
  };
  const setKit = (k: string | null) => {
    setKitId(k);
    dirty.current = true;
    setSaving("saving");
  };

  const checked = useMemo(() => checkForm(form, { custom }), [form, custom]);
  const isLive = row.status === "live";
  const changed = !data.published || JSON.stringify("form" in checked ? checked.form : form) !== JSON.stringify(data.published);
  const issueCtx = useMemo(() => ({ custom, crm: crm.ctx }), [custom, crm.ctx]);
  const failedWeek = Object.values(data.failed).reduce((a, b) => a + b, 0);

  const chat = useFormChat({
    session,
    ws,
    formId: row.id,
    prepare: async () => ((await save()) ? rev.current : null),
    onResult: (next, nextRev) => {
      setPast((p) => [...p.slice(-99), latest.current]);
      setFuture([]);
      latest.current = next;
      setFormState(next);
      rev.current = nextRev;
      dirty.current = false;
      setSaving("saved");
    },
  });

  const publish = async () => {
    setError("");
    try {
      if (!(await save())) throw new Error("The draft didn't save. Try again.");
      // The brand's styles go live with the form, so the published form looks like the one in Build.
      if (kit && JSON.stringify(kit.design ?? null) !== JSON.stringify(kit.design_live ?? null)) must(await sb.rpc("brand_kit_design_publish", { p_id: kit.id }));
      await postJson(session, "/api/forms/publish", { workspaceId: ws.id, id: row.id });
      setDialog(null);
      reload();
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
      note.show(data.pages ? `Live. ${data.pages} ${data.pages === 1 ? "page updates" : "pages update"} within a minute.` : "Live.");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const setStatus = async (s: "live" | "paused") => {
    // The status changes on click; it goes back, with the error, if the save fails.
    const was = row.status;
    patchRow({ status: s });
    try {
      must(await sb.rpc("form_set_status", { p_id: row.id, p_status: s }));
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
      note.show(s === "paused" ? "Offline. Pages show nothing until you publish again." : "Back online");
    } catch (e) {
      patchRow({ status: was });
      setError(errorText(e));
    }
  };
  const remove = async () => {
    const body = row.status === "draft" ? "It's a draft, so nothing else changes." : `It comes off every page it's on. Its ${data.subs.toLocaleString("en-US")} submissions stay on your contacts.`;
    if (!(await askConfirm(`Delete ${name}?`, { body, ok: "Delete", danger: true }))) return;
    try {
      must(await sb.rpc("form_delete", { p_id: row.id }));
      dirty.current = false;
      setLeaveGuard(null);
      cache.set<{ rows: { id: string }[] } | undefined>(`forms:${ws.id}:home`, (d) => (d ? { ...d, rows: d.rows.filter((x) => x.id !== row.id) } : d));
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
      navigate("forms");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const duplicate = async () => {
    try {
      await save();
      must(await sb.rpc("form_create", { p_ws: ws.id, p_name: `${name} (copy)`.slice(0, 120), p_draft: latest.current, p_brand_kit: kitId, p_kind: row.kind ?? "built" }));
      note.show("Duplicated as a draft");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const discard = () => {
    if (!data.published) return;
    setPast((p) => [...p.slice(-99), latest.current]);
    setFuture([]);
    put(data.published);
    note.show("Back to the live version");
  };
  const restore = (body: Form, version: number) => {
    setPast((p) => [...p.slice(-99), latest.current]);
    setFuture([]);
    put(body);
    setDialog(null);
    note.show(`Version ${version} is the draft now`);
  };

  /** Open a question on Build, with a section open (Sync's Fix, a check's Fix). */
  const goto = (qid: string, open = "save") => {
    const q = questionsOf(latest.current).find((x) => x.id === qid || x.pair?.id === qid);
    if (!q) return;
    setDialog(null);
    setTab("build");
    setStep(q.step);
    setPick({ id: q.id, open });
  };
  const openSetup = (s: SetupSub) => {
    setSub(s);
    setTab("settings");
  };

  /** Deleting a question: never the last email, and a word first when a Routing rule reads it. */
  const removeQuestion = async (qid: string) => {
    const q = questionsOf(latest.current).find((x) => x.id === qid);
    if (!q) return;
    if (q.id === CONSENT_ID) {
      apply({ op: "set_consent", mode: "off" }, "Removed the consent box");
      if (pick?.id === qid) setPick(null);
      return;
    }
    if (q.kind === "email" && allFields(latest.current).filter((f) => f.key === "email").length <= 1) {
      await tell("Keep one email question", "Leads need an email to become contacts, get the auto-reply and book a meeting.");
      return;
    }
    const rules = q.field ? rulesReading(live.data?.body, q.field) : [];
    if (rules.length && !(await askConfirm(`Delete ${q.label || "this question"}?`, { body: `The ${rules[0]} rule in Routing reads it. Leads will skip that part of the rule.`, ok: "Delete", danger: true }))) return;
    if (pick?.id === qid) setPick(null);
    apply([...(q.pair ? [{ op: "remove_field" as const, id: q.pair.id }] : []), { op: "remove_field", id: q.id }], `Deleted ${q.label || "the question"}`);
  };

  const status = !row.version ? (
    <Badge>Draft</Badge>
  ) : row.status === "paused" ? (
    <Badge>Offline</Badge>
  ) : changed ? (
    <span title="People see the last published version">
      <Badge tone="amber" dot>
        Live, edited
      </Badge>
    </span>
  ) : (
    <Badge tone="green" dot>
      Live
    </Badge>
  );
  const checks = useMemo(() => publishChecks(form, "errors" in checked ? checked.errors : [], issueCtx, data.pages), [form, checked, issueCtx, data.pages]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <header className="flex h-[48px] shrink-0 items-center gap-[8px] border-b border-line pr-[12px] pl-[16px] text-[14px] font-medium">
        <button type="button" onClick={() => navigate("forms")} className="inline-flex shrink-0 items-center gap-[6px] font-normal text-muted transition-colors duration-[120ms] hover:text-ink">
          <Ic n="form" />
          <span className="max-[860px]:hidden">Forms</span>
        </button>
        <span className="text-faint">/</span>
        <NameInput value={name} onChange={rename} />
        <span className="max-[860px]:hidden">{status}</span>
        <span className="flex-1" />
        <span className={`text-[12px] font-normal whitespace-nowrap max-[860px]:hidden ${saving === "offline" ? "text-butter" : "text-muted"}`}>{saving === "offline" ? "Not saved. Trying again" : saving === "saving" ? "Saving" : "Saved"}</span>
        <button type="button" className={`${IB} max-[860px]:hidden`} onClick={undo} disabled={!past.length} title="Undo" aria-label="Undo">
          <Ic n="undo" />
        </button>
        <button type="button" className={`${IB} max-[860px]:hidden`} onClick={redo} disabled={!future.length} title="Redo" aria-label="Redo">
          <Ic n="redo" />
        </button>
        <button type="button" className={`${IB} max-[860px]:hidden`} onClick={() => setPreview(true)} title="Preview" aria-label="Preview">
          <Ic n="eye" />
        </button>
        <button type="button" className={IB} onClick={(e) => setMenu(menu ? null : e.currentTarget)} title="More" aria-label="More" aria-haspopup="menu" aria-expanded={!!menu}>
          <Ic n="more" />
        </button>
        <button type="button" className={BTN} disabled={!!row.version && isLive && !changed} onClick={() => setDialog("publish")}>
          Publish
          {row.version ? <span className="-ml-[4px] max-[860px]:hidden">&nbsp;changes</span> : null}
        </button>
      </header>
      {menu ? (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            { icon: "clock", label: "Versions", run: () => setDialog("versions") },
            { icon: "dup", label: "Duplicate", run: () => void duplicate() },
            { icon: "undo", label: "Discard changes", disabled: !data.published || !changed, run: discard },
            row.status === "paused" ? { icon: "eye", label: "Put back online", run: () => void setStatus("live") } : { icon: "eye", label: "Take offline", disabled: !isLive, run: () => void setStatus("paused") },
            "hr",
            { icon: "trash", label: "Delete form", danger: true, run: () => void remove() },
          ]}
        />
      ) : null}
      <Tabs<Tab>
        dense
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "build", label: "Build", icon: <Ic n="build" /> },
          { value: "submissions", label: "Submissions", icon: <Ic n="inbox" />, count: data.subs },
          { value: "share", label: "Share", icon: <Ic n="share" /> },
          { value: "sync", label: "Sync", icon: <Ic n="sync" />, dot: failedWeek ? `${failedWeek} ${failedWeek === 1 ? "lead didn't" : "leads didn't"} reach the CRM` : undefined },
          { value: "settings", label: "Settings", icon: <Ic n="gear" /> },
        ]}
      />
      {saving === "offline" ? (
        <div className="flex h-[44px] shrink-0 items-center gap-[10px] border-b border-line bg-paper pr-[12px] pl-[16px] text-[12.5px]">
          <span className="inline-flex size-[24px] shrink-0 items-center justify-center rounded-[7px] bg-butter-wash text-butter">
            <Ic n="warn" s={13} />
          </span>
          <b className="font-semibold text-ink">Not saved</b>
          <span className="min-w-0 truncate text-body">{error || "Your changes are kept here and save when the connection comes back"}</span>
          <span className="flex-1" />
          <button type="button" className={GHOST_SM} onClick={() => void save()}>
            Try now
          </button>
        </div>
      ) : error ? (
        <div className="shrink-0 border-b border-line px-[16px] py-[8px]">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {tab === "build" ? (
          <Build
            {...props}
            form={form}
            name={name}
            apply={apply}
            custom={custom}
            onCustom={(c) => setCustom((x) => [...x, c])}
            crm={crm}
            routing={live.data?.body ?? null}
            routes={routes}
            kit={kit}
            kits={data.kits}
            setKit={setKit}
            reloadKits={reload}
            patchKits={patchKits}
            site={kit?.source_url ?? data.site}
            types={data.types}
            pick={pick}
            setPick={setPick}
            step={step}
            setStep={setStep}
            said={said}
            setSaid={setSaid}
            fresh={fresh}
            chat={chat}
            busy={busy}
            setBusy={setBusy}
            saving={saving}
            onUndo={undo}
            onRemove={(qid) => void removeQuestion(qid)}
            onSettings={openSetup}
          />
        ) : tab === "submissions" ? (
          <Submissions {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} onFix={(qid) => goto(qid)} />
        ) : tab === "share" ? (
          <Share {...props} form={form} row={row} apply={apply} kit={kit} site={data.site} />
        ) : tab === "sync" ? (
          <Sync {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} crm={crm} failed={data.failed} reload={reload} patchDests={patchDests} onFix={(qid) => goto(qid)} issueCtx={issueCtx} />
        ) : (
          <Setup {...props} form={form} apply={apply} sub={sub} setSub={setSub} formId={row.id} types={data.types} routing={live.data?.body ?? null} routes={routes} onReview={() => setTab("submissions")} subs={data.subs} name={name} />
        )}
      </div>
      {dialog === "publish" ? <PublishDialog checks={checks} live={!!row.version} onClose={() => setDialog(null)} onPublish={() => void publish()} onFix={(qid) => goto(qid)} error={error} /> : null}
      {dialog === "versions" ? <Versions {...props} formId={row.id} live={row.version} changed={changed} onClose={() => setDialog(null)} onRestore={restore} /> : null}
      {preview ? <PreviewOverlay form={form} tokens={kit?.tokens ?? {}} crmName={crm.crms[0]?.name} onClose={() => setPreview(false)} /> : null}
      {note.node}
    </div>
  );
}

/** The form's name, typed in place in the header. */
function NameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <input
      aria-label="Form name"
      value={text}
      maxLength={120}
      size={Math.max(8, text.length)}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim()) onChange(e.target.value.trim());
      }}
      onBlur={() => !text.trim() && setText(value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="-mx-[4px] max-w-[40vw] min-w-[60px] rounded-[4px] bg-transparent px-[4px] py-[2px] text-[14px] font-medium text-ink outline-none [field-sizing:content] hover:bg-hover focus:bg-card focus:shadow-[0_0_0_1px_var(--color-ink)] max-[860px]:max-w-[46vw]"
    />
  );
}

/** Publish: what to look at first. A missing email or a form the checker refuses can't go live; the rest can. */
function PublishDialog({ checks, live, onClose, onPublish, onFix, error }: { checks: ReturnType<typeof publishChecks>; live: boolean; onClose: () => void; onPublish: () => void; onFix: (q: string) => void; error: string }) {
  const [busy, setBusy] = useState(false);
  const bad = checks.filter((c) => c.lvl !== "ok");
  const blocks = checks.some((c) => c.blocks);
  return (
    <Dialog label={live ? "Publish changes" : "Publish"} onClose={onClose}>
      <span className={EYEBROW}>{live ? "Publish changes" : "Publish"}</span>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{bad.length ? `${bad.length} ${bad.length === 1 ? "thing" : "things"} to look at` : "Ready to go live"}</h2>
      <div className="flex flex-col gap-[8px]">
        {checks.map((c, i) => (
          <div key={`${c.t}${i}`} className="flex items-start gap-[10px] rounded-lg border border-line px-[12px] py-[10px]">
            <span className={`inline-flex size-[24px] shrink-0 items-center justify-center rounded-[7px] ${c.lvl === "ok" ? "bg-signal-soft text-signal" : c.lvl === "warn" ? "bg-butter-wash text-butter" : "bg-rose-wash text-rose"}`}>
              <Ic n={c.lvl === "ok" ? "check" : "warn"} s={12} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block font-medium text-ink">{c.t}</b>
              {c.s ? <span className="text-[12.5px] text-muted">{c.s}</span> : null}
            </span>
            {c.q ? (
              <button type="button" className={GHOST_SM} onClick={() => onFix(c.q!)}>
                Fix
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <ErrorNote message={error} />
      <div className="mt-[4px] flex justify-end gap-[8px]">
        <button type="button" className={GHOST} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={BTN}
          disabled={blocks || busy}
          onClick={async () => {
            setBusy(true);
            await onPublish();
            setBusy(false);
          }}
        >
          {bad.length && !blocks ? "Publish anyway" : live ? "Publish changes" : "Publish"}
        </button>
      </div>
    </Dialog>
  );
}

/** Every published version, newest first, and the draft. An older one can be made the draft again. */
function Versions({ sb, formId, live, changed, onClose, onRestore }: Pick<ViewProps, "sb"> & { formId: string; live: number; changed: boolean; onClose: () => void; onRestore: (body: Form, v: number) => void }) {
  const list = useQuery(`form:${formId}:versions:${live}`, async () => (must(await sb.from("form_versions").select("version, body, at").eq("form_id", formId).order("version", { ascending: false }).limit(50)) ?? []) as { version: number; body: Form; at: string }[]);
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const words = (b: Form) => {
    const n = questionsOf(b).filter((q) => q.kind !== "heading" && q.kind !== "para").length;
    return `${b.steps.length > 1 ? `${b.steps.length} steps, ` : ""}${n} ${n === 1 ? "question" : "questions"}${b.after.schedule ? ", books a meeting" : ""}`;
  };
  return (
    <Dialog label="Versions" onClose={onClose}>
      <DialogHead title="Versions" onClose={onClose} />
      {!list.data ? (
        list.error ? <ErrorNote message={list.error} /> : <Loading />
      ) : (
        <div className="rounded-[10px] border border-line">
          {changed || !live ? (
            <div className="flex min-h-[52px] items-center gap-[12px] px-[16px] py-[12px]">
              <span className="min-w-0 flex-1">
                <b className="block font-medium text-ink">Draft</b>
                <span className="text-[12px] text-muted">Your changes, not live</span>
              </span>
              <span className="text-[12px] text-muted">Now</span>
            </div>
          ) : null}
          {list.data.map((v) => (
            <div key={v.version} className="flex min-h-[52px] items-center gap-[12px] border-t border-line px-[16px] py-[12px] first:border-t-0">
              <span className="min-w-0 flex-1">
                <b className="block font-medium text-ink">{`Version ${v.version}`}</b>
                <span className="text-[12px] text-muted">{v.version === live ? `Live. ${words(v.body)}` : words(v.body)}</span>
              </span>
              <span className="text-[12px] text-muted">{day(v.at)}</span>
              {v.version === live ? (
                <Badge tone="green" dot>
                  Live
                </Badge>
              ) : (
                <button type="button" className={GHOST_SM} onClick={() => onRestore(v.body, v.version)}>
                  Restore
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <span className="text-[12px] text-muted">Restoring makes it the draft. Publish to make it live.</span>
    </Dialog>
  );
}

