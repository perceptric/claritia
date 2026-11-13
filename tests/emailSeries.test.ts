// Many new emails from one prompt (src/lib/design/email/series.ts; docs/email-canvas-b5.md section 9), with a
// scripted model: a plan comes back in order, more than 10 is cut, each written email reads back safely, and one
// failing email doesn't stop the others.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { runEmailChat, type Model } from "../src/lib/design/email/chat.ts";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
import { buildMessage, planSeries, readPlan, seriesStartDoc } from "../src/lib/design/email/series.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

const msg = (calls: { name: string; input: unknown }[], text = ""): Anthropic.Beta.BetaMessage =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "test",
    stop_reason: calls.length ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [...(text ? [{ type: "text", text }] : []), ...calls.map((c, i) => ({ type: "tool_use", id: `t${i}`, name: c.name, input: c.input }))],
  }) as unknown as Anthropic.Beta.BetaMessage;
const one = (m: Anthropic.Beta.BetaMessage): Model => async () => m;

test("a plan of 3 comes back in order", async () => {
  const items = [1, 2, 3].map((n) => ({ name: `Day ${n}`, subject: `Subject ${n}`, brief: `Says ${n}` }));
  const r = await planSeries(one(msg([{ name: "plan_emails", input: { emails: items } }])), "a 3-email welcome series", { group: "Welcome series", history: [] });
  assert.deepEqual(r.plan, items);
  assert.equal(r.reply, "");
});

test("more than 10 is cut to 10; unnamed ones go; a question comes back as words", async () => {
  const many = Array.from({ length: 14 }, (_, i) => ({ name: i === 0 ? "" : `E${i}`, subject: "s", brief: "b" }));
  assert.equal(readPlan({ emails: many }).length, 10);
  assert.equal(readPlan({ emails: many })[0]!.name, "E1");
  assert.deepEqual(readPlan(null), []);
  const q = await planSeries(one(msg([], "Who is the series for?")), "emails", { group: "G", history: [] });
  assert.deepEqual(q.plan, []);
  assert.equal(q.reply, "Who is the series for?");
});

test("each email is written through the chat and reads back safely; the message names the whole series", async () => {
  const items = [{ name: "Welcome", subject: "Welcome aboard", brief: "Says hello" }, { name: "Tips", subject: "Three tips", brief: "Gives tips" }];
  const ask = buildMessage(items, 1, "a welcome series");
  assert.match(ask, /email 2 of 2/);
  assert.match(ask, /1\. Welcome: Welcome aboard/);
  const start = seriesStartDoc(1);
  assert.deepEqual(seriesStartDoc(1), start, "fixed ids, so the same request replays from cache");
  const turns = [
    msg([{ name: "add_block", input: { type: "heading", content: { text: "Three tips" }, section_index: 0 } }, { name: "set_subject", input: { subject: "Three tips", preheader: "Quick ones" } }]),
    msg([], "Wrote it."),
  ];
  const model: Model = async () => turns.shift()!;
  const r = await runEmailChat(model, ask, { doc: start, system: readSystem({}, DEFAULT_TOKENS), tokens: DEFAULT_TOKENS, subject: "Three tips", history: [], confirmed: true });
  assert.equal(r.subject, "Three tips");
  assert.deepEqual(readEmailDoc(r.doc, { allowHtml: true }), r.doc);
  assert.ok(r.doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks)).some((b) => b.type === "footer"), "the footer stays");
});

test("one failing email doesn't stop the others", async () => {
  const items = [0, 1, 2].map((n) => ({ name: `E${n}`, subject: `S${n}`, brief: "b" }));
  const results = await Promise.allSettled(
    items.map((_, i) =>
      runEmailChat(
        async () => {
          if (i === 1) throw new Error("overloaded");
          return msg([], "Done.");
        },
        buildMessage(items, i, "three emails"),
        { doc: seriesStartDoc(i), system: readSystem({}, DEFAULT_TOKENS), tokens: DEFAULT_TOKENS, subject: items[i]!.subject, history: [], confirmed: true },
      ),
    ),
  );
  assert.deepEqual(results.map((r) => r.status), ["fulfilled", "rejected", "fulfilled"]);
});
