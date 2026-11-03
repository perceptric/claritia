import { appBase } from "@/lib/billing";
import { sealToken, slackExchange, slackReady } from "@/lib/slack/app";
import { readState } from "@/lib/sources/oauth";
import { serviceClient } from "@/lib/serviceClient";

// "Add to Slack" sends the workspace owner back here (docs/router.md Part 17). Save the sealed bot token for the
// workspace and go back to Routing.

const PAGE = "/routing";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = appBase();
  const go = (q: Record<string, string>) => Response.redirect(`${base}${PAGE}?${new URLSearchParams(q)}`, 302);
  const state = readState(url.searchParams.get("state"));
  if (!state || state.kind !== "slack") return go({ error: "The sign-in link expired. Try again." });
  if (url.searchParams.get("error")) return go({ error: "Slack access was not allowed." });
  const code = url.searchParams.get("code") ?? "";
  const db = serviceClient();
  if (!db || !code || !slackReady()) return go({ error: "Could not connect Slack." });
  try {
    const s = await slackExchange(code, `${base}/api/slack/callback`);
    const { error } = await db.rpc("slack_install_save", { p_ws: state.ws, p_user: state.user, p_team: s.team, p_team_name: s.teamName, p_bot: s.bot, p_sealed: sealToken(s.token) });
    if (error) throw new Error(error.message.includes("not_member") ? "You're no longer in this workspace." : error.message);
    return go({ connected: "slack" });
  } catch (e) {
    return go({ error: e instanceof Error ? e.message.slice(0, 200) : "Could not connect Slack." });
  }
}
