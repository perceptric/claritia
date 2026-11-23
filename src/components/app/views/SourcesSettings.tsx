"use client";

// Settings › Sources and Settings › Sync log (docs/marketing-platform.md 5.5): every tool contacts come
// from, connected in one click where the tool allows it, with its objects, schedule, consent, mapping and runs.

import { useState } from "react";

import { CATALOG, GROUPS, entryOf, type Entry } from "@/lib/sources/catalog";

import { BrandLogo } from "../BrandLogo";

import { SampleStats, ToolIntro } from "../ToolIntro";
import { Badge, CardHead, ErrorNote, Input, must, Panel, timeAgo, useLoad, type Tone, type ViewProps } from "../ui";

import { type Source, STATE, SourcePanel } from "./SourcePanel";
import { ConnectPanel } from "./ConnectPanel";

const search = () => (typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search));

export function SourcesSettings({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws" | "role">) {
  const sources = useLoad(async () => must(await sb.from("sources").select("id, kind, name, account, status, settings, last_run_at, last_error, created_at").eq("workspace_id", ws.id).order("created_at")) as Source[], ws.id);
  const [open, setOpen] = useState<string | null>(() => search().get("connected") ?? search().get("source"));
  // Omniscient's own Connect button sends people to /settings/suite?connect=omniscient.
  const [connect, setConnect] = useState<Entry | null>(() => entryOf(search().get("connect") ?? "") ?? null);
  const [q, setQ] = useState("");
  const [error, setError] = useState(() => search().get("error") ?? "");
  const owner = role === "owner";
  const list = sources.data ?? [];
  const connected = new Map(list.filter((s) => s.status !== "disconnected").map((s) => [s.kind, s]));
  const shown = CATALOG.filter((e) => !q.trim() || e.label.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (id: string | null) => {
    setOpen(id);
    try {
      window.history.replaceState(null, "", id ? `/settings/sources?source=${id}` : "/settings/sources");
    } catch {
      // Not on the app's own address (a preview); the panel still opens.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      {sources.data && !list.length ? (
        <ToolIntro
          title="Contacts from every tool you use"
          lead="Connect your CRM, email tools, forms and billing. Contacts come in with their consent and unsubscribes, duplicates merge, and two-way CRMs get changes back within minutes."
          features={[
            { title: "Two-way CRM sync", text: "HubSpot, Salesforce and Omniscient stay in step with Claritia. A person's edit wins over a sync by default.", visual: <SampleStats items={[["in", "12,408"], ["out", "1,930"], ["loops", "0"]]} /> },
            { title: "Email tools", text: "Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit and MailerLite: lists, unsubscribes and bounces come first." },
            { title: "Forms and meetings", text: "Typeform, Tally, Webflow, Calendly, Cal.com or any tool that posts JSON: a signup lands on a contact in seconds." },
          ]}
        />
      ) : null}
      {list.length ? (
        <Panel>
          <CardHead label="Connected" count={list.length} />
          <ul className="divide-y divide-line">
            {list.map((s) => {
              const e = entryOf(s.kind);
              const [label, tone] = STATE[s.status] ?? [s.status, "gray" as Tone];
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => pick(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] hover:bg-hover">
                    <BrandLogo domain={e?.domain ?? ""} name={s.name} size={22} />
                    <span className="font-medium">{s.name}</span>
                    {s.account ? <span className="truncate font-mono text-[11px] text-faint">{s.account}</span> : null}
                    <span className="ml-auto flex items-center gap-3">
                      {s.last_error && s.status !== "disconnected" ? <span className="max-w-[280px] truncate text-[12px] text-red-600">{s.last_error}</span> : null}
                      <span className="text-[12px] text-faint">{timeAgo(s.last_run_at)}</span>
                      <Badge tone={tone}>{label}</Badge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="label-mono">Add a tool</span>
        <div className="ml-auto w-56">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search tools" />
        </div>
      </div>
      {GROUPS.map((g) => {
        const items = shown.filter((e) => e.group === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className="flex flex-col gap-2">
            <h3 className="label-mono text-faint">{g.label}</h3>
            <div className="grid grid-cols-2 border-t border-l border-line sm:grid-cols-3 lg:grid-cols-4">
              {items.map((e) => {
                const on = connected.get(e.kind);
                return (
                  <button
                    key={e.kind}
                    type="button"
                    disabled={!owner && !on}
                    onClick={() => (on ? pick(on.id) : setConnect(e))}
                    className="flex items-center gap-3 border-r border-b border-line bg-panel px-4 py-3.5 text-left text-[13px] hover:bg-hover disabled:cursor-default disabled:hover:bg-panel"
                  >
                    <BrandLogo domain={e.domain} name={e.label} size={22} />
                    <span className="font-medium">{e.label}</span>
                    <span className="ml-auto flex gap-1">
                      {on ? <Badge tone={STATE[on.status]?.[1] ?? "gray"}>{STATE[on.status]?.[0] ?? on.status}</Badge> : e.twoWay ? <Badge>Two-way</Badge> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      {connect ? (
        <ConnectPanel
          session={session}
          wsId={ws.id}
          entry={connect}
          onClose={(id) => {
            setConnect(null);
            if (id) {
              sources.reload();
              pick(id);
            }
          }}
          onError={setError}
        />
      ) : null}
      {open && list.some((s) => s.id === open) ? (
        <SourcePanel
          sb={sb}
          session={session}
          wsId={ws.id}
          source={list.find((s) => s.id === open)!}
          owner={owner}
          onClose={() => pick(null)}
          changed={sources.reload}
        />
      ) : null}
    </div>
  );
}
