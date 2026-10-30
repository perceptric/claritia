"use client";

// Emails › Journeys (docs/email-plan.md Part 8). The first visit is the build screen, with no questions: Claritia
// reads the brand, the product's events and the CRM, then makes one journey per lifecycle moment, its emails in the
// brand's voice and waiting for approval. After that, the journeys by stage on the left and the open one in the
// workflow editor on the right.

import { useCallback, useEffect, useRef, useState } from "react";
import { STAGES, type Facts, type Stage } from "@/lib/workflows/lifecycle";
import type { Brand } from "@/lib/workflows/journeys";
import { Check } from "../../Icons";
import { AiMark } from "../Ai";
import { Button, Empty, ErrorNote, errorText, Loading, must, Page, postJson, useLoad, type ViewProps } from "../ui";
import { Dots } from "../routing/Flow";
import { loadWorkflow } from "../workflows/data";
import { WorkflowEditor } from "../workflows/Editor";

type Plan = {
  key: string;
  name: string;
  stage: Stage;
  line: string;
  emails: number;
};
type Loaded = { facts: Facts; brand: Brand; plan: Plan[]; owner: boolean };
type Row = {
  id: string;
  name: string;
  status: "draft" | "live" | "paused";
  stage: Stage;
  journey: string | null;
};

const emailsApi = <T,>(session: ViewProps["session"], ws: string, action: string) => postJson<T>(session, "/api/emails", { workspaceId: ws, action });

export function JourneysPage(props: ViewProps & { sub: string }) {
  const { sb, session, ws, navigate } = props;
  const [tick, setTick] = useState(0);
  const data = useLoad(async () => {
    const [info, rows] = await Promise.all([
      emailsApi<Loaded>(session, ws.id, "load"),
      sb.from("workflows").select("id, name, status, stage, journey").eq("workspace_id", ws.id).not("stage", "is", null).order("created_at"),
    ]);
    return { info, rows: (must(rows) ?? []) as Row[] };
  }, `${ws.id}:${tick}`);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  if (!data.data)
    return (
      <Page title="Journeys">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { info, rows } = data.data;
  if (!rows.length) {
    if (!info.owner)
      return (
        <Page title="Journeys">
          <Empty title="No journeys yet">A workspace owner can build them here.</Empty>
        </Page>
      );
    return (
      <Page title="Journeys" flush>
        <BuildScreen {...props} info={info} onDone={reload} />
      </Page>
    );
  }
  const open = rows.find((r) => r.id === props.sub) ?? rows[0]!;
  const missing = info.owner ? info.plan.filter((p) => !rows.some((r) => r.journey === p.key)) : [];
  return (
    <Page title="Journeys" flush>
      <div className="grid h-full min-h-0 md:grid-cols-[232px_minmax(0,1fr)]">
        <nav aria-label="Journeys" className="flex min-h-0 gap-1 overflow-auto border-line p-2 md:flex-col md:border-r">
          {STAGES.map((st) => {
            const mine = rows.filter((r) => r.stage === st.value);
            if (!mine.length) return null;
            return (
              <div key={st.value} className="flex shrink-0 gap-1 md:flex-col">
                <p className="hidden px-2 pt-3 pb-1 text-[11.5px] text-faint md:block">{st.label}</p>
                {mine.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => navigate("emails", `journeys/${r.id}`)}
                    aria-current={r.id === open.id ? "page" : undefined}
                    className={`flex min-w-[160px] items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors duration-[140ms] md:min-w-0 ${r.id === open.id ? "bg-paper-deep font-medium text-ink" : "text-body hover:bg-hover"}`}
                  >
                    {r.status === "live" ? <span className="size-1.5 shrink-0 rounded-full bg-signal" aria-label="Live" /> : <span className="size-1.5 shrink-0" />}
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {missing.length ? <BuildMore session={session} ws={ws.id} count={missing.length} onDone={reload} /> : null}
        </nav>
        <div className="min-h-0 min-w-0">
          <OpenJourney key={open.id} {...props} id={open.id} onChanged={reload} />
        </div>
      </div>
    </Page>
  );
}

function OpenJourney({ sb, session, ws, navigate, id, onChanged }: ViewProps & { id: string; onChanged: () => void }) {
  const [tick, setTick] = useState(0);
  const res = useLoad(() => loadWorkflow(sb, ws.id, id), `${id}:${tick}`);
  const reload = useCallback(async () => {
    setTick((t) => t + 1);
    onChanged();
  }, [onChanged]);
  if (!res.data)
    return (
      <div className="p-5">
        <ErrorNote message={res.error} />
        {res.error ? null : <Loading />}
      </div>
    );
  const w = res.data.wf;
  return (
    <WorkflowEditor
      key={`${w.draft_revision}:${w.status}:${w.live_version}`}
      sb={sb}
      session={session}
      ws={ws}
      navigate={navigate}
      data={res.data}
      reload={reload}
      home={{ label: "Journeys", go: () => (onChanged(), navigate("emails")) }}
    />
  );
}

function BuildMore({ session, ws, count, onDone }: { session: ViewProps["session"]; ws: string; count: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-2 flex shrink-0 flex-col gap-1 px-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await emailsApi(session, ws, "build");
            onDone();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <AiMark />
        {busy ? "Building" : `Build ${count} more`}
      </Button>
      <ErrorNote message={error} />
    </div>
  );
}

/** The first visit: what Claritia read, one source at a time, then the journeys it made. */
function BuildScreen({ session, ws, info, onDone }: ViewProps & { info: Loaded; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [made, setMade] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [run, setRun] = useState(0);
  const started = useRef(-1);
  const { facts, brand, plan } = info;
  const stages = Object.entries(facts.stages).filter(([k]) => k !== "none");
  const steps = [
    {
      title: `Reading ${brand.name || "your brand"}`,
      body:
        brand.colors.length || brand.font
          ? [...brand.colors.map((c) => ({ swatch: c, text: c })), ...(brand.font ? [{ text: brand.font }] : []), ...(brand.logo_url ? [{ text: "Logo" }] : [])]
          : [{ text: "No brand kit yet. The emails use your workspace name." }],
    },
    {
      title: "Reading what people do in your product, last 30 days",
      body: facts.events.length
        ? facts.events.slice(0, 6).map((e) => ({ text: `${e.name}, ${e.people}` }))
        : [
            {
              text: "No product events yet. Add claritia.track() to your app for trial journeys.",
            },
          ],
    },
    {
      title: "Reading your CRM",
      body: [{ text: `${facts.contacts} contacts` }, ...stages.slice(0, 5).map(([k, n]) => ({ text: `${k}, ${n}` })), { text: `${facts.meetings} meetings in 30 days` }],
    },
    {
      title: "Writing the journeys in your voice",
      body: plan.map((p) => ({
        text: `${p.name}, ${p.emails} ${p.emails === 1 ? "email" : "emails"}`,
      })),
    },
  ];

  useEffect(() => {
    if (started.current === run) return;
    started.current = run;
    setError("");
    setMade(null);
    emailsApi<{ made: { id: string }[] }>(session, ws.id, "build").then(
      (r) => setMade(r.made.length),
      (e) => setError(errorText(e)),
    );
  }, [session, ws.id, run]);
  // The sources appear one at a time; the last waits for the build.
  useEffect(() => {
    if (error || shown >= steps.length || (shown === steps.length - 1 && made === null)) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 700 : 1100);
    return () => clearTimeout(t);
  }, [shown, made, error, steps.length]);
  const done = made !== null && shown >= steps.length;

  return (
    <div className="relative h-full min-h-0 overflow-y-auto">
      <Dots />
      <div className="relative mx-auto grid w-full max-w-5xl gap-10 px-5 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:px-8 md:py-14">
        <div className="flex flex-col gap-4 md:sticky md:top-0 md:self-start">
          <p className="label-mono">Journeys</p>
          <h1 className="text-[30px] leading-[1.15] font-semibold tracking-[-0.025em] text-ink text-balance">
            Lifecycle emails,
            <br />
            <span className="text-faint">built from your brand and your product.</span>
          </h1>
          {done ? (
            <div className="anim-rise-sm flex items-center gap-3">
              <Button onClick={onDone}>Review the journeys</Button>
              <span className="text-[13px] text-muted">{made === 1 ? "1 journey" : `${made} journeys`}, each email waiting for your approval</span>
            </div>
          ) : null}
          {error ? (
            <div className="flex flex-col gap-2">
              <ErrorNote message={error} />
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setRun((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : null}
        </div>
        <ol className="flex flex-col gap-3">
          {steps.slice(0, Math.min(shown + 1, steps.length)).map((st, i) => {
            const ok = i < shown;
            return (
              <li key={st.title} className="anim-rise-sm flex flex-col gap-2.5 rounded-[10px] border border-line bg-card px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  {ok ? (
                    <span className="flex size-[18px] items-center justify-center rounded-full bg-signal-soft text-signal-text">
                      <Check size={11} />
                    </span>
                  ) : (
                    <span className="size-4 animate-spin rounded-full border-2 border-line border-t-ink motion-reduce:animate-none" aria-label="Working" />
                  )}
                  <b className="text-[13.5px] font-medium text-ink">{st.title}</b>
                </div>
                {ok ? (
                  <div className="flex flex-wrap gap-1.5">
                    {st.body.map((x, j) => (
                      <span
                        key={j}
                        className="anim-rise-sm inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-body"
                        style={{ animationDelay: `${j * 70}ms` }}
                      >
                        {"swatch" in x && x.swatch ? <i className="size-3 rounded-[4px] border border-line" style={{ background: x.swatch }} /> : null}
                        {x.text}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
