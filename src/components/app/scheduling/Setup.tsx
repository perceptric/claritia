"use client";

// Getting set up (Meetings, under the tabs): three steps in one slim line, Connect a calendar, Make a meeting type and
// Set your link, each a pill that opens where it's done, ticked once it is. It shows once: when all three are done or
// it's closed, it goes away for good on this browser. Until then it stands in for the Connect your calendar line.

import { useEffect, useState } from "react";
import { Check, X } from "../../Icons";
import { IconButton, useQuery, type ViewProps } from "../ui";
import { meetingsApi } from "../meetings/parts";
import { useMeetingTypes } from "../meetings/TypesList";
import { ConnectCalendar, useCalendarAccounts } from "./ConnectCalendar";

export function SetupLine(props: Pick<ViewProps, "sb" | "session" | "ws" | "navigate">) {
  const { sb, session, ws, navigate } = props;
  const key = `claritia:meetings-setup:${ws.id}:${session.user.id}`;
  const [gone, setGone] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(key) === "done";
    } catch {
      return false;
    }
  });
  const accounts = useCalendarAccounts(props);
  const types = useMeetingTypes(sb, ws.id);
  const link = useQuery(gone ? null : `meetings:setup:${ws.id}`, async () => {
    const r = await meetingsApi<{ profile: { handle: string | null } | null }>(session, ws.id, "booking", { action: "load" });
    return !!r.profile?.handle;
  });
  const ready = !!accounts.data && !!types.data && link.data !== undefined;
  const steps = [
    { label: "Connect a calendar", done: (accounts.data ?? []).some((a) => a.provider !== "zoom" && a.status === "ok"), go: () => navigate("scheduling", "availability") },
    { label: "Make a meeting type", done: (types.data ?? []).length > 0, go: () => navigate("scheduling", "types/new") },
    { label: "Set your link", done: link.data === true, go: () => navigate("scheduling", "booking") },
  ];
  const all = ready && steps.every((s) => s.done);
  const close = () => {
    setGone(true);
    try {
      localStorage.setItem(key, "done");
    } catch {}
  };
  useEffect(() => {
    if (!all) return;
    try {
      localStorage.setItem(key, "done");
    } catch {}
  }, [all, key]);
  if (gone || all) return <ConnectCalendar sb={sb} session={session} ws={ws} />;
  if (!ready) return null;
  return (
    <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-2 border-b border-line bg-paper px-5 py-2">
      <span className="mr-1 text-[13px] font-semibold text-ink">Get set up</span>
      {steps.map((s, i) => (
        <button
          key={s.label}
          type="button"
          onClick={s.go}
          disabled={s.done}
          className={`press inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${s.done ? "border-transparent bg-signal-soft text-signal-text" : "border-line-strong bg-card text-ink hover:border-ink/40"}`}
        >
          <span aria-hidden="true" className={`inline-flex size-4 items-center justify-center rounded-full text-[10px] tabular-nums ${s.done ? "bg-signal text-paper" : "bg-paper-deep text-muted"}`}>
            {s.done ? <Check size={10} /> : i + 1}
          </span>
          {s.label}
        </button>
      ))}
      <span className="flex-1" />
      <IconButton label="Close" onClick={close}>
        <X size={14} />
      </IconButton>
    </div>
  );
}
