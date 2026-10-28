// The email builder alone, for scripts/email-builder-check.ts, on a stand-in database: one brand kit, a starting
// email, and window.saved holding each document the builder hands back.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { DialogHost } from "../../src/components/app/Dialogs";
import { EmailBuilder } from "../../src/components/app/email/EmailBuilder";
import { readEmailDoc, type EmailDoc } from "../../src/lib/design/email/doc";

const KIT = { id: "0190f5a2-1c3b-7d4e-8f90-123456789abc", name: "Acme", tokens: {}, logo_url: null, notes: [], source_url: null, scan_status: null, scan_error: null, scanned_at: null, design: {}, design_live: {}, design_rev: 0 };
const chain = { select: () => chain, eq: () => chain, order: () => Promise.resolve({ data: [KIT], error: null }) };
const sb = { from: () => chain, rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
const session = { access_token: "t" } as Session;
const start = readEmailDoc({
  sections: [
    { id: "s1", columns: [{ id: "c1", blocks: [{ id: "h1", type: "heading", text: "Welcome aboard" }, { id: "t1", type: "text", html: '<p>Hi there, <a href="https://acme.io/x">read this</a>.</p>' }] }] },
    { id: "s2", columns: [{ id: "c2", blocks: [{ id: "f1", type: "footer", address: "1 Main St" }] }] },
  ],
});
const w = window as unknown as { saved: EmailDoc[] };
w.saved = [];

function App() {
  const [open, setOpen] = useState(true);
  return open ? (
    <>
    <DialogHost />
    <EmailBuilder
      session={session}
      sb={sb}
      workspaceId="0190f5a2-1c3b-7d4e-8f90-000000000001"
      subject="Welcome"
      doc={start}
      onChange={(d) => w.saved.push(d)}
      onClose={() => setOpen(false)}
    />
    </>
  ) : (
    <p id="closed">Closed</p>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
