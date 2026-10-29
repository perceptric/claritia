"use client";

// Nurture › Lead scoring (docs/unify-plan.md Part 1): the score and its bands, and the ideal customer it scores
// companies against. Both moved here from Settings.

import { scoringPage, SCORING_TABS } from "@/lib/nav";
import { Page, Section, type ViewProps } from "../ui";
import { LeadScoringPanel } from "../views/LeadScoringPanel";
import { IcpPanel } from "../views/SitesPanel";

export function ScoringView({ sb, session, ws, role, navigate, id }: ViewProps) {
  const { tab } = scoringPage(id);
  const nav = { title: "Scoring", tabs: SCORING_TABS, current: tab, onPick: (t: string) => navigate("scoring", t === "score" ? "" : t) };
  return (
    <Section nav={nav}>
      <Page title="Scoring">
        <div className="mx-auto max-w-3xl">{tab === "ideal" ? <IcpPanel sb={sb} ws={ws} /> : <LeadScoringPanel sb={sb} session={session} ws={ws} role={role} />}</div>
      </Page>
    </Section>
  );
}
