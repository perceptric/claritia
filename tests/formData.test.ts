// The form studio's Data tab (docs/form-studio.md 2.1 "Data", build step 6): the overwrite policy a fill carries to
// the contact, a connected CRM's fields read live and cached, which fields fit which property, and linked answers
// sent to the CRM after a delivery. Flaky cases: the CRM's field list failing or hanging, a property deleted in the
// CRM after it was linked, two fields on one property, a CRM refusing one value of several, and a CRM that's down.
import assert from "node:assert/strict";
import { test } from "node:test";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { contactPolicy, defaultOverwrite, mergeKeys } from "../src/lib/forms/overwrite.ts";
import { customFit, customKindsFor, sameOptions, takenCrm } from "../src/lib/forms/savesTo.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";
import { seal } from "../src/lib/seal.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import {
  crmPlan,
  crmValue,
  forgetProperties,
  hubspotProperties,
  listProperties,
  omniscientProperties,
  propertyFit,
  readProperties,
  salesforceProperties,
  sendCrmFields,
  type CrmProperty,
} from "../src/lib/sources/properties.ts";
import type { Creds, SourceRow } from "../src/lib/sources/types.ts";

process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";

const SRC = "0190a0b0-0000-7000-8000-00000000000a";
const OTHER_SRC = "0190a0b0-0000-7000-8000-00000000000b";
const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Work email", required: true };
const ok = (raw: unknown, custom?: { key: string }[]) => {
  const r = checkForm(raw, custom ? { custom } : {});
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const withFields = (fields: unknown[]): Form => ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }] }, [{ key: "budget" }, { key: "notes" }]);

// Overwrite policy -------------------------------------------------------------------------------------------------

test("defaults: names and email always win, other contact and custom values only fill a blank, fill-only answers have none", () => {
  for (const k of ["email", "name", "first_name", "last_name"]) assert.equal(defaultOverwrite(k), "always");
  for (const k of ["title", "phone", "company", "website", "country", "region", "f.budget"]) assert.equal(defaultOverwrite(k), "if_empty");
  assert.equal(defaultOverwrite("q.message"), null);
  assert.deepEqual(mergeKeys("name"), ["first_name", "last_name"]);
  assert.deepEqual(mergeKeys("website"), ["company"]);
  assert.deepEqual(mergeKeys("q.x"), []);
});

test("a fill carries a policy for each contact value it answers; two fields on one value take the stricter", () => {
  const form = withFields([
    { id: "n", key: "name", type: "text", label: "Name", required: false },
    { id: "t", key: "title", type: "text", label: "Title", required: false, overwrite: "never" },
    { id: "c", key: "company", type: "text", label: "Company", required: false, overwrite: "always" },
    { id: "w", key: "website", type: "url", label: "Website", required: false },
    { id: "b", key: "f.budget", type: "number", label: "Budget", required: false, overwrite: "always" },
    { id: "p", key: "phone", type: "phone", label: "Phone", required: false },
    { id: "m", key: "q.message", type: "textarea", label: "Message", required: false },
  ]);
  const values = { email: "ana@acme.com", name: "Ana Diaz", title: "CTO", company: "Acme", website: "https://acme.com/", "f.budget": 5000, "q.message": "Hi" };
  assert.deepEqual(contactPolicy(form, values), { email: "always", first_name: "always", last_name: "always", title: "never", company: "if_empty", "f.budget": "always" });
  // Unanswered phone sends nothing, so a phone from elsewhere merges as before.
  assert.equal(contactPolicy(form, values).phone, undefined);
});

test("prepareSubmit sends the policy with the contact, and a form that sets nothing sends the defaults", () => {
  const form = withFields([
    { id: "t", key: "title", type: "text", label: "Title", required: false, overwrite: "always" },
    { id: "b", key: "f.budget", type: "number", label: "Budget", required: false },
  ]);
  const r = prepareSubmit(form, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com", t: "CTO", b: "5000" }, ms: 9000 }, { custom: [{ key: "budget", label: "Budget", type: "number", options: [] }] });
  assert.ok("args" in r);
  assert.deepEqual(r.args.p_contact?.overwrite, { email: "always", title: "always", "f.budget": "if_empty" });
  assert.equal(r.args.p_contact?.fields.budget, 5000);
  // Spam never becomes a contact, so it carries no policy either.
  const spam = prepareSubmit(form, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com" }, ms: 9000, trap: "x" }, { custom: [] });
  assert.ok("args" in spam && spam.args.p_contact === null);
});

// Lists ------------------------------------------------------------------------------------------------------------

const HS_PROPS = [
  { name: "email", label: "Email", type: "string", fieldType: "text" },
  { name: "firstname", label: "First name", type: "string", fieldType: "text" },
  { name: "budget", label: "Budget", type: "number", fieldType: "number" },
  { name: "industry_pick", label: "Industry", type: "enumeration", fieldType: "select", options: [{ label: "Software", value: "software" }, { label: "Retail", value: "retail" }, { label: "Old", value: "old", hidden: true }] },
  { name: "channels", label: "Channels", type: "enumeration", fieldType: "checkbox", options: [{ label: "Email", value: "email" }, { label: "Ads", value: "ads" }] },
  { name: "opted", label: "Opted in", type: "enumeration", fieldType: "booleancheckbox", options: [] },
  { name: "start", label: "Start date", type: "date", fieldType: "date" },
  { name: "hs_analytics_source", label: "Original source", type: "enumeration", fieldType: "select", options: [], modificationMetadata: { readOnlyValue: true } },
  { name: "internal", label: "Internal", type: "string", hidden: true },
];

test("HubSpot properties: kinds, visible options, read-only flagged and listed last, email and hidden ones left out", () => {
  const p = hubspotProperties(HS_PROPS);
  const by = Object.fromEntries(p.map((x) => [x.name, x]));
  assert.equal(by.email, undefined);
  assert.equal(by.internal, undefined);
  assert.equal(by.budget.kind, "number");
  assert.equal(by.industry_pick.kind, "enum");
  assert.deepEqual(by.industry_pick.options, [{ value: "software", label: "Software" }, { value: "retail", label: "Retail" }]);
  assert.equal(by.channels.kind, "multi");
  assert.equal(by.opted.kind, "bool");
  assert.equal(by.start.kind, "date");
  assert.equal(by.hs_analytics_source.readOnly, true);
  assert.equal(p[p.length - 1].name, "hs_analytics_source");
});

test("Salesforce fields: Lead and Contact as one list that knows which object has each; ids and references left out", () => {
  const p = salesforceProperties({
    Lead: [
      { name: "Id", type: "id" },
      { name: "Email", type: "email", updateable: true },
      { name: "Budget__c", label: "Budget", type: "currency", updateable: true, createable: true },
      { name: "Rating", label: "Rating", type: "picklist", updateable: true, picklistValues: [{ value: "Hot", label: "Hot" }, { value: "Cold", label: "Cold", active: false }] },
      { name: "OwnerId", type: "reference", updateable: true },
    ],
    Contact: [
      { name: "Budget__c", label: "Budget", type: "currency", updateable: true },
      { name: "Birthdate", label: "Birthdate", type: "date", updateable: true },
      { name: "CreatedDate", label: "Created date", type: "datetime", updateable: false, createable: false },
    ],
  });
  const by = Object.fromEntries(p.map((x) => [x.name, x]));
  assert.deepEqual(Object.keys(by).sort(), ["Birthdate", "Budget__c", "CreatedDate", "Rating"]);
  assert.deepEqual(by.Budget__c.objects, ["Lead", "Contact"]);
  assert.deepEqual(by.Rating.options, [{ value: "Hot", label: "Hot" }]);
  assert.deepEqual(by.Birthdate.objects, ["Contact"]);
  assert.equal(by.CreatedDate.readOnly, true);
});

test("Omniscient: the fields its contact API sets, plus its custom contact fields when its API lists them", () => {
  assert.deepEqual(omniscientProperties(null).map((p) => p.name), ["name", "phone", "title"]);
  const p = omniscientProperties([{ key: "o_projects", fields: [{ key: "x", type: "text" }] }, { key: "person", fields: [{ key: "tier", label: "Tier", type: "select", options: [{ value: "a", label: "A" }] }, { key: "email", type: "email" }] }]);
  assert.deepEqual(p.map((x) => x.name), ["name", "phone", "tier", "title"]);
});

const source = (kind: string, id = SRC): SourceRow => ({ id, workspace_id: "w", kind, name: kind === "hubspot" ? "HubSpot" : kind, account: "123", status: "active", settings: {}, cursors: {}, push_cursor: null });
const KEY: Creds = { type: "key", values: { api_key: "k", token: "k", instance_url: "https://acme.my.salesforce.com", url: "https://omni.test" } };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the field list is read once per 10 minutes per source; a failed read is never kept, and its error is in words", async () => {
  forgetProperties();
  let calls = 0;
  let down = false;
  const fetcher = (async (url: string) => {
    calls++;
    assert.match(String(url), /\/crm\/v3\/properties\/contacts$/);
    return down ? json({ message: "Bad request" }, 400) : json({ results: HS_PROPS });
  }) as typeof fetch;
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher, sleep: async () => {} });
  const t0 = 1_000_000;
  assert.equal((await listProperties(ctx, { now: t0 })).length, 7);
  await listProperties(ctx, { now: t0 + 9 * 60_000 });
  assert.equal(calls, 1);
  down = true;
  const r = await readProperties(ctx, { now: t0 + 11 * 60_000 });
  assert.equal(calls, 2);
  assert.deepEqual(r, { error: "HubSpot couldn't list its fields: Bad request" });
  down = false;
  assert.ok("properties" in (await readProperties(ctx, { now: t0 + 11 * 60_000 + 1 })));
  assert.equal(calls, 3);
});

test("a CRM that hangs or is down: the picker gets an error to show, never an exception", async () => {
  forgetProperties();
  const hang = (async (_u: string, init?: RequestInit) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))) as typeof fetch;
  // As the route's AbortSignal.timeout does, with a timer that keeps the test running.
  const stop = new AbortController();
  setTimeout(() => stop.abort(), 50);
  const slow = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: hang, sleep: async () => {}, signal: stop.signal });
  assert.deepEqual(await readProperties(slow), { error: "HubSpot didn't answer in time. Try again." });

  forgetProperties();
  const busy = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: (async () => json({}, 429)) as unknown as typeof fetch, sleep: async () => {} });
  assert.deepEqual(await readProperties(busy), { error: "HubSpot is busy. Try again in a minute." });

  forgetProperties();
  const denied = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: (async () => json({ message: "scope" }, 403)) as unknown as typeof fetch, sleep: async () => {} });
  assert.deepEqual(await readProperties(denied), { error: "Connect HubSpot again to read its fields." });

  // Salesforce without Leads still lists Contact fields; both failing is the error.
  forgetProperties();
  const sf = makeCtx({
    source: source("salesforce"),
    creds: KEY,
    sleep: async () => {},
    fetcher: (async (u: string) => (String(u).includes("/Lead/") ? json([{ message: "sObject type 'Lead' is not supported", errorCode: "INVALID_TYPE" }], 404) : json({ fields: [{ name: "Tier__c", label: "Tier", type: "string", updateable: true }] }))) as typeof fetch,
  });
  assert.deepEqual((await listProperties(sf)).map((p) => [p.name, p.objects]), [["Tier__c", ["Contact"]]]);

  // Omniscient that can't list custom fields: the contact fields its API takes, not an error, and read again next time.
  forgetProperties();
  let omCalls = 0;
  const om = makeCtx({ source: source("omniscient"), creds: KEY, sleep: async () => {}, fetcher: (async () => (omCalls++, json({ error: { message: "not configured" } }, 503))) as unknown as typeof fetch });
  assert.deepEqual(await readProperties(om), { properties: omniscientProperties(null) });
  const before = omCalls;
  await readProperties(om);
  assert.ok(omCalls > before);
});

// Fit and values ----------------------------------------------------------------------------------------------------

const P = (name: string, kind: CrmProperty["kind"], extra: Partial<CrmProperty> = {}): CrmProperty => ({ name, label: name, kind, ...extra });

test("which fields fit which property, with the reason when one doesn't", () => {
  assert.equal(propertyFit("text", P("a", "text")), null);
  assert.equal(propertyFit("text", P("a", "number")), "Takes a number");
  assert.equal(propertyFit("dropdown", P("a", "enum")), null);
  assert.equal(propertyFit("multi", P("a", "enum")), "Takes one of its options");
  assert.equal(propertyFit("checkbox", P("a", "bool")), null);
  assert.equal(propertyFit("date", P("a", "bool")), "Takes yes or no");
  assert.equal(propertyFit("number", P("a", "number", { readOnly: true })), "Read-only");
  assert.equal(propertyFit("heading", P("a", "text")), "Saves nothing");
  assert.equal(customFit({ type: "number" }, { type: "number" }), null);
  assert.equal(customFit({ type: "text" }, { type: "date" }), "Takes a date");
  assert.equal(customFit({ type: "rating", rating: { scale: 10, style: "stars" } }, { type: "rating" }), "Takes 1 to 5");
  assert.deepEqual(customKindsFor("multi"), ["multi_select", "text", "long_text"]);
});

test("answers as each CRM takes them: options matched by value or label, lists joined, numbers and yes or no", () => {
  const pick = P("i", "enum", { options: [{ value: "software", label: "Software" }] });
  assert.deepEqual(crmValue("hubspot", pick, "Software"), { value: "software" });
  assert.deepEqual(crmValue("hubspot", pick, "Other: Farming"), { skip: `"Farming" isn't one of its options` });
  const many = P("c", "multi", { options: [{ value: "email", label: "Email" }, { value: "ads", label: "Ads" }] });
  assert.deepEqual(crmValue("hubspot", many, ["Email", "ads"]), { value: "email;ads" });
  assert.deepEqual(crmValue("omniscient", many, ["email"]), { value: ["email"] });
  assert.deepEqual(crmValue("hubspot", P("b", "bool"), true), { value: "true" });
  assert.deepEqual(crmValue("salesforce", P("b", "bool"), false), { value: false });
  assert.deepEqual(crmValue("hubspot", P("n", "number"), 5000), { value: "5000" });
  assert.deepEqual(crmValue("salesforce", P("n", "number"), "1,200"), { value: 1200 });
  assert.deepEqual(crmValue("salesforce", P("n", "number"), "lots"), { skip: "Not a number" });
  assert.deepEqual(crmValue("hubspot", P("d", "date"), "2026-10-23"), { value: "2026-10-23" });
  assert.deepEqual(crmValue("hubspot", P("t", "text"), ["a", "b"]), { value: "a, b" });
  assert.ok(sameOptions([{ value: "a", label: "A" }], [{ value: "a", label: "A" }]));
  assert.ok(!sameOptions([{ value: "A", label: "A" }], [{ value: "a", label: "A" }]));
});

const crmForm = () =>
  withFields([
    { id: "b", key: "f.budget", type: "number", label: "Budget", required: false, crm: { source: SRC, property: "budget", label: "Budget" } },
    { id: "m", key: "q.message", type: "textarea", label: "Message", required: false, crm: { source: SRC, property: "gone_prop", label: "Gone" } },
    { id: "i", key: "q.industry", type: "dropdown", label: "Industry", required: false, options: [{ value: "Software", label: "Software" }], crm: { source: SRC, property: "industry_pick", label: "Industry" } },
    { id: "i2", key: "q.industry_again", type: "text", label: "Industry again", required: false, crm: { source: SRC, property: "industry_pick", label: "Industry" } },
    { id: "s", key: "q.source", type: "text", label: "Source", required: false, crm: { source: SRC, property: "hs_analytics_source", label: "Original source" } },
    { id: "x", key: "q.other", type: "text", label: "Other tool", required: false, crm: { source: OTHER_SRC, property: "budget" } },
  ]);
const crmValues = { email: "ana@acme.com", "f.budget": 5000, "q.message": "Hi", "q.industry": "Software", "q.industry_again": "Retail", "q.source": "ads", "q.other": "x" };

test("the plan: a deleted property, a read-only one and a second field on one property are skipped with why; other tools' links wait for theirs", () => {
  const props = hubspotProperties(HS_PROPS);
  const plan = crmPlan(crmForm(), crmValues, SRC, "hubspot", props);
  assert.deepEqual(
    plan.send.map((s) => [s.property, s.value, s.policy]),
    [
      ["budget", "5000", "if_empty"],
      ["industry_pick", "software", "always"],
    ],
  );
  assert.deepEqual(
    plan.skip.map((s) => [s.property, s.reason]),
    [
      ["gone_prop", "HubSpot no longer has this field."],
      ["industry_pick", `Two fields link here; the answer to "Industry" went.`],
      ["hs_analytics_source", "It's read-only in HubSpot."],
    ],
  );
  // The same form and answers always give the same plan.
  assert.deepEqual(crmPlan(crmForm(), crmValues, SRC, "hubspot", props), plan);
  // When the first field on a property has no answer, the next one with an answer goes.
  const later = crmPlan(crmForm(), { ...crmValues, "q.industry": undefined, "q.industry_again": "Retail" }, SRC, "hubspot", props);
  assert.deepEqual(later.send.find((s) => s.property === "industry_pick")?.value, "retail");
  // The field list couldn't be read: nothing is skipped up front.
  assert.equal(crmPlan(crmForm(), crmValues, SRC, "hubspot", null).send.length, 4);
  assert.deepEqual(takenCrm(crmForm(), "b").get(`${SRC}:industry_pick`), "Industry");
});

// Sending to the CRM ---------------------------------------------------------------------------------------------------

/** A HubSpot that keeps one contact's properties, refuses properties it doesn't have, and can be down. */
function fakeHubspot(props: string[], start: Record<string, string | null> = {}) {
  const record: Record<string, string | null> = { ...start };
  const log: string[] = [];
  let down: "all" | "patch" | null = null;
  const fetcher = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    log.push(`${init?.method ?? "GET"} ${u.pathname}`);
    if (down === "all" || (down === "patch" && init?.method === "PATCH")) return json({ message: "Service unavailable" }, 503);
    if (u.pathname === "/crm/v3/objects/contacts/batch/update") {
      const b = JSON.parse(String(init?.body));
      return json({ results: b.inputs.map((i: { id: string }) => ({ id: i.id, properties: {} })) });
    }
    if (u.pathname === "/crm/v3/properties/contacts") return json({ results: props.map((name) => ({ name, label: name, type: "string", fieldType: "text" })) });
    if (u.pathname === "/crm/v3/objects/contacts/batch/upsert") {
      const b = JSON.parse(String(init?.body));
      return json({ results: b.inputs.map((i: { id: string }) => ({ id: "501", properties: { email: i.id } })) });
    }
    if (u.pathname === "/crm/v3/objects/contacts/501" && (init?.method ?? "GET") === "GET") {
      const want = (u.searchParams.get("properties") ?? "").split(",");
      return json({ id: "501", properties: Object.fromEntries(want.map((k) => [k, record[k] ?? null])) });
    }
    if (u.pathname === "/crm/v3/objects/contacts/501" && init?.method === "PATCH") {
      const b = JSON.parse(String(init.body)) as { properties: Record<string, string> };
      const bad = Object.keys(b.properties).filter((k) => !props.includes(k));
      if (bad.length) return json({ status: "error", message: `Property values were not valid: Property "${bad[0]}" does not exist`, category: "VALIDATION_ERROR" }, 400);
      Object.assign(record, b.properties);
      return json({ id: "501", properties: record });
    }
    return json({ message: "not found" }, 404);
  }) as typeof fetch;
  return { record, log, fetcher, setDown: (d: "all" | "patch" | null) => (down = d) };
}

const send = (property: string, value: string, policy: "always" | "if_empty" | "never") => ({ property, label: property, value, policy, field: property });

test("sending: always writes; only-if-empty reads first and keeps a value that's there; never fills only a record made just now", async () => {
  const hs = fakeHubspot(["budget", "industry", "tier"], { industry: "Retail", tier: "" });
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: hs.fetcher, sleep: async () => {} });
  const plan = [send("budget", "5000", "always"), send("industry", "software", "if_empty"), send("tier", "gold", "if_empty")];
  const r = await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, plan, null);
  assert.deepEqual(r, { sent: ["budget", "tier"], held: ["industry"], skip: [] });
  assert.deepEqual(hs.record, { industry: "Retail", tier: "gold", budget: "5000" });

  const existing = await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, [send("industry", "software", "never")], null);
  assert.deepEqual(existing, { sent: [], held: ["industry"], skip: [] });
  const fresh = fakeHubspot(["industry"]);
  const ctx2 = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: fresh.fetcher, sleep: async () => {} });
  const made = await sendCrmFields(ctx2, "hubspot", { id: "501", localId: "c1", isNew: true }, [send("industry", "software", "never")], null);
  assert.deepEqual(made.sent, ["industry"]);
});

test("a property deleted in the CRM after linking: the write is split, the rest still goes, and the refusal says why", async () => {
  const hs = fakeHubspot(["budget", "tier"]);
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: hs.fetcher, sleep: async () => {} });
  const r = await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, [send("budget", "5000", "always"), send("deleted_one", "x", "always"), send("tier", "gold", "always")], null);
  assert.deepEqual(r.sent, ["budget", "tier"]);
  assert.deepEqual(r.skip.map((s) => s.property), ["deleted_one"]);
  assert.match(r.skip[0].reason, /does not exist/);
  assert.deepEqual(hs.record, { budget: "5000", tier: "gold" });
});

test("a CRM that's down: sending throws so the delivery tries again; the second try changes nothing twice", async () => {
  const hs = fakeHubspot(["budget"]);
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: hs.fetcher, sleep: async () => {} });
  hs.setDown("all");
  await assert.rejects(sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, [send("budget", "5000", "if_empty")], null), /answered 503/);
  hs.setDown(null);
  assert.deepEqual((await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, [send("budget", "5000", "if_empty")], null)).sent, ["budget"]);
  // Retried after it landed: only-if-empty now sees the value it wrote and leaves it.
  assert.deepEqual((await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, [send("budget", "5000", "if_empty")], null)).held, ["budget"]);
});

test("a read that's refused holds only-if-empty answers back instead of guessing", async () => {
  const fetcher = (async (url: string, init?: RequestInit) => ((init?.method ?? "GET") === "GET" ? json({ message: "bad" }, 400) : json({}))) as typeof fetch;
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher, sleep: async () => {} });
  const r = await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: true }, [send("budget", "5000", "if_empty"), send("tier", "gold", "always")], null);
  assert.deepEqual(r, { sent: ["tier"], held: ["budget"], skip: [] });
});

test("Salesforce: a field only Contacts have is skipped for a Lead, with why", async () => {
  const got: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    got.push(`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const ctx = makeCtx({ source: source("salesforce"), creds: KEY, fetcher, sleep: async () => {} });
  const props = [P("Budget__c", "number", { objects: ["Lead", "Contact"] }), P("Birthdate", "date", { objects: ["Contact"] })];
  const r = await sendCrmFields(ctx, "salesforce", { id: "00Q000000000001", localId: "c1", isNew: false }, [send("Budget__c", "5", "always"), send("Birthdate", "2000-01-01", "always")], props);
  assert.deepEqual(r.sent, ["Budget__c"]);
  assert.deepEqual(r.skip, [{ property: "Birthdate", label: "Birthdate", reason: "Salesforce Leads don't have this field." }]);
  assert.deepEqual(got, ["PATCH /services/data/v61.0/sobjects/Lead/00Q000000000001"]);
});

// The delivery ------------------------------------------------------------------------------------------------------

test("a delivery to HubSpot sends the contact, then the linked answers; a deleted property is logged and the delivery is done", async () => {
  forgetProperties();
  const hs = fakeHubspot(["budget", "industry_pick"]);
  const logs: Record<string, unknown>[] = [];
  const contact = { id: "0190a0b0-0000-7000-8000-0000000000c1", email: "ana@acme.com", first_name: "Ana", last_name: "Diaz", title: null, phone: null, country: null, company: null, company_domain: null };
  let linked: string | null = null;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "source_load") return { data: { source: source("hubspot"), sealed: seal(JSON.stringify(KEY)), hook_sealed: null, mappings: [] }, error: null };
    if (fn === "push_candidates")
      return { data: [{ ...contact, email_clean: contact.email, updated_at: new Date().toISOString(), region: null, timezone: null, lifecycle: "lead", lead_status: null, fields: {}, company_name: null, company_domain: null, score: null, score_band: null, owner_crm: null, sources: {}, external_id: linked, last: null, suppressed: false }], error: null };
    if (fn === "source_links_put") {
      linked = "501";
      return { data: null, error: null };
    }
    if (fn === "sync_log_add") {
      logs.push(...(args.p_rows as Record<string, unknown>[]));
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };
  const form = withFields([
    { id: "b", key: "q.budget", type: "number", label: "Budget", required: false, crm: { source: SRC, property: "budget", label: "Budget" } },
    { id: "g", key: "q.gone", type: "text", label: "Gone", required: false, crm: { source: SRC, property: "deleted_prop", label: "Deleted" } },
  ]);
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null },
    destination: { id: "x", kind: "source", source_id: SRC, name: "HubSpot", config: {}, mode: "upsert" },
    sealed: null,
    submission: { id: "s1", created_at: new Date().toISOString(), values: { email: "ana@acme.com", "q.budget": 5000, "q.gone": "x" }, hidden: {}, test: false, form_version: 1, contact_id: contact.id },
    form: { id: "f1", name: "Demo", body: form },
    contact,
  };
  const run = { rpc, clean: async () => ({ custom: [] }), sleep: async () => {}, fetcher: hs.fetcher };
  const r = await sendDelivery(t, { run });
  assert.equal(r.status, "done");
  assert.ok(r.status === "done" && r.externalId === "501");
  assert.deepEqual(r.status === "done" ? r.notes : null, ["Deleted: HubSpot no longer has this field."]);
  assert.equal(hs.record.budget, "5000");
  assert.ok(logs.some((l) => l.action === "error" && (l.fields as string[])[0] === "deleted_prop" && /no longer has this field/.test(String(l.error))));

  // HubSpot takes the contact but is down when the answers go: the delivery tries again rather than failing for good,
  // and the next try sends them.
  forgetProperties();
  hs.record.budget = null;
  hs.setDown("patch");
  const again = await sendDelivery(t, { run });
  assert.equal(again.status, "retry");
  assert.equal(hs.record.budget, null);
  hs.setDown(null);
  const third = await sendDelivery(t, { run });
  assert.equal(third.status, "done");
  assert.equal(hs.record.budget, "5000");
});

// Sync rules (docs/form-builder.md 7.4): the destination's "When the record exists" rule sets the policy for linked
// answers, a field's own setting still wins, and a destination without rules keeps the old policy.
test("sync rules: the destination rule sets the policy, a field's own setting wins, no rules keeps the old one", async () => {
  const { rulesOf, NEW_RULES } = await import("../src/lib/delivery/rules.ts");
  const props = hubspotProperties(HS_PROPS);
  const pol = (rules: ReturnType<typeof rulesOf>, form = crmForm()) => crmPlan(form, crmValues, SRC, "hubspot", props, rules).send.map((s) => [s.property, s.policy]);
  assert.deepEqual(pol(null), [["budget", "if_empty"], ["industry_pick", "always"]], "no rules: unchanged");
  assert.deepEqual(pol({ exists: "never" }), [["budget", "never"], ["industry_pick", "never"]]);
  assert.deepEqual(pol({ exists: "always" }), [["budget", "always"], ["industry_pick", "always"]]);
  const own = withFields(allFields(crmForm()).filter((f) => f.key !== "email").map((f) => (f.id === "b" ? { ...f, overwrite: "always" as const } : f)));
  assert.deepEqual(pol({ exists: "never" }, own), [["budget", "always"], ["industry_pick", "never"]], "the field's own setting wins");
  // Reading rules: junk is dropped, and new destinations start safe.
  assert.deepEqual(rulesOf({ rules: { exists: "if_empty", owner: "x" } }), { exists: "if_empty" });
  for (const junk of [null, {}, { rules: null }, { rules: { exists: "sometimes" } }, "rules"]) assert.equal(rulesOf(junk), null);
  assert.deepEqual(NEW_RULES, { exists: "if_empty" });
});

test("sync rules, flaky case: with 'Do not update', a record that already existed keeps its values; a new one is filled", async () => {
  const props = hubspotProperties(HS_PROPS);
  const plan = crmPlan(crmForm(), crmValues, SRC, "hubspot", props, { exists: "never" }).send.map((x) => ({ ...x, property: x.property === "industry_pick" ? "industry" : x.property }));
  const hs = fakeHubspot(["budget", "industry"], { budget: "9000", industry: "Retail" });
  const ctx = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: hs.fetcher, sleep: async () => {} });
  const r = await sendCrmFields(ctx, "hubspot", { id: "501", localId: "c1", isNew: false }, plan, null);
  assert.deepEqual(r.sent, [], "nothing overwritten on an existing record");
  assert.deepEqual(hs.record, { budget: "9000", industry: "Retail" });
  const fresh = fakeHubspot(["budget", "industry"]);
  const ctx2 = makeCtx({ source: source("hubspot"), creds: KEY, fetcher: fresh.fetcher, sleep: async () => {} });
  const made = await sendCrmFields(ctx2, "hubspot", { id: "501", localId: "c1", isNew: true }, plan, null);
  assert.deepEqual(made.sent.sort(), ["budget", "industry"]);
});
