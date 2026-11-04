// Live forms made before Form Studio are served as Studio pages (src/lib/studio/liveForm.ts, src/lib/forms/submit.ts
// studioPublic): every template as an older live form becomes a page that keeps its field ids, save keys, meeting and
// settings, the same way every time; the look is the brand's Studio stylesheet, the gallery style or the plain one;
// a send is checked against the page, against an older version a visitor started on, and (for a visitor who loaded the
// older form before it turned) against the form they filled. No old tokens, skin or design system anywhere.
import assert from "node:assert/strict";
import { test } from "node:test";
import { TEMPLATES, templateTheme } from "../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../src/lib/forms/gallery/convert.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../src/lib/forms/submit.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";
import { lookCss, needsStudio, studioForm, studioPublic } from "../src/lib/studio/liveForm.ts";
import { cleanPageCss } from "../src/lib/studio/page.ts";
import { styleCssById, styleOf } from "../src/lib/studio/styleCss.ts";

const ok = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join("; "));
  return r.form;
};
const asked = (f: Form) => allFields(f).filter((x) => !["heading", "paragraph", "divider", "image", "hidden"].includes(x.type));

test("every template, live from before the Studio, becomes the same page every time, keeping ids, keys and settings", () => {
  for (const t of TEMPLATES) {
    const base = templateForm(t);
    const hasEmail = allFields(base).some((f) => f.key === "email");
    const old = ok({ ...base, notify: { emails: ["team@acme.com"] }, ...(hasEmail ? { reply: { on: true, subject: "Thanks", body: "We got it." } } : {}) });
    const a = studioForm(old, styleCssById(templateTheme(t)));
    assert.ok(!("error" in a), `${t.id}: ${"error" in a ? a.error : ""}`);
    if ("error" in a) continue;
    assert.ok(a.form.page && !needsStudio(a.form), `${t.id} is a page`);
    const b = studioForm(old, styleCssById(templateTheme(t)));
    assert.equal(JSON.stringify(a.form), JSON.stringify("form" in b ? b.form : null), `${t.id} turns the same way every time`);
    const ids = new Map(asked(a.form).map((f) => [f.id, f]));
    for (const f of asked(old)) {
      if (f.type === "calc" || f.type === "payment") continue;
      const g = ids.get(f.id);
      assert.ok(g, `${t.id}: ${f.label} keeps its id`);
      if (g && f.key && f.key !== "email") assert.equal(g.key, f.key, `${t.id}: ${f.label} keeps where it saves`);
    }
    for (const k of ["notify", "reply", "consent", "spam"] as const) assert.deepEqual(a.form[k], old[k], `${t.id}: ${k} as it was`);
    assert.deepEqual(a.form.after.schedule ?? null, old.after.schedule ?? null, `${t.id}: the meeting it books`);
    assert.equal(styleOf(a.form.page!.brand), templateTheme(t), `${t.id}: in its style`);
  }
});

test("the look: the brand's Studio stylesheet, else the gallery style its kit was made for, else plain", () => {
  assert.equal(lookCss({ studio_css: ":root{--brand-primary:#123456}", notes: ["style:poster"] }), ":root{--brand-primary:#123456}");
  assert.equal(styleOf(lookCss({ studio_css: null, notes: ["Matched to your form", "style:grove"] })), "grove");
  assert.equal(lookCss({ notes: ["style:nope"] }), DEFAULT_BRAND_CSS);
  assert.equal(lookCss(null), DEFAULT_BRAND_CSS);
});

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Work email", required: true };
const SIZE: Field = { id: "size", key: "q.size", type: "choice", label: "Team size", required: true, options: [{ value: "1-10", label: "1-10" }, { value: "11-50", label: "11-50" }], other: true };
const ROUTED: Form = ok({
  ...emptyForm(),
  steps: [{ id: "s1", fields: [EMAIL, SIZE] }],
  after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: "0192f3a1-0000-7000-8000-0000000000aa", routes: [{ id: "r1", conds: [{ field: "size", op: "any_of", values: ["11-50"] }, { field: "e", op: "contains", value: "acme" }], meet: "0192f3a1-0000-7000-8000-0000000000bb" }] } },
});

test("a meeting route the On submission tab can't show still books exactly as before", () => {
  const r = studioForm(ROUTED, DEFAULT_BRAND_CSS);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.deepEqual(r.form.after.schedule, ROUTED.after.schedule);
  assert.ok(r.lost.some((x) => /route/i.test(x)), "and the owner is told when it opens");
});

test("served: an older live form is a page with its stored form kept; a page and a site's own form are left as they are", () => {
  const pub = (body: Form): PublicForm => ({ id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 3, status: "live", body, logo_url: null, studio_css: null, kit_notes: ["style:poster"] });
  const s = studioPublic(pub(ROUTED));
  assert.ok(s.body.page && s.older === ROUTED);
  assert.equal(styleOf(s.body.page!.brand), "poster");
  assert.ok(!("tokens" in s) && !("skin" in s) && !("design" in s), "no old look goes out");
  const again = studioPublic(pub(s.body));
  assert.equal(again.body, s.body);
  assert.equal(again.older, undefined);
  // A broken stored form stays as it is rather than failing the form.
  const broken = { ...ROUTED, steps: [] } as unknown as Form;
  assert.equal(studioPublic(pub(broken)).body, broken);
  assert.equal(cleanPageCss(s.body.page!.brand), s.body.page!.brand);
});

/** A database that takes sends and hands back older versions. */
function fakeDb(versions: Record<number, Form> = {}) {
  const sent: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "form_version_body") return { data: versions[args.p_version as number] ?? null, error: null };
    if (fn === "form_submit_all") {
      sent.push(args);
      return { data: { id: "0192f3a1-0000-7000-8000-00000000abcd" }, error: null };
    }
    return { data: null, error: null };
  };
  return { rpc, sent };
}
const fill = (answers: Record<string, unknown>, version = 3) => ({ v: 1, version, key: "k".repeat(20), answers, ms: 9000, trap: "" });

test("sends: the page's answers, an older version a visitor started on, and a visitor who loaded the older form", async () => {
  const live = studioPublic({ id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 3, status: "live", body: ROUTED, logo_url: null, studio_css: null, kit_notes: [] });
  // The page's own answers, by field id.
  let d = fakeDb();
  let r = await acceptFill(d.rpc, live, fill({ e: "ana@acme.com", size: "11-50" }), { custom: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(d.sent.length, 1);
  // A visitor on version 2 (from before the Studio): checked against that version as a page.
  d = fakeDb({ 2: ROUTED });
  r = await acceptFill(d.rpc, live, fill({ e: "ana@acme.com", size: "1-10" }, 2), { custom: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(d.sent[0]!.p_version, 2);
  // A visitor who loaded the older form before it turned, and typed their own team size in Other: the form they
  // filled takes it, so the send is never lost.
  d = fakeDb();
  r = await acceptFill(d.rpc, live, fill({ e: "ana@acme.com", size: "Other: 300" }), { custom: [] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // A real mistake is still refused.
  d = fakeDb();
  r = await acceptFill(d.rpc, live, fill({ e: "not an email", size: "1-10" }), { custom: [] });
  assert.equal(r.status, 400);
  assert.equal(d.sent.length, 0);
});

/** A Supabase client for persistStudio: one older form, its live version, and form_to_studio as the database has it. */
function fakeSb(hasFn: boolean) {
  const updates: Record<string, unknown>[] = [];
  const calls: [string, Record<string, unknown>][] = [];
  const row = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", draft: ROUTED, brand_kit_id: null, live_kit_id: null, kind: "built", version: 3 };
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.maybeSingle = () => Promise.resolve({ data, error: null });
    q.update = (u: Record<string, unknown>) => (updates.push(u), { eq: () => Promise.resolve({ error: null }) });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return q;
  };
  const sb = {
    from: (t: string) => chain(t === "forms" ? row : null),
    rpc: (fn: string, a: Record<string, unknown>) => {
      calls.push([fn, a]);
      if (fn === "form_version_body") return Promise.resolve({ data: ROUTED, error: null });
      if (fn === "form_to_studio") return Promise.resolve(hasFn ? { data: { draft: true, live: true, version: 4 }, error: null } : { data: null, error: { message: "Could not find the function public.form_to_studio(p_body, p_draft, p_id, p_version) in the schema cache" } });
      return Promise.resolve({ data: null, error: null });
    },
  };
  return { sb: sb as never, updates, calls };
}

test("kept for good: the draft and live version in one step, and before 123 the draft still moves", async () => {
  const { persistStudio } = await import("../src/lib/studio/persist.ts");
  let f = fakeSb(true);
  let r = await persistStudio(f.sb, "0192f3a1-0000-7000-8000-0000000000ff");
  assert.deepEqual([r.draft, r.live, r.error], [true, true, undefined]);
  const args = f.calls.find(([fn]) => fn === "form_to_studio")![1] as { p_body: Form; p_draft: Form; p_version: number };
  assert.ok(args.p_body.page && args.p_draft.page && args.p_version === 3);
  f = fakeSb(false);
  r = await persistStudio(f.sb, "0192f3a1-0000-7000-8000-0000000000ff");
  assert.deepEqual([r.draft, r.live, r.error], [true, false, undefined]);
  assert.ok((f.updates[0]!.draft as Form).page, "the draft moved into the Studio");
});
