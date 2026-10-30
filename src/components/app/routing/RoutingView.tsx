"use client";

// Automation › Routing (docs/routing-chat-plan.md 1.4): one sidebar item, with three tabs.
//   Setup   the chat that writes the setup, the plan card (Plan and Flow), and Publish (/routing, /routing/versions/<n>)
//   Leads   every lead routed and why, and the ones held for review (/routing/leads, /routing/leads/<run>, /routing/leads/review)
//   Team    teams and every rep's status and limits (/routing/team)

import { routingPage, ROUTING_TABS } from "@/lib/nav";
import { Page, Section, Segmented, type ViewProps } from "../ui";
import { HeldTab } from "./Held";
import { LeadNumbers } from "./LeadNumbers";
import { LogTab } from "./Log";
import { RouterTab } from "./Router";
import { SetupTab } from "./Setup";
import { TeamsPage } from "./TeamsPage";
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
          <Page title="Setup" flush>
            <SetupTab {...shared} />
          </Page>
        );
      case "leads": {
        const review = page.sub === "review";
        return (
          <Page
            title="Leads"
            actions={
              <Segmented
                label="Show"
                value={review ? "review" : "all"}
                onChange={(v) => navigate("routing", v === "review" ? "leads/review" : "leads")}
                options={[
                  { value: "all", label: "All" },
                  { value: "review", label: "Needs review" },
                ]}
              />
            }
            flush
          >
            <div className="flex h-full min-h-0 flex-col overflow-y-auto">
              <LeadNumbers sb={sb} ws={ws} />
              {review ? <HeldTab {...shared} sub="" /> : <LogTab {...shared} sub={page.sub} />}
            </div>
          </Page>
        );
      }
      case "team":
        return <TeamsPage {...props} />;
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
