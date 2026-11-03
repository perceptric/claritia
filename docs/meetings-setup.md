# Meetings setup

What Meetings needs in production: the calendar apps, Stripe for paid types, and the meeting email address. The
plan is `docs/meetings-scheduler.md`. Email sending itself is `docs/sending-setup.md` (meeting emails go through
Resend's SMTP relay with the same API key, and its webhook reports their bounces).

## 1. Google Calendar

1. Google Cloud console → APIs & Services → enable **Google Calendar API**.
2. OAuth consent screen: External, with the app name, logo, privacy policy and terms. Add the scopes
   `calendar.events`, `calendar.readonly` and `userinfo.email`. These are sensitive scopes, so Google reviews the app
   before other companies can connect (free, days to weeks, check the current steps on Google's page).
3. Credentials → **Create OAuth client ID** → Web application. Redirect URI:
   `https://app.tryclaritia.com/api/calendar/callback`.
4. At Growth, ask for a higher Calendar API quota (free, check): the 10-minute refresh is about 360,000 free/busy
   calls a day at 2,500 connected people.

## 2. Microsoft 365 (Outlook and Teams)

1. Entra admin center → App registrations → New registration, **multi-tenant** (any organization and personal
   accounts). Redirect URI (Web): `https://app.tryclaritia.com/api/calendar/callback`.
2. API permissions (delegated): `offline_access`, `User.Read`, `Calendars.ReadWrite`.
3. Certificates & secrets → New client secret. Note its end date: a new one is needed before it runs out.
4. Publisher verification (free, check), so customers don't see "unverified".

## 3. Zoom

1. Zoom App Marketplace → Develop → Build App → **General app**, user-managed.
2. Redirect URL: `https://app.tryclaritia.com/api/calendar/callback`. Scope: `meeting:write`.

## 4. Stripe (paid meeting types)

Paid types use Stripe Connect Standard: each workspace connects its own Stripe account from Settings › Payments, and
guests pay that account. Claritia never holds the money.

1. Stripe dashboard → Connect → turn on Connect for the platform account, with Standard accounts.
2. Developers → Webhooks → Add endpoint `https://app.tryclaritia.com/api/book/pay/webhook`, listening to **events on
   Connected accounts**: `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `account.updated`. Each
   event is checked by fetching it back from Stripe, so no signing secret is stored.

## 5. Secrets

**Render (web app):**

| Secret | Without it |
|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Connect Google Calendar" answers "Google Calendar sign-in isn't set up yet." |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` | "Connect Outlook Calendar" answers the same |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | "Connect Zoom" answers the same; Zoom types use the calendar's own video link |
| `STRIPE_SECRET_KEY` | Settings › Payments can't connect, and paid types can't be booked |
| `APP_URL` (https) | Calendar pushes can't reach the app; the 10-minute refresh still keeps times right |
| `SECRETS_KEY` | Calendar tokens can't be sealed, so nothing connects |

**Fly (claritia-intel worker):**

| Secret | Without it |
|---|---|
| `MEETINGS_FROM` | Meeting emails come from `meetings@tryclaritia.com` when the workspace has no verified From address |
| `GOOGLE_*`, `MICROSOFT_*`, `ZOOM_*` (same values) | Tokens can't be refreshed, so events and busy times stop |
| `SECRETS_KEY` (same value as Render) | Manage links in emails and calendar tokens can't be opened |

`CALENDAR_FAKE=1` turns on a test calendar for local runs and the screens check. Never set it in production.

## 6. Check it works

1. Settings › Calendar → **Connect Google Calendar** → sign in. The account shows Connected with its calendars.
2. Set hours, then Meetings › Meeting types → **New type**. Open its link in a private window, book a time.
3. The meeting shows in Meetings, the event is on the calendar with a Meet link, and the guest gets the confirmation
   with the invite. The guest is now a contact with the booking on their timeline.
4. Revoke Claritia's access in the Google account. Within 10 minutes the calendar shows Reconnect, the person gets one
   "Reconnect your Google calendar" email, and their times leave every booking page until they reconnect.

## Running cost

Beta is 50 teams with about 7,500 meetings a month; Growth is 500 teams with about 100,000.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Google, Microsoft and Zoom APIs (free within quotas) | $0 | $0 |
| Meeting emails on Resend, about 32,000 and 430,000 a month, inside the Resend plan in `docs/sending-setup.md` | $0 added | $0 added |
| Calendar refresh, pushes and reminders on the existing claritia-intel worker | $0 | $30 for a larger machine (check) |
| Database: busy times, meetings and their history (about 1 GB at Growth) | $0 (inside plan) | $0 to $25 (check) |
| Slack notes for leads who didn't book (incoming webhooks) | $0 | $0 |
| Stripe for paid types (fees come out of each payment) | $0 | $0 |
| Claude tokens (none) | $0 | $0 |
| **Added per month** | **$0** | **about $30 to $55** |

## Routing

Run `supabase/migrations/064_router.sql` after 053 to 063, then `065_router_sla.sql`, `066_app_structure.sql` (named schedules, the calendar's busy times, Pause routing) and `067_resend.sql` (all email on Resend). Routing alerts go to the Claritia
Slack app as direct messages, to a Slack incoming webhook set in Routing › Router › Alerts (sealed with `SECRETS_KEY`),
or by email through the same Resend SMTP mailer as meeting emails.

## Slack app

1. api.slack.com/apps → **Create New App** → From scratch, named Claritia. Turn on **Manage Distribution** so other
   Slack workspaces can add it.
2. OAuth & Permissions: redirect URL `https://app.tryclaritia.com/api/slack/callback`; bot scopes `commands`,
   `chat:write`, `users:read`, `users:read.email`.
3. Slash Commands → **Create New Command**: `/book`, request URL `https://app.tryclaritia.com/api/slack/commands`,
   usage hint `lead@company.com [meeting type]`.
4. Interactivity & Shortcuts: on, request URL `https://app.tryclaritia.com/api/slack/actions`.
5. App Home: turn on the Messages tab, so reps can read the app's direct messages.
6. Secrets on Render: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` (Basic Information). Without
   them, Add to Slack doesn't show, and alerts use the channel webhook or email.

Check it works: Routing › Alerts › **Add to Slack**, approve, then route a test lead. The rep gets a direct message;
pressing Mark contacted shows "Marked contacted" and ends the lead's response time. `/book` with a lead's email answers
with a link that books once.

