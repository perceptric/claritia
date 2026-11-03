"use client";

// Inbound › Forms (docs/forms.md): the list, and one form's screen. A form's screen is a header (the crumb, the name to
// type in, its state, Saved, undo, redo, Preview, the more menu and Publish) and five tabs with icons, kept in the
// address as ?tab=: Build (the outline, the live form and its panel, build/Builder.tsx), Submissions, Share, Sync and
// Settings. Drafts save as you go; Publish checks the form first and makes the draft live.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOp, type Op } from "@/lib/forms/ops";
import { checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { askConfirm, tell } from "../Dialogs";
import { Badge, cache, ErrorNote, errorText, invalidate, Loading, must, postJson, setLeaveGuard, useQuery, type ViewProps } from "../ui";
import { useLiveBody } from "../routing/screenParts";
import { Builder, SUBMIT, type Pick as Picked } from "./build/Builder";
import { mergeKey } from "./editorModel";
import { FormHome, MADE_KEY } from "./FormHome";
import { publishChecks, questionsOf } from "./formModel";
import { Ic } from "./ic";
import { Menu } from "./Menu";
import { BTN, Dialog, DialogHead, EYEBROW, GHOST, GHOST_SM, IB, useNote } from "./parts";
import { PreviewOverlay } from "./PreviewOverlay";
import { skinForKit } from "@/lib/brand/skin";
import { Setup, type SetupSub } from "./Setup";
import { useRoutingFacts } from "./formRouting";
import { Share } from "./Share";
import type { Destination, FormRow, Kit, SourceRow } from "./shared";
import { Submissions } from "./Submissions";
import { Sync } from "./Sync";
import { useCrm } from "./useCrm";
import { meetingTypes, type TypeRow } from "../meetings/TypesList";
import { Studio } from "./studio/Studio";
import { TemplatesPage } from "./templates/TemplatesPage";
import type { StudioControl, StudioState } from "./studio/studio";
import { FormCheck, FormHeader, type FormTab, type HeaderAction, type HeaderState } from "./FormHeader";
import { sameJson } from "@/lib/sameJson";

export function FormsView(props: ViewProps) {
  // New form is Form Studio (docs/forms-chat-plan.md): chat with Tia on the left, the live form on the right.
  if (props.id === "studio") return <StudioPage key={`studio:${chatParam()}`} {...props} />;
  if (props.id === "new") return <StudioPage key="new" {...props} fresh />;
  if (props.id === "templates" || props.id.startsWith("templates/")) return <TemplatesPage {...props} />;
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
  types: TypeRow[];
  subs: number;
  failed: Record<string, number>;
  pages: number;
  /** A Studio form's chat state (112): "changed" when the page has edits that aren't live. */
  chatState: string | null;
};

const chatParam = () => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("chat") ?? ""));

/**
 * Form Studio before its form exists (New form, or a chat picked from the Studio): the same header, with the tabs
 * once the chat has a form. Its tabs open the form's own page.
 */
function StudioPage(props: ViewProps & { fresh?: boolean }) {
  const { navigate } = props;
  const [st, setSt] = useState<StudioState | null>(null);
  const control = useRef<StudioControl | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const [checkAt, setCheckAt] = useState<HTMLElement | null>(null);
  const [chatId] = useState(chatParam);
  // ?ask=<words>: the gallery's Describe your form, put in the message box of the new chat.
  const [ask] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("ask") ?? "")));
  const pill: HeaderState = !st || st.state === "new" || st.state === "draft" ? "draft" : st.state === "changed" ? "changed" : "live";
  const go = (t: FormTab) => {
    if (st?.formId && t !== "build") navigate("forms", st.formId, `tab=${t}`);
  };
  const run = async () => {
    const r = await control.current?.publish();
    if (r === "blocked") setCheckAt(actionRef.current);
  };
  const action: HeaderAction = st?.publishing
    ? { label: "Publishing", onClick: () => undefined, disabled: true }
    : pill === "live"
      ? { label: "Share", onClick: () => go("share") }
      : { label: pill === "changed" ? "Publish changes" : "Publish", onClick: () => void run(), disabled: !st?.canPublish, problems: st?.issues.filter((i) => i.level === "error").length };
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <FormHeader navigate={navigate} name={st?.name || "New form"} onRename={st?.ready ? (n) => control.current?.rename(n) : undefined} state={pill} tab="build" onTab={go} tabs={!!st?.formId} action={action} actionRef={actionRef} />
      {st?.msg && !/first$/.test(st.msg) ? (
        <div className="shrink-0 border-b border-line px-[16px] py-[8px]">
          <ErrorNote message={st.msg} />
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <Studio {...props} fresh={props.fresh} chatId={chatId} text={props.fresh ? ask : ""} onState={setSt} controlRef={control} />
      </div>
      {checkAt && st ? <FormCheck anchor={checkAt} issues={st.issues} canFix={st.canFix} onFix={(f) => control.current?.fix(f)} onOpenAfter={() => control.current?.openAfter()} onClose={() => setCheckAt(null)} /> : null}
    </div>
  );
}

function FormPage(props: ViewProps) {
  const { sb, ws, id } = props;
  // Everything the form's page needs, in one round of calls side by side (counts come from form_page_stats).
  const data = useQuery(`form:${ws.id}:${id}`, async (): Promise<FormData | { none: true }> => {
    const [f, kits, sources, dests, custom, sites, types, stats, chat] = await Promise.all([
      // "*": live_kit_id (109) when the database has it, and the rest as before when it doesn't yet.
      sb.from("forms").select("*").eq("id", id).maybeSingle(),
      // "*": the skin (111) and the brand book (108) when the database has them.
      sb.from("brand_kits").select("*").eq("workspace_id", ws.id).order("created_at"),
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name"),
      sb.from("form_destinations").select("id, kind, source_id, name, config, paused, position").eq("form_id", id).order("position"),
      sb.from("fields").select("key, label, type, options").eq("workspace_id", ws.id).eq("object", "contact").order("position"),
      sb.from("sites").select("domain").eq("workspace_id", ws.id).order("created_at").limit(1),
      meetingTypes(sb, ws.id),
      sb.rpc("form_page_stats", { p_form: id }),
      // A Studio form's chat (112); before 112 there's none and the page reads as published.
      sb.from("form_chats").select("state").eq("form_id", id).order("updated_at", { ascending: false }).limit(1),
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
      chatState: ((chat.data ?? []) as { state: string }[])[0]?.state ?? null,
    };
  });
  if (data.error && !data.data) return <div className="p-[16px]"><ErrorNote message={data.error} /></div>;
  if (!data.data) return <Loading />;
  if ("none" in data.data) return <div className="p-[24px] text-muted">Form not found</div>;
  // An older form moves into the Studio the first time it opens; a form that reads the site's own form has no page.
  const r0 = data.data.row as FormData["row"] & { kind?: string };
  const d0 = (r0.draft ?? {}) as { page?: unknown; capture?: unknown };
  if (!d0.page && !d0.capture && r0.kind !== "captured")
    return (
      <MoveToStudio
        {...props}
        onDone={(lost) => {
          data.reload();
          if (lost.length) void tell("Moved into the Studio", `Not carried over: ${lost.join("; ")}.`);
        }}
      />
    );
  const patchRow = (p: Partial<FormData["row"]>) => data.set((d) => ("none" in d ? d : { ...d, row: { ...d.row, ...p } }));
  const patchKits = (fn: (kits: Kit[]) => Kit[]) => data.set((d) => ("none" in d ? d : { ...d, kits: fn(d.kits) }));
  const patchDests = (fn: (d: Destination[]) => Destination[]) => data.set((d) => ("none" in d ? d : { ...d, dests: fn(d.dests) }));
  return <Editor {...props} data={data.data} reload={data.reload} patchRow={patchRow} patchKits={patchKits} patchDests={patchDests} />;
}

/** An older form's draft, turned into a studio page on the server (docs/forms-chat-plan.md Part 8). */
function MoveToStudio({ session, ws, id, onDone }: ViewProps & { onDone: (lost: string[]) => void }) {
  const [error, setError] = useState("");
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    let live = true;
    postJson<{ lost?: string[] }>(session, "/api/studio", { workspaceId: ws.id, mode: "convert", formId: id }).then(
      (r) => live && done.current(r.lost ?? []),
      (e) => live && setError(errorText(e)),
    );
    return () => {
      live = false;
    };
  }, [session, ws.id, id]);
  return error ? <div className="p-[16px]"><ErrorNote message={error} /></div> : <Loading />;
}

export type Tab = FormTab;
const TABS: Tab[] = ["build", "submissions", "share", "sync", "settings"];
/** The tab in ?tab=, with the old names opening their new homes. */
function tabOf(search: string): Tab {
  const t = new URLSearchParams(search).get("tab") ?? "";
  if ((TABS as string[]).includes(t)) return t as Tab;
  return t === "results" ? "submissions" : t === "connect" ? "sync" : "build";
}

type Saving = "saved" | "saving" | "offline";

function Editor(props: ViewProps & { data: FormData; reload: () => void; patchRow: (p: Partial<FormData["row"]>) => void; patchKits: (fn: (kits: Kit[]) => Kit[]) => void; patchDests: (fn: (d: Destination[]) => Destination[]) => void }) {
  const { sb, session, ws, navigate, data, reload, patchRow, patchDests } = props;
  const row = data.row;
  // A Form Studio form: Build is the Studio, and its page goes live through the Studio's publish.
  const [isStudio] = useState(() => !!row.draft && typeof row.draft === "object" && "page" in (row.draft as object));
  const [studio, setStudio] = useState<StudioState | null>(null);
  const control = useRef<StudioControl | null>(null);
  const wantPublish = useRef(false);
  // The Studio opened this form's chat once; only after that does picking another chat open another page.
  const matched = useRef(false);
  const openAfter = useRef(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("open") === "submission");
  const actionRef = useRef<HTMLButtonElement>(null);
  const [checkAt, setCheckAt] = useState<HTMLElement | null>(null);
  const start = useMemo(() => {
    const d = row.draft as Partial<Form>;
    return d && Array.isArray(d.steps) ? (d as Form) : emptyForm();
  }, [row.draft]);
  const [form, setFormState] = useState<Form>(start);
  const [name, setName] = useState(row.name);
  const [kitId, setKitId] = useState<string | null>(row.brand_kit_id);
  const [custom] = useState<CustomField[]>(data.custom);
  const [past, setPast] = useState<Form[]>([]);
  const [future, setFuture] = useState<Form[]>([]);
  const [saving, setSaving] = useState<Saving>("saved");
  const [error, setError] = useState("");
  const [tab, setTabRaw] = useState<Tab>(() => (typeof window === "undefined" ? "build" : tabOf(window.location.search)));
  const [sub, setSub] = useState<SetupSub>("alerts");
  // Opened from a meeting's "Used by": straight to On Submission.
  const [pick, setPick] = useState<Picked>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("open") === "submission" ? { id: SUBMIT, open: null } : null));
  const [step, setStep] = useState(0);
  const [dialog, setDialog] = useState<"publish" | "versions" | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [subsView, setSubsView] = useState<"leads" | "spam">("leads");
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
  const note = useNote();
  const rev = useRef(row.draft_rev);
  const dirty = useRef(false);
  const latest = useRef(form);
  const merge = useRef<{ key: string; at: number } | null>(null);
  // One save at a time, so a slow save never sends an old revision next to a new one.
  const inflight = useRef<Promise<boolean> | null>(null);
  const saveErr = useRef(false);
  const crm = useCrm(data.sources, session, ws.id);
  const live = useLiveBody(sb, ws.id);
  const kit = data.kits.find((k) => k.id === kitId) ?? null;
  const facts = useRoutingFacts(session, ws.id);
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
  const apply = useCallback((input: Op | Op[], words?: string): boolean => {
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
    return true;
  }, []);
  /** A whole new form from the builder, as one undo step; typing in one box within a second stays one step. */
  const replace = useCallback((next: Form, words?: string) => {
    const now = Date.now();
    const joins = !words && merge.current?.key === "replace" && now - merge.current.at < 1000;
    merge.current = words ? null : { key: "replace", at: now };
    if (!joins) setPast((p) => [...p.slice(-99), latest.current]);
    setFuture([]);
    put(next);
    if (words) setSaid({ words, undo: true });
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
    // Form Studio has its own undo; its keys come from inside its shadow root and must reach it.
    if (isStudio) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]") || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, isStudio]);

  // Opened from a meeting's "Use in a form": this form books that meeting from now on (a change to publish like any other).
  useEffect(() => {
    const u = new URL(window.location.href);
    const use = u.searchParams.get("use");
    if (!use) return;
    u.searchParams.delete("use");
    history.replaceState(null, "", u);
    if (!data.types.some((t) => t.id === use)) return;
    const cur = latest.current.after;
    apply([...(cur.end.kind === "redirect" ? [{ op: "set_after" as const, end: { kind: "message" as const, title: "Thanks, we got it." } }] : []), { op: "set_schedule", schedule: { ...(cur.schedule ?? {}), tool: "claritia", url: "", perOwner: false, meetingTypeId: use, routes: cur.schedule?.routes ?? [] } }], "Books this meeting now");
    // Once, when the form opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the draft a moment after the last change; when it doesn't go, keep it here and try again every 5 seconds.
  const save = useCallback(async (): Promise<boolean> => {
    while (inflight.current) await inflight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    const sent = latest.current;
    const run = (async () => {
      try {
        rev.current = must(await sb.rpc("form_save", { p_id: row.id, p_name: name, p_draft: sent, p_rev: rev.current, p_brand_kit: kitId })) as number;
        if (!dirty.current) setSaving("saved");
        if (saveErr.current) {
          saveErr.current = false;
          setError("");
        }
        return true;
      } catch (e) {
        dirty.current = true;
        const msg = errorText(e);
        setSaving("offline");
        if (!/fetch|network|failed to|timeout|load failed/i.test(msg)) {
          saveErr.current = true;
          setError(msg);
        }
        return false;
      }
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
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
    // The Studio's chat keeps the same name, so its next publish doesn't put the old one back.
    control.current?.rename(n);
  };
  /**
   * Form Studio wrote and published the draft on the server: this page takes it, with its revision, so its next save
   * doesn't meet "changed in another window". Its own changes saved just before the publish.
   */
  const takeServerDraft = useCallback(async () => {
    const r = must(await sb.from("forms").select("name, draft, draft_rev").eq("id", row.id).maybeSingle()) as { name: string; draft: Partial<Form> | null; draft_rev: number } | null;
    if (!r || dirty.current) return;
    if (r.draft && Array.isArray(r.draft.steps)) {
      latest.current = r.draft as Form;
      setFormState(r.draft as Form);
      setPast([]);
      setFuture([]);
    }
    rev.current = r.draft_rev;
    setName(r.name);
  }, [sb, row.id]);
  const setKit = (k: string | null) => {
    setKitId(k);
    dirty.current = true;
    setSaving("saving");
  };

  const checked = useMemo(() => checkForm(form, { custom }), [form, custom]);
  const isLive = row.status === "live";
  // Another brand kit is a change to publish too: the live form keeps the kit it was published with (109).
  const liveKit = (row as { live_kit_id?: string | null }).live_kit_id;
  // Compared whatever order the keys come back in from the database.
  const changed = !data.published || !sameJson("form" in checked ? checked.form : form, data.published) || (liveKit !== undefined && (liveKit ?? null) !== (kitId ?? null));
  const issueCtx = useMemo(() => ({ custom, crm: crm.ctx }), [custom, crm.ctx]);
  const failedWeek = Object.values(data.failed).reduce((a, b) => a + b, 0);

  const publish = async () => {
    setError("");
    try {
      if (!(await save())) throw new Error("The draft didn't save. Try again.");
      // The brand's styles go live with the form, so the published form looks like the one in Build.
      if (kit && JSON.stringify(kit.design ?? null) !== JSON.stringify(kit.design_live ?? null)) must(await sb.rpc("brand_kit_design_publish", { p_id: kit.id }));
      // The form's routing goes live with it, on the server: compiled with its meetings into the form's routing policy.
      const { routing } = await postJson<{ routing?: { problems: string[]; error?: string } }>(session, "/api/forms/publish", { workspaceId: ws.id, id: row.id });
      // Publishing an offline form puts it back online, as the Take offline note says.
      if (row.status === "paused") must(await sb.rpc("form_set_status", { p_id: row.id, p_status: "live" }));
      if (routing?.error) setError(`The form is live. ${routing.error}`);
      else if (routing?.problems.length) setError(`The form is live. Routing left out: ${routing.problems.join(", ")}.`);
      invalidate(`routing_screen:${ws.id}`);
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


  const checks = useMemo(() => publishChecks(form, "errors" in checked ? checked.errors : [], issueCtx, data.pages), [form, checked, issueCtx, data.pages]);

  // ── The header's state and its one button ──
  // A Studio form's page has edits that aren't live: known from the Studio while it's open, from its chat before.
  const studioUnpublished = isStudio && (studio ? studio.state !== "live" : data.chatState === "changed" || data.chatState === "draft");
  const pill: HeaderState = !row.version ? "draft" : row.status === "paused" ? "offline" : changed || studioUnpublished ? "changed" : "live";
  const studioPublish = useCallback(async () => {
    setError("");
    if (!(await save())) return setError("The draft didn't save. Try again.");
    const r = await control.current?.publish();
    if (r === "live") {
      await takeServerDraft().catch((e) => setError(errorText(e)));
      reload();
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
    } else if (r === "blocked") setCheckAt(actionRef.current);
  }, [save, reload, ws.id, takeServerDraft]);
  const onPublish = () => {
    if (!isStudio) return setDialog("publish");
    // The page itself changed (or was never live): the Studio publishes it, from Build.
    if (studioUnpublished || !row.version) {
      if (tab !== "build" || !control.current) {
        wantPublish.current = true;
        setTab("build");
        return;
      }
      return void studioPublish();
    }
    // Only the form's settings changed (Share, Settings): the draft goes live as it is.
    void publish();
  };
  const onStudio = useCallback(
    (s: StudioState) => {
      // Only this form's chat, once loaded, speaks for the header (no flash of "Changes not live" while it loads).
      if (!s.ready) return;
      if (s.formId !== row.id) {
        // Another chat was picked in the Studio: it opens on its own page. Before this form's chat opened (a load
        // that failed), nothing moves.
        if (!matched.current) return;
        if (s.formId) navigate("forms", s.formId);
        else if (s.state === "new") navigate("forms", "new");
        else navigate("forms", "studio", `chat=${s.chatId}`);
        return;
      }
      matched.current = true;
      setStudio(s);
      if (openAfter.current) {
        openAfter.current = false;
        control.current?.openAfter();
      }
      if (wantPublish.current) {
        wantPublish.current = false;
        if (s.canPublish) void studioPublish();
      }
    },
    [row.id, navigate, studioPublish],
  );
  const problems = isStudio ? (studio?.issues.filter((i) => i.level === "error").length ?? 0) : checks.filter((c) => c.blocks).length;
  const action: HeaderAction =
    isStudio && studio?.publishing
      ? { label: "Publishing", onClick: () => undefined, disabled: true }
      : pill === "live"
        ? { label: "Share", onClick: () => setTab("share") }
        : { label: pill === "changed" ? "Publish changes" : "Publish", onClick: onPublish, problems };
  const studioMsg = isStudio && studio?.msg && !/first$/.test(studio.msg) ? studio.msg : "";

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <FormHeader
        navigate={navigate}
        name={name}
        onRename={rename}
        state={pill}
        saving={saving === "saving"}
        tab={tab}
        onTab={setTab}
        subs={data.subs}
        syncDot={failedWeek ? `${failedWeek} ${failedWeek === 1 ? "lead didn't" : "leads didn't"} reach the CRM` : undefined}
        tools={
          isStudio ? null : (
            <>
              <button type="button" className={`${IB} max-[860px]:hidden`} onClick={undo} disabled={!past.length} title="Undo" aria-label="Undo">
                <Ic n="undo" />
              </button>
              <button type="button" className={`${IB} max-[860px]:hidden`} onClick={redo} disabled={!future.length} title="Redo" aria-label="Redo">
                <Ic n="redo" />
              </button>
              <button type="button" className={`${IB} max-[860px]:hidden`} onClick={() => setPreview(true)} title="Preview" aria-label="Preview">
                <Ic n="eye" />
              </button>
            </>
          )
        }
        more={
          <button type="button" className={IB} onClick={(e) => setMenu(menu ? null : e.currentTarget)} title="More" aria-label="More" aria-haspopup="menu" aria-expanded={!!menu}>
            <Ic n="more" />
          </button>
        }
        action={action}
        actionRef={actionRef}
      />
      {menu ? (
        <Menu
          anchor={menu}
          onClose={() => setMenu(null)}
          items={[
            ...(isStudio
              ? [{ icon: "check", label: studio?.issues.length ? `Form check (${studio.issues.length})` : "Form check", disabled: !studio, run: () => setCheckAt(actionRef.current) }]
              : [
                  { icon: "clock", label: "Versions", run: () => setDialog("versions") },
                  { icon: "undo", label: "Discard changes", disabled: !data.published || !changed, run: discard },
                ]),
            { icon: "dup", label: "Duplicate", run: () => void duplicate() },
            row.status === "paused" ? { icon: "eye", label: "Put back online", run: () => void setStatus("live") } : { icon: "eye", label: "Take offline", disabled: !isLive, run: () => void setStatus("paused") },
            "hr",
            { icon: "trash", label: "Delete form", danger: true, run: () => void remove() },
          ]}
        />
      ) : null}
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
      ) : error || studioMsg ? (
        <div className="shrink-0 border-b border-line px-[16px] py-[8px]">
          <ErrorNote message={error || studioMsg} />
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {tab === "build" && isStudio ? (
          <Studio sb={sb} session={session} ws={ws} navigate={navigate} formId={row.id} onState={onStudio} controlRef={control} />
        ) : tab === "build" ? (
          <Builder
            session={session}
            ws={ws}
            navigate={navigate}
            form={form}
            name={name}
            replace={replace}
            apply={apply}
            custom={custom}
            formId={row.id}
            kit={kit}
            kits={data.kits}
            setKit={setKit}
            reloadKits={reload}
            types={data.types}
            facts={facts}
            pick={pick}
            setPick={setPick}
            step={step}
            setStep={setStep}
            said={said}
            setSaid={setSaid}
            onUndo={undo}
          />
        ) : tab === "submissions" ? (
          <Submissions key={subsView} {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} onFix={(qid) => goto(qid)} start={subsView} />
        ) : tab === "share" ? (
          <Share {...props} form={form} row={row} apply={apply} kit={kit} site={data.site} />
        ) : tab === "sync" ? (
          <Sync {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} crm={crm} failed={data.failed} reload={reload} patchDests={patchDests} onFix={(qid) => goto(qid)} issueCtx={issueCtx} />
        ) : (
          <Setup {...props} form={form} apply={apply} sub={sub} setSub={setSub} formId={row.id} types={data.types} routing={live.data?.body ?? null} onReview={() => (setSubsView("spam"), setTab("submissions"))} subs={data.subs} name={name} />
        )}
      </div>
      {dialog === "publish" ? <PublishDialog checks={checks} live={!!row.version} onClose={() => setDialog(null)} onPublish={publish} onFix={(qid) => goto(qid)} error={error} /> : null}
      {dialog === "versions" ? <Versions {...props} formId={row.id} live={row.version} changed={changed} onClose={() => setDialog(null)} onRestore={restore} /> : null}
      {checkAt && isStudio && studio ? <FormCheck anchor={checkAt} issues={studio.issues} canFix={studio.canFix} onFix={(f) => control.current?.fix(f)} onOpenAfter={() => control.current?.openAfter()} onClose={() => setCheckAt(null)} /> : null}
      {preview ? <PreviewOverlay form={form} tokens={kit?.tokens ?? {}} logo={kit?.logo_url ?? null} skin={skinForKit(kit, typeof window === "undefined" ? "" : window.location.origin)} system={kit?.design ?? undefined} crmName={crm.crms[0]?.name} onClose={() => setPreview(false)} /> : null}
      {note.node}
    </div>
  );
}

/** Publish: what to look at first. A missing email or a form the checker refuses can't go live; the rest can. */
function PublishDialog({ checks, live, onClose, onPublish, onFix, error }: { checks: ReturnType<typeof publishChecks>; live: boolean; onClose: () => void; onPublish: () => Promise<void>; onFix: (q: string) => void; error: string }) {
  const [busy, setBusy] = useState(false);
  const bad = checks.filter((c) => c.lvl !== "ok");
  const blocks = checks.some((c) => c.blocks);
  return (
    <Dialog label={live ? "Publish changes" : "Publish"} onClose={onClose}>
      <span className={EYEBROW}>{live ? "Publish changes" : "Publish"}</span>
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-ink">{bad.length ? `${bad.length} ${bad.length === 1 ? "thing" : "things"} to look at` : "Ready to go live"}</h2>
      <div className="flex flex-col gap-[8px]">
        {checks.map((c, i) => (
          <div key={`${c.t}${i}`} className="flex items-start gap-[10px] rounded-lg shadow-rest px-[12px] py-[10px]">
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
    return `${b.steps.length > 1 ? `${b.steps.length} pages, ` : ""}${n} ${n === 1 ? "question" : "questions"}${b.after.schedule ? ", books a meeting" : ""}`;
  };
  return (
    <Dialog label="Versions" onClose={onClose}>
      <DialogHead title="Versions" onClose={onClose} />
      {!list.data ? (
        list.error ? <ErrorNote message={list.error} /> : <Loading />
      ) : (
        <div className="rounded-[10px] shadow-rest">
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

