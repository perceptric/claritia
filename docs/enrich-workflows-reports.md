# Enrichment, Workflows and Reports (plan)

Three builds, in this order, after a short first step that moves all email onto Resend:

| Part | Build | Time | Migration |
|---|---|---|---|
| 0 | All email on Resend (campaigns, meetings, router, alerts) | 1 week | `067_resend.sql` |
| 1 | Enrichment: person and company waterfall, fill before submit, AI qualify | 2 weeks | `068_enrichment.sql` |
| 2 | Workflows: one canvas for what happens after a trigger, with campaigns on it | 3 weeks | `069_workflows.sql` |
| 3 | Reports: funnel, speed to lead, reps, forms, email | 1.5 weeks | `070_reports.sql` |

About 7.5 weeks. Each part ships on its own with unit tests, database tests on a flaky case (CLAUDE.md reliability
rule), and new steps in `scripts/screens-check.ts`. Running cost is in Part 4.

Production today (24 Oct): 6 workspaces, 1,854 contacts, no sending domains, no campaign emails sent, no nurtures,
no meeting emails sent. Nothing has to be moved from SES, so Part 0 swaps the provider outright.

---

## Part 0. All email on Resend

### 0.1 What's there today

- Campaign email runs on Amazon SES: `src/lib/email/ses.ts` and `sigv4.ts` send, `src/app/api/ses/route.ts` and
  `sns.ts` take bounces and complaints back, and `src/lib/email/domains.ts` sets up SES identities with three DKIM
  CNAMEs and a `bounce.` MAIL FROM.
- Meeting emails, the router's nudges and its alert emails send raw MIME through SES (`sesRawMailer`,
  `worker-intel/jobs/meetings.ts:54`), because calendar invites need a `text/calendar` part.
- Only alerts (`src/lib/alertSender.ts`) and the test inbox use Resend.
- The pipeline around the provider is sound and stays as is: `email_queue`, `send_claim`, `email_guard` (consent,
  suppression, caps, quiet hours), `send_done`, `/c/` click tracking and `/u/` unsubscribe with one-click headers.

### 0.2 Changes

**One Resend client, `src/lib/email/resend.ts`:**
- `send(out)` calls `POST /emails` with `from`, `to`, `subject`, `html`, `text`, `headers` (List-Unsubscribe,
  List-Unsubscribe-Post) and `tags`.
- Every send carries `Idempotency-Key: <email_messages.dedupe>`. The key window is 24 hours (check).
- Error rules stay the same as today's `SesError`:
  - 429 and 5xx mean `retry`.
  - A timeout or dropped connection means `unknown`.
  - Any other 4xx means `failed`.
- Bulk sends use `POST /emails/batch`, 100 a call. A batch is all or nothing, so one bad address fails the call
  (check). The guard already drops bad addresses before the batch is built.
- Resend's open and click tracking stay off. Clicks keep going through our own `/c/` links.

**Meeting, router and alert emails over Resend SMTP:**
- The Resend API takes no raw MIME, and calendar invites need it.
- `smtpMailer` sends the same MIME from `src/lib/meetings/emails.ts` through `smtp.resend.com:465`, with user
  `resend` and the API key as password (check).
- It implements the existing `Mailer` type, so `sesRawMailer` is swapped out and nothing else changes.
- `meeting_mails` already never resends an `unknown` send, so a dropped SMTP connection can't double an invite.

**Domains (`domains.ts` on the Resend domains API):**
1. Create the domain and save `provider_id`.
2. Show the records Resend returns: the DKIM TXT at `resend._domainkey`, and the MX and SPF TXT on `send.`.
3. Call verify, then poll the status from the existing `domain_checks_due` schedule.
- Our own DMARC check and the `t.` tracking CNAME stay.
- The Sending settings screen shows the new records, with the same states (Waiting for DNS, Verified, Failed).

**Events in (`src/app/api/email/events/route.ts`):**
- Replaces `api/ses` and `sns.ts`.
- Checks the Svix signature with `RESEND_WEBHOOK_SECRET` (`svix-id`, `svix-timestamp`, `svix-signature`) and refuses
  anything older than 5 minutes.
- Handles `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed` and `email.failed`.
- `svix-id` is the dedupe key, stored in `email_events.event_id`, so a webhook sent twice changes nothing.
- An event that matches no campaign email falls back to `meeting_mail_event`, as the SES route does today.

**Rate:** `send_settings.per_second` default drops to Resend's account rate. That is 2 requests a second by default
(check), and each batch call carries 100 emails.

### 0.3 Database, `067_resend.sql`

- `sending_domains`:
  - add `provider_id`
  - `dkim_tokens` and `mail_from` become nullable and stop being written
- `email_messages`: rename `ses_message_id` to `provider_id`.
- `email_events`: rename `sns_id` to `event_id`.
- `ses_event_apply` becomes `email_event_apply`, with the same rules:
  - a hard bounce suppresses the address
  - 3 soft bounces in 30 days suppress it
  - a complaint suppresses it, records withdrawn consent and runs the complaint-rate check
  - an event that arrives late never moves a message backward (a `delivered` after `bounced` stays `bounced`)

### 0.4 Tests (each on a flaky case)

- **Timeout after Resend took the email:** the retry with the same key makes one email, never two.
- **429 on a batch:** the worker backs off and the whole batch is sent later, once.
- **Webhooks:**
  - one with a bad or old signature is refused
  - the same event posted twice changes nothing
  - events out of order leave the message bounced
- **Suppression:** an address suppressed after its email was queued is never sent.
- **Calendar invites:** an invite sent over SMTP that times out is marked unknown and not sent again. The guest gets
  at most one invite.

### 0.5 Founder setup

- Resend plan:
  - Scale covers Beta volume and up to 1,000 domains (check)
  - ask for a rate raise (check)
  - at Growth each customer domain counts, so 500 teams need at least 500 domains (check the plan's limit)
- Webhook to `https://app.tryclaritia.com/api/email/events`, with its secret in `RESEND_WEBHOOK_SECRET` on Fly
  (`claritia-web`).
- `RESEND_API_KEY` on `claritia-intel` too (the worker sends).
- Verify `mail.tryclaritia.com` and set:
  - `ALERTS_FROM=Claritia <alerts@mail.tryclaritia.com>`
  - `MEETINGS_FROM=Claritia <meetings@mail.tryclaritia.com>`
- Remove the AWS keys and `SES_*` settings once Part 0 ships.

**Done when:**
- A test domain verifies.
- A campaign email and a meeting invite land in the inbox at Gmail, Outlook and Yahoo seed accounts.
- The invite adds to the calendar.
- Resend's bounce test address ends up suppressed.

---

## Part 1. Enrichment

### 1.1 What's there today

**Company data**
- The worker job `enrich_company` (`worker-intel/jobs/company.ts:58`) looks up a new account's domain in Coresignal.
- It caches results for 30 days in `company_cache`, shared across workspaces.
- It writes only `accounts.firmo`. It never fills `companies.industry`, `size` or `country`, and it writes no field
  history or source.
- It runs only when a website visit creates an account. A contact from a form or an import never triggers it.
- It uses one server key (`CORESIGNAL_API_KEY`).

**Gaps**
- There is no person enrichment, no email check, no customer keys, no credits and no cap.
- Forms have no lookup before submit. `prefill` means only "from a URL parameter".
- The Enrichment page shows coverage and lets you try one domain.

**Pieces we can build on**
- `merge_values` ranks sources as manual, crm, form, product, import, vendor, ai. A vendor value only fills a blank
  or replaces another vendor or AI value, so enrichment can never overwrite what a person, the CRM or a form wrote.
- `field_history` records every change with its source.
- `cachedStep` (`src/lib/ai/cache.ts`) caches AI calls, and `tests/pg/brand.pg.ts:64` proves a hit never calls the
  model.
- `seal`/`unseal` stores secrets.

### 1.2 What we build

**A. The waterfall.**

When a contact needs data, run these steps in order and stop each field at the first good value:

| Order | Step | Gives | Cost |
|---|---|---|---|
| 1 | Your records: the contact, its company, the CRM | Anything already known | Free |
| 2 | Shared caches: `company_cache` (30 days), `person_cache` (90 days) | Earlier lookups | Free |
| 3 | Email check (built in): syntax, MX lookup, throwaway domains, role addresses | Is the email real and a work address | Free |
| 4 | Company vendor: Coresignal company | Name, size, employees, industry, country, founded, type | 1 credit on a match |
| 5 | Person vendor: People Data Labs Person Enrich (first pick, see 1.6) | Title, seniority, department, LinkedIn, country, phone where allowed | 1 credit on a match |

- Steps 4 and 5 run only for work emails. Free, role and throwaway addresses get company data from the domain only
  when the domain is a company.
- A vendor that answers 429, 402 or 5xx, or takes longer than its time limit, is skipped. The waterfall moves on and
  the miss shows in History. One slow vendor never blocks a lead.
- A "not found" answer is cached too (as today), so the same email isn't looked up again for 90 days.
- Each workspace can turn steps on or off, change the order, and paste its own vendor key (Settings, Apps,
  Developers, per the no-technical-setup rule). Lookups with the team's own key use no Claritia credits.

**Where values go:**
- Values are written through `companies_upsert` and `contacts_upsert` with source `coresignal` or `pdl` (new
  `source_kinds` rows, class `vendor`), so `field_sources` and `field_history` record who said what and when.
- New contact columns:
  - `seniority`: owner, c_level, vp, director, manager, senior, entry
  - `department`: sales, marketing, engineering, product, finance, operations, people, it, legal, support, other
  - `linkedin_url`
- New company columns:
  - `employees` (a number)
  - `founded`
- These are what routing rules and reports need. Today these values sit in `accounts.firmo` or nowhere.
- The existing `enrich_company` job also writes to `companies` this way. `accounts.firmo` stays for the web
  scores that read it.

**B. Fill before submit.**

The setup:
- A form gets `enrich: { hideKnown: boolean, fields: string[] }`. Only fields the waterfall can fill can be hidden:
  company, size, industry, country, title, phone.
- A required field that's hidden as known stops being required for that person.

What happens when someone types an email:
1. When the person leaves the email field, `<claritia-form>` calls `POST /api/forms/{id}/known` with the email.
2. The server runs steps 1 to 5, with a 1.5 second limit for the whole call.
3. It answers with the list of field keys it knows, never the values. The visitor sees no data about anyone, and a
   stranger can't use the form to look people up.
4. The fields in that list fold away with the standard height motion. A slow or failed answer hides nothing, and
   the form works as before.

Limits on the lookup:
- 10 per IP a minute and 300 per form an hour.
- It only runs on live forms with `hideKnown` on.
- A lookup spends a credit only on a match, and never when the team is at its cap.

On submit:
- The submit fills the hidden fields from the cache through the same vendor write, so the contact, the router and
  the CRM push see them.
- If the cache entry is gone by then, the submit queues `enrich_contact`, and the router runs on what it has.

**C. Background enrichment.**
- Job `enrich_contact`, keyed by contact, runs:
  - for new contacts from forms, imports, sources, the API and booking pages
  - at most once every 90 days per contact
- An owner can start a backfill from the Enrichment page (`enrich_backfill`):
  - on a segment, or on all contacts missing a field
  - it shows the credits it will use before it starts
  - it stops at the cap

**D. Credits and caps.**

| Plan | Credits a month (`docs/pricing.md`) |
|---|---|
| Starter | 250 |
| Team | 2,000 |
| Business | 5,000 |

- `enrich_usage` counts lookups and matches per workspace per month.
- At the cap, vendor steps stop. Records, caches and the email check still run, and routing never waits on
  enrichment.
- An owner gets one alert at 80% and one at the cap.

**E. AI qualify.**

The team sets this up:
- Pick up to five outcomes. The defaults are Qualified, Not a fit and Needs a look.
- Write one line about what each means.
- Add optional rules that decide first, without AI. Example: "Personal email and fewer than 10 employees is Not a
  fit."

Then for each new lead:
1. The rules run first. When one matches, its outcome is final and costs nothing.
2. Otherwise the AI reads the form answers, enrichment and score.
3. It picks one of the team's outcomes, with a one-line reason and the facts it used.
4. The call goes through `cachedStep` (kind `qualify`). The key hashes the model, the outcomes and the inputs, so the
   same lead never calls the model twice.

Safety rules:
- The answer is checked against the team's outcomes. Anything else is thrown out.
- Throwaway emails and form spam are never sent to the model. The spam step decides those.
- A refusal, a timeout (3 seconds), an empty answer or an outcome that isn't on the list leaves the lead with no
  outcome, and the job tries once more later. It never guesses ("a wrong signal costs more than a missing one").
- Results are stored in `contacts.qualify_outcome`, `qualify_reason`, `qualify_by` (rule id or `ai`) and
  `qualified_at`. They show on the contact with `AiTag` when the AI decided.
- Routing rules can test `lead.qualify` ("Qualify is Not a fit, then filter out"), and so can Workflows and Reports.

Timing:
- When a router rule uses `lead.qualify`, routing waits up to 3 seconds for it.
- The booking step inside a form shows the loader during that wait.
- With no such rule, qualify runs in the background and adds no wait.

### 1.3 Screens

| Page | Change |
|---|---|
| Enrichment, Overview | Stat cards: Fields filled this month, Match rate, Credits used of cap, Leads qualified. Coverage bars per field, before and after |
| Enrichment, Providers | The waterfall as a list you drag to reorder (dnd-kit, as Routing's rules), each step with on/off, own key, time limit and its match rate. "Try an email" runs the whole waterfall on one email and shows each step's answer |
| Enrichment, Rules (new) | When to enrich (new contacts, which sources), what to skip (personal emails, students), the 90-day rule, and Qualify: outcomes, their lines and the rules that decide first |
| Enrichment, History | Each run: contact, steps with hit, miss, skipped or error and time, fields written, credits. Filter by vendor and result |
| Form editor, Settings | "Hide fields we already know" with the field list |
| Contact page | Source and date on each filled field (hover), and the qualify outcome with its reason |

### 1.4 Database, `068_enrichment.sql`

- **`person_cache`**: `email_clean` key, `vendor`, `data`, `not_found`, `fetched_at`. Shared like `company_cache` and
  readable only by the service role. Erasure requests (`privacy` job) delete the row.
- **`enrich_sources`**: per workspace and step. Columns `step`, `position`, `on`, `sealed_key`, `timeout_ms`.
- **`enrich_runs`**: `workspace_id`, `contact_id`, `company_id`, `trigger`, `steps jsonb`, `fields text[]`, `credits`,
  `ms`, `created_at`. Kept 13 months.
- **`enrich_usage`**: `workspace_id`, `month`, `lookups`, `matches`, `credits`. Updated in the same transaction as
  the run.
- **`qualify_settings`**: `workspace_id`, `on`, `outcomes jsonb`, `rules jsonb`.
- **New columns:**
  - contacts: `seniority`, `department`, `linkedin_url`, `qualify_outcome`, `qualify_reason`, `qualify_by`
  - companies: `employees`, `founded`
- **`source_kinds` rows:** `coresignal`, `pdl` and `email_check`, class `vendor`.
- **Functions:**
  - `enrich_spend(p_ws, p_credits)`: takes credits under the cap, with a row lock so two lookups at the cap can't
    both pass
  - `enrich_write(...)`: wraps `contacts_upsert` and `companies_upsert`
  - `qualify_set(...)`
- **Leak tests** in `tests/db/leaks.sql`:
  - members read only their workspace's runs and usage
  - nobody but the service role reads `person_cache` or sealed keys

### 1.5 Tests (each on a flaky case)

- **Vendor failures:**
  - the person vendor answers 429 on the first try: the waterfall moves on, the lead is routed on time, and History
    shows the skip
  - the vendor takes 4 seconds: the `known` call answers by 1.5 seconds with what it has
- **Credits:**
  - two lookups at the last credit at the same moment: one spends it, the other is refused (database test)
  - a miss costs nothing, and a cached hit costs nothing
- **Never overwrite:** a CRM-written title is never changed by a vendor title, and a manual edit after enrichment
  stays.
- **The `known` call:**
  - its answer never holds a value; a test reads the whole body
  - it never runs on a draft form or past the rate limit
- **Hidden fields:** a hidden required field doesn't block submit, and its value reaches the contact from the cache.
- **Qualify:**
  - a cached qualify replays without calling the model (as `brand.pg.ts`)
  - a model answer outside the team's outcomes is thrown out and the lead has no outcome
  - a 3-second timeout leaves no outcome, and the retry later fills it once
  - a lead with a throwaway email never reaches the model
- **Erasure:** an erasure request removes the person from `person_cache`, and a later lookup does not bring the data
  back from a stale copy.

### 1.6 Founder decisions

1. **Person vendor.** The plan starts with People Data Labs, which charges only on a match and has a clear enrich API.
   - Compare its match rate on 200 of our real work emails with Coresignal's employee data and one low-cost option
     before signing.
   - Price per match at our volume: check.
2. **Credits.** Do credits stay as in `docs/pricing.md`, and is "use your own key" on every plan?
3. **Phone numbers.** Fill them only where the vendor's terms and the lead's country allow it (check each vendor's
   terms).

**Done when:**
- 80% or more of company fields and 50% or more of titles are filled on 200 real work-email leads.
- The demo form hides company, size and title for a known email within 1.5 seconds.
- Qualify gives an outcome on 95% of leads, and replays from cache.

---

## Part 2. Workflows

### 2.1 What's there today

**Nurture**
- Workflows today is the nurture screen (`NurtureView.tsx`): one trigger (a segment or a form), then a straight line
  of emails with "+N days" waits.
- AI drafts the emails, and each email must be approved.
- `nurture_advance` sends due steps every minute through the shared email pipeline.
- There are no branches, no other step kinds, no versions and no step history.

**Pieces we can build on**
- `contact_events` already records most triggers: `form.submitted`, `meeting.booked`, `canceled`, `held`, `no_show`,
  `lead.qualified`, `lead.routed`, `segment.entered`, `segment.left`, `email.clicked`.
- The jobs queue handles retries, leases and one-waiting-job-per-key.
- The router's editor gives the patterns to reuse:
  - undo, autosave with revisions
  - test panel
  - versions and publish with diff sentences
  - run history and plain-word run lines

**Gaps**
- Score band changes, field changes and static list adds write no event.
- `task_save` and `note_save` only work for a signed-in member.
- Slack can DM by email (bot) or post to a webhook.
- Email Templates and Analytics are placeholder screens.
- Nothing creates broadcast emails.

### 2.2 What a workflow is

A trigger, then a column of steps. A Branch step splits the column into Yes and No paths, and those paths can hold
more steps and branches, three levels deep at most. The canvas is a vertical flow like Routing's, not a free board
of boxes and lines. It is easier to read, and every path is plain to test.

**Triggers:**

| Trigger | Filters | From |
|---|---|---|
| Form submitted | Which forms | `form.submitted` |
| Meeting booked, canceled, held, no-show | Meeting types, hosts | `meeting.*` |
| Meeting not booked after a form | Forms | `meeting.not_booked` |
| Lead qualified, or qualify outcome set | Outcomes | `lead.qualified`, new `lead.outcome` |
| Score band changed | From and to band | New `lead.band` event in `lead_scores_refresh` |
| Routed, or no rep found | Rules, teams | `lead.routed`, `lead.unassigned` |
| Joined or left a segment | Segment | `segment.entered`, `segment.left`, plus new events in `list_add`, `list_remove` and CRM list sync |
| Field changed | Field, from, to | New `field.changed` event, written by the same functions that write `field_history`, only for fields a live workflow watches (`workflow_watch` table) |
| Email clicked | Email or workflow | `email.clicked` |
| Date | A contact or company date field, days before or after, at a time in the contact's time zone | Daily scan |
| Once, to a segment (a broadcast) | Segment, date and time | Scheduled |
| By hand | — | "Add to workflow" on contacts and segments |

**Who can enter:**
- Once ever, or every time with a gap of at least N days.
- An optional "only if" condition is checked when the person enters.
- Goals end a person's run early, for example "Meeting booked" or "Lifecycle is Customer". This replaces nurture's
  "Leaves at stage".

**Steps:**

| Group | Step | Does |
|---|---|---|
| Email | Send email | An approved email through the full guard: consent, suppression, frequency cap, quiet hours. AI can draft it from a brief (existing nurture drafting); a person approves |
| | Send from the owner | The same, sent as the contact's owner, for one-to-one style follow-ups |
| Time | Wait | A length of time, or until a weekday and hour in the contact's time zone |
| | Wait until | Until an event (meeting booked, email clicked, field set), with a longest wait; then Yes or No |
| Logic | Branch | Conditions on contact, company, answers, score, qualify outcome, segment, email activity; Yes and No |
| | Split | A/B by percent, fixed per contact |
| Lead | Enrich | Run the waterfall now (Part 1) |
| | Qualify | Run qualify now (Part 1) |
| | Route | Run the router (key `wf:<run>:<step>`) |
| | Send booking link | An email with the routed rep's booking page, or the round robin's |
| Record | Update field | Through `contact_update` with source `workflow` |
| | Add to list, remove from list | Static segments |
| | Create task | For the owner or a named teammate, with a due time |
| Outside | Slack | DM the owner through the Claritia app, or post to a channel webhook |
| | Webhook | Signed POST, same signing and safety checks as form webhooks (`toWebhook`) |
| | Push to CRM | `crm_push` for this contact now |
| End | Exit | Ends the run with a reason |

### 2.3 How it runs (the part that must never double-send)

**Starting runs**
- `workflow_scan` runs every minute from `minute_tick`.
- For each live workflow it reads new trigger events since its cursor. The scan reads back 2 minutes behind the cursor
  because a slow transaction can commit an event after a later one was already read.
- A run's key is `(workflow_id, event_id)`, unique. Reading an event twice starts nothing new.

**Moving runs forward**
- `workflow_due` enqueues one `workflow_run` job per workspace with due runs (key = workspace).
- The job claims due runs with `for update skip locked`, 200 at a time, and moves each forward until it hits a wait
  or the end.

**Each step runs once**
- Before acting, a step writes a `workflow_steps_done` row, unique on `(run_id, step_id, visit)`. If the row already
  says done, the step is skipped.
- Every outside action carries a key made from the run and step:
  - email `dedupe` = `wf:<run>:<step>`
  - the route key
  - the webhook's `x-claritia-delivery` id
  - the task's `idem_key` (new column)
- When the result of an outside call is unclear (a timeout), the step is marked `unknown` and is not repeated, unless
  the target honors the key (email and route do). The run carries on.

**Versions and limits**
- A run stays on the version it started on. Making changes live creates a new version, and runs already in progress
  finish on their own. Steps removed in the new version don't affect them.
- Up to 50 steps and 3 levels of branches per workflow, and 100 workflows per workspace.
- A contact can be in at most 20 runs at once.

**Ending runs**
- Goals and exits are checked before every step, along with these:
  - the contact was deleted or merged (the run follows the merged-into contact)
  - the email is suppressed (email steps are skipped, other steps go on)
  - the workflow was paused (runs wait) or deleted (runs end)

### 2.4 Screens

**Workflows list**
- Name, trigger in words, status pill, people in it now, and a 30-day line of entries.
- Create opens Templates:
  - Demo request follow-up
  - No-show follow-up
  - Not booked follow-up
  - Not a fit nurture
  - Event registration
  - Welcome
  - New customer handoff
  - Start blank

**Editor**
- The column of cards, with joining words between them ("then", "wait 2 days", "if yes", "if no").
- Each card shows a one-line meaning and its 7-day count ("Sent to 132").
- Add a step with `+` between cards, or drag it from the step list (dnd-kit).
- Click a card to edit it in the side panel. Undo and redo work, and it autosaves as Routing does.
- One primary button: Make live, which opens a list of changes in sentences.

**Other pieces**
- **Try a contact:** pick any contact and see the exact path they would take, which branches they'd hit, and each
  email with their name and fields filled in. Nothing is sent.
- **Email step editor:** subject, preheader, text and button, as today's step form, plus merge fields with a
  fallback ("Hi {{first_name|there}}"). A field with no fallback stops Make live.
- **History:**
  - every run with its steps, results and times, in plain words (as Routing's History)
  - filters: active, done, exited, failed
  - a failed step can be tried again by hand
- **Versions:** earlier versions with their notes. Open one, or copy it to the draft.

**Email pages**
- Email › Templates becomes real. Saved emails that workflows and broadcasts reuse are stored in a new
  `email_templates` table.
- A broadcast is a workflow with the "Once, to a segment" trigger and one Send email step. The Create menu has
  "Broadcast" as a shortcut that opens that template.

### 2.5 Database, `069_workflows.sql`

- **`workflows`**: `workspace_id`, `name`, `status` (draft, live, paused), `draft jsonb`, `draft_revision`,
  `live_version`, `entry` (once, repeat, gap days), `goals jsonb`.
- **`workflow_versions`**: `workflow_id`, `version`, `body jsonb`, `note`, `published_by`, `published_at`.
- **`workflow_cursors`**: `workflow_id`, `last_at`, `last_id`.
- **`workflow_watch`**: `workspace_id`, `object`, `key`. Rebuilt on publish; it limits `field.changed` events to
  fields a workflow uses.
- **`workflow_runs`**:
  - columns: `workflow_id`, `version`, `contact_id`, `key` (unique per workflow), `status` (active, waiting, done,
    exited, failed), `at_step`, `next_at`, `wait_for jsonb`, `exit_reason`, `started_at`, `ended_at`
  - index on `next_at` where active or waiting
- **`workflow_steps_done`**: `run_id`, `step_id`, `visit`, `status` (done, skipped, failed, unknown), `result jsonb`,
  `at`. Kept 13 months.
- **`email_templates`**: `workspace_id`, `name`, `body jsonb` (the step form), `updated_at`.
- **`tasks.idem_key`**, unique per workspace when set. Plus `task_create_service(...)` and `note_create_service(...)`
  for the service role.
- **New events:** `lead.band`, `lead.outcome` and `field.changed`, plus segment events from list changes.
- **Nurture move:** each nurture becomes a workflow, with its trigger, waits, emails and approvals. Production has
  none today, but the move is written and tested anyway. The nurture tables stay read-only for one release, then go.
- **Functions:** `workflow_save`, `workflow_publish` (runs `check` and refuses a workflow with problems),
  `workflow_set_status`, `workflow_scan`, `workflow_due`, `workflow_claim`, `workflow_step_done`, `workflow_enter`
  (by hand), `workflow_preview`.
- **Leak tests** for every table.

### 2.6 Code

- **`src/lib/workflows/`**:
  - `types.ts` and `check.ts` (problems in words, like `src/lib/router/check.ts`)
  - `engine.ts`: pure, takes a run, facts and a clock; returns the next action. The editor's Try a contact and the
    worker use the same code.
  - `explain.ts` (run lines), `diff.ts` (Make live sentences), `templates.ts`
- **Conditions:** branches use `src/lib/router/conditions.ts`, so routing and workflows test fields the same way.
- **Worker:** `worker-intel/jobs/workflows.ts` with `workflow_run`. Each step kind is one small handler.
- **Screens:** `src/components/app/workflows/`: `List`, `Editor`, `Flow`, `Inspector`, `TryPanel`, `History`,
  `Versions`, `Publish`. Same patterns and motion as Routing.

### 2.7 Tests (each on a flaky case)

- **Starting runs:**
  - an event that commits late, behind the cursor, still starts its run, once
  - the scan reading the same event twice starts one run
- **Restarts:**
  - the worker stops after sending an email and before marking the step done: on restart the email is not sent
    again (the `dedupe` key) and the run moves on
  - a webhook that times out is marked unknown and not repeated, and the run moves on
- **Waits:**
  - a wait across a daylight saving change lands on the right local hour
  - "Wait until meeting booked, at most 3 days" takes the Yes path when the meeting is booked during the wait, and the
    No path at 3 days, never both
- **Changes while running:**
  - publishing a new version while 1,000 runs are waiting leaves each run on its own version
  - a goal met during a wait ends the run before its next email
  - pausing a workflow while its job is running stops it after the current step
- **Contacts:**
  - two contacts merged mid-run leave one run
  - a suppressed contact's email step is skipped and the rest runs
- **Engine:** Try a contact and the worker take the same path on 200 recorded contacts (shared engine, unit test).
- **Nurture move:** a nurture moves to a workflow and sends the same emails on the same days.

**Done when:**
- The No-show follow-up template runs from a real no-show to an email, a task and a Slack DM.
- A broadcast reaches a 500-contact seed segment once each, with suppressed and unsubscribed contacts skipped.

---

## Part 3. Reports

### 3.1 What's there today

**Data we have**
- Routing's Overview shows `router_stats` and `router_sla_stats`.
- The meetings page counts booked, held and no-show on the client.
- `form_booking_stats` gives shown, booked and not booked per form.
- Visits are in `sessions` (source, campaign, ref_class, country, bots marked).
- Opportunities are records with amount, stage (won and lost stages), close date and owner. Stage changes are in
  `field_history`.

**Gaps**
- Email › Analytics is a placeholder.
- There's no charting library and no form view or start tracking.
- There's no first-touch source on contacts. UTMs live in `submissions.hidden` and `sessions`.
- `site_daily` and `account_daily` exist, but nothing fills them.

### 3.2 Pages

A new sidebar group, **Reports**, sits after Scheduling. Its pages are Funnel, Speed to lead, Reps, Forms and Email.
Email › Analytics forwards to Reports › Email.

Every page:
- Starts with numbers ("Numbers first", `docs/app-structure.md` Part 2).
- Has a date range with presets (this month, last month, last 90 days, this quarter) and compares to the period
  before.
- Uses the workspace time zone for day lines.
- Exports CSV.
- Lets you click any number to open the list of contacts behind it.

| Page | Shows |
|---|---|
| **Funnel** | Visits, Forms viewed, Started, Submitted, Qualified, Routed, Booked, Held, Opportunity, Won and won amount, as one bar chart with the step-to-step rate. Break it down by source, campaign, form, rep or routing rule |
| **Speed to lead** | Median and 90th percentile from form sent to rep assigned, to first touch, to meeting booked. A day line. The share reached within the team's response time. Slowest leads in a list |
| **Reps** | Per rep: leads given, reached on time %, meetings booked, held, no-show %, opportunities and won amount, against their weekly cap |
| **Forms** | Per form: views, starts, submits, submit rate, booked rate, qualified rate. Per routing rule: leads and booked rate, so a team sees what each rule gains or costs |
| **Email** | Per email and per workflow: sent, delivered, bounced, clicked, unsubscribed, complaints, and meetings booked within 7 days of a click. Opens are not shown: Apple Mail opens every email, so open counts mislead |

### 3.3 Counting rules (written into the page's first screen once, then tested)

- **The Funnel counts by cohort.** It takes the leads that came in during the range and follows them forward, so "of
  March's leads, 14% booked" is exact. Breakdowns count each contact once, under its first touch.
- **First touch** is set once, when a contact is created. It comes from the first submission's UTMs, else the first
  session's source and campaign, else the contact's creation source. It is stored in a new `contacts.first_touch`
  column and backfilled for existing contacts.
- **Leaving people out:**
  - test fills, spam, held-as-spam leads, deleted contacts and internal visits are left out
  - merged contacts count once, under the contact they were merged into
- **Opportunity and Won:**
  - Opportunity is a deal linked to the contact or their company and created after the lead came in
  - Won is that deal reaching a won stage. The won date is the deal's close date, else the date of the stage change
    in `field_history`, which is kept for 13 months, so ranges stop at 12 months
- **First touch by a rep** is the first of:
  - the response-time timer marked met (`router_slas.acted_at`)
  - a meeting booked
  - a one-to-one email sent from Claritia
  Activity in the rep's own Gmail is not seen until the Gmail sync exists, and the page says so on its first screen.

### 3.4 Data to add, `070_reports.sql`

- **Form views and starts.**
  - `<claritia-form>` sends one beacon when the form is seen (half on screen for 1 second) and one at the first
    answer, to `/api/forms/{id}/seen`.
  - Counting rules:
    - one view and one start per visitor per form every 30 minutes, using the visitor id the form already keeps
    - bots are dropped by user agent
    - rate limit per IP
  - Counted into `form_daily (form_id, day, views, starts)` by an upsert. Submits come from `submissions`.
- **`contacts.first_touch jsonb`**: source, medium, campaign, ref_class, form_id, at. Set by `form_submit` and
  `contacts_upsert` on insert, never changed after. Backfilled in the migration.
- **`site_daily` writer**: a nightly job rolls up yesterday's `sessions`, plus a live query for today.
- **Report functions**: `report_funnel`, `report_speed`, `report_reps`, `report_forms` and `report_email`, each taking
  `(p_ws, p_from, p_to, p_by)`.
  - They are members-only and read base tables with indexes.
  - At our size (about 400 leads a team a month) they answer in well under a second. A nightly `report_daily` rollup
    is added only if a query passes 1.5 seconds in the load test.
- **Indexes**:
  - `submissions (workspace_id, created_at)`
  - `meetings (workspace_id, created_at)`
  - `router_runs (workspace_id, created_at)`
  - `contacts (workspace_id, created_at)`

### 3.5 Charts

- There's no chart library, and the pages need four shapes: funnel bars, a day line, ranked bars and stat cards
  (built).
- Build them as small SVG parts in `src/components/app/charts/`, following the dataviz rules:
  - one color per meaning, from the brand tokens, in light and dark
  - labels on the marks, never in a legend you have to match
  - a hover card with the exact number
  - motion at the standard speed, off under reduced motion
- Empty ranges show the sketch and one line.

### 3.6 Tests (each on a flaky case)

- **Counting fixtures:**
  - a seeded workspace with hand-counted answers gives exactly those numbers on every page
  - a lead with two form fills counts once
  - a merged contact counts once
  - test and spam fills are left out
- **Edges:**
  - a lead that comes in at 23:30 in New York lands on the right day for a New York workspace
  - a deal won, then moved back to proposal, then won again counts once, on the last win date
- **Form beacons:**
  - a reload within 30 minutes adds no view
  - a bot user agent adds nothing
- **Speed:** each report answers in under 1.5 seconds on a workspace with 50,000 contacts and 200,000 sessions (load
  test in `tests/pg`).

**Done when:** the Funnel shows visits to won for the Perceptric workspace, and every number opens the list of
contacts behind it.

---

## Part 4. Running cost

Same assumptions as `docs/meetings-plan.md` Part 7:

| | Beta | Growth |
|---|---|---|
| Teams | 50 | 500 |
| Leads a month | about 15,000 (300 a team) | about 200,000 (400 a team) |
| Meetings a month | 7,500 | 100,000 |

Email volume follows `docs/lock-in-plan.md`.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| **Part 0.** Resend Scale plan with rate raise (replaces SES) | $1,150 (check) | $5,000 (custom quote, check) |
| Amazon SES removed | −$250 | −$2,500 |
| **Part 1.** Person lookups: about 60% of leads have work emails, plus 30% more lookups from people who type an email and leave; about 60% match. Beta about 7,000 matches at about $0.10 each; Growth about 95,000 at about $0.04 with a volume contract | $700 (check) | $3,800 (check) |
| Company lookups: new domains only, shared 30-day cache. Beta about 4,000 at about $0.04; Growth about 40,000 at about $0.03 | $160 (check) | $1,200 (check) |
| Email check (built in, DNS lookups only) | $0 | $0 |
| Claude for qualify: about 1,500 tokens in and 150 out a lead on the Haiku-class model at $0.10 and $0.50 a million tokens (`src/lib/ai/cache.ts`), about a third answered by rules or cache | $5 (check) | $50 (check) |
| **Part 2.** Workflow worker: runs in `claritia-intel`; one more machine at Growth | $0 | $30 (check) |
| Workflow emails: inside the Resend volume above | $0 added | $0 added |
| Claude for drafting workflow emails: same as nurture today | $0 added | $0 added |
| Database growth: run and step rows, kept 13 months | $0 (inside plan) | $25 (check) |
| **Part 3.** Reports: database reads and one nightly rollup | $0 | $25 (check, if a larger database is needed) |
| **Added per month** | **about $1,765** | **about $7,630** |

Notes:
- Credits cap the two lookup lines. Each team's spend can't pass its plan's credits, and lookups with a team's own key
  cost us nothing.
- Without Part 0 (Resend is already planned in `docs/lock-in-plan.md`), Parts 1 to 3 add about $865 at Beta and
  about $5,130 at Growth.

---

## Part 5. Build order

| Week | Work | Done when |
|---|---|---|
| 1 | Part 0: Resend client, SMTP mailer, domains, events route, `067`, tests | Seed inboxes get a campaign email and an invite |
| 2 | Part 1: `068`, waterfall, `enrich_contact`, vendor writes with history, credits, the existing company job fixed | 80% company fields on 200 leads |
| 3 | Part 1: `known` endpoint and hide in forms, Qualify with rules and cache, Enrichment pages | The demo form hides known fields within 1.5 s |
| 4 | Part 2: `069`, engine, check, scan and run with the once-only ledger, nurture move | The flaky-case tests in 2.7 pass |
| 5 | Part 2: every step kind, new events, Try a contact | Try a contact matches the worker on 200 contacts |
| 6 | Part 2: editor, History, Versions, Templates, Email templates, broadcasts | No-show follow-up runs end to end |
| 7 | Part 3: `070`, beacons, first touch, report functions, chart parts | Fixtures match by hand |
| 7.5 | Part 3: the five pages, CSV, drill-down lists; docs and screens check | The Perceptric funnel shows visits to won |

After this: the moving lead and Describe it in Routing (`docs/router-ux-v2.md` Part 19), the meeting brief, and the
Chrome extension booking panel (`docs/meetings-plan.md` M4).
