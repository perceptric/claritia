# On Submission

What happens after someone sends a form is set on the form's Build tab, under the form itself. It used to live under
Forms › Settings › After submit. This replaces that section and the Routing connection card that sat inside it
(`forms/RoutingConnection.tsx`).

## The screen

- The canvas shows the path top to bottom: **Form → On Submission → what the visitor sees**. One arrow joins them
  (`Arrow` and `ArrowDown` in `src/components/app/forms/OnSubmission.tsx`). The same arrow marks every If → Then row
  and Otherwise.
- Click On Submission (or the "On Submission" step at the top) and the panel picks one of:
  - **Show a message**: title and message.
  - **Go to a page**: the page, which must start with https://.
  - **Book a meeting**: the meeting is part of the form. Its panel has five sections: **Who they meet** (the If → Then
    list), **Meeting**, **When they can book**, **Emails and reminders**, and **When no times are open** (with the
    message for leads who see no times).
- The form and everything the visitor sees use the brand kit read from the customer's site: colors, corners, fonts,
  sizes, field height, border and button.

## Who they meet

A list of If → Then rows, then Otherwise. Rows have no names.

- **If** a field test a value, with more conditions added by **+ and**. All conditions in a row have to hold.
- **Then** a person, a team (its members take turns) or the company's owner.
- **Otherwise** a person or a team.
- The first finished row that matches wins. A row with a missing value, no Then, a deleted team or a word in a number
  field never matches anyone.
- **Try a lead** takes answers for the fields the rows test. The matching row turns green on the panel and on the
  canvas.

### How it saves

The rows are the router's own rules (`src/lib/routing/formRules.ts`, tested in `tests/formRules.test.ts`).

- Each row is a rule whose conditions all have to hold, named from those conditions.
- Rules held for review, a rule's own meeting and rules turned off in Routing are kept as they are.
- Edits save to the draft of the policy this form routes with, through `rt_save` at the revision read
  (`src/components/app/forms/useFormRouting.ts`). If someone else saved first, their version is shown.
- When the form shares its policy with other sources, or uses the default policy, its first edit makes a copy named
  after the form and moves the form onto it (`rt_duplicate` or `rt_create`, then `rt_stage`). Other forms keep
  their routing.
- **Publish** on the form also publishes this policy. It runs `rt_review`, runs `rt_test` with a lead that matches the
  first finished row when the draft has no test yet, then runs `rt_publish` at the checked fingerprint. If that
  fails, the form is still live and the error says what's wrong with the routing.
- Members see the rows read-only. Only owners can change routing, as in Routing.

## The form's own meeting

A form books **This form's own** meeting by default, or a standalone meeting picked from Meetings.

- The form's own meeting is a meeting type with `settings.form` set to the form's id (`src/lib/meetings/types.ts`,
  checked in `src/lib/meetings/check.ts`). It's secret, so it never shows on a booking page. It's made the first
  time the form books a meeting (`makeOwnMeeting` in `src/components/app/forms/FormMeeting.tsx`), hosted by whoever
  made it (those are the times shown while Routing isn't live).
- On Submission edits it in place: name, length, where, earliest booking, booking window, free time after, daily
  limit, the 24-hour and 1-hour reminders and the email after a no-show. Each change saves 600 ms after the last one
  through the meetings API.
- Hours are each rep's own, from Meetings › Availability. The rep comes from the If → Then list.
- A standalone meeting shows its summary and an "Edit in Meetings" button instead.

## Sharing

The form's Share tab has both ways in, and they behave the same: the questions, then If → Then picks the rep, then
that rep's calendar, then booked.

- **On your website**: the embed code for the customer's site.
- **Link**: the form's own page on Claritia (`/f/<form>`), for ads, emails and social posts.

## Meetings

- **Meetings** lists **In forms** first: each form that books a meeting, with its meeting. A card opens that form on
  On Submission (`?open=submission`). The standalone meetings follow, each with **Use in a form** in its menu, which
  opens the picked form with that meeting set (`?use=<meeting>`). A form's own meeting whose form was deleted shows
  with the standalone ones, so it can be removed.
- **Availability** is a Meetings tab again (it was under Routing › Teams; old addresses forward). **Team** shows each
  person's calendar, hours, caps and an **Away** switch. Away is the same setting Routing reads, so someone away gets
  no leads from forms and no times.
- A booked meeting's page shows **Booked from** (the form, which opens on On Submission) and **Why this rep** (the
  Routing run that picked them).

## Monthly cost

Nothing is added to the monthly bill. There is no new service and no AI call. The form editor reads the routing screen
data once when it opens and saves through the existing routing calls.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
