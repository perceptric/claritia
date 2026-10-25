"use client";

// Inbound › Visitors before a site is added: the first screen, with the snippet's one button.

import { Eye } from "../../Icons";
import { SampleRows, SampleTags, ToolIntro } from "../ToolIntro";
import { Page } from "../ui";

/** Visitors before a site is added. */
export function VisitorsIntro({ action, head }: { action?: React.ReactNode; head?: React.ReactNode }) {
  const intro = (
      <ToolIntro
        sketch="funnel"
        action={action}
        title={"See which companies\nvisit your site"}
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
            text: "Forms, sign-ins and email clicks tie visits to people. Every link shows the evidence behind it, and can be undone.",
            visual: <SampleTags rows={[["jane@acme.com", "Verified"], ["raj@acme.com", "Asserted"], ["Shared laptop", "Probable"]]} />,
          },
        ]}
      />
  );
  if (head)
    return (
      <Page title="Signals" flush>
        {head}
        <div className="p-5 md:p-7">{intro}</div>
      </Page>
    );
  return (
    <Page icon={<Eye size={14} />} title="Visits">
      {intro}
    </Page>
  );
}
