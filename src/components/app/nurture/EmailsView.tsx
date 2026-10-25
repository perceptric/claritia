"use client";

// Nurture › Emails (docs/unify-plan.md Part 1): every email that goes out, broadcasts and the ones inside workflows,
// with sent, delivered, clicked and meetings for the range; and Templates, the saved emails they start from.

import { emailsPage, EMAILS_TABS } from "@/lib/nav";
import { Plus } from "../../Icons";
import { Report } from "../reports/Report";
import { Button, Page, Section, type ViewProps } from "../ui";
import { EmailTemplatesView } from "../workflows/EmailTemplatesView";

export function EmailsView(props: ViewProps) {
  const { tab } = emailsPage(props.id);
  const nav = { title: "Emails", tabs: EMAILS_TABS, current: tab, onPick: (t: string) => props.navigate("emails", t === "emails" ? "" : t) };
  return (
    <Section nav={nav}>
      {tab === "templates" ? (
        <EmailTemplatesView {...props} />
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
