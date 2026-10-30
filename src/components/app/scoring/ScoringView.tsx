"use client";

// Inbound › Scoring (docs/scoring-plan.md Part 2): Model (built by the assistant on first visit, then edited here),
// Leads (scores and why), and Ideal customer (the account fit that Visitors uses).

import { scoringPage, SCORING_TABS } from "@/lib/nav";
import { ErrorNote, Loading, Page, Section, useQuery, type ViewProps } from "../ui";
import { ToastHost } from "../routing/Toast";
import { IcpPanel } from "../views/SitesPanel";
import { scoringApi, type Loaded } from "./api";
import { Build } from "./Build";
import { Editor } from "./Editor";
import { Leads } from "./Leads";

export function ScoringView(props: ViewProps) {
  const { sb, session, ws, role, navigate, id } = props;
  const { tab } = scoringPage(id);
  const nav = { title: "Scoring", tabs: SCORING_TABS, current: tab, onPick: (t: string) => navigate("scoring", t === "model" ? "" : t) };
  return (
    <Section nav={nav}>
      <Page title="Scoring" flush>
        {tab === "leads" ? <Leads sb={sb} ws={ws} navigate={navigate} /> : tab === "ideal" ? <div className="mx-auto max-w-3xl p-4 md:p-6"><IcpPanel sb={sb} ws={ws} /></div> : <ModelTab session={session} ws={ws} role={role} />}
      </Page>
      <ToastHost />
    </Section>
  );
}

function ModelTab({ session, ws, role }: Pick<ViewProps, "session" | "ws" | "role">) {
  const data = useQuery(`scoring:${ws.id}`, () => scoringApi<Loaded>(session, ws.id, "load"), { staleMs: 0 });
  if (data.error) return <div className="p-4 md:p-6"><ErrorNote message={data.error} /></div>;
  if (!data.data) return <Loading />;
  const d = data.data;
  const m = d.model;
  if (!m || (!m.draft && !m.live)) {
    if (role !== "owner")
      return (
        <div className="flex flex-col items-center gap-1 px-4 py-20 text-center">
          <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-ink">No scoring model yet</h2>
          <p className="text-[13px] text-muted">A workspace owner can build it here.</p>
        </div>
      );
    return <Build session={session} ws={ws} forms={d.forms} site={d.site} model={m?.id ?? null} onDone={data.reload} />;
  }
  return <Editor key={m.id} session={session} ws={ws} role={role} data={d} model={m} refresh={data.reload} />;
}
