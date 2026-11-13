// The Email Canvas with a stand-in database (scripts/email-canvas-check.ts): the real page (EmailCanvasPage), an
// in-memory `emails`, `email_groups` and `brand_kits`, and the calls it makes (email_group_place, email_draft_save,
// email_draft_delete, email_group_save, email_campaigns). Real templates are the emails, so the build is real.
// ?group=<id>&n=<count> picks the canvas; window.calls records every write. B2: one brand kit, whose design draft saves
// through a stand-in /api/design/save and publishes through brand_kit_design_publish.
import { createRoot } from "react-dom/client";
import { EMAIL_TEMPLATES } from "../../src/lib/design/email/library.ts";
import { DialogHost } from "../../src/components/app/Dialogs.tsx";
import { EmailCanvasPage } from "../../src/components/app/emails/canvas/EmailCanvasPage.tsx";

type Row = Record<string, unknown>;
const calls: { mode: string; body: unknown }[] = [];
const w = window as unknown as { calls: typeof calls; db: Record<string, Row[]> };
w.calls = calls;
const qs = new URLSearchParams(location.search);
const G = "11111111-1111-4111-8111-111111111111";
const groupId = qs.get("group") ?? G;
const many = Number(qs.get("n") ?? "0");
let seq = 0;
const id = () => `e0000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const now = Date.now();
const email = (name: string, t: number, group: string | null, pos: number, status = "draft"): Row => ({
  id: id(), workspace_id: "ws1", kind: "broadcast", name, subject: `${name} subject`, preheader: "", status, doc: EMAIL_TEMPLATES[t]!.make(), html: "", group_id: group, group_position: pos, created_at: new Date(now - (100 - seq) * 1000).toISOString(), updated_at: new Date(now - seq * 60000).toISOString(),
});
// B4: two brand kits. The first has a saved component; the second a class. "Monthly news" uses the second.
const K1 = "aaaaaaaa-0000-4000-8000-000000000001";
const K2 = "aaaaaaaa-0000-4000-8000-000000000002";
const LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40'%3E%3Crect width='120' height='40' fill='%23888'/%3E%3C/svg%3E";
const K1_DESIGN = { email: { globals: {}, classes: [{ id: "big1", name: "Big", styles: {} }], components: [{ id: "cmp1", name: "Footer block", stackOnPhone: true, columns: [{ id: "kcol1", width: 100, blocks: [{ id: "kblk1", type: "text", html: "<p>Thanks for reading.</p>" }] }] }] } };
const K2_DESIGN = { email: { globals: {}, classes: [{ id: "kid1", name: "Playful", styles: {} }] } };
// "Welcome" has a dark-mode background, so the canvas's Dark switch shows a difference (B5e).
const withDark = (r: Row): Row => {
  const d = r.doc as { styles?: Record<string, Record<string, unknown>> };
  return { ...r, doc: { ...d, styles: { ...(d.styles ?? {}), email: { ...(d.styles?.email ?? {}), content: { ...((d.styles?.email?.content as object) ?? {}), "base:dark": { "background-color": "#1f1f1f" } } } } } };
};
const db: Record<string, Row[]> = {
  email_groups: [{ id: G, workspace_id: "ws1", name: "Welcome series", created_at: new Date(now - 86400000).toISOString() }, { id: "22222222-2222-4222-8222-222222222222", workspace_id: "ws1", name: "Holiday promo", created_at: new Date(now).toISOString() }],
  emails: [withDark(email("Welcome", 0, G, 0)), email("Class reminder", 3, G, 1), { ...email("Monthly news", 6, G, 2), doc: { ...EMAIL_TEMPLATES[6]!.make(), kitId: K2 } }, email("Spring workshop", 9, null, 0)],
  email_versions: [],
  email_comments: [],
  brand_kits: [{ id: K1, workspace_id: "ws1", name: "Juniper", design: K1_DESIGN, design_live: K1_DESIGN, tokens: {}, logo_url: LOGO, design_rev: 0, created_at: new Date(now - 86400000).toISOString() },
    { id: K2, workspace_id: "ws1", name: "Juniper Kids", tokens: {}, logo_url: LOGO, design: K2_DESIGN, design_live: K2_DESIGN, design_rev: 0, created_at: new Date(now - 3600000).toISOString() }],
};
for (let i = 0; i < many; i++) db.emails!.push(email(`Weekly note #${i + 1}`, 1, null, 0, "sent"));
// E3: an automation with two emails. Its live version sent "Thanks" with older words, so that email shows "Changed
// since publish"; the second is new since then.
const WF = "99999999-9999-4999-8999-999999999999";
const thanks: Row = { ...email("Thanks", 1, null, 0), kind: "journey", workflow_id: WF, step_id: "s1", group_position: 0, subject: "Thanks for reaching out" };
const later: Row = { ...email("Still there?", 3, null, 1), kind: "journey", workflow_id: WF, step_id: "s2", group_position: 1, subject: "Still there?" };
db.emails!.push(thanks, later);
db.workflows = [{ id: WF, workspace_id: "ws1", name: "Demo follow-up", live_version: 1 }];
db.workflow_versions = [{ workflow_id: WF, version: 1, body: { trigger: { kind: "form", forms: [] }, goals: [], entry: { mode: "once", gapDays: 30 }, steps: [{ id: "s1", kind: "email", from: "team", approved: true, email: { subject: "Thanks", preheader: "", paragraphs: [], cta_label: "", cta_url: "", doc: thanks.doc } }] } }];
w.db = db;
// The design draft's save (src/components/app/forms/useDesignDraft.ts) goes to the stand-in kit.
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("/api/design/save")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { kitId: string; design: unknown };
    const k = db.brand_kits!.find((x) => x.id === body.kitId)!;
    k.design = body.design;
    k.design_rev = Number(k.design_rev) + 1;
    calls.push({ mode: "design_save", body });
    return new Response(JSON.stringify({ rev: k.design_rev }), { status: 200, headers: { "content-type": "application/json" } });
  }
  // B5: Tia's stand-in. A turn rewrites the first heading in its scope (or the email); "everywhere" asks first. A plan
  // is 3 emails; a build is a template with the planned subject. window.failSeries makes one build fail once.
  if (String(input).includes("/api/email/chat")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { doc: { sections: { columns: { blocks: { id: string; type: string; text?: string }[] }[] }[] }; subject: string; message: string; scope?: { kind: string; ids?: string[] }; confirmed?: boolean };
    calls.push({ mode: "chat", body });
    await new Promise((r) => setTimeout(r, Number((window as unknown as { chatDelay?: number }).chatDelay ?? 400)));
    if (/everywhere/.test(body.message) && !body.confirmed)
      return new Response(JSON.stringify({ doc: body.doc, system: null, subject: body.subject, reply: "", lines: [], ask: { question: "This changes every email on the brand. Go ahead?", choices: ["Yes, every email", "Only this one"] } }), { status: 200 });
    const doc = JSON.parse(JSON.stringify(body.doc)) as typeof body.doc;
    const blocks = doc.sections.flatMap((x) => x.columns.flatMap((c) => c.blocks));
    const target = body.scope?.kind === "parts" ? blocks.find((b) => body.scope!.ids!.includes(b.id) && b.type === "heading") : blocks.find((b) => b.type === "heading");
    if (target) target.text = "Tia's words";
    return new Response(JSON.stringify({ doc, system: null, subject: body.subject, reply: "Done.", lines: target ? ["Changed the heading"] : [], ask: null }), { status: 200 });
  }
  if (String(input).includes("/api/email/series")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { step: string; index?: number; items?: { name: string; subject: string }[] };
    calls.push({ mode: `series:${body.step}`, body });
    await new Promise((r) => setTimeout(r, 300));
    if (body.step === "plan") return new Response(JSON.stringify({ reply: "", plan: [1, 2, 3].map((n) => ({ name: `Series email ${n}`, subject: `Series subject ${n}`, brief: `What email ${n} says.` })) }), { status: 200 });
    const w = window as unknown as { failSeries?: number | null };
    if (w.failSeries === body.index) {
      w.failSeries = null;
      return new Response(JSON.stringify({ error: "The AI didn't answer: overloaded" }), { status: 502 });
    }
    return new Response(JSON.stringify({ doc: { ...EMAIL_TEMPLATES[1]!.make(), settings: { width: 600, align: "center", darkMode: "auto", preheader: "Preview", lang: "en" } }, subject: body.items![body.index!]!.subject }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof window.fetch;

function query(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let orders: [string, boolean][] = [];
  let max = Infinity;
  let single = false;
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
    order: (k: string, o?: { ascending?: boolean }) => ((orders = [...orders, [k, o?.ascending !== false]]), q),
    limit: (n: number) => ((max = n), q),
    maybeSingle: () => ((single = true), q),
    then: (ok: (v: unknown) => unknown) => {
      let rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
      for (const [k, asc] of [...orders].reverse()) rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0) * (asc ? 1 : -1));
      rows = rows.slice(0, max).map((r) => ({ ...r }));
      return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(ok);
    },
  };
  return q;
}
const regroup = (g: string | null) => {
  if (!g) return;
  db.emails!.filter((e) => e.group_id === g).sort((a, b) => Number(a.group_position) - Number(b.group_position)).forEach((e, i) => (e.group_position = i));
};
// Test switches (docs/email-canvas-b4.md section 17.3): the next matching call answers a hiccup, "not a draft", or
// nothing for 20 seconds.
type Fail = { fn: string; email?: string; kind: "503" | "not a draft" | "hang" };
(window as unknown as { failNext: Fail | null }).failNext = null;
const rpc = async (fn: string, a: Row) => {
  const f = (window as unknown as { failNext: Fail | null }).failNext;
  if (f && f.fn === fn && (!f.email || f.email === a.p_id)) {
    (window as unknown as { failNext: Fail | null }).failNext = null;
    calls.push({ mode: `${fn}:${f.kind}`, body: a });
    if (f.kind === "503") return { data: null, error: { message: "Service unavailable" }, status: 503 };
    if (f.kind === "not a draft") return { data: null, error: { message: "This email is not a draft" }, status: 400 };
    await new Promise((r) => setTimeout(r, 20_000));
    return { data: null, error: { message: "Gateway timeout" }, status: 504 };
  }
  if (fn !== "email_campaigns") calls.push({ mode: fn, body: a });
  if (fn === "email_campaigns") return { data: db.emails!.map((e) => ({ id: e.id, status: e.status })), error: null };
  if (fn === "email_group_place") {
    const e = db.emails!.find((x) => x.id === a.p_email)!;
    const old = e.group_id as string | null;
    const others = db.emails!.filter((x) => x.group_id === a.p_group && x.id !== e.id).sort((x, y) => Number(x.group_position) - Number(y.group_position));
    e.group_id = a.p_group ?? null;
    if (a.p_group) {
      const pos = a.p_position == null ? others.length : Math.max(0, Math.min(others.length, Number(a.p_position)));
      others.splice(pos, 0, e);
      others.forEach((x, i) => (x.group_position = i));
    }
    if (old !== a.p_group) regroup(old);
    return { data: true, error: null };
  }
  // B5: versions and comments.
  if (fn === "email_version_save") {
    const e = db.emails!.find((x) => x.id === a.p_email)!;
    const ref = `em:${e.id}`;
    const last = db.email_versions!.filter((v) => v.ref === ref).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
    if (last && JSON.stringify(last.doc) === JSON.stringify(e.doc)) return { data: null, error: null };
    const v = { id: `v${db.email_versions!.length + 1}`, workspace_id: "ws1", ref, doc: JSON.parse(JSON.stringify(e.doc)), subject: e.subject, note: a.p_note || "Edited", by_ai: false, created_at: new Date(Date.now() + db.email_versions!.length).toISOString() };
    db.email_versions!.push(v);
    return { data: v.id, error: null };
  }
  if (fn === "email_comment_add") {
    const id = `c${db.email_comments!.length + 1}aaaa`;
    const thread = (a.p_thread as string | null) ?? id;
    const el = a.p_thread ? (db.email_comments!.find((c) => c.id === a.p_thread)!.element_id as string | null) : ((a.p_element as string | null) || null);
    db.email_comments!.push({ id, workspace_id: "ws1", email_id: a.p_email, element_id: el, thread_id: thread, author: "u1", body: String(a.p_body).trim(), created_at: new Date(Date.now() + db.email_comments!.length).toISOString(), resolved_at: null });
    return { data: id, error: null };
  }
  if (fn === "email_comment_resolve") {
    for (const c of db.email_comments!) if (c.thread_id === a.p_thread) c.resolved_at = a.p_resolved ? new Date().toISOString() : null;
    return { data: true, error: null };
  }
  if (fn === "email_comment_delete") {
    const c = db.email_comments!.find((x) => x.id === a.p_id);
    if (!c) return { data: false, error: null };
    db.email_comments = db.email_comments!.filter((x) => (c.id === c.thread_id ? x.thread_id !== c.id : x.id !== c.id));
    return { data: true, error: null };
  }
  if (fn === "brand_kit_design_publish") {
    const k = db.brand_kits!.find((x) => x.id === a.p_id)!;
    k.design_live = k.design;
    return { data: true, error: null };
  }
  if (fn === "email_draft_save") {
    if (!a.p_id) {
      const r: Row = { ...email(String(a.p_name), 0, null, 0), subject: a.p_subject, doc: a.p_doc, updated_at: new Date().toISOString() };
      db.emails!.push(r);
      return { data: r.id, error: null };
    }
    const r = db.emails!.find((x) => x.id === a.p_id)!;
    if (r.status !== "draft") return { data: null, error: { message: "This email is not a draft" } };
    Object.assign(r, { name: a.p_name, subject: a.p_subject, doc: a.p_doc });
    return { data: r.id, error: null };
  }
  if (fn === "email_draft_delete") {
    const i = db.emails!.findIndex((x) => x.id === a.p_id);
    const g = db.emails![i]!.group_id as string | null;
    db.emails!.splice(i, 1);
    regroup(g);
    return { data: true, error: null };
  }
  if (fn === "email_group_save") {
    if (a.p_id) (db.email_groups!.find((g) => g.id === a.p_id)!.name = a.p_name);
    else db.email_groups!.push({ id: "33333333-3333-4333-8333-333333333333", workspace_id: "ws1", name: a.p_name, created_at: new Date().toISOString() });
    return { data: a.p_id ?? "33333333-3333-4333-8333-333333333333", error: null };
  }
  return { data: null, error: { message: `unknown ${fn}` } };
};
const sb = { from: query, rpc } as never;
const props = {
  sb,
  session: { access_token: "t", user: { id: "u1" } } as never,
  ws: { id: "ws1", name: "Juniper", features: [] },
  role: "owner" as const,
  id: "",
  navigate: (r: string, i?: string, q?: string) => calls.push({ mode: "navigate", body: { r, i, q } }),
};
createRoot(document.getElementById("root")!).render(
  <>
    <DialogHost />
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <EmailCanvasPage {...props} groupId={groupId} pick={qs.get("pick")} />
    </div>
  </>,
);
