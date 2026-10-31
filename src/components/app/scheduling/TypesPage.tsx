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
import { Badge, Button, ErrorNote, errorText, invalidate, Loading, must, Page, useQuery, type ViewProps } from "../ui";
import { bookedBy } from "./hosts";
import { LinkDialog } from "../meetings/LinkDialog";
import { copyText, meetingsApi, Modal, ownZone, usePeople, useWorkspaceSlug } from "../meetings/parts";
import { TYPE_COLS, useMeetingTypes, type TypeRow } from "../meetings/TypesList";
import { useLiveBody } from "../routing/screenParts";
import { KIND_WORDS, lengthWords, PLACE_WORDS } from "./model";
import { Corners } from "./panel";
import { newDraft, placeIcon, TypePanel, type HostStatus, type Named, type PanelData } from "./TypePanel";

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
  // The forms that book each meeting on submission.
  const forms = useQuery(`meeting_types:${ws.id}:forms`, async () => (must(await sb.from("forms").select("id, name, status, meeting:draft->after->schedule->>meetingTypeId, routes:draft->after->schedule->routes").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; name: string; status: string; meeting: string | null; routes: { meet: string }[] | null }[]);
  const [useFor, setUseFor] = useState<string | null>(null);
  const data = { data: list.data && extra.data ? { ...extra.data, types: list.data } : null, error: list.error || extra.error };
  const [error, setError] = useState("");
  const [linkFor, setLinkFor] = useState<string | null>(null);
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
      <TypePanel key="new" {...props} row={null} start={newDraft(me, false)} data={panelData} onClose={close} onSaved={saved} />
    ) : panelData && row ? (
      <TypePanel key={row.id} {...props} row={row} start={newDraft(me, false)} data={panelData} onClose={close} onSaved={saved} onDuplicate={() => duplicate(row)} />
    ) : null;

  const actions = (
    <Button onClick={() => navigate("scheduling", "types/new")}>
      <Plus size={14} />
      New meeting
    </Button>
  );

  if (types && !types.length)
    return (
      <Page title="Meetings" actions={actions} flush>
        <div className="relative h-full min-h-0 overflow-y-auto">
          <ToolIntro
            sketch="calendar"
            title={"Share one link\nand let leads pick a time"}
            lead="A meeting sets who hosts, how long, when and where. Share it as a page, a one-time link or times in an email; every booking lands on the lead."
            action={
              <Button onClick={() => navigate("scheduling", "types/new")}>
                <Plus size={14} />
                New meeting
              </Button>
            }
          />
          {panel}
        </div>
      </Page>
    );

  return (
    <Page title="Meetings" actions={actions} flush>
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
      {linkFor ? <LinkDialog sb={sb} session={session} ws={ws} types={(types ?? []).map((t) => ({ ...t, lengths: t.settings.lengths }))} initialType={linkFor} onClose={() => setLinkFor(null)} /> : null}
      <div className="relative h-full min-h-0 overflow-hidden">
        <div className={`h-full overflow-y-auto transition-[padding] duration-[320ms] ease-out ${panel ? "md:pr-[400px]" : ""}`}>
          <div className="flex flex-col gap-3 px-[16px] pt-[16px] pb-[24px] sm:px-[clamp(16px,2.5vw,28px)]">
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
                  return (
                    <article key={t.id} className={`relative flex flex-col gap-2.5 rounded-[10px] border bg-card p-4 transition-colors duration-[140ms] ${sel ? "border-ink" : "border-line hover:border-line-strong"}`}>
                      {sel ? <Corners /> : null}
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => navigate("scheduling", `types/${t.id}`)} className={`min-w-0 flex-1 text-left after:absolute after:inset-0 ${t.active ? "" : "opacity-50"}`}>
                          <h3 className="truncate text-[15px] font-semibold text-ink">{t.name}</h3>
                        </button>
                        {!t.active ? <Badge>Off</Badge> : null}
                        {t.secret ? <Badge>Secret</Badge> : null}
                        <span className="relative z-10 -mt-1.5 -mr-2">
                          <MoreMenu
                            items={[
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
                      <div className="mt-auto flex items-center gap-2 border-t border-line pt-2.5 text-[12.5px]">
                        <Badge tone={dyn ? "violet" : "gray"}>{dyn ? "Dynamic" : t.kind === "one" || t.kind === "group" ? "Individual" : KIND_WORDS[t.kind]}</Badge>
                        <span className="min-w-0 truncate text-muted">{dyn ? `${t.hosts.length} ${t.hosts.length === 1 ? "rep" : "reps"}, ${dyn.rules.length} ${dyn.rules.length === 1 ? "rule" : "rules"}` : t.hosts.map((h) => nameOf(h.user_id)).join(", ")}</span>
                      </div>
                    </article>
                  );
                })}
                <button
                  type="button"
                  onClick={() => navigate("scheduling", "types/new")}
                  className="flex min-h-[148px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-line-strong text-muted transition-colors duration-[140ms] hover:border-faint hover:text-ink"
                >
                  <Plus size={16} />
                  New meeting
                </button>
              </div>
            )}
          </div>
        </div>
        {panel}
      </div>
    </Page>
  );
}
