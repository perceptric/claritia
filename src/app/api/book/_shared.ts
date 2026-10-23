import "server-only";
import { appBase } from "@/lib/billing";
import { allowed, clientIp, json, turnstileOk } from "@/lib/forms/server";
import type { Rpc } from "@/lib/jobs";
import type { BookReply, Confirmation, GuestHost, GuestSlot, Profile } from "@/lib/meetings/guest";
import { liveBusyFor } from "@/lib/meetings/live";
import type { BookOutcome } from "@/lib/meetings/public";
import type { TypeSettings } from "@/lib/meetings/types";
import { serviceClient } from "@/lib/serviceClient";

// What the public booking routes share (docs/meetings-scheduler.md 1.8): the service client as an Rpc, the per-IP
// caps (the forms submit route's buckets), Turnstile when the workspace's forms use it, and the guest's answers.

export { json };
export const MAX_BODY = 32 * 1024;

export function rpcOrNull(): { rpc: Rpc; db: NonNullable<ReturnType<typeof serviceClient>> } | null {
  const db = serviceClient();
  return db ? { db, rpc: (fn, args) => db.rpc(fn, args) } : null;
}

/** 10 booking tries a minute from one address (and 120 reads), per machine, like form fills. */
export function limited(request: Request, kind: "read" | "write"): Response | null {
  const ip = clientIp(request);
  const ok = kind === "write" ? allowed(`book:${ip}`, 10) : allowed(`book-read:${ip}`, 120);
  return ok ? null : json({ error: "Too many tries. Wait a minute and try again." }, 429, { "Retry-After": "60" });
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function spamOk(request: Request, on: boolean, token: unknown): Promise<boolean> {
  return on ? turnstileOk(token, clientIp(request)) : true;
}

export const liveFor = (rpc: Rpc, ws: string) => liveBusyFor(rpc, ws);
export const base = () => appBase();

const ERRORS: Record<string, string> = {
  slot_taken: "That time was just taken.",
  not_offered: "That time was just taken.",
  full: "That time just filled up.",
  link_used: "This link has already been used.",
  link_closed: "This link is closed.",
  no_payments: "This meeting can't take payments yet.",
};

export function failed(r: { error: string; slots?: GuestSlot[] }): Response {
  const status = r.error.startsWith("link") ? 410 : r.error === "no_payments" ? 503 : 409;
  return json({ ok: false, error: ERRORS[r.error] ?? "Try again in a moment.", code: r.error, slots: r.slots ?? [] } satisfies BookReply, status);
}

export function hostsOf(ids: string[], profiles: Profile[]): GuestHost[] {
  const byId = new Map(profiles.map((p) => [p.user_id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is Profile => !!p).map((p) => ({ name: p.name, photo: p.photo_url, slug: p.slug }));
}

export function confirmationOf(c: TypeSettings["confirmation"] | undefined): Confirmation {
  if (c?.kind === "redirect" && /^https:\/\/\S+$/.test(c.url)) return { kind: "redirect", url: c.url };
  return { kind: "message", ...(c?.kind === "message" && c.text ? { text: c.text.slice(0, 1000) } : {}) };
}

export function booked(r: Extract<BookOutcome, { ok: true }>, o: { profiles: Profile[]; confirmation?: TypeSettings["confirmation"]; checkout?: string }): Response {
  return json({
    ok: true,
    start: r.start,
    end: r.end,
    manage: `/book/m/${r.token}`,
    hosts: hostsOf(r.hosts, o.profiles),
    confirmation: confirmationOf(o.confirmation),
    ...(o.checkout ? { checkout: o.checkout } : {}),
  } satisfies BookReply);
}

/** A start from the body: epoch ms or an ISO time. */
export function startOf(v: unknown): number | null {
  const t = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? Math.round(t) : null;
}
