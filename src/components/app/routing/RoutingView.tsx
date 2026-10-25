"use client";

// Automation › Routing (docs/unify-plan.md Part 1): one sidebar item, with its pages as tabs.
//   Overview       how routing is doing, speed to lead, the setup in plain words and as a story (/routing)
//   Rules          the setup editor: the flow, rules, teams, test and make live (/routing/rules, /routing/versions/<n>)
//   Teams          teams with Deal 20 leads, and every rep's status and limits (/routing/teams)
//   Regions        named places (/routing/regions)
//   Company types  named kinds of company (/routing/company-types)
//   History        every lead routed and why (/routing/history, /routing/history/<run>)
//   Needs review   junk and leads with no rep (/routing/review)

import { routingPage, ROUTING_TABS } from "@/lib/nav";
import { Page, Section, type ViewProps } from "../ui";
import { HeldTab } from "./Held";
import { LogTab } from "./Log";
import { OverviewPage } from "./OverviewPage";
import { CompanyTypesPage, RegionsPage } from "./RegionsPage";
import { RouterTab } from "./Router";
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
          <OverviewPage {...props} />
        );
      case "rules":
        return (
          <Page title="Rules" flush>
            <RouterTab {...shared} version={null} />
          </Page>
        );
      case "teams":
        return <TeamsPage {...props} />;
      case "regions":
        return <RegionsPage {...props} />;
      case "company-types":
        return <CompanyTypesPage {...props} />;
      case "history":
        return (
          <Page title="History" flush>
            <LogTab {...shared} sub={page.sub} />
          </Page>
        );
      case "review":
        return (
          <Page title="Needs review" flush>
            <HeldTab {...shared} sub={page.sub} />
          </Page>
        );
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
