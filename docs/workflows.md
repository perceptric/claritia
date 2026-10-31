# Workflows

Nurture › Workflows is where every automated email lives, meeting reminders included. It replaced Emails: the
Journeys, Emails, Library and Brand tabs are gone, and the senders stay in Settings › Sending.

## The page

- Folders on the left, each holding workflows, and the open workflow in the editor on the right
  (`src/components/app/workflows/Home.tsx`). `/workflows/<id>` opens one; `/workflows/new` picks a template.
- **New folder** makes one. A folder's menu renames it, moves it up or down, or deletes it (its workflows stay, under
  No folder). A workflow's menu moves it to another folder.
- The first visit makes folders from the old groups: one per lifecycle stage in use (Trial, Pipeline, Customer), then
  Workflows for the rest (`workflow_folders_start`, `supabase/migrations/100_workflow_folders.sql`). Before 100 runs,
  the page groups by stage as it did, without folder actions.
- With no workflows yet, an owner sees the build screen that writes the lifecycle journeys.
- Emails' old addresses open here (`resolveRoute` in `src/lib/nav.ts`).

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
