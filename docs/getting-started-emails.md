# Getting-started emails

New workspaces get a short run of emails in their first weeks, sent to the person who made the workspace. Each one
asks for one thing and is skipped once that thing is done. When: `src/lib/tips/plan.ts`. Words and look:
`src/lib/tips/mail.ts`. Sending: `src/lib/tips/send.ts`, from claritia-intel every 15 minutes
(`worker-intel/index.ts`). Log, switch and last seen: `supabase/migrations/170_getting_started.sql`.

| Day | Email | Sends when |
|---|---|---|
| 0 | Welcome, here's your first week (progress bar and a six-step list) | The guided setup is done, or an hour after the workspace is made |
| 1 | Describe it in one sentence (the prompt, three templates, all 840) | No form yet |
| 2 | Get your form in front of people (its link) | A form, but no responses |
| 3 | Your first response is in (responses, meetings booked, forms live) | A form got responses |
| 4 | Let leads book a time right away (a day of times, one booked) | No calendar connected |
| 6 | Follow up with every lead on its own (a three-step workflow, the drafts ready to turn on) | A form, but no live workflow of the team's own and no campaign sent |
| 8 | Invite your team (what's free and what each plan adds) | The only member, with no open invite |
| any | You're close to this month's free responses (Free, Starter, Pro) | On Free with 200 of the 250 monthly responses used, once a month |
| 14 | Want us to set it up with you? | On Free and not seen for 7 days |
| 21+ | Here's what came in (new responses, meetings booked, coming up) | Not seen for 14 days and something came in since, at most every 90 days |

Rules: one a day at most, 9:00 to 18:00 in the workspace's time zone (the workspace's sending time zone, else the
owner's availability schedule, else UTC). The welcome goes at any hour. Paying workspaces only get the welcome and the
setup emails (days 1 to 8). Someone who was already in another workspace doesn't get them. Each person can turn them
off in Settings › Profile, or with the link in each email (`/api/email/tips`, which shows one button; mail apps use
the List-Unsubscribe header). Claritia has no trial, so there's no trial email; Free's monthly response cap is the
one limit email.

The guided setup's own welcome (`welcome_email`, 169) stays quiet for workspaces these emails cover, so nobody gets
two welcomes. Before 170 has run, or with `TIPS_OFF=1`, it sends as before.

Sending: each email is claimed in `tips_log` before it goes, so two workers never send it. A busy provider is tried
again with growing waits; a send that still fails gives its claim back for the next run, and one with no clear answer
keeps it, so nobody gets it twice (`tests/tips.test.ts`).

The look is the live sign-in emails' (`supabase/templates/confirm-signup.html`): the logo on the off-white page, one
white card, a hero on the soft panel the sign-in pictures use with one big visual drawn in HTML (a progress bar,
numbers, the prompt, a link, time slots, a workflow, faces), then a green kicker, the title and one line, a short list
and the dark pill button.

Settings (all optional): `TIPS_START` (default 2026-11-19; older workspaces never get them), `TIPS_FROM` (default
hello@mail.tryclaritia.com), `TIPS_REPLY_TO` (default hello@tryclaritia.com), `TIPS_SIGN_NAME` and `TIPS_SIGN_ROLE`
(shown on the help email), `TIPS_OFF=1`. The turn-off link is signed with `SECRETS_KEY`. Named `TIPS_` because
`nurture` already means the contact nurtures in Email (042).

Previews: `node scripts/tips-previews.ts` writes `email-previews/` (ignored by git).

## Setup

Run `supabase/migrations/170_getting_started.sql` with `psql` against the VPS database, then redeploy `claritia-web`
(the Settings switch and the turn-off link) and `claritia-intel` (the sender). Safe to run twice.

## Running cost

No new service and no AI. At most 10 emails per new workspace through the Resend account the meeting emails already
use: about 500 emails a month at Beta (50 teams) and 5,000 at Growth (500 teams), inside the current Resend plan
(check the plan's monthly cap). The 15-minute run is a few count queries per new workspace on the VPS database, and
`tips_log` holds one small row per email. **$0 added a month at Beta and $0 at Growth.**
