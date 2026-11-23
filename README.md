# Claritia

Claritia is a marketing platform for B2B teams: it shows which people and companies visit a site, brings in contacts from the tools a team already uses, and scores and segments them so the team knows who to reach. It sits between Arrowsterr (SEO and AI search) and Omniscient (CRM and deal rooms), on the same stack and brand.

It started as an AI end-to-end testing product, which stays on for workspaces that have it. Each workspace sees screens by `workspaces.features` (`src/lib/nav.ts`): `marketing`, `testing`, or both. The testing product is described in `docs/testing.md`.

## What the marketing platform does

- **Contacts, leads and companies**, with custom fields and custom objects, saved views, filters and bulk edits (`src/lib/records`, `src/components/app/records`).
- **Imports** of CSV, Excel and vCard files, with column mapping, consent, and undo for 30 days (`src/lib/contacts`, `supabase/migrations/035_imports.sql`).
- **Sources**: 27 tools kept in sync on a schedule or by webhook. CRMs (HubSpot, Salesforce and Omniscient both ways, plus Pipedrive, Attio and Close), email tools, forms, meeting tools, Stripe and Intercom, and warehouses (Postgres, MySQL, Redshift, BigQuery, Snowflake, Databricks and ClickHouse) through a saved read-only query (`src/lib/sources`). Setup is in `docs/sources-setup.md`.
- **Segments**: saved rules over contacts, their activity and their companies, refreshed in the background (`supabase/migrations/037_segments.sql`).
- **Visitors and identity**: a small script (`collect/script`) and the collect service record visits under each region's privacy rules, and the stitch job ties devices to people only on evidence such as a form or a sign-in (`src/lib/identity`, spec in `docs/identity.md`).
- **Accounts**: visits matched to companies, enriched, scored for fit and intent from signals, with Slack alerts when an account heats up (`src/lib/company`, `src/lib/web`, spec in `docs/account-intelligence.md`).

## What's in this repo

| Folder | What it is | Runs on |
|---|---|---|
| `src/app`, `src/components`, `src/lib` | The Next.js app (app.tryclaritia.com) and the code every service shares | Fly, `claritia-web` |
| `collect/` | The events service the site script sends visits to | Fly, `claritia-collect` |
| `worker-intel/` | Background jobs that need no browser: stitching, companies, signals, imports, sources, segments | Fly, `claritia-intel` |
| `worker/` | The test runner, with Chromium | Fly, `claritia-runner` |
| `relay/` | The relay behind `npx claritia tunnel` | Fly, `claritia-relay` |
| `cli/`, `action/`, `extension/` | The `claritia` CLI, its GitHub Action, and the Chrome test recorder | npm, GitHub, Chrome |
| `supabase/migrations/` | The database, in order | Supabase |

`collect`, `worker` and `worker-intel` are npm workspaces of the root package, with one lockfile.

## Setup

1. **Supabase:** run each file in `supabase/migrations` in order (SQL Editor). Under Authentication → URL Configuration, set the Site URL to `https://app.tryclaritia.com` and add `https://app.tryclaritia.com/**` and `http://localhost:3000/**` to the redirect list. Under Providers, turn on Google and GitHub.
2. **Fly (`claritia-web`):** add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SECRETS_KEY` (32+ random characters, never change it once secrets are saved). The web service also needs `SUPABASE_SECRET_KEY` for the mail and Stripe webhooks and for API keys.
3. **Test inboxes (Resend):** in Resend, add the domain `inbox.tryclaritia.com`, turn on receiving, and add the MX record it shows at the domain registrar. Add a webhook for the `email.received` event to `https://app.tryclaritia.com/api/inbox/resend`. Put a full-access API key in `RESEND_API_KEY` on the web service. No webhook secret is needed: the app fetches each email back from Resend with the key before it saves it.
4. **Billing (Stripe):** set `STRIPE_SECRET_KEY` on the web service. That's all: prices come from `src/lib/plans.ts`, and the first checkout makes the webhook to `/api/billing/webhook` in Stripe, and the first "Manage billing" makes the billing page. The webhook needs no signing secret, because each event is fetched back from Stripe with the secret key before it's used.

5. **GitHub App:** see `docs/github.md` (five `GITHUB_*` secrets on the web app).
6. **CLI on npm:** add an npm automation token as the `NPM_TOKEN` repository secret. `.github/workflows/cli-publish.yml` publishes `cli/` as `claritia` whenever its version changes on main.

## Local development

```bash
cp .env.example .env.local   # fill it in
npm install
npm run dev                  # http://localhost:3000
```

## Checks

```bash
npm run lint
npm run typecheck
npm test            # unit tests (tests/*.test.ts)
npm run test:db     # SQL leak and jobs tests, then tests/pg; needs DATABASE_URL to a local Postgres superuser.
                    # With CHROMIUM_PATH set it also runs the collect, identity and consent browser checks.
npm run test:browser  # the other browser checks (runner, healing, Judge, Explorer, inboxes, tunnel and more); needs CHROMIUM_PATH
npm run build
```

`.github/workflows/ci.yml` runs all of these on every pull request and before every deploy.

## Deploy

Each push to main deploys five Fly apps (`.github/workflows/fly-deploy.yml`): the app (`fly.toml`), the runner, the tunnel relay, collect and intel. The app and the runner stop when idle; the database wakes the runner when a run is queued and fires schedules itself every minute (`supabase/migrations/011_wake_runner.sql`). The site, `tryclaritia.com`, is a plain HTML site on Hostinger (the `claritia-site` repo). Setup steps are in `docs/fly.md`.

## Launch numbers

Time from sign-up to a first passing test, per workspace (run in the Supabase SQL editor):

```sql
select w.name, w.created_at, w.first_pass_at, w.first_pass_at - w.created_at as time_to_pass
from workspaces w order by w.created_at desc;
```

