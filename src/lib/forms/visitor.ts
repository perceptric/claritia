import "server-only";
import { createHmac } from "node:crypto";
import { regionOf } from "../web/policy.ts";

// Who's submitting, from what our edge says: the IP (Fly, or Cloudflare in front of Render) and Cloudflare's
// country and region. Headers a browser can set are ignored. No country means strict, so a missing header can
// only ask for more consent, never less.

export type Visitor = { ip: string | null; country: string | null; region: "strict" | "notice" };

export function visitorOf(h: Headers): Visitor {
  const ip = h.get("fly-client-ip") || h.get("cf-connecting-ip") || h.get("true-client-ip") || null;
  const raw = (h.get("cf-ipcountry") || "").toUpperCase();
  const country = /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : null;
  const sub = (h.get("cf-region-code") || "").toUpperCase().slice(0, 3);
  const r = regionOf(country ?? "", sub);
  return { ip, country, region: r === "notice" || r === "off" ? "notice" : "strict" };
}

/** The IP as a keyed hash for one workspace: enough to slow down a script, useless outside this check. */
export function ipHash(ip: string | null, workspaceId: string): string | null {
  if (!ip) return null;
  const key = process.env.SECRETS_KEY || process.env.SUPABASE_SECRET_KEY || "claritia-forms";
  return createHmac("sha256", key).update(`${workspaceId}|${ip}`).digest("hex");
}

// A first line against bursts on one instance, before the database's own count.
const recent = new Map<string, number[]>();
export function burst(ip: string | null, limit = 8, windowMs = 60_000): boolean {
  if (!ip) return false;
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some((t) => now - t < windowMs)) recent.delete(k);
  return list.length > limit;
}
