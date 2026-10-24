# M3 Router: every lead to the right rep

Status: plan, waiting for a yes. This is the detail for M3 in `docs/meetings-plan.md` (Chili Piper Distro, Default's
routing). It builds on what's built: contacts and companies with owners, the CRM sync, instant booking in forms, the
meeting types' round robin and the jobs queue.

Screens, workflows and the code behind them: `docs/router-ux.md`.

**In one line:** every new lead goes through one router, in under 150 ms, and comes out with an owner, a log that says
why in plain sentences, and (from a form) the right rep's times on the calendar.

---

## Part 1. What exists today, and what changes

| Today | Where | What happens to it |
|---|---|---|
| Routing for MQLs: first rule by country, industry and size, turns between owners, "respect owner" | `lead_route()` in `043_lead_scoring.sql`, `lead_settings.routing` | Moved into the router (Part 11). `lead_route()` calls the router. |
| Who sees the calendar on a form: "everyone" or "only leads that match" | `schedule.who` and `schedule.rules` in `src/lib/forms/schedule.ts` | Stays. It decides *whether* the lead books. The router decides *with whom*. |
| Round robin inside a meeting type | `pickHost` in `src/lib/meetings/slots.ts` | Stays for booking pages. Forms that use the router book with the routed rep. |
| Contact owner (`owner_user_id`, `owner_crm_id`) and company owner (`owner_user_id`) | `033_contacts.sql`, `034_records.sql` | The router reads and writes them. Companies gain `owner_crm_id`. |
| Spam on forms: hidden trap field, too fast, Turnstile | `src/lib/forms/submit.ts` | Stays as the first wall. The router adds its own spam step for every way in. |

**What the competition gets wrong, and we fix:**
- Default's logs don't say why a lead went where it did. Ours are sentences, with every check shown.
- Chili Piper Distro takes weeks to set up. Ours opens on templates and a working default.
- Nobody lets you test a rule change on last month's leads before turning it on. We do (Part 9).

---

## Part 2. The words

- **Lead:** a contact, as the router sees it at that moment, with its company, answers and enrichment.
- **Router:** one per workspace. It has a **live** version and at most one **draft**.
- **Step:** one box in the router, run top to bottom. Each step can end the route or pass the lead on.
- **Queue:** a group of reps with a way to share leads (round robin, weighted or by load) and caps.
- **Rep:** a workspace member who can own leads. Each rep has presence (in, paused, out of office) and caps.
- **Run:** one trip of one lead through the router. Every run is kept, with each step's result.
- **Held:** a lead the spam step stopped. It waits in Held until a person lets it through or marks it spam.

---

## Part 3. One lead, step by step

```
New lead ─► 1 Spam check ─► 2 Match account ─► 3 Keep owner ─► 4 Rules ─► 5 Queue ─► 6 Fallback ─► Owner set
                │                  │                 │              │          │            │
              Held        Account owner        Owner kept     Picks queue   Picks rep   Never "nobody"
```

Every step is optional and can be turned off, except the fallback.

### 3.1 When the router runs

| Way in | When | Waits for it |
|---|---|---|
| Form fill (Claritia form or captured form) | Right after `form_submit` saves the fill | Yes: the calendar needs the rep (Part 7) |
| CRM pull: a new contact with no owner in the CRM | After the pull writes it | No: a job |
| Import | When the person ticks "Route new contacts" on the import | No: a job, in batches |
| API and MCP: `POST /api/route` | On call | Yes |
| A person: "Route again" on a contact, or many contacts at once | On click | Yes for one, a job for many |
| A lead that crosses the score threshold (today's MQL route) | Where `lead_route()` runs today | No |

**Once per lead per reason.** Each run has a key (the fill id, the import row, the API's idempotency key). The same key
twice returns the first run's answer and changes nothing, so a retried form send never takes a second turn.

### 3.2 Spam check

Signals, each one a setting the team can turn off:

| Signal | Example | Source |
|---|---|---|
| Throwaway email domain | `x@mailinator.com` | The disposable list already in `src/lib/identity/clean.ts` |
| Blocked domains and emails | Competitors, the team's own test addresses | A list in the router |
| Fake name | "asdf", "test test", a name that's the same letters over and over, a URL in the name | Rules in TypeScript, with tests |
| Too many fills | Same email 5 times in an hour, same IP 20 times in an hour | Counts on submissions |
| Personal email (optional) | `@gmail.com` on a B2B demo form | The email class already worked out |

- A lead with a signal is **held**, never deleted and never sent to a rep or a calendar. It shows in **Held** with its
  reasons. "Let through" routes it at once. "Spam" marks the contact and stops future routes for that email.
- The **allow list** (domains and emails) skips the spam step.
- No AI in this step. A false hold costs a real lead, so every signal is a plain rule a person can read.

### 3.3 Match the account

1. Take the email's domain (`sam@eu.acme.com` → `acme.com`), skipping free mail like Gmail.
2. Find the company with that domain. If two match, take the one with an owner, then the oldest.
3. Optional: the **open opportunity's owner** on that company wins over the company owner (setting, on by default).
4. The owner can be a Claritia user or a CRM owner. A CRM owner maps to a user through **CRM owners** (Part 10).
5. If the account has an owner who can take the lead (Part 5), the route ends here: "Matched Acme (acme.com), owned
   by Sam."

### 3.4 Keep the owner

- If the contact already has an owner (in Claritia or the CRM), they keep it.
- If that owner left the workspace, the step passes the lead on and the log says so.
- **When the owner is out** (setting): keep them anyway, give the lead to their backup, or route on to the rules.

### 3.5 Rules

- An ordered list. **The first rule that matches picks a queue.**
- Each rule has conditions joined by **all** or **any**. A condition is a field, a test and a value:
  - Fields: any contact or company field, custom fields, form answers, UTM values, country and region, company size
    and industry, lead score and band, the form it came from, and enrichment values (after M5).
  - Tests: is, is not, is one of, contains, starts with, is filled, is empty, more than, less than, between.
- **Territory helpers:** pick countries by region (North America, DACH, EMEA, APAC), US states and Canadian provinces
  by name, and size bands (1 to 10, 11 to 50 and up). A territory can be saved and used in many rules.
- Rules can't run code and can't call outside services. They only read what's already on the lead.

### 3.6 Queue

Each queue picks one rep from its members:

| Method | How it picks | Good for |
|---|---|---|
| Round robin | The rep with the fewest leads from this queue lately, ties to the one who waited longest | Even sharing |
| Weighted | The same, with each rep's count divided by their weight (1 to 10) | A senior rep gets twice as many |
| By load | The rep with the fewest booked meetings this week across all types | Calendars that fill unevenly |

- **Who can take a lead** (Part 5): in the workspace, not paused, not out of office, under their caps, and (if the
  queue says so) inside their working hours.
- **Strict or flexible:** flexible skips a rep who can't take it now and gives the turn to the next. Strict gives it
  to the rep whose turn it is if they can take leads at all (paused or out reps are still skipped).
- **Turns are fair over time.** Counts come from the last 30 days of this queue's runs, like `rr_turns` for meetings.
  A lead later marked spam or routed again gives its turn back.
- The queue's pick is written under a lock on that queue, so 50 leads at once never give two the same turn.

### 3.7 Fallback

- Every router has a fallback: one rep, or a queue.
- If the fallback can't take it either, the lead goes to **Unassigned** and the router's alert goes out (Slack and
  email to workspace owners). A lead is never dropped and never left without a note.

### 3.8 After the owner is set

All in one database write with the run, then jobs for the rest:

1. The contact's owner (and the company's, when it has none and the setting is on).
2. A line on the contact's timeline: "Routed to Lee by US mid-market (round robin)."
3. The CRM: the owner goes out with the next push as `owner_crm` (built for two-way CRMs), mapped through CRM owners.
4. The rep is told: Slack (the router's channel, with the lead, company, answers and a link) or email when no Slack.
5. On a form, the calendar shows the rep's times (Part 7).

---

## Part 4. The log

Every run is saved as steps with their facts, and turned into sentences by one function
(`src/lib/router/explain.ts`), so the screen, Slack, the timeline and MCP use the same words.

```
Lead  dana@acme.com  from Demo request  ·  2:14 PM  ·  live version 7  ·  38 ms

✓ Spam check      Passed 5 checks.
✓ Match account   Acme (acme.com) is owned by Sam Lee.
✗                 Sam is out of office until Monday.  → When the owner is out: route on.
– Keep owner      Dana had no owner.
✓ Rules           "US mid-market" matched: country is US, size is 51 to 200.
                  Skipped "Enterprise": size 51 to 200 is not more than 1,000.
✓ Queue           US mid-market, round robin. Lee had 3 of the last 9; Ana 3, paused; Raj 3, at his daily cap of 8.
                  → Lee.
Owner             Lee Park
```

- Each line keeps its facts (values, counts, the rule's text at that version), so an old run still reads right after
  the rules change.
- The log is kept for 13 months, then removed.

---

## Part 5. Reps: presence and caps

A **Reps** tab shows every member who can own leads:

| Column | What it shows | Set by |
|---|---|---|
| Status | In, Paused until a date, Out of office | Rep or owner; out of office also comes from the calendar |
| Out of office | From calendar events marked out of office (`busy_blocks.ooo`, already synced) and dates set here | Automatic and manual |
| Backup | Who takes their leads while they're out (used by "Keep owner") | Owner |
| Caps | Leads a day and a week, across all queues | Owner |
| Load | Leads today and this week, and meetings this week | Automatic |
| Working hours | From their meeting hours (`availability`) | Already set in My calendar |

- Days for caps are counted in the rep's own time zone.
- A paused rep keeps every lead they own. Only new leads skip them.

---

## Part 6. Versions

- Changes go into a **draft**. The live version keeps running until the draft is published.
- **Publish** checks the draft first (Part 9) and shows what changed.
- Every version is kept. **Roll back** makes an old version live again (as a new version, so history stays in order).
- Each run records the version it used.

---

## Part 7. Booking with the routed rep

- On a form that books with Claritia calendar, a new choice: **"With the routed rep"** (next to the meeting type).
- The form uses an "Owner first" meeting type whose hosts are the reps in the router's queues. The router's pick is
  passed as the owner, so the lead sees that rep's times first, then the queue's if the rep has none in the window.
- The router runs inside the form send (one read and one write, under 150 ms at the 95th percentile), so the times
  still show in under a second.
- A booking from the routed rep's times keeps that rep as owner. If the lead books someone else (the rep had no
  times), the owner stays the routed rep and the meeting host is the one booked; the log says so.

---

## Part 8. Screens

**Where:** CRM › **Routing** in the sidebar (after Meetings). It opens on a `ToolIntro` with a sketch until the router
is set up.

1. **First screen:** "Send every lead to the right rep", with three templates:
   - **Round robin:** spam check, keep owner, one queue with everyone.
   - **Territories:** spam check, match account, keep owner, rules by region, a queue per region.
   - **Owner first:** match account and keep owner, then a round robin for new accounts.
2. **Router:** the steps as a vertical flow (like the picture in Part 3), each a card you open to edit. Rules are a
   list you drag to reorder. Conditions use the app's `Select`, never a browser dropdown. The draft has a pill
   `Badge` ("Draft", "Live").
3. **Queues:** each queue's reps, weights, method and strict or flexible.
4. **Reps:** the table in Part 5, with pause and out-of-office in place.
5. **Log:** every run, newest first, with filters (owner, queue, rule, held, form). A run opens the log in Part 4.
6. **Held:** held leads with their reasons, and "Let through" or "Spam", one at a time or many at once.
7. **Test** (a panel on the right of the Router screen): type an email or pick a contact, change any field, and see
   the path and the sentences. It shows the draft and the live version side by side.

Every screen works in light and dark, with the brand rules in `CLAUDE.md`.

---

## Part 9. Test mode and replay

- **Test** runs the same code as a real route with writing switched off: no owner, no turn, no run saved. A test
  proves it (Part 12).
- **Replay** (before publishing): run the draft on the last 30 days of leads (up to 5,000) and compare with what
  happened: "412 leads. 371 go the same way. 41 change: 33 from Ana to Lee (new EMEA rule), 8 now held (new blocked
  domain)." Each change opens its two logs side by side.
- **MCP tools** (in `src/lib/mcpTools.ts`):
  - `route_explain`: why a contact went where it did, as sentences.
  - `route_test`: where an email or a made-up lead would go.
  - `route_suggest`: a proposed change. It lands as a draft that a person reviews with Replay and publishes. Claude
    never publishes.

---

## Part 10. Data

New migration `064_router.sql`:

| Table | Holds |
|---|---|
| `routers` | One row per workspace: live version number, draft version number, alert channel |
| `router_versions` | Each version's body (steps, rules, queues, territories, settings) as checked JSON, who made it, when published |
| `router_reps` | Per member: paused until, out-of-office dates, backup, caps a day and a week |
| `router_runs` | Every run: lead, key, trigger, version, steps with facts, result (owner, queue, held, unassigned), time taken. Index on contact and on time; 13 months kept |
| `crm_owner_links` | A CRM owner (source, owner id, label) to a Claritia user; filled from the CRM's owner list and confirmed by the owner |

Changed: `companies.owner_crm_id` (from the CRM pull), `contacts.route_status` (`held`, `spam`, `unassigned` or null).

Code:

| File | Does |
|---|---|
| `src/lib/router/types.ts` | The body's shape: steps, rules, conditions, queues |
| `src/lib/router/check.ts` | Checks a body before it's saved: every field exists, every rep is a member, no empty queue, a fallback set |
| `src/lib/router/engine.ts` | Pure: facts in, path out. The same function for routes, tests and replays |
| `src/lib/router/spam.ts` | The spam signals, each one a small function with tests |
| `src/lib/router/explain.ts` | A run's steps to sentences |
| `src/lib/router/server.ts` | `route(rpc, lead, key)`: read facts (one call), run the engine, commit (one call) |

Database functions: `router_facts(contact)` reads the lead, company, owners, reps' state, loads and queue counts in one
call. `router_commit(...)` locks the queue, checks the pick still holds (caps, pause), writes the owner and the run,
and returns the result. If the pick no longer holds (another lead took the last cap a moment ago), the engine runs once
more with fresh facts.

---

## Part 11. Moving today's routing over

Migration `064` turns each workspace's `lead_settings.routing` into router version 1:

| Today | Becomes |
|---|---|
| `respect_owner` | The Keep owner step, on or off |
| Each rule (countries, industries, sizes, owners) | A rule with those conditions, pointing to a new queue of those owners, round robin |
| `default.owners` | The fallback queue |
| `turns` | Starting counts in the new queues, so nobody gets a run of extra leads |
| CRM-only owners (`crm_owner_id` with no user) | Queue members through `crm_owner_links`; until linked, the lead gets the CRM owner as before |

A test runs 200 sample leads through the old `lead_route()` and the new router and expects the same owners.

---

## Part 12. Reliability (the CLAUDE.md rule: routing)

Each item ships with a test on the flaky case:

| Case | Test |
|---|---|
| 50 leads at once into one queue of 5 | Each rep gets 10; no turn is taken twice (real database, parallel calls) |
| The same fill sent twice (a browser retry) | One run, one turn, the same owner both times |
| A rep hits their cap while two leads race for the last spot | One gets the rep; the other goes to the next rep; caps never go over |
| The owner leaves the workspace between facts and commit | The commit refuses; the rerun picks someone else; the log says why |
| Out of office starts at midnight in the rep's time zone | A lead at 11:59 PM goes to them; at 12:01 AM it skips them |
| The CRM push fails | The owner in Claritia stays; the push retries; nothing routes twice |
| Test mode and Replay | Counts of every table before and after are equal |
| A run from an old version | Its log reads with that version's rule names and values |
| Spam: a real lead with a short name like "Al Wu" | Not held (fake-name rules have a list of real short names in their tests) |
| Allow list against a blocked domain | The allow list wins |
| Nobody can take the lead and the fallback is paused | Unassigned, the alert goes out once, the lead is on the Held and Unassigned list |
| Moving `lead_settings` | 200 sample leads get the same owner from old and new |

---

## Part 13. Build order (2 weeks)

| Days | Ships | Done when |
|---|---|---|
| 1 to 2 | Types, check, engine, spam signals, explain, with unit tests | The engine routes 1,000 made-up leads in under 50 ms total, and every path has sentences |
| 3 to 4 | `064_router.sql`, facts and commit, `route()`, idempotency, the move from `lead_settings` | 50 parallel leads share fairly on a real database |
| 5 | Form send hook, "With the routed rep" booking, CRM owner push, timeline line, rep alerts | A form fill shows the routed rep's times in under a second |
| 6 to 7 | Screens: first screen with templates, Router, Queues, Reps | A team sets up territories from a template in 5 minutes |
| 8 | Log, Held, Test panel | A held lead is let through and routes at once |
| 9 | Replay, versions and roll back, MCP tools, `POST /api/route` | Replay shows what a rule change does to last month's leads |
| 10 | Screens check run, light and dark screenshots, docs | `scripts/screens-check.ts` routes a fill to the right rep and books them |

---

## Part 14. Running cost

No Claude tokens: routing and spam are plain rules. Assumes 1,000 leads a team a month at Beta (50,000 runs) and 2,000
at Growth (1,000,000 runs).

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Database: runs at about 1 KB each, kept 13 months (about 0.6 GB at Beta, 13 GB at Growth) | $0 (inside plan) | $25 (check) |
| Rep alerts by email when there's no Slack (about half the runs, SES at $0.10 per 1,000) | $3 (check) | $50 (check) |
| Slack alerts (incoming webhooks) | $0 | $0 |
| Replay (database reads only) | $0 | $0 |
| Claude tokens | $0 | $0 |
| **Added per month** | **about $3** | **about $75** |

---

## Part 15. Decisions before building

1. **Slack:** the router's alerts go to one channel by webhook (as forms do today). Direct messages to each rep need a
   Claritia Slack app; that's M3's week 2 in `docs/meetings-plan.md` (SLA nudges), so this plan uses the channel.
2. **CRM leads:** route new CRM contacts with no owner by default, or only when the person turns it on per source?
   This plan says off by default, so turning on Claritia never changes owners in a team's CRM on its own.
3. **SLA timers** (lead goes back to the queue if the owner doesn't act) come right after, in M3's second week, on
   top of the runs and reps built here.
