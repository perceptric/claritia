"use client";

// Inbound › Routing: one sidebar item with three tabs.
//   Rules    who gets each new lead, as five steps in sentences, with Try a lead; Publish (/routing); one past version
//            read-only (/routing/versions/<n>); the flowchart (/routing/flow)
//   Teams    the teams that share leads, their people and how they share (/routing/teams)
//   History  every lead and where it went (/routing/history, /routing/history/<run>, /routing/history/review)
// The people themselves (status, limits, backup, calendars) are Inbound › Reps.

import { routingPage, ROUTING_TABS } from "@/lib/nav";
import { Page, Section, type ViewProps } from "../ui";
import { HistoryTab } from "./History";
import { RouterTab } from "./Router";
import { SetupTab } from "./Setup";
import { TeamsTab } from "./Teams";
import { ToastHost } from "./Toast";

export function RoutingView(props: ViewProps) {
  const { sb, session, ws, role, navigate, id } = props;
  const page = routingPage(id);
  const shared = { sb, session, ws, role, navigate };
  const body = (() => {
    switch (page.page) {
      case "":
        return page.version !== null ? (
          <Page title={`Version ${page.version}`} back={{ label: "Routing", onClick: () => navigate("routing") }} flush>
            <RouterTab {...shared} version={page.version} />
          </Page>
        ) : (
          <SetupTab key={page.sub} {...shared} layout={page.sub === "flow" ? "flow" : "rules"} />
        );
      case "teams":
        return <TeamsTab {...props} />;
      case "history":
        return <HistoryTab {...shared} sub={page.sub} />;
    }
  })();
  const nav = { title: "Routing", tabs: ROUTING_TABS, current: page.page, onPick: (t: string) => navigate("routing", t) };
  return (
    <Section nav={nav}>
      {body}
      <ToastHost />
    </Section>
  );
}
