# Integrations: what's built and what to build

Every integration on Fillout's list (fillout.com/integrations, Nov 2026), checked against Claritia's code. 55 in all:
11 built, 14 half built, 30 not built.

- **Built**: works today.
- **Half built**: part of it is there (the sign-in and the tool's client, or a way through the webhook); the missing
  part is named.
- **Not built**: nothing yet.

## Built (11)

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

Also built, not on Fillout's list: Close and Omniscient (send leads), Typeform, Tally and Webflow forms (fills come in by
webhook), HubSpot Meetings and SavvyCal (book from a form by link).

## Half built (14)

| Integration | What's there | What's missing |
|---|---|---|
| Mailchimp | Sign-in and the client (reads contacts) | Add or update the person on a list from a form or workflow |
| Klaviyo | Key and the client (reads profiles) | The same |
| ActiveCampaign | Key and the client | The same |
| Brevo | Key and the client | The same |
| Intercom | Key and the client (reads contacts) | Make a contact, and a conversation or ticket, per fill |
| PostgreSQL | Connection and reads | Write each fill as a row, columns added as questions are |
| MySQL | The same | The same |
| Zapier | Works now through the Webhook (paste a Zapier Catch Hook address) | A listed Zapier app: a Forms API with API keys and subscribe hooks; triggers New fill and New booking |
| Make | The same, through the Webhook | A listed Make app on the same API |
| Activepieces | The same, through the Webhook | A listed piece on the same API |
| Microsoft Teams | Teams meetings as a meeting location | Fill alerts in a Teams channel |
| Gmail | Emails go from the workspace's verified domain (Resend) | Send workflow emails from a team member's own Gmail |
| Google Docs | A PDF copy of each fill | A Google Doc from a template, filled with the answers |
| Google Tag Manager | The form's events (`claritia:submitted`, `:booked` and the rest) bubble on the page, so a GTM trigger can catch them | Push them to `dataLayer` by itself, with a Tracking section in form Settings |

Kit and MailerLite are in the same state as Mailchimp (not on Fillout's list).

## Not built (30)

| Integration | What to build |
|---|---|
| Google Sheets | A row per fill in a chosen sheet; new questions add columns (Google sign-in, Sheets scope) |
| Airtable | Make or update a record per fill, fields mapped |
| Notion | Make or update a database entry per fill |
| Excel Online | A row per fill (Microsoft sign-in, which meetings already use) |
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

1. **Email lists**: Mailchimp, Klaviyo, ActiveCampaign, Brevo (and Kit, MailerLite): add the person to a list, with
   tags, from a form or a workflow step. The clients and sign-in are there.
2. **Sheets and databases**: Google Sheets, Airtable, Notion, Excel Online, PostgreSQL, MySQL: a row or record per fill.
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
