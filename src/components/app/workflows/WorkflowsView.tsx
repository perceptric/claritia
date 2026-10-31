"use client";

// Workflows (docs/workflows.md): /workflows and /workflows/<id> are the folders with one workflow open (Home.tsx);
// /workflows/new picks a template (?template=broadcast opens that one).

import { useCallback, useEffect, useState } from "react";
import { TEMPLATES, templateByKey } from "@/lib/workflows/templates";
import { emptyBody, type Body } from "@/lib/workflows/types";
import { Branch } from "../../Icons";
import { ErrorNote, errorText, Loading, Page, type ViewProps } from "../ui";
import { WorkflowsHome } from "./Home";

export function WorkflowsView(p: ViewProps) {
  if (p.id === "new") return <TemplatePicker {...p} />;
  return <WorkflowsHome {...p} />;
}

function TemplatePicker({ sb, ws, navigate }: ViewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const make = useCallback(
    async (name: string, body: Body) => {
      const { data, error: e } = await sb.rpc("workflow_save", { p_ws: ws.id, p_id: null, p_name: name, p_draft: body, p_revision: null });
      if (e) throw new Error(e.message);
      navigate("workflows", (data as { id: string }).id);
    },
    [sb, ws.id, navigate],
  );
  const create = (name: string, body: Body) => {
    setBusy(true);
    setError("");
    make(name, body).catch((e) => {
      setError(errorText(e));
      setBusy(false);
    });
  };
  // ?template=broadcast (the Create menu's Broadcast) makes that one at once.
  const [asked] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("template")));
  useEffect(() => {
    const t = asked ? templateByKey(asked) : undefined;
    if (t) make(t.name, t.body()).catch((e) => setError(errorText(e)));
  }, [asked, make]);

  if (asked && templateByKey(asked) && !error)
    return (
      <Page title="New workflow" back={{ label: "Workflows", onClick: () => navigate("workflows") }}>
        <Loading />
      </Page>
    );
  return (
    <Page icon={<Branch size={16} />} title="New workflow">
      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card name="Start blank" line="A trigger and nothing else" disabled={busy} onClick={() => create("Untitled workflow", emptyBody())} />
        {TEMPLATES.map((t) => (
          <Card key={t.key} name={t.name} line={t.line} disabled={busy} onClick={() => create(t.name, t.body())} />
        ))}
      </div>
    </Page>
  );
}

function Card({ name, line, onClick, disabled }: { name: string; line: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="lift anim-rise flex flex-col gap-1 rounded-2xl border border-line bg-card p-5 text-left disabled:opacity-60"
    >
      <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
      <span className="text-[12.5px] text-muted">{line}</span>
    </button>
  );
}
