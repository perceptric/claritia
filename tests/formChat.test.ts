// The form chat (docs/form-builder.md 4.2) against a scripted model: tool calls become checked ops, refused ones go
// back with the reason, three changes wait for a yes, and a model that never stops is cut off.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { contextText, runChat, type ChatCtx, type Model } from "../src/lib/forms/chat.ts";
import { allFields, checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";

type Call = { name: string; input: Record<string, unknown> };
const msg = (content: Anthropic.Beta.BetaContentBlock[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage =>
  ({ id: "m", type: "message", role: "assistant", model: "x", content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 20 } }) as unknown as Anthropic.Beta.BetaMessage;
const tools = (calls: Call[]) => msg(calls.map((c, i) => ({ type: "tool_use", id: `t${i}`, name: c.name, input: c.input }) as Anthropic.Beta.BetaContentBlock), "tool_use");
const say = (text: string) => msg([{ type: "text", text, citations: null } as Anthropic.Beta.BetaContentBlock], "end_turn");

/** A model that plays the given turns in order and records what it was sent. */
function scripted(turns: ((sent: Anthropic.Beta.BetaMessageParam[]) => Anthropic.Beta.BetaMessage)[]) {
  const seen: Anthropic.Beta.BetaMessageParam[][] = [];
  const model: Model = async ({ messages }) => {
    seen.push(structuredClone(messages));
    const t = turns.shift();
    if (!t) throw new Error("model called too often");
    return t(messages);
  };
  return { model, seen };
}
const lastResults = (sent: Anthropic.Beta.BetaMessageParam[]) => sent[sent.length - 1].content as Anthropic.Beta.BetaToolResultBlockParam[];
const ctx = (o: Partial<ChatCtx> = {}): ChatCtx => ({ form: emptyForm(), custom: [], tools: [], destinations: [], history: [], ...o });

test("tool calls become checked ops; the reply and change lines come back", async () => {
  const { model } = scripted([
    () => tools([{ name: "add_field", input: { field: { type: "phone", label: "Phone" } } }, { name: "set_text", input: { button: "Talk to sales" } }]),
    () => say("Added a phone field and changed the button."),
  ]);
  const r = await runChat(model, "add a phone field and make the button say talk to sales", ctx());
  assert.deepEqual(r.lines, ["Added Phone", "Button now says Talk to sales"]);
  assert.equal(allFields(r.form).find((f) => f.type === "phone")?.key, "phone");
  assert.equal(r.form.submit.label, "Talk to sales");
  assert.equal(r.reply, "Added a phone field and changed the button.");
  assert.ok(!("errors" in checkForm(r.form)));
  assert.equal(r.usage.input, 200);
});

test("a refused change goes back with the reason, and the model fixes it in the same turn", async () => {
  const { model, seen } = scripted([
    () => tools([{ name: "add_field", input: { field: { type: "choice", label: "" } } }]),
    (sent) => {
      const r = lastResults(sent)[0];
      assert.equal(r.is_error, true);
      assert.match(String(r.content), /label/);
      return tools([{ name: "add_field", input: { field: { type: "choice", label: "Team size", options: ["1-10", "11-50"] } } }]);
    },
    () => say("Added team size."),
  ]);
  const r = await runChat(model, "ask for team size", ctx());
  assert.equal(seen.length, 3);
  assert.deepEqual(allFields(r.form)[1].options?.map((o) => o.value), ["1-10", "11-50"]);
});

test("turning off consent, removing a used field and replacing the form wait for a yes", async () => {
  const sales = (() => {
    const r = checkForm(TEMPLATES.find((t) => t.key === "contact_sales")!.form());
    if ("errors" in r) throw new Error();
    return r.form;
  })();
  const phone = allFields(sales).find((f) => f.key === "phone")!;
  const { model } = scripted([
    () => tools([{ name: "set_consent", input: { mode: "off" } }, { name: "remove_field", input: { field_id: phone.id } }, { name: "use_template", input: { template: "trial" } }]),
    (sent) => {
      for (const r of lastResults(sent)) assert.match(String(r.content), /needs the person's yes/);
      return tools([{ name: "ask", input: { question: "Turn off the consent box?", choices: ["Yes", "No"] } }]);
    },
  ]);
  const r = await runChat(model, "no consent box, drop phone, use the trial template", ctx({ form: sales, usedKeys: ["phone"] }));
  assert.deepEqual(r.form, sales);
  assert.deepEqual(r.ask, { question: "Turn off the consent box?", choices: ["Yes", "No"] });
  const yes = scripted([() => tools([{ name: "set_consent", input: { mode: "off" } }, { name: "remove_field", input: { field_id: phone.id } }]), () => say("Done.")]);
  const r2 = await runChat(yes.model, "Yes", ctx({ form: sales, usedKeys: ["phone"], confirmed: true }));
  assert.equal(r2.form.consent.mode, "off");
  assert.ok(!allFields(r2.form).some((f) => f.key === "phone"));
});

test("unknown tools, bad types and removing the email field are refused without changing the form", async () => {
  const f = emptyForm();
  const { model } = scripted([
    () =>
      tools([
        { name: "write_html", input: { html: "<script>" } },
        { name: "add_field", input: { field: { type: "script", label: "X" } } },
        { name: "remove_field", input: { field_id: f.steps[0].fields[0].id } },
        { name: "set_after", input: { kind: "redirect", url: "javascript:alert(1)" } },
      ]),
    (sent) => {
      assert.ok(lastResults(sent).every((r) => r.is_error));
      return say("I couldn't do those.");
    },
  ]);
  const r = await runChat(model, "do bad things", ctx({ form: f }));
  assert.deepEqual(r.form, f);
  assert.deepEqual(r.lines, []);
});

test("a model that keeps calling tools is cut off after six rounds", async () => {
  let n = 0;
  const model: Model = async () => {
    n++;
    return tools([{ name: "set_layout", input: { width: n % 2 ? "wide" : "narrow" } }]);
  };
  const r = await runChat(model, "loop", ctx());
  assert.equal(n, 6);
  assert.ok(r.reply.length > 0);
});

test("the context names the site's forms, custom fields and where leads go", () => {
  const t = contextText(
    ctx({
      custom: [{ key: "budget", label: "Budget", type: "number" }],
      brand: { name: "Acme", source_url: "https://acme.com", site_forms: [{ url: "https://acme.com/contact", fields: [{ label: "Email", type: "email" }], button: "Talk to us" }] },
      tools: ["HubSpot"],
      destinations: ["HubSpot"],
    }),
  );
  assert.match(t, /f\.budget: Budget, number/);
  assert.match(t, /acme\.com\/contact: Email \[email\]; button "Talk to us"/);
  assert.match(t, /sends to: Claritia contacts, HubSpot/);
});
