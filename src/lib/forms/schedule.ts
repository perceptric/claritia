// Booking after the submit on an outside scheduler (docs/form-builder.md 8.2). Each tool's link opens inside the form
// with the lead's name and email filled in and the fill's tracking id, so the booking that comes back by webhook
// links to its fill for sure. Where a tool takes the id (Calendly's utm_content, Cal.com's metadata) is noted per
// tool; the rest are linked by email as a maybe. Runs in the browser and on the server.

export type SchedulerTool = "calendly" | "calcom" | "hubspot_meetings" | "savvycal" | "link";
/** Where the lead books: Claritia's own calendar (a meeting type, booked in the form) or an outside scheduler. */
export type ScheduleTool = "claritia" | SchedulerTool;

/**
 * Who sees the calendar (docs/form-studio.md Part 3). A rule reads a field's answer by field id, or "@work_email" for
 * "the email is a work email". gte and lte compare numbers.
 */
export type MatchRule = { field: string; op: "is" | "is_not" | "filled" | "empty" | "gte" | "lte"; value?: string };

export type Schedule = {
  tool: ScheduleTool;
  /** The outside scheduler's team link; empty for Claritia calendar. */
  url: string;
  /** Claritia calendar: the meeting type the lead books (its kind decides owner first, round robin and the rest). */
  meetingTypeId?: string;
  /** Book with the contact's owner when they have a link, else the team link. */
  perOwner: boolean;
  /** Everyone, only leads that match the rules, or only leads routed by the picked routing rules; the rest see the
   * form's message or page. */
  who?: "all" | "match" | "routed";
  /** who "routed": routing rule ids, "owned" for leads kept with the rep they or their company already have, and
   * "fallback" for leads no rule matched (Everyone else). */
  routeRules?: string[];
  rules?: MatchRule[];
  /** Match any rule instead of all of them. */
  any?: boolean;
  /** The line above the calendar. */
  heading?: string;
  /** Claritia calendar with Routing live: when the lead's rep has no free times, show the message (the default) or
   * email the rep's times later. */
  none?: "message" | "later";
  /** Fill in the lead's name and email on the scheduler. On unless turned off. */
  prefill?: boolean;
};

/** who "routed": every lead Routing gives a rep, whichever rule (or the rep they already have) did it. */
export const REP = "rep";

export const WORK_EMAIL = "@work_email";
/** The routed choices for leads no routing rule matched, and for leads kept with the rep they already have. */
export const FALLBACK = "fallback";
export const OWNED = "owned";

/** How routing placed the lead, as far as the booking step needs it. null: routing didn't answer in time. */
/** `meet`: the meeting type the routing rule (or the fallback) names, offered instead of the form's own. */
/** `user`: the rep Routing gave the lead. */
export type RoutedAs = { kind: "owner" | "held" | "unassigned"; rule?: string | null; by?: string | null; meet?: string | null; user?: string | null } | null;

/**
 * What a Claritia-calendar form does after the send (docs/inbound.md: Routing decides, the form shows the result).
 *   message: the form's message, no times (held, unassigned, nothing to book).
 *   times:   times for `type`; with `rep`, only that rep's times, and the booking is made with them alone.
 *   pending: Routing hasn't committed an owner yet: "Your details are saved. We're finishing your request." The form
 *            sends the same request again (same key) until it has; it never shows another host's times meanwhile.
 */
export type BookPlan = { kind: "message" } | { kind: "times"; type: string; rep: string | null } | { kind: "pending" };

/**
 * With Routing live (a live router, not paused) the lead books the meeting their rule names (else the form's own)
 * with the rep Routing gave them, and only that rep: the host is the committed owner (docs/routing-workflow.md
 * Section 2). Held and unassigned leads see the message. When routing hasn't answered yet (`routed` null) the plan is
 * pending. With Routing not live, or its read failed, everyone books the form's meeting with its hosts. The form's old
 * who / rules / routeRules are not read here.
 */
export function claritiaPlan(s: Schedule, routed: RoutedAs, live: { paused?: boolean } | null | undefined): BookPlan {
  const own = s.meetingTypeId;
  const on = !!live && !live.paused;
  if (!on) return own ? { kind: "times", type: own, rep: null } : { kind: "message" };
  if (!routed) return own ? { kind: "pending" } : { kind: "message" };
  if (routed.kind !== "owner" || !routed.user) return { kind: "message" };
  const type = routed.meet || own;
  return type ? { kind: "times", type, rep: routed.user } : { kind: "message" };
}

/**
 * When the lead's rep has no free times: whether the lead gets the rep's times by email later (meeting_book_later).
 * The form's own "Email times later", or Routing's "Alert the rep when there is no availability" (the live body's
 * `notify.noTimes`), for every Claritia-calendar form. A booking that failed to load counts as no times: the fill is
 * kept and the lead still hears.
 */
export function emailsTimesLater(s: Pick<Schedule, "none">, live: { body?: { notify?: { noTimes?: boolean } } } | null | undefined): boolean {
  return s.none === "later" || live?.body?.notify?.noTimes === true;
}

/**
 * Whether routing lets this lead book (who "routed"). A lead routed by a picked rule books; one no rule matched
 * books when Everyone else is picked; a held lead never books. When routing didn't answer in time the lead books
 * anyway: a missed booking costs more than one made with the meeting type's own host.
 */
export function routedBooks(s: Schedule, routed: RoutedAs): boolean {
  if (s.who !== "routed") return true;
  if (!routed) return true;
  if (routed.kind === "held") return false;
  const picked = s.routeRules ?? [];
  if (picked.includes(REP) && routed.kind === "owner") return true;
  if (routed.rule) return picked.includes(routed.rule);
  if (routed.kind === "owner" && (routed.by === "account" || routed.by === "keep")) return picked.includes(OWNED);
  return picked.includes(FALLBACK);
}

/**
 * Whether this lead sees the calendar. `work` says whether the email is a work email (the server knows from the
 * identity lists; the browser guesses from the free-mail list it has). A rule on a field the lead left empty only
 * matches "empty", so a skipped question never books by accident.
 */
export function showsMeeting(s: Schedule, answers: Record<string, unknown>, work: boolean): boolean {
  if (s.who !== "match" || !s.rules?.length) return true;
  const one = (r: MatchRule): boolean => {
    if (r.field === WORK_EMAIL) return r.op === "is_not" ? !work : work;
    const raw = answers[r.field];
    const list = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null || raw === "" || raw === false ? [] : [String(raw)];
    if (r.op === "filled") return list.length > 0;
    if (r.op === "empty") return list.length === 0;
    if (!list.length) return false;
    if (r.op === "is") return list.includes(r.value ?? "");
    if (r.op === "is_not") return !list.includes(r.value ?? "");
    const n = Number(list[0]);
    const want = Number(r.value);
    if (!Number.isFinite(n) || !Number.isFinite(want)) return false;
    return r.op === "gte" ? n >= want : n <= want;
  };
  return s.any ? s.rules.some(one) : s.rules.every(one);
}

export const SCHEDULERS: { value: SchedulerTool; label: string; domain: string; hosts: RegExp | null; tracks: boolean }[] = [
  { value: "calendly", label: "Calendly", domain: "calendly.com", hosts: /^(www\.)?calendly\.com$/, tracks: true },
  { value: "calcom", label: "Cal.com", domain: "cal.com", hosts: /^(app\.)?cal\.com$|\.cal\.com$/, tracks: true },
  { value: "hubspot_meetings", label: "HubSpot Meetings", domain: "hubspot.com", hosts: /^meetings(-[a-z0-9]+)?\.hubspot\.com$/, tracks: false },
  { value: "savvycal", label: "SavvyCal", domain: "savvycal.com", hosts: /^savvycal\.com$/, tracks: false },
  { value: "link", label: "Other link", domain: "", hosts: null, tracks: false },
];

/** An outside scheduler (a link that opens in the form), as opposed to Claritia calendar. */
export const outside = (tool: ScheduleTool): tool is SchedulerTool => tool !== "claritia";

/** Why a link can't be used for a tool, or null when it can. Claritia calendar takes no link. */
export function linkProblem(tool: ScheduleTool, raw: string): string | null {
  const t = SCHEDULERS.find((s) => s.value === tool);
  if (!t) return "Pick a scheduler.";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Paste the full booking link, starting with https://.";
  }
  if (u.protocol !== "https:" || u.username || u.password) return "Booking links need https://.";
  if (t.hosts && !t.hosts.test(u.hostname)) return `That isn't a ${t.label} link.`;
  return null;
}

/**
 * The link to open: the tool's link with the lead filled in and the fill's tracking id. Returns null for a link the
 * tool check refuses, so a bad saved link never opens. With `prefill` off the name and email stay out of the link;
 * the tracking id still goes in, so the booking still links to its fill.
 */
export function bookingUrl(
  tool: SchedulerTool,
  base: string,
  who: { first?: string | null; last?: string | null; email?: string | null },
  submissionId: string,
  embedHost?: string,
  prefill = true,
): string | null {
  if (linkProblem(tool, base)) return null;
  const u = new URL(base);
  const lead = prefill ? who : {};
  const name = [lead.first, lead.last].filter(Boolean).join(" ");
  const set = (k: string, v: string | null | undefined) => {
    if (v) u.searchParams.set(k, v.slice(0, 200));
  };
  const tracking = `clr_${submissionId}`;
  switch (tool) {
    case "calendly":
      set("name", name);
      set("email", lead.email);
      set("utm_content", tracking);
      set("embed_type", "Inline");
      set("embed_domain", embedHost);
      break;
    case "calcom":
      set("name", name);
      set("email", lead.email);
      set("metadata[clr]", tracking);
      set("embed", "true");
      break;
    case "hubspot_meetings":
      set("firstName", lead.first);
      set("lastName", lead.last);
      set("email", lead.email);
      set("embed", "true");
      break;
    case "savvycal":
      set("display_name", name);
      set("email", lead.email);
      break;
    default:
      set("email", lead.email);
  }
  return u.href;
}

/** The fill's tracking id from what a booking webhook carried, if any. */
export function trackingFrom(raw: unknown): string | null {
  return typeof raw === "string" && /^clr_[0-9a-f-]{36}$/.test(raw.trim()) ? raw.trim() : null;
}
