// The AI form builder (docs/ai-form-builder.md), with a fake model: the site is read into pages, pictures and the
// pages worth reading; a draft that fails the checker goes back with its problems; only a form that passes comes out;
// blank prices are always listed to replace; and without a model the questions still come.
import assert from "node:assert/strict";
import { test } from "node:test";
import { askQuestions, buildForm, defaultQuestions, firstJson, guessKind, kindOf, kindProblems, pickPages, readPage, type Caller } from "../src/lib/forms/aiBuild.ts";

const BASE = "https://momos.example.com/";

test("a page gives its words, its pictures (no logos or http) and its own links", () => {
  const html = `<html><head><title>Momos</title><meta name="description" content="Restaurant ops"><meta property="og:image" content="/hero.jpg"></head>
  <body><script>var x=1</script><h1>Run every kitchen</h1><img src="/team.jpg"><img src="/logo.png"><img src="http://cdn.x.com/a.jpg">
  <a href="/pricing">Pricing</a><a href="https://other.com/x">x</a><a href="/blog/post-1">Blog</a></body></html>`;
  const p = readPage(html, BASE);
  assert.equal(p.title, "Momos");
  assert.match(p.text, /Restaurant ops.*Run every kitchen/);
  assert.doesNotMatch(p.text, /var x/);
  assert.deepEqual(p.images, ["https://momos.example.com/hero.jpg", "https://momos.example.com/team.jpg"]);
  assert.ok(p.links.includes("https://momos.example.com/pricing"));
  assert.ok(!p.links.some((u) => u.includes("other.com")));
});

test("the pages read after the home page: pricing first, one of each kind, never the blog", () => {
  const links = ["/blog/a", "/about", "/pricing", "/plans", "/services", "/features", "/case-studies"].map((x) => BASE.slice(0, -1) + x);
  assert.deepEqual(pickPages(links), ["/pricing", "/services", "/features", "/about"].map((x) => BASE.slice(0, -1) + x));
});

test("JSON is found inside a fence or text", () => {
  assert.deepEqual(firstJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(firstJson('Here: {"a":{"b":2}} done'), { a: { b: 2 } });
  assert.throws(() => firstJson("nothing"));
});

const GOOD = {
  name: "Restaurant ops quote",
  form: {
    layout: { labels: "above", width: "wide", mode: "screens", auto: true, cover: { title: "Get your monthly estimate" } },
    constants: [{ id: "per_location", name: "Price per location", value: null, format: "money" }],
    steps: [
      { id: "s1", fields: [{ id: "hero", key: "c.hero", type: "html", label: "", required: false, content: { html: '<section><h1>Run every kitchen</h1><script>x()</script></section>' } }, { id: "locs", key: "q.locations", type: "number", label: "How many locations?", required: true, slider: true, valid: { min: 1, max: 50 } }, { id: "total", key: "q.total", type: "calc", label: "Monthly estimate", required: false, calc: { formula: "{locs} * {@per_location}", format: "money", show: false } }] },
      { id: "s2", result: true, fields: [{ id: "r1", key: "c.r1", type: "result", label: "Your estimate", required: false, result: { kind: "metric", field: "total" } }] },
      { id: "s3", fields: [{ id: "e", key: "email", type: "email", label: "Work email", required: true }] },
    ],
    results: { show: "instant", outcomes: [{ id: "big", title: "Talk to us about volume", when: { logic: "all", conds: [{ field: "locs", op: "gte", value: "20" }] } }, { id: "std", title: "Start this month" }] },
  },
  summary: { built: ["A 3-step quote"], assumptions: ["Price scales with locations"], replace: ["Customer quote on the cover"] },
};

test("a draft the checker refuses goes back with its problems, and the fixed one comes out", async () => {
  const replies = ["not json at all", JSON.stringify({ name: "x", form: { steps: [{ id: "s1", fields: [] }] } }), JSON.stringify(GOOD)];
  const seen: string[] = [];
  const call: Caller = async (p) => {
    seen.push(String(p.history?.[p.history.length - 1]?.content ?? ""));
    return { text: replies.shift()!, usage: { input_tokens: 10, output_tokens: 10 } as never };
  };
  const built = await buildForm(call, { brief: null, kind: "quote", note: "", answers: {}, site: "momos.example.com" });
  assert.ok(built);
  assert.equal(built.rounds, 3);
  assert.match(seen[1]!, /checker refused it/);
  assert.match(seen[2]!, /email field|no fields/i);
  // The section was cleaned, the slider kept, and the blank price is on the list to replace.
  const fields = built.form.steps.flatMap((s) => s.fields);
  assert.equal(fields.find((f) => f.id === "hero")!.content!.html, "<section><h1>Run every kitchen</h1></section>");
  assert.equal(fields.find((f) => f.id === "locs")!.slider, true);
  assert.deepEqual(built.summary.replace, ["Customer quote on the cover", "Price per location: set the real value"]);
});

test("a model that never passes gives nothing, so no broken form is saved", async () => {
  const call: Caller = async () => ({ text: JSON.stringify({ form: { steps: [] } }), usage: {} as never });
  assert.equal(await buildForm(call, { brief: null, kind: "lead", note: "", answers: {}, site: "" }), null);
});

test("questions: cleaned from the model, and set ones when it's down", async () => {
  const call: Caller = async () => ({
    text: JSON.stringify({ questions: [{ id: "Bad Id!", question: "What drives the price?", kind: "choice", options: ["Locations"] }, { id: "who", question: "Who fills it in?", kind: "multi", options: ["Owners", "Managers"] }, { id: "x", question: "  ", kind: "text", options: [] }] }),
    usage: {} as never,
  });
  const { kind, questions: qs } = await askQuestions(call, null, "quote", "");
  assert.equal(kind, "quote");
  assert.deepEqual(qs.map((q) => [q.id, q.kind]), [["q1", "text"], ["who", "multi"]]);
  const down: Caller = async () => {
    throw new Error("down");
  };
  assert.deepEqual(await askQuestions(down, null, "quiz", ""), { kind: "quiz", questions: defaultQuestions("quiz") });
});

// Kinds (docs/form-kinds-plan.md) ------------------------------------------------------------------------------------

test("kinds: the model picks one from the owner's line; down, the words pick it", async () => {
  const call: Caller = async (p) => {
    assert.match(p.system, /pick what kind of form/);
    return { text: JSON.stringify({ kind: "survey", questions: [{ id: "measure", question: "What do you measure?", kind: "choice", options: ["NPS", "CSAT"] }] }), usage: {} as never };
  };
  assert.equal((await askQuestions(call, null, null, "NPS for our customers")).kind, "survey");
  const down: Caller = async () => null;
  assert.equal((await askQuestions(down, null, null, "a job application for designers")).kind, "application");
  assert.equal(guessKind("quote for kitchen remodels"), "quote");
  assert.equal(guessKind("flower orders"), "order");
  assert.equal(guessKind("anything"), "lead");
  assert.equal(kindOf("leads"), "lead");
  assert.equal(kindOf("nope"), null);
});

test("kinds: a build missing the kind's must-have goes back to be fixed", async () => {
  const noCalc = { ...GOOD, form: { ...GOOD.form, steps: [GOOD.form.steps[2]], results: undefined, constants: undefined } };
  const replies = [JSON.stringify(noCalc), JSON.stringify(GOOD)];
  const seen: string[] = [];
  const call: Caller = async (p) => {
    seen.push(String(p.history?.[p.history.length - 1]?.content ?? ""));
    return { text: replies.shift()!, usage: {} as never };
  };
  const built = await buildForm(call, { brief: null, kind: "quote", note: "", answers: {}, site: "" });
  assert.ok(built);
  assert.equal(built.rounds, 2);
  assert.match(seen[1]!, /calc field for the total/);
  assert.equal(built.form.kind, "quote");
});

test("kinds: a quote can't drop the email", () => {
  assert.deepEqual(kindProblems({ ...(GOOD.form as never), emailOptional: true }, "quote"), ["A quote form needs the email: leave emailOptional out."]);
});
