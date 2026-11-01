// Interactive forms (docs/interactive-forms-plan.md Part 3): settings formulas read as {@name}, sum, ceil and floor,
// and outcomes picked by rules with a default. The examples are the plan's test examples (Part 6), so a change that
// moves a price or a score by a cent fails here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { evalFormula, parseFormula } from "../src/lib/forms/formula.ts";
import { checkForm, emptyForm, pickOutcome, publicForm, unsetConstants, withCalcs, type Constant, type Field, type Form, type Results } from "../src/lib/forms/schema.ts";
import { acceptFill, prepareSubmit, type PublicForm } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";

const f = (x: Partial<Field> & Pick<Field, "id" | "type">): Field => ({ key: `q.${x.id}`, label: x.id, required: false, ...x }) as Field;
const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const build = (fields: Field[], more: Partial<Form> = {}): Form => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], ...more });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const errorsOf = (fields: Field[], more: Record<string, unknown>) => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], ...more });
  return "errors" in r ? r.errors.join(" ") : "";
};
const run = (src: string, vals: Record<string, number | null> = {}) => {
  const p = parseFormula(src);
  assert.ok("ast" in p, `${src}: ${"error" in p ? p.error : ""}`);
  return evalFormula(p.ast, (id) => vals[id] ?? null);
};
const send = (fm: Form, answers: Record<string, unknown>) =>
  prepareSubmit(fm, 1, { v: 1, version: 1, key: "k".repeat(20), answers: JSON.parse(JSON.stringify({ e: "ana@acme.com", ...answers })), ms: 9000 }, { custom: [] });

// Formulas ---------------------------------------------------------------------------------------------------------

test("sum, ceil and floor; sum skips empty answers and is empty when all are", () => {
  assert.equal(run("sum(1, 2, 3)"), 6);
  assert.equal(run("sum({a}, {b}, 4)", { a: 10, b: null }), 14);
  assert.equal(run("sum({a}, {b})"), null);
  assert.equal(run("ceil(100 / 25)"), 4);
  assert.equal(run("ceil(101 / 25)"), 5);
  assert.equal(run("floor(2.9)"), 2);
  assert.equal(run("floor(-2.1)"), -3);
  const bad = parseFormula("ceil(1, 2)");
  assert.ok("error" in bad && /1 part/.test(bad.error));
});

test("settings are read as {@name}; a bad name is refused, and a setting not set leaves the result empty", () => {
  const p = parseFormula("{qty} * {@unit_price}");
  assert.ok("refs" in p);
  assert.deepEqual(p.refs.sort(), ["@unit_price", "qty"]);
  assert.equal(run("{qty} * {@unit_price}", { qty: 3, "@unit_price": 15 }), 45);
  assert.equal(run("{qty} * {@unit_price}", { qty: 3 }), null);
  assert.ok("error" in parseFormula("{@Bad-Name}"));
});

// The checker -------------------------------------------------------------------------------------------------------

test("the checker refuses a formula reading a setting that isn't there, two settings with one name, and a bad number", () => {
  const calc = f({ id: "t", type: "calc", calc: { formula: "{@base} + 1" } });
  assert.match(errorsOf([calc], {}), /setting that's gone: base/);
  assert.match(errorsOf([calc], { constants: [{ id: "base", name: "Base", value: 1 }, { id: "base", name: "Base 2", value: 2 }] }), /Two settings are called base/);
  assert.match(errorsOf([calc], { constants: [{ id: "base", name: "Base", value: "lots" }] }), /Base needs a number/);
  assert.equal(errorsOf([calc], { constants: [{ id: "base", name: "Base", value: null }] }), "");
});

test("results need exactly one default outcome, last, and conditions on real fields", () => {
  const n = f({ id: "n", type: "number" });
  const ok: Results = { show: "instant", outcomes: [{ id: "big", title: "Big", when: { logic: "all", conds: [{ field: "n", op: "gt", value: "10" }] } }, { id: "rest", title: "Everyone else" }] };
  assert.equal(errorsOf([n], { results: ok }), "");
  assert.match(errorsOf([n], { results: { outcomes: [ok.outcomes[1], ok.outcomes[0]] } }), /one default outcome, last/);
  assert.match(errorsOf([n], { results: { outcomes: [ok.outcomes[0]] } }), /one default outcome, last/);
  assert.match(errorsOf([n], { results: { outcomes: [{ id: "x", title: "X", when: { logic: "all", conds: [{ field: "gone", op: "gt", value: "1" }] } }, ok.outcomes[1]] } }), /field that's gone/);
  assert.match(errorsOf([n], { results: { outcomes: [] } }), /at least one outcome/);
});

// I02 Instant quote: $100 base + 20 × $15, 25% rush → $500; without rush $400 ----------------------------------------

const QUOTE_CONSTS: Constant[] = [
  { id: "base", name: "Base fee", value: 100, format: "money" },
  { id: "rush_pct", name: "Rush fee", value: 25, format: "percent" },
  { id: "site_from", name: "Site visit from", value: 1000, format: "money", private: true },
];
const quote = (consts = QUOTE_CONSTS) =>
  build(
    [
      f({ id: "svc", type: "choice", options: [{ value: "std", label: "Standard", score: 15 }, { value: "deep", label: "Deep clean", score: 25 }] }),
      f({ id: "rooms", type: "number" }),
      f({ id: "rush", type: "checkbox" }),
      f({ id: "sub", type: "calc", calc: { formula: "{@base} + {rooms} * {svc}", format: "money", show: false } }),
      f({ id: "total", type: "calc", calc: { formula: "{sub} + if({rush}, {sub} * {@rush_pct} / 100, 0)", format: "money" } }),
      f({ id: "visit", type: "calc", calc: { formula: "{total} >= {@site_from}", show: false } }),
    ],
    {
      constants: consts,
      results: {
        show: "instant",
        outcomes: [
          { id: "review", title: "Priced by hand", when: { logic: "all", conds: [{ field: "total", op: "empty" }] } },
          { id: "site", title: "Book a site visit", when: { logic: "all", conds: [{ field: "visit", op: "gte", value: "1" }] }, meeting: "00000000-0000-4000-8000-000000000001" },
          { id: "call", title: "Lock in this price", meeting: "00000000-0000-4000-8000-000000000002" },
        ],
      },
    },
  );

test("I02 instant quote: $500 with rush, $400 without, on the browser's run and on the server's", () => {
  const fm = quote();
  assert.equal(withCalcs(fm, { svc: "std", rooms: "20", rush: true }).total, 500);
  assert.equal(withCalcs(fm, { svc: "std", rooms: "20", rush: false }).total, 400);
  const r = send(fm, { svc: "std", rooms: "20", rush: true, total: 1, sub: 1 });
  assert.ok("args" in r);
  assert.equal(r.args.p_values["q.total"], 500);
});

test("I02 outcomes: the default call, a site visit from $1,000, and review when the price can't be worked out", () => {
  const fm = quote();
  assert.equal(pickOutcome(fm, { svc: "std", rooms: "20", rush: true })?.id, "call");
  assert.equal(pickOutcome(fm, { svc: "deep", rooms: "40", rush: false })?.id, "site");
  assert.equal(pickOutcome(fm, { svc: "std", rush: true })?.id, "review");
  // A base fee nobody set makes every total empty, so nothing gets a made-up price.
  const unset = quote(QUOTE_CONSTS.map((c) => (c.id === "base" ? { ...c, value: null } : c)));
  assert.equal(withCalcs(unset, { svc: "std", rooms: "20", rush: true }).total, null);
  assert.equal(pickOutcome(unset, { svc: "std", rooms: "20", rush: true })?.id, "review");
  assert.deepEqual(unsetConstants(unset).map((c) => c.id), ["base"]);
  assert.deepEqual(unsetConstants(fm), []);
});

test("a private setting never reaches the browser, and the server still uses it", () => {
  const fm = quote();
  const pub = publicForm(fm);
  assert.equal(pub.constants?.find((c) => c.id === "site_from")?.value, null);
  assert.equal(pub.constants?.find((c) => c.id === "base")?.value, 100);
  assert.equal(JSON.stringify(pub).includes("1000"), false);
  // The server's copy is untouched.
  assert.equal(fm.constants?.find((c) => c.id === "site_from")?.value, 1000);
  assert.equal(pickOutcome(fm, { svc: "deep", rooms: "40" })?.id, "site");
  // A form with no private settings is passed through as it is.
  const plain = quote(QUOTE_CONSTS.filter((c) => !c.private).concat({ id: "site_from", name: "Site visit from", value: 1000 }));
  assert.equal(publicForm(plain), plain);
});

// I04 Readiness assessment: four questions scored 0 to 4; 3, 2, 1, 2 → 50%, Developing ----------------------------

test("I04 readiness: 3, 2, 1, 2 is 50% and Developing; all 4s is 100% and Ready; a hidden answer can't pick a result", () => {
  const q = (id: string) => f({ id, type: "choice", options: [0, 1, 2, 3, 4].map((n) => ({ value: `v${n}`, label: String(n), score: n })) });
  const fm = build([q("a"), q("b"), q("c"), q("d"), f({ id: "score", type: "calc", calc: { formula: "({a} + {b} + {c} + {d}) / 16 * 100", format: "percent" } })], {
    results: {
      show: "instant",
      outcomes: [
        { id: "more", title: "Finish the questions", when: { logic: "all", conds: [{ field: "score", op: "empty" }] } },
        { id: "found", title: "Foundations", when: { logic: "all", conds: [{ field: "score", op: "lt", value: "40" }] } },
        { id: "dev", title: "Developing", when: { logic: "all", conds: [{ field: "score", op: "lt", value: "70" }] } },
        { id: "ready", title: "Ready to plan" },
      ],
    },
  });
  assert.equal(withCalcs(fm, { a: "v3", b: "v2", c: "v1", d: "v2" }).score, 50);
  assert.equal(pickOutcome(fm, { a: "v3", b: "v2", c: "v1", d: "v2" })?.id, "dev");
  assert.equal(pickOutcome(fm, { a: "v4", b: "v4", c: "v4", d: "v4" })?.id, "ready");
  assert.equal(pickOutcome(fm, { a: "v0", b: "v1", c: "v1", d: "v2" })?.id, "found");
  // Not finished: the score is empty, so it can't count as Foundations (or anything else).
  assert.equal(withCalcs(fm, { a: "v0" }).score, null);
  assert.equal(pickOutcome(fm, { a: "v0" })?.id, "more");

  const gated = build([f({ id: "x", type: "number" }), f({ id: "y", type: "number" })], {
    rules: [{ id: "r1", when: { field: "x", op: "gt", value: "5" }, then: { field: "y", action: "show" } }],
    results: { show: "instant", outcomes: [{ id: "high", title: "High", when: { logic: "all", conds: [{ field: "y", op: "gt", value: "100" }] } }, { id: "low", title: "Low" }] },
  });
  assert.equal(pickOutcome(gated, { x: "9", y: "500" })?.id, "high");
  assert.equal(pickOutcome(gated, { x: "1", y: "500" })?.id, "low");
});

test("old forms with no settings or results work as before", () => {
  const fm = build([f({ id: "n", type: "number" }), f({ id: "t", type: "calc", calc: { formula: "{n} * 2" } })]);
  assert.equal(fm.constants, undefined);
  assert.equal(fm.results, undefined);
  assert.equal(pickOutcome(fm, { n: "3" }), null);
  assert.equal(withCalcs(fm, { n: "3" }).t, 6);
});

// Step 2: the server saves the result it worked out, once, and tells the browser ------------------------------------

async function accept(fm: Form, answers: Record<string, unknown>, opts: { repeat?: boolean; test?: boolean; missing?: boolean } = {}) {
  const saves: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "form_submit_all") return { data: { id: "0192f3a1-0000-7000-8000-00000000abcd", repeat: !!opts.repeat }, error: null };
    if (fn === "submission_result_save") {
      if (opts.missing) return { data: null, error: { message: "Could not find the function public.submission_result_save", code: "PGRST202" } };
      saves.push(args as Record<string, unknown>);
      return { data: true, error: null };
    }
    return { data: null, error: null };
  };
  const pub: PublicForm = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 1, status: "live", body: fm, tokens: {}, logo_url: null };
  const r = await acceptFill(rpc, pub, { v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com", ...answers }, ms: 5000, trap: "" }, { custom: [] }, { test: opts.test });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { body: r.body as { result?: { values: Record<string, number | null>; outcome?: { id: string; title: string } } }, saves };
}

test("step 2: the quote's total and outcome are saved from the server's own math, never the browser's", async () => {
  const fm = quote();
  const { body, saves } = await accept(fm, { svc: "std", rooms: "20", rush: true, total: 9, visit: 1 });
  assert.equal(body.result?.values["q.total"], 500);
  assert.equal(body.result?.outcome?.id, "call");
  assert.equal(saves.length, 1);
  assert.equal(saves[0]!.p_outcome_id, "call");
  assert.deepEqual((saves[0]!.p_values as Record<string, number>)["q.total"], 500);
  // The saved copy keeps the private setting; the browser's answer never shows any setting.
  assert.equal((saves[0]!.p_constants as Record<string, number>).site_from, 1000);
  assert.equal(JSON.stringify(body).includes("site_from"), false);
  const big = await accept(fm, { svc: "deep", rooms: "40" });
  assert.equal(big.body.result?.outcome?.id, "site");
});

test("step 2: test fills aren't saved, an older database still takes the fill, and a form with no calcs has no result", async () => {
  assert.equal((await accept(quote(), { svc: "std", rooms: "20" }, { test: true })).saves.length, 0);
  const old = await accept(quote(), { svc: "std", rooms: "20" }, { missing: true });
  assert.equal(old.body.result?.values["q.total"], 400);
  const plain = await accept(build([f({ id: "n", type: "number" })]), { n: "3" });
  assert.equal(plain.body.result, undefined);
  assert.equal(plain.saves.length, 0);
});

// Steps 3 and 4: screens, cards, sliders and result blocks pass the checker only when they can work ------------------

test("screens, a cover, cards with pictures, a slider and result screens are kept; broken ones are refused", () => {
  const svc = f({ id: "svc", type: "choice", cards: true, options: [{ value: "a", label: "A", image: "https://img.acme.com/a.jpg" }, { value: "b", label: "B", image: "http://bad.com/b.jpg" }] });
  const rooms = f({ id: "rooms", type: "number", slider: true, valid: { min: 1, max: 60 } });
  const total = f({ id: "total", type: "calc", calc: { formula: "{rooms} * 15", format: "money" } });
  const ok = checkForm({
    ...emptyForm(),
    layout: { labels: "above", width: "wide", mode: "screens", auto: true, cover: { title: "Get your price", button: "Start" } },
    steps: [
      { id: "s1", fields: [EMAIL, svc, rooms, total] },
      { id: "s2", result: true, fields: [f({ id: "r1", type: "result", result: { kind: "meter", field: "total", max: 900 } }), f({ id: "r2", type: "result", result: { kind: "outcome" } })] },
    ],
  });
  assert.ok("form" in ok, "errors" in ok ? ok.errors.join(" ") : "");
  const fm = ok.form;
  assert.equal(fm.layout.mode, "screens");
  assert.equal(fm.layout.cover?.title, "Get your price");
  assert.equal(fm.steps[1]!.result, true);
  const cards = fm.steps[0]!.fields.find((x) => x.id === "svc")!;
  assert.equal(cards.cards, true);
  assert.equal(cards.options![0]!.image, "https://img.acme.com/a.jpg");
  assert.equal(cards.options![1]!.image, undefined, "only https pictures");

  const errs = (steps: unknown[]) => {
    const r = checkForm({ ...emptyForm(), steps });
    return "errors" in r ? r.errors.join(" ") : "";
  };
  assert.match(errs([{ id: "s1", fields: [EMAIL, f({ id: "n", type: "number", slider: true })] }]), /lowest and a highest/);
  assert.match(errs([{ id: "s1", fields: [EMAIL, f({ id: "r", type: "result", result: { kind: "metric", field: "gone" } })] }]), /number that's gone/);
  assert.match(errs([{ id: "s1", fields: [EMAIL, total, f({ id: "r", type: "result", result: { kind: "meter", field: "total" } })] }]), /top value/);
  assert.match(errs([{ id: "s1", fields: [EMAIL] }, { id: "s2", result: true, fields: [f({ id: "q", type: "text" })] }]), /results, text and calculations only/);
  assert.match(errs([{ id: "s1", fields: [EMAIL] }, { id: "s2", result: true, fields: [] }]), /no results to show/);
});

test("the results email lists the outcome and the numbers, with nothing unescaped", async () => {
  const { resultsEmail } = await import("../src/lib/forms/notify.ts");
  const m = resultsEmail({ form: "Quote", sender: "Acme <Cleaning>", outcome: { title: "Lock in this price", text: "Valid for 7 days." }, lines: [{ label: "Estimate", value: "$500.00" }] });
  assert.equal(m.subject, "Your results: Quote");
  assert.match(m.html, /Lock in this price/);
  assert.match(m.html, /\$500\.00/);
  assert.match(m.html, /Acme &lt;Cleaning&gt;/);
  assert.match(m.text, /Estimate: \$500\.00/);
});

// The builder's ops for interactive forms ------------------------------------------------------------------------------

test("builder ops: screens and a cover, settings, results and a result screen, each one checked and undone cleanly", async () => {
  const { applyOp } = await import("../src/lib/forms/ops.ts");
  let fm = build([f({ id: "n", type: "number" }), f({ id: "t", type: "calc", calc: { formula: "{n} * {@rate}" } })], { constants: [{ id: "rate", name: "Rate", value: 2 }] });
  const run = (op: Parameters<typeof applyOp>[1]) => {
    const r = applyOp(fm, op);
    assert.ok("form" in r, "error" in r ? r.error : "");
    const c = checkForm(r.form);
    assert.ok("form" in c, "errors" in c ? c.errors.join(" ") : "");
    fm = c.form;
  };
  run({ op: "set_layout", mode: "screens", auto: true, cover: { title: "Hi", button: "Go" } });
  assert.equal(fm.layout.mode, "screens");
  assert.equal(fm.layout.cover?.button, "Go");
  run({ op: "set_constants", constants: [{ id: "rate", name: "Rate", value: 3, private: true }] });
  assert.equal(withCalcs(fm, { n: "2" }).t, 6);
  const added = applyOp(fm, { op: "add_step" });
  assert.ok("form" in added);
  fm = added.form;
  run({ op: "add_field", step: 1, field: { type: "result", label: "", required: false, result: { kind: "metric", field: "t" } }, id: "r1" });
  run({ op: "update_step", index: 1, result: true });
  assert.equal(fm.steps[1]!.result, true);
  run({ op: "set_results", results: { show: "instant", outcomes: [{ id: "big", title: "Big", when: { logic: "all", conds: [{ field: "t", op: "gte", value: "10" }] } }, { id: "everyone", title: "Everyone else" }] } });
  assert.equal(pickOutcome(fm, { n: "4" })?.id, "big");
  assert.equal(pickOutcome(fm, { n: "1" })?.id, "everyone");
  run({ op: "set_layout", mode: null, cover: null });
  assert.equal(fm.layout.mode, undefined);
  assert.equal(fm.layout.cover, undefined);
  run({ op: "set_results", results: null });
  assert.equal(fm.results, undefined);
  run({ op: "update_step", index: 1, result: false });
  assert.equal(fm.steps[1]!.result, undefined);
});
