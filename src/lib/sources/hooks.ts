import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcOr } from "../rpcCompat.ts";
import { unseal } from "../seal.ts";
import { entryOf } from "./catalog.ts";
import { connectorFor } from "./registry.ts";
import type { HookEvent, HookRequest } from "./types.ts";

// Webhooks in, from the form and meeting tools around Claritia's forms: fills from Typeform, Tally and Webflow, and
// bookings from Calendly and Cal.com, which link to the fill they followed. Each delivery is checked (the URL's token,
// and the tool's signature when it signs), turned into events, and staged; the source_hook job applies them. Staging
// is all a hook does, so it answers fast and a delivery sent twice is kept once. CRMs and other tools aren't taken:
// Claritia has no CRM to sync into.

/** The tool groups whose webhooks come in. */
const HOOK_GROUPS = new Set(["form", "event", "api"]);
export const takesHooks = (kind: string) => HOOK_GROUPS.has(entryOf(kind)?.group ?? "");

const MAX_BODY = 1_000_000;
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Stage a delivery's events in one call (hook_stage_many, 088); one call per event where that isn't there yet. */
export async function stage(db: Pick<SupabaseClient, "rpc">, source: string, events: HookEvent[]) {
  if (!events.length) return 0;
  const many = await rpcOr<number>(
    (fn, args) => db.rpc(fn, args),
    "hook_stage_many",
    { p_source: source, p_events: events.map((e) => ({ dedupe: e.dedupe, body: e })) },
    async () => {
      let n = 0;
      for (const e of events) {
        const { data, error } = await db.rpc("hook_stage", { p_source: source, p_dedupe: e.dedupe, p_body: e });
        if (error) return { data: null, error };
        if (data) n++;
      }
      return { data: n, error: null };
    },
    { anyError: true },
  );
  if (many.error) throw new Error(many.error.message);
  return many.data ?? 0;
}

export async function readHook(request: Request, publicUrl: string): Promise<HookRequest | Response> {
  const body = await request.text();
  if (body.length > MAX_BODY) return Response.json({ error: "Too large." }, { status: 413 });
  return { headers: request.headers, body, url: publicUrl, method: request.method.toUpperCase() };
}

const parseJson = (body: string): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    // Forms that post url-encoded bodies.
    return Object.fromEntries(new URLSearchParams(body));
  }
};

/** A hook for one source: /api/hooks/<kind>/<source id>?t=<token>. */
export async function sourceHook(db: SupabaseClient, kind: string, id: string, req: HookRequest): Promise<Response> {
  const c = connectorFor(kind);
  if (!c?.parse || !takesHooks(kind) || !/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Not found." }, { status: 404 });
  const [{ data: src }, { data: sec }] = await Promise.all([
    db.from("sources").select("kind, status").eq("id", id).maybeSingle(),
    db.from("source_secrets").select("hook_sealed").eq("source_id", id).maybeSingle(),
  ]);
  if (!src || src.kind !== kind || src.status === "disconnected") return Response.json({ error: "Not found." }, { status: 404 });
  if (!sec?.hook_sealed) return Response.json({ error: "Not found." }, { status: 404 });
  const { token, secret } = JSON.parse(unseal(sec.hook_sealed)) as { token: string; secret: string | null };
  const given = new URL(req.url).searchParams.get("t") ?? "";
  // The token in the URL, and the tool's signature too when it signs and a secret was given.
  if (!sameText(given, token) || (secret && c.verify && !c.verify(req, secret))) return Response.json({ error: "Not allowed." }, { status: 401 });
  const events = c.parse(parseJson(req.body), req.headers);
  const n = await stage(db, id, events);
  return Response.json({ ok: true, staged: n });
}
