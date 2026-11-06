"use client";

// Inbound › Forms (docs/forms.md): one list of forms as 72 px rows, like Calendar's meeting types. Each row has its
// thumbnail, where it lives, its last fill and send rate, the last 7 days as bars, this week's count and its state; the
// more menu opens, copies, pauses and deletes. With no forms yet, Form Studio is the first screen, and New form
// opens it too (docs/forms-chat-plan.md).

import { useEffect, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import type { Form } from "@/lib/forms/schema";
import { Studio } from "./studio/Studio";
import { askConfirm, askText, tell } from "../Dialogs";
import { Badge, ErrorNote, errorText, invalidate, Loading, must, postJson, useKept, useQuery, type ViewProps } from "../ui";
import { ago, whereWords } from "./formModel";
import { Ic } from "./ic";
import { BTN, copyText, GHOST, IB, Seg, SegN, Thumb, useNote } from "./parts";
import { Menu } from "./Menu";
import { confirmPause } from "./pause";
import { folderKey, moveForm, renameFolder, useFormFolders } from "./folders";

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
/** Where a Google Form's link waits while its first import signs in to Google. */
const GIMPORT = "clr-gimport-link";
type KitLite = { id: string; tokens: Partial<Tokens>; source_url: string | null; scan_status: string | null; logo_url?: string | null; logo_svg?: string | null };

export function FormHome(props: ViewProps & { folder?: string }) {
  const { sb, session, ws, navigate, folder = "" } = props;
  const fq = useFormFolders(sb, ws.id);
  const folders = fq.data?.folders ?? [];
  const inFolder = folder ? folders.find((f) => f.id === folder) ?? null : null;
  const list = useQuery(`forms:${ws.id}:home`, async () => {
    const [rows, kits, w] = await Promise.all([sb.rpc("forms_list", { p_ws: ws.id }), sb.from("brand_kits").select("*").eq("workspace_id", ws.id), sb.from("workspaces").select("brand_kit_id").eq("id", ws.id).maybeSingle()]);
    // The workspace's brand first (docs/brand-capture.md), so everything that picks "a kit" picks it.
    const brand = (w.data as { brand_kit_id: string | null } | null)?.brand_kit_id ?? null;
    const all = (kits.data ?? []) as KitLite[];
    return { rows: must(rows) as ListRow[], kits: [...all.filter((k) => k.id === brand), ...all.filter((k) => k.id !== brand)] };
  });
  // Back from a Google sign-in that didn't work: its words.
  const [error, setError] = useState(() => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("gimport_error") ?? "").slice(0, 200)));
  const [filter, setFilter] = useKept<"all" | "live" | "draft">(`forms:${ws.id}:filter`, "all");
  const [q, setQ] = useKept(`forms:${ws.id}:q`, "");
  const [menu, setMenu] = useState<{ id: string; at: HTMLElement } | null>(null);
  const [moving, setMoving] = useState<{ id: string; at: HTMLElement } | null>(null);
  const note = useNote();

  const rows = list.data?.rows;
  const kitOf = (id?: string | null) => list.data?.kits.find((k) => k.id === id);
  const live = (rows ?? []).filter((r) => r.status !== "draft").length;
  // A folder that's gone (deleted elsewhere) shows every form.
  const shown = (rows ?? []).filter((r) => (!inFolder || fq.data?.byForm[r.id] === inFolder.id) && (filter === "all" || (filter === "live" ? r.status !== "draft" : r.status === "draft")) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())));
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
      if (!on && !(await confirmPause(r.name))) return;
      // The status changes on click; it goes back, with the error, if the save fails.
      await list.mutate((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, status: on ? "live" : "paused" } : x)) }), async () => must(await sb.rpc("form_set_status", { p_id: r.id, p_status: on ? "live" : "paused" })));
      invalidate("app_counts");
      note.show(on ? "Resumed" : "Paused");
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

  // Import from Google Forms (docs/integrations-plan.md, Next step 13): the form read from Google, saved the way a new
  // form is saved, opened as a draft. A first import signs in to Google, then picks up here with the same link.
  const [importing, setImporting] = useState(false);
  const importGoogle = async (resume?: string) => {
    const link = resume ?? (await askText("Google Form link", { placeholder: "https://docs.google.com/forms/d/…/edit", ok: "Import" }));
    if (!link?.trim()) return;
    setImporting(true);
    setError("");
    try {
      const r = await postJson<{ signIn?: string; name?: string; html?: string; css?: string; brand?: string; notes?: string[]; questions?: number }>(session, "/api/forms/google-import", { workspaceId: ws.id, link });
      if (r.signIn) {
        try {
          sessionStorage.setItem(GIMPORT, link);
        } catch {}
        window.location.assign(r.signIn);
        return;
      }
      const saved = await postJson<{ formId: string }>(session, "/api/studio", { workspaceId: ws.id, mode: "save", name: r.name, html: r.html, css: r.css ?? "", brand: r.brand ?? "", after: { kind: "thanks" } });
      invalidate(`forms:${ws.id}:home`);
      if (r.notes?.length) await tell(`Imported ${r.questions ?? 0} ${r.questions === 1 ? "question" : "questions"}`, r.notes.join("\n"));
      navigate("forms", saved.formId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setImporting(false);
    }
  };
  // Back from Google's sign-in: the import goes on with the link kept before it.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.has("gimport") && !p.has("gimport_error")) return;
    history.replaceState(null, "", window.location.pathname);
    let link = "";
    try {
      link = sessionStorage.getItem(GIMPORT) ?? "";
      sessionStorage.removeItem(GIMPORT);
    } catch {}
    // A sign-in that failed shows its words (the error's first value reads them); one that worked goes on.
    if (!p.get("gimport_error") && link) void Promise.resolve().then(() => importGoogle(link));
    // Once, on the way back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New form from a folder lands in it (FormsView's Studio page moves it once it exists).
  const startNew = () => {
    try {
      if (folder) sessionStorage.setItem("clr-new-form-folder", folder);
      else sessionStorage.removeItem("clr-new-form-folder");
    } catch {}
    navigate("forms", "new");
  };
  const deleteFolder = () =>
    act(async () => {
      if (!inFolder) return;
      if (!(await askConfirm(`Delete ${inFolder.name}?`, { body: "Its forms stay, under All forms.", ok: "Delete folder", danger: true }))) return;
      must(await sb.rpc("form_folder_delete", { p_ws: ws.id, p_id: inFolder.id }));
      invalidate(folderKey(ws.id));
      navigate("forms");
      note.show("Folder deleted");
    });
  const header = (
    <div className="flex min-h-[48px] shrink-0 flex-wrap items-center gap-[8px] border-b border-line pr-[12px] pl-[16px] text-[14px] font-medium">
      {inFolder ? (
        <>
          <button type="button" onClick={() => navigate("forms")} className="font-normal text-muted transition-colors duration-[120ms] hover:text-ink">
            Forms
          </button>
          <span className="text-faint">/</span>
          <h1 className="text-ink [overflow-wrap:anywhere]">{inFolder.name}</h1>
          <span className="font-normal text-faint tabular-nums">{shown.length}</span>
        </>
      ) : (
        <>
          <h1 className="text-ink">Forms</h1>
          {rows?.length ? <span className="font-normal text-faint tabular-nums">{rows.length}</span> : null}
        </>
      )}
      <span className="flex-1" />
      {inFolder ? (
        <>
          <button type="button" className={GHOST} onClick={() => void act(() => renameFolder(sb, ws.id, inFolder))}>
            Rename folder
          </button>
          <button type="button" className={GHOST} onClick={() => void deleteFolder()}>
            Delete folder
          </button>
        </>
      ) : null}
      {rows?.length ? (
        <button type="button" className={GHOST} disabled={importing} onClick={() => void importGoogle()}>
          <Ic n="down" />
          {importing ? "Importing" : "Import from Google Forms"}
        </button>
      ) : null}
      {rows?.length ? (
        <button type="button" className={GHOST} onClick={() => navigate("forms", "templates")}>
          <Ic n="form" />
          Form templates
        </button>
      ) : null}
      {rows?.length ? (
        <button type="button" className={BTN} onClick={startNew}>
          <Ic n="plus" />
          New form
        </button>
      ) : null}
    </div>
  );

  // No forms yet: Form Studio is the first screen.
  if (list.data && !rows?.length) return <Studio {...props} />;

  const body = !list.data ? (
    list.error ? (
      <div className="p-[16px]">
        <ErrorNote message={list.error} />
      </div>
    ) : (
      <Loading />
    )
  ) : (
    <div className="min-h-0 flex-1 overflow-y-auto px-[16px] pt-[16px] pb-[24px] sm:px-[clamp(16px,2.5vw,28px)]">
      <div className="mb-[14px] flex flex-wrap items-center gap-[10px]">
        <label className="flex h-[32px] w-[260px] max-w-full items-center gap-[8px] rounded-sm border border-line bg-card px-[10px] text-muted focus-within:shadow-focus">
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
        <ul className="rounded-[10px] shadow-rest">
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
        inFolder && !q.trim() && filter === "all" ? (
          <div className="flex flex-col items-center gap-[8px] px-[16px] py-[56px] text-center">
            <b className="font-medium text-ink">No forms in this folder</b>
            <span className="text-muted">Create one here, or move a form in from its menu</span>
            <button type="button" className={BTN} onClick={startNew}>
              <Ic n="plus" />
              New form
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-[4px] px-[16px] py-[56px] text-center">
            <b className="font-medium text-ink">No matches</b>
            <span className="text-muted">Try another name</span>
          </div>
        )
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
            ...(fq.data?.ready ? [{ icon: "folder", label: "Move to folder", run: () => setMoving({ id: open.id, at: menu.at }) }] : []),
            { icon: "link", label: "Copy link", disabled: !open.version, run: () => void copyText(`${origin}/f/${open.id}`).then((ok) => note.show(ok ? "Link copied" : "Couldn't copy the link")) },
            open.status === "paused"
              ? { icon: "eye", label: "Resume the form", run: () => void offline(open, true) }
              : { icon: "eye", label: "Pause the form", disabled: open.status === "draft", run: () => void offline(open, false) },
            "hr",
            { icon: "trash", label: "Delete", danger: true, run: () => void remove(open) },
          ]}
        />
      ) : null}
      {moving ? (
        <Menu
          anchor={moving.at}
          onClose={() => setMoving(null)}
          width={220}
          items={[
            ...folders.map((f) => ({ icon: fq.data?.byForm[moving.id] === f.id ? "check" : "folder", label: f.name, run: () => void act(async () => (await moveForm(sb, ws.id, moving.id, f.id), note.show(`Moved to ${f.name}`))) })),
            ...(folders.length ? (["hr"] as const) : []),
            { icon: "x", label: "No folder", disabled: !fq.data?.byForm[moving.id], run: () => void act(async () => (await moveForm(sb, ws.id, moving.id, null), note.show("Moved out of the folder"))) },
          ]}
        />
      ) : null}
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
      <Badge>Paused</Badge>
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
