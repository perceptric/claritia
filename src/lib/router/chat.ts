// The routing chat (docs/routing-chat-plan.md Part 2). Claude changes the setup only through tools, and each tool is
// one op (src/lib/router/ops.ts) checked before it applies: an op that is malformed, points at someone who isn't on
// the team, or would leave the setup with a new problem is refused, and the error goes back to the model, which fixes
// it in the same turn. Claude never publishes; the person's click on Make live does. Rep changes (away, caps) come
// back as patches for the route to save, since they are the rep's status and not part of the setup.

import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, usageOf, type Usage } from "../ai/cache.ts";
import { opsFor, REGIONS, type FieldDef } from "./conditions.ts";
import { applyStrict, findMember, firstProblem, type CondInput, type OpCtx, type RouterOp } from "./ops.ts";
import { planLines } from "./readback.ts";
import type { RouterBody } from "./types.ts";

export const ROUTER_CHAT_MODEL = "claude-sonnet-5-5";
const MAX_ROUNDS = 8;

export type Model = (params: { system: Anthropic.Beta.BetaTextBlockParam[]; tools: Anthropic.Beta.BetaTool[]; messages: Anthropic.Beta.BetaMessageParam[] }) => Promise<Anthropic.Beta.BetaMessage>;

export type RecentLead = { name: string; company: string | null; country: string | null; size: string | number | null; went: string; path: string; at: string };

export type RouterChatCtx = {
  body: RouterBody;
  members: OpCtx["members"];
  fields: FieldDef[];
  forms: { id: string; name: string }[];
  /** For "set it up for me": what the workspace's leads look like. */
  summary?: { leads: number; days: number; countries: [string, number][]; sizes: [string, number][]; withOwner: number };
  /** The last routed leads, for "why did Dana go to Sam?". */
  recent: RecentLead[];
  history: { role: "user" | "assistant"; text: string }[];
  today: string;
};

export type RepPatch = { user: string; name: string; patch: { out_dates?: { from: string; to: string }[]; paused_until?: string; cap_day?: number | null; cap_week?: number | null; backup?: string } };

export type RouterChatResult = { body: RouterBody; lines: string[]; reply: string; ask?: { question: string; choices: string[] }; reps: RepPatch[]; changed: boolean };

const cond = {
  type: "object",
  properties: {
    field: { type: "string", description: "A field key from the context's field list." },
    op: { type: "string", enum: ["is", "is_not", "one_of", "not_one_of", "contains", "starts_with", "filled", "empty", "gt", "lt", "between"] },
    value: { description: "A string, a number, or a list. Countries take two-letter codes or a region's name. Between takes [low, high]." },
  },
  required: ["field", "op"],
};
const conds = { type: "array", items: cond };
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Anthropic.Beta.BetaTool => ({ name, description, input_schema: { type: "object", properties, required } as Anthropic.Beta.BetaTool["input_schema"] });

export const ROUTER_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool("add_team", "Make a team that shares leads. method: rr takes turns, weighted gives some more (weights 1 to 10, one per person), load sends to whoever has the fewest meetings this week.", { name: { type: "string" }, people: { type: "array", items: { type: "string" }, description: "Teammates by full name or email." }, method: { type: "string", enum: ["rr", "weighted", "load"] }, weights: { type: "array", items: { type: "number" } }, strict: { type: "boolean", description: "Keep the turn order; only skip reps who can't take leads at all." }, hoursOnly: { type: "boolean", description: "Only reps inside their working hours." } }, ["name", "people"]),
  tool("edit_team", "Change a team: its name, people, how they share, weights, strict or hoursOnly.", { team: { type: "string" }, name: { type: "string" }, people: { type: "array", items: { type: "string" } }, method: { type: "string", enum: ["rr", "weighted", "load"] }, weights: { type: "array", items: { type: "number" } }, strict: { type: "boolean" }, hoursOnly: { type: "boolean" } }, ["team"]),
  tool("remove_team", "Remove a team no rule uses.", { team: { type: "string" } }, ["team"]),
  tool("add_region", "Name a set of countries, like Europe or DACH, for rules to use. Known names fill their countries when you leave countries out.", { name: { type: "string" }, countries: { type: "array", items: { type: "string" } } }, ["name"]),
  tool("add_company_type", "Name a kind of company, like Enterprise (company size more than 1000), for rules to test with company.type.", { name: { type: "string" }, match: { type: "string", enum: ["all", "any"] }, conds }, ["name", "conds"]),
  tool("add_rule", "Add a rule. Rules run top to bottom and the first that matches decides. then: queue sends to a team or one person (pass team or person), owner sends to the company's owner, hold makes the lead wait for review. at: the place, from 0 (first).", { name: { type: "string" }, match: { type: "string", enum: ["all", "any"] }, conds, then: { type: "string", enum: ["queue", "owner", "hold"] }, team: { type: "string" }, person: { type: "string" }, at: { type: "integer" } }, ["conds"]),
  tool("edit_rule", "Change a rule by its id or name: conditions, match, where it sends leads, its name, or turn it off.", { rule: { type: "string" }, name: { type: "string" }, match: { type: "string", enum: ["all", "any"] }, conds, then: { type: "string", enum: ["queue", "owner", "hold"] }, team: { type: "string" }, person: { type: "string" }, on: { type: "boolean" } }, ["rule"]),
  tool("move_rule", "Move a rule to a place, from 0 (first).", { rule: { type: "string" }, to: { type: "integer" } }, ["rule", "to"]),
  tool("remove_rule", "Remove a rule.", { rule: { type: "string" } }, ["rule"]),
  tool("set_everyone_else", "Who gets leads no rule matched: a team or one person.", { team: { type: "string" }, person: { type: "string" } }),
  tool("set_junk", "The junk check: leads that look fake wait for review.", { on: { type: "boolean" }, disposable: { type: "boolean", description: "Throwaway emails." }, fakeName: { type: "boolean" }, tooMany: { type: "boolean", description: "Too many fills in an hour." }, freeMail: { type: "boolean", description: "Personal emails like gmail." }, maxPerHour: { type: "integer" } }),
  tool("set_same_company", "Same company, same rep: a lead from a company you work with goes to its rep.", { on: { type: "boolean" }, oppFirst: { type: "boolean", description: "The rep on its open deal first." }, setCompanyOwner: { type: "boolean", description: "Also make that rep the company's owner." } }),
  tool("set_keep_rep", "Keep their rep: a lead who already has a rep keeps them. whenOut: keep waits for them, backup sends to their backup, route sends it on.", { on: { type: "boolean" }, whenOut: { type: "string", enum: ["keep", "backup", "route"] } }),
  tool("set_response_time", "After a lead is routed, the rep has this many minutes to act (5 to 10080). next: route sends it to someone else, manager gives it to the manager, nudge only reminds the rep.", { on: { type: "boolean" }, minutes: { type: "integer" }, nudge: { type: "integer" }, next: { type: "string", enum: ["route", "manager", "nudge"] }, manager: { type: "string" } }),
  tool("set_rep", "A rep's own status, saved right away: away from one date to another (YYYY-MM-DD), a daily or weekly cap (null clears it), or their backup.", { person: { type: "string" }, away_from: { type: "string" }, away_to: { type: "string" }, cap_day: { type: ["integer", "null"] }, cap_week: { type: ["integer", "null"] }, backup: { type: "string" } }, ["person"]),
  tool("ask", "Ask the person one question with 2 to 4 short choices, when their words could mean different things. Stop after asking.", { question: { type: "string" }, choices: { type: "array", items: { type: "string" } } }, ["question", "choices"]),
];

export const ROUTER_SYSTEM = `You set up lead routing in Claritia for a sales team, by changing their routing setup with tools.

How routing runs, in order: junk check (held for review), same company same rep, keep their rep, then rules top to bottom (the first match decides), then everyone else. A response time can pass a lead on when a rep doesn't act.

Rules:
- Make every change with tools. Never describe a change you didn't make.
- Use real teammates only, by full name or email. When a name matches two people or none, call ask.
- Make what a rule needs first: a team (add_team) before a rule sends to it, a region (add_region) before a rule tests it by name. One person can be sent to directly with person.
- Put narrow rules before broad ones (a big company in Germany should meet "over 500 people" before "Europe" when the person wants that).
- When a whole setup is described, also set everyone else. If they didn't say, ask who gets everyone else, with "Everyone takes turns" as a choice.
- "Set it up for me": propose the simplest setup that fits the lead summary: one team taking turns when leads are mixed, a team per region when most leads come from two or three regions, and a rule for big companies when many are large.
- A tool error means the change didn't apply. Fix it and try again in the same turn.
- Changes stay a draft until the person clicks Make live. Never say it's live.
- You can't route by language, time of day, or start a workflow yet. Say so plainly when asked, and offer the closest rule.
- Reply in one or two short plain sentences: what you changed, or your question. No lists, no markdown, no emoji.`;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function contextText(ctx: RouterChatCtx): string {
  const names = Object.fromEntries(ctx.members.map((m) => [m.id, m.name]));
  const lines = planLines(ctx.body, { names, fields: ctx.fields });
  const fieldList = ctx.fields.map((f) => `${f.key} (${f.label}, ${f.type}${f.options?.length ? `: ${f.options.slice(0, 12).join(", ")}` : ""}; tests ${opsFor(f.type).join(", ")})`).join("\n");
  const teams = ctx.body.queues.map((q) => `${q.name} [${q.id}]: ${q.members.map((m) => names[m.user] ?? "former teammate").join(", ")}, ${q.method}`).join("\n") || "none";
  const rules = ctx.body.rules.list.map((r, i) => `${i}. ${r.name} [${r.id}]`).join("\n") || "none";
  const regions = [...ctx.body.territories.map((t) => `${t.name} [${t.id}]: ${t.countries.join(", ")}`), ...REGIONS.filter((r) => !ctx.body.territories.some((t) => t.name === r.name)).map((r) => `${r.name} (known, add_region to use)`)].join("\n");
  const sum = ctx.summary ? `Lead summary, last ${ctx.summary.days} days: ${ctx.summary.leads} leads. Countries: ${ctx.summary.countries.map(([c, n]) => `${c} ${n}`).join(", ")}. Company sizes: ${ctx.summary.sizes.map(([s, n]) => `${s} ${n}`).join(", ")}. ${ctx.summary.withOwner} already had a rep.` : "";
  const recent = ctx.recent.length ? `Recent leads:\n${ctx.recent.slice(0, 40).map((l) => `${l.name}${l.company ? ` (${l.company}` : " ("}${l.country ? `, ${l.country}` : ""}${l.size ? `, ${l.size} people` : ""}) went to ${l.went}: ${l.path}, ${l.at}`).join("\n")}` : "";
  return [
    `Today is ${ctx.today}.`,
    `Team: ${ctx.members.map((m) => `${m.name} <${m.email ?? ""}>`).join(", ")}`,
    `The setup now:\n${lines.map((l, i) => `${i + 1}. ${l.text}`).join("\n")}`,
    `Teams:\n${teams}`,
    `Rules in order:\n${rules}`,
    `Regions:\n${regions}`,
    `Company types: ${(ctx.body.segments ?? []).map((s) => s.name).join(", ") || "none"}`,
    `Forms: ${ctx.forms.map((f) => f.name).join(", ") || "none"}`,
    `Fields rules can test:\n${fieldList}`,
    sum,
    recent,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A tool call as an op. Unknown tools and missing parts come back as an error for the model. */
function toOp(name: string, i: Record<string, unknown>): RouterOp | { error: string } {
  const people = Array.isArray(i.people) ? (i.people.filter((x) => typeof x === "string") as string[]) : undefined;
  const weights = Array.isArray(i.weights) ? (i.weights.filter((x) => typeof x === "number") as number[]) : undefined;
  const condsOf = (v: unknown) => (Array.isArray(v) ? (v as CondInput[]) : undefined);
  switch (name) {
    case "add_team":
      return { op: "add_team", name: str(i.name) ?? "", people: people ?? [], method: str(i.method) as never, weights, strict: bool(i.strict), hoursOnly: bool(i.hoursOnly) };
    case "edit_team":
      return { op: "edit_team", team: str(i.team) ?? "", name: str(i.name), people, method: str(i.method) as never, weights, strict: bool(i.strict), hoursOnly: bool(i.hoursOnly) };
    case "remove_team":
      return { op: "remove_team", team: str(i.team) ?? "" };
    case "add_region":
      return { op: "add_region", name: str(i.name) ?? "", countries: Array.isArray(i.countries) ? i.countries.map(String) : [] };
    case "add_company_type":
      return { op: "add_company_type", name: str(i.name) ?? "", match: i.match === "any" ? "any" : "all", conds: condsOf(i.conds) ?? [] };
    case "add_rule":
      return { op: "add_rule", name: str(i.name), match: i.match === "any" ? "any" : "all", conds: condsOf(i.conds) ?? [], then: str(i.then) as never, team: str(i.team), person: str(i.person), at: num(i.at) };
    case "edit_rule":
      return { op: "edit_rule", rule: str(i.rule) ?? "", name: str(i.name), match: i.match === "any" ? "any" : i.match === "all" ? "all" : undefined, conds: condsOf(i.conds), then: str(i.then) as never, team: str(i.team), person: str(i.person), on: bool(i.on) };
    case "move_rule":
      return { op: "move_rule", rule: str(i.rule) ?? "", to: num(i.to) ?? 0 };
    case "remove_rule":
      return { op: "remove_rule", rule: str(i.rule) ?? "" };
    case "set_everyone_else":
      return { op: "set_everyone_else", team: str(i.team), person: str(i.person) };
    case "set_junk":
      return { op: "set_spam", on: bool(i.on), disposable: bool(i.disposable), fakeName: bool(i.fakeName), tooMany: bool(i.tooMany), freeMail: bool(i.freeMail), maxPerHour: num(i.maxPerHour) };
    case "set_same_company":
      return { op: "set_account", on: bool(i.on), oppFirst: bool(i.oppFirst), setCompanyOwner: bool(i.setCompanyOwner) };
    case "set_keep_rep":
      return { op: "set_keep", on: bool(i.on), whenOut: str(i.whenOut) as never };
    case "set_response_time":
      return { op: "set_sla", on: bool(i.on), minutes: num(i.minutes), nudge: i.nudge === null ? null : num(i.nudge), next: str(i.next) as never, manager: i.manager === null ? null : str(i.manager) };
  }
  return { error: `Unknown tool ${name}.` };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function repTool(ctx: RouterChatCtx, i: Record<string, unknown>): RepPatch | { error: string } {
  const m = findMember(ctx, str(i.person) ?? "");
  if ("error" in m) return m;
  const name = ctx.members.find((x) => x.id === m.id)?.name ?? "";
  const patch: RepPatch["patch"] = {};
  const from = str(i.away_from), to = str(i.away_to);
  if (from || to) {
    if (!from || !to || !DATE.test(from) || !DATE.test(to)) return { error: "Away needs away_from and away_to as YYYY-MM-DD." };
    if (to < ctx.today) return { error: "Those dates are in the past." };
    patch.out_dates = [{ from: from <= to ? from : to, to: from <= to ? to : from }];
  }
  for (const k of ["cap_day", "cap_week"] as const) {
    if (!(k in i)) continue;
    const v = i[k];
    if (v === null) patch[k] = null;
    else if (typeof v === "number" && v > 0 && v <= (k === "cap_day" ? 1000 : 5000)) patch[k] = Math.round(v);
    else return { error: `${k} is a number from 1 to ${k === "cap_day" ? 1000 : 5000}, or null.` };
  }
  if (str(i.backup)) {
    const b = findMember(ctx, str(i.backup)!);
    if ("error" in b) return b;
    if (b.id === m.id) return { error: "Someone can't be their own backup." };
    patch.backup = b.id;
  }
  if (!Object.keys(patch).length) return { error: "Say what to change for them: away dates, a cap or a backup." };
  return { user: m.id, name, patch };
}

/** One chat turn: up to eight model calls, every tool call applied in order and checked. */
export async function runRouterChat(model: Model, message: string, ctx: RouterChatCtx): Promise<RouterChatResult & { usage: Usage }> {
  let body = ctx.body;
  const lines: string[] = [];
  const reps: RepPatch[] = [];
  let usage: Usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
  let ask: RouterChatResult["ask"];
  let reply = "";
  const opCtx: OpCtx = { members: ctx.members, fields: ctx.fields };
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...ctx.history.slice(-10).map((h) => ({ role: h.role, content: h.text.slice(0, 2000) }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `${contextText(ctx)}\n\nThe person says:\n${message.slice(0, 4000)}` },
  ];
  while (messages.length && messages[0]!.role !== "user") messages.shift();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await model({ system: [{ type: "text", text: ROUTER_SYSTEM, cache_control: { type: "ephemeral" } }], tools: ROUTER_TOOLS, messages });
    usage = addUsage(usage, usageOf(res.usage));
    if (res.stop_reason === "refusal") {
      reply = "I can't help with that one.";
      break;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length || res.stop_reason !== "tool_use") {
      reply = text;
      break;
    }
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const c of calls) {
      const input = (c.input ?? {}) as Record<string, unknown>;
      const fail = (error: string) => results.push({ type: "tool_result", tool_use_id: c.id, content: error, is_error: true });
      if (c.name === "ask") {
        const choices = (Array.isArray(input.choices) ? input.choices : []).filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 4);
        if (str(input.question) && choices.length >= 2) {
          ask = { question: str(input.question)!.slice(0, 300), choices: choices.map((x) => x.slice(0, 60)) };
          results.push({ type: "tool_result", tool_use_id: c.id, content: "Shown to the person. Wait for the answer." });
        } else fail("Pass a question and 2 to 4 choices.");
        continue;
      }
      if (c.name === "set_rep") {
        const r = repTool(ctx, input);
        if ("error" in r) {
          fail(r.error);
          continue;
        }
        reps.push(r);
        const p = r.patch;
        lines.push(p.out_dates ? `${r.name} is away ${p.out_dates[0]!.from} to ${p.out_dates[0]!.to}` : p.cap_day !== undefined ? `${r.name}: ${p.cap_day === null ? "no daily cap" : `at most ${p.cap_day} a day`}` : p.cap_week !== undefined ? `${r.name}: ${p.cap_week === null ? "no weekly cap" : `at most ${p.cap_week} a week`}` : `${r.name} has a new backup`);
        results.push({ type: "tool_result", tool_use_id: c.id, content: "Saved. This applies right away, without Make live." });
        continue;
      }
      const op = toOp(c.name, input);
      if ("error" in op) {
        fail(op.error);
        continue;
      }
      const r = applyStrict(body, op, opCtx);
      if ("error" in r) {
        fail(r.error);
        continue;
      }
      body = r.body;
      lines.push(r.line);
      results.push({ type: "tool_result", tool_use_id: c.id, content: r.id ? `Done. Its id: ${r.id}` : "Done." });
    }
    messages.push({ role: "user", content: results });
    if (ask) {
      reply = text || ask.question;
      break;
    }
    if (round === MAX_ROUNDS - 1) reply = text || (lines.length ? "Done." : "I couldn't finish that. Try saying it another way.");
  }
  const left = firstProblem(body, opCtx);
  return { body, lines, reply: (reply || (lines.length ? "Done." : "")).slice(0, 1000) + (lines.length && left && !ask ? ` Still to do: ${left.charAt(0).toLowerCase()}${left.slice(1)}.` : ""), ask, reps, changed: lines.length > reps.length, usage };
}

