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
| Gmail | Built (Next step 6): workflow and meeting emails from a team member's own Gmail or Outlook | Google's app check for the gmail.send scope |
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

### 3. Text messages: SMS reminders and WhatsApp (built)

- **What:** a Text message step and a WhatsApp message step in workflows, for meeting reminders, no-show follow-ups
  and notes after a fill, and a Text reminders template (a text an hour before each meeting, by email when it can't
  go).
- **Where:** Workflows › the step list (Text message, WhatsApp message). A form gets a Text consent box from Form
  Studio's Add list (Choices); a booking page gets a Text consent question (Meetings › the type's questions). A team's
  own Twilio connects in Settings › Integrations (account SID, auth token, number or Messaging Service SID, and a
  WhatsApp sender).
- **How:** a text goes only to a contact whose latest text consent is granted, to a mobile kept as E.164; the
  consent is kept with the words they saw (`129_texts.sql`). Each step writes one message per run and queues a
  `text_send` job (`worker-intel/jobs/texts.ts`), which checks again when it sends: consent, STOP to that sender, and
  a reminder's meeting still on at the same time. Every text ends with "Reply STOP to opt out." unless it says STOP
  already, and the editor counts its messages. Texts go from the team's Twilio when connected, else Claritia's
  toll-free number; WhatsApp needs the team's (its approved templates live there; a step names its Content SID and
  its variables). Twilio's 429 and 5xx try again; after two tries, or a refusal that won't change, the step's email
  goes instead when it has one. A send with no answer is unknown and never sent again. Replies at
  `/api/texts/inbound`: STOP and the other stop words stop texts from that number, START lets them go, HELP answers.
  Delivery answers at `/api/texts/status`. Both check Twilio's signature with the account's own token. Code:
  `src/lib/texts`, `src/lib/sources/twilio.ts`.
- **Tests:** `tests/texts.test.ts`: the words, segments and keywords; the step checks; consent from the form and the
  booking page; each Twilio answer; signatures; a number that replied STOP, a canceled or moved meeting and no
  consent get nothing; a 429 sends once; failing twice sends the email; no answer is never sent again; Twilio's own
  STOP is kept; WhatsApp on the team's Twilio. `tests/pg/texts.pg.ts`: consent and a mobile needed, once per run and
  step, the latest consent counts, STOP and START, delivered never turns back.
- **To go live:** run `129_texts.sql`. On claritia-intel, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
  `TWILIO_FROM` (the verified toll-free number) or `TWILIO_MESSAGING_SID`; on claritia-web, the same SID and token
  for the webhooks. Point the number's incoming messages at `https://app.tryclaritia.com/api/texts/inbound`
  (`docs/forms-setup.md`). Toll-free verification is free (check).

### 4. More CRMs: Zoho CRM, Dynamics 365, GoHighLevel, Freshsales, Copper, Keap, monday CRM (built)

- **What:** a form sends each lead to them, with no duplicates and a link back to the record in the form's
  Submissions, like Pipedrive and Close.
- **Where:** form › Sync, with the connection in Settings › Integrations. Zoho CRM, Dynamics 365, GoHighLevel and
  Keap sign in; Freshsales (its address and API key), Copper (API key and the person's Copper email) and monday CRM
  (API token, and the Leads board's link when it isn't named Leads) take keys.
- **How:** each is a connector in `src/lib/sources/moreCrms.ts` on the same find-or-make shape: the person is found
  by email first, so the same person twice is one record and a retry after a lost answer updates the record it made.
  GoHighLevel, Freshsales and Keap use their own create-or-update by email. Zoho and Dynamics make Leads; the others
  make contacts (monday CRM: an item on the Leads board, with email and phone by column type and job title and
  company by column name). A record deleted on their side comes back gone, and the delivery makes it again. Zoho
  signs in once for every data center: its accounts server comes back with the sign-in and every refresh goes there
  (`server` in `src/lib/sources/oauth.ts`), with Zoho's own "Zoho-oauthtoken" header. Dynamics signs in to
  Microsoft's discovery service on the Microsoft app meetings use; the first environment the person can open is the
  connection, and each run gets a token for that address from the same sign-in. GoHighLevel keeps the sub-account
  picked at sign-in. Fields are the standard ones (email, first and last name, phone, job title, company); linking a
  form's other questions to custom CRM fields stays with HubSpot and Salesforce.
- **Tests:** `tests/moreCrms.test.ts`: the same person twice is one record for each; a deleted record comes back
  gone; Zoho's data center, header word and a token that expires mid-run refreshing and going on; Dynamics' token
  for its own address, once a run; a 503 tried again and one bad row never stopping the rest; each link back.
- **To go live:** register an app with Zoho (one app for every data center; `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`),
  GoHighLevel's Marketplace (`GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, sub-account install) and Keap (`KEAP_CLIENT_ID`,
  `KEAP_CLIENT_SECRET`), with Claritia's sign-in return address `https://app.tryclaritia.com/api/sources/callback`.
  Add Dynamics CRM's `user_impersonation` permission to the Microsoft app. Endpoints, fields and record links are
  checked against a real account of each before launch (check).

### 5. Chat alerts: Microsoft Teams and Discord (built)

- **What:** an alert in a Teams or Discord channel for each fill, beside Slack, and a Teams or Discord message step
  in workflows (for bookings, cancellations and the rest).
- **Where:** connect in Settings › Integrations, then form › Sync (Teams: pick the channel) and the workflow step
  list (Teams or Discord message). Teams signs in on the Microsoft app meetings use. Discord's Add to Discord picks
  a server's channel and hands back its webhook, so a connection is one channel; a channel's webhook address can be
  pasted when Claritia's Discord app isn't set up.
- **How:** both are connectors with an `alert` (`src/lib/sources/chat.ts`), so a form's fills go through the same
  deliveries, retries and Send again as every other tool. The message is the Slack alert's line and rows with a link
  to the form in Claritia (`src/lib/chat/note.ts`): Teams gets a channel message in its HTML through Microsoft Graph
  (each answer up to 1,000 characters, under 20,000 in all); Discord gets one embed (25 fields of 1,024 characters,
  6,000 in all), with mentions turned off, so an answer can never ping a channel. A deleted channel or webhook fails
  with what to do; a Discord 429 waits for its Retry-After, or goes back to the jobs queue when it's long. A workflow
  post that may have half-sent after a crash isn't sent again.
- **Tests:** `tests/chat.test.ts`: each tool's limits with cut answers and the link; escaping; the Teams channel
  list and post address; a deleted channel or webhook; a short and a long Discord 429; the webhook kept from Add to
  Discord; the workflow step's checks.
- **To go live:** add the Teams scopes (Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Send) to the
  Microsoft app; register a Discord app with the `webhook.incoming` scope and the return address
  `https://app.tryclaritia.com/api/sources/callback` (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`). Admin consent
  may be needed for ChannelMessage.Send in some Microsoft tenants (check).

### 6. Sending as the host: Gmail and Outlook (built)

- **What:** workflow emails "from their owner" and meeting emails to a host's guests (confirmations, changes,
  cancellations, reminders, no-show follow-ups, Pick a time) go from the team member's own Gmail or Outlook, so
  replies land in their inbox.
- **Where:** Meetings › Availability › My calendar, "Email from you": Connect Gmail or Connect Outlook, then
  Reconnect when it needs it, and Disconnect.
- **How:** each person's mailbox is kept sealed (`130_mailboxes.sql`), signed in on the Google app with `gmail.send`
  (a sensitive scope, so Google's free app check covers it) or the Microsoft app with `Mail.Send`. The email is
  built the same way (the same MIME, the invite included) and sent whole through Gmail's send or Graph's sendMail,
  from the mailbox's address with the sender's name (`src/lib/mailbox`). The send job sends a round's mailbox
  emails one by one and the rest on Resend as before (`mailboxRound` in `worker-intel/jobs/email.ts`); meeting
  emails do the same in `sendOne` (`worker-intel/jobs/meetings.ts`). Each mailbox is held to a daily limit a little
  under its provider's (Gmail 450, Outlook 2,000, check): a workflow email waits until the oldest send of the last 24
  hours is a day old, without using a try, while the round goes on; a meeting email goes from the team's address
  instead of waiting. A refresh the provider refuses (or a 401 right after a fresh token, or Gmail's insufficient
  scopes) turns the mailbox to Reconnect: that email and the next go from the team's domain on Resend, and the
  person gets one email per break. A 429 or 5xx is tried again (the workflow email's usual three tries); a send with
  no answer is unknown and never sent again, like Resend's. Before 130 runs, everything sends as it did.
- **Tests:** `tests/mailbox.test.ts`: each provider's format; refresh before expiry and on a 401; a refused
  refresh, insufficient scopes, 5xx, timeout and 400; the daily limit's wait; a revoked sign-in falling back and
  telling once for two emails in a row; a 5xx tried again and sent once; the From and List-Unsubscribe kept.
  `tests/pg/mailboxes.pg.ts` on a real Postgres: an owner's email from Gmail and the team's on Resend in one round;
  a full mailbox holding without a try; a broken sign-in on Resend, told once, cleared by a reconnect; the owner
  named by the workflow step and the old call still working.
- **To go live:** run `130_mailboxes.sql`. Add `gmail.send` to the Google app's consent screen and `Mail.Send` to
  the Microsoft app, with the return address `https://app.tryclaritia.com/api/mailbox/callback` on both.

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

### 11. Documents and signing: Google Docs, DocuSign, PandaDoc (built)

- **What:** each fill makes a document from the team's own template: a Google Doc filled with the answers, a
  DocuSign envelope sent to the person to sign, or a PandaDoc document sent to them.
- **Where:** connect in Settings › Integrations (Google Docs and DocuSign sign in; PandaDoc takes an API key), then
  form › Sync: paste the template doc's link for Google Docs, or pick the template for DocuSign and PandaDoc. Each
  fill's document links from the form's Submissions.
- **How:** connectors with a `document` (`src/lib/sources/documents.ts`), sent through the same deliveries, retries
  and Send again as every other tool. Tags in the template are `{{Question label}}` (or the question's key), plus
  `{{email}}`, `{{name}}` and `{{date}}`, in any case and spacing (`src/lib/documents/tags.ts`). A tag with no answer
  is left blank and named in the delivery's note.
  - Google Docs reads the template, makes a new doc named for the form and the person, and writes the text with the
    tags filled. It keeps each paragraph's heading style and each word's bold, italic and underline. Tables,
    pictures, lists, colors and fonts are left out of the new doc. The new doc is marked with the fill, so a retry
    finds it and never makes a second one.
  - DocuSign sends an envelope from the template to the person as its first signer role. Text tabs whose labels
    match a question's label get the answer. A retry looks for the envelope by the fill first.
  - PandaDoc makes a document from the template with the answers as tokens and the person as recipient. It takes a
    few seconds to become a draft, so the delivery waits 5 seconds and tries again, then sends it once. A retry
    finds the document by the fill.
  - A template that's gone, or a fill with no email for a signing tool, fails with what to do.
  - Left out for now: a signed document starting a workflow (DocuSign Connect and PandaDoc webhooks). The plan
    keeps it for later.
- **Tests:** `tests/documents.test.ts`: tags filled, missing ones blank and listed; the Google Doc's text, styles and
  a tag split across styles; each tool's requests; a retry finding the doc, envelope or document with nothing made
  twice; PandaDoc's draft waited for and sent once; a gone template.
- **To go live:** add the Docs (`documents`) and `drive.file` scopes to the Google app's consent screen (both
  sensitive, so Google's free app check covers them, check). Register a DocuSign app (`DOCUSIGN_CLIENT_ID`,
  `DOCUSIGN_CLIENT_SECRET`) with the return address `https://app.tryclaritia.com/api/sources/callback`; it goes
  through DocuSign's go-live review, free (check). PandaDoc needs nothing on the server.
- **Monthly cost:** $0 at Beta (50 teams) and $0 at Growth (500 teams). Each tool runs on the team's own account.

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
| Gmail and Outlook send (built): `gmail.send` is a sensitive scope, so Google's app check is free (check) | $0 | $0 |
| SMS: Twilio $0.0083 a segment plus carrier fees of about $0.0045, and a toll-free number at about $2.15 (check). 1,200 and 12,000 texts | about $18 (check) | about $165 (check) |
| WhatsApp: on the team's own Twilio, so Twilio's $0.005 a message and Meta's template fee are the team's (check) | $0 | $0 |
| Files copied out of Supabase Storage: about 1 GB and 12 GB, inside the 250 GB included (check) | $0 | $0 |
| One more small worker machine for the extra sends (check) | $0 | about $5 (check) |
| **Added per month** | **about $18** | **about $170** |

With texts sold as a paid add-on (or sent on the team's own Twilio), the added cost is $0 at Beta and about $5 at
Growth. One-time costs: the Shopify App Store listing fee, about $19 (check). Listing on Zapier, Make, Activepieces,
WordPress, Webflow, Framer and GoHighLevel is free (check). Google's app check for the Sheets, Drive and Docs scopes
is free (check).
