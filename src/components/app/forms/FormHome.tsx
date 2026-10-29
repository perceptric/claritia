"use client";

// Forms home: the forms as a list, and the assistant's box at the bottom. Describing a form there opens the
// assistant on the new form screen with that sentence already read (FormCreate). With no forms yet, a form builds
// itself in the middle of the screen.

import { useState } from "react";
import { Inbox, Pencil, Send } from "../../Icons";
import { AiMark } from "../Ai";
import { askText } from "../Dialogs";
import { Badge, ErrorNote, errorText, IconButton, Loading, must, Page, timeAgo, useLoad, type ViewProps } from "../ui";
import { STATUS } from "./shared";

type ListRow = { id: string; name: string; status: "draft" | "live" | "paused"; kind: "built" | "captured"; fills: number; last_fill: string | null; updated_at: string; failed: number; check: string | null };

/** The sentence the new form screen reads first. */
export const ASK_KEY = "claritia:form-ask";

export function FormHome(props: ViewProps) {
  const { sb, ws, navigate } = props;
  const list = useLoad(async () => must(await sb.rpc("forms_list", { p_ws: ws.id })) as ListRow[], ws.id);
  const [error, setError] = useState("");
  const rename = async (id: string, current: string) => {
    const next = await askText("Rename form", { initial: current, ok: "Rename" });
    if (!next || next === current) return;
    try {
      must(await sb.rpc("form_rename", { p_id: id, p_name: next }));
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const start = (text: string) => {
    try {
      if (text.trim()) sessionStorage.setItem(ASK_KEY, text.trim());
    } catch {}
    navigate("forms", "new");
  };
  const empty = !!list.data && !list.data.length;

  return (
    <Page icon={<Inbox size={14} />} title="Forms" count={list.data?.length || undefined} flush>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
            <ErrorNote message={list.error || error} />
            {!list.data ? (
              <Loading />
            ) : empty ? (
              <FirstForm />
            ) : (
              <ul className="flex flex-col border-t border-line">
                {list.data.map((f) => (
                  <li key={f.id} className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-2 py-3 transition-colors duration-[120ms] hover:bg-hover md:grid-cols-[minmax(0,1fr)_120px_220px]">
                    <span className="flex min-w-0 items-center gap-3">
                      <Thumb />
                      <span className="flex min-w-0 flex-col">
                        <button type="button" onClick={() => navigate("forms", f.id)} className="truncate text-left text-[14px] font-medium text-ink after:absolute after:inset-0">
                          {f.name}
                        </button>
                        <span className="truncate text-[12.5px] text-muted">{f.last_fill ? `Last submission ${timeAgo(f.last_fill)}` : `Changed ${timeAgo(f.updated_at)}`}</span>
                      </span>
                    </span>
                    <span className="hidden flex-col text-[13px] text-ink tabular-nums md:flex">
                      {f.fills.toLocaleString("en-US")}
                      <span className="text-[12px] text-muted">submissions</span>
                    </span>
                    <span className="relative z-10 flex items-center justify-end gap-1.5">
                      <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <IconButton label="Rename" onClick={() => void rename(f.id, f.name)}>
                          <Pencil size={14} />
                        </IconButton>
                      </span>
                      {f.failed ? <Badge tone="red">{`${f.failed} failed`}</Badge> : null}
                      {f.check === "failed" ? <Badge tone="red">Check failed</Badge> : null}
                      {f.kind === "captured" ? <Badge>Captured</Badge> : null}
                      <Badge tone={STATUS[f.status][1]} dot>
                        {STATUS[f.status][0]}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <AskDock placeholder="Describe a new form, for example: demo request for work emails only" onSend={start} />
      </div>
    </Page>
  );
}

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

function Thumb() {
  return (
    <span aria-hidden="true" className="flex h-12 w-10 shrink-0 flex-col gap-1 rounded-[6px] border border-line bg-card px-1.5 py-1.5">
      <i className="h-1 w-3/5 rounded-full bg-line" />
      <i className="h-1 rounded-full bg-line" />
      <i className="h-1 w-4/5 rounded-full bg-line" />
      <i className="mt-auto h-1.5 rounded-full bg-ink" />
    </span>
  );
}

/** First use: a form builds itself, then the moments that follow a submission float in. Still under reduced motion. */
function FirstForm() {
  const tag = (text: string, place: string, delay: number) => (
    <span className={`form-float absolute flex h-7 items-center gap-1.5 rounded-full border border-line bg-card px-2.5 text-[12px] whitespace-nowrap text-ink shadow-[0_8px_24px_-8px_rgb(10_10_10/0.18)] ${place}`} style={{ animationDelay: `${delay}s` }}>
      <i className="size-1.5 rounded-full bg-signal" />
      {text}
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-5 py-14 text-center">
      <div aria-hidden="true" className="relative h-[230px] w-[300px] max-w-full">
        <div className="absolute inset-0 flex flex-col gap-2.5 rounded-[14px] border border-line bg-card p-5 text-left shadow-[0_16px_40px_-20px_rgb(10_10_10/0.25)]">
          <i className="form-build h-3 w-1/2 rounded-full bg-ink" />
          {[0.4, 0.8, 1.2].map((d) => (
            <i key={d} className="form-build h-8 rounded-[6px] border border-line-strong" style={{ animationDelay: `${d}s` }} />
          ))}
          <i className="form-build mt-auto h-9 rounded-full bg-ink" style={{ animationDelay: "1.6s" }} />
        </div>
        {tag("Company filled in", "-left-10 top-12", 2.1)}
        {tag("Routed to their rep", "-right-12 top-28", 2.7)}
        {tag("Meeting booked", "-bottom-3 left-2", 3.3)}
      </div>
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">Create your first form</h2>
      <p className="-mt-3 max-w-md text-[13.5px] text-muted">Describe the form below. The assistant asks a few questions and builds it with you.</p>
    </div>
  );
}
