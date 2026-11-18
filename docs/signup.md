# Signup

How people get into Claritia, and the setup it needs.

## The flow

1. "Start free" on tryclaritia.com opens app.tryclaritia.com/signup ("Create your account"); "Sign in" opens /signin
   ("Welcome back"). Each links to the other. Any app page opened while signed out moves to /signin and opens after
   signing in (kept for the tab).
2. The screen (`src/components/app/AuthScreen.tsx`): Continue with Google or Microsoft, or an email sign-in
   link. Only the options turned on in the sign-in service show (its public `/auth/v1/settings`). Terms and Privacy link under
   the buttons. After signing in, the app opens the page first asked for, else Forms.
   - /signup says "Free for one seat. No card needed." A sign-up form on the website can send the email along
     (`/signup?email=ana@acme.com`) and it's filled in.
   - Google always shows its account picker (`prompt=select_account`), so someone with two Google accounts picks the right one.
   - Check your inbox has a box for the 6-digit code from the same email (for a link opened in another browser, or
     used up by a mail scanner), and Open Gmail and Open Outlook. The magic-link and confirm-signup emails show the code
     (`{{ .Token }}`, from `tools/auth_emails.py` in the site repo).
   - A link opened in another browser or on another device (links use PKCE, so only the browser that asked can use
     them) lands on /signin with one line: "That link opened in a different browser. Continue with email for a code to
     sign in here." An expired or used link says so (`linkLine` in `src/lib/authLimits.ts`).
   - Before a link is sent, `/api/auth/link` counts it: 5 links per address and 20 per IP an hour, in Postgres
     (`168_auth_limits.sql`, `src/lib/authLimits.ts`), so every server shares the count. Buckets hold a keyed hash,
     never an address or IP. Over the limit, one line says when to try again.
   - Cloudflare Turnstile checks for bots when `TURNSTILE_SITE_KEY` is set. Most people never see it.
   - Throwaway inboxes (the disposable-email list forms use, `src/lib/email/address.ts`) can't get a sign-in link.
   - A typed address a letter or two off a common provider, or ending in .con, gets "Did you mean ana@gmail.com?"
     with a one-click fix (`src/lib/emailTypos.ts`). The address as typed still works.
   - /signin tags the way this computer signed in last (Google, Microsoft or email) "Last used".
   - An invite email links to `/signup?invite=<id>&email=<address>`. The page says "Join Acme on Claritia", who
     invited, and which address to use, with the email filled in (`/api/auth/invite`, which answers only for an open
     invite). A closed or unknown invite shows plain sign-up.
3. First sign-in makes a workspace named after the email (`ensure_workspace`, 133). Its owner gets the guided setup
   (`src/components/app/Welcome.tsx`, `src/lib/setup.ts`), the way Omniscient and Arrowsterr start a new account:
   - **Set up your team**: the team's name and website, guessed from a work email (none for Gmail and other free
     mail). The website's brand is read into a brand kit (`/api/forms/scan`), so the first form and the booking page
     wear it. A wrong address shows its error; a site that can't be read now can be read later in Email › Brand.
   - **Connect your calendar**: Google Calendar or Outlook. The sign-in comes back to this step. Can be skipped.
   - **Pick your first form**: Book a call, Demo request or Consultation request. The workspace's meeting type is made
     from the matching meeting template when it has none, then the form is made from its gallery template in the
     team's brand, wired to that meeting. See all templates and Start blank end the setup there.
   - **Invite your team**: emails with commas between, each sent through `invite_member`. Can be skipped.
   - The signed-in email and Sign out sit at the top of every step, for someone signed in with the wrong account.
   - Each finished or skipped step is one row in `audit_log` (`setup.team`, `setup.calendar.skip`, `setup.done` and
     so on; `setup_step`, 169), so the sign-up funnel can be counted:
     `select action, count(*) from audit_log where action like 'setup.%' group by 1 order by 2 desc;`
   - Finishing queues one welcome email (`welcome_email` on claritia-intel, `src/lib/team/welcome.ts`): the team is
     ready, a button to the form just made, and the next steps (put it live, connect a calendar, invite the team).
   - The end opens the new form in Form Studio, else Forms. The step is kept on that computer; finishing or leaving
     from the form step ends it for good. Settings › Workspace renames the team any time.
4. The Get started card in the sidebar lists six first steps and ticks them as they're done (`GetStarted.tsx`).
5. Settings › Team invites a teammate by email. The invite email goes through the jobs queue (`invite_email`,
   `worker-intel/jobs/team.ts`): a "not now" from Resend is tried again, a send with no clear answer is never sent
   twice, and an invite canceled before the email goes sends nothing. Inviting again sends again.
6. The teammate signs in with the invited email and opens the team's workspace. Someone in more than one workspace
   switches from the workspace name at the top of the sidebar; the pick is kept on that computer.

## Setup

### Database

Run `supabase/migrations/133_signup.sql`, `168_auth_limits.sql` and `169_setup_steps.sql` with `psql` against the
VPS database, then redeploy `claritia-intel` so it sends the welcome email.

### Bot check (optional)

1. Cloudflare › Turnstile › Add site: `app.tryclaritia.com`, widget mode Managed. Copy the site key and secret key.
2. Set `TURNSTILE_SITE_KEY` on `claritia-web` and restart it. The check shows on the sign-in screen.
3. Turn on bot protection in the sign-in service with the secret key, then restart it (`docker compose up -d auth`):

   ```
   GOTRUE_SECURITY_CAPTCHA_ENABLED=true
   GOTRUE_SECURITY_CAPTCHA_PROVIDER=turnstile
   GOTRUE_SECURITY_CAPTCHA_SECRET=<Turnstile secret key>
   ```

   Do step 2 before step 3: with the service checking and no key on the app, email sign-in stops working.
4. If the proxy in front of the app writes the visitor's IP to its own header, set `CLIENT_IP_HEADER` to that name.
   Empty, the last X-Forwarded-For address is used.

### Sign-in emails through Resend

The sign-in service's built-in mailer is slow and limited (check). Send the
sign-in links through Resend instead:

1. In the sign-in service's settings, turn on Custom SMTP.
   - Sender email: `signin@mail.tryclaritia.com` (a verified Resend domain). Sender name: `Claritia`.
   - Host `smtp.resend.com`, port `465`, username `resend`, password: a Resend API key with sending access.
2. Authentication › Rate Limits: raise "Rate limit for sending emails" to 100 an hour.
3. Templates. The six sign-in emails live in `supabase/templates/` (copies of the files written by
   `tools/auth_emails.py` in `perceptric/claritia-site`; edit that script, not these files). The site serves them at
   `https://tryclaritia.com/email/auth/<name>.html`, so the sign-in service on the VPS can load them by URL. Add these
   lines to the auth service's environment, then restart it (`docker compose up -d auth` in the Supabase folder):

   ```
   GOTRUE_MAILER_TEMPLATES_CONFIRMATION=https://tryclaritia.com/email/auth/confirm-signup.html
   GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=https://tryclaritia.com/email/auth/magic-link.html
   GOTRUE_MAILER_TEMPLATES_RECOVERY=https://tryclaritia.com/email/auth/reset-password.html
   GOTRUE_MAILER_TEMPLATES_INVITE=https://tryclaritia.com/email/auth/invite.html
   GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE=https://tryclaritia.com/email/auth/email-change.html
   GOTRUE_MAILER_TEMPLATES_REAUTHENTICATION=https://tryclaritia.com/email/auth/reauthentication.html
   GOTRUE_MAILER_SUBJECTS_CONFIRMATION=Welcome to Claritia: confirm your email
   GOTRUE_MAILER_SUBJECTS_MAGIC_LINK=Your Claritia sign-in link
   GOTRUE_MAILER_SUBJECTS_RECOVERY=Reset your Claritia password
   GOTRUE_MAILER_SUBJECTS_INVITE=You're invited to Claritia
   GOTRUE_MAILER_SUBJECTS_EMAIL_CHANGE=Confirm your new email for Claritia
   GOTRUE_MAILER_SUBJECTS_REAUTHENTICATION=Your Claritia code
   ```

   If a template URL can't be loaded, the service falls back to its plain built-in email.

### Microsoft sign-in

Uses the Microsoft app the calendars already use.

1. Microsoft Entra › App registrations › the Claritia app › Authentication: add the redirect
   `<SUPABASE_URL>/auth/v1/callback` (the callback address of the sign-in service on the VPS).
2. In the sign-in service's providers, Azure: turn it on, paste the app's client id and a client secret,
   and set the Azure Tenant URL to `https://login.microsoftonline.com/common`.
3. The button shows on the sign-in screen once it's on.

## Cost

Beta (50 teams): $0 a month. Growth (500 teams): $0 a month. Invite and sign-in emails fit inside the Resend plan
already paid (check); Microsoft sign-in and the SMTP setting are free.

The sign-in changes and guided setup add $0 a month at Beta and $0 at Growth. Sign-in limits are small Postgres rows on
the VPS (one per bucket per hour, cleared after 2 days). Turnstile is on Cloudflare's free plan (check). The setup's
website read is the brand read that already runs from Email › Brand: one brand book on Claude Sonnet, about $0.03 a
site, already counted at 2 a team a month in `docs/brand-capture.md` ($3 at Beta, $30 at Growth). The meeting type and
the form are database rows; making a form from a template uses no AI. The welcome email is one email per new team
through Resend (50 at Beta, 500 at Growth a month), inside the plan already paid (check). Step counts are audit_log
rows.
