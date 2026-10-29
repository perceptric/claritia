"use client";

// Routing › Setup, in the same spirit as Scoring: on the first visit the assistant builds the setup (Build.tsx); after
// that, the flowchart editor with the side panel, and the assistant's box at the bottom. The assistant never makes
// anything live: Publish does, after a check of the setup.

import { useCallback, useEffect, useRef, useState } from "react";
import { AiAvatar } from "../Ai";
import { AskDock } from "../forms/FormHome";
import { Button, ErrorNote, errorText, mayLeave, type ViewProps } from "../ui";
import { routingApi, type ChatOut, type Loaded } from "./api";
import { Build } from "./Build";
import { RouterEditor } from "./Editor";
import { FlowSkeleton } from "./Flow";
import { toast } from "./Toast";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate">;

export function SetupTab(props: Props) {
  const { session, ws, role } = props;
  const owner = role === "owner";
  const [state, setState] = useState<{ data: Loaded; epoch: number } | null>(null);
  const [error, setError] = useState("");
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  /** Load again; `remount` starts the editor over from what's saved. */
  const refresh = useCallback(
    async (remount: boolean) => {
      try {
        const data = await routingApi<Loaded>(sessionRef.current, ws.id, "load");
        setState((s) => ({ data, epoch: (s?.epoch ?? 0) + (remount ? 1 : 0) }));
        setError("");
      } catch (e) {
        setError(errorText(e));
      }
    },
    [ws.id],
  );
  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  if (!state)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {error ? (
          <div className="p-4 md:p-6">
            <ErrorNote message={error} />
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refresh(false)}>
              Try again
            </Button>
          </div>
        ) : (
          <FlowSkeleton />
        )}
      </div>
    );

  const d = state.data;
  if (!d.live && !d.draft) {
    if (!owner)
      return (
        <div className="flex flex-col items-center gap-1 px-4 py-20 text-center">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">No routing yet</h2>
          <p className="text-[13px] text-muted">A workspace owner can set it up here.</p>
        </div>
      );
    return <Build session={session} ws={ws} data={d} onDone={() => void refresh(true)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <RouterEditor key={state.epoch} {...props} data={d} refresh={refresh} />
      </div>
      {owner ? <ChatDock session={session} ws={ws.id} data={d} onTurn={() => void refresh(true)} /> : null}
    </div>
  );
}

/** The assistant's box at the bottom, with its latest reply above it and one-tap answers when it asks. */
function ChatDock({ session, ws, data, onTurn }: { session: ViewProps["session"]; ws: string; data: Loaded; onTurn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const messages = data.chat ?? [];
  const last = messages[messages.length - 1];
  const ask = last?.role === "assistant" && last.ask ? last.ask : null;
  const shown = all ? messages : messages.slice(-1);

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    if (!(await mayLeave())) return;
    setBusy(true);
    setError("");
    setPending(m);
    try {
      const fresh = await routingApi<Loaded>(session, ws, "load");
      const r = await routingApi<ChatOut>(session, ws, "chat", { message: m, revision: fresh.revision });
      if (r.reps) toast({ text: r.reps === 1 ? "Rep updated" : `${r.reps} reps updated` });
      onTurn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="shrink-0 border-t border-line">
      {messages.length || pending || error ? (
        <div className="flex max-h-[180px] flex-col gap-2.5 overflow-y-auto px-4 pt-3 md:px-8">
          {messages.length > 1 ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="self-center text-[12px] text-muted hover:text-ink">
              {all ? "Show less" : `Show ${messages.length - 1} earlier`}
            </button>
          ) : null}
          {shown.map((msg, i) =>
            msg.role === "user" ? (
              <div key={`${msg.at}-${i}`} className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-ink px-3 py-1.5 text-[13px] text-paper">
                {msg.text}
              </div>
            ) : (
              <div key={`${msg.at}-${i}`} className="anim-rise-sm flex gap-2.5">
                <AiAvatar size={24} />
                <div className="min-w-0 pt-0.5 text-[13px] text-ink">
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                  {msg.lines?.length ? (
                    <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3 text-[12.5px] text-muted">
                      {msg.lines.slice(0, 3).map((l, j) => (
                        <li key={j}>{l}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {pending ? <div className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-ink px-3 py-1.5 text-[13px] text-paper">{pending}</div> : null}
          {busy ? <AiAvatar size={24} working /> : null}
          <ErrorNote message={error} />
        </div>
      ) : null}
      <AskDock wide busy={busy} starters={ask && !busy ? ask.choices : messages.length ? [] : ["Send leads by region", "Big companies go to my senior reps", "Ana is out next week"]} placeholder="Ask the assistant to change the routing" onSend={(t) => void send(t)} />
    </div>
  );
}
