"use client";

// First screens for the marketing platform's tools, shown until each one has data
// (docs/marketing-platform.md). Each tool replaces its intro with the working screen when it ships.

import { BarChart, Eye, FileText, Megaphone } from "../../Icons";
import { SampleBars, SampleRows, SampleTags, ToolIntro } from "../ToolIntro";
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

export function AnalyticsView() {
  return (
    <Page icon={<BarChart size={14} />} title="Analytics">
      <ToolIntro
        sketch="funnel"
        title={"See which emails\nmade revenue"}
        lead="Opens, clicks, replies and meetings for every workflow and template, traced to the opportunities they touched."
        features={[
          {
            title: "Pipeline by workflow",
            text: "Opportunities and revenue each workflow touched, from your CRM.",
            visual: <SampleRows rows={[["Guide follow-up", 42, "$42k"], ["Webinar no-shows", 35, "$35k"], ["Trial nudge", 28, "$28k"]]} />,
          },
          {
            title: "Every send",
            text: "Delivered, opened, clicked and replied, by template and by step.",
            visual: <SampleBars values={[12, 18, 15, 22, 27, 25, 31, 36, 33, 40, 44, 48]} />,
          },
        ]}
      />
    </Page>
  );
}

export function PagesView() {
  return (
    <Page icon={<FileText size={14} />} title="Pages">
      <ToolIntro
        sketch="browser"
        title={"Landing pages\nthat convert"}
        lead="AI builds landing pages from your content, shapes them for each segment or account, and holds your forms."
        features={[
          {
            title: "Built from your content",
            text: "Pages made from your proof points and case studies, in your brand. No made-up claims.",
            visual: <SampleBars values={[22, 28, 31, 35, 33, 41, 46, 44, 52, 57, 55, 63]} />,
          },
          {
            title: "One page per segment",
            text: "Headlines and proof change for each industry, size or account.",
            visual: <SampleTags rows={[["Pricing · SaaS", "Live"], ["Pricing · Retail", "Live"], ["Demo · Acme", "Draft"]]} />,
          },
        ]}
      />
    </Page>
  );
}

export function AdsView() {
  return (
    <Page icon={<Megaphone size={14} />} title="Ads">
      <ToolIntro
        sketch="megaphone"
        title={"Ads tied\nto pipeline"}
        lead="Connect your ad accounts to see spend, leads and opportunities for every campaign, and send your segments as audiences."
        features={[
          {
            title: "Spend to revenue",
            text: "Cost per lead, per meeting and per opportunity, by campaign.",
            visual: <SampleRows rows={[["Google · Brand", 42, "$1.2k"], ["LinkedIn · ABM", 35, "$3.4k"], ["Meta · Retarget", 18, "$0.6k"]]} />,
          },
          {
            title: "Segments as audiences",
            text: "Your segments stay in step with each ad platform.",
            visual: <SampleTags rows={[["Hot accounts", "Google Ads"], ["Trial users", "Meta"], ["Target list", "LinkedIn"]]} />,
          },
        ]}
      />
    </Page>
  );
}
