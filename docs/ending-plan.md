# The Ending, made real: a better thank-you, the real redirect page, the real booking page

Status: Parts 2 and 3 and Part 4 in the editor built, 12 November 2026. Part 4 on the live form is next. Covers three things the owner asked for on the Ending page of Form Studio:

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

After the send, the form embeds the booking page for the meeting and the rep Routing picked, through a **single-use
link** made for that lead. Single-use links already exist (`/book/l/<token>`, docs/meetings-scheduler.md 1.8b): they
book one meeting with one host, in the workspace's look.

1. The submit reply (`src/lib/forms/submit.ts`) gets a `bookUrl` when the plan is "times": the server makes a
   single-use link for the routed rep and meeting, carrying the submission's id, the lead's name and email, and an
   expiry of 7 days.
2. The form shows the thank-you, then the booking page in a frame at `bookUrl&embed=1`, prefilled. The frame grows
   with its height; a booking fires the form's own `claritia:booked` event, so the embed API and workflows ("when they
   don't book") keep working.
3. A booking made there is linked to the submission and its contact by the id the link carries, the same way the
   form's own booking links them today.
4. The states stay as they are: while Routing hasn't answered, the form shows "We're finishing your request" and asks
   again; held or unassigned leads see the thank-you only; a rep with no free times follows **If no one is free**
   (the thank-you, or "We'll email you times").
5. If making the link fails, the form falls back to its own calendar, as today, so no lead loses the booking.

This is booking and routing code, so it ships only with tests that prove it on flaky cases
(CLAUDE.md, reliability first):

- the link is made once per submission, even when the submit is retried with the same key;
- a submit that times out before the link exists shows the pending state, then the frame;
- link creation fails → the form's own calendar shows, and booking still links to the submission;
- the rep changes between submit and booking (an owner reassigns) → the link books the rep it names, and the
  booking shows on the right contact;
- a second visit to the link says it's used, with the host's page;
- the booking page's Book links the meeting to the submission (`tests/pg/` against the real database).

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
