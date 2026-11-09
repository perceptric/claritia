"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Mark } from "../Logo";
import { BrandLogo } from "./BrandLogo";
import { Button, ErrorNote, errorText, postJson, type Workspace } from "./ui";

// The approve screen an app's sign-in opens (/oauth/authorize, src/lib/oauth/clients.ts): Zapier, Make or
// Activepieces, or an MCP app like ChatGPT or Claude (which names itself, so its return address shows too), asks to
// use this workspace's forms, bookings and workflows. Allow sends the person back with a
// one-time code; Cancel sends them back with access_denied.

type Client = { id: string; name: string; domain: string; public?: boolean };

export function OAuthApprove({ session, ws }: { session: Session; ws: Workspace }) {
  const [query] = useState(() => Object.fromEntries(new URLSearchParams(window.location.search)));
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "allow" | "deny">("");

  useEffect(() => {
    postJson<{ client: Client }>(session, "/api/oauth/approve", { ...query, action: "check" })
      .then((r) => setClient(r.client))
      .catch((e) => setError(errorText(e)));
  }, [session, query]);

  const go = async (action: "allow" | "deny") => {
    setBusy(action);
    setError("");
    try {
      const r = await postJson<{ redirect: string }>(session, "/api/oauth/approve", { ...query, action, workspaceId: ws.id });
      window.location.assign(r.redirect);
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-deep px-4">
      <div className="w-full max-w-sm min-w-0 space-y-5 rounded-2xl bg-card p-7 shadow-rest">
        <div className="flex items-center gap-3">
          <Mark size={32} />
          <span className="h-px w-6 bg-line" aria-hidden="true" />
          {client ? <BrandLogo domain={client.domain} name={client.name} size={32} /> : <span className="size-8 rounded-full bg-paper-deep" aria-hidden="true" />}
        </div>
        {client ? (
          <>
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-ink wrap-break-word">Connect {client.name}</h1>
              <p className="text-[13.5px] text-body wrap-break-word">
                {client.name} gets access to {ws.name}: forms, fills, bookings and workflows.
              </p>
            </div>
            {client.public ? <p className="text-[12.5px] text-muted wrap-anywhere">Returns to {client.domain}</p> : null}
            <p className="text-[12.5px] text-muted wrap-anywhere">Signed in as {session.user.email}</p>
          </>
        ) : null}
        {error ? <ErrorNote message={error} /> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={!client || !!busy} onClick={() => void go("deny")}>
            Cancel
          </Button>
          <Button disabled={!client || !!busy} onClick={() => void go("allow")}>
            {busy === "allow" ? "Connecting" : "Allow"}
          </Button>
        </div>
      </div>
    </main>
  );
}
