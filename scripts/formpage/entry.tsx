// The form page for scripts/formpage-check.ts: the real FormsView (header, tabs, Form Studio in Build, an older
// form moving into the Studio) with a fake database and server. window.FIX holds the two forms (made in node by the real page code);
// ?form=studio|old opens one. Database calls go to window.rpcs, server calls to window.calls, navigation to window.nav.

import { createRoot } from "react-dom/client";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { FormsView } from "../../src/components/app/forms/FormsView";
import { DialogHost } from "../../src/components/app/Dialogs";
import { checkForm } from "../../src/lib/forms/schema";
import { formToPage } from "../../src/lib/studio/fromForm";
import { pageForm } from "../../src/lib/studio/page";

/** As the server does: what's saved and published is the form the checker hands back. */
const checked = (d: Record<string, unknown>) => {
  const r = checkForm(d, { custom: [] });
  if (!("form" in r)) throw new Error(r.errors.join("; "));
  return r.form as unknown as Record<string, unknown>;
};

type Row = Record<string, unknown> & { id: string; draft: Record<string, unknown>; draft_rev: number; version: number; status: string; name: string };
type W = Window & { FIX: { studio: Row; old: Row; brand: string }; rpcs: [string, Record<string, unknown>][]; calls: { path: string; body: Record<string, unknown> }[]; nav: unknown[][]; db: { forms: Record<string, Row>; published: Record<string, unknown>; chats: Record<string, Record<string, unknown>>; dests: Record<string, unknown>[] } };
const w = window as unknown as W;
w.rpcs = [];
w.calls = [];
w.nav = [];
const KIT = { id: "k1", name: "Finch", source_url: "https://finch.care", scan_status: "done", logo_url: null, logo_svg: null, studio_css: w.FIX.brand, studio_profile: null, tokens: {}, notes: [], scan_error: null, scanned_at: null };
// The database hands jsonb keys back in its own order (by length, then bytes), as Postgres does.
const jsonb = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort((x, y) => x.length - y.length || (x < y ? -1 : 1)).map((k) => [k, jsonb((v as Record<string, unknown>)[k])])) : v;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
w.db = { forms: { [w.FIX.studio.id]: clone(w.FIX.studio), [w.FIX.old.id]: clone(w.FIX.old) }, published: { [w.FIX.studio.id]: jsonb(w.FIX.studio.draft), [w.FIX.old.id]: jsonb(w.FIX.old.draft) }, chats: {}, dests: [] };
// A connected email tool (docs/integrations-plan.md step 1).
const MC = { id: "cccccccc-0000-4000-8000-000000000003", kind: "mailchimp", name: "Mailchimp", status: "active" };
// Sheets and databases (step 2).
const GS = { id: "cccccccc-0000-4000-8000-000000000004", kind: "google_sheets", name: "Google Sheets", status: "active" };
const AT = { id: "cccccccc-0000-4000-8000-000000000005", kind: "airtable", name: "Airtable", status: "active" };
const PGS = { id: "cccccccc-0000-4000-8000-000000000006", kind: "postgres", name: "PostgreSQL", status: "active" };
const XL = { id: "cccccccc-0000-4000-8000-000000000007", kind: "excel", name: "Excel Online", status: "active" };

function from(table: string) {
  const eq: [string, unknown][] = [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "order", "limit", "in", "neq", "gte", "lte", "is", "not", "or", "contains", "range", "ilike", "filter", "match"]) q[k] = () => q;
  q.eq = (c: string, v: unknown) => (eq.push([c, v]), q);
  const rows = (): unknown[] => {
    if (table === "forms") return Object.values(w.db.forms).filter((r) => eq.every(([c, v]) => c !== "id" || r.id === v)).map((r) => jsonb(r));
    if (table === "brand_kits") return [KIT];
    if (table === "sources") return [MC, GS, AT, PGS, XL];
    if (table === "form_destinations") return w.db.dests.filter((d) => eq.every(([c, v]) => c !== "form_id" || d.form_id === v)).map((d) => clone(d));
    if (table === "form_chats") return Object.values(w.db.chats).filter((r) => eq.every(([c, v]) => r[c] === v || c === "workspace_id")).map((r) => clone(r));
    return [];
  };
  q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  q.single = q.maybeSingle;
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null, count: 0 }).then(res, rej);
  return q;
}
const sb = {
  from,
  rpc: (fn: string, a: Record<string, unknown>) => {
    w.rpcs.push([fn, a]);
    const ok = (data: unknown) => Promise.resolve({ data, error: null });
    if (fn === "form_page_stats") return ok({ published: w.db.published[a.p_form as string] ?? null, subs: 2, failed: {}, pages: 0 });
    if (fn === "form_link") return ok({ ws: "finch", slug: null });
    if (fn === "form_save") {
      const r = w.db.forms[a.p_id as string]!;
      if (r.draft_rev !== a.p_rev) return Promise.resolve({ data: null, error: { message: "This form changed in another window. Reload to see the latest." } });
      r.draft = clone(a.p_draft as Record<string, unknown>);
      r.name = (a.p_name as string) || r.name;
      r.draft_rev += 1;
      return ok(r.draft_rev);
    }
    return ok(null);
  },
} as unknown as SupabaseClient;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).replace(location.origin, "").split("?")[0]!;
  const body = init?.body && typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  w.calls.push({ path, body });
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  if (path === "/api/studio" && body.mode === "chat-save") {
    const c = body.chat as { id: string; name: string; state: string; brandId: string; formId: string; body: unknown };
    w.db.chats[c.id] = { id: c.id, name: c.name, state: c.state, brand_kit_id: c.brandId || null, form_id: c.formId || null, updated_at: new Date().toISOString(), body: clone(c.body) };
    return ok({});
  }
  if (path === "/api/studio" && body.mode === "save") {
    // The Studio writes the page into the form's draft, with its own revision (no check), as the server does.
    const r = w.db.forms[body.formId as string]!;
    r.draft = checked({ ...r.draft, page: { ...(r.draft.page as object), html: body.html } });
    r.name = body.name as string;
    r.draft_rev += 1;
    return ok({ formId: r.id });
  }
  if (path === "/api/studio" && body.mode === "convert") {
    // As the server does: the older draft becomes a studio page in the brand's stylesheet; what's live stays.
    const r = w.db.forms[body.formId as string]!;
    if (!r.draft.page) {
      const conv = formToPage(checked(r.draft) as never);
      const { form } = pageForm({ html: conv.html, css: conv.css, brand: w.FIX.brand, after: conv.after, title: conv.title });
      r.draft = checked(form as unknown as Record<string, unknown>);
    }
    return ok({ formId: r.id, lost: [] });
  }
  if (path === "/api/forms/tool-lists") return ok({ lists: [{ id: "aud1", name: "Newsletter" }, { id: "aud2", name: "Webinar guests" }] });
  if (path === "/api/forms/tool-targets" && !init?.method && String(input).includes(XL.id)) return ok({ targets: [{ id: "b!d!01A", name: "Leads 2026", url: "https://acme-my.sharepoint.com/a" }] });
  if (path === "/api/forms/tool-targets" && body.action === "link" && body.sourceId === XL.id) return ok({ target: { id: "b!d!01B", name: "Shared pipeline", url: "https://acme.sharepoint.com/b" } });
  if (path === "/api/forms/tool-targets" && !init?.method) return ok({ targets: [{ id: "app1/tbl1", name: "CRM / Leads", url: "https://airtable.com/app1/tbl1" }, { id: "app1/tbl2", name: "CRM / Events", url: "https://airtable.com/app1/tbl2" }] });
  if (path === "/api/forms/tool-targets" && body.action === "create") return ok({ target: { id: "NEWSHEET", name: String(body.name), url: "https://docs.google.com/spreadsheets/d/NEWSHEET/edit", sheet: "Fills" } });
  if (path === "/api/forms/tool-targets" && body.action === "link") return ok({ target: { id: "OLDSHEET", name: "Team leads 2026 with a long name that has to wrap on a phone", url: "https://docs.google.com/spreadsheets/d/OLDSHEET/edit", sheet: "Sheet1" } });
  if (path === "/api/forms/tool-targets" && body.action === "table") {
    const name = String(body.name).trim().toLowerCase();
    return /^[a-z_][a-z0-9_]*$/.test(name) ? ok({ target: { id: name, name } }) : new Response(JSON.stringify({ error: "Use letters, digits and _ for the table name." }), { status: 400, headers: { "content-type": "application/json" } });
  }
  if (path === "/api/forms/destination") {
    // As the server does: a new destination starts with the safe rules; list, tags and rules merge into its config.
    const cur = body.id ? w.db.dests.find((d) => d.id === body.id) : null;
    const config = { ...((cur?.config as object) ?? { rules: { exists: "if_empty", match: "email", owner: "keep", assign: "claritia", consent: true, create: "Lead" } }), ...(body.list !== undefined ? { list: body.list } : {}), ...(body.tags !== undefined ? { tags: body.tags } : {}), ...(body.rules !== undefined ? { rules: body.rules } : {}), ...(body.target !== undefined ? { target: body.target } : {}) };
    if (cur) cur.config = config;
    else w.db.dests.push({ id: `dest-${w.db.dests.length + 1}`, form_id: body.formId, kind: body.kind, source_id: body.sourceId, name: body.name, config, paused: false, position: w.db.dests.length });
    return ok({ id: cur?.id ?? `dest-${w.db.dests.length}` });
  }
  if (path === "/api/routing") return ok({ policies: [], sources: [], forms: [], meetingTypes: [], teams: [], people: [], fields: [], me: "u1", role: "owner", openReviews: 0, paused: false });
  if (path === "/api/forms/publish") {
    const r = w.db.forms[body.id as string]!;
    w.db.published[r.id] = jsonb(checked(r.draft));
    r.version += 1;
    r.status = "live";
    return ok({ routing: { problems: [] } });
  }
  return ok({});
};

const session = { access_token: "t", user: { id: "u1", email: "me@finch.care" } } as unknown as Session;
const ws = { id: "00000000-0000-4000-8000-000000000001", name: "Finch", features: [] } as never;
const pick = new URLSearchParams(location.search).get("form");
const which = pick === "old" ? w.FIX.old.id : pick === "new" ? "new" : w.FIX.studio.id;
const navigate = (...a: unknown[]) => void w.nav.push(a);

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <FormsView sb={sb} session={session} ws={ws} role="owner" navigate={navigate} id={which} />
    <DialogHost />
  </div>,
);
