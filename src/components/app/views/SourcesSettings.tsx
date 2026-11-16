"use client";

// Settings › Integrations: the tools a form sends its leads to (Form › Sync and Form Studio's Send to), and the form
// and meeting tools whose webhooks come in (fills from Typeform, Tally and Webflow; bookings from Calendly and Cal.com,
// linked to the fill they followed), and Stripe for paid meeting types. Connected in one click where the tool allows
// it, and disconnected here.
// Most tools sign in on Composio once the server has its key (src/lib/sources/composio.ts): Connect opens Composio's
// page, and a card still signed in the old way offers Reconnect, which moves it there.
// Zapier and Make connect from their own side (src/lib/oauth/apps.ts); signing in there makes an API key
// with the app's name, and Disconnect here revokes it, which also removes the app's hooks.

import { useState } from "react";
import { CATALOG, entryOf, type Entry } from "@/lib/sources/catalog";
import { AUTOMATION_APPS } from "@/lib/oauth/apps";
import { CopyButton } from "../CopyButton";
import { Plug } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, Field, Input, must, postJson, useLoad, type ViewProps } from "../ui";
import { Select } from "../Select";
import { Search } from "../../Icons";
import { Sheet } from "../Sheet";
import { Payments } from "../meetings/Payments";
import { ToolCard } from "../ToolCard";

type Source = { id: string; kind: string; name: string; account: string | null; status: string };

/** The tools a form can send to, then the form and meeting tools whose webhooks come in. */
const SENDS = [
  ...new Map(
    [...CATALOG.filter((e) => e.twoWay || e.pushes), ...CATALOG.filter((e) => e.hook && (e.group === "form" || e.group === "event") && !(e.twoWay || e.pushes)), ...CATALOG.filter((e) => e.ads || e.texts || e.analytics || e.meetPay)].map((e) => [e.kind, e]),
  ).values(),
];

/** The kinds that connect on Composio on this server, and this workspace's rows of them still on the old sign-in. */
async function composioOf(session: ViewProps["session"], ws: string): Promise<{ composio: string[]; reconnect: string[] }> {
  const res = await fetch(`/api/sources/connect?workspaceId=${encodeURIComponent(ws)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await res.json().catch(() => ({}));
  return { composio: Array.isArray(data.composio) ? data.composio : [], reconnect: Array.isArray(data.reconnect) ? data.reconnect : [] };
}

async function hookUrlOf(session: ViewProps["session"], id: string): Promise<string> {
  const res = await fetch(`/api/sources/hook-url?id=${id}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data.url as string;
}

/** The page's categories, in the order the dropdown lists them. */
const CATS = [
  { id: "crm", label: "CRMs" },
  { id: "email", label: "Email lists" },
  { id: "sheets", label: "Sheets and databases" },
  { id: "work", label: "Tasks and tickets" },
  { id: "docs", label: "Documents and files" },
  { id: "chat", label: "Messages and texts" },
  { id: "form", label: "Forms" },
  { id: "event", label: "Meetings" },
  { id: "pay", label: "Payments" },
  { id: "growth", label: "Analytics and ads" },
  { id: "warehouse", label: "Data warehouses" },
  { id: "automation", label: "Automation" },
  { id: "other", label: "Other" },
] as const;
type Cat = (typeof CATS)[number]["id"];

function catOf(e: Entry): Cat {
  if (e.meetPay && e.group !== "event") return "pay";
  if (e.group === "crm") return "crm";
  if (e.lists || e.group === "email") return "email";
  if (e.rows && !e.work) return "sheets";
  if (e.work) return "work";
  if (e.docs || e.files) return "docs";
  if (e.chat || e.texts) return "chat";
  if (e.group === "form") return "form";
  if (e.group === "event") return "event";
  if (e.analytics || e.ads) return "growth";
  if (e.warehouse) return "warehouse";
  return "other";
}

/** What the tool does in Claritia, in one line. */
function blurbOf(e: Entry): string {
  if (e.group === "crm") return "Each form fill becomes a contact.";
  if (e.lists) return "Each form fill joins a list.";
  if (e.work) return "Each form fill becomes a task or ticket.";
  if (e.rows) return "A row for every form fill.";
  if (e.docs) return "A document from your template for every fill.";
  if (e.files) return "Uploads are copied into a folder.";
  if (e.chat) return "An alert for every fill and workflow step.";
  if (e.texts) return "Texts from your workflows.";
  if (e.group === "form" && e.hook) return `Fills from ${e.label} come into Claritia.`;
  if (e.group === "event" && e.hook) return `Bookings from ${e.label} come into Claritia.`;
  if (e.meetPay && e.group === "event") return "Video links for your meetings.";
  if (e.meetPay) return "Payments for paid meetings.";
  if (e.analytics) return "Each fill is sent as an event.";
  if (e.ads) return "Fills and bookings are sent as conversions.";
  if (e.warehouse) return "Each form fill becomes a row.";
  if (e.hook) return "Send records to Claritia from anywhere.";
  return "Connect it to your forms.";
}


const search = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));

export function SourcesSettings({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws" | "role">) {
  const sources = useLoad(async () => must(await sb.from("sources").select("id, kind, name, account, status").eq("workspace_id", ws.id).neq("status", "disconnected").order("created_at")) as Source[], ws.id);
  // Omniscient's own Connect button sends people to /settings/suite?connect=omniscient.
  const [connect, setConnect] = useState<Entry | null>(() => entryOf(search().get("connect") ?? "") ?? null);
  const [error, setError] = useState(() => search().get("error") ?? "");
  const appKeys = useLoad(async () => must(await sb.from("api_keys").select("id, name").eq("workspace_id", ws.id).is("revoked_at", null)) as { id: string; name: string }[], ws.id);
  const owner = role === "owner";
  const via = useLoad(() => composioOf(session, ws.id), ws.id);
  const onComposio = new Set(via.data?.composio ?? []);
  const reconnectable = new Set(via.data?.reconnect ?? []);
  const reconnect = async (s: Source) => {
    setError("");
    try {
      const r = await postJson<{ url?: string }>(session, "/api/sources/connect", { workspaceId: ws.id, kind: s.kind });
      if (r.url) window.location.assign(r.url);
    } catch (e) {
      setError(errorText(e));
    }
  };
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
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "connected" | Cat>("all");
  const words = q.trim().toLowerCase();
  const fits = (label: string, c: Cat, on: boolean) => (cat === "all" || cat === c || (cat === "connected" && on)) && (!words || label.toLowerCase().includes(words));
  const count = (c: Cat) => SENDS.filter((e) => catOf(e) === c).length + (c === "automation" ? AUTOMATION_APPS.length : 0) + (c === "pay" ? 1 : 0);
  const shownSends = SENDS.filter((e) => fits(e.label, catOf(e), connected.has(e.kind))).sort((a, b) => Number(connected.has(b.kind)) - Number(connected.has(a.kind)));
  const shownApps = AUTOMATION_APPS.filter((a) => fits(a.name, "automation", (appKeys.data ?? []).some((k) => k.name === a.name)));
  const showStripe = fits("Stripe", "pay", connected.has("stripe"));
  const nothing = !shownSends.length && !shownApps.length && !showStripe;
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
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="relative flex min-w-0 flex-1 basis-56 items-center">
          <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${SENDS.length + AUTOMATION_APPS.length + 1} integrations`} aria-label="Search integrations" className="pl-8" />
        </label>
        <Select
          value={cat}
          onChange={setCat}
          ariaLabel="Category"
          className="h-9 w-56 shrink-0 rounded-md bg-card px-3 text-[13.5px] text-ink shadow-input"
          options={[
            { value: "all", label: "All integrations" },
            { value: "connected", label: `Connected ${connected.size + (appKeys.data?.length ? 1 : 0) || ""}`.trim() },
            ...CATS.filter((c) => count(c.id)).map((c) => ({ value: c.id, label: `${c.label} ${count(c.id)}` })),
          ]}
        />
      </div>
      {nothing ? <p className="text-[13px] text-muted">No integrations match.</p> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">
        {showStripe ? <Payments sb={sb} session={session} ws={ws} role={role} /> : null}
        {shownSends.map((e) => {
          const on = connected.get(e.kind);
          return (
            <ToolCard
              key={e.kind}
              logo={<BrandLogo domain={e.domain} name={e.label} size={40} />}
              name={e.label}
              blurb={blurbOf(e)}
              account={on?.account && on.account !== e.label ? on.account : null}
              status={on ? <Badge tone={on.status === "error" ? "red" : "green"} dot>{on.status === "error" ? "Error" : "Connected"}</Badge> : null}
            >
              {!on && owner ? (
                <Button variant="ghost" size="sm" onClick={() => setConnect(e)}>
                  Connect
                </Button>
              ) : null}
              {on && owner && reconnectable.has(on.id) ? (
                <Button variant="ghost" size="sm" onClick={() => void reconnect(on)}>
                  Reconnect
                </Button>
              ) : null}
              {on && owner && e.hook && !hooks[on.id] ? (
                <Button variant="ghost" size="sm" onClick={() => void showHook(on)}>
                  Webhook URL
                </Button>
              ) : null}
              {on && owner ? (
                <Button variant="ghost" size="sm" onClick={() => void disconnect(on)}>
                  Disconnect
                </Button>
              ) : null}
              {on && hooks[on.id] ? (
                <div className="flex w-full min-w-0 items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-2.5 py-1.5 font-mono text-[12px]" title={hooks[on.id]}>{hooks[on.id]}</code>
                  <CopyButton text={hooks[on.id]!} label="Copy" />
                </div>
              ) : null}
            </ToolCard>
          );
        })}
        {shownApps.map((a) => {
          const on = (appKeys.data ?? []).some((k) => k.name === a.name);
          return (
            <ToolCard
              key={a.id}
              logo={<BrandLogo domain={a.domain} name={a.name} size={40} />}
              name={a.name}
              blurb={`Send form fills and bookings to ${a.name}.`}
              status={on ? <Badge tone="green" dot>Connected</Badge> : null}
            >
              {on ? (
                owner ? (
                  <Button variant="ghost" size="sm" onClick={() => void disconnectApp(a.name)}>
                    Disconnect
                  </Button>
                ) : null
              ) : (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-7 shrink-0 items-center rounded-full bg-card px-3 text-[12.5px] font-medium text-ink shadow-outline hover:bg-paper">
                  Connect
                </a>
              )}
            </ToolCard>
          );
        })}
      </div>
      {connect ? (
        <ConnectPanel
          session={session}
          wsId={ws.id}
          entry={connect}
          composio={onComposio.has(connect.kind)}
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

function ConnectPanel({ session, wsId, entry, composio, onClose, onError }: { session: ViewProps["session"]; wsId: string; entry: Entry; composio: boolean; onClose: (id?: string) => void; onError: (e: string) => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  // On Composio, its page asks for the sign-in or the key, so the panel is one button.
  const [useKey, setUseKey] = useState(!composio && !entry.oauth && entry.kind !== "omniscient");
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
  const signIn = composio || entry.oauth || entry.kind === "omniscient";
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
            {entry.keys?.length && !composio ? (
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
                    className="w-full rounded-md bg-card shadow-input px-3 py-2 font-mono text-[12px] outline-none"
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
