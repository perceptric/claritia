# Claritia: the agentic marketing platform

**One line:** Claritia turns website visitors into leads and leads into meetings, with AI agents running the journeys, writing the emails, building the pages and proving what made revenue.

**Who it's for first:** B2B teams of 5 to 200 people, with 1 to 10 marketers. They pay for 4 or 5 tools today (HubSpot or Marketo, Warmly or Unify, Mutiny or Unbounce, HockeyStack or Dreamdata) at $35K to $100K a year.

This is the one plan for the marketing platform. It merges the module plan (M0 to M10), the Conversion parity plan and its week-by-week detail, and the Buyer Analytics spec from the older buyer enablement plan. The code since migration 033 follows the Conversion parity order (Part 9). Where the plans disagree on a product choice, both versions are kept under an **Open question** note until the owner picks one. Short tags say where a part came from: MP (the module plan), CP (the Conversion parity plan), CW (its week detail) and PP (the buyer enablement plan). Part 19 has the history.

Companion specs that stay valid:

| Spec | What it settles |
|---|---|
| `docs/m1-website-intelligence.md` | M1 as built: files, tables, jobs, screens, tests |
| `docs/identity.md` | Identity stitching (M1), matching contacts to people, cleaning emails, email link tokens |
| `docs/account-intelligence.md` | Compliance framework (Part 3: region policy, consent, data requests, retention), company resolution, signals and scoring (M1, M7) |
| `docs/contact-sources.md` | One spec per contact source (6.2) |
| `docs/sources-setup.md` | What we set once before imports, sources and warehouses work |
| `docs/brand.md` | Look and copy of every screen, email and page |

---

## 1. Product and suite

### 1.1 The suite

```
GET FOUND                     CAPTURE · NURTURE · CONVERT · PROVE          CLOSE
Arrowsterr          ───►      Claritia                          ───►       Omniscient
SEO, GEO, AI search           visitors, contacts, journeys, email,         CRM, opportunities,
                              pages, forms, scoring, attribution           meetings, deal rooms
```

**Pitch:** Found by Arrowsterr. Converted by Claritia. Closed with Omniscient.

**Competitors this replaces or beats:**

| Job | Who does it today |
|---|---|
| Marketing automation | Conversion.ai, Inflection, HubSpot Marketing Hub, Marketo, Pardot, ActiveCampaign, Customer.io, Loops, Encharge, Userlist |
| Visitor intelligence | Warmly, Unify, RB2B, Factors, Common Room, Snitcher, Leadfeeder |
| Pages and personalization | Mutiny, Unbounce, Instapage, Abmatic, Default, Chili Piper |
| Attribution | HockeyStack, Dreamdata, Factors |

### 1.2 What Conversion sells, and our answer

The plan matches everything Conversion (conversion.ai) sells, on top of what Claritia already has, and goes past it in two places: contacts come in from every tool a team has ever used, and Website Intelligence (M1) shows who is on the site. Conversion is an AI-native B2B marketing automation platform built around Salesforce and the data warehouse, sold as a Marketo replacement.

Facts about Conversion come from its own pages (home, data model, automations, lead scoring, agents, forms, landing pages, ads, integrations, migration). They are vendor claims, read in October 2026.

| Conversion | What it does (its own pages) | Claritia after this plan |
|---|---|---|
| Data model | CRM records, warehouse tables and product events in one model. Custom objects with one-to-one, one-to-many and many-to-many links. Salesforce changes land in minutes, webhooks and API events in real time, warehouse tables on a schedule. | The same, plus 60+ import sources (6.2) and website visitors (M1) |
| Knowledge graph | AI maps the data model into a graph of people, accounts, activity, campaigns and product, which agents work from | Brand Brain plus a data map the agents read (6.5) |
| Warehouses | Snowflake, BigQuery, Databricks, Redshift, ClickHouse, PostgreSQL, on the customer's schedule | The same list plus MySQL, read only |
| Salesforce sync | Two-way, campaign members both ways, task creation, audit log | Two-way HubSpot, Salesforce and Omniscient, one sync log, campaign members both ways |
| Email Studio | Drag-and-drop builder with live CRM and warehouse fields | Block editor, brand kit, personal blocks, test send, reports |
| Automations | Visual builder, real-time triggers from every source, AI steps that score, route or classify | Workflows with the same triggers and steps, AI Decide and AI Write, website triggers |
| Lead scoring and routing | AI weighs CRM, warehouse, product and behavior data, with top reasons. Routing by territory, segment, ownership, rep capacity and named accounts. | Scores with top 3 reasons, retrained weekly, synced to the CRM. Routing with capacity and SLA timers. |
| ABM | Account-level orchestration with one engagement view | Account lists, buying groups, account plays, account journeys |
| Forms | On landing pages, start workflows, add to scores, keep page, referrer and UTMs, attach earlier anonymous visits | The same, plus consent wording by region and Funnel QA on every form |
| Landing pages | Sections and blocks, published on the customer's domain, form rendered in the page | The same, built by AI from Brand Brain, checked in a real browser |
| Ads | Audiences, lead gen forms and attribution | Audience sync to LinkedIn, Google and Meta, lead forms in, offline conversions out |
| Attribution (Mosaic) | Attributed pipeline and closed-won by channel, campaign and asset, built-in model or custom weights | Multi-touch attribution with AI search as a channel (M8) |
| Plays | An agent for every contact and account | Account and contact plays with drafts to approve (6.12) |
| Agents | Start from Slack, Linear, a schedule, a webhook or a prompt. Each tool is Automatic, Requires approval or Disabled. Reads and new drafts run alone; deletes, contact imports and Salesforce links wait; edits show a before-and-after diff. Nothing goes live without a person. | The same settings, plus an MCP server and a Skills pack so teams can work from Claude |
| Migration | Playbooks for Marketo, Pardot, HubSpot and Eloqua. Agents rebuild workflows, lists and campaigns, the old tool stays live, each part is checked on real data. They claim about 4 weeks. | Migration agent for the same four plus ActiveCampaign, Mailchimp, Klaviyo and Customer.io (6.13) |
| Events | Cvent registrations into campaigns every hour | Cvent, Zoom, Luma, Eventbrite, Goldcast and Livestorm |
| Not sold by Conversion | None | Website visitors, companies and intent (M1), and AI search visibility from Arrowsterr |

### 1.3 Modules

| # | Module | What the customer gets | Status |
|---|---|---|---|
| M0 | Foundation and suite | Jobs queue, workspace, nav, billing, connections to Omniscient and Arrowsterr | Built (5.1) |
| M1 | Website Intelligence | Which companies and people visit, what they read, and which accounts are heating up | Built (5.2) |
| M2 | Contacts and Segments | One marketing database of people, companies, events and consent, with live segments | Mostly built (5.3 to 5.6) |
| M3 | Email Engine | Sending from the customer's own domain, with deliverability, unsubscribes and suppression done right | Not started |
| M4 | Journeys and Agent Steps | A journey builder where AI agents decide the next step and write each email, with Approvals | Not started |
| M5 | Brand Brain | The customer's content, voice and proof, broken into atoms that every AI step writes from | Not started |
| M6 | Pages and Forms | AI landing pages, smart forms, booking, and personalization by account or segment | Not started |
| M7 | Scoring, Routing and Handoff | Fit, intent and engagement scores. Ready leads go to the right rep in Omniscient, HubSpot or Salesforce. | Account fit and intent built in M1 |
| M8 | Attribution and Reports | Revenue traced from AI answers and search (Arrowsterr) to visits, journeys and pages (Claritia) to won deals (Omniscient) | Not started |
| M9 | Funnel QA | The browser engine checks every page, form, link and email before launch and on a schedule after | Not started |
| M10 | Marketing Agent | An agent that reads all the data, proposes the week's plays, and builds them on approval | Not started |
| | Ads | Audiences out, lead forms in, offline conversions out, spend in (6.9) | Not started |
| | Migration agent | Moves a team off Marketo, Pardot, HubSpot, Eloqua and four more (6.13) | Not started |
| | Buyer Analytics | Dashboards, goals, funnels and revenue by source (6.3, open scope question) | Rollup tables only |

### 1.4 Screens

> **Open question: what the sidebar holds.** The module plan (MP) and the Conversion parity plan (CP) list different screens. Both are below. The sidebar built today (`src/lib/nav.ts`) holds Contacts, Leads, Companies, Segments, Accounts and Visitors under Audience, then Settings. With the `testing` feature on too, the testing screens sit under one Testing group.

**MP version:**

| Group | Screens |
|---|---|
| Top | Home (today's movement and approvals), Ask |
| Audience | Visitors, Accounts, Contacts, Segments |
| Engage | Journeys, Emails, Pages, Forms |
| Prove | Reports, Attribution, Funnel QA |
| Bottom | Approvals, Brand Brain, Settings |

The testing product's screens (Tests, Runs, Map, Approvals for heals) move under Settings › Testing and are hidden for new workspaces. The runner engine stays, because M9 runs on it.

**CP version:**

| Group | Screens |
|---|---|
| Audience | Contacts, Segments, Accounts, Visitors |
| Engage | Workflows, Emails, Pages, Forms, Plays |
| Prove | Reports, Attribution |
| Bottom | Approvals, Settings |

| Screen | Holds |
|---|---|
| Contacts | Week 1 table and contact page, plus Import (6.2.9), source tags on each value, Undo on recent imports |
| Segments | List with count and trend; builder with live count and a sample of 10 |
| Accounts | Week 1 list with saved views; account page with buying group and one timeline |
| Workflows | List, canvas, simulate, versions, report per node |
| Emails | Broadcasts and workflow emails; editor, preview, test send, report |
| Pages, Forms | List, editor, Funnel QA state, report |
| Plays | List, trigger, output, runs |
| Reports, Attribution | Pipeline by channel, campaign, asset; model picker; weekly summary |
| Approvals | Emails, pages, workflows, imports, agent actions; Approve, Edit, Skip; diffs for edits |
| Settings › Sources | 6.2.9 |
| Settings › Imports, Sync log | 6.2.9 |
| Settings › Sending, Scoring, Agents, Ads, Migration | Domains and brand kit; bands, weights, routing, SLA; tools and schedules; ad accounts; migration inventory and cutover |

### 1.5 What a customer can do at the end

1. Bring in every contact they have, from a CSV, an Excel file, a Google Sheet or any of 60+ tools, with lists, unsubscribes, consent and 13 months of email history, in one afternoon. Undo any import.
2. Connect HubSpot, Salesforce or Omniscient in two clicks and keep it in sync both ways, with every change in the Sync log.
3. Keep form, event, ad and product sources flowing in live, each one landing on the right contact.
4. Build a segment ("Fintech, fit 70+, clicked an email in 14 days, used feature X") and see the live count.
5. Send a newsletter from their own domain with unsubscribes, suppression and reports.
6. Build a workflow on a canvas with AI steps, test it on 20 real contacts with no sends, then publish.
7. Publish a landing page with a form that starts a workflow, checked in a real browser first.
8. See a score and its top 3 reasons on every contact, in Claritia and in the CRM, and route ready leads to the right rep with an SLA timer.
9. Run plays on target accounts, sync audiences to ads, and see pipeline by channel, campaign and asset.
10. Ask an agent in the app, Slack, Linear or Claude to build a nurture, and get drafts to approve.
11. Move off Marketo, Pardot, HubSpot or Eloqua with the old tool live until every part checks out.

### 1.6 One lead, start to finish

| Day | What happens | Module |
|---|---|---|
| 1 | Someone at Acme finds the customer through a ChatGPT answer that Arrowsterr helped win. They read two pages. | Arrowsterr, M1 |
| 1 | Acme is matched by IP and scores high on fit | M1, M7 |
| 3 | They download a guide through a Claritia form. Now a known contact, with consent recorded. | M6, M2 |
| 3 | They enter the "Guide downloaders, fintech" journey. An agent step writes the first email from the Brand Brain, citing the right case study. | M4, M5 |
| 7 | They read the case study page for 4 minutes. Two coworkers visit pricing. Intent rises. | M1 |
| 7 | An agent step picks the "sales-ready" branch. The handoff creates the contact and opportunity in Omniscient, alerts the owner in Slack with a brief, and pauses nurture. | M4, M7 |
| 9 | The rep books a meeting from Omniscient. | Omniscient |
| 60 | The deal is won. Attribution credits the ChatGPT answer, the guide, the journey and the case study. | M8 |
| Weekly | The Marketing Agent proposes cloning the journey for healthcare, with a new page. Marketing approves. | M10 |

### 1.7 Life of one lead, with time budgets

| Step | Where | Time budget |
|---|---|---|
| 1. A webinar registrant arrives from Zoom | webhook → web | ≤ 5 s |
| 2. The row stages, maps, cleans, and upserts the contact; their earlier anonymous visits attach by email token | intel | ≤ 10 s |
| 3. Segments refresh for the contact. Entering "Webinar registrants, fit 70+" starts a workflow. | intel | ≤ 10 s |
| 4. The workflow scores, waits, sends an AI-written follow-up, and branches on the click | intel | per step |
| 5. They read pricing twice. Signals raise the score past Ready. | collect, intel | ≤ 1 min |
| 6. Routing picks the owner by territory and capacity, writes it to Salesforce, alerts the rep in Slack and pauses nurture | intel | ≤ 2 min p95 |
| 7. The deal closes in Salesforce; attribution credits the webinar, the email and the AI answer that first brought them | intel | nightly |

---

## 2. Scope

| In this plan | Later |
|---|---|
| Imports from files and 60+ tools, with undo | Two-way sync with CRMs past the first three (they import, and sync in on a schedule) |
| HubSpot, Salesforce and Omniscient two-way sync | Writing back to a warehouse |
| Custom objects and 7 warehouses, read only | SMS and WhatsApp |
| Email, workflows, forms, landing pages | A/B tests on landing pages (pages ship with A/B on emails only; open question in 6.7) |
| Scoring, routing, ABM, ads audiences, attribution | Direct mail, chat widget |
| Agents in the app, Slack, Linear, schedules, webhooks, MCP and Skills | Mobile app |
| Migration agent for 8 platforms | Done-for-you migration service (a person runs the agent for the customer) |

Buyer Analytics (6.3) is an open scope question.

---

## 3. Rules

### 3.1 Rules every module follows

1. **A wrong signal costs more than a missing one.** Identity, scores and agent choices use hard evidence. Probable links never trigger a send.
2. **Approvals first.** Every journey starts in review mode. A team can turn on auto mode per journey after 20 approved sends with fewer than 10% edited (see the open question below).
3. **Every AI claim has a source.** Emails and pages only state facts found in the Brand Brain or the contact's own data. A verifier removes lines with no source.
4. **Consent before sending.** No marketing email goes to a contact without a lawful basis for their region (Part 12).
5. **Fixed math for counting, AI for words and choices.** Scores, segments and attribution are SQL. AI writes, and picks between branches the marketer defined.
6. **AI calls go through the decision cache.** Same inputs, no new call.
7. **Every feature lists its monthly cost** at Beta (50 teams) and Growth (500 teams), with "check" on unconfirmed prices.
8. **Brand rules from CLAUDE.md:** square containers, `rounded-md` controls, square tags, no `<select>` or browser pop-ups, minimal copy, `ToolIntro` on first screens, no emoji.

> **Open question: when auto mode unlocks.** Rule 2 above (MP Part 2) unlocks auto mode after 20 approved sends with fewer than 10% edited. The review modes in M4 (MP) and in the workflow plan (CP 11.3, now 6.6) unlock "Review a sample" after 20 approvals and "Auto" after 100 (MP adds: with fewer than 5% heavy edits).

### 3.2 Rules for every build week

From `CLAUDE.md`:
- Every table gets RLS, leak tests in `tests/db/leaks.sql`, and functions that check membership.
- Anything touching identity, the jobs queue, the send pipeline, imports or sync ships with a test that proves it on a flaky case.
- AI calls go through the step cache; a passing step replays from cache.
- No `<select>` or browser dialogs; app `Select` and dialog helpers only. Working screens hold labels, buttons and real errors. `ToolIntro` on first screens.
- Each week ends with `npm test`, `npm run test:db`, `typecheck`, `lint` and `build` green, then a push.

Cost lines in Part 10 are what each week adds to the monthly bill at Beta (50 teams) and Growth (500 teams). Totals are in Part 15.

---

## 4. Architecture

### 4.1 Apps

All Fly apps run in Tokyo (`nrt`), next to Supabase. Sizes today are from `docs/fly.md`.

| App | Today | Planned (Beta, then Growth) | Job |
|---|---|---|---|
| `claritia-web` (`fly.toml`) | 512 MB, sleeps when idle | 512 MB, then 2 × 1 GB | Next.js app, API, webhooks, and (MP) hosted pages and forms by host |
| `claritia-collect` (`fly.collect.toml`) | 512 MB, always on | 2 × 256 MB, then 3 × 512 MB | Public intake for the site script, and later forms and email clicks |
| `claritia-intel` (`fly.intel.toml`) | 1 GB, always on | See the open question below | Fast jobs with no browser: stitch, lookups, scores, imports, syncs, segments; later journeys, AI and sends |
| `claritia-runner` (`fly.runner.toml`) | 2 GB, sleeps when idle | 2 GB | Browser jobs: test runs today, crawls and Funnel QA runs later |
| `claritia-relay` (`fly.relay.toml`) | 256 MB, always on | 256 MB | Localhost tunnels (Funnel QA on staging) |
| Supabase `claritia` (Tokyo) | | Pro + Medium, then Large | Postgres, Auth, Storage, pg_cron, pgvector |
| Amazon SES | Not set up | | Email sending, with bounce and complaint events through SNS |
| ClickHouse Cloud | Not set up | Growth only | Raw events at scale |

> **Open question: how big `claritia-intel` gets.** MP plans 512 MB at Beta and 3 × 1 GB at Growth. CP plans 2 GB at Beta and 3 × 2 GB at Growth, with no new Fly apps. This feeds the cost bases in Part 15.

> **Open question: who serves landing pages.** MP serves hosted pages and forms from `claritia-web` by host, with Fly certificates. CP serves them from `collect` (already on the edge for `claritia.js`), so pages load from the customer's domain through a CNAME. Both are in 6.7.

### 4.2 Data flow

```
 Site visitors ─claritia.js─► collect ─► events, sessions, evidence ─► stitch ─► people, accounts
 Forms (M6) ─────────────────► collect ─► contacts + consent ───────────────────┘
 Omniscient / HubSpot / Salesforce / Segment / PostHog / Stripe ─► sync ─► contacts, deals, events
 Arrowsterr API ─► AI referral sources, prompts, topics ─► M5, M8
                                   │
                         jobs queue (claim_job, skip locked)
                                   │
   segment_refresh · journey_step · agent_decide · agent_write · send · ses_event · score · handoff · qa_run
                                   │
          Approvals · Slack · Omniscient (contacts, opportunities, activities) · Reports · MCP · API
```

### 4.3 Components

```
 Files ─► storage ─► import_file (intel)  ┐
 60+ sources ─► source_pull (intel)       ├─► import run ─► contacts, companies, records
 Webhooks ─► /api/hooks/:kind (web)       ┘                 suppressions, segments, events
 HubSpot, Salesforce, Omniscient ◄──► source_pull / crm_push (intel) ◄──► sync_log
 Warehouses ─► source_pull (intel) ─► contact_events, custom objects
 Segment, PostHog, Stripe ─► /api/v1/events (web) ─► contact_events
 M1 sessions and signals ────────────────────────────► contact_events
                                   │
     segment_refresh · workflow_step · ai_decide · ai_write · send · ses_event · page_publish
     score_contact · route · sla_check · audience_sync · attribution · play_run · agent_run · migrate
                                   │
  Amazon SES ◄─ send     Slack, Linear ◄─ agents     CRM ◄─ handoff, scores     Ads ◄─ audiences
```

The CP plan had staged `import_rows`, an `import_apply` job and a separate `warehouse_poll` job. The build uses one import run shared by the web app and the `import_file` job (`src/lib/contacts/importRun.ts`), and warehouses are connectors that run through `source_pull` (`src/lib/sources/warehouse.ts`). Webhooks land at `src/app/api/hooks/[kind]/` and are staged for the `source_hook` job. `/api/v1/events` is not built.

### 4.4 Code layout

Built:

```
collect/               Hono intake: /s.js, /e (events), /i (identity evidence), /x (cross-domain hop),
                       /reset, /opt (opt-out), /health; script/ holds claritia.js
src/lib/web/           policy, scrub, ids, names, signals, scores, account alerts, proxy
src/lib/identity/      docs/identity.md: clean, stitch, devices, rebuild, erase, mx
src/lib/company/       IPinfo, Coresignal, domains, accounts
src/lib/contacts/      contacts, consent, cleaning, CSV, Excel and vCard files, imports
src/lib/records/       fields and field packs for contacts, companies and custom objects
src/lib/sources/       connector contract, sign-in, mapping, the sync pipeline, every connector, warehouses
src/lib/filters.ts     the filter bar's filters
src/lib/jobs.ts        the jobs queue
worker-intel/jobs/     company, imports, segments, signals, sources, stitch (one file per group of job kinds)
worker/                the test runner, with Chromium
supabase/migrations/   020 to 039 built, 040 onward planned (Part 8)
```

Segments compile to SQL in the database (`037_segments.sql`); the rule editor is `src/components/app/views/SegmentRules.tsx`. The Omniscient client is a source connector (`src/lib/sources/omniscient.ts`).

Planned (from MP and CW):

```
collect/               /f (forms), /c (clicks), /u (unsubscribe)
src/lib/email/         ses client, domains, guard, templates (MJML), blocks, tokens, tracking links
src/lib/journeys/ or src/lib/workflows/   graph schema, engine, steps, simulation (open question in 6.6)
src/lib/brain/         ingest, atoms, embeddings, verifier
src/lib/pages/         blocks, renderer, forms, booking, personalization, domains
src/lib/scoring/       fit, intent, engagement, routing, handoff, SLA
src/lib/attribution/   touches, models, reports
src/lib/qa/            funnel checks on the existing runner
src/lib/agent/         marketing agent tools and loop, Slack, Linear
worker-intel/jobs/     one file per new group of job kinds
```

An Arrowsterr client has no home yet.

### 4.5 Environment

In use today (`docs/fly.md`, `docs/sources-setup.md`):

| Var | App | Purpose |
|---|---|---|
| `HUBSPOT_`, `SALESFORCE_`, `PIPEDRIVE_`, `ATTIO_`, `MAILCHIMP_` `CLIENT_ID` and `CLIENT_SECRET` | web, intel | One-click sign-in and refresh. Without them, HubSpot, Pipedrive, Attio and Mailchimp take a pasted key. |
| `SECRETS_KEY` | web, intel | Seals every source credential, and each source's webhook token |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | web, intel | Intel reads uploaded import files from storage |
| `OMNISCIENT_URL` | web, intel | Only if Omniscient isn't at `https://app.tryomniscient.com` |
| `APP_URL` | web | Only if the app isn't at `https://app.tryclaritia.com` |

There is no `HOOK_SECRET`. Each source's webhook URL carries its own random token, sealed with `SECRETS_KEY` (`src/lib/sources/server.ts`, `036_sources.sql`, `039_source_hook_secret.sql`). M1's variables (`CLR_ID_SECRET`, `IPINFO_TOKEN`, `CORESIGNAL_API_KEY`) are in `docs/fly.md`.

Planned:

| Var | App | Purpose |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | web, intel | Sheets, Google Ads |
| `<SOURCE>_CLIENT_ID`, `<SOURCE>_CLIENT_SECRET` | web, intel | One pair per further OAuth source (Zoho, Dynamics, Airtable, Notion, Zoom, LinkedIn, Meta, Klaviyo, Constant Contact, Kit, Intercom, Outreach, Salesloft, monday) |
| `AWS_SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | intel | Sending |
| `SES_SNS_TOPIC_ARN` | web | Checks SES events |
| `TRACK_SECRET` | collect | Click and unsubscribe tokens |
| `ANTHROPIC_API_KEY` (exists on the runner) | intel | Mapping, titles, Decide, Write, reasons, plays, agents, migration |

---

## 5. Built so far

Migrations `020` to `039` exist. Part 8.1 lists their tables.

### 5.1 M0. Foundation and suite (built)

- **Jobs queue** (`020_foundation.sql`, `src/lib/jobs.ts`): `enqueue_job`, `claim_job`, `extend_job`, `finish_job`, `prune_jobs`, and the `minute_tick` that pg_cron runs every minute. Jobs that share a key run one at a time, and only one waits per key, so bursts collapse. Leases that run out go back in line, retries back off (1, 5, 30 minutes, then 2 and 6 hours), and finished jobs are pruned. Server-only. Tests: `tests/db/jobs.sql` and `tests/jobs.test.ts`. Runs, plans and explorations keep their own claim functions. New work (M1 onward) uses the queue.
- **Features flag:** `workspaces.features` (`testing`, `marketing`). Only the server changes it. Existing workspaces kept `testing`; new workspaces start on `marketing` (`031_marketing_default.sql`). With both, the testing screens sit under one Testing group. Logic in `src/lib/nav.ts`, tested in `tests/nav.test.ts`.
- **First screen** (`ToolIntro`) for Visitors (`src/components/app/views/MarketingIntros.tsx`). The plan also had first screens for Journeys, Pages and Reports; those screens don't exist yet.
- **Suite connections:** Settings › Suite was built and then removed, because nothing opened it. Omniscient now connects as a source in Settings › Sources (5.5), and `/settings/suite` sends people there, because Omniscient links to it. The `suite_connections` table stays in `020_foundation.sql` until a database cleanup. Arrowsterr has no connection screen.
- **Tables:** `audit_log` and `privacy_requests` (owners read, server writes), plus leak tests for every new table.
- **Moved later:** Stripe plans for the platform (Part 14) move to before the Beta. There's nothing to meter until contacts and emails exist.

### 5.2 M1. Website Intelligence (built)

Built as planned in `docs/m1-website-intelligence.md`, which holds its status, files, tests and cost: the script and `collect`, identity stitching (`docs/identity.md`), company match with IPinfo and Coresignal, signals and account scores, Visitors, Accounts, Account and Person pages, and Slack account alerts (migrations `021` to `032`, `worker-intel/jobs/stitch.ts`, `company.ts`, `signals.ts`). Hot accounts are not yet pushed to Omniscient (there is no `omniscient_push` job).

### 5.3 Week 1. Contacts, CSV import, filter bar (built)

| Piece | Where |
|---|---|
| Tables, consent, fields, events by month, imports, saved views, and the database functions | `supabase/migrations/033_contacts.sql` |
| Filters with one meaning in the browser and the database | `src/lib/filters.ts`, `contacts_where` |
| CSV read and write, column guesses, consent by region, import, add and edit | `src/lib/contacts/` |
| Server routes (emails are cleaned here, so writes stay server only) | `src/app/api/contacts/route.ts`, `src/app/api/contacts/import/route.ts` |
| Filter bar with saved views, on Contacts, Visitors and Accounts. The old Accounts tabs are built-in views. | `src/components/app/FilterBar.tsx` |
| Contacts screen, import wizard, add and edit, contact page | `src/components/app/views/ContactsView.tsx` |
| Tests | `tests/contacts.test.ts`, `tests/pg/contacts.pg.ts`, contacts block in `tests/db/leaks.sql` |

- **Done when, met:** a 10,000-row CSV imports with dedupe in about 4 seconds on a local database, and a second run creates nothing. Filters work on Contacts, Visitors and Accounts.
- **Flaky cases tested:** a batch whose answer is lost is sent again with no doubles; two imports of the same people at once make no doubles; a contact follows its person through stitching, merges in either order, a rebuild and erasure; 36 filter cases give the same rows in the database and the browser.
- **Running cost of week 1:** $0 at Beta, about $1 at Growth (Supabase disk, check). No new service, no Claude calls.

### 5.4 Records and week 2. Imports at full size (built)

Records (custom objects and rich fields from week 8, pulled forward so imports and sources write into them) and week 2 (imports at full size). The build used `035_imports.sql` (records took `034`), one import run shared by the web app and the job in place of staged rows, and undo from field history.

| Piece | Where |
|---|---|
| Which source wins per field, field history, rich field types, custom objects, links between records, saved views with columns, sort, board and group | `supabase/migrations/034_records.sql`, `src/lib/records/` |
| Contacts, Leads board, Companies, custom objects, record pages, Settings › Fields and Objects | `src/components/app/records/`, `src/components/app/views/ContactsView.tsx`, `RecordsViews.tsx`, `FieldsSettings.tsx`, `ObjectsSettings.tsx` |
| Imports bucket, background imports that pick up where they stopped, suppressions first, undo for 30 days, error files | `supabase/migrations/035_imports.sql` |
| CSV of any size and encoding, Excel (with sheet choice, dates and formulas), vCard, paste; phone, name and title cleaning | `src/lib/contacts/csv.ts`, `files.ts`, `vcard.ts`, `clean.ts` |
| One import run for the web app and the job; the `import_file` and `import_undo` jobs and file cleanup in `claritia-intel` | `src/lib/contacts/importRun.ts`, `importJob.ts`, `worker-intel/jobs/imports.ts` |
| Import wizard (upload, map, list type, preview with outcomes, progress, report, errors, undo) and Settings › Imports | `src/components/app/records/ImportPanel.tsx`, `src/components/app/views/ImportsSettings.tsx` |
| Tests | `tests/imports.test.ts`, `tests/pg/records.pg.ts`, `tests/pg/imports.pg.ts`, records and imports blocks in `tests/db/leaks.sql` |

- **Flaky cases tested:** a 60,000-row file (set `IMPORT_TEST_ROWS=2000000` for the full run) stopped twice mid-import lands every row once with matching counts; undo after an overlapping second import and a person's edit takes back only what the first import did; a file never overwrites a CRM value; an unsubscribed address never gets consent back from a later row.
- **Left for later weeks:** Google Sheets picker (needs the Google OAuth app), old `.xls` files, Haiku for titles the rules miss, the import's file name on each value's source tag.
- **Needs set on `claritia-intel`:** `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (it reads uploaded files from storage).
- **Running cost:** Supabase storage for uploads, deleted after 30 days: under $1 at Beta, about $5 at Growth (check). `claritia-intel` to 1 GB for big Excel files: about $3 at Beta and Growth (check). No Claude calls. **Total: about $4 at Beta, about $8 at Growth.**

### 5.5 Weeks 3 to 7. Sources framework and 20 tools (built in part)

| Piece | Where |
|---|---|
| Sources, sealed credentials, links by the tool's id with the values both sides last agreed, runs, sync log (90 days), mappings, staged webhooks, lists as static segments, the minute tick that runs due pulls and pushes | `supabase/migrations/036_sources.sql`, `039_source_hook_secret.sql` |
| Connector contract, calls with retries and token refresh, sign-in with signed state and PKCE, mapping, the pipeline (in, out, hooks) and the runner | `src/lib/sources/` (`types.ts`, `ctx.ts`, `oauth.ts`, `map.ts`, `sync.ts`, `push.ts`, `syncDeps.ts`, `run.ts`, `registry.ts`, `catalog.ts`) |
| Two-way: HubSpot (search window, app webhooks with v3 signatures, batch writes), Salesforce (queryAll on SystemModstamp with deletes, Composite writes, new contacts as Leads), Omniscient (one-click from its approve page, signed webhooks) | `hubspot.ts`, `salesforce.ts`, `omniscient.ts` |
| In: Pipedrive, Attio, Close; Mailchimp, Klaviyo, ActiveCampaign, Brevo, Kit, MailerLite; Stripe, Intercom | `crms.ts`, `email.ts`, `product.ts` |
| Webhooks: Typeform, Tally, Webflow, Calendly, Cal.com (signatures checked) and any tool that posts JSON | `forms.ts`, `hooks.ts`, `src/app/api/hooks/` |
| Connect, sign-in callback, webhook URL, mapping routes | `src/app/api/sources/` |
| `source_pull`, `crm_push`, `source_hook` jobs | `worker-intel/jobs/sources.ts` |
| Settings › Sources › Tools (catalog with logos, connect by sign-in or key, source page with sync settings, field mapping and runs) and Settings › Sync log (filters, retry) | `src/components/app/views/SourcesSettings.tsx`, `SourcePanel.tsx`, `SyncLog.tsx` |
| Tests | `tests/sources.test.ts` (every connector against recorded answers), `tests/pg/sources.pg.ts`, sources block in `tests/db/leaks.sql` |

- **Flaky cases tested:** HubSpot two-way through 1,000 random changes on both sides (edits, creates, deletes, merges, email changes) with 20% of webhooks dropped, 10% sent twice, 5% of calls answered 429 and the token expiring twice: both sides end equal, nothing doubled, and a further round writes nothing and logs nothing (passes on 5 seeds). A form webhook sent twice makes one contact; a paused source holds its hooks. Found and fixed on the way: a value that lost to a person's edit was never pushed back; the push cursor re-read the same 200 contacts inside its 30-second window; an update to a record deleted on the other side failed forever; a tool that ignores a field we write, or a record type without a column, caused a write every round.
- **Needs set:** on `claritia-web` and `claritia-intel`, `SECRETS_KEY` (credentials are sealed with it) and, for one-click sign-in, `HUBSPOT_`, `SALESFORCE_`, `PIPEDRIVE_`, `ATTIO_`, `MAILCHIMP_` `CLIENT_ID` and `CLIENT_SECRET`; `OMNISCIENT_URL` if it isn't `https://app.tryomniscient.com`. HubSpot's app sends webhooks to `/api/hooks/hubspot`. Without a sign-in app, HubSpot, Pipedrive, Attio and Mailchimp take a pasted key. Steps are in `docs/sources-setup.md`.
- **Left for later weeks:** Part 10 lists what's left of weeks 3 to 7. Each tool's endpoints are rechecked on a real account before launch (check).
- **Running cost:** no new paid service and no Claude calls; the tools' APIs are free on the customer's plan. Pulls every 15 minutes for CRMs and hourly for the rest add work on `claritia-intel`: within the 1 GB machine at Beta, a second 1 GB machine at Growth, about $6 (check). Sync log and links on Supabase disk: under $1 at Beta, about $5 at Growth (check). **Total: about $1 at Beta, about $11 at Growth.**

### 5.6 Week 8. Segments and warehouses (built in part)

The build used `037_segments.sql` and `038_warehouses.sql`; custom objects landed in `034_records.sql` (5.4).

| Piece | Where |
|---|---|
| Rule trees (AND and OR, 3 levels) over contact and company fields, custom fields, lists, activity, website visits, email consent, sources and custom objects, compiled to one SQL condition with every value bound; live count and 10 contacts; hourly refresh; joining and leaving as contact events | `supabase/migrations/037_segments.sql` |
| Segments screen and builder | `src/components/app/views/SegmentsView.tsx`, `SegmentRules.tsx` |
| `segment_refresh` job | `worker-intel/jobs/segments.ts` |
| Warehouse sources: PostgreSQL, Redshift, MySQL, ClickHouse, BigQuery, Snowflake (key pair), Databricks behind one runner; one SELECT only, `:cursor` bound by the driver, read-only transactions where the database has them, 120-second limit, 5,000 rows a page, private hosts refused | `src/lib/sources/warehouse.ts`, `src/lib/sources/sql.ts` |
| Rows become contacts, companies, activity on contacts (a replay adds nothing) or custom object records linked to their contact | `supabase/migrations/038_warehouses.sql`, `src/lib/sources/sync.ts` |
| Query editor with Test on the source page; the read-only grant on the connect screen | `src/components/app/views/SourcesSettings.tsx`, `src/app/api/sources/test-query/route.ts` |
| Tests | `tests/pg/segments.pg.ts`, warehouse cases in `tests/sources.test.ts` and `tests/pg/sources.pg.ts`, segments block in `tests/db/leaks.sql` |

- **Flaky and hostile cases tested:** 35 rule cases against a hand-counted fixture; values like `'; drop table contacts; --`, `%`, `_` and `$2` match nothing and change nothing; 4-level groups, unknown fields, events, objects and other workspaces' sources are refused; a refresh logs who joined and who left, and a second refresh changes nothing. A warehouse query reads on from its cursor and logs only changed rows; activity read twice lands once; two statements, a write hidden in a WITH, and a write through a function are all stopped (the last by the read-only transaction).
- **Left for later weeks:** per-contact segment refresh on change (hourly and on save for now); Segment, RudderStack, PostHog, Mixpanel, Amplitude, Shopify and the other product, billing and support connectors; data vendors, Outreach and Salesloft; the Data model screen; a Snowflake and BigQuery account test (both are tested against recorded answers until then, check).
- **Founder:** a Snowflake trial and a BigQuery project for tests; lawyer answer on the data vendor rule.
- **Running cost:** no new paid service and no Claude calls; warehouse queries run on the customer's warehouse. Hourly segment refresh and warehouse pulls: Supabase compute within the current plan at Beta, one size up at Growth, about $25 (check); `claritia-intel` within the machines from 5.5. **Total: $0 at Beta, about $25 at Growth.**

### 5.7 Not built yet

- From weeks 2 to 8: the leftovers in 5.4 and 5.6, and the week 3 to 7 leftovers in Part 10: Marketo, Pardot, Eloqua and the other week 6 tools, the other form, event and ad lead tools, Zapier, Make and n8n, the WordPress plugin, `POST /api/v1/contacts/import` and the rest of the REST API for contacts, and the read-only MCP tools.
- Weeks 9 to 21 (Part 10). Week 9 (sending through Amazon SES) was started and then reverted (see git), so nothing of it is in the code.
- An `omniscient_push` job for hot accounts (5.2).
- Brand Brain and Funnel QA, which have no week yet (Part 9).

---

## 6. Modules

### 6.1 M1. Website Intelligence

Built. Status and build plan: `docs/m1-website-intelligence.md`. Specs: `docs/identity.md` (all parts) and `docs/account-intelligence.md` Parts 3, 5, 6.1, 7.1 and 7.2. Kept for later from the MVP cut: ClickHouse at Growth; Snitcher as a second company source, and bring your own key for 6sense and Demandbase; people suggestions, tech scan and job boards in enrichment; company events (`docs/account-intelligence.md` 7.3).

### 6.2 M2. Contacts, sources, records and segments

**Problem:** marketing needs its own list of people, with consent and behavior, without fighting the CRM. The goal: no team stays on an old tool because their contacts are stuck in it. Every source lands through one pipeline, so dedupe, consent, suppression and undo work the same for all of them. What's built is in 5.3 to 5.6; the spec per source is `docs/contact-sources.md`.

#### 6.2.1 The pipeline

```
 source (file, API, webhook, warehouse)
        │  pull, page by page, with a saved cursor
        ▼
 import run (rows in pages of 5,000)                           ── preview, error file
        │  map fields (saved mapping, then AI suggestions for unknown columns)
        │  clean (email, phone, country, names, title → seniority and department)
        │  consent and suppression rules for the source
        ▼
 contacts_upsert (week 1) ── contacts, companies, field_writes, consents, contact_events
        │                    source_links (source record id → contact)
        ▼
 suppressions, segments (static lists), engagement history, custom objects
```

The CP plan staged rows in an `import_rows` table first. The build runs one import run in pages instead (5.4).

- **One pipeline, many sources.** Each source is a connector that knows how to sign in, list its objects and fields, pull records page by page, and say what changed since a cursor. Everything after that is shared.
- **Staging first.** The plan: records land in staging before they touch contacts. That gives a preview of the first 20 rows with what will happen to each (new, update, merge, skip, suppressed), a dry run, and an error file to download.
- **Resumable.** Each import is a chain of jobs that saves its cursor after every page. A crash or deploy picks up at the last page. A page sent twice changes nothing (week 1's upsert is safe to repeat).
- **Undo.** Every contact, field write and consent row carries its `import_id`. "Undo import" removes contacts the import created that nobody changed since, and puts back field values the import overwrote (from `field_writes`). Undo is open for 30 days.
- **Big files.** Files go straight from the browser to storage in parts (resumable upload), then a background job reads them in a stream. Up to 1 GB and 2,000,000 rows. Week 1's 50,000-row in-request import stays for small files, since it's instant.

#### 6.2.2 Matching and merging across sources

**Dedupe:** contacts match on cleaned email through `docs/identity.md` Part 6. A contact always points to one identity person.

| Rule | Detail |
|---|---|
| Match order | 1. The source's record id in `source_links`. 2. Cleaned email (`docs/identity.md` Part 6). 3. A CRM id field on the record (a HubSpot id in a Mailchimp merge field, a Salesforce id in a Marketo record). |
| No email | Allowed when the source gives a stable id (a Salesforce lead with no email, a Pipedrive person with a phone). Such contacts can't get email until an email arrives. |
| Same email, two records in one source | One contact, both source links kept, a `conflict` row in the Sync log |
| Which value wins | Each field has a source order, set per workspace. Default: CRM > form > product > file import > data vendor > AI. A lower source fills a blank field and never overwrites a higher one. A newer value from the same source wins. |
| Where a value came from | `field_writes` keeps the latest value per field and source (week 1), so the contact page shows each value's source and any value can be put back |
| Companies | By domain, then by name. Data vendor firmographics never overwrite CRM values. |

#### 6.2.3 Consent and suppression on the way in

Consent rules from 12.1 apply to every source. On top of that:

| Rule | Detail |
|---|---|
| Unsubscribes come with the contacts | Every email tool's unsubscribed, bounced, complained and cleaned addresses go into `suppressions` first, before any contact, so nothing can send to them even mid-import. Suppressed addresses with no contact still block sends. |
| Consent maps per tool | Each connector maps its own consent fields: Mailchimp `subscribed` with double opt-in becomes opt-in with the signup time; Klaviyo email consent `SUBSCRIBED`; HubSpot legal basis properties; Marketo `unsubscribed`; Brevo and ActiveCampaign list status (exact field names: check each tool's docs). |
| Proof kept | The source tool, its record id, the consent time and any wording it stored go into `consents.source` and `consents.wording` |
| Strict regions | Outside opt-in, contacts in strict regions and unknown countries get "No basis" (week 1 rule) |
| Data vendors | Apollo, ZoomInfo, Lusha, Clearbit, Cognism and Clay rows are bought data. They come in for scoring, ABM and ads audiences with source class `data_vendor` and basis "No basis", and can't get marketing email until they opt in. A CSV marked "Bought or rented list" is still refused (lawyer check on the data vendor rule). |
| Erased people stay erased | Each incoming email is checked against `erasures` (`docs/identity.md` 15.1). A match is skipped and counted. |

#### 6.2.4 Every source

Status: **Two-way** = live sync both ways. **Live in** = new and changed records arrive within minutes. **Scheduled** = pulled on a schedule (hourly by default). **One-time** = a migration import, which can be run again. Built today: 5.5 and 5.6.

Limits and field names are from memory and need checking against each vendor's current docs before that connector is built (marked "check" in 6.2.5).

**Files and spreadsheets**

| Source | Mode | How | What comes in |
|---|---|---|---|
| CSV, TSV | One-time | Upload or paste. Comma, semicolon or tab. Any encoding (UTF-8, UTF-16, Windows-1252 found by sniffing). | Rows |
| Excel (.xlsx, .xls) | One-time | Upload, pick the sheet | Rows |
| Google Sheets | Scheduled | Google sign-in, pick file and tab | Rows, re-read on a schedule, only changed rows written |
| Airtable | Scheduled | OAuth, pick base, table and view | Records |
| Notion database | Scheduled | OAuth, pick database | Pages as rows |
| vCard (.vcf) | One-time | Upload (exports from phones, Outlook, Apple Contacts) | Contacts |
| Paste | One-time | Paste emails or a table into a box | Rows |

**CRMs**

| Source | Mode | Auth | Objects |
|---|---|---|---|
| HubSpot | Two-way | OAuth public app | Contacts, companies, deals, lists, legal basis, owners |
| Salesforce | Two-way | OAuth with PKCE | Leads, contacts, accounts, opportunities, campaigns, campaign members, users |
| Omniscient | Two-way | One-click app key | Contacts, accounts, deals, activities |
| Pipedrive | Scheduled, live in by webhook | OAuth | Persons, organizations, deals, labels |
| Zoho CRM | Scheduled | OAuth | Leads, contacts, accounts, deals |
| Microsoft Dynamics 365 | Scheduled | OAuth (Entra ID) | Leads, contacts, accounts, opportunities |
| Attio | Scheduled, live in by webhook | OAuth | People, companies, lists, custom objects |
| Close | Scheduled, live in by webhook | API key | Leads, contacts, opportunities |
| Copper | Scheduled | API key | People, companies, opportunities |
| Freshsales | Scheduled | API key | Contacts, accounts, deals |
| monday CRM | Scheduled | OAuth | Contacts and accounts boards |
| Affinity | Scheduled | API key | People, organizations, lists |

**Marketing automation and email tools**

Every one brings contacts, lists, custom fields, unsubscribes and bounces, consent, and 13 months of sends, opens and clicks (for scoring). The four Conversion migrates from also bring programs, workflows, emails and forms for the migration agent (6.13).

| Source | Mode | Auth | Extra objects |
|---|---|---|---|
| Marketo | One-time, then scheduled until cutover | REST API client id and secret | Smart lists, static lists, programs, smart campaigns, emails, forms, activity log (bulk extract) |
| Salesforce Account Engagement (Pardot) | One-time, then scheduled | Salesforce OAuth | Prospects, lists, Engagement Studio programs, emails, forms, visitor activity |
| Oracle Eloqua | One-time, then scheduled | OAuth | Contacts, segments, shared lists, campaigns, emails, forms, activities (bulk API) |
| HubSpot Marketing | Two-way contacts (as above) | Same app | Active and static lists, workflows, marketing emails, forms, subscription types |
| ActiveCampaign | One-time, scheduled | API key | Lists, tags, automations, campaigns |
| Mailchimp | One-time, scheduled | OAuth | Audiences, tags, segments, merge fields, campaigns, member activity |
| Klaviyo | One-time, scheduled | OAuth or private key | Lists, segments, flows, campaigns, profile events |
| Brevo | One-time, scheduled | API key | Lists, attributes, campaigns |
| Customer.io | One-time, scheduled | App API key | People, segments, campaigns, deliveries |
| Iterable | One-time | API key | Users, lists, campaigns, events |
| Braze | One-time | REST key | Users (export), segments, campaigns |
| Constant Contact | One-time | OAuth | Contacts, lists, campaigns |
| Kit (ConvertKit) | One-time | OAuth | Subscribers, tags, forms, sequences |
| MailerLite | One-time | API key | Subscribers, groups, campaigns |
| Campaign Monitor | One-time | API key | Subscribers, lists, campaigns |
| SendGrid Marketing | One-time | API key | Contacts, lists, suppressions |
| Loops | One-time | API key | Contacts, mailing lists |
| Intercom | Scheduled | OAuth | Users, leads, companies, tags, conversations count |

**Forms, scheduling and events (live in)**

| Source | How | Lands as |
|---|---|---|
| Claritia forms | Native (6.7) | Contact, consent with exact wording, form event |
| Typeform, Tally, Jotform, Google Forms, Fillout, Formstack | Webhook or OAuth | Contact, form event, answers as fields |
| Webflow, Framer, WordPress (Gravity Forms, Contact Form 7, WPForms), Wix | Webhook, plugin for WordPress | Contact, form event |
| HubSpot forms, Marketo forms (during migration) | Through the sync | Contact, form event |
| Calendly, Chili Piper, Cal.com, SavvyCal | Webhook | Contact, meeting booked event, owner |
| Zoom Webinars and Meetings | OAuth, webhook | Registrant, attended with minutes, no-show |
| Cvent | API (partner access, check) | Registrations, check-ins, into a campaign hourly |
| Luma, Eventbrite, Goldcast, Livestorm, ON24 | Webhook or OAuth | Registered, attended, no-show |
| LinkedIn Lead Gen Forms | OAuth (Marketing API access, check) | Contact, ad lead event with campaign |
| Meta Lead Ads | OAuth (page lead access) | Contact, ad lead event |
| Google Ads lead forms | Webhook | Contact, ad lead event |
| Zapier, Make, n8n | Our REST API and an app listing for each | Anything a team already pipes around |

**Product, billing and support**

| Source | Mode | What |
|---|---|---|
| Segment, RudderStack | Live in (destination) | Identify (traits to fields), track (events), group (company) |
| PostHog, Mixpanel, Amplitude | Live in (webhook or export) and scheduled | Users, cohorts as static segments, events |
| Stripe | Live in (webhook) | Customers, plan, MRR, trial end, cancellations |
| Shopify | Live in (webhook) | Customers, orders, marketing consent |
| Chargebee, Paddle, Recurly | Live in (webhook) | Subscriptions, plan, MRR |
| Zendesk, Intercom, Front | Scheduled | Ticket counts, CSAT, last contact |

**Warehouses and databases (read only, scheduled)**

| Source | Auth | Notes |
|---|---|---|
| Snowflake | Key pair, read-only role | Saved queries on a schedule |
| BigQuery | Service account, read-only dataset | Same |
| Databricks | Personal access token or OAuth M2M, SQL warehouse | Same |
| Amazon Redshift | Read-only user | Same |
| ClickHouse | Read-only user | Same |
| PostgreSQL, MySQL | Read-only user, IP allow list, SSL | Same |

Each warehouse source is a saved query with a key column (email or a CRM id), a cursor column (updated_at) and a schedule. It can feed contacts, companies, custom objects or events. A run has a 120 s timeout and pages of 5,000 rows (5.6; the plan had a 100,000-row cap per run).

**Sales engagement and data vendors**

| Source | Mode | Basis |
|---|---|---|
| Apollo, ZoomInfo, Lusha, Cognism, Clearbit (HubSpot Breeze), Clay | Customer's own API key, one-time or scheduled | "No basis", source class `data_vendor` (6.2.3) |
| Outreach, Salesloft | OAuth, scheduled | Keeps the source's basis; sequences become a field, so marketing pauses contacts in an active sequence |
| LinkedIn Sales Navigator | CSV export only (no open API) | "No basis" |

**API and agents**

| Way in | Detail |
|---|---|
| `POST /api/v1/contacts/import` | Up to 10,000 contacts per call as JSON or NDJSON, with an `Idempotency-Key` header. Returns an import id to poll. |
| `POST /api/v1/contacts` | One contact, upsert by email or external id |
| `POST /api/v1/events` | Segment-shaped events |
| MCP tool `import_contacts` | Requires approval by default, like Conversion. Shows the preview before it runs. |

#### 6.2.5 Connector build list and checks

| Connector group | Build order | Checks before building |
|---|---|---|
| Files, Excel, Sheets, paste, vCard | Week 2 | Excel library license (SheetJS Community Edition is Apache 2.0, check) or `exceljs` (MIT) |
| HubSpot | Week 3 | Public app rate limits and webhook limits (check) |
| Salesforce, Omniscient | Week 4 | CDC per edition, Bulk API 2.0 and Composite limits (check) |
| Mailchimp, ActiveCampaign, Klaviyo, Brevo, Kit, Constant Contact, MailerLite, SendGrid, Loops, Campaign Monitor | Week 5 | Each export API, consent fields and rate limits (check) |
| Marketo, Pardot, Eloqua, HubSpot Marketing, Customer.io, Iterable, Braze, Intercom | Week 6 | Marketo bulk extract daily quota, Pardot API v5 limits, Eloqua bulk limits (check) |
| Pipedrive, Zoho, Dynamics, Attio, Close, Copper, Freshsales, monday, Affinity, Airtable, Notion | Week 6 | OAuth app approval steps for each (check) |
| Forms, scheduling, events, ads lead forms, Zapier, Make, n8n | Week 7 | LinkedIn Marketing API access and Cvent partner terms (check) |
| Segment, RudderStack, PostHog, Mixpanel, Amplitude, Stripe, Shopify, billing, support | Week 8 | None |
| 7 warehouses | Week 8 | Databricks SQL connector for Node (check) |
| Data vendors, Outreach, Salesloft | Week 8 | Lawyer check on the data vendor rule |

A connector is about 150 to 400 lines once the framework exists: auth, field list, pull with cursor, default mapping, consent and suppression mapping, and a recorded-response test.

#### 6.2.6 Field mapping

1. **Saved mapping** for this source in this workspace, if one exists.
2. **Known fields.** Each connector ships a field dictionary: HubSpot `firstname` → First name, Marketo `Company` → Company, Mailchimp `FNAME` → First name, and so on.
3. **Header guesses** from week 1 (`guessTarget`).
4. **AI suggestions** for what's left: Haiku gets the column names and 5 sample values (emails masked) and picks a field, a new custom field with a type, or Skip, with a confidence. Cached by the hash of the headers, so the same export never asks twice. The marketer confirms each suggestion.
5. **Value maps.** Each connector maps its own values: HubSpot lifecycle stages, Marketo lead status, Salesforce lead status, Mailchimp member status, Pipedrive labels. Unknown values go to a review list on the mapping screen.

Custom fields made during mapping get a type (text, number, date, yes/no, pick list) from the samples, which the marketer can change before running.

#### 6.2.7 Cleaning on the way in

| Step | How |
|---|---|
| Email | `cleanEmail` (week 1). Invalid and disposable skipped. Optional MX check (`src/lib/identity/mx.ts`), off for files over 100,000 rows. |
| Phone | Parsed with `libphonenumber-js` (MIT) to E.164, with the contact's country as the hint |
| Country and region | ISO codes from names and codes (week 1), US states and Canadian provinces to their codes |
| Names | Trimmed; ALL CAPS and all lower case fixed to Name Case; "Doe, Jane" split right |
| Title | Seniority (C-level, VP, Director, Manager, Individual) and department (Marketing, Sales, Engineering, Product, Finance, HR, Operations, Other) by rules first, Haiku for the rest, cached by title |
| Company | Domain from work email or website; Coresignal enrichment for new domains (existing `enrich_company` job) |
| Duplicates inside the file | Merged, later rows winning (week 1) |

#### 6.2.8 Lists, history and objects

| What | Lands as |
|---|---|
| Static lists, tags, groups, audiences | Static segments with the same name and members |
| Smart lists, active lists, segments with rules | Rebuilt as dynamic segments by the migration agent (6.13), with a count check |
| Unsubscribes, bounces, complaints, cleaned | `suppressions` with reason and source |
| Topic or subscription types | `topics` and `subscriptions` |
| Email history (13 months) | `contact_events` (`email.sent`, `email.clicked`, `email.replied`; opens kept and marked unreliable) for scoring and segments |
| Form fills, webinar attendance, meetings | `contact_events` |
| Deals, opportunities | Read-only `deals` linked to contacts and companies, for scoring and attribution |
| Anything else (product subscriptions, devices, orders) | Custom objects (6.2.10) |

#### 6.2.9 Screens

| Screen | Holds |
|---|---|
| Contacts › Import | Choose: upload a file, paste, or pick a source. Then objects and lists, mapping with suggestions, source and consent, preview of 20 rows with their outcome, Run. Progress while it runs. Report with counts, the error file and Undo. |
| Settings › Sources (the Tools tab) | Every source as a card with its state tag (Connected, Syncing, Error, Not set up), last sync and Connect. Search and filter by group. |
| Source page | Objects and direction, schedule, mapping, value maps, field order, last 50 runs, Pause, Disconnect |
| Settings › Imports | Every import with who, when, source, counts and Undo while open |
| Settings › Sync log | Every sync and import row, filtered by source, object, action and error, with Retry |
| Contacts | Table with column filters and saved views, and a contact page with timeline, consents, segments, journeys and scores |
| Segments | A builder with a live count and a sample of 10 |

First screens use `ToolIntro`. Working screens hold labels, buttons and real errors only.

#### 6.2.10 Data model

| Object | Notes |
|---|---|
| Contact, company (week 1) | Standard fields plus custom fields |
| Deal | Read only, from the CRM or Omniscient |
| Campaign, campaign member | Two-way with Salesforce and HubSpot |
| Custom objects | Defined per workspace: name, key, fields, and links to contacts, companies or each other (one-to-one, one-to-many, many-to-many). Filled from warehouses, product tools or the API. |
| Events | `contact_events` by month (week 1), plus `account_events` for company-level events |

Built: contacts, companies, custom objects and links (`033_contacts.sql`, `034_records.sql`). Deals, campaigns and `account_events` have no table yet (Part 8).

Custom objects in segments and workflows:
- A segment rule can reach through a link: "has a Subscription where plan is Pro and seats ≥ 20".
- A workflow can trigger on a custom object row created or changed.
- Email tokens can read linked rows: "{{subscription.plan}}".
- Every link is one SQL join with bound parameters, keys from the registry (6.2.11).

#### 6.2.11 Segments and filters

- One `FilterBar` (week 1) for Contacts, Segments, Visitors and Accounts.
- Rule kinds:
  - **Contact fields:** title, country, lifecycle and custom fields.
  - **Company fields:** size, industry, tech, fit.
  - **Custom objects and CRM fields.**
  - **Behavior and events:** visited a page group N times in N days, opened a form, clicked an email, read a page for N minutes, attended a webinar.
  - **Scores:** intent, fit, engagement.
  - **Suite data:** Omniscient opportunity stage or owner, Arrowsterr source (for example "came from an AI answer").
  - **Membership:** segment and campaign membership, source.
  - **Consent:** subscribed to a topic.
- AND and OR groups, up to 3 levels, built with the app's `Select`.
- Every rule tree compiles to one SQL query with bound parameters, never string-built; field keys come from the registry.
- Live count and a sample of 10 while editing (debounced 400 ms, 2 s timeout).
- Dynamic segments refresh per contact on change and fully every hour. Entering or leaving fires journey or workflow triggers.

What's built is in 5.6.

#### 6.2.12 Sync (MP version)

| Source | Direction | What |
|---|---|---|
| Omniscient | Both ways | Contacts, accounts, owners, opportunity stage. Claritia writes marketing activities (email sent, page read, form) to the Omniscient timeline. |
| HubSpot (`docs/account-intelligence.md` 6.2) | Both ways | For teams not on Omniscient |
| Salesforce | Both ways | Leads, contacts, accounts, opportunities, campaign members. MP had this at week 27+; it was built in week 4 of the CP order (5.5). |
| Segment, PostHog | In | Product events and identify |
| Stripe | In | Customer status, plan, MRR |
| CSV import | In | With field mapping, dedupe through identity, and a consent basis |

Tests from the MP plan:
- Segment SQL matches a hand-counted fixture for 30 rule types.
- No SQL is built from user strings (a fuzz test with SQL-like text in values).
- Two-way sync with an Omniscient test workspace makes no doubles and no loops (each write carries `source=claritia` and is ignored on echo).
- An import without a consent basis for EU contacts gives them "No basis". (MP said such an import is refused; the code and 12.1 import them as "No basis", and the wizard asks for a basis before it runs.)

---

### 6.3 Buyer Analytics

> **Open question: is Buyer Analytics in scope?** This spec comes from the buyer enablement plan (PP M2). The module plan replaced that plan and has no Buyer Analytics module; its reports live in M8. `docs/account-intelligence.md` still schedules "M2 Buyer Analytics (dashboards, goals, funnels, attribution)" for its week 13. The spec is kept here until the owner decides. `site_daily` and `account_daily` exist (`021_web.sql`, built with M1); goals, funnels, deals and touches don't.

**Problem it solves:** marketing can't tie site traffic and content to pipeline and revenue.

**Tables** (PP called this migration `023_analytics.sql`; that number is now `023_identity.sql`, so it would take the next free number):

```sql
site_daily     (site_id, day, path, source, medium, campaign, country, device_type,
                visitors int, sessions int, views int, engaged_s bigint, bounces int)
account_daily  (workspace_id, account_id, day, sessions, people, views, engaged_s, high_views)
goals          (id, workspace_id, site_id, name, kind text, match jsonb)   -- url, click, form, hubspot_stage
goal_hits      (goal_id, session_id, person_id, account_id, at)
funnels        (id, workspace_id, name, steps jsonb, window_days int)
deals          (id, workspace_id, hubspot_deal_id, account_id, name, amount, currency, stage,
                pipeline, created_at, closed_at, won bool)
touches        (id, workspace_id, account_id, person_id, session_id, at, source, medium, campaign,
                kind text)     -- session, email_click, page_view, asset_view, action
```

- **Rollups:** an hourly pg_cron job re-rolls the last 3 hours so late events land. A nightly job re-rolls yesterday.
- **Unique visitors:** exact distinct counts per day per dimension at Beta. Use the `hll` extension at Growth if Supabase offers it (check).
- **Goals:** checked by a job on new sessions and events.
- **Funnels:** a SQL function with window functions over sessions per device or person within `window_days`.
- **Attribution:** `attribution(p_workspace, p_from, p_to, p_model)` with first touch, last touch, linear, and U-shaped (40/20/40).
  - The deal's account gives the account's touches before `deal.created_at`.
  - The deal amount is spread across those touches by the chosen model.
- **Stripe revenue (optional):** customers pass `_clr_id` into Checkout metadata. A Stripe webhook links the payment to the device. This is the DataFast method.

**Screens:**
- **Analytics:** stat tiles (visitors, sessions, engaged time, identified accounts, pipeline), a visitors-over-time chart, and tables for sources, pages, countries and devices.
- Any table row can be clicked to filter the page.
- **Goals and Funnels:** a builder using the app's own `Select`.
- **Revenue:** pipeline and won revenue by source, campaign and page, with a model switcher.
- **Account journey:** a timeline on the Account page with every session, page, asset, email and deal stage.
- Charts with Recharts, following the dataviz skill and brand tokens.

**Tests:**
- Fixture events with known totals, so every tile and table matches by hand count.
- Attribution fixtures, so each model gives the expected split down to the cent.
- Late events at +2 hours are counted after the next hourly roll.
- Dashboards load in under 300 ms on 10 M fixture events (Beta scale).

**Done when:** a design partner can answer "which sources made pipeline last quarter" from one screen.

### 6.4 M3. Email Engine

**Problem:** marketing email has to reach the inbox, respect the law, and look right everywhere. Weeks 9 and 10 (Part 10).

**Sending:** Amazon SES. One configuration set per workspace, for event routing and reputation tracking.

| Stage | Setup |
|---|---|
| Beta | Shared SES IP pool, split by sending reputation tier |
| Growth | Dedicated IPs for workspaces sending 100K+ a month (check price), with an automatic warm-up schedule |

**Domains wizard (Settings › Sending):**
1. The customer adds a sending domain (for example `mail.acme.com`).
2. Claritia shows the DNS records to add:
   - DKIM: three SES CNAMEs (Easy DKIM).
   - SPF: through a custom MAIL FROM subdomain.
   - DMARC: at least `p=none` with a `rua` address.
   - A tracking subdomain CNAME for links.
3. A DNS check job polls each record and shows a green or red tag per record.
4. Sending stays blocked until DKIM and SPF pass, and DMARC exists.

**Bulk sender rules** (Gmail and Yahoo, for senders of about 5,000+ a day to them):

| Rule | How we meet it |
|---|---|
| SPF, DKIM and DMARC on the sending domain | Required by the wizard |
| One-click unsubscribe (`List-Unsubscribe` and `List-Unsubscribe-Post`, RFC 8058) | On every marketing email. `POST /u` unsubscribes at once. |
| Spam complaint rate under 0.3% (aim for under 0.1%) | Per-workspace complaint tracking. Sending pauses at 0.2% over 7 days. |
| Visible unsubscribe link and physical address (CAN-SPAM) | A footer block that can't be removed from marketing templates |

**Events:** SES sends to SNS, then to `/api/ses/events`, verified by SNS signature.

| Event | Action |
|---|---|
| Delivery | Logged |
| Bounce (hard) | Suppress the address for all topics |
| Bounce (soft) | Retry by SES. Suppress after 3 in 30 days. |
| Complaint | Suppress, unsubscribe from all, alert if the rate rises |
| Reject | Logged, alert |

**Tracking:**
- **Clicks:** links rewritten to `t.<customer domain>/c/<token>` (`docs/identity.md` 5.6 rules), with human-proof handling so scanner clicks don't count.
- **Opens:** tracked with a pixel but labeled "unreliable" in reports, because Apple Mail Privacy Protection and scanners load images. Reports lead with clicks, replies, page reads and conversions.

**Templates:**
- A block editor (text, image, button, columns, divider, spacer, social, case study card, signature, footer, custom HTML). Drag to reorder. Blocks compile to MJML and then HTML.
- Field tokens from a picker, including custom objects. Personalization tokens with fallbacks (`{{first_name | "there"}}`). Missing tokens with no fallback block the send.
- Personal blocks shown only when a rule passes ("Show if industry is Fintech").
- Brand kit: logo, colors, fonts, footer and address, taken from the customer's site by the Explorer, then edited.
- Plain-text version made automatically.
- Preview at desktop, tablet and phone widths, in light and dark mode. Test send to any teammate, with a chosen contact's data.

**Sending pipeline:**
1. The `send` job checks:
   - consent and topic subscription for the contact's region (12.1);
   - suppression;
   - the frequency cap (default 3 marketing emails per 7 days per contact);
   - quiet hours in the contact's time zone.
2. It renders the email, rewrites links, adds headers, and sends through SES with up to 14 messages a second per workspace at Beta (check the SES account rate). Send-time follows the contact's time zone.
3. It writes `email_messages` and a contact event, and posts an activity to Omniscient.

**Also from CP Part 8:**

| Part | Detail |
|---|---|
| Reports | Sent, delivered, human clicks, replies, unsubscribes, bounces, complaints, pipeline. Opens shown and marked unreliable. |
| Campaign link | Recipients join a CRM campaign as Sent, then Responded on click |
| A/B | Subject or body, split by percent, winner by clicks after a set time |

**Screens:**
- **Emails:** a list of broadcasts and journey emails. The editor has a live preview at 3 widths, test send, and "Check with Funnel QA" (M9).
- **Broadcasts:** pick a segment and a topic, schedule in the contact's time zone, and send.
- **Settings › Sending:** domains with record tags (Verified, Waiting, Wrong), reputation numbers, topics, frequency cap, quiet hours, and the pause banner if paused.

**Tests:**
- SNS signature check. Each event type is handled.
- A suppressed address is never sent to, even from a journey step that was already queued.
- `List-Unsubscribe-Post` unsubscribes in one POST.
- Frequency cap and quiet hours hold.
- Renders in the 3 widths match snapshot images.
- A complaint storm pauses sending.

Tables: Part 8.

### 6.5 M5. Brand Brain

**Problem:** AI emails and pages are only as good and as true as what they draw on. Brand Brain has no week in the CP schedule yet (Part 9).

**Absorb:**
- The Explorer crawls the customer's site, blog, case studies and docs.
- Upload PDFs and decks.
- Pull Arrowsterr's topic bank and content plan.
- Pull Omniscient Knowledge docs (if connected, with the customer's permission).

**Distill:**
- Haiku 5.5 splits each asset into **atoms**: claim, proof point, stat, quote, case result, FAQ, feature, CTA.
- Each atom keeps its exact source span, which code checks is really in the source.
- Atoms are tagged with topic, persona, stage, industry and product.
- Voyage embeddings go into pgvector (check the model price).
- Near-duplicates (cosine 0.95+) are merged. Stats and dates get an expiry.

**Voice:**
- Haiku drafts a voice guide from the 20 best pages: tone, words to use, words to avoid, and sentence length.
- The marketer edits and approves it. Every write step uses it.

**Verifier:** shared with briefs (`docs/account-intelligence.md` 9.3). A supported claim must quote its atom word for word, or it's removed.

**Knowledge graph (CP 15.5):** the agents' context: the data model map (objects, fields, links, counts), Brand Brain facts with sources, the ICP, the segment and workflow lists, and recent performance. Built nightly, cached, and read through the step cache.

**Screens:**
- **Brand Brain:** sources with status, an atom browser with filters, coverage by persona and stage (where you lack proof), and the voice editor.

**Tests:**
- 20 assets go in, and every atom's span is found in its source.
- Expired stats aren't used by write steps.

Tables: Part 8.

### 6.6 M4. Journeys or Workflows

> **Open question: journeys or workflows.** MP plans **Journeys and Agent Steps**: a journey builder where Agent Decide, Write and Research steps run inside rules the marketer sets. CP plans **Workflows** with AI Decide, Classify and Write steps, CRM, ads, webhook and route steps, account journeys (6.8), and **Plays** (6.12.4) as saved agent tasks. The two share triggers, waits, branches, goals, simulation, versions and review modes, but differ in step lists, names, tables (Part 8) and screens (1.4). Both are kept below.

**Problem:** classic journeys are rigid trees that nobody updates. Agent steps let AI choose and write inside rules the marketer sets.

#### 6.6.1 MP version: journeys and agent steps

**Triggers:**

| Trigger | Example |
|---|---|
| Segment entered or left | "Fit 70+ and visited pricing" |
| Form submitted | Guide download |
| Event | Product signup, invite sent, plan limit hit |
| Score crossed | Intent passed 60 |
| Omniscient change | Opportunity lost, contact became customer |
| Date | Renewal in 60 days, webinar date |
| Manual or API | Add from a list, `POST /api/v1/journeys/:id/enroll` |

**Steps:**

| Step | What it does |
|---|---|
| Send email | A fixed email, or one written by an agent step |
| Wait | A time, until a weekday or hour, or until an event (with a timeout) |
| Branch (rules) | If and else on fields, events, scores or segments |
| **Agent: Decide** | Haiku picks one of the branches the marketer named, with a reason. It can't invent a branch. |
| **Agent: Write** | Writes a one-to-one email for this contact from the Brand Brain, the contact's activity and the journey's goal |
| **Agent: Research** | Pulls account news and a short brief before a write step (Sonnet + web search, only for high-fit accounts) |
| Update | Set a field, lifecycle or subscription |
| Notify | Slack or email to the owner |
| Handoff | Create or update the contact and opportunity in Omniscient (or HubSpot or Salesforce), and pause marketing (M7) |
| Add to segment or journey | Static list or another journey |
| Goal | Exit when reached (for example a meeting booked) |

**Agent: Decide (Haiku 5.5, structured output):**

```json
{ "branch": "one of the named branches", "reason": "<= 200 chars", "evidence": ["event or field ids"] }
```

- Input: the contact's last 30 days of events, scores, fields, the journey goal, and the branch names with the marketer's description of each.
- Decision cache: a hash of the inputs. If the model fails twice, the journey takes the default branch the marketer set.

**Agent: Write (Haiku 5.5 by default, Sonnet 5.5 for contacts with fit 80+ or by choice):**

```json
{ "subject": "<= 70 chars", "preheader": "<= 90 chars", "body_blocks": [ {"type": "text|case_study|button", "...": "..."} ],
  "claims": [ {"text": "", "atom_id": ""} ], "why": "<= 200 chars" }
```

- Input: the voice guide, up to 12 atoms picked by embedding against the contact's interests and stage, the contact's fields and recent activity (summarized), the step's brief from the marketer, and the template.
- Rules in the prompt and enforced in code:
  - Every claim maps to an atom, and the verifier checks it.
  - Never mention tracking ("I saw you visited…" is blocked by a rule check).
  - Never invent personal facts.
  - Keep to the length the marketer set.
- The body is placed into the template, so the footer, unsubscribe and brand stay fixed.

**Review modes, set per journey** (see the open question in 3.1):

| Mode | Behavior |
|---|---|
| Review all | Every agent-written email waits in Approvals |
| Review a sample | 1 in 10 waits. The rest send after the verifier passes. Unlocked after 20 approvals with < 10% heavy edits. |
| Auto | All send after the verifier passes. Unlocked after 100 approvals with < 5% heavy edits. Can be locked off by the workspace owner. |

**Engine:**
- Each enrollment is a row with `current_step`, `state` and `next_run_at`. Running a step is a `journey_step` job.
- A journey's graph is versioned. Running enrollments stay on their version unless the marketer moves them.
- **Re-entry rules:** once, once per N days, or every time.
- **Global guards:** frequency cap, quiet hours, consent check at every send, and exit on unsubscribe, bounce or handoff.
- **Simulation:** "Test with 20 contacts" runs the journey on real contacts without sending. It shows each path, every Decide reason and every written email.

**Screens:**
- **Journeys:** a list with status, enrolled, goal rate and pipeline.
- **Builder:** steps on a vertical canvas (drag to add, click to edit), the trigger at the top, the goal at the bottom, and Simulate and Publish buttons.
- **Journey report:** count per step, branch splits with sample reasons, emails written, and goal rate.
- **Approvals:** the queue with the written email, the atoms it used, the verifier marks, Edit, Approve and Skip, and "Approve all from this step" once trusted.

**Tests:**
- Graph engine on 10,000 simulated enrollments: no stuck enrollments, exits honored, version moves correct.
- Decide never returns a branch that doesn't exist (schema plus code check).
- Write: a fake claim is removed, a tracking mention is blocked, and a missing token blocks the send.
- Consent is withdrawn between Write and Send, so the send is skipped.
- Mode unlocks only after the approval counts.

#### 6.6.2 CP version: workflows

**Triggers:**

| Trigger | Example |
|---|---|
| Segment entered or left | "Fit 70+ and visited pricing" |
| Contact created from a source | "Came from the Zoom webinar" |
| Form submitted | "Demo request form" |
| CRM change | Lead status became "Working", opportunity lost, owner changed |
| Product event | Signup, invite sent, plan limit hit |
| Custom object | A Subscription row changes plan |
| Warehouse row | A row appears in "trials ending in 3 days" |
| Website | Visited a page group, account turned hot (M1), came from an AI answer |
| Email | Clicked, replied, bounced |
| Score | Crossed a band |
| Date | Field date ± N days |
| Manual, API, webhook | Add from a list, `POST /api/v1/workflows/:id/enroll`, a signed webhook |

**Steps:**

| Step | What it does |
|---|---|
| Send email | A saved email, or one from AI Write |
| Wait | A time, until a weekday and hour, or until an event, with a timeout path |
| Branch | If and else, up to 5 paths |
| Split | Random A/B by percent |
| AI Decide | Haiku picks one of the named paths with a reason; it can't invent a path |
| AI Classify | Haiku sets a field from text (a form answer, a reply) into one of fixed values |
| AI Write | One email for this contact from the voice guide, approved facts and recent activity |
| Update field | Set a field, lifecycle, lead status or subscription; pushed to the CRM if mapped |
| CRM action | Create a task, add to a campaign, change owner, create a deal |
| Ads | Add to or remove from an ads audience |
| Slack | Message a channel or the owner with the contact card |
| Webhook | Signed POST; the response can feed a branch |
| Route | Run routing and hand off (6.8) |
| Enroll | Into another workflow or a static segment |
| Goal | Exit when reached |

**Canvas, simulate, versions, review modes:** as in the earlier 14-week plan, and close to the MP version above: vertical canvas with live counts per node, validation before publish, "Test with 20 contacts" with no sends and no CRM writes, versions with running enrollments kept on theirs, and AI Write review modes (Review all, Review a sample after 20 approvals, Auto after 100) with checks on every written email (no tracking mentions, no facts outside the approved list, every token filled, length within limits).

Week-by-week build: weeks 11 to 14 (Part 10). Tables: Part 8.

---

### 6.7 M6. Pages and forms

> **Open question: who serves pages.** MP hosts pages on `go.<customer domain>` through Fly certificates, or `pages.tryclaritia.com/<team>`, from `claritia-web`. CP serves them from `collect` by host, on the customer's domain by CNAME, with HTTPS.

> **Open question: A/B tests on pages now or later.** MP ships A/B tests on pages (below). CP's scope (Part 2) puts A/B tests on landing pages later, and ships A/B on emails only.

#### 6.7.1 Pages

- **Blocks:** hero, logos, proof (atoms), case study, features, video, demo embed, pricing note, pricing table, FAQ, form, meeting booker, CTA, footer. One renderer serves both the editor and the live page.
- **AI build** (Sonnet 5.5): from a goal, a persona and an offer, it builds a page from the Brand Brain and the brand kit ("A page for the Q4 webinar"). Every claim cites an atom (the verifier rule).
- **Personalization:** `claritia.js` swaps marked slots (`data-clr-slot`) for visitors in a segment or account, with an anti-flicker cap of 300 ms. Variants are written once per segment, so there's no model call per view.
- **A/B tests (MP):** split by visitor hash. A winner is called on conversion rate once each side has 100+ views and the gap holds for 7 days.
- **Hosting (MP):** `go.<customer domain>` through Fly certificates (check the price per hostname), or `pages.tryclaritia.com/<team>`. Rendered statically, and refreshed on publish.
- **Hosting (CP):** sections and blocks on the customer's domain by CNAME, served by `collect` with HTTPS (certificates through Fly, check).
- **Publishing:** goes through Approvals until the team trusts it. Funnel QA (M9) runs before every publish, and then every day: the page loads, every link works, the form submits and the test contact appears (existing runner).
- **Reports:** views, submits, conversion rate, pipeline per page and form.

#### 6.7.2 Forms

- **Fields:** standard fields, custom fields from the registry and hidden fields (UTM tags, campaign, page, segment).
- **Progressive profiling:** known contacts aren't asked again. The next unknown field is shown instead.
- **Consent block:** wording by region (opt-in checkbox in `strict` regions, notice elsewhere), recorded in `consents` with the exact wording.
- **Spam:** a honeypot plus Cloudflare Turnstile (free tier, check), a rate limit per network, and disposable email blocking (`docs/identity.md` 5.4).
- **On submit:** contact upsert, consent with exact wording, form event with page, referrer and UTMs, earlier anonymous visits attached (M1, identity evidence at the Asserted level), a journey or workflow trigger, a score update, a thank-you page or redirect, and optional instant booking with the routed rep.
- **Embed:** a script tag on any site (one line), or native on Claritia pages. The HubSpot form adapter stays for teams keeping HubSpot forms.

#### 6.7.3 Booking

- **Owner calendar:** through Omniscient, which already syncs Google Calendar. Claritia asks Omniscient for open slots of the routed owner (needs the Omniscient API in 7.1).
- **Fallback:** a Calendly or HubSpot Meetings link.
- Routing picks the owner at submit (M7), so the visitor books with the right rep at once.

**Tests:**
- A page with an unsourced claim loses the line.
- A form in `strict` regions without the checkbox ticked records no consent and enrolls in no marketing journey.
- Turnstile failure blocks the submission.
- Progressive profiling hides known fields.
- Server and client renders match.
- A booking creates a meeting in a test Omniscient workspace.
- A submit with the network cut mid-request lands once; Funnel QA catches a broken form.

Tables: Part 8.

### 6.8 M7. Scoring, routing and ABM

Account fit, intent, stage, temperature and priority are built with M1 (`src/lib/web/scores.ts`, `worker-intel/jobs/signals.ts`, rules in `docs/account-intelligence.md` Part 8).

> **Open question: how a contact is scored.** MP scores fit, intent, engagement and readiness, with readiness as fit × intent × engagement mapped to Cold, Warm and Ready, and a handoff that creates an Omniscient opportunity with a brief note. CP scores each contact with v0 fixed weights and a v1 model retrained weekly, with bands (Cold < 40, Warm 40–69, Ready 70+) and the top 3 reasons synced to the CRM, and a handoff that writes owner and status and a CRM task. Both are below.

#### 6.8.1 MP version: scores, routing and handoff

**Scores** (rules from `docs/account-intelligence.md` Part 8):

| Score | Level | What feeds it |
|---|---|---|
| Fit | Account | ICP rules, then learned from won deals |
| Intent | Account | Website signals with decay, breadth bonus and per-person cap |
| Engagement | Contact | Email clicks and replies, page reads, forms, events, with decay |
| Readiness | Contact | Fit × intent × engagement, mapped to Cold, Warm, Ready |

**Handoff rule** (editable): readiness is Ready, or a demo request, or a pricing page plus a form within 7 days.

**Routing:** rules in order:
1. Existing owner in Omniscient or CRM.
2. Account owner.
3. Territory (country, region).
4. Segment.
5. Round robin among available reps (skipping reps out of office in Omniscient).

**Handoff action:**
1. Upsert the contact and account in Omniscient (or HubSpot or Salesforce).
2. Create the opportunity in the right pipeline and stage.
3. Attach a brief (Haiku, from the contact's activity, with sources) as an Omniscient note.
4. Slack DM the owner.
5. Pause marketing journeys for that contact.
6. Start an SLA timer.

**SLA and recycle:**
- If the owner doesn't touch the lead in the set time (default 24 business hours), alert their manager.
- If the opportunity closes as lost or the lead is rejected, send the contact back to a nurture journey after 30 days.

**Tests:**
- Fixed fixtures give the expected scores.
- Routing picks the right owner for 20 cases.
- A handoff creates exactly one contact and one opportunity in Omniscient, even if retried.
- An SLA breach fires once.

#### 6.8.2 CP version: contact score, routing and ABM

**Contact score:**
- **Inputs:** fit (account), intent (account), engagement (clicks, replies, page reads, forms, webinars, meetings, product events, 14-day half life), CRM fields, warehouse and custom object fields, title seniority and department (6.2.7).
- **v0:** fixed weights from the ICP rules; the top 3 reasons are the 3 biggest additions.
- **v1:** weekly logistic regression on won vs lost once a workspace has 30+ closed deals; goes live only if its AUC beats the current one on the last 20% of deals.
- **Bands:** Cold < 40, Warm 40–69, Ready 70+, editable. Score, band and reasons sync to the CRM.

**Routing:** rules in order: existing owner, account owner, named account list, territory (country, region, size), segment, round robin weighted by rep capacity (open handoffs this week vs their cap), skipping people out of office. Then the handoff: owner and status in the CRM, a CRM task with the reasons, a Slack DM, nurture paused, SLA timer with one manager alert on breach.

**ABM:**

| Part | Detail |
|---|---|
| Account lists | Static or by rules (fit, intent, stage, industry, named list from the CRM) |
| Buying group | Per account: people by role (decision maker, champion, user, finance) from title department and seniority, with gaps shown ("no finance contact") |
| Account view | One timeline across every contact, visit, email, ad and deal |
| Account journeys | Workflows that run on the account: trigger on account intent, steps per role |
| Account score | Fit and intent (M1) plus engagement summed over the buying group |

#### 6.8.3 Account stage

The stage table from the buyer enablement plan (PP M3), which `docs/account-intelligence.md` 8.3 points to:

| Stage | Rule |
|---|---|
| Unknown | No sessions in 30 days |
| Engaged | Any session in 30 days |
| Researching | Intent 40+ or 2+ people |
| Evaluating | Intent 70+, or a `page_high` from 2+ people, or an asset binge |
| Meeting booked | HubSpot meeting or Calendly event in the future |
| In deal | Open HubSpot deal |

What the code does today (`stageOf` in `src/lib/web/scores.ts`): four of these stages, with rules from the M1 signal set.
- **Engaged:** any positive signal in the last 45 days.
- **Researching:** a research signal in the last 30 days (`page_pricing`, `page_compare`, `page_security`, `page_integrations`, `docs_depth`, `case_study`, `review_site_ref`), or 2+ known people.
- **Evaluating:** a `demo_request` in the last 30 days, or `page_pricing` plus `page_compare` or `page_security` from 2+ people.
- Stages only move forward on their own. They move back after 45 quiet days (to Engaged) or 90 (to Unknown).
- Meeting booked and In deal aren't in the code yet; they need meetings and deals (6.2.10).

Week-by-week build: weeks 16 and 17 (Part 10). Tables: Part 8.

### 6.9 Ads

| Part | Detail |
|---|---|
| Audiences out | A segment or account list syncs to LinkedIn Matched Audiences, Google Customer Match and Meta Custom Audiences, hourly. Hashed emails only; contacts with "No basis" in strict regions are left out (lawyer check). |
| Lead forms in | LinkedIn, Meta and Google lead forms (6.2.4) |
| Conversions out | Offline conversions (MQL, SQL, won) to LinkedIn, Google and Meta, so their bidding learns from pipeline |
| Spend in | Daily spend per campaign from each ad account, for attribution |

Week 18 (Part 10).

### 6.10 M8. Attribution and reports

> **Open question: which attribution models.** MP offers first touch, last touch, linear, U-shaped (40/20/40) and W-shaped (30/30/30 with 10 in the middle). CP offers first touch, last touch, linear, time decay, W-shaped, and custom weights per touch type. Buyer Analytics (6.3) also has U-shaped.

**Touches:** one table across the suite:

| Source | Touch |
|---|---|
| Arrowsterr | AI answer referral (chatgpt.com, perplexity.ai, gemini, claude.ai, copilot), organic search landing, tracked prompt or topic match |
| Claritia | Session source, email click, page view, form, journey step, webinar |
| Omniscient or the CRM | Meeting, rep email, sales touches, opportunity created, stage change, won or lost |
| Ads | Google Ads, LinkedIn Ads and Meta clicks and costs through their APIs (6.9) |

**Models (MP):** first touch, last touch, linear, U-shaped (40/20/40), and W-shaped (30/30/30 with 10 in the middle), on opportunities created and won revenue from Omniscient (or the CRM).

**Models (CP):** first touch, last touch, linear, time decay, W-shaped, and custom weights per touch type, at Mosaic's level.

**Reports:**

| Report | Answers |
|---|---|
| Pipeline by source | Which channels made pipeline and revenue, including "AI answers" as a channel (with Arrowsterr). Pipeline and closed-won by channel, campaign, asset, page and workflow; cost per opportunity with ad spend. |
| Journey performance | Enrolled, goal rate, pipeline and revenue per journey and per step |
| Email | Delivered, clicks, replies, unsubscribes, complaints. Opens marked unreliable. |
| Pages and forms | Views, conversion, A/B results, pipeline |
| Content (atoms) | Which atoms appear in emails and pages before meetings and wins |
| Accounts | Hot accounts, movement by stage, time to handoff |
| Funnel | Visitor to lead to Ready to opportunity to won, with conversion and time per step |

**Weekly AI summary:** Opus 5.5 through the Batch API, every Monday. "What worked and what didn't", where every claim cites a report number (n ≥ 20 rule from `docs/account-intelligence.md` M7).

**Tests:**
- Attribution fixtures give exact cents per model; totals equal deal amounts for each model.
- Report numbers match hand counts on fixture data.
- Dashboards load in under 300 ms at Beta size.

Week 18 (Part 10). Tables: Part 8.

### 6.11 M9. Funnel QA

Built on the existing runner, Explorer, healing, tunnel and alerts. Funnel QA has no week in the CP schedule yet (Part 9); the CP plan uses its checks in weeks 15 and 20.

| Check | When | How |
|---|---|---|
| Page check | Before publish, then hourly | Loads at 3 widths. Broken links, missing images and console errors. Screenshot diff vs last good. |
| Form end to end | Before publish, then every 6 hours | Fills the form with a test contact (`qa+<id>@<workspace test domain>`), confirms the contact appears in Claritia, the journey trigger fires, and the Omniscient or CRM record exists. Then cleans up. |
| Booking | Daily | Opens the booker and checks slots load |
| Email render | Before every broadcast and journey email | Renders the HTML in Chromium at 3 widths. Every link resolves (200 or 3xx to 200), the unsubscribe link works, and no tokens are left unfilled. |
| Site key pages | Hourly | Customer-chosen pages: up, fast, and showing the expected text |
| Script health | Every 15 minutes | Events still arriving from each site |

- Failures alert in Slack and block a publish or send when they're pre-launch checks.
- Uses the existing heal flow when a page changes on purpose (approve the new screenshot as "good").

**Tests:**
- A broken form (one that never reaches the CRM) is caught.
- A dead link in an email blocks the send.
- A changed page needs approval.

### 6.12 M10. Agents

**Problem:** the data says what to do next, but nobody has time to read it.

> **Open question: how many tool calls an agent run gets.** MP caps a Marketing Agent run at 6 tool calls. CP caps an agent run at 8 tool calls, 60 s per run and 30 runs per workspace per day at Beta. The MCP tool lists also differ (6.12.1 and 6.12.5).

#### 6.12.1 MP version: Marketing Agent

**Weekly plan:**
- Sonnet 5.5 with read-only tools (reports, segments, journeys, Brand Brain coverage, Arrowsterr topics and gaps, Omniscient pipeline).
- It proposes 3 to 5 plays. Example: "Healthcare accounts read the compliance page 3× more but have no journey. Proposed: a segment, a 3-step journey and a page."
- Each play comes with a draft built in the product (segment, journey, page) in draft state, ready to review.

**Ask:** a chat box on every screen ("Why did signups drop last week?", "Which journey makes the most pipeline?"). It answers with links to the records and report numbers.

**MCP:** new tools on `/api/mcp`:
- `list_segments`, `create_segment_draft`
- `list_journeys`, `journey_report`, `create_journey_draft`
- `get_report`, `ask`

**Limits:**
- The agent can only make drafts. Publishing and sending always go through the normal Approvals.
- 6 tool calls per run.
- Prompt caching on the workspace context.

**Tests:**
- A replay of fixed data gives the same plays.
- The agent can't publish (tool not present).
- Each play cites report numbers.

#### 6.12.2 Where agents start (CP)

| Start | How |
|---|---|
| App | A panel on every screen |
| Slack | Mention `@Claritia` or DM; answers in the thread, approvals as buttons |
| Linear | Assign a ticket to Claritia; drafts linked on the ticket |
| Schedule | A saved prompt on a cron |
| Webhook | A signed POST with a prompt and data |
| Claude | Through the MCP server (6.12.5) |

#### 6.12.3 Tools and their settings (CP)

Same rule as Conversion: each tool is Automatic, Requires approval or Disabled, per agent.

| Tool | Default |
|---|---|
| Search and read (contacts, accounts, segments, reports, workflows, sources) | Automatic |
| `create_segment`, `draft_email`, `draft_workflow`, `draft_page`, `draft_form` | Automatic (drafts only) |
| `import_contacts`, `connect_source_link`, `update_contact_fields`, `add_to_campaign` | Requires approval |
| `publish_*`, `send_broadcast`, `sync_audience` | Requires approval |
| Edits to existing assets | Requires approval, shown as a before-and-after diff |
| `delete_*` | Disabled, and can't be turned on |

Every run is logged with its tool calls, tokens and cost. Model: Sonnet 5.5 with prompt caching on the workspace context; Haiku 5.5 for short reads. 8 tool calls per run, 60 s per run, 30 runs per workspace per day at Beta.

#### 6.12.4 Plays (CP)

- A play is a saved agent task that runs per account or per contact when a trigger fires: "When a target account turns hot, find the buying group gaps, draft a 3-email sequence for the champion and a LinkedIn note for the rep."
- Output lands in Approvals or the rep's Slack.
- Haiku by default, Sonnet for accounts with fit 80+, capped per workspace per day.

#### 6.12.5 MCP server and Skills pack (CP)

- **MCP server:** read tools for contacts, accounts, segments, visitors, signals, reports and sources, and the draft tools above, with the same settings. Teams use Claritia from Claude, Claude Code or any MCP client. Read-only version first (left from week 3, Part 10), drafts later. Today `/api/mcp` serves only the testing product's tools (`src/lib/mcpTools.ts`).
- **Skills pack:** Brand voice, ICP and scoring rules, Campaign brief, Launch checklist, Event follow-up and Import cleanup, each reading and writing through the MCP server. Installed once for the team.
- **Campaigns as code:** segments, emails and workflows export to and import from YAML, so Claude Code can edit them in a repo and a pull request review is the approval.

Week 19 (Part 10). Tables: Part 8.

### 6.13 Migration agent

The answer to Conversion's migration playbooks: an agent that reads the old tool, rebuilds it in Claritia, and proves each part matches before anything switches.

| Step | What happens | Proof |
|---|---|---|
| 1. Connect | The old tool connects as a source (6.2) and keeps running | None |
| 2. Inventory | The agent lists every list, program, workflow, email, form, field and scoring rule, with use in the last 90 days | An inventory page; unused parts default to "Leave behind" |
| 3. Contacts | Full import with suppressions first, then scheduled pulls until cutover | Count match per list, suppression count match |
| 4. Lists | Smart lists become dynamic segments: the agent translates each rule into our rule tree | Member count within 1%, with the differing contacts shown |
| 5. Emails and templates | HTML imported into the block editor; tokens mapped (Marketo `{{lead.First Name}}`, HubSpot `{{contact.firstname}}`) | Render check at 3 widths, every token resolves |
| 6. Forms | Rebuilt as Claritia forms with the same fields and hidden fields | Funnel QA submits each form and finds the contact |
| 7. Workflows | Programs, smart campaigns, Engagement Studio and HubSpot workflows rebuilt as workflows | Simulate on 50 contacts: the same path as the old tool's history for each |
| 8. Scoring | Old score rules rebuilt as v0 weights | Score match within 5 points on 100 contacts |
| 9. Cutover | Per part, the marketer flips it live and pauses the old one | A cutover checklist; the old tool stays connected for 30 days |

- Every rebuilt part is a draft. Nothing goes live without a person.
- Parts the agent can't translate are listed with the reason, for a person to rebuild.
- Model: Sonnet 5.5 with caching, through the step cache. About $20 to $40 per migration (15.3).

Week 20 (Part 10).

---

## 7. Suite integrations

### 7.1 Omniscient

**Built:** Omniscient connects as a two-way source in one click from its approve page (its migration 032), through `src/lib/sources/omniscient.ts`. Claritia calls `GET /api/v1/me`, `GET /api/v1/accounts`, `GET` and `POST /api/v1/contacts`, and `POST /api/v1/webhooks` for `contact.created` and `contact.updated`, with signed webhooks back. Contacts go out by email, so a lead handed off here lands on the same Omniscient contact.

Still needed from the Omniscient side for handoff, activities and booking (the plan had this in weeks 5 and 6):

| Omniscient side | Detail |
|---|---|
| API keys | `omn_` keys stored as SHA-256 (same pattern as Claritia's `clr_` keys), with scopes |
| `GET/POST /api/v1/contacts`, `/accounts` | Upsert by email or domain, with `source` |
| `GET/POST /api/v1/opportunities` | Create in a pipeline and stage, read the stage |
| `POST /api/v1/activities` | Log marketing activity on a contact's timeline (email sent, page read, form) |
| `POST /api/v1/notes` | Attach the handoff brief |
| `GET /api/v1/owners`, `/owners/:id/availability` | Owners, and calendar slots for booking |
| Webhooks | `contact.created`, `contact.updated`, `opportunity.stage_changed`, `opportunity.closed`, `meeting.booked`. Signed with HMAC per endpoint, retried over 24 hours. |
| Privacy | Respect the privacy rules that follow the source in Omniscient: Claritia only receives records shared to the workspace |

Cost on the Omniscient side: $0 added (API traffic on existing servers).

### 7.2 Arrowsterr

| Need | How |
|---|---|
| AI referral and organic landing data | Claritia tags sessions from AI assistants and search itself (M1). Arrowsterr adds the matching prompt and topic. |
| Topics, prompts, content plan | Arrowsterr API (the same data its MCP server exposes: prompts, topic bank, content plan, visibility) |
| Back to Arrowsterr | Conversion and pipeline per landing page and topic, so Arrowsterr can show "this topic made $X" |

Work on the Arrowsterr side: an API key and 3 endpoints if they don't exist yet (check). Not built on the Claritia side (5.1).

### 7.3 Outside tools

| Tool | When (MP) | Now | Cost |
|---|---|---|---|
| HubSpot | Week 9 (for teams not on Omniscient) | Two-way, built (5.5) | Free with the customer's plan |
| Salesforce | Week 27+ | Two-way, built (5.5) | Free with the customer's plan |
| Segment, PostHog | Week 9 | Not built | Free (customer's data) |
| Stripe | Week 9 | In, built (5.5) | Free |
| Slack | Week 6 (existing alerts app) | Account alerts built (M1) | Free |
| Calendly, HubSpot Meetings | Week 22 (booking fallback) | Calendly comes in as a webhook source (5.5); booking not built | Free with the customer's plan |
| Google Ads, LinkedIn Ads | Later (ad spend in attribution) | Not built (6.9) | Free APIs (check access rules) |

---

## 8. Database and jobs

Every table has RLS, leak tests in `tests/db/leaks.sql`, and functions that check membership.

### 8.1 Built migrations (020 to 039)

| Migration | What it holds |
|---|---|
| `020_foundation.sql` | `jobs` and its functions, `minute_tick`, `audit_log`, `privacy_requests`, `suite_connections`, `workspaces.features` |
| `021_web.sql` to `032_visitor_path.sql` | M1: sites, devices, sessions, events, rollups (`site_daily`, `account_daily`), identity evidence, people and identifiers, identity undo and privacy, accounts, signals and scores, screens, account alerts, identity settings, the person page, the marketing default, visitor paths (`docs/m1-website-intelligence.md` Part 4) |
| `033_contacts.sql` | `companies`, `contacts`, `fields`, `field_writes`, `topics`, `consents`, `subscriptions`, `segments`, `segment_members`, `contact_events`, `imports`, `saved_views` |
| `034_records.sql` | `source_kinds`, `field_order`, `field_settings`, `object_layouts`, `objects`, `records`, `record_links`, `field_history`, `suppressions` |
| `035_imports.sql` | `imports` gains `kind`, `source_id`, `size`, `sheet`, `progress`, `rows_done`, `errors_path`, `undo_until` and more; the private `imports` bucket |
| `036_sources.sql` | `sources`, `source_secrets`, `source_links`, `source_runs`, `sync_log`, `mappings`, `hook_events` |
| `037_segments.sql` | The rule tree compiler, live count, sample and refresh for `segments` |
| `038_warehouses.sql` | `source_event_keys`, and warehouse rows as contacts, companies, activity or records |
| `039_source_hook_secret.sql` | `source_hook_secret_save`, for a signing secret a tool hands back after setup (Omniscient) |

The CP plan named these `034_imports.sql`, `035_sources.sql` and `036_objects.sql`. Records took `034`, so imports became `035` and sources `036`; custom objects landed in `034_records.sql`, segments in `037` and warehouses in `038`. Tables the CP plan listed for those migrations that the build left out or renamed:
- `import_files` and `import_rows` (staging): replaced by one import run (5.4).
- `hooks`: became `hook_events` (staged deliveries), with each source's webhook token sealed on the source.
- `campaigns`, `campaign_members`, `deals`, `deal_contacts`, `account_events`, `warehouse_queries`: not built. Warehouse queries are saved on their source. The others have no migration number yet; they land with the first week that needs them.

### 8.2 Planned migrations (040 onward)

CP's later migrations, renumbered to follow `039`:

| Migration | Week | Tables |
|---|---|---|
| `040_email.sql` | 9 | `sending_domains`, `templates`, `emails`, `email_messages`, `send_limits`, `brand_kits`, `email_stats` |
| `041_workflows.sql` | 11 | `workflows`, `workflow_nodes`, `workflow_edges`, `enrollments`, `node_runs`; `approvals` gains kinds |
| `042_pages.sql` | 15 | `forms`, `form_fields`, `submissions`, `pages`, `page_versions`, `page_domains` |
| `043_scoring.sql` | 16 | `score_models`, `routing_rules`, `rep_capacity`, `handoffs`, `sla_timers` |
| `044_abm.sql` | 17 | `account_lists`, `account_list_members`, `buying_roles` |
| `045_ads.sql` | 18 | `ad_accounts`, `audiences`, `audience_members`, `ad_spend`, `conversions_out` |
| `046_attribution.sql` | 18 | `touches`, `attribution_models`, `attributed` |
| `047_agents.sql` | 19 | `agent_tools`, `agent_runs`, `agent_steps`, `agent_schedules`, `plays`, `play_runs` |
| `048_migrations.sql` | 20 | `migrations`, `migration_items` (with the proof for each) |
| `049_api.sql` | 21 | `api_idempotency` |

Brand Brain (8.3) and Buyer Analytics (6.3) have no number. The MP plan numbered its module migrations `023` to `027`; those numbers are taken.

### 8.3 Module tables (MP version)

M3 Email (MP `024_email.sql`). `suppressions` already exists (`034_records.sql`):

```
sending_domains (id, workspace_id, domain, dkim_status, spf_status, dmarc_status, tracking_cname, verified_at)
templates       (id, workspace_id, name, blocks jsonb, mjml text, version int)
emails          (id, workspace_id, name, kind text, -- journey, broadcast, one_to_one
                 subject, preheader, template_id, from_name, from_email, topic_id, status)
email_messages  (id, workspace_id, email_id, contact_id, journey_step_id, ses_message_id, subject_final,
                 body_hash, sent_at, delivered_at, bounced text, complained_at, first_click_at, replied_at)
suppressions    (workspace_id, email_hash, reason, source, at)
send_limits     (workspace_id, per_second, per_day, paused bool, paused_reason)
```

M5 Brand Brain (MP `025_brain.sql`): `brain_sources`, `atoms (id, workspace_id, kind, text, source_id, span, tags jsonb, embedding vector(1024), expires_at)`, `voice (workspace_id, guide jsonb, approved_by, approved_at)`.

M4 Journeys (MP `026_journeys.sql`; compare `041_workflows.sql` above, open question in 6.6):

```
journeys      (id, workspace_id, name, trigger jsonb, goal jsonb, reentry jsonb, mode text, status, version int)
journey_steps (id, journey_id, version, kind, config jsonb, next jsonb)
enrollments   (id, workspace_id, journey_id, version, contact_id, state, current_step, next_run_at,
               entered_at, exited_at, exit_reason)
step_runs     (id, enrollment_id, step_id, started_at, finished_at, outcome jsonb, ai_call_id)
approvals     (id, workspace_id, kind, ref_id, payload jsonb, status, decided_by, decided_at, edit_ratio numeric)
```

M6 Pages (MP `027_pages.sql`; compare `042_pages.sql` above): `pages`, `page_versions`, `page_variants`, `page_views`, `forms`, `form_fields`, `form_submissions`, `domains`, `bookings`.

M7 (MP): `scores`, `routing_rules`, `handoffs (id, contact_id, owner_id, target, target_ids jsonb, at, touched_at, outcome)`.

### 8.4 Jobs

Built on `claritia-intel` (`worker-intel/index.ts`): `stitch`, `device_reset`, `stitch_evidence`, `rebuild`, `privacy`, `identity_changed`, `ip_lookup`, `enrich_company`, `score_account`, `account_alert` (M1), and `import_file`, `import_undo`, `source_pull`, `crm_push`, `source_hook`, `segment_refresh` (M2).

Planned (CP):

| Kind | Trigger | Retry |
|---|---|---|
| `import_file` (built) | File uploaded | 5, resumes at the last page |
| `source_pull` (built) | Schedule, webhook, or first connect | 5, backoff, resumes at the cursor |
| `import_apply` | Staged page ready | 5. Not built: the import run applies each page inside `import_file`. |
| `import_undo` (built) | Undo pressed | 3 |
| `crm_push` (built) | Local change with a mapped field | 5, backoff |
| `warehouse_poll` | Its schedule | 3. Not built: warehouses run through `source_pull`. |
| `segment_refresh` (built, hourly) | Contact change, hourly full | 3 |
| `workflow_step` | `next_run_at` | 5 |
| `ai_map`, `ai_title`, `ai_decide`, `ai_classify`, `ai_write` | As needed | 2, then a safe default |
| `send`, `ses_event` | Broadcast, workflow, SNS | 5 |
| `page_publish`, `funnel_check` | Publish, daily | 3 |
| `score_contact`, `score_train` | Event (debounced 60 s), weekly | 3, 2 |
| `route`, `sla_check` | Ready, timer | 5 |
| `audience_sync`, `conversions_out`, `ad_spend` | Hourly, daily | 5 |
| `attribution` | Nightly | 3 |
| `play_run`, `agent_run` | Trigger, app, Slack, Linear, schedule, webhook | 1 |
| `migrate` | Migration step | 2 |
| `domain_check` | Every 10 min until verified, then daily | None |

The MP plan names some of the same work differently: `journey_step`, `agent_decide`, `agent_write`, `score`, `handoff` and `qa_run` (4.2).

---

## 9. Schedule

> **Open question: launch dates and design partners.** The two plans set different weeks and counts. The CP order (9.1) is the one the code follows: imports and CRM sync first, then email and workflows, then pages, scoring, ads, attribution and agents. The MP timeline (9.2) runs 30 weeks with a public Beta at week 19. Rollout gates for both are in Part 13.

Brand Brain (MP weeks 13 and 14) and Funnel QA (MP week 26) have no week in the CP schedule yet. Buyer Analytics (6.3) has none either.

### 9.1 CP order (21 weeks)

| Week | Build | Done when | Status |
|---|---|---|---|
| 1 | Contacts, CSV import, filter bar | Met | Built (5.3) |
| 2 | `035_imports.sql`, big files through storage, Excel, Google Sheets, paste, vCard, preview, error file, Undo, suppressions, field order, cleaning (phone, names, titles) | A 2,000,000-row file imports with killed workers; Undo works after an overlapping import | Built, with leftovers (5.4) |
| 3 | `036_sources.sql`, connector framework, HubSpot two-way, Sync log, Settings › Sources, read-only MCP server | A HubSpot test account syncs both ways with 0 doubles after the 1,000-change test | Built except the MCP tools (5.5, Part 10) |
| 4 | Salesforce two-way (CDC, polling, Composite, lead convert, campaigns), Omniscient one-click | A Salesforce Developer org passes the same test | Polling, Composite and Omniscient built; the rest in Part 10 |
| 5 | Email tool imports: Mailchimp, ActiveCampaign, Klaviyo, Brevo, Kit, Constant Contact, MailerLite, SendGrid, Loops, Campaign Monitor (contacts, lists, suppressions, consent, 13 months of history) | Each passes its recorded test and consent map | 6 of 10 built, without history (Part 10) |
| 6 | Marketo, Pardot, Eloqua, HubSpot Marketing, Customer.io, Iterable, Braze, Intercom; other CRMs (Pipedrive, Zoho, Dynamics, Attio, Close, Copper, Freshsales, monday, Affinity); Airtable, Notion | Each passes its recorded test | Intercom, Pipedrive, Attio, Close built (Part 10) |
| 7 | Live sources: forms, scheduling, events (Zoom, Cvent, Luma, Eventbrite, Goldcast, Livestorm, ON24), ad lead forms, Zapier, Make, n8n, `POST /api/v1/contacts/import` | A Typeform fill and a Zoom registration reach a contact in under 10 s | Typeform, Tally, Webflow, Calendly, Cal.com and any JSON built (Part 10) |
| 8 | Custom objects (`034_records.sql`), `037_segments.sql`, `038_warehouses.sql`, 7 warehouses, Segment, RudderStack, PostHog, Mixpanel, Amplitude, Stripe, Shopify, billing and support tools, data vendors, Outreach, Salesloft; segments with live count | 30 rule types pass; a warehouse row becomes an event on schedule | Segments and warehouses built (5.6) |
| 9 | `040_email.sql`, domains, SES, send guard, SNS, suppression at send | A test domain verifies and an email sends with one-click unsubscribe | Started and reverted |
| 10 | Block editor, brand kit, tokens, preview, test send, broadcasts, A/B, reports, campaign link | A broadcast to 500 contacts sends and clicks show in the CRM campaign | |
| 11 | `041_workflows.sql`, engine, waits, branches, splits, exits, re-entry | 10,000-enrollment test passes | |
| 12 | Canvas, side panel, validation, versions, live counts | A 12-node workflow is built and published | |
| 13 | All steps and triggers | Each has a passing test | |
| 14 | AI Decide, Classify and Write, review modes, Approvals, Simulate | Simulate on 20 contacts shows every path and email with no sends | |
| 15 | `042_pages.sql`, forms, landing pages on custom domains, AI page build, Funnel QA | A page with a form publishes and Funnel QA passes | |
| 16 | `043_scoring.sql`, score v0 and v1, reasons, CRM score sync, routing with capacity, SLA | A Ready lead reaches the right rep in Slack within 2 minutes p95 | |
| 17 | `044_abm.sql`, account lists, buying groups, account journeys, account score | A target account list runs an account journey | |
| 18 | `045_ads.sql`, `046_attribution.sql`, audiences, conversions out, spend, attribution models, weekly summary | An audience syncs to LinkedIn; a won deal shows credited touches | |
| 19 | `047_agents.sql`, agents in app, Slack, Linear, schedules, webhooks; plays; MCP draft tools; Skills pack; knowledge graph | "Build a nurture for webinar signups" makes drafts; a play runs on a hot account | |
| 20 | `048_migrations.sql`, migration agent for 8 platforms | A recorded Marketo instance migrates with every proof passing | |
| 21 | `049_api.sql`, REST API, customer setup docs, quality page, 2 design partners live | Partners import from their old tools and run a live workflow. All 11.2 tests green. | |

### 9.2 MP timeline (30 weeks)

| Phase | Weeks | Modules | Release |
|---|---|---|---|
| **A. See** | 1–6 | M0, M1, M7 basic handoff, Omniscient API, Funnel QA script health | Design partners see hot accounts in Omniscient |
| **B. Reach** | 7–12 | M2 contacts and segments, M3 email engine, Funnel QA email render | Broadcasts and newsletters with consent and deliverability |
| **C. Nurture** | 13–19 | M5 Brand Brain, M4 Journeys and agent steps | **Public Beta (Starter plan)** |
| **D. Convert** | 20–22 | M6 pages, forms, booking, personalization, Funnel QA page and form checks | Growth plan on sale |
| **E. Prove** | 23–26 | M7 full scoring and routing, M8 attribution and reports, M9 full | Suite bundle launch with Arrowsterr and Omniscient |
| **F. Run itself** | 27–30 | M10 Marketing Agent, Salesforce sync | Scale plan |

**Weekly detail:**

| Week | Work |
|---|---|
| 1 | Jobs queue, migrations, nav, audit and privacy tables |
| 2 | `claritia.js` (events, consent, GPC, scrubbing, forms, identify), suite connection screens |
| 3 | Collect (policy, bots, sessions, cookies, proxy path), IPinfo |
| 4 | Identity stitching, internal traffic, erasure |
| 5 | Accounts, learned networks, Coresignal, signals, intent and fit. Omniscient API (part 1). |
| 6 | Visitors and Accounts screens, basic handoff to Omniscient, Slack alerts. Omniscient API (part 2, webhooks). |
| 7 | Contacts, companies, consents, fields, import |
| 8 | Segment builder and engine |
| 9 | Syncs: Omniscient both ways, HubSpot, Segment, PostHog, Stripe |
| 10 | SES setup, domains wizard, DNS checks, SNS events, suppression |
| 11 | Templates, brand kit, MJML, tracking links, unsubscribe, footer rules |
| 12 | Broadcasts, send pipeline, caps and quiet hours, email render QA |
| 13 | Brand Brain: absorb and distill |
| 14 | Brand Brain: embeddings, voice guide, verifier |
| 15 | Journey engine: enrollments, steps, waits, branches, versions |
| 16 | Builder UI |
| 17 | Agent Decide and Write, Approvals modes |
| 18 | Research step, simulation, journey report |
| 19 | Hardening, load test, Beta launch |
| 20 | Page blocks, editor, renderer, hosting, domains |
| 21 | Forms, consent block, Turnstile, progressive profiling |
| 22 | AI page build, personalization slots, A/B, booking through Omniscient |
| 23 | Scores (engagement, readiness), routing rules, SLA, recycle |
| 24 | Touches across the suite, attribution models |
| 25 | Reports, weekly AI summary |
| 26 | Funnel QA: form end to end, booking, page diffs, site pages |
| 27 | Marketing Agent: tools, weekly plays |
| 28 | Ask everywhere, MCP tools |
| 29 | Salesforce sync |
| 30 | Hardening, SOC 2 tool setup, Scale plan |

MP weeks 1 to 6 (M0 and M1) are built. MP weeks 7 to 9 match CP weeks 1 to 8, which are mostly built.

---

## 10. Build by week

Each week lists its tables, code, jobs, screens, tests, what the founder needs to have ready, when it's done, and what it adds to the monthly bill at Beta (50 teams) and Growth (500 teams). Source specs are in `docs/contact-sources.md`. Rules for every week are in 3.2. Weeks 1, 2 and 8 are in Part 5. Paths under `src/lib/` that don't exist yet are the plan's names.

### Weeks 3 to 7: what's left

**Week 3. Sources framework, HubSpot two-way, read-only MCP**
- **Database:** `campaigns`, `campaign_members`, `deals`, `deal_contacts` (8.1).
- **Code:** `src/app/api/mcp` gains read tools: `search_contacts`, `get_contact`, `list_segments`, `get_account`, `list_visitors`, `list_sources`. A nightly count check in `worker-intel/jobs/sources.ts`.
- **Tests:** MCP read tools return only the caller's workspace.
- **Founder:** HubSpot public app (client id, secret, redirect URL), a test account.
- **Cost:** $0. HubSpot's API is free on the customer's plan.

**Week 4. Salesforce and Omniscient**
- **Code:** in `src/lib/sources/salesforce.ts`: Bulk API 2.0 backfill, CDC through the Pub/Sub API (gRPC client `@grpc/grpc-js`, Avro decode `avsc`) with polling as the fallback, lead convert, campaigns and members both ways, `/limits` guard. In `omniscient.ts`: activity write-back. A setup page for Salesforce custom fields (score, band, reasons) with a downloadable package or step list.
- **Screens:** Salesforce mapping includes the lead vs contact rule (Select: "Create leads", "Create contacts", "Match only").
- **Tests:** the 1,000-change test against a Salesforce fake; lead convert gives one contact with both links kept; CDC gap (the stream drops for 10 minutes and the poll fills the gap with no doubles); API budget (pulls pause at 80% of the org total).
- **Founder:** Salesforce connected app, a Developer Edition org. Omniscient migration 032 live.
- **Done when:** a Salesforce Developer org passes the same test.
- **Cost:** $0.

**Week 5. Email tool imports**
- **Code:** Constant Contact, SendGrid, Loops and Campaign Monitor connectors in `src/lib/sources/`. For every email tool, 13 months of activity to `contact_events`. Each: suppressions pulled first, then contacts, lists to static segments.
- **Screens:** the wizard's source path: pick the tool, connect, pick lists, then the same mapping, consent, preview and run. Per-list basis question for tools that store none.
- **Tests:** for each tool, the recorded test (2 pages, a 429, a refresh, a deleted member) and its consent map fixture; a suppression in the source blocks a send at once.
- **Founder:** OAuth apps for Mailchimp, Klaviyo, Constant Contact, Kit.
- **Done when:** each passes its recorded test and consent map.
- **Cost:** $0 (customers' own plans). Disk for 13 months of history: about 1 KB per event; with 50,000 events per team, $0 Beta and about $3 Growth (check).

**Week 6. Marketing automation tools, other CRMs, Airtable, Notion**
- **Code:** `marketo.ts` (bulk extract leads and activities in 31-day windows, assets for the agent), `pardot.ts`, `eloqua.ts`, HubSpot marketing assets (lists, workflows, emails, forms) in `hubspot.ts`, `customerio.ts`, `iterable.ts`, `braze.ts`; `zoho.ts`, `dynamics.ts`, `copper.ts`, `freshsales.ts`, `monday.ts`, `affinity.ts`, `airtable.ts`, `notion.ts`. Assets from automation tools stored raw in `migration_items` (created now, filled by the agent in week 20).
- **Tests:** recorded tests for each; Marketo's daily quota hit mid-run pauses and resumes next day with no gap.
- **Founder:** OAuth apps for Pipedrive, Zoho, Dynamics (Entra), Attio, monday, Airtable, Notion, Intercom; Marketo, Pardot and Eloqua sandboxes if possible (or a design partner's read-only access).
- **Done when:** each passes its recorded test.
- **Cost:** $0.

**Week 7. Live sources: forms, scheduling, events, ad lead forms, API**
- **Goal:** new leads from anywhere land on a contact in under 10 seconds.
- **Code:**
  - Webhook connectors in `src/lib/sources/`: Jotform, Fillout, Formstack, Framer, Wix, Chili Piper, SavvyCal, Zoom, Luma, Eventbrite, Goldcast, Livestorm, ON24, Cvent (hourly), LinkedIn Lead Gen, Meta Lead Ads, Google Ads lead forms.
  - `wordpress/claritia-wp/`: the plugin (PHP) for Gravity Forms, Contact Form 7, WPForms.
  - `src/app/api/v1/contacts/import/route.ts`, `imports/[id]/route.ts`, `imports/[id]/undo/route.ts`, `contacts/route.ts`; `api_idempotency` handling (table lands in week 21's migration; until then, the `jobs` key holds the idempotency key).
  - Zapier, Make and n8n app definitions in `integrations/`.
  - Anonymous visit attach for webhook forms: a form contact with an email links the device's earlier visits through identity (existing stitch with evidence source `form`).
- **Tests:** a hook delivered twice makes one event; a hook with a bad signature is refused; a Typeform fill reaches a contact in under 10 s in the e2e check; the import API with the same idempotency key twice runs once.
- **Founder:** Zoom Marketplace app, LinkedIn Marketing API access request (lead sync), Meta app with `leads_retrieval` (app review), Cvent partner access, Zapier and Make developer accounts.
- **Done when:** a Typeform fill and a Zoom registration reach a contact in under 10 s.
- **Cost:** $0 for the APIs (check Cvent partner terms). Web app load from hooks: within the current `claritia-web` machine (check).

### Week 9. Sending

**Goal:** a verified domain sends with every guard on. Started once and reverted (5.7).

**Database: `040_email.sql`** with `sending_domains`, `templates`, `emails`, `email_messages`, `send_limits`, `brand_kits`, `email_stats` (from M3, 6.4). `suppressions` exists.

**Code:** `src/lib/email/ses.ts`, `domains.ts` (DNS records and checks), `guard.ts` (consent, suppression, frequency cap, quiet hours by time zone), `track.ts` (link rewrite, click tokens, scanner filter), SNS route `src/app/api/ses/route.ts` with signature check; jobs `send`, `ses_event`, `domain_check`.

**Screens:** Settings › Sending: domain wizard with record tags (Verified, Waiting, Wrong), topics, frequency cap, quiet hours.

**Tests:** SNS signature; suppressed address never sent even from a queued step; one-click unsubscribe (RFC 8058 headers); complaint storm pauses the workspace; cap and quiet hours.

**Founder:** SES production access in ap-northeast-1, sending rate raised.

**Done when:** a test domain verifies and an email sends with one-click unsubscribe.

**Cost:** SES $5 per team per month at 50,000 emails: $250 Beta, $2,500 Growth (check). Dedicated IPs $50 Beta, $250 Growth (check).

### Week 10. Email Studio

**Goal:** build, test and send a broadcast with reports.

**Code:** `src/lib/email/blocks.ts` (block schema, MJML render, plain text), `tokens.ts` (fields, custom objects, fallbacks), brand kit reader (logo, colors, fonts from the site), A/B split and winner job; `src/components/app/views/EmailEditor.tsx`, `EmailsView.tsx`.

**Screens:** Emails list; editor with blocks, token picker, personal block rules, preview at 3 widths in light and dark, test send with a chosen contact; report per email.

**Tests:** render snapshots at 3 widths; every token resolves or uses its fallback; broadcast to 500 contacts sends once each with a killed worker mid-send.

**Done when:** a broadcast to 500 contacts sends and clicks show in the CRM campaign.

**Cost:** $0 beyond week 9.

### Week 11. Workflow engine

**Goal:** an engine that never loses or doubles an enrollment.

**Database: `041_workflows.sql`** with `workflows`, `workflow_nodes`, `workflow_edges`, `enrollments` (unique open enrollment per contact and workflow), `node_runs`; `approvals` gains kinds.

**Code:** `src/lib/workflows/graph.ts` (schema, validation, versions), `engine.ts` (enroll, step, wait, branch, split, exit, re-entry), `steps/` one file per step; job `workflow_step`.

**Tests:** 10,000 enrollments with killed workers and retried jobs: none stuck or doubled; exits honored; version moves right.

**Done when:** the 10,000-enrollment test passes.

**Cost:** $0.

### Week 12. Canvas

**Code:** `WorkflowsView.tsx`, `WorkflowCanvas.tsx` (vertical layout, "+" on edges, side panel per node), validation messages, live counts per node, version history.

**Tests:** canvas round-trip (build, save, load) keeps the graph; validation blocks a path with no end and a wait with no timeout.

**Done when:** a 12-node workflow is built and published in the app.

**Cost:** $0.

### Week 13. Every trigger and step

**Code:** triggers (segment, source created, form, CRM change, product event, custom object, warehouse row, website, email, score, date, manual, API, webhook) and steps (email, wait, branch, split, update field, CRM action, ads (stub until week 18), Slack, webhook, route (stub until week 16), enroll, goal).

**Tests:** one passing test per trigger and per step; a CRM action retried makes one task.

**Done when:** each trigger and step has a passing test.

**Cost:** $0.

### Week 14. AI steps, approvals, simulate

**Code:** `ai_decide`, `ai_classify`, `ai_write` jobs through the step cache; checks on written emails (no tracking mentions, facts only from the approved list, tokens filled, length); review modes; Approvals for written emails; `simulate.ts` for "Test with 20 contacts".

**Tests:** Decide never returns a missing path; Write drops a made-up fact and blocks a tracking mention; a passing step replays from cache with no model call; simulate makes no sends and no CRM writes.

**Done when:** Simulate on 20 contacts shows every path, reason and email with no sends.

**Cost:** Claude for Decide, Classify and Write: about $30 per team: $1,500 Beta, $15,000 Growth.

### Week 15. Forms and landing pages

**Database: `042_pages.sql`** with `forms`, `form_fields`, `submissions`, `pages`, `page_versions`, `page_domains`.

**Code:** form renderer (embed script and in-page block), consent block by region, Turnstile, progressive fields; page sections and blocks; `collect` serves pages by host with HTTPS (certificates through Fly, check; open question in 6.7); AI page draft from Brand Brain facts (Sonnet); Funnel QA check on publish and daily (existing runner).

**Screens:** Pages and Forms lists, editors, Funnel QA state tag, reports.

**Tests:** a submit with the network cut mid-request lands once; Funnel QA catches a broken form; a strict-region form without the box ticked records no consent.

**Done when:** a page with a form publishes on a custom domain and Funnel QA passes.

**Cost:** Turnstile free tier (check); Fly for `collect` page serving about $5 Beta, $40 Growth (check); Sonnet page drafts about $1 per team: $50 Beta, $500 Growth.

### Week 16. Scoring and routing

**Database: `043_scoring.sql`** with `score_models`, `routing_rules`, `rep_capacity`, `handoffs`, `sla_timers`.

**Code:** `src/lib/scoring/contact.ts` (v0 weights, reasons), `train.ts` (v1 logistic regression, AUC gate), `routing.ts` (owner, account owner, named list, territory, segment, weighted round robin by capacity, out of office), `sla.ts`; CRM score sync; jobs `score_contact`, `score_train`, `route`, `sla_check`.

**Screens:** Settings › Scoring (bands, weights, model version and AUC, routing rules, capacity per rep, SLA); score and reasons on the contact page.

**Tests:** fixed fixtures give expected scores and reasons; v1 goes live only on a better AUC; 20 routing cases; one CRM task per handoff when retried; SLA fires once.

**Done when:** a Ready lead reaches the right rep in Slack within 2 minutes p95.

**Cost:** Haiku reasons on band change about $2 per team: $100 Beta, $1,000 Growth.

### Week 17. ABM

**Database: `044_abm.sql`** with `account_lists`, `account_list_members`, `buying_roles`.

**Code:** account lists (static and rules), buying group by role from title department and seniority, gaps, account score, account journeys (workflows on accounts).

**Screens:** Accounts gets list views and a buying group panel on the account page.

**Tests:** buying group roles on a fixture; an account journey runs once per account.

**Done when:** a target account list runs an account journey.

**Cost:** $0.

### Week 18. Ads and attribution

**Database: `045_ads.sql`** (`ad_accounts`, `audiences`, `audience_members`, `ad_spend`, `conversions_out`) and `046_attribution.sql` (`touches`, `attribution_models`, `attributed`).

**Code:** audience sync to LinkedIn Matched Audiences, Google Customer Match and Meta Custom Audiences (hashed emails, strict-region "No basis" left out); offline conversions out; daily spend in; touches built nightly; models (first, last, linear, time decay, W-shaped, custom; open question in 6.10); weekly summary job.

**Screens:** Settings › Ads; Attribution report with model picker; weekly summary.

**Tests:** a removed contact leaves the audience; strict-region "No basis" contacts never sync; attribution totals equal deal amounts for each model.

**Founder:** LinkedIn Marketing API approval, Google Ads developer token, Meta app review.

**Done when:** an audience syncs to LinkedIn, and a won deal shows credited touches.

**Cost:** ad APIs $0 (check terms); compute for nightly attribution within the Supabase line.

### Week 19. Agents, plays, MCP drafts, Skills

**Database: `047_agents.sql`** with `agent_tools`, `agent_runs`, `agent_steps`, `agent_schedules`, `plays`, `play_runs`.

**Code:** `src/lib/agent/tools.ts` (settings per tool), `run.ts` (loop, caching, 8-call cap; open question in 6.12), `slack.ts` (mentions, DMs, approve buttons), `linear.ts` (ticket assign, links), webhook start; plays engine; knowledge graph build (nightly); MCP draft tools; Skills pack in `skills/` (Brand voice, ICP and scoring, Campaign brief, Launch checklist, Event follow-up, Import cleanup); campaigns as code (YAML export and import).

**Screens:** agent panel on every screen; Plays list; Settings › Agents (tools with a Select each, schedules, Slack and Linear connect).

**Tests:** a disabled tool is never called; an approval tool never runs before approval; edits show a diff; replay of fixed data gives the same drafts.

**Founder:** Slack app scopes (`chat:write`, `im:history`, `app_mentions:read`), Linear OAuth app.

**Done when:** "Build a nurture for webinar signups" makes drafts, and a play runs on a hot account.

**Cost:** agents about $10 per team and plays about $3: $650 Beta, $6,500 Growth.

### Week 20. Migration agent

**Database: `048_migrations.sql`** with `migrations`, `migration_items` (kind, source id, raw, translated, proof, state).

**Code:** inventory per source; translators (smart lists → rule trees, HTML → blocks, tokens, forms, programs and workflows → our graph, score rules → v0 weights) with Sonnet for what rules can't map; proofs (counts within 1%, renders, form submits, simulated paths vs history, scores within 5 points); cutover checklist.

**Screens:** Settings › Migration: inventory with Keep or Leave behind, each item's proof tag (Proved, Differs, Can't translate), cutover per part.

**Tests:** a recorded Marketo instance migrates with every proof passing; an item that differs can't be cut over.

**Done when:** a recorded Marketo instance migrates with every proof passing.

**Cost:** Sonnet $20 to $40 per migration: $300 Beta (10 a month), $1,500 Growth (50 a month).

### Week 21. API, docs, design partners

**Database: `049_api.sql`** with `api_idempotency`.

**Code:** REST API (contacts, imports, events, segments, workflows enroll) with scopes; OpenAPI file; customer setup docs per source (`src/app/docs/` pages from the specs); internal quality page (sync loops, doubled contacts, suppressed sends, complaint rate, costs vs plan).

**Tests:** every 11.2 test green in CI; API scopes refuse out-of-scope calls.

**Done when:** 2 design partners import from their old tools and run a live workflow synced with their CRM.

**Cost:** $0 beyond earlier weeks.

---

## 11. Testing

### 11.1 Kinds of test

| Kind | Where |
|---|---|
| Unit and property tests (segments, scores, attribution, journey engine, identity) | `tests/*.test.ts` |
| Tests on a real database | `tests/pg/*.pg.ts` |
| Real-browser checks (script, identity, forms, pages, email renders, consent matrix) | `scripts/*-check.ts` on Chromium, plus WebKit and Firefox in CI |
| Suite integration (Omniscient and HubSpot test workspaces) | `scripts/suite-check.ts` (planned) |
| AI evals (Write, Decide, page build, verifier, weekly summary) | `scripts/ai-eval.ts` in CI on any prompt or model change (planned) |
| Deliverability (SES mailbox simulator addresses for bounce and complaint) | `scripts/ses-check.ts` (planned) |
| Leak tests on every table | `tests/db/leaks.sql` |
| Load (collect 10K events a second, 10K journey steps a minute, 50 sends a second) | `scripts/load-*.ts` (planned) |

Reliability rule from CLAUDE.md: no change to the journey or workflow engine, the send pipeline, identity, imports, sync or Funnel QA ships without a test that proves it on a flaky case (slow page, late event, retry, failed send).

### 11.2 Tests by area

| Area | Test |
|---|---|
| Imports | A 2,000,000-row file imports with the worker killed 3 times mid-run: every row once, counts match, no doubles |
| Imports | Undo after a second import touched some of the same contacts: only the first import's untouched contacts go, overwritten values come back |
| Imports | Suppressions land before contacts: a send queued during the import never reaches a suppressed address |
| Imports | Each connector against recorded responses: pages, cursors, 429s with retry, a token refresh mid-run, a deleted record, a merged record |
| Imports | Every connector's consent map: a fixture of each tool's statuses gives the expected basis |
| Imports | Encodings: UTF-8 with BOM, UTF-16, Windows-1252, Excel dates, formulas, merged header cells |
| Imports | Field order: a file import never overwrites a CRM value; a CRM change always overwrites a file value |
| CRM sync | 1,000 random changes on both sides with dropped webhooks, duplicate deliveries and 429s: both sides match, no echo loops, one log row per change |
| CRM sync | A Salesforce lead converts to a contact: one Claritia contact, both links kept |
| Segments | 30 rule types match a hand-counted fixture; fuzz with SQL-like values; custom object joins |
| Email | SNS signature check, suppression at send time, one-click unsubscribe, cap and quiet hours, complaint storm pause, renders at 3 widths |
| Workflows | 10,000 enrollments with killed workers and retried jobs: none stuck or doubled |
| Forms, pages | A submit with the network cut mid-request lands once; Funnel QA catches a broken form |
| AI | Decide never returns a missing path; Write drops a made-up fact; mapping suggestions are cached; a passing step replays from cache |
| Scoring, routing | Fixed fixtures; one CRM task per handoff when retried; SLA fires once |
| Ads | Audience sync leaves out strict-region "No basis" contacts; a removed contact leaves the audience |
| Migration | A recorded Marketo instance: list counts within 1%, every token resolves, simulated paths match history |
| Agents | A disabled tool is never called; an approval tool never runs before approval |
| Leaks | Every new table in `tests/db/leaks.sql` |

What passes today for weeks 1 to 8 is in 5.3 to 5.6.

---

## 12. Compliance

Website rules are in `docs/account-intelligence.md` Part 3 and `docs/identity.md` Part 3. Email adds these.

### 12.1 Lawful basis to email, by region (check each with a lawyer)

| Region | Default rule in Claritia |
|---|---|
| EU, EEA, UK | Marketing email only with recorded opt-in, or soft opt-in for existing customers about similar products (where the country allows it for B2B; check per country). The form shows an unticked checkbox. |
| Canada (CASL) | Express consent recorded, or implied consent within its time limits (check) |
| US (CAN-SPAM) | Allowed with a clear unsubscribe, physical address and honest subject. Unsubscribes honored at once (the law allows 10 business days). |
| Rest of world | Opt-in by default. The workspace owner can choose notice-based for named countries, and that choice is logged. |

- Every contact carries a `basis` per channel. The send job checks it at send time.
- Imports need a basis, from a column or for the whole list. EU contacts without opt-in proof are imported as "no basis" and can't be emailed.
- Built: `src/lib/contacts/consent.ts` and `033_contacts.sql` (the strict regions are in `src/lib/web/policy.ts`, and an unknown country counts as strict).

### 12.2 Email rules

- One-click unsubscribe, footer address, and honest From and Subject (M3, 6.4).
- Topic subscriptions, plus a preference page at `/u/prefs`.
- Unsubscribe and complaint suppression applies across all journeys and broadcasts at once.
- No purchased lists. Imports ask the source, and "bought list" is refused (built).

### 12.3 AI rules

- AI writes only from the Brand Brain and the contact's own data, and never invents facts or personal details.
- No mention of tracking in any message.
- Agent-written emails are logged with the atoms they used, for audit.
- The M10 agent makes drafts only.

### 12.4 Data

- Same retention, erasure, export and sub-processor rules as `docs/account-intelligence.md` Part 3.
- Amazon SES and Cloudflare Turnstile are added to the sub-processor list.

---

## 13. Rollout and definition of done

> **Open question: launch dates and design partner counts.** MP puts 5 design partners at week 6 and a public Beta at week 19 of its 30 weeks (13.1). CP puts 2 design partners at week 21 and 5 at week 22 of its 21 weeks (13.2). The weeks count from different starts (9.1, 9.2).

### 13.1 MP launch plan

| Week | Milestone |
|---|---|
| 4 | Script live on tryclaritia.com and on Perceptric's site |
| 6 | 5 design partners, including Perceptric clients already on Arrowsterr or Omniscient |
| 12 | Design partners send their newsletter through Claritia |
| 19 | Public Beta, Starter plan, from the waitlist |
| 22 | Growth plan |
| 26 | Suite bundle: Arrowsterr + Claritia + Omniscient |
| 30 | Scale plan. HubSpot Marketplace listing. |

**Beta exit (to Growth):**
- 50 paying teams.
- Spam complaint rate under 0.1% across the platform.
- At least 70% of agent-written emails approved without heavy edits.
- At least one design partner showing pipeline from a Claritia journey in attribution.

### 13.2 CP rollout

| Step | When | Gate |
|---|---|---|
| Our own HubSpot and the Perceptric Salesforce sandbox | Week 4 | Sync tests green |
| Our own contacts from every tool Perceptric uses | Week 6 | Import tests green, Undo works |
| Our own newsletter from tryclaritia.com | Week 10 | Domain verified, complaint rate tracked |
| 2 design partners, each moving off an old tool | Week 21 | All tests green, setup docs ready |
| 5 design partners | Week 22 | 1 week with 0 sync loops, 0 doubled contacts, 0 sends to suppressed addresses, complaint rate < 0.1% |

- **Feature flags (planned):** `workspaces.features` gets `imports`, `crm`, `email`, `workflows`, `pages`, `ads`, `agents`, `migration`, so each part turns on alone. Today it holds only `testing` and `marketing` (5.1).
- **Kill switches:** pause a source (built), pause all imports for a workspace, pause sending per workspace and globally, pause a workflow, pause audience sync.

### 13.3 Definition of done

- Every item in 1.5 works for a design partner on their live tools.
- A design partner moves off their old tool with the migration agent, every proof passing.
- All 11.2 tests pass in CI.
- For 7 days on live data: 0 sync loops, 0 doubled contacts, 0 sends to suppressed addresses, complaint rate < 0.1%.
- Costs in `ai_calls` and vendor usage match Part 15 within 20%.

---

## 14. Pricing (proposed)

> **Open question: which price list.** MP prices by contacts and emails (14.1). The buyer enablement plan (PP 7.5) priced by visitors and tracked accounts (14.2). Part 15 measures margin against the MP prices.

### 14.1 MP version

| Plan | Price | Includes |
|---|---|---|
| Starter | $299/mo | 5,000 contacts, 25,000 emails/mo, 1 site, Website Intelligence, segments, broadcasts, 3 journeys with agent steps (review mode), Funnel QA basics |
| Growth | $799/mo | 25,000 contacts, 100,000 emails/mo, 3 sites, unlimited journeys, review-sample and auto modes, pages and forms, personalization, attribution, Omniscient and HubSpot sync |
| Scale | From $1,999/mo | 100,000+ contacts, dedicated sending IPs, Salesforce, Marketing Agent, SSO, priority support |
| Suite bundle | 20% off when a team runs Arrowsterr, Claritia and Omniscient together | None |

- Overages: $10 per 1,000 contacts, $1 per 1,000 emails.
- At the cost per team in 15.2 (about $80–$104), Starter keeps about 65% gross margin and Growth about 87%.

### 14.2 PP version

| Plan | Price | Limits |
|---|---|---|
| Starter | $199/mo | 10K visitors, 250 tracked accounts, M1–M3, 1 HubSpot portal |
| Growth | $599/mo | 50K visitors, 1,000 accounts, all agents, 5 mailboxes, custom domain |
| Scale | From $1,499/mo | 250K visitors, 5,000 accounts, Phase 5 add-ons, SSO |

- Overages: $10 per 10K visitors.
- Credits for extra briefs and pages, using the `workspace_usage` meter (exists).
- At PP's own cost assumptions, cost is about $92–$99 per team, against $199–$599 in plan price.

PP's M1–M3 were Website Intelligence, Buyer Analytics and the Account Intelligence Agent. Phase 5 add-ons were personalization, site chat, intent feeds and Salesforce.

---

## 15. Monthly cost

> **Open question: which cost basis.** MP prices the whole platform per team (15.2: $60 of AI per team, about $5,179 at Beta and $40,245 at Growth, with Coresignal and IPinfo in it). CP prices only what its plan adds (15.3: $46 of Claude per team, about $3,000 at Beta and $27,750 at Growth, without Coresignal, IPinfo, Brand Brain or the weekly summary). They use different assumptions and machine sizes, so they can't be added up or put on one basis without new numbers. Both stay visible until the owner picks one. M1's own cost is in `docs/m1-website-intelligence.md` Part 15.

Claude prices: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per million tokens. Web search $10 per 1,000 searches (check).

### 15.1 Built so far

What weeks 1 to 8 add to the bill, from 5.3 to 5.6:

| Part | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Week 1 | $0 | About $1 (check) |
| Records and week 2 | About $4 (check) | About $8 (check) |
| Weeks 3 to 7 | About $1 (check) | About $11 (check) |
| Week 8 | $0 | About $25 (check) |
| **Total** | **About $5** | **About $45** |

### 15.2 MP basis

**Assumptions per team per month:**

| Item | Amount |
|---|---|
| Page views | 50,000 |
| Contacts | 10,000 |
| Emails sent | 50,000 (20,000 written by agent steps) |
| Agent Decide calls | 20,000 |
| Pages built or rebuilt | 20 |
| Active accounts | 500 |
| Handoffs | 50 |

**AI per team:**

| Module | Use | Per team |
|---|---|---|
| M1, M7 | Score reasons (Haiku, on change only), handoff briefs (Haiku) | $12 |
| M4 Decide | Haiku, 20,000 calls, cached when inputs repeat | $10 |
| M4 Write | Haiku for most, Sonnet for fit 80+ | $20 |
| M5 Brand Brain | Distill and voice (Haiku), embeddings (Voyage, check) | $3 |
| M6 | Page builds and personalization variants (Sonnet) | $3 |
| M8 | Weekly summary (Opus, Batch API) | $2 |
| M10 | Weekly plays and Ask (Sonnet with caching) | $10 |
| **Total** | | **$60** |

**Totals:**

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| AI ($60 per team) | $3,000 | $30,000 |
| Amazon SES (about $0.10 per 1,000 emails, check) | $250 | $2,500 |
| Dedicated sending IPs (about $25 each, check) | $50 (2) | $250 (10) |
| Coresignal (check) | $1,500 | $5,000 |
| IPinfo Business (check) | $249 | $1,000 |
| Fly: web, collect, intel, relay (check) | $25 | $120 |
| Supabase Pro + compute (check) | $85 | $135 |
| ClickHouse Cloud (check) | None | $300 |
| Resend for app notifications (check) | $20 | $90 |
| Cloudflare Turnstile | $0 (check) | $0 (check) |
| SOC 2 compliance tool (check) | None | $850 |
| **Total** | **$5,179** | **$40,245** |
| **Per team** | **About $104** | **About $80** |

**Ways to cut the bill:**
- Haiku for Write by default.
- The decision cache on Decide.
- The Batch API for summaries.
- A shared company cache for Coresignal and IPinfo.
- Enrichment only for accounts with real activity.

### 15.3 CP basis

**Per team per month.** Assumptions: 10,000 contacts, 50,000 emails (20,000 from AI Write), 20,000 Decide calls, 100 agent runs, 2,000 play runs, 3 sources, 2 landing pages, 1 migration per new team.

| Item | Use | Per team |
|---|---|---|
| Field mapping suggestions | Haiku, cached by header hash, a few files a month | under $0.10 |
| Title to seniority and department | Haiku for titles rules miss, cached; about 3,000 new titles | under $0.10 |
| Score reasons | Haiku, band changes only | $2 |
| AI Decide and Classify | Haiku, 20,000 calls, cached when inputs repeat | $10 |
| AI Write | Haiku by default, Sonnet for score 80+ | $20 |
| Agents | Sonnet with caching, about 100 runs | $10 |
| Plays | Haiku, about 2,000 runs, Sonnet for fit 80+ | $3 |
| AI page builds | Sonnet, a few drafts | $1 |
| **Claude subtotal** | | **About $46** |
| Migration agent | Sonnet, one time, $20 to $40 per migration | One time |
| Amazon SES | 50,000 emails at about $0.10 per 1,000 (check) | $5 |
| Source APIs | Customer's own plans; most are free to read | $0 |
| Ads APIs | Free to call (check LinkedIn Marketing API terms) | $0 |
| Warehouse queries | Run on the customer's warehouse | $0 |

**Added to the monthly bill:**

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude ($46 per team) | $2,300 | $23,000 |
| Migration agent (new teams: 10 a month at Beta, 50 at Growth, $30 each) | $300 | $1,500 |
| Amazon SES | $250 (check) | $2,500 (check) |
| Dedicated sending IPs | $50, 2 IPs (check) | $250, 10 IPs (check) |
| Fly: `claritia-intel` to 2 GB, then 3 × 2 GB; `collect` serving pages | $25 (check) | $150 (check) |
| Supabase: compute, disk for contacts, events and staging, storage for uploads (files deleted after 30 days) | $75 (check) | $350 (check) |
| Cloudflare Turnstile for forms | $0 (free tier, check) | $0 (check) |
| Salesforce Developer org, HubSpot test account and vendor sandboxes for CI | $0 | $0 |
| **Added by this plan** | **About $3,000** | **About $27,750** |
| **Per team** | **About $60** | **About $56** |

At the proposed $299 Starter price, gross margin is about 80% at Beta and 81% at Growth, and higher on the $799 Growth plan (check against final pricing). The migration line falls once early customers are moved.

**By week:**

| Weeks | Theme | Adds to the bill (Beta / Growth) |
|---|---|---|
| 1–8 | Contacts from everywhere, sync, data model | About $40 / $260 (Supabase, Fly, Haiku titles) |
| 9–10 | Email | About $300 / $2,750 |
| 11–14 | Workflows and AI | About $1,500 / $15,000 |
| 15–18 | Pages, scoring, ABM, ads, attribution | About $155 / $1,540 |
| 19–21 | Agents, migration, API | About $950 / $8,000 |
| **All** | | **About $3,000 / $27,750** (Claude lines above include per-team rounding) |

The weeks 1 to 8 line is the plan's estimate. What was built costs less so far (15.1).

---

## 16. Risks

| Risk | Effect | Plan |
|---|---|---|
| Deliverability problems from one bad sender | Shared IP reputation drops for everyone | Domain verification gate, complaint pause at 0.2%, reputation tiers in the shared pool, dedicated IPs at volume, no purchased lists |
| AI writes something false or off-brand | Trust lost | Atoms only, verifier, voice guide, review modes unlocked by approval history |
| Wrong identity link drives a wrong email | Creepy or wrong message | Probable never sends, no tracking mentions, `can_act()` gate. Evidence levels, unmerge, nightly rebuild, tests in `docs/identity.md`. |
| Omniscient API slips | Handoff and booking blocked | HubSpot two-way sync as the fallback path (built, 5.5) |
| SES production access or rate limits | Launch delay | Request production access early, Resend as a backup sender at Beta volume (check) |
| Too much scope for one team | Late launch | Phase releases each stand alone. On the MP timeline, Beta at week 19 needs only phases A to C. |
| HubSpot and Conversion.ai move faster | Harder sales | Suite bundle, price, Website Intelligence and Funnel QA that they don't have |
| Big rivals copy features (HubSpot Breeze, Mutiny) | Harder sales | Speed, a price small teams can pay, one loop from visit to meeting |
| Low company match rate (remote work, VPN) | Thin data for small teams | Lean on first-party identity (forms, email, pages, gates), add intent feeds (PP's M10, see git) |
| HubSpot rate limits on big portals | Slow first sync | Token bucket, a first sync spread over hours, a progress bar |
| AI spend runs over | Margin drops | `ai_calls` meter, a budget per workspace, decision cache, Batch API, Haiku where it's enough |
| Ad blockers and Safari | Missed visits | Proxy path setup, localStorage backup, server-set cookie |
| Privacy law change or a lawsuit wave | Legal risk | Company-level and first-party only, no third-party graphs, consent modes, erasure |
| Google verification delay (only if the parked Action Agent returns, 18.1) | No Gmail sending | Outlook and HubSpot tasks first, Gmail when approved |

---

## 17. Setup checklist (outside the code)

> **Open question: when the HubSpot app is set up.** MP needs the HubSpot developer app by its week 9. CP lists the HubSpot public app as an open check before week 2, and week 3 needs it for one-click sign-in. HubSpot two-way is built and takes a pasted key until the app exists (5.5).

Once-only setup for imports, sources and warehouses is in `docs/sources-setup.md`.

### 17.1 MP checklist

| Item | Needed by | Lead time |
|---|---|---|
| AWS account, SES production access request, SNS topic | Week 10 (request in week 1) | Days to weeks |
| IPinfo Business plan | Week 3 | 1 day |
| Coresignal plan upgrade (Premium at Beta) | Week 5 | 1 day |
| Omniscient API work (7.1) | Weeks 5–6 | In the build |
| Arrowsterr API key and endpoints | Week 13 | In the build (check what exists) |
| HubSpot developer app | Week 9 | Days |
| Cloudflare Turnstile keys | Week 21 | 1 day |
| Voyage AI key | Week 14 | 1 day |
| Fly certificates for custom domains | Week 20 | 1 day |
| DPA, sub-processor list, privacy policy update, email consent wording per region | Week 6 | 1–2 weeks, plus lawyer review |
| Salesforce developer org | Week 29 | Days |

### 17.2 CP open checks

| Check | Owner |
|---|---|
| HubSpot public app (client id, secret, scopes) | Founder |
| Salesforce connected app and a Developer org | Founder |
| Google Cloud OAuth app for Sheets, with verification for the sheets scope | Founder |
| Amazon SES production access in ap-northeast-1 (request now; takes days) | Founder |
| OAuth apps for the week 5 and 6 sources (Mailchimp, Klaviyo, Pipedrive, Zoho, Dynamics, Attio, Constant Contact, Kit, Intercom) | Founder, one per week ahead of its build |
| LinkedIn Marketing API access and Meta app review for lead forms and audiences | Founder, start by week 10 |
| Lawyer: data vendor contacts with "No basis", ads audiences from strict regions, consent proof from imported tools | Founder |
| Excel library license | Build |

### 17.3 Founder needs by week

| Week | Founder |
|---|---|
| 2 | Google Cloud OAuth client for the Picker and Sheets (scope `drive.file`) |
| 3 to 7 | In each week in Part 10 |
| 8 | A Snowflake trial and a BigQuery project for tests; lawyer answer on the data vendor rule |
| 9 to 21 | In each week in Part 10 |

---

## 18. Parked ideas

From the buyer enablement plan (PP). None of these is in the current plan. The full specs are in git.

### 18.1 Action Agent from the rep's own inbox (PP M6)

**Problem it solves:** hot accounts get missed or get a slow, generic follow-up.

| Kind | Payload | Runs as |
|---|---|---|
| `alert_rep` | text, account link | Slack DM or email to the owner |
| `email` | to, subject, body, asset links | Gmail API `users.messages.send`, or Microsoft Graph `sendMail` |
| `task` | title, due, notes | HubSpot task on the owner, linked to the company and contact |
| `sequence` | sequence id, contact | HubSpot sequence enroll (needs Sales Hub; check the API) |
| `property` | object, field, value | HubSpot update |
| `page_link` | page id, contact | Email with the account page link |

- Triggers: a stage change to Researching or Evaluating, a `form` or `spike` signal, a brief's `next_step`, or a manual "Suggest action" button.
- Drafts (Sonnet 5.5) never mention page visits or tracking, and a personal fact needs a source URL from the brief.
- Guardrails at approve time and again at send time: the person's identity link is Verified or Asserted; the address isn't suppressed; no email to this person from any Claritia mailbox in the last 3 days, and at most 3 in 30 days; mailbox and workspace daily caps; the deal owner approves for people on an open deal; send window 8:00 to 17:00 in the recipient's time zone, Monday to Friday.
- Sending: Gmail (`gmail.send`, `gmail.readonly`; Google's verification takes weeks, check) or Microsoft (`Mail.Send`, `Mail.Read`, `offline_access`). Replies are read every 15 minutes; a reply stops follow-ups and alerts the owner.
- Auto-run per action kind unlocks after 20 approvals of that kind.
- **Done when:** a design partner approves 50 emails in a week with fewer than 10% edited heavily.

### 18.2 Content Library and binge tracks (PP M4)

**Problem it solves:** content is scattered, nobody knows what gets read, and buyers bounce after one asset.

- **Ingest:** PDFs, slides (converted to PDF), videos (YouTube, Vimeo, Wistia), web pages and whole sites through the Explorer. Haiku tags topic, persona, stage, a 2-line summary and reading minutes, from a topic list set per workspace. Voyage embeddings (check).
- **Tracks:** a viewer at `/x/<track>/<asset>` on `go.<customer domain>`, with page-level active time for PDFs and watched seconds for video, a next-up rail (the track's next assets, or the nearest by embedding filtered by the account's stage), a CTA after N seconds or the 2nd asset, and a gate form after N assets or N minutes, skipped for known people.
- **Engagement:** per asset view, `min(active_s / (read_min × 60), 1) × 100`. A binge is 2+ assets in one session. Both feed signals (`asset_read` weight 6 at 50%+, `binge` weight 10).
- **Embed:** `<div data-clr-track="slug">` plus `claritia.js` renders the track on the customer's own site.

### 18.3 Orchestrator with weekly outcome review (PP M7)

**Problem it solves:** the pieces work, but someone still has to decide what to do for each account, and nobody knows which plays work.

- **The loop:** Observe, Reason, Plan, Execute, Evaluate. Any new signal on an account queues an `orchestrate` job 10 minutes out, keyed by account, so bursts become one run. At most 3 runs per account per day and 2,000 per workspace per day.
- **Model:** Sonnet 5.5 with tool use and at most 6 tool calls per run, with prompt caching on the system prompt, playbook and tool list.
- **Tools:** `get_account`, `get_signals`, `search_content`, `get_history`, `propose_email`, `propose_task`, `alert_rep`, `build_page`, `set_next_check`, `finish`.
- **Hard limits in code:** every send or publish becomes an action with all guardrails; one open email action per person; no action on Probable people; the run stops after 2 tool errors.
- **Outcome review:** every Monday, Opus 5.5 through the Batch API reads 8 weeks of actions, pages and assets with each account's stage before and after and the outcome within 14 days. A finding needs n ≥ 20 and a rate at least 1.5× the baseline. Changes become a new playbook version for the team to approve, with one-click rollback.
- **Done when:** a design partner turns on the agent for 50 accounts, and the approval rate stays above 70% for two weeks.

### 18.4 Site Chat (PP Phase 5)

| What | Technical | Adds per team |
|---|---|---|
| Answers questions, qualifies, books meetings, hands off live to the owner in Slack | A widget, with Sonnet 5.5 doing retrieval over asset chunks and a site crawl, a meeting tool and a Slack handoff through the alerts app. Every answer cites an asset. | $6 |

### 18.5 Performance budgets (PP 7.4)

| Thing | Budget |
|---|---|
| `claritia.js` | ≤ 5 KB gzipped, no effect on Largest Contentful Paint |
| Collect `/e` | p99 ≤ 50 ms |
| Dashboards | ≤ 300 ms at Beta data size |
| Account pages and experiences | Time to first byte ≤ 200 ms (cached) |
| Morning digest | Sent by 8:05 local |

---

## 19. History

In October 2026 the buyer enablement plan (`docs/pivot-plan.md`) was replaced by the agentic marketing platform plan (M0 to M10, this file). M0 and M1 were built on that plan. The Conversion parity plan (`docs/conversion-parity.md`) and its week detail (`docs/conversion-weeks.md`) then became the build plan from migration 033 on: they kept the modules and changed the order, with imports and CRM sync first. In November 2026 the four files were merged into this one. See git for the old docs.
