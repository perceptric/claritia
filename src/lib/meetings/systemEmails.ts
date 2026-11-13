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
  const meeting: SystemField[] = ["first_name", "guest_name", "guest_email", "host_name", "meeting_name", "meeting_time", "meeting_length", "meeting_where", "meeting_link", "about", "answers", "workspace"];
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

/** Ids for one email's elements: short, fixed and unique within it. */
function ids(prefix: string) {
  let n = 0;
  return () => `${prefix}${(n++).toString(36)}`;
}

type Make = () => string;
const heading = (id: Make, text: string, level: 1 | 3 = 1): Block => ({ id: id(), type: "heading", text, level });
const text = (id: Make, html: string, showIf?: EmailCond): Block => ({ id: id(), type: "text", html, ...(showIf ? { showIf } : {}) });
const button = (id: Make, label: string, url: string, showIf?: EmailCond): Block => ({ id: id(), type: "button", label, url, align: "left", ...(showIf ? { showIf } : {}) });
const known = (field: EmailCond["field"]): EmailCond => ({ field, op: "is_set" });
const section = (id: Make, blocks: Block[], showIf?: EmailCond): Section => ({ id: id(), stackOnPhone: true, columns: [{ id: id(), width: 100, blocks }], ...(showIf ? { showIf } : {}) });
/** The meeting card: the meeting, its time and length, and where. */
const card = (id: Make, title: string): Block => ({ id: id(), type: "event", title, when: "{{meeting_time}} ({{meeting_length}})", where: "{{meeting_where}}", url: "", button: "" });
const join = (id: Make) => button(id, "Join the meeting", "{{meeting_link}}", known("meeting_link"));
const calendar = (id: Make) =>
  text(id, '<p>Add it to <a href="{{calendar_google}}">Google Calendar</a> or <a href="{{calendar_outlook}}">Outlook</a>. For Apple Calendar and others, open the attached invite.</p>');
const manage = (id: Make) => section(id, [{ id: id(), type: "divider" }, text(id, '<p>Need to make a change? <a href="{{reschedule_link}}">Reschedule or cancel</a></p>')], known("reschedule_link"));
const answers = (id: Make, title: string) => section(id, [heading(id, title, 3), text(id, "<p>{{answers}}</p>")], known("answers"));
const footer = (id: Make) => section(id, [text(id, "<p>Sent for {{workspace}} because you booked a meeting.</p>")]);
const base = (decls: Record<string, string>) => ({ base: decls });
const corners = (r: string) => ({ "border-top-left-radius": r, "border-top-right-radius": r, "border-bottom-left-radius": r, "border-bottom-right-radius": r });
const frame = { "border-top-width": "1px", "border-top-style": "solid", "border-top-color": "$border", "border-right-width": "1px", "border-right-style": "solid", "border-right-color": "$border", "border-bottom-width": "1px", "border-bottom-style": "solid", "border-bottom-color": "$border", "border-left-width": "1px", "border-left-style": "solid", "border-left-color": "$border" };
const SMALL = /Sent for|count as held|For Apple Calendar/;

/** The look meeting emails had: a framed meeting card, small gray labels, pill buttons and a quiet footer line. */
function styled(sections: Section[]): EmailDoc["styles"] {
  const out: NonNullable<EmailDoc["styles"]> = { email: { content: base({ ...corners("16px") }) } };
  for (const s of sections)
    for (const c of s.columns)
      for (const b of c.blocks) {
        if (b.type === "heading") out[b.id] = { heading: base(b.level === 1 ? { "font-size": "24px", "margin-bottom": "10px" } : { "font-size": "13px", color: "$muted", "margin-bottom": "6px" }) };
        else if (b.type === "event") out[b.id] = { card: base({ ...corners("12px"), ...frame, "padding-top": "16px", "padding-bottom": "16px", "padding-left": "18px", "padding-right": "18px", "margin-top": "12px", "margin-bottom": "12px" }), "card-title": base({ "font-size": "17px" }) };
        else if (b.type === "button") out[b.id] = { button: base({ ...corners("999px"), "font-size": "15px", "margin-top": "4px", "margin-bottom": "4px" }) };
        else if (b.type === "text" && SMALL.test(b.html)) out[b.id] = { text: base({ "font-size": "13px", color: "$muted" }) };
      }
  return out;
}
const doc = (preheader: string, sections: Section[]): EmailDoc => ({ v: 1, settings: { width: 600, align: "center", darkMode: "auto", preheader, lang: "en" }, sections, styles: styled(sections) });

/** The subject, preheader and design each email starts with: the same words Claritia sent before System emails. */
export function systemDefault(key: SystemKey): { subject: string; doc: EmailDoc } {
  const id = ids(key.replace(/_/g, "").slice(0, 6));
  switch (key) {
    case "confirm":
      return {
        subject: "Confirmed: {{meeting_name}} with {{host_name}} on {{meeting_time}}",
        doc: doc("{{meeting_time}} with {{host_name}}", [
          section(id, [heading(id, "Your meeting is booked"), text(id, "<p>Hi {{first_name|there}}, you're booked with {{host_name}}.</p>"), card(id, "{{meeting_name}} with {{host_name}}"), join(id)]),
          section(id, [heading(id, "About this meeting", 3), text(id, "<p>{{about}}</p>")], known("about")),
          answers(id, "Your answers"),
          section(id, [calendar(id)]),
          manage(id),
          footer(id),
        ]),
      };
    case "update":
      return {
        subject: "Updated: {{meeting_name}} with {{host_name}} is now {{meeting_time}}",
        doc: doc("Now {{meeting_time}}", [
          section(id, [heading(id, "Your meeting moved"), text(id, "<p>Hi {{first_name|there}}, here's the new time.</p>"), card(id, "{{meeting_name}} with {{host_name}}"), text(id, "<p>It was {{old_time}}.</p>", known("old_time")), join(id)]),
          section(id, [calendar(id)]),
          manage(id),
          footer(id),
        ]),
      };
    case "cancel":
      return {
        subject: "Canceled: {{meeting_name}} with {{host_name}} on {{meeting_time}}",
        doc: doc("{{meeting_time}} is canceled", [
          section(id, [
            heading(id, "Your meeting is canceled"),
            text(id, "<p>Hi {{first_name|there}}, this meeting is canceled.</p>"),
            card(id, "{{meeting_name}} with {{host_name}}"),
            text(id, "<p>Reason: {{cancel_reason}}</p>", known("cancel_reason")),
            button(id, "Book a new time", "{{book_link}}", known("book_link")),
          ]),
          footer(id),
        ]),
      };
    case "reminder":
      return {
        subject: "Reminder: {{meeting_name}} with {{host_name}} {{time_left}}",
        doc: doc("{{meeting_time}}", [
          section(id, [heading(id, "Your meeting is {{time_left}}"), text(id, "<p>Hi {{first_name|there}}, see you soon.</p>"), card(id, "{{meeting_name}} with {{host_name}}"), join(id)]),
          manage(id),
          footer(id),
        ]),
      };
    case "no_show":
      return {
        subject: "Pick a new time with {{host_name}}",
        doc: doc("Book {{meeting_name}} again", [
          section(id, [heading(id, "Pick a new time with {{host_name}}"), text(id, "<p>Hi {{first_name|there}}, we missed you at {{meeting_name}}. Book a new time when it suits you.</p>")]),
          section(id, [text(id, "<p>Open times with {{host_name}}:</p><p>{{open_times}}</p>")], known("open_times")),
          section(id, [button(id, "Pick a time", "{{book_link}}")]),
        ]),
      };
    case "book_later":
      return {
        subject: "Pick a time with {{host_name}}",
        doc: doc("Book {{meeting_name}}", [
          section(id, [heading(id, "Pick a time with {{host_name}}"), text(id, "<p>Hi {{first_name|there}}, thanks for getting in touch. Book {{meeting_name}} at a time that suits you.</p>")]),
          section(id, [text(id, "<p>Open times with {{host_name}}:</p><p>{{open_times}}</p>")], known("open_times")),
          section(id, [button(id, "Pick a time", "{{book_link}}")]),
        ]),
      };
    case "host_booked":
      return {
        subject: "New meeting: {{guest_name}} on {{meeting_time}}",
        doc: doc("{{meeting_name}}, {{meeting_time}}", [
          section(id, [heading(id, "{{guest_name}} booked {{meeting_name}}"), card(id, "{{meeting_name}} with {{guest_name}}"), text(id, "<p>Guest: {{guest_email}}</p>"), join(id)]),
          answers(id, "Their answers"),
        ]),
      };
    case "host_moved":
      return {
        subject: "Moved: {{guest_name}} is now {{meeting_time}}",
        doc: doc("{{meeting_name}}, now {{meeting_time}}", [
          section(id, [heading(id, "{{guest_name}} moved {{meeting_name}}"), card(id, "{{meeting_name}} with {{guest_name}}"), text(id, "<p>It was {{old_time}}.</p>", known("old_time")), text(id, "<p>Guest: {{guest_email}}</p>")]),
        ]),
      };
    case "host_canceled":
      return {
        subject: "Canceled: {{guest_name}} on {{meeting_time}}",
        doc: doc("{{meeting_name}}, {{meeting_time}}", [
          section(id, [heading(id, "{{meeting_name}} with {{guest_name}} is canceled"), card(id, "{{meeting_name}} with {{guest_name}}"), text(id, "<p>Guest: {{guest_email}}</p>"), text(id, "<p>Reason: {{cancel_reason}}</p>", known("cancel_reason"))]),
        ]),
      };
    case "after":
      return {
        subject: "How did it go with {{guest_name}}?",
        doc: doc("{{meeting_name}}, {{meeting_time}}", [
          section(id, [
            heading(id, "How did it go with {{guest_name}}?"),
            card(id, "{{meeting_name}} with {{guest_name}}"),
            button(id, "Held", "{{held_link}}"),
            button(id, "No-show", "{{no_show_link}}"),
            text(id, "<p>Meetings not marked within 24 hours count as held.</p>"),
          ]),
        ]),
      };
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
