"use client";

// Tia on the canvas (docs/email-canvas-b5.md sections 2 and 3): the chat in the left panel. Chips above the message
// box say what she may change (an email, or parts of one); with none, she works on the picked email; with nothing
// picked, she plans new emails for the group. A turn on several emails makes one call each (3 at a time), locks
// those emails while she writes, and lands as one undo step; an email that changed meanwhile asks first. Her
// questions come with choices; a plan of new emails comes as a card with Write them.

import type { Session } from "@supabase/supabase-js";
import { useRef, useState } from "react";
import type { EmailDoc } from "@/lib/design/email/doc";
import type { DesignSystem } from "@/lib/design/model";
import { changedMeanwhile, turnTargets, type Chip, type Target } from "@/lib/design/email/turn";
import { X } from "../../../Icons";
import { AiAvatar, AiMark, AiTag, Dots } from "../../Ai";
import { Button } from "../../ui";
import type { CanvasEditor } from "./useCanvasEditor";

type Out = { doc: EmailDoc; system: DesignSystem | null; subject: string; reply: string; lines: string[]; ask: { question: string; choices: string[] } | null };
export type PlanItem = { name: string; subject: string; brief: string };
type Line =
  | { kind: "you"; text: string }
  | { kind: "tia"; text: string; changes: { email: string; name: string; lines: string[] }[] }
  | { kind: "error"; email: string | null; name: string; text: string; retry: () => void }
  | { kind: "conflict"; items: { email: string; name: string; out: Out }[] }
  | { kind: "plan"; items: PlanItem[]; message: string; done: boolean };
const EXAMPLES = ["Write a 3-email welcome series for new students", "Make every heading shorter", "Add a button to book a call"];

async function post<T>(session: Session, url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body), signal });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Try again in a moment.");
  return data;
}

/** Runs tasks at most `n` at a time. */
async function limited<T>(tasks: (() => Promise<T>)[], n: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]!();
    }
  }));
  return out;
}

export function CanvasChat({
  session,
  ws,
  editor,
  chips,
  onChips,
  picked,
  groupName,
  nameOf,
  subjectOf,
  onPick,
  onFlash,
  onWrite,
}: {
  session: Session;
  ws: string;
  editor: CanvasEditor;
  chips: Chip[];
  onChips: (c: Chip[]) => void;
  /** The picked email, when no chip says otherwise. */
  picked: string | null;
  groupName: string;
  nameOf: (email: string) => string;
  subjectOf: (email: string) => string;
  /** A chip's words: "Welcome › Heading: Three things worth your time". */
  onPick: (email: string, id: string | null) => void;
  onFlash: (emails: string[]) => void;
  /** Write them on a plan card: the page makes the emails. */
  onWrite: (items: PlanItem[], message: string) => void;
}) {
  const [text, setText] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<{ question: string; choices: string[]; targets: Target[] } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const history = () =>
    log
      .flatMap((l): { role: "user" | "assistant"; text: string }[] => (l.kind === "you" ? [{ role: "user", text: l.text }] : l.kind === "tia" ? [{ role: "assistant", text: l.text }] : []))
      .slice(-10);

  /** Applies results as one undo step (emails and their kits' styles). */
  const apply = (items: { email: string; out: Out }[], message: string) => {
    if (!items.length) return;
    const emails: Record<string, { doc: EmailDoc; subject: string }> = {};
    const kits: Record<string, DesignSystem> = {};
    for (const it of items) {
      emails[it.email] = { doc: it.out.doc, subject: it.out.subject };
      const k = editor.kitNow(it.out.doc).kitId;
      if (it.out.system && k) kits[k] = it.out.system;
    }
    editor.change({ emails, kits }, { label: `Tia: ${message.slice(0, 40)}` });
    onFlash(Object.keys(emails));
  };

  /** One turn on the emails the chips (or the pick) name. */
  const turn = async (message: string, targets: Target[], confirmed: boolean) => {
    setBusy(true);
    setAsk(null);
    const ac = new AbortController();
    abort.current = ac;
    const ids = targets.map((t) => t.email);
    editor.lock(ids, true);
    const sentDocs = new Map(ids.map((id) => [id, JSON.stringify(editor.latest(id))]));
    const done: { email: string; sent: string; out: Out }[] = [];
    const fails: { email: string; text: string }[] = [];
    const h = history();
    await limited(
      targets.map((t) => async () => {
        if (ac.signal.aborted) return;
        const doc = editor.latest(t.email);
        if (!doc) return;
        try {
          const out = await post<Out>(
            session,
            "/api/email/chat",
            { workspaceId: ws, ref: `em:${t.email}`, doc, subject: subjectOf(t.email), message, history: h, confirmed, scope: t.scope, turnWith: targets.filter((o) => o.email !== t.email).map((o) => ({ name: nameOf(o.email), subject: subjectOf(o.email) })) },
            ac.signal,
          );
          done.push({ email: t.email, sent: sentDocs.get(t.email)!, out });
        } catch (e) {
          if (!ac.signal.aborted) fails.push({ email: t.email, text: e instanceof Error ? e.message : "Try again in a moment." });
        }
      }),
      3,
    );
    editor.lock(ids, false);
    abort.current = null;
    setBusy(false);
    const late = changedMeanwhile(done, (email) => JSON.stringify(editor.latest(email)));
    const fresh = done.filter((d) => !late.includes(d));
    apply(fresh.filter((d) => d.out.lines.length), message);
    const said = done.map((d) => d.out.reply).filter(Boolean);
    const lines: Line[] = [];
    if (said.length || fresh.some((d) => d.out.lines.length))
      lines.push({ kind: "tia", text: said.length === 1 ? said[0]! : said.map((r, i) => `${nameOf(done[i]!.email)}: ${r}`).join("\n"), changes: fresh.filter((d) => d.out.lines.length).map((d) => ({ email: d.email, name: nameOf(d.email), lines: d.out.lines })) });
    if (late.length) lines.push({ kind: "conflict", items: late.map((d) => ({ email: d.email, name: nameOf(d.email), out: d.out })) });
    for (const f of fails) lines.push({ kind: "error", email: f.email, name: nameOf(f.email), text: f.text, retry: () => void turn(message, targets.filter((t) => t.email === f.email), confirmed) });
    setLog((l) => [...l, ...lines]);
    const asked = done.find((d) => d.out.ask)?.out.ask;
    if (asked) setAsk({ ...asked, targets });
  };

  /** With nothing picked and no chips: a plan of new emails for the group. */
  const plan = async (message: string) => {
    setBusy(true);
    try {
      const r = await post<{ plan: PlanItem[]; reply: string }>(session, "/api/email/series", { workspaceId: ws, step: "plan", message, group: groupName, history: history() });
      setLog((l) => [...l, ...(r.reply ? [{ kind: "tia" as const, text: r.reply, changes: [] }] : []), ...(r.plan.length ? [{ kind: "plan" as const, items: r.plan, message, done: false }] : [])]);
    } catch (e) {
      setLog((l) => [...l, { kind: "error", email: null, name: "", text: e instanceof Error ? e.message : "Try again in a moment.", retry: () => void plan(message) }]);
    } finally {
      setBusy(false);
    }
  };

  const send = (raw: string, confirmed = false, targetsOverride?: Target[]) => {
    const message = raw.trim();
    if (!message || busy) return;
    setText("");
    setLog((l) => [...l, { kind: "you", text: message }]);
    const targets = targetsOverride ?? turnTargets(chips, picked);
    if (!targets.length) return void plan(message);
    void turn(message, targets, confirmed);
  };

  const chipWords = (c: Chip) => {
    const name = nameOf(c.email);
    if (!c.id) return name;
    return `${name} › ${partWords(editor.latest(c.email), c.id)}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-canvas-chat="">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3">
        {!log.length ? (
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <p className="text-[13px] text-body">Ask Tia to write or change emails in this group</p>
            <div className="flex w-full flex-col gap-1.5">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => send(x)} className="rounded-lg bg-card px-3 py-2 text-left text-[12.5px] text-ink shadow-rest hover:bg-hover">
                  {x}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {log.map((l, i) =>
          l.kind === "you" ? (
            <p key={i} className="max-w-[90%] self-end rounded-2xl bg-paper-deep px-3 py-2 text-[13px] break-words text-ink">
              {l.text}
            </p>
          ) : l.kind === "tia" ? (
            <div key={i} className="flex min-w-0 gap-2">
              <AiAvatar size={24} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {l.text ? <p className="text-[13px] break-words whitespace-pre-line text-ink">{l.text}</p> : null}
                {l.changes.map((c) => (
                  <button key={c.email} type="button" onClick={() => onPick(c.email, null)} className="flex min-w-0 flex-col items-start gap-1 rounded-lg bg-card px-2.5 py-2 text-left shadow-rest hover:bg-hover">
                    <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-medium text-ink">
                      {c.name} <AiTag />
                    </span>
                    {c.lines.map((x, k) => (
                      <span key={k} className="text-[12px] break-words text-muted">
                        {x}
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            </div>
          ) : l.kind === "error" ? (
            <p key={i} role="alert" className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-rose">
              <span className="min-w-0 break-words">{l.name ? `${l.name}: ` : ""}{l.text}</span>
              <button type="button" onClick={l.retry} className="font-medium text-ink underline underline-offset-2">
                Try again
              </button>
            </p>
          ) : l.kind === "conflict" ? (
            <div key={i} className="flex flex-col gap-2 rounded-lg bg-card p-2.5 shadow-rest">
              {l.items.map((it) => (
                <div key={it.email} className="flex flex-col gap-1.5">
                  <p className="text-[12.5px] break-words text-ink">{it.name} changed while Tia worked</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => {
                        apply([{ email: it.email, out: it.out }], "Apply anyway");
                        setLog((ls) => ls.map((x) => (x === l ? { ...l, items: l.items.filter((y) => y !== it) } : x)));
                      }}
                    >
                      Apply anyway
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLog((ls) => ls.map((x) => (x === l ? { ...l, items: l.items.filter((y) => y !== it) } : x)))}>
                      Skip
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div key={i} data-plan="" className="flex flex-col gap-2 rounded-lg bg-card p-2.5 shadow-rest">
              <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                <AiMark size={13} /> {l.items.length} {l.items.length === 1 ? "email" : "emails"}
              </p>
              <ol className="flex flex-col gap-1.5">
                {l.items.map((it, k) => (
                  <li key={k} className="flex min-w-0 flex-col">
                    <span className="text-[12.5px] font-medium break-words text-ink">
                      {k + 1}. {it.name}
                    </span>
                    <span className="text-[12px] break-words text-body">{it.subject}</span>
                    <span className="text-[12px] break-words text-muted">{it.brief}</span>
                  </li>
                ))}
              </ol>
              {!l.done ? (
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => {
                      setLog((ls) => ls.map((x) => (x === l ? { ...l, done: true } : x)));
                      onWrite(l.items, l.message);
                    }}
                  >
                    Write them
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => box.current?.focus()}>
                    Change
                  </Button>
                </div>
              ) : null}
            </div>
          ),
        )}
        {ask ? (
          <div className="flex flex-col gap-2 rounded-lg bg-card p-2.5 shadow-rest">
            <p className="text-[13px] break-words text-ink">{ask.question}</p>
            <div className="flex flex-wrap gap-1.5">
              {ask.choices.map((c) => (
                <Button key={c} size="sm" variant="ghost" onClick={() => send(c, true, ask.targets)}>
                  {c}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        {busy ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <AiAvatar size={24} working />
            <Dots />
            <button type="button" onClick={() => abort.current?.abort()} className="ml-auto font-medium text-ink underline underline-offset-2">
              Stop
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-t border-line p-3">
        {chips.length ? (
          <div className="flex min-w-0 flex-wrap gap-1.5" aria-label="Added to chat">
            {chips.map((c) => (
              <span key={`${c.email}:${c.id ?? ""}`} className="inline-flex max-w-full min-w-0 items-start gap-1 rounded-lg bg-lilac-wash py-1 pr-1 pl-2 text-[12px] text-ink">
                <span className="min-w-0 break-words">{chipWords(c)}</span>
                <button type="button" aria-label={`Remove ${chipWords(c)}`} onClick={() => onChips(chips.filter((x) => x !== c))} className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-ink">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          rows={2}
          aria-label="Ask Tia"
          placeholder="Ask Tia"
          className="min-h-[56px] w-full resize-none rounded-lg bg-card px-2.5 py-2 text-[13px] text-ink shadow-input outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}

/** A part's kind and first words, for its chip. */
function partWords(doc: EmailDoc | null, id: string): string {
  for (const s of doc?.sections ?? []) {
    if (s.id === id) return "Section";
    for (const c of s.columns) {
      if (c.id === id) return "Column";
      const b = c.blocks.find((x) => x.id === id);
      if (b) {
        const kind = b.type[0]!.toUpperCase() + b.type.slice(1);
        const words = b.type === "heading" ? b.text : b.type === "button" || b.type === "meeting" ? b.label : b.type === "text" ? b.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
        return words ? `${kind}: ${words}` : kind;
      }
    }
  }
  return "Part";
}
