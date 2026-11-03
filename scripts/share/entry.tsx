// The Share screens for scripts/share-check.ts: the real components with a fake database and a fake server.
// ?view=form&way=<link|embed|email|qr|own> draws a form's Share tab; ?view=meeting the meeting Share dialog;
// ?view=domain&state=<none|pending|active|failed> Settings › Link domain. Server calls go to window.calls.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { Share } from "../../src/components/app/forms/Share";
import { ShareMeeting } from "../../src/components/app/scheduling/ShareMeeting";
import { LinkDomainSettings } from "../../src/components/app/views/LinkDomainSettings";
import { Sidebar } from "../../src/components/app/Sidebar";
import { DialogHost } from "../../src/components/app/Dialogs";
import { emptyForm, type Form } from "../../src/lib/forms/schema";
import { toForm } from "../../src/lib/forms/spec";
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
  if (path === "/api/forms/share-email") return ok({ queued: (body.to ?? []).length });
  if (path === "/api/meetings/times") return ok({ text: "Tue, Nov 3, 10:00 AM: https://claritia.app/book/acme/demo?t=1" });
  return ok({});
};

const sb = {
  from: () => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "limit", "in", "neq"]) q[k] = () => q;
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
    return q;
  },
  rpc: (fn: string, args: Record<string, unknown>) => {
    w.rpcs.push([fn, args]);
    if (fn === "form_link")
      return Promise.resolve(qs.get("nolinks") ? { data: null, error: { message: "Could not find the function public.form_link(p_form) in the schema cache", code: "PGRST202" } } : { data: { ws: "acme", slug: qs.get("ending") ?? "demo-request" }, error: null });
    if (fn === "form_set_slug") return Promise.resolve({ data: { ws: "acme", slug: args.p_slug || null }, error: null });
    if (fn === "form_seen_pages") return Promise.resolve({ data: qs.get("seen") === "0" ? [] : [["acme.com/pricing", { last: new Date(Date.now() - 3600_000).toISOString(), blocked: false }], ["acme.com/contact", { last: new Date(Date.now() - 86400_000 * 2).toISOString(), blocked: false }], ["staging.acme.dev/contact", { last: new Date(Date.now() - 86400_000 * 5).toISOString(), blocked: true }]], error: null });
    return Promise.resolve({ data: null, error: null });
  },
} as unknown as SupabaseClient;
const session = { access_token: "t", user: { id: "u1", email: "me@acme.com" } } as unknown as Session;
const ws = { id: "00000000-0000-4000-8000-000000000001", name: "Acme", features: [] } as never;

function FormShare() {
  const [form] = useState<Form>(() =>
    toForm(
      {
        title: "Book a demo",
        submit: "Book my demo",
        steps: [{ id: "s1", title: "Your team", fields: [{ id: "size", type: "radio", label: "How big is your team?", required: true, options: [{ value: "1", label: "1-10" }, { value: "2", label: "11-50" }, { value: "3", label: "51-200" }, { value: "4", label: "200+" }] }, { id: "em", type: "email", label: "Work email", key: "email", required: true }] }],
      } as never,
      emptyForm(),
    ),
  );
  // Saves are not kept here; the checks read the calls.
  const apply = (ops: Op | Op[]) => ((window as unknown as { ops: unknown[] }).ops = [...((window as unknown as { ops?: unknown[] }).ops ?? []), ops]).length > 0;
  return (
    <div className="flex h-screen flex-col bg-card">
      <div className="flex h-[52px] shrink-0 items-center border-b border-line px-[16px] text-[14px] font-semibold">Book a demo</div>
      <Share sb={sb} session={session} ws={ws} role="owner" navigate={() => {}} id={FORM_ID} form={form} row={{ id: FORM_ID, name: "Book a demo", version: qs.get("live") === "0" ? null : 3 } as never} apply={apply} kit={null} site="acme.com" />
    </div>
  );
}

function App() {
  if (view === "meeting")
    return (
      // Inside a 400 px panel that slid in with a transform, as the meeting panel does: the dialog must still cover the screen.
      <div className="anim-panel" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 400, transform: "translateX(0)" }}>
        <ShareMeeting session={session} ws={ws} type={{ id: "t1", name: "Product demo", slug: "demo", active: qs.get("off") !== "1" }} wsSlug="acme" start={(qs.get("start") as "site" | null) ?? "link"} onClose={() => {}} onSingleUse={() => {}} onEditPage={() => ((window as unknown as { editPage?: boolean }).editPage = true)} />
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
