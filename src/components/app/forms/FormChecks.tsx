"use client";

// The Checks tab (docs/form-builder.md Part 10): each day's check of the live form in a real browser, with its steps.

import { useState } from "react";
import { Check, Play, X } from "../../Icons";
import { Sketch } from "../../sketches/Sketch";
import { Badge, Button, Empty, ErrorNote, errorText, Loading, must, Panel, timeAgo, useLoad, type ViewProps } from "../ui";

type Row = { id: string; status: "running" | "passed" | "failed"; steps: { name: string; ok: boolean; detail?: string }[]; error: string | null; started_at: string };

export function FormChecks({ sb, formId, live }: Pick<ViewProps, "sb"> & { formId: string; live: boolean }) {
  const list = useLoad(async () => must(await sb.from("form_checks").select("id, status, steps, error, started_at").eq("form_id", formId).order("started_at", { ascending: false }).limit(20)) as Row[], formId);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          disabled={!live || asked}
          onClick={async () => {
            setError("");
            try {
              must(await sb.rpc("form_check_now", { p_form: formId }));
              setAsked(true);
              setTimeout(list.reload, 15_000);
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          <Play size={14} />
          {asked ? "Check queued" : "Check now"}
        </Button>
      </div>
      <ErrorNote message={error || list.error} />
      {!list.data ? (
        <Loading />
      ) : !list.data.length ? (
        <Empty sketch={<Sketch name="browser" tone="sage" size={160} />} title="No checks yet" />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-line">
            {list.data.map((c) => (
              <li key={c.id} className="flex flex-col gap-2.5 px-5 py-4 text-[13px]">
                <div className="flex items-center gap-2">
                  <Badge tone={c.status === "passed" ? "green" : c.status === "failed" ? "red" : "brand"} dot>{c.status === "passed" ? "Passed" : c.status === "failed" ? "Failed" : "Running"}</Badge>
                  <span className="font-mono text-[11.5px] text-muted">{timeAgo(c.started_at)}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {c.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className={`mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full ${s.ok ? "bg-sage-wash text-sage" : "bg-rose-wash text-rose"}`}>{s.ok ? <Check size={12} /> : <X size={12} />}</span>
                      <span className="text-ink">{s.name}</span>
                      {s.detail ? <span className="text-rose">{s.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
