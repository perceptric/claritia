"use client";

// Forms (docs/form-templates.md): the list, the template gallery with a live preview, and the editor. A template
// becomes a working form in one click: "Use this form" copies it, links its answers to contact fields, checks it
// and publishes it, then opens it in the editor.

import { useEffect, useState } from "react";
import { industryLabel, questionCount, templateBySlug, templateSlug, templateTheme } from "@/lib/forms/catalog";
import { DEFAULT_THEME, isTheme, THEMES } from "@/lib/forms/themes";
import { USE_CASES, type FormTemplate } from "@/lib/forms/types";
import { FormIcon, Plus } from "../../Icons";
import { FormView } from "../../forms/FormView";
import { Gallery } from "../../forms/Gallery";
import { ThemedFrame } from "../../forms/ThemedFrame";
import { SidePanel } from "../records/SidePanel";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, Loading, must, Page, Panel, postJson, Td, Th, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";
import { FormEditor } from "./FormEditor";

export type FormListRow = { id: string; name: string; slug: string; status: "draft" | "live" | "closed"; submissions: number; last_submission_at: string | null; updated_at: string; template_id: string | null };

export const STATUS: Record<FormListRow["status"], { label: string; tone: Tone }> = {
  live: { label: "Live", tone: "green" },
  draft: { label: "Draft", tone: "gray" },
  closed: { label: "Closed", tone: "gray" },
};

const UUID = /^[0-9a-f-]{36}$/;

export function FormsView(props: ViewProps) {
  const { id } = props;
  if (id === "templates" || id.startsWith("templates/")) return <TemplatesPage {...props} open={id.slice(10)} />;
  if (UUID.test(id.slice(0, 36))) return <FormEditor key={id.slice(0, 36)} {...props} formId={id.slice(0, 36)} tab={id.slice(37)} />;
  return <FormList {...props} />;
}

function FormList({ sb, ws, session, navigate }: ViewProps) {
  const list = useLoad(async () => must(await sb.from("forms").select("id, name, slug, status, submissions, last_submission_at, updated_at, template_id").eq("workspace_id", ws.id).order("updated_at", { ascending: false })) as FormListRow[], ws.id);
  if (!list.data) return <Page icon={<FormIcon size={14} />} title="Forms">{list.error ? <ErrorNote message={list.error} /> : <Loading />}</Page>;
  if (!list.data.length)
    return (
      <Page icon={<FormIcon size={14} />} title="Forms">
        <div className="mx-auto flex max-w-6xl flex-col gap-8">
          <ToolIntro
            title="Forms that turn visitors into leads"
            lead="Pick one of 150 forms made for your industry. It goes live in one click, saves every answer on a contact, and asks for consent the way each visitor's region requires."
          />
          <TemplatePicker sb={sb} ws={ws} session={session} navigate={navigate} />
        </div>
      </Page>
    );
  return (
    <Page
      icon={<FormIcon size={14} />}
      title="Forms"
      count={list.data.length}
      actions={
        <Button onClick={() => navigate("forms", "templates")}>
          <Plus size={14} />
          New form
        </Button>
      }
    >
      <Panel>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>State</Th>
              <Th className="text-right">Answers</Th>
              <Th>Last answer</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((f) => (
              <tr key={f.id} className="cursor-pointer hover:bg-hover" onClick={() => navigate("forms", f.id)}>
                <Td className="font-medium">{f.name}</Td>
                <Td>
                  <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
                </Td>
                <Td className="text-right font-mono">{f.submissions.toLocaleString("en-US")}</Td>
                <Td className="text-muted">{timeAgo(f.last_submission_at)}</Td>
                <Td className="text-faint">{timeAgo(f.updated_at)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}

function TemplatesPage({ sb, ws, session, navigate, open }: ViewProps & { open: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const blank = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ id: string }>(session, "/api/forms", { workspaceId: ws.id, action: "create" });
      navigate("forms", r.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  return (
    <Page
      icon={<FormIcon size={14} />}
      title="Templates"
      back={{ label: "Forms", onClick: () => navigate("forms") }}
      actions={
        <Button variant="ghost" onClick={blank} disabled={busy}>
          Start blank
        </Button>
      }
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <ErrorNote message={error} />
        <TemplatePicker sb={sb} ws={ws} session={session} navigate={navigate} initialOpen={open} syncUrl />
      </div>
    </Page>
  );
}

/** The gallery, and the preview panel with Use this form. */
export function TemplatePicker({ ws, session, navigate, initialOpen = "", syncUrl = false }: Pick<ViewProps, "sb" | "ws" | "session" | "navigate"> & { initialOpen?: string; syncUrl?: boolean }) {
  const [open, setOpen] = useState<FormTemplate | null>(() => (initialOpen ? (templateBySlug(initialOpen) ?? null) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The style: the one picked on the website (?theme=), else the template's own.
  const [picked, setPicked] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search).get("theme");
    return isTheme(q) ? q : null;
  });
  const theme = picked ?? (open ? templateTheme(open) : DEFAULT_THEME);
  useEffect(() => {
    if (!syncUrl) return;
    window.history.replaceState(null, "", open ? `/forms/templates/${templateSlug(open)}${picked ? `?theme=${picked}` : ""}` : "/forms/templates");
  }, [open, syncUrl, picked]);

  const use = async (t: FormTemplate) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ id: string }>(session, "/api/forms", { workspaceId: ws.id, action: "import", templateId: t.id, theme });
      navigate("forms", r.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <>
      <Gallery
        onOpen={(t) => {
          setError("");
          setPicked(null);
          setOpen(t);
        }}
      />
      {open ? (
        <SidePanel
          title={open.name}
          wide
          onClose={() => setOpen(null)}
          footer={
            <Button onClick={() => use(open)} disabled={busy}>
              {busy ? "Setting up…" : "Use this form"}
            </Button>
          }
        >
          <div className="flex flex-col gap-4 border-b border-line px-5 py-4">
            <p className="fig">
              {"// "}
              {industryLabel(open.industry)} — {questionCount(open)} questions
            </p>
            <p className="text-[13.5px] text-body">{open.blurb}</p>
            <div className="flex flex-wrap gap-1.5">
              {open.tags.map((t) => (
                <Badge key={t}>{USE_CASES.find((u) => u.value === t)?.label ?? t}</Badge>
              ))}
              {open.phi ? <Badge tone="amber">Health data</Badge> : null}
            </div>
            <ErrorNote message={error} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3" role="radiogroup" aria-label="Style">
            <span className="label-mono mr-1">Style</span>
            {THEMES.map((th) => (
              <button
                key={th.id}
                type="button"
                role="radio"
                aria-checked={theme === th.id}
                aria-label={th.name}
                title={th.name}
                onClick={() => setPicked(th.id)}
                className={`flex h-6 w-9 overflow-hidden rounded-sm border ${theme === th.id ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}
              >
                <span className="flex-1" style={{ background: th.bg }} />
                <span className="flex-1" style={{ background: th.card }} />
                <span className="flex-1" style={{ background: th.accent }} />
              </button>
            ))}
          </div>
          <ThemedFrame theme={theme} size="panel">
            <FormView key={open.id} schema={open.schema} settings={{ theme, ...(open.internal ? { consent_off: true } : {}) }} mode="preview" badge={false} />
          </ThemedFrame>
        </SidePanel>
      ) : null}
    </>
  );
}
