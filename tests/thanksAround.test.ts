// The thank-you takes the form's place once it's sent: the form's heading and line hide on one-page and multi-page
// forms alike, the logo and the welcome screen stay (src/lib/studio/runtime.ts, around). A small stand-in for the DOM
// keeps the test on Node.
import assert from "node:assert/strict";
import { test } from "node:test";
import { around } from "../src/lib/studio/runtime.ts";
import { formBadge } from "../src/lib/plans.ts";

type N = { tag: string; attrs: Record<string, string>; children: N[]; parentElement: N | null; name: string };
const node = (tag: string, name: string, attrs: Record<string, string> = {}, ...kids: N[]): N => {
  const n: N = { tag, attrs, children: kids, parentElement: null, name };
  for (const k of kids) k.parentElement = n;
  return n;
};
const all = (n: N): N[] => n.children.flatMap((c) => [c, ...all(c)]);
const is = (n: N, sel: string): boolean =>
  sel.split(",").some((s) => {
    const m = /^(\w+)?(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(s.trim());
    return !!m && (!m[1] || m[1] === n.tag) && (!m[2] || (n.attrs.class ?? "").split(" ").includes(m[2])) && (!m[3] || m[3] in n.attrs);
  });
const el = (n: N): unknown => ({
  get children() { return n.children.map(el); },
  get parentElement() { return n.parentElement ? el(n.parentElement) : null; },
  matches: (s: string) => is(n, s),
  querySelector: (s: string) => { const f = all(n).find((x) => is(x, s)); return f ? el(f) : null; },
  contains: (o: { _n: N }) => o._n === n || all(n).includes(o._n),
  _n: n,
});
const names = (xs: unknown[]) => xs.map((x) => (x as { _n: N })._n.name).sort();

test("a multi-page form's thank-you hides the form's heading and line, and keeps the logo", () => {
  const thanks = node("section", "thanks", { "data-cl-thanks": "" });
  const form = node("form", "form", {}, node("section", "step1", { "data-cl-step": "" }), node("section", "step2", { "data-cl-step": "" }), thanks);
  const head = node("div", "head", {}, node("img", "logo", { "data-cl-logo": "" }), node("h1", "title"));
  const card = node("div", "card", {}, head, node("p", "line"), form);
  const w = node("div", "root", {}, card);
  assert.deepEqual(names(around(el(thanks) as Element, el(w) as Element)), ["line", "step1", "step2", "title"]);
});

test("a one-page form's thank-you still hides what's around it, and the welcome screen stays", () => {
  const thanks = node("section", "thanks", { "data-cl-thanks": "" });
  const form = node("form", "form", {}, node("label", "q1"), node("button", "send"), thanks);
  const w = node("div", "root", {}, node("div", "cover", { "data-cl-cover": "" }), node("h1", "title"), form);
  assert.deepEqual(names(around(el(thanks) as Element, el(w) as Element)), ["q1", "send", "title"]);
});

test("the Claritia badge stays under the thank-you", () => {
  const thanks = node("section", "thanks", { "data-cl-thanks": "" });
  const form = node("form", "form", {}, node("section", "step1", { "data-cl-step": "" }), thanks);
  const page = node("div", "page", { class: "page" }, node("div", "card", {}, node("h1", "title"), form), node("div", "badge", { class: "cl-badges" }));
  const w = node("div", "root", {}, page);
  assert.deepEqual(names(around(el(thanks) as Element, el(w) as Element)), ["step1", "title"]);
});

test("the badge follows the plan: full on Free, small on Starter, none from Pro", () => {
  assert.equal(formBadge("free"), "full");
  assert.equal(formBadge(null), "full");
  assert.equal(formBadge("starter"), "small");
  assert.equal(formBadge("pro"), "none");
  assert.equal(formBadge("team"), "none");
  assert.equal(formBadge("business"), "none");
});
