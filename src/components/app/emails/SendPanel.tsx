"use client";

// Send a campaign (docs/email-studio-plan.md Part 5, and step 1 of the Brew comparison), from the Email Studio. Left:
// the sender (one of the workspace's verified domains, the From name and address, the reply-to), the subject and
// preview text with merge values, how it shows in an inbox, and when (now, a day and time, spread over some hours, or
// each person at the hour they usually open, within a day: Intelligent Send, 159).
// Right: who gets it (everyone or a list, and a topic they can leave), the count by the same rules every message
// passes when it goes (email_audience_preview, 151), and the send check (Part 10). While the picked domain warms up
// (155), a big campaign shows the days it takes. Send saves the draft, then runs /api/emails/send, which freezes the
// audience and queues it in one step.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EmailDoc } from "@/lib/design/email/doc";
import { sendCheck } from "@/lib/emails/sendCheck";
import { warmDays } from "@/lib/emails/warm";
import { fillMerge } from "@/lib/workflows/merge";
import { X } from "../../Icons";
import { DatePick, isoDay } from "../DatePick";
import { useNow } from "../meetings/parts";
import { Select } from "../Select";
import { Button, ErrorNote, errorText, IconButton, must, postJson, useQuery } from "../ui";

type List = { id: string; name: string; members: number };
type Topic = { id: string; name: string };
type Preview = { total: number; ready: number; suppressed: number; no_consent: number; not_subscribed: number; room: number | null; smart?: Partial<Record<"history" | "timezone" | "workspace" | "start", number>> };
type Domain = { domain: string; since: string; left_today: number | null };
type Sender = { from_name: string | null; from_email: string | null; reply_to: string | null; domains: Domain[] };
type When = "now" | "later" | "smart" | "gradual";

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const timeWords = (t: string) => new Date(`2000-01-01T${t}:00`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const n = (x: number) => x.toLocaleString("en-US");
const dayWords = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const HOURS = [2, 4, 6, 12, 24, 48, 72];
/** The merge values a campaign fills from each person (156), with the fallback each gets when it's blank. */
const VARS: { key: string; label: string; tag: string }[] = [
  { key: "first_name", label: "First name", tag: "{{first_name|there}}" },
  { key: "last_name", label: "Last name", tag: "{{last_name}}" },
  { key: "company", label: "Company", tag: "{{company|your team}}" },
  { key: "title", label: "Job title", tag: "{{title}}" },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputCls = "h-9 w-full min-w-0 rounded-md bg-card px-3 text-[13px] text-ink shadow-input outline-none focus:shadow-focus";
const label = "text-[12.5px] font-medium text-muted";

export function SendPanel({
  sb,
  session,
  ws,
  emailId,
  subject,
  preheader,
  doc,
  onSubject,
  onPreheader,
  beforeSend,
  onClose,
  onSent,
}: {
  sb: SupabaseClient;
  session: Session;
  ws: string;
  emailId: string;
  subject: string;
  preheader: string;
  doc: EmailDoc;
  onSubject: (s: string) => void;
  onPreheader: (s: string) => void;
  beforeSend: () => Promise<void>;
  onClose: () => void;
  onSent: (status: string) => void;
}) {
  const lists = useQuery(`lists:${ws}`, async () => (must(await sb.rpc("lists_overview", { p_ws: ws })) ?? []) as List[]);
  const topics = useQuery(`topics:${ws}`, async () => (must(await sb.from("topics").select("id, name").eq("workspace_id", ws).order("name")) ?? []) as Topic[]);
  const sender = useQuery(`email_sender:${ws}`, async () => must(await sb.rpc("email_sender_options", { p_ws: ws })) as Sender, { staleMs: 0 });
  const [who, setWho] = useState<string>("everyone");
  const [topic, setTopic] = useState<string>("");
  const [when, setWhen] = useState<When>("now");
  const [day, setDay] = useState(() => isoDay(new Date(new Date().getTime() + 86_400_000)));
  const [time, setTime] = useState("09:00");
  const [hours, setHours] = useState(6);
  // The sender starts from Settings › Sending; each field is this email's own once changed.
  const [picked, setPicked] = useState<{ domain?: string; local?: string; name?: string; reply?: string }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const subjectRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLInputElement>(null);
  const check = useMemo(() => sendCheck(doc, subject), [doc, subject]);
  const everyone = who === "everyone";
  const chosen = everyone ? [] : [who];
  const preview = useQuery(`email_preview:${ws}:${who}:${topic}`, async () => must(await sb.rpc("email_audience_preview", { p_ws: ws, p_lists: chosen, p_everyone: everyone, p_topic: topic || null })) as Preview, { staleMs: 0 });
  const p = preview.data;
  const s = sender.data;
  const domains = s?.domains ?? [];
  const [defLocal, defDomain] = (s?.from_email ?? "").split("@");
  const domain = picked.domain ?? (domains.some((d) => d.domain === defDomain) ? defDomain : domains[0]?.domain) ?? "";
  const local = picked.local ?? defLocal ?? "hello";
  const fromName = picked.name ?? s?.from_name ?? "";
  const reply = picked.reply ?? s?.reply_to ?? "";
  const fromEmail = domain ? `${local}@${domain}` : "";
  const dom = domains.find((d) => d.domain === domain);
  const now = useNow();
  const sendAt = when === "later" ? new Date(`${day}T${time}:00`) : null;
  const past = !!sendAt && sendAt.getTime() < now + 60_000;
  const over = !!p && p.room !== null && p.ready > p.room;
  const warm = p && dom && dom.left_today !== null ? warmDays(p.ready, { since: dom.since, left_today: dom.left_today }, sendAt?.getTime() ?? now) : null;
  const problem = !subject.trim()
    ? "Add a subject first."
    : (check.stops[0] ??
      (s && !domains.length ? "Add a verified domain in Settings › Sending first." : !EMAIL.test(fromEmail) && s ? "Check the From address." : reply && !EMAIL.test(reply) ? "Check the reply-to address." : past ? "Pick a time in the future." : ""));

  const insert = (ref: React.RefObject<HTMLInputElement | null>, value: string, set: (v: string) => void, tag: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? at;
    set(value.slice(0, at) + tag + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length, at + tag.length);
    });
  };
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await beforeSend();
      const r = await postJson<{ status: string }>(session, "/api/emails/send", {
        workspaceId: ws,
        emailId,
        lists: chosen,
        everyone,
        topicId: topic || null,
        sendAt: sendAt?.toISOString() ?? null,
        fromName: fromName.trim(),
        fromEmail,
        replyTo: reply.trim(),
        spreadHours: when === "gradual" ? hours : null,
        smart: when === "smart",
      });
      onSent(r.status);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const left = p ? [p.suppressed ? `${n(p.suppressed)} unsubscribed or bounced` : "", p.no_consent ? `${n(p.no_consent)} without consent` : "", p.not_subscribed ? `${n(p.not_subscribed)} not on this topic` : ""].filter(Boolean) : [];
  const perHour = p ? Math.ceil(p.ready / hours) : 0;
  const done = new Date(now + hours * 3_600_000);
  const at = (d: Date) => d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
  const smart = p?.smart ?? {};
  const smartLines = [
    smart.history ? `${n(smart.history)} at the hour they usually open` : "",
    smart.timezone ? `${n(smart.timezone)} at 10 AM their time` : "",
    smart.workspace ? `${n(smart.workspace)} at the hour your emails are opened most` : "",
    smart.start ? `${n(smart.start)} right away` : "",
  ].filter(Boolean);
  const vars = (ref: React.RefObject<HTMLInputElement | null>, value: string, set: (v: string) => void, what: string) => (
    <Select<string>
      ariaLabel={`Add a merge value to the ${what}`}
      value=""
      placeholder="{{ }}"
      plainPlaceholder
      down
      align="right"
      menuWidth={200}
      onChange={(k) => insert(ref, value, set, VARS.find((v) => v.key === k)!.tag)}
      options={VARS.map((v) => ({ value: v.key, label: v.label, hint: v.tag }))}
      className="h-7 shrink-0 rounded-md px-2 font-mono text-[12px] text-muted hover:bg-hover hover:text-ink"
    />
  );
  const option = (k: When, title: string, body: React.ReactNode) => (
    <div role="radio" tabIndex={0} aria-checked={when === k} onClick={() => setWhen(k)} onKeyDown={(e) => (e.key === " " || e.key === "Enter") && e.target === e.currentTarget && (e.preventDefault(), setWhen(k))} className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-3 py-2.5 transition-colors duration-[140ms] ${when === k ? "bg-signal-pale shadow-[0_0_0_1px_var(--color-signal-soft)]" : "hover:bg-hover"}`}>
      <span aria-hidden="true" className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${when === k ? "shadow-[inset_0_0_0_1.5px_var(--color-signal)]" : "shadow-[inset_0_0_0_1.5px_var(--color-faint)]"}`}>
        {when === k ? <span className="size-2 rounded-full bg-signal" /> : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-medium text-ink">{title}</span>
        {when === k ? body : null}
      </span>
    </div>
  );

  const node = (
    <>
      <div className="anim-fade fixed inset-0 z-[87] bg-scrim" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Send" onKeyDown={(e) => e.key === "Escape" && onClose()} className="anim-rise-sm fixed inset-x-2 top-1/2 z-[88] mx-auto flex max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[960px] -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-float">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
          <h2 className="min-w-0 flex-1 text-[15px] font-medium break-words text-ink">Send</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <span className={label}>Domain</span>
              {sender.error ? (
                <ErrorNote message={sender.error} />
              ) : (
                <Select<string>
                  ariaLabel="Domain"
                  value={domain}
                  placeholder={s ? "No verified domain" : "Loading"}
                  onChange={(v) => setPicked((x) => ({ ...x, domain: v }))}
                  options={domains.map((d) => ({ value: d.domain, label: d.domain, hint: d.left_today !== null ? `Warming up, ${n(d.left_today)} left today` : undefined }))}
                  className="h-9 w-full rounded-md bg-card px-3 text-[13px] text-ink shadow-input"
                />
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={label}>From name</span>
                <input value={fromName} maxLength={80} onChange={(e) => setPicked((x) => ({ ...x, name: e.target.value }))} className={inputCls} />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className={label}>From address</span>
                <span className="flex h-9 min-w-0 items-center rounded-md bg-card shadow-input focus-within:shadow-focus">
                  <input value={local} maxLength={64} onChange={(e) => setPicked((x) => ({ ...x, local: e.target.value.replace(/[^a-z0-9._+-]/gi, "").toLowerCase() }))} className="h-full w-0 min-w-[64px] flex-1 bg-transparent px-3 text-[13px] text-ink outline-none" />
                  <span className="shrink-0 pr-3 text-[13px] wrap-anywhere text-muted">@{domain || "domain"}</span>
                </span>
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Reply-to</span>
              <input value={reply} type="email" placeholder={fromEmail} onChange={(e) => setPicked((x) => ({ ...x, reply: e.target.value.trim() }))} className={inputCls} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className={label}>Subject</span>
              <span className="flex h-9 min-w-0 items-center gap-1 rounded-md bg-card pr-1 shadow-input focus-within:shadow-focus">
                <input ref={subjectRef} aria-label="Subject" value={subject} maxLength={200} onChange={(e) => onSubject(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] text-ink outline-none" />
                {vars(subjectRef, subject, onSubject, "subject")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={label}>Preview text</span>
              <span className="flex h-9 min-w-0 items-center gap-1 rounded-md bg-card pr-1 shadow-input focus-within:shadow-focus">
                <input ref={previewRef} aria-label="Preview text" value={preheader} maxLength={200} onChange={(e) => onPreheader(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent px-3 text-[13px] text-ink outline-none" />
                <span className="shrink-0 text-[12px] text-faint tabular-nums">{preheader.length}/200</span>
                {vars(previewRef, preheader, onPreheader, "preview text")}
              </span>
            </div>
            <div aria-label="In the inbox" className="flex items-start gap-2.5 rounded-[10px] bg-card px-3 py-2.5 shadow-rest">
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-signal-soft text-[12px] font-semibold text-signal-text">
                {(fromName.trim()[0] ?? "?").toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold break-words text-ink">{fromName.trim() || fromEmail}</span>
                <span className="break-words text-ink">{fillMerge(subject, {}) || " "}</span>
                <span className="break-words text-muted">{fillMerge(preheader, {})}</span>
              </span>
            </div>
            <div role="radiogroup" aria-label="When" className="flex flex-col gap-1">
              <span className={`${label} mb-1`}>When</span>
              {option("now", "Send now", warm && warm.days > 1 && dom ? <span className="text-[12.5px] break-words text-muted">Goes out over {warm.days} days, until {dayWords(warm.last)}, while {dom.domain} warms up</span> : null)}
              {option(
                "later",
                "Schedule",
                <span className="flex flex-wrap items-center gap-2">
                  <DatePick label="Day" value={day} min={isoDay(new Date(now))} onChange={setDay} />
                  <Select<string> ariaLabel="Time" value={time} onChange={setTime} options={TIMES.map((t) => ({ value: t, label: timeWords(t) }))} menuWidth={140} className="h-9 rounded-full bg-card px-3.5 text-[13px] text-ink shadow-input" />
                </span>,
              )}
              {option(
                "smart",
                "Intelligent Send",
                <span className="flex flex-col gap-0.5 text-[12.5px] break-words text-muted">
                  <span>
                    Between {at(new Date(now))} and {at(new Date(now + 86_400_000))}
                  </span>
                  {smartLines.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </span>,
              )}
              {option(
                "gradual",
                "Gradual Send",
                <span className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
                  <span>Over</span>
                  <Select<number> ariaLabel="Hours" value={hours} onChange={setHours} options={HOURS.map((h) => ({ value: h, label: `${h} hours` }))} menuWidth={140} className="h-8 rounded-full bg-card px-3 text-[13px] text-ink shadow-input" />
                  {p ? (
                    <span className="break-words">
                      About {n(perHour)} an hour, done by {hours >= 24 ? `${dayWords(done)}, ` : ""}
                      {done.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  ) : null}
                </span>,
              )}
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4 border-t border-line bg-paper px-5 py-4 md:border-t-0 md:border-l">
            <label className="flex flex-col gap-1.5">
              <span className={label}>Who gets it</span>
              <Select<string>
                ariaLabel="Who gets it"
                value={who}
                onChange={setWho}
                options={[{ value: "everyone", label: "Everyone" }, ...(lists.data ?? []).map((l) => ({ value: l.id, label: l.name, hint: `${n(l.members)} ${l.members === 1 ? "person" : "people"}`, group: "Lists" }))]}
                className="h-9 w-full rounded-md bg-card px-3 text-[13px] text-ink shadow-input"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Topic</span>
              <Select<string>
                ariaLabel="Topic"
                value={topic}
                onChange={setTopic}
                options={[{ value: "", label: "No topic" }, ...(topics.data ?? []).map((t) => ({ value: t.id, label: t.name }))]}
                className="h-9 w-full rounded-md bg-card px-3 text-[13px] text-ink shadow-input"
              />
            </label>
            <div className="flex flex-col gap-1 rounded-[10px] bg-card px-4 py-3 shadow-rest">
              {preview.error ? (
                <ErrorNote message={preview.error} />
              ) : !p ? (
                <span className="text-[13px] text-muted">Counting…</span>
              ) : (
                <>
                  <span className="text-[18px] font-semibold text-ink tabular-nums">
                    {n(p.ready)} {p.ready === 1 ? "person" : "people"}
                  </span>
                  {left.length ? <span className="text-[12.5px] break-words text-muted">Left out: {left.join(", ")}</span> : null}
                  {over ? <span className="text-[12.5px] text-muted">{n(p.ready - (p.room ?? 0))} wait until next month</span> : null}
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
            <ErrorNote message={error || problem} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={busy || !p || !p.ready || !!problem}>
            {busy ? "Sending…" : when === "later" ? "Schedule" : when === "gradual" ? "Start Gradual Send" : when === "smart" ? "Start Intelligent Send" : "Send now"}
          </Button>
        </div>
      </div>
    </>
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
