// System emails (docs/system-emails.md): the emails Claritia sends for every meeting, as designs a team can change on
// the Emails canvas. Each workspace has one of each (emails kind 'system', 164_system_emails.sql), made from the
// designs here the first time Emails opens. Their merge fields are filled for each meeting when it sends
// (src/lib/meetings/systemSend.ts); parts that need a value (a join link, answers, a reschedule link) show only when
// the meeting has one. Runs in the browser and on the server.

import type { Block, EmailCond, EmailDoc, Section } from "../design/email/doc.ts";
import { MERGE } from "../workflows/merge.ts";

export const SYSTEM_KEYS = ["confirm", "update", "cancel", "reminder", "no_show", "book_later", "host_booked", "host_moved", "host_canceled", "after"] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];
export const isSystemKey = (k: unknown): k is SystemKey => (SYSTEM_KEYS as readonly unknown[]).includes(k);

/**
 * Each email: its name on the canvas, who gets it, and whether it can be turned off. The confirmation, the moved and
 * the canceled emails carry the calendar invite, so they always go.
 */
export const SYSTEM_META: Record<SystemKey, { name: string; to: "guest" | "host"; required: boolean }> = {
  confirm: { name: "Booking confirmed", to: "guest", required: true },
  update: { name: "Meeting moved", to: "guest", required: true },
  cancel: { name: "Meeting canceled", to: "guest", required: true },
  reminder: { name: "Reminder", to: "guest", required: false },
  no_show: { name: "No-show follow-up", to: "guest", required: false },
  book_later: { name: "Pick a time", to: "guest", required: false },
  host_booked: { name: "New booking for the host", to: "host", required: false },
  host_moved: { name: "Moved booking for the host", to: "host", required: false },
  host_canceled: { name: "Canceled booking for the host", to: "host", required: false },
  after: { name: "How did it go, for the host", to: "host", required: false },
};

/** The merge fields a System email can use, with the words Insert data shows. */
export const SYSTEM_FIELDS = {
  first_name: "Guest's first name",
  guest_name: "Guest's name",
  guest_email: "Guest's email",
  host_name: "Host's name",
  meeting_name: "Meeting name",
  meeting_time: "Meeting time",
  meeting_date: "Meeting date",
  meeting_clock: "Start and end time",
  meeting_month: "Month",
  meeting_day: "Day of the month",
  meeting_length: "Meeting length",
  meeting_where: "Where",
  meeting_link: "Join link",
  reschedule_link: "Reschedule link",
  calendar_google: "Google Calendar link",
  calendar_outlook: "Outlook link",
  about: "Meeting description",
  answers: "Their answers",
  old_time: "Old time",
  cancel_reason: "Cancel reason",
  book_link: "Booking link",
  time_left: "Time left",
  held_link: "Held link",
  no_show_link: "No-show link",
  open_times: "Open times",
  workspace: "Workspace name",
} as const;
export type SystemField = keyof typeof SYSTEM_FIELDS;
/** Fields whose value is HTML made (and escaped) by the sender: lists of answers and times, a description's lines. */
export const HTML_FIELDS: readonly SystemField[] = ["answers", "open_times", "about"];

/** The fields each email has a value for. */
export const FIELDS_FOR: Record<SystemKey, SystemField[]> = (() => {
  const meeting: SystemField[] = ["first_name", "guest_name", "guest_email", "host_name", "meeting_name", "meeting_time", "meeting_date", "meeting_clock", "meeting_month", "meeting_day", "meeting_length", "meeting_where", "meeting_link", "about", "answers", "workspace"];
  const guest: SystemField[] = [...meeting, "reschedule_link", "calendar_google", "calendar_outlook"];
  const times: SystemField[] = ["first_name", "guest_name", "guest_email", "host_name", "meeting_name", "book_link", "open_times", "workspace"];
  return {
    confirm: guest,
    update: [...guest, "old_time"],
    cancel: [...meeting, "cancel_reason", "book_link"],
    reminder: [...guest, "time_left"],
    no_show: times,
    book_later: times,
    host_booked: meeting,
    host_moved: [...meeting, "old_time"],
    host_canceled: [...meeting, "cancel_reason"],
    after: [...meeting, "held_link", "no_show_link"],
  };
})();

// The starting designs ---------------------------------------------------------------------------------------------
//
// One calm layout for every email (docs/brand.md): a small green status line, a big heading and one line under it,
// then the meeting on a tinted band (a calendar tile with the month and day beside the meeting, its date, time and
// place), pill buttons, quiet label-and-value rows, and a centered footer. Everything is ordinary blocks and styles,
// so a team changes any of it on the canvas.

type Styles = NonNullable<EmailDoc["styles"]>;
type Decls = Record<string, string>;
const SIGNAL = "#0c8c5e";
const PAPER = "#f6f6f3";
const LINE = "#e8e8e4";
const corners = (r: string): Decls => ({ "border-top-left-radius": r, "border-top-right-radius": r, "border-bottom-left-radius": r, "border-bottom-right-radius": r });
const frame = (c: string): Decls =>
  Object.fromEntries((["top", "right", "bottom", "left"] as const).flatMap((s) => [[`border-${s}-width`, "1px"], [`border-${s}-style`, "solid"], [`border-${s}-color`, c]]));
const pad = (t: string, r: string, b = t, l = r): Decls => ({ "padding-top": t, "padding-right": r, "padding-bottom": b, "padding-left": l });

/** Builds one email: element ids (short, fixed, unique within it) and their styles. */
function maker(prefix: string) {
  let n = 0;
  const styles: Styles = { email: { content: { base: { ...corners("20px") } } } };
  const id = () => `${prefix}${(n++).toString(36)}`;
  const style = (el: string, part: string, base: Decls) => {
    styles[el] = { ...(styles[el] ?? {}), [part]: { base } } as Styles[string];
  };
  const sec = (blocks: Block[], o: { showIf?: EmailCond; look?: Decls } = {}): Section => {
    const s: Section = { id: id(), stackOnPhone: true, columns: [{ id: id(), width: 100, blocks }], ...(o.showIf ? { showIf: o.showIf } : {}) };
    style(s.id, "section", { ...pad("8px", "40px"), ...(o.look ?? {}) });
    return s;
  };
  const text = (html: string, look?: Decls, showIf?: EmailCond): Block => {
    const b: Block = { id: id(), type: "text", html, ...(showIf ? { showIf } : {}) };
    if (look) style(b.id, "text", look);
    return b;
  };
  const button = (label: string, url: string, o: { secondary?: boolean; showIf?: EmailCond } = {}): Block => {
    const b: Block = { id: id(), type: "button", label, url, align: "left", ...(o.showIf ? { showIf: o.showIf } : {}) };
    style(b.id, "button", { ...corners("999px"), "font-size": "15px", "font-weight": "600", ...pad("12px", "22px"), "margin-top": "4px", "margin-bottom": "4px", ...(o.secondary ? { "background-color": "#ffffff", color: "$text", ...frame(LINE), ...pad("11px", "20px") } : {}) });
    return b;
  };
  return { id, styles, style, sec, text, button };
}
type Make = ReturnType<typeof maker>;
const known = (field: EmailCond["field"]): EmailCond => ({ field, op: "is_set" });

/** The status line and heading at the top. */
function hero(m: Make, status: string, title: string, sub: string, tone: "signal" | "muted" = "signal"): Section {
  const h: Block = { id: m.id(), type: "heading", text: title, level: 1 };
  m.style(h.id, "heading", { "font-size": "30px", "line-height": "1.15", "letter-spacing": "-0.02em", "margin-bottom": "10px" });
  return m.sec([m.text(`<p>${status}</p>`, { "font-size": "13px", "font-weight": "600", color: tone === "signal" ? SIGNAL : "$muted", "margin-bottom": "12px" }), h, m.text(`<p>${sub}</p>`, { "font-size": "16px", color: "$muted", "line-height": "1.55" })], { look: pad("40px", "40px", "20px") });
}

/** The meeting on a tinted band: a calendar tile beside its name, date, time and place. */
function band(m: Make, title: string, o: { struck?: boolean } = {}): Section {
  const tile = m.text("<p>{{meeting_month}}</p>", { "font-size": "12px", "font-weight": "600", "text-transform": "uppercase", "letter-spacing": "0.06em", color: "#ffffff", "background-color": o.struck ? "#8a8a85" : SIGNAL, "text-align": "center", ...pad("4px", "0px"), "border-top-left-radius": "12px", "border-top-right-radius": "12px" });
  const day = m.text("<p>{{meeting_day}}</p>", { "font-size": "28px", "font-weight": "600", "line-height": "1.2", "text-align": "center", "background-color": "#ffffff", ...pad("8px", "0px", "10px"), "border-bottom-left-radius": "12px", "border-bottom-right-radius": "12px", ...frame(LINE), "border-top-width": "0px" });
  const strike: Decls = o.struck ? { "text-decoration-line": "line-through" } : {};
  const indent: Decls = { "padding-left": "18px" };
  const name = m.text(`<p>${title}</p>`, { "font-size": "17px", "font-weight": "600", "line-height": "1.35", ...indent, ...strike });
  const when = m.text("<p>{{meeting_date}}<br>{{meeting_clock}} ({{meeting_length}})</p>", { "font-size": "15px", color: "$text", "line-height": "1.5", "padding-top": "4px", ...indent, ...strike });
  const where = m.text("<p>{{meeting_where}}</p>", { "font-size": "14px", color: "$muted", "padding-top": "4px", ...indent });
  const s: Section = {
    id: m.id(),
    stackOnPhone: false,
    columns: [
      { id: m.id(), width: 16, blocks: [tile, day] },
      { id: m.id(), width: 84, blocks: [name, when, where] },
    ],
  };
  m.style(s.id, "section", { ...pad("24px", "40px"), "background-color": PAPER, "border-top-width": "1px", "border-top-style": "solid", "border-top-color": LINE, "border-bottom-width": "1px", "border-bottom-style": "solid", "border-bottom-color": LINE });
  return s;
}

/** A small gray label over rows of answers, a description or open times. */
function block(m: Make, label: string, html: string, field: EmailCond["field"]): Section {
  return m.sec([m.text(`<p>${label}</p>`, { "font-size": "13px", "font-weight": "600", color: "$muted", "margin-bottom": "6px" }), m.text(`<p>${html}</p>`, { "font-size": "15px", "line-height": "1.65" })], { showIf: known(field), look: pad("14px", "40px") });
}

const joinSec = (m: Make) => m.sec([m.button("Join the meeting", "{{meeting_link}}")], { showIf: known("meeting_link"), look: pad("24px", "40px", "4px") });
/** Add to calendar: two quiet pills side by side, and a word about the attached invite. */
function calendarSec(m: Make): Section[] {
  const s: Section = {
    id: m.id(),
    stackOnPhone: true,
    columns: [
      { id: m.id(), width: 35, blocks: [m.button("Google Calendar", "{{calendar_google}}", { secondary: true })] },
      { id: m.id(), width: 65, blocks: [m.button("Outlook", "{{calendar_outlook}}", { secondary: true })] },
    ],
  };
  m.style(s.id, "section", pad("4px", "40px", "0px"));
  return [m.sec([m.text("<p>Add to calendar</p>", { "font-size": "13px", "font-weight": "600", color: "$muted" })], { look: pad("20px", "40px", "2px") }), s, m.sec([m.text("<p>Apple Calendar and others: open the attached invite.</p>", { "font-size": "13px", color: "$muted" })], { look: pad("2px", "40px", "8px") })];
}
const manageSec = (m: Make) =>
  m.sec([m.text('<p>Need to make a change? <a href="{{reschedule_link}}">Reschedule</a> or <a href="{{reschedule_link}}">cancel</a>.</p>', { "font-size": "14px", color: "$muted" })], { showIf: known("reschedule_link"), look: { ...pad("20px", "40px"), "border-top-width": "1px", "border-top-style": "solid", "border-top-color": LINE } });
const footerSec = (m: Make, why = "because you booked a meeting") =>
  m.sec([m.text(`<p>Sent for {{workspace}} ${why}.<br>Scheduled with <a href="https://tryclaritia.com">Claritia</a></p>`, { "font-size": "12px", color: "$muted", "text-align": "center", "line-height": "1.6" })], { look: pad("24px", "40px", "32px") });
const lineSec = (m: Make, html: string, showIf?: EmailCond) => m.sec([m.text(`<p>${html}</p>`, { "font-size": "15px", "line-height": "1.6" })], { showIf, look: pad("14px", "40px", "0px") });

const doc = (m: Make, preheader: string, sections: Section[]): EmailDoc => ({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader, lang: "en" }, sections, styles: m.styles });

/** The subject, preheader and design each email starts with. */
export function systemDefault(key: SystemKey): { subject: string; doc: EmailDoc } {
  const m = maker(key.replace(/_/g, "").slice(0, 6));
  switch (key) {
    case "confirm":
      return {
        subject: "Confirmed: {{meeting_name}} with {{host_name}} on {{meeting_time}}",
        doc: doc(m, "{{meeting_time}} with {{host_name}}", [
          hero(m, "Confirmed", "Your meeting is booked", "Hi {{first_name|there}}, you're all set with {{host_name}}. Everything you need is below."),
          band(m, "{{meeting_name}} with {{host_name}}"),
          joinSec(m),
          ...calendarSec(m),
          block(m, "About this meeting", "{{about}}", "about"),
          block(m, "Your answers", "{{answers}}", "answers"),
          manageSec(m),
          footerSec(m),
        ]),
      };
    case "update":
      return {
        subject: "Updated: {{meeting_name}} with {{host_name}} is now {{meeting_time}}",
        doc: doc(m, "Now {{meeting_time}}", [
          hero(m, "New time", "Your meeting moved", "Hi {{first_name|there}}, here's the new time with {{host_name}}."),
          band(m, "{{meeting_name}} with {{host_name}}"),
          lineSec(m, "It was {{old_time}}.", known("old_time")),
          joinSec(m),
          ...calendarSec(m),
          manageSec(m),
          footerSec(m),
        ]),
      };
    case "cancel":
      return {
        subject: "Canceled: {{meeting_name}} with {{host_name}} on {{meeting_time}}",
        doc: doc(m, "{{meeting_time}} is canceled", [
          hero(m, "Canceled", "Your meeting is canceled", "Hi {{first_name|there}}, this meeting is off your calendar.", "muted"),
          band(m, "{{meeting_name}} with {{host_name}}", { struck: true }),
          lineSec(m, "Reason: {{cancel_reason}}", known("cancel_reason")),
          m.sec([m.button("Book a new time", "{{book_link}}")], { showIf: known("book_link"), look: pad("24px", "40px", "8px") }),
          footerSec(m),
        ]),
      };
    case "reminder":
      return {
        subject: "Reminder: {{meeting_name}} with {{host_name}} {{time_left}}",
        doc: doc(m, "{{meeting_time}}", [
          hero(m, "Reminder", "Your meeting is {{time_left}}", "Hi {{first_name|there}}, see you soon."),
          band(m, "{{meeting_name}} with {{host_name}}"),
          joinSec(m),
          manageSec(m),
          footerSec(m),
        ]),
      };
    case "no_show":
      return {
        subject: "Pick a new time with {{host_name}}",
        doc: doc(m, "Book {{meeting_name}} again", [
          hero(m, "Let's try again", "Pick a new time with {{host_name}}", "Hi {{first_name|there}}, we missed you at {{meeting_name}}. Book a new time when it suits you."),
          block(m, "Open times", "{{open_times}}", "open_times"),
          m.sec([m.button("Pick a time", "{{book_link}}")], { look: pad("20px", "40px", "8px") }),
          footerSec(m, "because you booked a meeting"),
        ]),
      };
    case "book_later":
      return {
        subject: "Pick a time with {{host_name}}",
        doc: doc(m, "Book {{meeting_name}}", [
          hero(m, "One more step", "Pick a time with {{host_name}}", "Hi {{first_name|there}}, thanks for getting in touch. Book {{meeting_name}} at a time that suits you."),
          block(m, "Open times", "{{open_times}}", "open_times"),
          m.sec([m.button("Pick a time", "{{book_link}}")], { look: pad("20px", "40px", "8px") }),
          footerSec(m, "because you got in touch"),
        ]),
      };
    case "host_booked":
      return {
        subject: "New meeting: {{guest_name}} on {{meeting_time}}",
        doc: doc(m, "{{meeting_name}}, {{meeting_time}}", [
          hero(m, "New booking", "{{guest_name}} booked {{meeting_name}}", "{{guest_email}}"),
          band(m, "{{meeting_name}} with {{guest_name}}"),
          joinSec(m),
          block(m, "Their answers", "{{answers}}", "answers"),
          m.sec([], { look: pad("12px", "40px") }),
        ]),
      };
    case "host_moved":
      return {
        subject: "Moved: {{guest_name}} is now {{meeting_time}}",
        doc: doc(m, "{{meeting_name}}, now {{meeting_time}}", [
          hero(m, "New time", "{{guest_name}} moved {{meeting_name}}", "{{guest_email}}"),
          band(m, "{{meeting_name}} with {{guest_name}}"),
          lineSec(m, "It was {{old_time}}.", known("old_time")),
          m.sec([], { look: pad("12px", "40px") }),
        ]),
      };
    case "host_canceled":
      return {
        subject: "Canceled: {{guest_name}} on {{meeting_time}}",
        doc: doc(m, "{{meeting_name}}, {{meeting_time}}", [
          hero(m, "Canceled", "{{meeting_name}} with {{guest_name}} is canceled", "{{guest_email}}", "muted"),
          band(m, "{{meeting_name}} with {{guest_name}}", { struck: true }),
          lineSec(m, "Reason: {{cancel_reason}}", known("cancel_reason")),
          m.sec([], { look: pad("12px", "40px") }),
        ]),
      };
    case "after": {
      const s: Section = {
        id: m.id(),
        stackOnPhone: true,
        columns: [
          { id: m.id(), width: 18, blocks: [m.button("Held", "{{held_link}}")] },
          { id: m.id(), width: 82, blocks: [m.button("No-show", "{{no_show_link}}", { secondary: true })] },
        ],
      };
      m.style(s.id, "section", pad("24px", "40px", "4px"));
      return {
        subject: "How did it go with {{guest_name}}?",
        doc: doc(m, "{{meeting_name}}, {{meeting_time}}", [
          hero(m, "Follow-up", "How did it go with {{guest_name}}?", "Mark the meeting so your reports stay right."),
          band(m, "{{meeting_name}} with {{guest_name}}"),
          s,
          m.sec([m.text("<p>Meetings not marked within 24 hours count as held.</p>", { "font-size": "13px", color: "$muted" })], { look: pad("8px", "40px", "32px") }),
        ]),
      };
    }
  }
}

/** What system_email_ensure takes: every email, in order, as it starts. */
export const systemEnsurePayload = () => SYSTEM_KEYS.map((key) => ({ key, name: SYSTEM_META[key].name, ...systemDefault(key), preheader: systemDefault(key).doc.settings.preheader }));

/** Sample values, for the canvas and the Test send: a 30-minute call tomorrow at 10:00 AM. */
export function sampleVars(now = Date.now()): Record<SystemField, string> {
  const at = new Date(now + 86_400_000);
  at.setHours(10, 0, 0, 0);
  const when = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(at);
  return {
    first_name: "Sam",
    guest_name: "Sam Lee",
    guest_email: "sam@example.com",
    host_name: "Alex Kim",
    meeting_name: "Intro call",
    meeting_time: when,
    meeting_date: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(at),
    meeting_clock: `${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(at)} – ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(at.getTime() + 1_800_000))}`,
    meeting_month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(at),
    meeting_day: String(at.getDate()),
    meeting_length: "30 min",
    meeting_where: "Google Meet",
    meeting_link: "https://meet.google.com/abc-defg-hij",
    reschedule_link: "https://app.tryclaritia.com/m/sample",
    calendar_google: "https://calendar.google.com/calendar/render",
    calendar_outlook: "https://outlook.live.com/calendar/0/action/compose",
    about: "A short call to see if we're a fit.",
    answers: "<strong>Company</strong>: Acme<br><strong>Team size</strong>: 11 to 50",
    old_time: when,
    cancel_reason: "Something came up",
    book_link: "https://app.tryclaritia.com/book/sample",
    time_left: "tomorrow",
    held_link: "https://app.tryclaritia.com/o/sample",
    no_show_link: "https://app.tryclaritia.com/o/sample",
    open_times: "Tue, Nov 17, 10:00 AM<br>Tue, Nov 17, 2:30 PM<br>Wed, Nov 18, 9:00 AM",
    workspace: "Acme",
  };
}

const escHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A System email's HTML as the canvas shows it: every merge field with its sample value. */
export function sampleFill(html: string, now?: number): string {
  const s = sampleVars(now) as Record<string, string>;
  return html.replace(MERGE, (_m, k: string, f?: string) =>
    k in s ? (HTML_FIELDS.includes(k as SystemField) ? s[k]! : escHtml(s[k]!)) : k === "unsubscribe_url" ? "#" : k === "company_address" ? "" : escHtml((f ?? "").trim()),
  );
}
