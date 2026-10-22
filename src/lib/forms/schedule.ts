// Booking after the submit on an outside scheduler (docs/form-builder.md 8.2). Each tool's link opens inside the form
// with the lead's name and email filled in and the fill's tracking id, so the booking that comes back by webhook
// links to its fill for sure. Where a tool takes the id (Calendly's utm_content, Cal.com's metadata) is noted per
// tool; the rest are linked by email as a maybe. Runs in the browser and on the server.

export type SchedulerTool = "calendly" | "calcom" | "hubspot_meetings" | "savvycal" | "link";
export type Schedule = { tool: SchedulerTool; url: string; perOwner: boolean };

export const SCHEDULERS: { value: SchedulerTool; label: string; domain: string; hosts: RegExp | null; tracks: boolean }[] = [
  { value: "calendly", label: "Calendly", domain: "calendly.com", hosts: /^(www\.)?calendly\.com$/, tracks: true },
  { value: "calcom", label: "Cal.com", domain: "cal.com", hosts: /^(app\.)?cal\.com$|\.cal\.com$/, tracks: true },
  { value: "hubspot_meetings", label: "HubSpot Meetings", domain: "hubspot.com", hosts: /^meetings(-[a-z0-9]+)?\.hubspot\.com$/, tracks: false },
  { value: "savvycal", label: "SavvyCal", domain: "savvycal.com", hosts: /^savvycal\.com$/, tracks: false },
  { value: "link", label: "Other link", domain: "", hosts: null, tracks: false },
];

/** Why a link can't be used for a tool, or null when it can. */
export function linkProblem(tool: SchedulerTool, raw: string): string | null {
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
 * tool check refuses, so a bad saved link never opens.
 */
export function bookingUrl(tool: SchedulerTool, base: string, lead: { first?: string | null; last?: string | null; email?: string | null }, submissionId: string, embedHost?: string): string | null {
  if (linkProblem(tool, base)) return null;
  const u = new URL(base);
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
