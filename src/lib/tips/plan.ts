// Which getting-started email a new workspace's maker gets next, if any. Pure, so tests/tips.test.ts walks every path.
// The sender (src/lib/tips/send.ts) loads the state; the words and look live in src/lib/tips/mail.ts.
//
// Day  Email      Sends when
// 0    welcome    the guided setup is done, or an hour after the workspace is made (15 minutes at the soonest)
// 1    form       no form yet
// 2    share      a form, but no responses
// 3    responses  a form got responses
// 4    calendar   no calendar connected
// 6    followup   a form, but no live workflow of the team's own and no campaign sent
// 8    team       the only member, with no open invite
// any  limit      on Free with 80% of the month's responses used, once a month
// 14   help       on Free and not seen in the last 7 days
// 21+  away       not seen for 14 days and responses or meetings came in since, at most once every 90 days
//
// At most one a day, only 9:00 to 18:00 in the workspace's time zone (the welcome goes out at any hour). Paying
// workspaces only get the welcome and the setup emails (form to team).

export const TIP_STEPS = ["welcome", "form", "share", "responses", "calendar", "followup", "team", "limit", "help", "away"] as const;
export type TipStep = (typeof TIP_STEPS)[number];

/** Steps that can go again: away every 90 days, limit once a month. The rest go once. */
export const AWAY_EVERY_DAYS = 90;

export type TipState = {
  ageHours: number;
  /** The guided setup was finished (audit_log 'setup.done', 169). */
  setupDone: boolean;
  /** On a paid plan (workspace_billing.plan isn't free). */
  paid: boolean;
  forms: number;
  /** Real responses: not spam, not a test. */
  responses: number;
  calendars: number;
  /** Live workflows of the team's own (not the meeting emails) plus campaigns scheduled or sent. */
  followups: number;
  members: number;
  /** Invites not yet used and not expired. */
  invites: number;
  /** This month's counted responses, and the plan's cap (null: no cap). */
  monthResponses: number;
  cap: number | null;
  /** Days since the person was last seen, or null when never recorded. */
  idleDays: number | null;
  /** Responses and meetings booked since the person was last seen. */
  newSinceSeen: number;
  /** The hour now in the workspace's time zone, 0 to 23. */
  localHour: number;
  /** Steps already sent (away only when sent in the last 90 days, limit only this month). */
  sent: ReadonlySet<string>;
  /** A getting-started email went to this person in the last 20 hours. */
  sentRecently: boolean;
};

/** The share of the month's responses that brings the limit email. */
export const LIMIT_SHARE = 0.8;

export function pickStep(s: TipState): TipStep | null {
  const days = s.ageHours / 24;
  const due = (k: TipStep) => !s.sent.has(k);
  if (due("welcome") && s.ageHours >= 0.25 && (s.setupDone || s.ageHours >= 1) && days < 2) return "welcome";
  if (s.sentRecently || s.localHour < 9 || s.localHour >= 18) return null;

  if (due("limit") && !s.paid && s.cap !== null && s.cap > 0 && s.monthResponses >= Math.ceil(s.cap * LIMIT_SHARE)) return "limit";
  if (due("form") && s.forms === 0 && days >= 1 && days < 5) return "form";
  if (due("share") && s.forms > 0 && s.responses === 0 && days >= 2 && days < 6) return "share";
  if (due("responses") && s.responses > 0 && days >= 3 && days < 9) return "responses";
  if (due("calendar") && s.calendars === 0 && days >= 4 && days < 9) return "calendar";
  if (due("followup") && s.forms > 0 && s.followups === 0 && days >= 6 && days < 11) return "followup";
  if (due("team") && s.members <= 1 && s.invites === 0 && days >= 8 && days < 13) return "team";
  if (s.paid) return null;

  if (due("help") && days >= 14 && days < 18 && (s.idleDays === null || s.idleDays > 7)) return "help";
  if (due("away") && days >= 21 && s.idleDays !== null && s.idleDays >= 14 && s.newSinceSeen > 0) return "away";
  return null;
}

/** The log's period for a step: away by 90-day window, limit by month ("2026-11"), the rest "once". */
export function periodOf(step: TipStep, now: Date): string {
  if (step === "away") return `a${Math.floor(now.getTime() / (AWAY_EVERY_DAYS * 864e5))}`;
  if (step === "limit") return now.toISOString().slice(0, 7);
  return "once";
}

/** Which logged steps still count as sent now: every "once", away from the last 90 days, limit from this month. */
export function sentSteps(log: { step: string; period: string; sent_at: string | Date }[], now: Date): Set<string> {
  const out = new Set<string>();
  for (const r of log) {
    const at = new Date(r.sent_at).getTime();
    if (r.step === "away" && now.getTime() - at >= AWAY_EVERY_DAYS * 864e5) continue;
    if (r.step === "limit" && r.period !== periodOf("limit", now)) continue;
    out.add(r.step);
  }
  return out;
}

/** The form templates in Forms › Templates (src/lib/forms/gallery/catalog.ts; tests/tips.test.ts keeps it true). */
export const TEMPLATE_COUNT = 840;
