"use client";

// The Fields view of Results (docs/forms-plan.md 1.2): for the visits that started the form, each question in form
// order with how many reached it and answered it, how often it showed an error, the median time spent in it and
// where people stopped. Forms with steps get a step funnel on top. From the form's own field summaries
// (form_field_sessions), never the answers.

import { useState } from "react";
import { allFields, isContent, type Form } from "@/lib/forms/schema";
import { Sketch } from "../../sketches/Sketch";
import { Select } from "../Select";
import { Badge, Empty, ErrorNote, Loading, must, Panel, Segmented, Stat, useLoad, type ViewProps } from "../ui";
import { FormFills } from "./FormFills";
import type { Destination } from "./shared";

/** Results: the fills, or the numbers per field. ?view=fields in the address opens on Fields (the Forms report links there). */
export function FormResults(props: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { formId: string; destinations: Destination[]; watch: number; books: boolean }) {
  const [view, setView] = useState<"fills" | "fields">(() => (typeof location !== "undefined" && new URLSearchParams(location.search).get("view") === "fields" && !props.watch ? "fields" : "fills"));
  return (
    <div className="flex flex-col items-start gap-4">
      <Segmented
        label="Results"
        value={view}
        options={[
          { value: "fills", label: "Fills" },
          { value: "fields", label: "Fields" },
        ]}
        onChange={setView}
      />
      <div className="w-full">{view === "fills" ? <FormFills {...props} /> : <FormFields sb={props.sb} formId={props.formId} />}</div>
    </div>
  );
}

type FieldStat = { id: string; reached: number; answered: number; with_errors: number; errors: number; median_ms: number | null; left: number };
type Stats = { visits: number; sent: number; fields: FieldStat[]; steps: { step: number; reached: number }[] };

const RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
const secs = (ms: number | null) => (ms === null || ms === undefined ? "—" : ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))}s` : `${Math.round(ms / 60_000)}m`);

export function FormFields({ sb, formId }: Pick<ViewProps, "sb"> & { formId: string }) {
  const [range, setRange] = useState("30");
  const stats = useLoad(async () => {
    const now = Date.now();
    const [s, v] = await Promise.all([
      sb.rpc("form_field_stats", { p_form: formId, p_from: day(now - Number(range) * 86_400_000), p_to: day(now + 86_400_000) }),
      sb.from("form_versions").select("version, body").eq("form_id", formId).order("version", { ascending: false }),
    ]);
    return { stats: must(s) as Stats, versions: must(v) as { version: number; body: Form }[] };
  }, `${formId}:${range}`);
  if (stats.error) return <ErrorNote message={stats.error} />;
  if (!stats.data) return <Loading />;
  const { stats: d, versions } = stats.data;
  const latest = versions[0]?.body;
  // Form order from the newest version, then fields only older versions had.
  const names = new Map<string, string>();
  for (const v of versions) for (const f of allFields(v.body)) if (!isContent(f.type) && !names.has(f.id)) names.set(f.id, f.label || "No label");
  const order = [...names.keys()];
  const byId = new Map(d.fields.map((f) => [f.id, f]));
  const rows = order.map((id) => byId.get(id)).filter((f): f is FieldStat => !!f && f.reached > 0);
  const most = [...rows].sort((a, b) => b.left - a.left)[0];
  const steps = latest && latest.steps.length > 1 ? d.steps : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Select<string> value={range} onChange={setRange} ariaLabel="When" options={RANGES} className="h-9 w-40 rounded-sm border border-line-strong bg-card px-3 text-[13px] focus:border-ink" />
      </div>
      {!d.visits ? (
        <Empty sketch={<Sketch name="clipboard" size={160} />} title="No visits yet" />
      ) : (
        <>
          <Panel className="grid grid-cols-3 gap-4 px-5 py-5">
            <Stat value={d.visits.toLocaleString("en-US")} label="Started" />
            <Stat value={d.sent.toLocaleString("en-US")} label="Sent" />
            <Stat value={pct(d.sent, d.visits)} label="Finish rate" />
          </Panel>
          {steps.length > 1 ? (
            <Panel className="flex flex-col gap-2 px-5 py-4">
              {steps.map((s) => (
                <div key={s.step} className="grid grid-cols-[72px_minmax(0,1fr)_56px] items-center gap-3 text-[13px]">
                  <span className="text-muted">Step {s.step + 1}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-paper-deep">
                    <span className="block h-full origin-left rounded-full bg-ink" style={{ transform: `scaleX(${d.visits ? s.reached / d.visits : 0})` }} />
                  </span>
                  <span className="text-right tabular-nums">{pct(s.reached, d.visits)}</span>
                </div>
              ))}
            </Panel>
          ) : null}
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted">
                  <th className="py-2.5 pr-3 pl-5 font-medium">Field</th>
                  <th className="w-[28%] py-2.5 pr-3 font-medium">Answered</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Reached</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Errors</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Time</th>
                  <th className="py-2.5 pr-5 text-right font-medium">Left here</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} className="border-t border-line">
                    <td className="max-w-[260px] py-2.5 pr-3 pl-5">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{names.get(f.id)}</span>
                        {most && most.left > 0 && most.id === f.id ? <Badge tone="amber">Most left here</Badge> : null}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
                          <span className="block h-full origin-left rounded-full bg-ink" style={{ transform: `scaleX(${f.reached ? f.answered / f.reached : 0})` }} />
                        </span>
                        <span className="w-10 text-right tabular-nums">{pct(f.answered, f.reached)}</span>
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{f.reached.toLocaleString("en-US")}</td>
                    <td className={`py-2.5 pr-3 text-right tabular-nums ${f.with_errors ? "text-rose" : ""}`}>{pct(f.with_errors, f.reached)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{secs(f.median_ms)}</td>
                    <td className="py-2.5 pr-5 text-right tabular-nums">{f.left.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </>
      )}
    </div>
  );
}
