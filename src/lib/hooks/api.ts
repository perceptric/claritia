// The Forms API's hooks and bodies (docs/integrations-plan.md, Next step 1). Zapier, Make and Activepieces subscribe
// a hook for one event (POST /api/v1/hooks) and get a signed POST per event, the same send as meeting webhooks
// (src/lib/meetings/webhooks.ts, 127_api_hooks.sql). A fill's body is built here, on its first try, in the shape a
// form's own webhook gets, plus its answers by label so the apps can show them by name.

import { labeled, type Taken } from "../delivery/send.ts";
import type { Form } from "../forms/schema.ts";

export const API_EVENTS = ["form.submitted", "meeting.booked", "meeting.rescheduled", "meeting.canceled", "meeting.held", "meeting.no_show", "lead.routed"] as const;
export type ApiEvent = (typeof API_EVENTS)[number];
export const isApiEvent = (v: unknown): v is ApiEvent => typeof v === "string" && (API_EVENTS as readonly string[]).includes(v);

export const VIAS = ["zapier", "make", "activepieces", "api"] as const;
export type Via = (typeof VIAS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A fill as hook_fill reads it (127). */
export type HookFill = {
  submission: { id: string; created_at: string; values: Record<string, unknown>; hidden: Record<string, unknown>; consent?: { given?: boolean }; test: boolean; form_version: number; contact_id: string | null; spam?: boolean; over_cap?: boolean };
  form: { id: string | null; name: string | null; body: Form | null } | null;
  contact: Taken["contact"];
};

/** The fill the apps see: its answers by key and by label, the contact, and where it came from. */
export function fillData(x: HookFill) {
  const fields = labeled({ submission: x.submission, form: x.form } as Taken);
  const byLabel: Record<string, string> = {};
  for (const f of fields) if (!(f.label in byLabel)) byLabel[f.label] = f.value;
  return {
    id: x.submission.id,
    submitted_at: x.submission.created_at,
    test: x.submission.test,
    form: { id: x.form?.id ?? null, name: x.form?.name ?? null, version: x.submission.form_version },
    email: x.contact?.email ?? null,
    answers: x.submission.values,
    answers_by_label: byLabel,
    fields,
    contact: x.contact,
    meta: x.submission.hidden,
  };
}

export type HookBody = { id: string; event: string; created_at: string; workspace_id: string; test: boolean; data: Record<string, unknown> };

/** The body a fill hook sends. The id is the fill's, so a receiver can drop a repeat. */
export function fillHookBody(x: HookFill, ws: string): HookBody {
  return {
    id: `evt_${x.submission.id.replace(/-/g, "")}`,
    event: "form.submitted",
    created_at: x.submission.created_at,
    workspace_id: ws,
    test: x.submission.test,
    data: { fill: fillData(x) },
  };
}

/** Whether a fill can go out: not spam, and inside the plan's fills for the month. */
export const fillHeld = (x: HookFill | null): string | null =>
  !x ? "The fill was deleted." : x.submission.spam ? "The fill is in Spam." : x.submission.over_cap ? "Held: past this plan's fills for the month." : null;

/** What the apps read off each event's body: the one object a step maps from. */
export function itemOf(b: HookBody): Record<string, unknown> {
  const d = b.data as Record<string, Record<string, unknown> | undefined>;
  const item = d.fill ?? d.meeting ?? d.lead ?? {};
  return { ...item, event: b.event, event_id: b.id, test: b.test };
}

/** A subscribe as sent: an https address, one event (or a list), and the forms a fill hook listens to. */
export function checkHook(raw: unknown): { url: string; events: ApiEvent[]; forms: string[]; via: Via; description: string } | { error: string } {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  let u: URL;
  try {
    u = new URL(String(r.url ?? r.target_url ?? r.hookUrl ?? "").trim());
  } catch {
    return { error: "Send the hook's address as url, starting with https://." };
  }
  if (u.protocol !== "https:") return { error: "Hooks need an https:// address." };
  if (u.username || u.password) return { error: "Take the name and password out of the address." };
  if (u.href.length > 2000) return { error: "That address is too long." };
  const asked = Array.isArray(r.events) ? r.events : [r.event];
  const events = API_EVENTS.filter((e) => asked.includes(e));
  if (!events.length) return { error: `Pick an event: ${API_EVENTS.join(", ")}.` };
  const rawForms = Array.isArray(r.forms) ? r.forms : r.form ? [r.form] : [];
  if (rawForms.length > 50) return { error: "Up to 50 forms per hook." };
  const forms = [...new Set(rawForms.map((f) => String(f).trim().toLowerCase()))];
  if (forms.some((f) => !UUID.test(f))) return { error: "A form must be a form id." };
  if (forms.length && !events.includes("form.submitted")) return { error: "Only form.submitted hooks take forms." };
  const via = (VIAS as readonly string[]).includes(String(r.via)) ? (r.via as Via) : "api";
  const description = typeof r.description === "string" ? r.description.trim().slice(0, 120) : "";
  return { url: u.href, events, forms, via, description };
}

/** The app a key belongs to, from the name sign-in gave it ("Zapier"), or "api". */
export function viaOfKeyName(name: string | null | undefined): Via {
  const n = (name ?? "").toLowerCase();
  return n === "zapier" ? "zapier" : n === "make" ? "make" : n === "activepieces" ? "activepieces" : "api";
}

/** A sample of each event for an app's test step when the workspace has none yet. */
export function sampleItem(event: ApiEvent, at = new Date()): Record<string, unknown> {
  const zero = "00000000-0000-0000-0000-000000000000";
  if (event === "form.submitted")
    return {
      id: zero,
      submitted_at: at.toISOString(),
      test: true,
      form: { id: zero, name: "Book a demo", version: 1 },
      email: "ada@example.com",
      answers: { email: "ada@example.com", name: "Ada Park", company: "Example Co" },
      answers_by_label: { Email: "ada@example.com", Name: "Ada Park", Company: "Example Co" },
      fields: [
        { label: "Email", key: "email", value: "ada@example.com" },
        { label: "Name", key: "name", value: "Ada Park" },
        { label: "Company", key: "company", value: "Example Co" },
      ],
      contact: { id: zero, email: "ada@example.com", first_name: "Ada", last_name: "Park", title: null, phone: null, country: "US", company: "Example Co", company_domain: "example.com" },
      meta: { page: "https://example.com/demo", utm_source: "google" },
      event,
      event_id: "evt_test",
    };
  if (event === "lead.routed")
    return {
      id: zero,
      result: "routed",
      owner: { id: zero, name: "Sam Lee", email: "sam@example.com", tz: "America/Chicago" },
      by: "rule",
      queue: null,
      reason: "form",
      submission_id: zero,
      routed_at: at.toISOString(),
      contact: { id: zero, email: "ada@example.com", first_name: "Ada", last_name: "Park", title: null, company: "Example Co" },
      event,
      event_id: "evt_test",
      test: true,
    };
  const start = new Date(at.getTime() + 2 * 86_400_000);
  start.setUTCMinutes(0, 0, 0);
  return {
    id: zero,
    status: event === "meeting.canceled" ? "canceled" : event === "meeting.held" ? "held" : event === "meeting.no_show" ? "no_show" : "booked",
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + 30 * 60_000).toISOString(),
    guest_timezone: "America/New_York",
    type: { id: zero, name: "Intro call", slug: "intro", kind: "one" },
    hosts: [{ id: zero, name: "Sam Lee", email: "sam@example.com", timezone: "America/Chicago" }],
    guest: { name: "Ada Park", email: "ada@example.com", contact_id: null },
    answers: {},
    location: { kind: "google_meet", url: "https://meet.google.com/abc-defg-hij" },
    cancel_reason: event === "meeting.canceled" ? "Something came up" : null,
    event,
    event_id: "evt_test",
    test: true,
  };
}
