# Booking page, round 2

Built 13 November 2026. The guest's booking page (`/booking/<handle>/<type>`, `/book/<workspace>/<type>`, the page
inside a form `/book/f/<token>` and embeds) next to Calendly, Cal.com, SavvyCal and Chili Piper: fixes first, then
the form-to-booked edge, then the guest's own calendar. Code: `src/components/book/`,
`src/lib/meetings/{known,holds,overlay}.ts`, `supabase/migrations/161_booking_page.sql`.

## Part 1. Fixes

- The time zone shows in full as the city and its time now ("New York, 4:43 AM"); the long name is the tooltip.
- Every word is Inter: "30 min", "Soonest" and the day names lost their mono capitals.
- Today is a thin ring, not a dash. The picked day keeps its color under the pointer.
- On phones the day's times sit in two columns, split into morning, afternoon and evening.

## Part 2. The host card

- One host: a 56 px photo, their name and their booking-profile line ("Founder, Perceptric").
- **What we'll cover** (type editor › Description): up to 8 short lines under the description, with green checks.
- The length now sits with the place and the price.
- The meeting type also takes **Before the call** lines, shown on the confirmed screen.

## Part 3. From a form to booked

- **Answers the form already has.** A booking page reached from a form fill (the page inside the form, or a booking
  link with `?ref=`) reads the fill's answers (`fill_answers`) and fills in each meeting question with the same label
  (and the phone for a phone call). An answer that fails the question's own check is left for the guest.
- **Confirm on the time.** When the page knows the guest's name and email (the fill, the link or this browser's last
  booking) and every required answer, the picked time's button says **Confirm** and books in one click. "Booking as
  Lee Park, lee@acme.com" sits above the times with **Change**. Paid types and Turnstile still working go through
  the details step. A booking that comes back with a field error opens the details step with the error.
- **5-minute hold.** Picking a time holds it for that guest (`slot_hold`): it leaves other guests' lists and their
  bookings of it are refused with fresh times. One hold per guest; picking another time moves it; booking releases
  it. Holds fail open: when the database can't answer, the page works as before (the booking's own conflict check
  stays in charge). Group types (several seats) don't hold. A hold is per meeting type, so another type with the same
  host can still book that time; the second booking then gets "That time was just taken" as before.

## Part 4. Both clocks, week view, confirmed screen, dark

- **Both clocks:** when the host's zone (from their hours) reads differently, the picked time and the confirmed
  screen add "4:30 PM for Vincent" (or "for your hosts" when every host shares a zone).
- **Week view:** Month or Week beside "Pick a time". Week shows seven days side by side with every open time; a
  picked time shows Next or Confirm under the week.
- **Confirmed screen:** the check pops with a ring, a "Starts in 3 days" tag that counts down, Before the call, both
  clocks, Add to calendar (Google, Outlook, Apple), Reschedule and Cancel.
- **Dark:** Claritia's own look (no brand kit) follows the guest's dark setting. A brand kit keeps its own colors;
  embeds follow the site around them.
- **Speed:** the first times still come with the page; the form fill's answers are read alongside them, so a page
  from a form is no slower. There's no loading spinner. The guest's zone is still worked out in the browser (the
  times draw once it's known).

## Part 5. Show my calendar

- Under the calendar: **Show my calendar** with Google. A small window signs the guest in with the narrowest read
  (Google `calendar.freebusy`), reads the next 62 days' busy times
  once, hands them to the page that opened it and closes. No token or time is stored.
- Times that clash with the guest's day show dashed with "You're busy"; they can still be picked. **Hide** turns it off.
- The busy times only go to Claritia's own booking addresses: the app, the site, a workspace subdomain or an active
  custom domain. The page only takes them from the window it opened.
- Google only: there's no Microsoft app to sign in with. Setup: the redirect URI and scope in
  `docs/meetings-setup.md` (section 1, step 5). Until then the button
  says "This isn't set up yet."

## Proof

- `tests/bookingPage.test.ts` (form answers, one-click rules, holds failing open when the database errors or throws,
  the phrase reader, the model's answer checks, busy times), `tests/pg/bookingHolds.pg.ts` (holds, eight guests
  racing for one time and exactly one getting it, hosts' zones, form answers).
- `scripts/booking-page-check.ts`: 37 browser checks (desktop, phone, dark). `scripts/book-guest-check.ts`,
  `book-design-check.ts`, `book-brand-check.ts` and `form-bookpage-check.ts` pass.

## Running cost

| Part | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Fixes, host card, week view, confirmed screen, dark, form answers, one click | $0 | $0 |
| Holds (one small table, rows live 5 minutes) | $0 | $0 |
| Show my calendar (Google calendar reads are free) | $0 | $0 |
| **Total a month** | **$0** | **$0** |

A box for plain words ("next Tuesday afternoon") was built and then taken out: it made the page feel crowded.
