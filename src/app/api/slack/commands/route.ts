import { appBase } from "@/lib/billing";
import type { Rpc } from "@/lib/jobs";
import { withDefaults } from "@/lib/meetings/public";
import type { MeetingType } from "@/lib/meetings/types";
import { slackEmail, slackSigned, tokenOf } from "@/lib/slack/app";
import { slackBook } from "@/lib/slack/book";
import { serviceClient } from "@/lib/serviceClient";

// Slack's slash commands (docs/router.md Part 17). Slack signs each request; the answer goes back only to the person
// who typed it. /book <lead email> [type words]: a single-use booking link.

const say = (text: string) => Response.json({ response_type: "ephemeral", text });

export async function POST(request: Request) {
  const raw = await request.text();
  if (!slackSigned({ body: raw, timestamp: request.headers.get("x-slack-request-timestamp"), signature: request.headers.get("x-slack-signature") })) {
    return new Response("Bad signature", { status: 401 });
  }
  const f = new URLSearchParams(raw);
  if (f.get("command") !== "/book") return say("Claritia knows /book.");
  const db = serviceClient();
  if (!db) return say("Claritia isn't reachable right now.");
  const rpc: Rpc = (fn, args) => db.rpc(fn, args);
  const install = (await db.rpc("slack_install_token", { p_team: f.get("team_id") ?? "" })).data as { workspace_id: string; sealed: string } | null;
  const token = tokenOf(install?.sealed);
  if (!install || !token) return say("Add Claritia to Slack again from Routing.");
  const email = await slackEmail(token, f.get("user_id") ?? "");
  const caller = email ? ((await db.rpc("slack_caller", { p_team: f.get("team_id") ?? "", p_email: email })).data as { user_id: string | null } | null) : null;
  if (!caller?.user_id) return say("Your Slack email isn't on a Claritia account in this workspace.");
  try {
    const reply = await slackBook({
      rpc,
      ws: install.workspace_id,
      user: caller.user_id,
      text: f.get("text") ?? "",
      base: appBase(),
      loadType: async (id) => {
        const { data } = await db.from("meeting_types").select("*").eq("id", id).eq("workspace_id", install.workspace_id).eq("active", true).maybeSingle();
        return data ? withDefaults(data as MeetingType) : null;
      },
      saveLink: async (row) => {
        const { error } = await db.from("meeting_links").insert(row);
        if (error) throw new Error(error.message);
      },
    });
    return Response.json(reply);
  } catch {
    return say("Couldn't make the link. Try again.");
  }
}
