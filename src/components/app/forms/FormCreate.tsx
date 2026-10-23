"use client";

// A new form (docs/form-studio.md Part 1): a chat asks five questions, one at a time, each answered with a click and
// each with a good answer already picked, so Enter goes straight through. A typed sentence fills in what it can and
// skips those questions. It ends on a one-line summary and Create form, which opens the form on its Design tab.
// Templates and Start blank are the other two ways in.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import {
  afterProblem,
  buildForm,
  defaults,
  fillFrom,
  formName,
  GOAL_CHOICES,
  GOALS,
  PICKS,
  QUESTIONS,
  readQuestion,
  readSentence,
  summaryLine,
  togglePick,
  withGoal,
  type After,
  type Answers,
  type Copy,
  type Extra,
  type Goal,
  type QuestionId,
} from "@/lib/forms/interview";
import { SCHEDULERS, type SchedulerTool } from "@/lib/forms/schedule";
import { emptyForm, type Form } from "@/lib/forms/schema";
import { TEMPLATES } from "@/lib/forms/templates";
import { CATALOG, entryOf } from "@/lib/sources/catalog";
import { ArrowLeft, ArrowUp, Check, Inbox, Lock, Plus, Undo } from "../../Icons";
import { AiAvatar } from "../Ai";
import { BrandLogo } from "../BrandLogo";
import { Button, ErrorNote, errorText, Input, Loading, must, Page, postJson, useLoad, type ViewProps } from "../ui";
import { FormPreview, type Kit } from "./shared";

type Tool = { id: string; kind: string; name: string };
const PUSHES = new Set(CATALOG.filter((e) => e.twoWay || e.pushes).map((e) => e.kind));
const hostOf = (u: string) => {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

export function FormCreate(props: ViewProps & { embedded?: boolean }) {
  const { sb, ws } = props;
  const data = useLoad(async () => {
    const [sources, sites, kits] = await Promise.all([
      sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name"),
      sb.from("sites").select("domain").eq("workspace_id", ws.id).order("created_at").limit(1),
      sb.from("brand_kits").select("id, name, tokens, logo_url, notes, source_url, scan_status, scan_error, scanned_at").eq("workspace_id", ws.id).order("updated_at", { ascending: false }),
    ]);
    const tools = ((must(sources) ?? []) as (Tool & { status: string })[]).filter((s) => s.status !== "disconnected" && PUSHES.has(s.kind));
    return { tools, site: ((sites.data ?? []) as { domain: string }[])[0]?.domain ?? "", kits: (must(kits) ?? []) as Kit[] };
  }, ws.id);
  const body = data.error && !data.data ? <ErrorNote message={data.error} /> : !data.data ? <Loading /> : <Create {...props} tools={data.data.tools} site={data.data.site} kits={data.data.kits} />;
  if (props.embedded) return body;
  return (
    <Page icon={<Inbox size={14} />} title="New form" back={{ label: "Forms", onClick: () => props.navigate("forms") }} flush>
      {body}
    </Page>
  );
}

/** The site's look: a finished kit for the site is used as is, otherwise a scan starts and the form switches when it lands. */
function useBrand({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">, firstSite: string, kits: Kit[]) {
  const pick = (host: string) => kits.find((k) => k.source_url && hostOf(k.source_url) === host && k.scan_status === "done") ?? null;
  const [site, setSiteState] = useState(firstSite);
  const [kit, setKit] = useState<Kit | null>(() => (firstSite ? pick(hostOf(firstSite)) : null) ?? kits.find((k) => k.scan_status === "done") ?? null);
  const [error, setError] = useState("");
  const started = useRef(false);
  const scan = useCallback(
    async (url: string) => {
      setError("");
      const host = hostOf(url);
      if (!host) return setError("Enter your site's address, like acme.com.");
      setSiteState(host);
      const have = pick(host);
      if (have) return setKit(have);
      try {
        const r = await postJson<{ kitId: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: host });
        setKit({ id: r.kitId, name: host, tokens: kit?.tokens ?? {}, logo_url: null, notes: [], source_url: `https://${host}`, scan_status: "scanning", scan_error: null, scanned_at: null });
      } catch (e) {
        setError(errorText(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, ws.id, kits, kit?.tokens],
  );
  useEffect(() => {
    if (started.current || !firstSite || (kit && kit.source_url && hostOf(kit.source_url) === hostOf(firstSite))) return;
    started.current = true;
    void scan(firstSite);
  }, [firstSite, kit, scan]);
  // While the scan runs, look every 2 seconds; the form takes the new look when it lands.
  useEffect(() => {
    if (kit?.scan_status !== "scanning") return;
    const id = kit.id;
    const t = setInterval(async () => {
      const { data } = await sb.from("brand_kits").select("id, name, tokens, logo_url, notes, source_url, scan_status, scan_error, scanned_at").eq("id", id).maybeSingle();
      if (data && (data as Kit).scan_status !== "scanning") setKit(data as Kit);
    }, 2000);
    return () => clearInterval(t);
  }, [sb, kit?.id, kit?.scan_status]);
  return { site, kit, tokens: (kit?.tokens ?? {}) as Partial<Tokens>, scan, error };
}

const ORDER = QUESTIONS.map((q) => q.id);
type Current = QuestionId | "done";

function Create({ sb, session, ws, navigate, tools, site: firstSite, kits }: ViewProps & { tools: Tool[]; site: string; kits: Kit[] }) {
  const brand = useBrand({ sb, session, ws }, firstSite, kits);
  const [templates, setTemplates] = useState(false);
  // Every connected tool gets the leads unless unticked.
  const [answers, setAnswers] = useState<Answers>(() => ({ ...defaults("demo"), send: { sources: tools.map((t) => t.id), slack: "", webhook: "" } }));
  const [settled, setSettled] = useState<Set<QuestionId>>(new Set());
  const [current, setCurrent] = useState<Current>("goal");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /** Make the form, add where its leads go, and open it on its Design tab. */
  const create = async (name: string, form: Form, o: { sources?: string[]; slack?: string } = {}) => {
    setError("");
    const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: name, p_draft: form, p_brand_kit: brand.kit?.id ?? null, p_kind: "built" })) as string;
    const notes: string[] = [];
    for (const s of o.sources ?? []) {
      const t = tools.find((x) => x.id === s);
      await postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "source", sourceId: s, name: t?.name ?? "Tool" }).catch((e) => notes.push(`${t?.name ?? "A tool"}: ${errorText(e)}`));
    }
    if (o.slack) await postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "slack", url: o.slack, name: "Slack" }).catch((e) => notes.push(`Slack: ${errorText(e)}`));
    try {
      if (notes.length) sessionStorage.setItem(`claritia:form-note:${id}`, notes.join(" "));
    } catch {}
    navigate("forms", id, "tab=design");
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  };

  const finish = () =>
    run("words", async () => {
      // The words in the site's voice, if the model answers within 12 seconds; the form is whole without them.
      const copy = await Promise.race([
        postJson<{ copy: Copy }>(session, "/api/forms/interview", { workspaceId: ws.id, mode: "copy", answers, site: brand.site })
          .then((r) => r.copy)
          .catch(() => ({})),
        new Promise<Copy>((r) => setTimeout(() => r({}), 12_000)),
      ]);
      setBusy("create");
      await create(formName(answers), buildForm(answers, copy), { sources: answers.send.sources, slack: answers.send.slack.trim() || undefined });
    });

  if (templates)
    return (
      <Templates
        tokens={brand.tokens}
        back={() => {
          setError("");
          setTemplates(false);
        }}
        busy={busy}
        error={error}
        pick={(name, form) => run(name, () => create(name, form))}
      />
    );
  return (
    <Ask
      answers={answers}
      setAnswers={setAnswers}
      settled={settled}
      setSettled={setSettled}
      current={current}
      setCurrent={setCurrent}
      tools={tools}
      busy={busy}
      error={error}
      finish={finish}
      onTemplates={() => {
        setError("");
        setTemplates(true);
      }}
      onBlank={() => run("blank", () => create("Untitled form", emptyForm()))}
    />
  );
}

// The chat ------------------------------------------------------------------------------------------------------

/** What the open question does with the keys: 1 to 9 pick, Enter continues. */
type Act = { count: number; pick: (i: number) => void; next: () => void };
type ActRef = React.RefObject<Act | null>;
function useAct(actRef: ActRef, a: Act) {
  useEffect(() => {
    actRef.current = a;
  });
}

const COLLECT = PICKS.filter((p) => p.group === "collect");
const QUALIFY = PICKS.filter((p) => p.group === "qualify");
const AFTERS: { kind: After["kind"]; label: string }[] = [
  { kind: "message", label: "Show a message" },
  { kind: "redirect", label: "Go to a page" },
  { kind: "meeting", label: "Book a meeting" },
];
const TYPE: Record<Extra["type"], string> = { text: "Short answer", textarea: "Long answer", choice: "Pick one", multi: "Pick many", number: "Number", date: "Date", url: "Link", checkbox: "Checkbox" };

/** Your answer to a question, as the bubble shows it. */
function said(q: QuestionId, a: Answers, tools: Tool[]): string {
  switch (q) {
    case "goal":
      return GOALS[a.goal].label;
    case "fields":
      return [a.workOnly ? "Work email" : "Email", ...COLLECT.filter((p) => a.fields.some((f) => f.pick === p.value)).map((p) => p.label)].join(", ");
    case "qualify": {
      const list = [...QUALIFY.filter((p) => a.fields.some((f) => f.pick === p.value)).map((p) => p.label), ...a.extra.map((x) => x.label)];
      return list.length ? list.join(", ") : "None";
    }
    case "after": {
      const x = a.after;
      if (x.kind === "message") return "Show a message";
      if (x.kind === "redirect") return `Go to ${hostOf(x.url) || "a page"}`;
      const tool = SCHEDULERS.find((s) => s.value === x.tool);
      return x.tool === "link" || !tool ? "Book a meeting" : `Book a meeting on ${tool.label}`;
    }
    case "send":
      return ["Claritia", ...a.send.sources.map((id) => tools.find((t) => t.id === id)?.name ?? "A tool"), ...(a.send.slack ? ["Slack"] : [])].join(", ");
  }
}

function Ask({
  answers: a,
  setAnswers,
  settled,
  setSettled,
  current,
  setCurrent,
  tools,
  busy,
  error,
  finish,
  onTemplates,
  onBlank,
}: {
  answers: Answers;
  setAnswers: (a: Answers) => void;
  settled: Set<QuestionId>;
  setSettled: (s: Set<QuestionId>) => void;
  current: Current;
  setCurrent: (q: Current) => void;
  tools: Tool[];
  busy: string;
  error: string;
  finish: () => void;
  onTemplates: () => void;
  onBlank: () => void;
}) {
  const act = useRef<Act | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(false);
  // A sentence can change the open question's answers, so its panel starts over.
  const [round, setRound] = useState(0);

  const answer = (q: QuestionId, next: Answers, unsettle: QuestionId[] = []) => {
    setAnswers(next);
    const s = new Set(settled);
    s.add(q);
    for (const u of unsettle) s.delete(u);
    setSettled(s);
    setCurrent(ORDER.slice(ORDER.indexOf(q) + 1).find((x) => !s.has(x)) ?? "done");
  };
  const pickGoal = (g: Goal) => {
    if (g === a.goal) return answer("goal", a);
    // A new goal brings its own contact fields, so that question is asked again; a chosen next step stays.
    const next = withGoal(a, g);
    answer("goal", settled.has("after") ? { ...next, after: a.after } : next, ["fields"]);
  };
  const back = useCallback(() => {
    const i = current === "done" ? ORDER.length : ORDER.indexOf(current);
    if (i > 0) setCurrent(ORDER[i - 1]);
  }, [current, setCurrent]);

  const read = () => {
    const t = text.trim();
    if (!t || busy) return;
    const r = readSentence(t, tools);
    if (!r.settled.length) return setMiss(true);
    const f = fillFrom(a, r.found, [...settled]);
    const s = new Set([...settled, ...f.settled]);
    if (r.found.goal && r.found.goal !== a.goal && !f.settled.includes("fields")) s.delete("fields");
    setAnswers(f.answers);
    setSettled(s);
    setCurrent(ORDER.find((x) => !s.has(x)) ?? "done");
    setRound((n) => n + 1);
    setText("");
    setMiss(false);
  };

  // The open panel says what the keys do; at the end, Enter creates the form.
  useEffect(() => {
    if (current === "done") act.current = { count: 0, pick: () => {}, next: () => !busy && finish() };
  });

  // Keys: 1 to 9 pick, Enter continues, Cmd or Ctrl+Z goes back a step. Text boxes keep their own keys, except the
  // empty composer.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const field = t?.closest?.("input, textarea, [contenteditable]") as HTMLInputElement | null;
      const blank = !!field && field === box.current && !field.value;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
        if (field && !blank) return;
        e.preventDefault();
        back();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || busy || (field && !blank) || e.isComposing) return;
      const now = act.current;
      if (!now) return;
      if (/^[1-9]$/.test(e.key) && Number(e.key) <= now.count) {
        e.preventDefault();
        now.pick(Number(e.key) - 1);
        return;
      }
      // Enter on an option or a check box continues instead of clicking it again; other buttons click.
      if (e.key === "Enter" && !e.shiftKey && !field && (!t?.closest?.("button, a") || t.closest("[data-tile]"))) {
        e.preventDefault();
        now.next();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [back, busy]);

  useEffect(() => box.current?.focus(), []);
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ block: "end", behavior: still ? "auto" : "smooth" });
  }, [current]);

  const panel = (q: QuestionId) => {
    const key = `${q}-${round}`;
    switch (q) {
      case "goal":
        return <GoalPanel key={key} value={a.goal} act={act} pick={pickGoal} />;
      case "fields":
        return <FieldsPanel key={key} a={a} act={act} done={(next) => answer("fields", next)} />;
      case "qualify":
        return <QualifyPanel key={key} a={a} act={act} done={(next) => answer("qualify", next)} />;
      case "after":
        return <AfterPanel key={key} a={a} act={act} done={(next) => answer("after", next)} />;
      case "send":
        return <SendPanel key={key} a={a} tools={tools} act={act} done={(next) => answer("send", next)} />;
    }
  };
  const line = current === "done" ? summaryLine(a, Object.fromEntries(tools.map((t) => [t.id, t.name]))) : "";
  const cut = line.indexOf(": ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-4 pt-10 pb-8 md:pt-14">
          <h2 className="text-center text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-ink">
            What form <span className="text-muted">do you need?</span>
          </h2>
          {QUESTIONS.map((q, i) =>
            q.id === current ? (
              <section key={q.id} aria-label={q.ask} className="anim-rise-sm flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AiAvatar size={28} />
                  <h3 className="min-w-0 flex-1 pt-1 text-[15px] leading-snug font-medium text-ink">{q.ask}</h3>
                  <span className="shrink-0 pt-1.5 text-[12px] text-muted tabular-nums">
                    {i + 1} of {QUESTIONS.length}
                  </span>
                </div>
                <div className="sm:pl-10">{panel(q.id)}</div>
              </section>
            ) : settled.has(q.id) ? (
              <div key={q.id} className="flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <span className="opacity-60">
                    <AiAvatar size={22} />
                  </span>
                  <p className="pt-0.5 text-[13.5px] text-muted">{q.ask}</p>
                </div>
                <button
                  type="button"
                  title="Change"
                  onClick={() => setCurrent(q.id)}
                  className="press group flex max-w-[85%] items-center gap-2 self-end rounded-2xl rounded-br-md border border-transparent bg-paper-deep py-2 pr-3 pl-3.5 text-left text-[13.5px] text-ink transition-colors duration-[140ms] hover:border-line-strong"
                >
                  <span className="min-w-0">{said(q.id, a, tools)}</span>
                  <Undo size={13} className="text-faint transition-colors duration-[140ms] group-hover:text-ink" />
                </button>
              </div>
            ) : null,
          )}
          {current === "done" ? (
            <section aria-label="Your form" className="anim-rise-sm flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <AiAvatar size={28} working={!!busy} />
                <h3 className="pt-1 text-[15px] leading-snug font-medium text-ink">Here&apos;s your form.</h3>
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 sm:ml-10">
                <p className="text-[14.5px] leading-snug">
                  <span className="font-semibold text-ink">{line.slice(0, cut)}</span>
                  <span className="text-muted">: {line.slice(cut + 2)}</span>
                </p>
                <ErrorNote message={error} />
                <div>
                  <Button onClick={finish} disabled={!!busy}>
                    {busy === "words" ? "Writing the words…" : busy === "create" ? "Creating…" : "Create form"}
                  </Button>
                </div>
              </div>
            </section>
          ) : null}
          <div ref={end} />
        </div>
      </div>
      <div className="shrink-0 px-4 pt-2 pb-5">
        <div className="mx-auto flex max-w-[680px] flex-col gap-2.5">
          {current !== "done" ? <ErrorNote message={error} /> : null}
          <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-card py-1.5 pr-1.5 pl-4 transition-colors duration-[140ms] focus-within:border-ink">
            <input
              ref={box}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMiss(false);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (text.trim()) read();
                else if (!busy) act.current?.next();
              }}
              placeholder="Describe it, or answer above"
              aria-label="Describe your form"
              maxLength={500}
              className="h-9 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
            />
            <button type="button" aria-label="Send" title="Send" onClick={read} disabled={!text.trim() || !!busy} className="press flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-opacity duration-[140ms] disabled:opacity-30">
              <ArrowUp size={16} />
            </button>
          </div>
          {miss ? <p className="text-center text-[12.5px] text-muted">Nothing to fill in from that. Pick an answer above.</p> : null}
          <div className="flex justify-center gap-5 text-[12.5px] font-medium">
            <button type="button" onClick={onTemplates} disabled={!!busy} className="text-muted transition-colors duration-[140ms] hover:text-ink disabled:opacity-45">
              Start from a template
            </button>
            <button type="button" onClick={onBlank} disabled={!!busy} className="text-muted transition-colors duration-[140ms] hover:text-ink disabled:opacity-45">
              {busy === "blank" ? "Creating…" : "Start blank"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An option card: picking it answers. The number is its key. */
function OptionCard({ n, label, selected, onClick }: { n: number; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-tile
      aria-pressed={selected}
      onClick={onClick}
      className={`press flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3.5 py-2.5 text-left text-[13.5px] font-medium text-ink transition-[border-color,transform] duration-[140ms] ${selected ? "border-ink ring-1 ring-ink" : "border-line-strong hover:border-ink"}`}
    >
      <span className="min-w-0 flex-1">{label}</span>
      <kbd aria-hidden="true" className={`font-mono text-[11px] ${selected ? "text-ink" : "text-faint"}`}>
        {n}
      </kbd>
    </button>
  );
}

/** A check box row. `locked` ones are always on. */
function CheckTile({ n, label, on, toggle, tag, logo }: { n?: number; label: string; on: boolean; toggle?: () => void; tag?: string; logo?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      data-tile
      disabled={!toggle}
      onClick={toggle}
      className={`press flex min-h-10 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 text-left text-[13.5px] text-ink transition-[border-color,transform] duration-[140ms] disabled:cursor-default ${on ? "border-ink" : "border-line-strong hover:border-ink"}`}
    >
      <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong"}`}>
        {on ? toggle ? <Check size={11} /> : <Lock size={10} /> : null}
      </span>
      {logo}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {tag ? <span className="shrink-0 text-[12px] text-muted">{tag}</span> : null}
      {n ? (
        <kbd aria-hidden="true" className="font-mono text-[11px] text-faint">
          {n}
        </kbd>
      ) : null}
    </button>
  );
}

function Continue({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end">
      <Button type="button" onClick={onClick} disabled={disabled}>
        Continue
      </Button>
    </div>
  );
}

function GoalPanel({ value, act, pick }: { value: Goal; act: ActRef; pick: (g: Goal) => void }) {
  useAct(act, { count: GOAL_CHOICES.length, pick: (i) => pick(GOAL_CHOICES[i]), next: () => pick(value) });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {GOAL_CHOICES.map((g, i) => (
        <OptionCard key={g} n={i + 1} label={GOALS[g].label} selected={value === g} onClick={() => pick(g)} />
      ))}
    </div>
  );
}

function FieldsPanel({ a, act, done }: { a: Answers; act: ActRef; done: (a: Answers) => void }) {
  const [fields, setFields] = useState(a.fields);
  const pick = (i: number) => setFields((f) => togglePick(f, COLLECT[i].value));
  const next = () => done({ ...a, fields });
  useAct(act, { count: COLLECT.length, pick, next });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <CheckTile label={a.workOnly ? "Work email" : "Email"} on tag="Required" />
        {COLLECT.map((p, i) => (
          <CheckTile key={p.value} n={i + 1} label={p.label} on={fields.some((f) => f.pick === p.value)} toggle={() => pick(i)} />
        ))}
      </div>
      <Continue onClick={next} />
    </div>
  );
}

function QualifyPanel({ a, act, done }: { a: Answers; act: ActRef; done: (a: Answers) => void }) {
  const [fields, setFields] = useState(a.fields);
  const [extra, setExtra] = useState(a.extra);
  const [text, setText] = useState("");
  const pick = (i: number) => setFields((f) => togglePick(f, QUALIFY[i].value));
  const next = () => done({ ...a, fields, extra });
  useAct(act, { count: QUALIFY.length, pick, next });
  const add = () => {
    const t = text.trim();
    if (!t) return next();
    if (extra.length >= 10) return;
    setExtra((l) => [...l, readQuestion(t)]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {QUALIFY.map((p, i) => (
          <CheckTile key={p.value} n={i + 1} label={p.label} on={fields.some((f) => f.pick === p.value)} toggle={() => pick(i)} />
        ))}
        {extra.map((x, i) => (
          <CheckTile key={`${x.label}-${i}`} label={x.label} tag={TYPE[x.type]} on toggle={() => setExtra((l) => l.filter((_, j) => j !== i))} />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-1.5"
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Add your own" aria-label="Add your own" disabled={extra.length >= 10} />
        <Button type="submit" variant="ghost" className="h-10" disabled={!text.trim()}>
          Add
        </Button>
      </form>
      <Continue onClick={next} />
    </div>
  );
}

function AfterPanel({ a, act, done }: { a: Answers; act: ActRef; done: (a: Answers) => void }) {
  const [kind, setKind] = useState<After["kind"]>(a.after.kind);
  const [tool, setTool] = useState<SchedulerTool>(a.after.kind === "meeting" ? a.after.tool : "calendly");
  const [meet, setMeet] = useState(a.after.kind === "meeting" ? a.after.url : "");
  const [page, setPage] = useState(a.after.kind === "redirect" ? a.after.url : "");
  const [tried, setTried] = useState(false);
  const value: After = kind === "message" ? { kind: "message" } : kind === "redirect" ? { kind: "redirect", url: page.trim() } : { kind: "meeting", tool, url: meet.trim(), perOwner: !meet.trim() };
  const problem = afterProblem(value);
  const next = () => {
    if (problem) return setTried(true);
    done({ ...a, after: value });
  };
  const choose = (i: number) => {
    const k = AFTERS[i].kind;
    setKind(k);
    setTried(false);
    if (k === "message") done({ ...a, after: { kind: "message" } });
  };
  useAct(act, { count: AFTERS.length, pick: choose, next });
  const url = kind === "redirect" ? page : meet;
  const show = problem && (tried || !!url.trim());
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {AFTERS.map((o, i) => (
          <OptionCard key={o.kind} n={i + 1} label={o.label} selected={kind === o.kind} onClick={() => choose(i)} />
        ))}
      </div>
      {kind === "message" ? null : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="anim-rise-sm flex flex-col gap-2.5"
        >
          {kind === "meeting" ? (
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={tool === s.value}
                  aria-label={s.label}
                  onClick={() => setTool(s.value)}
                  className={`press flex h-10 items-center gap-2 rounded-lg border bg-card px-3 text-[13px] text-ink transition-[border-color,transform] duration-[140ms] ${tool === s.value ? "border-ink ring-1 ring-ink" : "border-line-strong hover:border-ink"}`}
                >
                  {s.domain ? <BrandLogo domain={s.domain} name={s.label} size={16} /> : <Plus size={14} />}
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Input
              key={kind}
              autoFocus={kind === "redirect"}
              value={url}
              onChange={(e) => (kind === "redirect" ? setPage : setMeet)(e.target.value)}
              placeholder={kind === "redirect" ? "https://acme.com/thanks" : tool === "calendly" ? "https://calendly.com/you/demo" : tool === "calcom" ? "https://cal.com/you" : "https://"}
              aria-label={kind === "redirect" ? "Page address" : "Booking link"}
              aria-invalid={show ? true : undefined}
              className="pr-9"
            />
            {url.trim() && !problem ? <Check size={15} className="absolute top-1/2 right-3 -translate-y-1/2 text-sage" /> : null}
          </div>
          {show ? <p className="text-[12.5px] text-rose">{problem}</p> : null}
          <Continue onClick={next} />
        </form>
      )}
    </div>
  );
}

function SendPanel({ a, tools, act, done }: { a: Answers; tools: Tool[]; act: ActRef; done: (a: Answers) => void }) {
  const [sources, setSources] = useState(a.send.sources);
  const pick = (i: number) => {
    const id = tools[i].id;
    setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const next = () => done({ ...a, send: { ...a.send, sources } });
  useAct(act, { count: tools.length, pick, next });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <CheckTile label="Claritia" on logo={<BrandLogo domain="tryclaritia.com" name="Claritia" size={18} />} />
        {tools.map((t, i) => (
          <CheckTile key={t.id} n={i < 9 ? i + 1 : undefined} label={t.name} on={sources.includes(t.id)} toggle={() => pick(i)} logo={<BrandLogo domain={entryOf(t.kind)?.domain ?? ""} name={t.name} size={18} />} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <a href="/settings/sources" target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors duration-[140ms] hover:text-ink">
          <Plus size={13} />
          Connect a tool
        </a>
        <Button onClick={next}>Continue</Button>
      </div>
    </div>
  );
}

// Templates ----------------------------------------------------------------------------------------------------

function Templates({ tokens, back, busy, error, pick }: { tokens: Partial<Tokens>; back: () => void; busy: string; error: string; pick: (name: string, form: Form) => void }) {
  const forms = useMemo(() => Object.fromEntries(TEMPLATES.map((t) => [t.key, t.form()])), []);
  return (
    <div className="paper min-h-full px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={back}>
            <ArrowLeft size={14} />
            Back
          </Button>
          <h2 className="font-semibold tracking-[-0.02em] text-[22px] leading-none text-ink">Templates</h2>
        </div>
        <ErrorNote message={error} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              disabled={!!busy}
              onClick={() => pick(t.name, t.form())}
              className="lift press group flex flex-col overflow-hidden rounded-2xl border border-line bg-card text-left hover:border-line-strong disabled:opacity-60"
            >
              <span className="relative block h-[260px] overflow-hidden border-b border-line" style={{ background: tokens.background || "#fff" }}>
                <span className="pointer-events-none absolute top-0 left-0 block w-[166%] origin-top-left scale-[0.6] p-8" aria-hidden="true">
                  <FormPreview form={forms[t.key]} tokens={tokens} />
                </span>
              </span>
              <span className="flex items-center gap-2 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">{t.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{t.text}</span>
                </span>
                <span className="text-[12.5px] font-medium text-muted group-hover:text-ink">{busy === t.name ? "Creating…" : "Use"}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

