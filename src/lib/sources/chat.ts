// Chat alerts beside Slack (docs/integrations-plan.md, Next step 5). Microsoft Teams: signed in on the Microsoft app
// meetings use, posting to a channel picked in the form's Sync tab or the workflow step, through Microsoft Graph.
// Discord: "Add to Discord" picks a server's channel and hands back its webhook, so each connection is one channel;
// a channel's webhook address can be pasted when Claritia's Discord app isn't set up. Neither pulls or takes
// contacts: a form's fills and a workflow's step post to them (`alert`).

import type { ChatNote } from "../chat/note.ts";
import { discordBody, teamsHtml } from "../chat/note.ts";
import type { Connector, Ctx, RowTarget } from "./types.ts";

const status = (e: unknown) => (e as { status?: number })?.status ?? 0;
const refusal = (message: string) => Object.assign(new Error(message), { refused: true });

// Microsoft Teams ---------------------------------------------------------------------------------------------

const GRAPH = "https://graph.microsoft.com/v1.0";

export const teams: Connector = {
  kind: "teams",
  objects: [],
  gapMs: 200,
  async account(ctx) {
    const d = await ctx.api<{ id: string; mail?: string; userPrincipalName?: string }>(`${GRAPH}/me?$select=id,mail,userPrincipalName`);
    return { id: d.id, label: d.mail ?? d.userPrincipalName ?? "Microsoft Teams" };
  },
  /** The channels the person can post to, as "Team / Channel". */
  async targets(ctx) {
    const ts = (await ctx.api<{ value?: { id: string; displayName: string }[] }>(`${GRAPH}/me/joinedTeams?$select=id,displayName`)).value ?? [];
    const out: RowTarget[] = [];
    for (const t of ts.slice(0, 50)) {
      const cs = (await ctx.api<{ value?: { id: string; displayName: string; webUrl?: string }[] }>(`${GRAPH}/teams/${encodeURIComponent(t.id)}/channels?$select=id,displayName,webUrl`)).value ?? [];
      for (const c of cs) out.push({ id: `${t.id}/${c.id}`, name: `${t.displayName} / ${c.displayName}`, ...(c.webUrl ? { url: c.webUrl } : {}) });
    }
    return out;
  },
  async alert(ctx, target, note) {
    const [team, channel] = (target?.id ?? "").split("/");
    if (!team || !channel) throw refusal("No Teams channel is picked.");
    try {
      await ctx.api(`${GRAPH}/teams/${encodeURIComponent(team)}/channels/${encodeURIComponent(channel)}/messages`, { method: "POST", body: JSON.stringify({ body: { contentType: "html", content: teamsHtml(note) } }) });
    } catch (e) {
      if (status(e) === 404) throw refusal(target?.name ? `The Teams channel ${target.name} is gone.` : "The Teams channel is gone.");
      throw e;
    }
  },
  defaults: { contact: {} },
};

// Discord -----------------------------------------------------------------------------------------------------

const HOOK = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d{5,30}\/[A-Za-z0-9_-]{20,200}$/;
const hookOf = (ctx: Ctx) => {
  const u = (ctx.secret("webhook_url") || ctx.secret("url")).trim();
  if (!HOOK.test(u)) throw refusal("Connect the Discord channel again.");
  return u;
};

export const discord: Connector = {
  kind: "discord",
  objects: [],
  gapMs: 300,
  async account(ctx) {
    const d = await ctx.api<{ channel_id: string; name?: string }>(hookOf(ctx), { auth: false });
    return { id: d.channel_id, label: d.name ? `${d.name} (Discord)` : "Discord channel" };
  },
  async alert(ctx, _target, note: ChatNote) {
    try {
      // A 429 waits for Discord's Retry-After (or goes back to the jobs queue when it's long).
      await ctx.api(`${hookOf(ctx)}?wait=true`, { method: "POST", auth: false, body: JSON.stringify(discordBody(note)) });
    } catch (e) {
      if (status(e) === 404 || status(e) === 401) throw refusal("The Discord channel's webhook was deleted. Connect the channel again in Settings › Integrations.");
      throw e;
    }
  },
  defaults: { contact: {} },
};

/** Whether an alert failed for a reason that won't change by trying again. */
export const isRefusal = (e: unknown) => !!(e as { refused?: boolean })?.refused;
