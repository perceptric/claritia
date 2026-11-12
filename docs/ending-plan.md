# The Ending, made real: a better thank-you, the real redirect page, the real booking page

Status: built, 12 November 2026. Part 4 on the live form is behind the `FORM_BOOK_PAGE` switch on the server. Covers three things the owner asked for on the Ending page of Form Studio:

1. Every template's thank-you message gets a better layout.
2. With **Redirect**, the canvas shows the page people will land on, fetched and drawn right there.
3. With **Book a meeting**, the form embeds the meeting's own booking page, so everything set in Meetings shows the
   same in the form.

## Part 1. Where things stand

| Part | Today | Where |
|---|---|---|
| Template thank-you | A heading and a line, left-aligned at the top of an empty card | `formToPage` in `src/lib/studio/fromForm.ts` (one place for all 740 templates); `[data-cl-thanks] h2.heading` in `src/lib/studio/styleCss.ts` |
| Redirect in the editor | The line "People go to …" on an empty card | `draw()` in `src/components/app/forms/studio/studio.ts` |
| Redirect on the live form | Goes to the page after the send | `element.ts` |
| Booking in the editor | A small calendar drawn by the Studio: the meeting's name, length and open times | `realCalendar()` in `studio.ts` |
| Booking on the live form | The form draws its own calendar (`CAL_CSS`) with times from the submit reply, booked with the rep Routing picked | `endScreen()` in `src/lib/forms/element.ts`; `claritiaPlan` in `src/lib/forms/schedule.ts` |
| The booking page | The full page in Meetings: the meeting's description, length choices, questions, location, the host, the brand's look, payment, the confirmation page, reschedule and cancel | `/book/[workspace]/[slug]`, `/book/l/[token]` (single-use links); `<claritia-book>` in `src/lib/meetings/bookElement.ts` embeds it in a frame that reports its height |

The form's own calendar and the booking page are two separate things, so a change in Meetings (a question, a
second length, a location, a payment) never reaches a form. That's the gap Part 4 closes.

## Part 2. The thank-you, for all 740 templates

One change in `formToPage` reaches every template, because every template becomes a Studio page there.

The new thank-you:

- Centred in the card, in the middle of its height, with room around it.
- A round check mark in the brand's main color (an inline SVG with the brand's colors, so every theme gets one).
- The template's own heading, then its text.
- With **Book a meeting**, the booking page sits under the text at full width (Part 4), and the block moves to the top
  of the card so the calendar has room.
- The card keeps a minimum height, so a short thank-you never leaves a small card on a big page.

```html
<section data-cl-thanks hidden id="thanks" class="thanks">
  <span class="thanks-mark" aria-hidden="true"><svg …check…/></span>
  <h2 class="heading">Thanks, we got it</h2>
  <p class="text">We'll get back to you within one business day.</p>
  <div data-cl-book id="book"></div>
</section>
```

CSS (in the page CSS from `formToPage`, and in `styleCss` for the 18 styles):
`.thanks{align-items:center;text-align:center;justify-content:center;min-height:320px;gap:14px}`,
`.thanks-mark{width:56px;height:56px;border-radius:999px;background:var(--brand-primary);color:var(--brand-on-primary)}`,
and `.thanks:has([data-cl-book]:not(:empty)){justify-content:flex-start;min-height:0}`.

Also:

- The template text gets a once-over: no "Thanks, we got it." with a full stop as a heading, and no line that repeats
  the heading. A script in `scripts/` lists every template's title and text; we fix the odd ones by hand in the
  template files.
- Forms already made keep the thank-you they have. Tia gets the new pattern in `src/lib/studio/prompts.ts`, so new
  forms Tia builds match.
- `check.ts` warns when the thank-you has no heading.

Tests: `tests/fromForm*.test.ts` checks the new markup on a message ending, a booking ending and a quiz ending.
`scripts/templates-check.ts` renders a sample of templates in each style and fails if the thank-you spills or is cut
off. `tests/overflow.test.ts` keeps passing.

## Part 3. Redirect: the real page, on the canvas

When the Ending is **Redirect** and has an address, the canvas shows that page, drawn the way the brand step already
draws a brand's home page (`previewHtml` in `src/lib/studio/site.ts`: the page with its scripts taken out, in a frame
that runs nothing).

- A new operation on `/api/studio`, `page { url }`, fetches the page on the server and returns its preview HTML, or its
  share picture when the page draws nothing without its scripts. It refuses private and local addresses
  (`hostIsPrivate`), stops after 8 seconds and 2 MB, and keeps the result for 10 minutes per address.
- The canvas shows it in a sandboxed frame at desktop width, scaled to the frame, with a thin bar on top showing the
  address and an "Open" link. The phone and tablet buttons switch the frame's width.
- When the page can't be read (blocked, too big, an error), the canvas shows the address, the site's share picture
  when there is one, and "Open" (one short line, no explanation).
- Preview shows the same frame after Submit, so the owner sees the whole journey.
- The live form keeps redirecting as it does now.

Tests: the API refuses `http://localhost`, `http://10.0.0.1` and a host that resolves to a private address; a page
over 2 MB returns the share picture; a timeout returns the "can't read" state. The browser check sets an address and
sees the frame.

## Part 4. Book a meeting: the meeting's own booking page, embedded

### In the editor

The Ending canvas embeds the meeting type's real booking page, `/book/<workspace>/<slug>?embed=1&preview=1`, under
the thank-you text, in the same frame `<claritia-book>` uses (it reports its height, so the frame grows to fit).

- What the owner sees is what Meetings has: the description, length choices, questions, location, host, the brand's
  look on paid plans and the plain look on Free.
- `preview=1` is new on the booking page: everything works up to the last step, and Book shows "Preview only:
  nothing was booked" in place of making a booking.
- **Individual**: the picked meeting's page.
- **Team meeting**: Preview as picks the rule; the frame shows that rule's meeting, and the host the rule names when
  it names one (`host=` on the page address).
- **Edit meeting** opens the meeting in Meetings; coming back to the Studio reloads the frame, so the change shows.
- Outside schedulers (Calendly, Cal.com, HubSpot, SavvyCal) keep their frame as now.

### On the live form

After the send, the form shows the meeting's booking page in a frame under the thank-you:
`https://app.tryclaritia.com/book/f/<token>?embed=1` (`src/app/book/f/[token]/page.tsx`, `src/lib/forms/bookPage.ts`).

- **The token is the form's own booking token** (`signBooking` in `src/lib/forms/booking.ts`): the fill, the meeting
  type, Routing's rep and two hours from when the times were first shown. Nothing new is written at the send, so a
  retried send gets the same token and the same address.
- **The page** is the type's booking page (description, lengths, questions, location, the brand's look on paid plans)
  with Routing's rep as its one host. Its times and its Book go through `/api/book/f/<token>`, which uses the same code
  as the form's own calendar (`timesForClaim`, `bookForClaim`): the live free/busy check, the meeting booked with that
  rep alone, joined to the fill and its contact, one meeting per fill (a second booking gets the first one back). The
  name and email are the fill's; the type's questions are checked as on any booking page and kept on the meeting. No
  payment, as with the form's own calendar.
- **The form** (`bookFrame` in `src/lib/forms/element.ts`) frames only an `https://…/book/f/…` address from the reply,
  grows the frame with the page's `book:height`, and fires `claritia:booked` when the page books. A page that says
  nothing within 10 seconds gives way to the form's own calendar, with the same token, so no lead loses the booking.
- **The rep's face**: the booking keeps the routed rep's name and photo even when the lead's owner changes between the
  send and the booking (`supabase/migrations/143_form_booking_rep.sql`).
- **The switch**: `FORM_BOOK_PAGE` on the server, workspace ids with commas between, or `all`. Off, the reply has no
  `bookPage` and the form shows its own calendar as before.
- The states stay as they are: "We're finishing your request" while Routing answers, held or unassigned leads see the
  thank-you only, a rep with no free times follows **If no one is free**.

Tests: `tests/formBookPage.test.ts` (the switch, the address, the page's host); `tests/pg/formBookPage.pg.ts` on a real
database (the same address on a retried send, off for other workspaces, the fill's email and the type's questions,
Routing's rep after the owner changed, two bookings at once make one meeting, a time taken while the page was open gives
fresh times, a type that's gone is refused); `scripts/form-bookpage-check.ts` in a real browser (the frame, its height,
`claritia:booked`, the fallback after 10 seconds, addresses that aren't a booking page never framed).

### What stays the same

The routing compile, Team meeting rules, Preview as, Can never run, If no one is free and Notification all keep working
as they do. Only what the lead sees after Submit changes: the booking page in place of the form's own calendar.

## Part 5. Build order

1. Part 2, the thank-you for all templates, with the template text once-over. (Small, no risk.)
2. Part 3, Redirect on the canvas. (Small: one API operation and the frame.)
3. Part 4 in the editor: the booking page embedded, `preview=1` on the booking page. (Medium.)
4. Part 4 on the live form: single-use links from the submit, the frame, the fallback, the flaky-case tests. (Larger;
   one release on its own, behind a per-workspace switch for a week, then on for everyone.)

## Running cost

| Item | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Redirect preview fetches (editor only, cached 10 minutes) | $0 | $0 |
| Booking page frames in the editor and on live forms (pages the VPS already serves) | $0 | $0 |
| Single-use links (one row per lead that reaches booking) | $0 | $0 |
| Claude tokens | none | none |
| **Added per month** | **$0** | **$0** |

All of it runs on the Hostinger VPS and the Postgres database already paid for. At Growth, booking page loads add
about one page view per booked lead; the current VPS handles that without a bigger plan.
