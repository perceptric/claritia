"use client";

// The panel's Test tab (docs/email-unify-plan.md, E4): pick a person from Audiences and see what the picked step would
// do for them if they entered now: the email as they'd get it, the path a Branch would send them down, when a Delay
// would end. It follows every edit a moment later. Nothing is sent or saved (/api/workflows/try).

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { stepDetail, type Names as WordNames } from "@/lib/workflows/explain";
import { find } from "@/lib/workflows/tree";
import type { Body } from "@/lib/workflows/types";
import { Button, ErrorNote, errorText, postJson } from "../ui";

type Found = { id: string; label: string; email: string | null };
type Line = { step: string; path: string | null; note: string | null; at: string | null; email: { subject: string; paragraphs: string[]; cta: string | null; suppressed: boolean; html: string | null } | null };
type Out = { entered: boolean; goal: unknown; who?: { name: string; email: string | null; tz: string | null }; lines: Line[] };

const PATH: Record<string, string> = { yes: "the Yes path", no: "the No path", a: "path A", b: "path B" };

export function StepTest({ sb, session, ws, body, sel, names }: { sb: SupabaseClient; session: Session; ws: string; body: Body; sel: string; names: WordNames }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [who, setWho] = useState<Found | null>(null);
  const [out, setOut] = useState<Out | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const s = q.trim().replace(/[%,()]/g, "");
    if (s.length < 2 || who) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await sb.from("contacts").select("id, email, first_name, last_name").eq("workspace_id", ws).is("deleted_at", null).or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`).limit(6);
      if (live) setFound(((r.data ?? []) as { id: string; email: string | null; first_name: string | null; last_name: string | null }[]).map((c) => ({ id: c.id, email: c.email, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "No name" })));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, who, sb, ws]);

  const key = JSON.stringify(body);
  useEffect(() => {
    if (!who) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await postJson<Out>(session, "/api/workflows/try", { body: JSON.parse(key), contactId: who.id });
        if (live) (setOut(r), setError(""));
      } catch (e) {
        if (live) setError(errorText(e));
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [who, key, session]);

  const name = who?.label ?? "";
  const line = out?.lines.find((l) => l.step === sel) ?? null;
  const step = sel === "trigger" ? null : (find(body.steps, sel)?.step ?? null);
  const when = (iso: string, tz: string | null) => {
    try {
      return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz ?? undefined });
    } catch {
      return new Date(iso).toLocaleString("en-US");
    }
  };

  return (
    <div className="flex flex-col gap-4" data-step-test="">
      {who ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 text-[14px] font-medium break-words text-ink">{who.label}</span>
          <Button size="sm" variant="plain" onClick={() => (setWho(null), setOut(null), setQ(""))}>
            Change
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people by name or email"
            aria-label="Test with"
            className="h-9 w-full rounded-md bg-card px-3 text-[13.5px] text-ink shadow-input outline-none placeholder:text-faint focus:shadow-focus"
          />
          {found.map((f) => (
            <button key={f.id} type="button" onClick={() => (setWho(f), setFound([]))} className="flex flex-col items-start rounded-md px-2.5 py-1.5 text-left hover:bg-hover">
              <span className="text-[13px] font-medium break-words text-ink">{f.label}</span>
              {f.email && f.email !== f.label ? <span className="text-[12px] wrap-anywhere text-muted">{f.email}</span> : null}
            </button>
          ))}
        </div>
      )}
      <ErrorNote message={error} />
      {who && out ? (
        <div className="anim-rise-sm flex flex-col gap-3 rounded-[10px] bg-paper p-3.5 text-[13px] text-body shadow-rest" data-test-result="">
          {!out.entered ? (
            <p className="m-0">{name} doesn&apos;t enter: the conditions on who can enter don&apos;t match.</p>
          ) : out.goal ? (
            <p className="m-0">{name} already has a meeting booked, so they leave at once.</p>
          ) : sel === "trigger" ? (
            <p className="m-0">
              {name} would enter and go through {out.lines.length} {out.lines.length === 1 ? "step" : "steps"}.
            </p>
          ) : !line || !step ? (
            <p className="m-0">{name} doesn&apos;t reach this step.</p>
          ) : line.email ? (
            <>
              <span className="text-[12px] text-muted wrap-anywhere">To {out.who?.email ?? name}</span>
              <span className="font-medium break-words text-ink">{line.email.subject || "No subject yet"}</span>
              {line.email.suppressed ? <p className="m-0 text-butter">{name} unsubscribed, so it wouldn&apos;t go.</p> : null}
              {line.email.html ? (
                <div className="relative h-[360px] overflow-hidden rounded-md bg-white shadow-rest">
                  <iframe title={`The email as ${name} would get it`} srcDoc={line.email.html} sandbox="" className="absolute top-0 left-0 h-[600px] w-[600px] origin-top-left scale-[0.6] border-0 bg-white" />
                </div>
              ) : (
                line.email.paragraphs.filter(Boolean).map((p, i) => (
                  <p key={i} className="m-0 whitespace-pre-line">
                    {p}
                  </p>
                ))
              )}
            </>
          ) : step.kind === "wait" ? (
            <p className="m-0">{line.at ? `${name} continues ${when(line.at, out.who?.tz ?? null)}, in their time zone.` : `${name} waits until that long before their meeting.`}</p>
          ) : line.path ? (
            <p className="m-0">
              {name} goes down {PATH[line.path] ?? line.path}
              {line.note ? `, ${line.note}` : ""}.
            </p>
          ) : (
            <p className="m-0">
              Runs: {stepDetail(step, names)}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
