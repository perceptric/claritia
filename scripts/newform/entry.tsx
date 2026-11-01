// New form and the builder, for scripts/newform-check.ts: the real screens with a fake database and a fake server.
// ?view=new draws New form; ?view=build draws a form's Build tab on a form with logic, a file upload and steps.
// Database calls go to window.rpcs, server calls to window.calls, and navigation to window.nav.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { Builder, type Pick } from "../../src/components/app/forms/build/Builder";
import { NewForm } from "../../src/components/app/forms/new/NewForm";
import { DialogHost } from "../../src/components/app/Dialogs";
import { emptyForm, type Form } from "../../src/lib/forms/schema";
import { toForm, type Spec } from "../../src/lib/forms/spec";

type W = Window & { rpcs: unknown[][]; calls: { path: string; body: Record<string, unknown> }[]; nav: unknown[][]; form?: Form };
const w = window as unknown as W;
w.rpcs = [];
w.calls = [];
w.nav = [];

const SOURCES = [{ id: "src1", kind: "hubspot", name: "HubSpot", status: "connected" }];
function chain(table: string) {
  const data = table === "sources" ? SOURCES : [];
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in", "neq"]) q[k] = () => q;
  q.maybeSingle = () => Promise.resolve({ data: null, error: null });
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res, rej);
  return q;
}
const sb = {
  from: chain,
  rpc: (fn: string, args: unknown) => {
    w.rpcs.push([fn, args]);
    return Promise.resolve({ data: fn === "form_create" ? "00000000-0000-4000-8000-000000000009" : null, error: null });
  },
} as unknown as SupabaseClient;
const session = { access_token: "t", user: { id: "u1", email: "me@acme.com" } } as unknown as Session;
const ws = { id: "00000000-0000-4000-8000-000000000001", name: "Acme", features: ["marketing"] };

/** The form Claude "builds": steps, a field and a step with logic, a file upload and contact details last. */
export const BUILT: Spec = {
  title: "Book a demo",
  submit: "Book my demo",
  steps: [
    {
      id: "s1",
      title: "Your team",
      fields: [
        { id: "size", type: "radio", label: "Team size", required: true, options: [{ value: "small", label: "1-10" }, { value: "big", label: "11+" }] },
        { id: "tools", type: "checkboxes", label: "Tools you use", options: [{ value: "hubspot", label: "HubSpot" }, { value: "sheets", label: "Sheets" }] },
        { id: "budget", type: "number", label: "Budget", show: { match: "all", conds: [{ field: "size", op: "is", value: "big" }] } },
      ],
    },
    { id: "s2", title: "Enterprise", show: { field: "size", op: "is", value: "big" }, fields: [{ id: "rfp", type: "file", label: "Your RFP", files: { kinds: ["pdf"], maxMb: 10 } }] },
    {
      id: "s3",
      title: "About you",
      fields: [
        { id: "em", type: "email", label: "Work email", key: "email", required: true },
        { id: "nm", type: "text", label: "First name", key: "first_name" },
      ],
    },
  ],
};

const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  w.calls.push({ path, body });
  if (path === "/api/forms/skin") {
    await sleep(300);
    return json({ skin: { css: ".bt{border-radius:12px;box-shadow:0 4px 0 #b84d0a}", faces: [], at: "", from: "https://acme.com/" } });
  }
  if (path === "/api/forms/scan") return json({ kitId: "k1", tokens: { buttonBg: "#e8590c", accent: "#e8590c", background: "#fffaf5" } });
  if (path === "/api/forms/new") {
    if (body.mode === "brief") return json({ brief: { name: "Acme", offer: "Sales software", audience: "Sales teams", services: [], prices: [], proof: [], tone: "plain", images: [] } });
    if (body.mode === "plan") {
      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(c) {
          for (const t of ["The owner wants a demo form. ", "Bigger teams need more questions, ", "so steps fit best."]) {
            c.enqueue(enc.encode(`${JSON.stringify({ thinking: t })}\n`));
            await sleep(250);
          }
          c.enqueue(enc.encode(`${JSON.stringify({ plan: { name: "Demo request", layout: "steps", why: "It qualifies first, then asks who they are.", steps: [{ title: "Your team", items: ["Team size", "Tools", "Budget"] }, { title: "Enterprise", items: ["RFP upload"] }, { title: "About you", items: ["Work email", "First name"] }], needsEmail: true } })}\n`));
          c.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
    }
    if (body.mode === "build") {
      await sleep(600);
      return json({ name: "Demo request", spec: BUILT, thanks: { title: "Thanks, you're in.", text: "We'll email you a time today." }, questions: [{ id: "q1", question: "Ask for their phone?", kind: "choice", options: ["Yes", "No"] }], changed: null });
    }
    if (body.mode === "edit") {
      await sleep(300);
      const s = structuredClone(body.spec as Spec);
      s.steps.at(-1)!.fields.push({ id: "ph", type: "phone", label: "Phone", key: "phone" });
      return json({ spec: s, reply: "Added phone", changed: 1 });
    }
  }
  return json({});
};

function BuildView() {
  const [form, setForm] = useState<Form>(() => toForm(BUILT, emptyForm()));
  const [pick, setPick] = useState<Pick>(null);
  const [step, setStep] = useState(0);
  const [said, setSaid] = useState<{ words: string; undo?: boolean; err?: boolean } | null>(null);
  w.form = form;
  return (
    <div style={{ height: "100vh", display: "flex" }}>
      <Builder
        session={session}
        ws={ws}
        navigate={(...a: unknown[]) => void w.nav.push(a)}
        form={form}
        name="Demo request"
        replace={(f, words) => (setForm(f), words ? setSaid({ words, undo: true }) : undefined)}
        apply={() => true}
        custom={[]}
        formId="00000000-0000-4000-8000-000000000009"
        kit={null}
        kits={[]}
        setKit={() => undefined}
        reloadKits={() => undefined}
        types={[]}
        facts={{ ready: true, error: "", fields: [], people: [], teams: [], teamKeys: new Set(), owner: true } as never}
        pick={pick}
        setPick={setPick}
        step={step}
        setStep={setStep}
        said={said}
        setSaid={setSaid}
        onUndo={() => undefined}
      />
    </div>
  );
}

const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  <>
    {view === "build" ? (
      <BuildView />
    ) : (
      <div style={{ position: "relative", height: "100vh" }}>
        <NewForm sb={sb} session={session} ws={ws} navigate={(...a: unknown[]) => void w.nav.push(a)} site="" kits={[]} onClose={() => undefined} />
      </div>
    )}
    <DialogHost />
  </>,
);
