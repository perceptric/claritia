// What Tia may change on the canvas (src/lib/design/email/scope.ts; docs/email-canvas-b5.md sections 2.3 and 9),
// checked alone and inside the chat with a scripted model.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { emailContext, runEmailChat, type Model } from "../src/lib/design/email/chat.ts";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
import { readScope, scopeBreach, scopeIds, scopeRefusal } from "../src/lib/design/email/scope.ts";
import { readSystem } from "../src/lib/design/model.ts";
import { DEFAULT_TOKENS } from "../src/lib/forms/brand.ts";

type Call = { name: string; input: Record<string, unknown> };
const msg = (calls: Call[], text = ""): Anthropic.Beta.BetaMessage =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "test",
    stop_reason: calls.length ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [...(text ? [{ type: "text", text }] : []), ...calls.map((c, i) => ({ type: "tool_use", id: `t${i}${Math.random()}`, name: c.name, input: c.input }))],
  }) as unknown as Anthropic.Beta.BetaMessage;
function scripted(turns: Anthropic.Beta.BetaMessage[]) {
  const seen: Anthropic.Beta.BetaMessageParam[][] = [];
  const model: Model = async (p) => {
    seen.push(JSON.parse(JSON.stringify(p.messages)));
    const next = turns.shift();
    if (!next) throw new Error("script ran out");
    return next;
  };
  return { model, seen };
}
/** s1: heading h1, text t1. s2: two columns (a1 | b1). s3: footer. */
const start = () =>
  readEmailDoc({
    sections: [
      { id: "s1", columns: [{ id: "c1", blocks: [{ id: "h1", type: "heading", text: "Hello" }, { id: "t1", type: "text", html: "<p>Body</p>" }] }] },
      { id: "s2", columns: [{ id: "c2", width: 50, blocks: [{ id: "a1", type: "text", html: "<p>A</p>" }] }, { id: "c3", width: 50, blocks: [{ id: "b1", type: "text", html: "<p>B</p>" }] }] },
      { id: "s3", columns: [{ id: "c4", blocks: [{ id: "f1", type: "footer" }] }] },
    ],
  });
const sys = () => readSystem({}, DEFAULT_TOKENS);
const ctx = (o: object = {}) => ({ doc: start(), system: sys(), tokens: DEFAULT_TOKENS, subject: "Hi", history: [], ...o });

test("a scope from a request: parts with valid ids, otherwise the whole email", () => {
  assert.deepEqual(readScope({ kind: "parts", ids: ["h1", "h1", "BAD ID", 3] }), { kind: "parts", ids: ["h1"] });
  assert.deepEqual(readScope({ kind: "parts", ids: [] }), { kind: "email" });
  assert.deepEqual(readScope(null), { kind: "email" });
  assert.deepEqual([...scopeIds(start(), { kind: "parts", ids: ["s2"] })!].sort(), ["a1", "b1", "c2", "c3", "s2"]);
});

test("a part scope lets its words and looks change and refuses structure, the subject and other parts", () => {
  const scope = { kind: "parts" as const, ids: ["h1"] };
  const d = start();
  assert.equal(scopeRefusal(scope, "update_block", { block_id: "h1" }, d), null);
  assert.equal(scopeRefusal(scope, "set_style", { element_id: "h1" }, d), null);
  assert.match(scopeRefusal(scope, "update_block", { block_id: "t1" }, d)!, /isn't one of the parts/);
  for (const tool of ["add_block", "remove_block", "move_block", "set_columns", "set_subject", "use_template", "add_class", "use_component"]) assert.ok(scopeRefusal(scope, tool, { id: "h1", block_id: "h1" }, d), tool);
  assert.match(scopeRefusal(scope, "set_style", { element_id: "h1", on: "all_emails" }, d)!, /yes/);
  assert.equal(scopeRefusal({ kind: "email" }, "remove_block", { id: "t1" }, d), null, "an email scope allows structure");
  assert.equal(scopeRefusal(undefined, "remove_block", { id: "t1" }, d), null, "the Email Studio has no scope");
});

test("after a change: outside the parts, the subject and the brand's styles stay as they were", () => {
  const before = { doc: start(), system: sys(), subject: "Hi" };
  const scope = { kind: "parts" as const, ids: ["h1"] };
  const inside = readEmailDoc({ ...before.doc, sections: before.doc.sections.map((s, i) => (i ? s : { ...s, columns: [{ ...s.columns[0]!, blocks: [{ id: "h1", type: "heading", text: "New" }, s.columns[0]!.blocks[1]] }] })) });
  assert.equal(scopeBreach(scope, before, { ...before, doc: inside }, false), null);
  const outsideChange = readEmailDoc({ ...inside, sections: inside.sections.slice(0, 2).concat(inside.sections.slice(3)) });
  assert.match(scopeBreach(scope, before, { ...before, doc: { ...outsideChange, sections: inside.sections.slice(0, 1) } }, false)!, /outside/);
  assert.match(scopeBreach(scope, before, { ...before, subject: "Changed" }, false)!, /subject/);
  const brand = { ...before.system, email: { globals: { heading: { base: { color: "$accent" } } }, classes: [] } };
  assert.match(scopeBreach({ kind: "email" }, before, { ...before, system: brand as never }, false)!, /every email/);
  assert.equal(scopeBreach({ kind: "email" }, before, { ...before, system: brand as never }, true), null, "with the person's yes");
});

test("in the chat: a part-scoped turn can't delete another block; the refusal goes back and the block stays", async () => {
  const { model, seen } = scripted([
    msg([
      { name: "remove_block", input: { id: "t1" } },
      { name: "update_block", input: { block_id: "t1", content: { html: "<p>Sneaky</p>" } } },
      { name: "update_block", input: { block_id: "h1", content: { text: "Shorter" } } },
    ]),
    msg([], "Made the heading shorter."),
  ]);
  const r = await runEmailChat(model, "make it shorter", ctx({ scope: { kind: "parts", ids: ["h1"] } }));
  const blocks = r.doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  assert.ok(blocks.some((b) => b.id === "t1" && b.type === "text" && b.html === "<p>Body</p>"), "t1 untouched");
  assert.equal((blocks.find((b) => b.id === "h1") as { text: string }).text, "Shorter");
  const back = JSON.stringify(seen[1]!.at(-1)?.content);
  assert.match(back, /Only the parts the person added/);
  assert.match(back, /isn't one of the parts/);
  assert.deepEqual(r.lines, ["Changed the heading"]);
});

test("in the chat: a brand-wide style needs the yes; the context names the scope and the other emails", async () => {
  const { model } = scripted([msg([{ name: "set_style", input: { element_id: "h1", part: "heading", property: "font-size", value: "40px", on: "all_emails" } }]), msg([], "Asked.")]);
  const r = await runEmailChat(model, "bigger headings everywhere", ctx({ scope: { kind: "email" } }));
  assert.equal(JSON.stringify(r.system), JSON.stringify(sys()), "the brand's styles didn't change");
  const c = emailContext(ctx({ scope: { kind: "parts", ids: ["h1"] }, turnWith: [{ name: "Class reminder", subject: "See you Thursday" }] }) as never, start(), "Hi");
  assert.match(c, /Change only these parts.*h1 \(heading\)/);
  assert.match(c, /Class reminder \(subject: See you Thursday\)/);
});
