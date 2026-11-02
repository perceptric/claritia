"use client";

// A form's answers: newest first, with the person, the first questions and the score. A row opens every answer,
// the files to download, where the visit came from, and the contact it made. CSV export and delete.

import { useMemo, useState } from "react";
import { answerText } from "@/lib/forms/answers";
import { allFields } from "@/lib/forms/logic";
import type { Answer, FileRef, FormSchema } from "@/lib/forms/types";
import { toCsv } from "@/lib/contacts/csv";
import { Contact, Download, Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { SidePanel } from "../records/SidePanel";
import { Button, Empty, ErrorNote, errorText, Loading, must, Panel, postJson, Td, Th, timeAgo, useLoad, type ViewProps } from "../ui";

type Sub = { id: string; at: string; contact_id: string | null; answers: Record<string, Answer>; score: number | null; meta: Record<string, string> };

const META_LABEL: Record<string, string> = { page: "Page", referrer: "Referrer", country: "Country", utm_source: "UTM source", utm_medium: "UTM medium", utm_campaign: "UTM campaign", utm_term: "UTM term", utm_content: "UTM content" };

export function FormAnswers({ sb, session, ws, navigate, formId, schema, onCount }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { formId: string; schema: FormSchema; onCount: (n: number) => void }) {
  const list = useLoad(async () => must(await sb.from("form_submissions").select("id, at, contact_id, answers, score, meta").eq("form_id", formId).order("at", { ascending: false }).limit(1000)) as Sub[], formId);
  const [open, setOpen] = useState<Sub | null>(null);
  const [error, setError] = useState("");
  const fields = useMemo(() => allFields(schema).filter((f) => f.kind !== "statement"), [schema]);
  const who = fields.find((f) => f.map === "email") ?? fields.find((f) => f.kind === "email");
  const name = fields.find((f) => f.map === "name");
  const cols = fields.filter((f) => f !== who && f !== name && !["file", "signature", "long_text", "matrix", "hidden"].includes(f.kind)).slice(0, 3);
  const quiz = !!schema.end.score?.length;

  const exportCsv = () => {
    const rows: unknown[][] = [["Submitted", ...fields.map((f) => f.label), ...(quiz ? ["Score"] : []), "Page", "UTM source", "UTM campaign", "Country"]];
    for (const s of list.data ?? []) rows.push([s.at, ...fields.map((f) => answerText(f, s.answers[f.key])), ...(quiz ? [s.score ?? ""] : []), s.meta.page ?? "", s.meta.utm_source ?? "", s.meta.utm_campaign ?? "", s.meta.country ?? ""]);
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${schema.title.replace(/[^\w-]+/g, "-").toLowerCase()}-answers.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const download = async (path: string) => {
    try {
      const r = await postJson<{ url: string }>(session, "/api/forms", { workspaceId: ws.id, id: formId, action: "file_url", path });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      setError(errorText(e));
    }
  };
  const remove = async (s: Sub) => {
    if (!(await askConfirm("Delete this answer?", { body: "Its files are deleted too. The contact stays.", ok: "Delete", danger: true }))) return;
    try {
      await postJson(session, "/api/forms", { workspaceId: ws.id, id: formId, action: "delete_submission", submissionId: s.id });
      setOpen(null);
      onCount(Math.max(0, (list.data?.length ?? 1) - 1));
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!list.data) return <div className="p-5">{list.error ? <ErrorNote message={list.error} /> : <Loading />}</div>;
  if (!list.data.length) return <Empty title="No answers yet">Share the form, and answers show up here as they come in.</Empty>;

  return (
    <div className="paper h-full overflow-auto p-4 md:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="fig">
            {"// "}
            {list.data.length.toLocaleString("en-US")} answers
          </p>
          <Button variant="ghost" onClick={exportCsv}>
            <Download size={14} />
            Export CSV
          </Button>
        </div>
        <ErrorNote message={error} />
        <Panel className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Submitted</Th>
                <Th>Person</Th>
                {cols.map((c) => (
                  <Th key={c.key} className="max-w-56 truncate">
                    {c.label}
                  </Th>
                ))}
                {quiz ? <Th className="text-right">Score</Th> : null}
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-hover" onClick={() => setOpen(s)}>
                  <Td className="text-muted">{timeAgo(s.at)}</Td>
                  <Td className="font-medium">{(name && answerText(name, s.answers[name.key])) || (who && answerText(who, s.answers[who.key])) || <span className="text-faint">Anonymous</span>}</Td>
                  {cols.map((c) => (
                    <Td key={c.key} className="max-w-56 truncate text-body">
                      {answerText(c, s.answers[c.key])}
                    </Td>
                  ))}
                  {quiz ? <Td className="text-right font-mono">{s.score ?? ""}</Td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      {open ? (
        <SidePanel
          title={new Date(open.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          onClose={() => setOpen(null)}
          footer={
            <>
              <Button variant="danger" onClick={() => remove(open)}>
                <Trash size={14} />
                Delete
              </Button>
              {open.contact_id ? (
                <Button onClick={() => navigate("contacts", open.contact_id!)}>
                  <Contact size={14} />
                  Open contact
                </Button>
              ) : null}
            </>
          }
        >
          <dl className="flex flex-col">
            {fields.map((f) => {
              const v = open.answers[f.key];
              const files = (f.kind === "file" || f.kind === "signature") && Array.isArray(v) ? (v as FileRef[]) : null;
              return (
                <div key={f.key} className="flex flex-col gap-1 border-b border-line px-5 py-3">
                  <dt className="label-mono">{f.label}</dt>
                  <dd className="text-[13.5px] whitespace-pre-wrap text-ink">
                    {files ? (
                      <span className="flex flex-col items-start gap-1">
                        {files.map((x) => (
                          <button key={x.path} type="button" onClick={() => download(x.path)} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                            <Download size={13} />
                            {x.name}
                          </button>
                        ))}
                      </span>
                    ) : v === undefined ? (
                      <span className="text-faint">—</span>
                    ) : (
                      answerText(f, v)
                    )}
                  </dd>
                </div>
              );
            })}
            {quiz ? (
              <div className="flex flex-col gap-1 border-b border-line px-5 py-3">
                <dt className="label-mono">Score</dt>
                <dd className="font-mono text-[13.5px]">{open.score ?? "—"}</dd>
              </div>
            ) : null}
            {Object.entries(open.meta)
              .filter(([k]) => META_LABEL[k])
              .map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 border-b border-line bg-canvas px-5 py-3">
                  <dt className="label-mono">{META_LABEL[k]}</dt>
                  <dd className="text-[13px] break-all text-body">{v}</dd>
                </div>
              ))}
          </dl>
        </SidePanel>
      ) : null}
    </div>
  );
}
