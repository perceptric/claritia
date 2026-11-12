// The Ending's Redirect drawn on the canvas (docs/ending-plan.md Part 3, readPage in src/lib/studio/site.ts): the page
// is fetched on the server without its scripts. The flaky and unsafe cases: private and local addresses, addresses
// that aren't web pages, and a page read again inside 10 minutes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readPage } from "../src/lib/studio/site.ts";

test("private, local and non-web addresses are refused without a fetch", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("no fetch in this test"); }) as typeof fetch;
  try {
    for (const u of ["http://localhost/thanks", "http://127.0.0.1/", "http://10.0.0.1/x", "http://192.168.1.2/", "http://169.254.169.254/latest/meta-data"]) {
      const r = await readPage(u);
      assert.ok("error" in r, `${u} is refused`);
    }
    assert.equal(calls, 0, "nothing private is ever fetched");
    for (const u of ["javascript:alert(1)", "ftp://acme.com/x", "not a url"]) assert.ok("error" in (await readPage(u)), `${u} is refused`);
  } finally {
    globalThis.fetch = real;
  }
});

test("a page comes back without its scripts, with its share picture, and is kept 10 minutes", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  const html = `<html><head><meta property="og:image" content="/share.png"><script>alert(1)</script></head><body onload="x()"><h1>Welcome aboard</h1><p>${"Thanks for signing up with Acme. ".repeat(6)}</p></body></html>`;
  globalThis.fetch = (async () => { calls++; return new Response(html, { status: 200, headers: { "content-type": "text/html" } }); }) as typeof fetch;
  try {
    const t0 = 1_800_000_000_000;
    const r = await readPage("https://93.184.216.34/welcome", t0);
    assert.ok(!("error" in r));
    const look = r as { preview: string | null; shot: string | null; url: string };
    assert.ok(look.preview && !/<script/i.test(look.preview) && !/onload=/i.test(look.preview), "no scripts or handlers");
    assert.equal(look.shot, "https://93.184.216.34/share.png");
    await readPage("https://93.184.216.34/welcome", t0 + 5 * 60_000);
    assert.equal(calls, 1, "read again inside 10 minutes from the cache");
    await readPage("https://93.184.216.34/welcome", t0 + 11 * 60_000);
    assert.equal(calls, 2, "fetched again after 10 minutes");
  } finally {
    globalThis.fetch = real;
  }
});

test("a page that can't be opened says so", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  try {
    assert.ok("error" in (await readPage("https://93.184.216.35/down")));
  } finally {
    globalThis.fetch = real;
  }
});
