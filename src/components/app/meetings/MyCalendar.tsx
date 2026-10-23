"use client";

// My calendar (Settings → Account → Calendar; docs/meetings-scheduler.md 1.1, 1.2 and 1.9): connect Google,
// Microsoft and Zoom in one click, each account's state with Reconnect, which calendars count as busy and which one
// gets new events, weekly hours with date changes and a time zone, and the booking page (photo, name, line, link).
// Connecting and calendar lists go through /api/calendar/*; hours and the page through /api/meetings/*.

import { useEffect, useState } from "react";
import { DEFAULT_AVAILABILITY, type Availability } from "@/lib/meetings/types";
import { Check, Refresh, Trash } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { askConfirm } from "../Dialogs";
import { Badge, Button, CardHead, ErrorNote, errorText, IconButton, Input, Loading, must, Panel, postJson, timeAgo, Toggle, useLoad, type ViewProps } from "../ui";
import { HoursEditor } from "./HoursEditor";
import { slugify } from "./model";
import { CopyButton, meetingsApi, ownZone, PersonAvatar, useWorkspaceSlug } from "./parts";

type Provider = "google" | "microsoft" | "zoom" | "fake";
export type Account = { id: string; user_id: string; provider: Provider; account_email: string; status: "ok" | "reconnect"; refreshed_at: string | null };
export type CalList = { account_id: string; calendar_id: string; name: string; busy: boolean; write: boolean };

export const PROVIDERS: { id: Exclude<Provider, "fake">; name: string; domain: string; connect: string }[] = [
  { id: "google", name: "Google Calendar", domain: "calendar.google.com", connect: "Connect Google Calendar" },
  { id: "microsoft", name: "Outlook Calendar", domain: "outlook.com", connect: "Connect Outlook Calendar" },
  { id: "zoom", name: "Zoom", domain: "zoom.us", connect: "Connect Zoom" },
];
export const providerOf = (p: Provider) => PROVIDERS.find((x) => x.id === p) ?? { id: p, name: "Test calendar", domain: "example.com", connect: "" };

export function MyCalendar({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">) {
  const me = session.user.id;
  const data = useLoad(async () => {
    const accounts = (must(await sb.from("calendar_accounts").select("id, user_id, provider, account_email, status, refreshed_at").eq("workspace_id", ws.id).eq("user_id", me).order("created_at")) ?? []) as Account[];
    const [lists, hours, profile] = await Promise.all([
      accounts.length ? sb.from("calendar_lists").select("account_id, calendar_id, name, busy, write").in("account_id", accounts.map((a) => a.id)).order("name") : Promise.resolve({ data: [], error: null }),
      sb.from("availability").select("tz, weekly, overrides").eq("workspace_id", ws.id).eq("user_id", me).maybeSingle(),
      sb.from("booking_profiles").select("slug, name, headline, photo_url").eq("workspace_id", ws.id).eq("user_id", me).maybeSingle(),
    ]);
    return {
      accounts,
      lists: (must(lists) ?? []) as CalList[],
      hours: must(hours) as Availability | null,
      profile: must(profile) as { slug: string; name: string; headline: string | null; photo_url: string | null } | null,
    };
  }, ws.id);
  // Back from a provider's sign-in: /settings/calendar?connected=google or ?error=...
  const [back] = useState(() => new URLSearchParams(typeof window === "undefined" ? "" : window.location.search));
  const [error, setError] = useState(() => back.get("error")?.slice(0, 200) ?? "");
  const note = back.get("connected") ? `${providerOf(back.get("connected") as Provider).name} connected` : "";
  useEffect(() => {
    if (back.has("error") || back.has("connected")) history.replaceState(null, "", window.location.pathname);
  }, [back]);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const connect = (provider: string) =>
    act(async () => {
      const r = await postJson<{ url?: string; id?: string }>(session, "/api/calendar/connect", { workspaceId: ws.id, provider });
      if (r.url) window.location.assign(r.url);
      else data.reload();
    });

  if (!data.data) return <Panel>{data.error ? <div className="p-5"><ErrorNote message={data.error} /></div> : <Loading />}</Panel>;
  const { accounts, lists } = data.data;

  return (
    <div className="flex flex-col gap-5">
      <ErrorNote message={error} />
      <Panel className="overflow-hidden">
        <CardHead label="Calendars" count={accounts.length || undefined}>
          {note ? (
            <Badge tone="green" dot>
              {note}
            </Badge>
          ) : null}
        </CardHead>
        {accounts.length ? (
          <ul className="divide-y divide-line">
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                a={a}
                lists={lists.filter((l) => l.account_id === a.id)}
                onReconnect={() => connect(a.provider)}
                onRefresh={() => act(() => postJson(session, "/api/calendar/refresh", { workspaceId: ws.id, accountId: a.id }))}
                onDisconnect={() =>
                  act(async () => {
                    if (!(await askConfirm(`Disconnect ${a.account_email}?`, { ok: "Disconnect", danger: true }))) return;
                    await postJson(session, "/api/calendar/disconnect", { workspaceId: ws.id, accountId: a.id });
                    data.reload();
                  })
                }
                onLists={(calendars) =>
                  act(async () => {
                    await postJson(session, "/api/calendar/lists", { workspaceId: ws.id, accountId: a.id, calendars });
                    data.reload();
                  })
                }
              />
            ))}
          </ul>
        ) : null}
        <div className={`flex flex-wrap gap-2 px-5 py-4 ${accounts.length ? "border-t border-line" : ""}`}>
          {PROVIDERS.filter((p) => p.id !== "zoom" || !accounts.some((a) => a.provider === "zoom")).map((p) => (
            <Button key={p.id} variant="ghost" onClick={() => void connect(p.id)}>
              <BrandLogo domain={p.domain} name={p.name} size={15} />
              {p.connect}
            </Button>
          ))}
        </div>
      </Panel>
      <HoursPanel session={session} ws={ws.id} saved={data.data.hours} onSaved={data.reload} />
      <ProfilePanel session={session} ws={ws.id} email={session.user.email ?? ""} saved={data.data.profile} onSaved={data.reload} />
    </div>
  );
}

function AccountRow({ a, lists, onReconnect, onRefresh, onDisconnect, onLists }: { a: Account; lists: CalList[]; onReconnect: () => void; onRefresh: () => void; onDisconnect: () => void; onLists: (c: { id: string; busy: boolean; write: boolean }[]) => void }) {
  const p = providerOf(a.provider);
  const save = (id: string, patch: { busy?: boolean; write?: boolean }) =>
    onLists(lists.map((l) => ({ id: l.calendar_id, busy: l.calendar_id === id && patch.busy !== undefined ? patch.busy : l.busy, write: patch.write ? l.calendar_id === id : l.write })));
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <BrandLogo domain={p.domain} name={p.name} size={20} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium text-ink">{a.account_email}</span>
          <span className="text-[12px] text-muted">
            {p.name}
            {a.refreshed_at && a.provider !== "zoom" ? `, read ${timeAgo(a.refreshed_at)}` : ""}
          </span>
        </span>
        {a.status === "reconnect" ? (
          <>
            <Badge tone="red" dot>
              Reconnect
            </Badge>
            <Button size="sm" onClick={onReconnect}>
              Reconnect
            </Button>
          </>
        ) : (
          <>
            <Badge tone="green" dot>
              Connected
            </Badge>
            {a.provider !== "zoom" ? (
              <IconButton label="Read now" onClick={onRefresh}>
                <Refresh size={14} />
              </IconButton>
            ) : null}
          </>
        )}
        <IconButton label="Disconnect" className="hover:!bg-rose-wash hover:!text-rose" onClick={onDisconnect}>
          <Trash size={14} />
        </IconButton>
      </div>
      {a.provider !== "zoom" && lists.length ? (
        <div className="mx-5 mb-4 overflow-hidden rounded-lg border border-line">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-3 border-b border-line bg-paper px-3.5 py-2 text-[11.5px] font-medium text-muted">
            <span>Calendar</span>
            <span>Busy</span>
            <span>New events</span>
          </div>
          {lists.map((l) => (
            <div key={l.calendar_id} className="grid grid-cols-[minmax(0,1fr)_64px_96px] items-center gap-3 border-b border-line px-3.5 py-2 last:border-b-0">
              <span className="truncate text-[13px] text-ink">{l.name}</span>
              <Toggle label={`${l.name} counts as busy`} on={l.busy} onChange={(busy) => save(l.calendar_id, { busy })} />
              <button
                type="button"
                role="radio"
                aria-checked={l.write}
                aria-label={`New events in ${l.name}`}
                onClick={() => !l.write && save(l.calendar_id, { write: true })}
                className={`flex size-5 items-center justify-center rounded-full border transition-colors duration-[140ms] ${l.write ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink/50"}`}
              >
                {l.write ? <Check size={11} /> : null}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function HoursPanel({ session, ws, saved, onSaved, userId }: { session: ViewProps["session"]; ws: string; saved: Availability | null; onSaved: () => void; userId?: string }) {
  const initial = saved ?? DEFAULT_AVAILABILITY(ownZone());
  const [draft, setDraft] = useState<Availability>(initial);
  const [was, setWas] = useState(saved);
  if (saved !== was) {
    setWas(saved);
    setDraft(saved ?? DEFAULT_AVAILABILITY(ownZone()));
  }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !saved || JSON.stringify(draft) !== JSON.stringify(saved);
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Hours">
        <Button
          size="sm"
          disabled={!dirty || busy}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              await meetingsApi(session, ws, "availability", { availability: draft, ...(userId ? { userId } : {}) });
              onSaved();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </CardHead>
      <div className="flex flex-col gap-4 px-5 py-5">
        <ErrorNote message={error} />
        <HoursEditor value={draft} onChange={setDraft} />
      </div>
    </Panel>
  );
}

type ProfileRow = { slug: string; name: string; headline: string | null; photo_url: string | null };

function ProfilePanel({ session, ws, email, saved, onSaved }: { session: ViewProps["session"]; ws: string; email: string; saved: ProfileRow | null; onSaved: () => void }) {
  const wsSlug = useWorkspaceSlug(session, ws);
  const blank = (): ProfileRow => {
    const name = email.replace(/@.*/, "").replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { slug: slugify(name, 40), name, headline: "", photo_url: "" };
  };
  const [draft, setDraft] = useState<ProfileRow>(saved ?? blank());
  const [was, setWas] = useState(saved);
  if (saved !== was) {
    setWas(saved);
    setDraft(saved ? { ...saved, headline: saved.headline ?? "", photo_url: saved.photo_url ?? "" } : blank());
  }
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = !saved || JSON.stringify({ ...draft }) !== JSON.stringify({ ...saved, headline: saved.headline ?? "", photo_url: saved.photo_url ?? "" });
  const url = wsSlug.data ? `${typeof window === "undefined" ? "" : window.location.origin}/book/${wsSlug.data}/${draft.slug}` : "";
  return (
    <Panel className="overflow-hidden">
      <CardHead label="Booking page">
        <Button
          size="sm"
          disabled={!dirty || busy}
          onClick={async () => {
            setError("");
            setBusy(true);
            try {
              await meetingsApi(session, ws, "profile", { profile: draft });
              onSaved();
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </CardHead>
      <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <PersonAvatar person={{ id: "", email, role: "member", name: draft.name || email, photo: /^https:\/\//.test(draft.photo_url ?? "") ? draft.photo_url : null, slug: null, headline: null }} size={72} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <ErrorNote message={error} />
          <Labeled label="Name">
            <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Labeled>
          <Labeled label="Headline">
            <Input value={draft.headline ?? ""} maxLength={200} placeholder="Account executive" onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
          </Labeled>
          <Labeled label="Photo">
            <Input value={draft.photo_url ?? ""} maxLength={1000} placeholder="https://" onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} />
          </Labeled>
          <Labeled label="Link">
            <span className="flex h-10 min-w-0 items-center rounded-sm border border-line-strong bg-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
              <span className="max-w-[50%] shrink-0 truncate pl-3 font-mono text-[12px] text-faint">/book/{wsSlug.data ?? "…"}/</span>
              <input
                aria-label="Link"
                value={draft.slug}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                className="h-full min-w-0 flex-1 bg-transparent pr-2 font-mono text-[12.5px] text-ink outline-none"
              />
              {url && saved && !dirty ? <CopyButton text={url} size={13} /> : null}
            </span>
          </Labeled>
        </div>
      </div>
    </Panel>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid items-center gap-1.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

