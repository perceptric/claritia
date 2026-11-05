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
| Zapier | The Forms API, sign-in, hooks and the app's code are built (Next step 1) | Publish the app from `integrations/zapier` and set its secret |
| Make | The same | Publish the app from `integrations/make` |
| Activepieces | The same | Publish the piece from `integrations/activepieces` |
| Microsoft Teams | Teams meetings as a meeting location | Fill alerts in a Teams channel |
| Gmail | Emails go from the workspace's verified domain (Resend) | Send workflow emails from a team member's own Gmail |
| Google Docs | A PDF copy of each fill | A Google Doc from a template, filled with the answers |
| Google Tag Manager | Built (Next step 2): form › Settings › Tracking pushes the form's events to `dataLayer` | Nothing |

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
| Google Analytics | Built (Next step 2) |
| Meta Pixel | Built (Next step 2), with the Conversions API |
| Google Ads | Built (Next step 2): the conversion tag and offline conversions |
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

### 1. Forms API, Zapier, Make and Activepieces (built; the apps wait to be published)

- **What:** apps for Zapier, Make and Activepieces with the triggers New fill (one form or all), New booking, Booking
  canceled and Lead routed, the search Find fill (by email), and the action Add contact to workflow.
- **Where:** Settings › Integrations shows each app with Connect, which opens the app's own Claritia page, and
  Disconnect once it's connected. Signing in from the app opens Claritia's approve screen (`/oauth/authorize`,
  `src/components/app/OAuthApprove.tsx`); Allow sends the person back with a one-time code. The app trades it at
  `/api/oauth/token` for an API key named after the app, so it also shows in Settings › API keys.
- **How:** the Forms API (`/api/v1`, a key as `Authorization: Bearer clr_...`, 120 calls a minute per key):
  `GET me`, `GET forms`, `GET workflows`, `GET events?event=&form=&email=&limit=&sample=1` (each trigger's sample,
  and Find fill), `POST hooks` and `DELETE hooks/<id>` (REST hooks), `POST workflows/<id>/contacts`. Hooks are
  meeting webhook endpoints an app made (`127_api_hooks.sql`): a fill and a routing result now write sends too, in
  the same transaction, and the `meeting_webhook` job sends them signed, with retries over 8 tries. A fill's body is
  built on its first try (5 seconds after the fill, with its contact and uploads in) and kept for every retry; its
  id is the fill's, so a receiver can drop a repeat. A hook whose address answers 410 Gone is removed. One that has
  failed for 3 days is paused, with the reason as its last error. Revoking the key removes its hooks. The Webhooks
  tab lists and counts only the hooks people made. Spam, test fills and fills past the plan's monthly fills never go.
  Sign-in codes work once for 10 minutes; a code used twice revokes the key it made; PKCE (S256) is checked when
  the app sends it. Code: `src/lib/hooks`, `src/lib/oauth`, `src/app/api/v1`, `src/app/api/oauth`,
  `worker-intel/jobs/webhooks.ts`. The apps: `integrations/zapier` (Zapier CLI), `integrations/make` (Make's app
  blocks), `integrations/activepieces` (a piece).
- **Tests:** `tests/apiHooks.test.ts`: a fill hook that times out twice and then takes it gets one fill with the same
  bytes each time; an app's hook that answers 410 is removed and a person's isn't; spam, held and deleted fills never
  go; only each app's own return address; PKCE. `tests/pg/apiHooks.pg.ts` on a real Postgres: one send per hook and
  fill, only its forms, none for spam or tests; routing sends; a revoked key takes its hooks; the 3-day pause; a code
  used twice.
- **To go live:** set `OAUTH_ZAPIER_SECRET`, `OAUTH_MAKE_SECRET` and `OAUTH_ACTIVEPIECES_SECRET` on claritia-web
  (`docs/sources-setup.md`), then publish each app with the same secret. Each app's return address is in
  `src/lib/oauth/clients.ts` (check against each app's settings when it's made).

### 2. Tracking: Google Analytics, Google Tag Manager, Meta Pixel, Google Ads (built)

- **What:** each form's views, starts, fills and bookings go to the team's own tags, after consent.
- **Where:** form › Settings › Tracking (`src/components/app/forms/Setup.tsx`): Google Tag Manager on or off, the
  GA4 measurement ID, the Meta Pixel ID with Conversions API on or off, the Google Ads conversion ID and label, and
  Offline conversions with the Google Ads account and conversion action picked from lists. Meta Conversions API and
  Google Ads connect in Settings › Integrations (a pasted system user token; Google sign-in on the calendars' Google
  app with the adwords scope).
- **How, in the browser:** the tracking code (`src/lib/forms/track.ts`) lives in the second file, `x1.js`, so `v1.js`
  grew by 132 bytes (43,975 of 45,056 gzipped). GTM gets `claritia_view`, `claritia_start`, `claritia_submit` and
  `claritia_booked`. GA4 gets the same, with `generate_lead` for the fill. Google Ads gets a conversion on the fill
  with the fill's id as its transaction id. Meta gets Lead and Schedule with the event ids the server uses (the fill's
  id, and `book_` plus it). A page's own `gtag` and `fbq` are used when they're there; otherwise Claritia loads them.
  With Google Consent Mode on the page, nothing loads and nothing goes to Meta or Google Ads until it's granted. With
  no consent tool, Claritia loads no tag of its own for visitors in strict regions. A tag that throws never stops the
  others or the form.
- **How, on the server:** a fill whose consent allows ad events keeps its browser details (address, browser, Meta's
  cookies, the page) for 30 days (`128_track.sql`) and gets a `track_send` job; a booking from it gets one more
  (`worker-intel/jobs/track.ts`). Meta's Conversions API gets Lead and Schedule with hashed contact details and the
  same event ids. Google Ads gets the fill as a click conversion (gclid, or gbraid and wbraid) with the fill's id as
  its order id, so a repeat is dropped. Down, slow or rate limited goes back to the jobs queue; a refusal is written
  to that connection's sync log. Code: `src/lib/track/server.ts`, `src/lib/sources/ads.ts`,
  `src/app/api/forms/ads-actions`.
- **Tests:** `tests/track.test.ts`: which tag gets which event; Consent Mode denied loads nothing; strict regions;
  a throwing tag; the event ids; hashing; Meta down four times then up, with the same id each try; a repeat upload
  Google already has counts as done; a refusal is logged and stops; no click id or no setup sends nothing.
  `tests/pg/track.pg.ts`: one event per fill, none for spam or tests, a booking event only after a kept fill, the
  30-day prune.
- **To go live:** run `128_track.sql`. For offline conversions: `GOOGLE_ADS_DEVELOPER_TOKEN` on claritia-web and
  claritia-intel (from a Google Ads manager account; basic access needs Google's approval, free (check)), and the
  adwords scope and Google Ads' return address on the Google app (`docs/sources-setup.md`). The API versions in
  `src/lib/track/server.ts` (Graph v21.0, Google Ads v22) need checking against each vendor's current one (check).

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
