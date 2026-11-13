# Workflows

Workflows live in Emails › Automations (13 November 2026): there is no Workflows item in the sidebar. The folders, every workflow and the editor are the same; their address is `/emails/automations/<id>` (`/emails/automations/new` picks a template), and old `/workflows` addresses open there.

Workflows is where every automated email lives, meeting reminders included. It replaced Emails: the
Journeys, Emails, Library and Brand tabs are gone, and the senders stay in Settings › Sending.

## The page

- Folders on the left, each holding workflows, and the open workflow in the editor on the right
  (`src/components/app/workflows/Home.tsx`). `/workflows/<id>` opens one; `/workflows/new` picks a template.
- The left column is a folder tree: each folder opens and closes, and its workflows hang under it on a guide line.
  Creating lives in the tree: the **+** beside Folders, a folder's **+** on hover, the **New workflow** row at the end of
  each folder (filed there, `?folder=<id>`), and the **New folder** row at the bottom, named in place. A folder's menu
  renames it in place (or double-click), moves it up or down, or deletes it (its workflows stay, under No folder). Drag a
  workflow onto a folder to move it there; the folder opens and outlines while it's under the pointer.
- The workflow sits on a dotted canvas (`flow-dots`), like Scoring's flowchart. Scoring's lines are measured from the
  cards (`src/components/app/FlowLines.tsx`): one near-black weight, smooth S-curves and an arrowhead into each card. The
  first column is ICP fit.
- The first visit makes folders from the old groups: one per lifecycle stage in use (Trial, Pipeline, Customer), then
  Workflows for the rest (`workflow_folders_start`, `supabase/migrations/100_workflow_folders.sql`). Before 100 runs,
  the page groups by stage as it did, without folder actions.
- With no workflows yet, an owner sees the build screen that writes the lifecycle journeys.
- Emails' old addresses open here (`resolveRoute` in `src/lib/nav.ts`).

## The editor

The flow is on a canvas that pans and zooms like the Emails canvas (docs/email-unify-plan.md, E4). Cards say every
setting in one line; the + between them adds a step from a menu you can search; drag a card onto a + to move it, ⌘D
copies the picked step and Delete removes it. The panel has Settings (the trigger as cards, each step's fields, Insert
data on messages) and Test (pick a person and see what the step would do for them; nothing is sent).

## Emails in an automation

Each email step is one email. It opens two ways, and both are the same email:

- **In the step's panel**: From (your team or their owner), the subject with Insert data, and the email itself as it
  will look. A click on its words types in place, with bold, italic, links and Insert data
  (`src/components/app/workflows/EmailInPanel.tsx`, the canvas's own typing). **Rewrite with Tia** writes it again.
- **On the Emails page**: **Open full editor** opens it on the automation's group canvas for the design (blocks,
  colors, pictures, Tia, versions, comments). **Back to automation** comes back, with the changes already here.

There's no Approve. **Publish** shows every email once (its picture, subject and sender) with what changed, and takes
each email as it is on the Emails page right then. The Footer block (address and unsubscribe link) is added for you
when an email has none (`withFooter` in `src/lib/workflows/stepEmails.ts`), in the panel, on the cards and in what's
sent. Under the hood each email is still the step's editing copy in `emails` (kind journey, 163), kept in step with the
draft; Publish reads the copies, so the two can never disagree. An email edited since the live version shows
**Changed since publish** on its card and in the panel.

## The meeting workflows

The emails Claritia sends for every meeting are workflows in a **Meetings** folder, made live the first time Workflows
or Emails opens (`src/lib/workflows/meetingFlows.ts`, `supabase/migrations/165_meeting_flows.sql`,
`src/components/app/workflows/meetingSetup.ts`):

| Workflow | Trigger | Steps |
| --- | --- | --- |
| Booking confirmed | Meeting booked | Booking confirmed (to the guest, with the invite), New booking (to the host) |
| Reminders | Meeting booked | Delay until 1 day before, Reminder; Delay until 1 hour before, Reminder |
| Meeting moved | Meeting moved | Meeting moved (to the guest, new invite), Moved booking (to the host) |
| Meeting canceled | Meeting canceled | Meeting canceled (to the guest), Canceled booking (to the host) |
| After the meeting | Meeting booked | How did it go (to the host, when the meeting ends) |
| No-show follow-up | Marked no-show | No-show follow-up (to the guest) |
| Pick a time | Form sent, no booking | Pick a time (to the lead) |

- Their emails are **Meeting email** steps: the System emails (docs/system-emails.md), edited in the step's panel with
  a sample meeting's values, or on the canvas through Open full editor. The meeting worker sends them, so the invite,
  one send per meeting, the host's inbox and the retries are as before; the workflow engine passes over them.
- Pausing a workflow, or taking a step out and publishing, stops that email. **Reminders** sets when reminders go
  (its Delay steps, in days and hours; a meeting type's reminder of 15 minutes became an hour); pausing it stops them.
  Reminders already queued keep their time.
- Booking confirmed, Meeting moved and Meeting canceled carry the invite: no Pause or Delete, and the guest's email
  can't be removed or copied. Steps can be added to any of them (a Slack note, a text), and those run like any step.
- The first time they're made, the older starting drafts they replace (Meeting announcement, Meeting follow-up,
  No-show follow-up) go if they were never published.
- A workspace without them (never opened since 165), or a read that fails, sends as before.
- Tested in `tests/meetingFlows.test.ts`, `tests/pg/meetingFlows.pg.ts` and `scripts/automation-check.ts`.

## The starting set

Every workspace also gets two form drafts the first time anyone opens Workflows (`workflow_defaults`, 119; the bodies
are `STARTING` in `src/lib/workflows/templates.ts`): Form announcement in Notification and Form follow-up in Follow-up.
They send nothing until someone publishes them.

## Meeting reminders

The meeting's own reminders are the Reminders meeting workflow (above). A workflow of a team's own can send more:
Reminders are a workflow. The meeting screens no longer set them.

- A **Wait** can be **Before the meeting**: until that long before the contact's next booked meeting
  (`before: "meeting"` on the wait step, `src/lib/workflows/types.ts`).
- The **Meeting reminders** template: when a meeting is booked, wait until a day before, email; wait until an hour
  before, email. Its emails start unapproved, like every template's.
- Emails get `{{meeting_time}}` (in the guest's zone), `{{meeting_link}}` and `{{reschedule_link}}`.
- How it runs (`worker-intel/jobs/workflows.ts`, `src/lib/workflows/engine.ts`):
  - The run counts back from the contact's soonest booked meeting still ahead, of the trigger's meeting types when it
    names some (`meetingFor`).
  - A meeting that moves or is canceled wakes the run at once (`workflow_meeting_changed`,
    `supabase/migrations/101_workflow_reminders.sql`). A move parks it again for the new time; a cancel ends it.
  - A reminder more than 30 minutes late is skipped, along with the steps up to the next reminder (`nextReminder`), so
    a meeting booked for today never gets "see you tomorrow".
- Once a live workflow triggered by meetings has a Before the meeting wait, the meeting's own reminder emails stop for
  that workspace (`remindersByWorkflow` in `worker-intel/jobs/meetings.ts`), so nobody gets two. Until then, and
  before 101 runs, the meeting's reminders go as they did.
- Tested in `tests/workflowReminders.test.ts`.

## Monthly cost

Nothing is added. No new service and no AI call; a waiting reminder costs one database read each time it wakes.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
