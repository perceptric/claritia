// Tools that send people as they sign up (docs/contact-sources.md Part 6): forms, meeting tools and anything that
// can post JSON. Each gets a URL to paste into the tool; a submission lands on a contact within seconds. Every
// form has its own questions, so columns are guessed from the question ("Work email", "Company") and can be
// mapped by hand on the source page.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { trackingFrom } from "../forms/schedule.ts";
import type { Connector, HookEvent, HookRequest, RawRecord } from "./types.ts";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hmac = (secret: string, body: string, enc: "hex" | "base64") => createHmac("sha256", secret).update(body).digest(enc);
const text = (v: unknown): string | null => (v == null ? null : Array.isArray(v) ? v.map(text).filter(Boolean).join(";") : typeof v === "object" ? null : String(v));

/** One person from a submission, keyed by email so repeat sign-ups land on the same link. */
function person(dedupe: string, data: Record<string, unknown>): HookEvent[] {
  const email = Object.entries(data).find(([k, v]) => /e-?mail/i.test(k) && typeof v === "string" && v.includes("@"))?.[1] ?? Object.values(data).find((v) => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v));
  if (typeof email !== "string") return [];
  const record: RawRecord = { id: email.trim().toLowerCase(), data: { ...data, email } };
  return [{ dedupe, object: "contacts", id: record.id, record }];
}

const hookOnly = { objects: ["contacts" as const], guess: true, account: async () => ({ id: "", label: "" }), defaults: { contact: { email: "email" } } } satisfies Partial<Connector>;

export const typeform: Connector = {
  ...hookOnly,
  kind: "typeform",
  verify: (req: HookRequest, secret: string) => same(req.headers.get("typeform-signature") ?? "", `sha256=${hmac(secret, req.body, "base64")}`),
  parse(body) {
    const r = (body as { form_response?: Record<string, unknown> }).form_response;
    if (!r) return [];
    const titles = new Map(((r.definition as { fields?: { id: string; title: string }[] })?.fields ?? []).map((f) => [f.id, f.title]));
    const data: Record<string, unknown> = { ...((r.hidden as Record<string, unknown>) ?? {}) };
    for (const a of (r.answers as Record<string, unknown>[]) ?? []) {
      const field = a.field as { id: string; ref?: string };
      const type = String(a.type);
      const v =
        type === "choice" ? (a.choice as { label?: string })?.label : type === "choices" ? (a.choices as { labels?: string[] })?.labels : type === "phone_number" ? a.phone_number : a[type];
      const key = type === "email" ? "email" : type === "phone_number" ? "phone" : (titles.get(field.id) ?? field.ref ?? field.id);
      data[key] = text(v);
    }
    return person(`typeform:${r.token}`, data);
  },
};

export const tally: Connector = {
  ...hookOnly,
  kind: "tally",
  verify: (req, secret) => same(req.headers.get("tally-signature") ?? "", hmac(secret, req.body, "base64")),
  parse(body) {
    const b = body as { eventId?: string; data?: { responseId?: string; fields?: { label: string; type: string; value: unknown; options?: { id: string; text: string }[] }[] } };
    const data: Record<string, unknown> = {};
    for (const f of b.data?.fields ?? []) {
      const v = Array.isArray(f.value) && f.options ? (f.value as string[]).map((id) => f.options!.find((o) => o.id === id)?.text ?? id) : f.value;
      data[f.type === "INPUT_EMAIL" ? "email" : f.type === "INPUT_PHONE_NUMBER" ? "phone" : f.label] = text(v);
    }
    return person(`tally:${b.eventId ?? b.data?.responseId}`, data);
  },
};

export const webflow: Connector = {
  ...hookOnly,
  kind: "webflow",
  parse(body) {
    const b = body as { payload?: { id?: string; data?: Record<string, unknown> }; _id?: string; data?: Record<string, unknown> };
    const data = b.payload?.data ?? b.data ?? {};
    return person(`webflow:${b.payload?.id ?? b._id ?? JSON.stringify(data).slice(0, 200)}`, Object.fromEntries(Object.entries(data).map(([k, v]) => [k, text(v)])));
  },
};

export const calendly: Connector = {
  ...hookOnly,
  kind: "calendly",
  verify(req, secret) {
    const parts = Object.fromEntries((req.headers.get("calendly-webhook-signature") ?? "").split(",").map((p) => p.split("=") as [string, string]));
    if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
    return same(parts.v1, hmac(secret, `${parts.t}.${req.body}`, "hex"));
  },
  parse(body) {
    const b = body as { event?: string; payload?: Record<string, unknown> };
    if (b.event !== "invitee.created" || !b.payload) return [];
    const p = b.payload;
    const data: Record<string, unknown> = { email: p.email, name: p.name, first_name: p.first_name, last_name: p.last_name, timezone: p.timezone };
    for (const qa of (p.questions_and_answers as { question: string; answer: string }[]) ?? []) data[qa.question] = qa.answer;
    // The booking, tied to a Claritia form fill by the utm_content the form's link carried (src/lib/forms/schedule.ts).
    const ev = (p.scheduled_event ?? {}) as { start_time?: string; uri?: string };
    const tracking = trackingFrom((p.tracking as { utm_content?: unknown } | undefined)?.utm_content);
    return person(`calendly:${p.uri ?? p.email}`, data).map((e) => ({ ...e, booking: { tool: "calendly", id: String(p.uri ?? ev.uri ?? p.email), start: ev.start_time ?? null, tracking, email: typeof p.email === "string" ? p.email : null } }));
  },
};

export const calcom: Connector = {
  ...hookOnly,
  kind: "calcom",
  verify: (req, secret) => same(req.headers.get("x-cal-signature-256") ?? "", hmac(secret, req.body, "hex")),
  parse(body) {
    const b = body as {
      triggerEvent?: string;
      payload?: { uid?: string; startTime?: string; metadata?: Record<string, unknown>; attendees?: { email: string; name: string; timeZone?: string }[]; responses?: Record<string, { value?: unknown; label?: string }> };
    };
    if (b.triggerEvent !== "BOOKING_CREATED" || !b.payload) return [];
    const a = b.payload.attendees?.[0];
    const data: Record<string, unknown> = { email: a?.email, name: a?.name, timezone: a?.timeZone };
    for (const [k, r] of Object.entries(b.payload.responses ?? {})) if (!["email", "name"].includes(k)) data[r.label ?? k] = text(r.value);
    const booking = { tool: "calcom", id: String(b.payload.uid ?? a?.email ?? ""), start: b.payload.startTime ?? null, tracking: trackingFrom(b.payload.metadata?.clr), email: a?.email ?? null };
    return person(`calcom:${b.payload.uid}`, data).map((e) => ({ ...e, booking }));
  },
};

/** Anything that posts JSON: one object, a list of them, or { contacts: [...] }. Nested objects are flattened once. */
export const api: Connector = {
  ...hookOnly,
  kind: "api",
  parse(body) {
    const list = Array.isArray(body) ? body : Array.isArray((body as { contacts?: unknown[] })?.contacts) ? (body as { contacts: unknown[] }).contacts : [body];
    const out: HookEvent[] = [];
    for (const [i, item] of list.slice(0, 1000).entries()) {
      if (!item || typeof item !== "object") continue;
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
        if (v && typeof v === "object" && !Array.isArray(v)) for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) flat[`${k} ${k2}`] = text(v2);
        else flat[k] = text(v);
      }
      // The same post sent twice is one event.
      const id = String((item as { id?: unknown }).id ?? "") || createHash("sha256").update(JSON.stringify(flat)).digest("hex").slice(0, 32);
      out.push(...person(`api:${id}:${i}`, flat));
    }
    return out;
  },
};
