# System emails

The emails Claritia sends for every meeting, as designs a team can change on the Emails canvas. Before this, their
words and look were fixed in code (`src/lib/meetings/emails.ts`) and nobody could see them in Emails.

## How the emails fit together

| What | Where it lives | What sends it |
| --- | --- | --- |
| **System emails**: confirmed, moved, canceled, reminder, no-show follow-up, pick a time, and the host's notes | Emails › Groups › System emails | The meeting worker, for every meeting (`worker-intel/jobs/meetings.ts`) |
| **Automations**: follow-ups, extra reminders, Slack notes, texts | Emails › Automations; each automation's emails are also a group on Emails | The workflow worker, once the automation is published |
| **Campaigns**: one-time sends to an audience | Emails › Groups and Ungrouped | Send on the canvas |

- A live automation with a **Before the meeting** wait sends the reminders; the System email Reminder then doesn't go,
  so nobody gets two (`remindersByWorkflow`, docs/workflows.md).
- When reminders go is set on each meeting type (Reminders, a day and an hour before by default). The Reminder email is
  what they say.

## The emails

| Key | Name | To | Can be turned off |
| --- | --- | --- | --- |
| `confirm` | Booking confirmed | Guest | No: it carries the calendar invite |
| `update` | Meeting moved | Guest | No: it carries the new invite |
| `cancel` | Meeting canceled | Guest | No: it takes the invite off their calendar |
| `reminder` | Reminder | Guest | Yes |
| `no_show` | No-show follow-up | Guest | Yes (also per meeting type) |
| `book_later` | Pick a time | Guest | Yes |
| `host_booked` | New booking for the host | Host | Yes |
| `host_moved` | Moved booking for the host | Host | Yes |
| `host_canceled` | Canceled booking for the host | Host | Yes |
| `after` | How did it go, for the host | Host | Yes (meetings still turn held after 24 hours) |

The calendar reconnect email stays Claritia's own.

## The look

Every starting design has the same calm layout (docs/brand.md): a small green status line ("Confirmed", "Reminder"),
a 30px heading with one gray line under it, then the meeting on a tinted band, with a calendar tile (the month on a
green strip, the day below) beside the meeting's name, date, start and end time, length and place. Under it: the Join
pill, Add to calendar as two quiet pills, gray labels over the description and their answers, a hairline before
Reschedule or cancel, and a centered footer. Canceled emails strike the meeting through and turn the tile gray. The band
keeps the tile beside the details on a phone (side-by-side columns now keep their share of a phone's width, in
`compile.ts`); the pills stack there.

## How it works

- Each is an `emails` row of kind `system` with its `system_key` (`supabase/migrations/164_system_emails.sql`). The
  first time anyone opens Emails, `system_email_ensure` makes the missing ones from the starting designs in
  `src/lib/meetings/systemEmails.ts` (the same words the built-in emails had). Existing ones are never overwritten.
- The canvas edits them like any email (`email_draft_save`), with versions and comments. They can't be added, deleted,
  duplicated, moved or sent from the canvas. **Turn off** and **Turn on** (`system_email_turn`, `paused_at`), and
  **Start over** puts back the starting design. The canvas shows a sample meeting's values in place of merge fields, and
  Insert in the format bar offers the meeting's fields. Test sends it to you with the sample values.
- Merge fields: `first_name`, `guest_name`, `guest_email`, `host_name`, `meeting_name`, `meeting_time`,
  `meeting_date`, `meeting_clock`, `meeting_month`, `meeting_day`, `meeting_length`, `meeting_where`, `meeting_link`, `reschedule_link`, `calendar_google`, `calendar_outlook`, `about`,
  `answers`, `old_time`, `cancel_reason`, `book_link`, `time_left`, `held_link`, `no_show_link`, `open_times`,
  `workspace` (each email has the ones listed in `FIELDS_FOR`). Values are escaped in HTML; `answers`, `open_times` and
  `about` are lines.
- Parts that need a value show only when the meeting has one: the Join button (`meeting_link`), Reschedule or cancel,
  their answers, the description, the old time, the reason, Book a new time, the open times. They use the email
  builder's "Who sees it" conditions, which now know these fields (`MEETING_COND_FIELDS` in `doc.ts`).
- Sending (`src/lib/meetings/systemSend.ts`): the worker reads the workspace's System emails and brand kits in one call
  (`meeting_system_emails`), builds the design with the kit's published styles, keeps the parts with a value, fills
  the fields, and adds the preheader. The send itself is unchanged: the same dedupe, the calendar invite, the host's
  own mailbox, retries.
- Fallbacks: no System emails yet, a read that fails, or a design that can't be built (empty, broken, an empty
  subject) sends the built-in email instead. A meeting email is never lost to an edit.
- An email that's Off isn't started at all; the confirmation, moved and canceled emails ignore Off.

## Tests

- `tests/systemEmails.test.ts`: every starting design reads back unchanged, uses only its fields and builds with none
  left; escaping; parts left out; time left and open times; Off; every fallback.
- `tests/pg/systemEmails.pg.ts`: made once and never overwritten, outsiders refused; the built-in email without them;
  the design with the meeting's values, links and the invite; no Join without a link; Off for reminders and host
  notes while the confirmation still goes; fallbacks for a broken design and a failed read; a throttled and a
  timed-out provider each still send once.
- `scripts/email-canvas-check.ts` 70: the canvas with all ten, their On, Off and Always on, sample values, Turn off,
  no Delete, and Start over.

## Monthly cost

Nothing new to pay for. The emails were already sent; they're now built from a design, a few milliseconds of CPU on the
existing worker. No AI calls.

| Stage | Servers | Email sending | Claude tokens | Total added |
| --- | --- | --- | --- | --- |
| Beta (50 teams) | $0 (same VPS) | $0 (same emails) | $0 | **$0** |
| Growth (500 teams) | $0 (same VPS) | $0 (same emails) | $0 | **$0** |
