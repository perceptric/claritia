// The detail sheet on Settings › Integrations: every tool on the page has what it is, its permissions and its use
// cases, in plain words, with nothing about how Claritia is built behind the scenes.

import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTOMATION_APPS } from "../src/lib/oauth/apps.ts";
import { DETAIL_KINDS, detailsOf, PAGE_TOOLS } from "../src/lib/sources/details.ts";

const PAGE = [...PAGE_TOOLS.map((e) => e.kind), ...AUTOMATION_APPS.map((a) => a.id), "stripe"];

test("every tool on the page has what it is, permissions and use cases, and nothing extra", () => {
  assert.deepEqual(PAGE.filter((k) => !DETAIL_KINDS.includes(k)), []);
  assert.deepEqual(DETAIL_KINDS.filter((k) => !PAGE.includes(k)), []);
  for (const k of PAGE) {
    const d = detailsOf(k)!;
    assert.ok(d.about.length > 40, `${k}: about`);
    assert.ok(d.permissions.length >= 1, `${k}: permissions`);
    assert.ok(d.useCases.length >= 3, `${k}: use cases`);
  }
});

test("plain words only: no vendor plumbing, scopes or internal names", () => {
  for (const k of PAGE) {
    const text = JSON.stringify(detailsOf(k));
    assert.doesNotMatch(text, /composio|oauth|scope|token|webhook|api\b|proxy|\.ts\b|crm\.objects/i, k);
  }
});

test("every tool says what it is in its own words", () => {
  const abouts = PAGE.map((k) => detailsOf(k)!.about);
  assert.equal(new Set(abouts).size, abouts.length);
});
