// Email tools as form destinations (docs/integrations-plan.md step 1): a fill joins the destination's list in
// Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit or MailerLite, with its tags, subscribed only with consent unless the
// destination adds everyone. The flaky cases: the same person filling a second form (already linked, nothing changed)
// still joins that form's list; no list picked; no consent for a tool that only holds subscribers (skipped, with why);
// the tool down, rate limited or signed out; a merge field the audience doesn't have.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { cleanTags, listOf, NEW_RULES, pushOptions } from "../src/lib/delivery/rules.ts";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, PushOptions, SourceRow } from "../src/lib/sources/types.ts";

const SRC = "0190a0b0-0000-7000-8000-00000000000b";
const CREDS: Record<string, Creds> = {
  mailchimp: { type: "key", values: { api_key: "abc123-us21" } },
  klaviyo: { type: "key", values: { api_key: "pk_1" } },
  activecampaign: { type: "key", values: { url: "https://acme.api-us1.com", api_key: "ac" } },
  brevo: { type: "key", values: { api_key: "xkeysib" } },
  kit: { type: "key", values: { api_key: "secret" } },
  mailerlite: { type: "key", values: { api_key: "ml" } },
};
const source = (kind: string): SourceRow => ({ id: SRC, workspace_id: "w", kind, name: kind, account: "a", status: "active", settings: {}, cursors: {}, push_cursor: null });
type Call = { method: string; url: string; body: Record<string, unknown> | null };
/** A tool that answers each call with `answer` (a body, or a status with a body). */
function tool(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(url), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(c);
    const a = answer(c);
    if (a && typeof a === "object" && "status" in (a as object) && typeof (a as { status: unknown }).status === "number") {
      const { status, body } = a as { status: number; body?: unknown };
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
    return a === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}
const lead = { email: "Ana@Acme.com", first_name: "Ana", last_name: "Diaz", phone: "+1 415 555 0132", company: "Acme" };
/** The values the sync sends a tool, in that tool's own column names (its default mapping). */
function valuesFor(kind: string): Record<string, unknown> {
  const map = connectorFor(kind)!.defaults.contact;
  const v: Record<string, unknown> = {};
  for (const [col, target] of Object.entries(map)) if (typeof target === "string" && target in lead) v[col] = lead[target as keyof typeof lead];
  return v;
}
async function pushOne(kind: string, o: PushOptions, answer: (c: Call) => unknown) {
  const t = tool(answer);
  const ctx = makeCtx({ source: source(kind), creds: CREDS[kind]!, fetcher: t.fetcher, sleep: async () => {} });
  const results = await connectorFor(kind)!.push!(ctx, [{ localId: "c1", externalId: null, values: valuesFor(kind) }], o);
  return { results, calls: t.calls };
}

test("every email tool takes form leads into a list; the ones with tags say so", () => {
  for (const kind of ["mailchimp", "klaviyo", "activecampaign", "brevo", "kit", "mailerlite"]) {
    const e = CATALOG.find((x) => x.kind === kind)!;
    assert.ok(e.pushes && e.lists, `${kind} takes leads into a list`);
    assert.ok(connectorFor(kind)!.push && connectorFor(kind)!.audiences, `${kind} pushes and lists its lists`);
    assert.equal(!!e.tags, !!connectorFor(kind)!.tags, `${kind}: the catalog and the connector agree on tags`);
  }
});

test("Mailchimp: upserted by the email's hash into the audience, merge fields only where the audience has them, tags, consent", async () => {
  const hash = createHash("md5").update("ana@acme.com").digest("hex");
  const r = await pushOne("mailchimp", { list: "aud1", tags: ["Demo", "Webinar"], marketing: true }, (c) => (c.url.includes("/merge-fields") ? { merge_fields: [{ tag: "FNAME" }, { tag: "LNAME" }, { tag: "PHONE" }] } : c.url.endsWith("/tags") ? null : { id: hash }));
  assert.deepEqual(r.results, [{ localId: "c1", externalId: hash }]);
  const put = r.calls.find((c) => c.method === "PUT")!;
  assert.equal(put.url, `https://us21.api.mailchimp.com/3.0/lists/aud1/members/${hash}`);
  assert.deepEqual(put.body, { email_address: "ana@acme.com", status_if_new: "subscribed", merge_fields: { FNAME: "Ana", LNAME: "Diaz", PHONE: "+1 415 555 0132" } }, "COMPANY isn't in this audience, so it's left out");
  assert.ok(!("status" in put.body!), "an existing member's status is never changed");
  assert.deepEqual(r.calls.find((c) => c.url.endsWith("/tags"))!.body, { tags: [{ name: "Demo", status: "active" }, { name: "Webinar", status: "active" }] });
  const noConsent = await pushOne("mailchimp", { list: "aud1", marketing: false }, (c) => (c.url.includes("/merge-fields") ? { merge_fields: [] } : { id: hash }));
  assert.equal(noConsent.calls.find((c) => c.method === "PUT")!.body!.status_if_new, "transactional", "no consent: kept, never subscribed");
  assert.ok(!noConsent.calls.some((c) => c.url.endsWith("/tags")), "no tags, no tag call");
});

test("Klaviyo: the profile, then subscribed to the list with consent, or only added to it without", async () => {
  const yes = await pushOne("klaviyo", { list: "L1", marketing: true }, (c) => (c.url.endsWith("/profile-import") ? { data: { id: "P1" } } : { status: 202, body: {} }));
  assert.deepEqual(yes.results, [{ localId: "c1", externalId: "P1" }]);
  const imp = yes.calls.find((c) => c.url.endsWith("/profile-import"))!.body as { data: { attributes: Record<string, unknown> } };
  assert.equal(imp.data.attributes.phone_number, "+14155550132", "the phone in E.164");
  const sub = yes.calls.find((c) => c.url.endsWith("/profile-subscription-bulk-create-jobs"))!.body as { data: { relationships: { list: { data: { id: string } } } } };
  assert.equal(sub.data.relationships.list.data.id, "L1");
  const no = await pushOne("klaviyo", { list: "L1", marketing: false }, (c) => (c.url.endsWith("/profile-import") ? { data: { id: "P1" } } : null));
  assert.ok(!no.calls.some((c) => c.url.includes("subscription")), "no consent: no subscription");
  assert.deepEqual(no.calls.find((c) => c.url.endsWith("/lists/L1/relationships/profiles"))!.body, { data: [{ type: "profile", id: "P1" }] });
});

test("ActiveCampaign: synced, subscribed to the list, tags found or made once; no consent leaves them out", async () => {
  const r = await pushOne("activecampaign", { list: "7", tags: ["Demo", "New tag"], marketing: true }, (c) =>
    c.url.endsWith("/contact/sync") ? { contact: { id: "C9" } } : c.url.includes("/tags?search=Demo") ? { tags: [{ id: "3", tag: "demo" }] } : c.url.includes("/tags?search=") ? { tags: [] } : c.url.endsWith("/tags") ? { tag: { id: "4" } } : {},
  );
  assert.deepEqual(r.results, [{ localId: "c1", externalId: "C9" }]);
  assert.deepEqual(r.calls.find((c) => c.url.endsWith("/contactLists"))!.body, { contactList: { list: "7", contact: "C9", status: 1 } });
  assert.deepEqual(r.calls.filter((c) => c.url.endsWith("/contactTags")).map((c) => (c.body as { contactTag: { tag: string } }).contactTag.tag), ["3", "4"], "an existing tag by name, a new one made");
  const no = await pushOne("activecampaign", { list: "7", marketing: false }, () => ({}));
  assert.deepEqual(no.results, [{ localId: "c1", skipped: "Not added: no email consent on this fill." }]);
  assert.equal(no.calls.length, 0, "nothing is written");
});

test("Brevo, Kit and MailerLite: joined with consent; without it, left out and nothing written", async () => {
  const br = await pushOne("brevo", { list: "12", marketing: true }, (c) => (c.method === "POST" ? null : { id: 55 }));
  assert.deepEqual(br.results, [{ localId: "c1", externalId: "55" }], "an update answers 204: the id is read by email");
  assert.deepEqual(br.calls[0]!.body, { email: "ana@acme.com", updateEnabled: true, listIds: [12], attributes: { FIRSTNAME: "Ana", LASTNAME: "Diaz" } });
  const kt = await pushOne("kit", { list: "F1", tags: ["Demo"], marketing: true }, (c) => (c.url.includes("/v3/tags") && c.method === "GET" ? { tags: [{ id: 21, name: "demo" }] } : { subscription: { subscriber: { id: 900 } } }));
  assert.deepEqual(kt.results, [{ localId: "c1", externalId: "900" }]);
  const sub = kt.calls.find((c) => c.url.includes("/forms/F1/subscribe"))!;
  assert.deepEqual(sub.body, { api_secret: "secret", email: "ana@acme.com", first_name: "Ana", tags: [21] });
  const ml = await pushOne("mailerlite", { list: "G1", marketing: true }, () => ({ data: { id: "S1" } }));
  assert.deepEqual(ml.results, [{ localId: "c1", externalId: "S1" }]);
  assert.deepEqual((ml.calls[0]!.body as { groups: string[] }).groups, ["G1"]);
  for (const kind of ["brevo", "kit", "mailerlite"]) {
    const no = await pushOne(kind, { list: "x", marketing: false }, () => ({}));
    assert.deepEqual(no.results, [{ localId: "c1", skipped: "Not added: no email consent on this fill." }], kind);
    assert.equal(no.calls.length, 0, `${kind}: nothing written`);
  }
});

test("flaky: no email or no list is this fill's error; the tool refusing one fill doesn't stop the others", async () => {
  const t = tool((c) => (c.url.includes("/merge-fields") ? { merge_fields: [] } : c.body?.email_address === "bad@acme.com" ? { status: 400, body: { detail: "Invalid Resource" } } : {}));
  const ctx = makeCtx({ source: source("mailchimp"), creds: CREDS.mailchimp!, fetcher: t.fetcher, sleep: async () => {} });
  const r = await connectorFor("mailchimp")!.push!(ctx, [
    { localId: "a", externalId: null, values: { FNAME: "No email" } },
    { localId: "b", externalId: null, values: { email: "bad@acme.com" } },
    { localId: "c", externalId: null, values: { email: "ok@acme.com" } },
  ], { list: "aud1", marketing: true });
  assert.equal(r[0]!.error, "This fill has no email.");
  assert.equal(r[1]!.error, "Invalid Resource");
  assert.ok(r[2]!.externalId, "the next fill still joins");
  const none = await pushOne("mailerlite", { marketing: true }, () => ({}));
  assert.equal(none.results[0]!.error, "Pick a list in the form's Sync tab.");
});

// A whole delivery, through the jobs queue's sendDelivery: the destination's list and tags, consent from the fill.
const contact = { id: "0190a0b0-0000-7000-8000-0000000000c2", email: "ana@acme.com", first_name: "Ana", last_name: "Diaz", title: null, phone: null, country: null, company: "Acme", company_domain: "acme.com" };
function delivery(kind: string, o: { config: Record<string, unknown>; consent: boolean; linked?: Record<string, unknown>; answer: (c: Call) => unknown }) {
  const t0 = tool(o.answer);
  const stored: Record<string, unknown>[] = [];
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    if (fn === "source_links_put") stored.push(...((args?.p_rows as { values: Record<string, unknown> }[]) ?? []).map((r) => r.values));
    if (fn === "source_load") return { data: { source: source(kind), sealed: seal(JSON.stringify(CREDS[kind])), hook_sealed: null, mappings: [] }, error: null };
    if (fn === "push_candidates") {
      // Linked: the tool already has this person, with exactly these values (nothing changed since).
      const row = { ...contact, email_clean: contact.email, updated_at: new Date().toISOString(), region: null, timezone: null, lifecycle: "lead", lead_status: null, fields: {}, company_name: "Acme", score: null, score_band: null, owner_crm: null, sources: {}, suppressed: false };
      return { data: [{ ...row, external_id: o.linked ? "linked-1" : null, last: o.linked ?? null }], error: null };
    }
    return { data: null, error: null };
  };
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email", required: true }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null, allow_duplicate: false },
    destination: { id: "x", kind: "source", source_id: SRC, name: kind, config: o.config, mode: "upsert" },
    sealed: null,
    submission: { id: "s1", created_at: new Date().toISOString(), values: { email: contact.email }, hidden: {}, consent: { given: o.consent }, test: false, form_version: 1, contact_id: contact.id },
    form: { id: "f1", name: "Demo", body: form.form },
    contact,
  };
  return { run: () => sendDelivery(t, { run: { rpc: rpc as never, clean: async () => ({ custom: [] }), sleep: async () => {}, fetcher: t0.fetcher } }), calls: t0.calls, stored };
}
const mcAnswer = (c: Call) => (c.url.includes("/merge-fields") ? { merge_fields: [{ tag: "FNAME" }] } : c.url.endsWith("/tags") ? null : { id: "h" });

test("a delivery joins the destination's list with its tags, subscribed with the consent box ticked", async () => {
  const d = delivery("mailchimp", { config: { rules: NEW_RULES, list: { id: "aud1", name: "Leads" }, tags: ["Demo"] }, consent: true, answer: mcAnswer });
  const r = await d.run();
  assert.equal(r.status, "done");
  assert.equal(d.calls.find((c) => c.method === "PUT")!.body!.status_if_new, "subscribed");
  assert.ok(d.calls.some((c) => c.url.endsWith("/lists/aud1/members/" + createHash("md5").update("ana@acme.com").digest("hex") + "/tags")));
  const off = delivery("mailchimp", { config: { rules: { ...NEW_RULES, consent: false }, list: { id: "aud1", name: "Leads" } }, consent: false, answer: mcAnswer });
  await off.run();
  assert.equal(off.calls.find((c) => c.method === "PUT")!.body!.status_if_new, "subscribed", "Subscribe: Everyone");
});

test("flaky: the same person filling a second form, already linked and unchanged, still joins that form's list", async () => {
  // The first form's delivery: what the tool now holds for this person is stored with the link.
  const first = delivery("mailchimp", { config: { rules: NEW_RULES, list: { id: "aud1", name: "Leads" } }, consent: true, answer: mcAnswer });
  assert.equal((await first.run()).status, "done");
  assert.equal(first.stored.length, 1);
  // The second form, same person, nothing changed since: a CRM push would be skipped; the list add still goes.
  const d = delivery("mailchimp", { config: { rules: NEW_RULES, list: { id: "aud2", name: "Webinar" } }, consent: true, linked: first.stored[0], answer: mcAnswer });
  assert.equal((await d.run()).status, "done");
  assert.ok(d.calls.some((c) => c.method === "PUT" && c.url.includes("/lists/aud2/members/")), "the list add went out");
});

test("flaky: no list picked fails with what to do; no consent for a subscribers-only tool is skipped with why", async () => {
  const none = await delivery("mailchimp", { config: { rules: NEW_RULES }, consent: true, answer: mcAnswer }).run();
  assert.deepEqual(none, { status: "failed", error: "Pick a list in the form's Sync tab." });
  const skip = delivery("activecampaign", { config: { rules: NEW_RULES, list: { id: "7", name: "Leads" } }, consent: false, answer: () => ({}) });
  assert.deepEqual(await skip.run(), { status: "skipped", reason: "Not added: no email consent on this fill." });
  assert.equal(skip.calls.length, 0);
});

test("flaky: the tool down or rate limited is tried again; signed out says sign in again", async () => {
  const down = await delivery("mailerlite", { config: { rules: NEW_RULES, list: { id: "G", name: "G" } }, consent: true, answer: () => ({ status: 503, body: {} }) }).run();
  assert.equal(down.status, "retry");
  const limited = await delivery("mailerlite", { config: { rules: NEW_RULES, list: { id: "G", name: "G" } }, consent: true, answer: () => ({ status: 429, body: {} }) }).run();
  assert.equal(limited.status, "retry");
  const out = await delivery("mailerlite", { config: { rules: NEW_RULES, list: { id: "G", name: "G" } }, consent: true, answer: () => ({ status: 401, body: { message: "Unauthenticated." } }) }).run();
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.error : "", /^Sign in to mailerlite again/);
});

test("the list and tags read back cleaned; consent gives marketing only when asked", () => {
  assert.deepEqual(listOf({ list: { id: " aud1 ", name: "Leads" }, tags: [" Demo ", "demo", "", 3, "Webinar"] }), { list: { id: "aud1", name: "Leads" }, tags: ["Demo", "Webinar"] });
  assert.deepEqual(listOf({ list: { id: "" } }), { list: null, tags: [] });
  assert.equal(cleanTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 10);
  assert.equal(pushOptions(NEW_RULES, false)?.marketing, false);
  assert.equal(pushOptions({ ...NEW_RULES, consent: false }, false)?.marketing, true);
});
