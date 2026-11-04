// The template gallery for scripts/templates-check.ts: the real TemplatesPage with a fake database (one workspace
// brand) and a fake server. The page's address is the app's (/forms/templates/<slug>?theme=<style>); Use template's
// calls go to window.calls.

import { createRoot } from "react-dom/client";
import type { SupabaseClient, Session } from "@supabase/supabase-js";
import { TemplatesPage } from "../../src/components/app/forms/templates/TemplatesPage";
import { DialogHost } from "../../src/components/app/Dialogs";

type W = Window & { calls: { path: string; body: Record<string, unknown> }[]; nav: unknown[][] };
const w = window as unknown as W;
w.calls = [];
w.nav = [];
// A workspace brand read from its site, with a teal stage.
const KIT = { id: "11111111-1111-4111-8111-111111111111", name: "acme.com", studio_css: ":root{--brand-primary:#0f766e;--brand-bg:#ccfbf1;--brand-text:#111}", logo_url: null, source_url: "https://acme.com", notes: [] };

function from(table: string) {
  const q: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in"]) q[k] = () => q;
  const rows = table === "brand_kits" ? [KIT] : [];
  q.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej);
  return q;
}
const sb = { from, rpc: () => Promise.resolve({ data: null, error: null }) } as unknown as SupabaseClient;

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input).replace(location.origin, "").split("?")[0]!;
  const body = init?.body && typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  w.calls.push({ path, body });
  return new Response(JSON.stringify(path === "/api/forms/templates" ? { id: "f1", workflows: 0 } : {}), { status: 200, headers: { "content-type": "application/json" } });
};

const session = { access_token: "t", user: { id: "u1", email: "me@acme.com" } } as unknown as Session;
const ws = { id: "00000000-0000-4000-8000-000000000001", name: "Acme", features: [] } as never;
const id = location.pathname.replace(/^\/forms\//, "") || "templates";

createRoot(document.getElementById("root")!).render(
  <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <TemplatesPage sb={sb} session={session} ws={ws} role="owner" navigate={(...a: unknown[]) => void w.nav.push(a)} id={id} />
    <DialogHost />
  </div>,
);
