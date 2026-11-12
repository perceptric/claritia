// Forms made from chat before signing up (docs/mcp.md, src/lib/forms/guest.ts): the template search, the form built
// and checked, the keys, and the guard that keeps sign-in and card questions off forms nobody owns yet. The flaky
// cases are the made-up ones: a password box under another name, a card number in an option-less label, a page with
// no questions, a template id that doesn't exist.
import assert from "node:assert/strict";
import { test } from "node:test";
import { findTemplates, GUEST_KEY, guestForm, guestIpHash, guestKeyHash, guestRisk, newGuestKey } from "../src/lib/forms/guest.ts";

const PAGE = (q: string) => `<form><label>Email <input type="email" name="email" data-cl-save="email"></label>${q}<button type="submit">Send</button><section data-cl-thanks hidden><h2>Thanks</h2></section></form>`;

test("the template search puts the closest form first", () => {
  assert.equal(findTemplates("wedding photography inquiry")[0]?.name, "Photography inquiry");
  assert.ok(findTemplates("wedding photography inquiry", 3).some((t) => t.name === "Wedding planning inquiry"));
  assert.equal(findTemplates("loan payment calculator")[0]?.name, "Loan payment calculator");
  assert.match(findTemplates("dentist new patient intake")[0]?.name ?? "", /patient intake/i);
  assert.equal(findTemplates("event rsvp")[0]?.name, "Event RSVP");
  assert.ok(findTemplates("yoga class sign up").some((t) => t.name === "Free trial class"));
  assert.equal(findTemplates("zzzz qqqq").length, 0);
  assert.ok(findTemplates("", 3).length === 3);
});

test("a form from a template or a page is built and checked, in the style picked", () => {
  const t = guestForm({ name: "Trial", template: "fitness.trial-class", style: "mint" });
  assert.ok(!("error" in t));
  if (!("error" in t)) assert.ok(t.questions.includes("Email"));
  const p = guestForm({ name: "Contact", html: PAGE('<label>Message <textarea name="message"></textarea></label>') });
  assert.ok(!("error" in p) && p.questions.length === 2);
  assert.match((guestForm({ name: "x", template: "nope.nothing" }) as { error: string }).error, /No template/);
  assert.match((guestForm({ name: "x", html: "<p>Hello</p>" }) as { error: string }).error, /no questions/);
  assert.match((guestForm({ name: "x" }) as { error: string }).error, /template|html/);
});

test("forms nobody owns yet can't ask for sign-ins, cards, bank details or codes", () => {
  for (const q of ['<label>Your password <input name="pw"></label>', '<label>Card number <input name="cc"></label>', '<label>CVV <input name="c"></label>', '<label>IBAN <input name="i"></label>', '<label>Seed phrase <input name="s"></label>', '<label>Verification code <input name="v"></label>', '<label>Username <input name="u"></label>', '<input type="password" name="secret" aria-label="Secret">', '<label>Field <input name="bank_account"></label>'])
    assert.ok("error" in guestForm({ name: "x", html: PAGE(q) }), q);
  for (const q of ['<label>Company <input name="company"></label>', '<label>Postcode <input name="postcode"></label>', '<label>How did you hear about us? <input name="source"></label>', '<label>Spinning or pilates? <input name="class"></label>'])
    assert.ok(!("error" in guestForm({ name: "x", html: PAGE(q) })), q);
  assert.equal(guestRisk("", [{ label: "Pin", name: "pin", type: "text" }]) !== null, true);
});

test("keys are long, random and hashed; addresses are hashed too", () => {
  const a = newGuestKey(), b = newGuestKey();
  assert.ok(GUEST_KEY.test(a.key) && GUEST_KEY.test(b.key));
  assert.notEqual(a.key, b.key);
  assert.equal(a.hash, guestKeyHash(a.key));
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.match(guestIpHash("1.2.3.4"), /^[0-9a-f]{64}$/);
  assert.notEqual(guestIpHash("1.2.3.4"), guestIpHash("1.2.3.5"));
});

test("the guest MCP server: lists its tools, makes a live form with a claim link, and keeps the key out of the hash", async () => {
  const { guestMcp, SIGNED_IN_TOOLS } = await import("../src/lib/forms/guestMcp.ts");
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const sb = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), fn === "guest_form_make" ? { data: "11111111-2222-4333-8444-555555555555", error: null } : { data: 2, error: null }) };
  const ctx = { sb: sb as never, ip: "1.2.3.4" };
  const call = async (name: string, args: Record<string, unknown>) => (await guestMcp(ctx, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }))) as { result: { content: { text: string }[]; structuredContent?: Record<string, string>; isError: boolean } };
  const list = (await guestMcp(ctx, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))) as { result: { tools: { name: string }[] } };
  assert.deepEqual(list.result.tools.map((t) => t.name), ["find_form_template", "create_form", "update_form", ...SIGNED_IN_TOOLS]);
  const made = await call("create_form", { name: "Yoga", template: "fitness.trial-class" });
  assert.equal(made.result.isError, false);
  const d = made.result.structuredContent!;
  assert.equal(d.live_url, "https://app.tryclaritia.com/f/11111111-2222-4333-8444-555555555555");
  assert.ok(d.claim_url.startsWith("https://app.tryclaritia.com/claim/clm_"));
  assert.equal(calls[0]!.args.p_token_hash, guestKeyHash(d.key!));
  assert.ok(!JSON.stringify(calls[0]!.args).includes(d.key!), "the key itself never reaches the database");
  const bad = await call("create_form", { name: "x", html: PAGE('<label>Password <input name="p"></label>') });
  assert.equal(bad.result.isError, true);
  assert.equal(calls.length, 1, "a refused form writes nothing");
  const upd = await call("update_form", { form_id: "11111111-2222-4333-8444-555555555555", key: d.key, style: "mint", template: "fitness.trial-class" });
  assert.equal(upd.result.isError, false);
  assert.equal((await call("update_form", { form_id: "x", key: "y" })).result.isError, true);
});
