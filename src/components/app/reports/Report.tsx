"use client";

// Reports (docs/enrich-workflows-reports.md Part 3), shown inside the sections they're about (docs/unify-plan.md
// Part 1): the funnel and reps on Contacts › Overview, speed to lead and rules on Routing › Overview, forms on
// Forms › Overview, email numbers on Nurture › Emails. One date range with presets in the workspace's time zone, a CSV
// for each block, and the contacts behind any number. The counting rules are on the first screen, before there's data.

import { useMemo, useState } from "react";
import {
  compact,
  daysIn,
  delta,
  duration,
  money,
  pct,
  presetRange,
  previous,
  PRESETS,
  rangeWords,
  todayIn,
  toCsv,
  type Preset,
  type Range,
} from "@/lib/reports/range";
import { Download } from "../../Icons";
import { DayLine, FunnelBars, type FunnelStep } from "../charts/Charts";
import { Modal } from "../meetings/parts";
import { Select } from "../Select";
import { StatCards, type StatCard } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import {
  ErrorNote,
  IconButton,
  Loading,
  must,
  Panel,
  Segmented,
  Td,
  Th,
  useLoad,
  type ViewProps,
} from "../ui";

export type ReportKind =
  | "funnel"
  | "reps"
  | "speed"
  | "rules"
  | "forms"
  | "email";
const TITLE: Record<ReportKind, string> = {
  funnel: "Funnel",
  reps: "Reps",
  speed: "Speed to lead",
  rules: "Routing rules",
  forms: "Forms",
  email: "Emails",
};
const PRESET_KEY = "claritia:reports-range";

type Names = {
  forms: Record<string, string>;
  people: Record<string, string>;
  rules: Record<string, string>;
  tz: string;
};
type Drill = {
  page: "funnel" | "reps" | "forms" | "email";
  metric: string;
  by?: string | null;
  group?: string | null;
  title: string;
};
type Csv = () => { name: string; text: string };

function readPreset(): Preset {
  try {
    const v = localStorage.getItem(PRESET_KEY);
    if (v && PRESETS.some((p) => p.value === v)) return v as Preset;
  } catch {}
  return "this_month";
}

function download(c: { name: string; text: string }) {
  const url = URL.createObjectURL(
    new Blob([c.text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = c.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A block's title and its CSV. */
function Head({ title, csv }: { title?: string; csv: Csv | null }) {
  if (!title && !csv) return null;
  return (
    <div className="flex min-h-8 items-center gap-2">
      {title ? (
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
      ) : null}
      {csv ? (
        <IconButton
          label="Export CSV"
          className="ml-auto"
          onClick={() => download(csv())}
        >
          <Download size={15} />
        </IconButton>
      ) : null}
    </div>
  );
}

/**
 * One or more report blocks under one date range. `titled` shows each block's title (off when a page shows one block
 * that its tab already names).
 */
export function Report({
  sb,
  ws,
  navigate,
  show,
  titled = true,
}: Pick<ViewProps, "sb" | "navigate"> & {
  ws: string;
  show: ReportKind[];
  titled?: boolean;
}) {
  const [preset, setPreset] = useState<Preset>(readPreset);
  const [drill, setDrill] = useState<Drill | null>(null);
  const names = useLoad(async (): Promise<Names> => {
    const [forms, people, profiles, versions, settings] = await Promise.all([
      sb.from("forms").select("id, name").eq("workspace_id", ws),
      sb.rpc("workspace_people", { p_ws: ws }),
      sb
        .from("booking_profiles")
        .select("user_id, name")
        .eq("workspace_id", ws),
      sb
        .from("router_versions")
        .select("version, body")
        .eq("workspace_id", ws)
        .order("version", { ascending: false })
        .limit(20),
      sb
        .from("send_settings")
        .select("timezone")
        .eq("workspace_id", ws)
        .maybeSingle(),
    ]);
    const named = new Map(
      ((profiles.data ?? []) as { user_id: string; name: string }[]).map(
        (p) => [p.user_id, p.name],
      ),
    );
    const rules: Record<string, string> = {};
    for (const v of (versions.data ?? []) as {
      body: { rules?: { list?: { id: string; name: string }[] } };
    }[])
      for (const r of v.body.rules?.list ?? []) rules[r.id] ??= r.name;
    return {
      forms: Object.fromEntries(
        ((must(forms) ?? []) as { id: string; name: string }[]).map((f) => [
          f.id,
          f.name,
        ]),
      ),
      people: Object.fromEntries(
        ((people.data ?? []) as { id: string; email: string }[]).map((p) => [
          p.id,
          named.get(p.id) || p.email.replace(/@.*/, ""),
        ]),
      ),
      rules,
      tz: (settings.data as { timezone?: string } | null)?.timezone || "UTC",
    };
  }, ws);
  const range = useMemo(
    () => presetRange(preset, todayIn(names.data?.tz ?? "UTC")),
    [preset, names.data?.tz],
  );
  const pick = (p: Preset) => {
    setPreset(p);
    try {
      localStorage.setItem(PRESET_KEY, p);
    } catch {}
  };
  if (names.error) return <ErrorNote message={names.error} />;
  if (!names.data) return <Loading />;
  const props = { sb, ws, range, names: names.data, onDrill: setDrill };
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-end gap-2">
        <span className="hidden text-[12.5px] text-muted tabular-nums sm:inline">
          {rangeWords(range)}
        </span>
        <Select
          value={preset}
          options={PRESETS}
          onChange={pick}
          ariaLabel="Date range"
          className="h-9 w-40"
        />
      </div>
      {show.map((k) => {
        const t = titled ? TITLE[k] : undefined;
        switch (k) {
          case "funnel":
            return <FunnelPage key={k} {...props} title={t} />;
          case "reps":
            return <RepsPage key={k} {...props} title={t} />;
          case "speed":
            return <SpeedPage key={k} {...props} title={t} />;
          case "rules":
            return <RulesPage key={k} {...props} title={t} />;
          case "forms":
            return <FormsPage key={k} {...props} title={t} />;
          case "email":
            return <EmailPage key={k} {...props} title={t} />;
        }
      })}
      {drill ? (
        <People
          sb={sb}
          ws={ws}
          range={range}
          drill={drill}
          onOpen={(cid) => navigate("contacts", cid)}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </div>
  );
}

type PageProps = {
  sb: ViewProps["sb"];
  ws: string;
  range: Range;
  names: Names;
  onDrill: (d: Drill) => void;
  title?: string;
};

/** "vs Sep 1 – 30: +12%" under a stat card. */
const vs = (range: Range, now: number, before: number) => {
  const d = delta(now, before);
  return d
    ? `${d} vs ${rangeWords(previous(range))}`
    : `None in ${rangeWords(previous(range))} either`;
};

/** A number that opens the contacts behind it. */
function Num({
  value,
  onClick,
  format = (n: number) => n.toLocaleString("en-US"),
}: {
  value: number;
  onClick?: () => void;
  format?: (n: number) => string;
}) {
  if (!onClick || !value)
    return <span className="tabular-nums">{format(value)}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full font-medium text-ink tabular-nums underline-offset-2 hover:underline focus-visible:underline"
    >
      {format(value)}
    </button>
  );
}

// Funnel --------------------------------------------------------------------------------------------------------------

type Steps = {
  visits: number;
  views: number;
  starts: number;
  submitted: number;
  qualified: number;
  routed: number;
  booked: number;
  held: number;
  opportunity: number;
  won: number;
  won_amount: number;
};
type Group = Partial<Steps> & { key: string };
type FunnelOut = {
  now: Steps & { groups?: Group[] };
  before: Steps;
  days: { day: string; n: number }[];
};
type By = "source" | "campaign" | "form" | "rep" | "rule";

const STEPS: { key: keyof Steps; label: string; cohort: boolean }[] = [
  { key: "visits", label: "Visits", cohort: false },
  { key: "views", label: "Forms viewed", cohort: false },
  { key: "starts", label: "Started", cohort: false },
  { key: "submitted", label: "Submitted", cohort: true },
  { key: "qualified", label: "Qualified", cohort: true },
  { key: "routed", label: "Routed", cohort: true },
  { key: "booked", label: "Booked", cohort: true },
  { key: "held", label: "Held", cohort: true },
  { key: "opportunity", label: "Opportunity", cohort: true },
  { key: "won", label: "Won", cohort: true },
];

const BY: { value: By; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "campaign", label: "Campaign" },
  { value: "form", label: "Form" },
  { value: "rep", label: "Rep" },
  { value: "rule", label: "Rule" },
];

const groupName = (by: By, key: string, n: Names) => {
  if (!key)
    return by === "campaign"
      ? "No campaign"
      : by === "rep"
        ? "No rep"
        : by === "rule"
          ? "No rule"
          : by === "form"
            ? "No form"
            : "Unknown";
  if (by === "form") return n.forms[key] ?? "A removed form";
  if (by === "rep") return n.people[key] ?? "A former teammate";
  if (by === "rule") return n.rules[key] ?? "A removed rule";
  return key;
};

function FunnelPage({ sb, ws, range, names, onDrill, title }: PageProps) {
  const [by, setBy] = useState<By>("source");
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_funnel", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
          p_by: by,
        }),
      ) as FunnelOut,
    `${ws}:${range.from}:${range.to}:${by}`,
  );
  const d = r.data;
  const csv: Csv | null = d
    ? () => ({
        name: `funnel-${range.from}-${range.to}-by-${by}.csv`,
        text: toCsv(
          [
            BY.find((b) => b.value === by)!.label,
            ...STEPS.map((s) => s.label),
            "Won amount",
          ],
          [
            ["All", ...STEPS.map((s) => d.now[s.key]), d.now.won_amount],
            ...(d.now.groups ?? []).map((g) => [
              groupName(by, g.key, names),
              ...STEPS.map((s) => g[s.key] ?? ""),
              g.won_amount ?? 0,
            ]),
          ],
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  if (!d.now.submitted && !d.now.visits && !d.before.submitted && !d.now.views)
    return (
      <ToolIntro
        sketch="funnel"
        title={"From the first visit\nto the deal won"}
        lead="Every lead that came in during the range, followed forward to the meeting and the deal. Each contact counts once, under its first touch."
        features={[
          {
            title: "Who counts",
            text: "A lead is a contact whose first form fill falls in the range. Test fills, spam and deleted contacts are left out; merged contacts count once.",
          },
          {
            title: "Qualified and won",
            text: "Qualified is stage MQL or later, or your first qualify outcome. Won is a deal linked to the lead or their company, created after they came in, in a won stage.",
          },
          {
            title: "First touch",
            text: "The first fill's UTMs, else the first visit's source, else how the contact was made. Set once, never changed.",
          },
        ]}
      />
    );

  const steps: FunnelStep[] = STEPS.map((s) => ({
    key: s.key,
    label: s.label,
    value: d.now[s.key],
    pickable: s.cohort,
  }));
  const cards: StatCard[] = [
    {
      label: "Leads",
      value: d.now.submitted,
      note: vs(range, d.now.submitted, d.before.submitted),
    },
    {
      label: "Booked",
      value: d.now.booked,
      note: `${pct(d.now.booked, d.now.submitted)} of leads, ${delta(d.now.booked, d.before.booked) ?? "none before"}`,
    },
    {
      label: "Won",
      value: d.now.won_amount,
      format: money,
      note: `${d.now.won} deals, ${delta(d.now.won_amount, d.before.won_amount) ?? "none before"}`,
    },
    {
      label: "Visits",
      value: d.now.visits,
      format: compact,
      note: vs(range, d.now.visits, d.before.visits),
    },
  ];
  const groups = d.now.groups ?? [];
  const hasVisits = by === "source" || by === "campaign";
  const hasViews = by === "form";
  const drillTo = (metric: string, group?: string) =>
    onDrill({
      page: "funnel",
      metric,
      by: group === undefined ? null : by,
      group: group ?? null,
      title: `${STEPS.find((s) => s.key === metric)?.label}${group !== undefined ? `: ${groupName(by, group, names)}` : ""}`,
    });

  return (
    <div className="flex flex-col gap-5">
      <Head title={title} csv={csv} />
      <StatCards cards={cards} />
      <Panel className="p-5">
        <FunnelBars steps={steps} onPick={(k) => drillTo(k)} />
      </Panel>
      {daysIn(range) > 1 ? (
        <Panel className="p-5">
          <span className="mb-3 block text-[13px] font-medium text-ink">
            Leads a day
          </span>
          <DayLine
            label="Leads a day"
            points={d.days.map((x) => ({ day: x.day, v: x.n }))}
          />
        </Panel>
      ) : null}
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <span className="text-[13px] font-medium text-ink">By</span>
          <Segmented
            value={by}
            options={BY}
            onChange={setBy}
            label="Break down by"
          />
        </div>
        {groups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <Th>{BY.find((b) => b.value === by)!.label}</Th>
                  {hasVisits ? <Th className="text-right">Visits</Th> : null}
                  {hasViews ? <Th className="text-right">Viewed</Th> : null}
                  <Th className="text-right">Leads</Th>
                  <Th className="text-right">Qualified</Th>
                  <Th className="text-right">Booked</Th>
                  <Th className="text-right">Booked rate</Th>
                  <Th className="text-right">Won</Th>
                  <Th className="text-right">Won amount</Th>
                </tr>
              </thead>
              <tbody>
                {groups.slice(0, 50).map((g) => (
                  <tr key={g.key} className="border-t border-line">
                    <Td className="max-w-[260px] truncate">
                      {groupName(by, g.key, names)}
                    </Td>
                    {hasVisits ? (
                      <Td className="text-right tabular-nums">
                        {compact(g.visits ?? 0)}
                      </Td>
                    ) : null}
                    {hasViews ? (
                      <Td className="text-right tabular-nums">
                        {compact(g.views ?? 0)}
                      </Td>
                    ) : null}
                    <Td className="text-right">
                      <Num
                        value={g.submitted ?? 0}
                        onClick={() => drillTo("submitted", g.key)}
                      />
                    </Td>
                    <Td className="text-right">
                      <Num
                        value={g.qualified ?? 0}
                        onClick={() => drillTo("qualified", g.key)}
                      />
                    </Td>
                    <Td className="text-right">
                      <Num
                        value={g.booked ?? 0}
                        onClick={() => drillTo("booked", g.key)}
                      />
                    </Td>
                    <Td className="text-right text-muted tabular-nums">
                      {pct(g.booked ?? 0, g.submitted ?? 0)}
                    </Td>
                    <Td className="text-right">
                      <Num
                        value={g.won ?? 0}
                        onClick={() => drillTo("won", g.key)}
                      />
                    </Td>
                    <Td className="text-right tabular-nums">
                      {money(g.won_amount ?? 0)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-[13px] text-muted">
            No leads in this range
          </p>
        )}
      </Panel>
    </div>
  );
}

// Speed to lead -------------------------------------------------------------------------------------------------------

type Spread = { median: number | null; p90: number | null; n: number };
type SpeedSum = {
  leads: number;
  assigned: Spread;
  touched: Spread;
  booked: Spread;
  on_time: { met: number; total: number };
};
type SpeedOut = {
  now: SpeedSum;
  before: SpeedSum;
  days: { day: string; median: number | null }[];
  slowest: {
    id: string;
    name: string | null;
    email: string | null;
    at: string;
    seconds: number;
    touched: boolean;
  }[];
};

const faster = (now: number | null, before: number | null) => {
  if (now == null || before == null || !before) return "";
  const p = Math.round(((now - before) / before) * 100);
  return p === 0
    ? ", same as before"
    : p < 0
      ? `, ${Math.abs(p)}% faster`
      : `, ${p}% slower`;
};

function SpeedPage({ sb, ws, range, title }: PageProps) {
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_speed", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
        }),
      ) as SpeedOut,
    `${ws}:${range.from}:${range.to}`,
  );
  const d = r.data;
  const csv: Csv | null = d
    ? () => ({
        name: `speed-to-lead-${range.from}-${range.to}.csv`,
        text: toCsv(
          ["Measure", "Median (seconds)", "90th percentile (seconds)", "Leads"],
          [
            [
              "To a rep",
              d.now.assigned.median,
              d.now.assigned.p90,
              d.now.assigned.n,
            ],
            [
              "To first touch",
              d.now.touched.median,
              d.now.touched.p90,
              d.now.touched.n,
            ],
            [
              "To a meeting",
              d.now.booked.median,
              d.now.booked.p90,
              d.now.booked.n,
            ],
          ],
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  if (!d.now.leads && !d.before.leads)
    return (
      <ToolIntro
        sketch="calendar"
        title={"How fast every lead\nhears back"}
        lead="From the moment a form is sent: how long until a rep has it, until someone reaches out, and until a meeting is booked."
        features={[
          {
            title: "First touch",
            text: "The first of: the response time marked met, a meeting booked, or a one-to-one email sent from Claritia. Emails from a rep's own Gmail aren't seen yet.",
          },
          {
            title: "On time",
            text: "The share of timed leads reached within the response time set in Routing.",
          },
        ]}
      />
    );
  const cards = (
    [
      {
        label: "To a rep",
        value: d.now.assigned.median,
        format: duration,
        note: `90% within ${duration(d.now.assigned.p90)}${faster(d.now.assigned.median, d.before.assigned.median)}`,
      },
      {
        label: "To first touch",
        value: d.now.touched.median,
        format: duration,
        note: `90% within ${duration(d.now.touched.p90)}${faster(d.now.touched.median, d.before.touched.median)}`,
      },
      {
        label: "To a meeting",
        value: d.now.booked.median,
        format: duration,
        note: `${d.now.booked.n} of ${d.now.leads} leads booked`,
      },
      {
        label: "Reached on time",
        value: d.now.on_time.total
          ? Math.round((d.now.on_time.met / d.now.on_time.total) * 100)
          : null,
        format: (n) => `${n}%`,
        note: `${d.now.on_time.met} of ${d.now.on_time.total} timed leads`,
      },
    ] as StatCard[]
  ).map(
    (c): StatCard =>
      c.value == null ? { ...c, value: 0, format: () => "–" } : c,
  );
  return (
    <div className="flex flex-col gap-5">
      <Head title={title} csv={csv} />
      <StatCards cards={cards} />
      {daysIn(range) > 1 ? (
        <Panel className="p-5">
          <span className="mb-3 block text-[13px] font-medium text-ink">
            Median to first touch, by day
          </span>
          <DayLine
            label="Median to first touch, by day"
            points={d.days.map((x) => ({ day: x.day, v: x.median }))}
            format={duration}
          />
        </Panel>
      ) : null}
      <Panel className="overflow-hidden">
        <div className="border-b border-line px-5 py-3 text-[13px] font-medium text-ink">
          Slowest leads
        </div>
        {d.slowest.length ? (
          <table className="w-full text-[13px]">
            <tbody>
              {d.slowest.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-line first:border-t-0"
                >
                  <Td className="max-w-[280px] truncate">
                    {s.name || s.email || "No name"}
                  </Td>
                  <Td className="text-muted">
                    {new Date(s.at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {s.touched
                      ? duration(s.seconds)
                      : `Not reached, ${duration(s.seconds)}`}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-[13px] text-muted">
            No leads in this range
          </p>
        )}
      </Panel>
    </div>
  );
}

// Reps ----------------------------------------------------------------------------------------------------------------

type Rep = {
  id: string;
  leads: number;
  met: number;
  timed: number;
  booked: number;
  held: number;
  no_show: number;
  opportunities: number;
  won_amount: number;
  cap_week: number | null;
};

function RepsPage({ sb, ws, range, names, onDrill, title }: PageProps) {
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_reps", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
        }),
      ) as { weeks: number; reps: Rep[] },
    `${ws}:${range.from}:${range.to}`,
  );
  const d = r.data;
  const name = (id: string) => names.people[id] ?? "A former teammate";
  const perWeek = (x: Rep) =>
    d && d.weeks > 0 ? Math.round((x.leads / d.weeks) * 10) / 10 : 0;
  const csv: Csv | null = d
    ? () => ({
        name: `reps-${range.from}-${range.to}.csv`,
        text: toCsv(
          [
            "Rep",
            "Leads",
            "Leads a week",
            "Weekly cap",
            "Reached on time",
            "Booked",
            "Held",
            "No-shows",
            "Opportunities",
            "Won amount",
          ],
          d.reps.map((x) => [
            name(x.id),
            x.leads,
            perWeek(x),
            x.cap_week,
            pct(x.met, x.timed),
            x.booked,
            x.held,
            x.no_show,
            x.opportunities,
            x.won_amount,
          ]),
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  const drill = (metric: string, x: Rep, label: string) =>
    onDrill({
      page: "reps",
      metric,
      group: x.id,
      title: `${name(x.id)}: ${label}`,
    });
  return (
    <div className="flex flex-col gap-3">
      <Head title={title} csv={csv} />
      <Panel className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <Th>Rep</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">A week</Th>
              <Th className="text-right">On time</Th>
              <Th className="text-right">Booked</Th>
              <Th className="text-right">Held</Th>
              <Th className="text-right">No-shows</Th>
              <Th className="text-right">Opportunities</Th>
              <Th className="text-right">Won amount</Th>
            </tr>
          </thead>
          <tbody>
            {d.reps.map((x) => (
              <tr key={x.id} className="border-t border-line">
                <Td className="max-w-[220px] truncate font-medium">
                  {name(x.id)}
                </Td>
                <Td className="text-right">
                  <Num
                    value={x.leads}
                    onClick={() => drill("leads", x, "Leads")}
                  />
                </Td>
                <Td className="text-right text-muted tabular-nums">
                  {perWeek(x)}
                  {x.cap_week ? ` of ${x.cap_week}` : ""}
                </Td>
                <Td className="text-right tabular-nums">
                  {pct(x.met, x.timed)}
                </Td>
                <Td className="text-right">
                  <Num
                    value={x.booked}
                    onClick={() => drill("booked", x, "Booked")}
                  />
                </Td>
                <Td className="text-right">
                  <Num
                    value={x.held}
                    onClick={() => drill("held", x, "Held")}
                  />
                </Td>
                <Td className="text-right">
                  <Num
                    value={x.no_show}
                    onClick={() => drill("no_show", x, "No-shows")}
                  />
                  <span className="ml-1 text-muted">
                    {x.held + x.no_show
                      ? `(${pct(x.no_show, x.held + x.no_show)})`
                      : ""}
                  </span>
                </Td>
                <Td className="text-right tabular-nums">{x.opportunities}</Td>
                <Td className="text-right tabular-nums">
                  {money(Number(x.won_amount))}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// Forms ---------------------------------------------------------------------------------------------------------------

type FormRow = {
  id: string;
  name: string;
  views: number;
  starts: number;
  submits: number;
  booked: number;
  qualified: number;
  people: number;
};
type RuleRow = {
  id: string;
  name: string | null;
  leads: number;
  booked: number;
};

function FormsPage({ sb, ws, range, onDrill, title }: PageProps) {
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_forms", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
        }),
      ) as { forms: FormRow[]; rules: RuleRow[] },
    `${ws}:${range.from}:${range.to}`,
  );
  const d = r.data;
  const csv: Csv | null = d
    ? () => ({
        name: `forms-${range.from}-${range.to}.csv`,
        text: toCsv(
          [
            "Form",
            "Views",
            "Starts",
            "Submits",
            "Submit rate",
            "Booked rate",
            "Qualified rate",
          ],
          d.forms.map((f) => [
            f.name,
            f.views,
            f.starts,
            f.submits,
            pct(f.submits, f.views),
            pct(f.booked, f.submits),
            pct(f.qualified, f.people),
          ]),
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      <Head title={title} csv={csv} />
      <Panel className="overflow-x-auto">
        {d.forms.length ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <Th>Form</Th>
                <Th className="text-right">Views</Th>
                <Th className="text-right">Starts</Th>
                <Th className="text-right">Submits</Th>
                <Th className="text-right">Submit rate</Th>
                <Th className="text-right">Booked rate</Th>
                <Th className="text-right">Qualified rate</Th>
              </tr>
            </thead>
            <tbody>
              {d.forms.map((f) => (
                <tr key={f.id} className="border-t border-line">
                  <Td className="max-w-[260px] truncate font-medium">
                    {f.name}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {compact(f.views)}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {compact(f.starts)}
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={f.submits}
                      onClick={() =>
                        onDrill({
                          page: "forms",
                          metric: "submits",
                          group: f.id,
                          title: `${f.name}: Submits`,
                        })
                      }
                    />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {pct(f.submits, f.views)}
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={f.booked}
                      format={() => pct(f.booked, f.submits)}
                      onClick={() =>
                        onDrill({
                          page: "forms",
                          metric: "booked",
                          group: f.id,
                          title: `${f.name}: Booked`,
                        })
                      }
                    />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {pct(f.qualified, f.people)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-6 text-[13px] text-muted">
            No form views or fills in this range
          </p>
        )}
      </Panel>
    </div>
  );
}

function RulesPage({ sb, ws, range, names, title }: PageProps) {
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_forms", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
        }),
      ) as { forms: FormRow[]; rules: RuleRow[] },
    `${ws}:${range.from}:${range.to}`,
  );
  const d = r.data;
  const ruleName = (x: RuleRow) =>
    x.name || names.rules[x.id] || "A removed rule";
  const csv: Csv | null = d
    ? () => ({
        name: `routing-rules-${range.from}-${range.to}.csv`,
        text: toCsv(
          ["Rule", "Leads", "Booked", "Booked rate"],
          d.rules.map((x) => [
            ruleName(x),
            x.leads,
            x.booked,
            pct(x.booked, x.leads),
          ]),
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  if (!d.rules.length) return null;
  return (
    <div className="flex flex-col gap-3">
      <Head title={title} csv={csv} />
      <Panel className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <Th>Routing rule</Th>
              <Th className="text-right">Leads</Th>
              <Th className="text-right">Booked</Th>
              <Th className="text-right">Booked rate</Th>
            </tr>
          </thead>
          <tbody>
            {d.rules.map((x) => (
              <tr key={x.id} className="border-t border-line">
                <Td className="max-w-[260px] truncate font-medium">
                  {ruleName(x)}
                </Td>
                <Td className="text-right tabular-nums">{x.leads}</Td>
                <Td className="text-right tabular-nums">{x.booked}</Td>
                <Td className="text-right tabular-nums">
                  {pct(x.booked, x.leads)}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// Email ---------------------------------------------------------------------------------------------------------------

type Mail = {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  bounced: number;
  clicked: number;
  unsubscribed: number;
  complaints: number;
  meetings: number;
};

function EmailPage({ sb, ws, range, onDrill, title }: PageProps) {
  const [view, setView] = useState<"emails" | "workflows">("emails");
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_email", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
        }),
      ) as { emails: Mail[]; workflows: Mail[] },
    `${ws}:${range.from}:${range.to}`,
  );
  const d = r.data;
  const rows = d ? d[view] : [];
  const csv: Csv | null = d
    ? () => ({
        name: `email-${view}-${range.from}-${range.to}.csv`,
        text: toCsv(
          [
            view === "emails" ? "Email" : "Workflow",
            "Sent",
            "Delivered",
            "Bounced",
            "Clicked",
            "Unsubscribed",
            "Complaints",
            "Meetings within 7 days of a click",
          ],
          rows.map((m) => [
            m.name,
            m.sent,
            m.delivered,
            m.bounced,
            m.clicked,
            m.unsubscribed,
            m.complaints,
            m.meetings,
          ]),
        ),
      })
    : null;
  if (r.error) return <ErrorNote message={r.error} />;
  if (!d) return <Loading />;
  if (!d.emails.length)
    return (
      <ToolIntro
        sketch="envelopes"
        title={"Which emails\nled to meetings"}
        lead="Sent, delivered, bounced, clicked and unsubscribed for every email and workflow, and the meetings booked within 7 days of a click."
        features={[
          {
            title: "No open rates",
            text: "Apple Mail opens every email it receives, so open counts mislead. Clicks and meetings are counted instead.",
          },
        ]}
      />
    );
  const drill = (m: Mail, metric: string, label: string) =>
    view === "emails"
      ? () =>
          onDrill({
            page: "email",
            metric,
            group: m.id,
            title: `${m.name}: ${label}`,
          })
      : undefined;
  return (
    <div className="flex flex-col gap-3">
      <Head title={title} csv={csv} />
      <Panel className="overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <Segmented
            value={view}
            options={[
              { value: "emails", label: "Emails" },
              { value: "workflows", label: "Workflows" },
            ]}
            onChange={setView}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <Th>{view === "emails" ? "Email" : "Workflow"}</Th>
                <Th className="text-right">Sent</Th>
                <Th className="text-right">Delivered</Th>
                <Th className="text-right">Bounced</Th>
                <Th className="text-right">Clicked</Th>
                <Th className="text-right">Unsubscribed</Th>
                <Th className="text-right">Complaints</Th>
                <Th className="text-right">Meetings</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <Td className="max-w-[260px] truncate font-medium">
                    {m.name}
                  </Td>
                  <Td className="text-right">
                    <Num value={m.sent} onClick={drill(m, "sent", "Sent")} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {pct(m.delivered, m.sent)}
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={m.bounced}
                      onClick={drill(m, "bounced", "Bounced")}
                    />
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={m.clicked}
                      onClick={drill(m, "clicked", "Clicked")}
                    />
                    <span className="ml-1 text-muted">
                      ({pct(m.clicked, m.delivered)})
                    </span>
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={m.unsubscribed}
                      onClick={drill(m, "unsubscribed", "Unsubscribed")}
                    />
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={m.complaints}
                      onClick={drill(m, "complaints", "Complaints")}
                    />
                  </Td>
                  <Td className="text-right">
                    <Num
                      value={m.meetings}
                      onClick={drill(m, "meetings", "Meetings after a click")}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// The contacts behind a number ----------------------------------------------------------------------------------------

function People({
  sb,
  ws,
  range,
  drill,
  onOpen,
  onClose,
}: {
  sb: ViewProps["sb"];
  ws: string;
  range: Range;
  drill: Drill;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const r = useLoad(
    async () =>
      must(
        await sb.rpc("report_people", {
          p_ws: ws,
          p_from: range.from,
          p_to: range.to,
          p_page: drill.page,
          p_metric: drill.metric,
          p_by: drill.by ?? null,
          p_group: drill.group ?? null,
        }),
      ) as {
        id: string;
        name: string | null;
        email: string | null;
      }[],
    JSON.stringify([ws, range, drill]),
  );
  return (
    <Modal title={drill.title} onClose={onClose} wide>
      <ErrorNote message={r.error} />
      {!r.data ? (
        <Loading />
      ) : !r.data.length ? (
        <p className="text-[13px] text-muted">No contacts</p>
      ) : (
        <ul className="-mx-2 flex max-h-[60vh] flex-col overflow-y-auto">
          {r.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-hover"
              >
                <span className="truncate text-[13.5px] font-medium text-ink">
                  {c.name || c.email || "No name"}
                </span>
                {c.name && c.email ? (
                  <span className="truncate text-[12.5px] text-muted">
                    {c.email}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
