# Forms, meetings and routing

The form picks the meeting. The meeting picks the rep. There is no Routing section of its own: each part of it lives
where it's used, and the routing engine underneath runs both steps.

| Part | Where |
|---|---|
| Which meeting a lead books | Form › Build › On Submission › Routing (a Default meeting and conditions) |
| Which rep a lead gets | The meeting: Individual is its host; Dynamic has its own rules |
| Teams that take turns | Meetings › Availability › Team |
| Hours, calendars, away, caps | Meetings › Availability |
| Spam check | Form › Settings › Spam |
| Why a rep got a lead | Meetings › Upcoming and the meeting's page; one policy and the activity log still open at their old addresses |

Old Routing addresses forward (`resolveRoute` in `src/lib/nav.ts`): the policies list opens Meetings, teams and reps
open Availability › Team.

## The form

- **Build** has two screens: **1 Form** (questions, layout, the brand's look) and **2 On Submission**.
- **On Submission** picks Show a message, Go to a page or Book a meeting (`src/components/app/forms/OnSubmission.tsx`).
- **Book a meeting** only picks meetings, it never edits them:
  - **Routing**: a **Default** meeting, then **Add condition** rows. A row is one or more conditions (more with
    **+ and**, all needed) and the meeting it books. The first row that matches wins; anyone else gets the Default.
  - **Try a lead** runs the compiled routing on answers typed in and shows the meeting and the rep or team.
  - **When no times are open**: show the message, or email times later.
  - With no meetings yet, **Create a meeting** opens Meetings.
- The rows live in the form's draft as `after.schedule.routes`; `meetingTypeId` is the Default meeting
  (`src/lib/forms/schedule.ts`, checked in `src/lib/forms/schema.ts`).

## Meetings

- **Individual**: one host. The lead always books with that person.
- **Dynamic**: a group of reps and rules. A rule is conditions (the same editor as the form's,
  `src/components/app/forms/ConditionRows.tsx`) and one rep or a team that takes turns. **Otherwise** catches the rest.
  It's kept as `settings.dynamic` on the meeting type (`src/lib/meetings/types.ts`, checked in
  `src/lib/meetings/check.ts`). The panel is `src/components/app/scheduling/TypePanel.tsx`.
- Each card says Individual or Dynamic and **Used by** the forms whose Routing books it.
- An older meeting hosted by a Routing team takes that team's turns. One with several hosts and no team isn't used by a
  form until it's set up as Individual or Dynamic.
- A Dynamic meeting's own booking link takes turns among its reps for now. Asking its questions first, then showing the
  picked rep's times, comes next.

## How it runs

`src/lib/routing/compile.ts` turns the form's routing and its meetings into one routing policy:

1. Each form row expands into one rule per rule of its meeting (the row's conditions and the meeting's, together),
   then one for the meeting's Otherwise (or its host). Each rule names its rep or team and the meeting it books (`meet`).
2. The Default meeting's rules come next, and its Otherwise (or host) is Everyone else.
3. Paths that can't route are left out and listed: a value missing, a meeting deleted or off, a team that's gone, a
   meeting with no host. A half-made row never catches a lead. Tested in `tests/routingCompile.test.ts`.

The router then runs it like any policy: the spam check, existing owners, away, caps and turns all work as before, and
the booking shows the picked rep's times for the rule's meeting.

**Publishing** (`src/lib/routing/formPublish.ts`, on the server):

- Publishing a form compiles its routing and publishes it as the form's own policy: `rt_save`, the form's connection
  staged on it, the test the router asks for (`rt_test` with a lead that matches the first rule), then `rt_publish`.
- A form that shared a policy, or used the default one, gets its own at its first publish.
- A form that never used this routing (no `routes`) keeps the policy it had.
- Saving a meeting publishes again every live form that books it (`/api/meetings/types`), so a Dynamic meeting's new
  rules reach them at once.
- Anyone who can publish the form publishes its routing. It only ever touches that form's own policy, so it runs with
  an owner's rights for them. Anything left out shows as an error after the form goes live. Tested in
  `tests/formPublish.test.ts`.

## Sharing

The form's Share tab has the embed code for the customer's site and the form's own link on Claritia (`/f/<form>`).
Both run the same steps: questions, routing, the rep's calendar, booked.

## Monthly cost

Nothing is added to the monthly bill. There is no new service and no AI call; publishing makes a few more routing
calls than before, once per publish.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
