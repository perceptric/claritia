// The booking page inside a form (docs/ending-plan.md Part 4): the switch, the page's address on the booking site,
// and Routing's rep as the page's one host. The database side is in tests/pg/formBookPage.pg.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bookPageOn, bookPageUrl, pageType } from "../src/lib/forms/bookPage.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";

const WS = "0192f3a1-0000-7000-8000-0000000000aa";

test("the switch: off unless the workspace is listed, or all", () => {
  assert.equal(bookPageOn(WS, undefined), false);
  assert.equal(bookPageOn(WS, ""), false);
  assert.equal(bookPageOn(WS, "all"), true);
  assert.equal(bookPageOn(WS, " ALL "), true);
  assert.equal(bookPageOn(WS, `x, ${WS.toUpperCase()} ,y`), true);
  assert.equal(bookPageOn(WS, "0192f3a1-0000-7000-8000-0000000000ab"), false);
});

test("the page lives on the app, with the token kept whole", () => {
  const token = `${WS}.${WS}.~${WS}.abc.sig_-x`;
  assert.equal(bookPageUrl("https://app.tryclaritia.com", token), `https://app.tryclaritia.com/book/f/${token}`);
  assert.equal(bookPageUrl("https://app.tryclaritia.com/", "a b"), "https://app.tryclaritia.com/book/f/a%20b");
});

test("with Routing's rep, the page shows that rep alone; without, the type's hosts", () => {
  const t = { id: "t", workspace_id: WS, slug: "demo", name: "Demo", kind: "round_robin", hosts: [{ user_id: "a" }, { user_id: "b" }], settings: DEFAULT_SETTINGS } as unknown as MeetingType;
  const claim = { submission: "s", type: "t", owner: "rep", exp: 0 };
  assert.deepEqual(pageType(t, { ...claim, only: true }).hosts, [{ user_id: "rep" }]);
  assert.deepEqual(pageType(t, claim).hosts, t.hosts, "an owner who wasn't routed is only preferred");
  assert.deepEqual(pageType(t, { ...claim, owner: null, only: true }).hosts, t.hosts);
});
