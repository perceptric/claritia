"use client";

// Meeting emails that didn't go out (src/lib/meetings/mailHealth.ts): one line across Meetings while they're failing,
// with the worker's own reason, and a notice on the meeting each one was for. Nothing shows while emails go out.

import type { MailHealth } from "@/lib/meetings/mailHealth";
import { Badge, timeAgo, useQuery, type ViewProps } from "../ui";

async function getHealth(session: ViewProps["session"], ws: string): Promise<MailHealth> {
  const res = await fetch(`/api/meetings/mail-health?workspaceId=${ws}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  // A read that fails warns about nothing: this line is for real email failures only.
  if (!res.ok) return { problem: null, meetings: {} };
  return (await res.json()) as MailHealth;
}

export function useMailHealth(session: ViewProps["session"], ws: string) {
  return useQuery(`mail_health:${ws}`, () => getHealth(session, ws), { staleMs: 60_000 });
}

/** One line under the Meetings tabs while meeting emails are failing. */
export function MailLine({ session, ws }: Pick<ViewProps, "session" | "ws">) {
  const p = useMailHealth(session, ws.id).data?.problem;
  if (!p) return null;
  return (
    <div role="alert" className="flex min-h-[44px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-rose-wash px-5 py-2 text-[13px]">
      <Badge tone="red" dot>
        Emails not sent
      </Badge>
      <b className="font-semibold text-ink">Meeting emails aren&apos;t going out</b>
      <span className="text-body [overflow-wrap:anywhere]">{p.error}</span>
      <span className="text-muted">
        {p.count === 1 ? "1 email" : `${p.count} emails`}, last {timeAgo(p.at)}
      </span>
    </div>
  );
}

/** On one meeting: each email for it that didn't go out, and why. */
export function MeetingMailNotice({ session, ws, meeting }: Pick<ViewProps, "session" | "ws"> & { meeting: string }) {
  const list = useMailHealth(session, ws.id).data?.meetings[meeting];
  if (!list?.length) return null;
  return (
    <div role="alert" className="flex flex-col gap-1.5 rounded-[10px] bg-rose-wash px-4 py-3 text-[13px]">
      {list.map((f, i) => (
        <div key={`${f.what}${f.at}${i}`} className="flex flex-wrap items-baseline gap-x-2">
          <b className="font-semibold text-rose">{f.what} not sent</b>
          {f.to ? <span className="text-body [overflow-wrap:anywhere]">to {f.to}</span> : null}
          <span className="text-body [overflow-wrap:anywhere]">{f.error}</span>
          <span className="text-muted">{timeAgo(f.at)}</span>
        </div>
      ))}
    </div>
  );
}
