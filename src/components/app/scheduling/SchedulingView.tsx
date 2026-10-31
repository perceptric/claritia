"use client";

// Inbound › Meetings (route "scheduling", once Calendar): Meetings (what people can book, one card each; a card opens
// its panel, or the full editor at types/<id>/all), Upcoming (every meeting on the calendar, once CRM › Meetings),
// Availability (everyone's hours, calendars and who's away, which forms and booking pages both read), Booking page,
// Links and polls, and Settings (Payments and Webhooks). Connect your calendar is one slim line under the
// tabs until a calendar is connected.

import { schedulingPage, SCHEDULING_TABS } from "@/lib/nav";
import { Section, type ViewProps } from "../ui";
import { MeetingsCalendar } from "../meetings/Calendar";
import { TypeEditor } from "../meetings/TypeEditor";
import { AvailabilityPage } from "./AvailabilityPage";
import { BookingPage } from "./BookingPage";
import { ConnectCalendar } from "./ConnectCalendar";
import { LinksPage } from "./LinksPage";
import { SettingsPage } from "./SettingsPage";
import { TypesPage } from "./TypesPage";

const TABS = SCHEDULING_TABS.map((t) => ({ value: t.value, label: t.label }));

export function SchedulingView(props: ViewProps) {
  const p = schedulingPage(props.id);
  const nav = { title: "Meetings", tabs: TABS, current: p.page, onPick: (t: string) => props.navigate("scheduling", t), banner: <ConnectCalendar sb={props.sb} session={props.session} ws={props.ws} /> };
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
    case "settings":
      return <SettingsPage {...props} sub={p.sub} />;
  }
}
