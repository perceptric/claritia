import "server-only";
import type { ApiCaller } from "../apiAuth.ts";
import { readEmailDoc, newBlock, newSection, type EmailDoc } from "../design/email/doc.ts";
import { EMAIL_TEMPLATES } from "../design/email/library.ts";
import { readyProblem, sendReady } from "../email/ready.ts";
import { claudeChat } from "../forms/claude.ts";
import { ToolError, type Tool } from "../mcpProtocol.ts";
import { rpcOr } from "../rpcCompat.ts";
import { APP_URL } from "../site.ts";
import { campaignGuard, sendAtOf } from "./guard.ts";
import { buildForSend, emailChatParts, emailChatTurn } from "./server.ts";

// Emails on the MCP server (docs/email-studio-plan.md Part 9), so ChatGPT, Claude and other agents can write a
// campaign with Tia, test it, schedule it and read what it led to. The same rules as the app: drafts change, sent
// emails don't; every send passes the same checks; a send needs a key made by a workspace owner, and one to more than
// 500 people is confirmed by a person in the app.

type Draft = { id: string; name: string; subject: string; status: string; doc: unknown };

/** The key's maker and their role: who the agent acts for. */
async function keyPerson(ctx: ApiCaller): Promise<{ user: string; role: string | null }> {
  const { data: key } = await ctx.sb.from("api_keys").select("created_by").eq("id", ctx.keyId).maybeSingle();
  const user = (key as { created_by?: string | null } | null)?.created_by ?? null;
  if (!user) throw new ToolError("This key has no person behind it. Make a new key in Settings.");
  const { data: m } = await ctx.sb.from("workspace_members").select("role").eq("workspace_id", ctx.workspaceId).eq("user_id", user).maybeSingle();
  return { user, role: (m as { role?: string } | null)?.role ?? null };
}

async function findEmail(ctx: ApiCaller, ref: unknown): Promise<Draft> {
  if (typeof ref !== "string" || !ref.trim()) throw new ToolError("Pass email: the email's name or id.");
  const q = ctx.sb.from("emails").select("id, name, subject, status, doc").eq("workspace_id", ctx.workspaceId).eq("kind", "broadcast").neq("status", "archived");
  const { data, error } = /^[0-9a-f-]{36}$/.test(ref.trim()) ? await q.eq("id", ref.trim()) : await q.ilike("name", ref.trim().replace(/[%_\\]/g, "\\$&"));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Draft[];
  if (!rows.length) throw new ToolError(`Email ${ref} not found. Call list_emails to see them.`);
  if (rows.length > 1) throw new ToolError(`More than one email is called ${ref}. Pass its id.`);
  return rows[0]!;
}

const blank = (): EmailDoc => ({ ...readEmailDoc({}), sections: [newSection([newBlock("footer")])] });
const studio = (id: string) => `${APP_URL}/emails/campaigns/${id}`;

/** One turn with Tia on a draft: the words change the email; the draft saves with the new subject. */
async function writeWithTia(ctx: ApiCaller, d: Draft, words: string): Promise<{ subject: string; reply: string; lines: string[] }> {
  const model = claudeChat();
  if (!model) throw new ToolError("The AI isn't set up on the server.");
  const doc = d.doc ? readEmailDoc(d.doc, { allowHtml: true }) : blank();
  const parts = await emailChatParts(ctx.sb, ctx.workspaceId, doc);
  const r = await emailChatTurn(ctx.sb, model, ctx.workspaceId, { doc, ...parts, subject: d.subject, history: [], confirmed: true }, words);
  if (r.ask) throw new ToolError(`Tia asks: ${r.ask.question} (${r.ask.choices.join(", ")}). Call change_email with the answer.`);
  const subject = r.subject || d.subject;
  const name = d.name === "Untitled email" && subject ? subject.slice(0, 200) : d.name;
  const { error } = await ctx.sb.from("emails").update({ doc: r.doc, subject: subject.slice(0, 300), preheader: r.doc.settings.preheader ?? "", name, updated_at: new Date().toISOString() }).eq("id", d.id).eq("status", "draft");
  if (error) throw new Error(error.message);
  return { subject, reply: r.reply, lines: r.lines };
}

export const emailTools: Tool<ApiCaller>[] = [
  {
    name: "list_emails",
    title: "List emails",
    description: "The workspace's campaigns with their state (draft, scheduled, sending, paused, sent) and results: sent, opened, clicked, meetings booked and forms filled.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    async run(ctx) {
      const { data, error } = await ctx.sb.rpc("email_campaigns", { p_ws: ctx.workspaceId });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as { id: string; name: string; status: string; sent: number; opened: number; clicked: number; meetings: number; forms: number }[];
      if (!rows.length) return { text: "No emails yet. Write one with create_email.", data: { emails: [] } };
      return { text: rows.map((e) => `${e.name} (${e.status}${e.sent ? `, sent ${e.sent}, opened ${e.opened}, clicked ${e.clicked}, ${e.meetings} meetings, ${e.forms} forms` : ""}) ${e.id}`).join("\n"), data: { emails: rows } };
    },
  },
  {
    name: "list_audiences",
    title: "List audiences",
    description: "Who emails can go to: everyone, the lists with how many people each, and the topics people subscribe to.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    async run(ctx) {
      const [total, lists, topics] = await Promise.all([
        ctx.sb.rpc("audience_count", { p_ws: ctx.workspaceId }),
        ctx.sb.rpc("lists_overview", { p_ws: ctx.workspaceId }),
        ctx.sb.from("topics").select("id, name").eq("workspace_id", ctx.workspaceId).order("name"),
      ]);
      if (total.error || lists.error) throw new Error((total.error ?? lists.error)!.message);
      const ls = (lists.data ?? []) as { id: string; name: string; members: number }[];
      const ts = (topics.data ?? []) as { id: string; name: string }[];
      return {
        text: [`Everyone: ${total.data} people`, ...ls.map((l) => `List ${l.name}: ${l.members} people ${l.id}`), ...ts.map((t) => `Topic ${t.name} ${t.id}`)].join("\n"),
        data: { everyone: total.data, lists: ls, topics: ts },
      };
    },
  },
  {
    name: "create_email",
    title: "Write an email",
    description: `Write a new campaign email with Tia, in the workspace's brand and voice, from what it's about. Optionally start from a template: ${EMAIL_TEMPLATES.map((t) => t.key).join(", ")}. It's saved as a draft; change it with change_email, then send_test and schedule_campaign.`,
    inputSchema: { type: "object", properties: { about: { type: "string", description: "What the email is about: the news, the date, who it's for, where the button goes." }, name: { type: "string" }, template: { type: "string", enum: EMAIL_TEMPLATES.map((t) => t.key) } }, required: ["about"] },
    async run(ctx, args) {
      const about = typeof args.about === "string" ? args.about.trim().slice(0, 4000) : "";
      if (about.length < 8) throw new ToolError("Say what the email is about in a sentence or two.");
      const person = await keyPerson(ctx);
      const t = EMAIL_TEMPLATES.find((x) => x.key === args.template);
      const name = typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 200) : t?.name ?? "Untitled email";
      const { data, error } = await ctx.sb.from("emails").insert({ workspace_id: ctx.workspaceId, name, kind: "broadcast", subject: "", preheader: "", html: "", text: "", doc: t ? t.make() : blank(), status: "draft", created_by: person.user }).select("id, name, subject, status, doc").single();
      if (error) throw new Error(error.message);
      const d = data as Draft;
      const r = await writeWithTia(ctx, d, about);
      return { text: `Wrote "${r.subject || name}". ${r.reply}\nOpen it: ${studio(d.id)}`, data: { id: d.id, subject: r.subject, changes: r.lines } };
    },
  },
  {
    name: "change_email",
    title: "Change an email",
    description: "Change a draft email with Tia by saying what to change: words, layout, a button, the subject.",
    inputSchema: { type: "object", properties: { email: { type: "string", description: "Email name or id." }, change: { type: "string" } }, required: ["email", "change"] },
    async run(ctx, args) {
      const d = await findEmail(ctx, args.email);
      if (d.status !== "draft") throw new ToolError(`${d.name} was sent, so it can't change.`);
      const change = typeof args.change === "string" ? args.change.trim().slice(0, 4000) : "";
      if (!change) throw new ToolError("Say what to change.");
      const r = await writeWithTia(ctx, d, change);
      return { text: `${r.reply}\nOpen it: ${studio(d.id)}`, data: { id: d.id, subject: r.subject, changes: r.lines } };
    },
  },
  {
    name: "send_test",
    title: "Send a test",
    description: "Send the email to the person who made this key, through the real sending path, marked [Test].",
    inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    async run(ctx, args) {
      const d = await findEmail(ctx, args.email);
      const person = await keyPerson(ctx);
      const why = readyProblem(await sendReady(ctx.sb, ctx.workspaceId));
      if (why) throw new ToolError(why);
      const built = await buildForSend(ctx.sb, ctx.workspaceId, readEmailDoc(d.doc ?? {}, { allowHtml: true }));
      if ("error" in built) throw new ToolError(built.error);
      const values = { kind: "test", name: "Test", subject: `[Test] ${(d.subject || d.name).slice(0, 190)}`, preheader: built.preheader, html: built.html, text: built.text, links: built.links, marketing: true };
      const { error } = await rpcOr<string>((fn, a) => ctx.sb.rpc(fn, a), "email_test_send", { p_ws: ctx.workspaceId, p_user: person.user, p_values: values }, async () => ({ data: null, error: { message: "Sending tests isn't set up yet." } }));
      if (error) throw new Error(error.message);
      return { text: `Sent a test of ${d.name} to the key's owner.`, data: { id: d.id } };
    },
  },
  {
    name: "schedule_campaign",
    title: "Send or schedule a campaign",
    description: "Send a draft now or at a time, to everyone or one list, optionally on a topic. Needs a key made by a workspace owner. Over 500 people, a person confirms it in the app.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" }, list: { type: "string", description: "List name or id; leave out to send to everyone." }, topic: { type: "string", description: "Topic name or id." }, send_at: { type: "string", description: "When, as an ISO date and time; leave out to send now." } },
      required: ["email"],
    },
    async run(ctx, args) {
      const d = await findEmail(ctx, args.email);
      if (d.status !== "draft") throw new ToolError(`${d.name} isn't a draft (${d.status}).`);
      const person = await keyPerson(ctx);
      const named = async (table: "lists" | "topics", ref: unknown) => {
        if (typeof ref !== "string" || !ref.trim()) return null;
        const q = ctx.sb.from(table).select("id, name").eq("workspace_id", ctx.workspaceId);
        const { data } = /^[0-9a-f-]{36}$/.test(ref.trim()) ? await q.eq("id", ref.trim()) : await q.ilike("name", ref.trim().replace(/[%_\\]/g, "\\$&"));
        const row = ((data ?? []) as { id: string }[])[0];
        if (!row) throw new ToolError(`${table === "lists" ? "List" : "Topic"} ${ref} not found. Call list_audiences.`);
        return row.id;
      };
      const [list, topic] = await Promise.all([named("lists", args.list), named("topics", args.topic)]);
      const when = sendAtOf(args.send_at, Date.now());
      if ("error" in when) throw new ToolError(when.error);
      const { data: counts, error: e1 } = await ctx.sb.rpc("email_audience_counts", { p_ws: ctx.workspaceId, p_lists: list ? [list] : [], p_everyone: !list, p_topic: topic });
      if (e1) throw new Error(e1.message);
      const ready = Number((counts as { ready?: number } | null)?.ready ?? 0);
      const stop = campaignGuard({ role: person.role, ready, subject: d.subject });
      if (stop) throw new ToolError(stop === "confirm" ? `This goes to ${ready.toLocaleString("en-US")} people, so a person confirms it in the app: ${studio(d.id)}` : stop);
      const why = readyProblem(await sendReady(ctx.sb, ctx.workspaceId));
      if (why) throw new ToolError(why);
      const built = await buildForSend(ctx.sb, ctx.workspaceId, readEmailDoc(d.doc ?? {}, { allowHtml: true }));
      if ("error" in built) throw new ToolError(built.error);
      const { data, error } = await ctx.sb.rpc("email_campaign_send", {
        p_ws: ctx.workspaceId,
        p_user: person.user,
        p_email: d.id,
        p_values: { subject: d.subject, preheader: built.preheader, html: built.html, text: built.text, links: built.links, lists: list ? [list] : [], everyone: !list, topic_id: topic, send_at: when.at },
      });
      if (error) throw new ToolError(error.message.replace(/^.*?: /, ""));
      const r = data as { queued: number; status: string };
      return { text: `${d.name}: ${r.status === "scheduled" ? `scheduled for ${when.at}` : "sending now"} to ${r.queued.toLocaleString("en-US")} people (${ready.toLocaleString("en-US")} ready; the rest are held back by consent or unsubscribes when it goes).\n${APP_URL}/emails`, data: r };
    },
  },
  {
    name: "email_results",
    title: "Email results",
    description: "What one campaign led to: delivered, opened, clicked, meetings booked and forms filled within 7 days of a click, unsubscribes and bounces.",
    inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    readOnly: true,
    async run(ctx, args) {
      const d = await findEmail(ctx, args.email);
      const { data, error } = await ctx.sb.rpc("email_campaigns", { p_ws: ctx.workspaceId });
      if (error) throw new Error(error.message);
      const c = ((data ?? []) as Record<string, number | string>[]).find((x) => x.id === d.id);
      if (!c) throw new ToolError(`No results for ${d.name}.`);
      return {
        text: `${d.name} (${c.status}): sent ${c.sent}, delivered ${c.delivered}, opened ${c.opened}, clicked ${c.clicked}, ${c.meetings} meetings booked, ${c.forms} forms filled, ${c.unsubscribed} unsubscribed, ${Number(c.bounced) + Number(c.complained)} bounced or marked as spam.\n${studio(d.id)}`,
        data: c,
      };
    },
  },
];
