// The email chat (docs/design-system.md Part 7.2) with a scripted model: every change is a checked tool call, raw
// colors are refused unless asked for, refusals go back to the model, and the design check gets one pass.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { runEmailChat, type Model } from "../src/lib/design/email/chat.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
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

/** A model that answers from a script and keeps what it was sent. */
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
const results = (m: Anthropic.Beta.BetaMessageParam[]) => JSON.stringify(m.at(-1)?.content);

const start = () => readEmailDoc({ sections: [{ id: "s1", columns: [{ id: "c1", blocks: [{ id: "h1", type: "heading", text: "Hello" }] }] }, { id: "s2", columns: [{ id: "c2", blocks: [{ id: "f1", type: "footer" }] }] }] });
const ctx = () => ({ doc: start(), system: readSystem({}, DEFAULT_TOKENS), tokens: DEFAULT_TOKENS, subject: "Hi", history: [] });

test("changes go through checked tools; a raw color is refused until asked for, and the refusal goes back", async () => {
  const { model, seen } = scripted([
    msg([
      { name: "add_block", input: { type: "button", content: { label: "Book now", url: "https://acme.io/book" }, after_block_id: "h1" } },
      { name: "set_style", input: { element_id: "h1", part: "heading", property: "color", value: "#ff0000" } },
      { name: "remove_block", input: { id: "f1" } },
      { name: "add_block", input: { type: "html", content: { html: "<script>x</script>" } } },
    ]),
    msg([{ name: "set_style", input: { element_id: "h1", part: "heading", property: "color", value: "$accent" } }, { name: "set_subject", input: { subject: "Book your demo", preheader: "Ten minutes" } }]),
    msg([], "Added a button and colored the heading."),
  ]);
  const r = await runEmailChat(model, "Add a booking button and make the heading stand out", ctx());
  const sent = results(seen[1]!);
  assert.match(sent, /Use a color variable/, "the raw color was refused with the reason");
  assert.match(sent, /need the Footer block/);
  assert.match(sent, /Unknown block type/, "HTML blocks are never the AI's");
  assert.deepEqual(r.lines, ["Added a button", "Styled the heading", "Changed the subject"]);
  assert.equal(r.subject, "Book your demo");
  assert.equal(r.doc.settings.preheader, "Ten minutes");
  assert.deepEqual(r.doc.sections[0]!.columns[0]!.blocks.map((b) => b.type), ["heading", "button"]);
  assert.equal(r.doc.styles?.h1?.heading?.base?.color, "$accent");
  assert.equal(r.reply, "Added a button and colored the heading.");
  assert.ok(r.usage.input > 0);
  assert.ok(compileEmail(r.system, r.doc, { tokens: DEFAULT_TOKENS }).html.includes("Book now"));
});

test("the design check gets one pass after the AI's changes", async () => {
  const { model, seen } = scripted([
    msg([{ name: "set_style", input: { element_id: "h1", part: "heading", property: "color", value: "#f4f4f4", raw: true } }]),
    msg([], "Done."),
    msg([{ name: "set_style", input: { element_id: "h1", part: "heading", property: "color", value: "" } }]),
    msg([], "Fixed the heading's contrast."),
  ]);
  const r = await runEmailChat(model, "Make the heading very light", ctx());
  assert.match(JSON.stringify(seen[2]!.at(-1)), /The design check found[^"]*hard to read/);
  assert.equal(r.doc.styles, undefined, "the fix cleared the color");
  assert.equal(r.reply, "Fixed the heading's contrast.");
  assert.equal(seen.length, 4, "only one extra pass");
});

test("replacing an email asks first, then uses the template", async () => {
  const no = scripted([msg([{ name: "use_template", input: { template: "newsletter" } }]), msg([{ name: "ask", input: { question: "Replace this email with the newsletter?", choices: ["Yes", "No"] } }])]);
  const a = await runEmailChat(no.model, "Make it a newsletter", ctx());
  assert.match(results(no.seen[1]!), /needs the person's yes/);
  assert.deepEqual(a.ask, { question: "Replace this email with the newsletter?", choices: ["Yes", "No"] });
  assert.equal(a.doc.sections[0]!.columns[0]!.blocks[0]!.id, "h1", "nothing changed yet");
  const yes = scripted([msg([{ name: "use_template", input: { template: "newsletter" } }]), msg([], "Started from the newsletter.")]);
  const b = await runEmailChat(yes.model, "Yes", { ...ctx(), confirmed: true });
  assert.deepEqual(b.lines, ["Started from the Monthly newsletter template"]);
  assert.ok(b.doc.sections.length > 2);
});

test("a block from a component: the AI changes this email's words for it, unless the component is locked", async () => {
  const c = await import("../src/lib/design/email/components.ts");
  const saved = c.saveAsComponent({ system: readSystem({}, DEFAULT_TOKENS), doc: start() }, "s1", "Header");
  assert.ok(!("error" in saved));
  const hid = c.copyId("s1", "h1");
  const run = (system = saved.system) =>
    runEmailChat(scripted([msg([{ name: "update_block", input: { block_id: hid, content: { text: "Just for this email" } } }]), msg([], "Done.")]).model, "Change the heading here", { ...ctx(), doc: saved.doc, system });
  const r = await run();
  assert.deepEqual(r.doc.sections[0]!.component?.props, { h1: { text: "Just for this email" } });
  assert.match(compileEmail(r.system, r.doc, { tokens: DEFAULT_TOKENS }).html, /Just for this email/);
  const locked = await run(c.lockComponent(saved.system, saved.system.email!.components![0]!.id, true));
  assert.deepEqual(locked.lines, []);
});

test("a screenshot goes to the model with the email, as an image", async () => {
  const s = scripted([msg([], "Built it.")]);
  await runEmailChat(s.model, "Build this email from the screenshot.", { ...ctx(), image: { type: "image/png", data: "AAAA" } });
  const first = s.seen[0]!.at(-1)!.content as { type: string; source?: { media_type: string } }[];
  assert.equal(first[0]!.type, "image");
  assert.equal(first[0]!.source?.media_type, "image/png");
  assert.equal(first[1]!.type, "text");
});
