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
const db: Record<string, Row[]> = {
  email_groups: [{ id: G, workspace_id: "ws1", name: "Welcome series", created_at: new Date(now - 86400000).toISOString() }, { id: "22222222-2222-4222-8222-222222222222", workspace_id: "ws1", name: "Holiday promo", created_at: new Date(now).toISOString() }],
  emails: [email("Welcome", 0, G, 0), email("Class reminder", 3, G, 1), email("Monthly news", 6, G, 2), email("Spring workshop", 9, null, 0)],
  brand_kits: [{ id: "k1", workspace_id: "ws1", name: "Juniper", tokens: {}, logo_url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40'%3E%3Crect width='120' height='40' fill='%23888'/%3E%3C/svg%3E", design: null, design_live: null, design_rev: 0, created_at: new Date(now - 86400000).toISOString() }],
};
for (let i = 0; i < many; i++) db.emails!.push(email(`Weekly note #${i + 1}`, 1, null, 0, "sent"));
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
const rpc = async (fn: string, a: Row) => {
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
  session: { access_token: "t" } as never,
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
