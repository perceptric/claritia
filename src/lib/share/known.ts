import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { allFields, type Form } from "../forms/schema.ts";
import type { Person } from "./personal.ts";

// What a personal link fills in (docs/sharing-plan.md, Personal links): the person's details Claritia already has,
// only for the contact questions this form asks, and nothing else about them. A contact from another workspace, or one
// that's been deleted, gives nothing.

const KEYS = ["email", "first_name", "last_name", "name", "title", "phone", "company", "website", "country", "region"] as const;

export async function knownFor(db: SupabaseClient, person: Person, form: Form): Promise<Record<string, string>> {
  const asks = new Set(allFields(form).map((f) => f.key as string).filter((k) => (KEYS as readonly string[]).includes(k)));
  if (!asks.size) return {};
  let all: Record<string, string | null | undefined> = {};
  if (person.c) {
    const { data } = await db.from("contacts").select("email, first_name, last_name, title, phone, country, region, company_id, deleted_at").eq("id", person.c).eq("workspace_id", person.w).maybeSingle();
    const c = data as { email: string | null; first_name: string | null; last_name: string | null; title: string | null; phone: string | null; country: string | null; region: string | null; company_id: string | null; deleted_at: string | null } | null;
    if (!c || c.deleted_at) return {};
    const co = c.company_id ? ((await db.from("companies").select("name, domain").eq("id", c.company_id).eq("workspace_id", person.w).maybeSingle()).data as { name: string | null; domain: string | null } | null) : null;
    all = { email: c.email, first_name: c.first_name, last_name: c.last_name, name: [c.first_name, c.last_name].filter(Boolean).join(" "), title: c.title, phone: c.phone, country: c.country, region: c.region, company: co?.name, website: co?.domain };
  } else if (person.e) all = { email: person.e };
  const out: Record<string, string> = {};
  for (const k of asks) {
    const v = all[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 300);
  }
  return out;
}
