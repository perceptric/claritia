// Settings › Access (src/lib/forms/access.ts): a form opens on a date, closes on a date or once it has its number of
// real fills, and says its closed message while shut. The send checks it again (a page loaded before the close can't
// slip a fill in), a fill count that can't be read never closes the form by mistake, and a Funnel QA test still goes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { accessShut, CLOSED, closedMessage } from "../src/lib/forms/access.ts";
import { applyOp } from "../src/lib/forms/ops.ts";
import { checkForm, cleanAccess, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";

const NOW = Date.parse("2026-11-04T12:00:00Z");
const ok = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join("; "));
  return r.form;
};

test("the settings are kept clean: real times, a close after the open, a whole limit, a short message", () => {
  assert.deepEqual(cleanAccess({ opens: "2026-11-10T09:00:00+01:00", closes: "2026-12-01T17:00:00Z", limit: "200.4", message: "  Closed for the season.  " }), { opens: "2026-11-10T08:00:00.000Z", closes: "2026-12-01T17:00:00.000Z", limit: 200, message: "Closed for the season." });
  assert.deepEqual(cleanAccess({ opens: "2026-12-01T00:00:00Z", closes: "2026-11-01T00:00:00Z" }), { opens: "2026-12-01T00:00:00.000Z" }, "a close before the open goes");
  assert.equal(cleanAccess({ opens: "soon", limit: 0, message: "" }), undefined);
  assert.equal(cleanAccess(null), undefined);
  const f = ok({ ...emptyForm(), access: { limit: 5, junk: 1 } });
  assert.deepEqual(f.access, { limit: 5 });
});

test("set_access changes one setting at a time, and null takes it off", () => {
  let f = ok(emptyForm());
  const step = (access: Record<string, unknown>) => {
    const r = applyOp(f, { op: "set_access", access } as never);
    if ("error" in r) throw new Error(String(r.error));
    f = r.form;
  };
  step({ closes: "2026-12-01T17:00:00Z" });
  step({ limit: 50 });
  assert.deepEqual(f.access, { closes: "2026-12-01T17:00:00.000Z", limit: 50 });
  step({ closes: null, message: "Thanks, we're full." });
  assert.deepEqual(f.access, { limit: 50, message: "Thanks, we're full." });
  step({ limit: null, message: null });
  assert.equal(f.access, undefined);
});

test("shut before it opens, from its close time on, and once full; a count that can't be read keeps it open", async () => {
  const at = (access: Form["access"]) => ({ access });
  assert.equal(await accessShut(at(undefined), NOW), null);
  assert.equal(await accessShut(at({ opens: "2026-11-05T00:00:00Z" }), NOW), "early");
  assert.equal(await accessShut(at({ opens: "2026-11-04T12:00:00Z" }), NOW), null, "open from the minute it opens");
  assert.equal(await accessShut(at({ closes: "2026-11-04T12:00:00Z" }), NOW), "late", "closed from the minute it closes");
  assert.equal(await accessShut(at({ closes: "2026-11-04T12:00:01Z" }), NOW), null);
  assert.equal(await accessShut(at({ limit: 3 }), NOW, async () => 3), "full");
  assert.equal(await accessShut(at({ limit: 3 }), NOW, async () => 2), null);
  assert.equal(await accessShut(at({ limit: 3 }), NOW, async () => null), null, "unknown count");
  assert.equal(await accessShut(at({ limit: 3 }), NOW, () => Promise.reject(new Error("timeout"))), null, "a count that fails");
  assert.equal(await accessShut(at({ limit: 3 }), NOW), null, "no counter");
  let asked = 0;
  await accessShut(at({ closes: "2026-12-01T00:00:00Z" }), NOW, async () => (asked++, 0));
  assert.equal(asked, 0, "the count is only read for a form with a limit");
  assert.equal(closedMessage({ access: { message: "Back in spring." } }), "Back in spring.");
  assert.equal(closedMessage({}), CLOSED);
});

test("the send is refused with the closed message once shut, and a Funnel QA test still goes", async () => {
  const EMAIL = { id: "e", key: "email", type: "email", label: "Email", required: true };
  const body = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL] }], access: { closes: "2026-11-04T11:00:00Z", message: "Sign-ups are closed." } });
  const sent: unknown[] = [];
  const rpc: Rpc = async (fn, args) => (fn === "form_submit_all" ? (sent.push(args), { data: { id: "0192f3a1-0000-7000-8000-00000000abcd" }, error: null }) : { data: null, error: null });
  const pub: PublicForm = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 1, status: "live", body, logo_url: null };
  const fill = { v: 1, version: 1, key: "k".repeat(20), answers: { e: "ana@acme.com" }, ms: 9000, trap: "" };
  const shut = await acceptFill(rpc, pub, fill, { custom: [] }, { now: NOW });
  assert.equal(shut.status, 410);
  assert.equal(shut.body.error, "Sign-ups are closed.");
  assert.equal(sent.length, 0);
  const qa = await acceptFill(rpc, pub, { ...fill, key: "q".repeat(20) }, { custom: [] }, { now: NOW, test: true });
  assert.equal(qa.status, 200, JSON.stringify(qa.body));
  // Full: the limit's count comes from the route.
  const full = { ...pub, body: { ...body, access: { limit: 10 } } };
  assert.equal((await acceptFill(rpc, full, { ...fill, key: "f".repeat(20) }, { custom: [] }, { now: NOW, fills: async () => 10 })).status, 410);
  assert.equal((await acceptFill(rpc, full, { ...fill, key: "g".repeat(20) }, { custom: [] }, { now: NOW, fills: async () => 9 })).status, 200);
});
