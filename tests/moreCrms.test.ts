// More CRMs (docs/integrations-plan.md, Next step 4; src/lib/sources/moreCrms.ts): each finds the person by email
// before it makes one, so the same person twice is one record; a record deleted on their side comes back gone; each
// links back to the record. The flaky cases the reliability rule asks for: a Zoho token that expires mid-run
// refreshes (with Zoho's own header word, at the person's own data center) and goes on, a 503 is tried again, and
// one bad row never stops the rest.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { copperCrm, dynamics, freshsales, goHighLevel, keap, mondayCrm, MORE_CRMS, personOf, zohoCrm } from "../src/lib/sources/moreCrms.ts";
import { OAUTH, serverOf } from "../src/lib/sources/oauth.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, PushChange, SourceRow } from "../src/lib/sources/types.ts";

type Call = { url: string; method: string; body: string; headers: Headers };
type Answer = Response | ((c: Call) => Response);

/** The tool in memory: each call is matched to the first answer whose pattern fits "METHOD url". */
function tool(routes: [RegExp, Answer | Answer[]][]) {
  const calls: Call[] = [];
  const queues = routes.map(([re, a]) => [re, Array.isArray(a) ? [...a] : a] as const);
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? "GET", body: String(init.body ?? ""), headers: new Headers(init.headers) };
    calls.push(c);
    const hit = queues.find(([re]) => re.test(`${c.method} ${url}`));
    if (!hit) return new Response(JSON.stringify({ message: `no route for ${c.method} ${url}` }), { status: 500 });
    const a = Array.isArray(hit[1]) ? (hit[1].length > 1 ? hit[1].shift()! : hit[1][0]!) : hit[1];
    return typeof a === "function" ? a(c) : a.clone();
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200) => new Response(j === null ? null : JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
const src = (kind: string, account: string | null = null): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account, status: "active", settings: {}, cursors: {}, push_cursor: null });
const ctxOf = (kind: string, creds: Creds, fetcher: typeof fetch, account: string | null = null, refresh?: () => Promise<{ access: string; refresh: string | null; expiresAt: number }>) =>
  makeCtx({ source: src(kind, account), creds, fetcher, sleep: async () => {}, refresh });
const oauth = (extra: Record<string, string> = {}): Creds => ({ type: "oauth", access: "tok1", refresh: "r1", expiresAt: Date.now() + 3600_000, extra });
const ada: PushChange = { localId: "c1", externalId: null, values: { email: "ada@acme.com", first_name: "Ada", last_name: "Park", phone: "+14155550132", title: "VP Sales", company: "Acme" } };

test("seven CRMs: registered, in Settings › Integrations, taking form leads with a link back", () => {
  assert.deepEqual(MORE_CRMS.map((c) => c.kind), ["zoho", "dynamics", "gohighlevel", "freshsales", "copper", "keap", "monday"]);
  for (const c of MORE_CRMS) {
    assert.equal(connectorFor(c.kind), c);
    const e = CATALOG.find((x) => x.kind === c.kind);
    assert.ok(e?.pushes && e.group === "crm", c.kind);
    assert.ok(e.oauth ? OAUTH[c.kind] : e.keys?.length, `${c.kind} connects`);
  }
  assert.deepEqual(personOf({ email: " a@b.co ", first_name: "", last_name: "Lee" }), { email: "a@b.co", first: undefined, last: "Lee", name: "Lee", phone: undefined, title: undefined, company: undefined });
});

test("Zoho: the same person twice is one lead; a deleted lead comes back gone; its own data center and link", async () => {
  const t = tool([
    [/GET .*\/Leads\/search/, [json(null, 204), json({ data: [{ id: "4150868000000123" }] })]],
    [/POST .*\/crm\/v6\/Leads$/, json({ data: [{ code: "SUCCESS", details: { id: "4150868000000123" } }] })],
    [/PUT .*\/Leads\/4150868000000123/, json({ data: [{ code: "SUCCESS", details: { id: "4150868000000123" } }] })],
    [/PUT .*\/Leads\/999/, json({ data: [{ code: "INVALID_DATA", details: { api_name: "id" }, message: "the id given seems to be invalid" }] })],
  ]);
  const ctx = ctxOf("zoho", oauth({ api_domain: "https://www.zohoapis.eu" }), t.fetcher, "20071234");
  assert.deepEqual(await zohoCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "4150868000000123" }]);
  assert.deepEqual(await zohoCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "4150868000000123" }]);
  assert.equal(t.calls.filter((c) => c.method === "POST").length, 1, "made once");
  assert.ok(t.calls.every((c) => c.url.startsWith("https://www.zohoapis.eu/crm/v6/")));
  assert.equal(t.calls[0]!.headers.get("authorization"), "Zoho-oauthtoken tok1");
  const made = JSON.parse(t.calls.find((c) => c.method === "POST")!.body).data[0];
  assert.deepEqual([made.First_Name, made.Last_Name, made.Email, made.Company, made.Designation, made.Lead_Source], ["Ada", "Park", "ada@acme.com", "Acme", "VP Sales", "Claritia"]);
  assert.deepEqual(await zohoCrm.push!(ctx, [{ ...ada, externalId: "999" }]), [{ localId: "c1", gone: true }]);
  assert.equal(zohoCrm.link!(src("zoho", "20071234"), "4150868000000123", (k) => (k === "api_domain" ? "https://www.zohoapis.eu" : "")), "https://crm.zoho.eu/crm/org20071234/tab/Leads/4150868000000123");
  assert.equal(serverOf("zoho", "https://accounts.zoho.eu"), "https://accounts.zoho.eu");
  assert.equal(serverOf("zoho", "https://accounts.zoho.eu.evil.io"), undefined);
  assert.equal(serverOf("hubspot", "https://accounts.zoho.eu"), undefined);
});

test("flaky: a Zoho token that expires mid-run refreshes at the person's data center and goes on", async () => {
  process.env.ZOHO_CLIENT_ID = "zid";
  process.env.ZOHO_CLIENT_SECRET = "zsecret";
  const t = tool([
    [/POST https:\/\/accounts\.zoho\.eu\/oauth\/v2\/token/, json({ access_token: "tok2", expires_in: 3600, api_domain: "https://www.zohoapis.eu" })],
    [/GET .*\/Leads\/search/, (c) => (c.headers.get("authorization") === "Zoho-oauthtoken tok2" ? json(null, 204) : json({ code: "INVALID_TOKEN" }, 401))],
    [/POST .*\/crm\/v6\/Leads$/, json({ data: [{ code: "SUCCESS", details: { id: "41" } }] })],
  ]);
  const ctx = makeCtx({ source: src("zoho"), creds: oauth({ api_domain: "https://www.zohoapis.eu", server: "https://accounts.zoho.eu" }), fetcher: t.fetcher, sleep: async () => {} });
  assert.deepEqual(await zohoCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "41" }]);
  const refresh = t.calls.find((c) => c.url.includes("accounts.zoho"))!;
  assert.equal(new URLSearchParams(refresh.body).get("refresh_token"), "r1");
  assert.equal(t.calls.at(-1)!.headers.get("authorization"), "Zoho-oauthtoken tok2", "the new token goes on");
});

test("Dynamics 365: a token for the team's own address, a lead found by email, and its link", async () => {
  process.env.MICROSOFT_CLIENT_ID = "mid";
  process.env.MICROSOFT_CLIENT_SECRET = "msecret";
  const org = "https://acme.crm4.dynamics.com";
  const id = "6c0b8f5a-3a3b-ef11-8409-000d3a1234ab";
  const t = tool([
    [/POST https:\/\/login\.microsoftonline\.com/, json({ access_token: "dv1", expires_in: 3600 })],
    [/GET .*\/leads\?/, [json({ value: [] }), json({ value: [{ leadid: id }] })]],
    [/POST .*\/api\/data\/v9\.2\/leads$/, json({ leadid: id }, 201)],
    [/PATCH .*\/leads\(/, json(null, 204)],
  ]);
  const ctx = ctxOf("dynamics", oauth(), t.fetcher, org);
  assert.deepEqual(await dynamics.push!(ctx, [ada]), [{ localId: "c1", externalId: id }]);
  assert.deepEqual(await dynamics.push!(ctx, [ada]), [{ localId: "c1", externalId: id }]);
  const tok = t.calls.find((c) => c.url.includes("login.microsoftonline"))!;
  assert.equal(new URLSearchParams(tok.body).get("scope"), `${org}/user_impersonation offline_access`);
  assert.equal(t.calls.filter((c) => c.url.includes("login.microsoftonline")).length, 1, "one token for the run");
  assert.ok(decodeURIComponent(t.calls.find((c) => c.url.includes("/leads?"))!.url).includes("emailaddress1 eq 'ada@acme.com'"));
  assert.equal(t.calls.find((c) => c.method === "POST" && c.url.endsWith("/leads"))!.headers.get("authorization"), "Bearer dv1");
  assert.equal(dynamics.link!(src("dynamics", org), id, () => ""), `${org}/main.aspx?etn=lead&pagetype=entityrecord&id=${id}`);
  await assert.rejects(dynamics.push!(ctxOf("dynamics", oauth(), t.fetcher, "https://evil.example.com"), [ada]), /Connect Dynamics 365 again/);
});

test("GoHighLevel, Freshsales and Keap: their own create-or-update by email; a lead with no email updates its record", async () => {
  const g = tool([[/POST .*\/contacts\/upsert/, json({ contact: { id: "ghl1" }, new: false })], [/PUT .*\/contacts\/ghl1/, json({})]]);
  const gctx = ctxOf("gohighlevel", oauth({ locationId: "loc9" }), g.fetcher, "loc9");
  assert.deepEqual(await goHighLevel.push!(gctx, [ada]), [{ localId: "c1", externalId: "ghl1" }]);
  const gb = JSON.parse(g.calls[0]!.body);
  assert.deepEqual([gb.email, gb.locationId, gb.firstName, gb.source], ["ada@acme.com", "loc9", "Ada", "Claritia"]);
  assert.equal(g.calls[0]!.headers.get("version"), "2021-07-28");
  assert.deepEqual(await goHighLevel.push!(gctx, [{ localId: "c2", externalId: "ghl1", values: { first_name: "Ann" } }]), [{ localId: "c2", externalId: "ghl1" }]);
  assert.equal(goHighLevel.link!(src("gohighlevel", "loc9"), "ghl1", () => ""), "https://app.gohighlevel.com/v2/location/loc9/contacts/detail/ghl1");

  const f = tool([[/POST https:\/\/acme\.myfreshworks\.com\/crm\/sales\/api\/contacts\/upsert/, json({ contact: { id: 7001 } })]]);
  const fctx = ctxOf("freshsales", { type: "key", values: { domain: "https://Acme.myfreshworks.com/", api_key: "k" } }, f.fetcher, "acme.myfreshworks.com");
  assert.deepEqual(await freshsales.push!(fctx, [ada]), [{ localId: "c1", externalId: "7001" }]);
  assert.equal(f.calls[0]!.headers.get("authorization"), "Token token=k");
  assert.deepEqual(JSON.parse(f.calls[0]!.body).unique_identifier, { emails: "ada@acme.com" });
  assert.match((await freshsales.push!(ctxOf("freshsales", { type: "key", values: { domain: "evil.com", api_key: "k" } }, f.fetcher), [ada]))[0]!.error!, /Freshsales address/);
  assert.equal(freshsales.link!(src("freshsales", "acme.myfreshworks.com"), "7001", () => ""), "https://acme.myfreshworks.com/crm/sales/contacts/7001");

  const k = tool([[/PUT https:\/\/api\.infusionsoft\.com\/crm\/rest\/v1\/contacts$/, json({ id: 55 })]]);
  assert.deepEqual(await keap.push!(ctxOf("keap", oauth(), k.fetcher), [ada]), [{ localId: "c1", externalId: "55" }]);
  const kb = JSON.parse(k.calls[0]!.body);
  assert.deepEqual([kb.duplicate_option, kb.email_addresses[0].email, kb.given_name], ["Email", "ada@acme.com", "Ada"]);
});

test("Copper: found by email (a 404 is no match), else made; a person deleted there comes back gone", async () => {
  const t = tool([
    [/POST .*\/people\/fetch_by_email/, [json({ message: "Resource not found" }, 404), json({ id: 81 })]],
    [/POST .*\/people$/, json({ id: 81 })],
    [/PUT .*\/people\/81/, json({ id: 81 })],
    [/PUT .*\/people\/12/, json({ message: "Resource not found" }, 404)],
  ]);
  const ctx = ctxOf("copper", { type: "key", values: { api_key: "k", email: "me@acme.com" } }, t.fetcher, "4242");
  assert.deepEqual(await copperCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "81" }]);
  assert.deepEqual(await copperCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "81" }]);
  assert.equal(t.calls.filter((c) => c.method === "POST" && c.url.endsWith("/people")).length, 1);
  assert.equal(t.calls[0]!.headers.get("x-pw-useremail"), "me@acme.com");
  assert.deepEqual(await copperCrm.push!(ctx, [{ ...ada, externalId: "12" }]), [{ localId: "c1", gone: true }]);
  assert.equal(copperCrm.link!(src("copper", "4242"), "81", () => ""), "https://app.copper.com/companies/4242/app#/person/81");
});

test("monday CRM: the board named Leads, cells by column type, found by email, kept as board:item", async () => {
  const t = tool([
    [/POST https:\/\/api\.monday\.com\/v2/, (c) => {
      const q = JSON.parse(c.body).query as string;
      if (q.includes("boards(limit")) return json({ data: { boards: [{ id: "9001", name: "Projects" }, { id: "9002", name: "Leads" }] } });
      if (q.includes("items_page_by_column_values")) return json({ data: { items_page_by_column_values: { items: t.calls.some((x) => x.body.includes("create_item")) ? [{ id: "777" }] : [] } } });
      if (q.includes("columns { id")) return json({ data: { boards: [{ columns: [{ id: "name", title: "Name", type: "name" }, { id: "lead_email", title: "Email", type: "email" }, { id: "lead_phone", title: "Phone", type: "phone" }, { id: "text_title", title: "Title", type: "text" }, { id: "text_co", title: "Company", type: "text" }] }] } });
      if (q.includes("create_item")) return json({ data: { create_item: { id: "777" } } });
      if (q.includes("change_multiple_column_values")) return json({ data: { change_multiple_column_values: { id: "777" } } });
      return json({ errors: [{ message: "unknown" }] });
    }],
  ]);
  const ctx = ctxOf("monday", { type: "key", values: { api_key: "k" } }, t.fetcher, "acme");
  assert.deepEqual(await mondayCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "9002:777" }]);
  assert.deepEqual(await mondayCrm.push!(ctx, [ada]), [{ localId: "c1", externalId: "9002:777" }]);
  const made = JSON.parse(t.calls.find((c) => c.body.includes("create_item"))!.body).variables;
  assert.deepEqual(JSON.parse(made.v), { lead_email: { email: "ada@acme.com", text: "ada@acme.com" }, lead_phone: { phone: "+14155550132" }, text_title: "VP Sales", text_co: "Acme", name: "Ada Park" });
  assert.equal(t.calls.filter((c) => c.body.includes("create_item")).length, 1, "made once");
  assert.equal(t.calls[0]!.headers.get("authorization"), "k");
  assert.equal(mondayCrm.link!(src("monday", "acme"), "9002:777", () => ""), "https://acme.monday.com/boards/9002/pulses/777");
});

test("flaky: a 503 is tried again, and one bad row never stops the rest", async () => {
  const t = tool([
    [/POST .*\/contacts\/upsert/, [json({}, 503), json({ contact: { id: "a1" } }), (c) => (c.body.includes("bad@") ? json({ message: "Invalid email" }, 422) : json({ contact: { id: "b1" } }))]],
  ]);
  const ctx = ctxOf("gohighlevel", oauth({ locationId: "loc9" }), t.fetcher, "loc9");
  const r = await goHighLevel.push!(ctx, [ada, { localId: "c2", externalId: null, values: { email: "bad@x" } }, { localId: "c3", externalId: null, values: { email: "bob@acme.com" } }]);
  assert.deepEqual(r[0], { localId: "c1", externalId: "a1" });
  assert.match(r[1]!.error!, /Invalid email/);
  assert.deepEqual(r[2], { localId: "c3", externalId: "b1" });
});
