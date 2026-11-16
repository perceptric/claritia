// Settings › Integrations' detail sheets (src/lib/sources/details.ts): every tool on the page has a full entry, no
// entry is another tool's copied, the sign-in scopes it explains are the ones Claritia's own apps ask for
// (src/lib/sources/oauth.ts), and the tools it says sign in on Composio with a key are the keyed ones there.
import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTOMATION_APPS } from "../src/lib/oauth/apps.ts";
import { entryOf } from "../src/lib/sources/catalog.ts";
import { COMPOSIO_TOOLS } from "../src/lib/sources/composio.ts";
import { COMPOSIO_ASKS, DETAIL_KINDS, detailsOf, HUBSPOT_OPTIONAL, OWN_SCOPES, PAGE_TOOLS, SCOPE_WORDS, wayOf } from "../src/lib/sources/details.ts";
import { OAUTH } from "../src/lib/sources/oauth.ts";

const PAGE = [...PAGE_TOOLS.map((e) => e.kind), ...AUTOMATION_APPS.map((a) => a.id), "stripe"];

test("the page shows 62 tools, and each has details", () => {
  assert.equal(PAGE.length, 62);
  assert.deepEqual(PAGE.filter((k) => !DETAIL_KINDS.includes(k)), []);
  assert.deepEqual(DETAIL_KINDS.filter((k) => !PAGE.includes(k)), [], "details for a tool the page doesn't show");
});

test("every entry is full, signed in on Composio or not", () => {
  for (const kind of PAGE)
    for (const composio of [false, true]) {
      const d = detailsOf(kind, { composio: composio && kind in COMPOSIO_TOOLS });
      assert.ok(d, kind);
      assert.ok(d.about.length > 60, `${kind}: about`);
      const sentences = d.about.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length;
      assert.ok(sentences >= 2 && sentences <= 4, `${kind}: about is ${sentences} sentences`);
      assert.ok(d.does.length >= 2, `${kind}: does`);
      assert.ok(d.access.length >= 1, `${kind}: access`);
      assert.ok(d.connects.length > 40, `${kind}: connects`);
      assert.ok(d.where.length >= 1, `${kind}: where`);
      for (const line of [d.about, ...d.does, ...d.access, d.connects, ...d.where]) {
        assert.ok(line.trim(), `${kind}: an empty line`);
        assert.ok(!line.includes("…"), `${kind}: cut short: ${line}`);
        assert.ok(!/\p{Extended_Pictographic}/u.test(line), `${kind}: emoji: ${line}`);
      }
      for (const b of d.does) assert.ok(b.split(/[.!?](?:\s|$)/).filter((x) => x.trim()).length <= 2, `${kind}: a does bullet over two sentences: ${b}`);
    }
});

test("no entry is copied from an unrelated tool", () => {
  const all = PAGE.map((k) => ({ k, d: detailsOf(k, { composio: false })! }));
  const abouts = new Set(all.map((x) => x.d.about));
  assert.equal(abouts.size, all.length, "two tools share an about");
  for (const a of all)
    for (const b of all) {
      if (a.k >= b.k) continue;
      assert.notDeepEqual(a.d.does, b.d.does, `${a.k} and ${b.k} do the same`);
      const shared = a.d.does.filter((x) => b.d.does.includes(x)).length;
      assert.ok(shared <= 2 && shared * 2 < Math.min(a.d.does.length, b.d.does.length), `${a.k} and ${b.k} share ${shared} bullets`);
    }
  // HubSpot isn't Mailchimp.
  assert.notDeepEqual(detailsOf("hubspot", { composio: false })!.does, detailsOf("mailchimp", { composio: false })!.does);
});

test("each tool's details name the tool, not another", () => {
  for (const e of PAGE_TOOLS) {
    const d = detailsOf(e.kind, { composio: false })!;
    const text = [d.about, ...d.does, d.connects].join(" ");
    const first = e.label.split(" ")[0]!.replace(/[^A-Za-z.]/g, "");
    assert.ok(text.toLowerCase().includes(first.toLowerCase()), `${e.kind}: never says ${first}`);
  }
});

test("the scopes it explains are the ones Claritia's own sign-in asks for, each in plain words", () => {
  for (const [kind, scopes] of Object.entries(OWN_SCOPES)) {
    const cfg = OAUTH[kind];
    assert.ok(cfg, `${kind}: no sign-in in oauth.ts`);
    assert.deepEqual(scopes, (cfg.scope ?? "").split(/[ ,]+/).filter(Boolean), `${kind}: scopes differ from oauth.ts`);
    for (const s of scopes) assert.ok(SCOPE_WORDS[s], `${kind}: no words for ${s}`);
  }
  assert.deepEqual(HUBSPOT_OPTIONAL, OAUTH.hubspot.extra!.optional_scope!.split(" "));
  for (const s of HUBSPOT_OPTIONAL) assert.ok(SCOPE_WORDS[s]);
  // Every tool on the page that signs in with Claritia's own app has its scopes here.
  for (const e of PAGE_TOOLS) if (e.oauth) assert.ok(e.kind in OWN_SCOPES, `${e.kind}: scopes not explained`);
  // And the sheet lists them when it isn't on Composio.
  const hs = detailsOf("hubspot", { composio: false })!.access.join("\n");
  for (const s of OWN_SCOPES.hubspot!) assert.ok(hs.includes(SCOPE_WORDS[s]!), s);
});

test("on Composio: what its page asks for matches how the tool signs in there", () => {
  for (const [kind, t] of Object.entries(COMPOSIO_TOOLS)) {
    const keyed = !t.scheme.startsWith("OAUTH");
    assert.equal(kind in COMPOSIO_ASKS, keyed, `${kind}: Composio ${keyed ? "asks for a key" : "signs in"}`);
    const d = detailsOf(kind, { composio: true })!;
    assert.match(d.access.join(" "), /Composio/);
    assert.match(d.connects, /Composio/);
    assert.equal(wayOf(kind, true), "composio");
  }
});

test("how each tool connects follows the catalog", () => {
  assert.equal(wayOf("typeform", false), "hook");
  assert.equal(wayOf("webflow", false), "hook");
  assert.equal(wayOf("klaviyo", false), "key");
  assert.equal(wayOf("hubspot", false), "signin_or_key");
  assert.equal(wayOf("zoho", false), "signin");
  assert.equal(wayOf("omniscient", true), "omniscient");
  assert.equal(wayOf("stripe", false), "stripe");
  assert.equal(wayOf("zapier", false), "app");
  // A signing secret is explained only where the tool signs.
  assert.match(detailsOf("typeform", { composio: false })!.access.join(" "), /signing secret/);
  assert.doesNotMatch(detailsOf("webflow", { composio: false })!.access.join(" "), /signing secret/);
  // A key tool says which key.
  for (const e of PAGE_TOOLS) if (wayOf(e.kind, false) === "key") assert.match(detailsOf(e.kind, { composio: false })!.access[0]!, /^You paste /, e.kind);
  assert.equal(entryOf("google_forms") && PAGE_TOOLS.some((e) => e.kind === "google_forms"), false);
});
