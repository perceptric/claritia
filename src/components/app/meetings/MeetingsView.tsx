"use client";

// One meeting at its own page (/meetings/<id>); the calendar of every meeting (Calendar.tsx) is Meetings › Upcoming.
// Meeting types are Meetings › Meetings (/scheduling/types).

import { meetingsPage } from "@/lib/nav";
import type { ViewProps } from "../ui";
import { MeetingsCalendar } from "./Calendar";
import { MeetingPage } from "./MeetingPage";
import type { MeetingRow } from "./model";

export type Meeting = MeetingRow & {
  guest_email: string;
  guest_name: string | null;
  guest_tz: string | null;
  contact_id: string | null;
  contact: { id: string; first_name: string | null; last_name: string | null; company: { name: string | null; domain: string | null } | null } | null;
};

export const MEETING_COLUMNS =
  "id, type_id, hosts, status, source, start_at, end_at, guest_email, guest_name, guest_tz, contact_id, contact:contacts!meetings_contact_id_fkey(id, first_name, last_name, company:companies!contacts_company_id_fkey(name, domain))";

export type TypeLite = { id: string; name: string; slug: string; kind: string; lengths?: number[] };

export function MeetingsView(props: ViewProps) {
  const p = meetingsPage(props.id);
  if (p.page === "meeting") return <MeetingPage {...props} id={p.id} />;
  return <MeetingsCalendar {...props} />;
}

export const guestName = (m: Pick<Meeting, "guest_name" | "guest_email" | "contact">) =>
  m.guest_name || [m.contact?.first_name, m.contact?.last_name].filter(Boolean).join(" ") || m.guest_email;
