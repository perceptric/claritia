"use client";

// Stripe (Settings › Integrations; docs/meetings-scheduler.md 1.8b): the workspace's own Stripe account for paid
// meeting types, connected through Stripe's page. Guests pay the team directly; Claritia never holds the money.
// Drawn as one card in the Integrations grid, like the other tools.

import { ToolCard } from "../ToolCard";
import { useEffect, useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { Badge, Button, ErrorNote, errorText, must, postJson, useLoad, type Role, type ViewProps } from "../ui";

type Account = { stripe_account: string; ready: boolean };

export function Payments({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws"> & { role: Role }) {
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

  const a = acct.data?.a;
  const owner = role === "owner";
  return (
    <ToolCard
      logo={<BrandLogo domain="stripe.com" name="Stripe" size={40} />}
      name="Stripe"
      blurb="Payments for paid meetings."
      account={a?.stripe_account ?? null}
      status={!acct.data || !a ? null : <Badge tone={a.ready ? "green" : "amber"} dot>{a.ready ? "Connected" : "Finish on Stripe"}</Badge>}
    >
      {acct.data && !a && owner ? (
        <Button variant="ghost" size="sm" onClick={connect} disabled={busy}>
          {busy ? "Opening Stripe…" : "Connect"}
        </Button>
      ) : null}
      {a && !a.ready && owner ? (
        <Button variant="ghost" size="sm" onClick={connect} disabled={busy}>
          {busy ? "Opening Stripe…" : "Continue on Stripe"}
        </Button>
      ) : null}
      <ErrorNote message={acct.error || error} />
    </ToolCard>
  );
}
