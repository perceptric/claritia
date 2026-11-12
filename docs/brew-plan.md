# Brew in Claritia: forms that start email nurtures

Status: plan, 12 November 2026.

## The idea

Teams pick one tool for forms and another for email, then glue them together with Zapier. Claritia already holds the
form, the booking and the follow-up in Workflows. Brew (brew.new) is an AI email platform with on-brand designs,
audiences and automations, but it's built for developers: everything runs through its REST API. Claritia becomes the
place where a team connects Brew once, and from then on every form fill can start a Brew nurture, with no code.

## What Brew's API gives us

From docs.brew.new (Public API v1), read 12 November 2026:

| Need | Brew |
|---|---|
| Sign-in | API key only (`Authorization: Bearer brew_…`), made in Brew › Settings › API. Brand or organization scope; an org key sends `X-Brand-Id`. No OAuth for the REST API. |
| Base address | `https://brew.new/api/v1` |
| Check the key | `GET /v1/brand` |
| Contacts | `POST /v1/contacts` (create or update), `GET/PATCH/DELETE /v1/contacts/{email}`, custom fields at `/v1/fields` |
| Start a nurture for one person | `POST /v1/automations/triggers/{triggerEventId}/fire` with `{ "payload": { "email": …, … } }` and an `Idempotency-Key`. Answers 202. Needs a published automation (422 `NO_PUBLISHED_AUTOMATION` otherwise). |
| List what can be started | `GET /v1/automations/triggers`, `GET /v1/automations` |
| Events back | Webhooks `email.sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `failed`, `opened`, `clicked`. Svix signatures, at-least-once, retried for about a day. No reply or unsubscribe event. |
| Unsubscribes | `/v1/domains/{domainId}/unsubscribes` (list, add, remove, export) |
| Limits | 60 fires a minute, 100 contact upserts a minute, 100 reads a minute; 429 with `Retry-After` |

Not confirmed yet: the full body fields for contacts and the credit cost of each call (the per-endpoint pages and the
credits page weren't read). Part 1 reads them before any code.

## Part 1. Connect Brew

- Settings › Integrations › Brew: paste the API key (Brew has no OAuth), checked with `GET /v1/brand`, kept sealed like
  Klaviyo's key (`src/lib/sources/email.ts`). The brand's name and logo show on the connection.
- An org key asks which brand, from `GET /v1/brands`.
- A webhook is made in Brew for this workspace (`POST /v1/webhooks`) with the events above; its secret is kept sealed.

## Part 2. Form fills become Brew contacts

- Brew joins **Send to a tool** in a form's Ending, with the logo, like Mailchimp and Klaviyo: every fill upserts the
  contact (`POST /v1/contacts`) with the form's answers mapped to Brew fields (`/v1/fields`), plus consent.
- A fill that didn't consent to marketing goes over without marketing consent, by the region rules in
  `src/lib/contacts/region.ts`.

## Part 3. Workflows start Brew automations

- A new step, **Start Brew automation**, in Workflows (`src/lib/workflows/types.ts`, group Outside): pick one of the
  team's published Brew automations by name (`GET /v1/automations/triggers`), and the step fires it for the contact with
  their answers in the payload.
- The `Idempotency-Key` is the workflow run and step id, so a retried step never starts the nurture twice.
- A form's Ending gets the same as a Follow-up choice: "Start a Brew nurture when they send it" or "when they don't
  book".
- An automation that isn't published shows as "Publish it in Brew first" on the step, and the workflow check stops
  Publish.

## Part 4. Brew's events come back

- `email.opened` and `email.clicked` land on the contact's activity; **Event wait › Email clicked** works for Brew emails
  too, so a workflow can wait for a click and branch.
- `email.bounced` and `email.complained` stop Claritia's own emails to that address.
- Booking ends a Brew nurture: when the lead books, Claritia removes them from the Brew audience the workflow used (or
  fires the team's "booked" trigger), so nobody gets "book a call" emails after booking.
- Unsubscribes go both ways once a day through `/v1/domains/{domainId}/unsubscribes`.

## Reliability tests (CLAUDE.md, reliability first)

- A fire retried after a timeout uses the same key: one nurture.
- 429 waits `Retry-After`, then goes; a batch over the limit is spread out, never dropped.
- A webhook delivered twice (same `svix-id`) is counted once; a bad signature or one older than five minutes is refused.
- A revoked key turns the connection to "Sign in again" and the step to a clear error, never a silent skip.
- A paused or deleted Brew automation: the step reports it and the run moves on.

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| API calls and webhooks (VPS already paid for) | $0 | $0 |
| Claude tokens | none | none |
| **Added per month to Claritia's bill** | **$0** | **$0** |

Brew itself is the customer's own plan, from brew.new/pricing: Growth $99 a month (50,000 sends, 10,000 AI credits),
Pro $249 a month (200,000 sends), Enterprise from $999 a month, with a 7-day trial. Brew's credits per API call:
check.

## Build order

1. Part 1 and Part 2 (connect, contacts from forms). Small.
2. Part 3 (the workflow step and the Ending choice). Medium.
3. Part 4 (events back, booking ends the nurture, unsubscribes). Medium.
