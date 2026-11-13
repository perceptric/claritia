import { test } from "node:test";
import assert from "node:assert/strict";
import { designOf, emailSteps, ensurePayload, firstMismatch, mergeCopies, sameEmail, stable, type EmailCopy } from "../src/lib/workflows/stepEmails.ts";
import { editorReducer, startEditor } from "../src/components/app/workflows/model.ts";
import { emptyBody, type Body, type Step } from "../src/lib/workflows/types.ts";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
import { emailsPage } from "../src/lib/nav.ts";

// Automation emails on the Emails canvas (docs/email-unify-plan.md, E3; src/lib/workflows/stepEmails.ts): the draft
// and the editing copies agree, approval follows the words, and Publish never sends words nobody looked at.

const email = (id: string, subject: string, approved = true, paragraphs = ["Hi there"]): Step => ({ id, kind: "email", email: { subject, preheader: "", paragraphs, cta_label: "", cta_url: "" }, from: "team", approved }) as Step;
const body = (...steps: Step[]): Body => ({ ...emptyBody(), steps });
const copyOf = (s: Step, over: Partial<EmailCopy> = {}): EmailCopy => {
  const e = (s as Extract<Step, { kind: "email" }>).email;
  return { id: `c-${s.id}`, step: s.id, subject: e.subject, preheader: e.preheader, doc: JSON.parse(JSON.stringify(designOf(e))), ...over };
};
const reorder = (v: unknown): unknown => (Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v);

test("email steps are found in branches too, in the flow's order", () => {
  const b = body(email("a", "One"), { id: "br", kind: "branch", match: "all", conds: [], yes: [email("b", "Two")], no: [email("c", "Three")] } as Step);
  assert.deepEqual(emailSteps(b).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(ensurePayload(b).map((p) => p.step), ["a", "b", "c"]);
});

test("the same words compare equal even when the database reorders the design's keys", () => {
  const s = email("a", "Thanks") as Extract<Step, { kind: "email" }>;
  const doc = readEmailDoc(designOf(s.email), { allowHtml: true });
  const withDoc = { ...s.email, doc };
  assert.equal(sameEmail(withDoc, { subject: "Thanks ", doc: reorder(JSON.parse(JSON.stringify(doc))) }), true);
  assert.equal(sameEmail(withDoc, { subject: "Thanks!", doc }), false);
  assert.equal(stable({ b: 1, a: [2, { d: 3, c: 4 }] }), stable({ a: [2, { c: 4, d: 3 }], b: 1 }));
});

test("a copy made just now keeps the step's approval; a copy with new words takes it away", () => {
  const a = email("a", "Thanks");
  const b = email("b", "Later");
  // a's copy was just made from the step (same words, now a design); b's copy was edited on the canvas.
  const copies = [{ ...copyOf(a), made: true }, copyOf(b, { subject: "Later, with news" })];
  const { body: merged, changed } = mergeCopies(body(a, b), copies);
  const [ma, mb] = merged.steps as Extract<Step, { kind: "email" }>[];
  assert.equal(ma!.approved, true);
  assert.ok(ma!.email.doc, "the step now holds the design");
  assert.equal(mb!.approved, false, "new words need a new approval");
  assert.equal(mb!.email.subject, "Later, with news");
  assert.deepEqual(changed, ["b"]);
  // Merging again changes nothing.
  const again = mergeCopies(merged, copies.map((c) => ({ ...c, made: false, subject: c.step === "b" ? "Later, with news" : c.subject })));
  assert.deepEqual(again.changed, []);
  assert.deepEqual(again.body, merged);
});

test("Publish refuses an approved email whose copy changed afterwards, and only then", () => {
  const a = email("a", "Thanks");
  const merged = mergeCopies(body(a), [{ ...copyOf(a), made: true }]).body;
  const c = copyOf(merged.steps[0]!);
  // Copies match: nothing to refuse, whatever order the keys come back in.
  assert.equal(firstMismatch(merged, [{ ...c, doc: reorder(c.doc) }]), null);
  // Someone edits the email on the canvas after it was approved: Publish refuses with that step.
  const edited = JSON.parse(JSON.stringify(c.doc)) as { sections: { columns: { blocks: { html?: string }[] }[] }[] };
  edited.sections[0]!.columns[0]!.blocks[0]!.html = "<p>Different words</p>";
  assert.equal(firstMismatch(merged, [{ ...c, doc: edited }])?.id, "a");
  // No copy at all (it couldn't be made): the draft's own words publish.
  assert.equal(firstMismatch(merged, []), null);
});

test("words from the copies reach every undo step, and aren't an undo step themselves", () => {
  let s = startEditor(body(email("a", "Old")));
  s = editorReducer(s, { type: "set", body: body(email("a", "Old"), email("b", "Two")) });
  const fn = (b: Body) => ({ ...b, steps: b.steps.map((x) => (x.kind === "email" && x.id === "a" ? ({ ...x, email: { ...x.email, subject: "New" } } as Step) : x)) });
  s = editorReducer(s, { type: "sync", fn });
  assert.equal(s.past.length, 1);
  s = editorReducer(s, { type: "undo" });
  assert.equal((s.body.steps[0] as Extract<Step, { kind: "email" }>).email.subject, "New", "undo keeps the canvas's words");
  assert.equal(s.body.steps.length, 1);
});

test("an automation's emails open as their own group on Emails", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(emailsPage(`campaigns/group/wf:${id}`), { page: "campaigns", id: `campaigns/group/wf:${id}`, group: `wf:${id}` });
  assert.deepEqual(emailsPage("campaigns/group/wf:nope"), { page: "automations", id: "automations" });
});

test("every email gets a Footer block when it has none, and keeps its own when it has one", async () => {
  const { withFooter } = await import("../src/lib/workflows/stepEmails.ts");
  const { docFromBody } = await import("../src/lib/design/email/doc.ts");
  const bare = docFromBody({ preheader: "", paragraphs: ["Hi"], cta_label: "", cta_url: "" });
  const footed = withFooter(bare);
  const footers = (d: typeof bare) => d.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks)).filter((b) => b.type === "footer").length;
  assert.equal(footers(bare), 0);
  assert.equal(footers(footed), 1);
  assert.equal(withFooter(footed), footed, "one already there stays the only one");
  const ids = footed.sections.flatMap((x) => [x.id, ...x.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)])]);
  assert.equal(new Set(ids).size, ids.length, "its ids are new");
});

test("Publish takes each email as it is on the Emails page: no refusal, the newer words win", () => {
  const a = email("a", "Thanks", false);
  const c = { ...copyOf(a), subject: "Thanks, with news" };
  const merged = mergeCopies(body(a), [c]).body;
  assert.equal((merged.steps[0] as Extract<Step, { kind: "email" }>).email.subject, "Thanks, with news");
});
