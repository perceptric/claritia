"use client";

// The scoring model (docs/scoring-plan.md Part 2.1): Rules, a flowchart on the dotted canvas with the side panel that
// edits any part of it, and Results on past leads. Every change saves as a draft 800 ms later; Publish makes it live.
// The assistant's box sits at the bottom.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { needsValue, type FieldDef } from "@/lib/router/conditions";
import type { Cond, Op } from "@/lib/router/types";
import { rate } from "@/lib/scoring/engine";
import { EVENT_FIELDS, GRADES, isEventField, newId, opsForField, problems, type ScoreBody, type ScoreGroup, type ScoreRule } from "@/lib/scoring/model";
import { ruleNote, ruleWords } from "@/lib/scoring/words";
import { ArrowDown, ArrowUp, Check, ChevronRight, Copy, Minus, Plus, Redo, Trash, Undo, X } from "../../Icons";
import { AiAvatar, AiMark } from "../Ai";
import { askConfirm, askText } from "../Dialogs";
import { Popover } from "../FilterBar";
import { AskDock } from "../forms/FormHome";
import { Select } from "../Select";
import { Badge, Button, ErrorNote, errorText, IconButton, Input, Segmented, Toggle, type ViewProps } from "../ui";
import { Dots as DotCanvas } from "../routing/Flow";
import { toast } from "../routing/Toast";
import { BAND, scoringApi, type Loaded, type ModelData, type Results } from "./api";
import { Points } from "./Build";

type Sel = { kind: "model" } | { kind: "group"; id: string } | { kind: "rule"; id: string };
type Msg = { role: "user" | "assistant"; text: string; lines?: string[] };
const clone = (b: ScoreBody): ScoreBody => JSON.parse(JSON.stringify(b));

export function Editor({ session, ws, role, data, model, refresh }: Pick<ViewProps, "session" | "ws" | "role"> & { data: Loaded; model: ModelData; refresh: () => void }) {
  const owner = role === "owner";
  const [body, setBody] = useState<ScoreBody>(() => model.draft ?? model.live!);
  const [hist, setHist] = useState<{ past: ScoreBody[]; future: ScoreBody[] }>({ past: [], future: [] });
  const [revision, setRevision] = useState(model.revision);
  const [pending, setPending] = useState(false);
  const [hasDraft, setHasDraft] = useState(!!model.draft);
  const [sel, setSel] = useState<Sel>({ kind: "model" });
  const [view, setView] = useState<"rules" | "results">("rules");
  const [res, setRes] = useState<Results | null>(null);
  const [error, setError] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [allMsgs, setAllMsgs] = useState(false);
  // A publish read back from the server updates the editor in place (selection, view and chat stay).
  const [seen, setSeen] = useState({ live: model.liveVersion ?? 0, revision: model.revision });
  if (seen.live !== (model.liveVersion ?? 0) || (seen.revision !== model.revision && !pending)) {
    setSeen({ live: model.liveVersion ?? 0, revision: model.revision });
    setHasDraft(!!model.draft);
    setRevision(model.revision);
    if (!pending) setBody(model.draft ?? model.live!);
  }
  const words = useMemo(() => ({ fields: data.fields, forms: Object.fromEntries(data.forms.map((f) => [f.id, f.name])) }), [data.fields, data.forms]);
  const bodyRef = useRef(body);
  bodyRef.current = body;

  const edit = useCallback((fn: (b: ScoreBody) => void) => {
    if (!owner) return;
    setHist((h) => ({ past: [...h.past.slice(-60), bodyRef.current], future: [] }));
    const next = clone(bodyRef.current);
    fn(next);
    setBody(next);
    setPending(true);
  }, [owner]);

  // Save the draft 800 ms after the last change.
  const save = useCallback(async () => {
    try {
      const r = await scoringApi<{ revision: number }>(session, ws.id, "save_draft", { model: model.id, body: bodyRef.current, revision });
      setRevision(r.revision);
      setPending(false);
      setHasDraft(true);
      setError("");
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    }
  }, [session, ws.id, model.id, revision]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [pending, body, save]);

  // Results on past leads, 600 ms after the last change.
  useEffect(() => {
    let on = true;
    const t = setTimeout(() => {
      scoringApi<Results>(session, ws.id, "results", { model: model.id, body }).then((r) => on && setRes(r), () => undefined);
    }, 600);
    return () => {
      on = false;
      clearTimeout(t);
    };
  }, [session, ws.id, model.id, body]);

  const undo = () => setHist((h) => (h.past.length ? (setBody(h.past[h.past.length - 1]!), setPending(true), { past: h.past.slice(0, -1), future: [bodyRef.current, ...h.future] }) : h));
  const redo = () => setHist((h) => (h.future.length ? (setBody(h.future[0]!), setPending(true), { past: [...h.past, bodyRef.current], future: h.future.slice(1) }) : h));

  const left = problems(body);
  const draft = hasDraft || pending;
  const publish = async () => {
    if (pending && !(await save())) return;
    const moved = res?.moved;
    const next = (model.versions[0]?.version ?? 0) + 1;
    if (!(await askConfirm(`Publish version ${next}?`, { body: moved !== null && moved !== undefined ? `Every lead is scored again with this model. ${moved.toLocaleString("en-US")} past leads would change status.` : "Every lead is scored with this model within a few minutes.", ok: "Publish" }))) return;
    try {
      const r = await scoringApi<{ version: number }>(session, ws.id, "publish", { model: model.id });
      toast({ text: `Version ${r.version} published` });
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const fitCapacity = async () => {
    try {
      const r = await scoringApi<{ body: ScoreBody }>(session, ws.id, "fit", { body: bodyRef.current });
      edit((b) => Object.assign(b, { ready: r.body.ready, warm: r.body.warm, mql: r.body.mql }));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const send = async (text: string) => {
    if (busy) return;
    if (pending && !(await save())) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: "user", text }]);
    try {
      const r = await scoringApi<{ reply: string; lines: string[]; body: ScoreBody | null; revision: number }>(session, ws.id, "chat", { model: model.id, message: text, body: bodyRef.current, revision, history: msgs.slice(-8).map(({ role, text }) => ({ role, text })) });
      if (r.body) {
        setHist((h) => ({ past: [...h.past.slice(-60), bodyRef.current], future: [] }));
        setBody(r.body);
        setRevision(r.revision);
        setHasDraft(true);
      }
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, lines: r.lines }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", text: errorText(e) }]);
    } finally {
      setBusy(false);
    }
  };
  const rename = async () => {
    const name = await askText("Rename model", { initial: model.name, ok: "Rename" });
    if (!name || name === model.name) return;
    try {
      await scoringApi(session, ws.id, "rename", { model: model.id, name });
      refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const shown = allMsgs ? msgs : msgs.slice(-1);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2 md:px-5">
        <button type="button" onClick={() => void rename()} disabled={!owner} className="truncate rounded-full px-1 text-[14px] font-medium text-ink hover:underline disabled:no-underline">
          {model.name}
        </button>
        {!model.live ? <Badge tone="amber">Draft</Badge> : draft ? <Badge tone="amber">Unpublished changes</Badge> : <Badge tone="green" dot>Live</Badge>}
        {model.live && !draft ? <span className="hidden text-[12.5px] text-muted sm:inline">Version {model.liveVersion}</span> : null}
        <span className="flex-1" />
        <Segmented label="View" value={view} onChange={setView} options={[{ value: "rules", label: "Rules" }, { value: "results", label: "Results" }]} />
        {owner ? (
          <>
            <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <IconButton label="Undo" onClick={undo} disabled={!hist.past.length}>
              <Undo size={14} />
            </IconButton>
            <IconButton label="Redo" onClick={redo} disabled={!hist.future.length}>
              <Redo size={14} />
            </IconButton>
            <span title={left[0]}>
              <Button size="sm" disabled={!draft || !!left.length} onClick={() => void publish()}>
                Publish
              </Button>
            </span>
          </>
        ) : null}
      </div>
      {error ? (
        <div className="px-4 pt-3 md:px-5">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {view === "rules" ? (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative min-h-0 overflow-y-auto">
            <Flow body={body} res={res} sel={sel} setSel={setSel} edit={owner ? edit : undefined} words={words} />
          </div>
          <aside className="min-h-0 overflow-y-auto border-t border-line bg-card lg:border-t-0 lg:border-l">
            <Inspector body={body} sel={sel} setSel={setSel} edit={edit} owner={owner} data={data} res={res} words={words} onFit={() => void fitCapacity()} />
          </aside>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ResultsView body={body} res={res} edit={owner ? edit : undefined} onFit={owner ? () => void fitCapacity() : undefined} />
        </div>
      )}
      {owner ? (
        <div className="shrink-0 border-t border-line">
          {msgs.length ? (
            <div className="mx-auto flex max-h-[180px] w-full flex-col gap-2.5 overflow-y-auto px-4 pt-3 md:px-8">
              {msgs.length > 1 ? (
                <button type="button" onClick={() => setAllMsgs((v) => !v)} className="self-center text-[12px] text-muted hover:text-ink">
                  {allMsgs ? "Show less" : `Show ${msgs.length - 1} earlier`}
                </button>
              ) : null}
              {shown.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-ink px-3 py-1.5 text-[13px] text-paper">{m.text}</div>
                ) : (
                  <div key={i} className="anim-rise-sm flex gap-2.5">
                    <AiAvatar size={24} />
                    <div className="min-w-0 pt-0.5 text-[13px] text-ink">
                      <p>{m.text}</p>
                      {m.lines?.length ? (
                        <ul className="mt-1 flex flex-col gap-0.5 border-l border-line pl-3 text-[12.5px] text-muted">
                          {m.lines.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
              {busy ? (
                <div className="flex items-center gap-2.5">
                  <AiAvatar size={24} working />
                </div>
              ) : null}
            </div>
          ) : null}
          <AskDock wide busy={busy} placeholder="Ask the assistant to change the model" onSend={(t) => void send(t)} />
        </div>
      ) : null}
    </div>
  );
}

/* ---------- The flowchart ---------- */

type Edit = ((fn: (b: ScoreBody) => void) => void) | undefined;
type Words = Parameters<typeof ruleWords>[1];

/** A centered arrow down to the next card. */
function Arrow() {
  return (
    <div className="flex h-6 justify-center" aria-hidden="true">
      <svg width="12" height="24" viewBox="0 0 12 24" className="overflow-visible">
        <path d="M6 0V20M3 17l3 3 3-3" stroke="var(--color-line-strong)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * The lines where the flow splits into its two columns, or joins again. Drawn by the same grid as the columns, so
 * each line meets the center of its column at any width.
 */
function Branch({ join = false }: { join?: boolean }) {
  const line = "absolute bg-line-strong";
  return (
    <div className="relative hidden h-7 grid-cols-[340px_340px] gap-8 xl:grid" aria-hidden="true">
      <span className={`${line} left-1/2 w-[1.5px] -translate-x-1/2 ${join ? "top-1/2 bottom-0" : "top-0 h-1/2"}`} />
      {[0, 1].map((i) => (
        <span key={i} className="relative">
          <span className={`${line} left-1/2 w-[1.5px] -translate-x-1/2 ${join ? "top-0 h-1/2" : "top-1/2 bottom-0"}`} />
          <span className={`${line} top-1/2 h-[1.5px] -translate-y-1/2 ${i === 0 ? "left-1/2 -right-4" : "right-1/2 -left-4"}`} />
        </span>
      ))}
    </div>
  );
}

function Flow({ body, res, sel, setSel, edit, words }: { body: ScoreBody; res: Results | null; sel: Sel; setSel: (s: Sel) => void; edit: Edit; words: Words }) {
  const s = res?.stats;
  const ends: [keyof typeof BAND, string][] =
    body.style === "grades"
      ? [["hot", body.mql.join(", ") || "No grades picked"], ["warm", "Grade A or B, or level 1 or 2"], ["cold", "Everyone else"]]
      : [["hot", `${body.ready} points or more`], ["warm", `${body.warm} to ${body.ready - 1} points`], ["cold", `Under ${body.warm} points`]];
  const addGroup = (side: "fit" | "act") => {
    const id = newId("g");
    edit?.((b) => b.groups.push({ id, name: side === "fit" ? "New fit group" : "New activity group", side, max: 20, rules: [] }));
    setSel({ kind: "group", id });
  };
  const column = (side: "fit" | "act") => (
    <div className="flex min-w-0 flex-col">
      <span className="flex h-6 items-center justify-center font-mono text-[11px] tracking-[0.06em] text-muted uppercase">{side === "fit" ? "Fit" : "Activity"}</span>
      {body.groups.filter((g) => g.side === side).map((g) => (
        <div key={g.id} className="flex flex-col">
          <Arrow />
          <GroupCard g={g} sel={sel} setSel={setSel} edit={edit} words={words} />
        </div>
      ))}
      {edit ? (
        <>
          <Arrow />
          <button type="button" onClick={() => addGroup(side)} className="press inline-flex h-7 items-center gap-1 self-center rounded-full border border-line bg-card px-3 text-[12px] text-body hover:border-line-strong hover:text-ink">
            <Plus size={12} />
            Add group
          </button>
        </>
      ) : null}
    </div>
  );
  return (
    <div className="relative min-h-full">
      <DotCanvas />
      <div className="relative flex flex-col items-center px-4 py-7 md:px-6">
        <button type="button" onClick={() => setSel({ kind: "model" })} className={`flex h-[34px] items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper ${sel.kind === "model" ? "outline-2 outline-offset-[3px] outline-ink" : ""}`}>
          New lead
        </button>
        <Branch />
        <div className="grid w-full max-w-[340px] gap-y-2 xl:max-w-none xl:w-auto xl:grid-cols-[340px_340px] xl:gap-x-8">
          <div className="flex flex-col">
            <span className="xl:hidden">
              <Arrow />
            </span>
            {column("fit")}
          </div>
          <div className="flex flex-col">
            <span className="xl:hidden">
              <Arrow />
            </span>
            {column("act")}
          </div>
        </div>
        <Branch join />
        <div className="w-full max-w-[420px]">
          <Arrow />
          <GroupCard g={{ id: "minus", name: "Points taken away", side: "fit", max: 0, rules: body.minus }} sel={sel} setSel={setSel} edit={edit} words={words} minus />
        </div>
        <Arrow />
        <div className="grid w-full max-w-[560px] gap-2.5 sm:grid-cols-3">
          {ends.map(([band, d]) => (
            <button key={band} type="button" onClick={() => setSel({ kind: "model" })} className={`flex flex-col gap-0.5 rounded-[10px] border bg-card px-3 py-2.5 text-left ${band === "hot" ? "border-signal" : "border-line"}`}>
              <b className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                <span className={`size-[7px] rounded-full ${band === "hot" ? "bg-signal" : band === "warm" ? "bg-butter" : "bg-line-strong"}`} />
                {BAND[band].label}
              </b>
              <span className="text-[12px] text-muted">{d}</span>
              {s ? <span className="text-[12px] text-muted tabular-nums">{s.bands[band].toLocaleString("en-US")} past leads</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupCard({ g, sel, setSel, edit, words, minus = false }: { g: ScoreGroup; sel: Sel; setSel: (s: Sel) => void; edit: Edit; words: Words; minus?: boolean }) {
  const add = () => {
    const id = newId("r");
    const field = minus ? "contact.email_class" : g.side === "fit" ? "company.industry" : "event.page";
    const r: ScoreRule = { id, match: "all", conds: [{ field, op: minus ? "one_of" : g.side === "fit" ? "one_of" : "contains", value: [] }], points: minus ? -10 : 10, count: "once", cap: 3, fade: "model", on: true };
    edit?.((b) => (minus ? b.minus.push(r) : b.groups.find((x) => x.id === g.id)!.rules.push(r)));
    setSel({ kind: "rule", id });
  };
  const on = sel.kind === "group" && sel.id === g.id;
  return (
    <div className={`w-full rounded-[14px] border bg-card transition-colors duration-[120ms] ${on ? "border-ink" : "border-line hover:border-line-strong"}`}>
      <button type="button" onClick={() => !minus && setSel({ kind: "group", id: g.id })} className="flex w-full items-center gap-2 px-3 pt-2.5 pb-1.5 text-left">
        <b className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{g.name}</b>
        {!minus ? <span className="text-[11.5px] whitespace-nowrap text-muted tabular-nums">max {g.max}</span> : null}
      </button>
      {g.rules.map((r) => {
        const note = ruleNote(r);
        return (
          <button key={r.id} type="button" onClick={() => setSel({ kind: "rule", id: r.id })} className={`mx-1.5 flex min-h-8 w-[calc(100%-12px)] items-center gap-2 rounded-[8px] px-1.5 text-left text-[13px] transition-colors duration-[120ms] ${sel.kind === "rule" && sel.id === r.id ? "bg-hover" : "hover:bg-hover"}`}>
            <span className={`min-w-0 flex-1 truncate ${r.on ? "text-ink" : "text-faint line-through"}`}>{ruleWords(r, words)}</span>
            {note ? <span className="hidden text-[10.5px] whitespace-nowrap text-faint sm:inline">{note}</span> : null}
            <Points r={r} />
          </button>
        );
      })}
      {edit ? (
        <button type="button" onClick={add} className="press mx-1.5 mt-0.5 mb-2 inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover">
          <Plus size={12} />
          Add rule
        </button>
      ) : (
        <div className="h-2" />
      )}
    </div>
  );
}

/* ---------- The side panel ---------- */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-[13px] text-ink">
      <span className="min-w-0">{label}</span>
      {children}
    </div>
  );
}
function Block({ title, children, last = false }: { title?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex flex-col gap-2 px-5 py-4 ${last ? "" : "border-b border-line"}`}>
      {title ? <span className="text-[12px] text-muted">{title}</span> : null}
      {children}
    </div>
  );
}
function Stepper({ value, onChange, step = 1, min, max, unit = "", label }: { value: number; onChange: (v: number) => void; step?: number; min: number; max: number; unit?: string; label: string }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <span className="flex items-center gap-1">
      <IconButton label={`Lower ${label}`} onClick={() => set(value - step)} disabled={value <= min}>
        <Minus size={13} />
      </IconButton>
      <span className="min-w-[60px] text-center font-mono text-[13px] tabular-nums">
        {value}
        {unit}
      </span>
      <IconButton label={`Raise ${label}`} onClick={() => set(value + step)} disabled={value >= max}>
        <Plus size={13} />
      </IconButton>
    </span>
  );
}

function Inspector({ body, sel, setSel, edit, owner, data, res, words, onFit }: { body: ScoreBody; sel: Sel; setSel: (s: Sel) => void; edit: (fn: (b: ScoreBody) => void) => void; owner: boolean; data: Loaded; res: Results | null; words: Words; onFit: () => void }) {
  if (sel.kind === "rule") {
    const inGroup = body.groups.find((g) => g.rules.some((r) => r.id === sel.id));
    const r = inGroup?.rules.find((x) => x.id === sel.id) ?? body.minus.find((x) => x.id === sel.id);
    if (r) return <RuleEditor r={r} group={inGroup ?? null} edit={edit} owner={owner} data={data} words={words} stat={res?.rules[r.id]} base={res?.stats.base} back={() => setSel({ kind: "model" })} onDelete={() => setSel({ kind: "model" })} onDuplicate={(id) => setSel({ kind: "rule", id })} />;
  }
  if (sel.kind === "group") {
    const g = body.groups.find((x) => x.id === sel.id);
    if (g)
      return (
        <div className="flex flex-col">
          <Crumb back={() => setSel({ kind: "model" })} title="Group" />
          <Block>
            <label className="text-[12px] text-muted" htmlFor="sc-gname">
              Name
            </label>
            <Input id="sc-gname" value={g.name} disabled={!owner} onChange={(e) => edit((b) => (b.groups.find((x) => x.id === g.id)!.name = e.target.value.slice(0, 60) || "Group"))} />
          </Block>
          <Block>
            <Row label="Most points from this group">
              <Stepper label="most points" value={g.max} step={5} min={5} max={100} onChange={(v) => edit((b) => (b.groups.find((x) => x.id === g.id)!.max = v))} />
            </Row>
            <Row label="Counts toward">
              <Segmented label="Counts toward" value={g.side} onChange={(v) => edit((b) => (b.groups.find((x) => x.id === g.id)!.side = v))} options={[{ value: "fit", label: "Fit" }, { value: "act", label: "Activity" }]} />
            </Row>
          </Block>
          {owner ? (
            <Block last>
              <Button
                variant="danger"
                size="sm"
                className="self-start"
                onClick={async () => {
                  if (!(await askConfirm(`Delete ${g.name}?`, { body: `Its ${g.rules.length} rules are deleted too.`, ok: "Delete", danger: true }))) return;
                  edit((b) => (b.groups = b.groups.filter((x) => x.id !== g.id)));
                  setSel({ kind: "model" });
                }}
              >
                <Trash size={13} />
                Delete group
              </Button>
            </Block>
          ) : null}
        </div>
      );
  }
  return (
    <div className="flex flex-col">
      <div className="flex h-12 items-center border-b border-line px-5 text-[13px] font-medium text-ink">Model settings</div>
      <Block title="Grading">
        <Segmented label="Grading" value={body.style} onChange={(v) => edit((b) => (b.style = v))} options={[{ value: "grades", label: "Grade A1 to D4" }, { value: "points", label: "Score 0 to 100" }]} />
        {body.style === "points" ? (
          <>
            <Row label="Sales-ready at">
              <Stepper label="sales-ready cut-off" value={body.ready} step={5} min={Math.min(100, body.warm + 1)} max={100} onChange={(v) => edit((b) => (b.ready = v))} />
            </Row>
            <Row label="Warming up at">
              <Stepper label="warming up cut-off" value={body.warm} step={5} min={1} max={body.ready - 1} onChange={(v) => edit((b) => (b.warm = v))} />
            </Row>
          </>
        ) : (
          <Row label="Sales-ready grades">
            <span className="font-mono text-[12px] text-ink">{body.mql.join(", ") || "None"}</span>
          </Row>
        )}
      </Block>
      <Block title="Timing">
        <Row label="Activity points halve every">
          <Stepper label="fade time" value={body.halfLife} step={7} min={7} max={182} unit=" days" onChange={(v) => edit((b) => (b.halfLife = v))} />
        </Row>
        <Row label="Start over after no activity for">
          <Stepper label="start over time" value={body.reset} step={30} min={30} max={720} unit=" days" onChange={(v) => edit((b) => (b.reset = v))} />
        </Row>
      </Block>
      <Block title="Capacity" last>
        <Row label="Sales-ready leads a week">
          <Stepper label="capacity" value={body.capacity} step={5} min={5} max={5000} onChange={(v) => edit((b) => (b.capacity = v))} />
        </Row>
        {res ? <span className="text-[12.5px] text-muted">Past leads give about {res.stats.perWeek} a week.</span> : null}
        {owner ? (
          <Button variant="ghost" size="sm" className="self-start" onClick={onFit}>
            <AiMark size={13} />
            Match the cut-off to this
          </Button>
        ) : null}
      </Block>
    </div>
  );
}

function Crumb({ back, title, right }: { back: () => void; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-1.5 border-b border-line px-3 text-[13px]">
      <IconButton label="Back to model settings" onClick={back}>
        <ChevronRight size={14} className="rotate-180" />
      </IconButton>
      <span className="min-w-0 flex-1 truncate text-muted">{title}</span>
      {right}
    </div>
  );
}

const OP_WORDS: Record<Op, string> = { is: "is", is_not: "is not", one_of: "is any of", not_one_of: "is none of", contains: "contains", starts_with: "starts with", filled: "has a value", empty: "has no value", gt: "is more than", gte: "is at least", lt: "is less than", lte: "is at most", between: "is between" };

function RuleEditor({ r, group, edit, owner, data, words, stat, base, back, onDelete, onDuplicate }: { r: ScoreRule; group: ScoreGroup | null; edit: (fn: (b: ScoreBody) => void) => void; owner: boolean; data: Loaded; words: Words; stat?: { n: number; rate: number }; base?: number; back: () => void; onDelete: () => void; onDuplicate: (id: string) => void }) {
  const set = (fn: (x: ScoreRule) => void) => edit((b) => { const x = [...b.groups.flatMap((g) => g.rules), ...b.minus].find((y) => y.id === r.id); if (x) fn(x); });
  const events = r.conds.some((c) => isEventField(c.field));
  const side = group?.side ?? "both";
  const fieldOptions = [
    ...(side !== "act" ? data.fields.map((f) => ({ value: f.key, label: f.label })) : []),
    ...(side !== "fit" ? EVENT_FIELDS.map((f) => ({ value: f.key, label: f.label })) : []),
  ];
  const kind = r.remove ? "remove" : r.points < 0 ? "take" : "add";
  return (
    <div className="flex flex-col">
      <Crumb back={back} title={group?.name ?? "Points taken away"} right={owner ? <Toggle label="Rule on" on={r.on} onChange={(v) => set((x) => (x.on = v))} /> : null} />
      <div className="px-5 pt-4 pb-1 text-[15px] font-semibold tracking-[-0.01em] text-balance text-ink">{ruleWords(r, words)}</div>
      <Block>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted">If</span>
          {r.conds.length > 1 ? <Segmented label="Match" value={r.match} onChange={(v) => set((x) => (x.match = v))} options={[{ value: "all", label: "All match" }, { value: "any", label: "Any match" }]} /> : null}
        </div>
        {r.conds.map((c, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            {i ? <span className="font-mono text-[11px] text-muted">{r.match === "all" ? "and" : "or"}</span> : null}
            <CondEditor c={c} fieldOptions={fieldOptions} fields={data.fields} forms={data.forms} disabled={!owner} onChange={(nc) => set((x) => { x.conds[i] = nc; delete x.name; })} onRemove={() => set((x) => { x.conds.splice(i, 1); delete x.name; })} />
          </div>
        ))}
        {owner ? (
          <button type="button" onClick={() => set((x) => { x.conds.push({ field: fieldOptions[0]!.value, op: opsForField(fieldOptions[0]!.value, data.fields)[0]!, value: [] }); delete x.name; })} className="press inline-flex h-7 items-center gap-1 self-start rounded-full px-2 text-[12.5px] font-medium text-ink hover:bg-hover">
            <Plus size={12} />
            Add condition
          </button>
        ) : null}
      </Block>
      <Block>
        <span className="text-[12px] text-muted">Then</span>
        <Segmented label="Then" value={kind} onChange={(v) => set((x) => { const n = Math.abs(x.points) || 10; x.remove = v === "remove" ? true : undefined; if (v === "add") x.points = n; if (v === "take") x.points = -n; })} options={[{ value: "add", label: "Add points" }, { value: "take", label: "Take away" }, { value: "remove", label: "Remove lead" }]} />
        {r.remove ? null : (
          <Row label="Points">
            <Stepper label="points" value={Math.abs(r.points)} step={Math.abs(r.points) >= 10 ? 5 : 1} min={1} max={100} onChange={(v) => set((x) => (x.points = x.points < 0 ? -v : v))} />
          </Row>
        )}
        {events && !r.remove ? (
          <>
            <Row label="Count it">
              <Segmented label="Count it" value={r.count} onChange={(v) => set((x) => (x.count = v))} options={[{ value: "once", label: "Once" }, { value: "each", label: "Every time" }]} />
            </Row>
            {r.count === "each" ? (
              <Row label="Up to">
                <Stepper label="times" value={r.cap} min={1} max={20} unit="×" onChange={(v) => set((x) => (x.cap = v))} />
              </Row>
            ) : null}
            <Row label="Points fade">
              <span className="w-44">
                <Select<string> ariaLabel="Points fade" value={String(r.fade)} onChange={(v) => set((x) => (x.fade = v === "model" || v === "never" ? v : Number(v)))} options={[{ value: "model", label: "With the model" }, { value: "never", label: "Never" }, ...[7, 14, 30, 60, 90].map((n) => ({ value: String(n), label: `Every ${n} days` }))]} />
              </span>
            </Row>
          </>
        ) : null}
      </Block>
      <Block title="Last 90 days">
        {stat ? (
          <>
            <p className="text-[12.5px] text-body">{stat.n ? `Matched ${stat.n.toLocaleString("en-US")} leads. ${stat.rate}% met sales, against ${base ?? 0}% of all leads.` : "Matched no leads."}</p>
            {stat.n ? (
              <span className="relative block h-1.5 rounded-full bg-paper-deep">
                <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, stat.rate * 2)}%` }} />
                <i className="absolute -top-[3px] block h-3 w-0.5 rounded-full bg-muted" style={{ left: `${Math.min(100, (base ?? 0) * 2)}%` }} />
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-[12.5px] text-muted">Checking</span>
        )}
      </Block>
      {owner ? (
        <Block last>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const id = newId("r");
                edit((b) => { const list = group ? b.groups.find((g) => g.id === group.id)!.rules : b.minus; const i = list.findIndex((x) => x.id === r.id); list.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(r)), id }); });
                onDuplicate(id);
              }}
            >
              <Copy size={13} />
              Duplicate
            </Button>
            <span className="flex-1" />
            <IconButton label="Move up" onClick={() => edit((b) => move(b, r.id, -1))}>
              <ArrowUp size={14} />
            </IconButton>
            <IconButton label="Move down" onClick={() => edit((b) => move(b, r.id, 1))}>
              <ArrowDown size={14} />
            </IconButton>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                edit((b) => { for (const g of b.groups) g.rules = g.rules.filter((x) => x.id !== r.id); b.minus = b.minus.filter((x) => x.id !== r.id); });
                toast({ text: "Rule deleted. Undo brings it back." });
                onDelete();
              }}
            >
              <Trash size={13} />
              Delete
            </Button>
          </div>
        </Block>
      ) : null}
    </div>
  );
}

function move(b: ScoreBody, id: string, d: number) {
  for (const list of [...b.groups.map((g) => g.rules), b.minus]) {
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) continue;
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    return;
  }
}

function CondEditor({ c, fieldOptions, fields, forms, disabled, onChange, onRemove }: { c: Cond; fieldOptions: { value: string; label: string }[]; fields: FieldDef[]; forms: { id: string; name: string }[]; disabled: boolean; onChange: (c: Cond) => void; onRemove: () => void }) {
  const ops = opsForField(c.field, fields);
  const f = fields.find((x) => x.key === c.field);
  const ev = isEventField(c.field);
  const list = Array.isArray(c.value) ? c.value.map(String) : c.value === undefined || c.value === "" ? [] : [String(c.value)];
  const choices = c.field === "event.form" ? forms.map((x) => ({ value: x.id, label: x.name })) : (f?.options ?? []).map((o) => ({ value: o, label: o }));
  const opLabel = (o: Op) => (ev && o === "filled" ? "happened" : ev && o === "one_of" ? "was one of" : OP_WORDS[o]);
  let value: React.ReactNode = null;
  if (needsValue(c.op)) {
    if ((c.op === "one_of" || c.op === "not_one_of") && choices.length) value = <ChoicePicker value={list} options={choices} disabled={disabled} onChange={(v) => onChange({ ...c, value: v })} />;
    else if (c.op === "between")
      value = (
        <span className="flex items-center gap-1.5">
          <Input aria-label="From" type="number" value={list[0] ?? ""} disabled={disabled} onChange={(e) => onChange({ ...c, value: [Number(e.target.value), Number(list[1] ?? 0)] })} />
          <span className="text-[12px] text-muted">to</span>
          <Input aria-label="To" type="number" value={list[1] ?? ""} disabled={disabled} onChange={(e) => onChange({ ...c, value: [Number(list[0] ?? 0), Number(e.target.value)] })} />
        </span>
      );
    else if (c.op === "gt" || c.op === "lt" || ((c.op === "is" || c.op === "is_not") && f?.type === "number")) value = <Input aria-label="Value" type="number" value={list[0] ?? ""} disabled={disabled} onChange={(e) => onChange({ ...c, value: Number(e.target.value) })} />;
    else
      value = <Input aria-label="Values" placeholder={c.field.endsWith("country") ? "US, GB, DE" : "Separate with commas"} value={list.join(", ")} disabled={disabled} onChange={(e) => onChange({ ...c, value: c.op === "is" || c.op === "is_not" ? e.target.value : e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />;
  }
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-line p-2">
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_32px] items-center gap-1.5">
        <Select<string> ariaLabel="Field" value={c.field} disabled={disabled} options={fieldOptions} onChange={(k) => onChange({ field: k, op: opsForField(k, fields)[0]!, value: [] })} />
        {ops.length > 1 ? <Select<Op> ariaLabel="Test" value={c.op} disabled={disabled} options={ops.map((o) => ({ value: o, label: opLabel(o) }))} onChange={(op) => onChange({ ...c, op, value: needsValue(op) ? c.value : undefined })} /> : <span className="pl-1 text-[12.5px] text-muted">{opLabel(c.op)}</span>}
        {disabled ? null : (
          <IconButton label="Remove condition" onClick={onRemove}>
            <X size={13} />
          </IconButton>
        )}
      </div>
      {value}
    </div>
  );
}

function ChoicePicker({ value, options, onChange, disabled }: { value: string[]; options: { value: string; label: string }[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((v) => (
        <span key={v} className="inline-flex h-6 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2 text-[12px] text-ink">
          {label(v)}
          {disabled ? null : (
            <button type="button" aria-label={`Remove ${label(v)}`} onClick={() => onChange(value.filter((x) => x !== v))} className="flex size-4 items-center justify-center rounded-full text-muted hover:text-ink">
              <X size={10} />
            </button>
          )}
        </span>
      ))}
      {disabled ? null : (
        <button type="button" onClick={(e) => setAnchor(e.currentTarget)} className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-[12px] text-muted hover:border-ink hover:text-ink">
          <Plus size={10} />
          {value.length ? "Add" : "Pick values"}
        </button>
      )}
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <ul className="max-h-64 overflow-y-auto p-1">
            {options.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])} className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left text-[13px] text-ink hover:bg-hover">
                    <span className={`flex size-4 items-center justify-center rounded-[4px] border ${on ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>{on ? <Check size={11} /> : null}</span>
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}

/* ---------- Results ---------- */

function ResultsView({ body, res, edit, onFit }: { body: ScoreBody; res: Results | null; edit: Edit; onFit?: () => void }) {
  if (!res) return <div className="p-6 text-[13px] text-muted">Scoring past leads</div>;
  const s = res.stats;
  const capPct = Math.min(100, (s.perWeek / Math.max(1, body.capacity)) * 100);
  return (
    <div className="mx-auto flex max-w-[980px] flex-col gap-4 px-4 py-6 md:px-6">
      <div>
        <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-ink">Results on past leads</h2>
        <p className="text-[12.5px] text-muted">{s.total.toLocaleString("en-US")} leads from the last {s.days} days, each scored as it was before it met sales</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h3 className="text-[13px] font-semibold text-ink">{body.style === "grades" ? "Grades" : "Cut-offs"}</h3>
            {body.style === "grades" && edit ? <span className="text-[12px] text-muted">Click a grade to make it sales-ready</span> : null}
          </div>
          {body.style === "grades" ? (
            <div className="grid grid-cols-[18px_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-1.5">
              <span className="col-start-2 text-center text-[11px] text-muted">Activity level</span>
              <span className="row-start-2 rotate-180 text-center text-[11px] text-muted [writing-mode:vertical-rl]">Fit grade</span>
              <div className="col-start-2 row-start-2 grid grid-cols-[28px_repeat(4,minmax(0,1fr))] gap-1">
                <span />
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="text-center font-mono text-[11px] text-muted">{n}</span>
                ))}
                {["A", "B", "C", "D"].map((L) => (
                  <Fragment4 key={L} L={L} body={body} s={s} edit={edit} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <Row label="Sales-ready at">
                <Stepper label="sales-ready cut-off" value={body.ready} step={5} min={Math.min(100, body.warm + 1)} max={100} onChange={(v) => edit?.((b) => (b.ready = v))} />
              </Row>
              <Row label="Warming up at">
                <Stepper label="warming up cut-off" value={body.warm} step={5} min={1} max={body.ready - 1} onChange={(v) => edit?.((b) => (b.warm = v))} />
              </Row>
            </>
          )}
        </section>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Sales-ready leads a week</h3>
            <div className="flex items-baseline gap-2.5">
              <b className="text-[32px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{s.perWeek}</b>
              <span className="text-[12.5px] text-muted">Your team can take {body.capacity}</span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-paper-deep">
              <span className={`block h-full rounded-full ${s.perWeek > body.capacity ? "bg-butter" : "bg-signal"}`} style={{ width: `${capPct}%` }} />
            </span>
            {onFit ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={onFit}>
                <AiMark size={13} />
                Match my team&apos;s capacity
              </Button>
            ) : null}
          </section>
          <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4">
            <h3 className="text-[13px] font-semibold text-ink">Leads that met sales</h3>
            <div className="flex items-baseline gap-2.5">
              <b className="text-[32px] font-semibold tracking-[-0.02em] text-ink tabular-nums">{s.caught}%</b>
              <span className="text-[12.5px] text-muted">were sales-ready first</span>
            </div>
          </section>
        </div>
      </div>
      <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-card p-4">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h3 className="text-[13px] font-semibold text-ink">By status</h3>
          <span className="text-[12px] text-muted">Leads, and how often they met sales</span>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {(["hot", "warm", "cold", "out"] as const).map((k) => (
              <tr key={k} className="border-t border-line">
                <td className="py-2 text-ink">
                  <span className={`mr-2 inline-block size-2 rounded-full ${k === "hot" ? "bg-signal" : k === "warm" ? "bg-butter" : k === "out" ? "bg-rose" : "bg-line-strong"}`} />
                  {BAND[k].label}
                </td>
                <td className="py-2 pl-3 text-right text-ink tabular-nums">{s.bands[k].toLocaleString("en-US")}</td>
                <td className="w-[45%] py-2 pl-4">
                  <span className="block h-2 overflow-hidden rounded-full bg-paper-deep">
                    <span className={`block h-full rounded-full ${k === "hot" ? "bg-signal" : k === "warm" ? "bg-butter" : k === "out" ? "bg-rose" : "bg-line-strong"}`} style={{ width: `${s.total ? (s.bands[k] / s.total) * 100 : 0}%` }} />
                  </span>
                </td>
                <td className="py-2 pl-3 text-right whitespace-nowrap text-muted tabular-nums">{rate(s, k)}% met</td>
              </tr>
            ))}
          </tbody>
        </table>
        {res.moved !== null ? <p className="text-[12.5px] text-muted">{res.moved.toLocaleString("en-US")} past leads would change status compared to the live version.</p> : null}
      </section>
    </div>
  );
}

function Fragment4({ L, body, s, edit }: { L: string; body: ScoreBody; s: Results["stats"]; edit: Edit }) {
  return (
    <>
      <span className="flex items-center justify-center font-mono text-[11px] text-muted">{L}</span>
      {[1, 2, 3, 4].map((n) => {
        const k = `${L}${n}` as (typeof GRADES)[number];
        const c = s.cells[k] ?? { n: 0, met: 0 };
        const on = body.mql.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            disabled={!edit}
            onClick={() => edit?.((b) => (b.mql = on ? b.mql.filter((x) => x !== k) : [...b.mql, k]))}
            className={`flex h-14 flex-col items-center justify-center rounded-[8px] border transition-colors duration-[120ms] ${on ? "border-signal bg-signal-soft" : "border-line bg-card hover:border-line-strong"}`}
          >
            <b className={`font-mono text-[12px] font-medium ${on ? "text-signal-text" : "text-ink"}`}>{k}</b>
            <small className="text-[11px] text-muted tabular-nums">{c.n} leads</small>
            <small className="text-[11px] text-muted tabular-nums">{c.n ? Math.round((c.met / c.n) * 100) : 0}% met</small>
          </button>
        );
      })}
    </>
  );
}
