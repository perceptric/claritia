"use client";

// Stripe (Settings › Integrations; docs/meetings-scheduler.md 1.8b): the workspace's own Stripe account for paid
// meeting types, connected through Stripe's page. Guests pay the team directly; Claritia never holds the money.
// Drawn as one card in the Integrations grid, like the other tools; the same state and buttons show in its detail
// sheet (useStripe holds them once, for both).

import { ToolCard } from "../ToolCard";
import { useEffect, useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { Badge, Button, ErrorNote, errorText, must, postJson, useLoad, type Role, type ViewProps } from "../ui";

type Account = { stripe_account: string; ready: boolean };
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
  return { loaded: !!acct.data, a: acct.data?.a ?? null, busy, error: acct.error || error, connect, owner: role === "owner" };
}

export type StripeState = ReturnType<typeof useStripe>;

/** Stripe's state as a badge, or nothing when it isn't connected. */
export function StripeStatus({ pay }: { pay: StripeState }) {
  return !pay.loaded || !pay.a ? null : <Badge tone={pay.a.ready ? "green" : "amber"} dot>{pay.a.ready ? "Connected" : "Finish on Stripe"}</Badge>;
}

/** Connect, or Continue on Stripe while Stripe still needs details. */
export function StripeButtons({ pay }: { pay: StripeState }) {
  if (!pay.loaded || !pay.owner || pay.a?.ready) return null;
  return (
    <Button variant="ghost" size="sm" onClick={() => void pay.connect()} disabled={pay.busy}>
      {pay.busy ? "Opening Stripe…" : pay.a ? "Continue on Stripe" : "Connect"}
    </Button>
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
