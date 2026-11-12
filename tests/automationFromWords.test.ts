// Automations from a sentence (src/lib/workflows/fromWords.ts) with a scripted model: the tool call becomes a checked
// draft workflow; only listed forms, meetings and lists survive; a button's address comes from the server's list or
// from the person's own words, never from the model alone; every email is unapproved and marked as AI's.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { automationFromWords, bodyFromTool, type FromWordsCtx } from "../src/lib/workflows/fromWords.ts";

const ctx: FromWordsCtx = {
  forms: [{ id: "f1", name: "Workshop sign-up", url: "https://app.test/f/f1?via=email" }],
  meetings: [{ id: "m1", name: "Intro call", url: "https://test/book/juniper/intro" }],
  lists: [{ id: "l1", name: "Waitlist" }],
  brand: { name: "Juniper Yoga", brief: "Warm and calm." },
};
const email = (o: Record<string, unknown> = {}) => ({ type: "email", subject: "What to bring", preview: "Mat and water", paragraphs: ["Hi {{first_name|there}}, bring a mat."], ...o });

test("a tool call becomes a draft workflow: trigger, waits, unapproved AI emails, stop on booking", () => {
  const r = bodyFromTool(
    {
      name: "Workshop prep",
      trigger: { kind: "form", ids: ["f1", "nope"] },
      stop_when_booked: true,
      steps: [{ type: "wait", days: 2 }, email({ button_label: "Book a call", link_kind: "meeting", link_id: "m1" }), { type: "wait", days: 3 }, email({ subject: "Last seats", link_kind: "form", link_id: "f1" }), { type: "wait", days: 1 }],
    },
    ctx,
    "when someone signs up, send what to bring",
  );
  assert.ok("body" in r);
  if (!("body" in r)) return;
  assert.equal(r.name, "Workshop prep");
  assert.deepEqual(r.body.trigger, { kind: "form", forms: ["f1"] }, "an id not on the list is dropped");
  assert.deepEqual(r.body.steps.map((s) => s.kind), ["wait", "email", "wait", "email"], "the trailing delay goes");
  const emails = r.body.steps.filter((s) => s.kind === "email") as Extract<(typeof r.body.steps)[number], { kind: "email" }>[];
  assert.ok(emails.every((e) => !e.approved && e.ai), "nothing sends until a person approves");
  assert.deepEqual([emails[0]!.email.cta_label, emails[0]!.email.cta_url], ["Book a call", "https://test/book/juniper/intro"]);
  assert.deepEqual([emails[1]!.email.cta_label, emails[1]!.email.cta_url], ["Workshop sign-up", "https://app.test/f/f1?via=email"]);
  assert.deepEqual(r.body.goals, [{ kind: "meeting_booked" }]);
});

test("a made-up address is dropped; one the person typed is kept; unknown kinds and empty emails are refused", () => {
  const made = bodyFromTool({ name: "x", trigger: { kind: "list", ids: ["l1"] }, steps: [email({ button_label: "Go", link_kind: "url", url: "https://evil.example/x" })] }, ctx, "when they join the waitlist");
  assert.ok("body" in made && made.body.steps[0]!.kind === "email" && made.body.steps[0]!.email.cta_url === "" && made.body.steps[0]!.email.cta_label === "");
  assert.ok("body" in made && made.body.trigger.kind === "list");
  const typed = bodyFromTool({ name: "x", trigger: { kind: "list" }, steps: [email({ link_kind: "url", url: "https://juniper.yoga/retreat" })] }, ctx, "link to https://juniper.yoga/retreat please");
  assert.ok("body" in typed && typed.body.steps[0]!.kind === "email" && typed.body.steps[0]!.email.cta_url === "https://juniper.yoga/retreat");
  assert.match((bodyFromTool({ name: "x", trigger: { kind: "score" }, steps: [email()] }, ctx, "") as { error: string }).error, /what starts it/);
  assert.match((bodyFromTool({ name: "x", trigger: { kind: "form" }, steps: [{ type: "email", subject: "Hi" }, { type: "wait", days: 1 }] }, ctx, "") as { error: string }).error, /couldn't write an email/);
});

test("one model call with the ids and the brand; no tool call is a plain error", async () => {
  const seen: string[] = [];
  const reply = (content: unknown[]) => ({ id: "m", type: "message", role: "assistant", model: "t", stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 }, content }) as unknown as Anthropic.Beta.BetaMessage;
  const ok = await automationFromWords(async (p) => (seen.push(JSON.stringify(p.messages)), reply([{ type: "tool_use", id: "t1", name: "make_automation", input: { name: "Hi", trigger: { kind: "form" }, steps: [email()] } }])), "send a welcome", ctx);
  assert.ok("body" in ok);
  assert.match(seen[0]!, /f1: Workshop sign-up/);
  assert.match(seen[0]!, /Brief: Warm and calm/);
  const none = await automationFromWords(async () => reply([{ type: "text", text: "Sure" }]), "x", ctx);
  assert.ok("error" in none);
});
