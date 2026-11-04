// Share › Email (docs/sharing-plan.md): who an email can go to without typing them out, and how each send is doing.
// People Claritia already knows (contacts, by name or email), everyone who filled this form, a meeting type's guests,
// and the addresses in any pasted text or CSV. Each send to a form remembers the form (emails.form_id, 125) so its
// people show as Not started, In progress (they opened the link), Finished (they sent the form) or Not delivered.
// Reads through the signed-in member's client; every table here is "members read". Browser and server.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Person = { email: string; name: string };

const ADDRESS = /[^\s@<>()",;:'[\]]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;

/** Every address in a piece of text (a pasted list, an email thread, a CSV), lowercased, each once, in order. */
export function emailsIn(text: string): string[] {
  return [...new Set((text.match(ADDRESS) ?? []).map((x) => x.toLowerCase().replace(/^[.]+|[.]+$/g, "")))];
}

const nameOf = (first?: unknown, last?: unknown, full?: unknown) => {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return [s(first), s(last)].filter(Boolean).join(" ") || s(full);
};

/** The people the To box suggests: contacts whose name or email has what was typed, the newest first. */
export async function suggestPeople(db: SupabaseClient, ws: string, q: string, limit = 8): Promise<Person[]> {
  const term = q.replace(/[^\p{L}\p{N}@.+_\- ]/gu, "").trim().slice(0, 60);
  let query = db.from("contacts").select("email, first_name, last_name").eq("workspace_id", ws).is("deleted_at", null).not("email", "is", null);
  if (term) query = query.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return dedupe(((data ?? []) as { email: string | null; first_name: string | null; last_name: string | null }[]).map((c) => ({ email: (c.email ?? "").toLowerCase(), name: nameOf(c.first_name, c.last_name) })));
}

/** Everyone who filled this form (real fills only), the newest first. */
export async function formFillers(db: SupabaseClient, ws: string, formId: string): Promise<Person[]> {
  const { data, error } = await db.from("submissions").select('"values"').eq("workspace_id", ws).eq("form_id", formId).eq("spam", false).eq("test", false).order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return dedupe(((data ?? []) as { values: Record<string, unknown> | null }[]).map((r) => ({ email: typeof r.values?.email === "string" ? r.values.email.trim().toLowerCase() : "", name: nameOf(r.values?.first_name, r.values?.last_name, r.values?.name) })));
}

/** The workspace's meeting types, for Guests of a meeting type. */
export async function meetingTypes(db: SupabaseClient, ws: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("meeting_types").select("id, name").eq("workspace_id", ws).eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

/** Everyone who booked a meeting type, the newest first. */
export async function meetingGuests(db: SupabaseClient, ws: string, typeId: string): Promise<Person[]> {
  const { data, error } = await db.from("meetings").select("guest_email, guest_name").eq("workspace_id", ws).eq("type_id", typeId).order("start_at", { ascending: false }).limit(2000);
  if (error) throw new Error(error.message);
  return dedupe(((data ?? []) as { guest_email: string; guest_name: string | null }[]).map((m) => ({ email: m.guest_email.toLowerCase(), name: (m.guest_name ?? "").trim() })));
}

function dedupe(list: Person[]): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const p of list) {
    if (!p.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) || seen.has(p.email)) continue;
    seen.add(p.email);
    out.push(p);
  }
  return out;
}

export type SendStatus = "not" | "started" | "done" | "failed";
export const SEND_STATUS: Record<SendStatus, string> = { not: "Not started", started: "In progress", done: "Finished", failed: "Not delivered" };
export type Message = { to_email: string; status: string; first_click_at: string | null; created_at: string };
export type Sent = { email: string; status: SendStatus };

/**
 * Where each person an email went to is: Finished once this form has a fill from their address made after the email,
 * In progress once they opened its link, Not delivered when it bounced, was refused or was skipped, else Not started.
 * A fill counts even when it didn't come through the email, since they did what it asked.
 */
export function sendStatus(messages: Message[], fills: { email: string; at: string }[]): Sent[] {
  const filled = new Map<string, number>();
  for (const f of fills) {
    const at = Date.parse(f.at);
    const e = f.email.trim().toLowerCase();
    if (e && !(filled.get(e)! >= at)) filled.set(e, at);
  }
  return messages.map((m) => {
    const e = m.to_email.toLowerCase();
    const last = filled.get(e);
    if (last !== undefined && last >= Date.parse(m.created_at)) return { email: e, status: "done" as const };
    if (["bounced", "rejected", "skipped", "failed", "complained"].includes(m.status)) return { email: e, status: "failed" as const };
    if (m.first_click_at) return { email: e, status: "started" as const };
    return { email: e, status: "not" as const };
  });
}

export type ShareSend = { id: string; at: string; subject: string; people: Sent[] };

/** This form's last sends by email and where each person is. Before 125 (no emails.form_id) there are none to show. */
export async function shareSends(db: SupabaseClient, ws: string, formId: string, limit = 5): Promise<ShareSend[]> {
  const { data: emails, error } = await db.from("emails").select("id, subject, created_at").eq("workspace_id", ws).eq("form_id", formId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (/form_id|column|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  const list = (emails ?? []) as { id: string; subject: string; created_at: string }[];
  if (!list.length) return [];
  const { data: msgs, error: e2 } = await db.from("email_messages").select("email_id, to_email, status, first_click_at, created_at").in("email_id", list.map((x) => x.id)).limit(5000);
  if (e2) throw new Error(e2.message);
  const since = list.map((x) => x.created_at).sort()[0]!;
  const { data: subs, error: e3 } = await db.from("submissions").select('"values", created_at').eq("workspace_id", ws).eq("form_id", formId).eq("spam", false).eq("test", false).gte("created_at", since).limit(5000);
  if (e3) throw new Error(e3.message);
  const fills = ((subs ?? []) as { values: Record<string, unknown> | null; created_at: string }[]).map((s) => ({ email: typeof s.values?.email === "string" ? s.values.email : "", at: s.created_at }));
  const by = new Map<string, Message[]>();
  for (const m of (msgs ?? []) as (Message & { email_id: string })[]) by.set(m.email_id, [...(by.get(m.email_id) ?? []), m]);
  return list.map((x) => ({ id: x.id, at: x.created_at, subject: x.subject, people: sendStatus(by.get(x.id) ?? [], fills) }));
}
