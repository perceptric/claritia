// What the meeting description needs beyond the meeting row (supabase/migrations/099_meeting_description.sql): the
// form it was booked from with its answers, and the guest's reschedule and cancel link. Server only. Before 099, or
// when the read fails, the description is made without them: a missing line never stops a calendar event.

import type { Form } from "../forms/schema.ts";
import type { Rpc } from "../jobs.ts";
import { formAnswers, type Answer } from "./description.ts";
import { keptManageToken, manageUrl } from "./links.ts";

export type InviteExtras = { form: string | null; formAnswers: Answer[]; manage: string | null };

export async function inviteExtras(rpc: Rpc, meeting: string, o: { base?: string; secret?: string }): Promise<InviteExtras> {
  const none: InviteExtras = { form: null, formAnswers: [], manage: null };
  try {
    const { data, error } = await rpc("meeting_invite_info", { p_meeting: meeting });
    if (error || !data) return none;
    const d = data as { token_hash: string; token_sealed: string | null; form: { name: string | null; values: Record<string, unknown> | null; body: Pick<Form, "steps"> | null } | null };
    const token = o.base ? keptManageToken({ token_hash: d.token_hash, token_sealed: d.token_sealed }, o.secret) : null;
    return { form: d.form?.name ?? null, formAnswers: formAnswers(d.form?.body, d.form?.values), manage: token && o.base ? manageUrl(o.base, token) : null };
  } catch {
    return none;
  }
}
