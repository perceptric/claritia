# Forms, meetings and routing

The form picks the meeting. The meeting picks the rep. There is no Routing section of its own: each part of it lives
where it's used, and the routing engine underneath runs both steps.

| Part | Where |
|---|---|
| Which meeting a lead books | Form › Build › On Submission › Routing (a Default meeting and conditions) |
| Which rep a lead gets | The meeting: Individual is its host; Dynamic has its own rules |
| Teams that take turns | Meetings › Availability › Team |
| Hours, calendars, away, caps | Meetings › Availability |
| Spam check | Form › Settings › Spam; caught leads go to Form › Submissions › Spam |
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
- A Dynamic meeting's own booking link asks the questions its rules test first (a rule on the email's domain or type
  asks for the email), then shows the times of the rep or team the answers pick, by the same rules. The answers go
  with each read of times and with the booking, so the server offers and books the same reps
  (`src/lib/meetings/dynamic.ts`, `dynamicServer.ts`, the page's step in `src/components/book/RouteQuestions.tsx`).
  A matched rule whose rep isn't among the meeting's reps, or whose team is gone or empty, keeps every rep; it never
  falls through to a later rule. A booking link that already names the host skips the questions. Tested in
  `tests/dynamicBooking.test.ts`.

## Form Studio's On submission

Studio forms (`src/components/app/forms/studio/studio.ts`, the rows in `src/lib/studio/routes.ts`) keep the same rule:
the form picks the meeting type, the meeting picks the person.

- **The screen**: what happens after the send lives on the form's **Ending** page, the last tab in the page bar
  under the form. **Ending type** (Message, Redirect, Book a meeting) and its settings sit in the left sidebar above
  Add fields, as Fillout does; the canvas shows the ending page itself, edited like any other page (a Redirect shows
  where people go). A **Team meeting**'s rules are edited in the center, beside the booking page they lead to.
- **Pages** (`stepUi` in `src/components/app/forms/studio/studio.ts`): the page bar lists Welcome, each page and the
  Ending as tabs. A page drags to a new place; its ⋯ renames it (`data-cl-page`, else "Page N"), duplicates, copies
  (kept on this computer, pasted from Add page into this form or another), sets a timer, or deletes it. **Add page**
  adds a page, a payment page (a page with the payment block) or the scheduling page (the Ending books a meeting).
- **After they send it**: Show a thank-you message (the default, the thank-you every template comes with), Redirect
  to a page, or Book a meeting. The last step in the bar over the form follows it: Thank-you, Redirect (opens On
  submission) or Booking. The thank-you takes the whole form's place once sent, its heading included, on one-page and
  multi-page forms. Book a meeting puts the calendar under the thank-you's message (`data-cl-book`), so the message
  stays editable, and Edit shows the calendar there.
- **Calendar style**: paid plans book in the form's own style; Free gets the plain calendar (`cl-plain` in
  `CAL_CSS`, `src/lib/studio/runtime.ts`). It is the `booking_brand` feature in `src/lib/plans.ts`, the same one as
  branded booking pages. The public form read (`/api/forms/[id]`) sends `calBrand`, with the plan kept a minute.
- **Individual or Team meeting** (`after.mode`, "one" or "routing", `isRouting` in `src/lib/studio/page.ts`). **Individual**: everyone books
  one meeting. When that meeting is Dynamic its rules show in one line, like "Locations is at least 50 → Enterprise,
  otherwise anyone on the team" (`src/lib/meetings/dynamicWords.ts`), and **Edit meeting** opens it. **Team
  meeting**: the rules below. A form saved before the switch is Routing when it has rules. Rules stay on the page under Individual,
  unused, so switching back keeps them.
- **Team meeting's rules** (`src/lib/studio/routes.ts`): named rules in run order, first match wins, then **Otherwise** (the form's
  meeting), fixed last. A rule is "When <question> <test> <value>", then more conditions joined by **+ and** or
  **+ or**; **Book** <meeting>; **With** "As the meeting says" (the meeting's own host or Dynamic rules), a team that
  takes turns, or one person. Rules move up and down and can be deleted. The first condition sits at the top of the
  rule (field, op, value) as rows did before, and the rest in `more`, so older rows read as they were. The tests fit
  the question: is or is not one of its answers for a choice; less than, more than, at most, at least, between and is
  for a number; contains, is, is not and starts with for text; is answered and is empty for all. Numbers are compared
  as numbers. Rows saved before tests ("Plan is Enterprise") read as "is" that answer. Each rule compiles to router
  conditions on `answer.<key>` (`pageForm` in `src/lib/studio/page.ts`); a rule with a question gone or a value
  blank never routes anyone.
- **Before any rule**: **Spam check** and **Keep existing owners**, both on. Turned off, the form's own policy turns
  that check off (`schedule.before`, `compileRouting`).
- **If no one is free** (Routing, or a Dynamic meeting): **Show the thank-you** or **Email times later**
  (`schedule.none`).
- **Preview as**: one chip per rule and Otherwise over the canvas. The chip's lead (answers that meet the rule,
  `sampleFor`) runs through every rule as a live lead would, so the booking page shows the meeting that lead really
  gets, and a line says so when an earlier rule catches them first.
- **Can never run** (`neverRuns`): a rule whose every lead an earlier rule catches says so on its card and in the
  form check. Only sure cases are named (number ranges inside each other, answers inside each other, the same test),
  so the warning is never wrong; an overlap it can't prove stays quiet.
- **Past fills** (rule fields for both the form's rows and Dynamic rules, `PAST_FIELDS` in
  `src/lib/router/conditions.ts`): **Has sent this form before**, **Has a meeting booked**, and **Booked in the last N
  days** (days since they last booked, at most N). The server reads them once per send, only when a rule tests one
  (`routing_past`, `supabase/migrations/115_routing_past.sql`; `readPast` in `src/lib/router/server.ts`). The send
  being routed never counts as "sent before"; spam and test sends never count. A Dynamic meeting's own booking link
  reads them by the guest's email (any form, since a booking page has none). A past fill that can't be read is
  unknown, so no rule on it holds by mistake, in older policies too ("is not" included). Workflow branches and
  Enrichment's qualify rules don't offer them, since only routing reads them.
- **Always do**, on every send whatever it books: **Email the team** and **Post to Slack** (the form's team alert,
  `form.notify`); **Send to** a connected CRM or a webhook (the form's destinations); **Follow-up** workflows that
  start on this form (**New follow-up**: when they send it, or when they don't book). Send to and New follow-up save
  the form once as a draft first, since they need its id. Email the team and Post to Slack are the same team alert as
  the form's Settings, so the last place it changed wins (`teamAlert` in `src/lib/studio/page.ts`), the alert's subject
  stays, and a chat opened after a Settings change shows the alert as it is now. A form with no Always do keeps the
  alert it had.
- **The form check** (`src/lib/studio/check.ts`) stops Publish on a rule with any condition that reads a deleted
  question or answer, a past fill that's gone, a blank value, a deleted meeting, a page or part shown by a question
  asked on a later page, and Email the team with no emails. A rule that can never run is a warning.

Tested in `tests/routeByAnswer.test.ts`, `tests/routingRules.test.ts` and `scripts/studio-check.ts`.

## How it runs

`src/lib/routing/compile.ts` turns the form's routing and its meetings into one routing policy:

1. Each form rule expands into one router rule per rule of its meeting (the rule's conditions and the meeting's,
   together), then one for the meeting's Otherwise (or its host). Each names its rep or team and the meeting it books
   (`meet`). An "or" rule is one path per condition, each joined with the meeting's rules, in the same order. A rule
   **With** a team or person is one router rule to them, with its and or or kept, and the meeting's own rules skipped.
2. The Default meeting's rules come next, and its Otherwise (or host) is Everyone else.
3. Paths that can't route are left out and listed: a value missing, a meeting deleted or off, a team that's gone, a
   meeting with no host. A half-made rule never catches a lead. Tested in `tests/routingCompile.test.ts` and
   `tests/routingRules.test.ts`.

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

## Spam

- A lead any spam check catches goes to its form's **Spam** list (Form › Submissions › Spam): the form's own checks,
  and the routing spam check (reason `routing`, "Failed the spam check"). There is no review step and no "held" wording.
- The routing spam check's review item is kept, dismissed (`supabase/migrations/098_spam_to_spam.sql`), so
  **Not spam** routes the lead through that item with the spam check skipped (`src/lib/routing/spamRelease.ts`, called
  from `/api/forms/release`). If routing refuses, the item goes back to dismissed and the lead stays in Spam.
- Leads from the handoff or the API keep their review item. Tested in `tests/spamToSpam.test.ts`.

## The meeting description

Every booked meeting's calendar event and invite file get a description made from the meeting
(`src/lib/meetings/description.ts`), laid out like Calendly's: **Event details** (Invitee, Invitee email, Event,
Booked from), **Additional details** (each answer under its question), **Event type description** (the meeting
type's Description), then the join link and the guest's reschedule and cancel link. Very long answers are cut first,
so the Description and the links always stay. The guest sees it too, so it holds nothing
internal (no score, no routing reason). A group event carries none of one guest's details.

- `meeting_sync` writes it when the event is made and again on every reschedule, so the links never go stale
  (`worker-intel/jobs/calendars.ts`). The invite file in the confirmation and update emails uses the same text.
- The form, its answers and the sealed manage token come from `meeting_invite_info`
  (`supabase/migrations/099_meeting_description.sql`). If that read fails, the event is still made with what the
  meeting has.
- A reschedule keeps the meeting's host. A Dynamic meeting always does, even when set to the pool, since its rules
  picked that rep (`keepsHost` in `src/lib/meetings/public.ts`). A cancel takes the event down.
- Tested in `tests/meetingDescription.test.ts` and `tests/dynamicBooking.test.ts`.

## Sharing

The form's Share tab has the embed code for the customer's site and the form's own link on Claritia (`/f/<form>`).
Both run the same steps: questions, routing, the rep's calendar, booked.

## Monthly cost

Nothing is added to the monthly bill. There is no new service and no AI call; publishing makes a few more routing
calls than before, once per publish. Past fills add one indexed database read per send, only on forms and meetings
whose rules test one; it fits in the database the app already runs on.
The calendar style adds one plan read per workspace per minute when a form loads, on the same database. Routing's
teams and people for **With** are one routing read the first time On submission opens with Routing, on the same server.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
