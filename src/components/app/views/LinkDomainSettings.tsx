"use client";

// Settings › Link domain (docs/sharing-plan.md step 4): the workspace's own address for its forms and booking pages.
// Its subdomain (acme.tryclaritia.com) when those are on, and one custom domain on paid plans: the CNAME to add, the
// state (Waiting, Live, Not pointing), Check now and Remove.

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { askConfirm } from "../Dialogs";
import { ago } from "../forms/formModel";
import { Badge, Button, CardHead, ErrorNote, errorText, Input, Loading, Panel, postJson, useQuery, type Role, type Tone, type ViewProps } from "../ui";

export type LinkDomainState = {
  subdomain: string | null;
  domain: { hostname: string; status: "pending" | "active" | "failed"; dns_ok: boolean; cert_ok: boolean; last_error: string | null; checked_at: string | null } | null;
  target: string;
  paid: boolean;
};

export async function getLinkDomain(session: ViewProps["session"], ws: string): Promise<LinkDomainState> {
  const res = await fetch(`/api/link-domain?workspaceId=${ws}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Something went wrong.");
  return j as LinkDomainState;
}

/** The address the workspace's links start with: its live custom domain, else its subdomain, else none. */
export function useLinkBase(session: ViewProps["session"], ws: string): string | null {
  const q = useQuery(`link_domain:${ws}`, () => getLinkDomain(session, ws), { staleMs: 60_000 });
  const d = q.data;
  return d?.domain?.status === "active" ? `https://${d.domain.hostname}` : (d?.subdomain ?? null);
}

/** "Checked just now", "checked 5 min ago", "checked Nov 2". */
const checkedWords = (iso: string) => {
  const w = ago(iso);
  return /^(Yesterday|Just now)$/.test(w) ? w.toLowerCase() : w;
};

const STATE: Record<string, [string, Tone]> = { pending: ["Waiting", "amber"], active: ["Live", "green"], failed: ["Not pointing", "red"] };

export function LinkDomainSettings({ session, ws, role }: Pick<ViewProps, "session" | "ws"> & { role: Role }) {
  const q = useQuery(`link_domain:${ws.id}`, () => getLinkDomain(session, ws.id), { staleMs: 0 });
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const owner = role === "owner";
  const act = async (action: "add" | "check" | "remove", hostname?: string) => {
    setBusy(action);
    setError("");
    try {
      const r = await postJson<LinkDomainState>(session, "/api/link-domain", { workspaceId: ws.id, action, ...(hostname ? { hostname } : {}) });
      q.set(r);
      if (action === "add") setHost("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy("");
    }
  };
  if (!q.data) return q.error ? <ErrorNote message={q.error} /> : <Loading />;
  const { subdomain, domain, target, paid } = q.data;
  const [label, tone] = domain ? (STATE[domain.status] ?? STATE.pending!) : ["", "gray" as Tone];
  const name = domain?.hostname.split(".")[0] ?? "forms";

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      {subdomain ? (
        <Panel>
          <CardHead label="Your subdomain" />
          <div className="flex items-center gap-2 px-5 py-4">
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{subdomain}</code>
            <CopyButton text={subdomain} label="Copy" />
          </div>
        </Panel>
      ) : null}
      <Panel>
        <CardHead label="Custom domain">
          {domain ? (
            <span className="flex items-center gap-2">
              {domain.checked_at && domain.status !== "active" ? <span className="text-[12px] text-muted">Checked {checkedWords(domain.checked_at)}</span> : null}
              <Badge tone={tone} dot>
                {label}
              </Badge>
            </span>
          ) : null}
        </CardHead>
        {domain ? (
          <div className="flex flex-col gap-4 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">https://{domain.hostname}</code>
              {domain.status === "active" ? <CopyButton text={`https://${domain.hostname}`} label="Copy" /> : null}
              <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void act("check")}>
                {busy === "check" ? "Checking" : "Check now"}
              </Button>
              {owner ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!busy}
                  onClick={async () => {
                    if (await askConfirm(`Remove ${domain.hostname}?`, { body: "Links on it stop working. Links on Claritia's address keep working.", ok: "Remove", danger: true })) void act("remove");
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {domain.status !== "active" ? (
              <div className="overflow-x-auto rounded-[10px] shadow-rest">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-paper text-muted">
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">CNAME</td>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">
                        <span className="inline-flex items-center gap-1">
                          {name}
                          <CopyButton text={name} label="Copy name" size={13} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[12.5px]">
                        <span className="inline-flex items-center gap-1">
                          {target}
                          <CopyButton text={target} label="Copy value" size={13} />
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
            {domain.last_error && domain.status !== "active" ? <p className="text-[12.5px] text-muted">{domain.last_error}</p> : null}
          </div>
        ) : !paid ? (
          <p className="px-5 py-4 text-[13px] text-muted">Your own domain is on paid plans.</p>
        ) : owner ? (
          <form
            className="flex flex-wrap items-center gap-2 px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void act("add", host);
            }}
          >
            <div className="min-w-0 flex-1">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="forms.acme.com" aria-label="Domain" autoComplete="off" />
            </div>
            <Button type="submit" disabled={!host.trim() || !!busy}>
              {busy === "add" ? "Adding" : "Add domain"}
            </Button>
          </form>
        ) : (
          <p className="px-5 py-4 text-[13px] text-muted">An owner adds the domain.</p>
        )}
      </Panel>
    </div>
  );
}
