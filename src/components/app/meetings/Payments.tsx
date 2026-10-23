"use client";

// Payments (Settings → Workspace → Payments; docs/meetings-scheduler.md 1.8b): the workspace's own Stripe account for
// paid meeting types, connected through Stripe's page. Guests pay the team directly; Claritia never holds the money.

import { useEffect, useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { Badge, Button, CardHead, ErrorNote, errorText, Loading, must, Panel, postJson, useLoad, type Role, type ViewProps } from "../ui";

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
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Payments" />
      <div className="flex flex-col gap-4 p-5">
        <ErrorNote message={acct.error || error} />
        {!acct.data ? (
          acct.error ? null : <Loading />
        ) : !a ? (
          <div className="flex items-center gap-3">
            <BrandLogo domain="stripe.com" name="Stripe" size={28} />
            <span className="min-w-0 flex-1 text-[13.5px] font-medium">Stripe</span>
            {role === "owner" ? (
              <Button onClick={connect} disabled={busy}>
                {busy ? "Opening Stripe…" : "Connect Stripe"}
              </Button>
            ) : (
              <Badge>Not connected</Badge>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <BrandLogo domain="stripe.com" name="Stripe" size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] font-medium">Stripe</span>
              <span className="font-mono text-[12px] text-muted">{a.stripe_account}</span>
            </span>
            <Badge tone={a.ready ? "green" : "amber"} dot>
              {a.ready ? "Taking payments" : "Finish on Stripe"}
            </Badge>
            {role === "owner" && !a.ready ? (
              <Button variant="ghost" size="sm" onClick={connect} disabled={busy}>
                {busy ? "Opening Stripe…" : "Continue on Stripe"}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </Panel>
  );
}
