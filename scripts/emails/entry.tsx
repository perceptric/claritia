// Emails' Audiences and the automation editor's panels on a stand-in page, for scripts/emails-check.ts
// (docs/email-unify-plan.md, E1 and E2). ?view=audiences renders Emails › Audiences over a fake database;
// ?view=flow renders a workflow's flow, trigger panel and step panel with a deleted form and a Delay.

import { useCallback, useEffect, useReducer, useState } from "react";
import { useEmailCopies } from "../../src/components/app/workflows/emailCopies.ts";
import { editorReducer, patchStep, startEditor } from "../../src/components/app/workflows/model.ts";
import { createRoot } from "react-dom/client";
import { DialogHost } from "../../src/components/app/Dialogs.tsx";
import { EmailsView } from "../../src/components/app/emails/EmailsView.tsx";
import { Flow } from "../../src/components/app/workflows/Flow.tsx";
import { StepPanel, TriggerPanel } from "../../src/components/app/workflows/Inspector.tsx";
import { goneProblems, problems } from "../../src/lib/workflows/check.ts";
import type { Body, Step } from "../../src/lib/workflows/types.ts";

type Row = Record<string, unknown>;
const qs = new URLSearchParams(location.search);
const calls: { fn: string; body: unknown }[] = [];
(window as unknown as { calls: typeof calls }).calls = calls;

const contacts: Row[] = [
  { id: "c1", email: "lee@acme.com", first_name: "Lee", last_name: "Park", phone: "+1 415 555 0142", title: "Ops lead", country: "US", source: "form", created_at: "2026-11-01T10:00:00Z", status: "subscribed", last_sent: "2026-11-10T10:00:00Z", lists: ["Test"] },
  { id: "c2", email: "ana@northwind.io", first_name: "Ana", last_name: "Diaz", phone: null, title: null, country: "ES", source: "import", created_at: "2026-11-03T10:00:00Z", status: "subscribed", last_sent: null, lists: [] },
  { id: "c3", email: "ben@ortiz.dev", first_name: null, last_name: "Ortiz", phone: "+52 55 1234 5678", title: null, country: null, source: "manual", created_at: "2026-11-02T10:00:00Z", status: "no consent", last_sent: null, lists: ["Test"] },
];
const lists: Row[] = [{ id: "11111111-1111-4111-8111-111111111111", name: "Test", members: 2 }];

const copies: Row[] = [{ id: "copy-m1", step: "m1", subject: "From the canvas", preheader: "", doc: { v: 1, settings: { preheader: "" }, sections: [] }, made: false }];
(window as unknown as { copies: Row[] }).copies = copies;
const rpc = async (fn: string, a: Row) => {
  calls.push({ fn, body: a });
  // E3: the automation's email copies. m1 already has one with newer words from the canvas.
  if (fn === "workflow_email_ensure") {
    for (const s of a.p_steps as Row[]) if (!copies.some((c) => c.step === s.step)) copies.push({ id: `copy-${s.step}`, step: s.step, subject: s.subject, preheader: s.preheader, doc: s.doc, made: true });
    const out = copies.map((c) => ({ ...c }));
    for (const c of copies) c.made = false;
    return { data: out, error: null };
  }
  if (fn === "email_draft_save") {
    const c = copies.find((x) => x.id === a.p_id)!;
    Object.assign(c, { subject: a.p_subject, doc: a.p_doc });
    return { data: c.id, error: null };
  }
  if (fn === "audience_count") return { data: contacts.length, error: null };
  if (fn === "lists_overview") return { data: lists, error: null };
  if (fn === "audience_people") {
    const q = String(a.p_q ?? "").toLowerCase();
    const digits = q.replace(/[^0-9]/g, "");
    let rows = contacts.filter((c) => !q || String(c.email).includes(q) || `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().includes(q) || (digits.length >= 3 && String(c.phone ?? "").replace(/[^0-9]/g, "").includes(digits)));
    if (a.p_list) rows = rows.filter((c) => (c.lists as string[]).includes("Test"));
    const key = { first: "first_name", last: "last_name", email: "email", phone: "phone", added: "created_at", last_email: "last_sent", status: "status", from: "source", title: "title", country: "country" }[String(a.p_sort)] ?? "created_at";
    rows = [...rows].sort((x, y) => {
      const [p, q2] = [x[key], y[key]];
      if (p == null) return 1;
      if (q2 == null) return -1;
      return String(p).localeCompare(String(q2)) * (a.p_desc ? -1 : 1);
    });
    return { data: rows.map((r) => ({ ...r })), error: null };
  }
  if (fn === "audience_person_update") {
    const c = contacts.find((x) => x.id === a.p_id)!;
    const patch = a.p_patch as Row;
    if (typeof patch.country === "string" && patch.country && !/^[A-Z]{2}$/.test(patch.country)) return { data: null, error: { message: "Use a two-letter country code, like US." } };
    for (const [k, v] of Object.entries(patch)) c[k] = v === "" ? null : v;
    return { data: c.id, error: null };
  }
  return { data: [], error: null };
};
function query() {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "in", "is", "order", "limit", "gte", "lte", "not"]) q[k] = () => q;
  q.maybeSingle = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return q;
}
const sb = { from: query, rpc } as never;
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("/api/emails/import")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { rows?: Row[]; consent?: boolean };
    calls.push({ fn: "import", body });
    const r = body.rows?.[0];
    if (r) contacts.unshift({ id: `c${contacts.length + 1}`, email: r.email, first_name: r.first_name || null, last_name: r.last_name || null, phone: r.phone || null, title: r.title || null, country: r.country || null, source: "manual", created_at: new Date().toISOString(), status: body.consent ? "subscribed" : "no consent", last_sent: null, lists: [] });
    return new Response(JSON.stringify({ added: 1, created: 1, held: 0, skipped: 0, disposable: 0, shared: 0 }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof window.fetch;

const props = { sb, session: { access_token: "t", user: { id: "u1" } } as never, ws: { id: "ws1", name: "Juniper", features: [] } as never, role: "owner" as const, navigate: () => {} };

const names = { forms: [{ id: "f1", name: "Contact us" }, { id: "f2", name: "Demo request" }], types: [], members: [], templates: [] };
const words = { forms: { f1: "Contact us", f2: "Demo request" } };
const start: Body = {
  trigger: { kind: "form", forms: ["f-deleted"] },
  steps: [
    { id: "w1", kind: "wait", days: 0, hours: 0 } as Step,
    { id: "m1", kind: "email", email: { subject: "", preheader: "", paragraphs: ["Hi"], cta_label: "", cta_url: "" }, from: "team", approved: false } as Step,
  ],
  goals: [],
  entry: { mode: "repeat", gapDays: 30 },
};

function FlowPage() {
  const [st, dispatch] = useReducer(editorReducer, start, startEditor);
  const body = st.body;
  const setBody = (b: Body | ((b: Body) => Body)) => dispatch({ type: "set", body: typeof b === "function" ? b(st.body) : b });
  const sync = useCallback((fn: (b: Body) => Body) => dispatch({ type: "sync", fn }), []);
  const mail = useEmailCopies({ sb, ws: "ws1", id: "wf1", body, sync, readOnly: false });
  const [sel, setSel] = useState<string>("trigger");
  useEffect(() => {
    (window as unknown as { body: Body }).body = body;
  }, [body]);
  const gone = goneProblems(body, words);
  const all = [...problems(body), ...gone];
  const step = body.steps.find((s) => s.id === sel);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", height: "100%" }}>
      <div className="overflow-y-auto px-10 pt-8">
        <p data-publish={all.length ? "off" : "on"} className="mb-4 text-[13px]">
          {all.length} to fix
        </p>
        <Flow body={body} names={words} triggerProblems={gone.map((g) => g.text)} sel={sel} onSelect={(s) => setSel(s as string)} onAdd={() => {}} onRemove={() => {}} onCopy={() => {}} onNudge={() => {}} counts={{}} entered={0} lit={null} readOnly={false} />
      </div>
      <aside className="overflow-y-auto border-l border-line p-5" aria-label="Settings">
        {sel === "trigger" ? (
          <TriggerPanel body={body} names={names} problems={gone.map((g) => g.text)} onChange={(b) => setBody(b)} readOnly={false} />
        ) : step ? (
          <StepPanel step={step} names={names} onPatch={(patch) => setBody((b) => patchStep(b, step.id, patch))} readOnly={false} session={props.session} ws="ws1" workflowId={null} onRemove={() => {}} onEditEmail={mail.copies.has(step.id) ? () => calls.push({ fn: "edit_email", body: { copy: mail.copies.get(step.id)!.id } }) : undefined} />
        ) : null}
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <>
    <DialogHost />
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>{qs.get("view") === "flow" ? <FlowPage /> : <EmailsView {...props} id="audiences" />}</div>
  </>,
);
