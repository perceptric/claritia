"use client";

// Inbound › Meetings › Meetings (once Calendar › Meeting types): one card per meeting, in an even grid, with its
// length and video tool, what books it ("Used by": the forms whose Routing picks it, which open on On Submission, and
// routing steps that name it in the live router) and whether it's Individual (one host) or Dynamic (reps and rules).
// Clicking a card opens its panel on the right (/scheduling/types/<id>); New meeting opens the same panel
// (/scheduling/types/new). Copy link, single-use links, times for an email, on and off, Use in a form, duplicate, all
// settings and delete sit in each card's more menu.

import { useMemo, useState } from "react";
import type { Availability } from "@/lib/meetings/types";
import { Clock, FormIcon, Plus } from "../../Icons";
import { askConfirm } from "../Dialogs";
import { MoreMenu } from "../StatCards";
import { ToolIntro } from "../ToolIntro";
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, Page, Toggle, useQuery, type ViewProps } from "../ui";
import { bookedBy } from "./hosts";
import { LinkDialog } from "../meetings/LinkDialog";
import { ShareMeeting, type Pane as SharePane } from "./ShareMeeting";
import { AvatarStack, copyText, meetingsApi, Modal, ownZone, usePeople, useWorkspaceSlug } from "../meetings/parts";
import { ShareMenu } from "../meetings/Share";
import { DEFAULT_SETTINGS } from "@/lib/meetings/types";
import { TAB_X } from "./frame";
import { count, MEMBER } from "@/lib/words";
import { TYPE_COLS, useMeetingTypes, type TypeRow } from "../meetings/TypesList";
import { useLiveBody } from "../routing/screenParts";
import { KIND_WORDS, lengthWords, PLACE_WORDS } from "./model";
import { Corners } from "./panel";
import { newDraft, placeIcon, TypePanel, type HostStatus, type Named, type PanelData } from "./TypePanel";
import { KindTip } from "../meetings/KindTip";
import { bookingBase } from "@/lib/meetings/handles";

/** One-click starters: a meeting type already set up, opened in the new panel to check and save. */
type Starter = "intro" | "demo" | "team";
const STARTERS: { key: Starter; label: string; note: string }[] = [
  { key: "intro", label: "Intro call", note: "30 min" },
  { key: "demo", label: "Demo", note: "45 min" },
  { key: "team", label: "Team round robin", note: "30 min" },
];

export function starterDraft(k: Starter | null, me: string, team: string[]) {
  const base = newDraft(me, false);
  if (k === "intro") return { ...base, name: "Intro call", slug: "intro-call", settings: { ...DEFAULT_SETTINGS, lengths: [30] } };
  if (k === "demo") return { ...base, name: "Demo", slug: "demo", settings: { ...DEFAULT_SETTINGS, lengths: [45] } };
  if (k === "team") return { ...base, name: "Team call", slug: "team-call", kind: "round_robin" as const, owner_user_id: null, hosts: [...new Set([me, ...team])].map((user_id) => ({ user_id })), settings: { ...DEFAULT_SETTINGS, lengths: [30] } };
  return base;
}

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
      sb.from("meetings").select("type_id").eq("workspace_id", ws.id).not("type_id", "is", null).neq("status", "canceled").gte("created_at", weekAgo).limit(5000),
      sb.from("calendar_accounts").select("user_id, provider, status").eq("workspace_id", ws.id),
      sb.from("router_reps").select("user_id, out_dates").eq("workspace_id", ws.id),
    ]);
    const status = new Map<string, HostStatus>();
    const at = (u: string) => status.get(u) ?? (status.set(u, { cal: false, out: [] }), status.get(u)!);
    for (const c of (cals.data ?? []) as { user_id: string; provider: string; status: string }[]) if (c.provider !== "zoom" && c.status === "ok") at(c.user_id).cal = true;
    for (const r of (reps.data ?? []) as { user_id: string; out_dates: { from: string; to: string }[] | null }[]) at(r.user_id).out = r.out_dates ?? [];
    if (booked.error) throw new Error(booked.error.message);
    const perType = new Map<string, number>();
    for (const r of (booked.data ?? []) as { type_id: string }[]) perType.set(r.type_id, (perType.get(r.type_id) ?? 0) + 1);
    return {
      hours: new Map(((must(hours) ?? []) as ({ user_id: string } & Availability)[]).map((h) => [h.user_id, h])),
      // Named schedules; a table missing before 066 reads as none.
      named: (named.data ?? []) as Named[],
      week: perType,
      status,
    };
  });
  // The forms that book each meeting on submission.
  const forms = useQuery(`meeting_types:${ws.id}:forms`, async () => (must(await sb.from("forms").select("id, name, status, meeting:draft->after->schedule->>meetingTypeId, routes:draft->after->schedule->routes").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; name: string; status: string; meeting: string | null; routes: { meet: string }[] | null }[]);
  const [useFor, setUseFor] = useState<string | null>(null);
  // A starter picked from the empty page or the New tile: the new panel opens already filled in.
  const [starter, setStarter] = useState<Starter | null>(null);
  const startWith = (k: Starter | null) => {
    setStarter(k);
    navigate("scheduling", "types/new");
  };
  const data = { data: list.data && extra.data ? { ...extra.data, types: list.data } : null, error: list.error || extra.error };
  const [error, setError] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
  // Share open for one type, on a pane (⋯ › Embed on a website opens the code).
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [sharePane, setSharePane] = useState<SharePane>("link");
  const [copied, setCopied] = useState<string | null>(null);

  const types = data.data?.types;
  const row = open && open !== "new" ? (types?.find((t) => t.id === open) ?? null) : null;

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
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const typeUrl = (s: string) => (slug.data ? `${bookingBase(origin)}/book/${slug.data}/${s}` : "");
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
  // Made from a form's On Submission (?back=<form id>): once saved, back to that form where they left off.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("back")));
  const saved = () => {
    list.reload();
    invalidate("app_counts");
    if (back && open === "new") navigate("forms", back, "step=submit");
  };

  const panelData: PanelData | null =
    data.data && people.data
      ? { people: people.data.list, byId: people.data.byId, hours: data.data.hours, named: data.data.named, status: data.data.status, queues, wsSlug: slug.data ?? null }
      : null;
  const close = () => navigate("scheduling", "types");
  const panel =
    panelData && open === "new" ? (
      <TypePanel key={`new-${starter ?? ""}`} {...props} row={null} start={starterDraft(starter, me, people.data?.list.map((p) => p.id) ?? [me])} data={panelData} onClose={close} onSaved={saved} />
    ) : panelData && row ? (
      <TypePanel key={row.id} {...props} row={row} start={newDraft(me, false)} data={panelData} onClose={close} onSaved={saved} onDuplicate={() => duplicate(row)} />
    ) : null;

  const actions = (
    <Button onClick={() => startWith(null)}>
      <Plus size={14} />
      New meeting type
    </Button>
  );
  const starters = (
    <span className="flex flex-wrap justify-center gap-2">
      {STARTERS.map((st) => (
        <button key={st.key} type="button" onClick={() => startWith(st.key)} className="press inline-flex h-9 items-center gap-2 rounded-full bg-card shadow-outline px-3.5 text-[13px] font-medium text-ink hover:shadow-input-hover">
          {st.label}
          <span className="text-muted">{st.note}</span>
        </button>
      ))}
    </span>
  );

  if (types && !types.length)
    return (
      <Page title="Meeting types" actions={actions} flush>
        <div className="relative h-full min-h-0 overflow-y-auto">
          <ToolIntro
            sketch="calendar"
            title={"Share one link\nand let leads pick a time"}
            lead="A meeting sets who hosts, how long, when and where. Share it as a page, a one-time link or times in an email; every booking lands on the lead."
            action={
              <span className="flex flex-col items-center gap-3">
                {starters}
                <Button variant="ghost" onClick={() => startWith(null)}>
                  <Plus size={14} />
                  Start blank
                </Button>
              </span>
            }
          />
          {panel}
        </div>
      </Page>
    );

  return (
    <Page title="Meeting types" actions={actions} flush>
      {useFor ? (
        <Modal title="Use in a form" onClose={() => setUseFor(null)}>
          <div className="flex flex-col">
            {(forms.data ?? []).length ? (
              (forms.data ?? []).map((f) => (
                <button key={f.id} type="button" onClick={() => navigate("forms", f.id, `open=submission&use=${useFor}`)} className="flex min-h-[44px] items-center gap-2.5 border-b border-line px-1 text-left text-ink last:border-b-0 hover:bg-hover">
                  <FormIcon size={14} />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.meeting === useFor ? <Badge>Uses it</Badge> : null}
                </button>
              ))
            ) : (
              <span className="text-muted">No forms yet</span>
            )}
          </div>
        </Modal>
      ) : null}
      {shareFor && slug.data && types?.some((t) => t.id === shareFor) ? (
        <ShareMeeting session={session} ws={ws} type={types.find((t) => t.id === shareFor)!} wsSlug={slug.data} start={sharePane} onClose={() => setShareFor(null)} onSingleUse={() => (setLinkFor(shareFor), setShareFor(null))} onEditPage={() => (setShareFor(null), navigate("scheduling", "booking"))} />
      ) : null}
      {linkFor ? <LinkDialog sb={sb} session={session} ws={ws} types={(types ?? []).map((t) => ({ ...t, lengths: t.settings.lengths }))} initialType={linkFor} onClose={() => setLinkFor(null)} /> : null}
      <div className="relative h-full min-h-0 overflow-hidden">
        <div className={`h-full overflow-y-auto transition-[padding] duration-[320ms] ease-out ${panel ? "md:pr-[400px]" : ""}`}>
          <div className={`flex w-full min-w-0 flex-col gap-3 ${TAB_X} pt-4 pb-8`}>
            <ErrorNote message={error || data.error || slug.error} />
            {!data.data ? (
              <Loading />
            ) : (
              <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(types ?? []).map((t) => {
                  const url = typeUrl(t.slug);
                  const used = bookedBy(live.data?.body, t.id);
                  const usedBy = (forms.data ?? []).filter((f) => f.meeting === t.id || (f.routes ?? []).some((r) => r.meet === t.id));
                  const dyn = t.settings.dynamic;
                  const sel = open === t.id;
                  const booked = data.data!.week.get(t.id) ?? 0;
                  return (
                    <article key={t.id} className={`relative flex flex-col gap-2.5 rounded-[10px] border bg-card p-4 transition-colors duration-[140ms] ${sel ? "border-ink" : "border-line hover:border-line-strong"}`}>
                      {sel ? <Corners /> : null}
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => navigate("scheduling", `types/${t.id}`)} className={`min-w-0 flex-1 text-left after:absolute after:inset-0 ${t.active ? "" : "opacity-50"}`}>
                          <h3 className="text-[15px] font-semibold text-ink [overflow-wrap:anywhere]">{t.name}</h3>
                        </button>
                        {!t.active ? <Badge>Off</Badge> : null}
                        {t.secret ? <Badge>Secret</Badge> : null}
                        <span className="relative z-10 -mt-1.5 -mr-2">
                          <MoreMenu
                            items={[
                              url ? { label: "Share", run: () => (setSharePane("link"), setShareFor(t.id)) } : null,
                              url ? { label: "Embed on a website", run: () => (setSharePane("site"), setShareFor(t.id)) } : null,
                              url ? { label: copied === t.id ? "Copied" : "Copy link", run: () => void copyText(url).then((ok) => ok && flash(t.id)) } : null,
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
                              { label: t.active ? "Turn off" : "Turn on", run: () => void setActive(t, !t.active) },
                              { label: "Use in a form", run: () => setUseFor(t.id) },
                              { label: "Duplicate", run: () => void duplicate(t) },
                              { label: "All settings", run: () => navigate("scheduling", `types/${t.id}/all`) },
                              { label: "Delete", danger: true, run: () => void remove(t) },
                            ]}
                          />
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3.5 text-[12.5px] text-muted">
                        <span className="inline-flex items-center gap-[5px]">
                          <Clock size={12} />
                          {lengthWords(t.settings.lengths)}
                        </span>
                        <span className="inline-flex items-center gap-[5px]">
                          {placeIcon(t.settings.location.kind, 12)}
                          {PLACE_WORDS[t.settings.location.kind]}
                        </span>
                      </div>
                      {usedBy.length || used.length ? (
                        <div className="relative z-10 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                          <span>Used by</span>
                          {usedBy.map((f) => (
                            <button key={f.id} type="button" title={`Open ${f.name}`} onClick={() => navigate("forms", f.id, "open=submission")} className="rounded-full hover:opacity-80">
                              <Badge>{f.name}</Badge>
                            </button>
                          ))}
                          {used.map((u) => (
                            <Badge key={u}>{u}</Badge>
                          ))}
                        </div>
                      ) : null}
                      <span className="text-[12.5px] text-muted tabular-nums">{booked ? `${booked} booked this week` : "None booked this week"}</span>
                      <div className="mt-auto flex items-center gap-2 border-t border-line pt-2.5 text-[12.5px]">
                        <span className="relative z-10 flex min-w-0 items-center gap-2" title={dyn ? `${count(t.hosts.length, MEMBER)}, ${count(dyn.rules.length, "rule")}` : t.hosts.map((h) => nameOf(h.user_id)).join(", ")}>
                          <AvatarStack ids={t.hosts.map((h) => h.user_id)} people={people.data?.byId} max={4} size={22} />
                          <KindTip kind={dyn ? "dynamic" : "individual"}>
                            <Badge tone={dyn ? "violet" : "gray"}>{dyn ? "Dynamic" : t.kind === "one" || t.kind === "group" ? "Individual" : KIND_WORDS[t.kind]}</Badge>
                          </KindTip>
                        </span>
                        <span className="flex-1" />
                        <span className="relative z-10 flex items-center gap-1">
                          {url ? <ShareMenu name={t.name} get={async () => url} onError={setError} /> : null}
                          <Toggle label={t.active ? `Turn off ${t.name}` : `Turn on ${t.name}`} on={t.active} onChange={(v) => void setActive(t, v)} />
                        </span>
                      </div>
                    </article>
                  );
                })}
                <div className="flex min-h-[148px] flex-col items-center justify-center gap-2.5 rounded-[10px] border border-dashed border-line-strong p-4 text-muted">
                  <button type="button" onClick={() => startWith(null)} className="press inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-medium hover:text-ink">
                    <Plus size={15} />
                    New meeting type
                  </button>
                  <span className="flex flex-wrap justify-center gap-1.5">
                    {STARTERS.map((st) => (
                      <button key={st.key} type="button" onClick={() => startWith(st.key)} className="press inline-flex h-7 items-center rounded-full border border-line px-2.5 text-[12px] text-body hover:border-line-strong hover:text-ink">
                        {st.label}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
        {panel}
      </div>
    </Page>
  );
}
