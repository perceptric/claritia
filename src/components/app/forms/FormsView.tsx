"use client";

// Inbound › Forms (docs/forms.md): the list, and one form's screen. A form's screen is a header (the crumb, the name to
// type in, its state, the more menu and Publish) and five tabs with icons, kept in the address as ?tab=: Build (Form
// Studio, docs/forms-chat-plan.md), Submissions, Share, Sync and Settings. A form made before the Studio moves into it
// the first time it opens. A form that reads the site's own form has no page, so it has no Build and opens on Share.
// Drafts save as you go; Publish checks the form first and makes the draft live.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOp, type Op } from "@/lib/forms/ops";
import { checkForm, emptyForm, type Form } from "@/lib/forms/schema";
import type { CustomField } from "@/lib/records/fields";
import { askConfirm, tell } from "../Dialogs";
import { cache, ErrorNote, errorText, invalidate, Loading, must, postJson, setLeaveGuard, useQuery, type ViewProps } from "../ui";
import { useLiveBody } from "../routing/screenParts";
import { FormHome } from "./FormHome";
import { confirmPause } from "./pause";
import { publishChecks } from "./formModel";
import { Ic } from "./ic";
import { Menu } from "./Menu";
import { BTN, Dialog, EYEBROW, GHOST, GHOST_SM, IB, useNote } from "./parts";
import { Setup, type SetupSub } from "./Setup";
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
  // A Form Studio form: Build is the Studio, and its page goes live through the Studio's publish. A form that reads
  // the site's own form has no page: no Build, and it opens on Share, where its fields are matched.
  const [isStudio] = useState(() => !!row.draft && typeof row.draft === "object" && "page" in (row.draft as object));
  const own = !isStudio;
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
  const [kitId] = useState<string | null>(row.brand_kit_id);
  const [custom] = useState<CustomField[]>(data.custom);
  const [saving, setSaving] = useState<Saving>("saved");
  const [error, setError] = useState("");
  const [tab, setTabRaw] = useState<Tab>(() => {
    const t = typeof window === "undefined" ? "build" : tabOf(window.location.search);
    return own && t === "build" ? "share" : t;
  });
  const [sub, setSub] = useState<SetupSub>("access");
  const [dialog, setDialog] = useState<"publish" | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [subsView, setSubsView] = useState<"leads" | "spam">("leads");
  const note = useNote();
  const rev = useRef(row.draft_rev);
  const dirty = useRef(false);
  const latest = useRef(form);
  // One save at a time, so a slow save never sends an old revision next to a new one.
  const inflight = useRef<Promise<boolean> | null>(null);
  const saveErr = useRef(false);
  const crm = useCrm(data.sources, session, ws.id);
  const live = useLiveBody(sb, ws.id);
  const kit = data.kits.find((k) => k.id === kitId) ?? null;

  const setTab = (t: Tab) => {
    if (own && t === "build") t = "share";
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

  /** Apply ops as one change. Returns false when one can't apply (its reason shows as the error). */
  const apply = useCallback((input: Op | Op[]): boolean => {
    const ops = Array.isArray(input) ? input : [input];
    if (!ops.length) return true;
    let next = latest.current;
    for (const op of ops) {
      const r = applyOp(next, op);
      if ("error" in r) {
        setError(r.error);
        return false;
      }
      next = r.form;
    }
    put(next);
    return true;
  }, []);

  // Opened from a meeting's "Use in a form": this form books that meeting from now on (a change to publish like any other).
  useEffect(() => {
    const u = new URL(window.location.href);
    const use = u.searchParams.get("use");
    if (!use) return;
    u.searchParams.delete("use");
    history.replaceState(null, "", u);
    if (!data.types.some((t) => t.id === use)) return;
    const cur = latest.current.after;
    if (apply([...(cur.end.kind === "redirect" ? [{ op: "set_after" as const, end: { kind: "message" as const, title: "Thanks, we got it." } }] : []), { op: "set_schedule", schedule: { ...(cur.schedule ?? {}), tool: "claritia", url: "", perOwner: false, meetingTypeId: use, routes: cur.schedule?.routes ?? [] } }])) note.show("Books this meeting now");
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
  }, [saving, save, form, name]);
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
    }
    rev.current = r.draft_rev;
    setName(r.name);
  }, [sb, row.id]);

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
      // The form's routing goes live with it, on the server: compiled with its meetings into the form's routing policy.
      const { routing } = await postJson<{ routing?: { problems: string[]; error?: string } }>(session, "/api/forms/publish", { workspaceId: ws.id, id: row.id });
      // Publishing a paused form resumes it.
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
    if (s === "paused" && !(await confirmPause(name))) return;
    // The status changes on click; it goes back, with the error, if the save fails.
    const was = row.status;
    patchRow({ status: s });
    try {
      must(await sb.rpc("form_set_status", { p_id: row.id, p_status: s }));
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
      note.show(s === "paused" ? "Paused" : "Resumed");
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
  /** Sync's Fix and a check's Fix: where the question is made (the Studio, or Share's field list for the site's own form). */
  const goto = () => {
    setDialog(null);
    setTab("build");
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
        build={isStudio}
        subs={data.subs}
        syncDot={failedWeek ? `${failedWeek} ${failedWeek === 1 ? "lead didn't" : "leads didn't"} reach the CRM` : undefined}
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
            ...(isStudio ? [{ icon: "check", label: studio?.issues.length ? `Form check (${studio.issues.length})` : "Form check", disabled: !studio, run: () => setCheckAt(actionRef.current) }] : []),
            { icon: "dup", label: "Duplicate", run: () => void duplicate() },
            row.status === "paused" ? { icon: "eye", label: "Resume the form", run: () => void setStatus("live") } : { icon: "eye", label: "Pause the form", disabled: !isLive, run: () => void setStatus("paused") },
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
        ) : tab === "submissions" ? (
          <Submissions key={subsView} {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} onFix={goto} start={subsView} />
        ) : tab === "share" ? (
          <Share {...props} form={form} row={row} apply={apply} kit={kit} site={data.site} />
        ) : tab === "sync" ? (
          <Sync {...props} form={form} formId={row.id} dests={data.dests} sources={data.sources} crm={crm} failed={data.failed} reload={reload} patchDests={patchDests} onFix={goto} issueCtx={issueCtx} />
        ) : (
          <Setup {...props} form={form} apply={apply} sub={sub} setSub={setSub} formId={row.id} types={data.types} routing={live.data?.body ?? null} onReview={() => (setSubsView("spam"), setTab("submissions"))} subs={data.subs} name={name} paused={row.version ? row.status === "paused" : null} onStatus={(st) => void setStatus(st)} />
        )}
      </div>
      {dialog === "publish" ? <PublishDialog checks={checks} live={!!row.version} onClose={() => setDialog(null)} onPublish={publish} onFix={goto} error={error} /> : null}
      {checkAt && isStudio && studio ? <FormCheck anchor={checkAt} issues={studio.issues} canFix={studio.canFix} onFix={(f) => control.current?.fix(f)} onOpenAfter={() => control.current?.openAfter()} onClose={() => setCheckAt(null)} /> : null}
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
