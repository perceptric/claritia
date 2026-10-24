import "server-only";
import type { ApiCaller } from "../apiAuth.ts";
import type { Rpc } from "../jobs.ts";
import { ToolError, type Tool } from "../mcpProtocol.ts";
import { APP_URL } from "../site.ts";
import * as A from "./actions.ts";
import { cleanBody } from "./check.ts";
import { explain, partText, type Line } from "./explain.ts";
import type { Decision, Facts, StepResult } from "./types.ts";

// The router on the MCP server (docs/router-ux.md W10): Claude can read the router, ask why a lead went where it
// did, test where a lead would go, and propose a change. A proposal is saved as the draft for a person to replay and
// publish in Claritia; Claude never publishes.

const text = (lines: Line[]) => lines.map((l) => `${l.mark === "ok" ? "✓" : l.mark === "miss" ? "✗" : "–"} ${l.title}: ${l.parts.map(partText).join("")}`).join("\n");

const caller = (ctx: ApiCaller): A.Caller => ({ ws: ctx.workspaceId, user: ctx.keyId, role: "owner" });
const rpcOf = (ctx: ApiCaller): Rpc => (fn, args) => ctx.sb.rpc(fn, args);

export const routerTools: Tool<ApiCaller>[] = [
  {
    name: "get_router",
    title: "Get the router",
    description: "The lead router as JSON: the live version and the draft (steps, rules with conditions, queues with reps, fallback, territories), with the reps' names and ids and the fields rules can test.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    async run(ctx) {
      const out = await A.load(rpcOf(ctx), ctx.sb, caller(ctx));
      const people = out.members.map((m) => `${m.name} <${m.email}> ${m.id}`).join("\n");
      return {
        text: `Live: ${out.live ? `v${out.live.version}` : "none"}. Draft: ${out.draft ? "yes" : "none"}.\nReps:\n${people}\n\`\`\`json\n${JSON.stringify(out.draft ?? out.live?.body ?? null, null, 2)}\n\`\`\``,
        data: { live: out.live, draft: out.draft, members: out.members, fields: out.fields.map((f) => ({ key: f.key, label: f.label, type: f.type })) },
      };
    },
  },
  {
    name: "route_explain",
    title: "Why a lead went where it did",
    description: "The router's log for a contact's latest route, in plain sentences.",
    inputSchema: { type: "object", properties: { contact: { type: "string", description: "The contact's email or id." } }, required: ["contact"] },
    readOnly: true,
    async run(ctx, args) {
      const ref = String(args.contact ?? "").trim().toLowerCase();
      if (!ref) throw new ToolError("Pass contact: an email or id.");
      const c = (/^[0-9a-f-]{36}$/.test(ref)
        ? await ctx.sb.from("contacts").select("id").eq("workspace_id", ctx.workspaceId).eq("id", ref).maybeSingle()
        : await ctx.sb.from("contacts").select("id").eq("workspace_id", ctx.workspaceId).eq("email_clean", ref).limit(1).maybeSingle()
      ).data as { id: string } | null;
      if (!c) throw new ToolError(`No contact ${ref}.`);
      const run = (await ctx.sb.from("router_runs").select("id, kind, owner, by, steps, facts, created_at").eq("contact_id", c.id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data as {
        id: string;
        kind: "owner" | "held" | "unassigned";
        owner: string | null;
        by: string | null;
        steps: StepResult[];
        facts: Facts;
        created_at: string;
      } | null;
      if (!run) return { text: "This contact hasn't been routed yet.", data: { run: null } };
      const d: Decision = { result: run.kind === "owner" ? { kind: "owner", user: run.owner ?? "", by: (run.by ?? "queue") as "queue" } : run.kind === "held" ? { kind: "held", signals: [] } : { kind: "unassigned" }, steps: run.steps };
      return { text: `${text(explain(d, run.facts))}\nLog: ${APP_URL}/routing/log/${run.id}`, data: { run: run.id } };
    },
  },
  {
    name: "route_test",
    title: "Test a route",
    description: "Where a lead would go, by email, with optional field changes (keys like lead.country, company.size, answer.<key>). Runs the draft and the live router; changes nothing.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" }, changes: { type: "object", description: "Field values to try, e.g. {\"lead.country\": \"DE\"}." } },
      required: ["email"],
    },
    readOnly: true,
    async run(ctx, args) {
      const r = await A.test(rpcOf(ctx), ctx.sb, caller(ctx), { email: String(args.email ?? ""), changes: (args.changes as Record<string, unknown>) ?? undefined, which: "both" });
      const part = (label: string, t: typeof r.draft) => (t ? `${label}: ${t.owner} (${t.path})\n${text(t.lines)}` : `${label}: none`);
      return { text: [part("Draft", r.draft), part("Live", r.live)].join("\n\n"), data: { draft: r.draft?.result ?? null, live: r.live?.result ?? null } };
    },
  },
  {
    name: "route_suggest",
    title: "Propose a router change",
    description: "Save a full router body (the JSON shape get_router returns) as the draft. A person reviews it with Replay and publishes it in Claritia; this never changes live routing.",
    inputSchema: { type: "object", properties: { router: { type: "object" }, why: { type: "string" } }, required: ["router"] },
    async run(ctx, args) {
      const body = cleanBody(args.router);
      const { revision } = await A.saveDraft(rpcOf(ctx), caller(ctx), body, null);
      const out = await A.load(rpcOf(ctx), ctx.sb, caller(ctx));
      const problems = out.problems.map((p) => p.text);
      return {
        text: `Saved as the draft (revision ${revision}).${problems.length ? ` To fix before publishing: ${problems.join("; ")}.` : ""} Review and publish: ${APP_URL}/routing`,
        data: { revision, problems },
      };
    },
  },
];
