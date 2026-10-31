"use client";

// Inbound › Routing (docs/routing-workflow.md Section 3): the title "Routing" and three tabs.
//   Policies  named policies, their state, live sources, destination and last run (/routing); one policy's editor
//             with its tester, publish review, versions and Route & book (/routing/policies/<id>)
//   Teams     reusable teams, their members' status, today's count and cap, calendar and the round robin
//             (/routing/teams, /routing/teams/<id>); working hours are Meetings › Availability (an old
//             /routing/teams/availability address opens there, and still draws here if reached in the app)
//   Activity  real runs, the review list and errors (/routing/activity, /routing/activity/<run>)
// Every tab reads one shared screen read (routing_screen:<ws>), so moving between them keeps what's on screen.

import { routingPage, ROUTING_TABS, teamsPage } from "@/lib/nav";
import { AvailabilityPage } from "../scheduling/AvailabilityPage";
import { ErrorNote, Loading, Page, Section, type ViewProps } from "../ui";
import { ToastHost } from "./Toast";
import { ActivityTab } from "./rt/ActivityTab";
import { useScreen } from "./rt/api";
import { PoliciesList } from "./rt/PoliciesList";
import { PolicyEditor } from "./rt/PolicyEditor";
import { TeamsTab } from "./rt/TeamsTab";

export function RoutingView(props: ViewProps) {
  const { session, ws, navigate, id } = props;
  const page = routingPage(id);
  const screen = useScreen(session, ws.id);
  const go = (to: string) => navigate("routing", to);

  if (page.page === "teams" && teamsPage(page.sub).page === "availability")
    return <AvailabilityPage {...props} tab={teamsPage(page.sub).sub} back={{ label: "Teams", onClick: () => go("teams") }} />;
  if (page.page === "" && page.sub)
    return (
      <>
        <PolicyEditor {...props} policyId={page.sub} screen={screen} back={() => go("")} />
        <ToastHost />
      </>
    );

  const nav = {
    title: "Routing",
    tabs: ROUTING_TABS.map((t) => (t.value === "activity" && screen.data?.openReviews ? { ...t, badge: screen.data.openReviews } : t)),
    current: page.page,
    onPick: (t: string) => go(t),
  };
  return (
    <Section nav={nav}>
      {page.page === "teams" && screen.data ? (
        <TeamsTab {...props} screen={screen} teamId={teamsPage(page.sub).page === "team" ? page.sub : null} />
      ) : page.page === "activity" && screen.data ? (
        <ActivityTab {...props} screen={screen} sub={page.sub} />
      ) : page.page === "" && screen.data ? (
        <PoliciesList {...props} screen={screen} />
      ) : (
        <Page title="Routing" flush>
          {screen.error ? (
            <div className="mx-auto max-w-[1120px] p-6">
              <ErrorNote message={screen.error} />
            </div>
          ) : (
            <Loading />
          )}
        </Page>
      )}
      <ToastHost />
    </Section>
  );
}
