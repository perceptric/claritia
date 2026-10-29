"use client";

// The assistant beside the form (docs/form-builder.md 4.4). useFormChat loads the conversation saved with the form
// (form_chats) and sends new messages to /api/forms/chat with the saved draft's revision, so a change lands on what's
// on screen. ChatHistory shows it on the left; the box that sends is at the bottom of the page (AskDock).

import { useEffect, useRef, useState } from "react";
import type { Form } from "@/lib/forms/schema";
import { AiAvatar, AiTag, Dots } from "../Ai";
import { Button, ErrorNote, errorText, postJson, type ViewProps } from "../ui";

export type Msg = { role: "user" | "assistant"; text: string; lines?: string[]; ask?: string };

export function useFormChat({ sb, session, ws, formId, prepare, onResult }: Pick<ViewProps, "sb" | "session" | "ws"> & { formId: string; prepare: () => Promise<number | null>; onResult: (f: Form, rev: number) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let on = true;
    void sb
      .from("form_chats")
      .select("messages")
      .eq("form_id", formId)
      .maybeSingle()
      .then(({ data }) => {
        const saved = ((data as { messages?: Msg[] } | null)?.messages ?? []).filter((m) => m.text).map((m) => ({ role: m.role, text: m.text, lines: m.lines }));
        if (on) setMsgs((x) => (x.length ? x : saved));
      });
    return () => {
      on = false;
    };
  }, [sb, formId]);

  const send = async (message: string, confirmed = false) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError("");
    if (!confirmed) setMsgs((x) => [...x, { role: "user", text: m }]);
    try {
      const rev = await prepare();
      if (rev === null) throw new Error("The draft didn't save. Try again.");
      const r = await postJson<{ form: Form; rev: number; reply: string; lines: string[]; ask: { question: string } | null; styles?: boolean }>(session, "/api/forms/chat", { workspaceId: ws.id, id: formId, rev, message: m, confirmed });
      if (r.lines.length) onResult(r.form, r.rev);
      if (r.styles) window.dispatchEvent(new Event("claritia:changed"));
      setMsgs((x) => [...x.map((y) => ({ ...y, ask: undefined })), { role: "assistant", text: r.reply, lines: r.lines, ...(r.ask ? { ask: m } : {}) }]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decline = (m: Msg) => setMsgs((x) => x.map((y) => (y === m ? { ...y, ask: undefined } : y)));
  return { msgs, busy, error, send, decline };
}

export function ChatHistory({ chat }: { chat: ReturnType<typeof useFormChat> }) {
  const { msgs, busy, error, send, decline } = chat;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [msgs.length, busy]);
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-card px-4 py-4">
      <div className="flex flex-col gap-3">
        {!msgs.length ? (
          <div className="flex items-center gap-2.5 text-[13px] text-muted">
            <AiAvatar size={24} />
            Ask for any change below, or edit a question on the right.
          </div>
        ) : null}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-[14px] rounded-br-[4px] bg-ink px-3 py-2 text-[13px] text-paper">
              {m.text}
            </div>
          ) : (
            <div key={i} className="anim-rise-sm flex gap-2.5">
              <AiAvatar size={24} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5 text-[13px] text-ink">
                <p>{m.text}</p>
                {m.lines?.length ? (
                  <ul className="flex flex-col gap-0.5 border-l border-line pl-3 text-[12.5px] text-muted">
                    {m.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                ) : null}
                {m.ask ? (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => void send(m.ask!, true)} disabled={busy}>
                      Yes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decline(m)}>
                      No
                    </Button>
                  </div>
                ) : null}
                {m.lines?.length ? <AiTag /> : null}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="flex items-center gap-2.5">
            <AiAvatar size={24} working />
            <Dots />
          </div>
        ) : null}
        <ErrorNote message={error} />
        <div ref={end} />
      </div>
    </div>
  );
}
