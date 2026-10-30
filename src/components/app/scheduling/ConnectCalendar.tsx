"use client";

// Connect your calendar (docs/scheduling-plan.md 11.1 rule 5): one slim 52 px line across the top of Calendar's work
// area, never a card inside a narrow column. It says why, has Google Calendar and Outlook, and goes away once a
// calendar is connected. A calendar that needs signing in again shows Reconnect.

import { useState } from "react";
import { CalendarIcon } from "../../Icons";
import { BrandLogo } from "../BrandLogo";
import { Button, ErrorNote, errorText, must, postJson, useLoad, type ViewProps } from "../ui";
import { PROVIDERS, type Account } from "../meetings/MyCalendar";

const CALENDARS = PROVIDERS.filter((p) => p.id !== "zoom");
/** The short names the banner uses. */
const SHORT: Record<string, string> = { google: "Google Calendar", microsoft: "Outlook" };

/** Your calendar accounts in this workspace, or null while they load. */
export function useCalendarAccounts({ sb, session, ws }: Pick<ViewProps, "sb" | "session" | "ws">) {
  return useLoad(
    async () => (must(await sb.from("calendar_accounts").select("id, user_id, provider, account_email, status, refreshed_at").eq("workspace_id", ws.id).eq("user_id", session.user.id)) ?? []) as Account[],
    `${ws.id}:${session.user.id}`,
  );
}

/** Starts a provider's sign-in; it comes back to Availability, Calendars. */
export async function connectCalendar(session: ViewProps["session"], ws: string, provider: string) {
  const r = await postJson<{ url?: string }>(session, "/api/calendar/connect", { workspaceId: ws, provider });
  if (r.url) window.location.assign(r.url);
}

/** The banner: nothing while the accounts load or once a calendar is connected and fine. */
export function ConnectCalendar(props: Pick<ViewProps, "sb" | "session" | "ws">) {
  const accounts = useCalendarAccounts(props);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const list = accounts.data;
  if (!list) return null;
  const cals = list.filter((a) => a.provider !== "zoom");
  const stale = cals.find((a) => a.status === "reconnect");
  if (cals.some((a) => a.status === "ok") && !stale) return null;
  const go = async (provider: string) => {
    setBusy(provider);
    setError("");
    try {
      await connectCalendar(props.session, props.ws.id, provider);
    } catch (e) {
      setError(errorText(e));
      setBusy("");
    }
  };
  const shown = stale ? CALENDARS.filter((p) => p.id === stale.provider) : CALENDARS;
  return (
    <div role="region" aria-label="Connect your calendar" className="anim-fade flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line bg-paper pr-3 pl-4">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-butter-wash text-butter">
        <CalendarIcon size={14} />
      </span>
      <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold text-ink">{stale ? `Reconnect ${SHORT[stale.provider] ?? "your calendar"}` : "Connect your calendar"}</span>
      {error ? (
        <span role="alert" className="min-w-0 truncate text-[13px] text-rose">
          {error}
        </span>
      ) : (
        <span className="hidden min-w-0 truncate text-[13px] text-body sm:inline">{stale ? stale.account_email : "Bookings need your free times."}</span>
      )}
      <span className="flex-1" />
      {shown.map((p) => (
        <Button key={p.id} variant="ghost" size="sm" className="h-[30px] shrink-0 !border-line px-2 sm:px-3" disabled={!!busy} onClick={() => void go(p.id)} aria-label={stale ? `Reconnect ${p.name}` : p.name}>
          <BrandLogo domain={p.domain} name={p.name} size={16} />
          <span className="hidden sm:inline">{busy === p.id ? "Opening" : stale ? "Reconnect" : SHORT[p.id]}</span>
        </Button>
      ))}
    </div>
  );
}

/** An error from the times; "Connect your calendar first" and "Reconnect" come with the buttons that fix them. */
export function TimesError({ message, session, ws }: { message: string; session: ViewProps["session"]; ws: string }) {
  const [error, setError] = useState("");
  const needs = /connect your calendar first/i.test(message);
  if (!needs) return <ErrorNote message={message} />;
  const go = (provider: string) => void connectCalendar(session, ws, provider).catch((e) => setError(errorText(e)));
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-line px-4 py-6 text-center">
      <p className="text-[13.5px] font-medium text-ink">{/^reconnect/i.test(message) ? "Reconnect your calendar" : "Connect your calendar"}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {CALENDARS.map((p) => (
          <Button key={p.id} variant="ghost" onClick={() => go(p.id)}>
            <BrandLogo domain={p.domain} name={p.name} size={16} />
            {p.name}
          </Button>
        ))}
      </div>
      <ErrorNote message={error} />
    </div>
  );
}
