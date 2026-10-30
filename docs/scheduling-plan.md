# Scheduling plan

Calendar (the sidebar item for scheduling) works like Scoring and Routing. On the first visit, the assistant reads
what the team already has and builds the whole setup: meeting types, hours, reminders and a booking page. Nobody
answers questions first. People then change what they want, by hand or by typing to the assistant in the box at the
bottom. There are no suggestion buttons.

Two parts are built now:

- **Booking page:** a Calendly-style page for each person and for the team, at `tryclaritia.com/booking/<name>`. The
  address follows the site's domain (`SITE_HOST`), so it becomes `claritia.com/booking/<name>` when the site moves.
- **Webhooks:** every meeting change goes out as a signed POST, so any tool can act on it.

## Part 1. What we have now

- **Meeting types, availability, links and polls, reminders, payments:** all built (`docs/meetings-scheduler.md`).
- **Public pages:** `/book/<workspace>` for the team and `/book/<workspace>/<type or person>`, with the brand kit's look.
- **Profile:** name, headline, photo and link name sat in a panel inside Availability. It now lives on the Booking page.
- **Webhooks:** forms can send a signed POST for each fill. Meetings send nothing out.

What's missing:
- A new team starts from empty lists and has to set every type and hour by hand.
- The booking link is long and tied to the workspace name.
- Nothing tells outside tools when a meeting is booked, moved or canceled.

## Part 2. The first visit: the assistant builds it

The same pattern as Scoring and Routing: one build screen, no questions, with a picture for each step.

1. **Reads the calendars.** For each person with a connected calendar, the hours they really take meetings over the
   last 8 weeks, their time zone, and how long their meetings usually run.
2. **Reads the team.** Who is in sales (from Routing's team), who owns accounts, and who is new.
3. **Reads the website and forms.** What the company sells and which forms ask for a meeting.
4. **Builds the setup:**
   - An intro call (30 minutes) for each person on their own page.
   - A demo (45 minutes) shared across sales by round robin, on the team page and in the forms that book.
   - Weekly hours per person from step 1, with 10 minutes between meetings and 4 hours' notice.
   - Reminders 24 hours and 1 hour before, and a follow-up after a no-show.
   - A booking page for each person and one for the team, each with a short name that's free.
5. **Shows what it made,** one item at a time, then "Open Calendar".

With no calendar connected, it uses 9 to 5 on weekdays in the person's time zone and says so on the type.

After the first visit, Meeting types opens with the assistant's box at the bottom. People type what they want
("make demos 30 minutes", "Sam is out Fridays"). The assistant changes the setup through the same checked saves as
the screens, lists what it changed, and keeps undo. It never sends or cancels a meeting.

## Part 3. The screens

Calendar keeps its sidebar item. Its tabs:

| Tab | Holds |
| --- | --- |
| Meeting types | The list and one type's editor, with the assistant's box at the bottom |
| Booking page | Your page and the team page: name, link, photo, headline, which types show, a live preview |
| Availability | Schedules, calendars, team and days off |
| Links and polls | One-off links, single-use links and polls |
| Reminders | The emails before and after meetings |
| Payments | Stripe for paid types |
| Webhooks | Addresses that get meeting changes, with each one's sends |

## Part 4. Booking page (built now)

### 4.1 The addresses

- `tryclaritia.com/booking/<handle>`: a person's page with their public types as cards, or the team page when the
  handle is the team's.
- `tryclaritia.com/booking/<handle>/<type>`: the booking calendar for one type. Secret types work here too, since the
  address is the secret.
- Handles are short names, unique across all of Claritia: 3 to 40 lowercase letters, numbers and dashes. A few words
  are kept for the app (`api`, `m`, `p`, `l`, `embed`, `admin` and others).
- The team's handle is the workspace's booking name. Each person picks their own.
- The pages also answer on the app's address. Every old `/book/...` link keeps working.

### 4.2 The tab

- **Your page:** handle (with a check that it's free as you type), name, headline and photo. Each of your types has a
  switch for showing on the page. Copy link.
- **Team page:** the team handle (owners change it) and the team types with the same switches.
- **Preview:** the real page beside the settings, in a frame, at desktop or phone width. It reloads after each save.

## Part 5. Webhooks (built now)

### 5.1 Events

| Event | When |
| --- | --- |
| `meeting.booked` | A guest books, a host books for someone, or a paid booking is paid |
| `meeting.rescheduled` | The meeting moves to a new time or new hosts |
| `meeting.canceled` | The guest or a host cancels, or a payment runs out of time |
| `meeting.held` | The host marks it held, or 24 hours pass with no mark |
| `meeting.no_show` | The host marks a no-show |

### 5.2 What gets sent

A POST with JSON:

```json
{
  "id": "evt_1842",
  "event": "meeting.booked",
  "created_at": "2026-10-29T15:02:11Z",
  "workspace_id": "…",
  "test": false,
  "data": {
    "meeting": {
      "id": "…", "status": "booked", "start_time": "…", "end_time": "…", "guest_timezone": "America/New_York",
      "source": "page", "type": { "id": "…", "name": "Demo", "slug": "demo", "kind": "round_robin" },
      "hosts": [{ "id": "…", "name": "Sam Lee", "email": "sam@acme.io", "timezone": "America/Chicago" }],
      "guest": { "name": "Ada Park", "email": "ada@globex.com", "contact_id": "…" },
      "answers": { "company_size": "50-200" }, "location": { "kind": "google_meet", "url": "https://meet…" },
      "submission_id": "…", "cancel_reason": null, "rescheduled_from": null,
      "manage_url": "https://app.tryclaritia.com/book/m/…"
    }
  }
}
```

Headers:
- `x-claritia-event`: the event name.
- `x-claritia-delivery`: the send's id. It stays the same on every retry.
- `x-claritia-signature`: `t=<unix seconds>,v1=<HMAC-SHA256 of "<t>.<body>">` with the endpoint's secret. This is
  the same scheme as form webhooks.

### 5.3 How sending works

- The event and its sends are written in the same database step as the meeting change. A change can't happen
  without its webhook being queued.
- Each send is a job on the jobs queue. A 2xx answer is done. A timeout (15 seconds), a 408, 429 or 5xx tries again
  after 1, 5 and 30 minutes, then 2 and 6 hours, up to 8 tries. A 429's `Retry-After` is followed.
- A redirect, any other 4xx, an `http://` address or a private network address fails at once with the reason.
- The body is saved with the send, so every retry sends the same bytes with the same id. Receivers drop repeats by
  `id`.
- **The tab:** add an address, pick events, and copy the secret, which is shown once. "Send test" sends a sample
  right away and shows the answer. Each endpoint lists its last 50 sends with status, answer code and "Send again".
  Endpoints can be paused, have their secret rolled, or be deleted. Owners manage them; up to 10 per workspace.

## Part 6. Data

- `booking_profiles.handle`: the person's handle, unique across Claritia. `booking_handle_set` claims one under a lock
  and refuses a handle any person or team already uses. `booking_resolve` turns a handle into the workspace and
  person for the pages.
- `webhook_endpoints`: workspace, the address's host (safe to show), the sealed address and secret, events, paused,
  last success and last failure.
- `webhook_deliveries`: endpoint, event, the meeting event it came from (unique per endpoint, so it's sent once),
  the saved body, status, tries, answer code and error.
- A trigger on `meeting_events` writes the sends and queues their jobs.

## Part 7. Reliability

- Webhook sends are tested on flaky cases: a 503 then a 200, a timeout, a 429 with `Retry-After`, a failure on the
  last try, a private address and a redirect.
- Sends never block a booking: if the webhook side fails, the meeting still books and the send waits in the queue.
- Handles are claimed under a lock, so two people can't take the same one.

## Part 8. Build order

1. Booking page and webhooks, with the profile moved from Availability to the Booking page (this change).
2. The build screen and the assistant on Meeting types (Part 2).

## Part 9. Running cost

- **Booking page:** the pages run on the current app servers. $0.
- **Webhooks:** sends run on the current worker. A team has about 40 meetings and about 100 meeting changes a month,
  so sends and their saved bodies stay small inside the database plan (check).
- **First-visit build:** about 20,000 tokens in and 3,000 out, about $0.10 per team once on Claude Sonnet 5.5 (check).
  About 10% of teams are new each month.
- **The assistant on Meeting types:** about 8,000 tokens in and 1,000 out per change, about $0.04 (check). About 10
  changes per team a month, about $0.40.

| Item | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Booking page | $0 | $0 |
| Webhooks: worker time and storage | $0 (current worker, inside plan) | $0 (current worker, inside plan, check) |
| Claude, first-visit builds for new teams (check) | $1 (check) | $5 (check) |
| Claude, assistant changes (check) | $20 (check) | $200 (check) |
| **Total** | **about $21 a month (check)** | **about $205 a month (check)** |

What this change adds now (booking page and webhooks): $0 at both stages.

## Part 10. A shorter meeting type editor (next)

Today the editor is one long column of 25 settings in 8 sections. Most people only change the name, the length and
the place. Connecting a calendar sits three clicks away, at Calendar → Availability → Calendars.

### 10.1 The editor

- **Always shown:** Name, Length (the pills), Location and Host. These four fit without scrolling.
- **Everything else is one line each,** in plain words, and opens in place when clicked. One opens at a time.

| Line | Says, for example | Opens to |
| --- | --- | --- |
| Times | "Working hours, 4 h notice, up to 14 days ahead" | Schedule, notice, window |
| Limits | "No buffers, no daily cap" | Buffer before and after on one row, per day and per week on one row |
| Questions | "Name, email and 1 question" | The questions |
| Reminders | "1 day and 1 hour before" | The reminders |
| After booking | "Shows a message, no-show follow-up on" | Message or page, follow-up |
| Price | "Free" | Price and currency |
| Who can book | "Anyone with the link" | One choice: on your page, link only, or off |

- **Fewer settings:** "Start every" follows the length unless changed under Times. "Secret" and "Bookable" become the
  one "Who can book" choice.
- **Link:** the short public link `tryclaritia.com/booking/<name>/<type>` with Copy. Link names come from the type's
  name (`intro-call`) and never get random endings.

### 10.2 The preview

- The real booking page in a frame that fills the right side, starting at the top, with Desktop and Phone switches.
- It updates as settings change.

### 10.3 Connect first

- **No calendar yet:** the Host line shows "Connect Google Calendar" and "Connect Outlook Calendar" right in the
  editor, and "Connect calendar" is the main button at the top of Calendar until one is connected.
- **First visit:** the build screen starts with the same two buttons, so the hours come from real meetings. "Skip"
  builds with 9 to 5.

### 10.4 Running cost

No new services or AI calls. $0 at Beta (50 teams) and Growth (500 teams).

## Part 11. Calendar as simple as Calendly (plan)

The aim: every Calendar screen fits a 1280 by 800 laptop with nothing to scroll but a list. One list on the left, one
panel on the right, sections closed until opened, one line in each saying what's set. Calendly's event type panel is
the model: its sections (Duration, Location, Limits and buffers, Invitee form, Notifications) each show a one-line
summary, open one at a time, and the panel ends in Preview and Save changes.

### 11.1 Rules for every Calendar screen

1. **No page scroll at 1280 by 800.** The app chrome takes about 140 px; the work area is about 660 px tall. A screen
   that needs more puts it behind a closed section, never below the fold.
2. **One list, one panel.** The list (meeting types, schedules, links) stays where it is; clicking a row opens a 400 px
   panel on the right that slides in (220 ms, ease-out) over the list's right side. The list never reloads.
3. **Sections, closed by default.** Each section is a 56 px row: a title, one gray line saying what's set ("30 min",
   "Google Meet", "Weekdays, 9:00 to 17:00"), and a chevron. Only one opens at a time; opening one closes the last.
4. **One primary button per screen.** In a panel it's Save changes in a footer pinned to the panel's bottom, with
   Preview beside it. The button is off until something changed; leaving with changes asks once.
5. **Connect your calendar is a slim banner.** One 52 px line across the top of the work area, never a card inside a
   narrow column (that's what broke the Booking page: the card's words wrapped one per line). It shows the reason and
   Google Calendar and Outlook buttons, and goes away when a calendar is connected.
6. **You and Team.** Meeting types, Availability and Booking page each open on You. Team holds the shared types and
   everyone else's. The switch is a pill pair at the top left of the list.
7. **Plain words, short lines.** No help text on working screens; a summary line is at most 48 characters.

### 11.2 Meeting types

- **Top row:** You | Team on the left, the search box, and on the right "0 booked this week". The Any kind filter goes
  (a kind shows as a pill on the row).
- **Row (72 px):** the name; pills for length, place and who takes it; the hours in gray; on the right the on switch,
  Copy link and the more menu. Secret and Managed show as gray pills. No colored bars.
- **Click a row:** the panel opens. Header: the name (edited in place), the kind ("One person"), the more menu (Duplicate,
  Delete). Sections, each with its summary:
  1. Duration: "30 min". Chips 15, 30, 45, 60, Other; more than one picked lets guests choose.
  2. Location: "Google Meet". Logo chips: Google Meet, Zoom, Phone, In person, Custom link.
  3. Availability: "Weekdays, 9:00 to 17:00". A schedule pick (Working hours, Demo hours, New) and the week in small rows.
  4. Host: "Vincent Nguyen (you)". Hosts and how they take turns.
  5. Limits and buffers: "10 min after, 4 h notice". Before and after, minimum notice, daily limit, how far ahead.
  6. Booking questions: "Name, email, 1 more". Questions in order, add, require.
  7. Notifications: "Confirmation, 2 reminders". Links to Reminders for the rest.
  8. Confirmation page: "Message" or "Redirect to acme.com".
  9. Payment: "Off" or "$100, Stripe".
- **Footer:** Preview (opens the booking page for this type in a new tab) and Save changes.
- **New meeting type:** opens the same panel with Duration and Location open and a name typed; nothing else to fill.

### 11.3 Booking page tab (the screen that scrolled)

What it is: the page people land on at tryclaritia.com/booking/<handle>, shown as it is, with the few things that change
it in the panel on the right.

**Layout at 1280 by 800**
- Work area 1080 by 660 (sidebar 200 px).
- **Left, the preview (about 660 px wide):** a slim bar with the address in mono, Copy and Open, and Desktop | Phone.
  Under it the real page drawn at a scale that fits the height, so the whole page shows without scrolling (Desktop
  scales to fit; Phone shows a 390 px frame at full size).
- **Right, the panel (400 px):** You | Team at the top, then closed sections, then the footer.

**Sections (one open at a time, summaries in gray)**
1. **Link** — "tryclaritia.com/booking/vincent". Open: the handle box with the fixed part in gray, a live check (a green
   check when it's free, "Taken" in red when it isn't, checked 400 ms after typing stops), and Copy. Changing it warns
   once that old links keep working for 90 days (they redirect).
2. **Profile** — "Vincent Nguyen, Founder of Perceptric". Open: the photo as a 64 px circle you click or drop onto
   (upload, crop to a circle, no URL box), Name, Headline. Initials show until a photo is added.
3. **Meetings shown** — "1 of 2 shown". Open: each type with its switch and a drag handle for the order. Two with the
   same name show their address under the name, so they can be told apart, and a Rename link.
4. **Welcome line** — "None" or its first words. Open: one line, 140 characters at most, shown under the headline.
5. **Look** — "Claritia" or "Your brand kit". Open: Claritia's look or the brand kit (logo, color, font), and Show
   Booked with Claritia (on; off on paid plans).

**Footer (pinned):** "Saved" in gray when nothing changed; otherwise Discard and Save changes. Save updates the preview
at once; the public page follows in a few seconds.

**States**
- No calendar: the banner at the top (11.1 rule 5); the preview shows "No open times yet" on the type cards' calendar.
- No meetings shown: the preview shows "Nothing to book yet" and the Meetings shown section opens.
- Handle taken or bad: the Link section opens with the reason; Save stays off.
- Team page without a team handle: the Link section asks for one first.

**Phone width:** the preview hides behind a Preview button; the panel takes the width.

### 11.4 The public booking page (what guests see)

Fits a laptop screen with no page scroll; only the list of times scrolls inside its own column.

- One card, 1000 px wide at most, 600 px tall, centered, on Claritia's gray (or the brand kit's background).
- **Left (300 px):** the host's photo and name, the meeting name as a two-tone title with the length in mono above it,
  place and length, the welcome line. When a time is picked, a green box shows it.
- **Middle:** "Pick a time", the length pills if there are several, the month with Monday first, open days filled with
  a green dot, today marked, the arrows, and the time zone at the bottom with 12h | 24h.
- **Right (220 px, appears when a day is picked, 220 ms slide):** the day's name, then the times grouped Morning,
  Afternoon and Evening, each a pill; the picked one splits into the time and Next. Only this column scrolls.
- The first day with times opens by itself, so guests never land on an empty month; a month with none shows "Next open
  day" in its place.
- **Details:** the middle and right columns become the form (Change time, name and email side by side, questions,
  Confirm booking). **Booked:** the check, the summary card with the corner brackets, Add to calendar (Google,
  Outlook), Reschedule and Cancel.
- **Phone:** one column, the info folded to one line at the top (photo, name, length), the month, then the times.

### 11.5 Availability

- You | Team. **You** has three parts side by side at 1280 px: Schedules (the list: Working hours, Demo hours, New),
  the open schedule's week (each day a row: switch, the times, add), and Calendars (connected accounts, which count as
  busy, where new bookings go). **Date-specific hours** and **Days off** are buttons that open the panel.
- **Team** shows everyone's week as a grid, read only, with each person's name opening their schedule.

### 11.6 Build order

1. The panel parts: Panel, Section (title, summary, open), the pinned footer, and the banner.
2. Meeting types: You | Team (done), the row, the panel with the nine sections; the old editor page goes.
3. Booking page: the scaled preview, the panel with five sections, the photo upload, the handle check.
4. The public page layout of 11.4.
5. Availability.

Each step ships on its own; nothing is half-moved.

### 11.7 Running cost

No new services, jobs or AI calls. Photo uploads go to the existing Supabase storage bucket (under 100 KB each after
resizing in the browser). **$0 more a month at Beta (50 teams) and Growth (500 teams).**

## Part 12. Calendar and Routing as one system (plan)

**The problem.** Routing's teams (queues) rotate leads, and a team meeting type in Calendar has its own host list and its
own round robin. The two can disagree: Routing gives a lead to Sam while the Demo type books them with Ana. There must be
one answer to "who takes this lead".

**The rule: Routing decides who, Calendar decides when.**

### 12.1 Teams live only in Routing
- A team meeting type's Host section picks **A Routing team** ("All reps", "Enterprise AEs") instead of listing hosts.
  Its summary reads "Enterprise AEs, round robin", with Edit in Routing. The kinds become One person, A Routing team
  and Everyone (all hosts join); the old round robin and owner-first kinds map onto A Routing team.
- Routing's team card shows what books it: "Books: Demo, 30 min".

### 12.2 One rotation
- **A routed lead** (a form, an import, the API) sees only the rep Routing picked. This exists today (preferHost).
- **A visitor on a team page** sees every time at least one team member is free (pooled times). On Confirm, Routing
  picks among the members free at that time, with the team's method (round robin, weighted, load balanced) and the
  same counters it uses for every lead, then the meeting books with that rep. The run is recorded like any routing run
  (reason "booking"), so Routing › Leads shows it.
- **A known lead keeps their owner.** When the contact (or its company) already has an owner who is on the team, the
  owner's times show first; the rest of the team only shows when the owner has none in the next 14 days.

### 12.3 One set of hours, one set of days off
- A rep's working hours are their Calendar schedule (Routing already reads them for "only in working hours").
- Days off are set once, in Availability › Days off (or come from an out-of-office in Google or Outlook): Routing skips
  the rep and their times leave every booking page.
- A rep with no calendar connected can't be booked. Routing › Team flags them "Can't take bookings" with Connect, and
  pooled times leave them out.

### 12.4 Meetings count as load
- A booked meeting counts toward the rep's daily and weekly caps, and Load balanced weighs meetings this week, so a rep
  with a full calendar gets fewer new leads.

### 12.5 Rules pick the meeting
- A Routing rule's result can name the meeting to offer: "Company size over 200 → Enterprise AEs, offer Enterprise
  demo (45 min)"; everyone else → All reps, Intro call (30 min). A form that books after the submit uses the rule's
  meeting; a form's own meeting type is the fallback.

### 12.6 Reassigning
- Moving a lead to another rep (Routing › Leads, or the contact's owner) asks once: "Move their upcoming meeting too?"
  Yes moves it to the new rep if they're free at that time, else it offers the new rep's nearest times to the guest by
  email. It never moves a meeting without asking.

### 12.7 What each side shows
- **Calendar:** the Host section with the Routing team, its method and its members (with calendar status).
- **Routing › Team:** each rep's calendar status, hours (from Calendar, with a link), days off, meetings and leads this
  week against their cap, and the meeting types the team books.

### 12.8 Reliability
- No one free at a time: the time doesn't show. Two guests pick the same time: the slot lock books one, the other sees
  fresh times. Routing slow or down at Confirm (over 300 ms or an error): the booking goes to the next member in the
  team's rotation who is free, and a route job records it afterwards with the same key, so the counters stay right.
- Tests prove each on a flaky case: a member who goes busy between showing and confirming, two confirms on one slot,
  the router timing out, an owner with no times, and a rep with a disconnected calendar.

### 12.9 Build order
1. Host: A Routing team on meeting types, mapping the old kinds (migration, both directions read).
2. Pooled times and pick-at-confirm through the router, with the run recorded.
3. Calendar status, hours and days off in Routing › Team; no-calendar reps left out.
4. Meetings in caps and load; rules that name a meeting; Move their upcoming meeting too.

### 12.10 Running cost
No new services, jobs or AI calls; it reads the router and the calendars Claritia already holds. One router call per
team booking, a few milliseconds of database time. **$0 more a month at Beta (50 teams) and Growth (500 teams).**

## Part 13. Fixing where the parts disagree (plan)

Found by tracing one lead through Forms, Routing, Calendar, Emails and the CRM. Part 12 fixes the two rotations; these are
the rest. Each ships with a test on a flaky case.

1. **One "book a meeting" nudge.** A lead who sends a form and doesn't book could get the auto-reply's "Pick a time",
   the meeting "book later" email and the "Form, no meeting" journey. Now: the auto-reply goes 5 minutes after the
   submission and leaves out its booking link when the lead booked meanwhile; the "book later" email doesn't send when a
   live journey starts on "not booked" for that form (or all forms). The journey owns the follow-up.
2. **One alert per channel.** Routing already tells the rep and the Routing Slack channel about each new lead. The
   form's team alert no longer posts to Slack when Routing will (the router is live); its email still goes, for the
   people picked (a manager, say). Settings shows "Routing posts new leads here" beside the switch.
3. **Alerts after routing.** When Routing takes longer than 300 ms the lead is routed by a job a moment later. The alert
   and auto-reply now wait for that job (they read the owner when they send; if the route job hasn't finished they try
   again in 30 seconds, up to 2 minutes, then send without a rep).
4. **One home for each spam rule.** Forms decide what gets in (timer, captcha, free email, sites, hourly limit).
   Routing's spam step skips the checks a form already made for that lead (free email, too many fills) and keeps its own
   (throwaway email, fake name) for leads from anywhere. Routing's settings say "Forms check free email and fill limits
   for form leads".
5. **No second routing.** A workflow's Route step does nothing for a lead Routing already routed in the last 10 minutes
   (it says "Already routed" in the run), so a form trigger can't change the owner twice.
6. **The right booking link.** The auto-reply's link goes to the meeting the lead was offered: the rule's meeting
   (Part 12.5), else the form's meeting type, else the rep's page, always for the routed rep (/booking/sam/demo).
7. **CRM owner changes.** When the owner changes in the CRM, Claritia updates the lead's owner; their upcoming meeting
   stays where it is and the new owner gets a task: "Take over Maya Chen's Demo on Tue, Nov 3?". Nothing moves on its own.

Running cost: $0 more a month at Beta (50 teams) and Growth (500 teams); one more job per form submission at most.
