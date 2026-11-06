// The invite email (supabase/migrations/133_signup.sql, docs/signup.md): who invited whom to which workspace, and the
// sign-in link. Joining is signing in with the invited email, so the email says which address to use.

import { esc, page, type MailParts } from "../forms/notify.ts";

export type InviteView = { workspace: string; inviter: string; email: string; link: string };

export function inviteEmail(v: InviteView): MailParts {
  const subject = `${v.inviter} invited you to ${v.workspace} on Claritia`.slice(0, 200);
  const html = page(
    `<p style="margin:0 0 6px;font-size:18px;font-weight:600">Join ${esc(v.workspace)} on Claritia</p>` +
      `<p style="margin:0 0 18px">${esc(v.inviter)} invited you to work on forms, meetings and workflows together.</p>` +
      `<p style="margin:0 0 18px"><a href="${esc(v.link)}" style="display:inline-block;background:#333333;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:99px;font-weight:600">Join ${esc(v.workspace)}</a></p>` +
      `<p style="margin:0;color:#71717a">Sign in with ${esc(v.email)} to join. The invite works for 30 days.</p>`,
    `${v.inviter} invited you to ${v.workspace}`,
  );
  const text = `Join ${v.workspace} on Claritia\n\n${v.inviter} invited you to work on forms, meetings and workflows together.\n\nJoin: ${v.link}\n\nSign in with ${v.email} to join. The invite works for 30 days.`;
  return { subject, html, text };
}
