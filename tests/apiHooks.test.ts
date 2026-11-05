// The Forms API's hooks and sign-in (docs/integrations-plan.md, Next step 1; src/lib/hooks/api.ts,
// src/lib/oauth/clients.ts, worker-intel/jobs/webhooks.ts): what a subscribe takes, a fill's body, the approve
// request and PKCE, and the flaky cases the reliability rule asks for: a fill hook that times out twice and then
// takes the send gets one fill with the same bytes each time, a hook that answers 410 is removed, and a fill in Spam
// or past the plan's fills never goes out.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { checkHook, fillData, fillHeld, fillHookBody, itemOf, sampleItem, viaOfKeyName, API_EVENTS, type HookFill } from "../src/lib/hooks/api.ts";
import { sealEndpoint, type Taken } from "../src/lib/meetings/webhooks.ts";
import { backTo, checkAuthorize, clientSecret, OAUTH_CLIENTS, pkceOk, sameSecret } from "../src/lib/oauth/clients.ts";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { webhookOnce } from "../worker-intel/jobs/webhooks.ts";

const KEY = "k".repeat(40);
const resolve = (async () => [{ address: "93.184.216.34", family: 4 }]) as never;
const SUB = "22222222-2222-4222-8222-222222222222";
const FORM = "33333333-3333-4333-8333-333333333333";
const DELIVERY = "44444444-4444-4444-8444-444444444444";
const HOOK = "55555555-5555-4555-8555-555555555555";

const form = (): Form => {
  const r = checkForm(pageForm({ html: `<form><input name="email" type="email" data-cl-save="email" aria-label="Work email"><input name="company" aria-label="Company"><button type="submit">Send</button></form>`, css: "", brand: "", after: { kind: "thanks" } }).form);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};

const fill = (o: Partial<HookFill["submission"]> = {}): HookFill => {
  const f = form();
  const keys = Object.fromEntries(f.steps.flatMap((s) => s.fields).map((x) => [x.label, x.key]));
  return {
    submission: { id: SUB, created_at: "2026-11-05T12:00:00Z", values: { [keys["Work email"]!]: "ada@acme.com", [keys.Company!]: "Acme" }, hidden: { utm_source: "google" }, test: false, form_version: 3, contact_id: "c1", ...o },
    form: { id: FORM, name: "Book a demo", body: f },
    contact: { id: "c1", email: "ada@acme.com", first_name: "Ada", last_name: null, title: null, phone: null, country: null, company: "Acme", company_domain: "acme.com" },
  };
};

test("a subscribe takes an https address and one event; forms only for fill hooks", () => {
  const ok = checkHook({ url: " https://hooks.zapier.com/hooks/standard/1/abc/ ", event: "form.submitted", form: FORM.toUpperCase(), via: "zapier" });
  assert.deepEqual(ok, { url: "https://hooks.zapier.com/hooks/standard/1/abc/", events: ["form.submitted"], forms: [FORM], via: "zapier", description: "" });
  assert.deepEqual((checkHook({ target_url: "https://a.io/x", events: ["meeting.booked", "meeting.canceled", "nope"] }) as { events: string[] }).events, ["meeting.booked", "meeting.canceled"]);
  assert.ok("error" in checkHook({ url: "http://a.io", event: "form.submitted" }));
  assert.ok("error" in checkHook({ url: "https://u:p@a.io", event: "form.submitted" }));
  assert.ok("error" in checkHook({ url: "https://a.io", event: "nope" }));
  assert.ok("error" in checkHook({ url: "https://a.io", event: "meeting.booked", form: FORM }));
  assert.ok("error" in checkHook({ url: "https://a.io", event: "form.submitted", form: "not-an-id" }));
  assert.equal((checkHook({ url: "https://a.io", event: "lead.routed", via: "evil" }) as { via: string }).via, "api");
  assert.equal(viaOfKeyName("Zapier"), "zapier");
  assert.equal(viaOfKeyName("CI key"), "api");
});

test("a fill's body: the fill's id, answers by key and by label, the contact and where it came from", () => {
  const b = fillHookBody(fill(), "ws1");
  assert.equal(b.id, `evt_${SUB.replace(/-/g, "")}`);
  assert.equal(b.event, "form.submitted");
  const d = fillData(fill());
  assert.deepEqual(d.answers_by_label, { "Work email": "ada@acme.com", Company: "Acme" });
  assert.equal(d.email, "ada@acme.com");
  assert.deepEqual(d.form, { id: FORM, name: "Book a demo", version: 3 });
  assert.deepEqual(d.meta, { utm_source: "google" });
  const item = itemOf(b);
  assert.equal(item.id, SUB);
  assert.equal(item.event_id, b.id);
  assert.equal(fillHeld(fill()), null);
  assert.match(fillHeld(fill({ spam: true }))!, /Spam/);
  assert.match(fillHeld(fill({ over_cap: true }))!, /past this plan/);
  assert.match(fillHeld(null)!, /deleted/);
  for (const e of API_EVENTS) assert.equal(sampleItem(e).event, e);
});

test("sign-in: only each app's own return address, S256 code checks, and the state comes back", () => {
  const zap = checkAuthorize({ client_id: "zapier", redirect_uri: "https://zapier.com/dashboard/auth/oauth/return/App123CLIAPI/", state: "s1", response_type: "code" });
  assert.ok(!("error" in zap));
  assert.ok("error" in checkAuthorize({ client_id: "zapier", redirect_uri: "https://evil.example/zapier.com/dashboard/auth/oauth/return/x/" }));
  assert.ok("error" in checkAuthorize({ client_id: "zapier", redirect_uri: "https://zapier.com.evil.example/dashboard/auth/oauth/return/x/" }));
  assert.ok("error" in checkAuthorize({ client_id: "make", redirect_uri: "https://www.make.com/oauth/cb/app/../../x" }));
  assert.ok(!("error" in checkAuthorize({ client_id: "make", redirect_uri: "https://www.make.com/oauth/cb/app" })));
  assert.ok("error" in checkAuthorize({ client_id: "nobody", redirect_uri: "https://a.io" }));
  assert.ok("error" in checkAuthorize({ client_id: "activepieces", redirect_uri: "https://cloud.activepieces.com/redirect", code_challenge: "x".repeat(43), code_challenge_method: "plain" }));
  assert.equal(backTo("https://www.make.com/oauth/cb/app", { code: "abc", state: "s 1" }), "https://www.make.com/oauth/cb/app?code=abc&state=s+1");
  assert.equal(backTo("https://cloud.activepieces.com/redirect", { error: "access_denied", state: "" }), "https://cloud.activepieces.com/redirect?error=access_denied");

  const verifier = "v".repeat(50);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.ok(pkceOk(challenge, verifier));
  assert.ok(!pkceOk(challenge, "w".repeat(50)));
  assert.ok(!pkceOk(challenge, undefined));
  assert.ok(pkceOk(null, undefined));

  assert.equal(clientSecret(OAUTH_CLIENTS.zapier, {}), null, "an app with no secret can't sign in");
  assert.equal(clientSecret(OAUTH_CLIENTS.zapier, { OAUTH_ZAPIER_SECRET: " s3 " }), "s3");
  assert.ok(sameSecret("abc", "abc"));
  assert.ok(!sameSecret("abc", "abd"));
});

/** The database side of one fill hook send, in memory. */
function fakeDb(o: { held?: Partial<HookFill["submission"]> | "gone"; via?: string } = {}) {
  const row = { frozen: false, body: { id: `evt_${SUB.replace(/-/g, "")}`, event: "form.submitted", created_at: "2026-11-05T12:00:00Z", workspace_id: "ws1", test: false, data: {} } as unknown as Taken["body"], status: "pending", code: null as number | null, error: null as string | null };
  const ep = sealEndpoint("https://hooks.zapier.com/hooks/standard/1/abc/", "whsec_abc", KEY);
  const reads: string[] = [];
  const removed: unknown[] = [];
  const rpc: Rpc = async (fn, args) => {
    reads.push(fn);
    if (fn === "webhook_take") {
      if (row.status === "done") return { data: null, error: null };
      const t: Taken = { id: DELIVERY, event: "form.submitted", body: structuredClone(row.body), frozen: row.frozen, attempts: 1, active: true, sealed: ep.sealed, meeting: null, endpoint_id: HOOK, via: o.via ?? "zapier", submission_id: SUB };
      return { data: t, error: null };
    }
    if (fn === "hook_fill") return { data: o.held === "gone" ? null : fill(o.held ?? {}), error: null };
    if (fn === "webhook_freeze") {
      if (!row.frozen) {
        row.body = structuredClone(args.p_body as Taken["body"]);
        row.frozen = true;
      }
      return { data: null, error: null };
    }
    if (fn === "webhook_done") {
      row.status = String(args.p_status);
      row.code = (args.p_code as number | null) ?? null;
      row.error = (args.p_error as string | null) ?? null;
      return { data: null, error: null };
    }
    if (fn === "api_hook_remove") {
      removed.push(args.p_id);
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  return { rpc, row, reads, removed };
}

const net = (...list: (Response | Error)[]) => {
  const bodies: string[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(init.body as string);
    const next = list.shift();
    if (!next) throw new Error("no more answers");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { bodies, fetcher };
};
const deps = (fetcher: typeof fetch) => ({ fetcher, resolve, base: "https://app.tryclaritia.com", secret: KEY });
const timeout = () => Object.assign(new Error("timed out"), { name: "TimeoutError" });

test("flaky: a fill hook that times out twice and then takes it gets one fill, the same bytes each time", async () => {
  const db = fakeDb();
  const n = net(timeout(), timeout(), new Response("ok", { status: 200 }));
  assert.ok((await webhookOnce(db.rpc, deps(n.fetcher), DELIVERY, false)).retry);
  assert.ok((await webhookOnce(db.rpc, deps(n.fetcher), DELIVERY, false)).retry);
  assert.deepEqual(await webhookOnce(db.rpc, deps(n.fetcher), DELIVERY, false), {});
  assert.equal(db.row.status, "done");
  assert.equal(db.reads.filter((f) => f === "hook_fill").length, 1, "the fill is read once, on the first try");
  assert.equal(new Set(n.bodies).size, 1, "every try sends the same bytes");
  const sent = JSON.parse(n.bodies[0]!) as { id: string; data: { fill: { answers_by_label: Record<string, string> } } };
  assert.equal(sent.id, `evt_${SUB.replace(/-/g, "")}`);
  assert.equal(sent.data.fill.answers_by_label["Work email"], "ada@acme.com");
  // A late duplicate job sends nothing.
  assert.deepEqual(await webhookOnce(db.rpc, deps(net().fetcher), DELIVERY, false), {});
});

test("flaky: an app's hook that answers 410 is removed; a person's is only marked failed", async () => {
  const app = fakeDb();
  await webhookOnce(app.rpc, deps(net(new Response("gone", { status: 410 })).fetcher), DELIVERY, false);
  assert.deepEqual(app.removed, [HOOK]);
  assert.equal(app.row.status, "failed");
  const own = fakeDb({ via: "app" });
  await webhookOnce(own.rpc, deps(net(new Response("gone", { status: 410 })).fetcher), DELIVERY, false);
  assert.deepEqual(own.removed, []);
  assert.equal(own.row.status, "failed");
});

test("a fill in Spam, past the plan's fills, or deleted never goes out", async () => {
  for (const held of [{ spam: true }, { over_cap: true }, "gone"] as const) {
    const db = fakeDb({ held });
    const n = net();
    assert.deepEqual(await webhookOnce(db.rpc, deps(n.fetcher), DELIVERY, false), {});
    assert.equal(n.bodies.length, 0);
    assert.equal(db.row.status, "failed");
  }
});
