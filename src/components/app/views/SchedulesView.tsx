"use client";

import { useState } from "react";
import { describeSchedule } from "@/lib/schedules";
import { Clock, Plus, Trash } from "../../Icons";
import { askConfirm } from "../Dialogs";

import { announceChange, attempt, Badge, Button, CardHead, Empty, ErrorNote, Loading, must, Page, Panel, timeAgo, useLoad, type Environment, type ViewProps } from "../ui";
import { type Schedule, type Draft, type TestRef, myZone, ScheduleForm } from "./ScheduleForm";

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Schedules: run a project's tests every hour, day, weekday or week, on one environment. */
export function SchedulesView({ sb, project }: ViewProps) {
  const data = useLoad(async () => {
    if (!project)
      return {
        schedules: [] as Schedule[],
        envs: [] as Environment[],
        tests: [] as TestRef[],
      };
    const [schedules, envs, tests] = await Promise.all([
      sb
        .from("schedules")
        .select(
          "id, name, environment_id, scope, use_case, test_ids, every, at_hour, at_minute, weekday, timezone, enabled, next_run_at, last_run_at, last_count, last_error",
        )
        .eq("project_id", project.id)
        .order("created_at"),
      sb
        .from("environments")
        .select("id, project_id, name, base_url, created_at")
        .eq("project_id", project.id)
        .order("created_at"),
      sb
        .from("tests")
        .select("id, name, use_case")
        .eq("project_id", project.id)
        .order("use_case")
        .order("name"),
    ]);
    return {
      schedules: must(schedules) as Schedule[],
      envs: must(envs) as Environment[],
      tests: must(tests) as TestRef[],
    };
  }, project?.id ?? "none");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const act = (fn: () => Promise<unknown>) =>
    attempt(fn, {
      setError,
      after: () => {
        data.reload();
        announceChange();
      },
    });

  const save = async (id: string | null, d: Draft) => {
    const row = {
      ...d,
      use_case: d.scope === "use_case" ? d.use_case : null,
      test_ids: d.scope === "tests" ? d.test_ids : [],
    };
    if (id) must(await sb.from("schedules").update(row).eq("id", id));
    else
      must(
        await sb.from("schedules").insert({ ...row, project_id: project!.id }),
      );
    setEditing(null);
    data.reload();
  };

  const envName = (id: string) =>
    data.data?.envs.find((e) => e.id === id)?.name ?? "—";
  const scopeText = (s: Schedule) =>
    s.scope === "all"
      ? "Every test"
      : s.scope === "use_case"
        ? `Use case: ${s.use_case}`
        : `${s.test_ids.length} ${s.test_ids.length === 1 ? "test" : "tests"}`;
  const blank = (): Draft => ({
    name: "",
    environment_id: data.data?.envs[0]?.id ?? "",
    scope: "all",
    use_case: null,
    test_ids: [],
    every: "day",
    at_hour: 9,
    at_minute: 0,
    weekday: 1,
    timezone: myZone(),
  });

  return (
    <Page
      icon={<Clock size={14} />}
      title="Schedules"
      count={data.data?.schedules.length}
      actions={
        project && data.data?.envs.length && editing === null ? (
          <Button onClick={() => setEditing("new")}>
            <Plus size={13} />
            New schedule
          </Button>
        ) : null
      }
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <ErrorNote message={error || data.error} />
        {!data.data ? (
          <Loading />
        ) : editing === "new" ? (
          <Panel>
            <CardHead label="New schedule" />
            <ScheduleForm
              envs={data.data.envs}
              tests={data.data.tests}
              initial={blank()}
              onSave={(d) => save(null, d)}
              onCancel={() => setEditing(null)}
            />
          </Panel>
        ) : !data.data.schedules.length ? (
          <Empty icon={<Clock size={16} />} title="No schedules yet.">
            {data.data.envs.length
              ? "Run your tests every hour, every night or every week, and see failures before your users do."
              : "Add an environment first."}
          </Empty>
        ) : null}

        {data.data?.schedules.map((s) =>
          editing === s.id ? (
            <Panel key={s.id}>
              <CardHead label={`Edit ${s.name}`} />
              <ScheduleForm
                envs={data.data!.envs}
                tests={data.data!.tests}
                initial={s}
                onSave={(d) => save(s.id, d)}
                onCancel={() => setEditing(null)}
              />
            </Panel>
          ) : (
            <Panel key={s.id}>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="text-[14px] font-medium">{s.name}</span>
                {s.enabled ? (
                  <Badge tone="green">On</Badge>
                ) : (
                  <Badge>Paused</Badge>
                )}
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="plain"
                    className="h-7 px-2"
                    onClick={() => setEditing(s.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="plain"
                    className="h-7 px-2"
                    onClick={() =>
                      act(async () =>
                        must(
                          await sb
                            .from("schedules")
                            .update({ enabled: !s.enabled })
                            .eq("id", s.id),
                        ),
                      )
                    }
                  >
                    {s.enabled ? "Pause" : "Resume"}
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    onClick={() =>
                      act(async () => {
                        if (
                          !(await askConfirm(`Delete ${s.name}?`, {
                            ok: "Delete",
                            danger: true,
                          }))
                        )
                          return;
                        must(
                          await sb.from("schedules").delete().eq("id", s.id),
                        );
                      })
                    }
                    className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-danger"
                  >
                    <Trash size={13} />
                  </button>
                </span>
              </div>
              <dl className="grid gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-[13px] sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">When</dt>
                  <dd>{describeSchedule(s)}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Runs</dt>
                  <dd>
                    {scopeText(s)} on {envName(s.environment_id)}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Next</dt>
                  <dd>{s.enabled ? when(s.next_run_at) : "Paused"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-muted">Last</dt>
                  <dd className={s.last_error ? "text-danger" : ""}>
                    {s.last_run_at
                      ? `${timeAgo(s.last_run_at)} · ${s.last_error ?? `${s.last_count ?? 0} ${s.last_count === 1 ? "run" : "runs"}`}`
                      : "Not yet"}
                  </dd>
                </div>
              </dl>
            </Panel>
          ),
        )}
      </div>
    </Page>
  );
}
