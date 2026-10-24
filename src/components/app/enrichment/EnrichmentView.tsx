"use client";

// Automation › Enrichment (docs/app-structure.md 4.3): where data about people and companies comes from, and how
// complete it is.
//   Overview   numbers first (companies filled, people filled, lookups this month), then a bar per field showing how
//              many records have it; each bar opens the records missing it
//   Providers  the waterfall in order (Coresignal today), what each fills, and Try a domain
//   History    the latest companies filled, with what came back
// New providers and the rules for when to enrich come with M5 (docs/marketing-platform.md).

import { useState } from "react";
import { enrichmentPage, type EnrichmentTab } from "@/lib/nav";
import { Search } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { StatCards } from "../StatCards";
import { Badge, Button, Empty, ErrorNote, errorText, Input, Loading, must, Page, Panel, postJson, Tabs, timeAgo, useLoad, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";

const TABS: { value: EnrichmentTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "providers", label: "Providers" },
  { value: "history", label: "History" },
];

type Coverage = { key: string; label: string; object: "companies" | "contacts"; n: number; total: number };

export function EnrichmentView(props: ViewProps) {
  const page = enrichmentPage(props.id);
  return (
    <Page title="Enrichment" flush>
      <Tabs value={page.tab} tabs={TABS} onChange={(t) => props.navigate("enrichment", t === "overview" ? "" : t)} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5 md:p-7">{page.tab === "overview" ? <Overview {...props} /> : page.tab === "providers" ? <Providers {...props} /> : <History {...props} />}</div>
    </Page>
  );
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

function Overview({ sb, ws, navigate }: ViewProps) {
  const data = useLoad(async () => {
    const head = { count: "exact" as const, head: true };
    const co = () => sb.from("companies").select("id", head).eq("workspace_id", ws.id).is("deleted_at", null);
    const ct = () => sb.from("contacts").select("id", head).eq("workspace_id", ws.id).is("deleted_at", null);
    const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [companies, contacts, size, industry, coCountry, domain, title, phone, ctCountry, company, both, lookups] = await Promise.all([
      co(),
      ct(),
      co().not("size", "is", null),
      co().not("industry", "is", null),
      co().not("country", "is", null),
      co().not("domain", "is", null),
      ct().not("title", "is", null),
      ct().not("phone", "is", null),
      ct().not("country", "is", null),
      ct().not("company_id", "is", null),
      co().not("size", "is", null).not("industry", "is", null),
      sb.from("accounts").select("id", head).eq("workspace_id", ws.id).gte("firmo_at", month),
    ]);
    for (const r of [companies, contacts, lookups]) must(r);
    const C = companies.count ?? 0;
    const P = contacts.count ?? 0;
    const fields: Coverage[] = [
      { key: "size", label: "Company size", object: "companies", n: size.count ?? 0, total: C },
      { key: "industry", label: "Industry", object: "companies", n: industry.count ?? 0, total: C },
      { key: "country", label: "Company country", object: "companies", n: coCountry.count ?? 0, total: C },
      { key: "domain", label: "Website", object: "companies", n: domain.count ?? 0, total: C },
      { key: "title", label: "Job title", object: "contacts", n: title.count ?? 0, total: P },
      { key: "company_id", label: "Company", object: "contacts", n: company.count ?? 0, total: P },
      { key: "country", label: "Person's country", object: "contacts", n: ctCountry.count ?? 0, total: P },
      { key: "phone", label: "Phone", object: "contacts", n: phone.count ?? 0, total: P },
    ];
    return { C, P, both: both.count ?? 0, people: title.count ?? 0, lookups: lookups.count ?? 0, fields };
  }, ws.id);
  const d = data.data;
  if (data.error) return <ErrorNote message={data.error} />;
  return (
    <>
      <StatCards
        cards={[
          { label: "Companies filled", value: d ? pct(d.both, d.C) : null, format: (n) => `${n}%`, note: d ? `${d.both.toLocaleString("en-US")} of ${d.C.toLocaleString("en-US")} have size and industry` : undefined },
          { label: "People filled", value: d ? pct(d.people, d.P) : null, format: (n) => `${n}%`, note: d ? `${d.people.toLocaleString("en-US")} of ${d.P.toLocaleString("en-US")} have a job title` : undefined },
          { label: "Lookups this month", value: d ? d.lookups : null, note: "Companies filled from providers" },
        ]}
      />
      <Panel className="overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Fields</h2>
          <span className="text-[12px] text-faint">Share of records that have each one</span>
        </div>
        {!d ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-line">
            {d.fields.map((f, i) => {
              const p = pct(f.n, f.total);
              return (
                <li key={`${f.object}-${f.key}`}>
                  <button type="button" onClick={() => navigate(f.object, "")} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-hover" title={`Open ${f.object}`}>
                    <span className="w-40 shrink-0 text-[13px] text-ink">{f.label}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-paper-deep">
                      <span className={`anim-grow-x absolute inset-y-0 left-0 rounded-full ${p >= 80 ? "bg-sage" : p >= 40 ? "bg-butter" : "bg-rose"}`} style={{ width: `${p}%`, animationDelay: `${i * 50}ms` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-[12.5px] text-muted tabular-nums">
                      {p}% <span className="text-faint">· {(f.total - f.n).toLocaleString("en-US")} missing</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

type Tried = { domain: string; cached: boolean; providers: { id: string; found: boolean; data: { name: string | null; size: string | null; industry: string | null; country: string | null; founded: number | null; employees: number | null } | null }[] };

function Providers({ session, ws, role }: ViewProps) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState<Tried | null>(null);
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      setTried(await postJson<Tried>(session, "/api/enrichment/try", { workspaceId: ws.id, domain }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const got = tried?.providers[0];
  return (
    <>
      <ol className="flex flex-col gap-2">
        <li className="anim-rise-sm flex items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4">
          <span className="w-5 text-right text-[12px] text-faint tabular-nums">1</span>
          <BrandLogo domain="coresignal.com" name="Coresignal" size={28} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Coresignal</span>
            <span className="truncate text-[12.5px] text-muted">Company name, size, industry, country, founded year, headcount</span>
          </div>
          <Badge tone="green" dot>
            On
          </Badge>
        </li>
      </ol>
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="mr-auto text-[14px] font-semibold tracking-[-0.01em] text-ink">Try a domain</h2>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (domain.trim()) void run();
            }}
          >
            <label className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-3 text-faint" />
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" aria-label="Domain" className="h-9 w-56 pl-8" disabled={role !== "owner"} />
            </label>
            <Button type="submit" disabled={busy || !domain.trim() || role !== "owner"}>
              Look up
            </Button>
          </form>
        </div>
        <div className="px-5 py-4">
          <ErrorNote message={error} />
          {tried && got ? (
            <div className="anim-rise-sm flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[13px]">
                <BrandLogo domain={tried.domain} name={tried.domain} size={20} />
                <span className="font-medium text-ink">{tried.domain}</span>
                <Badge tone={got.found ? "green" : "gray"}>{got.found ? "Found" : "Not found"}</Badge>
                {tried.cached ? <span className="text-faint">From the last 30 days, no credit used</span> : null}
              </div>
              {got.data ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
                  {(
                    [
                      ["Name", got.data.name],
                      ["Size", got.data.size],
                      ["Industry", got.data.industry],
                      ["Country", got.data.country],
                      ["Founded", got.data.founded ? String(got.data.founded) : null],
                      ["Employees", got.data.employees ? got.data.employees.toLocaleString("en-US") : null],
                    ] as [string, string | null][]
                  ).map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                      <dt className="text-[12px] text-muted">{k}</dt>
                      <dd className={v ? "text-ink" : "text-faint"}>{v || "Empty"}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          ) : !error ? (
            <p className="text-[13px] text-muted">{role === "owner" ? "Type a website to see what comes back." : "Workspace owners can run lookups."}</p>
          ) : null}
        </div>
      </Panel>
    </>
  );
}

type AccountRow = { id: string; domain: string; name: string | null; firmo: { size?: string | null; industry?: string | null; country?: string | null } | null; firmo_at: string };

function History({ sb, ws, navigate }: ViewProps) {
  const list = useLoad(async () => (must(await sb.from("accounts").select("id, domain, name, firmo, firmo_at").eq("workspace_id", ws.id).not("firmo_at", "is", null).order("firmo_at", { ascending: false }).limit(200)) ?? []) as AccountRow[], ws.id);
  if (list.error) return <ErrorNote message={list.error} />;
  if (!list.data) return <Loading />;
  if (!list.data.length) return <Empty sketch={<Sketch name="cards" size={150} />} title="Nothing filled yet" />;
  return (
    <ul className="overflow-hidden rounded-2xl border border-line bg-card">
      {list.data.map((a, i) => {
        const filled = [a.firmo?.size, a.firmo?.industry, a.firmo?.country].filter(Boolean) as string[];
        return (
          <li key={a.id} className={`flex items-center gap-3 px-4 py-2.5 ${i ? "border-t border-line" : ""}`}>
            <BrandLogo domain={a.domain} name={a.name ?? a.domain} size={22} />
            <button type="button" onClick={() => navigate("companies", `account/${a.id}`)} className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-[13.5px] font-medium text-ink">{a.name || a.domain}</span>
              <span className="truncate text-[12px] text-muted">{filled.length ? filled.join(" · ") : "Nothing found"}</span>
            </button>
            <Badge>Coresignal</Badge>
            <span className="w-20 shrink-0 text-right text-[12px] text-faint">{timeAgo(a.firmo_at)}</span>
          </li>
        );
      })}
    </ul>
  );
}
