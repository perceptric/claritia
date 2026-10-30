"use client";

// Calendar › Booking page (docs/scheduling-plan.md Part 4), after Calendly's own page: your page and the team page at
// /booking/<handle>, each with its handle, the types it shows and a live preview of the real page beside it.

import { useEffect, useMemo, useState } from "react";
import { bookingOrigin, bookingUrl, cleanHandle, handleProblem } from "@/lib/meetings/handles";
import { ExternalLink } from "../../Icons";
import { ConnectCalendar } from "./ConnectCalendar";
import { Button, CardHead, ErrorNote, errorText, Input, Loading, must, Page, Panel, Segmented, Toggle, useLoad, type ViewProps } from "../ui";
import { CopyButton, meetingsApi } from "../meetings/parts";
import type { TypeRow } from "../meetings/TypesList";

type Info = {
  team: string | null;
  profile: {
    slug: string;
    name: string;
    headline: string | null;
    photo_url: string | null;
    handle: string | null;
  } | null;
};
type Draft = {
  handle: string;
  name: string;
  headline: string;
  photo_url: string;
  slug: string;
};
type Which = "mine" | "team";

const isMine = (t: TypeRow, me: string) => t.owner_user_id === me || (!t.owner_user_id && (t.kind === "one" || t.kind === "group") && t.hosts[0]?.user_id === me);
const isTeam = (t: TypeRow) => !t.owner_user_id && t.kind !== "one" && t.kind !== "group";

function draftOf(info: Info, email: string): Draft {
  const p = info.profile;
  const name =
    p?.name ??
    email
      .replace(/@.*/, "")
      .replace(/[._-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const handle = p?.handle ?? cleanHandle(name).replace(/^-+|-+$/g, "");
  return {
    handle,
    name,
    headline: p?.headline ?? "",
    photo_url: p?.photo_url ?? "",
    slug: p?.slug ?? (cleanHandle(name).replace(/^-+|-+$/g, "") || "me"),
  };
}

export function BookingPage(props: ViewProps) {
  const { sb, session, ws, role } = props;
  const me = session.user.id;
  const owner = role === "owner";
  const data = useLoad(async () => {
    const [info, types] = await Promise.all([
      meetingsApi<Info>(session, ws.id, "booking", { action: "load" }),
      sb.from("meeting_types").select("*").eq("workspace_id", ws.id).eq("active", true).order("name"),
    ]);
    return { info, types: (must(types) ?? []) as TypeRow[] };
  }, ws.id);
  const [which, setWhich] = useState<Which>("mine");
  const [error, setError] = useState("");
  const [stamp, setStamp] = useState(0);
  const origin = typeof window === "undefined" ? "" : bookingOrigin(window.location);
  const here = typeof window === "undefined" ? "" : window.location.origin;

  if (!data.data)
    return (
      <Page title="Booking page">
        <ErrorNote message={data.error} />
        {data.error ? null : <Loading />}
      </Page>
    );
  const { info, types } = data.data;
  const saved = which === "mine" ? (info.profile?.handle ?? null) : info.team;
  const shown = types.filter((t) => (which === "mine" ? isMine(t, me) : isTeam(t)));
  const canEdit = which === "mine" || owner;

  const toggle = async (t: TypeRow, show: boolean) => {
    setError("");
    try {
      const { name, slug, kind, hosts, settings, active, locked, owner_user_id } = t;
      await meetingsApi(session, ws.id, "types", {
        action: "save",
        id: t.id,
        type: {
          name,
          slug,
          kind,
          hosts,
          settings,
          secret: !show,
          active,
          locked,
          owner_user_id,
        },
      });
      data.reload();
      setStamp((n) => n + 1);
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <Page title="Booking page" flush>
      <div className="h-full overflow-y-auto lg:grid lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:overflow-hidden">
        <div className="flex flex-col gap-4 border-line p-5 md:p-6 lg:min-h-0 lg:overflow-y-auto lg:border-r">
          <div className="self-start">
            <Segmented<Which>
              label="Page"
              value={which}
              options={[
                { value: "mine", label: "Your page" },
                { value: "team", label: "Team page" },
              ]}
              onChange={setWhich}
            />
          </div>
          <ConnectCalendar sb={props.sb} session={props.session} ws={props.ws} />
          <ErrorNote message={error} />
          {which === "mine" ? (
            <MinePanel key={`mine:${info.profile?.handle ?? ""}`} {...props} info={info} origin={origin} onSaved={() => (data.reload(), setStamp((n) => n + 1))} />
          ) : (
            <TeamPanel key={`team:${info.team ?? ""}`} {...props} handle={info.team ?? ""} canEdit={owner} origin={origin} onSaved={() => (data.reload(), setStamp((n) => n + 1))} />
          )}
          <Panel className="overflow-hidden">
            <CardHead label="On the page" count={shown.filter((t) => !t.secret).length} />
            {shown.length ? (
              <ul className="divide-y divide-line">
                {shown.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">{t.name}</span>
                      <span className="truncate font-mono text-[11.5px] text-faint">/{t.slug}</span>
                    </div>
                    {saved ? <CopyButton text={bookingUrl(origin, saved, t.slug)} size={13} /> : null}
                    <Toggle label={`Show ${t.name}`} on={!t.secret} disabled={!canEdit} onChange={(v) => void toggle(t, v)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-[13px] text-muted">No meeting types yet</p>
            )}
          </Panel>
        </div>
        <Preview src={saved ? `${bookingUrl(here, saved)}?v=${stamp}` : null} url={saved ? bookingUrl(origin, saved) : null} />
      </div>
    </Page>
  );
}

/** Your page: handle, name, headline and photo, saved together. */
function MinePanel({ session, ws, info, origin, onSaved }: ViewProps & { info: Info; origin: string; onSaved: () => void }) {
  const email = session.user.email ?? "";
  const start = useMemo(() => draftOf(info, email), [info, email]);
  const [draft, setDraft] = useState<Draft>(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useHandleCheck(session, ws.id, draft.handle, info.profile?.handle ?? null, false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(start) || !info.profile?.handle;
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await meetingsApi(session, ws.id, "booking", {
        action: "save",
        handle: draft.handle,
        profile: {
          slug: draft.slug,
          name: draft.name,
          headline: draft.headline,
          photo_url: draft.photo_url,
        },
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Your page">
        <Button size="sm" disabled={!dirty || busy || !!check.problem} onClick={() => void save()}>
          Save
        </Button>
      </CardHead>
      <div className="flex flex-col gap-3.5 px-4 py-4">
        <ErrorNote message={error} />
        <HandleField origin={origin} value={draft.handle} onChange={(handle) => setDraft({ ...draft, handle })} check={check} saved={info.profile?.handle ?? null} />
        <Row label="Name">
          <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Row>
        <Row label="Headline">
          <Input value={draft.headline} maxLength={200} placeholder="Account executive" onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
        </Row>
        <Row label="Photo">
          <Input value={draft.photo_url} maxLength={1000} placeholder="https://" onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} />
        </Row>
      </div>
    </Panel>
  );
}

/** The team page's handle; owners change it. */
function TeamPanel({
  session,
  ws,
  handle,
  canEdit,
  origin,
  onSaved,
}: ViewProps & {
  handle: string;
  canEdit: boolean;
  origin: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(handle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useHandleCheck(session, ws.id, value, handle, true);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await meetingsApi(session, ws.id, "booking", {
        action: "team",
        handle: value,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Team page">
        {canEdit ? (
          <Button size="sm" disabled={value === handle || busy || !!check.problem} onClick={() => void save()}>
            Save
          </Button>
        ) : null}
      </CardHead>
      <div className="flex flex-col gap-3 px-4 py-4">
        <ErrorNote message={error} />
        <HandleField origin={origin} value={value} onChange={setValue} check={check} saved={handle || null} disabled={!canEdit} />
      </div>
    </Panel>
  );
}

type Check = { problem: string | null; free: boolean | null };

/** Whether the typed handle is free, checked a moment after typing stops. */
function useHandleCheck(session: ViewProps["session"], ws: string, handle: string, saved: string | null, team: boolean): Check {
  const local = handleProblem(handle);
  const [seen, setSeen] = useState<{
    handle: string;
    free: boolean;
    problem: string | null;
  } | null>(null);
  useEffect(() => {
    if (local || handle === saved) return;
    let live = true;
    const t = setTimeout(() => {
      void meetingsApi<{
        handle: string;
        free: boolean;
        problem: string | null;
      }>(session, ws, "booking", { action: "check", handle, team })
        .then((r) => live && setSeen(r))
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [session, ws, handle, saved, team, local]);
  if (local) return { problem: local, free: false };
  if (handle === saved) return { problem: null, free: true };
  if (seen?.handle !== handle) return { problem: null, free: null };
  return { problem: seen.problem, free: seen.free };
}

function HandleField({
  origin,
  value,
  onChange,
  check,
  saved,
  disabled = false,
}: {
  origin: string;
  value: string;
  onChange: (v: string) => void;
  check: Check;
  saved: string | null;
  disabled?: boolean;
}) {
  const host = origin.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex h-10 min-w-0 items-center rounded-sm border border-line-strong bg-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
        <span className="max-w-[55%] shrink-0 truncate pl-3 font-mono text-[12px] text-faint">{host}/booking/</span>
        <input
          aria-label="Link"
          value={value}
          maxLength={40}
          disabled={disabled}
          onChange={(e) => onChange(cleanHandle(e.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12.5px] text-ink outline-none disabled:text-muted"
        />
        {saved && value === saved ? <CopyButton text={bookingUrl(origin, saved)} size={13} /> : null}
      </span>
      {value !== saved && (check.problem || check.free) ? <span className={`text-[12px] ${check.problem ? "text-danger" : "text-signal-text"}`}>{check.problem ?? "Free"}</span> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** The real page in a frame, at desktop or phone width. */
function Preview({ src, url }: { src: string | null; url: string | null }) {
  const [size, setSize] = useState<"desktop" | "phone">("desktop");
  return (
    <div className="flex min-h-[520px] min-w-0 flex-col bg-paper-deep">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{url ?? ""}</span>
        <Segmented
          label="Preview size"
          value={size}
          options={[
            { value: "desktop", label: "Desktop" },
            { value: "phone", label: "Phone" },
          ]}
          onChange={setSize}
        />
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" aria-label="Open the page" className="text-muted hover:text-ink">
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto p-4 md:p-6">
        {src ? (
          <iframe
            key={src}
            title="Booking page preview"
            src={src}
            className={`h-full min-h-[480px] w-full rounded-2xl border border-line bg-card shadow-soft transition-[max-width] duration-[320ms] ease-spring ${size === "phone" ? "max-w-[390px]" : "max-w-[1040px]"}`}
          />
        ) : (
          <p className="self-center text-[13px] text-muted">Save your page to see it here</p>
        )}
      </div>
    </div>
  );
}
