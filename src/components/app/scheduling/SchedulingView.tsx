"use client";

// Inbound › Scheduling (docs/unify-plan.md Part 1): one sidebar item, with its pages as tabs. Meeting types (and one
// type's editor), Availability, Links and polls, Reminders and Payments. Booking forms are forms, so they live in
// Inbound › Forms.

import { schedulingPage, SCHEDULING_TABS } from "@/lib/nav";
import { Page, Section, type ViewProps } from "../ui";
import { Payments } from "../meetings/Payments";
import { TypeEditor } from "../meetings/TypeEditor";
import { AvailabilityPage } from "./AvailabilityPage";
import { LinksPage } from "./LinksPage";
import { RemindersPage } from "./RemindersPage";
import { TypesPage } from "./TypesPage";

export function SchedulingView(props: ViewProps) {
  const p = schedulingPage(props.id);
  const nav = { title: "Calendar", tabs: SCHEDULING_TABS, current: p.page, onPick: (t: string) => props.navigate("scheduling", t) };
  return <Section nav={nav}>{body(props, p)}</Section>;
}

function body(props: ViewProps, p: ReturnType<typeof schedulingPage>) {
  switch (p.page) {
    case "types":
      return p.sub ? <TypeEditor key={p.sub} {...props} id={p.sub} /> : <TypesPage {...props} />;
    case "availability":
      return <AvailabilityPage {...props} tab={p.sub} />;
    case "links":
      return <LinksPage {...props} />;
    case "reminders":
      return <RemindersPage {...props} />;
    case "payments":
      return (
        <Page title="Payments">
          <div className="mx-auto max-w-4xl">
            <Payments sb={props.sb} ws={props.ws} role={props.role} session={props.session} />
          </div>
        </Page>
      );
  }
}
