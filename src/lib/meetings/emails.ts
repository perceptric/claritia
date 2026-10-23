// Meeting emails (docs/meetings-scheduler.md 1.7 and 2.4): the subject, HTML and text of each, and the raw MIME
// message with the calendar file. Plain and short: what, when (in the reader's own time zone), who, where, and the
// links. Every value from a person (names, answers, addresses) is escaped. Server only.

import { fromHeader } from "../email/ses.ts";
import { validZone } from "./time.ts";
import type { Location } from "./types.ts";

export type MailParts = { subject: string; html: string; text: string };

// Times -----------------------------------------------------------------------------------------------------------

const zone = (tz: string | null | undefined) => (tz && validZone(tz) ? tz : "UTC");

/** "Tuesday, November 3 at 10:00 AM EST" in the reader's zone; the year shows when it isn't this year's. */
export function fmtWhen(ms: number, tz: string | null | undefined, now = Date.now()): string {
  const z = zone(tz);
  const year = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric" }).format(t);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: z, weekday: "long", month: "long", day: "numeric", ...(year(ms) !== year(now) ? { year: "numeric" } : {}) }).format(ms);
  return `${date} at ${fmtTime(ms, z)}`;
}

/** "10:00 AM EST" */
export function fmtTime(ms: number, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone(tz), hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(ms);
}

/** "Tue, Nov 3, 10:00 AM EST" for lists of times. */
export function fmtShort(ms: number, tz: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone(tz), weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(ms);
}

const minutes = (start: number, end: number) => Math.round((end - start) / 60_000);
const lengthOf = (start: number, end: number) => {
  const m = minutes(start, end);
  return m % 60 === 0 && m >= 60 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} min`;
};

/** "in 1 hour", "tomorrow", "in 2 days", for the reminder's subject. */
export function fromNow(min: number): string {
  if (min < 60) return `in ${min} min`;
  if (min < 1440) return min % 60 === 0 ? `in ${min / 60} hour${min === 60 ? "" : "s"}` : `in ${Math.round(min / 60)} hours`;
  if (min === 1440) return "tomorrow";
  return `in ${Math.round(min / 1440)} days`;
}

/** "Sam Lee", "Sam Lee and Alex Kim", "Sam Lee, Alex Kim and Jo Park" */
export function names(list: string[]): string {
  const l = list.filter(Boolean);
  if (l.length <= 1) return l[0] ?? "";
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

// Where -----------------------------------------------------------------------------------------------------------

export type Where = { label: string; detail?: string | null; url?: string | null };

/** The meeting's place for one reader. joinUrl is the video link made with the calendar event, when there is one. */
export function whereOf(loc: Location | Record<string, unknown> | null | undefined, o: { joinUrl?: string | null; host: string; guest: string; guestPhone?: string | null; forHost: boolean }): Where {
  const l = (loc ?? {}) as Partial<Location> & { kind?: string; number?: string; address?: string; url?: string };
  const join = o.joinUrl && /^https:\/\//.test(o.joinUrl) ? o.joinUrl : null;
  switch (l.kind) {
    case "google_meet":
      return { label: "Google Meet", url: join };
    case "teams":
      return { label: "Microsoft Teams", url: join };
    case "zoom":
      return { label: "Zoom", url: join };
    case "phone_guest":
      return { label: "Phone", detail: o.forHost ? (o.guestPhone ? `Call ${o.guest} at ${o.guestPhone}` : `Call ${o.guest}`) : `${o.host} will call you` };
    case "phone_host":
      return { label: "Phone", detail: o.forHost ? `${o.guest} will call ${l.number ?? "you"}` : `Call ${l.number ?? o.host}` };
    case "in_person":
      return { label: "In person", detail: l.address ?? null };
    case "link":
      return { label: "Online", url: l.url && /^https:\/\//.test(l.url) ? l.url : join };
    default:
      return { label: join ? "Online" : "To be confirmed", url: join };
  }
}

/** One line for the calendar file's LOCATION. */
export const whereLine = (w: Where) => w.url ?? (w.detail ? `${w.label}: ${w.detail}` : w.label);

// Layout ----------------------------------------------------------------------------------------------------------

type Block =
  | { p: string }
  | { rows: [string, string, string?][] }
  | { list: string[] }
  | { buttons: { label: string; url: string; primary?: boolean }[] }
  | { small: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const safeUrl = (u: string) => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : "");

// Email clients don't read CSS variables, so the brand's paper, ink and muted gray are written out here.
const PAPER = "#f2f1ed";
const CARD = "#fbfaf7";
const INK = "#121211";
const MUTED = "#7a7870";
const LINE = "#e3e1db";
const FONT = "Geist,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";

function render(o: { preheader: string; heading: string; blocks: Block[] }): { html: string; text: string } {
  const html: string[] = [];
  const text: string[] = [o.heading, ""];
  for (const b of o.blocks) {
    if ("p" in b) {
      html.push(`<p style="margin:0 0 16px">${esc(b.p)}</p>`);
      text.push(b.p, "");
    } else if ("small" in b) {
      html.push(`<p style="margin:16px 0 0;font-size:13px;color:${MUTED}">${esc(b.small)}</p>`);
      text.push(b.small, "");
    } else if ("rows" in b) {
      const rows = b.rows.filter(([, v]) => v);
      html.push(
        `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-collapse:collapse">` +
          rows
            .map(([k, v, url]) => {
              const u = url ? safeUrl(url) : "";
              const val = u ? `<a href="${esc(u)}" style="color:${INK};text-decoration:underline">${esc(v)}</a>` : esc(v).replace(/\n/g, "<br>");
              return `<tr><td style="padding:6px 16px 6px 0;color:${MUTED};font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;vertical-align:top">${val}</td></tr>`;
            })
            .join("") +
          `</table>`,
      );
      for (const [k, v, url] of rows) text.push(`${k}: ${v}${url && url !== v ? ` (${url})` : ""}`);
      text.push("");
    } else if ("list" in b) {
      html.push(`<ul style="margin:0 0 20px;padding:0 0 0 20px">${b.list.map((x) => `<li style="margin:0 0 6px">${esc(x)}</li>`).join("")}</ul>`);
      for (const x of b.list) text.push(`- ${x}`);
      text.push("");
    } else {
      const items = b.buttons.filter((x) => safeUrl(x.url));
      html.push(
        `<p style="margin:4px 0 8px">` +
          items
            .map((x) => {
              const style = x.primary
                ? `background:${INK};color:${PAPER};border:1px solid ${INK}`
                : `background:${CARD};color:${INK};border:1px solid ${LINE}`;
              return `<a href="${esc(x.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 18px;border-radius:999px;font-weight:500;font-size:14px;text-decoration:none;${style}">${esc(x.label)}</a>`;
            })
            .join("") +
          `</p>`,
      );
      for (const x of items) text.push(`${x.label}: ${x.url}`);
      text.push("");
    }
  }
  const doc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(o.heading)}</title></head>` +
    `<body style="margin:0;padding:0;background:${PAPER}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(o.preheader)}</div>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${PAPER}"><tr><td style="padding:32px 16px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;margin:0 auto;background:${CARD};border:1px solid ${LINE};border-radius:20px"><tr><td style="padding:28px;font:15px/1.55 ${FONT};color:${INK}">` +
    `<h1 style="margin:0 0 16px;font:600 22px/1.25 ${FONT};letter-spacing:-0.02em;color:${INK}">${esc(o.heading)}</h1>` +
    html.join("") +
    `</td></tr></table></td></tr></table></body></html>`;
  return { html: doc, text: text.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n" };
}

// The emails ------------------------------------------------------------------------------------------------------

export type MeetingView = {
  typeName: string;
  start: number;
  end: number;
  guestName: string | null;
  guestEmail: string;
  hosts: { name: string; email: string }[];
  answers: { label: string; value: string }[];
  /** The reader's zone. */
  tz: string;
  where: Where;
  /** Guest emails: the reschedule and cancel page. */
  manage?: string | null;
  now?: number;
};

const guestLabel = (v: MeetingView) => v.guestName?.trim() || v.guestEmail;
const hostNames = (v: MeetingView) => names(v.hosts.map((h) => h.name));
const hi = (name: string | null | undefined) => (firstName(name) ? `Hi ${firstName(name)},` : "Hi,");

function meetingRows(v: MeetingView, forHost: boolean): Block {
  return {
    rows: [
      ["What", v.typeName],
      ["When", `${fmtWhen(v.start, v.tz, v.now)} (${lengthOf(v.start, v.end)})`],
      forHost ? ["Guest", v.guestName ? `${v.guestName} (${v.guestEmail})` : v.guestEmail] : ["With", hostNames(v)],
      ["Where", v.where.url ?? (v.where.detail ? `${v.where.label}: ${v.where.detail}` : v.where.label), v.where.url ?? undefined],
    ],
  };
}

const answerRows = (v: MeetingView): Block[] => (v.answers.length ? [{ rows: v.answers.map((a) => [a.label, a.value] as [string, string]) }] : []);

const manageButtons = (v: MeetingView): Block[] =>
  v.manage ? [{ buttons: [{ label: "Reschedule", url: v.manage }, { label: "Cancel", url: v.manage }] }] : [];

export function confirmEmail(v: MeetingView): MailParts {
  const subject = `Confirmed: ${v.typeName} with ${hostNames(v)} on ${fmtWhen(v.start, v.tz, v.now)}`;
  return { subject, ...render({ preheader: `${fmtWhen(v.start, v.tz, v.now)} with ${hostNames(v)}`, heading: "Your meeting is booked", blocks: [{ p: hi(v.guestName) }, meetingRows(v, false), ...answerRows(v), ...manageButtons(v), { small: "The invite is attached." }] }) };
}

export function updateEmail(v: MeetingView, from?: number | null): MailParts {
  const subject = `Updated: ${v.typeName} with ${hostNames(v)} is now ${fmtWhen(v.start, v.tz, v.now)}`;
  const was: Block[] = from ? [{ p: `It was ${fmtWhen(from, v.tz, v.now)}.` }] : [];
  return { subject, ...render({ preheader: `Now ${fmtWhen(v.start, v.tz, v.now)}`, heading: "Your meeting moved", blocks: [{ p: hi(v.guestName) }, meetingRows(v, false), ...was, ...manageButtons(v), { small: "The updated invite is attached." }] }) };
}

export function cancelEmail(v: MeetingView, o: { reason?: string | null; bookAgain?: string | null } = {}): MailParts {
  const subject = `Canceled: ${v.typeName} with ${hostNames(v)} on ${fmtWhen(v.start, v.tz, v.now)}`;
  return {
    subject,
    ...render({
      preheader: `${fmtWhen(v.start, v.tz, v.now)} is canceled`,
      heading: "Your meeting is canceled",
      blocks: [
        { p: hi(v.guestName) },
        { rows: [["What", v.typeName], ["When", fmtWhen(v.start, v.tz, v.now)], ["With", hostNames(v)], ["Reason", o.reason?.trim() ?? ""]] },
        ...(o.bookAgain ? [{ buttons: [{ label: "Book a new time", url: o.bookAgain, primary: true }] }] : []),
      ],
    }),
  };
}

export function reminderEmail(v: MeetingView, min: number): MailParts {
  const subject = `Reminder: ${v.typeName} with ${hostNames(v)} ${fromNow(min)}`;
  const join: Block[] = v.where.url ? [{ buttons: [{ label: "Join", url: v.where.url, primary: true }] }] : [];
  return { subject, ...render({ preheader: fmtWhen(v.start, v.tz, v.now), heading: `Your meeting is ${fromNow(min)}`, blocks: [{ p: hi(v.guestName) }, meetingRows(v, false), ...join, ...manageButtons(v)] }) };
}

export function hostBookedEmail(v: MeetingView): MailParts {
  const subject = `New meeting: ${guestLabel(v)} on ${fmtWhen(v.start, v.tz, v.now)}`;
  return { subject, ...render({ preheader: `${v.typeName}, ${fmtWhen(v.start, v.tz, v.now)}`, heading: `${guestLabel(v)} booked ${v.typeName}`, blocks: [meetingRows(v, true), ...answerRows(v)] }) };
}

export function hostMovedEmail(v: MeetingView, from?: number | null): MailParts {
  const subject = `Moved: ${guestLabel(v)} is now ${fmtWhen(v.start, v.tz, v.now)}`;
  const was: Block[] = from ? [{ p: `It was ${fmtWhen(from, v.tz, v.now)}.` }] : [];
  return { subject, ...render({ preheader: `${v.typeName}, now ${fmtWhen(v.start, v.tz, v.now)}`, heading: `${guestLabel(v)} moved ${v.typeName}`, blocks: [meetingRows(v, true), ...was] }) };
}

export function hostCanceledEmail(v: MeetingView, reason?: string | null): MailParts {
  const subject = `Canceled: ${guestLabel(v)} on ${fmtWhen(v.start, v.tz, v.now)}`;
  return {
    subject,
    ...render({
      preheader: `${v.typeName}, ${fmtWhen(v.start, v.tz, v.now)}`,
      heading: `${v.typeName} with ${guestLabel(v)} is canceled`,
      blocks: [{ rows: [["When", fmtWhen(v.start, v.tz, v.now)], ["Guest", v.guestEmail], ["Reason", reason?.trim() ?? ""]] }],
    }),
  };
}

export function afterEmail(v: MeetingView, links: { held: string; noShow: string }): MailParts {
  const subject = `How did it go with ${guestLabel(v)}?`;
  return {
    subject,
    ...render({
      preheader: `${v.typeName}, ${fmtWhen(v.start, v.tz, v.now)}`,
      heading: `How did it go with ${guestLabel(v)}?`,
      blocks: [
        { rows: [["What", v.typeName], ["When", fmtWhen(v.start, v.tz, v.now)], ["Guest", v.guestEmail]] },
        { buttons: [{ label: "Held", url: links.held, primary: true }, { label: "No-show", url: links.noShow }] },
        { small: "Meetings not marked within 24 hours count as held." },
      ],
    }),
  };
}

export type TimesView = { name: string | null; host: string; typeName: string; times: number[]; tz: string; link: string; now?: number };

const timesBlocks = (v: TimesView): Block[] =>
  v.times.length ? [{ p: `Open times with ${v.host}:` }, { list: v.times.map((t) => fmtShort(t, v.tz)) }] : [];

export function noShowEmail(v: TimesView): MailParts {
  return {
    subject: `Pick a new time with ${v.host}`,
    ...render({
      preheader: `Book ${v.typeName} again`,
      heading: `Pick a new time with ${v.host}`,
      blocks: [{ p: hi(v.name) }, { p: `We missed you at ${v.typeName}. Book a new time when it suits you.` }, ...timesBlocks(v), { buttons: [{ label: "Pick a time", url: v.link, primary: true }] }],
    }),
  };
}

export function bookLaterEmail(v: TimesView): MailParts {
  return {
    subject: `Pick a time with ${v.host}`,
    ...render({
      preheader: `Book ${v.typeName}`,
      heading: `Pick a time with ${v.host}`,
      blocks: [{ p: hi(v.name) }, { p: `Thanks for getting in touch. Book ${v.typeName} at a time that suits you.` }, ...timesBlocks(v), { buttons: [{ label: "Pick a time", url: v.link, primary: true }] }],
    }),
  };
}

// MIME ------------------------------------------------------------------------------------------------------------

const oneLine = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
const ADDRESS = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/;
export const validAddress = (s: string) => ADDRESS.test(s) && s.length <= 254;

/** A header value as RFC 2047 encoded words when it isn't plain ASCII, split so no word passes 75 characters. */
export function encodeHeader(value: string): string {
  const v = oneLine(value);
  if (/^[\x20-\x7e]*$/.test(v)) return v;
  const words: string[] = [];
  let cur = "";
  for (const ch of v) {
    if (Buffer.byteLength(cur + ch, "utf8") > 45) {
      words.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

const b64 = (s: string) => (Buffer.from(s, "utf8").toString("base64").match(/.{1,76}/g) ?? [""]).join("\r\n");

export type MimeInput = {
  from: { name?: string | null; email: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  /** The calendar file: shown inline as an invite and attached as invite.ics. */
  ics?: { method: "REQUEST" | "CANCEL"; body: string } | null;
  date?: Date;
  /** Makes the part boundaries; random when not given. */
  boundary?: string;
};

/** The whole message, ready for SES's raw send. Refuses addresses that could break the headers. */
export function mime(m: MimeInput): string {
  if (!validAddress(m.to)) throw new Error(`Not an email address: ${m.to}`);
  if (!validAddress(m.from.email)) throw new Error(`Not an email address: ${m.from.email}`);
  if (m.replyTo && !validAddress(m.replyTo)) throw new Error(`Not an email address: ${m.replyTo}`);
  const tag = m.boundary ?? Math.random().toString(36).slice(2, 12);
  const mixed = `mixed_${tag}`;
  const alt = `alt_${tag}`;
  const headers = [
    `From: ${fromHeader(m.from.name ? oneLine(m.from.name) : null, m.from.email)}`,
    `To: ${m.to}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    "MIME-Version: 1.0",
  ];
  const part = (type: string, body: string) => [`Content-Type: ${type}`, "Content-Transfer-Encoding: base64", "", b64(body)].join("\r\n");
  const alternative = [
    `--${alt}`,
    part("text/plain; charset=UTF-8", m.text),
    `--${alt}`,
    part("text/html; charset=UTF-8", m.html),
    ...(m.ics ? [`--${alt}`, part(`text/calendar; charset=UTF-8; method=${m.ics.method}`, m.ics.body)] : []),
    `--${alt}--`,
  ].join("\r\n");
  if (!m.ics) return [...headers, `Content-Type: multipart/alternative; boundary="${alt}"`, "", alternative, ""].join("\r\n");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    alternative,
    `--${mixed}`,
    `Content-Type: application/ics; name="invite.ics"`,
    `Content-Disposition: attachment; filename="invite.ics"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.ics.body),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}
