# Integrations: what's built and what to build

Every integration on Fillout's list (fillout.com/integrations, Nov 2026), checked against Claritia's code. 55 in all:
21 built, 8 half built, 26 not built.

- **Built**: works today.
- **Half built**: part of it is there (the sign-in and the tool's client, or a way through the webhook); the missing
  part is named.
- **Not built**: nothing yet.

## Built (21)

| Integration | In Claritia today | Where |
|---|---|---|
| HubSpot | A form sends each lead, fields mapped, no duplicates, a link back to the record | `src/lib/sources/hubspot.ts`, form › Sync |
| Salesforce | The same | `src/lib/sources/salesforce.ts` |
| Pipedrive | The same | `src/lib/sources/crms.ts` |
| Attio | The same | `src/lib/sources/crms.ts` |
| Slack | Add to Slack; team alerts on a fill and a Slack step in workflows | `src/lib/slack`, `src/lib/delivery/send.ts` |
| Webhook | A signed POST of each fill, from a form or a workflow step | `src/lib/delivery/send.ts` |
| Stripe | A payment block in forms (Checkout on the workspace's own Stripe), paid meeting types | `src/app/api/forms/[id]/submit`, `src/lib/meetings/pay.ts` |
| Calendly | Book from a form with Calendly; Calendly bookings come in by webhook | Studio › On submission, Settings › Integrations |
| Cal.com | The same | The same |
| Google Calendar | Claritia's own scheduler: busy times, events, Meet links (also Outlook, Teams meetings, Zoom) | `src/lib/meetings/providers` |
| reCAPTCHA | Covered by Cloudflare Turnstile and the spam trap on every form and booking page | `src/lib/forms/element.ts` |
| Mailchimp | A form adds each lead to the audience picked, with tags and consent (step 1) | `src/lib/sources/email.ts`, form › Sync |
| Klaviyo | The same, to a list | The same |
| ActiveCampaign | The same, with tags | The same |
| Brevo | The same, to a list | The same |
| Google Sheets | A row per fill in a new sheet or one from its link; new questions add columns (step 2) | `src/lib/sources/rows.ts`, form › Sync |
| Airtable | A record per fill in the table picked; missing fields are made (step 2) | The same |
| Notion | A database entry per fill, each value as its column's type (step 2) | The same |
| PostgreSQL | A row per fill in a table named in the Sync tab, made if missing (step 2b); reads as before | `src/lib/sources/dbRows.ts`, form › Sync |
| MySQL | The same | The same |
| Excel Online | A row per fill in a ClaritiaFills table on its own sheet, in a workbook picked or linked (step 2c) | `src/lib/sources/excel.ts`, form › Sync |

Also built, not on Fillout's list: Close and Omniscient (send leads), Typeform, Tally and Webflow forms (fills come in by
webhook), HubSpot Meetings and SavvyCal (book from a form by link).

## Half built (8)

| Integration | What's there | What's missing |
|---|---|---|
| Intercom | Key and the client (reads contacts) | Make a contact, and a conversation or ticket, per fill |
| Zapier | Works now through the Webhook (paste a Zapier Catch Hook address) | A listed Zapier app: a Forms API with API keys and subscribe hooks; triggers New fill and New booking |
| Make | The same, through the Webhook | A listed Make app on the same API |
| Activepieces | The same, through the Webhook | A listed piece on the same API |
| Microsoft Teams | Teams meetings as a meeting location | Fill alerts in a Teams channel |
| Gmail | Emails go from the workspace's verified domain (Resend) | Send workflow emails from a team member's own Gmail |
| Google Docs | A PDF copy of each fill | A Google Doc from a template, filled with the answers |
| Google Tag Manager | The form's events (`claritia:submitted`, `:booked` and the rest) bubble on the page, so a GTM trigger can catch them | Push them to `dataLayer` by itself, with a Tracking section in form Settings |

Kit and MailerLite take leads too (not on Fillout's list).

## Not built (26)

| Integration | What to build |
|---|---|
| SmartSuite | A record per fill |
| Monday.com | An item per fill on a board |
| ClickUp | A task per fill |
| Linear | An issue per fill |
| Trello | A card per fill |
| Zendesk | A ticket (and the user) per fill |
| Freshdesk | A ticket per fill |
| Discord | Fill alerts in a channel (its webhook address) |
| Google Analytics | GA4 events on view, start, fill and booking, after consent where it's needed |
| Meta Pixel | Lead and Schedule events, after consent |
| Google Ads | A conversion on a fill or a booking, with the click id |
| Google Drive | Each upload copied into a chosen folder |
| OneDrive | The same |
| Dropbox | The same |
| Box | The same |
| Amazon S3 | The same, into the team's bucket |
| Google Forms | Import a Google Form as a Claritia form |
| Twilio | A text-message code on phone questions, on the workspace's own Twilio |
| SendGrid | Send Claritia's emails through the team's SendGrid |
| PayPal | A PayPal option in the payment block |
| Square | A Square option in the payment block |
| Firebase | A document per fill (reachable today through the Webhook) |
| MongoDB | A document per fill (the same) |
| GraphQL | A mutation per fill (the same) |
| SAP | An entry per fill in SAP (the same) |
| Clearbit | Enrichment was removed from Claritia (migration 116), and Clearbit is part of HubSpot now; new API access is closed (check) |

## Build order

Each step is one piece of work, on the parts that already exist: destinations on a form (form › Sync), steps in
workflows, the jobs queue with retries and the sync log, and Settings › Integrations for signing in.

1. **Email lists** (built): Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit and MailerLite take form leads. In the
   form's Sync tab: the list (Mailchimp's audience, Kit's form, MailerLite's group), tags (Mailchimp, ActiveCampaign,
   Kit), and Subscribe: who ticked consent (the default) or everyone. Without consent Mailchimp keeps the person as
   transactional and Klaviyo adds them to the list unsubscribed; the tools that only hold subscribers leave them out,
   and the delivery says why. An existing person's subscription is never changed. The same person filling a second
   form still joins that form's list. Code: `src/lib/sources/email.ts` (Lists), `src/lib/delivery`, the Sync tab's
   `ListPane`, `/api/forms/tool-lists`; tests in `tests/emailLists.test.ts` and `scripts/formpage-check.ts`. A
   workflow step that adds to a list comes with the other workflow steps.
2. **Sheets and databases**: a row or record per fill, with or without an email.
   - **Google Sheets, Airtable, Notion** (built). In the form's Sync tab: Google Sheets makes a new sheet for the form
     (named after it, a Fills tab, the header row frozen) or takes one's link; Airtable and Notion pick a table or
     database from their own list. The first columns are Sent at, Fill ID and Form, then one per question by its label,
     and where the fill came from (page, UTM, click ids) when known. A question added later adds a column at the end;
     columns the team moved or added stay put. Airtable gets missing fields as long text; Notion gets them as text and
     fills each value as its column's type (a value the column can't hold is left out). Values go into Sheets as plain
     text, so an answer that starts with "=" never runs. A run after a timeout looks for its Fill ID first and adds no
     second row. A sheet that's gone fails with the tool's words; down or rate limited tries again. Code:
     `src/lib/sources/rows.ts`, `src/lib/delivery/fillRow.ts`, `toRow` in `src/lib/delivery/send.ts`, the Sync tab's
     `RowsPane`, `/api/forms/tool-targets`; tests in `tests/sheetRows.test.ts` and `scripts/formpage-check.ts`. Setup:
     `docs/sources-setup.md` (the Sheets API, scope and return address on the Google app).
   - **PostgreSQL, MySQL** (built). In the Sync tab: a table name, suggested from the form's (`book_a_demo_fills`). The
     table is made when it's picked (fill_id as its key, sent_at, form), so a name or grant that can't work shows
     there and not on the first fill. Each question adds a text column named from its label (Work email →
     work_email); columns the team added or changed stay as they are. Values are bound by the driver; names are
     letters, digits and _ only (Postgres may add a schema, `crm.leads`). A fill sent twice is one row, ten fills at
     once on a new table make one table and ten rows, and a table the team made without a key on fill_id still gets
     one row per fill. A wrong password says sign in again; the database down or slow tries again. The connect grant
     now allows making the table (`create` on the schema in Postgres; `insert, create, alter` in MySQL). Code:
     `src/lib/sources/dbRows.ts`; tests in `tests/dbRows.test.ts` (MySQL on a fake connection) and
     `tests/pg/dbRows.pg.ts` (a real Postgres).
   - **Excel Online** (built). In the Sync tab: pick a workbook from OneDrive or paste one's link (OneDrive or
     SharePoint). The first fill makes a "Claritia fills" sheet with a ClaritiaFills table, so the team's own sheets
     are never touched. Rows go in with the table's own add, which never overwrites a row another fill wrote at the same
     moment. A question added later adds a column at the end (an Excel that names it Column4 gets the header written).
     Two first fills at once make one table; a run again looks for its Fill ID first; a value that starts with =, +, -
     or @ gets Excel's ' text mark. A deleted workbook fails with what to do. Uses the Microsoft app meetings use, with
     `Files.ReadWrite` added. Code: `src/lib/sources/excel.ts`; tests in `tests/excelRows.test.ts`. Graph endpoints
     check against a real account (check).
3. **The rest**: the plan below, in its own order.

## Next: the missing integrations

Each one below names what it does, where it lives, how it's built on the parts that exist, and the flaky cases its
tests cover. Every send is a job on the claritia-intel worker with retries and the sync log, like the built ones. A
tool that's down or rate limited tries again with growing waits; a wrong or revoked sign-in stops and says sign in
again; a run after a timeout looks for its Fill ID first and makes no second record.

### 1. Forms API, Zapier, Make and Activepieces (about 1 week)

- **What:** listed apps on Zapier, Make and Activepieces with the triggers New fill, New booking, Booking canceled and
  Lead routed, and the actions Find fill and Add contact to workflow.
- **Where:** Settings › Integrations shows each app with "Connect"; the app signs in with OAuth (the Claritia approve
  page). API keys stay under Settings › API keys (`src/app/api/keys`).
- **How:** a Forms API at `/api/v1/forms` (list forms, read fills, read bookings) and REST hooks at `/api/v1/hooks`
  (subscribe and unsubscribe, the way Zapier's REST hooks ask). Hook sends reuse the signed Webhook send in
  `src/lib/delivery/send.ts`. A hook that answers 410 is removed; one that fails for 3 days is paused and the team is
  told once.
- **Tests:** a hook that times out twice and then takes the send gets one fill; two subscribes for the same address
  make one hook; a fill from before the subscribe is never sent; a sample fill answers the app's test step.

### 2. Tracking: Google Analytics, Google Tag Manager, Meta Pixel, Google Ads (about 1 week)

- **What:** form events go to the team's own tags: view, start, fill and booking.
- **Where:** form › Settings › Tracking: GA4 measurement id, GTM on or off, Meta Pixel id with a Conversions API
  token, Google Ads conversion (signed in with Google).
- **How:** the form script pushes `claritia_view`, `claritia_start`, `claritia_submit` and `claritia_booked` to
  `dataLayer` and calls `gtag` and `fbq` when they're on the page. Nothing loads before consent where the page has a
  consent tool (Google Consent Mode). The server sends Meta's Conversions API event with the
  same event id, so the pixel and the server count once. Google Ads gets an offline conversion from the gclid the form
  already keeps (`src/lib/forms/submit.ts`). The size check on `v1.js` still holds; the tracking code is about 1 KB.
- **Tests:** a blocked pixel never stops a send; the browser and server events share one id; no event before
  consent; a gclid older than 90 days is skipped with its reason in the log.

### 3. Text messages: SMS reminders and WhatsApp (about 1 week)

- **What:** a Text message step in workflows (meeting reminders, no-show follow-ups, a note after a fill) and a
  WhatsApp message step on approved templates.
- **Where:** Workflows › the step list; Meetings › Reminders gets "Text" beside "Email". Texts go only to people who
  ticked the text consent on the form or booking page.
- **How:** Twilio on Claritia's own account with a toll-free number (verified once), or the team's own Twilio from
  Settings › Integrations. STOP and HELP replies are kept per number and checked before every send. WhatsApp uses
  Twilio's WhatsApp sender with the team's approved templates. Phone numbers are kept as E.164 (`e164` in
  `src/lib/forms/codes.ts`).
- **Tests:** a person who replied STOP gets nothing; a reminder for a canceled or moved meeting is never sent; a
  Twilio 429 tries again; a text that fails twice falls back to the email reminder.

### 4. More CRMs: Zoho CRM, Dynamics 365, GoHighLevel, Freshsales, Copper, Keap, monday CRM (about 1 week)

- **What:** a form sends each lead, fields mapped, no duplicates, a link back to the record, like HubSpot.
- **Where:** form › Sync, with sign-in in Settings › Integrations.
- **How:** each is a client in `src/lib/sources/crms.ts` on the same find-or-make shape. Zoho picks its data center
  (US, EU, IN, AU) at sign-in. Dynamics uses the Microsoft app meetings use, with the Dynamics scope added.
  GoHighLevel uses its marketplace app with the location picked at sign-in.
- **Tests:** the same person twice is one record; a field the team deleted in the CRM is skipped with its name in the
  log; a token that expires mid-run refreshes and goes on.

### 5. Chat alerts: Microsoft Teams and Discord (about 3 days)

- **What:** fill and booking alerts in a channel, beside Slack, from a form or a workflow step.
- **Where:** form › Sync and the workflow step list.
- **How:** Teams posts with Microsoft Graph (`ChannelMessage.Send`) on the Microsoft app meetings use, with the team
  and channel picked from a list. Discord uses its "Add to Server" sign-in, which hands back the channel's webhook.
  The message is the Slack alert's card in each tool's format.
- **Tests:** a deleted channel fails with what to do; a Discord 429 waits for its `retry_after`; long answers are cut
  to the tool's limit with the link to the full fill.

### 6. Sending as the host: Gmail and Outlook (about 4 days)

- **What:** workflow emails and meeting emails go from the team member's own mailbox, so replies land there.
- **Where:** Settings › Profile › Email, "Connect Gmail" or "Connect Outlook".
- **How:** Gmail's `gmail.send` scope (a sensitive scope, so Google's free app check covers it) and Graph's
  `Mail.Send` on the Microsoft app. A mailbox that's disconnected sends from the workspace's domain on Resend, as
  today. Each mailbox is held to its provider's daily limit.
- **Tests:** a revoked token falls back to Resend and tells the member once; a send near the daily limit waits for
  the next day; a 5xx from Gmail tries again and sends once.

### 7. Site apps: WordPress, Webflow, Framer, Shopify (about 1 week)

- **What:** add a Claritia form or booking page from inside the site builder.
- **Where:** each tool's own app store, signed in with the Claritia approve page.
- **How:** a WordPress plugin with a block and a shortcode; a Webflow app and a Framer plugin that drop the embed; a
  Shopify app block for themes. Each one places the same embed the Share tab gives today.
- **Tests:** an embed with a wrong form id shows nothing and logs once; a page with two forms keeps both; the
  plugin works on the last 3 WordPress versions.

### 8. Product analytics: Segment, PostHog, Mixpanel, Amplitude (about 3 days)

- **What:** fill and booking events with the person's email as their id, on the team's own key.
- **Where:** form › Sync, and a workflow step.
- **How:** server-side calls to each tool's HTTP API, from the same job as the other sends.
- **Tests:** the same fill sent twice has one event id; a wrong key stops with sign in again.

### 9. Files: Google Drive, OneDrive, Dropbox, Box, Amazon S3 (about 1 week)

- **What:** each upload copied into a chosen folder, in a subfolder per fill.
- **Where:** form › Sync.
- **How:** a job reads the file from Supabase Storage and writes it with the tool's upload (in chunks over 4 MB).
  Drive asks only for `drive.file`. S3 uses the team's bucket with a key that can only write.
- **Tests:** a file over 100 MB uploads in parts and a lost part is sent again; a run after a timeout finds the file
  first and makes no copy.

### 10. Work tools: Linear, Trello, ClickUp, Monday.com, SmartSuite, Zendesk, Freshdesk, Intercom (about 1 week)

- **What:** a task, card, issue, item or ticket per fill, with the answers in its body.
- **Where:** form › Sync, and a workflow step.
- **How:** one shape for all: pick the board, list or project; map the title and fields. Zendesk, Freshdesk and
  Intercom also find or make the person.
- **Tests:** the same as the CRMs.

### 11. Documents and signing: Google Docs, DocuSign, PandaDoc (about 1 week)

- **What:** a Google Doc from a template, filled with the answers; a DocuSign or PandaDoc document sent to sign after
  a fill or a booking.
- **Where:** form › Sync, and a workflow step.
- **How:** `{{Question}}` tags in the team's template are filled with the answers. DocuSign goes through its free
  go-live review (check). A signed document can start a workflow.
- **Tests:** a missing tag is left blank and logged; a template that's gone fails with what to do.

### 12. Meetings and payments: Webex, Whereby, PayPal, Square (about 1 week)

- **What:** Webex and Whereby as meeting locations with a link per booking; PayPal and Square as payment options in
  the payment block and paid meeting types.
- **Where:** Meetings › Locations and the payment block's settings.
- **How:** new providers in `src/lib/meetings/providers` and payment options beside Stripe in `src/lib/meetings/pay.ts`.
  Prices are checked on the server, like Stripe.
- **Tests:** a booking whose link fails to make keeps the booking and retries the link; a payment the page never
  confirmed is checked by the server before the fill counts as paid.

### 13. Imports and the rest: Google Forms import, Firebase, MongoDB, GraphQL, SAP

- **What:** import a Google Form as a Claritia form. Firebase, MongoDB, GraphQL and SAP stay reachable through the
  Webhook and Zapier.
- **How:** the Google Forms API reads the questions; each type maps to a Claritia field, and the ones with no match
  come in as Short answer with a note in the import log.

## Monthly cost

Assumptions per team a month: 300 fills and 60 meetings. SMS on 20% of teams, 2 texts a meeting (120 texts).
WhatsApp on 5% of teams, 120 messages. The tools' APIs are free on their side or run on the team's own account
(the CRMs, the payment tools, S3, Twilio when the team brings its own). The sends are jobs on the claritia-intel
worker. No Claude calls.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Steps 1, 2, 4, 5, 7 to 13 (APIs free or on the team's account) | $0 | $0 |
| Gmail and Outlook send: `gmail.send` is a sensitive scope, so Google's app check is free (check) | $0 | $0 |
| SMS: Twilio $0.0083 a segment plus carrier fees of about $0.0045, and a toll-free number at about $2.15 (check). 1,200 and 12,000 texts | about $18 (check) | about $165 (check) |
| WhatsApp: Twilio $0.005 a message plus Meta's utility template fee, about $0.0034 (check). 360 and 3,000 messages | about $3 (check) | about $25 (check) |
| Files copied out of Supabase Storage: about 1 GB and 12 GB, inside the 250 GB included (check) | $0 | $0 |
| One more small worker machine for the extra sends (check) | $0 | about $5 (check) |
| **Added per month** | **about $21** | **about $195** |

With texts sold as a paid add-on (or sent on the team's own Twilio), the added cost is $0 at Beta and about $5 at
Growth. One-time costs: the Shopify App Store listing fee, about $19 (check). Listing on Zapier, Make, Activepieces,
WordPress, Webflow, Framer and GoHighLevel is free (check). Google's app check for the Sheets, Drive and Docs scopes
is free (check).
