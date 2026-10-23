import "server-only";
import { turnstileSiteKey } from "@/lib/forms/server";
import type { Rpc } from "@/lib/jobs";
import { serviceClient } from "@/lib/serviceClient";

// What the booking pages share on the server: the service client as an Rpc and the address's options.

export function pageRpc(): Rpc | null {
  const db = serviceClient();
  return db ? (fn, args) => db.rpc(fn, args) : null;
}

export type Search = Promise<Record<string, string | string[] | undefined>>;
export const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * ?embed=1 (the <claritia-book> frame), ?form=<id> (the form's brand kit), ?name= and ?email= to fill in, and from a
 * booking link ?host= (the host to prefer) and ?ref= (the form fill it came from, src/lib/meetings/links.ts).
 */
export async function options(searchParams: Search) {
  const sp = await searchParams;
  const name = one(sp.name)?.slice(0, 200);
  const email = one(sp.email)?.slice(0, 320);
  const host = one(sp.host)?.slice(0, 64);
  const ref = one(sp.ref)?.slice(0, 120);
  return { embed: one(sp.embed) === "1", form: one(sp.form) ?? null, prefill: name || email ? { name, email } : undefined, paid: one(sp.paid) === "1", link: host || ref ? { host, ref } : undefined };
}

export const turnstileFor = (on: boolean) => (on ? turnstileSiteKey() || null : null);

/** Keeps ?embed=1 on links between pages inside a frame. */
export const keep = (href: string, embed: boolean) => (embed ? `${href}?embed=1` : href);
