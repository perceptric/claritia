"use client";

// Calendar › Booking page (docs/scheduling-plan.md 11.3): the page people land on at /booking/<handle>, drawn on the
// left as it is (the real page's parts, with what you're typing) and scaled to fit the height, and the few things that
// change it in a 400 px panel on the right: You | Team, then closed sections (Link, Profile, Meetings shown, Welcome
// line, Styling) and a pinned footer, Saved or Discard and Save changes.
//
// The welcome line, the accent, the button shape and Show Booked with Claritia have no field to be saved in yet, so
// they show and stay off until the booking profile can hold them.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toGuestType, type Profile as GuestProfile } from "@/lib/meetings/guest";
import { bookingOrigin, bookingUrl, cleanHandle, handleProblem } from "@/lib/meetings/handles";
import { Check, ExternalLink, Grid, Link as LinkIcon, Message, Monitor, Palette, Phone, Upload, User } from "../../Icons";
import { BookShell } from "@/components/book/BookShell";
import { PageHead, TypeCards } from "@/components/book/TypeCards";
import { askConfirm } from "../Dialogs";
import { Button, ErrorNote, errorText, Input, Loading, must, Page, Segmented, setLeaveGuard, Toggle, useLoad, type ViewProps } from "../ui";
import { CopyButton, meetingsApi, usePeople } from "../meetings/parts";
import type { TypeRow } from "../meetings/TypesList";
import { IconSeg, Labeled, PanelFooter, PanelSection } from "./panel";

type Info = {
  team: string | null;
  profile: { slug: string; name: string; headline: string | null; photo_url: string | null; handle: string | null } | null;
};
type Draft = { handle: string; team: string; name: string; headline: string; photo_url: string; slug: string; hidden: Record<string, boolean> };
type Which = "mine" | "team";
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
  const data = useLoad(async () => {
    const [info, types, kit] = await Promise.all([
      meetingsApi<Info>(session, ws.id, "booking", { action: "load" }),
      sb.from("meeting_types").select("*").eq("workspace_id", ws.id).eq("active", true).order("name"),
      sb.from("brand_kits").select("tokens, logo_url").eq("workspace_id", ws.id).order("created_at").limit(1),
    ]);
    const k = ((kit.data ?? []) as { tokens: Record<string, unknown> | null; logo_url: string | null }[])[0] ?? null;
    return { info, types: (must(types) ?? []) as TypeRow[], kit: k && k.tokens && Object.keys(k.tokens).length ? k : null };
  }, ws.id);
  const email = session.user.email ?? "";
  const start = useMemo(() => (data.data ? draftOf(data.data.info, data.data.types, email) : null), [data.data, email]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [was, setWas] = useState<Draft | null>(null);
  if (start !== was) {
    setWas(start);
    setDraft(start);
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
  const { info, types, kit } = data.data;
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const list = types.filter((t) => (which === "mine" ? isMine(t, me) : isTeam(t)));
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
      if (profileChanged)
        await meetingsApi(session, ws.id, "booking", { action: "save", handle: draft.handle, profile: { slug: draft.slug, name: draft.name, headline: draft.headline, photo_url: draft.photo_url } });
      if (owner && draft.team && draft.team !== (info.team ?? "")) await meetingsApi(session, ws.id, "booking", { action: "team", handle: draft.team });
      for (const t of types) {
        if (!!draft.hidden[t.id] === t.secret) continue;
        const { name, slug, kind, hosts, settings, active, locked, owner_user_id } = t;
        await meetingsApi(session, ws.id, "types", { action: "save", id: t.id, type: { name, slug, kind, hosts, settings, secret: !!draft.hidden[t.id], active, locked, owner_user_id } });
      }
      data.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const profiles: GuestProfile[] = (people.data?.list ?? []).map((p) => (p.id === me ? { user_id: p.id, slug: draft.slug, name: draft.name, headline: draft.headline, photo_url: draft.photo_url || null } : { user_id: p.id, slug: p.slug ?? "", name: p.name, headline: p.headline, photo_url: p.photo }));
  const cards = visible.map((t) => ({ href: handle ? bookingUrl(origin, handle, t.slug) : "#", type: toGuestType(t, profiles, { pay: true }) }));
  const preview =
    which === "mine" ? (
      <BookShell tokens={kit?.tokens ?? null} narrow>
        <PageHead title={`Book time with ${draft.name.split(/\s+/)[0] || draft.name || "me"}`} line={draft.headline || draft.name} hosts={[{ name: draft.name || email, photo: draft.photo_url || null }]} big />
        <TypeCards types={cards} />
      </BookShell>
    ) : (
      <BookShell tokens={kit?.tokens ?? null} narrow>
        <PageHead title={ws.name} logo={kit?.logo_url ?? null} />
        <TypeCards types={cards} />
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
                    <li key={t.id} className="flex items-center gap-2.5">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-medium text-ink">{t.name}</span>
                        <span className="truncate font-mono text-[11px] text-muted">/{t.slug}</span>
                      </span>
                      <Toggle label={`Show ${t.name}`} on={!draft.hidden[t.id]} disabled={!canEdit} onChange={(v) => set({ hidden: { ...draft.hidden, [t.id]: !v } })} />
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-[12.5px] text-muted">No meeting types yet</span>
              )}
            </PanelSection>
            <PanelSection icon={<Message />} title="Welcome line" summary="None" open={open === "welcome"} onToggle={() => toggle("welcome")}>
              <Input disabled maxLength={140} placeholder="Pick a time that works for you." className="h-[34px] text-[13px] disabled:opacity-60" />
            </PanelSection>
            <PanelSection icon={<Palette />} title="Styling" summary={kit ? "Your brand kit" : "Claritia, round buttons"} open={open === "styling"} onToggle={() => toggle("styling")}>
              <Styling kit={!!kit} />
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
        {value ? <img src={value} alt="" className="size-full object-cover" /> : initials(name)}
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

/** Claritia's look or the brand kit, the accent, the buttons and the Booked with Claritia line. */
function Styling({ kit }: { kit: boolean }) {
  const swatches = ["bg-ink", "bg-signal", "bg-sky", "bg-lilac", "bg-rose", "bg-butter"];
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "claritia", label: "Claritia", tone: "bg-ink", on: !kit },
          { key: "brand", label: "Your brand kit", tone: "bg-sky", on: kit },
        ].map((c) => (
          <button key={c.key} type="button" disabled aria-pressed={c.on} className={`flex flex-col gap-2 rounded-[10px] border p-2.5 text-left disabled:cursor-default ${c.on ? "border-ink shadow-[0_0_0_1px_var(--color-ink)]" : "border-line opacity-60"}`}>
            <span className="flex h-[54px] flex-col justify-center gap-[5px] rounded-sm border border-line bg-paper px-2.5">
              <i className="block h-[5px] w-3/5 rounded-full bg-line-strong" />
              <i className="block h-[5px] w-2/5 rounded-full bg-line-strong" />
              <em className={`block h-3 w-11 rounded-full ${c.tone}`} />
            </span>
            <span className="text-[13px] font-medium text-ink">{c.label}</span>
          </button>
        ))}
      </div>
      <Labeled label="Accent">
        <div className="flex flex-wrap gap-2">
          {swatches.map((s, i) => (
            <button key={s} type="button" disabled aria-label={`Accent ${i + 1}`} aria-pressed={i === 0} className={`size-7 rounded-full border-2 border-card disabled:cursor-default ${s} ${i === 0 ? "shadow-[0_0_0_2px_var(--color-ink)]" : "opacity-50 shadow-[0_0_0_1px_var(--color-line)]"}`} />
          ))}
        </div>
      </Labeled>
      <Labeled label="Buttons">
        <Segmented<"round" | "soft">
          size="sm"
          label="Buttons"
          value="round"
          options={[
            { value: "round", label: "Round", disabled: true },
            { value: "soft", label: "Soft corners", disabled: true },
          ]}
          onChange={() => undefined}
        />
      </Labeled>
      <span className="flex items-center justify-between gap-2 text-[13px] text-ink">
        Show Booked with Claritia
        <Toggle label="Show Booked with Claritia" on disabled onChange={() => undefined} />
      </span>
    </>
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
      <span className={`flex h-9 min-w-0 items-center rounded-sm border bg-card pr-1 pl-2.5 font-mono text-[12px] focus-within:border-ink ${bad ? "border-rose" : "border-line-strong"}`}>
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
