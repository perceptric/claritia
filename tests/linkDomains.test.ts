// Link hosts and custom domains (docs/sharing-plan.md step 4): which host is which, what a path opens there, which
// domains a team may add, whether DNS points at Claritia, the states a domain moves through, Fly's certificate calls,
// the proxy's cached lookup, and the proxy itself on a workspace subdomain.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextState, pointsAt, type Resolver } from "../src/lib/domains/check.ts";
import { addCert, certReady, checkCert, removeCert } from "../src/lib/domains/fly.ts";
import { hostnameProblem } from "../src/lib/domains/hostname.ts";
import { hostKind, linkPath, plainHost } from "../src/lib/domains/hosts.ts";
import { domainSlug } from "../src/lib/domains/resolve.ts";

const SITE = "tryclaritia.com";
const APP = "app.tryclaritia.com";

test("hosts: the site and app as before, a workspace's subdomain, and anything else looked up", () => {
  assert.deepEqual(hostKind("app.tryclaritia.com", SITE, APP), { kind: "site" });
  assert.deepEqual(hostKind("www.tryclaritia.com", SITE, APP), { kind: "site" });
  assert.deepEqual(hostKind("acme.tryclaritia.com", SITE, APP), { kind: "sub", slug: "acme" });
  assert.deepEqual(hostKind("ACME.tryclaritia.com", SITE, APP), { kind: "sub", slug: "acme" });
  for (const reserved of ["api", "t", "inbox", "docs"]) assert.deepEqual(hostKind(`${reserved}.tryclaritia.com`, SITE, APP), { kind: "site" }, reserved);
  assert.deepEqual(hostKind("a.b.tryclaritia.com", SITE, APP), { kind: "site" }, "one label only");
  assert.deepEqual(hostKind("forms.acme.com", SITE, APP), { kind: "other" });
  for (const p of ["localhost", "claritia-web.fly.dev", "claritia.onrender.com", "127.0.0.1", "intranet"]) assert.ok(plainHost(p), p);
  assert.ok(!plainHost("forms.acme.com"));
});

test("on a link host only its links answer, never the app", () => {
  assert.equal(linkPath("acme", "/"), "/book/acme");
  assert.equal(linkPath("acme", "/book"), "/book/acme");
  assert.equal(linkPath("acme", "/book/demo"), "/book/acme/demo");
  assert.equal(linkPath("acme", "/book/m/abcdefghijklmnopqrstuv"), "/book/m/abcdefghijklmnopqrstuv", "manage, single-use and poll links as they are");
  assert.equal(linkPath("acme", "/demo-request"), "/f/acme/demo-request");
  assert.equal(linkPath("acme", "/demo-request/"), "/f/acme/demo-request");
  for (const app of ["/forms", "/settings/team", "/scheduling", "/workflows", "/f/11111111-1111-4111-8111-111111111111", "/book/other/demo", "/booking/dana", "/Demo"]) {
    const to = linkPath("acme", app);
    assert.ok(to === null || to.startsWith("/f/acme/") || to.startsWith("/book/acme"), `${app} → ${to}`);
  }
  assert.equal(linkPath("acme", "/settings/team"), null);
  assert.equal(linkPath("acme", "/f/11111111-1111-4111-8111-111111111111"), null, "another workspace's form by its id never opens here");
  assert.equal(linkPath("acme", "/book/other/demo"), null);
});

test("a domain a team may add: a subdomain of its own registered domain", () => {
  assert.equal(hostnameProblem("forms.acme.com", SITE), null);
  assert.equal(hostnameProblem("https://Forms.Acme.co.uk/path", SITE), null);
  assert.match(hostnameProblem("acme.com", SITE)!, /subdomain/);
  assert.match(hostnameProblem("acme.co.uk", SITE)!, /subdomain/, "co.uk is a suffix, so acme.co.uk is the domain itself");
  assert.match(hostnameProblem("www.acme.com", SITE)!, /subdomain/);
  assert.match(hostnameProblem("evil.tryclaritia.com", SITE)!, /not tryclaritia.com/);
  assert.match(hostnameProblem("forms.acme", SITE)!, /subdomain|domain/);
  assert.match(hostnameProblem("not a domain", SITE)!, /isn't a domain/);
  assert.match(hostnameProblem("x.claritia-web.fly.dev", SITE)!, /own domain/);
});

const resolver = (cnames: Record<string, string[]>, a: Record<string, string[]>): Resolver => ({
  cname: async (h) => {
    if (!(h in cnames)) throw Object.assign(new Error("ENODATA"), { code: "ENODATA" });
    return cnames[h]!;
  },
  a: async (h) => {
    if (!(h in a)) throw new Error("ENOTFOUND");
    return a[h]!;
  },
});

test("DNS points at Claritia: a CNAME to it, through one more name, or a flattened record with its address", async () => {
  const T = "claritia-web.fly.dev";
  assert.equal(await pointsAt("forms.acme.com", T, resolver({ "forms.acme.com": ["claritia-web.fly.dev."] }, {})), true);
  assert.equal(await pointsAt("forms.acme.com", T, resolver({ "forms.acme.com": ["edge.acme.net"], "edge.acme.net": [T] }, {})), true);
  assert.equal(await pointsAt("forms.acme.com", T, resolver({}, { "forms.acme.com": ["66.241.124.1"], [T]: ["66.241.124.1"] })), true);
  assert.equal(await pointsAt("forms.acme.com", T, resolver({ "forms.acme.com": ["acme.webflow.io"] }, { "forms.acme.com": ["1.2.3.4"], [T]: ["66.241.124.1"] })), false, "pointed elsewhere");
  assert.equal(await pointsAt("forms.acme.com", T, resolver({}, {})), false, "no records yet: not yet, never a throw");
  const failing: Resolver = { cname: async () => Promise.reject(new Error("SERVFAIL")), a: async () => Promise.reject(new Error("timeout")) };
  assert.equal(await pointsAt("forms.acme.com", T, failing), false);
});

test("a domain serves only with DNS and a certificate, stops when its DNS moves, and serves again when it's back", () => {
  assert.deepEqual(nextState({ status: "pending", certOk: false }, true, false), { status: "pending", certOk: false }, "the certificate isn't ready: waiting, never a broken page");
  assert.deepEqual(nextState({ status: "pending", certOk: false }, true, true), { status: "active", certOk: true });
  assert.deepEqual(nextState({ status: "pending", certOk: true }, false, true), { status: "pending", certOk: true });
  assert.deepEqual(nextState({ status: "active", certOk: true }, false, null), { status: "failed", certOk: true }, "pointed elsewhere: it stops");
  assert.deepEqual(nextState({ status: "failed", certOk: true }, true, null), { status: "active", certOk: true }, "pointed back");
  assert.deepEqual(nextState({ status: "active", certOk: true }, true, null), { status: "active", certOk: true }, "the worker's re-check keeps the last certificate answer");
  assert.deepEqual(nextState({ status: "active", certOk: true }, true, false), { status: "active", certOk: false }, "a live domain keeps serving on its issued certificate while Fly renews it");
});

test("Fly's certificate calls: add, check and remove send the hostname; an error comes back as an error", async () => {
  const sent: { body: { query: string; variables: Record<string, string> }; auth: string | null }[] = [];
  const fetcher = (async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ body, auth: new Headers(init.headers).get("authorization") });
    if (body.variables.hostname === "bad.acme.com") return new Response(JSON.stringify({ errors: [{ message: "Hostname is invalid" }] }), { status: 200 });
    if (body.query.includes("addCertificate")) return new Response(JSON.stringify({ data: { addCertificate: { certificate: { configured: false, clientStatus: "Awaiting configuration" } } } }));
    if (body.query.includes("certificate(hostname")) return new Response(JSON.stringify({ data: { app: { certificate: { configured: true, clientStatus: "Ready" } } } }));
    return new Response(JSON.stringify({ data: { deleteCertificate: { app: { name: "claritia-web" } } } }));
  }) as unknown as typeof fetch;
  const f = { token: "tok", app: "claritia-web", fetcher };
  assert.deepEqual(await addCert(f, "forms.acme.com"), { configured: false, status: "Awaiting configuration" });
  const c = await checkCert(f, "forms.acme.com");
  assert.ok(certReady(c));
  assert.ok(!certReady({ configured: false, status: "Awaiting configuration" }));
  assert.ok(!certReady(null));
  await removeCert(f, "forms.acme.com");
  assert.deepEqual(sent.map((s) => [s.body.variables.hostname, s.auth]), [["forms.acme.com", "Bearer tok"], ["forms.acme.com", "Bearer tok"], ["forms.acme.com", "Bearer tok"]]);
  await assert.rejects(addCert(f, "bad.acme.com"), /Hostname is invalid/);
});

test("the proxy's lookup: kept a minute, a failed lookup never kept", async () => {
  let calls = 0;
  const look = async (h: string) => (calls++, h === "down.acme.com" ? { error: true as const } : { slug: h === "forms.acme.com" ? "acme" : null });
  assert.equal(await domainSlug("forms.acme.com", { now: 1000, look }), "acme");
  assert.equal(await domainSlug("forms.acme.com", { now: 30_000, look }), "acme");
  assert.equal(calls, 1);
  assert.equal(await domainSlug("forms.acme.com", { now: 62_000, look }), "acme");
  assert.equal(calls, 2, "read again after a minute");
  assert.equal(await domainSlug("down.acme.com", { now: 1000, look }), null);
  assert.equal(await domainSlug("down.acme.com", { now: 2000, look }), null);
  assert.equal(calls, 4, "a failed lookup is asked again");
  assert.equal(await domainSlug("unknown.acme.com", { now: 1000, look }), null);
});

test("the proxy on a workspace subdomain: its links, and 'not found' for the app", async () => {
  process.env.LINK_SUBDOMAINS = "1";
  // Bundled as Next bundles it (the proxy imports without file endings), next and supabase left to node.
  const { build } = await import("esbuild");
  const { writeFileSync, rmSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const out = new URL("./.proxy-bundle.cjs", import.meta.url).pathname;
  const res = await build({ entryPoints: [new URL("../src/proxy.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "error", tsconfig: new URL("../tsconfig.json", import.meta.url).pathname });
  writeFileSync(out, res.outputFiles[0]!.text);
  const req = createRequire(import.meta.url);
  const { proxy } = req(out) as { proxy: (r: unknown) => Promise<Response> };
  rmSync(out);
  const { NextRequest } = req("next/server") as typeof import("next/server");
  const at = (url: string) => proxy(new NextRequest(url, { headers: { host: new URL(url).host } }));
  const form = await at("https://acme.tryclaritia.com/demo-request?utm_source=x");
  assert.equal(new URL(form.headers.get("x-middleware-rewrite")!).pathname, "/f/acme/demo-request");
  assert.equal(new URL(form.headers.get("x-middleware-rewrite")!).search, "?utm_source=x");
  assert.equal(new URL((await at("https://acme.tryclaritia.com/book/demo")).headers.get("x-middleware-rewrite")!).pathname, "/book/acme/demo");
  assert.equal((await at("https://acme.tryclaritia.com/settings/team")).status, 404, "never the app");
  const app = await at("https://app.tryclaritia.com/settings");
  assert.equal(app.headers.get("x-middleware-rewrite"), null, "the app's host as before");
});
