# Claritia Inbound: from form fill to booked meeting

**One line:** a visitor fills a form, Claritia fills in who they are, checks if they fit, picks the right rep and puts a meeting on that rep's calendar before the visitor leaves the page.

**Who it's for:** small B2B teams (2 to 50 people, often no ops person) who find HubSpot too heavy and too expensive. The model is Default (default.com). Claritia keeps its CRM (Contacts, Leads, Companies, custom objects, segments, sources) and adds the inbound stack on top.

**The five modules this plan adds:**

| # | Module | What the customer gets |
|---|---|---|
| I1 | Form Builder | Branded forms built in Claritia, or their existing HubSpot, Webflow, Marketo, Framer or plain HTML forms captured as they are |
| I2 | Lead Enrichment | A waterfall across data vendors on every lead, with the source of each value kept |
| I3 | Qualification | Rules plus an AI check that sort each lead into qualified, not a fit or needs a look |
| I4 | Routing | The right owner for each lead, with a log of which rule decided |
| I5 | Meeting Scheduling | Booking links, team calendars, round robin and booking right inside the form |

Two follow-ons from the same screenshot come after (Part 9): SDR to AE handoff and CRM hygiene.

Facts about Default come from its own pages (home, pricing, comparisons, templates), read in October 2026. They are vendor claims.

This plan changes the order in `docs/conversion-parity.md`. Weeks 1 to 8 are built. Inbound takes weeks 9 to 16, with two follow-ons in weeks 17 and 18. Email, workflows and the rest move back ten weeks (Part 8).

---

## Part 1. What Default sells, and our answer

| Default | What it does (its own pages) | Claritia after this plan |
|---|---|---|
| Forms | Own form builder and SDK, or connect HubSpot, Webflow, Marketo or Framer forms | The same, plus consent wording by region, Turnstile, and Funnel QA testing every form in a real browser |
| Enrichment | Waterfall across several vendors, run before the form is sent | The same, with the source and date of every value in field history (`034_records.sql` already keeps this) |
| Qualification | Rules and AI steps in a workflow | Rules first, then an AI check that can only pick an outcome the team defined, with its reason |
| Routing | Ownership matching, weighted round robin, AI routing, lead-to-account rules | The same, plus capacity, out of office and SLA timers, and a log line for every decision |
| Scheduling | Calendar in the form, shareable links, a Chrome extension for handoffs | The same, on Google and Microsoft calendars, with group events and no-show tracking |
| Workflows | Drag-and-drop builder for the steps after a form fill | A Router: one screen per form that runs qualify, route and book in order (the full workflow canvas comes later, Part 8) |
| CRM | Pushes to Salesforce and HubSpot | Claritia's own records, plus two-way HubSpot, Salesforce and Omniscient (built) |
| — | — | Website visitors and company match (M1), and AI search data from Arrowsterr |
| Pricing | Platform fee plus a seat fee for people who take meetings (about $45 a seat for routing and scheduling, check) | Set before Beta (Part 11) |

## Part 2. Built for small teams

The promise against HubSpot, in rules every screen follows:

1. **Live in 15 minutes.** Sign up, connect a calendar, pick a form template, paste one line on the site. The first test fill books a real meeting.
2. **One click to connect.** Google, Microsoft, Zoom, HubSpot, Salesforce and Slack connect with a sign-in button. No API keys in the main flow.
3. **Templates first.** Forms, routers and meeting types each open on templates ("Demo request", "Contact sales", "Free trial", "Round robin demo", "Book with your owner").
4. **Defaults that work.** A new router already blocks personal emails, routes known accounts to their owner and round robins the rest.
5. **Free to edit.** Only people who take meetings need a seat (Part 11, check against the final price).
6. **Brand rules from `CLAUDE.md`:** no `<select>` or browser pop-ups, minimal copy, `ToolIntro` on each first screen, square containers, `rounded-md` controls, square tags.

## Part 3. One lead, start to finish

| Second | What happens | Module |
|---|---|---|
| 0 | Dana at Acme opens the pricing page. M1 matches Acme by IP. | M1 |
| 5 | Dana types a work email into the demo form. Claritia looks up Acme and Dana in the background. | I1, I2 |
| 6 | Company size and industry are known, so the form hides those fields. Dana sees 2 fields instead of 6. | I1, I2 |
| 15 | Dana sends the form. The contact is saved with consent and the earlier visits attached. | I1, M2 |
| 15.5 | Rules pass: work email, 51 to 200 people, US. The AI check reads the "what are you looking for" answer and picks qualified, with its reason. | I3 |
| 16 | Acme has no owner. The router picks the US mid-market queue and round robins to Sam, who has room this week. Log: "Rule 3, territory US mid-market. Round robin: Sam (2 of 8 this week)." | I4 |
| 16 | Sam's open times show in the form. Dana picks Thursday at 10. | I5 |
| 20 | The event lands on both calendars with a Google Meet link. Sam is owner in Claritia and in HubSpot. Slack tells Sam, with a short brief. | I5, I4 |
| Day 3 | Reminders go out 24 hours and 1 hour before. Dana joins. Sam marks it held. | I5 |

---

## Part 4. Modules in detail

### I1. Form Builder (weeks 9 to 11)

Full spec: `docs/form-builder.md`. In short:
- **Built by chat:** the person says what the form is for. An AI chat (Sonnet with tools) edits a JSON form schema and never writes HTML or CSS. Clicks and chat share one undo history.
- **Brand from the website:** the runner loads the site and reads computed styles (fonts, colors, button and input shapes, spacing, CSS variables) into a brand kit. Contrast is checked, and one look check compares the form to their own form page.
- **Placed anywhere:** a web component embed, a hosted page, pop-ups, and a React SDK.
- **Leads go anywhere:** each submission is saved first, then sent through an outbox with one delivery per destination: Claritia records, every CRM (HubSpot, Salesforce and Omniscient built, the rest added in turn), marketing tools, Slack, Teams, Sheets, webhooks. Each delivery retries, logs and can be replayed.
- **After the submit:** Claritia's router or the CRM's own rules pick the owner. Then a meeting books on Claritia's calendar (I5) or on Calendly, Cal.com, HubSpot Meetings, SavvyCal or Chili Piper, tied back to the lead by a tracking id.
- **Existing forms:** HubSpot, Webflow, Marketo, Framer and Typeform forms can be captured once the team maps them, with the same router, scheduler and destinations.

**Database:** `045_form_builder.sql` to `048_form_checks.sql` (`docs/form-builder.md` Parts 11 and 16).

**Status:** built (weeks 9 to 11). What shipped, what's left and the running cost: `docs/form-builder.md` Part 16.

**Done when:** from a site address and one sentence, a form that matches the site is live in under a minute, lands in HubSpot and Slack once through an outage test, and a Calendly booking from it ties to its lead by id.

### I2. Lead Enrichment (week 12)

**What it does:**
- **Waterfall:** for each field, try sources in order until one answers. Stop as soon as every asked-for field is filled.
- **Order (editable per workspace):**
  1. Claritia's own records and CRM data (free)
  2. The shared company cache (`company_cache`, 30 days)
  3. Coresignal: company by domain (built, `src/lib/company/coresignal.ts`), then person by work email or LinkedIn (check endpoint and credits)
  4. People Data Labs: person by email (check)
  5. Email check: MillionVerifier or ZeroBounce for deliverable, catch-all or bad (check)
- **Bring your own key** for any vendor, so the call bills to the team's own plan.
- **Provenance:** every value is a field write with source, vendor and date, shown on hover in the record. A person's own edit always wins (the existing "which source wins" order).
- **Before submit:** when the visitor leaves the email field, the form asks `collect` which fields it can hide. The answer holds field keys only. Enriched values never go to the browser, so typing emails into a form can't be used to pull data.
- **Deep research (optional):** for leads above a fit score, Sonnet with web search writes a 5-line brief with links. It only runs after rules pass.
- **Credits:** each vendor call costs credits shown in Settings › Enrichment with a monthly cap per workspace. At the cap, enrichment stops and the router still runs.

**Database: `043_enrichment.sql`**
```
enrich_sources (workspace_id, vendor, position int, enabled, sealed_key, fields text[])
enrich_runs    (id, workspace_id, contact_id, trigger, fields_asked text[], steps jsonb, credits int, at)
person_cache   (email_hash, vendor, body jsonb, fetched_at)        -- 90 days, per workspace unless the license allows sharing (check)
enrich_usage   (workspace_id, month, vendor, credits)
```

**Jobs:** `enrich_contact` (key: contact id), `enrich_backfill` (a segment or a whole list, paced by vendor limits).

**Screens:** Settings › Enrichment (waterfall order with vendor logos, fields per vendor, keys, monthly cap and usage), source tag on each value in the record page.

**Tests (flaky cases):**
- A vendor that times out or answers 429 moves to the next one, and the run finishes inside 2 seconds for the before-submit path.
- A vendor answer that disagrees with a CRM value never overwrites it.
- The same email enriched twice in 90 days makes one vendor call.
- The before-submit answer never holds a value, checked by a test that reads the raw response.

**Done when:** 100 real Perceptric contacts enrich with 80%+ of company fields filled, and the demo form drops to 2 fields for a known company.

### I3. Qualification (week 13)

**What it does:**
- **Rules first (fixed math):** work email, company size, country, industry, fit score, intent score, existing customer, open opportunity, competitor domain list, any field or segment. Each rule sends the lead to an outcome.
- **Outcomes the team defines:** by default qualified, not a fit, needs a look, existing customer (to support or the account owner).
- **AI check (optional):** Haiku reads the free-text answers and the enriched record and picks one of the team's outcomes, with a one-line reason. It can't invent an outcome. It runs only when rules leave the lead undecided. Calls go through the step cache.
- **Not a fit:** the visitor sees the team's chosen end (a thank-you page, a self-serve link, a resource), and the lead skips routing.
- **Needs a look:** goes to a review list with one-click qualify or disqualify.

**Database: `044_routing.sql` (part 1)**
```
routers       (id, workspace_id, name, status, graph jsonb, version int, fallback_owner_id)
router_runs   (id, workspace_id, router_id, contact_id, submission_id, outcome, owner_id, steps jsonb, ms int, at)
```
`steps` holds each rule checked, its answer, and the AI reason when used. That is the log the customer reads.

**Tests (flaky cases):** 40 rule cases on a fixed set of leads; the AI check with a cached answer makes no call; a model error falls to "needs a look" and never to "not a fit".

**Done when:** a router built from the "Demo request" template sorts 200 recorded Perceptric fills the same way a person did, at 95%+.

### I4. Routing (week 14)

**What it does:**
- **Match first:** existing contact owner, then account owner (lead-to-account matching by domain, aliases from M1, and fuzzy company name), then owner of an open opportunity.
- **Then queues:** territory (country, region, state), segment, size band, named account lists, or any field.
- **Inside a queue:** round robin, weighted round robin, or by capacity (open leads this week against each rep's cap). People out of office (from their calendar) are skipped.
- **AI routing (optional):** Haiku picks one of the named queues with a reason, for teams whose rules are hard to write down.
- **Fallback owner:** every router has one, so no lead is left with no owner.
- **After routing:** owner set in Claritia and pushed to the CRM through the built sources, a Slack DM with a short brief, an SLA timer (one alert to the manager on breach).
- **Log:** every run shows which rule decided and why ("Rule 3, territory US mid-market. Round robin: Sam, 2 of 8 this week").

**Database: `044_routing.sql` (part 2)**
```
queues        (id, workspace_id, name, members jsonb, mode, weights jsonb)
rep_capacity  (workspace_id, user_id, week, cap int, assigned int)
round_robin   (queue_id, last_user_id, counts jsonb)            -- updated in the same transaction as the assignment
sla_timers    (id, workspace_id, router_run_id, due_at, fired_at)
```

**Jobs:** `route` (key: contact id), `sla_check` (minute tick).

**Screens:** Routers (list, then a step editor: qualify, match, queues, book), Queues with members and weights, Router log with filters.

**Tests (flaky cases):**
- 50 fills into one queue at the same moment give a fair split with no rep skipped or doubled (the round robin row is locked inside the assignment).
- A retried `route` job assigns once and sends one Slack message.
- A rep out of office is skipped, and a queue with everyone out goes to the fallback owner.
- A CRM push that fails retries and never assigns a second owner.

**Done when:** a lead reaches the right rep in Slack within 30 seconds p95, and the log explains every decision on 200 recorded fills.

### I5. Meeting Scheduling (weeks 15 and 16)

**What it does:**
- **Connect a calendar:** Google and Microsoft 365 by sign-in. Read busy times from every calendar a person picks, write to one.
- **Meeting types:** length, buffers before and after, minimum notice, daily cap, booking window, working hours by day, questions, location (Google Meet, Teams, Zoom, phone, in person).
- **Links:** personal links (`book.tryclaritia.com/<team>/<person>`), team links that round robin, group events (several hosts, all must be free), and routing queues (the router picks the host, then shows that host's times).
- **In the form:** after qualify and route, the host's open times show inside the form. One flow, no second page.
- **Routing decides, the form shows the result** (`src/lib/forms/schedule.ts` `claritiaPlan`): with Routing live, a lead books the meeting their rule names (else the form's "Meeting when the rule names none") with the rep Routing gave them, and only that rep, whatever the meeting type's kind. The booking token carries the rep, and the confirm books with them alone (no second queue turn). Held and unassigned leads see the message. A rep with no free times: the message, or "Email times later" (the book-later email a day later, with that rep's times only). Routing too slow to answer, paused or not set up: the meeting type's own hosts. Outside schedulers are unchanged. Running cost: $0 at Beta (50 teams) and Growth (500 teams); no new service, job type or AI call.
- **Branded pages:** the team's brand kit, their logo, and a custom domain later.
- **Emails:** confirmation with a calendar file, reminders (24 hours and 1 hour, editable), reschedule and cancel links that need no login.
- **After the meeting:** host marks held or no-show (one click from Slack or the email). A no-show can get a rebook email. Outcome goes to the contact timeline and the CRM.
- **Teams on Calendly or Cal.com** keep them. Their bookings already flow in through the built webhooks (`src/lib/sources/forms.ts`).

**Free times:** reuse the slot logic from Omniscient (`src/lib/slots.ts` there, pure and tested) and widen it for buffers, caps, group events and per-day hours.

**No double bookings:** a booking first takes a 5-minute hold (unique on host and start time in Postgres), then reads the calendar's busy times once more, then writes the event. If the slot is gone, the visitor sees the next open times on the spot.

**Database: `045_meetings.sql`**
```
calendars      (id, workspace_id, user_id, provider, sealed_token, read_ids text[], write_id, tz, synced_at)
busy_cache     (calendar_id, start, end, updated_at)            -- refreshed by push notifications and a 10-minute pull
meeting_types  (id, workspace_id, slug, name, minutes, rules jsonb, hosts jsonb, mode, location jsonb, questions jsonb)
holds          (host_id, start, expires_at, unique (host_id, start))
meetings       (id, workspace_id, meeting_type_id, contact_id, host_ids uuid[], start, end, tz, status,
                provider_event_id, join_url, router_run_id, idem_key unique, token_hash, outcome, at)
```

**Jobs:** `calendar_sync` (key: calendar id), `meeting_book` (key: meeting id), `meeting_remind`, `meeting_outcome_push`.

**Screens:** Meetings (upcoming and past, held and no-show tags), Meeting types (templates first), Settings › Calendars, the public booking page and the in-form calendar.

**Tests (flaky cases):**
- Two visitors pick the same slot at the same second: one books, the other is shown new times, and the host gets one event.
- A calendar write that times out is retried and never makes two events (the provider event id is saved before the retry).
- An event added in Google one second before the booking blocks the slot (the busy times are read again during the hold).
- Time zones: 30 cases across DST changes in New York, London, Sydney and Tokyo.
- A reminder job that runs twice sends one email.

**Done when:** the Perceptric demo form books a real meeting with the right rep in under 30 seconds from submit, with zero double bookings over 1,000 simulated bookings at once.

---

## Part 5. Screens

| Group | Screens |
|---|---|
| Inbound (new) | Forms, Routers, Meetings |
| Audience | Contacts, Leads, Companies, Segments, Accounts, Visitors (as now) |
| Engage | Journeys, Pages (as now) |
| Prove | Reports |
| Settings | adds Enrichment, Calendars, Meeting types, Queues |

`src/lib/nav.ts` gets `forms`, `routers` and `meetings` routes in a new Inbound group at the top of the marketing nav. Each new screen opens on a `ToolIntro` with templates before there's data.

## Part 6. System design

```
 visitor ─► form (embed or captured) ─► collect /f ─► submission ─► contacts_upsert ─► router_run
                     │                                                        │
                     └─ email blur ─► collect /x ─► enrich (field keys back) │
                                                                              ▼
                       qualify (rules, then Haiku) ─► route (match, queues, round robin)
                                                                              │
                         hold slot ─► recheck busy ─► calendar write ─► meeting ─► reminders
                                                                              │
                  owner + meeting to Claritia records, HubSpot, Salesforce, Omniscient · Slack DM · SLA timer
```

- Qualify and route run in the request so the calendar can show inside the form. Budget: 1.5 seconds p95 from submit to times shown. Slow steps (deep research, CRM push, Slack) go to the jobs queue.
- Enrichment, routing and booking jobs run on `claritia-intel`. Booking pages and the form embed are served by `claritia-web` and `collect`.

## Part 7. Reliability

The `CLAUDE.md` rule covers identity and the jobs queue. Routing and booking join that list: no change ships to them without a test on a flaky case (Part 4 lists them). Three rules on top:
1. **A wrong owner costs more than a slow one.** If matching is unsure (fuzzy company name below the bar), the lead goes to the queue and the log says so.
2. **A double booking is the worst failure.** The hold, the busy recheck and the saved provider event id are required on every booking path.
3. **AI picks, it never makes things up.** The AI check and AI routing choose from the team's own outcomes and queues, with a reason, through the step cache.

## Part 8. Schedule

| Week | Build | Done when |
|---|---|---|
| 1–8 | Contacts, imports, records, sources, segments, warehouses (built) | Met |
| 9–11 | I1: forms, AI chat builder, brand scan, destinations, schedulers, captured forms, daily form check (`docs/form-builder.md` Parts 13 and 16) (built) | Met |
| 12 | I2: `043_enrichment.sql`, waterfall, Coresignal person, People Data Labs, email check, bring your own key, before-submit field hiding, credits and caps | 80%+ company fields on 100 contacts; demo form shows 2 fields for known companies |
| 13 | I3: `044_routing.sql` part 1, routers, rules, outcomes, AI check, review list, router log | 95%+ match with a person on 200 recorded fills |
| 14 | I4: queues, matching, round robin, capacity, out of office, AI routing, CRM owner push, Slack, SLA | Right rep in Slack within 30 s p95 |
| 15 | I5 part 1: `045_meetings.sql`, Google and Microsoft calendars, meeting types, personal and team links, booking page, Meet, Teams and Zoom links, emails and reminders | A personal link books with reminders on both calendars |
| 16 | I5 part 2: booking in the form, group events, routing queues for meetings, held and no-show, outcomes to CRM, templates, first screens, Perceptric live | Demo form books in under 30 s; 0 double bookings in 1,000 at once |
| 17–18 | Follow-ons: SDR to AE handoff, CRM hygiene (Part 9) | Each passes its tests |
| 19 onward | `docs/conversion-parity.md` weeks 9 to 21 (sending, Email Studio, workflows, pages, scoring, ABM, ads, agents, migration, API), each moved back 10 weeks | As in that plan |

Forms took `039` to `042`; enrichment, routing and meetings take `043` to `045`. Migration numbers in `docs/conversion-parity.md` from `039` on move up by seven. Week 15 there (forms and pages) keeps only landing pages. Week 16 there (scoring and routing) keeps only scoring, since routing ships here.

## Part 9. Follow-ons (weeks 17 and 18)

**SDR to AE handoff:**
- An SDR books a meeting for an AE from Claritia, Omniscient, Gmail (Chrome extension), Salesforce or HubSpot. The router picks the AE, the SDR picks a time, credit goes to the SDR.
- The extension reuses the build setup in `extension/`.
- Report: meetings booked per SDR, held rate, pipeline from them.

**CRM hygiene:**
- Nightly: fuzzy match contacts and companies, merge doubles (with undo, through the existing merge and field history), backfill blank fields through the enrichment waterfall within the credit cap.
- Every change is logged in the Sync log with a before and after.
- Never merges two records that both have open opportunities without a person's yes.

## Part 10. Monthly cost

### 10.1 Per team per month

Assumptions: 500 form fills, 300 new people enriched (the rest are known or cached), 2,000 company lookups (already in M1's Coresignal line), 500 AI checks, 50 deep research briefs, 300 AI routing calls, 150 meetings with 3 emails each.

| Item | Use | Per team |
|---|---|---|
| AI check | Haiku, 500 calls, about 3,000 tokens in and 200 out each, cached | under $1 |
| AI routing | Haiku, 300 calls, cached | under $1 |
| Deep research | Sonnet with web search, 50 briefs, about 30,000 tokens in and 2,000 out, 5 searches each | $7 |
| Host briefs in Slack | Haiku, 150 | under $1 |
| **Claude subtotal** | | **About $9** |
| Person enrichment | Coresignal or People Data Labs, 300 people at about $0.05 to $0.10 each (check) | $25 (check) |
| Email check | 300 at about $0.004 each (check) | $1 (check) |
| Calendar and video APIs | Google Calendar, Microsoft Graph, Zoom: free to call (check) | $0 |
| Meeting emails | 450 through Resend until SES lands (conversion-parity week 9, moved to week 19) | under $1 |

Claude prices from `docs/marketing-platform.md` Part 11 (Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10 per million tokens, web search $10 per 1,000, check).

### 10.2 Added to the monthly bill

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Claude ($9 per team) | $450 | $4,500 |
| Person enrichment ($25 per team, check; volume price likely lower at Growth) | $1,250 (check) | $12,500 (check) |
| Email check | $50 (check) | $500 (check) |
| Resend for meeting emails (22,500 a month, then 225,000) | $20, Pro plan (check) | $200 (check) |
| Fly: `collect` for form submits and the before-submit lookup, `claritia-web` for booking pages (the form builder's own lines are in `docs/form-builder.md` Part 14) | $10 (check) | $60 (check) |
| Supabase: submissions, router runs, busy cache, meetings | $0 (within plan) | $25 (check) |
| Cloudflare Turnstile | $0 (free tier, check) | $0 (check) |
| Google OAuth verification for calendar scopes | $0 (sensitive scope, no paid audit, check) | $0 |
| **Added by this plan** | **About $1,780** | **About $17,785** |
| **Per team** | **About $36** | **About $36** |

Teams that bring their own vendor key take the enrichment line off our bill. Enrichment is the biggest cost, so the credit cap in I2 is required from day one.

## Part 11. Open checks

| Check | Owner |
|---|---|
| Google Cloud OAuth app with Calendar scopes, and its verification (takes weeks; start now) | Founder |
| Microsoft Entra app with Calendars.ReadWrite and its publisher check | Founder |
| Zoom OAuth app | Founder |
| Coresignal person endpoint by email and its credit cost; People Data Labs price at 15,000 and 150,000 lookups a month | Founder |
| Email check vendor and price (MillionVerifier or ZeroBounce) | Founder |
| Licenses: can person data be cached across workspaces | Lawyer |
| Inbound price for small teams (platform fee and per-host seat), set against the per-team cost above | Founder |
| Slack app scopes for DMs and buttons (held, no-show) | Build |

## Part 12. Definition of done

- A new team goes from sign up to a booked test meeting in 15 minutes with no help.
- The Perceptric demo form runs on Claritia for 14 days: every lead has an owner, 0 double bookings, 0 wrong owners on known accounts.
- All Part 4 flaky-case tests pass in CI.
- Costs in `ai_calls` and vendor usage match Part 10 within 20%.
