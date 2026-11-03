import "server-only";
import { rpcOr } from "../rpcCompat.ts";
import type { serviceClient } from "../serviceClient.ts";

// Whether a workspace can send right now: a From address on a verified domain, and sending not paused. Read fresh
// every time, so a pause or a new From address counts at once (Settings › Sending's test, Share's Email the link).

type Db = NonNullable<ReturnType<typeof serviceClient>>;
export type Ready = { from_email: string | null; paused: boolean; verified: boolean };

export async function sendReady(db: Db, ws: string): Promise<Ready> {
  const r = await rpcOr<Ready>((fn, args) => db.rpc(fn, args), "email_test_ready", { p_ws: ws }, async () => {
    const { data: s, error } = await db.from("send_settings").select("from_email, from_name, address, paused").eq("workspace_id", ws).maybeSingle();
    if (error) return { data: null, error };
    if (!s?.from_email) return { data: { from_email: null, paused: false, verified: false }, error: null };
    const { data: domain } = await db.rpc("verified_domain_for", { p_ws: ws, p_email: s.from_email });
    return { data: { from_email: s.from_email as string, paused: !!s.paused, verified: !!(domain as { id?: string } | null)?.id }, error: null };
  }, { anyError: true });
  if (r.error) throw new Error(r.error.message);
  return r.data ?? { from_email: null, paused: false, verified: false };
}

/** Why it can't send, as the answer to give; null when it can. */
export const notReady = (s: Ready): Response | null =>
  !s.from_email
    ? Response.json({ error: "Add a From address first." }, { status: 409 })
    : s.paused
      ? Response.json({ error: "Sending is paused." }, { status: 409 })
      : !s.verified
        ? Response.json({ error: `${s.from_email.split("@")[1]} isn't a verified sending domain yet.` }, { status: 409 })
        : null;
