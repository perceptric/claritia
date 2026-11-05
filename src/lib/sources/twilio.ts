// A team's own Twilio (docs/integrations-plan.md, Next step 3), for workflow texts from their own number and for
// WhatsApp on their approved templates. Keys pasted in Settings › Integrations; its account SID is the connection's
// account, so its delivery and reply webhooks find it (129_texts.sql text_source_for).

import type { Connector } from "./types.ts";

export const twilio: Connector = {
  kind: "twilio",
  objects: [],
  async account(ctx) {
    const sid = ctx.secret("account_sid").trim();
    if (!/^AC[0-9a-f]{32}$/.test(sid)) throw new Error("The account SID starts with AC and has 34 characters.");
    const auth = `Basic ${Buffer.from(`${sid}:${ctx.secret("auth_token").trim()}`).toString("base64")}`;
    const d = await ctx.api<{ sid: string; friendly_name?: string }>(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { auth: false, headers: { authorization: auth } });
    return { id: d.sid, label: d.friendly_name ?? "Twilio" };
  },
  defaults: { contact: {} },
};
