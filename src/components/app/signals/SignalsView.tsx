"use client";

// Inbound › Visitors (docs/unify-plan.md Part 1, once Signals): everything the app learns from website visits.
//   Signals   numbers first (companies on the site, signals, hot accounts, alerts sent), signals per day, then the
//             live list: "Acme read the pricing page", with the company, when, and Open company
//   Visits    today's visits (moved from Companies › Visits)
//   Alerts    which signals post to Slack or email (moved from Settings › Account alerts)
//   Setup     sites and the snippet, and identity settings (moved from Settings › Sites and Identity)

import { useMemo } from "react";
import { visitorsPage, VISITORS_TABS } from "@/lib/nav";
import { Radar } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { byDay, DayBars, StatCards } from "../StatCards";
import { Badge, Button, Empty, ErrorNote, Loading, must, Page, Panel, Section, timeAgo, useLoad, type ViewProps } from "../ui";
import { Sketch } from "../../sketches/Sketch";
import { AccountAlertsPanel } from "../views/AccountAlertsPanel";
import { IdentityPanel } from "../views/IdentityPanel";
import { SitesPanel } from "../views/SitesPanel";
import { VisitorsView } from "../views/VisitorsView";

/** What each signal means, in a few words after the company's name. */
export const SIGNAL_WORDS: Record<string, string> = {
  page_pricing: "read the pricing page",
  page_demo: "looked at the demo page",
  page_compare: "compared you with others",
  page_security: "read the security page",
  page_integrations: "looked at integrations",
  case_study: "read a case study",
  docs_depth: "went deep in the docs",
  engaged_session: "spent real time on the site",
  ai_assistant_ref: "came from an AI assistant",
  review_site_ref: "came from a review site",
};

export const signalWords = (kind: string) => SIGNAL_WORDS[kind] ?? kind.replace(/^page_/, "visited ").replace(/_/g, " ");

const TEMP_TONE = { hot: "red", warming: "amber", steady: "gray", cooling: "sky", cold: "sky" } as const;

type SignalRow = { id: string; kind: string; at: string; account: { id: string; name: string | null; domain: string; temperature: keyof typeof TEMP_TONE | null } | null };

export function SignalsView(props: ViewProps) {
  const { navigate } = props;
  const page = visitorsPage(props.id);
  const nav = { title: "Visitors", tabs: VISITORS_TABS, current: page.tab, onPick: (t: string) => navigate("visitors", t === "feed" ? "" : t) };
  return (
    <Section nav={nav}>
      {page.tab === "visits" ? (
        <VisitorsView {...props} />
      ) : (
        <Page title="Visitors">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            {page.tab === "feed" ? (
              <Feed {...props} />
            ) : page.tab === "alerts" ? (
              <AccountAlertsPanel sb={props.sb} session={props.session} ws={props.ws} />
            ) : (
              <>
                <SitesPanel sb={props.sb} ws={props.ws} role={props.role} />
                <IdentityPanel sb={props.sb} session={props.session} ws={props.ws} role={props.role} />
              </>
            )}
          </div>
        </Page>
      )}
    </Section>
  );
}

function Feed({ sb, ws, navigate }: ViewProps) {
  const data = useLoad(async () => {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const month = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [recent, month30, companies, hot, alerts] = await Promise.all([
      sb.from("signals").select("id, kind, at, account:accounts(id, name, domain, temperature)").eq("workspace_id", ws.id).order("at", { ascending: false }).limit(100),
      sb.from("signals").select("at").eq("workspace_id", ws.id).gte("at", month).limit(20000),
      sb.from("account_daily").select("account_id").eq("workspace_id", ws.id).gte("day", week.slice(0, 10)).limit(20000),
      sb.from("accounts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).eq("temperature", "hot"),
      sb.from("account_alert_log").select("account_id", { count: "exact", head: true }).eq("workspace_id", ws.id).gte("sent_at", week),
    ]);
    const times = ((must(month30) ?? []) as { at: string }[]).map((r) => r.at);
    return {
      recent: (must(recent) ?? []) as unknown as SignalRow[],
      days: byDay(times, 30),
      week: times.filter((t) => t >= week).length,
      companies: new Set(((must(companies) ?? []) as { account_id: string }[]).map((r) => r.account_id)).size,
      hot: hot.count ?? 0,
      alerts: alerts.count ?? 0,
    };
  }, ws.id);
  const d = data.data;
  const groups = useMemo(() => {
    const out: { day: string; rows: SignalRow[] }[] = [];
    for (const r of d?.recent ?? []) {
      const day = new Date(r.at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      const g = out[out.length - 1];
      if (g?.day === day) g.rows.push(r);
      else out.push({ day, rows: [r] });
    }
    return out;
  }, [d]);
  if (data.error) return <ErrorNote message={data.error} />;
  return (
    <>
      <StatCards
        cards={[
          { label: "Companies on the site", value: d ? d.companies : null, note: "In the last 7 days" },
          { label: "Buying signals", value: d ? d.week : null, note: "In the last 7 days" },
          { label: "Hot accounts", value: d ? d.hot : null, note: "Fit and intent both high", tone: d?.hot ? "rose" : undefined },
          { label: "Alerts sent", value: d ? d.alerts : null, note: "To Slack and email this week" },
        ]}
      />
      <Panel className="px-5 py-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Signals per day</h2>
          <span className="text-[12px] text-faint">Last 30 days</span>
        </div>
        {d ? <DayBars days={d.days} label="Signals per day" /> : <div className="anim-shimmer h-36 rounded-lg bg-paper-deep" />}
      </Panel>
      {!d ? (
        <Loading />
      ) : !d.recent.length ? (
        <Empty sketch={<Sketch name="browser" size={150} />} title="No signals yet">
          <Button className="mt-3" onClick={() => navigate("visitors", "setup")}>
            Set up your site
          </Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.day} className="flex flex-col gap-1.5">
              <h3 className="text-[12.5px] font-medium text-muted">{g.day}</h3>
              <ul className="overflow-hidden rounded-2xl border border-line bg-card">
                {g.rows.map((r, i) => (
                  <li key={r.id} className={`anim-rise-sm flex items-center gap-3 px-4 py-2.5 ${i ? "border-t border-line" : ""}`} style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}>
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-paper-deep">
                      {r.account?.domain ? <BrandLogo domain={r.account.domain} name={r.account.name ?? r.account.domain} size={20} /> : <Radar size={14} className="text-faint" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">
                      <span className="font-medium">{r.account?.name || r.account?.domain || "A company"}</span> <span className="text-body">{signalWords(r.kind)}</span>
                    </span>
                    {r.account?.temperature && r.account.temperature !== "steady" ? (
                      <Badge tone={TEMP_TONE[r.account.temperature]} dot>
                        {r.account.temperature[0]!.toUpperCase() + r.account.temperature.slice(1)}
                      </Badge>
                    ) : null}
                    <span className="w-20 shrink-0 text-right text-[12px] text-faint">{timeAgo(r.at)}</span>
                    {r.account ? (
                      <Button variant="plain" size="sm" onClick={() => navigate("companies", `account/${r.account!.id}`)}>
                        Open
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
