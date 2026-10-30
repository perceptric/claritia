"use client";

// Inbound › Calendar (docs/scheduling-plan.md Part 11): one sidebar item, with its pages as tabs with icons: Meeting
// types (one type opens in its panel, or in the full editor at types/<id>/all), Booking page, Availability, Links and
// polls, and Settings (Reminders, Payments and Webhooks). Connect your calendar is one slim line under the tabs on
// every page until a calendar is connected. Booking forms are forms, so they live in Inbound › Forms.

import { schedulingPage, SCHEDULING_TABS, type SchedulingTabIcon } from "@/lib/nav";
import { CalendarIcon, Gear, Grid, Link as LinkIcon, Monitor } from "../../Icons";
import { Section, type ViewProps } from "../ui";
import { TypeEditor } from "../meetings/TypeEditor";
import { AvailabilityPage } from "./AvailabilityPage";
import { BookingPage } from "./BookingPage";
import { ConnectCalendar } from "./ConnectCalendar";
import { LinksPage } from "./LinksPage";
import { SettingsPage } from "./SettingsPage";
import { TypesPage } from "./TypesPage";

const ICONS: Record<SchedulingTabIcon, React.ReactNode> = {
  grid: <Grid size={14} />,
  monitor: <Monitor size={14} />,
  calendar: <CalendarIcon size={14} />,
  link: <LinkIcon size={14} />,
  gear: <Gear size={14} />,
};
const TABS = SCHEDULING_TABS.map((t) => ({ value: t.value, label: t.label, icon: ICONS[t.icon] }));

export function SchedulingView(props: ViewProps) {
  const p = schedulingPage(props.id);
  const nav = { title: "Calendar", tabs: TABS, current: p.page, onPick: (t: string) => props.navigate("scheduling", t), banner: <ConnectCalendar sb={props.sb} session={props.session} ws={props.ws} /> };
  return <Section nav={nav}>{body(props, p)}</Section>;
}

function body(props: ViewProps, p: ReturnType<typeof schedulingPage>) {
  switch (p.page) {
    case "types":
      return p.sub.endsWith("/all") ? <TypeEditor key={p.sub} {...props} id={p.sub.slice(0, -4)} /> : <TypesPage {...props} open={p.sub} />;
    case "booking":
      return <BookingPage {...props} />;
    case "availability":
      return <AvailabilityPage {...props} tab={p.sub} />;
    case "links":
      return <LinksPage {...props} />;
    case "settings":
      return <SettingsPage {...props} sub={p.sub} />;
  }
}
