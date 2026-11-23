"use client";

import { useEffect, useState } from "react";
import { Play } from "../../Icons";
import { Badge, duration, Empty, ErrorNote, errorText, Loading, must, Page, StatusTag, Th, timeAgo, usePoll, VerdictTag, type RunStatus, type ViewProps } from "../ui";
import { type RunRow, LIVE, RUN_COLUMNS, RunDetail } from "./RunDetail";

/** Load again every few seconds while `live` is true. */
function RunList({ sb, project, navigate }: ViewProps) {
  const [rows, setRows] = useState<RunRow[] | null>(null);
  const [error, setError] = useState("");
  const load = () => {
    if (!project) return;
    sb.from("runs")
      .select(RUN_COLUMNS)
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then((res) => (res.error ? setError(errorText(res.error)) : setRows(res.data as RunRow[])));
  };
  useEffect(load, [sb, project]);
  usePoll(!!rows?.some((r) => LIVE.has(r.status)), 3000, load);

  if (!project)
    return (
      <Page icon={<Play size={14} />} title="Runs">
        <Empty icon={<Play size={16} />} title="Add a project first." />
      </Page>
    );
  return (
    <Page icon={<Play size={14} />} title="Runs" count={rows?.length} flush={!!rows?.length}>
      {error ? (
        <div className="p-4">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {!rows ? (
        <Loading />
      ) : !rows.length ? (
        <Empty icon={<Play size={16} />} title="Every run will show up here, with its video." />
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Test</Th>
              <Th className="w-44">Status</Th>
              <Th className="hidden w-32 md:table-cell">Environment</Th>
              <Th className="hidden w-24 sm:table-cell">Length</Th>
              <Th className="w-28">Started</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => navigate("runs", r.id)} className="cursor-pointer hover:bg-hover">
                <td className="h-12 border-b border-line px-4 text-[13.5px]">
                  <a
                    href={`/runs/${r.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("runs", r.id);
                    }}
                    className="font-medium text-ink"
                  >
                    {r.test_name}
                  </a>
                  <span className="ml-2 font-mono text-[11px] text-faint">v{r.test_version}</span>
                </td>
                <td className="border-b border-line px-4">
                  <span className="flex gap-1.5">
                    <StatusTag status={r.status} />
                    <VerdictTag verdict={r.verdict} />
                    {r.retry_of ? <Badge>Re-run</Badge> : null}
                    {r.trigger === "schedule" ? <Badge>Scheduled</Badge> : null}
                  </span>
                </td>
                <td className="hidden border-b border-line px-4 text-[12.5px] text-muted md:table-cell">{r.environment_name}</td>
                <td className="hidden border-b border-line px-4 font-mono text-[12px] text-muted sm:table-cell">{duration(r.duration_ms)}</td>
                <td className="border-b border-line px-4 text-[12px] text-muted">{timeAgo(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}

export function RunsView(props: ViewProps) {
  if (props.id) return <RunDetail key={props.id} {...props} />;
  return <RunList {...props} />;
}

/** Each test's latest run status, for the tests list. */
export async function latestRuns(sb: ViewProps["sb"], projectId: string) {
  const rows = must(await sb.from("runs").select("test_id, status, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(500)) as { test_id: string | null; status: RunStatus; created_at: string }[];
  const out = new Map<string, { status: RunStatus; created_at: string }>();
  for (const r of rows) if (r.test_id && !out.has(r.test_id)) out.set(r.test_id, r);
  return out;
}
