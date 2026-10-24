"use client";

// Routing (docs/app-structure.md Part 5): one sidebar item per page.
//   Overview       how routing is doing, the setup in plain words and as a story (/routing)
//   Rules          the setup editor: the flow, rules, teams, test and make live (/routing/rules, /routing/versions/<n>)
//   Teams          teams with Deal 20 leads, and every rep's status and limits (/routing/teams)
//   Regions        named places (/routing/regions)
//   Company types  named kinds of company (/routing/company-types)
//   Handoffs       booking for a teammate, coming with M4 (/routing/handoffs)
//   History        every lead routed and why (/routing/history, /routing/history/<run>)
//   Needs review   junk and leads with no rep (/routing/review)

import { routingPage } from "@/lib/nav";
import { ToolIntro } from "../ToolIntro";
import { Badge, Page, type ViewProps } from "../ui";
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
          <Page title="Saved setup" flush>
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
      case "handoffs":
        return (
          <Page title="Handoffs" actions={<Badge tone="violet">Soon</Badge>}>
            <ToolIntro
              sketch="signpost"
              title={"Book a meeting\nfor a teammate"}
              lead="An SDR qualifies a lead, then books the right AE from the lead's page, from Slack with /book, or from the Chrome extension, without leaving the call."
            />
          </Page>
        );
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
  return (
    <>
      {body}
      <ToastHost />
    </>
  );
}
