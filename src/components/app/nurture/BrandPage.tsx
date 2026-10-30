"use client";

// Emails › Brand (docs/email-plan.md Part 3.3): what every email is made from. The look comes from the brand kit (the
// site scan), the brief is what the assistant writes from, and Sending holds the senders and the domain.

import { cleanTokens } from "@/lib/forms/brand";
import { CardHead, ErrorNote, Loading, Page, Panel, useLoad, type ViewProps } from "../ui";
import { SendingSettings } from "../views/SendingSettings";

type Kit = {
  name: string;
  logo_url: string | null;
  tokens: unknown;
  brief: string | null;
  notes: string[];
  source_url: string | null;
};

export function BrandPage({ sb, session, ws, role }: ViewProps) {
  const kit = useLoad(async () => {
    const { data, error } = await sb.from("brand_kits").select("name, logo_url, tokens, brief, notes, source_url").eq("workspace_id", ws.id).order("created_at").limit(1);
    if (error) throw new Error(error.message);
    return { kit: (data?.[0] ?? null) as Kit | null };
  }, ws.id);
  const k = kit.data?.kit ?? null;
  const t = k ? cleanTokens(k.tokens).tokens : null;
  return (
    <Page title="Brand" flush>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 md:p-7">
          <ErrorNote message={kit.error} />
          {kit.data === null ? (
            <Loading />
          ) : !k || !t ? (
            <Panel className="px-5 py-6 text-[13.5px] text-muted">No brand kit yet. Make a form and Claritia reads your site for it.</Panel>
          ) : (
            <div className="grid gap-5 md:grid-cols-2">
              <Panel className="overflow-hidden">
                <CardHead label="Look" />
                <div className="flex flex-col gap-4 px-5 py-4">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {k.logo_url ? <img src={k.logo_url} alt={`${k.name} logo`} width={140} height={28} decoding="async" className="h-7 w-auto max-w-[140px] object-contain" /> : null}
                    <span className="text-[14px] font-medium text-ink">{k.name}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ["Buttons", t.buttonBg],
                      ["Text", t.text],
                      ["Accent", t.accent],
                      ["Page", t.background],
                    ].map(([label, c]) => (
                      <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-body">
                        <i className="size-3 rounded-[4px] border border-line" style={{ background: c }} />
                        {label}
                      </span>
                    ))}
                    <span className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-body">{t.font.split(",")[0]!.replace(/['"]/g, "")}</span>
                    <span className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] text-body">{t.buttonRadius}px corners</span>
                  </div>
                  {k.source_url ? <p className="truncate font-mono text-[11.5px] text-faint">{k.source_url}</p> : null}
                </div>
              </Panel>
              <Panel className="overflow-hidden">
                <CardHead label="Brief" />
                <div className="flex flex-col gap-2 px-5 py-4 text-[13.5px] text-body">
                  {k.brief ? <p className="whitespace-pre-wrap">{k.brief}</p> : <p className="text-muted">No brief yet</p>}
                  {k.notes.length ? (
                    <ul className="flex flex-col gap-1 border-l border-line pl-3 text-[12.5px] text-muted">
                      {k.notes.slice(0, 8).map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Panel>
            </div>
          )}
          <SendingSettings sb={sb} session={session} ws={ws} role={role} />
        </div>
      </div>
    </Page>
  );
}
