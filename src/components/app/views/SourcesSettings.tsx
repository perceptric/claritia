"use client";

// Settings › Integrations: the tools a form sends its leads to (Form › Sync and Form Studio's Send to), and the form
// and meeting tools whose webhooks come in (fills from Typeform, Tally and Webflow; bookings from Calendly and Cal.com,
// linked to the fill they followed). Connected in one click where the tool allows it, and disconnected here.
// Zapier, Make and Activepieces connect from their own side (src/lib/oauth/apps.ts); signing in there makes an API key
// with the app's name, and Disconnect here revokes it, which also removes the app's hooks.

import { useState } from "react";
import { CATALOG, entryOf, type Entry } from "@/lib/sources/catalog";
import { AUTOMATION_APPS } from "@/lib/oauth/apps";
import { CopyButton } from "../CopyButton";
import { Plug } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, Field, Input, must, postJson, useLoad, type ViewProps } from "../ui";
import { Sheet } from "../Sheet";

type Source = { id: string; kind: string; name: string; account: string | null; status: string };

/** The tools a form can send to, then the form and meeting tools whose webhooks come in. */
const SENDS = [...CATALOG.filter((e) => e.twoWay || e.pushes), ...CATALOG.filter((e) => e.hook && (e.group === "form" || e.group === "event") && !(e.twoWay || e.pushes)), ...CATALOG.filter((e) => e.ads || e.texts || e.analytics)];

async function hookUrlOf(session: ViewProps["session"], id: string): Promise<string> {
  const res = await fetch(`/api/sources/hook-url?id=${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data.url as string;
}

const search = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));

export function SourcesSettings({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws" | "role">) {
  const sources = useLoad(async () => must(await sb.from("sources").select("id, kind, name, account, status").eq("workspace_id", ws.id).neq("status", "disconnected").order("created_at")) as Source[], ws.id);
  // Omniscient's own Connect button sends people to /settings/suite?connect=omniscient.
  const [connect, setConnect] = useState<Entry | null>(() => entryOf(search().get("connect") ?? "") ?? null);
  const [error, setError] = useState(() => search().get("error") ?? "");
  const appKeys = useLoad(async () => must(await sb.from("api_keys").select("id, name").eq("workspace_id", ws.id).is("revoked_at", null)) as { id: string; name: string }[], ws.id);
  const owner = role === "owner";
  const disconnectApp = async (name: string) => {
    setError("");
    try {
      if (!(await askConfirm(`Disconnect ${name}?`, { body: `${name} stops getting events from Claritia.`, ok: "Disconnect", danger: true }))) return;
      for (const k of (appKeys.data ?? []).filter((x) => x.name === name)) must(await sb.rpc("revoke_api_key", { p_key: k.id }));
      appKeys.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const connected = new Map((sources.data ?? []).map((s) => [s.kind, s]));
  const [hooks, setHooks] = useState<Record<string, string>>({});
  const showHook = async (s: Source) => {
    setError("");
    try {
      const url = await hookUrlOf(session, s.id);
      setHooks((h) => ({ ...h, [s.id]: url }));
    } catch (e) {
      setError(errorText(e));
    }
  };
  const disconnect = async (s: Source) => {
    setError("");
    try {
      if (!(await askConfirm(`Disconnect ${s.name}?`, { body: "Forms stop sending leads to it.", ok: "Disconnect", danger: true }))) return;
      must(await sb.rpc("source_disconnect", { p_id: s.id }));
      sources.reload();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SENDS.map((e) => {
          const on = connected.get(e.kind);
          return (
            <div key={e.kind} className="flex min-w-0 flex-col gap-3 rounded-lg bg-card shadow-rest px-4 py-3.5 text-[13px]">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo domain={e.domain} name={e.label} size={24} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{e.label}</span>
                  {on?.account && on.account !== e.label ? <span className="truncate font-mono text-[11px] text-faint">{on.account}</span> : null}
                </span>
                {on ? (
                  <Badge tone={on.status === "error" ? "red" : "green"} dot>
                    {on.status === "error" ? "Error" : "Connected"}
                  </Badge>
                ) : owner ? (
                  <Button variant="ghost" size="sm" onClick={() => setConnect(e)}>
                    Connect
                  </Button>
                ) : null}
              </div>
              {on && owner ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {e.hook && !hooks[on.id] ? (
                    <Button variant="ghost" size="sm" onClick={() => void showHook(on)}>
                      Webhook URL
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={() => void disconnect(on)}>
                    Disconnect
                  </Button>
                </div>
              ) : null}
              {on && hooks[on.id] ? (
                <div className="flex w-full min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-2.5 py-1.5 font-mono text-[12px]">{hooks[on.id]}</code>
                  <CopyButton text={hooks[on.id]!} label="Copy" />
                </div>
              ) : null}
            </div>
          );
        })}
        {AUTOMATION_APPS.map((a) => {
          const on = (appKeys.data ?? []).some((k) => k.name === a.name);
          return (
            <div key={a.id} className="flex min-w-0 flex-col gap-3 rounded-lg bg-card shadow-rest px-4 py-3.5 text-[13px]">
              <div className="flex min-w-0 items-center gap-3">
                <BrandLogo domain={a.domain} name={a.name} size={24} />
                <span className="min-w-0 flex-1 font-medium wrap-break-word">{a.name}</span>
                {on ? (
                  <Badge tone="green" dot>
                    Connected
                  </Badge>
                ) : (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-7 shrink-0 items-center rounded-full bg-card px-3 text-[12.5px] font-medium text-ink shadow-outline hover:bg-paper">
                    Connect
                  </a>
                )}
              </div>
              {on && owner ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => void disconnectApp(a.name)}>
                    Disconnect
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {connect ? (
        <ConnectPanel
          session={session}
          wsId={ws.id}
          entry={connect}
          onClose={(id) => {
            const e = connect;
            setConnect(null);
            if (!id) return;
            sources.reload();
            // A webhook tool: its address to paste into the tool, at once.
            if (e?.hook) void showHook({ id, kind: e.kind, name: e.label, account: null, status: "active" });
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}

// Connecting -------------------------------------------------------------------------------------------------

function ConnectPanel({ session, wsId, entry, onClose, onError }: { session: ViewProps["session"]; wsId: string; entry: Entry; onClose: (id?: string) => void; onError: (e: string) => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [useKey, setUseKey] = useState(!entry.oauth && entry.kind !== "omniscient");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ url?: string; id?: string }>(session, "/api/sources/connect", { workspaceId: wsId, kind: entry.kind, ...body });
      if (r.url) window.location.href = r.url;
      else onClose(r.id);
    } catch (e) {
      setError(errorText(e));
      onError("");
    } finally {
      setBusy(false);
    }
  };
  const signIn = entry.oauth || entry.kind === "omniscient";
  return (
    <Sheet title={entry.label} onClose={() => onClose()} footer={null}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <BrandLogo domain={entry.domain} name={entry.label} size={32} />
          <span className="text-[15px] font-medium">{entry.label}</span>
          {entry.twoWay ? <Badge>Two-way</Badge> : null}
        </div>
        <ErrorNote message={error} />
        {signIn && !useKey ? (
          <div className="flex flex-col items-start gap-3">
            <Button onClick={() => run({})} disabled={busy}>
              <Plug size={14} />
              {busy ? "Opening…" : `Connect ${entry.label}`}
            </Button>
            {entry.keys?.length ? (
              <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => setUseKey(true)}>
                Use a key instead
              </button>
            ) : null}
          </div>
        ) : entry.hook ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ hookSecret: secret });
            }}
          >
            {entry.hookSecret ? (
              <Field label="Signing secret">
                <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" autoComplete="off" />
              </Field>
            ) : null}
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? "Connecting…" : "Get the webhook URL"}
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run({ keys });
            }}
          >
            {(entry.keys ?? []).map((k) => (
              <Field key={k.key} label={k.label}>
                {k.multiline ? (
                  <textarea
                    value={keys[k.key] ?? ""}
                    onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })}
                    rows={5}
                    spellCheck={false}
                    autoComplete="off"
                    className="w-full rounded-md bg-card shadow-input px-3 py-2 font-mono text-[12px] outline-none focus:shadow-focus"
                  />
                ) : (
                  <Input value={keys[k.key] ?? ""} onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })} type={k.secret ? "password" : "text"} placeholder={k.placeholder} autoComplete="off" />
                )}
              </Field>
            ))}
            {entry.grant ? (
              <Field label="Read-only user">
                <pre className="overflow-x-auto rounded-sm border border-line bg-paper px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-body">{entry.grant}</pre>
              </Field>
            ) : null}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy || (entry.keys ?? []).some((k) => !k.optional && !keys[k.key]?.trim())}>
                {busy ? "Checking…" : "Connect"}
              </Button>
              {signIn ? (
                <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => setUseKey(false)}>
                  Sign in instead
                </button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}
