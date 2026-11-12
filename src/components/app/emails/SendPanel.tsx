"use client";

// Send a campaign (docs/email-studio-plan.md Part 5), from the Email Studio: who gets it (everyone, lists), the topic
// they can leave, and when (now or a day and time). The count under it is who it will reach now, by the same rules
// every message passes when it goes (email_audience_preview, 151); the rest are left out with the reason. While the
// From domain warms up (155), a big first campaign shows the days it takes. The send check (Part 10) lists what stops
// the send and what to look at. Send runs through /api/emails/send, which freezes the audience and queues it in one step.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import type { EmailDoc } from "@/lib/design/email/doc";
import { sendCheck } from "@/lib/emails/sendCheck";
import { warmDays } from "@/lib/emails/warm";
import { X } from "../../Icons";
import { DatePick, isoDay } from "../DatePick";
import { useNow } from "../meetings/parts";
import { Select } from "../Select";
import { Button, ErrorNote, errorText, IconButton, must, postJson, useQuery } from "../ui";

type List = { id: string; name: string; members: number };
type Topic = { id: string; name: string };
type Preview = { total: number; ready: number; suppressed: number; no_consent: number; not_subscribed: number; room: number | null; warm?: { domain: string; since: string; left_today: number } | null };

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const timeWords = (t: string) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const n = (x: number) => x.toLocaleString("en-US");

const dayWords = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function SendPanel({ sb, session, ws, emailId, subject, doc, onClose, onSent }: { sb: SupabaseClient; session: Session; ws: string; emailId: string; subject: string; doc: EmailDoc; onClose: () => void; onSent: (status: string) => void }) {
  const check = useMemo(() => sendCheck(doc, subject), [doc, subject]);
  const lists = useQuery(`lists:${ws}`, async () => (must(await sb.rpc("lists_overview", { p_ws: ws })) ?? []) as List[]);
  const topics = useQuery(`topics:${ws}`, async () => (must(await sb.from("topics").select("id, name").eq("workspace_id", ws).order("name")) ?? []) as Topic[]);
  const [who, setWho] = useState<string>("everyone");
  const [topic, setTopic] = useState<string>("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [day, setDay] = useState(() => isoDay(new Date(new Date().getTime() + 86_400_000)));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const everyone = who === "everyone";
  const picked = everyone ? [] : [who];
  const preview = useQuery(`email_preview:${ws}:${who}:${topic}`, async () => must(await sb.rpc("email_audience_preview", { p_ws: ws, p_lists: picked, p_everyone: everyone, p_topic: topic || null })) as Preview, { staleMs: 0 });
  const p = preview.data;
  const sendAt = when === "later" ? new Date(`${day}T${time}:00`) : null;
  const now = useNow();
  const past = !!sendAt && sendAt.getTime() < now + 60_000;
  const over = !!p && p.room !== null && p.ready > p.room;
  const warm = p ? warmDays(p.ready, p.warm, sendAt?.getTime() ?? now) : null;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJson<{ status: string }>(session, "/api/emails/send", { workspaceId: ws, emailId, lists: picked, everyone, topicId: topic || null, sendAt: sendAt?.toISOString() ?? null });
      onSent(r.status);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const left = p ? [p.suppressed ? `${n(p.suppressed)} unsubscribed or bounced` : "", p.no_consent ? `${n(p.no_consent)} without consent` : "", p.not_subscribed ? `${n(p.not_subscribed)} not on this topic` : ""].filter(Boolean) : [];
  return (
    <>
      <div className="anim-fade fixed inset-0 z-[87] bg-scrim" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label="Send" className="anim-rise fixed inset-y-2 right-2 z-[88] flex w-[calc(100%-1rem)] max-w-[440px] flex-col overflow-hidden rounded-2xl bg-card shadow-float">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-medium break-words text-ink">Send {subject ? `"${subject}"` : "this email"}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-muted">Who gets it</span>
            <Select<string>
              ariaLabel="Who gets it"
              value={who}
              onChange={setWho}
              options={[{ value: "everyone", label: "Everyone" }, ...(lists.data ?? []).map((l) => ({ value: l.id, label: l.name, hint: `${n(l.members)} ${l.members === 1 ? "person" : "people"}`, group: "Lists" }))]}
              className="h-9 w-full rounded-md bg-card px-3 text-[13px] text-ink shadow-input"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-muted">Topic</span>
            <Select<string>
              ariaLabel="Topic"
              value={topic}
              onChange={setTopic}
              options={[{ value: "", label: "No topic" }, ...(topics.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
              className="h-9 w-full rounded-md bg-card px-3 text-[13px] text-ink shadow-input"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-muted">When</span>
            <div role="radiogroup" aria-label="When" className="flex w-fit items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
              {(["now", "later"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={when === k} onClick={() => setWhen(k)} className={`h-8 rounded-full px-3.5 text-[12.5px] font-medium ${when === k ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}>
                  {k === "now" ? "Now" : "Later"}
                </button>
              ))}
            </div>
            {when === "later" ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <DatePick label="Day" value={day} min={isoDay(new Date(now))} onChange={setDay} />
                <Select<string> ariaLabel="Time" value={time} onChange={setTime} options={TIMES.map((t) => ({ value: t, label: timeWords(t) }))} menuWidth={140} className="h-9 rounded-full bg-card px-3.5 text-[13px] text-ink shadow-input" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-paper px-4 py-3">
            {preview.error ? (
              <ErrorNote message={preview.error} />
            ) : !p ? (
              <span className="text-[13px] text-muted">Counting…</span>
            ) : (
              <>
                <span className="text-[15px] font-medium text-ink tabular-nums">
                  {n(p.ready)} {p.ready === 1 ? "person" : "people"}
                </span>
                {left.length ? <span className="text-[12.5px] text-muted">Left out: {left.join(", ")}</span> : null}
                {over ? <span className="text-[12.5px] text-muted">{n(p.ready - (p.room ?? 0))} wait until next month</span> : null}
                {warm && warm.days > 1 && p.warm ? (
                  <span className="text-[12.5px] break-words text-muted">
                    Goes out over {warm.days} days, until {dayWords(warm.last)}, while {p.warm.domain} warms up
                  </span>
                ) : null}
              </>
            )}
          </div>
          {check.warns.length ? (
            <ul aria-label="To look at" className="flex flex-col gap-1.5">
              {check.warns.map((w) => (
                <li key={w} className="flex items-start gap-2 text-[12.5px] break-words text-muted">
                  <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-warning" />
                  <span className="min-w-0">{w}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ErrorNote message={error || (!subject.trim() ? "Add a subject first." : (check.stops[0] ?? (past ? "Pick a time in the future." : "")))} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy || !p || !p.ready || past || !subject.trim() || check.stops.length > 0}>
            {busy ? "Sending…" : when === "later" ? "Schedule" : "Send now"}
          </Button>
        </div>
      </aside>
    </>
  );
}
