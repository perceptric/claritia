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
  /** Everyone, or only leads that match the rules; the rest see the form's message or page. */
  who?: "all" | "match";
  rules?: MatchRule[];
  /** Match any rule instead of all of them. */
  any?: boolean;
  /** The line above the calendar. */
  heading?: string;
  /** Fill in the lead's name and email on the scheduler. On unless turned off. */
  prefill?: boolean;
};

export const WORK_EMAIL = "@work_email";

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
