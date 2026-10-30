"use client";

// Visitors (docs/m1-website-intelligence.md 8.4): the last day's visits, refreshed every 10 seconds.

import { memo, useEffect, useState } from "react";
import { Eye } from "../../Icons";
import { applyFilters, cleanFilters, type Filter, type FilterField } from "@/lib/filters";
import { persona } from "@/lib/web/names";
import { Badge, Button, Empty, ErrorNote, Loading, must, Page, Panel, Td, Th, timeAgo, useQuery, type ViewProps } from "../ui";
import { FilterBar, useFilters } from "../FilterBar";
import { Sketch } from "../../sketches/Sketch";
import { VisitorsIntro } from "./VisitorsIntro";
import { StatCards } from "../StatCards";

export type Visit = {
  id: string;
  started_at: string;
  country: string | null;
  city: string | null;
  ref_class: string | null;
  source: string | null;
  referrer_host: string | null;
  device_type: string | null;
  policy: string;
  account_id: string | null;
  account_name: string | null;
  account_domain: string | null;
  account_source: string | null;
  person_id: string | null;
  person_email: string | null;
  person_level: string | null;
  pageviews: number;
  engaged_s: number;
  pages: string[];
  page_times: string[];
  device_id: string | null;
};

export type SiteHealth = {
  id: string;
  domain: string;
  extra_domains: string[];
  site_key: string;
  proxy_secret: string;
  install_mode: string | null;
  last_event_at: string | null;
  paused: boolean;
  sessions_24h: number;
  identified_24h: number;
  with_account_24h: number;
};

const REF_LABEL: Record<string, string> = {
  search: "Search",
  ai_assistant: "AI",
  review_site: "Reviews",
  social: "Social",
  partner: "Partner",
  email: "Email",
  paid: "Paid",
  direct: "Direct",
  other: "Referral",
};

import { activeTime, LEVEL_TONE } from "@/lib/visits";
import { useSiteHealth } from "../shared";
export { activeTime, LEVEL_TONE };

const VISIT_FIELDS: FilterField<Visit>[] = [
  { key: "company", label: "Company", type: "text", get: (v) => v.account_name ?? v.account_domain },
  { key: "known", label: "Known person", type: "bool", get: (v) => !!v.person_id },
  { key: "source", label: "Source", type: "enum", options: Object.entries(REF_LABEL).map(([value, label]) => ({ value, label })), get: (v) => v.ref_class ?? "direct" },
  { key: "page", label: "Page", type: "text", get: (v) => v.pages },
  { key: "pages", label: "Pages viewed", type: "number", get: (v) => v.pageviews },
  { key: "active", label: "Active time", type: "number", unit: "min", get: (v) => v.engaged_s / 60 },
  { key: "referrer", label: "Referrer", type: "text", get: (v) => v.referrer_host },
  { key: "country", label: "Country", type: "text", get: (v) => v.country },
  { key: "city", label: "City", type: "text", get: (v) => v.city },
  {
    key: "device",
    label: "Device",
    type: "enum",
    options: [
      { value: "desktop", label: "Desktop" },
      { value: "mobile", label: "Mobile" },
      { value: "tablet", label: "Tablet" },
      { value: "other", label: "Other" },
    ],
    get: (v) => v.device_type,
  },
  {
    key: "level",
    label: "Person match",
    type: "enum",
    options: [
      { value: "verified", label: "Verified" },
      { value: "asserted", label: "Asserted" },
      { value: "probable", label: "Probable" },
    ],
    get: (v) => v.person_level,
  },
];

const AI: Filter = { field: "source", op: "is", values: ["ai_assistant"] };
const VISIT_PRESETS: { name: string; filters: Filter[] }[] = [
  { name: "With a company", filters: [{ field: "company", op: "not_empty", values: [] }] },
  { name: "Known people", filters: [{ field: "known", op: "is", values: ["true"] }] },
  { name: "From AI", filters: [AI] },
  { name: "Unknown", filters: [{ field: "company", op: "empty", values: [] }, { field: "known", op: "is", values: ["false"] }] },
];

/** The visitor's round avatar: initials on their color. */
export function VisitorAvatar({ code, size = 24 }: { code: string; size?: number }) {
  const p = persona(code);
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{ width: size, height: size, background: `${p.color}1f`, border: `1px solid ${p.color}55`, color: p.color, fontSize: size * 0.4 }}
    >
      {p.initials}
    </span>
  );
}

const codeOf = (v: Visit) => v.device_id ?? v.id;
const nameOf = (v: Visit) => v.person_email ?? persona(codeOf(v)).name;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Visitors, inside Signals (docs/app-structure.md 4.2): `head` is Signals' tab row, shown under the title. */
export function VisitorsView({ sb, ws, navigate, head }: ViewProps & { head?: React.ReactNode }) {
  const pageProps = head ? { title: "Signals" } : { icon: <Eye size={14} />, title: "Visits", back: { label: "Companies", onClick: () => navigate("companies") } };
  const sites = useSiteHealth<SiteHealth>(sb, ws.id);
  const visits = useQuery(`visitors_live:${ws.id}`, async () => must(await sb.rpc("visitors_live", { p_ws: ws.id, p_hours: 24, p_limit: 200 })) as Visit[]);
  const { reload, set: setVisits } = visits;
  const [stored, setFilters] = useFilters("visitors", ws.id);
  const filters = cleanFilters(stored, VISIT_FIELDS as FilterField<never>[]);
  const [openId, setOpenId] = useState<string | null>(null);

  // New and moving visits every 10 seconds while the tab is visible: only what changed since the last look, merged
  // in. Hidden, it stops; back after a minute away, it reads the whole list again.
  useEffect(() => {
    let last = Date.now();
    let hiddenAt = 0;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      const since = new Date(last - 15_000).toISOString();
      last = Date.now();
      const { data } = await sb.rpc("visitors_live_since", { p_ws: ws.id, p_since: since, p_limit: 200 });
      const fresh = (data ?? []) as Visit[];
      if (!fresh.length) return;
      const byId = new Map(fresh.map((v) => [v.id, v]));
      setVisits((cur) => {
        const kept = (cur ?? []).filter((v) => !byId.has(v.id));
        return [...fresh, ...kept].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 200);
      });
    };
    const t = setInterval(() => void tick(), 10_000);
    const vis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) {
        last = Date.now();
        reload();
      } else void tick();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [sb, ws.id, reload, setVisits]);

  if (sites.error || visits.error) {
    return (
      <Page {...pageProps} flush={!!head}>
        {head}
        <div className={head ? "p-5 md:p-7" : ""}>
          <ErrorNote message={sites.error || visits.error} />
        </div>
      </Page>
    );
  }
  if (!sites.data || !visits.data) {
    return (
      <Page {...pageProps} flush={!!head}>
        {head}
        <Loading />
      </Page>
    );
  }
  if (!sites.data.length) return <VisitorsIntro head={head} action={<Button onClick={() => navigate("visitors", "setup")}>Add your site</Button>} />;

  const all = visits.data;
  const rows = applyFilters(all, filters, VISIT_FIELDS);
  const open = all.find((v) => v.id === openId) ?? null;
  const stats = [
    { label: "Visits", value: all.length },
    { label: "Companies", value: new Set(all.map((v) => v.account_id).filter(Boolean)).size },
    { label: "Known people", value: new Set(all.map((v) => v.person_id).filter(Boolean)).size },
    { label: "From AI", value: applyFilters(all, [AI], VISIT_FIELDS).length },
  ];
  return (
    <Page {...pageProps} count={head ? undefined : rows.length} flush>
      {head}
      <FilterBar sb={sb} wsId={ws.id} screen="visitors" fields={VISIT_FIELDS as FilterField<never>[]} filters={filters} onChange={setFilters} presets={VISIT_PRESETS} allLabel="All visits" />
      <div className="bg-paper px-4 pt-4 md:px-5">
        <StatCards cards={stats} />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-paper px-4 py-3 text-[12px] text-muted md:px-5">
        <span>Last 24h</span>
        <span className="ml-auto">{sites.data.map((s) => `${s.domain} ${s.last_event_at ? timeAgo(s.last_event_at) : "—"}`).join(" · ")}</span>
      </div>
      {!rows.length ? (
        <Empty icon={<Eye size={16} />} sketch={all.length ? undefined : <Sketch name="browser" size={160} />} title={all.length ? "No visits match" : "No visits yet"} />
      ) : (
        <Panel className="m-4 overflow-clip md:m-5">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Visitor</Th>
                <Th>Company</Th>
                <Th>Pages</Th>
                <Th className="text-right">Active</Th>
                <Th>Source</Th>
                <Th>Time</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <VisitRow key={v.id} v={v} on={v.id === openId} onOpen={setOpenId} />
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {open ? <VisitPanel v={open} onClose={() => setOpenId(null)} onAccount={(id) => navigate("companies", `account/${id}`)} /> : null}
    </Page>
  );
}

/** One visit in the list. Memoized: a poll that changes one visit redraws only that row. */
const VisitRow = memo(function VisitRow({ v, on, onOpen }: { v: Visit; on: boolean; onOpen: (id: string) => void }) {
  return (
    <tr onClick={() => onOpen(v.id)} className={`anim-rise-sm cursor-pointer hover:bg-hover ${on ? "bg-hover" : ""}`}>
                      <Td>
                        <span className="flex items-center gap-2.5">
                          <VisitorAvatar code={codeOf(v)} />
                          <span className="truncate font-medium">{nameOf(v)}</span>
                          {v.person_level ? <Badge tone={LEVEL_TONE[v.person_level] ?? "gray"}>{v.person_level}</Badge> : null}
                        </span>
                      </Td>
                      <Td>
                        {v.account_id ? (
                          <span className="flex items-center gap-2">
                            <span>{v.account_name ?? v.account_domain}</span>
                            {v.account_source === "vendor_network" || v.account_source === "learned_network" ? <Badge>By network</Badge> : null}
                          </span>
                        ) : (
                          <span className="text-muted">Unknown{v.country ? ` · ${v.country}` : ""}</span>
                        )}
                      </Td>
                      <Td className="max-w-[300px] truncate font-mono text-[12px]">
                        {v.pages.slice(0, 3).join("  ")}
                        {v.pageviews > 3 ? <span className="text-faint">{`  +${v.pageviews - 3}`}</span> : null}
                      </Td>
                      <Td className="text-right text-[13px] tabular-nums">{activeTime(v.engaged_s)}</Td>
                      <Td>
                        <span className="flex items-center gap-2">
                          <Badge tone={v.ref_class === "ai_assistant" ? "brand" : "gray"}>{REF_LABEL[v.ref_class ?? "direct"] ?? v.ref_class}</Badge>
                          <span className="truncate text-[12px] text-muted">{v.referrer_host ?? v.source ?? ""}</span>
                        </span>
                      </Td>
                      <Td className="text-[13px] text-muted">{timeAgo(v.started_at)}</Td>
                    </tr>
  );
});

/** One visit: who, from where, and every page in order. */
function VisitPanel({ v, onClose, onAccount }: { v: Visit; onClose: () => void; onAccount: (id: string) => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const tiles = [
    { label: "Pages", value: String(v.pageviews) },
    { label: "Active", value: activeTime(v.engaged_s) },
    { label: "Source", value: REF_LABEL[v.ref_class ?? "direct"] ?? v.ref_class ?? "—" },
    { label: "Started", value: clock(v.started_at) },
  ];
  return (
    <>
      <div className="anim-fade fixed inset-0 z-[80] bg-scrim" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={nameOf(v)} className="fixed inset-y-0 right-0 z-[81] flex w-full max-w-[440px] flex-col overflow-hidden rounded-l-2xl bg-card shadow-float">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <VisitorAvatar code={codeOf(v)} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-medium">{nameOf(v)}</h2>
            <p className="truncate text-[12.5px] text-muted">{[v.account_name ?? v.account_domain, [v.city, v.country].filter(Boolean).join(", "), v.device_type].filter(Boolean).join(" · ") || "Unknown"}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-2 border-b border-line p-4">
          {tiles.map((x) => (
            <div key={x.label} className="min-w-0 rounded-lg bg-paper px-3 py-2.5">
              <div className="label-mono">{x.label}</div>
              <div className="mt-1 truncate text-[14px] font-medium">{x.value}</div>
            </div>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="border-b border-line px-5 py-2.5 text-[12.5px] text-body">
            From <span className="font-medium text-ink">{v.referrer_host ?? v.source ?? "direct"}</span>
          </div>
          <ol>
            {v.pages.map((path, i) => (
              <li key={`${path}${i}`} className="flex items-center gap-3 border-b border-line px-5 py-2">
                <span className="w-16 shrink-0 text-[12px] text-muted">{v.page_times?.[i] ? clock(v.page_times[i]) : ""}</span>
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep text-[12px] text-muted">{i + 1}</span>
                <span className="truncate font-mono text-[12.5px]">{path}</span>
              </li>
            ))}
          </ol>
          {v.pageviews > v.pages.length ? <p className="px-5 py-2 text-[12px] text-faint">+{v.pageviews - v.pages.length} more</p> : null}
        </div>
        {v.account_id ? (
          <div className="border-t border-line px-5 py-3">
            <Button onClick={() => onAccount(v.account_id!)}>Open account</Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
