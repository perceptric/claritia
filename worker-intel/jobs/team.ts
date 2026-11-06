// invite_email on claritia-intel (supabase/migrations/133_signup.sql, docs/signup.md): one invite email. An invite
// that was canceled, used, expired or sent again since sends nothing. A "not now" from the provider goes back to the
// queue; a send with no clear answer is never tried again, so nobody gets the email twice.

import { outcomeOf } from "../../src/lib/email/provider.ts";
import { JobError, type Handler, type Rpc } from "../../src/lib/jobs.ts";
import { mime, validAddress } from "../../src/lib/meetings/emails.ts";
import { call } from "../../src/lib/sources/sync.ts";
import { inviteEmail } from "../../src/lib/team/invite.ts";
import type { Mailer } from "./meetings.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type InviteOpts = { mailer: Mailer | null; base: string; from: string };
type Info = { email: string; workspace: string; inviter: string | null; inviter_email: string | null };

export const inviteSend =
  (rpc: Rpc, o: InviteOpts): Handler =>
  async (job) => {
    const id = String(job.payload.invite ?? "");
    if (!UUID.test(id)) throw new JobError("invite_email needs an invite", { retry: false });
    const info = await call<Info | null>(rpc, "invite_info", { p_id: id, p_sent_for: job.payload.sent_for ?? null });
    if (!info || !validAddress(info.email)) return;
    if (!o.mailer) throw new JobError("Resend isn't set up on the worker (RESEND_API_KEY).", { retry: false });
    const inviter = info.inviter || "Your teammate";
    const parts = inviteEmail({ workspace: info.workspace, inviter, email: info.email, link: `${o.base.replace(/\/$/, "")}/forms` });
    const replyTo = info.inviter_email && validAddress(info.inviter_email) ? info.inviter_email : null;
    try {
      const raw = mime({ from: { name: "Claritia", email: o.from }, to: info.email, replyTo, subject: parts.subject, html: parts.html, text: parts.text });
      await o.mailer.send({ from: o.from, to: info.email, raw, tags: { invite: id } });
    } catch (e) {
      const out = outcomeOf(e);
      if (out === "later" || out === "retry") throw new JobError("The email provider said not now; trying again", { retryAfterS: 120 });
      if (out === "unknown") return;
      throw new JobError(e instanceof Error ? e.message : "The invite email failed", { retry: false });
    }
  };
