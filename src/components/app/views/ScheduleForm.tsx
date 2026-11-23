"use client";

// The form for a new or edited schedule: what to run, where, how often and in which time zone.

import { useState } from "react";
import { DAYS, two } from "@/lib/schedules";
import { Select } from "../Select";
import { Button, ErrorNote, errorText, Field, Input, Segmented, type Environment } from "../ui";

type Every = "hour" | "day" | "weekday" | "week";

type Scope = "all" | "use_case" | "tests";

export type Schedule = {
  id: string;
  name: string;
  environment_id: string;
  scope: Scope;
  use_case: string | null;
  test_ids: string[];
  every: Every;
  at_hour: number;
  at_minute: number;
  weekday: number;
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_count: number | null;
  last_error: string | null;
};

export type Draft = Omit<
  Schedule,
  "id" | "next_run_at" | "last_run_at" | "last_count" | "last_error" | "enabled"
>;

export type TestRef = { id: string; name: string; use_case: string };

const COMMON_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export const myZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function ScheduleForm({
  envs,
  tests,
  initial,
  onSave,
  onCancel,
}: {
  envs: Environment[];
  tests: TestRef[];
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const useCases = [...new Set(tests.map((t) => t.use_case))].sort();
  const zones = [...new Set([myZone(), d.timezone, ...COMMON_ZONES])];
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setD({ ...d, [k]: v });

  return (
    <form
      className="grid gap-4 p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSave(d);
        } catch (err) {
          setError(errorText(err));
          setBusy(false);
        }
      }}
    >
      <Field label="Name">
        <Input
          value={d.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Nightly smoke"
          maxLength={80}
          required
          autoFocus
        />
      </Field>
      <Field label="Environment">
        <Select
          value={d.environment_id}
          options={envs.map((e) => ({ value: e.id, label: e.name }))}
          onChange={(v) => set("environment_id", v)}
          ariaLabel="Environment"
          className="w-full"
        />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <span className="label-mono">Runs</span>
        <div className="self-start">
          <Segmented<Scope>
            value={d.scope}
            label="Runs"
            onChange={(v) => set("scope", v)}
            options={[
              { value: "all", label: "Every test" },
              { value: "use_case", label: "A use case" },
              { value: "tests", label: "Picked tests" },
            ]}
          />
        </div>
        {d.scope === "use_case" ? (
          <div className="sm:max-w-xs">
            <Select
              value={d.use_case ?? ""}
              options={useCases.map((u) => ({ value: u, label: u }))}
              onChange={(v) => set("use_case", v)}
              ariaLabel="Use case"
              placeholder="Pick a use case"
              className="w-full"
            />
          </div>
        ) : null}
        {d.scope === "tests" ? (
          <ul className="max-h-56 overflow-auto border border-line">
            {tests.map((t) => (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-hover">
                  <input
                    type="checkbox"
                    checked={d.test_ids.includes(t.id)}
                    onChange={(e) =>
                      set(
                        "test_ids",
                        e.target.checked
                          ? [...d.test_ids, t.id]
                          : d.test_ids.filter((x) => x !== t.id),
                      )
                    }
                    className="size-3.5 accent-[var(--color-brand)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{t.name}</span>
                  <span className="text-[12px] text-faint">{t.use_case}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <span className="label-mono">When</span>
        <div className="self-start">
          <Segmented<Every>
            value={d.every}
            label="When"
            onChange={(v) => set("every", v)}
            options={[
              { value: "hour", label: "Hourly" },
              { value: "day", label: "Daily" },
              { value: "weekday", label: "Weekdays" },
              { value: "week", label: "Weekly" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.every === "week" ? (
            <div className="w-36">
              <Select
                value={d.weekday}
                options={DAYS.map((name, i) => ({ value: i, label: name }))}
                onChange={(v) => set("weekday", v)}
                ariaLabel="Day"
                className="w-full"
              />
            </div>
          ) : null}
          {d.every !== "hour" ? (
            <div className="w-20">
              <Select
                value={d.at_hour}
                options={Array.from({ length: 24 }, (_, h) => ({
                  value: h,
                  label: two(h),
                }))}
                onChange={(v) => set("at_hour", v)}
                ariaLabel="Hour"
                className="w-full"
              />
            </div>
          ) : null}
          <div className="w-20">
            <Select
              value={d.at_minute}
              options={[0, 15, 30, 45].map((m) => ({
                value: m,
                label: `:${two(m)}`,
              }))}
              onChange={(v) => set("at_minute", v)}
              ariaLabel="Minute"
              className="w-full"
            />
          </div>
          {d.every !== "hour" ? (
            <div className="w-56">
              <Select
                value={d.timezone}
                options={zones.map((z) => ({ value: z, label: z }))}
                onChange={(v) => set("timezone", v)}
                ariaLabel="Time zone"
                className="w-full"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save schedule"}
        </Button>
        <Button type="button" variant="plain" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error ? (
        <div className="sm:col-span-2">
          <ErrorNote message={error} />
        </div>
      ) : null}
    </form>
  );
}
