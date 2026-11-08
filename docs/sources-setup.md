# Sources setup: what to set before turning on imports, sync and warehouses

Everything here is done once by us, never by customers. Customers click "Connect HubSpot" and sign in. Without the sign-in app for a tool, that tool falls back to a pasted key.

The app is assumed to live at `https://app.tryclaritia.com`. If it doesn't, set `APP_URL` on Render to the real address and use that address everywhere below.

## 1. Database

Run `supabase/migrations/033_contacts.sql` through `038_warehouses.sql` in order (Supabase → SQL editor, or `supabase db push`). They create:

- the private `imports` storage bucket (035),
- the sources, sync log, hooks and links tables (036),
- segments (037),
- warehouse activity and records (038).

`minute_tick` already runs every minute from pg_cron. From 036 on, it also starts due pulls, pushes for two-way CRMs, and the hourly segment refresh. Nothing new to schedule.

## 2. SECRETS_KEY (Render and claritia-intel, same value)

Every tool's sign-in or key is sealed with `SECRETS_KEY` (AES-256-GCM) before it's saved. The web app seals; the worker unseals. Both need the exact same value, or every pull fails with "This secret is not in a format Claritia can read."

1. Render → `claritia` → Environment. `SECRETS_KEY` already exists (the Blueprint made it). Copy its value.
2. Put it on the worker: `fly secrets set SECRETS_KEY='<same value>' --app claritia-intel`
3. Never change it once sources are connected. A new value makes every saved sign-in unreadable, and every customer would have to connect again.

## 3. claritia-intel secrets (Fly)

```
fly secrets set --app claritia-intel \
  SECRETS_KEY='<same as claritia-web>' \
  SUPABASE_URL='<the API address on the VPS>' \
  SUPABASE_SECRET_KEY='<service role / secret key>' \
  HUBSPOT_CLIENT_ID='…' HUBSPOT_CLIENT_SECRET='…' \
  SALESFORCE_CLIENT_ID='…' SALESFORCE_CLIENT_SECRET='…' \
  PIPEDRIVE_CLIENT_ID='…' PIPEDRIVE_CLIENT_SECRET='…' \
  ATTIO_CLIENT_ID='…' ATTIO_CLIENT_SECRET='…' \
  MAILCHIMP_CLIENT_ID='…' MAILCHIMP_CLIENT_SECRET='…' \
  GOOGLE_CLIENT_ID='…' GOOGLE_CLIENT_SECRET='…' \
  AIRTABLE_CLIENT_ID='…' AIRTABLE_CLIENT_SECRET='…' \
  NOTION_CLIENT_ID='…' NOTION_CLIENT_SECRET='…'
fly deploy --config fly.intel.toml
```

| Secret | What it's for | Without it |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Reading uploaded import files from storage, and deleting them after 30 days | Files over 3 MB fail after their retries; files up to 3 MB still import from the web app |
| `<TOOL>_CLIENT_ID`, `_CLIENT_SECRET` | Refreshing a tool's sign-in when it expires (HubSpot every 30 minutes, Salesforce every few hours) | The first refresh fails and the source turns to Error, "Reconnect" |
| `DATABASE_URL` | Already set | — |

The deploy also raises the worker to 1 GB (`fly.intel.toml`): about $3 a month more (check).

## 4. Render (web app) environment

Render → `claritia` → Environment. The Blueprint (`render.yaml`) now lists these, so a Blueprint sync prompts for them.

| Variable | What it's for |
|---|---|
| `SUPABASE_SECRET_KEY` | Already set. The connect, callback, webhook and test-query routes use it. |
| `SECRETS_KEY` | Already set. |
| `<TOOL>_CLIENT_ID`, `_CLIENT_SECRET` | Same values as on the worker. The web app makes the sign-in link and trades the code for tokens. |
| `APP_URL` | Only if the app isn't at `https://app.tryclaritia.com`. It builds the sign-in return address and the webhook addresses, and HubSpot signs its webhooks over that address, so it must match exactly. |
| `OMNISCIENT_URL` | Only if Omniscient isn't at `https://app.tryomniscient.com`. |

## 5. One sign-in app per tool

Every tool uses the same return address:

```
https://app.tryclaritia.com/api/sources/callback
```

### HubSpot (two-way)

1. developers.hubspot.com → your developer account → Apps → Create app (a public app).
2. Auth tab:
   - Redirect URL: the return address above.
   - Scopes: `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.lists.read`, `crm.schemas.contacts.read`, `crm.schemas.contacts.write`. They must match `src/lib/sources/oauth.ts` exactly, or HubSpot refuses the sign-in.
   - Copy the Client ID and Client secret into `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` (Render and Fly).
3. Webhooks tab:
   - Target URL: `https://app.tryclaritia.com/api/hooks/hubspot`.
   - Subscriptions:
     - Contact: creation, deletion, merge, privacy deletion.
     - Contact property change for `email`, `firstname`, `lastname`, `jobtitle`, `phone`, `company`, `website`, `country`, `state`, `lifecyclestage`, `hs_lead_status`, `hs_email_optout`.
     - Company: creation, deletion, and property change for `name`, `domain`, `industry`, `numberofemployees`, `country`.
   - Turn the subscriptions on.
4. HubSpot signs each webhook with the client secret (v3 signature). Claritia checks it, and refuses anything older than 5 minutes or signed for another address. Webhooks are optional: without them, changes still arrive with each pull, every 15 minutes.
5. Test with a HubSpot test account (developer account → Test accounts) before the app goes to the Marketplace.

On connect, Claritia makes three contact properties in the customer's HubSpot: `claritia_score`, `claritia_band` and `claritia_source`. The score and band go out every few minutes and are never read back.

**Email and form activity on the HubSpot timeline (optional):**
1. Auth tab → add `timeline.read`, `timeline.write` and `crm.objects.owners.read` as **optional** scopes (the second lets lead routing list HubSpot owners). Claritia asks for it as optional, so customers who already connected keep working.
2. Make Claritia's event template once: `HUBSPOT_APP_ID=… HUBSPOT_DEVELOPER_KEY=… node scripts/hubspot-timeline.mjs`. It prints `HUBSPOT_TIMELINE_TEMPLATE=…`.
3. `fly secrets set HUBSPOT_TIMELINE_TEMPLATE='…' --app claritia-intel`.

Without the template, each email sent, click, unsubscribe and form answer goes in as a note on the contact.

### Salesforce (two-way)

1. Setup → App Manager → New Connected App (or New External Client App).
2. Enable OAuth settings:
   - Callback URL: the return address above.
   - Scopes: "Manage user data via APIs (api)" and "Perform requests at any time (refresh_token, offline_access)".
   - Require Proof Key for Code Exchange (PKCE): on.
   - Require secret for web server flow: on.
3. Copy the Consumer Key and Consumer Secret into `SALESFORCE_CLIENT_ID` and `SALESFORCE_CLIENT_SECRET`.
4. Policies: "All users may self-authorize". Refresh token policy: "valid until revoked".
5. A Developer Edition org (developer.salesforce.com/signup) is for testing.

**Score fields (one time per customer org):** Setup → Object Manager → Lead → Fields & Relationships → New:
- `Claritia Score` (Number, 3 digits, 0 decimals) → API name `Claritia_Score__c`
- `Claritia Band` (Text, 20) → API name `Claritia_Band__c`

Repeat on Contact. Give the connecting user edit access to all four. Until they exist, everything else still syncs and the score is left out.

Email and form activity goes in as completed Tasks on the Lead or Contact. Nothing to set up.

Limits for now:
- Sign-in goes to `login.salesforce.com`, so sandboxes (`test.salesforce.com`) can't connect yet.
- Changes arrive by pull every few minutes. Change Data Capture comes later.
- New contacts are created as Leads.

### Pipedrive (in)

1. developers.pipedrive.com → Developer Hub → create an app.
2. Callback URL: the return address above.
3. Scopes: Contacts (read), Organizations (read), Users (read). Check the names on the app form.
4. Copy the Client ID and secret into `PIPEDRIVE_CLIENT_ID` and `PIPEDRIVE_CLIENT_SECRET`.
5. The app can stay unlisted (private) until it's reviewed for the Marketplace.

### Attio (in)

1. build.attio.com → create an app → OAuth.
2. Redirect URI: the return address above.
3. Scopes: read access to records, objects and the user's workspace. Check the names on the app form.
4. Copy the Client ID and secret into `ATTIO_CLIENT_ID` and `ATTIO_CLIENT_SECRET`.

### Mailchimp (in)

1. Mailchimp → Profile → Extras → Registered apps → Register an app.
2. Redirect URI: the return address above.
3. Copy the Client ID and secret into `MAILCHIMP_CLIENT_ID` and `MAILCHIMP_CLIENT_SECRET`.

Mailchimp has no scopes. Claritia finds the account's data center itself after sign-in.

### Google Sheets (out: a row per form fill)

Uses the same Google app as calendars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, already set for meetings).

1. Google Cloud console → APIs and services → Library → turn on the **Google Sheets API**.
2. Credentials → the OAuth client → Authorized redirect URIs → add `https://app.tryclaritia.com/api/sources/callback`.
3. OAuth consent screen → Scopes → add `https://www.googleapis.com/auth/spreadsheets`. Google's app check for it is free
   (check).

### Excel Online (out: a row per form fill)

Uses the Microsoft app meetings use (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, see `docs/meetings-setup.md`).

1. Entra admin center → App registrations → the Claritia app → Authentication → add the redirect URI
   `https://app.tryclaritia.com/api/sources/callback` (Web).
2. API permissions → Microsoft Graph → Delegated → add `Files.ReadWrite`. No admin consent is needed for it (check).

### Airtable and Notion (out: a record per form fill)

Both work with a pasted key until their apps are set up: an Airtable personal access token (scopes
`data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write`, with the bases added), or a Notion
integration secret (the database shared with the integration).

For one-click sign-in:
1. Airtable: airtable.com/create/oauth → register an integration, redirect URL the return address above, the same five
   scopes plus `user.email:read`. Copy the Client ID and secret into `AIRTABLE_CLIENT_ID` and `AIRTABLE_CLIENT_SECRET`.
2. Notion: notion.so/my-integrations → a public integration, redirect URI the return address above, with read, update
   and insert content. Copy the OAuth client ID and secret into `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`.

### Omniscient (two-way, one click)

Nothing to register. Omniscient already knows Claritia (`src/lib/apps.ts` there) and allows return addresses on `tryclaritia.com`.

1. Omniscient's migration `032_connect.sql` must be live, with `SUPABASE_SECRET_KEY` set on Omniscient's app on the VPS.
2. "Connect Omniscient" in Claritia opens Omniscient's approve page. An Omniscient owner or admin clicks Allow. Claritia trades the one-time code for a key, then registers its own webhook with Omniscient (contact created and updated).
3. Omniscient's own "Connect Claritia" button sends people to `/settings/suite?connect=omniscient`. That address opens the same connect panel in Claritia.

### Who wins a field

On a two-way source's page, the Fields table has a **Wins** column for each field:
- A field changed on one side only always goes across, whatever the setting.
- When both sides changed it since they last matched, the setting decides: **Claritia** (the default), **CRM**, or **Newest** (the later change).
- The score and band are **Out only**.

Pulls run every 5 minutes for new CRM sources (HubSpot changes also arrive within seconds by webhook). Changes made in Claritia go out within a minute.

## 6. Tools that need nothing from us

| Tool | How a customer connects |
|---|---|
| Close, Klaviyo, ActiveCampaign, Brevo, Kit, MailerLite, Stripe, Intercom | An API key from the tool's settings (these have no one-click sign-in in this build) |
| Typeform, Tally, Webflow, Calendly, Cal.com, any JSON | Claritia gives a webhook address to paste into the tool, with an optional signing secret |
| PostgreSQL, Redshift, MySQL, ClickHouse, BigQuery, Snowflake, Databricks | Database details for a read-only user. The connect screen shows the grant to run. Hosts on private networks are refused, so the database needs a public address. PostgreSQL and MySQL also take form fills as rows: their grant lets Claritia make the form's table and add columns to it. |

## 7. Check it works

1. Fly logs (`fly logs --app claritia-intel`) show `intel started` with `"secrets": true`, and the handlers include `source_pull`, `crm_push`, `source_hook` and `segment_refresh`.
2. In Claritia: Settings → Tools → HubSpot → Connect. You land back on Settings → Tools with the HubSpot page open and the state Active.
3. Within a minute, the page's Runs table shows an "In · Contacts" row, and Settings → Sync log shows created contacts.
4. Change a contact's job title in HubSpot. With webhooks on, it shows in Claritia within seconds; without them, within 15 minutes.
5. Change a contact's title in Claritia. It shows in HubSpot within a minute or two.
6. Import a CSV over 3 MB. Settings → Imports shows it Running, then Done.

If a source shows Error:
- "Reconnect…": the sign-in expired or was revoked, or the worker is missing that tool's client id and secret.
- Any other message: the tool's own answer, also in Settings → Sync log.

After 5 failed runs in a row, a source stops. Fix the cause, then press Resume on the tool's page.

## Running cost

None of this adds a paid service. The 1 GB worker is about $3 a month (check). The developer accounts for HubSpot, Salesforce, Pipedrive, Attio and Mailchimp are free.

## Zapier, Make and Activepieces

The apps sign in with OAuth (docs/integrations-plan.md, Next step 1). Each needs a client secret on claritia-web:
make a long random one per app, set it on the server, and give the same value to the app.

```bash
fly secrets set --app claritia-web OAUTH_ZAPIER_SECRET=... OAUTH_MAKE_SECRET=... OAUTH_ACTIVEPIECES_SECRET=...
```

| App | Client id | Where the secret goes |
|---|---|---|
| Zapier | `zapier` | `zapier env:set 1.0.0 CLIENT_ID=zapier CLIENT_SECRET=...` in `integrations/zapier` |
| Make | `make` | The connection's `common` block in Make's app editor (`integrations/make/connections/claritia.json`) |
| Activepieces | `activepieces` | The piece's OAuth app settings in Activepieces |

An app with no secret set can't sign in: its approve screen says it isn't set up yet.

## Meta Conversions API and Google Ads

Form › Settings › Tracking sends fills and bookings to them (docs/integrations-plan.md, Next step 2).

- **Meta Conversions API:** in Meta's Events Manager, make a system user token with access to the pixel, then
  connect it in Settings › Integrations. Nothing to set on the server.
- **Google Ads:** uses the Google app the calendars use. Add the `https://www.googleapis.com/auth/adwords` scope to
  its consent screen and Google Ads' return address next to the Sheets one. Set the developer token from a Google
  Ads manager account (API Center) on both apps:

```bash
fly secrets set --app claritia-web GOOGLE_ADS_DEVELOPER_TOKEN=...
```

```bash
fly secrets set --app claritia-intel GOOGLE_ADS_DEVELOPER_TOKEN=...
```

Without the token, Offline conversions says Google Ads isn't set up yet, and fills are not uploaded.

## More CRMs

Zoho CRM, Dynamics 365, GoHighLevel and Keap sign in (docs/integrations-plan.md, Next step 4). Each needs Claritia's
app registered once, with the return address `https://app.tryclaritia.com/api/sources/callback`:

| Tool | Where | Environment variables (claritia-web and claritia-intel) |
|---|---|---|
| Zoho CRM | Zoho API Console, a server-based app; turn on multi-DC so it works in every data center | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` |
| Dynamics 365 | The Microsoft app meetings use: add the Dynamics CRM `user_impersonation` permission | (the Microsoft ones already set) |
| GoHighLevel | GoHighLevel Marketplace, a sub-account app with contacts and locations scopes | `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET` |
| Keap | Keap Developer portal | `KEAP_CLIENT_ID`, `KEAP_CLIENT_SECRET` |

Freshsales, Copper and monday CRM take keys in Settings › Integrations; nothing to set on the server.

## Microsoft Teams and Discord

Chat alerts (docs/integrations-plan.md, Next step 5).

- **Microsoft Teams:** the Microsoft app meetings use. Add the delegated Graph permissions `Team.ReadBasic.All`,
  `Channel.ReadBasic.All` and `ChannelMessage.Send`. Some tenants need an admin to consent once (check).
- **Discord:** make an app in the Discord Developer Portal, add `https://app.tryclaritia.com/api/sources/callback` as
  a redirect, and set `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` on claritia-web. Without them, people paste a
  channel's webhook address (Channel settings › Integrations › Webhooks).

## Gmail and Outlook (sending as the host)

Meetings › Availability › My calendar, "Email from you" (docs/integrations-plan.md, Next step 6).

- **Gmail:** on the Google app the calendars use, add the `https://www.googleapis.com/auth/gmail.send` scope to the
  consent screen and `https://app.tryclaritia.com/api/mailbox/callback` as a redirect. `gmail.send` is a sensitive
  scope: Google checks the app once, free (check).
- **Outlook:** on the Microsoft app, add the delegated `Mail.Send` permission and the same redirect.

Nothing else to set: both use the Google and Microsoft keys already on the server.

## Work tools

Linear, Trello, ClickUp, monday.com, SmartSuite, Zendesk, Freshdesk and Intercom (docs/integrations-plan.md, Next
step 10).

- **Linear:** an OAuth app in Linear's settings, with the return address
  `https://app.tryclaritia.com/api/sources/callback`. Set `LINEAR_CLIENT_ID` and `LINEAR_CLIENT_SECRET` on claritia-web
  and claritia-intel. Without them, people paste a personal API key.
- **ClickUp:** an app in ClickUp's settings with the same return address. Set `CLICKUP_CLIENT_ID` and
  `CLICKUP_CLIENT_SECRET`. Without them, people paste a personal API token.
- **Trello, monday.com, SmartSuite, Zendesk, Freshdesk, Intercom:** keys in Settings › Integrations. Nothing to set on
  the server.
## Google Docs, DocuSign and PandaDoc

A document per fill from a template (docs/integrations-plan.md, Next step 11).

- **Google Docs:** on the Google app the calendars use, add the `https://www.googleapis.com/auth/documents` and
  `https://www.googleapis.com/auth/drive.file` scopes to the consent screen. Both are sensitive scopes: Google checks
  the app once, free (check).
- **DocuSign:** make an app (an integration key) in DocuSign's developer account, with the redirect
  `https://app.tryclaritia.com/api/sources/callback`, and set `DOCUSIGN_CLIENT_ID` and `DOCUSIGN_CLIENT_SECRET` on
  claritia-web and claritia-intel. It works on DocuSign's live accounts after their go-live review, free (check).
- **PandaDoc:** people paste their API key in Settings › Integrations. Nothing to set on the server.
## Import from Google Forms

Forms, Import from Google Forms (docs/integrations-plan.md, Next step 13). On the Google app the calendars use, add
the `https://www.googleapis.com/auth/forms.body.readonly` scope to the consent screen, turn on the Google Forms API
in the app's Google Cloud project, and add `https://app.tryclaritia.com/api/forms/google-import/callback` as a
redirect. `forms.body.readonly` is a sensitive scope: Google checks the app once, free (check). Nothing else to set.
## Segment, PostHog, Mixpanel and Amplitude

Product analytics (docs/integrations-plan.md, Next step 8). Each team pastes its own key in Settings › Integrations:

| Tool | Key | Where to find it |
|---|---|---|
| Segment | Write key (and region: us or eu) | An HTTP API source's settings |
| PostHog | Project API key (and its address, like https://eu.i.posthog.com) | Project settings |
| Mixpanel | Project token (and region: us or eu) | Project settings |
| Amplitude | API key (and region: us or eu) | Project settings |

Nothing to set on the server.
## Google Drive, OneDrive, Dropbox, Box and Amazon S3

File copies (docs/integrations-plan.md, Next step 9). All use the return address
`https://app.tryclaritia.com/api/sources/callback`.

| Tool | Where | Environment variables (claritia-web and claritia-intel) |
|---|---|---|
| Google Drive | The Google app: add the `drive.file` scope to the consent screen (a non-sensitive scope) | (the Google ones already set) |
| OneDrive | The Microsoft app: add the delegated `Files.ReadWrite` permission | (the Microsoft ones already set) |
| Dropbox | Dropbox App Console, "Scoped access", with `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write` | `DROPBOX_CLIENT_ID`, `DROPBOX_CLIENT_SECRET` |
| Box | Box Developer Console, a Custom App with user authentication (OAuth 2.0), "Write all files and folders" | `BOX_CLIENT_ID`, `BOX_CLIENT_SECRET` |
| Amazon S3 | The team pastes a bucket, its region and an access key in Settings › Integrations | (none) |

The copies read files from the form-uploads bucket, so claritia-intel needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
For S3, the team's key needs `s3:PutObject`, `s3:GetObject` (to find a file already copied) and `s3:ListBucket` on
the bucket; nothing else.
## Webex, Whereby, PayPal and Square (integrations plan, Next step 12)

Run `supabase/migrations/132_payments_locations.sql` first.

- **Webex (Claritia's app):** make an integration at developer.webex.com with the return address
  `https://app.tryclaritia.com/api/sources/callback` and the scopes `meeting:schedules_write`,
  `meeting:schedules_read` and `spark:people_read`. Set `WEBEX_CLIENT_ID` and `WEBEX_CLIENT_SECRET`. Teams then
  click Connect Webex in Settings › Integrations.
- **Whereby (the team's key):** in Whereby, Settings › API, make an Embedded API key and paste it in Settings ›
  Integrations › Whereby.
- **PayPal (the team's app):** at developer.paypal.com, make a REST app and paste its Client ID and Secret. Add a
  webhook to the app at `https://app.tryclaritia.com/api/pay/paypal?w=<workspace id>` for
  `CHECKOUT.ORDER.APPROVED` and `PAYMENT.CAPTURE.COMPLETED`, then paste its Webhook ID. Without the Webhook ID,
  payments still count when the guest comes back, and webhooks are refused. Type `sandbox` in Mode to test.
- **Square (the team's app):** at developer.squareup.com, paste the app's access token and the location's ID. Add a
  webhook subscription at `https://app.tryclaritia.com/api/pay/square?w=<workspace id>` for `payment.updated`, then
  paste its signature key. Type `sandbox` in Environment to test.
- **Using them:** pick Webex or Whereby in a meeting type's Location. Pick PayPal or Square in "Paid with" under a
  paid type's Price, or in the payment block's settings. Stripe stays the default.
