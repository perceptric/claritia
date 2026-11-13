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

## The starting set

Every workspace gets two folders the first time anyone opens Workflows (`workflow_defaults`,
`supabase/migrations/119_workflow_defaults.sql`; the bodies are `STARTING` in `src/lib/workflows/templates.ts`):

| Folder | Workflow | Starts when | Does |
| --- | --- | --- | --- |
| Notification | Form announcement | Any form is sent | Thanks them right away; a Slack note for their owner |
| Notification | Meeting announcement | A meeting is booked | A Slack note, then reminders a day and an hour before |
| Follow-up | Form follow-up | Any form is sent | An email the next day, until they book |
| Follow-up | Meeting follow-up | A meeting is held | A thank-you two hours later |
| Follow-up | No-show follow-up | A meeting is a no-show | An email with their reschedule link; a Slack note |

- They are drafts with unapproved emails: nothing sends until someone reads each email and presses Publish.
- They go in once per workspace (`workspaces.workflow_defaults_at`), ahead of older folders; a deleted one stays
  deleted. Older workspaces keep their own workflows.
- A new workspace no longer gets an empty "Workflows" folder (119 changes `workflow_folders_start`).
- Before 119 runs, the page shows what's there.
- Tested in `tests/workflows.test.ts` and `tests/pg/workflowDefaults.pg.ts`.

## Meeting reminders

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
