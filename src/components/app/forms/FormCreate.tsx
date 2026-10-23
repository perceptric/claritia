"use client";

// A new form (docs/form-builder-v2.md Parts 1 to 3): one box that asks what form you need, then three ways in. Ask me
// goes through eight questions, one at a time, answered with clicks, while the real form builds itself on the right
// in your site's style. Templates and Build by hand are the other two ways. All three end on the form's own page,
// ready to publish and embed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import {
  buildForm,
  defaults,
  formName,
  GOALS,
  PICKS,
  PLACES,
  QUESTIONS,
  readSentence,
  suggestSteps,
  withGoal,
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
import { ArrowLeft, Chat, Check, CornerDownLeft, Grid, Inbox, Lock, Monitor, Phone, Plus, Wand, X } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Pip, type PipMood } from "../Pip";
import { Badge, Button, ErrorNote, errorText, Loading, must, Page, postJson, useLoad, type ViewProps } from "../ui";
import { FormPreview, type Kit } from "./shared";

type Tool = { id: string; kind: string; name: string };
type Phase = "start" | "ask" | "templates";
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

function Create({ sb, session, ws, navigate, tools, site: firstSite, kits }: ViewProps & { tools: Tool[]; site: string; kits: Kit[] }) {
  const brand = useBrand({ sb, session, ws }, firstSite, kits);
  const [phase, setPhase] = useState<Phase>("start");
  const [sentence, setSentence] = useState("");
  const [answers, setAnswers] = useState<Answers>(() => defaults("demo"));
  const [settled, setSettled] = useState<Set<QuestionId>>(new Set());
  const [current, setCurrent] = useState<QuestionId | "done">("goal");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  /** Make the form, add where its leads go, and open it. */
  const create = async (name: string, form: Form, o: { sources?: string[]; slack?: string; tab?: string } = {}) => {
    setError("");
    const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: name, p_draft: form, p_brand_kit: brand.kit?.id ?? null, p_kind: "built" })) as string;
    const notes: string[] = [];
    for (const s of o.sources ?? []) {
      const t = tools.find((x) => x.id === s);
      await postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "source", sourceId: s, name: t?.name ?? "Tool" }).catch((e) => notes.push(`${t?.name ?? "A tool"}: ${errorText(e)}`));
    }
    if (o.slack) await postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "slack", url: o.slack, name: "Slack" }).catch((e) => notes.push(`Slack: ${errorText(e)}`));
    try {
      if (o.tab) sessionStorage.setItem(`claritia:form-tab:${id}`, o.tab);
      if (notes.length) sessionStorage.setItem(`claritia:form-note:${id}`, notes.join(" "));
    } catch {}
    navigate("forms", id);
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  };

  const begin = (text: string) => {
    const t = text.trim();
    if (t) {
      const r = readSentence(t, tools);
      setAnswers(r.answers);
      setSettled(new Set(r.settled));
      setCurrent(QUESTIONS.find((q) => !r.settled.includes(q.id))?.id ?? "done");
    } else {
      setAnswers(defaults("demo"));
      setSettled(new Set());
      setCurrent("goal");
    }
    setSentence(t);
    setPhase("ask");
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
      await create(formName(answers), buildForm(answers, copy), { sources: answers.send.sources, slack: answers.send.slack.trim() || undefined, tab: "share" });
    });

  if (phase === "start")
    return (
      <Start
        onSentence={begin}
        onAsk={() => begin("")}
        onTemplates={() => setPhase("templates")}
        onBlank={() => run("blank", () => create("Untitled form", emptyForm(), { tab: "build" }))}
        busy={!!busy}
        error={error}
      />
    );
  if (phase === "templates")
    return (
      <Templates
        tokens={brand.tokens}
        back={() => setPhase("start")}
        busy={busy}
        error={error}
        pick={(name, form) => run(name, () => create(name, form, { tab: "share" }))}
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
      sentence={sentence}
      tools={tools}
      brand={brand}
      session={session}
      ws={ws}
      busy={busy}
      error={error}
      finish={finish}
      back={() => setPhase("start")}
    />
  );
}

// The first screen ---------------------------------------------------------------------------------------------

const TRY = ["Demo form for the pricing page that books a Calendly call", "Newsletter signup for the blog", "Contact sales with phone and budget, sends to HubSpot"];

function Start({ onSentence, onAsk, onTemplates, onBlank, busy, error }: { onSentence: (t: string) => void; onAsk: () => void; onTemplates: () => void; onBlank: () => void; busy: boolean; error: string }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => box.current?.focus(), []);
  const ways = [
    { key: "ask", icon: <Chat size={18} />, title: "Ask me", text: "Eight quick questions, answered with clicks.", on: onAsk },
    { key: "templates", icon: <Grid size={18} />, title: "Templates", text: "Twelve forms, already in your brand.", on: onTemplates },
    { key: "blank", icon: <Plus size={18} />, title: "Build by hand", text: "Drag fields onto a blank form.", on: onBlank },
  ];
  return (
    <div className="paper flex min-h-full flex-col items-center px-4 pt-[12vh] pb-16">
      <div className="anim-rise flex w-full max-w-[680px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="label-mono">new form</p>
          <div className="flex items-center gap-4">
            <Pip size={52} follow />
            <h2 className="serif text-left text-[44px] leading-[1.05] text-ink">
              What form <span className="text-muted">do you need?</span>
            </h2>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onSentence(text);
          }}
          className="frame flex flex-col gap-2 rounded-2xl border border-line-strong bg-card p-4 transition-colors focus-within:border-ink"
        >
          <textarea
            ref={box}
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim()) onSentence(text);
              }
            }}
            placeholder="Describe it in a sentence, or pick a way in below"
            aria-label="What form do you need?"
            className="w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint"
          />
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-[11.5px] text-muted sm:inline">Enter to start</span>
            <Button type="submit" className="ml-auto" disabled={!text.trim() || busy} aria-label="Start">
              <CornerDownLeft size={14} />
              Start
            </Button>
          </div>
        </form>
        <div className="flex flex-wrap justify-center gap-1.5">
          {TRY.map((t) => (
            <button key={t} type="button" onClick={() => onSentence(t)} className="press h-8 rounded-full border border-line-strong bg-card px-3 text-[12.5px] text-body transition-transform duration-[140ms] hover:-translate-y-px hover:border-ink hover:text-ink">
              {t}
            </button>
          ))}
        </div>
        <ErrorNote message={error} />
        <div className="grid gap-3 sm:grid-cols-3">
          {ways.map((w) => (
            <button key={w.key} type="button" disabled={busy} onClick={w.on} className="lift press group flex flex-col gap-2 rounded-2xl border border-line bg-card p-5 text-left hover:border-line-strong disabled:opacity-50">
              <span className="mb-1 flex size-9 items-center justify-center rounded-full bg-paper-deep text-ink transition-colors group-hover:bg-ink group-hover:text-paper">{w.icon}</span>
              <span className="text-[14px] font-medium">{w.title}</span>
              <span className="text-[12.5px] leading-snug text-muted">{w.text}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The questions ------------------------------------------------------------------------------------------------

type Brand = ReturnType<typeof useBrand>;

function summary(q: QuestionId, a: Answers, tools: Tool[]): string {
  switch (q) {
    case "goal":
      return GOALS[a.goal].label;
    case "place":
      return PLACES.find((p) => p.value === a.place)?.label ?? "";
    case "fields":
      return [a.workOnly ? "Work email" : "Email", ...PICKS.filter((p) => a.fields.some((f) => f.pick === p.value)).map((p) => `${p.label}${a.fields.find((f) => f.pick === p.value)?.required ? " (required)" : ""}`)].join(", ");
    case "extra":
      return a.extra.length ? a.extra.map((x) => x.label).join(", ") : "No";
    case "work":
      return a.workOnly ? "Yes, business emails only" : "No, any email";
    case "steps":
      return a.steps === "two" ? "Two steps" : "One page";
    case "after":
      return a.after.kind === "meeting" ? `Book a meeting on ${SCHEDULERS.find((s) => s.value === (a.after as { tool: SchedulerTool }).tool)?.label}` : a.after.kind === "redirect" ? `Open ${a.after.url || "a page"}` : "Show a thank-you message";
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
  sentence,
  tools,
  brand,
  session,
  ws,
  busy,
  error,
  finish,
  back,
}: {
  answers: Answers;
  setAnswers: (a: Answers) => void;
  settled: Set<QuestionId>;
  setSettled: (s: Set<QuestionId>) => void;
  current: QuestionId | "done";
  setCurrent: (q: QuestionId | "done") => void;
  sentence: string;
  tools: Tool[];
  brand: Brand;
  session: ViewProps["session"];
  ws: ViewProps["ws"];
  busy: string;
  error: string;
  finish: () => void;
  back: () => void;
}) {
  // The open question's unsaved choices show in the form as they're made.
  const [draft, setDraft] = useState<Answers | null>(null);
  const form = useMemo(() => buildForm(draft ?? a), [draft, a]);
  const end = useRef<HTMLDivElement>(null);
  const order = QUESTIONS.map((q) => q.id);
  const answer = (q: QuestionId, next: Answers) => {
    setDraft(null);
    setAnswers(next);
    const s = new Set(settled);
    s.add(q);
    setSettled(s);
    const i = order.indexOf(q);
    setCurrent(order.slice(i + 1).find((x) => !s.has(x)) ?? "done");
  };
  const prev = () => {
    setDraft(null);
    const i = current === "done" ? order.length : order.indexOf(current);
    if (i <= 0) return back();
    setCurrent(order[i - 1]);
  };
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [current]);
  const done = settled.size;
  const step = current === "done" ? order.length : order.indexOf(current) + 1;

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[minmax(420px,560px)_1fr]">
      <section className="flex min-h-0 flex-col border-line lg:border-r">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
          <button type="button" onClick={prev} className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-ink">
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="ml-auto font-mono text-[11.5px] text-muted tabular-nums">{current === "done" ? "Ready" : `${step} of ${order.length}`}</span>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
            <span className="block h-1.5 rounded-full bg-ink transition-[width] duration-[320ms] ease-out" style={{ width: `${(Math.max(done, step - 1) / order.length) * 100}%` }} />
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 py-5">
          <div className="flex flex-col gap-4">
            {sentence ? <Mine text={sentence} /> : null}
            {QUESTIONS.map((q) =>
              q.id === current ? (
                <div key={q.id} className="anim-rise-sm flex flex-col gap-3">
                  <Theirs text={q.ask} />
                  <Panel q={q.id} a={a} answer={answer} live={setDraft} tools={tools} session={session} ws={ws} />
                </div>
              ) : settled.has(q.id) ? (
                <div key={q.id} className="flex flex-col gap-2">
                  <Theirs text={q.ask} faint />
                  <Mine
                    text={summary(q.id, a, tools)}
                    onClick={() => {
                      setDraft(null);
                      setCurrent(q.id);
                    }}
                  />
                </div>
              ) : null,
            )}
            {current === "done" ? (
              <div className="anim-rise-sm flex flex-col gap-3">
                <Theirs text="Here's your form. Create it, then publish and embed it." mood={busy ? "thinking" : "idle"} />
                <ErrorNote message={error} />
                <div>
                  <Button onClick={finish} disabled={!!busy} className="h-10 px-5 text-[14px]">
                    <Wand size={15} />
                    {busy === "words" ? "Writing the words…" : busy === "create" ? "Creating…" : "Create form"}
                  </Button>
                </div>
              </div>
            ) : null}
            <div ref={end} />
          </div>
        </div>
      </section>
      <PreviewPane form={form} brand={brand} popup={(draft ?? a).place === "popup"} />
    </div>
  );
}

/** Pip asks. */
function Theirs({ text, faint, mood = "idle" }: { text: string; faint?: boolean; mood?: PipMood }) {
  return (
    <div className="flex items-start gap-2.5">
      <Pip size={faint ? 22 : 28} mood={mood} className={faint ? "opacity-60" : ""} />
      <p className={`pt-1 text-[14.5px] leading-snug ${faint ? "text-muted" : "font-medium text-ink"}`}>{text}</p>
    </div>
  );
}

function Mine({ text, onClick }: { text: string; onClick?: () => void }) {
  const cls = "anim-rise-sm max-w-[85%] self-end rounded-2xl rounded-br-sm border border-line bg-paper-deep px-3.5 py-2 text-left text-[13.5px] text-ink";
  return onClick ? (
    <button type="button" onClick={onClick} title="Change" className={`${cls} transition-colors hover:border-ink`}>
      {text}
    </button>
  ) : (
    <p className={cls}>{text}</p>
  );
}

/** One choice: a pill with its number key. */
function Option({ n, label, on, selected, hint, children }: { n?: number; label: string; on: () => void; selected?: boolean; hint?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={on}
      aria-pressed={selected}
      className={`press flex min-h-10 items-center gap-2.5 rounded-full border py-2 pr-4 pl-2.5 text-left text-[13.5px] transition-[background-color,border-color,color,transform] duration-[140ms] ${selected ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:border-ink"}`}
    >
      {n ? <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10.5px] ${selected ? "border-paper/40" : "border-line-strong text-muted"}`}>{n}</span> : null}
      {children}
      <span className="min-w-0 flex-1">{label}</span>
      {hint ? <span className={`font-mono text-[11.5px] ${selected ? "text-paper/70" : "text-muted"}`}>{hint}</span> : null}
    </button>
  );
}

/** Number keys pick a choice, outside text boxes. */
function useKeys(count: number, pick: (i: number) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) {
        e.preventDefault();
        pick(n - 1);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [count, pick]);
}

function Single<T extends string>({ options, value, onPick }: { options: { value: T; label: string; hint?: string }[]; value?: T; onPick: (v: T) => void }) {
  const pick = useCallback((i: number) => onPick(options[i].value), [options, onPick]);
  useKeys(options.length, pick);
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {options.map((o, i) => (
        <Option key={o.value} n={i + 1} label={o.label} hint={o.hint} selected={value === o.value} on={() => onPick(o.value)} />
      ))}
    </div>
  );
}

function Continue({ onClick, label = "Continue", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement)?.closest?.("input, textarea, button")) return;
      e.preventDefault();
      if (!disabled) onClick();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClick, disabled]);
  return (
    <div className="flex items-center gap-2">
      <Button onClick={onClick} disabled={disabled}>
        {label}
      </Button>
      <span className="hidden font-mono text-[11.5px] text-muted sm:inline">or press Enter</span>
    </div>
  );
}

function Panel({ q, a, answer, live, tools, session, ws }: { q: QuestionId; a: Answers; answer: (q: QuestionId, next: Answers) => void; live: (a: Answers) => void; tools: Tool[]; session: ViewProps["session"]; ws: ViewProps["ws"] }) {
  switch (q) {
    case "goal":
      return <Single<Goal> options={(Object.keys(GOALS) as Goal[]).map((g) => ({ value: g, label: GOALS[g].label }))} value={a.goal} onPick={(g) => answer("goal", withGoal(a, g))} />;
    case "place":
      return <Single options={PLACES} value={a.place} onPick={(place) => answer("place", { ...a, place })} />;
    case "fields":
      return <Fields a={a} live={live} done={(next) => answer("fields", next)} />;
    case "extra":
      return <Extras a={a} live={live} session={session} ws={ws} done={(next) => answer("extra", next)} />;
    case "work":
      return (
        <Single
          options={[
            { value: "yes", label: "Yes, block Gmail and the like" },
            { value: "no", label: "No, any email" },
          ]}
          value={a.workOnly ? "yes" : "no"}
          onPick={(v) => answer("work", { ...a, workOnly: v === "yes" })}
        />
      );
    case "steps":
      return (
        <Single
          options={[
            { value: "one", label: "One page" },
            { value: "two", label: "Two steps", hint: suggestSteps(a) ? "Suggested" : undefined },
          ]}
          value={a.steps}
          onPick={(steps) => answer("steps", { ...a, steps })}
        />
      );
    case "after":
      return <AfterPanel a={a} live={live} done={(next) => answer("after", next)} />;
    case "send":
      return <Send a={a} tools={tools} done={(next) => answer("send", next)} />;
  }
}

function Fields({ a, live, done }: { a: Answers; live: (a: Answers) => void; done: (a: Answers) => void }) {
  const [picked, setPickedState] = useState(a.fields);
  const setPicked = (list: Answers["fields"]) => {
    setPickedState(list);
    live({ ...a, fields: list });
  };
  const toggle = (pick: (typeof PICKS)[number]["value"]) =>
    setPicked(picked.some((f) => f.pick === pick) ? picked.filter((f) => f.pick !== pick) : [...picked.filter((f) => !(pick === "name" && f.pick === "name_split") && !(pick === "name_split" && f.pick === "name")), { pick, required: false }]);
  const require = (pick: string) => setPicked(picked.map((f) => (f.pick === pick ? { ...f, required: !f.required } : f)));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        <div className="flex min-h-10 items-center gap-2.5 rounded-full border border-ink bg-ink py-2 pr-4 pl-3.5 text-[13.5px] text-paper">
          <Lock size={13} />
          <span className="flex-1">{a.workOnly ? "Work email" : "Email"}</span>
          <span className="font-mono text-[11.5px] text-paper/70">Required</span>
        </div>
        {PICKS.map((p) => {
          const on = picked.find((f) => f.pick === p.value);
          return (
            <div key={p.value} className={`flex min-h-10 items-center rounded-full border transition-colors duration-[140ms] ${on ? "border-ink bg-ink text-paper" : "border-line-strong bg-card text-ink hover:border-ink"}`}>
              <button type="button" onClick={() => toggle(p.value)} aria-pressed={!!on} className="flex flex-1 items-center gap-2.5 self-stretch rounded-full py-2 pr-3 pl-3.5 text-left text-[13.5px]">
                <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-transform duration-[320ms] ease-spring ${on ? "scale-110 border-paper bg-paper text-ink" : "border-line-strong"}`}>{on ? <Check size={11} /> : null}</span>
                {p.label}
              </button>
              {on ? (
                <button
                  type="button"
                  onClick={() => require(p.value)}
                  aria-pressed={on.required}
                  className={`mr-1.5 h-6 rounded-full px-2.5 font-mono text-[11.5px] ${on.required ? "bg-paper text-ink" : "text-paper/60 hover:text-paper"}`}
                >
                  Required
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <Continue onClick={() => done({ ...a, fields: picked })} />
    </div>
  );
}

function Extras({ a, live, session, ws, done }: { a: Answers; live: (a: Answers) => void; session: ViewProps["session"]; ws: ViewProps["ws"]; done: (a: Answers) => void }) {
  const [list, setListState] = useState<Extra[]>(a.extra);
  const setList = (f: (l: Extra[]) => Extra[]) =>
    setListState((l) => {
      const next = f(l);
      queueMicrotask(() => live({ ...a, extra: next }));
      return next;
    });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const add = async () => {
    const t = text.trim();
    if (!t || busy || list.length >= 10) return;
    setBusy(true);
    try {
      const r = await postJson<{ field: Extra }>(session, "/api/forms/interview", { workspaceId: ws.id, mode: "question", text: t });
      setList((l) => [...l, r.field]);
      setText("");
    } catch {
      const { readQuestion } = await import("@/lib/forms/interview");
      setList((l) => [...l, readQuestion(t)]);
      setText("");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };
  const TYPE: Record<Extra["type"], string> = { text: "Short answer", textarea: "Long answer", choice: "Pick one", multi: "Pick many", number: "Number", date: "Date", url: "Website", checkbox: "Checkbox" };
  return (
    <div className="flex flex-col gap-3">
      {list.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
          {list.map((x, i) => (
            <li key={`${x.label}-${i}`} className="anim-rise-sm flex items-center gap-2 py-2 pr-2 pl-3.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{x.label}</span>
                {x.options?.length ? <span className="block truncate text-[12px] text-muted">{x.options.join(", ")}</span> : null}
              </span>
              <Badge>{TYPE[x.type]}</Badge>
              <button type="button" aria-label="Remove" onClick={() => setList((l) => l.filter((_, j) => j !== i))} className="press flex size-8 items-center justify-center rounded-full text-muted hover:bg-rose-wash hover:text-rose">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex gap-1.5"
      >
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Which CRM do you use? (HubSpot, Salesforce, Other)"
          aria-label="A question to ask"
          className="h-10 min-w-0 flex-1 rounded-sm border border-line-strong bg-card px-3 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
        />
        <Button type="submit" variant="ghost" className="h-10" disabled={!text.trim() || busy}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </form>
      <div className="flex items-center gap-2">
        <Button onClick={() => done({ ...a, extra: list })}>{list.length ? "Continue" : "No, continue"}</Button>
      </div>
    </div>
  );
}

function AfterPanel({ a, live, done }: { a: Answers; live: (a: Answers) => void; done: (a: Answers) => void }) {
  const [kind, setKind] = useState<Answers["after"]["kind"]>(a.after.kind);
  const [tool, setTool] = useState<SchedulerTool>(a.after.kind === "meeting" ? a.after.tool : "calendly");
  const [url, setUrl] = useState(a.after.kind === "meeting" || a.after.kind === "redirect" ? a.after.url : "");
  const [own, setOwn] = useState(a.after.kind === "meeting" ? a.after.perOwner : true);
  const choose = useCallback(
    (i: number) => {
      const k = (["meeting", "message", "redirect"] as const)[i];
      setKind(k);
      if (k === "message") done({ ...a, after: { kind: "message" } });
      else live({ ...a, after: k === "meeting" ? { kind: "meeting", tool, url: url.trim(), perOwner: true } : { kind: "redirect", url: url.trim() } });
    },
    [a, done, live, tool, url],
  );
  useKeys(3, choose);
  const urlOk = kind === "redirect" ? /^https:\/\/\S+\.\S+/.test(url.trim()) : !url.trim() || /^https:\/\/\S+/.test(url.trim());
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5">
        <Option n={1} label="Book a meeting" selected={kind === "meeting"} on={() => choose(0)} />
        <Option n={2} label="Show a thank-you message" selected={kind === "message"} on={() => choose(1)} />
        <Option n={3} label="Open a page" selected={kind === "redirect"} on={() => choose(2)} />
      </div>
      {kind === "meeting" ? (
        <div className="anim-rise-sm flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3.5">
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setTool(s.value)}
                aria-pressed={tool === s.value}
                className={`press flex h-9 items-center gap-2 rounded-full border pr-3.5 pl-2.5 text-[13px] ${tool === s.value ? "border-ink bg-hover font-medium" : "border-line-strong bg-card hover:border-ink"}`}
              >
                {s.domain ? <BrandLogo domain={s.domain} name={s.label} size={16} /> : null}
                {s.label}
              </button>
            ))}
          </div>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={tool === "calendly" ? "https://calendly.com/you/demo" : tool === "calcom" ? "https://cal.com/you" : "https://"}
            aria-label="Booking link"
            className="h-9 rounded-sm border border-line-strong bg-card px-3 text-[13px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
          />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} className="size-4 accent-[var(--color-ink)]" />
            Book with the contact owner&apos;s own link when they have one
          </label>
          <Continue disabled={!urlOk} onClick={() => done({ ...a, after: { kind: "meeting", tool, url: url.trim(), perOwner: own || !url.trim() } })} />
        </div>
      ) : kind === "redirect" ? (
        <div className="anim-rise-sm flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3.5">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://acme.com/thanks"
            aria-label="Page to open"
            className="h-9 rounded-sm border border-line-strong bg-card px-3 text-[13px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
          />
          <Continue disabled={!urlOk} onClick={() => done({ ...a, after: { kind: "redirect", url: url.trim() } })} />
        </div>
      ) : null}
    </div>
  );
}

function Send({ a, tools, done }: { a: Answers; tools: Tool[]; done: (a: Answers) => void }) {
  const [sources, setSources] = useState(a.send.sources);
  const [slackOn, setSlackOn] = useState(!!a.send.slack);
  const [slack, setSlack] = useState(a.send.slack);
  const slackOk = !slackOn || /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(slack.trim());
  const toggle = (id: string) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const row = (key: string, logo: React.ReactNode, label: string, on: boolean, click?: () => void) => (
    <button key={key} type="button" disabled={!click} onClick={click} aria-pressed={on} className={`flex min-h-11 items-center gap-2.5 rounded-full border py-2 pr-3.5 pl-3 text-left text-[13.5px] transition-colors ${on ? "border-ink bg-hover" : "border-line-strong bg-card hover:border-ink"} disabled:cursor-default`}>
      {logo}
      <span className="flex-1 font-medium">{label}</span>
      <span className={`flex size-4 items-center justify-center rounded-full border transition-transform duration-[320ms] ease-spring ${on ? "scale-110 border-ink bg-ink text-paper" : "border-line-strong"}`}>{on ? <Check size={11} /> : null}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {row("claritia", <BrandLogo domain="tryclaritia.com" name="Claritia" size={20} />, "Claritia", true)}
        {tools.map((t) => row(t.id, <BrandLogo domain={entryOf(t.kind)?.domain ?? ""} name={t.name} size={20} />, t.name, sources.includes(t.id), () => toggle(t.id)))}
        {row("slack", <BrandLogo domain="slack.com" name="Slack" size={20} />, "Slack", slackOn, () => setSlackOn((v) => !v))}
        <button type="button" onClick={() => window.open("/settings/sources", "_blank", "noopener")} className="flex min-h-11 items-center gap-2.5 rounded-full border border-dashed border-line-strong py-2 pr-3.5 pl-3 text-left text-[13.5px] text-muted hover:border-ink hover:text-ink">
          <Plus size={16} />
          Connect a tool
        </button>
      </div>
      {slackOn ? (
        <input
          value={slack}
          onChange={(e) => setSlack(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          aria-label="Slack webhook address"
          className="anim-rise-sm h-9 rounded-sm border border-line-strong bg-card px-3 text-[13px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
        />
      ) : null}
      <Continue disabled={!slackOk} onClick={() => done({ ...a, send: { sources, slack: slackOn ? slack.trim() : "", webhook: "" } })} />
    </div>
  );
}

// The live form ------------------------------------------------------------------------------------------------

export function PreviewPane({ form, brand, popup, footer }: { form: Form; brand: { site: string; kit: Kit | null; tokens: Partial<Tokens>; scan: (u: string) => void; error: string }; popup?: boolean; footer?: React.ReactNode }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [view, setView] = useState<number | "done">(0);
  const step = view === "done" ? 0 : Math.min(view, form.steps.length - 1);
  const shown = (
    <div className="mx-auto" style={{ maxWidth: form.layout.width === "wide" ? 720 : 480 }}>
      <FormPreview form={form} tokens={brand.tokens} step={step} done={view === "done"} />
    </div>
  );
  const status = brand.kit?.scan_status;
  const bg = brand.tokens.background || "#ffffff";
  return (
    <section className="hidden min-h-0 flex-col bg-paper lg:flex">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-card px-4">
        <div className="flex items-center gap-0.5 rounded-full border border-line-strong bg-card p-0.5" role="group" aria-label="Device">
          {(["desktop", "phone"] as const).map((d) => (
            <button key={d} type="button" aria-label={d === "desktop" ? "Desktop view" : "Phone view"} title={d === "desktop" ? "Desktop view" : "Phone view"} aria-pressed={device === d} onClick={() => setDevice(d)} className={`flex size-7 items-center justify-center rounded-full transition-colors duration-[140ms] ${device === d ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>
              {d === "desktop" ? <Monitor size={14} /> : <Phone size={14} />}
            </button>
          ))}
        </div>
        <div className="ml-2 flex items-center gap-1" role="group" aria-label="Show">
          {[...form.steps.map((_, i) => i), "done" as const].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={(view === "done" ? "done" : step) === v}
              className={`h-7 rounded-full px-3 text-[12px] font-medium transition-colors duration-[140ms] ${(view === "done" ? "done" : step) === v ? "bg-ink text-paper" : "text-muted hover:bg-hover hover:text-ink"}`}
            >
              {v === "done" ? "After submit" : form.steps.length > 1 ? `Step ${v + 1}` : "Form"}
            </button>
          ))}
        </div>
        <SiteBox key={brand.site} brand={brand} />
      </div>
      {brand.error || (status === "failed" && brand.kit?.scan_error) ? (
        <div className="border-b border-line bg-card px-4 py-2">
          <ErrorNote message={brand.error || brand.kit?.scan_error || ""} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-6 xl:p-10">
        <div className={`mx-auto transition-[max-width] duration-[320ms] ease-out ${device === "phone" ? "max-w-[390px]" : "max-w-[880px]"}`}>
          <div className={`frame relative overflow-hidden border border-line-strong transition-[border-radius] duration-[320ms] ease-out ${device === "phone" ? "rounded-3xl" : "rounded-2xl"}`} style={{ background: bg }}>
            <div className="flex h-8 items-center gap-1.5 border-b border-line bg-card px-3.5" aria-hidden="true">
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="size-2 rounded-full bg-line-strong" />
              <span className="ml-2 truncate font-mono text-[11.5px] text-muted">{brand.site || "yoursite.com"}</span>
            </div>
            {popup ? (
              <div className="relative flex min-h-[560px] items-center justify-center bg-scrim p-6">
                <div className="anim-pop w-full max-w-[520px] rounded-2xl border border-line p-6 shadow-float" style={{ background: bg }}>
                  {shown}
                </div>
              </div>
            ) : (
              <div className={device === "phone" ? "p-5" : "p-8 xl:p-12"}>{shown}</div>
            )}
          </div>
          {footer}
        </div>
      </div>
    </section>
  );
}

function SiteBox({ brand }: { brand: { site: string; kit: Kit | null; scan: (u: string) => void } }) {
  const [site, setSite] = useState(brand.site);
  const status = brand.kit?.scan_status;
  const go = () => site.trim() && site.trim() !== brand.site && brand.scan(site.trim());
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="ml-auto flex items-center gap-2"
    >
      <span className="label-mono">Style from</span>
      <input value={site} onChange={(e) => setSite(e.target.value)} onBlur={go} placeholder="yoursite.com" aria-label="Your site" className="h-8 w-44 rounded-sm border border-line-strong bg-card px-2.5 font-mono text-[12px] outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink" />
      {status === "scanning" ? <Badge tone="brand">Reading</Badge> : status === "done" ? <Badge tone="green">Matched</Badge> : status === "failed" ? <Badge tone="red">Failed</Badge> : null}
    </form>
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
          <h2 className="serif text-[28px] leading-none text-ink">Templates</h2>
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

