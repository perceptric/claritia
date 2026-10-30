"use client";

// The AI bar under the form (docs/form-builder.md 4.4): type what to change and the form changes. Nothing is kept
// as a chat; the bar shows what the last ask did, with Undo, or the one question it needs answered. useFormChat
// sends to /api/forms/chat with the saved draft's revision, so a change lands on what's on screen.

import { useState } from "react";
import type { Form } from "@/lib/forms/schema";
import { Check, Send } from "../../Icons";
import { AiMark, Dots } from "../Ai";
import { Button, errorText, IconButton, postJson, type ViewProps } from "../ui";

export type Outcome = { reply: string; lines: string[]; ask?: string } | null;

export function useFormChat({ session, ws, formId, prepare, onResult }: Pick<ViewProps, "session" | "ws"> & { formId: string; prepare: () => Promise<number | null>; onResult: (f: Form, rev: number) => void }) {
  const [last, setLast] = useState<Outcome>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (message: string, confirmed = false) => {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setError("");
    setLast(null);
    try {
      const rev = await prepare();
      if (rev === null) throw new Error("The draft didn't save. Try again.");
      const r = await postJson<{ form: Form; rev: number; reply: string; lines: string[]; ask: { question: string } | null; styles?: boolean }>(session, "/api/forms/chat", { workspaceId: ws.id, id: formId, rev, message: m, confirmed });
      if (r.lines.length) onResult(r.form, r.rev);
      if (r.styles) window.dispatchEvent(new Event("claritia:changed"));
      setLast({ reply: r.reply, lines: r.lines, ...(r.ask ? { ask: m } : {}) });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return { last, busy, error, send, clear: () => (setLast(null), setError("")) };
}

/** The bar: what the last ask did (with Undo), then the box. */
export function AskBar({ chat, onUndo, inset = "inset-x-0" }: { chat: ReturnType<typeof useFormChat>; onUndo: () => void; /** Where it sits: over the canvas, between the editor's rail and panel. */ inset?: string }) {
  const { last, busy, error, send, clear } = chat;
  const [text, setText] = useState("");
  const go = (t: string) => {
    if (!t.trim() || busy) return;
    setText("");
    void send(t);
  };
  const said = last?.lines.length ? (last.lines.length === 1 ? last.lines[0]! : `${last.lines[0]}, and ${last.lines.length - 1} more`) : last?.reply;
  return (
    <div className={`pointer-events-none absolute ${inset} bottom-0 z-10 flex flex-col items-center gap-2 px-4 pt-6 pb-4`}>
      {busy || error || last ? (
        <div role="status" className={`anim-rise-sm pointer-events-auto flex max-w-full items-center gap-2 rounded-full border bg-card py-1 pr-1 pl-3 text-[12.5px] shadow-[0_4px_16px_rgb(0_0_0/0.08)] ${error ? "border-rose/40 text-rose" : "border-line text-body"}`}>
          {busy ? (
            <>
              <Dots />
              <span className="pr-2 text-muted">Editing the form</span>
            </>
          ) : error ? (
            <span className="truncate py-1 pr-2">{error}</span>
          ) : last?.ask ? (
            <>
              <span className="truncate">{last.reply}</span>
              <Button size="sm" onClick={() => void send(last.ask!, true)}>
                Yes
              </Button>
              <Button size="sm" variant="plain" onClick={clear}>
                No
              </Button>
            </>
          ) : (
            <>
              {last?.lines.length ? (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sage-wash text-sage">
                  <Check size={10} />
                </span>
              ) : null}
              <span className="truncate" title={last?.lines.join("\n") || undefined}>
                {said}
              </span>
              {last?.lines.length ? (
                <Button size="sm" variant="plain" onClick={() => (onUndo(), clear())}>
                  Undo
                </Button>
              ) : (
                <span className="pr-2" />
              )}
            </>
          )}
        </div>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
        className="pointer-events-auto flex w-full max-w-[600px] items-center gap-2 rounded-full border border-line-strong bg-card py-1.5 pr-1.5 pl-4 shadow-[0_8px_28px_rgb(0_0_0/0.12)] transition-[border-color] duration-[140ms] focus-within:border-ink"
      >
        <AiMark size={15} working={busy} />
        <input
          aria-label="Tell AI what to change"
          value={text}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell AI what to change"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint disabled:text-muted"
        />
        <IconButton label="Send" type="submit" disabled={busy || !text.trim()} className="rounded-full bg-ink text-paper hover:bg-ink hover:opacity-90">
          <Send size={15} />
        </IconButton>
      </form>
    </div>
  );
}
