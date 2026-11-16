"use client";

// Settings › Integrations: the tools a form sends its leads to (Form › Sync and Form Studio's Send to), and the form
// and meeting tools whose webhooks come in (fills from Typeform, Tally and Webflow; bookings from Calendly and Cal.com,
// linked to the fill they followed), and Stripe for paid meeting types.
//   Connect connects: a tool that signs in (on Composio, with Claritia's own app, or Omniscient) goes straight to its
// sign-in; a webhook tool with no signing secret gets its address at once. Only a tool that can't connect without
// typing something (a pasted key, a signing secret, database details) opens its sheet at the connect form.
//   A click anywhere else on a card opens the tool's detail sheet (src/components/app/ToolSheet.tsx,
// src/lib/sources/details.ts): what it is, what Claritia does with it, the access it gives, how it connects and where
// it's used, with the same buttons as the card.
// Most tools sign in on Composio once the server has its key (src/lib/sources/composio.ts): Connect opens Composio's
// page, and a card still signed in the old way offers Reconnect, which moves it there.
// Zapier and Make connect from their own side (src/lib/oauth/apps.ts); signing in there makes an API key
// with the app's name, and Disconnect here revokes it, which also removes the app's hooks.

import { useEffect, useState } from "react";
import { entryOf, type Entry } from "@/lib/sources/catalog";
import { detailsOf, PAGE_TOOLS } from "@/lib/sources/details";
import { AUTOMATION_APPS } from "@/lib/oauth/apps";
import { CopyButton } from "../CopyButton";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, Field, Input, must, postJson, useLoad, type ViewProps } from "../ui";
import { Select } from "../Select";
import { Search } from "../../Icons";
import { StripeButtons, StripeCard, StripeStatus, useStripe } from "../meetings/Payments";
import { ToolCard } from "../ToolCard";
import { ToolSheet } from "../ToolSheet";

type Source = { id: string; kind: string; name: string; account: string | null; status: string };

/** The tools a form can send to, then the form and meeting tools whose webhooks come in. */
const SENDS = PAGE_TOOLS;

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

/** What each tool is, in one line, as an app store shows it. */
const ABOUT: Record<string, string> = {
  hubspot: "HubSpot is an all-in-one platform for marketing, sales and customer service.",
  salesforce: "Salesforce is the CRM big sales teams use to track leads, deals and accounts.",
  omniscient: "Omniscient is a CRM with deal rooms for closing deals with your buyers.",
  pipedrive: "Pipedrive is a sales CRM built around a simple deal pipeline.",
  attio: "Attio is a flexible CRM you shape around your own data and workflows.",
  close: "Close is a sales CRM with calling, email and texting built in.",
  zoho: "Zoho CRM helps teams manage leads, contacts and deals in one place.",
  dynamics: "Microsoft Dynamics 365 is Microsoft's CRM for sales and customer service.",
  gohighlevel: "GoHighLevel is an all-in-one marketing and CRM platform for agencies.",
  freshsales: "Freshsales is Freshworks' CRM with built-in phone, email and lead scoring.",
  copper: "Copper is a CRM that lives inside Google Workspace.",
  keap: "Keap is a CRM and marketing tool for small businesses.",
  monday: "monday CRM is monday.com's sales CRM for pipelines and contacts.",
  mailchimp: "Mailchimp is an email marketing platform for newsletters and campaigns.",
  klaviyo: "Klaviyo is an email and SMS marketing platform for online stores.",
  activecampaign: "ActiveCampaign is an email marketing and automation platform.",
  brevo: "Brevo is an email, SMS and chat marketing platform.",
  kit: "Kit is an email marketing platform for creators and newsletters.",
  mailerlite: "MailerLite is an email marketing tool for newsletters and automations.",
  stripe: "Stripe is the payments platform for taking cards online.",
  intercom: "Intercom is a customer messaging platform for support and sales chats.",
  typeform: "Typeform is a form builder for conversational, one-question-at-a-time forms.",
  tally: "Tally is a simple form builder that works like a doc.",
  webflow: "Webflow is a website builder with its own forms.",
  calendly: "Calendly is a scheduling tool for booking meetings.",
  calcom: "Cal.com is an open-source scheduling tool for booking meetings.",
  postgres: "PostgreSQL is a popular open-source database.",
  mysql: "MySQL is a popular open-source database.",
  meta_ads: "Meta Ads runs ads on Facebook and Instagram.",
  google_ads: "Google Ads runs ads on Google Search, YouTube and across the web.",
  twilio: "Twilio sends text messages and makes phone calls.",
  google_docs: "Google Docs is Google's word processor for writing and sharing documents.",
  docusign: "DocuSign is the e-signature tool for sending documents to sign.",
  pandadoc: "PandaDoc creates proposals, quotes and contracts with e-signatures.",
  google_drive: "Google Drive is Google's cloud storage for files and folders.",
  onedrive: "OneDrive is Microsoft's cloud storage for files and folders.",
  dropbox: "Dropbox is cloud storage for sharing files and folders.",
  box: "Box is cloud storage and file sharing for businesses.",
  s3: "Amazon S3 is Amazon's storage for files of any size.",
  teams: "Microsoft Teams is Microsoft's chat and meeting app for work.",
  discord: "Discord is a chat app for communities and teams.",
  linear: "Linear is an issue tracker for software teams.",
  trello: "Trello organizes work on boards, lists and cards.",
  clickup: "ClickUp is an all-in-one app for tasks, docs and projects.",
  monday_work: "monday.com is a work platform for projects, tasks and boards.",
  smartsuite: "SmartSuite is a work platform for projects, processes and data.",
  zendesk: "Zendesk is a help desk for customer support tickets.",
  freshdesk: "Freshdesk is Freshworks' help desk for support tickets.",
  segment: "Segment collects your customer data and sends it to your other tools.",
  posthog: "PostHog is a product analytics platform with session replays and feature flags.",
  mixpanel: "Mixpanel is product analytics for tracking what users do.",
  amplitude: "Amplitude is product analytics for understanding user behavior.",
  webex: "Webex is Cisco's video meeting app.",
  whereby: "Whereby is a video meeting app that runs in the browser.",
  paypal: "PayPal is an online payments platform used around the world.",
  square: "Square takes payments online and in person.",
  google_sheets: "Google Sheets is Google's spreadsheet app.",
  airtable: "Airtable is a spreadsheet and database in one.",
  excel: "Excel Online is Microsoft's spreadsheet app in the browser.",
  notion: "Notion is a workspace for notes, docs, wikis and databases.",
  api: "A webhook lets any tool send records into Claritia.",
  redshift: "Amazon Redshift is Amazon's data warehouse.",
  clickhouse: "ClickHouse is a fast database for analytics.",
  bigquery: "BigQuery is Google Cloud's data warehouse.",
  snowflake: "Snowflake is a cloud data warehouse.",
  databricks: "Databricks is a data and AI platform built on the lakehouse.",
  google_forms: "Google Forms is Google's free form builder.",
  zapier: "Zapier connects your apps with automated workflows called Zaps.",
  make: "Make builds visual automations that connect your apps.",
};

/** What the tool is: its own line, else its kind of tool. */
function blurbOf(e: Entry): string {
  return ABOUT[e.kind] ?? `${e.label} connects to your forms and meetings.`;
}

const search = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));

/**
 * The sheet that's open: a tool's kind (Zapier and Make by their ids, and "stripe"); `form` when it opened from Connect
 * (a tool that needs typing shows its connect form first); `key` for a tool that signs in, to paste a key instead.
 */
type Open = { kind: string; form: boolean; key?: boolean };

export function SourcesSettings({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws" | "role">) {
  const sources = useLoad(async () => must(await sb.from("sources").select("id, kind, name, account, status").eq("workspace_id", ws.id).neq("status", "disconnected").order("created_at")) as Source[], ws.id);
  // Omniscient's own Connect button sends people to /settings/suite?connect=omniscient; Form › Tracking to ?connect=meta_ads.
  const [open, setOpen] = useState<Open | null>(() => {
    const k = search().get("connect") ?? "";
    return entryOf(k) && SENDS.some((e) => e.kind === k) ? { kind: k, form: true } : null;
  });
  const [error, setError] = useState(() => search().get("error") ?? "");
  // A sign-in that isn't set up on this server sends its tool to the key form, with why.
  const [formNote, setFormNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Back from a sign-in page with the browser's Back button: the page comes back as it was left, busy included.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => e.persisted && setBusy(null);
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  const appKeys = useLoad(async () => must(await sb.from("api_keys").select("id, name").eq("workspace_id", ws.id).is("revoked_at", null)) as { id: string; name: string }[], ws.id);
  const owner = role === "owner";
  const pay = useStripe({ sb, session, ws, role });
  const via = useLoad(() => composioOf(session, ws.id), ws.id);
  // Until the server says which tools are on Composio, Connect waits: a key tool on Composio signs in there.
  const viaKnown = !!via.data || !!via.error;
  const onComposio = new Set(via.data?.composio ?? []);
  const reconnectable = new Set(via.data?.reconnect ?? []);
  const signsIn = (e: Entry) => onComposio.has(e.kind) || !!e.oauth || e.kind === "omniscient";
  /** A tool that can't connect without typing something: a pasted key, a signing secret, database details. */
  const needsTyping = (e: Entry) => !signsIn(e) && !(e.hook && !e.hookSecret);

  const [hooks, setHooks] = useState<Record<string, string>>({});
  const showHook = async (s: Pick<Source, "id">) => {
    setError("");
    try {
      const url = await hookUrlOf(session, s.id);
      setHooks((h) => ({ ...h, [s.id]: url }));
    } catch (e) {
      setError(errorText(e));
    }
  };

  /** Connect, as the card's button does it: straight to the sign-in, the webhook address at once, or the form. */
  const connectNow = async (e: Entry) => {
    if (needsTyping(e)) {
      setFormNote("");
      setOpen({ kind: e.kind, form: true });
      return;
    }
    setError("");
    setBusy(e.kind);
    try {
      const r = await postJson<{ url?: string; id?: string }>(session, "/api/sources/connect", { workspaceId: ws.id, kind: e.kind });
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      setBusy(null);
      if (r.id) {
        sources.reload();
        // A webhook tool: its address to paste into the tool, at once.
        if (e.hook) void showHook({ id: r.id });
      }
    } catch (err) {
      setBusy(null);
      const msg = errorText(err);
      if (e.keys?.length && /use a key instead/i.test(msg)) {
        setFormNote(msg);
        setOpen({ kind: e.kind, form: true, key: true });
      } else setError(msg);
    }
  };
  const reconnect = async (s: Source) => {
    setError("");
    setBusy(s.kind);
    try {
      const r = await postJson<{ url?: string }>(session, "/api/sources/connect", { workspaceId: ws.id, kind: s.kind });
      if (r.url) window.location.assign(r.url);
      else setBusy(null);
    } catch (e) {
      setBusy(null);
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

  const statusOf = (on: Source | undefined) => (on ? <Badge tone={on.status === "error" ? "red" : "green"} dot>{on.status === "error" ? "Error" : "Connected"}</Badge> : null);

  /** A tool's buttons: the same on its card and in its sheet. */
  const buttonsOf = (e: Entry) => {
    const on = connected.get(e.kind);
    if (!owner) return on && hooks[on.id] ? <HookUrl url={hooks[on.id]!} /> : null;
    return (
      <>
        {!on ? (
          <Button variant="ghost" size="sm" disabled={!viaKnown || !!busy} onClick={() => void connectNow(e)}>
            {busy === e.kind ? (e.hook ? "Connecting…" : "Opening…") : "Connect"}
          </Button>
        ) : null}
        {on && reconnectable.has(on.id) ? (
          <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void reconnect(on)}>
            {busy === e.kind ? "Opening…" : "Reconnect"}
          </Button>
        ) : null}
        {on && e.hook && !hooks[on.id] ? (
          <Button variant="ghost" size="sm" onClick={() => void showHook(on)}>
            Webhook URL
          </Button>
        ) : null}
        {on ? (
          <Button variant="ghost" size="sm" onClick={() => void disconnect(on)}>
            Disconnect
          </Button>
        ) : null}
        {on && hooks[on.id] ? <HookUrl url={hooks[on.id]!} /> : null}
      </>
    );
  };
  const appOn = (name: string) => (appKeys.data ?? []).some((k) => k.name === name);
  const appButtons = (a: (typeof AUTOMATION_APPS)[number]) =>
    appOn(a.name) ? (
      owner ? (
        <Button variant="ghost" size="sm" onClick={() => void disconnectApp(a.name)}>
          Disconnect
        </Button>
      ) : null
    ) : (
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="press inline-flex h-7 shrink-0 items-center rounded-full bg-card px-3 text-[12.5px] font-medium text-ink shadow-outline hover:bg-paper">
        Connect
      </a>
    );

  // The open sheet ----------------------------------------------------------------------------------------------
  const notOn = <Badge>Not connected</Badge>;
  const sheet = (() => {
    if (!open) return null;
    const close = () => {
      setOpen(null);
      setFormNote("");
    };
    const app = AUTOMATION_APPS.find((a) => a.id === open.kind);
    if (app) {
      const d = detailsOf(app.id)!;
      return <ToolSheet name={app.name} logo={<BrandLogo domain={app.domain} name={app.name} size={28} />} status={appOn(app.name) ? <Badge tone="green" dot>Connected</Badge> : notOn} buttons={appButtons(app)} error={error} detail={d} onClose={close} />;
    }
    if (open.kind === "stripe") {
      return (
        <ToolSheet
          name="Stripe"
          logo={<BrandLogo domain="stripe.com" name="Stripe" size={28} />}
          status={pay.a ? <StripeStatus pay={pay} /> : notOn}
          account={pay.a?.stripe_account ?? null}
          buttons={<StripeButtons pay={pay} />}
          error={pay.error}
          detail={detailsOf("stripe")!}
          onClose={close}
        />
      );
    }
    const e = entryOf(open.kind);
    const d = e && detailsOf(e.kind);
    if (!e || !d) return null;
    const on = connected.get(e.kind);
    const typing = !on && owner && viaKnown && open.form && (needsTyping(e) || !!open.key);
    // A tool that signs in, and takes a key when the sign-in isn't set up here.
    const keyToo = !on && owner && !typing && !!e.keys?.length && !onComposio.has(e.kind) && e.kind !== "omniscient";
    return (
      <ToolSheet
        name={e.label}
        logo={<BrandLogo domain={e.domain} name={e.label} size={28} />}
        status={statusOf(on) ?? notOn}
        account={on?.account && on.account !== e.label ? on.account : null}
        buttons={
          typing ? null : (
            <>
              {buttonsOf(e)}
              {keyToo ? (
                <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={() => setOpen({ kind: e.kind, form: true, key: true })}>
                  Use a key instead
                </button>
              ) : null}
            </>
          )
        }
        form={
          typing ? (
            <ConnectForm
              key={e.kind}
              session={session}
              wsId={ws.id}
              entry={e}
              note={formNote}
              signIn={signsIn(e) ? () => setOpen({ kind: e.kind, form: false }) : null}
              onDone={(id) => {
                setFormNote("");
                setOpen({ kind: e.kind, form: false });
                sources.reload();
                if (e.hook) void showHook({ id });
              }}
            />
          ) : null
        }
        error={error}
        detail={d}
        onClose={close}
      />
    );
  })();

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
        {showStripe ? <StripeCard pay={pay} onOpen={() => setOpen({ kind: "stripe", form: false })} /> : null}
        {shownSends.map((e) => {
          const on = connected.get(e.kind);
          return (
            <ToolCard
              key={e.kind}
              logo={<BrandLogo domain={e.domain} name={e.label} size={40} />}
              name={e.label}
              blurb={blurbOf(e)}
              account={on?.account && on.account !== e.label ? on.account : null}
              status={statusOf(on)}
              onOpen={() => {
                setFormNote("");
                setOpen({ kind: e.kind, form: false });
              }}
            >
              {buttonsOf(e)}
            </ToolCard>
          );
        })}
        {shownApps.map((a) => (
          <ToolCard
            key={a.id}
            logo={<BrandLogo domain={a.domain} name={a.name} size={40} />}
            name={a.name}
            blurb={ABOUT[a.id]!}
            status={appOn(a.name) ? <Badge tone="green" dot>Connected</Badge> : null}
            onOpen={() => setOpen({ kind: a.id, form: false })}
          >
            {appButtons(a)}
          </ToolCard>
        ))}
      </div>
      {sheet}
    </div>
  );
}

/** A webhook tool's address, to paste into the tool. */
function HookUrl({ url }: { url: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-2.5 py-1.5 font-mono text-[12px]" title={url}>
        {url}
      </code>
      <CopyButton text={url} label="Copy" />
    </div>
  );
}

// Connecting by typing -------------------------------------------------------------------------------------------

/**
 * The connect form for a tool that needs something typed: a webhook tool's signing secret, a pasted key, or a
 * database's details (with the read-only user to make). `signIn`: the tool also signs in (Sign in instead).
 */
function ConnectForm({ session, wsId, entry, note, signIn, onDone }: { session: ViewProps["session"]; wsId: string; entry: Entry; note: string; signIn: (() => void) | null; onDone: (id: string) => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(note);
  const run = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ url?: string; id?: string }>(session, "/api/sources/connect", { workspaceId: wsId, kind: entry.kind, ...body });
      if (r.url) window.location.href = r.url;
      else if (r.id) onDone(r.id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  if (entry.hook)
    return (
      <form
        className="flex min-w-0 flex-col gap-3 rounded-xl bg-paper p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ hookSecret: secret });
        }}
      >
        <ErrorNote message={error} />
        {entry.hookSecret ? (
          <Field label="Signing secret">
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} type="password" autoComplete="off" autoFocus />
          </Field>
        ) : null}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? "Connecting…" : "Get the webhook URL"}
          </Button>
        </div>
      </form>
    );
  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ keys });
      }}
    >
      <ErrorNote message={error} />
      {(entry.keys ?? []).map((k, i) => (
        <Field key={k.key} label={k.label}>
          {k.multiline ? (
            <textarea
              value={keys[k.key] ?? ""}
              onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              autoFocus={i === 0}
              className="w-full rounded-md bg-card px-3 py-2 font-mono text-[12px] shadow-input outline-none"
            />
          ) : (
            <Input value={keys[k.key] ?? ""} onChange={(e) => setKeys({ ...keys, [k.key]: e.target.value })} type={k.secret ? "password" : "text"} placeholder={k.placeholder} autoComplete="off" autoFocus={i === 0} />
          )}
        </Field>
      ))}
      {entry.grant ? (
        <Field label="Read-only user">
          <pre className="overflow-x-auto rounded-sm border border-line bg-card px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre text-body">{entry.grant}</pre>
        </Field>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || (entry.keys ?? []).some((k) => !k.optional && !keys[k.key]?.trim())}>
          {busy ? "Checking…" : "Connect"}
        </Button>
        {signIn ? (
          <button type="button" className="text-[12px] text-muted underline-offset-2 hover:underline" onClick={signIn}>
            Sign in instead
          </button>
        ) : null}
      </div>
    </form>
  );
}
