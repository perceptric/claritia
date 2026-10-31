"use client";

// Team calendars (Meetings › Availability › Team; docs/meetings-scheduler.md 1.9): each person's calendar connection,
// hours, caps and whether they're away, so an owner sees at a glance who can be booked. Away is the same switch
// Routing reads: someone away gets no leads from forms and no times on booking pages. Owners change anyone's hours
// and away; everyone can change their own away.

import { useState } from "react";
import { DEFAULT_AVAILABILITY, type Availability, type MeetingType } from "@/lib/meetings/types";
import { Pencil } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Badge, Button, CardHead, ErrorNote, errorText, IconButton, invalidate, Loading, must, Panel, type Role, Td, Th, Toggle, useQuery, type ViewProps } from "../ui";
import { withoutToday } from "../reps/model";
import { routingApi } from "../routing/api";
import { localDate } from "../routing/screensModel";
import { HoursEditor } from "./HoursEditor";
import { hoursSummary } from "./model";
import { providerOf, type Account } from "./MyCalendar";
import { meetingsApi, Modal, ownZone, PersonAvatar, useNow, usePeople, type Person } from "./parts";

/** The tightest caps across the types someone hosts: "3 a day, 10 a week". */
function capsOf(user: string, types: Pick<MeetingType, "hosts" | "settings">[]): string {
  const mine = types.filter((t) => t.hosts.some((h) => h.user_id === user));
  const low = (k: "perDay" | "perWeek") => Math.min(...mine.map((t) => t.settings[k] || Infinity));
  const d = low("perDay");
  const w = low("perWeek");
  const parts = [Number.isFinite(d) ? `${d} a day` : "", Number.isFinite(w) ? `${w} a week` : ""].filter(Boolean);
  return parts.length ? parts.join(", ") : "None";
}

type Rep = { user_id: string; paused_until: string | null; out_dates: { from: string; to: string }[] | null };

export function TeamCalendars({ sb, session, ws, role }: Pick<ViewProps, "sb" | "session" | "ws"> & { role: Role }) {
  const people = usePeople(sb, ws.id);
  const data = useQuery(`calendar_accounts:${ws.id}:team`, async () => {
    const [accounts, hours, types, reps] = await Promise.all([
      sb.from("calendar_accounts").select("id, user_id, provider, account_email, status, refreshed_at").eq("workspace_id", ws.id).order("created_at"),
      sb.from("availability").select("user_id, tz, weekly, overrides").eq("workspace_id", ws.id),
      sb.from("meeting_types").select("hosts, settings").eq("workspace_id", ws.id).eq("active", true),
      sb.from("router_reps").select("user_id, paused_until, out_dates").eq("workspace_id", ws.id),
    ]);
    return {
      accounts: (must(accounts) ?? []) as Account[],
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
      types: (must(types) ?? []) as Pick<MeetingType, "hosts" | "settings">[],
      // Read with the rest; a workspace without the routing tables reads as nobody away.
      reps: new Map(((reps.data ?? []) as Rep[]).map((r) => [r.user_id, r])),
    };
  });
  const [editing, setEditing] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const owner = role === "owner";
  const now = useNow();
  const today = localDate(now);
  /** Away now: paused with no end or one still ahead, or out of office today. */
  const awayNow = (r: Rep | undefined) => !!r && ((!!r.paused_until && (r.paused_until === "infinity" || new Date(r.paused_until).getTime() > now)) || (r.out_dates ?? []).some((d) => d.from <= today && today <= d.to));
  const setAway = async (u: string, away: boolean) => {
    setError("");
    const r = data.data?.reps.get(u);
    const patch = away ? { paused_until: "infinity" } : { paused_until: "", out_dates: withoutToday(r?.out_dates, today) };
    try {
      await data.mutate(
        (d) => ({ ...d, reps: new Map(d.reps).set(u, { user_id: u, paused_until: away ? "infinity" : null, out_dates: away ? (r?.out_dates ?? []) : withoutToday(r?.out_dates, today) }) }),
        () => routingApi(session, ws.id, "rep", { user: u, patch }),
      );
      invalidate(`routing_screen:${ws.id}`);
      invalidate(`routing_reps:${ws.id}`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Panel className="overflow-hidden">
      <CardHead label="Calendars" count={people.data?.list.length} />
      {editing ? <EditHours session={session} ws={ws.id} person={editing} saved={data.data?.hours.get(editing.id) ?? null} onClose={() => setEditing(null)} onSaved={(a: Availability) => {
            const who = editing.id;
            setEditing(null);
            data.set((d) => ({ ...d, hours: new Map(d.hours).set(who, { user_id: who, ...a }) }));
            invalidate("meeting_types");
          }} /> : null}
      {error ? (
        <div className="px-4 pt-3">
          <ErrorNote message={error} />
        </div>
      ) : null}
      {data.error || people.error ? (
        <div className="p-4">
          <ErrorNote message={data.error || people.error} />
        </div>
      ) : !data.data || !people.data ? (
        <Loading />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse [&_tbody_tr:last-child_td]:border-b-0">
            <thead>
              <tr>
                <Th className="pl-5">Person</Th>
                <Th>Calendar</Th>
                <Th>Hours</Th>
                <Th>Caps</Th>
                <Th>Away</Th>
                {owner ? <Th className="w-12">{""}</Th> : null}
              </tr>
            </thead>
            <tbody>
              {people.data.list.map((p) => {
                const accounts = data.data!.accounts.filter((a) => a.user_id === p.id);
                const cal = accounts.filter((a) => a.provider !== "zoom");
                const h = data.data!.hours.get(p.id);
                return (
                  <tr key={p.id}>
                    <Td className="pl-5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <PersonAvatar person={p} size={28} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-ink">{p.name}</span>
                          <span className="truncate text-[12px] text-muted">{p.email}</span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        {accounts.map((a) => (
                          <span key={a.id} title={`${providerOf(a.provider).name}, ${a.account_email}`}>
                            <BrandLogo domain={providerOf(a.provider).domain} name={providerOf(a.provider).name} size={16} />
                          </span>
                        ))}
                        {cal.some((a) => a.status === "reconnect") ? (
                          <Badge tone="red" dot>
                            Reconnect
                          </Badge>
                        ) : cal.length ? (
                          <Badge tone="green" dot>
                            Connected
                          </Badge>
                        ) : (
                          <Badge>Not connected</Badge>
                        )}
                      </span>
                    </Td>
                    <Td className="max-w-[280px] whitespace-normal">
                      {h ? (
                        <span className="flex flex-col py-1.5">
                          <span className="text-[13px] text-ink">{hoursSummary(h.weekly)}</span>
                          <span className="text-[12px] text-muted">{h.tz.replace(/_/g, " ")}</span>
                        </span>
                      ) : (
                        <span className="text-faint">Not set</span>
                      )}
                    </Td>
                    <Td className="text-body">{capsOf(p.id, data.data!.types)}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Toggle label={`${p.name} away`} on={awayNow(data.data!.reps.get(p.id))} disabled={!owner && p.id !== session.user.id} onChange={(v) => void setAway(p.id, v)} />
                        {awayNow(data.data!.reps.get(p.id)) ? <Badge>No leads</Badge> : null}
                      </span>
                    </Td>
                    {owner ? (
                      <Td className="pr-3">
                        <IconButton label="Change hours" onClick={() => setEditing(p)}>
                          <Pencil size={14} />
                        </IconButton>
                      </Td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function EditHours({ session, ws, person, saved, onClose, onSaved }: { session: ViewProps["session"]; ws: string; person: Person; saved: Availability | null; onClose: () => void; onSaved: (a: Availability) => void }) {
  const [draft, setDraft] = useState<Availability>(() => (saved ? { tz: saved.tz, weekly: saved.weekly, overrides: saved.overrides } : DEFAULT_AVAILABILITY(ownZone())));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={`${person.name}'s hours`}
      wide
      onClose={onClose}
      footer={
        <>
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setError("");
              setBusy(true);
              try {
                await meetingsApi(session, ws, "availability", { userId: person.id, availability: draft });
                onSaved(draft);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ErrorNote message={error} />
        <HoursEditor value={draft} onChange={setDraft} />
      </div>
    </Modal>
  );
}
