// Step 3 of docs/form-kinds-plan.md: payments on the team's own Stripe account, PDF copies and save-later links.
// Stripe is a fake here; the amount always comes from the server's own math.
import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateSync } from "node:zlib";
import { handleFormPayEvent, returnUrl, startFormCheckout, type FormPayStripe } from "../src/lib/forms/pay.ts";
import { makePdf, pngToRgb, wrap } from "../src/lib/forms/pdf.ts";
import { checkForm, emptyForm, payAmount, type Field, type Form } from "../src/lib/forms/schema.ts";
import { copyKey } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const QTY: Field = { id: "qty", key: "q.qty", type: "number", label: "How many?", required: true };
const TOTAL: Field = { id: "tot", key: "q.tot", type: "calc", label: "Total", required: false, calc: { formula: "{qty} * 12.5" } };
const PAY: Field = { id: "pay", key: "c.pay", type: "payment", label: "Total", required: false, pay: { field: "tot", currency: "USD" } };
const ok = (fields: Field[], more: Partial<Form> = {}): Form => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], ...more });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};

test("the amount comes from the form's own calculation, in cents", () => {
  const fm = ok([QTY, TOTAL, PAY]);
  assert.deepEqual(payAmount(fm, { qty: "3" }), { amount: 3750, currency: "usd" });
  assert.equal(payAmount(fm, { qty: "0" }), null, "nothing to charge");
  const fixed = ok([{ ...PAY, pay: { amount: 49, currency: "EUR" } }]);
  assert.deepEqual(payAmount(fixed, {}), { amount: 4900, currency: "eur" });
  const yen = ok([{ ...PAY, pay: { amount: 5000, currency: "JPY" } }]);
  assert.deepEqual(payAmount(yen, {}), { amount: 5000, currency: "jpy" });
  // A payment pointing at a calc that's gone, or two payments, are refused.
  assert.ok("errors" in checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, PAY] }] }));
  assert.ok("errors" in checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { ...PAY, pay: { amount: 5, currency: "USD" } }, { ...PAY, id: "pay2", key: "c.pay2", pay: { amount: 5, currency: "USD" } }] }] }));
});

test("a payment a rule hides is never charged, and a shown one is", () => {
  const HOW: Field = { id: "how", key: "q.how", type: "choice", label: "How will you pay?", required: true, options: [{ value: "Card now", label: "Card now" }, { value: "Send an invoice", label: "Send an invoice" }] };
  const fm = ok([QTY, TOTAL, HOW, PAY], { rules: [{ id: "r1", when: { field: "how", op: "is", value: "Card now" }, then: { action: "show", field: "pay" } }] });
  assert.equal(payAmount(fm, { qty: "3", how: "Send an invoice" }), null, "hidden by the rule");
  assert.equal(payAmount(fm, { qty: "3" }), null, "no answer yet: still hidden");
  assert.deepEqual(payAmount(fm, { qty: "3", how: "Card now" }), { amount: 3750, currency: "usd" });
});

test("checkout opens once per fill on the team's account, and a resend gets the same page", async () => {
  const fm = ok([QTY, TOTAL, PAY]);
  const made: unknown[] = [];
  const saved: Record<string, unknown>[] = [];
  const stripe: FormPayStripe = {
    async checkout(account, p) {
      made.push({ account, ...p });
      return { id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" };
    },
  };
  const rpc: Rpc = async (fn, args) => {
    if (fn === "submission_payment") saved.push(args.p_patch as Record<string, unknown>);
    return { data: null, error: null };
  };
  const base = { form: fm, formId: "f1", formName: "Order", workspaceId: "w1", submissionId: "s1", answers: { qty: "2" }, email: "ana@acme.com", page: "https://acme.com/order", hosted: "https://app.example.com/f/f1", account: "acct_1" };
  assert.deepEqual(await startFormCheckout(rpc, stripe, base), { url: "https://checkout.stripe.com/c/pay/cs_1" });
  assert.equal((made[0] as { amount: number }).amount, 2500);
  assert.equal((made[0] as { successUrl: string }).successUrl, "https://acme.com/order?clr_pay=done");
  assert.equal(saved[0]!.status, "open");
  assert.deepEqual(await startFormCheckout(rpc, stripe, { ...base, existing: { url: "https://checkout.stripe.com/c/pay/cs_1", status: "open" } }), { url: "https://checkout.stripe.com/c/pay/cs_1" });
  assert.equal(made.length, 1, "no second checkout");
  assert.equal(await startFormCheckout(rpc, stripe, { ...base, existing: { status: "paid" } }), null);
  assert.equal(await startFormCheckout(rpc, stripe, { ...base, account: null }), null, "no account, no charge");
  assert.equal(returnUrl(undefined, "https://app.example.com/f/f1", false), "https://app.example.com/f/f1?clr_pay=back");
});

test("the webhook marks a fill paid only for its own workspace's account, and a late expiry never unpays it", async () => {
  let payment: Record<string, unknown> = { status: "open" };
  const rpc: Rpc = async (fn, args) => {
    if (fn === "submission_payment") payment = { ...payment, ...(args.p_patch as object) };
    return { data: payment, error: null };
  };
  const ws = "0192f3a1-0000-7000-8000-0000000000aa";
  const sid = "0192f3a1-0000-7000-8000-0000000000bb";
  const ev = (type: string, account = "acct_1") => ({ type, account, data: { object: { id: "cs_1", payment_status: "paid", payment_intent: "pi_1", metadata: { submission_id: sid, workspace_id: ws } } } });
  const accountOf = async () => "acct_1";
  assert.equal(await handleFormPayEvent(rpc, ev("checkout.session.completed", "acct_other"), accountOf), "skipped");
  assert.equal(payment.status, "open");
  assert.equal(await handleFormPayEvent(rpc, ev("checkout.session.completed"), accountOf), "paid");
  assert.equal(payment.status, "paid");
  assert.equal(payment.intent, "pi_1");
  assert.equal(await handleFormPayEvent(rpc, ev("checkout.session.expired"), accountOf), "skipped");
  assert.equal(payment.status, "paid");
});

test("the PDF copy: a real PDF with every answer, wrapped, and a signature picture", () => {
  // A 2x2 RGBA PNG: one black pixel, the rest see-through.
  const rows = Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  const img = pngToRgb(png);
  assert.ok(img);
  assert.deepEqual([...img.rgb.subarray(0, 6)], [0, 0, 0, 255, 255, 255], "black, then white where it was see-through");
  const pdf = Buffer.from(makePdf({ title: "Waiver (adult)", sub: "Sent today", lines: [{ label: "Name", value: "Ana \\ López" }, { label: "Signature", value: "Signed", image: png }, ...Array.from({ length: 60 }, (_, i) => ({ label: `Q${i}`, value: "word ".repeat(80) }))] }));
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\(Waiver \\\(adult\\\)\) Tj/);
  assert.match(text, /\/Subtype \/Image \/Width 2 \/Height 2/);
  assert.ok((text.match(/\/Type \/Page /g) ?? []).length > 1, "long fills take more pages");
  assert.ok(wrap("word ".repeat(200), 11).length > 3);
});

test("the copy link's key is the fill's own", () => {
  const a = copyKey("f1", "s1", "secret-long-enough");
  assert.equal(a, copyKey("f1", "s1", "secret-long-enough"));
  assert.notEqual(a, copyKey("f1", "s2", "secret-long-enough"));
  assert.ok(ok([EMAIL].slice(1), { resume: true, copy: true }).resume);
});
