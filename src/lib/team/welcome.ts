// The welcome email after the guided setup (supabase/migrations/169_setup_steps.sql, docs/signup.md): one email to the
// owner who finished it, with the form they made and what's left to do.

import { esc, page, type MailParts } from "../forms/notify.ts";

export type WelcomeView = { name: string | null; workspace: string; base: string; form: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function welcomeEmail(v: WelcomeView): MailParts {
  const base = v.base.replace(/\/$/, "");
  const first = (v.name ?? "").trim().split(/\s+/)[0] ?? "";
  const hi = first ? `Hi ${first},` : "Hi,";
  const form = v.form && UUID.test(v.form) ? `${base}/forms/${v.form}` : null;
  const link = form ?? `${base}/forms`;
  const button = form ? "Open your form" : "Open Claritia";
  const steps = [
    { label: "Put your form live and add it to your site", href: link },
    { label: "Connect your calendar so people only book free times", href: `${base}/scheduling/availability/calendars` },
    { label: "Invite your team", href: `${base}/settings/team` },
  ];
  const subject = `Welcome to Claritia`;
  const html = page(
    `<p style="margin:0 0 6px;font-size:18px;font-weight:600">${esc(v.workspace)} is ready</p>` +
      `<p style="margin:0 0 18px">${esc(hi)} thanks for signing up. Here's where to go next.</p>` +
      `<p style="margin:0 0 18px"><a href="${esc(link)}" style="display:inline-block;background:#333333;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:99px;font-weight:600">${button}</a></p>` +
      `<p style="margin:0 0 8px;font-weight:600">Next steps</p>` +
      steps.map((s) => `<p style="margin:0 0 6px"><a href="${esc(s.href)}" style="color:#0f0f0f">${esc(s.label)}</a></p>`).join(""),
    `${v.workspace} is ready on Claritia`,
  );
  const text = [`${v.workspace} is ready`, "", `${hi} thanks for signing up. Here's where to go next.`, "", `${button}: ${link}`, "", "Next steps", ...steps.map((s) => `- ${s.label}: ${s.href}`)].join("\n");
  return { subject, html, text };
}
