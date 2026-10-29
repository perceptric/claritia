// The routing chat (docs/routing-chat-plan.md Part 2) with a scripted model: tool calls apply as checked ops, a bad
// call goes back to the model as an error and the setup stays as it was, a question stops the turn, rep changes come
// back as patches, and the chat has no way to publish.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTER_TOOLS, runRouterChat, type Model, type RouterChatCtx } from "../src/lib/router/chat.ts";
import { BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { emptyBody } from "../src/lib/router/types.ts";

const ANA = "22222222-2222-4222-8222-222222222222";
const RAJ = "33333333-3333-4333-8333-333333333333";
const SAM = "44444444-4444-4444-8444-444444444444";
const AC = "55555555-5555-4555-8555-555555555555";
const AM = "66666666-6666-4666-8666-666666666666";
const ctx = (): RouterChatCtx => ({
  body: emptyBody(),
  members: [
    { id: ANA, name: "Ana Ruiz", email: "ana@lumen.io" },
    { id: RAJ, name: "Raj Patel", email: "raj@lumen.io" },
    { id: SAM, name: "Sam Rivera", email: "sam@lumen.io" },
    { id: AC, name: "Alex Chen", email: "alexc@lumen.io" },
    { id: AM, name: "Alex Moreno", email: "alexm@lumen.io" },
  ],
  fields: BASE_FIELDS,
  forms: [],
  recent: [],
  history: [],
  today: "2026-10-29",
});

type Call = { name: string; input: Record<string, unknown> };
/** A model that plays back turns: each turn is either tool calls or a final text. Records what it was sent. */
function script(turns: (Call[] | string)[]) {
  const seen: unknown[][] = [];
  let i = 0;
  const model: Model = async (p) => {
    seen.push(p.messages.map((m) => m.content));
    const t = turns[Math.min(i++, turns.length - 1)]!;
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (typeof t === "string") return { content: [{ type: "text", text: t }], stop_reason: "end_turn", usage } as never;
    return { content: t.map((c, k) => ({ type: "tool_use", id: `t${i}_${k}`, name: c.name, input: c.input })), stop_reason: "tool_use", usage } as never;
  };
  return { model, seen };
}

test("a description becomes teams, a region, rules and everyone else, and the reply says what changed", async () => {
  const { model } = script([
    [
      { name: "add_team", input: { name: "AEs", people: ["Sam Rivera", "Raj Patel"], method: "rr" } },
      { name: "add_region", input: { name: "Europe", countries: ["DE", "FR", "ES"] } },
      { name: "add_rule", input: { name: "Big companies", conds: [{ field: "company.size", op: "gt", value: 500 }], team: "AEs" } },
      { name: "add_rule", input: { name: "Europe", conds: [{ field: "lead.country", op: "one_of", value: ["Europe"] }], person: "Ana Ruiz" } },
      { name: "add_team", input: { name: "Everyone", people: ["Ana Ruiz", "Raj Patel", "Sam Rivera", "Alex Chen", "Alex Moreno"] } },
      { name: "set_everyone_else", input: { team: "Everyone" } },
    ],
    "Big companies go to the AEs, Europe to Ana, and everyone else takes turns.",
  ]);
  const r = await runRouterChat(model, "Europe goes to Ana, companies over 500 people go to Sam and Raj, everyone else takes turns", ctx());
  assert.equal(r.body.rules.list.length, 2);
  assert.equal(r.body.fallback?.kind, "queue");
  assert.equal(r.lines.length, 6);
  assert.ok(r.changed);
  assert.equal(r.reply, "Big companies go to the AEs, Europe to Ana, and everyone else takes turns.");
  assert.equal(r.usage.input, 20);
});

test("flaky case: a bad tool call is refused, the setup is unchanged by it, and the model's fix applies", async () => {
  const { model, seen } = script([
    [{ name: "add_rule", input: { conds: [{ field: "company.size", op: "gt", value: 500 }], team: "Enterprise" } }],
    [
      { name: "add_team", input: { name: "Enterprise", people: ["Sam Rivera"] } },
      { name: "add_rule", input: { conds: [{ field: "company.size", op: "gt", value: 500 }], team: "Enterprise" } },
    ],
    "Done. Big companies go to Sam.",
  ]);
  const r = await runRouterChat(model, "Big companies go to Sam", ctx());
  // The first call's error went back to the model.
  const second = JSON.stringify(seen[1]);
  assert.match(second, /No team called Enterprise/);
  assert.match(second, /is_error/);
  assert.equal(r.body.rules.list.length, 1);
  assert.equal(r.body.queues.length, 1);
  // No fallback yet: the reply says what's left.
  assert.match(r.reply, /Still to do: pick who gets leads that match no rule\./);
});

test("a name two teammates share is refused, and the model asks; the turn stops at the question", async () => {
  const { model, seen } = script([
    [{ name: "add_rule", input: { conds: [{ field: "lead.country", op: "one_of", value: ["CA"] }], person: "Alex" } }],
    [{ name: "ask", input: { question: "Which Alex gets Canada?", choices: ["Alex Chen", "Alex Moreno"] } }],
    "this text is never reached",
  ]);
  const r = await runRouterChat(model, "Move Canada to Alex", ctx());
  assert.match(JSON.stringify(seen[1]), /More than one teammate is called Alex/);
  assert.deepEqual(r.ask, { question: "Which Alex gets Canada?", choices: ["Alex Chen", "Alex Moreno"] });
  assert.equal(r.body.rules.list.length, 0);
  assert.equal(seen.length, 2);
  assert.ok(!r.changed);
});

test("rep changes come back as patches: away dates and a daily cap; past dates are refused", async () => {
  const { model, seen } = script([
    [
      { name: "set_rep", input: { person: "Ana Ruiz", away_from: "2026-11-02", away_to: "2026-11-06" } },
      { name: "set_rep", input: { person: "Sam", cap_day: 10 } },
      { name: "set_rep", input: { person: "Raj", away_from: "2026-01-01", away_to: "2026-01-02" } },
    ],
    "Ana is away next week and Sam takes at most 10 a day.",
  ]);
  const r = await runRouterChat(model, "Ana is out next week, Sam takes at most 10 a day", ctx());
  assert.deepEqual(r.reps.map((x) => [x.user, x.patch]), [
    [ANA, { out_dates: [{ from: "2026-11-02", to: "2026-11-06" }] }],
    [SAM, { cap_day: 10 }],
  ]);
  assert.match(JSON.stringify(seen[1]), /Those dates are in the past/);
  // Rep changes alone aren't a setup change: no draft to save.
  assert.ok(!r.changed);
});

test("the chat can't publish or route: no tool does, and an unknown tool is an error", async () => {
  for (const t of ROUTER_TOOLS) assert.doesNotMatch(t.name, /publish|live|route_now|assign/);
  const { model, seen } = script([[{ name: "publish", input: {} }], "I can't make it live; click Publish when it looks right."]);
  const r = await runRouterChat(model, "make it live", ctx());
  assert.match(JSON.stringify(seen[1]), /Unknown tool publish/);
  assert.ok(!r.changed);
});

test("an op that would break the setup is refused even when it's well formed", async () => {
  const start = ctx();
  const { model: m1 } = script([[{ name: "add_team", input: { name: "AEs", people: ["Sam"] } }, { name: "add_rule", input: { conds: [{ field: "company.size", op: "gt", value: 500 }], team: "AEs" } }, { name: "set_everyone_else", input: { team: "AEs" } }], "ok"]);
  start.body = (await runRouterChat(m1, "x", start)).body;
  const { model, seen } = script([[{ name: "edit_team", input: { team: "AEs", people: [] } }], "ok"]);
  const r = await runRouterChat(model, "empty the AEs team", start);
  assert.match(JSON.stringify(seen[1]), /would leave a problem: AEs has no reps/);
  assert.equal(r.body.queues[0]!.members.length, 1);
});
