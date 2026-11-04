// The Share screens for scripts/share-check.ts: the real components with a fake database and a fake server.
// ?view=form&way=<link|personal|embed|email|qr|own> draws a form's Share tab; ?view=meeting the meeting Share dialog;
// ?view=domain&state=<none|pending|active|failed> Settings › Link domain. Server calls go to window.calls.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { Share } from "../../src/components/app/forms/Share";
import { ShareMeeting } from "../../src/components/app/scheduling/ShareMeeting";
import { LinkDomainSettings } from "../../src/components/app/views/LinkDomainSettings";
import { Sidebar } from "../../src/components/app/Sidebar";
import { MailLine, MeetingMailNotice } from "../../src/components/app/meetings/MailHealth";
import { DialogHost } from "../../src/components/app/Dialogs";
import { FormFolderNav } from "../../src/components/app/forms/folders";
import { FormHome } from "../../src/components/app/forms/FormHome";
import { emptyForm, type Form } from "../../src/lib/forms/schema";
import { applyOp } from "../../src/lib/forms/ops";
import { Setup, type SetupSub } from "../../src/components/app/forms/Setup";
import type { Op } from "../../src/lib/forms/ops";

type W = Window & { calls: { path: string; body: Record<string, unknown> }[]; rpcs: unknown[][] };
const w = window as unknown as W;
w.calls = [];
w.rpcs = [];
const qs = new URLSearchParams(location.search);
const view = qs.get("view") ?? "form";
const state = qs.get("state") ?? "none";
const subs = qs.get("subs") === "1";
const FORM_ID = "6f1c2a90-4b7e-4d2a-9c1e-2b8f4a7d1e03";

const domain = state === "none" ? null : { hostname: "forms.acme.com", status: state, dns_ok: state !== "failed", cert_ok: state === "active", last_error: state === "failed" ? "forms.acme.com doesn't point to Claritia yet." : null, checked_at: new Date().toISOString() };
const linkState = () => ({ subdomain: subs ? "https://acme.tryclaritia.com" : null, domain, target: "claritia-web.fly.dev", paid: qs.get("paid") !== "0" });

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).replace(location.origin, "").split("?")[0]!;
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
  w.calls.push({ path, body });
  const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200, headers: { "content-type": "application/json" } });
  if (path === "/api/link-domain") return ok(linkState());
  if (path === "/api/meetings/mail-health") {
    const at = new Date(Date.now() - 5 * 60_000).toISOString();
    const error = "Resend isn't set up on the worker (RESEND_API_KEY).";
    return ok(qs.get("mailok") ? { problem: null, meetings: {} } : { problem: { error, at, count: 2 }, meetings: { m1: [{ what: "Confirmation and host note", to: null, error, at }, { what: "Confirmation", to: "trollong2002@gmail.com", error: "Domain not verified", at }] } });
  }
  if (path === "/api/forms/share-email") return ok({ queued: (body.to ?? []).length });
  if (path === "/api/forms/personal-link") return ok({ url: `https://app.tryclaritia.com/f/acme/demo-request?p=abcdefghijk.ABCDEFGHIJKLMNOPQRSTUV&via=personal`, contact: body.email === "ana@acme.com", days: 90 });
  if (path === "/api/meetings/times") return ok({ text: "Tue, Nov 3, 10:00 AM: https://claritia.app/book/acme/demo?t=1" });
  return ok({});
};

// The people Share › Email knows: contacts, this form's fills, a meeting type's guests, and one earlier send.
const CONTACTS = [
  { email: "maya@northwind.io", first_name: "Maya", last_name: "Chen" },
  { email: "tom.becker@lumen.co", first_name: "Tom", last_name: "Becker" },
  { email: "priya@harbor.app", first_name: "Priya", last_name: "Shah" },
];
const TABLES: Record<string, unknown[]> = {
  submissions: [{ values: { email: "maya@northwind.io", first_name: "Maya" }, created_at: "2026-11-04T12:00:00Z" }, { values: { email: "jon@quarry.dev" }, created_at: "2026-10-01T12:00:00Z" }],
  meeting_types: [{ id: "t1", name: "Demo call" }],
  meetings: [{ guest_email: "ravi@stackline.co", guest_name: "Ravi Kumar" }],
  emails: [{ id: "e1", subject: "Book a demo", created_at: "2026-11-04T10:00:00Z" }],
  form_folders: [{ id: "fold-sales", name: "Sales", position: 0 }, { id: "fold-hiring", name: "Hiring", position: 1 }],
  forms: [{ id: "f-demo", folder_id: "fold-sales" }, { id: "f-price", folder_id: "fold-sales" }, { id: "f-apply", folder_id: null }],
  email_messages: [
    { email_id: "e1", to_email: "maya@northwind.io", status: "delivered", first_click_at: "2026-11-04T10:05:00Z", created_at: "2026-11-04T10:00:00Z" },
    { email_id: "e1", to_email: "sam@gone.io", status: "bounced", first_click_at: null, created_at: "2026-11-04T10:00:00Z" },
    { email_id: "e1", to_email: "lee@acme.com", status: "delivered", first_click_at: null, created_at: "2026-11-04T10:00:00Z" },
  ],
};
const sb = {
  from: (t: string) => {
    const q: Record<string, unknown> = {};
    let term = "";
    for (const k of ["select", "eq", "order", "limit", "in", "neq", "is", "not", "gte"]) q[k] = () => q;
    q.or = (f: string) => ((term = (/ilike\.%([^%]*)%/.exec(f)?.[1] ?? "").toLowerCase()), q);
    const rows = () => (t === "contacts" ? CONTACTS.filter((c) => !term || `${c.email} ${c.first_name} ${c.last_name}`.toLowerCase().includes(term)) : (TABLES[t] ?? []));
    q.maybeSingle = () => Promise.resolve({ data: t === "send_settings" ? { from_name: "Acme team", from_email: "hello@acme.com" } : null, error: null });
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res);
    return q;
  },
  rpc: (fn: string, args: Record<string, unknown>) => {
    w.rpcs.push([fn, args]);
    if (fn === "form_link")
      return Promise.resolve(qs.get("nolinks") ? { data: null, error: { message: "Could not find the function public.form_link(p_form) in the schema cache", code: "PGRST202" } } : { data: { ws: "acme", slug: qs.get("ending") ?? "demo-request" }, error: null });
    if (fn === "forms_list")
      return Promise.resolve({
        data: [
          { id: "f-demo", name: "Book a demo", status: "live", kind: "built", version: 2, fills: 12, last_fill: null, updated_at: "2026-11-04T10:00:00Z", failed: 0, check: null },
          { id: "f-price", name: "Pricing question", status: "draft", kind: "built", version: 0, fills: 0, last_fill: null, updated_at: "2026-11-03T10:00:00Z", failed: 0, check: null },
          { id: "f-apply", name: "Job application", status: "live", kind: "built", version: 1, fills: 3, last_fill: null, updated_at: "2026-11-02T10:00:00Z", failed: 0, check: null },
        ],
        error: null,
      });
    if (fn === "form_folder_save") return Promise.resolve({ data: "fold-new", error: null });
    if (fn === "form_set_slug") return Promise.resolve({ data: { ws: "acme", slug: args.p_slug || null }, error: null });
    if (fn === "form_seen_pages") return Promise.resolve({ data: qs.get("seen") === "0" ? [] : [["acme.com/pricing", { last: new Date(Date.now() - 3600_000).toISOString(), blocked: false }], ["acme.com/contact", { last: new Date(Date.now() - 86400_000 * 2).toISOString(), blocked: false }], ["staging.acme.dev/contact", { last: new Date(Date.now() - 86400_000 * 5).toISOString(), blocked: true }]], error: null });
    return Promise.resolve({ data: null, error: null });
  },
} as unknown as SupabaseClient;
const session = { access_token: "t", user: { id: "u1", email: "me@acme.com", user_metadata: { full_name: "Ana Lee" } } } as unknown as Session;
const WS_ID = "00000000-0000-4000-8000-000000000001";
const ws = { id: WS_ID, name: "Acme", features: [] } as never;

function FormShare() {
  const [form] = useState<Form>(() => ({
    ...emptyForm(),
    title: "Book a demo",
    submit: { label: "Book my demo" },
    steps: [{ id: "s1", title: "Your team", fields: [{ id: "size", key: "q.size", type: "choice", label: "How big is your team?", required: true, options: [{ value: "1", label: "1-10" }, { value: "2", label: "11-50" }, { value: "3", label: "51-200" }, { value: "4", label: "200+" }] }, { id: "em", key: "email", type: "email", label: "Work email", required: true }] }],
  }));
  // Saves are not kept here; the checks read the calls.
  const apply = (ops: Op | Op[]) => ((window as unknown as { ops: unknown[] }).ops = [...((window as unknown as { ops?: unknown[] }).ops ?? []), ops]).length > 0;
  return (
    <div className="flex h-screen flex-col bg-card">
      <div className="flex h-[52px] shrink-0 items-center border-b border-line px-[16px] text-[14px] font-semibold">Book a demo</div>
      <Share sb={sb} session={session} ws={ws} role="owner" navigate={() => {}} id={FORM_ID} form={form} row={{ id: FORM_ID, name: "Book a demo", version: qs.get("live") === "0" ? null : 3 } as never} apply={apply} kit={null} site="acme.com" />
    </div>
  );
}

/** Settings › Access on its own: ops change the form here, so the screen shows what they did. */
function AccessSettings() {
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [sub, setSub] = useState<SetupSub>("access");
  const [paused, setPaused] = useState(false);
  const apply = (ops: Op | Op[]) => {
    let f = form;
    for (const op of Array.isArray(ops) ? ops : [ops]) {
      const r = applyOp(f, op);
      if ("form" in r) f = r.form;
    }
    setForm(f);
    (window as unknown as { form: Form }).form = f;
    return true;
  };
  return (
    <div className="flex h-screen flex-col bg-card">
      <Setup sb={sb} session={session} ws={ws} role="owner" navigate={() => {}} id={FORM_ID} form={form} apply={apply} sub={sub} setSub={setSub} formId={FORM_ID} types={[]} routing={null} onReview={() => {}} subs={0} name="Book a demo" paused={paused} onStatus={(st) => setPaused(st === "paused")} />
    </div>
  );
}

/** Forms with its folders: the sidebar's list under Forms, and a folder's page. */
function FolderPages() {
  const [id, setId] = useState(qs.get("folder") ? `folder:${qs.get("folder")}` : "");
  const navigate = ((_r: string, to?: string) => ((window as unknown as { navs: unknown[] }).navs = [...((window as unknown as { navs?: unknown[] }).navs ?? []), to ?? ""], setId(to ?? ""))) as never;
  return (
    <div style={{ display: "flex", height: "100vh" }} className="bg-paper">
      <Sidebar route={"forms" as never} id={id} navigate={navigate} counts={{}} wsName="Acme" email="me@acme.com" theme="light" onTheme={() => {}} onSignOut={() => {}} onSearch={() => {}} create={[]} under={{ forms: <FormFolderNav sb={sb} ws={WS_ID} current={id} open navigate={navigate} /> }} />
      <div className="min-w-0 flex-1 bg-card">
        <FormHome key={id} sb={sb} session={session} ws={ws} role="owner" navigate={navigate} id={id} folder={id.startsWith("folder:") ? id.slice(7) : ""} />
      </div>
    </div>
  );
}

function App() {
  if (view === "access") return <AccessSettings />;
  if (view === "folders") return <FolderPages />;
  if (view === "meeting")
    return (
      // Inside a 400 px panel that slid in with a transform, as the meeting panel does: the dialog must still cover the screen.
      <div className="anim-panel" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 400, transform: "translateX(0)" }}>
        <ShareMeeting session={session} ws={ws} type={{ id: "t1", name: "Product demo", slug: "demo", active: qs.get("off") !== "1" }} wsSlug="acme" start={(qs.get("start") as "site" | null) ?? "link"} onClose={() => {}} onSingleUse={() => {}} onEditPage={() => ((window as unknown as { editPage?: boolean }).editPage = true)} />
      </div>
    );
  if (view === "mail")
    return (
      <div className="flex flex-col gap-4">
        <MailLine session={session} ws={ws} />
        <div className="p-4">
          <MeetingMailNotice session={session} ws={ws} meeting="m1" />
        </div>
      </div>
    );
  if (view === "sidebar")
    return (
      <div style={{ display: "flex", height: "100vh" }} className="bg-paper">
        <Sidebar route={"scheduling" as never} id="" navigate={() => {}} counts={{}} wsName="hoanghy2032002@gmail.com's workspace" email="hoanghy2032002@gmail.com" theme="light" onTheme={() => {}} onSignOut={() => {}} onSearch={() => {}} create={[]} />
      </div>
    );
  if (view === "domain")
    return (
      <div className="mx-auto max-w-[720px] p-8">
        <LinkDomainSettings session={session} ws={ws} role={(qs.get("role") as never) ?? "owner"} />
      </div>
    );
  // Way picked by clicking in the check; the harness opens on the default.
  return <FormShare />;
}

createRoot(document.getElementById("root")!).render(
  <>
    <App />
    <DialogHost />
  </>,
);
