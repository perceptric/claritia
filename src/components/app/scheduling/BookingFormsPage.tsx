"use client";

// Scheduling › Booking forms (docs/app-structure.md 6.5): Calendly's Routing forms, done with our forms and router.
// Every form that ends in a booking, with its path in one line ("Qualified leads → Lead's owner first: Intro call"),
// fills and meetings booked this week, and Open in Forms. The forms themselves live in Automation › Forms.

import { useMemo } from "react";
import type { Form } from "@/lib/forms/schema";
import { SCHEDULERS } from "@/lib/forms/schedule";
import { FormIcon, Plus } from "../../Icons";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, Loading, must, Page, useLoad, type ViewProps } from "../ui";
import { KIND_WORDS } from "./model";
import type { Kind } from "@/lib/meetings/types";

type FormRow = { id: string; name: string; status: "draft" | "live" | "paused"; draft: Form | null };

const TOOL_NAME: Record<string, string> = Object.fromEntries(SCHEDULERS.map((x) => [x.value, x.label]));

/** "Qualified leads → Lead's owner first: Intro call", or "Everyone → Calendly". */
export function bookingPath(f: Form | null, types: Map<string, { name: string; kind: Kind }>): string | null {
  const s = f?.after?.schedule;
  if (!s) return null;
  const who = s.who === "match" ? "Leads who match" : "Everyone";
  if (s.tool === "claritia") {
    const t = s.meetingTypeId ? types.get(s.meetingTypeId) : null;
    return `${who} → ${t ? `${KIND_WORDS[t.kind]}: ${t.name}` : "a meeting type that's gone"}`;
  }
  return `${who} → ${TOOL_NAME[s.tool] ?? s.tool}${s.perOwner ? " (each owner's link)" : ""}`;
}

export function BookingFormsPage(props: ViewProps) {
  const { sb, ws, navigate } = props;
  const data = useLoad(async () => {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [forms, types, fills, booked] = await Promise.all([
      sb.from("forms").select("id, name, status, draft").eq("workspace_id", ws.id).order("updated_at", { ascending: false }),
      sb.from("meeting_types").select("id, name, kind").eq("workspace_id", ws.id),
      sb.from("submissions").select("form_id").eq("workspace_id", ws.id).gte("created_at", week).limit(10000),
      sb.from("meetings").select("submission:submissions!meetings_submission_id_fkey(form_id)").eq("workspace_id", ws.id).eq("source", "form").gte("created_at", week).limit(10000),
    ]);
    const count = (rows: { form_id: string | null }[]) => rows.reduce((m, r) => (r.form_id ? m.set(r.form_id, (m.get(r.form_id) ?? 0) + 1) : m), new Map<string, number>());
    return {
      forms: (must(forms) ?? []) as FormRow[],
      types: new Map(((must(types) ?? []) as { id: string; name: string; kind: Kind }[]).map((t) => [t.id, t])),
      fills: count((must(fills) ?? []) as { form_id: string | null }[]),
      booked: count(((booked.data ?? []) as unknown as { submission: { form_id: string | null } | null }[]).map((m) => ({ form_id: m.submission?.form_id ?? null }))),
    };
  }, ws.id);
  const d = data.data;
  const rows = useMemo(() => (d ? d.forms.map((f) => ({ f, path: bookingPath(f.draft, d.types) })).filter((x) => x.path) : []), [d]);
  const make = (
    <Button onClick={() => navigate("forms", "new")}>
      <Plus size={14} />
      New booking form
    </Button>
  );

  if (data.data && !rows.length)
    return (
      <Page title="Booking forms" actions={make}>
        <ToolIntro
          sketch="clipboard"
          title={"Ask a few questions,\nthen show the right calendar"}
          lead="A booking form qualifies the lead, routes them to the right rep, and lets them book on the spot. Add a calendar to any form in Forms › Settings."
          action={make}
        />
      </Page>
    );

  return (
    <Page title="Booking forms" count={rows.length || undefined} actions={make}>
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <ErrorNote message={data.error} />
        {!d ? (
          <Loading />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(({ f, path }, i) => {
              const fills = d.fills.get(f.id) ?? 0;
              const booked = d.booked.get(f.id) ?? 0;
              return (
                <li key={f.id} className="lift anim-rise-sm relative flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-card py-4 pr-4 pl-5 hover:border-line-strong" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1.5 bg-clay" />
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-clay-wash text-clay">
                    <FormIcon size={15} />
                  </span>
                  <button type="button" onClick={() => navigate("forms", f.id)} className="flex min-w-0 flex-1 flex-col text-left after:absolute after:inset-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{f.name}</span>
                      <Badge tone={f.status === "live" ? "green" : f.status === "paused" ? "amber" : "gray"} dot>
                        {f.status === "live" ? "Live" : f.status === "paused" ? "Paused" : "Draft"}
                      </Badge>
                    </span>
                    <span className="truncate text-[12.5px] text-muted">{path}</span>
                  </button>
                  <span className="relative z-10 hidden w-44 shrink-0 flex-col items-end gap-0.5 text-right sm:flex">
                    <span className="text-[13px] text-ink tabular-nums">
                      {booked} booked of {fills} {fills === 1 ? "fill" : "fills"}
                    </span>
                    <span className="text-[12px] text-faint tabular-nums">{fills ? `${Math.round((booked / fills) * 100)}% this week` : "This week"}</span>
                  </span>
                  <Button variant="ghost" size="sm" className="relative z-10" onClick={() => navigate("forms", f.id)}>
                    Open in Forms
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Page>
  );
}
