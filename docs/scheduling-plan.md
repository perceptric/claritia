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

## Part 10. Making Calendar shorter (next)

Today Calendar has 7 tabs, and Availability has 4 more inside it. Connecting a calendar sits at Calendar →
Availability → Calendars, so people can't find it. The fix is fewer places and connecting first.

### 10.1 Connect first

- **First visit:** the first step of the build screen is two buttons, "Connect Google Calendar" and "Connect Outlook
  Calendar". The assistant builds after the calendar is in, so the hours come from real meetings. "Skip" builds with
  9 to 5.
- **No calendar yet:** "Connect calendar" is the one primary button in Calendar's header on every tab until one is
  connected. After that, the header shows the connected account as a small pill.
- **Booking page:** a page with no calendar shows "Connect calendar" in place of the preview, since guests could book
  over busy times.

### 10.2 Three tabs

| Tab | Holds | Comes from |
| --- | --- | --- |
| Meeting types | The types, and each type's editor with its reminders. A "Links" switch shows single-use links, one-off meetings and polls. | Meeting types, Reminders, Links and polls |
| Booking page | Your page and the team page, as now | Booking page |
| Availability | One page: connected calendars at the top, then weekly hours, then days off. Owners get a "Team" switch to see everyone's week. | Availability's 4 inner tabs |

- **Payments** moves to Settings → Payments, next to billing.
- **Webhooks** moves to Settings → Developers, next to API keys.
- Old addresses forward: `scheduling/links` to Meeting types with Links on, `scheduling/reminders` to Meeting types,
  `scheduling/availability/calendars` and the other inner tabs to Availability, `scheduling/payments` and
  `scheduling/webhooks` to their Settings pages.

### 10.3 Shorter links

- The copied link stays `tryclaritia.com/booking/<name>`, and the site sends it on to the app (done).
- Handles suggest the first name alone when it's free (`maya`), then the full name (`maya-chen`).

### 10.4 Running cost

No new services or AI calls. $0 at Beta (50 teams) and Growth (500 teams).
