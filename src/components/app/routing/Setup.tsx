"use client";

// Routing › Setup (docs/routing-chat-plan.md Part 1): the chat writes the setup, the plan card shows it. Before there's
// a setup, the chat is the whole first screen. After, the chat sits on the left and the plan card on the right, with
// Plan (the setup in sentences, and where past leads would go) and Flow (the editor, to change any step by hand). The
// chat never makes anything live: Make live does, after a check of the setup.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { firstProblem } from "@/lib/router/ops";
import { planLines, type PlanLine } from "@/lib/router/readback";
import { emptyBody, type RouterBody } from "@/lib/router/types";
import { Pause, Play, Refresh, Send } from "../../Icons";
import { AiAvatar, Dots } from "../Ai";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, IconButton, mayLeave, Segmented, type ViewProps } from "../ui";
import { routingApi, type ChatMessage, type ChatOut, type Loaded, type ReplayOut } from "./api";
import { RouterEditor } from "./Editor";
import { FlowSkeleton } from "./Flow";
import { fmt } from "./parts";
import { toast } from "./Toast";

type Props = Pick<ViewProps, "sb" | "session" | "ws" | "role" | "navigate">;
type View = "plan" | "flow";

const STARTERS = ["Set it up for me", "Everyone takes turns", "By region"];

export function SetupTab(props: Props) {
  const { session, ws, role } = props;
  const owner = role === "owner";
  const [state, setState] = useState<{ data: Loaded; epoch: number } | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("test") ? "flow" : "plan"));
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

  const pickView = async (v: View) => {
    if (v === view) return;
    if (view === "flow") {
      if (!(await mayLeave())) return;
      await refresh(true);
    }
    setView(v);
  };

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
  const fresh = !d.live && !d.draft && !d.chat.length;
  const chat = <Chat session={session} ws={ws.id} data={d} owner={owner} big={fresh} onTurn={() => void refresh(true)} />;
  if (fresh) return <div className="h-full overflow-y-auto">{chat}</div>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? (
        <div className="px-4 pt-3 md:px-6">
          <ErrorNote message={error} />
        </div>
      ) : null}
      <div className={`grid min-h-0 flex-1 ${view === "flow" ? "2xl:grid-cols-[360px_minmax(0,1fr)]" : "lg:grid-cols-[400px_minmax(0,1fr)]"}`}>
        <div className={`min-h-0 flex-col border-line lg:border-r ${view === "flow" ? "hidden 2xl:flex" : "flex"}`}>{chat}</div>
        <div className="flex min-h-0 flex-col">
          <PlanHead session={session} ws={ws.id} data={d} owner={owner} view={view} onView={(v) => void pickView(v)} onChanged={() => void refresh(false)} />
          <div className="min-h-0 flex-1">
            {view === "plan" ? (
              <Plan session={session} ws={ws.id} data={d} owner={owner} onLive={() => void refresh(true)} onOpenFlow={() => void pickView("flow")} />
            ) : (
              <RouterEditor key={state.epoch} {...props} data={d} refresh={refresh} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanHead({ session, ws, data, owner, view, onView, onChanged }: { session: ViewProps["session"]; ws: string; data: Loaded; owner: boolean; view: View; onView: (v: View) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const pause = async (paused: boolean) => {
    if (paused && !(await askConfirm("Pause routing?", { body: "New leads keep the owner they come with until you turn it back on.", ok: "Pause" }))) return;
    setBusy(true);
    try {
      await routingApi(session, ws, "pause", { paused });
      onChanged();
    } catch (e) {
      toast({ text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 md:px-6">
      <h2 className="text-[14px] font-medium text-ink">Your setup</h2>
      {data.draft ? <Badge tone="amber">Not live yet</Badge> : data.live && data.paused ? <Badge>Paused</Badge> : data.live ? <Badge tone="green" dot>Live</Badge> : null}
      <div className="ml-auto flex items-center gap-2">
        {owner && data.live ? (
          <IconButton label={data.paused ? "Turn routing on" : "Pause routing"} disabled={busy} onClick={() => void pause(!data.paused)}>
            {data.paused ? <Play size={15} /> : <Pause size={15} />}
          </IconButton>
        ) : null}
        <Segmented
          label="View"
          value={view}
          onChange={onView}
          options={[
            { value: "plan", label: "Plan" },
            { value: "flow", label: "Flow" },
          ]}
        />
      </div>
    </div>
  );
}

/** The chat. `big` is the first screen: one title, the box and three starters. */
function Chat({ session, ws, data, owner, big, onTurn }: { session: ViewProps["session"]; ws: string; data: Loaded; owner: boolean; big: boolean; onTurn: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const messages = data.chat;
  const last = messages[messages.length - 1];
  const ask = last?.role === "assistant" && last.ask ? last.ask : null;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const send = async (message: string) => {
    const m = message.trim();
    if (!m || busy) return;
    if (!(await mayLeave())) return;
    setBusy(true);
    setError("");
    setPending(m);
    setText("");
    try {
      const fresh = await routingApi<Loaded>(session, ws, "load");
      const r = await routingApi<ChatOut>(session, ws, "chat", { message: m, revision: fresh.revision });
      if (r.reps) toast({ text: r.reps === 1 ? "Rep updated" : `${r.reps} reps updated` });
      onTurn();
    } catch (e) {
      setError(errorText(e));
      setText(m);
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const takeLegacy = async () => {
    setBusy(true);
    setError("");
    try {
      await routingApi(session, ws, "save_draft", { body: data.legacy!.body, revision: data.revision });
      onTurn();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const startOver = async () => {
    if (!(await askConfirm("Clear the chat?", { body: "Your setup stays as it is.", ok: "Clear" }))) return;
    try {
      await routingApi(session, ws, "chat", { clear: true });
      onTurn();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const box = (
    <form
      className="flex items-end gap-2 rounded-[10px] border border-line bg-card p-2 focus-within:border-line-strong"
      onSubmit={(e) => {
        e.preventDefault();
        void send(text);
      }}
    >
      <textarea
        aria-label="Message"
        value={text}
        rows={big ? 3 : 2}
        maxLength={4000}
        disabled={!owner || busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(text);
          }
        }}
        placeholder={big ? "Europe goes to Ana, companies over 500 people go to Sam and Raj, everyone else takes turns" : "Ana is out next week"}
        className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint"
      />
      <IconButton label="Send" type="submit" disabled={!owner || busy || !text.trim()}>
        <Send size={16} />
      </IconButton>
    </form>
  );

  const starters = (list: string[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((s) => (
        <button
          key={s}
          type="button"
          disabled={!owner || busy}
          onClick={() => void send(s)}
          className="inline-flex h-8 items-center rounded-full border border-line bg-card px-3 text-[12.5px] text-body transition-colors duration-[120ms] hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );

  if (big)
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 md:py-24">
        <div className="flex flex-col items-start gap-4">
          <AiAvatar size={36} working={busy} />
          <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.02em] text-balance text-ink">
            Who should get your leads?
            <br />
            <span className="text-muted">Say it, and it&apos;s set up.</span>
          </h1>
        </div>
        {pending ? <Bubble role="user" text={pending} /> : null}
        {busy ? <Dots /> : null}
        {box}
        <ErrorNote message={error} />
        {owner ? (
          <div className="flex flex-wrap gap-2">
            {starters(STARTERS)}
            {data.legacy ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void takeLegacy()}>
                Use my current routing
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <AiAvatar size={24} working={busy} />
        <span className="text-[13px] font-medium text-ink">Routing chat</span>
        {owner && messages.length ? (
          <IconButton label="Clear the chat" className="ml-auto" onClick={() => void startOver()}>
            <Refresh size={15} />
          </IconButton>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <Bubble key={`${m.at}-${i}`} role={m.role} text={m.text} lines={m.lines} />
          ))}
          {pending ? <Bubble role="user" text={pending} /> : null}
          {busy ? (
            <div className="flex items-center gap-2">
              <AiAvatar size={24} working />
              <Dots />
            </div>
          ) : null}
          {ask && !busy && owner ? <div className="pl-8">{starters(ask.choices)}</div> : null}
          <div ref={end} />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-3">
        <ErrorNote message={error} />
        {!messages.length && owner ? starters(["Everyone takes turns", "By region", "Big companies to the AEs"]) : null}
        {box}
      </div>
    </div>
  );
}

function Bubble({ role, text, lines }: { role: ChatMessage["role"]; text: string; lines?: string[] }) {
  if (role === "user")
    return <div className="ml-auto max-w-[85%] rounded-[10px] bg-paper-deep px-3 py-2 text-[13px] whitespace-pre-wrap text-ink">{text}</div>;
  return (
    <div className="flex max-w-full gap-2">
      <AiAvatar size={24} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <p className="text-[13px] leading-[1.5] whitespace-pre-wrap text-ink">{text}</p>
        {lines?.length ? (
          <ul className="flex flex-col gap-1 border-l border-line pl-3">
            {lines.map((l, i) => (
              <li key={i} className="text-[12.5px] text-muted">
                {l}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

const STEP: Record<PlanLine["kind"], string> = { spam: "Junk", account: "Same company", keep: "Has a rep", rule: "Rule", fallback: "Everyone else", sla: "Response time" };

/** The setup in sentences, where past leads would go, and Make live. */
function Plan({ session, ws, data, owner, onLive, onOpenFlow }: { session: ViewProps["session"]; ws: string; data: Loaded; owner: boolean; onLive: () => void; onOpenFlow: () => void }) {
  const body: RouterBody = data.draft ?? data.live?.body ?? emptyBody();
  const names = useMemo(() => Object.fromEntries(data.members.map((m) => [m.id, m.name])), [data.members]);
  const lines = useMemo(() => planLines(body, { names, fields: data.fields }), [body, names, data.fields]);
  const problem = useMemo(() => (data.draft ? firstProblem(data.draft, { members: data.members, fields: data.fields }) : ""), [data.draft, data.members, data.fields]);
  const [tested, setTested] = useState<{ key: string; out: ReplayOut | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bodyKey = JSON.stringify(body);
  useEffect(() => {
    if (!owner) return;
    let on = true;
    routingApi<ReplayOut>(session, ws, "replay", { days: 30, draft: JSON.parse(bodyKey) })
      .then((r) => on && setTested({ key: bodyKey, out: r }))
      .catch(() => on && setTested({ key: bodyKey, out: null }));
    return () => {
      on = false;
    };
  }, [session, ws, owner, bodyKey]);

  const testing = owner && tested?.key !== bodyKey;
  const replay = tested?.key === bodyKey ? tested.out : null;

  const makeLive = async () => {
    const moved = replay && data.live ? `${fmt(replay.changed)} of ${fmt(replay.total)} past leads would go somewhere new.` : undefined;
    if (!(await askConfirm("Make this live?", { body: moved, ok: "Make live" }))) return;
    setBusy(true);
    setError("");
    try {
      const r = await routingApi<{ version: number }>(session, ws, "publish", { note: null });
      toast({ text: `Version ${r.version} is live` });
      onLive();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const split = Object.entries(replay?.split ?? {}).sort((a, b) => b[1] - a[1]);
  const top = split[0]?.[1] ?? 0;
  const label = (k: string) => (k === "held" ? "Held for review" : k === "unassigned" ? "No rep" : (names[k] ?? "A former teammate"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <ol className="flex flex-col">
          {lines.map((l, i) => (
            <li key={`${l.kind}-${l.id ?? i}`}>
              <button
                type="button"
                onClick={onOpenFlow}
                className={`group flex w-full items-start gap-4 border-b border-line-light py-3 text-left ${l.off ? "opacity-50" : ""}`}
              >
                <span className="w-6 shrink-0 pt-0.5 font-mono text-[11px] text-faint tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-mono text-[10.5px] tracking-[0.06em] text-faint uppercase">{STEP[l.kind]}</span>
                  <span className="text-[13.5px] text-ink group-hover:underline">{l.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        {owner && (testing || (replay && replay.total > 0)) ? (
          <section className="flex flex-col gap-3 rounded-[10px] border border-line p-4">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-medium text-ink">Past 30 days</h3>
              {replay && !testing ? <span className="text-[12.5px] text-muted tabular-nums">{fmt(replay.total)} leads</span> : null}
              {testing ? <Dots className="ml-auto" /> : replay && data.live ? <span className="ml-auto text-[12.5px] text-muted tabular-nums">{fmt(replay.changed)} would move</span> : null}
            </div>
            {split.map(([k, n]) => (
              <div key={k} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_48px] items-center gap-3 text-[12.5px]">
                <span className="truncate text-body">{label(k)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-paper-deep">
                  <span className={`block h-full rounded-full ${k === "held" || k === "unassigned" ? "bg-line-strong" : "bg-ink"}`} style={{ width: `${top ? Math.max(2, (n / top) * 100) : 0}%` }} />
                </span>
                <span className="text-right text-muted tabular-nums">{fmt(n)}</span>
              </div>
            ))}
          </section>
        ) : null}

        <ErrorNote message={error} />
        {owner && data.draft ? (
          <div className="flex items-center justify-end gap-3">
            {problem ? <span className="text-[12.5px] text-muted">{problem}</span> : null}
            <Button disabled={!!problem || busy} onClick={() => void makeLive()}>
              Make live
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
