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
3. **Tracking**: Google Analytics, Google Tag Manager, Meta Pixel, Google Ads, in the form script, after consent.
4. **Chat alerts**: Microsoft Teams and Discord, beside Slack.
5. **Zapier, Make, Activepieces**: a Forms API with API keys and subscribe hooks, and the listed apps.
6. **Files**: Google Drive, OneDrive, Dropbox, Box, Amazon S3.
7. **Work tools**: Linear, Trello, ClickUp, Monday.com, SmartSuite, Zendesk, Freshdesk, Intercom.
8. **Imports and documents**: Google Forms import, Google Docs from a template.
9. **Sending and phones**: Gmail send-as, SendGrid, Twilio.
10. **The rest**: PayPal, Square, Firebase, MongoDB, GraphQL, SAP (all reachable today through the Webhook or Zapier).

## Monthly cost

The tools' APIs are free on their side or run on the team's own account (Twilio, SendGrid, S3, the payment tools).
The sends are jobs on the claritia-intel worker. No Claude calls.

| Stage | Steps 1 to 8, 10 | Gmail send-as (step 9) | Total |
|---|---|---|---|
| Beta (50 teams) | $0 | about $45: Google's security review for the Gmail send scope, about $540 a year (check) | about $45 |
| Growth (500 teams) | about $5: one more small worker machine (check) | about $45, the same review (check) | about $50 |

Google's app check for the Sheets, Drive and Docs scopes is free (check). Listing on Zapier, Make and Activepieces is free
(check).
