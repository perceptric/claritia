# Signup

How people get into Claritia, and the setup it needs.

## The flow

1. "Start free" on tryclaritia.com opens app.tryclaritia.com/signup ("Create your account"); "Sign in" opens /signin
   ("Welcome back"). Each links to the other. Any app page opened while signed out moves to /signin and opens after
   signing in (kept for the tab).
2. The screen (`src/components/app/AuthScreen.tsx`): Continue with Google, Microsoft or GitHub, or an email sign-in
   link. Only the options turned on in Supabase show (its public `/auth/v1/settings`). Terms and Privacy link under
   the buttons. After signing in, the app opens the page first asked for, else Forms.
3. First sign-in makes a workspace named after the email (`ensure_workspace`, 133). Its owner is asked "What's your
   team called?" once; Settings › Workspace renames it any time.
4. The Get started card in the sidebar lists six first steps and ticks them as they're done (`GetStarted.tsx`).
5. Settings › Team invites a teammate by email. The invite email goes through the jobs queue (`invite_email`,
   `worker-intel/jobs/team.ts`): a "not now" from Resend is tried again, a send with no clear answer is never sent
   twice, and an invite canceled before the email goes sends nothing. Inviting again sends again.
6. The teammate signs in with the invited email and opens the team's workspace. Someone in more than one workspace
   switches from the workspace name at the top of the sidebar; the pick is kept on that computer.

## Setup

### Database

Run `supabase/migrations/133_signup.sql` in the SQL editor.

### Sign-in emails through Resend

Supabase's built-in mailer sends only a few emails an hour (check) and only to team members on some plans. Send the
sign-in links through Resend instead:

1. Supabase › Authentication › Emails › SMTP Settings: turn on Custom SMTP.
   - Sender email: `signin@mail.tryclaritia.com` (a verified Resend domain). Sender name: `Claritia`.
   - Host `smtp.resend.com`, port `465`, username `resend`, password: a Resend API key with sending access.
2. Authentication › Rate Limits: raise "Rate limit for sending emails" to 100 an hour.
3. Authentication › Emails › Templates: for **Magic Link** and **Confirm signup**, set the subject to
   `Sign in to Claritia` and paste `supabase/templates/magic-link.html` as the Magic Link body and `supabase/templates/confirm-signup.html` (subject `Welcome to Claritia`) as the Confirm signup body.

### Microsoft sign-in

Uses the Microsoft app the calendars already use.

1. Microsoft Entra › App registrations › the Claritia app › Authentication: add the redirect
   `https://<project>.supabase.co/auth/v1/callback` (the Callback URL Supabase shows in step 2).
2. Supabase › Authentication › Sign In / Providers › Azure: turn it on, paste the app's client id and a client secret,
   and set the Azure Tenant URL to `https://login.microsoftonline.com/common`.
3. The button shows on the sign-in screen once it's on.

## Cost

Beta (50 teams): $0 a month. Growth (500 teams): $0 a month. Invite and sign-in emails fit inside the Resend plan
already paid (check); Microsoft sign-in and Supabase's SMTP setting are free.
