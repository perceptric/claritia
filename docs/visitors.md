# Visitors

Nurture › Visitors: everyone on the site, from first click to booked demo. It replaced Segments in the sidebar;
Segments is a tab in Contacts.

## The list

- One row per device (`visitors_list`, `supabase/migrations/102_visitors.sql`), newest first, 50 at a time.
- Unknown visitors get a fun name from their device id, like Funny Capybara (`src/lib/visitors/names.ts`: 200
  adjectives × 200 nouns, 40,000 names, the same device always the same name). No emoji: the avatar is the two
  initials on a tone.
- Known visitors show the person's name with the fun name beside it, and a Known tag. All, Known and Unknown switch
  the list (`visitors_counts` counts the last 90 days).
- Each row: where they came from (campaign source, the site that sent them, or Direct), the landing page, the city,
  visits, pages and last seen.

## One visitor

`/visitors/<device>` (`visitor_journey`): newest first, each visit with its source and campaign, its pages, clicks,
form sends and custom events; the proof that linked the visitor (a form, a booking, a sign-in), shown only when the
stitcher used it; and, once known, what they did as a contact (forms, bookings, cancels, email clicks, routing).
**Open contact** goes to the person.

## Identity stitching

The rules are `docs/identity.md`. A device links to a person only on solid proof:

- **A form** on the site: the inline embed calls `claritia("form", email)`; the iframe embed's loader does the same
  when the form posts `claritia-form-done` (`src/lib/forms/render.ts`).
- **A booking** on the site: the booking embed posts the guest's email with `book:booked`; the page's tracking calls
  `claritia("booking", email)` (`src/lib/meetings/bookElement.ts`), which collect saves as `booking` evidence, the
  same level as a form (`collect/app.ts`). Tested in `tests/collect.test.ts` and `tests/pg/inboundNurture.pg.ts`.
- **A signed-in user** on the customer's app: `claritia.identify()`.

Then the stitch job links the device; earlier visits are backfilled onto the person (within the consent rules), so
the contact's timeline holds the whole journey. Email clicks don't link a device yet.

## Consent

Nothing new is collected. Only visits with full policy make a device, so only they become visitors:

- Where the law asks for consent (strict regions), nobody gets a device or a journey until they agree; before that
  the visit is counted without cookies.
- A denial, Global Privacy Control or an opt-out keeps them cookieless; the device cookie is deleted.
- Internal and opted-out devices, and devices seen only as bots, never show.

## Monthly cost

No new service and no AI call: the collect service already runs, and the screens read what it already stores.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
