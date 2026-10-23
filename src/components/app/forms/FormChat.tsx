"use client";

// The chat beside the form (docs/form-builder.md 4.2). Each turn saves the draft first, sends the request with the
// draft's rev, and takes back the changed form, the change lines and any question with its answers to click. A turn's
// changes undo together with the builder's Undo.

import { useEffect, useRef, useState } from "react";
import type { Form } from "@/lib/forms/schema";
import { Send } from "../../Icons";
import { Button, ErrorNote, errorText, must, postJson, useLoad, type ViewProps } from "../ui";

type Msg = { role: "user" | "assistant"; text: string; lines?: string[]; ask?: { question: string; choices: string[] } | null; at?: string };
type Reply = { form: Form; rev: number; reply: string; lines: string[]; ask: Msg["ask"] };

const NO = /^(no|cancel|keep|don'?t|not now|leave)/i;

export function FormChat({
  sb,
  session,
  ws,
  formId,
  prepare,
  onResult,
  first,
}: Pick<ViewProps, "sb" | "session" | "ws"> & {
  formId: string;
  /** Save the draft and return its rev, or null when it couldn't be saved. */
  prepare: () => Promise<number | null>;
  onResult: (form: Form, rev: number) => void;
  /** A first request from the Forms list, sent once. */
  first?: string | null;
}) {
  const history = useLoad(async () => ((must(await sb.from("form_chats").select("messages").eq("form_id", formId).maybeSingle()) as { messages: Msg[] } | null)?.messages ?? []) as Msg[], formId);
  const [extra, setExtra] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const sentFirst = useRef(false);
  const msgs = [...(history.data ?? []), ...extra];

  const send = async (message: string, confirmed = false) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError("");
    setText("");
    setExtra((x) => [...x, { role: "user", text: m }]);
    try {
      const rev = await prepare();
      if (rev === null) throw new Error("Save the form first.");
      const r = await postJson<Reply>(session, "/api/forms/chat", { workspaceId: ws.id, id: formId, rev, message: m, confirmed });
      if (r.lines.length) onResult(r.form, r.rev);
      setExtra((x) => [...x, { role: "assistant", text: r.reply, lines: r.lines, ask: r.ask }]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (first && history.data && !sentFirst.current) {
      sentFirst.current = true;
      void send(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, history.data]);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length, busy]);

  const lastAsk = msgs.length && msgs[msgs.length - 1].role === "assistant" ? msgs[msgs.length - 1].ask : null;
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-8 self-end border border-line bg-canvas px-3 py-2 text-[13px] whitespace-pre-wrap text-ink">
              {m.text}
            </div>
          ) : (
            <div key={i} className="mr-8 flex flex-col gap-1.5 text-[13px]">
              {m.lines?.length ? (
                <ul className="flex flex-col gap-0.5 border-l-2 border-ink pl-2.5 font-mono text-[11.5px] text-body">
                  {m.lines.map((l, j) => (
                    <li key={j}>{l}</li>
                  ))}
                </ul>
              ) : null}
              {m.text ? <p className="whitespace-pre-wrap text-ink">{m.text}</p> : null}
            </div>
          ),
        )}
        {busy ? <p className="font-mono text-[11px] text-faint">Working…</p> : null}
        <div ref={end} />
      </div>
      {lastAsk && !busy ? (
        <div className="flex flex-wrap gap-1.5">
          {lastAsk.choices.map((c) => (
            <Button key={c} variant="ghost" onClick={() => void send(c, !NO.test(c))}>
              {c}
            </Button>
          ))}
        </div>
      ) : null}
      <ErrorNote message={error || history.error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          rows={2}
          placeholder="Ask for a change"
          aria-label="Message"
          className="min-h-[60px] flex-1 resize-none rounded-md border border-line bg-panel px-2.5 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink"
        />
        <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
          <Send size={14} />
        </Button>
      </form>
    </div>
  );
}
