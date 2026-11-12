// The 100 calculator templates (wave 4, docs/form-templates.md): every one works out a real number from real answers,
// with no pictures, and the ones people check against a bank or a pro give the right answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { templateById } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { WAVE4_CALC_HOME } from "../src/lib/forms/gallery/templates/wave4-calc-home.ts";
import { WAVE4_CALC_MORE } from "../src/lib/forms/gallery/templates/wave4-calc-more.ts";
import { allFields, checkForm, withCalcs, type Field, type Form } from "../src/lib/forms/schema.ts";

const ALL = [...WAVE4_CALC_HOME, ...WAVE4_CALC_MORE];
const formOf = (id: string): Form => {
  const r = checkForm(templateForm(templateById(id)!));
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};
/** Answers by question key; a choice by its words; questions left out stay empty. */
const run = (id: string, by: Record<string, unknown>) => {
  const form = formOf(id);
  const fields = allFields(form);
  const answers = Object.fromEntries(Object.entries(by).map(([k, v]) => [fields.find((f) => f.key.replace(/^q\./, "") === k)!.id, v]));
  const out = withCalcs(form, answers);
  return (key: string) => out[fields.find((f) => f.key.replace(/^q\./, "") === key)!.id];
};

/** Middle answers: the middle choice, two picks, a number in range. */
function middle(f: Field): unknown {
  const v = f.valid as { min?: number; max?: number } | undefined;
  if (f.type === "number" && (f as { unit?: string }).unit === "money") return f.required ? Math.max(v?.min ?? 0, 80000) : 0;
  if (f.type === "number") return Math.max(v?.min ?? 1, Math.min(v?.max ?? 1e9, Math.round(((v?.min ?? 1) + Math.min(v?.max ?? 100, 100)) / 2)));
  if (f.type === "choice" || f.type === "dropdown") return f.options?.[Math.floor((f.options.length - 1) / 2)]?.value;
  if (f.type === "multi") return f.options?.slice(0, 2).map((o) => o.value);
  if (f.type === "checkbox") return true;
  return undefined;
}

test("100 calculators, each with a price or number, no pictures, and a live answer from middle answers", () => {
  assert.equal(ALL.length, 100);
  assert.equal(new Set(ALL.map((t) => t.id)).size, 100);
  for (const t of ALL) {
    assert.ok(!t.schema.cover?.photo && t.schema.pages.every((p) => p.fields.every((f) => !("images" in f))), `${t.id} has no pictures`);
    const form = formOf(t.id);
    const fields = allFields(form);
    const calcs = fields.filter((f) => f.type === "calc");
    assert.ok(calcs.length >= 1, `${t.id} works something out`);
    const answers = Object.fromEntries(fields.map((f) => [f.id, middle(f)]).filter(([, v]) => v !== undefined));
    const out = withCalcs(form, answers);
    for (const c of calcs) {
      const n = out[c.id];
      assert.equal(typeof n, "number", `${t.id}: ${c.label} has an answer`);
      assert.ok(Number.isFinite(n) && (n as number) >= 0 && (n as number) < 1e8, `${t.id}: ${c.label} = ${n}`);
    }
    // The last calc on the first page is the headline number, and it's never zero from sensible answers.
    assert.ok((out[calcs[calcs.length - 1]!.id] as number) > 0, `${t.id}: headline is above zero`);
  }
});

test("loan math matches a bank's: payment, interest, refinance savings and break-even", () => {
  const loan = run("finance.loan-payment-calculator", { amount: 25000, rate: 7, months: "60 months" });
  assert.equal(loan("total"), 495.03);
  assert.equal(loan("interest"), 4702);
  // $300,000 at 7% with 25 years left, to 6% over 30 years: $2,120 down to $1,799.
  const refi = run("finance.refinance-calculator", { bal: 300000, now: 7, new: 6, left: 25, term: "30 years", costs: 6000 });
  assert.equal(refi("pay1"), 2120);
  assert.equal(refi("pay2"), 1799);
  assert.equal(refi("total"), 321);
  assert.equal(refi("breakeven"), 19);
});

test("prices add up the way the questions say", () => {
  // 10 double-hung vinyl windows, double pane, one story, haul away: 10 × (650 + 25).
  assert.equal(run("construction.window-replacement-calculator", { win: 10, style: "Double-hung", frame: "Vinyl", glass: "Double pane", floor: "One", haul: "Yes" })("total"), 6750);
  // Trimming leaves the stump question hidden: the price still works out.
  assert.equal(run("construction.tree-service-calculator", { job: "Trim", trees: 2, height: "Under 30 feet", access: "Open, easy to reach" })("total"), 400);
  // Pressure washing: only the surfaces filled in count, with a $200 minimum.
  assert.equal(run("construction.pressure-washing-calculator", { drive: 600, roof: "No" })("total"), 200);
  assert.equal(run("construction.pressure-washing-calculator", { drive: 1000, deck: 400, roof: "Yes" })("total"), 900);
  // Wholesale: 10 cases of 24 standard is 240 units, 10% off, ground shipping 6%.
  const w = run("ecommerce.wholesale-order-calculator", { unit: "Standard size, $6 each", pack: "Case of 24", cases: 10, ship: "Ground" });
  assert.deepEqual([w("units"), w("off"), w("total")], [240, 10, 1373.76]);
  // Seller net sheet: $500,000, 5% commission, 2% closing, $280,000 owed.
  const net = run("real_estate.seller-net-sheet", { price: 500000, owed: 280000, comm: "5%", close: "About 2%" });
  assert.deepEqual([net("costs"), net("total")], [35000, 185000]);
  // Battery: fridge, lights and Wi-Fi for a full day is 4 kWh, rounded up to the 5 kWh floor: one battery.
  const b = run("solar.battery-backup-calculator", { loads: ["Fridge", "Lights", "Wi-Fi and phones"], days: "A full day" });
  assert.deepEqual([b("kwh"), b("units"), b("total")], [5, 1, 12500]);
});
