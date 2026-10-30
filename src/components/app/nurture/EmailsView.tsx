"use client";

// Nurture › Emails (docs/email-plan.md Part 8): Journeys (lifecycle emails by stage, built on the first visit),
// every email that goes out with its results, the Library (built-in templates by purpose and your saved ones) and
// Brand (the look, the brief and the senders the emails use).

import { emailsPage, EMAILS_TABS } from "@/lib/nav";
import { Plus } from "../../Icons";
import { Report } from "../reports/Report";
import { Button, Page, Section, type ViewProps } from "../ui";
import { BrandPage } from "./BrandPage";
import { JourneysPage } from "./JourneysPage";
import { LibraryPage } from "./LibraryPage";

export function EmailsView(props: ViewProps) {
  const { tab, sub } = emailsPage(props.id);
  const nav = {
    title: "Emails",
    tabs: EMAILS_TABS,
    current: tab,
    onPick: (t: string) => props.navigate("emails", t === "journeys" ? "" : t),
  };
  return (
    <Section nav={nav}>
      {tab === "journeys" ? (
        <JourneysPage {...props} sub={sub} />
      ) : tab === "library" ? (
        <LibraryPage {...props} />
      ) : tab === "brand" ? (
        <BrandPage {...props} />
      ) : (
        <Page
          title="Emails"
          actions={
            <Button onClick={() => props.navigate("workflows", "new", "template=broadcast")}>
              <Plus size={14} /> New broadcast
            </Button>
          }
        >
          <Report sb={props.sb} ws={props.ws.id} navigate={props.navigate} show={["email"]} titled={false} />
        </Page>
      )}
    </Section>
  );
}
