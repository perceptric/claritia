// Stripe › Disconnect (Settings › Integrations): the workspace forgets its Stripe account for paid meetings, and the
// meeting types that take payment on it turn off, so none of them takes a booking it can't charge for
// (payment_account_disconnect, supabase/migrations/171_plan_locks.sql, one transaction). PayPal and Square prices are
// left alone. Booked and paid meetings stay as they are: refunds of paid meetings still go to the account each
// payment was made on, and a checkout already open when the team disconnects still confirms its meeting
// (handlePayEvent reads the meeting's own account). Claritia connects Stripe by making a Standard account with
// Stripe's account links, not Connect OAuth, so there's no OAuth grant to revoke: the account stays the team's own
// on Stripe. A hiccup (timeout, busy, network) is tried again with growing waits; the call is safe to repeat, since
// a second one finds nothing to forget. Server only, over any Rpc.

import type { Rpc } from "../jobs.ts";
import { TRANSIENT } from "../planGate.ts";
import { setTimeout as pause } from "node:timers/promises";

export type Disconnected = { account: string | null; types: string[] };


export async function disconnectStripe(rpc: Rpc, ws: string, o: { tries?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<Disconnected> {
  const tries = Math.max(1, o.tries ?? 4);
  const wait = o.wait ?? pause;
  for (let i = 0; ; i++) {
    let message: string;
    try {
      const { data, error } = await rpc("payment_account_disconnect", { p_ws: ws });
      if (!error) {
        const d = (data ?? {}) as { account?: unknown; types?: unknown };
        return { account: typeof d.account === "string" ? d.account : null, types: Array.isArray(d.types) ? d.types.filter((x): x is string => typeof x === "string") : [] };
      }
      message = error.message;
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    if (!TRANSIENT.test(message) || i >= tries - 1) throw new Error(message);
    await wait(250 * 3 ** i);
  }
}
