// Emails › Journeys, the server side (docs/email-plan.md Part 8). `load` reads what the build screen shows: the
// brand, the product's events, the CRM's stages and the journeys this workspace can run. `build` makes them: each
// journey's emails rewritten in the brand's voice through the step cache, then one draft workflow per journey. A
// second build adds only the journeys that aren't there yet. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "../jobs.ts";
import type { Model } from "../forms/chat.ts";
import { Refused, type Caller } from "../router/actions.ts";
import { journeyEmails, planJourneys, type Facts, type Journey } from "./lifecycle.ts";
import type { EmailBody } from "./types.ts";

type Q = SupabaseClient;

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Refused(400, error.message.replace(/^.*?: /, ""));
  return data as T;
}

export type Brand = { name: string; logo_url: string | null; colors: string[]; font: string | null; brief: string; notes: string[] };

async function context(rpc: Rpc, db: Q, ws: string, base: string) {
  const [facts, kits, sites, fields, w] = await Promise.all([
    call<Facts>(rpc, "lifecycle_facts", { p_ws: ws }),
    db.from("brand_kits").select("name, logo_url, tokens, notes, brief").eq("workspace_id", ws).order("created_at").limit(1),
    db.from("sites").select("domain").eq("workspace_id", ws).order("created_at").limit(1),
    db.from("fields").select("key, label, type").eq("workspace_id", ws).eq("object", "contact"),
    db.from("workspaces").select("name, booking_slug").eq("id", ws).maybeSingle(),
  ]);
  const kit = (kits.data?.[0] ?? null) as { name: string; logo_url: string | null; tokens: Record<string, unknown>; notes: string[]; brief: string | null } | null;
  const t = kit?.tokens ?? {};
  const brand: Brand = {
    name: kit?.name || (w.data?.name as string) || "",
    logo_url: kit?.logo_url ?? null,
    colors: [t.buttonBg, t.text, t.background].filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)),
    font: typeof t.font === "string" ? t.font.split(",")[0]!.replace(/['"]/g, "").trim() : null,
    brief: kit?.brief ?? "",
    notes: kit?.notes ?? [],
  };
  const domain = (sites.data?.[0]?.domain as string | undefined) ?? null;
  const trialEnd = ((fields.data ?? []) as { key: string; label: string; type: string }[]).find((f) => f.type === "date" && /trial/i.test(`${f.key} ${f.label}`));
  const slug = (w.data?.booking_slug as string | null) ?? null;
  const plan = planJourneys(facts, { brand: brand.name, site: domain ? `https://${domain}` : "", trialEnd: trialEnd ? `f.${trialEnd.key}` : null, booking: slug ? `${base}/booking/${slug}` : null });
  return { facts, brand, plan };
}

const preview = (j: Journey) => ({ key: j.key, name: j.name, stage: j.stage, line: j.line, emails: journeyEmails(j.body.steps).length });

export async function load(rpc: Rpc, db: Q, c: Caller, base: string) {
  const { facts, brand, plan } = await context(rpc, db, c.ws, base);
  return { facts, brand, plan: plan.map(preview), owner: c.role === "owner" };
}

/** Make the journeys that aren't there yet. Their emails start unapproved. */
export async function build(rpc: Rpc, db: Q, c: Caller, o: { base: string; ai: Model | null }) {
  if (c.role !== "owner") throw new Refused(403, "Only workspace owners can build journeys.");
  const { facts, brand, plan } = await context(rpc, db, c.ws, o.base);
  const have = new Set(facts.journeys.map((j) => j.journey));
  const todo = plan.filter((j) => !have.has(j.key));
  let rewritten = 0;
  if (o.ai && todo.length) {
    const { cachedStep, hashKey } = await import("../ai/cache.ts");
    const { cleanRewrite, rewriteInVoice, VOICE_SYSTEM, VOICE_TOOLS } = await import("./voice.ts");
    const { CHAT_MODEL } = await import("../forms/chat.ts");
    const emails = todo.flatMap((j) => journeyEmails(j.body.steps).map((s, i) => ({ id: `${j.key}:${i}`, moment: `${j.name}, email ${i + 1}`, step: s, email: s.email })));
    const input = { brand: brand.name, brief: [brand.brief, ...brand.notes].filter(Boolean).join("\n"), emails: emails.map(({ id, moment, email }) => ({ id, moment, email })) };
    try {
      const r = await cachedStep(rpc, c.ws, "journey_voice", hashKey(CHAT_MODEL, VOICE_SYSTEM, VOICE_TOOLS, input), async () => {
        const out = await rewriteInVoice(o.ai!, input);
        return { result: out.rewrites, model: CHAT_MODEL, usage: out.usage, keep: out.rewrites.length > 0 };
      });
      const byId = new Map(r.result.map((x) => [x.id, x]));
      for (const e of emails) {
        const next: EmailBody | null = cleanRewrite(byId.get(e.id), e.email);
        if (next) {
          e.step.email = next;
          e.step.ai = true;
          rewritten++;
        }
      }
    } catch {
      // The built words stand on their own.
    }
  }
  const made: { id: string; key: string }[] = [];
  for (const j of todo) made.push({ id: await call<string>(rpc, "journey_create", { p_ws: c.ws, p_user: c.user, p_name: j.name, p_stage: j.stage, p_journey: j.key, p_draft: j.body }), key: j.key });
  return { made, rewritten };
}
