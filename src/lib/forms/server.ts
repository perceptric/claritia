import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tokens } from "./brand.ts";
import type { Form } from "./schema.ts";

// What the public form routes share (docs/form-builder.md Part 6): the live form with a short cache, a per-visitor
// rate limit, the Turnstile check, the visitor's country from the edge, and CORS for any site.

export type PublicForm = { id: string; workspace_id: string; version: number; status: "live" | "paused"; body: Form; tokens: Partial<Tokens>; logo_url: string | null };

const CACHE_MS = 10_000;
const cache = new Map<string, { at: number; form: PublicForm | null }>();

export async function loadPublic(db: SupabaseClient, id: string, fresh = false): Promise<PublicForm | null> {
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.form;
  const { data, error } = await db.rpc("form_public", { p_id: id });
  if (error) throw new Error(error.message);
  const form = (data as PublicForm | null) ?? null;
  if (cache.size > 5000) cache.clear();
  cache.set(id, { at: Date.now(), form });
  return form;
}

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { ...cors, ...headers } });

/** The visitor's IP as the edge saw it. */
export function clientIp(req: Request): string {
  return (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim().slice(0, 64);
}

/** The visitor's country, when the edge in front of us says it (Cloudflare, Vercel, or our own proxy). */
export function edgeCountry(req: Request): string | null {
  const c = (req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || req.headers.get("x-country-code") || "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

// 10 fills a minute from one address to one form, and 600 a minute to one form from everywhere. Per machine.
const buckets = new Map<string, { n: number; reset: number }>();
export function allowed(key: string, max: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    if (buckets.size > 50_000) buckets.clear();
    buckets.set(key, { n: 1, reset: now + 60_000 });
    return true;
  }
  b.n++;
  return b.n <= max;
}

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY?.trim() || "";

/** True when the Turnstile token checks out, or when Turnstile isn't set up on the server. */
export async function turnstileOk(token: unknown, ip: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const res = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    const j = (await res.json()) as { success?: boolean };
    return j.success === true;
  } catch {
    // Cloudflare down: let the fill through rather than lose a lead; the trap and timing checks still ran.
    return true;
  }
}
