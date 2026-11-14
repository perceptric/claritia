"use client";

// Inbound › Meetings (route "scheduling", once Calendar): Meetings (what people can book, one card each; a card opens
// its panel, or the full editor at types/<id>/all), Upcoming (every meeting on the calendar, once CRM › Meetings),
// Availability (everyone's hours, calendars and who's away, which forms and booking pages both read), Booking page,
// and Links and polls (Stripe and webhooks live in Settings). Get set up (then Connect your calendar) is one slim line
// under the tabs until it's done.

import { NAV, schedulingPage } from "@/lib/nav";
import { Section, type ViewProps } from "../ui";
import { MeetingsCalendar } from "../meetings/Calendar";
import { TypeEditor } from "../meetings/TypeEditor";
import { AvailabilityPage } from "./AvailabilityPage";
import { BookingPage } from "./BookingPage";
import { SetupLine } from "./Setup";
import { MailLine } from "../meetings/MailHealth";
import { LinksPage } from "./LinksPage";
import { TypesPage } from "./TypesPage";

export function SchedulingView(props: ViewProps) {
  const p = schedulingPage(props.id);
  // Each page is its own sidebar item (docs/email-canvas-plan.md Part A): its title is the item's name, no tab row.
  const title = NAV.find((n) => n.route === "scheduling" && n.page === p.page)?.label ?? "Meetings";
  const nav = { title, tabs: [], current: p.page, onPick: (t: string) => props.navigate("scheduling", t), banner: (
      <>
        <SetupLine sb={props.sb} session={props.session} ws={props.ws} navigate={props.navigate} />
        <MailLine session={props.session} ws={props.ws} />
      </>
    ),
  };
  return <Section nav={nav}>{body(props, p)}</Section>;
}

function body(props: ViewProps, p: ReturnType<typeof schedulingPage>) {
  switch (p.page) {
    case "types":
      return p.sub.endsWith("/all") ? <TypeEditor key={p.sub} {...props} id={p.sub.slice(0, -4)} /> : <TypesPage {...props} open={p.sub} />;
    case "upcoming":
      return <MeetingsCalendar {...props} />;
    case "availability":
      return <AvailabilityPage {...props} tab={p.sub} />;
    case "booking":
      return <BookingPage {...props} />;
    case "links":
      return <LinksPage {...props} />;
  }
}
