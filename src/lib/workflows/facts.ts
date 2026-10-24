// What a workflow run reads about its contact (workflow_facts and workflow_preview_facts in
// supabase/migrations/069_workflows.sql), and the values Branch conditions test, named like the router's fields.

import { createHmac } from "node:crypto";

export type Facts = {
  contact: {
    id: string;
    email: string | null;
    email_class: string | null;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    seniority: string | null;
    department: string | null;
    country: string | null;
    region: string | null;
    lifecycle: string | null;
    lead_status: string | null;
    score: number | null;
    score_band: string | null;
    qualify_outcome: string | null;
    timezone: string | null;
    owner: string | null;
    fields: Record<string, unknown>;
    deleted: boolean;
    merged_into: string | null;
    suppressed: boolean;
  };
  company: Record<string, unknown> | null;
  answers: Record<string, unknown>;
  booked: boolean;
  tz: string | null;
  owner: { id: string; email: string; name: string } | null;
};

/** The values Branch conditions test, named like the router's fields. */
export function valuesOf(f: Facts): Record<string, unknown> {
  const c = f.contact;
  const co = f.company ?? {};
  const v: Record<string, unknown> = {
    "lead.country": co.country ?? c.country,
    "lead.score": c.score,
    "lead.band": c.score_band,
    "lead.qualify": c.qualify_outcome,
    "contact.email_class": c.email_class,
    "contact.email_domain": c.email?.split("@").pop() ?? null,
    "contact.title": c.title,
    "contact.seniority": c.seniority,
    "contact.department": c.department,
    "contact.country": c.country,
    "contact.region": c.region,
    "contact.lifecycle": c.lifecycle,
    "contact.lead_status": c.lead_status,
    "company.name": co.name,
    "company.domain": co.domain,
    "company.industry": co.industry,
    "company.size": co.size ?? co.employees,
    "company.employees": co.employees,
    "company.country": co.country,
  };
  for (const [k, x] of Object.entries(c.fields ?? {})) v[`contact.f.${k}`] = x;
  for (const [k, x] of Object.entries(f.answers ?? {})) v[`answer.${k}`] = x;
  return v;
}

/** The signing secret of a workflow's webhooks, made from SECRETS_KEY so nothing is stored. */
export const webhookSecret = (workflowId: string, secret = process.env.SECRETS_KEY ?? "") => createHmac("sha256", secret).update(`wf:${workflowId}`).digest("hex");
