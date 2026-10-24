"use client";

// Scheduling (docs/app-structure.md Part 6): one sidebar item per page. Meeting types (and one type's editor),
// Availability, Links and polls, Booking forms, Reminders, Payments, and the two coming soon (AI scheduler, Notetaker)
// with a first screen saying what they'll do.

import { schedulingPage } from "@/lib/nav";
import { Sparkle } from "../../Icons";
import { AiMark } from "../Ai";
import { ToolIntro } from "../ToolIntro";
import { Badge, Page, type ViewProps } from "../ui";
import { Payments } from "../meetings/Payments";
import { TypeEditor } from "../meetings/TypeEditor";
import { AvailabilityPage } from "./AvailabilityPage";
import { BookingFormsPage } from "./BookingFormsPage";
import { LinksPage } from "./LinksPage";
import { RemindersPage } from "./RemindersPage";
import { TypesPage } from "./TypesPage";

export function SchedulingView(props: ViewProps) {
  const p = schedulingPage(props.id);
  switch (p.page) {
    case "types":
      return p.sub ? <TypeEditor key={p.sub} {...props} id={p.sub} /> : <TypesPage {...props} />;
    case "availability":
      return <AvailabilityPage {...props} tab={p.sub} />;
    case "links":
      return <LinksPage {...props} />;
    case "forms":
      return <BookingFormsPage {...props} />;
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
    case "ai":
      return (
        <Soon title="AI scheduler">
          <ToolIntro
            sketch="envelopes"
            title={"Copy one address,\nand the meeting books itself"}
            lead="Copy schedule@ on any email thread. Claude reads it, offers times from your calendar, handles “can we move it”, and books the meeting on the lead and the deal."
          />
        </Soon>
      );
    case "notetaker":
      return (
        <Soon title="Notetaker">
          <ToolIntro
            sketch="calendar"
            title={"Every call,\nwritten up on the deal"}
            lead="A notetaker joins your Google Meet, Zoom and Teams calls. Claude writes the notes and next steps onto the meeting, the contact and the opportunity."
          />
        </Soon>
      );
  }
}

function Soon({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Page
      title={title}
      actions={
        <span className="flex items-center gap-2">
          <AiMark />
          <Badge tone="violet">
            <Sparkle size={11} />
            Soon
          </Badge>
        </span>
      }
    >
      {children}
    </Page>
  );
}
