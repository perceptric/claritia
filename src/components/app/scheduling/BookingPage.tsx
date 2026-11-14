"use client";

// Calendar › Booking page (docs/scheduling-plan.md 11.3): the page people land on at /booking/<handle>, drawn on the
// left as it is (the real page's parts, with what you're typing) and scaled to fit the height, and the few things that
// change it in a 400 px panel on the right: You | Team, then closed sections (Link, Profile, Meetings shown, Welcome
// line, Styling) and a pinned footer, Saved or Discard and Save changes.
// The look (welcome line, Claritia or one of the brands imported in Form Studio, "Built by Claritia", the meetings'
// order) is
// saved per page: yours on your profile, the team's on the workspace (src/lib/meetings/look.ts).

import { brandName } from "@/lib/brand/name";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toGuestType, type Profile as GuestProfile } from "@/lib/meetings/guest";
import { bookingOrigin, bookingUrl, cleanHandle, handleProblem } from "@/lib/meetings/handles";
import { cleanLook, lookTokens, lookWords, ordered, usesKit, type PageLook } from "@/lib/meetings/look";
import { DESIGN_FONTS, DESIGN_LIST, type Design } from "@/lib/meetings/designs";
import { sampleSlots } from "@/lib/meetings/guest";
import { Calendar } from "@/components/book/Calendar";
import { bookBrandCss, brandPlan } from "@/lib/meetings/brandPage";
import { AiMark } from "../Ai";
import { readLines } from "../streamLines";
import { Check, ChevronDown, ExternalLink, Grid, Grip, Link as LinkIcon, Message, Monitor, Palette, Phone, Plus, Upload, User } from "../../Icons";
import { BookShell } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import { askConfirm } from "../Dialogs";
import { Badge, Button, ErrorNote, errorText, Input, invalidate, Loading, Page, postJson, Segmented, setLeaveGuard, Toggle, useQuery, type ViewProps } from "../ui";
import { CopyButton, meetingsApi, usePeople } from "../meetings/parts";
import { useMeetingTypes, type TypeRow } from "../meetings/TypesList";
import { IconSeg, Labeled, PanelFooter, PanelSection } from "./panel";
import { WelcomeEditor } from "./WelcomeEditor";
import { welcomeText } from "@/lib/meetings/welcome";
import { svgDataUri } from "@/lib/brand/svgData";

type Info = {
  team: string | null;
  team_page?: unknown;
  profile: { slug: string; name: string; headline: string | null; photo_url: string | null; handle: string | null; page?: unknown } | null;
};
type Draft = { handle: string; team: string; name: string; headline: string; photo_url: string; slug: string; hidden: Record<string, boolean>; mineLook: PageLook; teamLook: PageLook };
type Which = "mine" | "team";
type BrandRow = { id: string; name: string | null; source_url: string | null; logo_url: string | null; logo_svg: string | null; tokens: Record<string, unknown> | null; studio_css?: string | null };
type PreviewStep = "page" | "meeting" | "details" | "done" | "move";

/** A brand's logo as a picture address: its https logo, or its SVG drawn as a picture (no scripts run in one). */
const logoOf = (k: Pick<BrandRow, "logo_url" | "logo_svg">): string | null =>
  k.logo_url && /^https:\/\//.test(k.logo_url) ? k.logo_url : k.logo_svg && /^\s*<svg[\s>]/i.test(k.logo_svg) ? svgDataUri(k.logo_svg) : null;
type SectionKey = "link" | "profile" | "shown" | "welcome" | "styling";

const isMine = (t: TypeRow, me: string) => t.owner_user_id === me || (!t.owner_user_id && (t.kind === "one" || t.kind === "group") && t.hosts[0]?.user_id === me);
const isTeam = (t: TypeRow) => !t.owner_user_id && t.kind !== "one" && t.kind !== "group";

function draftOf(info: Info, types: TypeRow[], email: string): Draft {
  const p = info.profile;
  const name =
    p?.name ??
    email
      .replace(/@.*/, "")
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    handle: p?.handle ?? cleanHandle(name).replace(/^-+|-+$/g, ""),
    team: info.team ?? "",
    name,
    headline: p?.headline ?? "",
    photo_url: p?.photo_url ?? "",
    slug: p?.slug ?? (cleanHandle(name).replace(/^-+|-+$/g, "") || "me"),
    hidden: Object.fromEntries(types.map((t) => [t.id, t.secret])),
    mineLook: cleanLook(p?.page),
    teamLook: cleanLook(info.team_page),
  };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function BookingPage(props: ViewProps) {
  const { sb, session, ws, role } = props;
  const me = session.user.id;
  const owner = role === "owner";
  const people = usePeople(sb, ws.id);
  // The page's settings, the plan and every imported brand with its stylesheet (112); the types come from the shared
  // list (active ones, by name). The brand's look is on paid plans (src/lib/meetings/brandPage.ts).
  const page = useQuery(`booking_page:${ws.id}`, async () => {
    const cols = "id, name, source_url, logo_url, logo_svg, tokens";
    const [info, w, kits, bill] = await Promise.all([
      meetingsApi<Info>(session, ws.id, "booking", { action: "load" }),
      sb.from("workspaces").select("brand_kit_id").eq("id", ws.id).maybeSingle(),
      sb.from("brand_kits").select(`${cols}, studio_css`).eq("workspace_id", ws.id).order("created_at"),
      sb.from("workspace_billing").select("plan").eq("workspace_id", ws.id).maybeSingle(),
    ]);
    // Before 112 there's no studio_css: the brands without their stylesheets.
    const list = (kits.error ? ((await sb.from("brand_kits").select(cols).eq("workspace_id", ws.id).order("created_at")).data ?? []) : (kits.data ?? [])) as BrandRow[];
    return { info, brands: list, home: (w.data as { brand_kit_id?: string | null } | null)?.brand_kit_id ?? null, paid: brandPlan((bill.data as { plan?: string } | null)?.plan) };
  });
  // A look read in this visit, per brand, before the list is read again.
  const [readCss, setReadCss] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [step, setStep] = useState<PreviewStep>("page");
  const [now] = useState(() => Date.now());
  const allTypes = useMeetingTypes(sb, ws.id);
  const activeTypes = useMemo(() => (allTypes.data ? allTypes.data.filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name)) : null), [allTypes.data]);
  const data = useMemo(() => ({ data: page.data && activeTypes ? { ...page.data, types: activeTypes } : null, error: page.error || allTypes.error }), [page.data, page.error, activeTypes, allTypes.error]);
  const email = session.user.email ?? "";
  const start = useMemo(() => (data.data ? draftOf(data.data.info, data.data.types, email) : null), [data.data, email]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [was, setWas] = useState<Draft | null>(null);
  // Fresh data starts the draft over, unless you have changes not saved yet (a read in the background keeps them).
  if (start !== was) {
    setWas(start);
    if (!draft || !was || JSON.stringify(draft) === JSON.stringify(was)) setDraft(start);
  }
  const [which, setWhich] = useState<Which>("mine");
  const [open, setOpen] = useState<SectionKey | null>(null);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const origin = typeof window === "undefined" ? "" : bookingOrigin(window.location);
  const host = origin.replace(/^https?:\/\//, "");
  const dirty = !!draft && !!start && (JSON.stringify(draft) !== JSON.stringify(start) || !data.data?.info.profile?.handle);
  const mineCheck = useHandleCheck(session, ws.id, draft?.handle ?? "", data.data?.info.profile?.handle ?? null, false);
  const teamCheck = useHandleCheck(session, ws.id, draft?.team ?? "", data.data?.info.team ?? null, true);
  const check = which === "mine" ? mineCheck : teamCheck;
  const blocked = !!mineCheck.problem || mineCheck.free === false || (owner && draft?.team !== (data.data?.info.team ?? "") && (!!teamCheck.problem || teamCheck.free === false));

  useEffect(() => {
    setLeaveGuard(dirty ? () => askConfirm("Leave without saving?", { ok: "Leave", danger: true }) : null);
    return () => setLeaveGuard(null);
  }, [dirty]);

  if (!data.data || !draft || !start)
    return (
      <Page title="Booking page">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { info, types, brands, home, paid } = data.data;
  // The page's brand: the one it picked, else the workspace's, else the oldest with a look (workspaceKit's order).
  const withLook = brands.filter((b) => b.tokens && Object.keys(b.tokens).length);
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const look = which === "mine" ? draft.mineLook : draft.teamLook;
  const kit = brands.find((b) => b.id === look.brand) ?? brands.find((b) => b.id === home) ?? withLook[0] ?? null;
  const kitCss = kit ? (readCss[kit.id] ?? kit.studio_css ?? "") : "";
  const setLook = (patch: Partial<PageLook>) => set(which === "mine" ? { mineLook: { ...draft.mineLook, ...patch } } : { teamLook: { ...draft.teamLook, ...patch } });
  const list = ordered(
    types.filter((t) => (which === "mine" ? isMine(t, me) : isTeam(t))),
    look.order,
  );
  const visible = list.filter((t) => !draft.hidden[t.id]);
  const handle = which === "mine" ? draft.handle : draft.team;
  const savedHandle = which === "mine" ? (info.profile?.handle ?? null) : info.team;
  const pageUrl = handle ? bookingUrl(origin, handle) : "";
  const canEdit = which === "mine" || owner;
  const toggle = (k: SectionKey) => setOpen((o) => (o === k ? null : k));

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const profileChanged = ["handle", "name", "headline", "photo_url", "slug"].some((k) => draft[k as keyof Draft] !== start[k as keyof Draft]) || !info.profile?.handle;
      // The addresses first (a look needs the page to exist), then the looks and the types together.
      if (profileChanged)
        await meetingsApi(session, ws.id, "booking", { action: "save", handle: draft.handle, profile: { slug: draft.slug, name: draft.name, headline: draft.headline, photo_url: draft.photo_url } });
      if (owner && draft.team && draft.team !== (info.team ?? "")) await meetingsApi(session, ws.id, "booking", { action: "team", handle: draft.team });
      const hidden = types.filter((t) => !!draft.hidden[t.id] !== t.secret);
      await Promise.all([
        JSON.stringify(draft.mineLook) !== JSON.stringify(start.mineLook) ? meetingsApi(session, ws.id, "booking", { action: "look", look: draft.mineLook }) : null,
        owner && JSON.stringify(draft.teamLook) !== JSON.stringify(start.teamLook) ? meetingsApi(session, ws.id, "booking", { action: "look", look: draft.teamLook, team: true }) : null,
        ...hidden.map((t) => {
          const { name, slug, kind, hosts, settings, active, locked, owner_user_id } = t;
          return meetingsApi(session, ws.id, "types", { action: "save", id: t.id, type: { name, slug, kind, hosts, settings, secret: !!draft.hidden[t.id], active, locked, owner_user_id } });
        }),
      ]);
      if (hidden.length) allTypes.set((rows) => rows.map((t) => (hidden.some((h) => h.id === t.id) ? { ...t, secret: !!draft.hidden[t.id] } : t)));
      page.reload();
      if (profileChanged) invalidate("people");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const profiles: GuestProfile[] = (people.data?.list ?? []).map((p) => (p.id === me ? { user_id: p.id, slug: draft.slug, name: draft.name, headline: draft.headline, photo_url: draft.photo_url || null } : { user_id: p.id, slug: p.slug ?? "", name: p.name, headline: p.headline, photo_url: p.photo }));
  // On Free the page is Claritia's look with the badge, whatever was saved; paid plans get the brand's own stylesheet.
  const shown = paid ? look : { ...look, look: "claritia" as const, badge: true };
  const shell = lookTokens({ ...shown, accent: "emerald", buttons: undefined }, kit?.tokens ?? null);
  const brandCss = paid && kit && usesKit(shown, true) ? kitCss : "";
  const sheet = brandCss ? bookBrandCss(brandCss) : null;
  const brand = sheet?.css ? sheet : undefined;
  const readLook = async () => {
    if (!kit) return;
    setReading(true);
    setError("");
    try {
      const res = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ workspaceId: ws.id, mode: "look", kitId: kit.id }) });
      let got = "";
      await readLines<{ css?: string; error?: string }>(res, (l) => {
        if (l.error) throw new Error(l.error);
        if (l.css) got = l.css;
      });
      if (got) setReadCss((m) => ({ ...m, [kit.id]: got }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setReading(false);
    }
  };
  const upgrade = async () => {
    setError("");
    try {
      const { url } = await postJson<{ url: string }>(session, "/api/billing/checkout", { workspaceId: ws.id, plan: "starter" });
      window.location.assign(url);
    } catch (e) {
      setError(errorText(e));
    }
  };
  const cards = visible.map((t) => ({ href: handle ? bookingUrl(origin, handle, t.slug) : "#", type: toGuestType(t, profiles, { pay: true }) }));
  const pageView =
    which === "mine" ? (
      <BookShell tokens={shell.tokens} vars={shell.vars} badge={shown.badge} brand={brand} narrow>
        <PageHead title={`Book time with ${draft.name.split(/\s+/)[0] || draft.name || "me"}`} line={draft.headline || draft.name} hosts={[{ name: draft.name || email, photo: draft.photo_url || null }]} big welcome={look.welcome} />
        <TypeCards types={cards} />
      </BookShell>
    ) : (
      <BookShell tokens={shell.tokens} vars={shell.vars} badge={shown.badge} brand={brand} narrow>
        <PageHead title={ws.name} logo={usesKit(shown, !!kit) && kit ? logoOf(kit) : null} welcome={look.welcome} />
        <TypeCards types={cards} />
      </BookShell>
    );
  // The other steps, drawn by the real calendar with sample times: a meeting, the details, the thank-you, a reschedule.
  const sampleType = visible[0] ?? list[0] ?? null;
  const gt = sampleType ? toGuestType(sampleType, profiles, { pay: true }) : null;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const len = gt?.lengths[0] ?? 30;
  const slots = gt ? sampleSlots(len, zone, now) : [];
  const first = slots[0]?.start;
  const preview =
    step === "page" || !gt || first === undefined ? (
      pageView
    ) : (
      // A reschedule opens on the guest's manage page (BookShell's narrow frame).
      <BookShell tokens={shell.tokens} vars={shell.vars} badge={shown.badge} brand={brand} narrow={step === "move"}>
        <Calendar
          key={`${step}-${which}`}
          type={gt}
          load={async (l) => sampleSlots(l, zone, now)}
          initialSlots={slots}
          logo={usesKit(shown, !!kit) && kit ? logoOf(kit) : null}
          preview={step === "details" ? { step: "details", time: first } : step === "done" ? { step: "done", time: first, done: { ok: true, start: first, end: first + len * 60_000, manage: "#", hosts: gt.hosts, confirmation: { kind: "message" } } } : {}}
          move={step === "move" ? async () => ({ ok: true }) : undefined}
          banner={
            step === "move" ? (
              <div className="cb-when" style={{ marginBottom: 16 }}>
                <span className="cb-small cb-muted">Now</span>
                <span style={{ textDecoration: "line-through", textDecorationColor: "var(--clr-muted)" }}>{new Date(slots[Math.min(3, slots.length - 1)]!.start).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            ) : undefined
          }
        />
      </BookShell>
    );

  return (
    <Page title="Booking page" flush>
      <div className="grid h-full min-h-0 md:grid-cols-[minmax(0,1fr)_400px]">
        <div className="hidden min-h-0 min-w-0 flex-col bg-paper md:flex">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line bg-card pr-2 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{pageUrl.replace(/^https?:\/\//, "")}</code>
            {savedHandle && handle === savedHandle ? (
              <>
                <CopyButton text={pageUrl} size={14} />
                <a href={pageUrl} target="_blank" rel="noreferrer" aria-label="Open the page" title="Open the page" className="press inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
                  <ExternalLink size={14} />
                </a>
              </>
            ) : null}
            <span className="ml-1">
              <Segmented<PreviewStep>
                size="sm"
                label="Preview step"
                value={gt ? step : "page"}
                options={[
                  { value: "page", label: "Page" },
                  { value: "meeting", label: "Meeting", disabled: !gt },
                  { value: "details", label: "Details", disabled: !gt },
                  { value: "done", label: "Booked", disabled: !gt },
                  { value: "move", label: "Reschedule", disabled: !gt },
                ]}
                onChange={setStep}
              />
            </span>
            <span className="ml-1">
              <IconSeg
                label="Preview size"
                value={device}
                options={[
                  { value: "desktop", label: "Desktop", icon: <Monitor /> },
                  { value: "phone", label: "Phone", icon: <Phone /> },
                ]}
                onChange={setDevice}
              />
            </span>
          </div>
          <Stage phone={device === "phone"}>{preview}</Stage>
        </div>

        <aside aria-label="Booking page settings" className="flex min-h-0 flex-col border-line md:border-l">
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
            <Segmented<Which>
              size="sm"
              label="Page"
              value={which}
              options={[
                { value: "mine", label: "You" },
                { value: "team", label: "Team" },
              ]}
              onChange={(w) => (setWhich(w), setOpen(null))}
            />
            <span className="flex-1" />
            {savedHandle ? (
              <a href={bookingUrl(origin, savedHandle)} target="_blank" rel="noreferrer" className="press inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12.5px] font-medium text-ink hover:bg-hover md:hidden">
                Preview
                <ExternalLink size={12} />
              </a>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <div className="border-b border-line px-4 py-3">
                <ErrorNote message={error} />
              </div>
            ) : null}
            <PanelSection icon={<LinkIcon />} title="Link" summary={`${host}/booking/${handle || "…"}`} open={open === "link"} onToggle={() => toggle("link")}>
              <Labeled label={which === "mine" ? "Your link" : "Team link"}>
                <HandleField host={host} value={handle} disabled={!canEdit} check={check} saved={savedHandle} onChange={(v) => set(which === "mine" ? { handle: v } : { team: v })} />
              </Labeled>
            </PanelSection>
            {which === "mine" ? (
              <PanelSection icon={<User />} title="Profile" summary={[draft.name, draft.headline].filter(Boolean).join(", ") || "No name"} open={open === "profile"} onToggle={() => toggle("profile")}>
                <Photo session={session} ws={ws.id} name={draft.name || email} value={draft.photo_url} onChange={(photo_url) => set({ photo_url })} onError={setError} />
                <Labeled label="Name">
                  <Input value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className="h-[34px] text-[13px]" />
                </Labeled>
                <Labeled label="Headline">
                  <Input value={draft.headline} maxLength={200} placeholder="Account executive" onChange={(e) => set({ headline: e.target.value })} className="h-[34px] text-[13px]" />
                </Labeled>
              </PanelSection>
            ) : null}
            <PanelSection icon={<Grid />} title="Meetings shown" summary={list.length ? `${visible.length} of ${list.length} shown` : "None yet"} open={open === "shown"} onToggle={() => toggle("shown")}>
              {list.length ? (
                <ul className="flex flex-col gap-3">
                  {list.map((t) => (
                    <li
                      key={t.id}
                      draggable={canEdit}
                      onDragStart={(e) => (e.dataTransfer.setData("text/plain", t.id), (e.dataTransfer.effectAllowed = "move"))}
                      onDragOver={(e) => canEdit && e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = e.dataTransfer.getData("text/plain");
                        if (!from || from === t.id) return;
                        const ids = list.map((x) => x.id).filter((id) => id !== from);
                        ids.splice(ids.indexOf(t.id), 0, from);
                        setLook({ order: ids });
                      }}
                      className="flex items-center gap-2.5"
                    >
                      {canEdit ? (
                        <span className="flex size-5 shrink-0 cursor-grab items-center justify-center text-faint" aria-hidden="true">
                          <Grip size={13} />
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-medium text-ink">{t.name}</span>
                        <span className="truncate font-mono text-[11px] text-muted">/{t.slug}</span>
                      </span>
                      <Toggle label={`Show ${t.name}`} on={!draft.hidden[t.id]} disabled={!canEdit} onChange={(v) => set({ hidden: { ...draft.hidden, [t.id]: !v } })} />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="flex flex-col items-start gap-2.5">
                  <span className="text-[12.5px] text-muted">No meeting types yet</span>
                  <Button size="sm" onClick={() => props.navigate("scheduling", "types/new")}>
                    <Plus size={14} />
                    Create meeting type
                  </Button>
                </span>
              )}
            </PanelSection>
            <PanelSection icon={<Message />} title="Welcome line" summary={welcomeText(look.welcome) || "None"} open={open === "welcome"} onToggle={() => toggle("welcome")}>
              <WelcomeEditor value={look.welcome} disabled={!canEdit} placeholder="Pick a time that works for you." onChange={(welcome) => setLook({ welcome })} />
            </PanelSection>
            <PanelSection
              icon={<Palette />}
              title="Styling"
              summary={
                <>
                  {usesKit(shown, !!kit) && kit && logoOf(kit) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoOf(kit)!} alt="" className="size-3.5 shrink-0 rounded-[3px] object-contain" />
                  ) : null}
                  <span className="truncate">{lookWords(shown, !!kit, kit ? brandName(kit) : null)}</span>
                </>
              }
              open={open === "styling"}
              onToggle={() => toggle("styling")}
            >
              <Styling
                brands={withLook}
                home={home}
                picked={usesKit(shown, !!kit) ? (kit?.id ?? null) : null}
                design={shown.design ?? "claritia"}
                badge={shown.badge}
                paid={paid}
                needsLook={!!kit?.source_url && !kitCss}
                reading={reading}
                owner={owner}
                disabled={!canEdit}
                onChange={setLook}
                onRead={() => void readLook()}
                onUpgrade={() => void upgrade()}
                onImport={() => props.navigate("settings", "brand")}
              />
            </PanelSection>
          </div>
          <PanelFooter>
            {dirty ? (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(start)}>
                Discard
              </Button>
            ) : (
              <span className="text-[12px] text-muted">Saved</span>
            )}
            <span className="flex-1" />
            <Button size="sm" disabled={!dirty || busy || blocked || !draft.name.trim()} onClick={() => void save()}>
              Save changes
            </Button>
          </PanelFooter>
        </aside>
      </div>
    </Page>
  );
}

/**
 * The page drawn at a scale that fits the stage, so all of it shows without scrolling: Desktop as wide as the stage
 * (smaller only when it's taller than the stage), Phone a 390 px frame. Links open the real page in a new tab.
 */
function Stage({ phone, children }: { phone: boolean; children: React.ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, ch: 0 });
  const measure = useCallback(() => {
    const s = stage.current;
    const p = page.current;
    if (s && p) setBox({ w: s.clientWidth, h: s.clientHeight, ch: p.scrollHeight });
  }, []);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    if (page.current) ro.observe(page.current);
    return () => ro.disconnect();
  }, [measure, phone]);
  const width = phone ? 390 : Math.max(640, box.w - 32);
  const scale = box.w ? Math.min(1, (box.w - 16) / width, (box.h - 32) / Math.max(box.ch, 1)) : 1;
  return (
    <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute top-4 left-1/2 origin-top transition-transform duration-[200ms] ease-out"
        style={{ width, transform: `translateX(-50%) scale(${scale})`, visibility: box.w ? "visible" : "hidden" }}
        onClickCapture={(e) => {
          const a = (e.target as HTMLElement).closest("a");
          if (!a) return;
          e.preventDefault();
          if (a.getAttribute("href") && a.getAttribute("href") !== "#") window.open(a.href, "_blank", "noopener");
        }}
      >
        <div ref={page} className={`cal-preview overflow-hidden rounded-[14px] ${phone ? "border border-line shadow-soft" : ""}`}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The photo as a 64 px circle to click or drop an image on; it's cropped to a square and made small first. */
function Photo({ session, ws, name, value, onChange, onError }: { session: ViewProps["session"]; ws: string; name: string; value: string; onChange: (url: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return onError("Use a PNG, JPEG, GIF or WebP image.");
    setBusy(true);
    onError("");
    try {
      const small = await squareJpeg(file, 256);
      const body = new FormData();
      body.append("workspaceId", ws);
      body.append("file", small, "photo.jpg");
      const res = await fetch("/api/assets", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body });
      const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !out.url) throw new Error(out.error ?? "Try again in a moment.");
      onChange(out.url);
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="Upload a photo"
        title="Upload a photo"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={`press relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[18px] font-semibold text-paper transition-shadow duration-[120ms] ${over ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""} ${busy ? "opacity-60" : ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {value ? <img src={value} alt="" width={64} height={64} decoding="async" className="size-full object-cover" /> : initials(name)}
      </button>
      <span className="flex flex-col items-start gap-1">
        <Button variant="ghost" size="sm" className="h-[30px] !border-line" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={13} />
          {busy ? "Uploading" : "Upload photo"}
        </Button>
        {value ? (
          <button type="button" onClick={() => onChange("")} className="text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
            Remove
          </button>
        ) : null}
      </span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
    </div>
  );
}

/** An image cropped to its middle square and drawn at `size` px, as a JPEG (a photo stays well under 100 KB). */
async function squareJpeg(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't read the image.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser can't read the image."))), "image/jpeg", 0.85));
}

/**
 * Styling: Claritia's look, your brand (the workspace's own, pinned first), and the other brands imported in Form
 * Studio under Other brands, closed until clicked and searchable past 6. On Free: Claritia, your brand locked, and one
 * line with Upgrade. The brand sets its own colors and corners, so there's nothing else to pick.
 */
function Styling(p: { brands: BrandRow[]; home: string | null; picked: string | null; design: Design["id"]; badge: boolean; paid: boolean; needsLook: boolean; reading: boolean; owner: boolean; disabled: boolean; onChange: (p: Partial<PageLook>) => void; onRead: () => void; onUpgrade: () => void; onImport: () => void }) {
  const { brands, picked, paid, disabled, onChange } = p;
  const yours = brands.find((b) => b.id === p.home) ?? brands[0] ?? null;
  const others = brands.filter((b) => b.id !== yours?.id);
  const [more, setMore] = useState(() => !!picked && others.some((b) => b.id === picked));
  const [q, setQ] = useState("");
  const shownOthers = q.trim() ? others.filter((b) => brandName(b).toLowerCase().includes(q.trim().toLowerCase())) : others;
  const tile = (on: boolean) => `press relative flex min-h-[56px] items-center gap-2.5 rounded-[10px] border p-2.5 text-left disabled:cursor-default ${on ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line hover:border-line-strong"}`;
  const brandTile = (b: BrandRow, eyebrow?: string) => {
    const logo = logoOf(b);
    const name = brandName(b);
    return (
      <button key={b.id} type="button" disabled={disabled || !paid} aria-pressed={picked === b.id} onClick={() => onChange({ look: "brand", brand: b.id })} className={`${tile(picked === b.id)} ${!paid ? "opacity-50" : ""}`}>
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="max-h-6 max-w-6 object-contain" /> : <span className="text-[12px] font-semibold text-ink">{name.slice(0, 1).toUpperCase()}</span>}
        </span>
        <span className="flex min-w-0 flex-col">
          {eyebrow ? <span className="text-[11px] text-muted">{eyebrow}</span> : null}
          <span className="truncate text-[13px] font-medium text-ink">{name}</span>
        </span>
      </button>
    );
  };
  return (
    <>
      <span className="text-[12px] font-medium text-muted">Design</span>
      <Designs picked={picked === null ? p.design : null} disabled={disabled} onPick={(id) => onChange({ look: "claritia", design: id === "claritia" ? undefined : id })} />
      <span className="mt-1 text-[12px] font-medium text-muted">Brand</span>
      {yours ? (
        <div className="grid grid-cols-2 gap-2">{brandTile(yours, "Your brand")}</div>
      ) : paid ? (
        <span className="text-[12.5px] text-muted">No brands yet</span>
      ) : null}
      {!paid ? (
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[12.5px] text-body">Your brands on booking pages</span>
          <Badge tone="violet">Paid plans</Badge>
          {p.owner ? (
            <Button size="sm" onClick={p.onUpgrade}>
              Upgrade
            </Button>
          ) : null}
        </span>
      ) : (
        <>
          {others.length ? (
            <div className="flex flex-col gap-2">
              <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex items-center gap-1.5 self-start rounded-full px-1 text-[12.5px] font-medium text-body hover:text-ink">
                <ChevronDown size={12} className={`transition-transform duration-[200ms] ${more ? "rotate-180" : ""}`} />
                Other brands
                <span className="text-faint tabular-nums">{others.length}</span>
              </button>
              {more ? (
                <>
                  {others.length > 6 ? <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brands" aria-label="Search brands" className="h-8 text-[12.5px]" /> : null}
                  <div className="grid grid-cols-2 gap-2">{shownOthers.map((b) => brandTile(b))}</div>
                  {!shownOthers.length ? <span className="text-[12.5px] text-muted">No matches</span> : null}
                </>
              ) : null}
            </div>
          ) : null}
          <span className="flex flex-wrap items-center gap-2">
            {picked && p.needsLook ? (
              <Button variant="ghost" size="sm" className="h-[30px] !border-line" disabled={disabled || p.reading} onClick={p.onRead}>
                <AiMark size={13} working={p.reading} />
                {p.reading ? "Reading the look" : "Read the look"}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="h-[30px] !border-line" disabled={disabled} onClick={p.onImport}>
              <Plus size={13} />
              Import a brand
            </Button>
          </span>
        </>
      )}
      <span className="flex items-center justify-between gap-2 text-[13px] text-ink">
        Show Built by Claritia
        <Toggle label="Show Built by Claritia" on={p.badge} disabled={disabled || !paid} onChange={(badge) => onChange({ badge })} />
      </span>
    </>
  );
}

/** The design gallery: a small live preview of each design's page, card, type, open days and button. */
function Designs({ picked, disabled, onPick }: { picked: Design["id"] | null; disabled: boolean; onPick: (id: Design["id"]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DESIGN_FONTS.map((href) => (
        <link key={href} rel="stylesheet" href={href} precedence="default" />
      ))}
      {DESIGN_LIST.map((d) => {
        const on = picked === d.id;
        const w = d.swatch;
        return (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={d.name}
            onClick={() => onPick(d.id)}
            className={`press group flex min-w-0 flex-col gap-1.5 rounded-[12px] p-1.5 text-left disabled:cursor-default ${on ? "shadow-[0_0_0_2px_var(--color-ink)]" : "shadow-outline hover:shadow-input-hover"}`}
          >
            <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[8px]" style={{ background: w.page, backgroundImage: w.pattern, backgroundSize: w.patternSize }} aria-hidden="true">
              <span
                className="flex w-[72%] flex-col gap-[5px] px-2.5 py-2 transition-transform duration-[200ms] ease-out group-hover:-translate-y-0.5"
                style={{ background: w.card, color: w.text, borderRadius: Math.min(10, w.radius * 0.6 + 2), border: w.border, boxShadow: w.shadow ?? "0 6px 14px -8px rgba(0,0,0,0.35)" }}
              >
                <span className="text-[17px] leading-none" style={{ fontFamily: w.font, fontWeight: w.weight, letterSpacing: "-0.02em" }}>
                  Aa
                </span>
                <span className="flex gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="size-[7px] rounded-full" style={{ background: i === 2 ? w.accent : `color-mix(in srgb, ${w.text} 14%, ${w.card})` }} />
                  ))}
                </span>
                <span className="h-[9px] w-[60%]" style={{ background: w.button, borderRadius: Math.min(w.buttonRadius, 5) }} />
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1.5 px-0.5">
              <span className="min-w-0 flex-1 text-[12.5px] font-medium text-ink">{d.name}</span>
              {on ? <Check size={12} className="shrink-0 text-ink" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type HandleCheck = { problem: string | null; free: boolean | null };

/** Whether the typed handle is free, checked 400 ms after typing stops. */
function useHandleCheck(session: ViewProps["session"], ws: string, handle: string, saved: string | null, team: boolean): HandleCheck {
  const local = handle ? handleProblem(handle) : null;
  const [seen, setSeen] = useState<{ handle: string; free: boolean; problem: string | null } | null>(null);
  useEffect(() => {
    if (!handle || local || handle === saved) return;
    let live = true;
    const t = setTimeout(() => {
      void meetingsApi<{ handle: string; free: boolean; problem: string | null }>(session, ws, "booking", { action: "check", handle, team })
        .then((r) => live && setSeen(r))
        .catch(() => undefined);
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [session, ws, handle, saved, team, local]);
  if (!handle) return { problem: null, free: null };
  if (local) return { problem: local, free: false };
  if (handle === saved) return { problem: null, free: true };
  if (seen?.handle !== handle) return { problem: null, free: null };
  return { problem: seen.problem, free: seen.free };
}

function HandleField({ host, value, onChange, check, saved, disabled = false }: { host: string; value: string; onChange: (v: string) => void; check: HandleCheck; saved: string | null; disabled?: boolean }) {
  const bad = value !== saved && (!!check.problem || check.free === false);
  const taken = bad && !handleProblem(value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={`flex h-9 min-w-0 items-center rounded-sm border bg-card pr-1 pl-2.5 font-mono text-[12px] ${bad ? "border-rose" : "border-line-strong"}`}>
        <span className="max-w-[60%] shrink-0 truncate text-faint">{host}/booking/</span>
        <input aria-label="Handle" value={value} maxLength={40} disabled={disabled} onChange={(e) => onChange(cleanHandle(e.target.value))} className="h-full min-w-10 flex-1 bg-transparent text-ink outline-none disabled:text-muted" />
        {taken ? (
          <span className="px-1.5 font-sans text-[12px] text-rose">Taken</span>
        ) : check.free ? (
          <span className="px-1.5 text-signal-text" aria-label="Free">
            <Check size={14} />
          </span>
        ) : null}
      </span>
      {bad && !taken && check.problem ? <span className="text-[12px] text-rose">{check.problem}</span> : null}
    </div>
  );
}
