// The form engine (docs/forms-plan.md Part 2): richer conditions and groups, lists that follow another field, and
// calculated fields. A fill the browser lets through must never be refused by the server, so the main proof is a
// property test over random forms and answers, with the answers sent through JSON as the browser sends them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { evalFormula, parseFormula } from "../src/lib/forms/formula.ts";
import { regionsOf } from "../src/lib/forms/regions.ts";
import { checkForm, emptyForm, opsFor, optionsFor, utcDay, visibility, whenHits, type Cond, type Field, type Form, type Op, type Rule } from "../src/lib/forms/schema.ts";
import { prepareSubmit, visitorDay } from "../src/lib/forms/submit.ts";
import { checkAnswers, stepPath } from "../src/lib/forms/values.ts";

const f = (x: Partial<Field> & Pick<Field, "id" | "type">): Field => ({ key: `q.${x.id}`, label: x.id, required: false, ...x }) as Field;
const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const form = (fields: Field[], rules: Rule[] = [], more: Partial<Form> = {}): Form => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], rules, ...more });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const errorsOf = (raw: unknown) => {
  const r = checkForm(raw);
  return "errors" in r ? r.errors.join(" ") : "";
};
const send = (fm: Form, answers: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  prepareSubmit(fm, 1, { v: 1, version: 1, key: "k".repeat(20), answers: JSON.parse(JSON.stringify({ e: "ana@acme.com", ...answers })), ms: 9000, ...extra }, { custom: [] });

// Formulas ---------------------------------------------------------------------------------------------------------

test("formulas: numbers, order of operations, functions and fields", () => {
  const run = (src: string, vals: Record<string, number | null> = {}) => {
    const p = parseFormula(src);
    assert.ok("ast" in p, `${src}: ${"error" in p ? p.error : ""}`);
    return evalFormula(p.ast, (id) => vals[id] ?? null);
  };
  assert.equal(run("1 + 2 * 3"), 7);
  assert.equal(run("(1 + 2) * 3"), 9);
  assert.equal(run("-2 * -3"), 6);
  assert.equal(run("10 / 4"), 2.5);
  assert.equal(run("round(2 / 3, 2)"), 0.67);
  assert.equal(run("min(4, {a}, 2)", { a: null }), 2);
  assert.equal(run("max({a}, {b})", { a: 3, b: 9 }), 9);
  assert.equal(run("if({a} > 100, {a} * 0.9, {a})", { a: 200 }), 180);
  assert.equal(run("if({a} > 100 and {b} == 1, 1, 0)", { a: 200, b: 1 }), 1);
  assert.equal(run("abs(-5)"), 5);
  assert.equal(run("ifempty({a}, 0) + 1", { a: null }), 1);
  assert.deepEqual("refs" in parseFormula("{qty} * {price} + {qty}") ? parseFormula("{qty} * {price} + {qty}") : null, { ast: ["+", ["*", "qty", "price"], "qty"], refs: ["qty", "price"] });
});

test("formulas: an empty field or a division by zero gives an empty answer, never a crash", () => {
  const p = parseFormula("{a} / {b}");
  assert.ok("ast" in p);
  assert.equal(evalFormula(p.ast, (id) => (id === "a" ? 5 : 0)), null);
  assert.equal(evalFormula(p.ast, (id) => (id === "a" ? 5 : null)), null);
  assert.equal(evalFormula(p.ast, () => 1e308 * 10), null);
});

test("formulas: bad input is a plain-words problem, and nothing runs as code", () => {
  for (const bad of ["", "1 +", "(1 + 2", "{a b}", "alert(1)", "1 ; 2", "if(1, 2)", "round()", "constructor", "{a}.x", "x".repeat(501)]) {
    const p = parseFormula(bad);
    assert.ok("error" in p, `${bad} should not parse`);
    assert.ok(p.error.length < 80);
  }
  assert.ok("error" in parseFormula("(".repeat(60) + "1" + ")".repeat(60)));
});

// Checks on the form ---------------------------------------------------------------------------------------------

test("calc fields: unknown fields, its own answer, loops and text fields are refused", () => {
  const base = (fields: unknown[]) => ({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }] });
  assert.match(errorsOf(base([{ id: "c", key: "q.c", type: "calc", label: "Total", calc: { formula: "{gone} * 2" } }])), /uses a field that's gone/);
  assert.match(errorsOf(base([{ id: "c", key: "q.c", type: "calc", label: "Total", calc: { formula: "{c} + 1" } }])), /can't use its own answer/);
  assert.match(
    errorsOf(base([{ id: "a", key: "q.a", type: "calc", label: "A", calc: { formula: "{b} + 1" } }, { id: "b", key: "q.b", type: "calc", label: "B", calc: { formula: "{a} + 1" } }])),
    /loop/,
  );
  assert.match(errorsOf(base([{ id: "t", key: "q.t", type: "text", label: "Name" }, { id: "c", key: "q.c", type: "calc", label: "C", calc: { formula: "{t}" } }])), /isn't a number/);
  assert.match(errorsOf(base([{ id: "c", key: "q.c", type: "calc", label: "C", calc: { formula: "1 +" } }])), /C: /);
  assert.match(errorsOf(base([{ id: "c", key: "company", type: "calc", label: "C", calc: { formula: "1" } }])), /can't be a calculation/);
  const ok = form([f({ id: "n", type: "number" }), f({ id: "c", type: "calc", required: true, calc: { formula: "{n} * 2", format: "money", currency: "eur", decimals: 9 } })]);
  const calc = ok.steps[0].fields.find((x) => x.id === "c")!;
  assert.equal(calc.required, false);
  assert.deepEqual(calc.calc, { formula: "{n} * 2", format: "money", decimals: 4, currency: "EUR" });
});

test("conditions: each op only on the fields it fits, with the values it needs", () => {
  const fields = [f({ id: "n", type: "number" }), f({ id: "t", type: "text" }), f({ id: "d", type: "date" }), f({ id: "c", type: "choice", options: [{ value: "A", label: "A" }] }), f({ id: "x", type: "text" })];
  const with1 = (when: Partial<Cond>) => errorsOf({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], rules: [{ id: "r1", when, then: { action: "show", field: "x" } }] });
  assert.equal(with1({ field: "n", op: "gt", value: "5" }), "");
  assert.equal(with1({ field: "n", op: "between", value: "1", value2: "10" }), "");
  assert.match(with1({ field: "n", op: "between", value: "10", value2: "1" }), /lowest number is above/);
  assert.match(with1({ field: "n", op: "gt", value: "lots" }), /isn't one/);
  assert.match(with1({ field: "t", op: "gt", value: "5" }), /doesn't fit its type/);
  assert.match(with1({ field: "n", op: "contains", value: "5" }), /doesn't fit its type/);
  assert.equal(with1({ field: "t", op: "contains", value: "acme" }), "");
  assert.match(with1({ field: "t", op: "contains", value: "" }), /words to look for/);
  assert.equal(with1({ field: "d", op: "before", value: "2027-01-01" }), "");
  assert.match(with1({ field: "d", op: "after", value: "soon" }), /needs a date/);
  assert.equal(with1({ field: "d", op: "within_days", value: "30" }), "");
  assert.equal(with1({ field: "c", op: "any_of", values: ["A"] } as Partial<Cond>), "");
  assert.match(with1({ field: "c", op: "none_of", values: [] } as Partial<Cond>), /at least one choice/);
  assert.deepEqual(opsFor("rating").includes("gte"), true);
  assert.deepEqual(opsFor("email").includes("ends_with"), true);
  assert.deepEqual(opsFor("checkbox").includes("contains"), false);
});

test("groups: country is US and (size over 50 or budget over 10k)", () => {
  const fm = form(
    [f({ id: "co", type: "country" }), f({ id: "sz", type: "number" }), f({ id: "bd", type: "number" }), f({ id: "x", type: "text", required: true })],
    [
      {
        id: "r1",
        when: { field: "co", op: "is", value: "US" },
        group: { logic: "any", when: [{ field: "sz", op: "gt", value: "50" }, { field: "bd", op: "gt", value: "10000" }] },
        then: { action: "show", field: "x" },
      },
    ],
  );
  const shows = (a: Record<string, unknown>) => visibility(fm, a).shown.has("x");
  assert.equal(shows({ co: "US", sz: "80" }), true);
  assert.equal(shows({ co: "US", bd: "20,000" }), true);
  assert.equal(shows({ co: "US", sz: "10", bd: "500" }), false);
  assert.equal(shows({ co: "CA", sz: "80" }), false);
  // A group can't read the field the rule acts on.
  assert.match(
    errorsOf({ ...fm, rules: [{ id: "r1", when: { field: "co", op: "filled" }, group: { logic: "all", when: [{ field: "x", op: "filled" }] }, then: { action: "show", field: "x" } }] }),
    /its own field/,
  );
});

test("whenHits: text, numbers, dates and lists", () => {
  const w = (op: Op, v: unknown, value?: string, extra: Partial<Cond> = {}, today?: string) => whenHits({ field: "a", op, value, ...extra }, v, { today });
  assert.equal(w("contains", "Head of Growth", "growth"), true);
  assert.equal(w("not_contains", "Head of Growth", "sales"), true);
  assert.equal(w("starts_with", "ana@acme.com", "ANA"), true);
  assert.equal(w("ends_with", "ana@acme.com", "@acme.com"), true);
  assert.equal(w("gt", "", "0"), false, "an empty answer is never over anything");
  assert.equal(w("lt", "abc", "10"), false, "text isn't below a number");
  assert.equal(w("gte", 10, "10"), true);
  assert.equal(w("between", "1,500", "1000", { value2: "2000" }), true);
  assert.equal(w("before", "2026-01-01", "2026-06-01"), true);
  assert.equal(w("after", "2026-01-01", "2026-06-01"), false);
  assert.equal(w("within_days", "2026-10-20", "7", {}, "2026-10-27"), true);
  assert.equal(w("within_days", "2026-10-19", "7", {}, "2026-10-27"), false);
  assert.equal(w("within_days", "2026-11-02", "7", {}, "2026-10-27"), true);
  assert.equal(w("any_of", ["A", "B"], undefined, { values: ["B", "C"] }), true);
  assert.equal(w("none_of", ["A"], undefined, { values: ["B", "C"] }), true);
  assert.equal(w("none_of", [], undefined, { values: ["B"] }), true);
});

test("the visitor's day is taken only within a day of the server's", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(visitorDay("2026-10-28", now), "2026-10-28");
  assert.equal(visitorDay("2026-10-26", now), "2026-10-26");
  assert.equal(visitorDay("2026-11-30", now), "2026-10-27");
  assert.equal(visitorDay("tomorrow", now), "2026-10-27");
  assert.equal(visitorDay(undefined, now), utcDay(now));
});

test("a visitor a day ahead of the server (UTC+14) gets the same rule result on submit", () => {
  const fm = form([f({ id: "d", type: "date" }), f({ id: "t", type: "text", required: true })], [{ id: "r1", when: { field: "d", op: "within_days", value: "0" }, then: { action: "show", field: "t" } }]);
  const ahead = utcDay(Date.now() + 86_400_000);
  const answers = { e: "ana@acme.com", d: ahead, t: "Kiribati" };
  // The browser on its own day: t shows, is required, and is answered.
  assert.equal(visibility(fm, answers, { today: ahead }).shown.has("t"), true);
  const r = send(fm, answers, { today: ahead });
  assert.ok("args" in r);
  assert.equal(r.args.p_values["q.t"], "Kiribati");
  // A day the server can't believe (a week off) falls back to the server's own.
  const far = send(fm, { d: ahead }, { today: utcDay(Date.now() + 7 * 86_400_000) });
  assert.ok("args" in far, "t is hidden on the server's day, so it isn't required");
});

// Dependent lists ----------------------------------------------------------------------------------------------------

const industry = f({ id: "ind", type: "dropdown", options: [{ value: "saas", label: "Software" }, { value: "retail", label: "Retail" }] });
const kind = f({
  id: "kind",
  type: "dropdown",
  required: true,
  optionsBy: { field: "ind", map: { saas: [{ value: "b2b", label: "B2B" }, { value: "b2c", label: "B2C" }], retail: [{ value: "online", label: "Online" }] } },
});

test("a list that follows another field: its options, and a pick from the wrong list is refused", () => {
  const fm = form([industry, kind]);
  const k = fm.steps[0].fields.find((x) => x.id === "kind")!;
  assert.deepEqual(optionsFor(k, { ind: "saas" }).map((o) => o.value), ["b2b", "b2c"]);
  assert.deepEqual(optionsFor(k, {}), []);
  // Nothing picked above: the list has nothing to show, so it isn't shown or required.
  assert.equal(visibility(fm, {}).shown.has("kind"), false);
  assert.equal(checkAnswers(fm, { e: "ana@acme.com" }).errors.kind, undefined);
  assert.equal(checkAnswers(fm, { e: "ana@acme.com", ind: "saas" }).errors.kind, "Pick one.");
  assert.equal(checkAnswers(fm, { e: "ana@acme.com", ind: "retail", kind: "b2b" }).errors.kind, "Pick from the list.");
  const r = send(fm, { ind: "saas", kind: "b2c" });
  assert.ok("args" in r, JSON.stringify(r));
  assert.equal(r.args.p_values["q.kind"], "b2c");
});

test("a list that follows another field: the checker refuses a missing parent and answers it doesn't have", () => {
  const steps = (fields: unknown[]) => ({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }] });
  assert.match(errorsOf(steps([{ ...kind, optionsBy: { field: "gone", map: kind.optionsBy!.map } }])), /follows a field that's gone/);
  assert.match(errorsOf(steps([industry, { ...kind, optionsBy: { field: "ind", map: { other: [{ value: "x", label: "X" }] } } }])), /an answer ind doesn't have/);
  assert.match(errorsOf(steps([industry, { ...kind, optionsBy: { field: "ind", map: {} } }])), /needs options/);
  assert.match(errorsOf(steps([industry, { ...kind, optionsBy: { field: "ind", preset: "regions" } }])), /regions follow a country field/);
});

test("regions follow the country: the right list, a wrong region refused, and no list means no field", () => {
  const fm = form([f({ id: "co", key: "country", type: "country" }), f({ id: "rg", key: "region", type: "dropdown", required: true, optionsBy: { field: "co", preset: "regions" } })]);
  assert.equal(regionsOf("US")!.length, 51);
  assert.equal(regionsOf("jp")!.length, 47);
  const r = send(fm, { co: "US", rg: "Texas" });
  assert.ok("args" in r);
  assert.equal(r.args.p_contact?.region, "Texas");
  const bad = send(fm, { co: "US", rg: "Bavaria" });
  assert.deepEqual("errors" in bad && bad.errors, { rg: "Pick from the list." });
  // A country with no list: the region field doesn't show, so a required one can't block the fill.
  assert.ok("args" in send(fm, { co: "PE" }));
  // The browser before the list arrives sees no region field; the form script waits for the list before Next.
  assert.equal(visibility(fm, { co: "US" }).shown.has("rg"), false);
  assert.equal(visibility(fm, { co: "US" }, { regions: regionsOf }).shown.has("rg"), true);
});

// Calc on submit -----------------------------------------------------------------------------------------------------

test("calc fields: the server works the total out again and ignores the browser's", () => {
  const fm = form([
    f({ id: "qty", type: "number" }),
    f({ id: "plan", type: "choice", options: [{ value: "basic", label: "Basic", score: 20 }, { value: "pro", label: "Pro", score: 50 }] }),
    f({ id: "addons", type: "multi", options: [{ value: "sso", label: "SSO", score: 100 }, { value: "api", label: "API", score: 30 }] }),
    f({ id: "total", type: "calc", calc: { formula: "{qty} * {plan} + {addons}", format: "money" } }),
  ]);
  const r = send(fm, { qty: "3", plan: "pro", addons: ["sso", "api"], total: 1 });
  assert.ok("args" in r);
  assert.equal(r.args.p_values["q.total"], 280);
  // Nothing to work from: no answer is saved, and the fill still goes through.
  const empty = send(fm, { plan: "pro", total: 999999 });
  assert.ok("args" in empty);
  assert.equal(empty.args.p_values["q.total"], undefined);
});

test("calc fields: a rule reads the total, and a field a rule hid never counts in it", () => {
  const fm = form(
    [
      f({ id: "seats", type: "number" }),
      f({ id: "wantx", type: "checkbox" }),
      f({ id: "extra", type: "number" }),
      f({ id: "total", type: "calc", calc: { formula: "{seats} * 100 + ifempty({extra}, 0)" } }),
      f({ id: "book", type: "text", required: true }),
    ],
    [
      { id: "r1", when: { field: "wantx", op: "is", value: "true" }, then: { action: "show", field: "extra" } },
      { id: "r2", when: { field: "total", op: "gt", value: "5000" }, then: { action: "show", field: "book" } },
    ],
  );
  // extra is hidden (wantx unticked), so its 9999 doesn't count: total 4000, book stays hidden.
  const a = { e: "ana@acme.com", seats: "40", extra: "9999" };
  assert.equal(visibility(fm, a).shown.has("book"), false);
  const r = send(fm, { seats: "40", extra: "9999" });
  assert.ok("args" in r);
  assert.equal(r.args.p_values["q.total"], 4000);
  assert.equal(r.args.p_values["q.extra"], undefined);
  // 60 seats is over 5,000: book shows and is required.
  assert.deepEqual("errors" in send(fm, { seats: "60" }) ? Object.keys((send(fm, { seats: "60" }) as { errors: object }).errors) : [], ["book"]);
});

test("a skip can read a calc", () => {
  const r = checkForm({
    ...emptyForm(),
    steps: [
      { id: "s1", fields: [EMAIL, f({ id: "n", type: "number" }), f({ id: "c", type: "calc", calc: { formula: "{n} * 10" } })], skip: { when: { field: "c", op: "gte", value: "100" }, to: 2 } },
      { id: "s2", fields: [f({ id: "a", type: "text" })] },
      { id: "s3", fields: [f({ id: "b", type: "text" })] },
    ],
  });
  assert.ok("form" in r, "errors" in r ? r.errors.join() : "");
  assert.deepEqual(stepPath(r.form, { n: "12" }), [0, 2]);
  assert.deepEqual(stepPath(r.form, { n: "2" }), [0, 1, 2]);
});

// The property test ----------------------------------------------------------------------------------------------------

/** A small seeded random, so a failure can be run again. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("10,000 random forms and answers: a fill the browser lets through, the server takes", () => {
  const rand = rng(20261027);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ value: `o${i}`, label: `O${i}`, ...(rand() < 0.5 ? { score: Math.round(rand() * 20) } : {}) }));
  const today = "2026-10-27";
  let sent = 0;
  for (let run = 0; run < 10_000; run++) {
    const fields: Field[] = [
      f({ id: "n", type: "number", required: rand() < 0.3 }),
      f({ id: "r", type: "rating", required: rand() < 0.2, rating: { scale: 5, style: "stars" } }),
      f({ id: "t", type: "text", required: rand() < 0.3 }),
      f({ id: "d", type: "date", required: rand() < 0.2 }),
      f({ id: "c", type: "choice", options: opts(3), required: rand() < 0.3 }),
      f({ id: "m", type: "multi", options: opts(4) }),
      f({ id: "k", type: "checkbox" }),
      f({ id: "dd", type: "dropdown", required: rand() < 0.5, optionsBy: { field: "c", map: { o0: opts(2), o2: opts(3) } } }),
      f({ id: "co", key: "country", type: "country", required: rand() < 0.3 }),
      f({ id: "rg", key: "region", type: "dropdown", required: rand() < 0.5, optionsBy: { field: "co", preset: "regions" } }),
      f({ id: "x", type: "calc", calc: { formula: pick(["{n} * 2 + {c}", "{r} + {m} + {k}", "{n} / {r}", "if({n} > 10, {c}, {m})"]) } }),
    ];
    const types = new Map(fields.map((x) => [x.id, x.type]));
    const valueFor = (id: string, op: Op): Partial<Cond> => {
      const t = types.get(id)!;
      if (op === "between") return { value: "2", value2: "12" };
      if (["gt", "gte", "lt", "lte"].includes(op)) return { value: String(Math.round(rand() * 15)) };
      if (["contains", "not_contains", "starts_with", "ends_with"].includes(op)) return { value: pick(["a", "ac", "z"]) };
      if (op === "before" || op === "after") return { value: pick(["2026-01-01", "2026-10-27", "2027-03-01"]) };
      if (op === "within_days") return { value: pick(["0", "1", "30"]) };
      if (op === "any_of" || op === "none_of") return { values: t === "country" ? ["US", "DE"] : ["o0", "o1"] };
      if (op === "is" || op === "is_not") return { value: t === "country" ? "US" : t === "checkbox" ? "true" : pick(["o0", "o1", "3", "abc"]) };
      return {};
    };
    const cond = (avoid: string): Cond => {
      const id = pick(fields.map((x) => x.id).filter((x) => x !== avoid));
      const op = pick(opsFor(types.get(id)!));
      return { field: id, op, ...valueFor(id, op) } as Cond;
    };
    const rules: Rule[] = [];
    for (let i = 0, n = Math.floor(rand() * 4); i < n; i++) {
      const target = pick(fields.filter((x) => x.type !== "calc" || rand() < 0.2)).id;
      rules.push({
        id: `r${i}`,
        when: cond(target),
        ...(rand() < 0.4 ? { group: { logic: pick(["all", "any"] as const), when: [cond(target), cond(target)] } } : {}),
        then: { action: pick(["show", "hide", "require"] as const), field: target },
      });
    }
    const checked = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields.slice(0, 5)] }, { id: "s2", fields: fields.slice(5) }], rules });
    assert.ok("form" in checked, "errors" in checked ? checked.errors.join(" ") : "");
    const fm = checked.form;
    const answers: Record<string, unknown> = { e: "ana@acme.com" };
    const maybe = (id: string, v: () => unknown) => rand() < 0.75 && (answers[id] = v());
    maybe("n", () => pick(["5", "12", "1,200", "-3", "abc", ""]));
    maybe("r", () => pick([1, 3, 5, 7]));
    maybe("t", () => pick(["acme", "Zeta", "", "a"]));
    maybe("d", () => pick(["2026-10-20", "2026-12-01", "2025-01-01", "nope"]));
    maybe("c", () => pick(["o0", "o1", "o2", "o9"]));
    maybe("m", () => pick([["o0"], ["o1", "o3"], [], ["o8"]]));
    maybe("k", () => pick([true, false]));
    maybe("dd", () => pick(["o0", "o1", "o2", "o5"]));
    maybe("co", () => pick(["US", "DE", "PE", "us"]));
    maybe("rg", () => pick(["Texas", "Bavaria", "Ontario"]));
    maybe("x", () => pick([1, 99999, "lots"]));
    // The browser: each step on the path is checked before Next, with the region lists loaded and its own day.
    const ctx = { today, regions: regionsOf };
    const path = stepPath(fm, answers, ctx);
    const browserOk = path.every((i) => !Object.keys(checkAnswers(fm, answers, { steps: [i], ...ctx }).errors).length);
    if (!browserOk) continue;
    sent++;
    const r = prepareSubmit(fm, 1, { v: 1, version: 1, key: "k".repeat(20), answers: JSON.parse(JSON.stringify(answers)), ms: 9000, today }, { custom: [] });
    assert.ok("args" in r, `run ${run}: the server refused ${JSON.stringify("errors" in r ? r.errors : r)} for ${JSON.stringify({ answers, rules: fm.rules })}`);
    // Same answers, same result: what the browser would save is what the server saves.
    const browser = checkAnswers(fm, answers, ctx).values;
    assert.deepEqual(r.args.p_values, browser, `run ${run}`);
  }
  assert.ok(sent > 1000, `only ${sent} fills got through the browser`);
});

// Edits ------------------------------------------------------------------------------------------------------------

test("edits keep a rule's group, and removing a field clears it from groups and skips", async () => {
  const { applyOp, describeOp } = await import("../src/lib/forms/ops.ts");
  const fm = form([f({ id: "a", type: "number" }), f({ id: "b", type: "text" }), f({ id: "c", type: "text" })]);
  const rule = { id: "r1", when: { field: "a", op: "gt" as const, value: "5" }, group: { logic: "any" as const, when: [{ field: "b", op: "contains" as const, value: "x" }] }, then: { action: "show" as const, field: "c" } };
  const set = applyOp(fm, { op: "set_rule", rule });
  assert.ok("form" in set);
  assert.deepEqual(set.form.rules[0].group, rule.group);
  assert.equal(describeOp({ op: "set_rule", rule }, fm), "Show c when a is over 5 and any of 1 more");
  const gone = applyOp(set.form, { op: "remove_field", id: "b" });
  assert.ok("form" in gone);
  assert.equal(gone.form.rules[0].group, undefined);
  assert.ok("form" in checkForm(gone.form));
  // A new calc starts with a formula and is never required; a field that stops being one drops it.
  const added = applyOp(fm, { op: "add_field", field: { type: "calc", label: "Total", required: true }, id: "t" });
  assert.ok("form" in added);
  const t = added.form.steps[0].fields.find((x) => x.id === "t")!;
  assert.deepEqual([t.calc, t.required], [{ formula: "0" }, false]);
  const back = applyOp(added.form, { op: "update_field", id: "t", patch: { type: "number" } });
  assert.ok("form" in back && back.form.steps[0].fields.find((x) => x.id === "t")!.calc === undefined);
});

test("the chat's set_rule and add_field tools carry groups, scores, calcs and lists that follow", async () => {
  const { toOp } = await import("../src/lib/forms/chat.ts");
  const rule = toOp("set_rule", {
    target_field_id: "x",
    action: "show",
    when_field_id: "co",
    op: "any_of",
    values: ["US", "CA"],
    group: { logic: "any", conditions: [{ field_id: "sz", op: "between", value: "10", value2: "50" }] },
  });
  assert.deepEqual(rule, {
    op: "set_rule",
    rule: { when: { field: "co", op: "any_of", values: ["US", "CA"] }, group: { logic: "any", when: [{ field: "sz", op: "between", value: "10", value2: "50" }] }, then: { action: "show", field: "x" } },
  });
  const add = toOp("add_field", { field: { type: "dropdown", label: "Plan", options: ["Basic", "Pro"], option_scores: [10, 30], follows: { field_id: "ind", options_by_answer: { saas: ["B2B"] } } } });
  assert.ok("op" in add && add.op === "add_field");
  assert.deepEqual(add.field.options, [{ value: "Basic", label: "Basic", score: 10 }, { value: "Pro", label: "Pro", score: 30 }]);
  assert.deepEqual(add.field.optionsBy, { field: "ind", map: { saas: [{ value: "B2B", label: "B2B" }] } });
  const calc = toOp("add_field", { field: { type: "calc", label: "Total", calc: { formula: "{a} * 2", format: "money", currency: "EUR" } } });
  assert.ok("op" in calc && calc.op === "add_field" && calc.field.calc?.formula === "{a} * 2");
});

test("the new templates pass the checker and work out on submit", async () => {
  const { TEMPLATES } = await import("../src/lib/forms/templates.ts");
  const quote = checkForm(TEMPLATES.find((t) => t.key === "quote")!.form());
  assert.ok("form" in quote);
  const fields = quote.form.steps[0].fields;
  const id = (key: string) => fields.find((x) => x.key === key)!.id;
  const r = prepareSubmit(quote.form, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { [id("email")]: "ana@acme.com", [id("name")]: "Ana", [id("company")]: "Acme", [id("q.need")]: "Seats", [id("q.seats")]: "12", [id("q.plan")]: "Team" }, ms: 9000 }, { custom: [] });
  assert.ok("args" in r);
  assert.equal(r.args.p_values["q.estimate"], 480);
  const partner = checkForm(TEMPLATES.find((t) => t.key === "partner")!.form());
  assert.ok("form" in partner);
  assert.equal(partner.form.steps[0].fields.find((x) => x.key === "region")!.optionsBy?.preset, "regions");
});
