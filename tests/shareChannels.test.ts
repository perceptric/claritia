// Share (docs/sharing-plan.md): personal links and where each fill came from. A personal link's token is good only
// unchanged, before its date and in its own workspace; a form link in an email is told apart from every other link;
// the fill keeps the channel the form saw, "personal" only when the server checked the token, the site's own form as
// its own; Submissions filters by channel; a sheet row says where it came from; a personal link fills in only the
// contact questions the form asks, and nothing for a contact that's gone.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanFilters, META_KEYS } from "../src/lib/forms/results.ts";
import { checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, prepareSubmit, type PublicForm } from "../src/lib/forms/submit.ts";
import { fillRow } from "../src/lib/delivery/fillRow.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { CHANNELS, channelLabel, viaLink } from "../src/lib/share/channels.ts";
import { isFormLink, personalLink, personalToken, readPersonal } from "../src/lib/share/personal.ts";

const SECRET = "test-secret-that-is-long-enough-1234567890";
const WS = "0192f3a1-0000-7000-8000-00000000aaaa";
const CONTACT = "0192f3a1-0000-7000-8000-00000000cccc";
const NOW = Date.parse("2026-11-04T12:00:00Z");

test("a personal token is good unchanged, before its date and in its workspace; anything else is no token", () => {
  const t = personalToken({ ws: WS, contact: CONTACT }, SECRET, NOW);
  assert.deepEqual(readPersonal(t, SECRET, WS, NOW), { w: WS, c: CONTACT, x: Math.floor(NOW / 1000) + 90 * 86_400 });
  // An email with no contact yet.
  const e = personalToken({ ws: WS, email: " Ana@Acme.com " }, SECRET, NOW);
  assert.equal(readPersonal(e, SECRET, WS, NOW)?.e, "ana@acme.com");
  // The person is in the token only as a contact id or an email, never their name or company.
  assert.ok(!Buffer.from(t.split(".")[0]!, "base64url").toString().includes("first_name"));
  const [body, mac] = t.split(".");
  const other = Buffer.from(JSON.stringify({ w: WS, c: "0192f3a1-0000-7000-8000-00000000dddd", x: Math.floor(NOW / 1000) + 999 })).toString("base64url");
  assert.equal(readPersonal(`${other}.${mac}`, SECRET, WS, NOW), null, "someone else's contact in the body");
  assert.equal(readPersonal(`${body}.${mac!.slice(0, -2)}xx`, SECRET, WS, NOW), null, "an edited signature");
  assert.equal(readPersonal(t, SECRET, "0192f3a1-0000-7000-8000-00000000bbbb", NOW), null, "another workspace's form");
  assert.equal(readPersonal(t, SECRET, WS, NOW + 91 * 86_400_000), null, "past its date");
  assert.equal(readPersonal(t, "another-secret-entirely-1234567890", WS, NOW), null, "made with another key");
  assert.equal(readPersonal(t, undefined, WS, NOW), null);
  for (const bad of [null, 5, "", "a.b.c", "nodot", `${body}.`, `.${mac}`]) assert.equal(readPersonal(bad, SECRET, WS, NOW), null, String(bad));
  assert.throws(() => personalToken({ ws: WS }, SECRET), /contact or an email/);
  assert.throws(() => personalToken({ ws: WS, email: "not an email" }, SECRET), /contact or an email/);
});

test("links: a personal link carries its token and channel; only the workspace's form links are made personal", () => {
  const u = new URL(personalLink("https://app.tryclaritia.com/f/acme/demo?utm_source=news", "tok.en", "email"));
  assert.equal(u.searchParams.get("p"), "tok.en");
  assert.equal(u.searchParams.get("via"), "email");
  assert.equal(u.searchParams.get("utm_source"), "news");
  assert.equal(new URL(personalLink("https://app.tryclaritia.com/f/x?via=qr", "t", "email")).searchParams.get("via"), "qr", "a channel already on the link stays");
  assert.equal(new URL(viaLink("https://app.tryclaritia.com/f/x", "qr")).searchParams.get("via"), "qr");
  const app = { appHost: "app.tryclaritia.com" };
  assert.ok(isFormLink("https://app.tryclaritia.com/f/0192f3a1-0000-7000-8000-0000000000ff", app));
  assert.ok(isFormLink("https://app.tryclaritia.com/f/acme/demo-request", app));
  assert.ok(!isFormLink("https://app.tryclaritia.com/f/embed.js", app));
  assert.ok(!isFormLink("https://app.tryclaritia.com/book/acme/demo", app), "a booking page");
  assert.ok(!isFormLink("https://app.tryclaritia.com/", app));
  assert.ok(!isFormLink("https://acme.com/pricing", app), "the customer's own site");
  assert.ok(isFormLink("https://forms.acme.com/demo", { ...app, ownHost: "forms.acme.com" }), "the workspace's own link domain");
  assert.ok(!isFormLink("https://forms.acme.com/", { ...app, ownHost: "forms.acme.com" }));
  assert.ok(!isFormLink("javascript:alert(1)", app));
});

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const ok = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join("; "));
  return r.form;
};
const FORM = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { id: "fn", key: "first_name", type: "text", label: "First name", required: false }] }] });
const fill = (extra: Record<string, unknown> = {}) => ({ v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com" }, ms: 9000, trap: "", ...extra });
const metaOf = (r: ReturnType<typeof prepareSubmit>) => ("args" in r ? r.args.p_hidden : null) as Record<string, string> | null;

test("the fill keeps its channel: what the form saw, personal only when checked, the site's own form as its own", () => {
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "qr" }), { custom: [] }))?.channel, "qr");
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "popup" }), { custom: [] }))?.channel, "popup");
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "nonsense" }), { custom: [] }))?.channel, undefined);
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill(), { custom: [] }))?.channel, undefined, "a script from before channels says nothing");
  // Never on the browser's word alone.
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "personal" }), { custom: [] }))?.channel, undefined);
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "own" }), { custom: [] }))?.channel, undefined);
  assert.equal(metaOf(prepareSubmit(FORM, 1, fill({ channel: "link" }), { custom: [] }, { personal: true }))?.channel, "personal");
  const viaEmail = metaOf(prepareSubmit(FORM, 1, fill({ channel: "email" }), { custom: [] }, { personal: true }));
  assert.deepEqual([viaEmail?.channel, viaEmail?.personal], ["email", "yes"], "a personal link sent by email stays Email");
  const own = ok({ ...FORM, capture: { adapter: "html" }, steps: [{ id: "s1", fields: [{ ...EMAIL, source: "email" }] }] });
  assert.equal(metaOf(prepareSubmit(own, 1, fill({ channel: "inline" }), { custom: [] }))?.channel, "own");
});

test("sends: a personal link's token counts only when it's good and for this workspace", async () => {
  const sent: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => (fn === "form_submit_all" ? (sent.push(args), { data: { id: "0192f3a1-0000-7000-8000-00000000abcd" }, error: null }) : { data: null, error: null });
  const pub: PublicForm = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: WS, version: 1, status: "live", body: FORM, logo_url: null };
  const good = personalToken({ ws: WS, contact: CONTACT }, SECRET);
  const foreign = personalToken({ ws: "0192f3a1-0000-7000-8000-00000000bbbb", contact: CONTACT }, SECRET);
  for (const [token, want] of [[good, "personal"], [foreign, "link"], ["junk.token", "link"]] as const) {
    sent.length = 0;
    const r = await acceptFill(rpc, pub, { ...fill({ channel: "link", personal: token }), key: `k${token.length}`.padEnd(20, "x") }, { custom: [] }, { secret: SECRET });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal((sent[0]!.p_hidden as Record<string, string>).channel, want, String(token).slice(0, 12));
  }
});

test("Submissions filters by channel; the export and a sheet row say where it came from", () => {
  assert.deepEqual(cleanFilters({ kind: "leads", channel: "qr" }), { kind: "leads", channel: "qr" });
  assert.deepEqual(cleanFilters({ channel: "<script>" }), {});
  assert.equal(META_KEYS[0], "channel");
  assert.equal(CHANNELS.length, 11);
  for (const c of CHANNELS) assert.ok(channelLabel(c), c);
  const row = fillRow({ id: "s1", created_at: "2026-11-04T12:00:00Z", values: { email: "ana@acme.com" }, hidden: { channel: "qr", utm_source: "flyer" } }, { name: "Event", body: FORM });
  assert.ok(row.cells.some((c) => c.name === "Came from" && c.value === "QR code"));
  assert.ok(!row.cells.some((c) => c.name === "channel"));
});

/** A database with one contact and their company, for what a personal link fills in. */
function contactDb(c: Record<string, unknown> | null) {
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq"]) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve({ data, error: null });
    return q;
  };
  return { from: (t: string) => chain(t === "contacts" ? c : { name: "Acme", domain: "acme.com" }) } as never;
}

test("a personal link fills in only the contact questions the form asks, and nothing for a contact that's gone", async () => {
  const { knownFor } = await import("../src/lib/share/known.ts");
  const c = { email: "ana@acme.com", first_name: "Ana", last_name: "Lee", title: "CTO", phone: "+1 555 0100", country: "US", region: null, company_id: "co", deleted_at: null };
  const person = { w: WS, c: CONTACT, x: 0 };
  assert.deepEqual(await knownFor(contactDb(c), person, FORM), { email: "ana@acme.com", first_name: "Ana" }, "only what the form asks");
  const withCompany = ok({ ...FORM, steps: [{ id: "s1", fields: [EMAIL, { id: "co", key: "company", type: "text", label: "Company", required: false }] }] });
  assert.deepEqual(await knownFor(contactDb(c), person, withCompany), { email: "ana@acme.com", company: "Acme" });
  assert.deepEqual(await knownFor(contactDb({ ...c, deleted_at: "2026-11-01" }), person, FORM), {});
  assert.deepEqual(await knownFor(contactDb(null), person, FORM), {}, "another workspace's contact isn't found");
  assert.deepEqual(await knownFor(contactDb(null), { w: WS, e: "new@acme.com", x: 0 }, FORM), { email: "new@acme.com" });
});
