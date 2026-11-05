import "server-only";
import { requireKey, type ApiCaller } from "../apiAuth.ts";
import { allowed } from "../forms/server.ts";
import { viaOfKeyName, type Via } from "./api.ts";

// The Forms API's door (docs/integrations-plan.md, Next step 1): a working API key, 120 calls a minute per key, and
// the app the key belongs to (a key made by signing in to Zapier is named "Zapier").

export type FormsCaller = ApiCaller & { via: Via };

const names = new Map<string, { via: Via; until: number }>();

export async function formsCaller(request: Request): Promise<FormsCaller | { denied: Response }> {
  const c = await requireKey(request);
  if ("denied" in c) return c;
  if (!allowed(`v1:${c.keyId}`, 120)) return { denied: Response.json({ error: "Too many calls. Wait a minute." }, { status: 429, headers: { "Retry-After": "60" } }) };
  const hit = names.get(c.keyId);
  if (hit && hit.until > Date.now()) return { ...c, via: hit.via };
  const { data } = await c.sb.from("api_keys").select("name").eq("id", c.keyId).maybeSingle();
  const via = viaOfKeyName((data as { name?: string } | null)?.name);
  if (names.size > 2000) names.clear();
  names.set(c.keyId, { via, until: Date.now() + 300_000 });
  return { ...c, via };
}

export const bad = (error: string, status = 400) => Response.json({ error }, { status });
