import { appBase } from "@/lib/billing";
import type { Rpc } from "@/lib/jobs";
import { withDefaults } from "@/lib/meetings/public";
import type { MeetingType } from "@/lib/meetings/types";
import { slackEmail, slackSigned, tokenOf } from "@/lib/slack/app";
import { slackBook } from "@/lib/slack/book";
import { later } from "@/lib/later";
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
  // Slack gives a command 3 seconds. The answer usually comes well before that; when it doesn't, Slack hears that
  // the link is on its way, and the answer follows to the command's response address.
  const work = answerBook(db, f).catch(() => reply("Couldn't make the link. Try again."));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const quick = await Promise.race([work, new Promise<null>((r) => (timer = setTimeout(() => r(null), 2_500)))]);
  clearTimeout(timer);
  if (quick) return Response.json(quick);
  const url = f.get("response_url") ?? "";
  later(async () => {
    const answer = await work;
    if (!/^https:\/\/hooks\.slack\.com\//.test(url)) return;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answer), signal: AbortSignal.timeout(10_000) });
  });
  return say("Making the link.");
}

type Reply = { response_type: "ephemeral"; text: string; blocks?: unknown[] };
const reply = (text: string): Reply => ({ response_type: "ephemeral", text });

async function answerBook(db: NonNullable<ReturnType<typeof serviceClient>>, f: URLSearchParams): Promise<Reply> {
  const rpc: Rpc = (fn, args) => db.rpc(fn, args);
  const install = (await db.rpc("slack_install_token", { p_team: f.get("team_id") ?? "" })).data as { workspace_id: string; sealed: string } | null;
  const token = tokenOf(install?.sealed);
  if (!install || !token) return reply("Add Claritia to Slack again from Routing.");
  const email = await slackEmail(token, f.get("user_id") ?? "");
  const caller = email ? ((await db.rpc("slack_caller", { p_team: f.get("team_id") ?? "", p_email: email })).data as { user_id: string | null } | null) : null;
  if (!caller?.user_id) return reply("Your Slack email isn't on a Claritia account in this workspace.");
  try {
    return await slackBook({
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
  } catch {
    return reply("Couldn't make the link. Try again.");
  }
}
