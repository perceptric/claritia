"use client";

// The card that opens Calendar's pages until your calendar is connected (docs/scheduling-plan.md Part 10): one
// click to Google or Outlook, so nobody hits "Connect your calendar first" without a way to fix it. A calendar
// that needs signing in again shows Reconnect. Nothing shows once every account is fine.

import { useState } from "react";
import { BrandLogo } from "../BrandLogo";
import { Button, ErrorNote, errorText, must, postJson, useLoad, type ViewProps } from "../ui";
import { PROVIDERS, providerOf, type Account } from "../meetings/MyCalendar";

const CALENDARS = PROVIDERS.filter((p) => p.id !== "zoom");

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

export function ConnectCalendar(props: Pick<ViewProps, "sb" | "session" | "ws">) {
  const accounts = useCalendarAccounts(props);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const list = accounts.data;
  if (!list) return null;
  const stale = list.find((a) => a.status === "reconnect");
  if (list.length && !stale) return null;
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
  return (
    <div className="anim-rise-sm relative flex flex-col gap-4 rounded-[10px] border border-line bg-card px-5 py-5 sm:flex-row sm:items-center sm:px-6">
      <span aria-hidden="true" className="pointer-events-none absolute -top-px -left-px size-3.5 rounded-tl-[10px] border-t-[1.5px] border-l-[1.5px] border-ink" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-px -bottom-px size-3.5 rounded-br-[10px] border-r-[1.5px] border-b-[1.5px] border-ink" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold tracking-[-0.015em] text-ink">{stale ? `Reconnect ${providerOf(stale.provider).name}` : "Connect your calendar"}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{stale ? stale.account_email : "Bookings need your free times."}</p>
        <ErrorNote message={error} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(stale ? CALENDARS.filter((p) => p.id === stale.provider) : CALENDARS).map((p) => (
          <Button key={p.id} variant="ghost" disabled={!!busy} onClick={() => void go(p.id)}>
            <BrandLogo domain={p.domain} name={p.name} size={16} />
            {busy === p.id ? "Opening" : stale ? "Reconnect" : p.name}
          </Button>
        ))}
      </div>
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
