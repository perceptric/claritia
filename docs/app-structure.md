# The new app structure

The sidebar today is Site, CRM, Email, Ads and Settings, with Meetings and Routing as single items under CRM. This
plan reorders the whole app around five jobs, CRM first, the way Default groups its app (Views, Automation, Routing,
Scheduling), and rebuilds Scheduling from a close reading of Calendly so it does everything Calendly does and more,
because every meeting lands on a lead, a company and a deal.

It covers: the sidebar and addresses (Part 1), shared patterns (Part 2), each group (Parts 3 to 7), the build order
(Part 8), running cost (Part 9) and what changes in CLAUDE.md and the docs (Part 10). Routing's screens follow
`docs/router-ux-v2.md`; this plan places them in the sidebar and adds pages.

---

## Part 1. The sidebar

### 1.1 The new tree

```
[+ Create ▾]                           one menu for everything you can make

CRM                       (sky)
  Contacts
  Companies
  Opportunities
  Meetings                              every meeting, like Calendly's Calendar page
  (custom objects)

Automation                (clay)
  Workflows                             moved from Email
  Forms                                 moved from Site
  Signals                               new page: website visits, buying signals, alerts
  Enrichment                            new page: data providers, coverage, credits

Routing                   (sage)
  Overview                              how routing is doing, with the setup flow
  Rules                                 who gets which leads
  Teams                                 reps who take turns, away, limits
  Regions                               named places
  Company types                         named kinds of company
  Handoffs                              book a meeting for a teammate (M4)
  History                               every lead routed and why
  Needs review                          junk and leads with no rep, with a count

Scheduling                (butter)
  Meeting types                         like Calendly's Event types
  Availability                          hours, calendars, days off, team view
  Links and polls                       single-use links, one-off meetings, polls
  Booking forms                         forms that end in a booking (Calendly's Routing forms)
  Reminders                             emails and texts before and after meetings
  Payments
  AI scheduler      (later)             answers scheduling emails, like Calendly's Callie
  Notetaker         (later)             joins calls, writes notes to the deal

Reports           (docs/enrich-workflows-reports.md Part 3)
  Funnel
  Speed to lead
  Reps
  Forms
  Email

Email
  Segments
  Templates

Site
  Pages

Ads
Settings
[Get started  ▰▰▰▱]                     checklist, until done
```

- **CRM first, and the app opens on Contacts.** `defaultRoute` becomes `contacts`. An old address that used to open
  Forms opens Forms; only `/` changes.
- **Groups fold.** Each group title is a button that folds the group; the fold is remembered per person in
  `localStorage` (a convenience, safe to lose). The group of the open page never folds.
- **Icon tiles.** Every item gets a small square tile (20 px, `rounded-md`) in its group's wash with the icon in the
  deep tone, like Default. The open item is still the filled ink pill, with the tile turning paper. `docs/brand.md`
  gets a row: sidebar groups use sky, clay, sage and butter; Email, Site, Ads and Settings keep plain icons.
- **Counts where they help.** Needs review shows its count as a small pill. Meetings shows today's count. Nothing
  else carries a number.
- **The sidebar folds to icons** at 1,024 to 1,280 px (tiles only, names as tooltips) and becomes the existing drawer
  on phones.

### 1.2 Addresses

Every page has its own address so links, the command bar (⌘K) and the back button work. Old addresses keep working
through `MOVED` in `src/lib/nav.ts`.

| Page | New address | Old address that moves here |
|---|---|---|
| Meetings | `/meetings` | (same) |
| One meeting | `/meetings/<id>` | (same) |
| Workflows | `/workflows` | (same) |
| Signals | `/signals` | `/companies/visits` (visits tab), `/settings/account_alerts` |
| Enrichment | `/enrichment` | — |
| Routing pages | `/routing`, `/routing/rules`, `/routing/teams`, `/routing/regions`, `/routing/company-types`, `/routing/handoffs`, `/routing/history`, `/routing/review` | `/routing/reps` → teams, `/routing/log` → history, `/routing/held` → review |
| Meeting types | `/scheduling/types`, `/scheduling/types/<id>` | `/meetings/types`, `/meetings/types/<id>` |
| Availability | `/scheduling/availability` | `/settings/calendar`, `/settings/calendars` |
| Links and polls | `/scheduling/links` | — |
| Booking forms | `/scheduling/forms` | — |
| Reminders | `/scheduling/reminders` | — |
| Payments | `/scheduling/payments` | `/settings/payments` |

The calendar sign-in callback (`/api/calendar/callback`) sends people back to `/scheduling/availability`; Stripe's
return goes to `/scheduling/payments`.

### 1.3 Create

A **Create** button sits at the top of the sidebar, as in Calendly. Its menu is grouped like the sidebar:

- CRM: Contact, Company, Opportunity
- Automation: Workflow, Form
- Routing: Rule, Team
- Scheduling: Meeting type, Single-use link, Poll, Booking form

Each opens the same screen its page's own "New" button opens. ⌘K lists the same items.

### 1.4 Get started

A small card at the bottom of the sidebar (Calendly's "Get started" bar) with a progress bar and up to six tasks that
match what the workspace has done: connect a calendar, make a meeting type, publish a form, turn on routing, invite a
teammate, connect a CRM. Each task opens the page that does it. It hides when all are done or when closed, and comes
back from Settings. Progress is read from the data, so it can't drift.

---

## Part 2. Patterns every page shares

These come from Default and Calendly and replace one-off layouts.

1. **Page header.** Title, then tabs when a page has more than one view, then on the right one secondary button and
   one primary button ("Manage availability", "+ Create"), as on Calendly's Scheduling page.
2. **Numbers first.** Pages that report (Meetings, Signals, Enrichment, Routing Overview, History) open on three or four
   stat cards whose small line is a sentence ("84% of companies have size and industry"), then one chart with a range
   picker, then the list. Default's Companies page is the model.
3. **Lists of cards for things you set up** (meeting types, teams, rules, reminders, workflows): a colored bar on the
   left edge, the name, one summary line ("30 min · Google Meet · One host"), and on the right **Copy link** and a
   ⋯ menu. A checkbox shows on hover for working on several at once.
4. **Edit in a side sheet.** Opening a thing slides a sheet in from the right (as Calendly's event type sheet) with
   sections that fold. A folded section shows a one-line summary of its settings, so the sheet reads as an overview.
   The bottom bar holds **Preview**, **Back** and **Save changes**; a **Saved** pill drops in at the top on save. Big
   editors (forms, workflows, routing setup, pages) stay full screen.
5. **Hover cards** for any person, contact or company: face, name, email and the few fields that matter on that page.
6. **Search and filters** in one row above every list; filters are pills that read as words ("Any host", "This week").
7. **Empty states** keep the sketch, a short title and one button.

---

## Part 3. CRM

Contacts, Companies and Opportunities stay as they are, with custom objects listed under them. Two changes:

- **Companies** drops its Visits tab (it moves to Signals). The company page keeps its activity and alerts.
- **Meetings** becomes the calendar of every meeting, rebuilt after Calendly's Calendar page.

### 3.1 Meetings, after Calendly's Calendar page

| Calendly | Ours |
|---|---|
| "My Calendly" picker | **Whose**: Mine, a teammate, a team, Everyone (owners and managers) |
| Search meetings | Search by guest, company or type |
| Filter | Host, type, status (booked, held, no-show, canceled), source (form, booking page, handoff, link) |
| All meetings / Calendly only | **All meetings / Booked in Claritia**: "All" adds the events on connected calendars (read from the busy cache, shown as gray "Busy" or with titles when the person allows) |
| Date picker and Today, Upcoming, This week, Last week | Same presets, plus a date picker |
| "Displaying 31 meetings" | Same line on the right |
| Day headings with a Today pill and a red now line | Same, the now line in `rose` |
| Each meeting: time, type, "with" guest | Time, type, guest and their company with logo, the deal stage pill, and the routed rep's face |

Above the list, three stat cards: **Booked this week**, **Held** (and no-show rate), **From forms** (share booked
straight from a form). Opening a meeting keeps today's meeting page (lead, company, deal, answers, history), now as a
side sheet so the list stays in place.

---

## Part 4. Automation

### 4.1 Workflows and Forms

They move under Automation unchanged. Forms keeps its studio. Workflows keeps its canvas and gains meeting steps
(Part 6.6).

### 4.2 Signals (new page)

Everything the app learns from website visits and buying signals, which today is split across the Companies visits
tab and Settings. Tabs:

| Tab | What's on it | Built from |
|---|---|---|
| **Feed** | Live list of signals: "Acme visited pricing 3 times today", "Globex filled the demo form", "A Stripe employee read the security page", each with the company logo, who, when and a button to open the company or route it | `026_signals.sql`, account scores |
| **Visitors** | Today's visitors list (moved from Companies › Visits) | `VisitorsView` |
| **Alerts** | Which signals post to Slack or email, per rule (moved from Settings › Account alerts) | `AccountAlertsPanel` |
| **Setup** | Sites and the tracking snippet, identity settings (moved from Settings › Sites and Identity) | `SitesPanel`, `IdentityPanel` |

Stat cards: **Companies on the site this week**, **Known people**, **Hot accounts** (score over the threshold), **Alerts
sent**. Chart: visits per day.

### 4.3 Enrichment (new page)

Where data about people and companies comes from, and how complete it is (the M5 waterfall in
`docs/marketing-platform.md`; today Coresignal fills companies through `src/lib/company/coresignal.ts`). Tabs:

| Tab | What's on it |
|---|---|
| **Overview** | Stat cards: **Companies filled** (84% have size and industry), **People filled**, **Credits used this month**. A bar per field showing how many records have it (job title, size, industry, country, phone), each bar a link to a filtered list of the records missing it |
| **Providers** | The waterfall as cards in order (Coresignal first, then others as they're added), drag to reorder, each with its logo, what it fills, a switch, and credits used. "Try a domain" runs one lookup and shows what each provider returns |
| **Rules** | When to enrich: on new contacts, on form fills, on import, before routing (so rules can use size and industry), and fields never to overwrite |
| **History** | Every lookup: record, provider, fields filled, credits |

This page shows and controls what exists; new providers come with M5.

---

## Part 5. Routing

The router-ux-v2 plan (`docs/router-ux-v2.md`) as sidebar pages. What each page holds:

| Page | Holds | From today |
|---|---|---|
| **Overview** | Status bar (on, changes not live, off; Pause routing), stat cards (routed this week, reached out on time, no rep found, waiting for review), leads per day, "Where leads came from" with logos, then the setup as a story with the moving lead and Try a lead | Router tab |
| **Rules** | Rules as sentences with in-place pickers, six starters, drag to order; each rule shows how many leads it matched this week | Rules card and inspector |
| **Teams** | Team cards with faces, how they share (Fair turns, Some get more, Fewest meetings first, First free rep), Deal 20 leads; the reps table (status, this week, follow-up) with Away, Covers for them and limits in a side sheet | Queues and Reps |
| **Regions** | Named places by country, state or zip; which rules use each; drawn on a small map | Territories |
| **Company types** | Named kinds by size, industry, funding or any field; which rules use each | New |
| **Handoffs** | Book a meeting for a teammate from a lead; who handed what to whom; Slack `/book` and the extension (M4) | New |
| **History** | Every lead routed and why, saved views, follow-up pills | Log |
| **Needs review** | Looks like junk, No rep found | Held |

Saved setups (versions), Alerts (Slack) and Follow-up time live in Overview's ⋯ menu and the setup flow, so the
sidebar stays at eight items.

---

## Part 6. Scheduling, after Calendly

### 6.1 What Calendly does, and where we stand

Read from Calendly's app (Scheduling with Event types, Callie, Single-use links, Meeting polls and Routing forms;
Calendar; Notetaker; Contacts; Payments; Automations) and its event type sheet.

| Calendly | Claritia today | Plan |
|---|---|---|
| Event types, grouped by person with "View landing page" | Meeting types list | Grouped by person and by team, landing page link per group (6.2) |
| One-on-one, Group, Collective, Round robin | One, Group, Collective, Round robin, Owner first, Two teams | Keep; name them in plain words (6.3) |
| Event type side sheet with folding sections and summaries | Full-page editor with blocks | Side sheet with folding sections, live preview (6.3) |
| Limits and buffers | Notice, window, buffers, per day, per week | Same, in "Limits and buffers" |
| Free/busy rules ("book over selected meetings") | Busy calendars per account | Add: "Let guests book over" a list of calendar event words, like "Hold" or "Focus" |
| Booking page options (URL, increments, time zone) | Slug, step | Add: time zone shown fixed or detected, 12/24 h |
| Invitee form | Questions | Questions that map to contact fields (already), plus "prefill from the contact" |
| Notifications and automations | Reminders per type, no-show follow-up | A Reminders page with templates, emails and texts (6.6) |
| Confirmation page (show page or redirect) | Confirmation message or redirect | Same, plus "show next steps" (a page, a file, a second booking) |
| Manage availability | My calendar (Settings), Team calendars (Settings) | Availability page with named schedules (6.4) |
| Single-use links | Single-use links (dialog) | Links and polls page (6.5) |
| Meeting polls | Polls (dialog) | Links and polls page |
| One-off meetings | One-off links | Links and polls page |
| Routing forms | Forms with Book a meeting and the router | Booking forms page (6.5) |
| Callie, the AI that answers scheduling emails | — | AI scheduler, later (6.7) |
| Notetaker | — | Notetaker, later (6.7) |
| Contacts | CRM Contacts (richer) | Already better: every guest is a contact with company and deal |
| Payments | Stripe Connect, paid types | Payments page under Scheduling |
| Calendar (all meetings) | Meetings list | CRM › Meetings rebuilt (3.1) |
| Copy link, ⋯ menu, checkbox per type | Copy link | Card pattern (Part 2.3) |
| "Saved" toast | Toast | Saved pill at the top |
| Get started bar | — | Get started card (1.4) |

### 6.2 Meeting types

- Grouped: **Mine**, then each **team** and each teammate (owners see all). Each group heading has the person's face,
  **View booking page** and a ⋯ menu (copy page link, embed, turn all off).
- Each type is a card: colored left bar (its color, picked from the brand washes), name, a summary line
  ("30 min · Google Meet · Round robin · 3 hosts"), the hours in words ("Weekdays, 9:00 to 17:00"), **Copy link**,
  open booking page, ⋯ (edit, copy, single-use link, embed, turn off, delete).
- A switch on the card turns a type on or off in place.
- Search, and filters for kind and host.
- Stat line above the list: "12 meetings booked from these types this week, 2 no-shows".

### 6.3 The meeting type sheet

The editor becomes a side sheet with folding sections in Calendly's order, each with a summary line when folded:

| Section | Summary when folded | Holds |
|---|---|---|
| Name and kind | "30 Minute Meeting · One host" | Name, color, kind in plain words: **One person**, **Take turns** (round robin), **Everyone attends** (collective), **Lead's owner first**, **Group event**, **Two teams** |
| Hosts | "Lee, Ana, Raj · fair turns" | Hosts with faces, weights, the routing link for Lead's owner first |
| Length and where | "30 min · Google Meet" | Lengths, location (video, phone, place, ask the guest) |
| When people can book | "Weekdays 9:00 to 17:00 · Lee's schedule" | Which schedule (6.4), date range, time steps |
| Limits and buffers | "15 min after · 4 a day" | Notice, window, buffers, per day and week |
| Free/busy rules | "Busy from 2 calendars" | Which calendars count, events guests can book over |
| Booking page | "/intro · 30 min steps · guest's time zone" | Slug, time zone display, secret, embed |
| Questions | "Name, email, +2 questions" | Questions mapped to fields, prefill from contact, qualify (send some answers to a different type or a page) |
| Reminders and follow-ups | "Email 1 day and 1 hour before" | Picks from the Reminders page templates |
| After booking | "Show confirmation" | Confirmation page or redirect, next steps, no-show follow-up |
| Payment | "Free" or "$150 before booking" | Price, refund window |
| Managed | "Locked: length, location" | For owners: lock settings and give the type to people |

- The right half of the screen shows the real booking page as it updates (today's live preview), so the sheet and
  the page are side by side; **Preview** opens it full size as a guest sees it.
- **Save changes** and the Saved pill; leaving with unsaved changes asks with `askConfirm`.

### 6.4 Availability

One page for everything about when people are free (Calendly's "Manage availability"), with tabs:

| Tab | Holds |
|---|---|
| **Schedules** | Named weekly schedules ("Working hours", "Demo hours", "Fridays only"), one marked default per person; each with weekly ranges, date overrides and public holidays by country. A meeting type picks a schedule (today each person has one; this adds a `schedule_id` to types and an `availability_schedules` table) |
| **Calendars** | Connected Google, Microsoft and Zoom accounts, which calendars count as busy, which gets new events, Reconnect (today's My calendar) |
| **Team** | Everyone's week side by side with busy blocks and free hours, to see who can take what (today's Team calendars) |
| **Days off** | Out-of-office dates, shared with Routing's Away so one entry covers both |

### 6.5 Links and polls, Booking forms

**Links and polls** lists every single-use link, one-off meeting and poll with state pills (Waiting, Booked, Expired,
Voting), who it's for, and **Copy link**. Polls show votes per time and **Book the winner**. Create from the page
or from Create.

**Booking forms** is Calendly's Routing forms done with our forms and router: the list of forms that end in a
booking, each showing its path in one line ("Demo request → qualify → Lead's owner first: Intro call"), its booked
rate this week, and **Open in Forms**. **New booking form** starts the form studio from a booking template. The
forms themselves live in Automation › Forms; this page is the scheduling view of them.

### 6.6 Reminders

Calendly's "Notifications and automations", as one page of reusable templates:

- **Before**: confirmation, reminder emails (any time before), reminder texts (later, needs Twilio).
- **After**: thank-you, follow-up with a next booking link, no-show follow-up, "rate the meeting".
- Each template has its subject and text with tokens (guest name, time, join link, host), a preview, and which types
  use it. Types pick templates in their sheet.
- Under the hood these run on the meeting lifecycle jobs (`055_meeting_lifecycle.sql`); templates move from per-type
  settings into a `meeting_templates` table, and Workflows gains "Meeting booked", "Meeting held" and "No-show"
  triggers for anything longer.

### 6.7 Later: AI scheduler and Notetaker

Shown in the sidebar as items with a "Soon" pill, each opening a first screen that says what it will do.

- **AI scheduler** (Callie): a rep copies `schedule@<workspace>.tryclaritia.com` on an email; Claude reads the thread,
  offers times from the rep's schedule, handles "can we move it", and books. Needs inbound email, the step cache and
  careful tests before it ships.
- **Notetaker**: a bot joins Google Meet, Zoom and Teams calls (through a provider such as Recall.ai), Claude writes
  the notes and next steps onto the meeting, the contact and the deal.

### 6.8 Where we go past Calendly

Things Calendly can't do because it has no CRM:

- Every booking is a contact with its company and deal; the meeting shows the deal stage and the routed rep.
- **Lead's owner first**: a known lead books their own rep; a new one goes through Routing.
- **Instant booking in forms**: qualified leads see times right after the form, others don't.
- **Qualify in the questions**: answers can send a guest to a different type or a page.
- **Follow-up time** from Routing covers meetings too: a booked meeting meets it.
- Meeting outcomes (held, no-show) move the deal and feed Routing's "Fewest meetings first".

---

## Part 7. Email, Site, Ads, Settings

- **Email**: Segments, Templates (Workflows moved to Automation; Analytics became Reports › Email, and /analytics
  forwards there).
- **Site**: Pages.
- **Ads** and **Settings** stay. Settings loses Sites, Identity and Account alerts (to Signals) and Calendar, Team
  calendars and Payments (to Scheduling); each old Settings address forwards to its new page.

---

## Part 8. Build order

Each phase ships on its own, with tests and the screens check, and nothing is left half-moved.

| Phase | Days | Work | Done when |
|---|---|---|---|
| 1. Sidebar | 2 | New tree, groups that fold, icon tiles, Create menu, new addresses and every old one forwarding (`MOVED` and tests), ⌘K, Contacts as the first page, Get started card | Every old address in `tests/nav.test.ts` lands on its new page; screens check walks each group in light and dark |
| 2. Pages that move | 2 | Signals (Feed, Visitors, Alerts, Setup) from existing panels; Availability (Calendars, Team) and Payments from Settings; Meeting types to `/scheduling/types` | Settings no longer holds them; nothing lost |
| 3. Meetings | 2 | CRM › Meetings after Calendly's Calendar: whose, presets, All vs Booked in Claritia, day groups, now line, stat cards, meeting as side sheet | A day with Claritia and outside events reads in order |
| 4. Scheduling | 5 | Meeting types grouped cards; the type sheet with folding sections and live preview; named schedules (`availability_schedules`, `schedule_id`) with database tests on a flaky case (a schedule edited while a booking happens); Links and polls page; Booking forms page; Reminders templates (`meeting_templates`) | A type set to "Demo hours" offers only those times, tested in the slot engine and the booking function |
| 5. Routing pages | 12 | `docs/router-ux-v2.md`, built as the eight pages in Part 5 | As in that plan |
| 6. Enrichment | 3 | Overview with field coverage, Providers (Coresignal) with Try a domain, Rules, History | Coverage numbers match the records in tests |
| 7. Later | — | AI scheduler, Notetaker, text reminders | Planned separately with their own cost |

Phases 1 to 4 and 6 are about 14 days; with Routing about 26 days of work.

---

## Part 9. Running cost

Phases 1 to 6 add no new services and no Claude tokens beyond Routing's "Describe it" (`docs/router-ux-v2.md` Part
18). The new tables (schedules, templates) and the "All meetings" view read data already kept.

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Sidebar, Signals, Meetings, Scheduling pages, Enrichment page | $0 | $0 |
| Routing pages, including Claude for "Describe it" | $25 (check) | $120 (check) |
| Coresignal lookups for Enrichment's "Try a domain" (about 100 and 1,000 a month) | $5 (check) | $50 (check) |
| **Added per month, phases 1 to 6** | **about $30** | **about $170** |

Later items, for when they're planned:

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Notetaker: recording provider at about $0.50 an hour (check) for 1,500 and 20,000 meeting hours (3,000 and 40,000 meetings), plus Claude notes at about $0.05 a meeting | about $900 (check) | about $12,000 (check) |
| AI scheduler: inbound email (SES) and Claude, about $0.03 a thread for 2,000 and 30,000 threads | about $60 (check) | about $900 (check) |
| Text reminders (Twilio, about $0.008 a US text, check) for 5,000 and 60,000 texts | about $40 (check) | about $480 (check) |

---

## Part 10. What changes in CLAUDE.md and the docs

- CLAUDE.md: the sidebar line becomes "CRM (Contacts, Companies, Opportunities, Meetings), Automation (Workflows,
  Forms, Signals, Enrichment), Routing, Scheduling, Reports (Funnel, Speed to lead, Reps, Forms, Email), Email (Segments,
  Templates), Site (Pages), Ads,
  Settings. The app opens on Contacts."
- `docs/brand.md`: sidebar group tiles (sky, clay, sage, butter), the side sheet with folding sections, stat cards.
- `docs/meetings-scheduler.md`: Part 1.9 Screens points here; named schedules and reminder templates added to Data.
- `docs/router-ux-v2.md`: Part 16.1 is replaced by Part 5 here.
- `src/lib/nav.ts` header comment and `docs/marketing-platform.md` sidebar section.

---

## Part 11. What's built

Phases 1 to 6 are in the app. Run `supabase/migrations/066_app_structure.sql` after 065.

| Phase | Built | Left for later |
|---|---|---|
| 1. Sidebar | The new tree with folding groups and color tiles (`src/components/app/Sidebar.tsx`), the Create menu, ⌘K, Contacts first, Get started (`GetStarted.tsx`), every old address forwarding (`resolveRoute`) | — |
| 2. Pages that move | Signals (Feed, Visitors, Alerts, Setup); Availability (Calendars, Team) and Payments under Scheduling; Settings no longer holds them | — |
| 3. Meetings | CRM › Meetings after Calendly's Calendar (`meetings/Calendar.tsx`): whose, search, presets and a picked day, All vs Booked in Claritia, stat cards, day groups, now line, outside busy times (`meeting_calendar_busy`) | Meeting as a side sheet (opens as a page) |
| 4. Scheduling | Grouped type cards with on and off, Copy link and bulk actions; named schedules (`availability_schedules`, picked by name on each type) with database tests for a schedule edited during a booking; Availability tabs (Schedules, Calendars, Team, Days off); Links and polls; Booking forms; Reminders per type with "Use on all types" | The type sheet with live preview (the editor stays a full page); reminder templates (`meeting_templates`) |
| 5. Routing pages | Overview with status, Pause routing, Read it back and stat cards; Rules (the editor with plain words and joining lines); Teams with Deal 20 leads; Regions; Company types (worked out before the rules); History; Needs review; Handoffs marked Soon | See `docs/router-ux-v2.md` Part 19 |
| 6. Enrichment | Overview with field coverage, Providers with Try a domain (owners, Coresignal, company cache first), History | Rules tab |

Running cost of what's built: Coresignal lookups for Try a domain, about $5 (check) at Beta and $50 (check) at Growth a
month. No Claude tokens and no new services. "Describe it" is not built, so its $25 and $120 (check) are not spent yet.

