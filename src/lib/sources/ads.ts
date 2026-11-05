// Ad tools for Settings › Tracking (docs/integrations-plan.md, Next step 2): Meta's Conversions API (a system user's
// access token, pasted) and Google Ads (signed in with Google, on the Google app the calendars use, with the adwords
// scope and the server's developer token). Neither pulls or pushes contacts; the track_send job sends their events
// (src/lib/track/server.ts).

import { ADS_VERSION, META_VERSION } from "../track/server.ts";
import type { Connector, Ctx } from "./types.ts";

export const metaAds: Connector = {
  kind: "meta_ads",
  objects: [],
  async account(ctx) {
    const token = ctx.secret("access_token");
    const d = await ctx.api<{ id: string; name?: string }>(`https://graph.facebook.com/${META_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token)}`, { auth: false });
    return { id: d.id, label: d.name ?? "Meta" };
  },
  defaults: { contact: {} },
};

const adsToken = () => process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() || "";
export const adsReady = () => !!adsToken();
export const adsDeveloperToken = adsToken;

export const googleAds: Connector = {
  kind: "google_ads",
  objects: [],
  async account(ctx) {
    const d = await ctx.api<{ id: string; email: string }>("https://www.googleapis.com/oauth2/v2/userinfo");
    return { id: d.id, label: d.email };
  },
  defaults: { contact: {} },
};

const ADS = `https://googleads.googleapis.com/${ADS_VERSION}`;
type Row = { customerClient?: { id?: string; descriptiveName?: string; manager?: boolean }; conversionAction?: { id?: string; name?: string } };

async function search(ctx: Ctx, customer: string, query: string, login?: string): Promise<Row[]> {
  const r = await ctx.api<{ results?: Row[] }[]>(`${ADS}/customers/${customer}/googleAds:searchStream`, {
    method: "POST",
    headers: { "developer-token": adsToken(), ...(login ? { "login-customer-id": login } : {}) },
    body: JSON.stringify({ query }),
  });
  return (Array.isArray(r) ? r : []).flatMap((b) => b.results ?? []);
}

/** The ad accounts the person can reach, each with the manager it's reached through. */
export async function adsAccounts(ctx: Ctx): Promise<{ customer: string; login: string; name: string }[]> {
  const top = ((await ctx.api<{ resourceNames?: string[] }>(`${ADS}/customers:listAccessibleCustomers`, { headers: { "developer-token": adsToken() } })).resourceNames ?? []).map((n) => n.split("/")[1]!).slice(0, 20);
  const out = new Map<string, { customer: string; login: string; name: string }>();
  for (const id of top) {
    const rows = await search(ctx, id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager FROM customer_client WHERE customer_client.level <= 1", id).catch(() => []);
    for (const r of rows) {
      const c = r.customerClient;
      if (!c?.id || c.manager || out.has(c.id)) continue;
      out.set(c.id, { customer: c.id, login: id, name: c.descriptiveName || c.id });
    }
  }
  return [...out.values()];
}

/** An account's conversion actions that take uploaded clicks. */
export async function adsActions(ctx: Ctx, customer: string, login: string): Promise<{ id: string; name: string }[]> {
  const rows = await search(ctx, customer, "SELECT conversion_action.id, conversion_action.name FROM conversion_action WHERE conversion_action.status = 'ENABLED' AND conversion_action.type = 'UPLOAD_CLICKS'", login);
  return rows.flatMap((r) => (r.conversionAction?.id ? [{ id: r.conversionAction.id, name: r.conversionAction.name ?? r.conversionAction.id }] : []));
}
