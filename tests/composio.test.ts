// Composio holds the sign-in (src/lib/sources/composio.ts, docs/sources-setup.md "Composio"): each call a connector
// makes goes through Composio's proxy execute for the row's connected account, and Composio signs it. The fetch
// layer's request shape (endpoint, method, JSON or bytes, headers as parameters, never an Authorization), Composio's
// answer turned back into the tool's, Composio's refusals mapped onto the old retries and "Sign in again", the old
// path untouched for rows connected before, connecting (auth config, connect page, ACTIVE check, extras), and the
// flaky cases on the send pipeline: a form fill to HubSpot through a proxy that times out after HubSpot took the
// request, then rate limits, then answers 502, lands exactly one contact, with the retries recorded.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
process.env.COMPOSIO_API_KEY = "ck_test_key";
process.env.COMPOSIO_BASE_URL = "https://composio.test";
import assert from "node:assert/strict";
import { test } from "node:test";
import { NEW_RULES } from "../src/lib/delivery/rules.ts";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { asToolAnswer, COMPOSIO_TOOLS, composioExtras, composioFetch, failureOf, proxyRequest, viaComposio } from "../src/lib/sources/composio.ts";
import { activeAccount, authConfigFor, composioCreds, connectLink } from "../src/lib/sources/composioConnect.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import { AuthError, RateLimited, type Creds, type SourceRow } from "../src/lib/sources/types.ts";
import { FakeComposio } from "./sources/fakeComposio.ts";
import { FakeHubspot, rng } from "./sources/fakeHubspot.ts";

const WS = "0190a0b0-0000-7000-8000-0000000000aa";
const SRC = "0190a0b0-0000-7000-8000-00000000000c";
const source = (kind: string, account: string | null = "a"): SourceRow => ({ id: SRC, workspace_id: WS, kind, name: kind, account, status: "active", settings: {}, cursors: {}, push_cursor: null });
const composio = (toolkit: string, extra: Record<string, string> = {}, account = "ca_1"): Creds => ({ type: "composio", account, user: WS, toolkit, extra });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
/** A tool's own fake: answers `answer` and records what arrived (as Composio forwarded it). */
function tool(answer: (u: URL, init: RequestInit) => Response = () => json({ ok: true })) {
  const got: { url: URL; method: string; headers: Headers; body: string | null }[] = [];
  const fetcher = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    got.push({ url, method: init.method ?? "GET", headers: new Headers(init.headers), body: init.body == null ? null : Buffer.from(init.body as Uint8Array | string).toString() });
    return answer(url, init);
  }) as typeof fetch;
  return { got, fetcher };
}
const noSleep = async () => {};

// The request Composio gets ----------------------------------------------------------------------------------------

test("proxy request: the full address with its query, the method, JSON as an object, headers as parameters, and never an Authorization", async () => {
  const b = await proxyRequest("ca_9", WS, "https://api.hubapi.com/crm/v3/objects/contacts/search?archived=false&q=a%20b", {
    method: "post",
    headers: { authorization: "Bearer stale", "content-type": "application/json", revision: "2024-10-15", "user-agent": "x", "x-empty": "" },
    body: JSON.stringify({ filterGroups: [], limit: 100 }),
  });
  assert.equal(b.endpoint, "https://api.hubapi.com/crm/v3/objects/contacts/search?archived=false&q=a%20b", "the address goes as it is, query included");
  assert.equal(b.method, "POST");
  assert.equal(b.connected_account_id, "ca_9");
  assert.equal(b.user_id, WS, "the workspace is the Composio user");
  assert.deepEqual(b.body, { filterGroups: [], limit: 100 });
  assert.equal(b.binary_body, undefined);
  assert.deepEqual(b.parameters, [{ name: "revision", value: "2024-10-15", type: "header" }], "no authorization, no content-type (Composio sets it), no transport headers, no empty ones");
});

test("proxy request: a GET has no body; a form post, file bytes and a multipart upload go as bytes with their content type", async () => {
  const get = await proxyRequest("ca_1", undefined, "https://x.test/a", {});
  assert.equal(get.method, "GET");
  assert.ok(!("body" in get) && !("binary_body" in get) && !("user_id" in get));
  const form = await proxyRequest("ca_1", WS, "https://api.twilio.com/x", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "To=%2B1&Body=Hi" });
  assert.deepEqual(form.binary_body, { base64: Buffer.from("To=%2B1&Body=Hi").toString("base64"), content_type: "application/x-www-form-urlencoded" });
  assert.equal(form.parameters, undefined, "the content type rides with the bytes, not as a header too");
  const bytes = await proxyRequest("ca_1", WS, "https://graph.microsoft.com/v1.0/me/drive/root:/a.pdf:/content", { method: "PUT", headers: { "content-type": "application/pdf" }, body: Buffer.from([1, 2, 3]) });
  assert.deepEqual(bytes.binary_body, { base64: "AQID", content_type: "application/pdf" });
  const fd = new FormData();
  fd.append("attributes", JSON.stringify({ name: "a.txt" }));
  fd.append("file", new Blob([Buffer.from("hello")], { type: "text/plain" }), "a.txt");
  const multi = await proxyRequest("ca_1", WS, "https://upload.box.com/api/2.0/files/content", { method: "POST", body: fd });
  assert.match(multi.binary_body!.content_type!, /^multipart\/form-data; boundary=/);
  const text = Buffer.from(multi.binary_body!.base64, "base64").toString();
  assert.ok(text.includes('name="attributes"') && text.includes("hello"), "the whole multipart body, boundary and all");
  const notJson = await proxyRequest("ca_1", WS, "https://x.test/a", { method: "POST", body: "plain words" });
  assert.equal(notJson.binary_body?.base64, Buffer.from("plain words").toString("base64"), "text that isn't JSON goes as it is");
});

// Through a connector's context -----------------------------------------------------------------------------------

test("ctx: a Composio row's calls go to proxy execute with the server key; the tool sees Composio's sign-in and the same body", async () => {
  const cz = new FakeComposio();
  const t = tool(() => json({ results: [{ id: "1" }] }));
  cz.add({ id: "ca_1", toolkit: "hubspot", user: WS, token: "hs-token", tool: t.fetcher });
  const ctx = makeCtx({ source: source("hubspot"), creds: composio("hubspot"), fetcher: cz.fetch, sleep: noSleep });
  const d = await ctx.api<{ results: { id: string }[] }>("https://api.hubapi.com/crm/v3/objects/contacts/search", { method: "POST", body: JSON.stringify({ limit: 1 }) });
  assert.deepEqual(d, { results: [{ id: "1" }] });
  assert.deepEqual(cz.log, ["POST /api/v3.1/tools/execute/proxy"]);
  assert.equal(cz.proxied[0]!.headers.get("x-api-key"), "ck_test_key");
  assert.equal(cz.proxied[0]!.headers.get("authorization"), null, "Claritia never sends a token of its own");
  assert.ok(!cz.proxied[0]!.body.parameters?.some((p) => p.name === "authorization"));
  assert.equal(t.got[0]!.headers.get("authorization"), "Bearer hs-token", "Composio signed it");
  assert.equal(t.got[0]!.body, JSON.stringify({ limit: 1 }));
  assert.equal(await ctx.token(), "", "no token is kept here");
});

test("ctx: the tool's own answer comes back as it was: status, headers, a 404 the connector can tell, a 204, a file", async () => {
  const cz = new FakeComposio();
  const t = tool((u) =>
    u.pathname === "/gone"
      ? json({ message: "Object not found" }, 404)
      : u.pathname === "/empty"
        ? new Response(null, { status: 204 })
        : u.pathname === "/file"
          ? new Response(Buffer.from("%PDF-1"), { status: 200, headers: { "content-type": "application/pdf" } })
          : json({ ok: 1 }, 200, { "x-hubspot-ratelimit-remaining": "9" }),
  );
  cz.add({ id: "ca_1", toolkit: "hubspot", user: WS, token: "k", tool: t.fetcher });
  const ctx = makeCtx({ source: source("hubspot"), creds: composio("hubspot"), fetcher: cz.fetch, sleep: noSleep });
  const gone = await ctx.api("https://api.hubapi.com/gone").catch((e: Error & { status?: number }) => e);
  assert.ok(gone instanceof Error && gone.status === 404 && gone.message === "Object not found", "the 404 and its words, as the old path gives them");
  assert.equal(await ctx.api("https://api.hubapi.com/empty", { method: "DELETE" }), null);
  const res = await ctx.raw!("https://api.hubapi.com/ok");
  assert.equal(res.headers.get("x-hubspot-ratelimit-remaining"), "9");
  const file = await ctx.raw!("https://api.hubapi.com/file");
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), "%PDF-1", "a file comes from Composio's short-lived address");
});

test("ctx: a call without the sign-in (a pre-signed upload address, a webhook) goes straight there, not through Composio", async () => {
  const cz = new FakeComposio();
  const direct = tool(() => json({ nextExpectedRanges: ["10-"] }));
  const net = (async (input: string | URL, init?: RequestInit) => (String(input).startsWith("https://composio.test") ? cz.fetch(input, init) : direct.fetcher(input, init))) as typeof fetch;
  const ctx = makeCtx({ source: source("onedrive"), creds: composio("one_drive"), fetcher: net, sleep: noSleep });
  await ctx.raw!("https://my.microsoftpersonalcontent.com/upload/abc?sig=1", { method: "PUT", auth: false, body: Buffer.from("0123456789") });
  assert.equal(cz.log.length, 0);
  assert.equal(direct.got[0]!.url.host, "my.microsoftpersonalcontent.com");
  assert.equal(direct.got[0]!.headers.get("authorization"), null);
});

test("old path: a row signed in with Claritia's own app or a pasted key never reaches Composio, even with the key set", async () => {
  const cz = new FakeComposio();
  const t = tool(() => json({ ok: 1 }));
  const net = (async (input: string | URL, init?: RequestInit) => (String(input).startsWith("https://composio.test") ? cz.fetch(input, init) : t.fetcher(input, init))) as typeof fetch;
  const oauth = makeCtx({ source: source("hubspot"), creds: { type: "oauth", access: "old-token", refresh: "r", expiresAt: Date.now() + 3_600_000 }, fetcher: net, sleep: noSleep });
  await oauth.api("https://api.hubapi.com/account-info/v3/details");
  assert.equal(t.got[0]!.headers.get("authorization"), "Bearer old-token");
  const key = makeCtx({ source: source("close"), creds: { type: "key", values: { api_key: "close-key" } }, fetcher: net, sleep: noSleep });
  await connectorFor("close")!.account(key);
  assert.equal(t.got[1]!.headers.get("authorization"), `Basic ${Buffer.from("close-key:").toString("base64")}`);
  assert.equal(cz.log.length, 0);
});

test("no key on the server: the Composio path is off (Connect uses the old way) and a Composio row's call is tried again later", async () => {
  const saved = process.env.COMPOSIO_API_KEY;
  delete process.env.COMPOSIO_API_KEY;
  try {
    assert.equal(viaComposio("hubspot"), false);
    const sleeps: number[] = [];
    const ctx = makeCtx({ source: source("hubspot"), creds: composio("hubspot"), fetcher: (async () => assert.fail("nothing goes out")) as typeof fetch, sleep: async (ms) => void sleeps.push(ms) });
    await assert.rejects(ctx.api("https://api.hubapi.com/x"), /trying again later/);
    assert.deepEqual(sleeps, [1000, 5000, 30000], "the old backoff, and never Sign in again");
  } finally {
    process.env.COMPOSIO_API_KEY = saved;
  }
});

// Composio's refusals ---------------------------------------------------------------------------------------------

test("errors: an expired or removed connection asks to sign in again; Composio's rate limit and outages go through the old retries", async () => {
  const cz = new FakeComposio();
  const t = tool(() => json({ ok: 1 }));
  cz.add({ id: "ca_1", toolkit: "hubspot", user: WS, token: "k", tool: t.fetcher });
  cz.add({ id: "ca_old", toolkit: "hubspot", user: WS, token: "k", status: "EXPIRED", tool: t.fetcher });
  const sleeps: number[] = [];
  const mk = (account: string) => makeCtx({ source: source("hubspot"), creds: composio("hubspot", {}, account), fetcher: cz.fetch, sleep: async (ms) => void sleeps.push(ms) });
  await assert.rejects(mk("ca_old").api("https://api.hubapi.com/x"), (e: Error) => e instanceof AuthError && /^Sign in again: Connected account is EXPIRED/.test(e.message));
  await assert.rejects(mk("ca_missing").api("https://api.hubapi.com/x"), (e: Error) => e instanceof AuthError, "a removed account: sign in again");
  // Composio's own 429 with a long wait goes up as RateLimited with that wait, so the job comes back then.
  cz.faults.push({ status: 429, retryAfter: "120", message: "Rate limit exceeded" });
  await assert.rejects(mk("ca_1").api("https://api.hubapi.com/x"), (e: Error) => e instanceof RateLimited && e.retryAfterS === 120);
  // A short one, a 502 and a timeout are slept on and tried again, as the tool's own would be.
  sleeps.length = 0;
  cz.faults.push({ status: 429, retryAfter: "2" }, { status: 502 }, "timeout-before");
  assert.deepEqual(await mk("ca_1").api("https://api.hubapi.com/x"), { ok: 1 });
  assert.deepEqual(sleeps, [2000, 5000, 30000], "Composio's own wait, then the old backoff");
  // The server's key is wrong: never the team's to fix, so tried again later rather than "Sign in again".
  const badKey = makeCtx({ source: source("hubspot"), creds: composio("hubspot"), fetcher: (async (i: string | URL, init?: RequestInit) => cz.fetch(i, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), "x-api-key": "wrong" } })) as typeof fetch, sleep: noSleep });
  await assert.rejects(badKey.api("https://api.hubapi.com/x"), (e: Error) => !(e instanceof AuthError) && /trying again later/.test(e.message));
});

test("errors: each Composio status as the answer a tool would give", async () => {
  const st = async (status: number, message = "m", slug = "") => {
    const r = asToolAnswer({ status, message, slug }, "7");
    return { status: r.status, body: (await r.json()) as { message: string }, after: r.headers.get("retry-after") };
  };
  assert.equal((await st(401)).status, 503);
  assert.deepEqual(await st(429), { status: 429, body: { message: "Composio's rate limit was hit; trying again later." }, after: "7" });
  assert.equal((await st(500)).status, 500);
  assert.equal((await st(503)).status, 503);
  for (const s of [403, 404, 410, 422]) assert.equal((await st(s)).status, 401, `${s}: sign in again`);
  assert.equal((await st(400, "Connection revoked by user")).status, 401, "a 400 that says the connection is gone");
  assert.equal((await st(400, "endpoint is required")).status, 400, "a request Composio can't run is a refusal");
  assert.equal((await st(501, "Not supported for this auth scheme")).status, 400, "501 won't change by trying again");
  assert.equal((await st(408)).status, 504);
  // Composio's real answer to a wrong key (POST /api/v3.1/tools/execute/proxy, seen 2026-11-16).
  const real = { error: { message: "Invalid API key: not**-key", code: 801, slug: "APIKey_InvalidAPIKey", status: 401, request_id: "7543da5c-6427-41fb-8f07-5dea799d8c5b", suggested_fix: "Please check you are using a valid API key." } };
  assert.deepEqual(failureOf(401, real), { status: 401, message: "Invalid API key: not**-key", slug: "APIKey_InvalidAPIKey" });
  assert.equal(asToolAnswer(failureOf(401, real), null).status, 503);
});

// Connectors on Composio send no secrets of their own -----------------------------------------------------------------

test("connectors: on Composio, Close, Pipedrive, Klaviyo, Trello, Freshdesk and monday leave their keys out and keep their other headers", async () => {
  const cz = new FakeComposio();
  const t = tool((u) =>
    u.host === "api.close.com"
      ? json({ organizations: [{ id: "orga_1", name: "Acme" }] })
      : u.host.endsWith("pipedrive.com")
        ? json({ data: { company_id: 5, company_name: "Acme" } })
        : u.host === "a.klaviyo.com"
          ? json({ data: [{ id: "K1", attributes: { contact_information: { organization_name: "Acme" } } }] })
          : u.host === "api.trello.com"
            ? json({ id: "m1", fullName: "Ana", username: "ana" })
            : u.host.endsWith("freshdesk.com")
              ? json([{ id: 1, name: "Support" }])
              : json({ data: { me: { account: { slug: "acme", name: "Acme" } } } }),
  );
  for (const [id, kit] of [["ca_close", "close"], ["ca_pd", "pipedrive"], ["ca_kv", "klaviyo"], ["ca_tr", "trello"], ["ca_fd", "freshdesk"], ["ca_mo", "monday"]]) cz.add({ id: id!, toolkit: kit!, user: WS, token: "z", tool: t.fetcher });
  const ctx = (kind: string, account: string, extra: Record<string, string> = {}) => makeCtx({ source: source(kind), creds: composio(COMPOSIO_TOOLS[kind]!.toolkit, extra, account), fetcher: cz.fetch, sleep: noSleep });
  assert.equal((await connectorFor("close")!.account(ctx("close", "ca_close"))).label, "Acme");
  await connectorFor("pipedrive")!.account(ctx("pipedrive", "ca_pd", { api_domain: "https://acme.pipedrive.com" }));
  await connectorFor("klaviyo")!.account(ctx("klaviyo", "ca_kv"));
  await connectorFor("trello")!.account(ctx("trello", "ca_tr"));
  await connectorFor("freshdesk")!.account(ctx("freshdesk", "ca_fd", { domain: "acme.freshdesk.com" }));
  await connectorFor("monday_work")!.account(ctx("monday_work", "ca_mo"));
  const sent = cz.proxied.map((p) => p.body);
  for (const b of sent) assert.ok(!b.parameters?.some((p) => /authorization|api-key|api-token|x-pw-accesstoken/i.test(p.name)), `${b.endpoint}: no key header`);
  const pd = sent.find((b) => b.endpoint.includes("pipedrive"))!;
  assert.ok(pd.endpoint.startsWith("https://acme.pipedrive.com/api/v1/") && !pd.endpoint.includes("api_token"), "Pipedrive: the company address, no token in the query");
  const tr = sent.find((b) => b.endpoint.includes("trello"))!;
  assert.equal(tr.endpoint, "https://api.trello.com/1/members/me?fields=id%2CfullName%2Cusername", "Trello: no key or token in the query");
  assert.ok(sent.find((b) => b.endpoint.includes("klaviyo"))!.parameters!.some((p) => p.name === "revision" && p.value === "2024-10-15"), "Klaviyo keeps its revision header");
  assert.ok(sent.find((b) => b.endpoint.includes("monday"))!.parameters!.some((p) => p.name === "api-version"), "monday keeps API-Version");
  assert.ok(sent.find((b) => b.endpoint.includes("freshdesk"))!.endpoint.startsWith("https://acme.freshdesk.com/api/v2/"));
  for (const g of t.got) assert.equal(g.headers.get("authorization"), "Bearer z", `${g.url.host}: only Composio's sign-in arrives`);
});

test("connectors: Mailchimp on Composio uses the data center found at connect, and asks to reconnect without one", async () => {
  const cz = new FakeComposio();
  const t = tool(() => json({ account_id: "mc1", account_name: "Acme" }));
  cz.add({ id: "ca_mc", toolkit: "mailchimp", user: WS, token: "z", tool: t.fetcher });
  const mk = (extra: Record<string, string>) => makeCtx({ source: source("mailchimp"), creds: composio("mailchimp", extra, "ca_mc"), fetcher: cz.fetch, sleep: noSleep });
  assert.equal((await connectorFor("mailchimp")!.account(mk({ api_endpoint: "https://us21.api.mailchimp.com" }))).label, "Acme");
  assert.equal(t.got[0]!.url.toString(), "https://us21.api.mailchimp.com/3.0/");
  await assert.rejects(connectorFor("mailchimp")!.account(mk({})), /Reconnect Mailchimp/);
});

test("connectors: Dynamics 365 on Composio calls the environment picked on Composio's page, with no token exchange of its own", async () => {
  const cz = new FakeComposio();
  const t = tool((u) => (u.pathname.endsWith("/WhoAmI") ? json({ UserId: "u1" }) : u.pathname.endsWith("/leads") && !u.search ? json({ leadid: "0000-lead" }) : json({ value: [] })));
  cz.add({ id: "ca_dy", toolkit: "dynamics365", user: WS, token: "z", tool: t.fetcher });
  const ctx = makeCtx({ source: source("dynamics", "https://acme.crm4.dynamics.com"), creds: composio("dynamics365", { org_url: "https://acme.crm4.dynamics.com" }, "ca_dy"), fetcher: cz.fetch, sleep: noSleep });
  assert.deepEqual(await connectorFor("dynamics")!.account(ctx), { id: "https://acme.crm4.dynamics.com", label: "acme.crm4.dynamics.com" });
  await connectorFor("dynamics")!.push!(ctx, [{ localId: "c1", externalId: null, values: { emailaddress1: "ana@acme.com", lastname: "Diaz" } }]);
  assert.ok(t.got.every((g) => g.url.host === "acme.crm4.dynamics.com"), "no call to Microsoft's token or discovery service");
  assert.ok(cz.proxied.every((p) => p.body.parameters?.some((x) => x.name === "odata-version")));
});

// Who uses Composio --------------------------------------------------------------------------------------------------

test("which tools: managed sign-ins and key tools connect on Composio with the key; DocuSign waits for its own app; Kit, Discord, Twilio and the kept ones never", () => {
  const e = { COMPOSIO_API_KEY: "k" } as NodeJS.ProcessEnv;
  for (const k of ["hubspot", "salesforce", "pipedrive", "close", "gohighlevel", "klaviyo", "google_sheets", "teams", "trello", "freshdesk", "pandadoc", "box", "webex"]) assert.ok(viaComposio(k, e), k);
  assert.equal(viaComposio("docusign", e), false, "OAuth with no managed app on Composio");
  assert.equal(viaComposio("docusign", { ...e, COMPOSIO_AUTH_CONFIG_DOCUSIGN: "ac_ds" }), true);
  for (const k of ["kit", "discord", "twilio", "stripe", "paypal", "square", "segment", "meta_ads", "google_ads", "bigquery", "google_forms", "omniscient", "keap", "smartsuite", "s3", "whereby", "postgres"]) assert.equal(viaComposio(k, e), false, k);
  assert.equal(viaComposio("hubspot", {} as NodeJS.ProcessEnv), false);
});

// Connecting ---------------------------------------------------------------------------------------------------------

test("connect: the auth config set by hand wins; else the project's managed one; else a new one (managed, or a key config that holds nothing)", async () => {
  const cz = new FakeComposio();
  const o = { fetcher: cz.fetch, env: { ...process.env, COMPOSIO_AUTH_CONFIG_SALESFORCE: "ac_white" } };
  assert.equal(await authConfigFor(COMPOSIO_TOOLS.salesforce!, o), "ac_white", "the white-labeled Salesforce app");
  assert.equal(cz.log.length, 0);
  cz.configs.push({ id: "ac_custom", toolkit: { slug: "hubspot" }, auth_scheme: "OAUTH2", is_composio_managed: false, status: "ENABLED" }, { id: "ac_managed", toolkit: { slug: "hubspot" }, auth_scheme: "OAUTH2", is_composio_managed: true, status: "ENABLED" });
  assert.equal(await authConfigFor(COMPOSIO_TOOLS.hubspot!, o), "ac_managed");
  assert.equal(await authConfigFor(COMPOSIO_TOOLS.attio!, o), "ac_new1");
  assert.deepEqual(cz.made[0], { toolkit: { slug: "attio" }, auth_config: { type: "use_composio_managed_auth" } });
  assert.equal(await authConfigFor(COMPOSIO_TOOLS.close!, o), "ac_new2");
  assert.deepEqual(cz.made[1], { toolkit: { slug: "close" }, auth_config: { type: "use_custom_auth", authScheme: "API_KEY", credentials: {} } });
  await assert.rejects(authConfigFor(COMPOSIO_TOOLS.docusign!, o), /COMPOSIO_AUTH_CONFIG_DOCUSIGN/);
  const before = cz.log.length;
  assert.equal(await authConfigFor(COMPOSIO_TOOLS.attio!, o), "ac_new1", "kept once found");
  assert.equal(cz.log.length, before);
});

test("connect: the connect page is for the workspace, and comes back to Claritia", async () => {
  const cz = new FakeComposio();
  cz.configs.push({ id: "ac_ic", toolkit: { slug: "intercom" }, auth_scheme: "OAUTH2", is_composio_managed: true, status: "ENABLED" });
  const l = await connectLink("intercom", WS, "https://app.test/api/sources/composio?state=s", { fetcher: cz.fetch });
  assert.match(l.url, /^https:\/\/connect\.composio\.test\//);
  assert.deepEqual(cz.links[0], { auth_config_id: "ac_ic", user_id: WS, callback_url: "https://app.test/api/sources/composio?state=s" });
  await assert.rejects(connectLink("twilio", WS, "x", { fetcher: cz.fetch }), /doesn't connect through Composio/);
});

test("connect: only this workspace's ACTIVE account for this tool is saved; one still finishing is asked again; a failed one is refused", async () => {
  const cz = new FakeComposio();
  cz.add({ id: "ca_mine", toolkit: "hubspot", user: WS, token: "t", status: "INITIATED" });
  cz.add({ id: "ca_other", toolkit: "hubspot", user: "another-workspace", token: "t" });
  cz.add({ id: "ca_sheets", toolkit: "googlesheets", user: WS, token: "t" });
  cz.add({ id: "ca_failed", toolkit: "hubspot", user: WS, token: "t", status: "FAILED" });
  const o = { fetcher: cz.fetch, sleep: noSleep };
  assert.equal((await activeAccount("hubspot", WS, "ca_mine", o)).status, "ACTIVE");
  await assert.rejects(activeAccount("hubspot", WS, "ca_other", o), /isn't this workspace's/, "another workspace's account, whatever the query says");
  await assert.rejects(activeAccount("hubspot", WS, "ca_sheets", o), /isn't this workspace's/, "another tool's account");
  await assert.rejects(activeAccount("hubspot", WS, "ca_failed", o), /didn't finish connecting/);
  await assert.rejects(activeAccount("hubspot", WS, "../x", o), /Could not connect/);
});

test("connect: the saved sign-in keeps the account and what the connector reads, never a secret", async () => {
  const cz = new FakeComposio();
  const sf = tool((u) => (u.pathname === "/services/oauth2/userinfo" ? json({ urls: { rest: "https://acme.my.salesforce.com/services/data/v{version}/" } }) : json({})));
  const a = cz.add({ id: "ca_sf", toolkit: "salesforce", user: WS, token: "t", tool: sf.fetcher, val: { subdomain: "login", access_token: "SECRET", refresh_token: "SECRET2" } });
  const creds = await composioCreds("salesforce", WS, { id: a.id, status: "ACTIVE", state: { val: a.val } }, { fetcher: cz.fetch });
  assert.deepEqual(creds, { type: "composio", account: "ca_sf", user: WS, toolkit: "salesforce", extra: { instance_url: "https://acme.my.salesforce.com" } });
  assert.ok(!JSON.stringify(creds).includes("SECRET"));
});

test("connect: extras from the connection's own fields", async () => {
  const none = async <T,>(): Promise<T> => assert.fail("no call");
  assert.deepEqual(await composioExtras("zoho", { region: "EU" }, none), { api_domain: "https://www.zohoapis.eu" });
  assert.deepEqual(await composioExtras("zoho", {}, none), { api_domain: "https://www.zohoapis.com" });
  assert.deepEqual(await composioExtras("dynamics", { subdomain: "acme", region: "crm4" }, none), { org_url: "https://acme.crm4.dynamics.com" });
  await assert.rejects(composioExtras("dynamics", {}, none), /which environment/);
  assert.deepEqual(await composioExtras("freshdesk", { subdomain: "acme" }, none), { domain: "acme.freshdesk.com" });
  assert.deepEqual(await composioExtras("freshsales", { subdomain: "acme" }, none), { domain: "acme.myfreshworks.com" });
  assert.deepEqual(await composioExtras("zendesk", { subdomain: "https://acme.zendesk.com" }, none), { subdomain: "acme" });
  assert.deepEqual(await composioExtras("gohighlevel", { generic_id: "loc1" }, none), { locationId: "loc1" });
  assert.deepEqual(await composioExtras("copper", { generic_id: "ana@acme.com" }, none), { email: "ana@acme.com" });
  assert.deepEqual(await composioExtras("activecampaign", { full: "https://acme.api-us1.com/" }, none), { url: "https://acme.api-us1.com" });
  assert.deepEqual(await composioExtras("pipedrive", { subdomain: "acme" }, none), { api_domain: "https://acme.pipedrive.com" });
  assert.deepEqual(await composioExtras("mailchimp", { dc: "us21" }, none), { api_endpoint: "https://us21.api.mailchimp.com" });
  assert.deepEqual(await composioExtras("mailchimp", {}, async <T,>() => ({ api_endpoint: "https://us6.api.mailchimp.com" }) as T), { api_endpoint: "https://us6.api.mailchimp.com" });
  assert.deepEqual(await composioExtras("hubspot", { subdomain: "x" }, none), {});
});

// The send pipeline: a form fill to HubSpot through a flaky proxy ---------------------------------------------------------

const contact = { id: "0190a0b0-0000-7000-8000-0000000000c3", email: "ana@acme.com", first_name: "Ana", last_name: "Diaz", title: null, phone: null, country: null, company: "Acme", company_domain: "acme.com" };
function hubspotDelivery(cz: FakeComposio, creds: Creds, sleeps: number[]) {
  const stored: unknown[] = [];
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "source_links_put") stored.push(...((args?.p_rows as unknown[]) ?? []));
    if (fn === "source_load") return { data: { source: { ...source("hubspot", "123"), name: "HubSpot" }, sealed: seal(JSON.stringify(creds)), hook_sealed: null, mappings: [] }, error: null };
    if (fn === "push_candidates")
      return { data: [{ ...contact, email_clean: contact.email, updated_at: new Date().toISOString(), region: null, timezone: null, lifecycle: "lead", lead_status: null, fields: {}, company_name: "Acme", score: null, score_band: null, owner_crm: null, sources: {}, external_id: null, last: null, suppressed: false }], error: null };
    return { data: null, error: null };
  };
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email", required: true }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null, allow_duplicate: false },
    destination: { id: "x", kind: "source", source_id: SRC, name: "HubSpot", config: { rules: NEW_RULES }, mode: "upsert" },
    sealed: null,
    submission: { id: "s1", created_at: new Date().toISOString(), values: { email: contact.email }, hidden: {}, consent: { given: true }, test: false, form_version: 1, contact_id: contact.id },
    form: { id: "f1", name: "Demo", body: form.form },
    contact,
  };
  return { run: () => sendDelivery(t, { run: { rpc: rpc as never, clean: async () => ({ custom: [] }), sleep: async (ms) => void sleeps.push(ms), fetcher: cz.fetch } }), stored };
}
const UPSERT = /\/crm\/v3\/objects\/contacts\/batch\/upsert$/;

test("reliability: a fill to HubSpot through Composio survives a timeout after HubSpot took it, a 429 and a 502: one contact, the retries recorded", async () => {
  const hub = new FakeHubspot(rng(7));
  const cz = new FakeComposio();
  cz.add({ id: "ca_hs", toolkit: "hubspot", user: WS, token: hub.token, tool: hub.fetch });
  cz.faultOn = UPSERT;
  cz.faults.push("timeout-after", { status: 429, message: "Rate limit exceeded" }, { status: 502, message: "Bad gateway" });
  const sleeps: number[] = [];
  const d = hubspotDelivery(cz, composio("hubspot", {}, "ca_hs"), sleeps);
  const r = await d.run();
  assert.equal(r.status, "done", JSON.stringify(r));
  assert.equal(hub.live().length, 1, "exactly one contact");
  assert.equal(hub.live()[0]!.properties.email, "ana@acme.com");
  assert.equal(r.status === "done" && r.externalId, hub.live()[0]!.id, "the delivery points at that contact");
  assert.equal(hub.writes, 2, "the first upsert landed before its answer was lost; the retry upserted the same contact");
  assert.equal(cz.proxied.filter((p) => UPSERT.test(p.body.endpoint)).length, 4, "one try and three retries");
  assert.deepEqual(sleeps, [1000, 5000, 30000], "the retries, with the old backoff");
  assert.equal(d.stored.length, 1, "one link saved");
});

test("reliability: a proxy that stays down: the delivery is tried again later (not failed), and the next try still makes one contact", async () => {
  const hub = new FakeHubspot(rng(8));
  const cz = new FakeComposio();
  cz.add({ id: "ca_hs", toolkit: "hubspot", user: WS, token: hub.token, tool: hub.fetch });
  cz.faultOn = UPSERT;
  cz.faults.push("timeout-after", "timeout-after", "timeout-after", "timeout-after");
  const first = await hubspotDelivery(cz, composio("hubspot", {}, "ca_hs"), []).run();
  assert.equal(first.status, "retry", JSON.stringify(first));
  assert.match(first.status === "retry" ? first.error : "", /timeout/i, "the retry is recorded with why");
  assert.equal(hub.live().length, 1, "every try landed on the same contact");
  const second = await hubspotDelivery(cz, composio("hubspot", {}, "ca_hs"), []).run();
  assert.equal(second.status, "done");
  assert.equal(hub.live().length, 1, "still one contact");
  // Composio's own long rate limit: tried again then, with its wait.
  cz.faults.push({ status: 429, retryAfter: "90" });
  const limited = await hubspotDelivery(cz, composio("hubspot", {}, "ca_hs"), []).run();
  assert.equal(limited.status, "retry");
  assert.equal(limited.status === "retry" && limited.retryAfterS, 90);
  assert.equal(hub.live().length, 1);
});

test("reliability: a revoked connection fails the delivery with Sign in again, and nothing is written", async () => {
  const hub = new FakeHubspot(rng(9));
  const cz = new FakeComposio();
  cz.add({ id: "ca_hs", toolkit: "hubspot", user: WS, token: hub.token, tool: hub.fetch, status: "REVOKED" });
  const r = await hubspotDelivery(cz, composio("hubspot", {}, "ca_hs"), []).run();
  assert.equal(r.status, "failed", JSON.stringify(r));
  assert.match(r.status === "failed" ? r.error : "", /Sign in/);
  assert.equal(hub.writes, 0);
});

test("composioFetch: a call that runs out of time is dropped like fetch's own (the caller tries again)", async () => {
  const cz = new FakeComposio();
  cz.add({ id: "ca_1", toolkit: "hubspot", user: WS, token: "k", tool: tool().fetcher });
  cz.faults.push("timeout-before");
  const f = composioFetch({ account: "ca_1", user: WS, fetcher: cz.fetch });
  await assert.rejects(f("https://api.hubapi.com/x"), (e: Error) => e.name === "TimeoutError");
  assert.equal((await f("https://api.hubapi.com/x")).status, 200);
});
