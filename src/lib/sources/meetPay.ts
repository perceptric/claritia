// Meeting places and payments on the team's own accounts (docs/integrations-plan.md, Next step 12): Webex (signed in)
// and Whereby (an Embedded API key) for meeting types; PayPal (a REST app's client id and secret) and Square (an
// access token and a location) for payment blocks and paid meeting types. None of them pulls or takes contacts: the
// meeting sync and the payment routes use them (src/lib/meetings/video.ts, src/lib/pay).

import { paypalClient } from "../pay/providers.ts";
import type { Connector } from "./types.ts";

export const webex: Connector = {
  kind: "webex",
  objects: [],
  async account(ctx) {
    const d = await ctx.api<{ id: string; emails?: string[]; displayName?: string }>("https://webexapis.com/v1/people/me");
    return { id: d.id, label: d.emails?.[0] ?? d.displayName ?? "Webex" };
  },
  defaults: { contact: {} },
};

export const whereby: Connector = {
  kind: "whereby",
  objects: [],
  async account(ctx) {
    // A read that only a working key can make.
    await ctx.api("https://api.whereby.dev/v1/meetings?limit=1", { auth: false, headers: { authorization: `Bearer ${ctx.secret("api_key")}` } });
    return { id: `whereby:${ctx.secret("api_key").slice(-6)}`, label: "Whereby" };
  },
  defaults: { contact: {} },
};

export const paypal: Connector = {
  kind: "paypal",
  objects: [],
  async account(ctx) {
    const c = paypalClient({ client_id: ctx.secret("client_id"), client_secret: ctx.secret("client_secret"), mode: ctx.secret("mode") });
    // An order read for an id that can't exist: PayPal answers 404 to a working app, 401 to wrong keys.
    await c.status("CLARITIA-CHECK").catch((e: { status?: number }) => {
      if (e?.status !== 404) throw e;
    });
    return { id: ctx.secret("client_id").slice(0, 40), label: ctx.secret("mode") === "sandbox" ? "PayPal (sandbox)" : "PayPal" };
  },
  defaults: { contact: {} },
};

export const square: Connector = {
  kind: "square",
  objects: [],
  async account(ctx) {
    const base = ctx.secret("env") === "sandbox" ? "https://connect.squareupsandbox.com" : "https://connect.squareup.com";
    const loc = ctx.secret("location_id");
    const d = await ctx.api<{ location?: { id: string; name?: string; business_name?: string } }>(`${base}/v2/locations/${encodeURIComponent(loc)}`, {
      auth: false,
      headers: { authorization: `Bearer ${ctx.secret("access_token")}`, "Square-Version": "2024-10-17" },
    });
    if (!d.location?.id) throw new Error("Square has no such location.");
    return { id: d.location.id, label: d.location.business_name ?? d.location.name ?? "Square" };
  },
  defaults: { contact: {} },
};

export const MEET_PAY = [webex, whereby, paypal, square];
