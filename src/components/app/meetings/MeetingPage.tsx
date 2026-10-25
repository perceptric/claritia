"use client";

// One meeting (docs/meetings-scheduler.md 1.7): when, who, where, the guest's answers and the contact, its history
// (meeting_events), and the host's actions: Held and No-show once it has started; a link for the guest to move or
// cancel it, and Cancel with a reason while it's still to come.

import { useState } from "react";
import type { Location, MeetingSource, MeetingStatus, TypeSettings } from "@/lib/meetings/types";
import { CalendarIcon, Contact, Link as LinkIcon } from "../../Icons";
import { Button, Empty, ErrorNote, errorText, Loading, must, Page, Panel, timeAgo, useLoad, type ViewProps } from "../ui";
import { canCancel, canMark, minutesText, SOURCES } from "./model";
import { guestName, MEETING_COLUMNS, type Meeting } from "./MeetingsView";
import { AvatarStack, copyText, Detail, meetingsApi, Modal, StatusBadge, useNow, usePeople } from "./parts";

type Full = Meeting & { location: Partial<Location> & { url?: string }; answers: Record<string, string>; cancel_reason: string | null; payment: { amount?: number; currency?: string } | null; created_at: string };
type Event = { id: number; kind: string; detail: Record<string, unknown>; at: string };

const EVENT: Record<string, string> = {
  booked: "Booked",
  pending_payment: "Waiting on payment",
  paid: "Paid",
  moved: "Moved",
  canceled: "Canceled",
  held: "Marked held",
  no_show: "Marked no-show",
  reminder_sent: "Reminder sent",
  synced: "Added to the calendar",
  sync_failed: "Calendar update failed",
  refunded: "Refunded",
};
const eventLabel = (k: string) => EVENT[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ");

const PLACE: Record<Location["kind"], string> = {
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  zoom: "Zoom",
  phone_guest: "Phone, the guest's number",
  phone_host: "Phone",
  in_person: "In person",
  link: "Link",
};

export function MeetingPage(props: ViewProps) {
  const { sb, session, ws, id, navigate } = props;
  const now = useNow();
  const people = usePeople(sb, ws.id);
  const data = useLoad(async () => {
    const [m, events] = await Promise.all([
      sb.from("meetings").select(`${MEETING_COLUMNS}, location, answers, cancel_reason, payment, created_at`).eq("id", id).eq("workspace_id", ws.id).maybeSingle(),
      sb.from("meeting_events").select("id, kind, detail, at").eq("meeting_id", id).order("at", { ascending: false }).order("id", { ascending: false }),
    ]);
    const meeting = must(m) as unknown as Full | null;
    const type = meeting?.type_id ? ((must(await sb.from("meeting_types").select("id, name, settings").eq("id", meeting.type_id).maybeSingle()) as { id: string; name: string; settings: TypeSettings } | null) ?? null) : null;
    return { meeting, type, events: (must(events) ?? []) as Event[] };
  }, id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [copied, setCopied] = useState(false);
  const back = { label: "Meetings", onClick: () => navigate("meetings") };

  const act = async (body: Record<string, unknown>) => {
    setError("");
    setBusy(true);
    try {
      const r = await meetingsApi<{ refund?: "done" | "failed"; url?: string }>(session, ws.id, "action", { meetingId: id, ...body });
      if (r.refund === "failed") setError("Canceled. The refund didn't go through; refund it in Stripe.");
      data.reload();
      return r;
    } catch (e) {
      setError(errorText(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!data.data)
    return (
      <Page title="Meeting" back={back}>
        {data.error ? <ErrorNote message={data.error} /> : <Loading />}
      </Page>
    );
  const m = data.data.meeting;
  if (!m)
    return (
      <Page title="Meeting" back={back}>
        <Empty icon={<CalendarIcon size={18} />} title="Meeting not found" />
      </Page>
    );
  const host = people.data?.byId;
  const start = new Date(m.start_at);
  const minutes = Math.round((new Date(m.end_at).getTime() - start.getTime()) / 60_000);
  const questions = new Map((data.data.type?.settings.questions ?? []).map((q) => [q.id, q.label]));
  const answers = Object.entries(m.answers ?? {}).filter(([, v]) => v);
  const guestZone = m.guest_tz && m.guest_tz !== Intl.DateTimeFormat().resolvedOptions().timeZone ? m.guest_tz : null;
  const company = m.contact?.company?.name || m.contact?.company?.domain;

  return (
    <Page
      title={guestName(m)}
      back={back}
      actions={
        <>
          {canMark(m, now) ? (
            <>
              <Button variant={m.status === "held" ? "primary" : "ghost"} disabled={busy || m.status === "held"} onClick={() => void act({ action: "held" })}>
                Held
              </Button>
              <Button variant={m.status === "no_show" ? "primary" : "ghost"} disabled={busy || m.status === "no_show"} onClick={() => void act({ action: "no_show" })}>
                No-show
              </Button>
            </>
          ) : null}
          {m.status === "booked" && canCancel(m, now) ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const r = await act({ action: "link" });
                if (r?.url && (await copyText(r.url))) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }
              }}
            >
              <LinkIcon size={13} />
              {copied ? "Copied" : "Reschedule link"}
            </Button>
          ) : null}
          {canCancel(m, now) ? (
            <Button variant="danger" disabled={busy} onClick={() => setCanceling(true)}>
              Cancel meeting
            </Button>
          ) : null}
        </>
      }
    >
      {canceling ? <CancelDialog paid={!!m.payment?.amount} busy={busy} onClose={() => setCanceling(false)} onCancel={async (reason) => (await act({ action: "cancel", reason })) && setCanceling(false)} /> : null}
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <ErrorNote message={error} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel frame className="anim-rise-sm overflow-hidden">
              <div className="wash flex flex-wrap items-end gap-4 px-6 py-6">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="label-mono">{start.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                  <span className="text-[31px] leading-none font-semibold tracking-[-0.03em] text-ink tabular-nums">
                    {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    <span className="text-muted"> {minutesText(minutes)}</span>
                  </span>
                  {guestZone ? (
                    <span className="text-[12.5px] text-body">
                      {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: guestZone })} for the guest, {guestZone.split("/").pop()!.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </div>
                <StatusBadge status={m.status as MeetingStatus} />
              </div>
              <div className="divide-y divide-line px-6 py-1">
                <Detail label="Guest">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{guestName(m)}</span>
                    <a href={`mailto:${m.guest_email}`} className="text-[12.5px] text-muted hover:text-ink">
                      {m.guest_email}
                    </a>
                    {m.contact_id ? (
                      <Button variant="plain" size="sm" className="-my-1 h-7 px-2.5" onClick={() => navigate("contacts", m.contact_id!)}>
                        <Contact size={13} />
                        Contact
                      </Button>
                    ) : null}
                  </span>
                </Detail>
                {company ? <Detail label="Company">{company}</Detail> : null}
                <Detail label="Host">
                  <span className="flex flex-wrap items-center gap-2">
                    <AvatarStack ids={m.hosts} people={host} max={5} />
                    <span className="truncate">{m.hosts.map((h) => host?.get(h)?.name ?? "Former teammate").join(", ")}</span>
                  </span>
                </Detail>
                <Detail label="Type">{data.data.type?.name ?? SOURCES[m.source as MeetingSource]}</Detail>
                {m.location?.kind ? (
                  <Detail label="Where">
                    <span className="flex flex-col gap-0.5">
                      <span>{PLACE[m.location.kind as Location["kind"]] ?? m.location.kind}</span>
                      {m.location.url ? (
                        <a href={m.location.url} target="_blank" rel="noreferrer" className="truncate text-[12.5px] text-clay underline-offset-2 hover:underline">
                          {m.location.url}
                        </a>
                      ) : "address" in m.location && m.location.address ? (
                        <span className="text-[12.5px] text-muted">{m.location.address}</span>
                      ) : "number" in m.location && m.location.number ? (
                        <span className="text-[12.5px] text-muted">{m.location.number}</span>
                      ) : null}
                    </span>
                  </Detail>
                ) : null}
                <Detail label="Source">{SOURCES[m.source as MeetingSource] ?? m.source}</Detail>
                {m.payment?.amount ? (
                  <Detail label="Paid">
                    <span className="tabular-nums">{(m.payment.amount / 100).toLocaleString(undefined, { style: "currency", currency: (m.payment.currency ?? "usd").toUpperCase() })}</span>
                  </Detail>
                ) : null}
                {m.cancel_reason ? <Detail label="Reason">{m.cancel_reason}</Detail> : null}
              </div>
            </Panel>
            {answers.length ? (
              <Panel className="anim-rise-sm">
                <div className="flex h-11 items-center border-b border-line px-6 text-[13px] font-medium">Answers</div>
                <dl className="divide-y divide-line px-6">
                  {answers.map(([k, v]) => (
                    <div key={k} className="flex flex-col gap-1 py-3">
                      <dt className="label-mono">{questions.get(k) ?? k}</dt>
                      <dd className="text-[13.5px] whitespace-pre-wrap text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
            ) : null}
          </div>
          <Panel className="anim-rise-sm self-start">
            <div className="flex h-11 items-center border-b border-line px-5 text-[13px] font-medium">History</div>
            <ol className="relative flex flex-col px-5 py-4">
              {data.data.events.map((e, i) => (
                <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < data.data!.events.length - 1 ? <span aria-hidden="true" className="absolute top-3 bottom-0 left-[3.5px] w-px bg-line" /> : null}
                  <span aria-hidden="true" className={`relative mt-1.5 size-2 shrink-0 rounded-full ${i === 0 ? "bg-clay" : "bg-line-strong"}`} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-ink">{eventLabel(e.kind)}</span>
                    {e.kind === "moved" && typeof e.detail.from === "string" ? (
                      <span className="text-[12px] text-muted">
                        from {new Date(e.detail.from).toLocaleString("en-US", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                    ) : null}
                    {typeof e.detail.reason === "string" ? <span className="text-[12px] text-muted">{e.detail.reason}</span> : null}
                    {typeof e.detail.by === "string" && host?.get(e.detail.by) ? <span className="text-[12px] text-muted">{host.get(e.detail.by)!.name}</span> : null}
                    <span className="text-[12px] text-faint" title={new Date(e.at).toLocaleString()}>
                      {timeAgo(e.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function CancelDialog({ paid, busy, onClose, onCancel }: { paid: boolean; busy: boolean; onClose: () => void; onCancel: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Cancel this meeting?"
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Keep it
          </Button>
          <Button className="!bg-rose" disabled={busy} onClick={() => onCancel(reason)}>
            {paid ? "Cancel and refund" : "Cancel meeting"}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">Reason for the guest</span>
        <textarea
          autoFocus
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="w-full resize-y rounded-sm border border-line-strong bg-card px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink"
        />
      </label>
    </Modal>
  );
}
