# Meetings M1 and M2: the scheduler and instant booking

Status: built. This is the detail for M1 and M2 in `docs/meetings-plan.md`, plus everything Calendly does as a
booking calendar on its own (1.8b). Production setup (calendar apps, Stripe, secrets) and the running cost as built
are in `docs/meetings-setup.md`. What's left is listed at the end.

**M1:** reps connect Google or Microsoft in one click and set their hours, buffers and caps. Meeting types book one
rep, a round robin, all hosts or the owner first. Leads get booking pages, reminders, reschedule and cancel links, and
reps mark no-shows.

**M2:** the moment a form is sent, the routed rep's open times show inside the form in under a second. It works on
Claritia forms and on the team's own HubSpot, Webflow, Marketo, Framer and HTML forms. A lead who leaves without
booking gets an email with the same rep's times.

---

## Part 1. Calendars (M1)

### 1.1 Connecting

| Provider | Sign-in | Scopes | Gives |
| --- | --- | --- | --- |
| Google | OAuth, "Connect Google Calendar" | `calendar.events`, `calendar.readonly`, `userinfo.email` | Busy times on every calendar picked, events written to one, Google Meet links |
| Microsoft 365 | OAuth (Entra ID), "Connect Outlook Calendar" | `Calendars.ReadWrite`, `User.Read`, `offline_access` | The same, Teams links |
| Zoom | OAuth, "Connect Zoom" | `meeting:write` | Zoom links on events, and later attendance for no-shows |

- Calendars are per person, not per workspace. They live in a new `calendar_accounts` table, with tokens sealed as
  source tokens are (`src/lib/seal.ts`). The OAuth flow reuses `src/lib/sources/oauth.ts` with three more entries.
- A rep picks which calendars count as busy (work, personal, shared) and which one gets new events.
- If a token stops working, the rep's status turns to "Reconnect". They drop out of every pool until they do, and get
  one email and one in-app note.
- Event titles and attendees from the rep's calendar are never stored, only busy start and end times.

### 1.2 Availability

- **Weekly hours** per rep in their time zone, several ranges a day (e.g. 9 to 12 and 13 to 17).
- **Date overrides:** a day off or different hours on one date.
- **Out of office:** events the calendar marks as out of office block the whole span.
- **Holidays:** a country's public holidays can be turned on per rep.

### 1.3 Busy times, fast and fresh

- **Cache:** busy blocks for the next 60 days are kept in `busy_blocks` (rep, calendar, start, end). Slots are worked
  out from the cache, so showing times never waits on Google or Microsoft.
- **Push:** Google `events.watch` and Graph subscriptions call `/api/calendar/hook`, which queues a refresh job for that
  calendar. Channels renew before they expire.
- **Safety net:** every connected calendar also refreshes every 10 minutes through the jobs queue.
- **Live check before booking:** when a lead picks a time, the server asks Google or Microsoft free/busy for that one
  slot before writing anything. A conflict the cache missed is caught there.

### 1.4 Meeting types

| Setting | Values |
| --- | --- |
| Kind | One person; Round robin; Collective (everyone free); Owner first (the contact's owner, else the pool); Double round robin (one from pool A and one from pool B) |
| Hosts | People, each with a weight (1 to 10) and a priority tier for round robin |
| Round robin mode | Flexible: show every free rep's times and pick the most due among those free at the chosen time. Strict: show only the next rep in line. |
| Lengths | One or more (15, 30, 45, 60 or custom); the lead picks |
| Location | Google Meet, Teams, Zoom, phone (the lead's or the rep's), in person, or a custom link |
| Buffers | Before and after, in minutes |
| Notice | The earliest a meeting can start, e.g. 4 hours from now |
| Window | How far ahead to book, e.g. 14 days |
| Caps | Meetings a day and a week per rep, for this type and across all types |
| Start times | Every 15, 30 or 60 minutes, or on the hour |
| Questions | Extra questions on the booking page (the form studio's fields), skipped when the form already asked |
| Reschedule | Same host only, or anyone in the pool |
| Reminders | Email 24 hours and 1 hour before by default; add, change or remove |
| Confirmation | A message or a page to open after booking |

### 1.5 Picking the host (round robin)

- Each type keeps a count per host of meetings booked in a rolling 30 days (`rr_counts`).
- **Flexible:** among the hosts free at the chosen time, pick the lowest (count + 1) ÷ weight. Ties go to the higher
  priority tier, then the host booked least recently.
- **Strict:** the next host is fixed when times are shown, and only that host's times appear.
- Cancellations and no-shows give the turn back (the count goes down).
- Caps and out of office remove a host for that time. If no host is free, the lead sees the next free times with any
  host.
- **Owner first:** if the contact has an owner here or in the CRM who hosts this type and is free in the window, only
  their times show. Otherwise the pool's do.

### 1.6 Booking

1. The lead picks a time. The server takes a Postgres advisory lock for each host involved and checks the slot against
   `meetings` and the live free/busy.
2. The meeting row is written: status `booked`, a hashed reschedule and cancel token, and the contact and submission
   linked.
3. The calendar event is created on the host's calendar with the lead as guest and the Meet, Teams or Zoom link. If
   the provider fails, the meeting stays booked, a job retries the event, and the host is told only if it still fails
   after 15 minutes.
4. The lead sees the confirmation and gets an email with an `.ics` file. Reminder jobs are queued.
5. The contact's timeline gets "Meeting booked". The owner is set if the contact had none. CRM sources get the meeting
   on the next push.

### 1.7 After booking

- **Reminders:** jobs queued at booking time and canceled on reschedule or cancel. Sent through the app's sending
  setup (Resend, `docs/lock-in-plan.md` week 1) with a reschedule and a cancel link.
- **Reschedule:** the link opens the booking page for that meeting. The old event is moved, not deleted, so the
  thread stays the same.
- **Cancel:** with an optional reason. The event is canceled on the calendar and the round-robin turn is given back.
- **Meeting status:** booked, rescheduled, canceled, held or no-show. After the end time, the host sees "Held" and
  "No-show" buttons in Meetings and in the reminder-after email. Unmarked meetings turn to held after 24 hours.
  Zoom attendance can set it automatically when Zoom is connected (later).
- **Workflows:** booked, rescheduled, canceled, held and no-show become triggers for M6. Until M6 ships, a no-show can
  send one follow-up email with the host's times.

### 1.8 Booking pages and embeds

- `/book/<workspace>/<type>` for a type and `/book/<workspace>/<person>` for a person's types. Both are public,
  fast and don't need sign-in.
- The look comes from the form's brand kit: font, colors and corners, in light or dark from the site.
- A calendar month on the left and times on the right, which stacks on phones. The lead's time zone is detected and
  can be changed. Lengths are a small pill switch.
- **Embed:** `<claritia-book type="…">` in the same `forms/v1.js` script (one script tag for forms and booking), or a
  popup from any button with `data-claritia-book`.
- **Spam:** Turnstile on the page when the form uses it, plus a cap of booking tries per IP.
- **Branded booking pages (paid plans):** on Starter, Team and Business the page can use the brand's own stylesheet,
  the one Form Studio reads from the site (`brand_kits.studio_css`). Claritia's layout stays: month, Soonest, morning
  and afternoon times, time zone and the details step. The brand's `.btn` styles Next and Book, `.btn-secondary` the
  times, Soonest and outline buttons, `.field` the inputs, `.label` the field names and `.heading` the titles. Its
  colors feed the page's own, so the picked day and focus match; a main color that can't be seen on the brand's
  background is left out. Everything is scoped to the booking root, and Claritia keeps the sizes of times, Next and
  Soonest so a full-width brand button can't break them (`src/lib/meetings/brandPage.ts`,
  `scripts/book-brand-check.ts`). The plan is checked on the server when the page loads (`brandServer.ts`), on
  every booking page: types, the team and person pages, one-off and single-use links, polls and the guest's manage
  page. On Free the page is Claritia's look with "Book with Claritia" on, whatever was saved, so a downgrade falls back
  by itself. Branded forms stay on every plan. Styling shows "Paid plans" and Upgrade on Free, and Read the look when a
  paid brand has no stylesheet yet. Emails keep Claritia's look for now.
  Running cost: one Opus look read per brand (about $0.30, check), cached and shared with Form Studio, plus one small
  read per page view kept 30 s per server. About $5 a month at Beta (50 teams) and $50 at Growth (500 teams).

### 1.8b Calendly parity: the booking calendar on its own

Everything a rep does in Calendly works in Claritia without a form:

| Calendly | Claritia |
| --- | --- |
| Personal page listing your event types | `/book/<workspace>/<person>`: photo, name, a line about them, and their types as cards |
| Team page | `/book/<workspace>`: every public team type |
| Event types: one-on-one, group, collective, round robin | The kinds in 1.4, plus **group** (one host, many guests, a seat limit, e.g. a weekly demo for 20) |
| Secret event types | A type can be hidden from pages and shared only by link |
| One-off meetings | Pick a few times or a range for one person, share a link, and it closes after one booking |
| Single-use links | Any type can make a link that works once (good for an email to one lead) |
| Meeting polls | Offer several times to a group, guests vote, the host books the winner |
| Share times in an email | "Copy times" puts the next free slots as text with booking links in each, for Gmail or Outlook |
| Invitee questions | The form studio's fields on the booking page, with answers saved to the contact |
| Payments | Stripe on paid types: the guest pays to book, refunds on cancel by the host (Stripe fees are the customer's) |
| Routing forms | Our forms and router (M2, M3) |
| Workflows (reminders, follow-ups, thank-you emails) | Reminders in 1.7 now; any step after M6 ships |
| Embeds: inline, popup widget, popup text | `<claritia-book>` inline, a floating button, and `data-claritia-book` on any link |
| Branding | The brand kit: logo, font, colors, corners; "Powered by Claritia" can be hidden on paid plans |
| Calendar connections (up to 6 per person) | Google and Microsoft, several accounts per person, all checked for busy |
| Time zone detection, 12/24-hour, languages | Detected and switchable; English first, then the languages the forms support |
| Contacts and meeting history | The CRM: every booking lands on the contact with its history |
| Admin: managed event types | Owners make a type once and push it to many people; people can't change locked settings |
| Integrations: HubSpot, Salesforce, Zoom, Teams, Slack, Zapier | Built through Sources and the API; Zapier through webhooks |
| Mobile app | Not planned; the pages and the Meetings screen work on phones |

### 1.9 Screens

| Screen | Where | Holds |
| --- | --- | --- |
| Meetings | Sidebar, under CRM | Upcoming and past meetings: lead, company, host, type, time, status pill, source (form, page, handoff). Filters by host, type, status. Held and No-show buttons. |
| Meeting types | Meetings → Types | List of types with their link and kind; the editor with a live booking-page preview beside it |
| My calendar | Profile → Calendar | Connect buttons, which calendars count, weekly hours, overrides, conferencing, status |
| Team calendars | Settings → Calendars | Each person's connection status, hours and caps; owners can edit anyone's |

All screens follow `docs/brand.md`. First screens use `ToolIntro` with a calendar sketch.

**The Meetings section today** (Inbound › Meetings, tabs Meeting types, Upcoming, Availability, Booking page, Links
and polls, Settings):

- **One frame.** Every tab's body starts at the tabs' left edge and runs full width (`TabBody` and `TAB_X` in
  `src/components/app/scheduling/frame.tsx`); Settings pages keep one 720 px reading width. Each tab has at most one
  primary button. Dates use the app's own picker (`DatePick`), never the browser's. `tests/meetingsFrame.test.ts`.
- **Get set up.** Under the tabs until it's done or closed, once per browser: Connect a calendar, Make a meeting
  type, Set your link (`Setup.tsx`). Then the Connect your calendar line takes its place when a calendar needs it.
- **Meeting types.** Cards with length, place logo, host faces, "4 booked this week", a share menu and an on/off
  switch. One-click starters (Intro call 30 min, Demo 45 min, Team round robin) open the new panel already filled in.
- **Upcoming.** Numbers first (booked this week, show rate and no-shows over 30 days, top source), then one row of
  controls: the span, Pick a day, search, filter pills (host, type, status, source, booked in Claritia) and List or
  Week. Times sit on one line; busy times are thin gray rows. A meeting opens in a side panel with its actions; Join
  shows 10 minutes before; J and K move, Enter opens.
- **Availability.** Paint your hours on a half-hour week grid (drag across days and times; keyboard too), or Exact
  times. A health line says how many 30-minute times your page shows next week, amber under 5 or with what's
  missing. Team shows each person's calendar state with Connect, Reconnect or Ask.
- **Booking page.** Styling is a brand picker: Claritia, or any brand imported in Form Studio (logo and name), plus
  Import a brand. Each page saves its own brand (`PageLook.brand`); the server reads the form's brand, then the
  page's, then the workspace's. Accent and button choices are gone, since the brand sets them. The preview switches
  between Page, Meeting, Details, Booked and Reschedule, drawn by the real calendar.
- **Links and polls.** One table with Open or All and search, a New menu (single-use link, one-off meeting, poll), a
  share menu (Copy link, QR code drawn in the browser, Email signature) and a poll grid with Book this time.
- **⌘K.** Copy my booking link and New meeting type.
- **Team members, never reps.** Teams aren't only sales, so every word people read comes from `src/lib/words.ts`:
  team member, owner (the person a contact or company belongs to) or person. Dynamic meetings read "1 team member,
  1 rule, otherwise anyone on Enterprise". The starting team (key `q_everyone`) is "Whole team"; old names move over
  on read and in migration 114, and a team someone renamed keeps its name. `tests/teamWords.test.ts` fails if "rep"
  or "reps" comes back.
- **Availability › Team.** One table of everyone: teams (chips, with + Team), calendar (Connect, Reconnect or Ask),
  hours, today against their cap, and away. The team pills above filter it: members first with who's next in line,
  then everyone not in the team with Add; how the team shares leads (Take turns, Some get more, Fewest meetings first);
  and the meetings and forms that send to it. Turning Away on asks until when (pause or out-of-office dates, in the
  app's own month picker). A new team name too close to one that exists is refused (`src/lib/routing/teamNames.ts`).
  Saving a team keeps its method and every member's weight; before, adding a member reset both
  (`tests/teamSave.test.ts`, with a flaky read).
- **Styling brands.** Your brand (the workspace's own) is pinned next to Claritia; the other brands from Form Studio sit
  under Other brands, searchable past 6. On Free: Claritia, your brand locked, and one line with Upgrade. The summary
  shows the picked brand's logo.
- **Guests.** On a phone, Next sits in a bar at the bottom of the screen. Arrow keys move through the month, Enter
  picks a day, and each day reads out its open times. The thank-you screen shows the host, Google, Outlook and
  Apple (`/api/book/m/<token>?ics=1`), the join link or where to find it, and its own Reschedule and Cancel
  (`?do=move`, `?do=cancel`). A returning guest's name and email are filled in from their own browser.
  `scripts/book-guest-check.ts`, `scripts/book-brand-check.ts`.

Running cost of this work: no new AI calls or paid services. About $0 a month at Beta (50 teams) and $0 at Growth
(500 teams). The QR code library adds about 25 KB to the Links tab, loaded only when a QR code opens.

### 1.10 Data

| Table | Holds |
| --- | --- |
| `calendar_accounts` | user, provider, account email, sealed tokens, status, push channel id and expiry |
| `calendar_lists` | the account's calendars: provider id, name, counts-as-busy, write-here |
| `availability` | user, time zone, weekly hours, date overrides, holiday country |
| `busy_blocks` | calendar, start, end (no titles), refreshed_at |
| `meeting_types` | workspace, slug, kind, hosts with weights and tiers, lengths, location, buffers, notice, window, caps, start step, questions, reschedule policy, reminders, confirmation |
| `meetings` | workspace, type, hosts, contact, submission, start, end, lead time zone, status, location link, provider event ids, token hashes, source |
| `meeting_events` | the history of each meeting: booked, moved, canceled, held, no-show, reminder sent |
| `rr_counts` | type, host, rolling count, last booked |

Row-level security as elsewhere: members read their workspace, and writes go through checked functions. The public
booking page reads through one function that returns slots only (no names beyond the host's display name).

---

## Part 2. Instant booking on form submit (M2)

### 2.1 The flow

| Time | What happens |
| --- | --- |
| 0 ms | The lead presses Send. |
| ~150 ms | The server checks the fill (as today) and saves the contact. |
| ~200 ms | **Who sees the calendar:** the form's match rules (built), then **who hosts:** the contact's owner for owner-first types, else the meeting type's pool. (M3's router replaces this step later and keeps the same contract.) |
| ~300 ms | Slots for the next 14 days are worked out from `busy_blocks`. There are no calls to Google or Microsoft on this path. |
| < 1 s | The response carries a booking token and the slots. The form swaps to the calendar in place, with the host's name and photo. Name and email are already known, so booking is one click. |
| pick | The live free/busy check, the lock and the event (1.6). The confirmation shows in the form. |

- The booking token is signed, lasts 2 hours, and is tied to the submission, the type and the host or pool. Only that
  lead can book with it.
- A form keeps working when no calendar is connected yet: Book a meeting falls back to the outside scheduler, or to
  the message.

### 2.2 In the form studio

- Settings → After submit → Book a meeting gets **Claritia calendar** as the first tile, followed by the outside
  schedulers (Calendly, Cal.com, HubSpot Meetings, SavvyCal), which stay.
- Pick a meeting type, or make one there. Who sees it (Everyone or Only leads that match) and the line above the
  calendar work as now.
- The Settings preview shows the real inline calendar with sample times.

### 2.3 The team's own forms (captured)

- The capture script (`startCapture` in `src/lib/forms/element.ts`) already reads a team's own form when it's sent.
  After the send it calls the same submit and, when the lead matches, opens the calendar in a popup over the page.
- Each form tool has its own success hook: HubSpot `onFormSubmitted`, Marketo `onSuccess`, Webflow's submit and
  success state, Framer's form submit, and plain HTML submit. If the tool sends the lead to a thank-you page, the
  calendar opens on that page from a short-lived token in the address.

### 2.4 Book later

- If the lead saw times but didn't book within 10 minutes (left the page or stopped), a job sends one email: "Pick a
  time with Sam", with the host's next times worked out when it's sent and a link to the booking page for that host.
- The submission is marked **not booked**, the owner is told in the app (and in Slack when connected), and the form's
  Results tab counts it.
- If the lead books from the email, the meeting links to the same submission.

### 2.5 Results

- Form Results shows booked, not booked and booking rate per form, plus the meeting status as it changes.
- The contact's timeline shows the fill, the times shown, and the booking or the not-booked mark.

---

## Part 3. Reliability (the CLAUDE.md rule: routing and booking)

Every item ships with a test that runs on the flaky case:

| Case | What must happen | Test |
| --- | --- | --- |
| Two leads pick the same slot within the same second | One books; the other sees "That time was just taken" and the next free times | Postgres test with two parallel bookings |
| The cache missed a new event on the rep's calendar | The live check catches it, and the lead picks again | Fake provider returning busy |
| The provider fails while creating the event | The meeting stays booked, the retry job creates the event, and nothing is created twice | Fake provider failing then succeeding, with the idempotency key |
| A push notification never arrives | The 10-minute refresh picks up the change | Job test |
| A rep's token is revoked | The rep leaves the pools, the lead sees other hosts' times, and there's never an empty calendar if anyone is free | Unit and Postgres |
| Round robin over 1,000 simulated bookings | Weights hold within 2%; caps and out of office are never broken | Unit |
| Daylight saving changes (US, EU, AU) and a lead in another zone | The right slots, the same instant on both sides | Unit with fixed dates |
| The form is sent twice (retry) | One submission, one booking token | Existing idempotency, extended |
| The lead books from the "book later" email after booking in the form | The second try shows "already booked" with a reschedule link | Postgres |
| The meeting type is changed while a lead is booking | The booking uses the version shown, or asks the lead to pick again if the slot is gone | Unit |
| Two guests take the last seat of a group type at once | One gets the seat; the other sees it full | Postgres test with parallel bookings |
| A single-use or one-off link is opened twice | The second visit says it's used, with the host's page link | Postgres |
| A guest pays and the slot is taken before payment finishes | The slot is held for the 10 minutes of checkout; if it's lost anyway, the payment is refunded at once | Fake Stripe webhook, out of order and repeated |
| A poll's winning time stops being free | The host is told and picks again; no event is created on a busy time | Unit |

`scripts/screens-check.ts` grows a booking run: a fake calendar provider (as the local stack fakes auth), a form
with Claritia calendar, a fill, a pick, and the meeting in Meetings.

---

## Part 4. Build order

| Week | Ships | Done when |
| --- | --- | --- |
| 1 | Google and Microsoft connect, calendar lists, availability, busy-time cache with push and the 10-minute refresh, the slot engine (`src/lib/meetings/slots.ts`) with its tests | A connected rep's free times are right across time zones and daylight saving |
| 2 | Meeting types (one person, round robin, collective, owner first, double round robin), booking with lock and live check, events with Meet, Teams and Zoom, the booking page and embed | A lead books a round robin of three on the page, fairly, with no double booking |
| 3 | Reminders, reschedule, cancel, held and no-show, the Meetings screen, Meeting types editor, My calendar and Team calendars | A meeting is booked, moved, reminded, marked no-show, and the turn comes back |
| 4 | Calendly parity: personal and team pages, group types with seats, secret types, one-off and single-use links, copy times, managed types | A rep shares their page and a one-off link, and both book |
| 5 | Meeting polls and paid types on Stripe | A poll books its winner; a paid type takes payment before it books |
| 6 | Instant booking in Claritia forms and captured forms, book later, not booked, form Results, the screens-check booking run | A form fill shows the routed rep's times in under a second and books in one click |

---

## Part 5. Running cost (M1 and M2 only)

Assumptions: Beta is 50 teams with about 150 meetings each a month (7,500 meetings). Growth is 500 teams with about
200 each (100,000 meetings). About 4 emails per meeting (confirmation, two reminders, after) plus book-later emails.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Google Calendar API and Microsoft Graph (free within quotas) | $0 | $0 |
| Zoom API (free with the team's Zoom account) | $0 | $0 |
| One more small worker for calendar refresh and reminders (Render or Fly) | $25 (check) | $85 (check) |
| Email: about 32,000 a month at Beta and 430,000 at Growth on Resend | $20 (check) | $350 (check) |
| Stripe for paid types (fees are paid by the customer from each payment) | $0 | $0 |
| Polls, one-off links, group types (database only) | $0 | $0 |
| Database: busy blocks, meetings, events (about 1 GB at Growth) | $0 (inside plan) | $25 (check) |
| Claude tokens (none in M1 and M2) | $0 | $0 |
| **Added per month** | **about $45** | **about $460** |

---

## Part 6. Before week 1

1. **Google app verification:** calendar scopes are "sensitive", so Google reviews the app before other companies'
   users can connect. It's free, but it takes days to weeks. Start now with the privacy policy and a demo video
   (check the current steps on Google's verification page).
2. **Microsoft:** register the app in Entra ID as multi-tenant and complete publisher verification (free, check).
3. **Zoom:** a Zoom Marketplace OAuth app (free, check).
4. **Resend** on the sending domain (lock-in plan week 1), since reminders depend on it.
5. **Booking page domain:** `book.tryclaritia.com` (recommended), with the customer's own subdomain later.

---

## Part 7. Built, and what's left

| Built | Where |
| --- | --- |
| Tables, slot engine, round robin, booking with locks and the live check | `supabase/migrations/053_meetings.sql`, `src/lib/meetings/{slots,server,time,check}.ts` |
| Google, Microsoft and Zoom: connect, busy times with pushes and the 10-minute refresh, events with one invite (Claritia's) | `054_calendars.sql`, `src/lib/meetings/providers/`, `worker-intel/jobs/calendars.ts` |
| Emails, reminders, after-meeting links, no-show follow-up, the reconnect email, bounces and complaints | `055_meeting_lifecycle.sql`, `059_calendar_reconnect_mail.sql`, `063_meeting_mail_events.sql`, `worker-intel/jobs/meetings.ts` |
| Instant booking in forms, book later, not booked with a Slack note, form Results | `056_instant_booking.sql`, `062_not_booked_note.sql`, `src/lib/forms/booking.ts` |
| Booking pages, embed, reschedule and cancel, one-off and single-use links, polls, group seats sharing one event, paid types | `057_book_public.sql`, `060_group_seats.sql`, `src/lib/meetings/public.ts`, `src/app/book/` |
| Guests who book become contacts | `061_meeting_contacts.sql` |
| Screens: Meetings, Meeting types, My calendar, Team calendars, Payments | `058_meetings_screens.sql`, `src/components/app/meetings/` |
| The screens-check booking run: a page booking and an in-form booking | `scripts/screens-check.ts` |

Left:

- A one-off link or a poll's meeting can only be canceled by the guest, not moved.
- Captured forms (2.3) open the calendar for HubSpot, Webflow and plain HTML; Marketo and Framer hooks need a test on
  a live site.
- Google app verification and Microsoft publisher verification (Part 6) before other companies can connect.

