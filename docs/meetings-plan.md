# Claritia Meetings: the Chili Piper, Default and Conversion.ai alternative (plan)

Status: plan, waiting for a yes. Nothing is built yet.

**One line:** a lead fills a form, Claritia knows who they are, decides if they fit, picks the right rep and books
the meeting on that rep's real calendar before the lead leaves the page. Then it follows up, tracks the meeting and
shows what made revenue.

**Who it's for:** small B2B teams (2 to 50 people) paying for three tools today: a router and scheduler (Chili
Piper), an inbound stack (Default) and marketing automation (Conversion.ai or HubSpot). Claritia replaces all three
on one CRM.

Competitor facts below come from search summaries of their pricing pages, help centers, docs and G2/Capterra reviews
(October 2026). The vendor sites couldn't be loaded from here, so every price is marked "check".

---

## Part 1. What they sell, what we have, what we add

| Area | Chili Piper | Default | Conversion.ai | Claritia today | This plan adds |
| --- | --- | --- | --- | --- | --- |
| Calendar booking | ChiliCal, booking links, Instant Booker | Scheduling in the form, links | — | Embeds Calendly, Cal.com, HubSpot, SavvyCal | **Our own scheduler** on Google and Microsoft calendars (M1) |
| Book on form submit | Concierge, Form Concierge | Yes | — | Yes, through an outside scheduler | **Instant booking** with the routed rep's real times, under 1 second (M2) |
| Lead routing | Distro: round robin, weights, territories, account match | Ownership, round robin, AI routing | Basic | Rule routing with turns (`043_lead_scoring.sql`) | **Router** with account match, capacity, out of office, SLA timers, decision log (M3) |
| SDR to AE handoff | Handoff | Chrome extension | — | — | **Book for a teammate** from any record, Slack and the extension (M4) |
| Enrichment | Via partners | Waterfall | Yes | Companies on Coresignal | **Person and company waterfall** before the submit, shorter forms (M5) |
| Qualification | Rules | Rules + AI | AI scoring | Fit + engagement score | **AI qualify step** with a reason, inside the router (M5) |
| Workflows | Limited | Workflow builder | Journeys | Nurture sequences | **Workflow canvas** for everything after a fill or a meeting (M6) |
| Email and AI writing | — | Basic | AI-written journeys | Sending, AI nurture with approval | **Campaigns and AI journeys** on the canvas (M6) |
| Meeting follow-through | Reminders, no-show | Reminders | — | — | **Reminders, reschedule, no-show and held tracking** (M1) |
| Reports | Meetings, conversion | Funnel | Attribution | — | **Inbound funnel and rep load** (M7) |
| AI agents | Chat AI, Meeting Prep agent, Chili Assist, MCP server | Dot agent, MCP with previewed writes | Agents that draft emails, forms and workflows for approval | Form chat builder, MCP form tools | **Routing and booking tools over MCP**, meeting brief (M3, M4) |
| Price | From $1,250 a month with 15 seats, then $45 a seat; annual only (check) | Growth $1,250 a month, Scale $3,000; routing and scheduling seats $45 a month (check) | Contact sales; one third party says from about $900 a month (check) | — | One platform price below theirs, free seats for people who don't take meetings (Part 6) |

---

## Part 2. Modules

### M1. Calendars and meeting types (the scheduler)

The detail for M1 and M2 is in `docs/meetings-scheduler.md`.

- **Connect a calendar** in one click: Google (Calendar API) and Microsoft 365 (Graph). Read busy times from every
  calendar a rep picks; write the event to one. Conferencing: Google Meet and Teams from the calendar, Zoom by its
  own sign-in.
- **Availability:** weekly hours per rep with time zone, date overrides, holidays, and out of office read from the
  calendar.
- **Meeting types:** name, length (several to choose from), location, buffers before and after, minimum notice,
  booking window, daily and weekly caps per rep, questions on the booking page, and a confirmation message.
- **Team types:**
  - Round robin, even by meetings booked or weighted per rep, with priority tiers.
  - Double round robin: one rep from each of two pools on the same meeting (AE plus SE).
  - Collective: every host must be free.
  - Owner first: the contact's owner when free, else the pool.
- **Booking page and embed:** a clean page per type and per rep, the inline calendar inside forms, and a popup button
  for any site. The lead's time zone is detected and can be changed.
- **After booking:** the calendar invite with the Meet, Teams or Zoom link, a confirmation email, reminders (24 hours
  and 1 hour, editable), and reschedule and cancel links. The team picks whether a reschedule keeps the same host or
  can move to anyone in the pool. Text reminders come later as an add-on (Twilio cost passed through).
- **Meeting status:** booked, rescheduled, canceled, held or no-show. A no-show is marked by the rep in one click or
  set by the conferencing tool's attendance, and it can start a workflow.
- **Busy-time sync:** busy times are cached and kept fresh by calendar push notifications (Google watch and Graph
  subscriptions), with a short re-check right before booking so a slot is never double booked.

### M2. Instant booking on form submit (Concierge)

- When a form is sent, the router (M3) runs on the server and the calendar of the chosen rep or pool shows in the
  form at once. Target: under 1 second from submit to times showing.
- Works on Claritia forms and on captured forms (HubSpot, Webflow, Marketo, Framer, plain HTML) through the same
  script.
- **Who sees it** reuses the form's match rules, now with enrichment and qualification results. Leads that don't
  match get the message, a page, or a "we'll be in touch" with an SLA timer.
- **Book later:** a lead who closes the page gets an email with the same rep's times, and the slot holds 10 minutes.
- **Not booked:** every form has a catch-all path, so no lead ends without an outcome. A lead who was shown times but
  didn't book is marked "not booked", the owner is told, and a follow-up workflow can start.
- **Replaces the outside schedulers:** the form's Book a meeting adds "Claritia calendar" as the first choice; the
  Calendly-style embeds stay for teams that keep them.

### M3. Router (Distro)

- **One router per workspace**, used by forms, imports, CRM sources and the API. Each lead goes through it once.
- **Spam check first:** fake names, throwaway domains and bot-like fills are held, with an allow list, so they never
  reach a rep's queue or calendar.
- **Steps, in order, each one optional:**
  1. Match the account: the email domain to a company, then the company's owner (Claritia or CRM).
  2. Keep existing owners.
  3. Rules on any field, enrichment value, score or answer, grouped in queues: territory, segment, product.
  4. Assign inside the queue: round robin even, weighted, or by availability (fewest meetings this week). Strict
     takes the next rep in line even if they're busy soon; flexible skips to the next free rep.
  5. Fallback owner.
- **Capacity and presence:** daily and weekly caps, out of office from the calendar, and a pause switch per rep.
- **SLA timers:** if the owner doesn't act (no email, call or meeting) within a set time, the lead goes back to the
  queue or to a manager, with a Slack nudge.
- **Decision log:** every lead keeps the path it took ("Matched Acme, owner Sam. Sam out of office. Queue US
  mid-market, round robin: Lee (3 of 9 this week)").
- **Test mode:** paste an email or pick a contact and see where it would go, without assigning.
- **In plain words:** the decision log is written as sentences, the gap reviewers call out in Default ("logs don't
  explain why a lead was routed").
- **MCP tools:** Claude or ChatGPT can ask why a lead went where it did, test a route, and propose a rule change that
  a person approves before it applies (Claritia's MCP server exists in `src/lib/mcpTools.ts`).
- Replaces the routing in `lead_settings` with a migration that moves today's rules into the router.

### M4. Handoff and booking for others

- **Book for a teammate:** from a contact, company or opportunity, an SDR opens the AE pool's calendar and books
  while still on the call. The invite comes from the AE, and the SDR is credited.
- **Slack:** a `/book` command and a button on the routing alert.
- **Chrome extension:** the same booking panel on Gmail and LinkedIn pages (the extension shell exists in
  `extension/`).
- **Meeting brief:** a short AI note before each meeting from the contact's visits, answers and emails, marked with
  the AI tag and its sources.

### M5. Enrichment waterfall and AI qualification

- **Waterfall:** person and company lookups across vendors in a set order, stopping at the first good match.
  Coresignal for companies (built); person vendors picked by price and match rate (check). Every value keeps its
  source and date in field history.
- **Before the submit:** as soon as a work email is typed, known fields are filled and can hide from the form (the
  form studio's "hide when known").
- **Score reasons:** the lead score shows the top factors behind it, as Conversion.ai's does.
- **AI qualify step:** reads the answers and enrichment and picks one of the team's outcomes (qualified, not a fit,
  needs a look) with a one-line reason. It goes through the step cache, so the same inputs never call the model twice,
  and its outcome is only ever one the team defined.

### M6. Workflows and campaigns

- **One canvas** for what happens after a trigger.
  - Triggers: form sent, meeting booked, canceled, no-show or held, score crossed, field changed, segment joined,
    date.
  - Steps: enrich, qualify, route, book, send email, wait, branch, update a field, create a task, Slack, webhook, push
    to the CRM.
- **Templates:** "Demo request", "No-show follow-up", "Not booked follow-up", "Not a fit nurture", "Event
  registration".
- **Run history and versions:** every run shows each step's result, and a workflow can roll back to an earlier
  version.
- **Preview as a contact:** pick any contact and see the exact email they would get.
- **Campaigns:** broadcasts and journeys from `docs/lock-in-plan.md` weeks 3 and 4 run on this canvas, with
  AI-written emails in the brand voice that a person approves (the nurture approval flow, built).

### M7. Reports

- **Inbound funnel:** visits, forms started and sent, qualified, routed, booked, held, opportunity, won; by form,
  source, campaign and rep.
- **Speed to lead:** time from fill to first touch and to meeting.
- **Rep load:** meetings per rep per week against caps, no-show rate, and SLA misses.
- **Booking rate per form** and per match rule, so a team sees what each rule costs or gains.

---

## Part 3. Screens

| Screen | Where | Holds |
| --- | --- | --- |
| Meetings | New sidebar item under CRM | Upcoming and past meetings with status, filters by rep and type |
| Meeting types | Meetings → Types | Types list, then a type's editor with live booking page preview |
| Router | Settings → Router (and a tab on each form) | Steps as cards, queues, test mode, decision log |
| My calendar | Profile | Connect calendars, weekly hours, overrides, conferencing |
| Workflows | Email → Workflows (replaces Nurture) | The canvas |
| Reports | Analytics | Funnel, speed to lead, rep load |
| Booking page | `/book/<team>/<type>` | Public page, our brand or the customer's |

All screens follow `docs/brand.md`: Geist, pills, the sparkle for AI, `ToolIntro` first screens, no browser pop-ups.

---

## Part 4. Reliability (the CLAUDE.md rule covers routing and booking)

Each one ships with tests on flaky cases:
- **No double booking:** two leads pick the same slot within a second; one wins and the other is shown the next free
  times. The check runs in Postgres with a lock per rep and slot.
- **Stale busy times:** a calendar push is missed; the re-check before booking catches the conflict.
- **Calendar token revoked:** the rep drops out of the pool and the owner is told. Leads fall back to the next rep and
  are never shown an empty calendar.
- **Round robin fairness:** across 1,000 simulated leads, weights hold within 2%. Caps and out of office are always
  honored.
- **Time zones and daylight saving:** slots across the March and November changes in the US, Europe and Australia.
- **Router idempotency:** a lead sent twice (retry, two sources) is routed once.
- **SLA timers:** survive a worker restart (jobs queue, `020_foundation.sql`).

---

## Part 5. Build order

| Weeks | What ships | Done when |
| --- | --- | --- |
| 1 to 2 | M1 calendars: Google and Microsoft connect, availability, busy-time cache with push, one-person meeting types, booking page | A rep connects Google and a lead books on the page |
| 3 | M1 teams: round robin, weighted, collective, owner first; reminders, reschedule, cancel, held and no-show | A pool of three books fairly and reminders go out |
| 4 | M2 instant booking in Claritia and captured forms, book later, "Claritia calendar" in the form studio | A form fill shows the routed rep's times in under 1 second |
| 5 | M3 router: account match, queues, capacity, out of office, test mode, decision log, migration from `lead_settings` | Every lead's path is in the log |
| 6 | M3 SLA timers, Slack alerts; M4 book for a teammate, Slack `/book` | An SDR books an AE in the middle of a call |
| 7 | M5 enrichment waterfall, fill before submit, AI qualify step | A typed work email hides known fields |
| 8 to 9 | M6 workflow canvas with templates; campaigns on it | The no-show follow-up runs end to end |
| 10 | M7 reports; M4 Chrome extension booking panel and meeting brief | The funnel shows booked to held to won |

Each step ships on its own, checked with `npm test`, `npm run test:db` and `scripts/screens-check.ts` (extended with a
real booking against a test Google calendar).

---

## Part 6. Pricing to beat them (for decision before Beta)

- One platform price per workspace with forms, router, workflows and the CRM.
- Seats only for people who take meetings. Everyone else is free.
- Chili Piper and Default both start around $1,250 a month with annual contracts, plus about $45 a seat for people
  who route and book (check both on their pricing pages before launch). Claritia's price sits well under that, monthly
  or annual, so a 5-person team can start without a sales call.

---

## Part 7. Running cost

Assumptions: Beta is 50 teams with about 300 leads and 150 meetings each a month (15,000 leads, 7,500 meetings).
Growth is 500 teams with about 400 leads and 200 meetings each (200,000 leads, 100,000 meetings).

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Google Calendar API and Microsoft Graph (free within quotas) | $0 | $0 |
| Zoom API (free with the customer's Zoom account) | $0 | $0 |
| Busy-time sync and reminders worker (one more small worker on Render or Fly) | $25 (check) | $85 (check) |
| Email for confirmations, reminders and book-later (about 4 emails a meeting) on Resend | $20 (check) | $90 (check) |
| Person enrichment, about 60% of leads at about $0.03 a match (vendor to pick) | $270 (check) | $3,600 (check) |
| Claude tokens: AI qualify (about 1,500 in and 150 out a lead, Haiku-class model at about $1 and $5 a million, step cache) | $35 (check) | $450 (check) |
| Claude tokens: meeting briefs (about 3,000 in and 300 out a meeting, Sonnet-class model at about $3 and $15 a million) | $100 (check) | $1,350 (check) |
| Claude tokens: workflow email writing (already counted in the nurture plan) | $0 added | $0 added |
| Database growth (meetings, decisions, busy-time cache) | $0 (inside plan) | $25 (check) |
| **Added per month** | **about $450** | **about $5,600** |

Enrichment is the biggest line. Two ways to hold it down, to decide before week 7: enrich only leads that pass the
first rules, or sell enrichment as credits the team buys.

---

## Part 8. Open decisions

1. Person enrichment vendor or vendors (price and match rate, check before week 7).
2. Whether meeting briefs run on every meeting or only when the rep opens one (cuts that line by about half).
3. The public booking page domain: `book.tryclaritia.com` or the customer's own subdomain.
4. Price per meeting-taker seat (Part 6).
