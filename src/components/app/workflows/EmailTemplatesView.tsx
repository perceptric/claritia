"use client";

// Nurture › Emails › Templates (docs/enrich-workflows-reports.md 2.4): saved emails that workflows and broadcasts
// reuse. The same form as a workflow's Send email step; a step picks one with "Use a template". A template saves
// itself 800 ms after the last change, like every editor.

import { useEffect, useState } from "react";
import { mergeGaps } from "@/lib/workflows/merge";
import { emptyEmail, type EmailBody } from "@/lib/workflows/types";
import { Mail, Plus, Trash } from "../../Icons";
import { askConfirm, askText } from "../Dialogs";
import { ToolIntro } from "../ToolIntro";
import { Button, ErrorNote, IconButton, Loading, must, Page, Panel, timeAgo, useLoad, type ViewProps } from "../ui";
import { EmailForm } from "./Inspector";

type Template = { id: string; name: string; body: EmailBody; updated_at: string };

/** `above`: shown first on the page (the Library's built-in templates). */
export function EmailTemplatesView({ sb, ws, session, above }: ViewProps & { above?: React.ReactNode }) {
  const list = useLoad(async () => (must(await sb.from("email_templates").select("id, name, body, updated_at").eq("workspace_id", ws.id).order("updated_at", { ascending: false })) ?? []) as Template[], ws.id);
  const [open, setOpen] = useState<Template | null>(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");

  const create = async () => {
    const name = await askText("Name the template", { placeholder: "Product update", ok: "Create" });
    if (!name?.trim()) return;
    const body = emptyEmail();
    const { data, error: e } = await sb.rpc("email_template_save", { p_ws: ws.id, p_id: null, p_name: name.trim(), p_body: body });
    if (e) return setError(e.message);
    setOpen({ id: data as string, name: name.trim(), body, updated_at: new Date().toISOString() });
    setSaved(true);
    list.reload();
  };
  const reload = list.reload;
  useEffect(() => {
    if (saved || !open || !open.name.trim()) return;
    const t = setTimeout(async () => {
      const { error: e } = await sb.rpc("email_template_save", { p_ws: ws.id, p_id: open.id, p_name: open.name.trim(), p_body: open.body });
      if (e) return setError(e.message);
      setSaved(true);
      setError("");
      reload();
    }, 800);
    return () => clearTimeout(t);
  }, [open, saved, sb, ws.id, reload]);
  // The Create menu's "Email template" opens here with ?create=1.
  const [asked] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("create") === "1");
  useEffect(() => {
    if (!asked) return;
    history.replaceState(null, "", window.location.pathname);
    const t = setTimeout(() => void create(), 0);
    return () => clearTimeout(t);
    // Once, on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);
  const del = async (t: Template) => {
    if (!(await askConfirm(`Delete ${t.name}?`, { ok: "Delete", danger: true }))) return;
    const { error: e } = await sb.rpc("email_template_delete", { p_id: t.id });
    if (e) return setError(e.message);
    if (open?.id === t.id) setOpen(null);
    list.reload();
  };
  const pick = async (t: Template) => {
    if (!saved && !(await askConfirm("Leave without saving?", { ok: "Leave", danger: true }))) return;
    setOpen(t);
    setSaved(true);
  };

  const add = (
    <Button onClick={() => void create()}>
      <Plus size={14} /> New template
    </Button>
  );
  const gaps = open ? [open.body.subject, open.body.preheader, ...open.body.paragraphs, open.body.cta_label].flatMap(mergeGaps) : [];

  return (
    <Page icon={<Mail size={14} />} title="Templates" count={above ? undefined : list.data?.length} actions={list.data?.length ? add : undefined}>
      {above}
      <ErrorNote message={error || list.error} />
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <ToolIntro sketch="envelopes" action={add} title={"Write an email once,\nuse it everywhere"} lead="Save emails your team sends often. Any workflow step or broadcast can start from one, with merge fields like {{first_name|there}} filled in for each contact." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Panel className="self-start overflow-hidden">
            <ul className="divide-y divide-line">
              {list.data.map((t) => (
                <li key={t.id} className={`group flex items-center gap-2 pr-2 ${open?.id === t.id ? "bg-hover" : ""}`}>
                  <button type="button" onClick={() => void pick(t)} className="flex min-w-0 flex-1 flex-col px-4 py-3 text-left">
                    <span className="truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                    <span className="truncate text-[12px] text-muted">{t.body.subject || "No subject"}</span>
                  </button>
                  <span className="text-[12px] text-faint">{timeAgo(t.updated_at)}</span>
                  <IconButton label="Delete" onClick={() => void del(t)}>
                    <Trash size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          </Panel>
          {open ? (
            <Panel className="flex flex-col gap-5 p-5">
              <input
                value={open.name}
                onChange={(e) => {
                  setOpen({ ...open, name: e.target.value });
                  setSaved(false);
                }}
                aria-label="Name"
                maxLength={120}
                className="h-9 rounded-sm border border-transparent bg-transparent px-2 text-[16px] font-semibold tracking-[-0.02em] text-ink outline-none hover:border-line focus:border-ink"
              />
              <EmailForm
                email={open.body}
                onChange={(body) => {
                  setOpen({ ...open, body });
                  setSaved(false);
                }}
                readOnly={false}
                builder={{ session, sb, ws: ws.id, ref: `tpl:${open.id}` }}
              />
              {gaps.length ? <p className="text-[12.5px] text-butter">Add a fallback to {[...new Set(gaps)].join(", ")}</p> : null}
              <span role="status" className="text-[12.5px] text-muted">
                {saved ? "Saved" : "Saving…"}
              </span>
            </Panel>
          ) : null}
        </div>
      )}
    </Page>
  );
}
