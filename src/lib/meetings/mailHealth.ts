// Whether meeting emails are going out (docs/meetings-scheduler.md): the confirmations, host notes, reminders and
// after-meeting emails the claritia-intel worker sends. A job that failed (Resend not set up on the worker, a From
// domain not verified) or an email the provider refused shows in Meetings as a warning, with the worker's own reason,
// and on the meeting it was for. A failure older than the last email that went out is over and doesn't warn.
// Server only: it reads the jobs queue and meeting_mails with the service key, for one workspace.

import type { SupabaseClient } from "@supabase/supabase-js";

const KINDS = ["meeting_notify", "meeting_remind", "meeting_after", "meeting_book_later"] as const;

/** What each failed thing was, in words. */
const WHAT: Record<string, string> = {
  meeting_notify: "Confirmation and host note",
  meeting_remind: "Reminder",
  meeting_after: "After-meeting email",
  meeting_book_later: "Pick-a-time email",
  confirm: "Confirmation",
  host_booked: "Note to the host",
  update: "Update",
  host_moved: "Move note to the host",
  cancel: "Cancel notice",
  host_canceled: "Cancel note to the host",
  reminder: "Reminder",
  after: "After-meeting email",
  no_show: "No-show follow-up",
  book_later: "Pick-a-time email",
};

export type MailFailure = { what: string; to: string | null; error: string; at: string };
export type MailHealth = {
  /** Emails failing since the last one went out: the newest reason and how many. */
  problem: { error: string; at: string; count: number } | null;
  /** Each meeting's emails that didn't go out, newest first. */
  meetings: Record<string, MailFailure[]>;
};

type JobRow = { kind: string; payload: { meeting?: unknown } | null; error: string | null; created_at: string; finished_at: string | null };
type MailRow = { meeting_id: string | null; kind: string; to_email: string; error: string | null; status: string; created_at: string };

const clip = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "It didn't go out.";

/** Reads the last 7 days for one workspace. A read that fails counts as nothing to warn about. */
export async function mailHealth(db: SupabaseClient, ws: string, now = Date.now()): Promise<MailHealth> {
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const [jobs, mails, sent] = await Promise.all([
    db.from("jobs").select("kind, payload, error, created_at, finished_at").eq("workspace_id", ws).in("kind", [...KINDS]).eq("status", "failed").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    db.from("meeting_mails").select("meeting_id, kind, to_email, error, status, created_at").eq("workspace_id", ws).in("status", ["failed", "unknown"]).gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    db.from("meeting_mails").select("created_at").eq("workspace_id", ws).eq("status", "sent").order("created_at", { ascending: false }).limit(1),
  ]);
  const fails: (MailFailure & { meeting: string | null })[] = [
    ...((jobs.error ? [] : (jobs.data ?? [])) as JobRow[]).map((j) => ({
      meeting: typeof j.payload?.meeting === "string" ? j.payload.meeting : null,
      what: WHAT[j.kind] ?? "Email",
      to: null,
      error: clip(j.error),
      at: j.finished_at ?? j.created_at,
    })),
    ...((mails.error ? [] : (mails.data ?? [])) as MailRow[]).map((m) => ({ meeting: m.meeting_id, what: WHAT[m.kind] ?? "Email", to: m.to_email, error: clip(m.error ?? (m.status === "unknown" ? "The provider gave no clear answer." : null)), at: m.created_at })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const lastSent = Date.parse(((sent.error ? [] : (sent.data ?? [])) as { created_at: string }[])[0]?.created_at ?? "") || 0;
  const open = fails.filter((f) => Date.parse(f.at) > lastSent);
  const meetings: MailHealth["meetings"] = {};
  for (const f of fails) if (f.meeting) (meetings[f.meeting] ??= []).push({ what: f.what, to: f.to, error: f.error, at: f.at });
  return { problem: open.length ? { error: open[0]!.error, at: open[0]!.at, count: open.length } : null, meetings };
}
