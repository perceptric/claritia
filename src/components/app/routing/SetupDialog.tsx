"use client";

// First-time setup (the approved demo): three steps, one at a time. Sales reps (each connects their own calendar),
// Assignment (Round robin or Assignment rules), and the Meeting type leads book: an existing one, or a new one made
// through the meetings API. "Turn on routing" saves and publishes, like Save. Shown by itself until routing has ever
// been made live, and from the title row's menu.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/meetings/types";
import type { RouterBody } from "@/lib/router/types";
import { Plus } from "../../Icons";
import { meetingsApi, PersonAvatar, usePeople } from "../meetings/parts";
import { Badge, Button, ErrorNote, errorText, invalidate, type ViewProps } from "../ui";
import { Choice } from "../inbound/parts";
import { setupBody, viewOf, type Mode } from "./assignModel";
import { askToConnect, ConnectButton, inviteRep, useRepsData } from "./SalesReps";
import type { Assignment } from "./useAssignment";
import { toast } from "./Toast";

const TITLES = ["Sales reps", "Assignment", "Meeting type"];
const LENGTHS = [15, 30, 45, 60];
const NEW = "__new";

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "meeting";

export function SetupDialog({ sb, session, ws, a, onClose }: Pick<ViewProps, "sb" | "session" | "ws"> & { a: Assignment; onClose: () => void }) {
  const people = usePeople(sb, ws.id);
  const reps = useRepsData(sb, ws.id);
  const meetings = a.data?.meetings ?? [];
  const view = viewOf(a.body, a.fields);
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>(view.mode);
  const [meet, setMeet] = useState<string>(view.def.meet ?? meetings[0]?.id ?? NEW);
  const [name, setName] = useState("Intro call");
  const [minutes, setMinutes] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const list = people.data?.list ?? [];

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button, input")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="listbox"]') && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      let type: string | null = meet === NEW ? null : meet;
      if (meet === NEW) {
        const hosts = (view.def.reps.length ? view.def.reps : list.map((p) => p.id)).map((user_id) => ({ user_id }));
        const r = await meetingsApi<{ id: string }>(session, ws.id, "types", {
          action: "save",
          id: null,
          type: { name: name.trim() || "Intro call", slug: slugOf(name), kind: hosts.length > 1 ? "round_robin" : "one", hosts, settings: { ...DEFAULT_SETTINGS, lengths: [minutes] }, secret: false, active: true, locked: [], owner_user_id: null },
        });
        type = r.id;
        invalidate(`meeting_types:${ws.id}`);
        // The new type is offered at once; the routing read again knows it.
        await a.load({ keep: true });
      }
      const repsPicked = view.def.reps.length ? view.def.reps : list.map((p) => p.id);
      const next: RouterBody = setupBody(a.body, { reps: repsPicked, mode, meet: type });
      a.edit(() => next);
      if (await a.save(next)) {
        toast({ text: "Routing is live" });
        onClose();
      } else setBusy(false);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  const body =
    step === 0 ? (
      <div className="flex flex-wrap gap-2">
        {list.map((p) => {
          const cal = reps.data?.calendar.get(p.id);
          return (
            <span key={p.id} className="flex items-center gap-2 rounded-full border border-line py-[3px] pr-2.5 pl-[3px]">
              <PersonAvatar person={p} label={p.name} size={20} />
              <span className="text-ink">{p.name.split(" ")[0]}</span>
              {!reps.data ? null : cal ? (
                <Badge tone="green" dot>
                  {cal === "google" ? "Google" : cal === "microsoft" ? "Outlook" : "Calendar"}
                </Badge>
              ) : p.id === session.user.id ? (
                <ConnectButton session={session} ws={ws.id} onError={setError} again={reps.data.reconnect.has(p.id)} look="badge" />
              ) : (
                <button type="button" onClick={() => void askToConnect(p)} className="press inline-flex h-5 items-center gap-1.5 rounded-full bg-butter-wash px-2 text-[11px] font-medium whitespace-nowrap text-butter">
                  <span className="size-[5px] rounded-full bg-butter" />
                  Connect calendar
                </button>
              )}
            </span>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          className="h-[26px] px-2.5 text-[12px]"
          onClick={() =>
            void inviteRep(sb, ws.id).catch((e) => setError(errorText(e)))
          }
        >
          <Plus size={12} />
          Invite rep
        </Button>
      </div>
    ) : step === 1 ? (
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["rr", "Round robin", "Rotate all leads across the same reps"],
            ["rules", "Assignment rules", "Assign leads by criteria"],
          ] as [Mode, string, string][]
        ).map(([v, t, l]) => (
          <button
            key={v}
            type="button"
            aria-pressed={mode === v}
            onClick={() => setMode(v)}
            className={`flex flex-col gap-0.5 rounded-[10px] border px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-[140ms] ${mode === v ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong"}`}
          >
            <span className="font-medium text-ink">{t}</span>
            <span className="text-[12px] text-muted">{l}</span>
          </button>
        ))}
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        {meetings.length ? (
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted">
            Meeting type
            <Choice<string>
              label="Meeting type"
              value={meet}
              className="w-full justify-between"
              options={[...meetings.map((m) => ({ value: m.id, label: `${m.name}${m.minutes ? `, ${m.minutes} min` : ""}` })), { value: NEW, label: "New meeting type" }]}
              onChange={setMeet}
            />
          </label>
        ) : null}
        {meet === NEW ? (
          <>
            <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted">
              Name
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Meeting type name" className="h-8 rounded-sm border border-line-strong bg-card px-2.5 text-[13px] text-ink outline-none focus:border-ink" />
            </label>
            <label className="flex flex-col items-start gap-1.5 text-[12px] font-medium text-muted">
              Duration
              <Choice<number> label="Duration" value={minutes} options={LENGTHS.map((v) => ({ value: v, label: `${v} min` }))} onChange={setMinutes} />
            </label>
          </>
        ) : null}
      </div>
    );

  return (
    <div className="anim-fade fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-scrim p-4">
      <div ref={box} role="dialog" aria-modal="true" aria-label="Set up Routing" className="anim-rise-sm flex text-[13px] max-h-[calc(100%-32px)] w-full max-w-[560px] flex-col overflow-auto rounded-2xl bg-card shadow-float">
        <div className="flex flex-col gap-3 px-5 pt-[18px]">
          <div className="flex gap-1.5" aria-hidden="true">
            {TITLES.map((t, i) => (
              <i key={t} className={`h-1 flex-1 rounded-full transition-colors duration-[220ms] ${i <= step ? "bg-ink" : "bg-paper-deep"}`} />
            ))}
          </div>
          <h2 className="text-[16px] font-semibold text-ink">{TITLES[step]}</h2>
        </div>
        <div className="flex flex-col gap-2.5 px-5 py-4">
          {step === 0 ? <span className="text-muted">Add the people who take meetings. Each rep connects their own calendar.</span> : null}
          {body}
          {step === 1 ? <span className="text-muted">{mode === "rr" ? "Recommended for most teams. Rules can be added at any time." : "Rules are set on the Assignment tab after setup."}</span> : null}
          <ErrorNote message={error || (step === 2 ? a.saveError : "")} />
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={busy}>
              Back
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Skip
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={() => (step === 2 ? void finish() : setStep(step + 1))}>
            {step === 2 ? "Turn on routing" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
