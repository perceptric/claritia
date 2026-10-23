// Calendar files for meeting emails (RFC 5545; docs/meetings-scheduler.md 1.7). One UID per meeting for its whole
// life, so the guest's calendar updates the same entry when it moves and removes it when it's canceled; SEQUENCE goes
// up with each change, so a late, older invite never wins over a newer one. Times are written in UTC (the "Z" form),
// which every calendar reads as the same instant, so daylight saving can't shift them.

export type IcsPerson = { email: string; name?: string | null };

export type IcsEvent = {
  /** The meeting id: the UID is made from it. */
  meetingId: string;
  /** Counts the meeting's changes (moves and the cancel); see icsSequence. */
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: number;
  end: number;
  /** When this file was made. */
  stamp: number;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  organizer: IcsPerson;
  /** The guest first, then the other hosts. */
  attendees: IcsPerson[];
};

/** The meeting's UID: the same in every invite, update and cancel. */
export const meetingUid = (meetingId: string) => `${meetingId.toLowerCase()}@meetings.tryclaritia.com`;

/** SEQUENCE: how many times the meeting changed, from its history (meeting_events kinds). Never goes down. */
export const icsSequence = (kinds: string[]) => kinds.filter((k) => k === "moved" || k === "canceled").length;

/** 20261103T150000Z */
export function utc(ms: number): string {
  if (!Number.isFinite(ms)) throw new Error("Not a time");
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A TEXT value: backslash, semicolon, comma and line breaks escaped (RFC 5545 3.3.11). */
export function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** A parameter value (CN): quoted, with the characters a quoted value can't hold dropped. */
const param = (s: string) => `"${s.replace(/["\r\n\x00-\x1f]/g, "").trim()}"`;

/** An address for mailto: with nothing that could break the line. */
const mailto = (email: string) => `mailto:${email.replace(/[\s"<>;,:\\]/g, "")}`;

/** Lines longer than 75 octets go on over several, each going on with one space; UTF-8 characters are never split. */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    const limit = out.length ? 74 : 75;
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function person(prop: "ORGANIZER" | "ATTENDEE", p: IcsPerson, extra: string[] = []): string {
  const name = p.name?.trim();
  return `${[prop, ...(name ? [`CN=${param(name)}`] : []), ...extra].join(";")}:${mailto(p.email)}`;
}

/** The calendar file: one event, CRLF line ends, folded. */
export function buildIcs(e: IcsEvent): string {
  if (!(e.end > e.start)) throw new Error("A meeting ends after it starts");
  const cancel = e.method === "CANCEL";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Claritia//Meetings//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${meetingUid(e.meetingId)}`,
    `SEQUENCE:${Math.max(0, Math.floor(e.sequence))}`,
    `DTSTAMP:${utc(e.stamp)}`,
    `DTSTART:${utc(e.start)}`,
    `DTEND:${utc(e.end)}`,
    `SUMMARY:${icsText(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.url && /^https:\/\/[^\s]+$/.test(e.url) ? [`URL:${e.url}`] : []),
    person("ORGANIZER", e.organizer),
    ...e.attendees.map((a, i) => person("ATTENDEE", a, ["ROLE=REQ-PARTICIPANT", `PARTSTAT=${i === 0 ? "NEEDS-ACTION" : "ACCEPTED"}`, "RSVP=FALSE"])),
    `STATUS:${cancel ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
