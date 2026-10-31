// One visitor's journey, in words (docs/visitors.md): where a visit came from, what each event says, and the visits,
// links and contact actions in one list, newest first. Pure, for the Visitors screen and its tests.

export type Ev = { kind: string; path: string | null; title: string | null; data: Record<string, unknown> | null; at: string };
export type Visit = {
  id: string;
  started_at: string;
  ended_at: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer_host: string | null;
  ref_class: string | null;
  landing_path: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  pageviews: number;
  engaged_s: number;
  events: Ev[];
};
export type Proof = { source: string; level: string; at: string; ignored: string | null; email: string | null };
export type Action = { kind: string; data: Record<string, unknown>; at: string };
export type Journey = {
  device: { id: string; first_seen: string; last_seen: string; sessions: number; state: string };
  contact: { id: string; first_name: string | null; last_name: string | null; email: string | null; level: string | null } | null;
  sessions: Visit[];
  proof: Proof[];
  actions: Action[];
};


export const fullName = (r: { first_name: string | null; last_name: string | null; email: string | null }) => [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "";

/** Where a visit came from, in a few words: the campaign's source, the site that sent them, or Direct. */
export function sourceWords(v: { source: string | null; medium: string | null; referrer_host: string | null; ref_class: string | null }): string {
  if (v.source) return v.medium ? `${v.source}, ${v.medium}` : v.source;
  if (v.referrer_host) return v.referrer_host.replace(/^www\./, "");
  return v.ref_class === "email" ? "Email" : "Direct";
}

export const place = (v: { city: string | null; country: string | null }) => [v.city, v.country].filter(Boolean).join(", ");

/** What one event says on the journey. */
export function eventWords(e: Ev): string {
  switch (e.kind) {
    case "view":
      return e.title?.trim() || e.path || "A page";
    case "click":
      return `Clicked ${typeof e.data?.text === "string" && e.data.text ? `"${e.data.text}"` : (e.path ?? "a link")}`;
    case "form":
      return `Sent ${typeof e.data?.form === "string" && e.data.form ? e.data.form : "a form"}`;
    case "identify":
      return "Signed in";
    default:
      return typeof e.data?.n === "string" ? e.data.n : "An event";
  }
}

export const ACTION_WORDS: Record<string, string> = { "form.submitted": "Sent a form", "meeting.booked": "Booked a meeting", "meeting.canceled": "Canceled a meeting", "email.clicked": "Clicked an email", "lead.routed": "Routed to a rep" };
export const PROOF_WORDS: Record<string, string> = { form: "a form", booking: "a booking", identify: "a sign-in", identify_signed: "a sign-in", email_link: "an email link", manual_merge: "a merge", crm: "the CRM" };


export type Item = { at: string; kind: "visit"; visit: Visit } | { at: string; kind: "proof"; proof: Proof } | { at: string; kind: "action"; action: Action };

/** The journey, newest first: visits, the proof that linked the visitor, and what they did as a contact. */
export function journeyItems(j: Pick<Journey, "sessions" | "proof" | "actions">): Item[] {
  const items: Item[] = [
    ...j.sessions.map((visit): Item => ({ at: visit.started_at, kind: "visit", visit })),
    ...j.proof.filter((p) => !p.ignored).map((proof): Item => ({ at: proof.at, kind: "proof", proof })),
    ...j.actions.map((action): Item => ({ at: action.at, kind: "action", action })),
  ];
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

