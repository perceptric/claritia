import { slackEmail, slackSigned, tokenOf } from "@/lib/slack/app";
import { later } from "@/lib/later";
import { serviceClient } from "@/lib/serviceClient";

// Buttons in Claritia's Slack messages (docs/router.md Part 17). Slack signs each press. "Mark contacted" meets the
// lead's response time for the person who pressed it, when they own the lead (or own the workspace). Link buttons
// also arrive here and need nothing.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Payload = { type?: string; team?: { id?: string }; user?: { id?: string }; response_url?: string; actions?: { action_id?: string; value?: string }[] };

async function answer(url: string | undefined, text: string, replace: boolean) {
  if (!url || !/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(replace ? { replace_original: false, response_type: "ephemeral", text } : { response_type: "ephemeral", text }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!slackSigned({ body: raw, timestamp: request.headers.get("x-slack-request-timestamp"), signature: request.headers.get("x-slack-signature") })) {
    return new Response("Bad signature", { status: 401 });
  }
  let p: Payload;
  try {
    p = JSON.parse(new URLSearchParams(raw).get("payload") ?? "{}") as Payload;
  } catch {
    return new Response(null, { status: 200 });
  }
  const act = p.actions?.[0];
  if (p.type !== "block_actions" || act?.action_id !== "sla_done") return new Response(null, { status: 200 });
  const contact = act.value ?? "";
  const team = p.team?.id ?? "";
  const db = serviceClient();
  if (!db || !UUID.test(contact)) return new Response(null, { status: 200 });
  // Slack wants its answer within 3 seconds: say yes now, and do the work (and post how it went) after.
  later(async () => {
    const install = (await db.rpc("slack_install_token", { p_team: team })).data as { workspace_id: string; sealed: string } | null;
    const token = tokenOf(install?.sealed);
    if (!install || !token) return;
    const email = await slackEmail(token, p.user?.id ?? "");
    const caller = email ? ((await db.rpc("slack_caller", { p_team: team, p_email: email })).data as { user_id: string | null } | null) : null;
    if (!caller?.user_id) return answer(p.response_url, "Your Slack email isn't on a Claritia account in this workspace.", true);
    const { error } = await db.rpc("router_sla_mark", { p_ws: install.workspace_id, p_contact: contact, p_user: caller.user_id });
    if (error) await answer(p.response_url, error.message.includes("not_owner") ? "Only the lead's owner can mark it contacted." : "Couldn't mark it. Try again in Claritia.", true);
    else await answer(p.response_url, "Marked contacted.", true);
  });
  return new Response(null, { status: 200 });
}
