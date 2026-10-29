// Sync rules for CRM destinations (docs/form-builder.md 7.4): reading them, the push options they give, what the
// Salesforce and HubSpot pushes do with those options (owner kept or left out, the assignment header, Lead or
// Contact, the consent box), and the duplicate check before a new record, on its flaky cases.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DUPLICATE, NEW_RULES, pushOptions, rulesOf } from "../src/lib/delivery/rules.ts";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { hubspot } from "../src/lib/sources/hubspot.ts";
import { salesforce } from "../src/lib/sources/salesforce.ts";
import type { Creds, SourceRow } from "../src/lib/sources/types.ts";

const SRC = "0190a0b0-0000-7000-8000-00000000000a";
const KEY: Creds = { type: "key", values: { api_key: "k", token: "k", instance_url: "https://acme.my.salesforce.com" } };
const source = (kind: string): SourceRow => ({ id: SRC, workspace_id: "w", kind, name: kind === "hubspot" ? "HubSpot" : "Salesforce", account: "123", status: "active", settings: {}, cursors: {}, push_cursor: null });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
type Call = { method: string; path: string; body: unknown; headers: Headers };
function fake(kind: string, answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const c = { method: init?.method ?? "GET", path: `${u.pathname}${u.search}`, body: init?.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init?.headers) };
    calls.push(c);
    return json(answer(c));
  }) as typeof fetch;
  return { ctx: makeCtx({ source: source(kind), creds: KEY, fetcher, sleep: async () => {} }), calls };
}

test("rules: saved choices read back, unknown ones take the safe default, and no rules means no options", () => {
  assert.deepEqual(rulesOf({ rules: { exists: "always", owner: "route", assign: "crm", consent: false, match: "email_name", create: "Contact" } }), { exists: "always", owner: "route", assign: "crm", consent: false, match: "email_name", create: "Contact" });
  assert.deepEqual(rulesOf({ rules: { exists: "never", owner: "x", create: "Account" } }), { ...NEW_RULES, exists: "never" });
  assert.equal(rulesOf({ rules: { owner: "keep" } }), null, "a rule set needs exists");
  assert.equal(pushOptions(null, true), undefined);
  assert.deepEqual(pushOptions(NEW_RULES, true), { owner: "keep", autoAssign: false, create: "Lead", optIn: true });
  assert.deepEqual(pushOptions({ ...NEW_RULES, owner: "route" }, false), { owner: "set", autoAssign: false, create: "Lead", optIn: false });
  // The CRM assigns: Claritia never writes an owner, and Salesforce's own rules run.
  assert.deepEqual(pushOptions({ ...NEW_RULES, assign: "crm", owner: "route" }, true), { owner: "none", autoAssign: true, create: "Lead", optIn: true });
  assert.equal(pushOptions({ ...NEW_RULES, consent: false }, true)?.optIn, false, "consent off: the box isn't sent");
});

test("Salesforce: keep owner on records it has, Contact or Lead for new ones, the assignment header, and the consent box", async () => {
  const { ctx, calls } = fake("salesforce", (c) => {
    if (c.path.includes("/query")) return { records: c.path.includes("FROM%20Contact") ? [{ Id: "0031", Email: "old@acme.com" }] : [] };
    if (c.path.includes("/composite/sobjects")) return (c.body as { records: unknown[] }).records.map((_, i) => ({ success: true, id: `003N${i}` }));
    return { fields: [] };
  });
  const out = await salesforce.push!(
    ctx,
    [
      { localId: "a", externalId: "00Q1", values: { Email: "a@acme.com", LastName: "Diaz", OwnerId: "005A" } },
      { localId: "b", externalId: null, values: { Email: "old@acme.com", OwnerId: "005A" } },
      { localId: "c", externalId: null, values: { Email: "new@acme.com", OwnerId: "005A" } },
    ],
    { owner: "keep", autoAssign: false, create: "Contact", optIn: true },
  );
  assert.deepEqual(out.map((r) => r.localId), ["a", "b", "c"]);
  const patch = calls.find((c) => c.method === "PATCH")!.body as { records: Record<string, unknown>[] };
  assert.ok(patch.records.every((r) => !("OwnerId" in r)), "records Salesforce has keep their owner, the email match included");
  assert.ok(patch.records.every((r) => r.HasOptedOutOfEmail === false));
  const post = calls.find((c) => c.method === "POST")!;
  const made = (post.body as { records: Record<string, unknown>[] }).records[0]!;
  assert.deepEqual([made.attributes, made.OwnerId, made.LastName, "Company" in made], [{ type: "Contact" }, "005A", "[not provided]", false]);
  assert.equal(post.headers.get("Sforce-Auto-Assign"), "FALSE");

  // The CRM assigns: no owner anywhere, and its rules are asked to run on the new Lead.
  const crm = fake("salesforce", (c) => (c.path.includes("/composite/sobjects") ? [{ success: true, id: "00QN" }] : c.path.includes("/query") ? { records: [] } : { fields: [] }));
  await salesforce.push!(crm.ctx, [{ localId: "c", externalId: null, values: { Email: "new@acme.com", OwnerId: "005A" } }], { owner: "none", autoAssign: true, create: "Lead" });
  const p2 = crm.calls.find((c) => c.method === "POST")!;
  const lead = (p2.body as { records: Record<string, unknown>[] }).records[0]!;
  assert.deepEqual([lead.attributes, "OwnerId" in lead, lead.Company, "HasOptedOutOfEmail" in lead], [{ type: "Lead" }, false, "[not provided]", false]);
  assert.equal(p2.headers.get("Sforce-Auto-Assign"), "TRUE");

  // No options: exactly as before (no header, the owner written).
  const plain = fake("salesforce", (c) => (c.path.includes("/composite/sobjects") ? [{ success: true, id: "00QN" }] : c.path.includes("/query") ? { records: [] } : { fields: [] }));
  await salesforce.push!(plain.ctx, [{ localId: "c", externalId: null, values: { Email: "new@acme.com", OwnerId: "005A" } }]);
  const p3 = plain.calls.find((c) => c.method === "POST")!;
  assert.equal(((p3.body as { records: Record<string, unknown>[] }).records[0]!).OwnerId, "005A");
  assert.equal(p3.headers.get("Sforce-Auto-Assign"), null);
});

test("HubSpot: keep owner checks which emails it has first; only new ones take the routed owner; consent sets the legal basis", async () => {
  const { ctx, calls } = fake("hubspot", (c) => {
    if (c.path.endsWith("/batch/read")) return { results: [{ id: "77", properties: { email: "old@acme.com" } }] };
    const b = c.body as { inputs: { id: string; properties: Record<string, unknown> }[] };
    return { results: b.inputs.map((i) => ({ id: i.id === "old@acme.com" ? "77" : "88", properties: { email: i.id } })) };
  });
  await hubspot.push!(
    ctx,
    [
      { localId: "o", externalId: null, values: { email: "old@acme.com", hubspot_owner_id: "9" } },
      { localId: "n", externalId: null, values: { email: "new@acme.com", hubspot_owner_id: "9" } },
    ],
    { owner: "keep", optIn: true },
  );
  const up = calls.find((c) => c.path.endsWith("/batch/upsert"))!.body as { inputs: { id: string; properties: Record<string, unknown> }[] };
  const by = Object.fromEntries(up.inputs.map((i) => [i.id, i.properties]));
  assert.equal(by["old@acme.com"]!.hubspot_owner_id, undefined, "the contact HubSpot already had keeps its owner");
  assert.equal(by["new@acme.com"]!.hubspot_owner_id, "9");
  assert.ok(up.inputs.every((i) => i.properties.hs_legal_basis === "Freely given consent from contact"));
  // Flaky case: the read fails, so nothing is sent rather than overwriting an owner.
  const down = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: (async () => json({ message: "down" }, 400)) as typeof fetch, sleep: async () => {} });
  await assert.rejects(hubspot.push!(down, [{ localId: "o", externalId: null, values: { email: "old@acme.com", hubspot_owner_id: "9" } }], { owner: "keep" }));
});

// The duplicate check, through a whole delivery ---------------------------------------------------------------

const contact = { id: "0190a0b0-0000-7000-8000-0000000000c1", email: "ana.diaz@acme.com", first_name: "Ana", last_name: "Diaz", title: null, phone: null, country: null, company: "Acme", company_domain: "acme.com" };
function delivery(rules: Record<string, unknown>, o: { allow?: boolean; found?: boolean } = {}) {
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    calls.push(`${init?.method ?? "GET"} ${u.pathname}`);
    if (u.pathname.endsWith("/contacts/search")) return json({ results: o.found ? [{ id: "55", properties: { email: "ana@acme.com", firstname: "Ana", lastname: "Diaz" } }] : [] });
    if (u.pathname.endsWith("/batch/upsert") || u.pathname.endsWith("/batch/read")) return json({ results: [{ id: "501", properties: { email: contact.email } }] });
    return json({ results: [] });
  }) as typeof fetch;
  const rpc = async (fn: string) => {
    if (fn === "source_load") return { data: { source: source("hubspot"), sealed: seal(JSON.stringify(KEY)), hook_sealed: null, mappings: [] }, error: null };
    if (fn === "push_candidates")
      return { data: [{ ...contact, email_clean: contact.email, updated_at: new Date().toISOString(), region: null, timezone: null, lifecycle: "lead", lead_status: null, fields: {}, company_name: "Acme", score: null, score_band: null, owner_crm: null, sources: {}, external_id: null, last: null, suppressed: false }], error: null };
    return { data: null, error: null };
  };
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email", required: true }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null, allow_duplicate: o.allow === true },
    destination: { id: "x", kind: "source", source_id: SRC, name: "HubSpot", config: { rules: { exists: "if_empty", ...rules } }, mode: "upsert" },
    sealed: null,
    submission: { id: "s1", created_at: new Date().toISOString(), values: { email: contact.email }, hidden: {}, consent: { given: true }, test: false, form_version: 1, contact_id: contact.id },
    form: { id: "f1", name: "Demo", body: form.form },
    contact,
  };
  return { run: () => sendDelivery(t, { run: { rpc, clean: async () => ({ custom: [] }), sleep: async () => {}, fetcher } }), calls };
}

test("duplicate check: the same name at the same domain under another email stops the delivery, and Create anyway sends it", async () => {
  const hit = delivery({ match: "email_name" }, { found: true });
  const r = await hit.run();
  assert.equal(r.status, "failed");
  assert.ok(r.status === "failed" && r.error.startsWith(DUPLICATE) && r.error.includes("ana@acme.com"));
  assert.ok(!hit.calls.some((c) => c.endsWith("/batch/upsert")), "nothing created");
  const anyway = delivery({ match: "email_name" }, { found: true, allow: true });
  assert.equal((await anyway.run()).status, "done");
  assert.ok(!anyway.calls.some((c) => c.endsWith("/contacts/search")), "Create anyway skips the check");
  const none = delivery({ match: "email_name" }, { found: false });
  assert.equal((await none.run()).status, "done");
  const off = delivery({ match: "email" }, { found: true });
  assert.equal((await off.run()).status, "done");
  assert.ok(!off.calls.some((c) => c.endsWith("/contacts/search")), "email only: no search");
});
