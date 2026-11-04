// Share › Email (src/lib/share/people.ts): the addresses in any pasted text or CSV, everyone who filled a form (real
// fills only, each once), and where each person a send went to is. A fill from before the email doesn't count as
// Finished, a bounce is Not delivered, an opened link is In progress, and before 125 there's nothing to follow.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emailsIn, formFillers, sendStatus, shareSends } from "../src/lib/share/people.ts";

test("the addresses in a pasted list, an email thread or a CSV, each once", () => {
  assert.deepEqual(emailsIn("Maya Chen <Maya@Northwind.io>, priya@harbor.app; maya@northwind.io\nnot an email, @x, a@b"), ["maya@northwind.io", "priya@harbor.app"]);
  assert.deepEqual(emailsIn('name,email\n"Lee, Ana",ana@acme.com\nBo,bo.k+news@acme.co.uk\n'), ["ana@acme.com", "bo.k+news@acme.co.uk"]);
  assert.deepEqual(emailsIn("write to sales@acme.com."), ["sales@acme.com"]);
  assert.deepEqual(emailsIn(""), []);
});

/** A client that answers each table from a list and records the filters it was asked for. */
function fakeDb(tables: Record<string, unknown[] | { error: string }>) {
  const asked: [string, string, unknown][] = [];
  const from = (t: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "not", "or", "order", "limit", "in", "gte"]) q[k] = (...a: unknown[]) => (asked.push([t, k, a]), q);
    const v = tables[t];
    q.then = (res: (r: unknown) => unknown) => Promise.resolve(v && "error" in v ? { data: null, error: { message: v.error } } : { data: v ?? [], error: null }).then(res);
    return q;
  };
  return { db: { from } as never, asked };
}

test("everyone who filled the form: real fills only, each address once, the newest first", async () => {
  const { db, asked } = fakeDb({ submissions: [{ values: { email: "Ana@Acme.com", first_name: "Ana", last_name: "Lee" } }, { values: { email: "ana@acme.com" } }, { values: { name: "No email" } }, { values: { email: "bo@acme.com", name: "Bo" } }] });
  assert.deepEqual(await formFillers(db, "w", "f"), [{ email: "ana@acme.com", name: "Ana Lee" }, { email: "bo@acme.com", name: "Bo" }]);
  const filters = asked.filter(([, k]) => k === "eq").map(([, , a]) => (a as unknown[]).join("="));
  assert.ok(filters.includes("spam=false") && filters.includes("test=false") && filters.includes("form_id=f") && filters.includes("workspace_id=w"));
});

const SENT = "2026-11-04T10:00:00Z";
const msg = (to: string, o: Partial<{ status: string; first_click_at: string | null }> = {}) => ({ to_email: to, status: o.status ?? "delivered", first_click_at: o.first_click_at ?? null, created_at: SENT });

test("where each person is: Finished after a fill from their address made after the email, never before", () => {
  const people = sendStatus(
    [msg("a@acme.com"), msg("b@acme.com", { first_click_at: "2026-11-04T10:05:00Z" }), msg("c@acme.com", { status: "bounced" }), msg("D@acme.com"), msg("e@acme.com", { first_click_at: "2026-11-04T10:02:00Z" })],
    [
      { email: "a@acme.com", at: "2026-11-01T09:00:00Z" },
      { email: "d@acme.com", at: "2026-11-04T11:00:00Z" },
      { email: " E@acme.com ", at: "2026-11-04T10:20:00Z" },
    ],
  );
  assert.deepEqual(
    people.map((p) => `${p.email}:${p.status}`),
    ["a@acme.com:not", "b@acme.com:started", "c@acme.com:failed", "d@acme.com:done", "e@acme.com:done"],
  );
  assert.deepEqual(sendStatus([msg("x@acme.com", { status: "queued" })], []), [{ email: "x@acme.com", status: "not" }]);
});

test("a form's sends: each with its people; before 125 (no form_id) there are none, and a real error still shows", async () => {
  const ok = fakeDb({
    emails: [{ id: "e1", subject: "Book a demo", created_at: SENT }],
    email_messages: [{ email_id: "e1", ...msg("a@acme.com") }, { email_id: "e1", ...msg("b@acme.com") }],
    submissions: [{ values: { email: "b@acme.com" }, created_at: "2026-11-04T12:00:00Z" }],
  });
  const s = await shareSends(ok.db, "w", "f");
  assert.equal(s.length, 1);
  assert.deepEqual(s[0]!.people.map((p) => p.status), ["not", "done"]);
  assert.deepEqual(await shareSends(fakeDb({ emails: { error: "column emails.form_id does not exist" } }).db, "w", "f"), []);
  assert.deepEqual(await shareSends(fakeDb({ emails: [] }).db, "w", "f"), []);
  await assert.rejects(() => shareSends(fakeDb({ emails: { error: "permission denied" } }).db, "w", "f"), /permission denied/);
});
