# Forms setup: what to set before turning on forms

Everything here is done once by us. Customers build a form, paste one line on their site, and pick where leads go. The spec is `docs/form-builder.md`.

## 1. Database

Run `supabase/migrations/045_form_builder.sql` through `048_form_checks.sql` in order. The first upgrades the forms from `041_forms.sql`: each form keeps its id, link and embed, its fields become a first version, its color becomes a brand kit, and its answers move to submissions. They add:

- forms, versions, brand kits, submissions, destinations and deliveries (039),
- the AI step cache, the AI cost log, form chats and the brand scan's state (040),
- booking links per teammate, bookings tied to fills, and captured forms (041),
- the daily form check (042).

`minute_tick` already runs every minute. From 039 on it also re-queues lost deliveries (hourly), checks live forms once a day, wakes the runner for scans and checks, and clears spam older than 7 days. Nothing new to schedule.

## 2. Render (the web app)

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | The form chat. Without it the Chat tab answers that the chat isn't set up; everything else works. |
| `FORMS_CHAT_MODEL` | Optional. Defaults to `claude-sonnet-5-5`. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional. Cloudflare Turnstile for forms that turn it on. Without them the honeypot and timing checks still run. |
| `SECRETS_KEY` | Already set. Seals Slack and webhook addresses, and signs the daily check's token. |

`npm run build` now also builds the form script (`scripts/build-forms.mts`) into `.next/static/forms/v1.js`, served at `/forms/v1.js`. The Docker image copies `.next`, so nothing else changes.

## 3. claritia-runner (Fly)

```
fly secrets set --app claritia-runner \
  APP_URL='https://app.tryclaritia.com' \
  ANTHROPIC_API_KEY='…'
```

- `APP_URL`: where the daily check opens each form, and where the brand scan's look check gets the form script.
- `ANTHROPIC_API_KEY`: the brand scan's look check. Without it the scan still runs and skips that step.
- `SECRETS_KEY` must match Render's (the daily check's token is signed with it).

## 4. claritia-intel (Fly)

Nothing new. The worker runs the `deliver` and `deliver_held` jobs with the secrets it already has.

## 5. Webhooks for bookings

Bookings tie back to fills through the Calendly and Cal.com sources that already exist (Settings › Tools). A team that books on Calendly connects Calendly there once; the form's booking link carries the fill's id, and the webhook brings it back.

## 6. Checks before launch

| Check | Owner |
|---|---|
| HubSpot legacy `onFormSubmitted` message and v4 `hs-form-event:on-submission:success` against a live portal | Build |
| Marketo `onSuccess` against a live Marketo form | Build |
| Calendly `utm_content` coming back in `invitee.created`, Cal.com `metadata[clr]` in `BOOKING_CREATED` | Build |
| HubSpot Meetings and SavvyCal embed parameters | Build |
| Pipedrive person search, Attio assert by email, Close lead query syntax on real accounts | Build |
| Turnstile keys for `app.tryclaritia.com` | Founder |
