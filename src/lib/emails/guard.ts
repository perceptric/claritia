// The checks an agent's send passes before anything is queued (docs/email-studio-plan.md Part 9). Pure, so tests can
// prove them. The database then runs the same checks as a send from the app.

/** An agent may send to at most this many people; a bigger send is confirmed by a person in the app. */
export const AGENT_SEND_LIMIT = 500;

/** Why an agent can't send this campaign: a message, "confirm" (a person confirms it in the app), or null. */
export function campaignGuard(o: { role: string | null; ready: number; subject: string }): string | null {
  if (o.role !== "owner") return "Sending needs a key made by a workspace owner.";
  if (!o.subject.trim()) return "Add a subject first: change_email with the subject.";
  if (o.ready <= 0) return "No one in that audience can get this email.";
  if (o.ready > AGENT_SEND_LIMIT) return "confirm";
  return null;
}

/** When to send: null for now, or an ISO time between now and a year out. */
export function sendAtOf(v: unknown, now: number): { at: string | null } | { error: string } {
  if (v == null || v === "") return { at: null };
  if (typeof v !== "string") return { error: "send_at is an ISO date and time, like 2026-12-01T15:00:00Z." };
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return { error: "send_at is an ISO date and time, like 2026-12-01T15:00:00Z." };
  if (t < now - 60_000) return { error: "That time has passed. Leave send_at out to send now." };
  if (t > now + 365 * 86_400_000) return { error: "Pick a time within a year." };
  return { at: t <= now + 60_000 ? null : new Date(t).toISOString() };
}
