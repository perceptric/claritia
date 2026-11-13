// The automation editor on a stand-in page, for scripts/automation-check.ts (docs/email-unify-plan.md, E4): the real
// WorkflowEditor over a fake database, with a trigger, an email, a Delay, a Branch and a Slack step.

import { createRoot } from "react-dom/client";
import { DialogHost } from "../../src/components/app/Dialogs.tsx";
import { WorkflowEditor } from "../../src/components/app/workflows/Editor.tsx";
import { docFromBody } from "../../src/lib/design/email/doc.ts";
import type { Body, Step } from "../../src/lib/workflows/types.ts";

type Row = Record<string, unknown>;
const calls: { fn: string; body: unknown }[] = [];
(window as unknown as { calls: typeof calls }).calls = calls;
const thanks = { subject: "Thanks for reaching out", preheader: "", paragraphs: ["Someone will reply within a day."], cta_label: "", cta_url: "" };
const later = { subject: "Still want to talk?", preheader: "", paragraphs: ["Pick a time that works."], cta_label: "", cta_url: "" };
const draft: Body = {
  trigger: { kind: "form", forms: ["f1"] },
  steps: [
    { id: "m1", kind: "email", email: { ...thanks, doc: docFromBody(thanks) }, from: "team", approved: false } as Step,
    { id: "w1", kind: "wait", days: 2, hours: 0, weekday: [2, 4], at: "09:00" } as Step,
    {
      id: "b1",
      kind: "branch",
      match: "all",
      conds: [{ field: "contact.email_class", op: "one_of", value: ["work"] }],
      yes: [{ id: "x1", kind: "exit" } as Step],
      no: [{ id: "m2", kind: "email", email: { ...later, doc: docFromBody(later) }, from: "owner", approved: true } as Step, { id: "k1", kind: "slack", to: "owner", text: "Not booked yet" } as Step],
    } as Step,
  ],
  goals: [],
  entry: { mode: "once", gapDays: 30 },
};
const copies: Row[] = [];
const rpc = async (fn: string, a: Row) => {
  calls.push({ fn, body: a });
  if (fn === "workflow_save") return { data: { revision: 1 }, error: null };
  if (fn === "workflow_email_ensure") {
    for (const s of a.p_steps as Row[]) if (!copies.some((c) => c.step === s.step)) copies.push({ id: `copy-${s.step}`, step: s.step, subject: s.subject, preheader: s.preheader, doc: s.doc, made: true });
    const out = copies.map((c) => ({ ...c }));
    for (const c of copies) c.made = false;
    return { data: out, error: null };
  }
  if (fn === "email_draft_save") return { data: a.p_id, error: null };
  return { data: null, error: null };
};
function query(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "neq", "in", "is", "order", "limit", "or", "not"]) q[k] = () => q;
  q.maybeSingle = () => q;
  q.then = (ok: (v: unknown) => unknown) =>
    Promise.resolve({ data: table === "contacts" ? [{ id: "11111111-2222-4333-8444-555555555555", email: "lee@acme.com", first_name: "Lee", last_name: "Park" }] : [], error: null }).then(ok);
  return q;
}
const sb = { from: query, rpc } as never;
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).includes("/api/workflows/try")) {
    calls.push({ fn: "try", body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(
      JSON.stringify({
        entered: true,
        goal: null,
        who: { name: "Lee Park", email: "lee@acme.com", tz: "America/New_York" },
        lines: [
          { step: "m1", path: null, note: null, at: null, email: { subject: "Thanks for reaching out", paragraphs: [], cta: null, suppressed: false, html: "<p>Hi Lee</p>" } },
          { step: "w1", path: null, note: null, at: "2026-11-17T14:00:00.000Z", email: null },
          { step: "b1", path: "no", note: null, at: null, email: null },
          { step: "m2", path: null, note: null, at: null, email: { subject: "Still want to talk?", paragraphs: ["Pick a time that works."], cta: null, suppressed: false, html: null } },
        ],
      }),
      { status: 200 },
    );
  }
  return realFetch(input, init);
}) as typeof window.fetch;

const data = {
  wf: { id: "99999999-0000-4000-8000-000000000001", name: "Contact us follow-up", status: "draft" as const, draft, draft_revision: 0, live_version: null, updated_at: new Date().toISOString() },
  draft,
  live: null,
  versions: [],
  names: { forms: [{ id: "f1", name: "Contact us" }], types: [], members: [{ id: "u1", name: "Lee", email: "lee@acme.com" }], templates: [] },
  words: { forms: { f1: "Contact us" } },
  stats: { entered: 0, active: 0, steps: {} },
};
createRoot(document.getElementById("root")!).render(
  <>
    <DialogHost />
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <WorkflowEditor sb={sb} session={{ access_token: "t", user: { id: "u1" } } as never} ws={{ id: "ws1", name: "Juniper", features: [] } as never} navigate={(r: string, i?: string) => calls.push({ fn: "navigate", body: { r, i } })} data={data} reload={async () => {}} />
    </div>
  </>,
);
