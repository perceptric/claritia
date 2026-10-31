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
  - **Book a meeting**: the meeting (edited in Inbound › Meetings), **Who they meet**, what happens when no times are
    open, and the message for leads who see no times.
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

## Meetings

Inbound › Meetings lists each meeting with **Used by**: the forms whose On Submission books it. Each form name opens
that form on On Submission (`?open=submission`).

## Monthly cost

Nothing is added to the monthly bill. There is no new service and no AI call. The form editor reads the routing screen
data once when it opens and saves through the existing routing calls.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
