"use client";

// Stripe (Settings › Integrations; docs/meetings-scheduler.md 1.8b): the workspace's own Stripe account for paid
// meeting types, connected through Stripe's page. Guests pay the team directly; Claritia never holds the money.
// Drawn as one card in the Integrations grid, like the other tools; the same state and buttons show in its detail
// sheet (useStripe holds them once, for both).
//   Disconnect (owners, confirmed) forgets the account and turns off the meeting types that take payment on it
// (POST /api/book/pay action disconnect, src/lib/meetings/payDisconnect.ts). A hiccup is tried again on its own with
// growing waits; what's left after that is one short line with Retry.

import { ToolCard } from "../ToolCard";
import { useEffect, useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, invalidate, must, postJson, useLoad, type Role, type ViewProps } from "../ui";

type Account = { stripe_account: string; ready: boolean };

/** A failure worth trying again from the browser: the network, a timeout, or the server saying to try again. */
const hiccup = (e: unknown) => e instanceof TypeError || /try again|timed? ?out|network|fetch|busy/i.test(errorText(e));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** `fn`, tried again after 0.5 s and 1.5 s when it hiccups. */
export async function withRetry<T>(fn: () => Promise<T>, waits: number[] = [500, 1500]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= waits.length || !hiccup(e)) throw e;
      await pause(waits[i]!);
    }
  }
}
type Props = Pick<ViewProps, "sb" | "session" | "ws"> & { role: Role };

/** The workspace's Stripe account, and Connect. */
export function useStripe({ sb, session, ws, role }: Props) {
  const acct = useLoad(async () => ({ a: must(await sb.from("payment_accounts").select("stripe_account, ready").eq("workspace_id", ws.id).maybeSingle()) as Account | null }), ws.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Back from Stripe: read the account again so the state is current.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("stripe")));
  useEffect(() => {
    if (!back || role !== "owner") return;
    window.history.replaceState(null, "", window.location.pathname);
    postJson(session, "/api/book/pay", { workspaceId: ws.id, action: "refresh" })
      .then(() => acct.reload())
      .catch((e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [back]);

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      const { url } = await postJson<{ url: string }>(session, "/api/book/pay", { workspaceId: ws.id, action: "connect" });
      window.location.href = url;
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  // Disconnect: confirmed, tried again on a hiccup; a failure leaves one line with Retry.
  const [failed, setFailed] = useState(false);
  const [dropping, setDropping] = useState(false);
  const disconnect = async (asked = false) => {
    if (!asked && !(await askConfirm("Disconnect Stripe?", { body: "Paid meeting types turn off. Booked meetings stay.", ok: "Disconnect", danger: true }))) return;
    setDropping(true);
    setError("");
    setFailed(false);
    try {
      await withRetry(() => postJson(session, "/api/book/pay", { workspaceId: ws.id, action: "disconnect" }));
      acct.reload();
      invalidate((k) => k.startsWith(`meeting_types:${ws.id}`));
    } catch {
      setFailed(true);
      setError("Couldn't disconnect Stripe.");
    } finally {
      setDropping(false);
    }
  };
  return { loaded: !!acct.data, a: acct.data?.a ?? null, busy, dropping, error: acct.error || error, failed, connect, disconnect, owner: role === "owner" };
}

export type StripeState = ReturnType<typeof useStripe>;

/** Stripe's state as a badge, or nothing when it isn't connected. */
export function StripeStatus({ pay }: { pay: StripeState }) {
  return !pay.loaded || !pay.a ? null : <Badge tone={pay.a.ready ? "green" : "amber"} dot>{pay.a.ready ? "Connected" : "Finish on Stripe"}</Badge>;
}

/** Connect, or Continue on Stripe while Stripe still needs details; Disconnect once there's an account; Retry after a failed disconnect. */
export function StripeButtons({ pay }: { pay: StripeState }) {
  if (!pay.loaded || !pay.owner) return null;
  return (
    <>
      {!pay.a?.ready ? (
        <Button variant="ghost" size="sm" onClick={() => void pay.connect()} disabled={pay.busy || pay.dropping}>
          {pay.busy ? "Opening Stripe…" : pay.a ? "Continue on Stripe" : "Connect"}
        </Button>
      ) : null}
      {pay.a ? (
        <Button variant="ghost" size="sm" onClick={() => void pay.disconnect(pay.failed)} disabled={pay.busy || pay.dropping}>
          {pay.dropping ? "Disconnecting…" : pay.failed ? "Retry" : "Disconnect"}
        </Button>
      ) : null}
    </>
  );
}

export const STRIPE_BLURB = "Stripe is the payments platform for taking cards online.";

/** Stripe's card; `onOpen` opens its detail sheet. */
export function StripeCard({ pay, onOpen }: { pay: StripeState; onOpen?: () => void }) {
  return (
    <ToolCard logo={<BrandLogo domain="stripe.com" name="Stripe" size={40} />} name="Stripe" blurb={STRIPE_BLURB} account={pay.a?.stripe_account ?? null} status={<StripeStatus pay={pay} />} onOpen={onOpen}>
      <StripeButtons pay={pay} />
      <ErrorNote message={pay.error} />
    </ToolCard>
  );
}

export function Payments(p: Props) {
  return <StripeCard pay={useStripe(p)} />;
}
