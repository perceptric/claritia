"use client";

// Calendar › Meeting types (docs/scheduling-plan.md 11.2), after Calendly's Event types: You | Team, a search box and
// how many were booked this week; then each person's types (yours, the team's, each teammate's) as 68 px rows with
// their length, place, who takes it and hours in gray, an on switch, Copy link and the more menu. Clicking a row
// opens its panel on the right (/scheduling/types/<id>); the list stays where it is. New meeting type opens the same
// panel (/scheduling/types/new).

import { useMemo, useState } from "react";
import type { Availability } from "@/lib/meetings/types";
import { CalendarIcon, Check, Clock, Copy, ExternalLink, Plus, Search, User, Users } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, IconButton, invalidate, Loading, must, Page, Segmented, Toggle, useQuery, type ViewProps } from "../ui";
import { LinkDialog } from "../meetings/LinkDialog";
import { copyText, meetingsApi, ownZone, PersonAvatar, usePeople, useWorkspaceSlug } from "../meetings/parts";
import { TYPE_COLS, useMeetingTypes, type TypeRow } from "../meetings/TypesList";
import { useLiveBody } from "../routing/screenParts";
import { groupTypes, lengthWords, PLACE_WORDS, weeklyWords } from "./model";
import { Corners } from "./panel";
import { newDraft, placeIcon, TypePanel, whoWords, type HostStatus, type Named, type PanelData } from "./TypePanel";

type Whose = "you" | "team";

/** Yours: types you own, and one-person types with no owner that you host. */
export const isMine = (t: Pick<TypeRow, "owner_user_id" | "kind" | "hosts">, me: string) => t.owner_user_id === me || (!t.owner_user_id && (t.kind === "one" || t.kind === "group") && t.hosts[0]?.user_id === me);

export function TypesPage(props: ViewProps & { open: string }) {
  const { sb, session, ws, navigate, open } = props;
  const me = session.user.id;
  const people = usePeople(sb, ws.id);
  const slug = useWorkspaceSlug(session, ws.id);
  const live = useLiveBody(sb, ws.id);
  const list = useMeetingTypes(sb, ws.id);
  // Hours, schedules, this week's bookings and who can host, for the rows' gray words and the panel.
  const extra = useQuery(`meeting_types:${ws.id}:page`, async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [hours, named, booked, cals, reps] = await Promise.all([
      sb.from("availability").select("user_id, tz, weekly, overrides").eq("workspace_id", ws.id),
      sb.from("availability_schedules").select("user_id, name, tz, weekly, overrides").eq("workspace_id", ws.id),
      sb.from("meetings").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).not("type_id", "is", null).gte("created_at", weekAgo),
      sb.from("calendar_accounts").select("user_id, provider, status").eq("workspace_id", ws.id),
      sb.from("router_reps").select("user_id, out_dates").eq("workspace_id", ws.id),
    ]);
    const status = new Map<string, HostStatus>();
    const at = (u: string) => status.get(u) ?? (status.set(u, { cal: false, out: [] }), status.get(u)!);
    for (const c of (cals.data ?? []) as { user_id: string; provider: string; status: string }[]) if (c.provider !== "zoom" && c.status === "ok") at(c.user_id).cal = true;
    for (const r of (reps.data ?? []) as { user_id: string; out_dates: { from: string; to: string }[] | null }[]) at(r.user_id).out = r.out_dates ?? [];
    if (booked.error) throw new Error(booked.error.message);
    return {
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
      // Named schedules; a table missing before 066 reads as none.
      named: (named.data ?? []) as Named[],
      week: booked.count ?? 0,
      status,
    };
  });
  const data = { data: list.data && extra.data ? { ...extra.data, types: list.data } : null, error: list.error || extra.error };
  const [whose, setWhose] = useState<Whose>("you");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const types = data.data?.types;
  const row = open && open !== "new" ? (types?.find((t) => t.id === open) ?? null) : null;
  // A type opened by its address shows in its own list.
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (row && shownFor !== row.id) {
    setShownFor(row.id);
    const w: Whose = isMine(row, me) ? "you" : "team";
    if (w !== whose) setWhose(w);
  }

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const nameOf = (id: string) => people.data?.byId.get(id)?.name ?? "Former teammate";
  const queues = useMemo(() => live.data?.body.queues ?? [], [live.data]);
  const shown = useMemo(() => (extra.data && list.data ? list.data : []).filter((t) => (whose === "you" ? isMine(t, me) : !isMine(t, me)) && (!query.trim() || t.name.toLowerCase().includes(query.trim().toLowerCase()))), [extra.data, list.data, whose, me, query]);
  const groups = whose === "you" ? (shown.length ? [{ key: "me", person: me as string | null, types: shown }] : []) : groupTypes(shown, me, nameOf);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const typeUrl = (s: string) => (slug.data ? `${origin}/book/${slug.data}/${s}` : "");
  const flash = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  };
  // The switch moves on click; it goes back, with the error, if the save fails.
  const setActive = (t: TypeRow, active: boolean) =>
    act(async () => {
      const { name, slug: s, kind: k, hosts, settings, secret, locked, owner_user_id } = t;
      await list.mutate(
        (rows) => rows.map((x) => (x.id === t.id ? { ...x, active } : x)),
        () => meetingsApi(session, ws.id, "types", { action: "save", id: t.id, type: { name, slug: s, kind: k, hosts, settings, secret, active, locked, owner_user_id } }),
      );
    });
  const remove = (t: TypeRow) =>
    act(async () => {
      if (!(await askConfirm(`Delete ${t.name}?`, { body: "Its booking link stops working. Booked meetings stay.", ok: "Delete", danger: true }))) return;
      if (open === t.id) navigate("scheduling", "types");
      await list.mutate(
        (rows) => rows.filter((x) => x.id !== t.id),
        () => meetingsApi(session, ws.id, "types", { action: "delete", id: t.id }),
      );
      invalidate("app_counts");
    });
  // A copy opens at once: it shows as the server names it, then the saved row replaces it.
  const duplicate = (t: TypeRow) =>
    act(async () => {
      const r = await meetingsApi<{ id: string }>(session, ws.id, "types", { action: "duplicate", id: t.id });
      list.set((rows) => [...rows.filter((x) => x.id !== r.id), { ...t, id: r.id, name: `${t.name} copy`.slice(0, 120), slug: `${t.slug}-copy`, owner_user_id: t.template_id ? me : t.owner_user_id }]);
      navigate("scheduling", `types/${r.id}`);
      const saved = must(await sb.from("meeting_types").select(TYPE_COLS).eq("id", r.id).maybeSingle()) as TypeRow | null;
      if (saved) list.set((rows) => rows.map((x) => (x.id === saved.id ? saved : x)));
    });
  // After the panel saves, only the types list is read again.
  const saved = () => {
    list.reload();
    invalidate("app_counts");
  };

  const panelData: PanelData | null =
    data.data && people.data
      ? { people: people.data.list, byId: people.data.byId, hours: data.data.hours, named: data.data.named, status: data.data.status, queues, wsSlug: slug.data ?? null }
      : null;
  const close = () => navigate("scheduling", "types");
  const panel =
    panelData && open === "new" ? (
      <TypePanel key="new" {...props} row={null} start={newDraft(me, whose === "team")} data={panelData} onClose={close} onSaved={saved} />
    ) : panelData && row ? (
      <TypePanel key={row.id} {...props} row={row} start={newDraft(me, false)} data={panelData} onClose={close} onSaved={saved} onDuplicate={() => duplicate(row)} />
    ) : null;

  const actions = (
    <>
      <Button variant="ghost" size="sm" className="max-sm:!hidden" onClick={() => navigate("scheduling", "availability")}>
        Manage availability
      </Button>
      <Button size="sm" onClick={() => navigate("scheduling", "types/new")}>
        <Plus size={14} />
        New meeting type
      </Button>
    </>
  );

  if (types && !types.length)
    return (
      <Page title="Meeting types" actions={actions} flush>
        <div className="relative h-full min-h-0 overflow-y-auto">
          <ToolIntro
            sketch="calendar"
            title={"Share one link\nand let leads pick a time"}
            lead="A meeting type sets who hosts, how long, when and where. Share it as a page, a one-time link or times in an email; every booking lands on the lead."
            action={
              <Button onClick={() => navigate("scheduling", "types/new")}>
                <Plus size={14} />
                New meeting type
              </Button>
            }
          />
          {panel}
        </div>
      </Page>
    );

  return (
    <Page title="Meeting types" actions={actions} flush>
      {linkFor ? <LinkDialog sb={sb} session={session} ws={ws} types={(types ?? []).map((t) => ({ ...t, lengths: t.settings.lengths }))} initialType={linkFor} onClose={() => setLinkFor(null)} /> : null}
      <div className="relative h-full min-h-0 overflow-hidden">
        <div className={`h-full overflow-y-auto px-4 pt-4 pb-6 transition-[padding] duration-[320ms] ease-out sm:px-7 ${panel ? "md:pr-[428px]" : ""}`}>
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <Segmented<Whose>
              size="sm"
              label="Whose"
              value={whose}
              options={[
                { value: "you", label: "You" },
                { value: "team", label: "Team" },
              ]}
              onChange={(w) => {
                setWhose(w);
                if (open) close();
              }}
            />
            <label className="flex h-8 w-[260px] max-w-full min-w-0 items-center gap-2 rounded-sm border border-line px-2.5 text-muted focus-within:border-ink">
              <Search size={14} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search meeting types" aria-label="Search meeting types" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
            </label>
            <span className="flex-1" />
            {data.data ? (
              <span className="text-[12.5px] text-muted">
                {data.data.week} booked this week
              </span>
            ) : null}
          </div>
          <ErrorNote message={error || data.error || slug.error} />
          {!data.data ? (
            <Loading />
          ) : !groups.length ? (
            <p className="py-10 text-center text-[13.5px] text-muted">{query.trim() ? "No matches" : whose === "you" ? "No meeting types of yours yet" : "No team meeting types yet"}</p>
          ) : (
            groups.map((g) => {
              const person = g.person ? people.data?.byId.get(g.person) : null;
              const pageUrl = slug.data ? (g.person ? (person?.slug ? `${origin}/book/${slug.data}/${person.slug}` : "") : `${origin}/book/${slug.data}`) : "";
              return (
                <section key={g.key} className="mb-[18px]">
                  <header className="mt-1.5 mb-2 flex items-center gap-2.5">
                    {g.person === me && !person?.photo ? (
                      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[10.5px] font-semibold text-paper">{initials(nameOf(me))}</span>
                    ) : g.person ? (
                      <PersonAvatar person={person} label={nameOf(g.person)} size={26} />
                    ) : (
                      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-paper-deep text-[10.5px] font-semibold text-body">{ws.name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{g.person ? (g.person === me ? "You" : nameOf(g.person)) : `${ws.name} team`}</span>
                    <span className="flex-1" />
                    {pageUrl ? (
                      <a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
                        View booking page
                        <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </header>
                  <ul className="rounded-[10px] border border-line">
                    {g.types.map((t) => {
                      const url = typeUrl(t.slug);
                      const sel = open === t.id;
                      const host = t.hosts[0]?.user_id;
                      return (
                        <li
                          key={t.id}
                          className={`relative flex h-[68px] items-center gap-2.5 border-t border-line pr-2.5 pl-4 transition-colors duration-[120ms] first:rounded-t-[10px] first:border-t-0 last:rounded-b-[10px] hover:bg-paper ${sel ? "bg-paper" : ""}`}
                        >
                          {sel ? <Corners /> : null}
                          <button type="button" onClick={() => navigate("scheduling", `types/${t.id}`)} className={`flex min-w-0 flex-1 flex-col gap-[5px] text-left after:absolute after:inset-0 ${t.active ? "" : "opacity-50"}`}>
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                              {t.secret ? <Badge>Secret</Badge> : null}
                              {t.template_id ? <Badge>Managed</Badge> : null}
                            </span>
                            <span className="flex min-w-0 items-center gap-3.5 overflow-hidden text-[12.5px] whitespace-nowrap text-muted">
                              <span className="inline-flex shrink-0 items-center gap-[5px]">
                                <Clock size={14} />
                                {lengthWords(t.settings.lengths)}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-[5px]">
                                {placeIcon(t.settings.location.kind, 14)}
                                {PLACE_WORDS[t.settings.location.kind]}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-[5px]">
                                {t.kind === "one" || t.kind === "group" ? <User size={14} /> : <Users size={14} />}
                                {whoWords(t, queues)}
                              </span>
                              <span className="inline-flex min-w-0 items-center gap-[5px]">
                                <CalendarIcon size={14} />
                                <span className="truncate">{host ? weeklyWords(hoursFor(host, t.settings.schedule, data.data!)) : "No hosts"}</span>
                              </span>
                            </span>
                          </button>
                          <span className="relative z-10 flex shrink-0 items-center gap-0.5">
                            <span className="mr-1.5 flex items-center">
                              <Toggle label={t.active ? `Turn off ${t.name}` : `Turn on ${t.name}`} on={t.active} onChange={(v) => void setActive(t, v)} />
                            </span>
                            {url ? (
                              <IconButton
                                label={copied === t.id ? "Copied" : "Copy link"}
                                onClick={() =>
                                  void copyText(url).then((ok) => {
                                    if (ok) flash(t.id);
                                  })
                                }
                              >
                                {copied === t.id ? <Check size={14} className="text-signal-text" /> : <Copy size={14} />}
                              </IconButton>
                            ) : null}
                            <MoreMenu
                              items={[
                                url ? { label: "Open booking page", run: () => window.open(url, "_blank", "noopener") } : null,
                                { label: "New single-use link", run: () => setLinkFor(t.id) },
                                {
                                  label: "Copy times for an email",
                                  run: () =>
                                    void act(async () => {
                                      const r = await meetingsApi<{ text: string }>(session, ws.id, "times", { typeId: t.id, tz: ownZone() });
                                      if (!r.text) throw new Error(`${t.name} has no free times in its window.`);
                                      if (await copyText(r.text)) flash(t.id);
                                    }),
                                },
                                { label: "Duplicate", run: () => void duplicate(t) },
                                { label: "All settings", run: () => navigate("scheduling", `types/${t.id}/all`) },
                                { label: "Delete", danger: true, run: () => void remove(t) },
                              ]}
                            />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
        {panel}
      </div>
    </Page>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** A host's hours for a type: their schedule of the type's name, else their working hours. */
function hoursFor(user: string, schedule: string | undefined, d: { hours: Map<string, Availability>; named: Named[] }): Availability | null {
  if (schedule) {
    const n = d.named.find((x) => x.user_id === user && x.name.toLowerCase() === schedule.toLowerCase());
    if (n) return n;
  }
  return d.hours.get(user) ?? null;
}
