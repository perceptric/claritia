"use client";

// The Visitors screen's first screen, shown until a site is added.

import { Eye } from "../../Icons";
import { SampleRows, SampleTags, ToolIntro } from "../ToolIntro";
import { Page } from "../ui";

/** Visitors before a site is added. */
export function VisitorsIntro({ action }: { action?: React.ReactNode }) {
  return (
    <Page icon={<Eye size={14} />} title="Visitors">
      <ToolIntro
        action={action}
        title="See which companies visit your site"
        lead="Claritia names the companies and people behind your traffic, shows what they read, and tells you when an account heats up. It follows each region's privacy rules on its own."
        features={[
          {
            title: "Live visitors",
            text: "Every visit with its company, pages and time on page, as it happens.",
            visual: <SampleRows rows={[["Acme · Pricing, Security", 9, "4m"], ["Globex · Case studies", 6, "2m"], ["Unknown · Germany", 3, "40s"]]} />,
          },
          {
            title: "Hot accounts",
            text: "Fit and intent scores, with the reasons behind them, so you know who to call today.",
            visual: <SampleTags rows={[["Acme", "Evaluating"], ["Initech", "Researching"], ["Globex", "Engaged"]]} />,
          },
          {
            title: "People, with proof",
            text: "Forms, sign-ins and email clicks tie visits to people. Every link shows the evidence behind it.",
            visual: <SampleTags rows={[["jane@acme.com", "Verified"], ["raj@acme.com", "Asserted"], ["Shared laptop", "Probable"]]} />,
          },
        ]}
      />
    </Page>
  );
}
