"use client";

// Emails › Automations, the workflows (docs/workflows.md): /emails/automations and /emails/automations/<id> are the
// folders with one workflow open (Home.tsx); /emails/automations/new picks a template (?template=<key> opens that one; ?folder=<id> files it in that folder; ?form=<id>
// starts a form template on that form).

import { useCallback, useEffect, useState } from "react";
import { TEMPLATES, templateByKey } from "@/lib/workflows/templates";
import { emptyBody, type Body } from "@/lib/workflows/types";
import { Branch } from "../../Icons";
import { ErrorNote, errorText, Loading, Page, Spinner, type ViewProps } from "../ui";
import { WorkflowsHome } from "./Home";
import { isUuid } from "@/lib/uuid";
import { dbError } from "@/lib/errors";

export function WorkflowsView(p: ViewProps & { describe?: (done: () => void) => React.ReactNode }) {
  if (p.id === "new") return <TemplatePicker {...p} />;
  return <WorkflowsHome {...p} />;
}

function TemplatePicker({ sb, ws, navigate }: ViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const make = useCallback(
    async (name: string, body: Body) => {
      const { data, error: e } = await sb.rpc("workflow_save", { p_ws: ws.id, p_id: null, p_name: name, p_draft: body, p_revision: null });
      if (e) throw dbError(e);
      const id = (data as { id: string }).id;
      // ?folder=<id> (a folder's + in the tree) files it there.
      const folder = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("folder");
      if (folder) await sb.rpc("workflow_set_folder", { p_ws: ws.id, p_id: id, p_folder: folder });
      navigate("workflows", id);
    },
    [sb, ws.id, navigate],
  );
  const create = (key: string, name: string, body: Body) => {
    setBusy(key);
    setError("");
    make(name, body).catch((e) => {
      setError(errorText(e));
      setBusy(null);
    });
  };
  // ?template=<key> makes that one at once; ?form=<id> (Form Studio's New follow-up)
  // starts it on that form.
  const [asked] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("template")));
  const [form] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("form")));
  useEffect(() => {
    const t = asked ? templateByKey(asked) : undefined;
    if (!t) return;
    const body = t.body();
    if (form && isUuid(form) && "forms" in body.trigger) body.trigger = { ...body.trigger, forms: [form] };
    make(t.name, body).catch((e) => setError(errorText(e)));
  }, [asked, form, make]);

  if (asked && templateByKey(asked) && !error)
    return (
      <Page title="New workflow" back={{ label: "Workflows", onClick: () => navigate("workflows") }}>
        <Loading />
      </Page>
    );
  return (
    <Page icon={<Branch size={16} />} title="New workflow" back={{ label: "Workflows", onClick: () => navigate("workflows") }}>
      <ErrorNote message={error} className="mb-3" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card name="Start blank" line="A trigger and nothing else" disabled={!!busy} busy={busy === "blank"} onClick={() => create("blank", "Untitled workflow", emptyBody())} />
        {TEMPLATES.map((t) => (
          <Card key={t.key} name={t.name} line={t.line} disabled={!!busy} busy={busy === t.key} onClick={() => create(t.key, t.name, t.body())} />
        ))}
      </div>
    </Page>
  );
}

function Card({ name, line, onClick, disabled, busy }: { name: string; line: string; onClick: () => void; disabled: boolean; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={`lift anim-rise flex flex-col gap-1 rounded-2xl bg-card shadow-rest p-5 text-left ${busy ? "cursor-progress" : "disabled:opacity-60"}`}
    >
      <span className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.01em] text-ink">
        {busy ? <Spinner size={12} /> : null}
        {name}
      </span>
      <span className="text-[12.5px] text-muted">{line}</span>
    </button>
  );
}
