import "server-only";
import type { Rpc } from "../jobs.ts";
import { unseal } from "../seal.ts";
import type { Creds } from "../sources/types.ts";
import { allFields, type Form } from "../forms/schema.ts";
import { loadMeeting } from "../meetings/public.ts";
import { refundProvider, settleForm, settleMeeting, startMeetingPay } from "./flow.ts";
import { isPayProvider, payClient, type PayClient, type PayProvider } from "./providers.ts";

// PayPal and Square on the server (docs/integrations-plan.md, Next step 12): the workspace's own keys, read from its
// connection in Settings › Integrations, and the checks the routes run.

/** The workspace's keys for a provider, or null when it isn't connected. */
export async function keysFor(rpc: Rpc, ws: string, provider: PayProvider): Promise<Record<string, string> | null> {
  const { data: id } = await rpc("workspace_source", { p_ws: ws, p_kind: provider });
  if (typeof id !== "string") return null;
  const { data } = await rpc("source_load", { p_id: id });
  const sealed = (data as { sealed?: string | null } | null)?.sealed;
  if (!sealed) return null;
  try {
    const c = JSON.parse(unseal(sealed)) as Creds;
    return c.type === "key" ? c.values : null;
  } catch {
    return null;
  }
}

export async function clientFor(rpc: Rpc, ws: string, provider: PayProvider, fetcher?: typeof fetch): Promise<PayClient | null> {
  const keys = await keysFor(rpc, ws, provider);
  return keys ? payClient(provider, keys, { fetcher }) : null;
}

/** Who takes a form's payment: PayPal or Square when its payment block says so, else Stripe (null). */
export const formProvider = (form: Form): PayProvider | null => {
  const p = allFields(form).find((f) => f.type === "payment")?.pay?.provider;
  return isPayProvider(p) ? p : null;
};

/** Settle what a return or a webhook is about, read back from the provider. */
export async function settle(rpc: Rpc, client: PayClient, ref: { kind: "form" | "meeting"; id: string }) {
  return ref.kind === "form" ? settleForm(rpc, client, ref.id) : settleMeeting(rpc, client, ref.id);
}

/** A paid meeting held by book(): its checkout on the type's provider. */
export async function providerCheckout(rpc: Rpc, o: { ws: string; provider: PayProvider; meetingId: string; token: string; base: string }): Promise<{ ok: true; url: string } | { ok: false }> {
  const client = await clientFor(rpc, o.ws, o.provider);
  if (!client) {
    await rpc("meeting_status", { p_id: o.meetingId, p_status: "canceled", p_reason: "Checkout could not start.", p_by: null });
    return { ok: false };
  }
  return startMeetingPay(rpc, client, o);
}

/** A host's cancel of a meeting paid on PayPal or Square: the payment back in full, once. Null when it wasn't one. */
export async function refundIfProvider(rpc: Rpc, meetingId: string): Promise<{ ok: true; refunded: boolean } | { ok: false; reason: string } | null> {
  const v = await loadMeeting(rpc, { id: meetingId });
  const p = v?.meeting.payment as { provider?: string } | null | undefined;
  if (!v || !isPayProvider(p?.provider)) return null;
  const client = await clientFor(rpc, v.meeting.workspace_id, p.provider);
  if (!client) return { ok: false, reason: "Connect PayPal or Square again to refund." };
  try {
    return { ok: true, refunded: await refundProvider(rpc, client, v) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "The refund didn't go through." };
  }
}
