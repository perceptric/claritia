# Email, round 3: one place for every email

Plan, 13 November 2026. E1, E2 and E3 built the same day (see "As built" at the end). Today Emails has two halves that don't talk: Campaigns (the canvas, B1 to B5) and Automations
(the workflow editor, `src/components/app/workflows/`), where an email step is a subject and a text box in a side
panel. This plan fixes what's broken on those screens, gives Audiences real columns, turns Automations into a
Zapier-style editor, and makes every email, sent once or by an automation, live on the Emails canvas.

Parts, in the order to build them: **E1** fixes, **E2** Audiences, **E3** one home for emails (Campaigns becomes
Emails), **E4** the Zapier-style automation editor, **E5** proof and ship. E1 and E2 ship on their own first.

## E1. Fixes (from the screenshots)

| Where | What's wrong | Fix |
|---|---|---|
| Audiences › Import | The panel's content touches its edges: the drop area runs to the sides and the consent checkbox sits on the border. The checkbox is the browser's own. | Give the panel's body its padding (`p-5`, like the app's other sheets). Use the app's own round-cornered check (a new shared `Checkbox` in `ui.tsx`), never `<input type="checkbox">` on screen. |
| Automations › trigger | "Form submitted, A deleted form": the form it started from was deleted, no form pill is picked and nothing says what to do. | Show a "Deleted form" pill with a remove button, list "The form this starts from was deleted. Pick a form." with the step's problems, and keep Publish off until it's fixed. |
| Automations › Delay | A new Delay starts at 0 days 0 hours, so it opens with "Set how long to wait" in orange, as if something failed. | A new Delay starts at 1 day. The problem line only shows after someone empties it. |
| Automations › Delay › At | `--:--` with a clock is the browser's own time box (against the no-browser-controls rule). | The app's `Select` with times every 15 minutes, in the workspace's 12 or 24 hour clock, plus "Any time". |
| Automations › Days, Hours | Plain number boxes with browser spinners. | The app's number field with − and + buttons (one shared `NumberField`), also used by Re-entry and Event wait. |
| Automations › step badge | An amber dot and a number ("• 2") with no words: it's a count of problems, but reads like a step number. | The card says the first problem in words ("No subject yet"); the count goes. |
| Automations › Email step | The email is a subject and one text box in the side panel. | Replaced in E3: the email opens on the Emails canvas. |

Each fix gets a line in the browser checks (E5).

## E2. Audiences: real columns

Today the table has one "Person" column (name over email). Contacts already hold first name, last name, email, phone,
title, country and source (`033_contacts.sql`).

- **Columns:** First name, Last name, Email, Phone, Email status, Came from, Lists, Added, Last email. A Columns menu
  (the app's `Select`, many-pick) hides or shows Phone, Title, Country, Lists, Added and Last email; the choice is
  kept on this computer. First name, Last name and Email always show.
- **Edit in place:** a click on a first name, last name or phone cell edits it (Enter saves, Escape leaves). Email
  stays as it is: changing an address is a new person, so it's shown, not edited. A row's menu has Edit (a side
  sheet with every field), Add to list, Remove from list and Delete.
- **Sort and search:** sort by any column; search matches name, email and phone.
- **Add one person:** "Add person" beside New list opens the same side sheet, with the consent check.
- **Import:** the column picker gains Phone, Title and Country (it maps First name, Last name and Email today).
- **Merge fields:** every column is a merge field in emails (`{{first_name}}`, `{{last_name}}`, `{{phone}}` and the
  rest), and the email canvas's merge menu lists them.
- **Database:** `audience_people` returns phone, title, country and the person's lists; a new `contact_update`
  (owners and members of the workspace, name and phone only, with a check on length). One migration, no new table.

## E3. One home for every email

### Names

- The **Campaigns** page becomes **Emails**. The sidebar section above it becomes **Email**, so it reads Email ›
  Emails, Automations, Audiences, Templates, Brand. Old `/emails` and `/emails/campaigns/...` addresses keep working.
- "Campaign" stays as the word for a one-time send: an email's Send button still says Send, and its results page
  is unchanged.

### Where automation emails live

- Every automation email becomes a row in `emails` with `kind = 'journey'` (the kind exists since `039_email.sql`),
  plus two new columns: `workflow_id` and `step_id`. The workflow's email step keeps a pointer (`email_id`) in place
  of the subject and text box.
- On the **Emails** page each automation is a group of its own, named after it ("Broadcast", "Demo request
  follow-up"), with an Automation tag. It opens on the same canvas as any group: click to pick a part, type in
  place, drag blocks, versions, comments, Tia, Light and Dark. What it can't do: Send to an audience, be deleted
  from Emails (it's deleted with its step), or take emails from other groups.
- A filter at the top of Emails: All, Campaigns, Automations.
- The **old email editor** (the block builder, `src/components/app/email/EmailBuilder.tsx`) stays: an email's menu
  on the canvas has "Open in the classic editor", for automation and campaign emails alike, and templates still
  open in it.

### What's sent

Automations keep sending exactly what was published, never a half-edited draft:

- **Publish** copies each email row's subject, preview text and design into that version of the workflow (the
  engine reads the version as it does today, so the send pipeline doesn't change).
- An email edited after publishing shows "Changed since publish" on its node and on the canvas; the automation's
  Publish button lights up until it's published again.
- **Approve** stays: an email edited since it was approved needs approving again before Publish, as today.
- An email row that's missing at publish (deleted some other way) blocks Publish with "This email is missing. Add
  it again."

### Moving what's there

A one-time migration makes a `journey` row for every email step in every workflow (drafts and published versions),
turning a text-box email into a canvas design in the brand kit (subject, preview text, paragraphs, button). It runs
once, is safe to run twice (rows are matched by workflow and step), and changes nothing that's live: published
versions keep their own copy.

## E4. The automation editor, Zapier style

The editor keeps its vertical flow and right panel, and gets the depth Zapier has.

### The canvas

- Pannable and zoomable like the Emails canvas (the same `Surface`), fit to the flow on open, ⌘0 to fit, the zoom
  pill at the bottom right.
- Branches (Branch, Split, Event wait) sit side by side with their path names on the lines ("Yes", "No", "A 50%").
- **Nodes** are cards with the step's icon, its kind and a one-line summary of every setting: "Wait 2 days, then
  Tue or Thu at 9:00 AM", "Email: Your demo is booked (approved)", "Branch: Team size is 11-50". A problem shows
  as one amber line in words. Email nodes show a small preview of the email.
- **Add a step:** the + between nodes opens a menu with a search box and the groups (Email, Time, Logic, Lead,
  Outside, End), each with its icon and one line.
- **Move and copy:** drag a node to move it (a line shows where it lands), ⌘D duplicates, Delete removes (with the
  app's confirm for steps with branches under them), ⌘Z and ⇧⌘Z undo and redo, one history.

### The right panel: every property of the picked node

- **Trigger:** the kind as a list of cards with icons (Form submitted, Meeting event, No booking after form, Lead
  routed, Email clicked, Joined a list). Then its settings (which forms, which meeting types and events), "Only
  people who" conditions, Re-entry and Exit condition, each a titled section with one short line.
- **Email:** From (Team or Owner), Subject, Preview text, Approve, "Changed since publish", and **Edit email**,
  which opens the Emails canvas on that email with a crumb back ("Broadcast automation"). A double-click on the
  node does the same. Write with AI stays.
- **Delay, Event wait, Branch, Split, Route, Slack, Text, WhatsApp, Teams or Discord, Analytics event, Webhook,
  Exit:** every field each one has today, in titled sections, with the shared Select, NumberField and time picker
  from E1.
- **Data from earlier steps:** text fields (Slack, Text, WhatsApp, Teams, Webhook, email subject) get an "Insert
  data" menu: the contact's fields (E2), the form's answers, the meeting's time and host. They show as chips in the
  field and become merge fields when sent.
- **Test** (a second tab in the panel): pick a person from Audiences or type sample values, and see what this step
  would do for them: the email as they'd get it, the branch path they'd take, the delay's end time. Nothing is sent.
  The whole flow keeps its Test button (a dry run from the trigger).

### Where it lives

Automations stays its own page (Email › Automations) with its folders on the left. Each automation's emails are on
Emails as its group; each email on Emails says which automation it belongs to and links back.

## E5. Proof and ship

- **Unit tests:** the time picker's values, NumberField's limits, the deleted-form problem, the one-line node
  summaries, the publish copy (a published version holds the email as it was at publish, an edit after it doesn't
  change what's sent), the move migration (every step gets one row, twice is the same as once).
- **Reliability (send pipeline):** a pg test that a workflow published, then edited, sends the published email; one
  where the email row is deleted before publish and Publish refuses; one where saving the email and publishing
  race, and the version holds one whole email, never half.
- **Browser checks:** a new `scripts/automation-check.ts` on a stand-in page like the Emails canvas check (add a step
  from the search menu, drag a node, edit every kind in the panel, the Test tab, Edit email opening the canvas, the
  E1 fixes); `scripts/email-canvas-check.ts` gains automation groups (no Send, the tag, "Changed since publish");
  an Audiences check for the columns, edit in place and the import panel.
- **Docs:** this file's "As built", `docs/workflows.md` and `docs/email-studio-plan.md` updated, the CLAUDE.md lines
  for Emails and Automations.

## Running cost

No new service. The database gains two columns on `emails` and one function; automation emails were already stored
inside each workflow, so the rows move rather than grow.

| Part | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| E1 fixes, E2 Audiences columns | $0 | $0 |
| E3 automation emails on the canvas (rows in the same database) | $0 | about $1 |
| E4 editor; Test tab runs in the app, no model calls | $0 | $0 |
| Tia on automation emails: the same canvas chat as campaigns, used more | about $5 (check) | about $50 (check) |
| **Total a month** | **about $5 (check)** | **about $51 (check)** |

## Order of work

1. E1 fixes, then E2 Audiences: ship together (no data moves).
2. E3: migration, Emails rename, automation groups on the canvas, publish copy; ship with its pg tests.
3. E4: canvas, nodes, add menu, drag, the panel for every kind, Insert data, Test; ship with the automation check.
4. E5 runs along each ship; the docs close it out.

## As built: E1 and E2

- **Shared parts:** `Checkbox` and `NumberField` in `src/components/app/ui.tsx`. Every browser checkbox in the app's
  screens is gone (Audiences' rows, the import panel, Forms' settings toggles). The Delay, Re-entry, Event wait and
  Split use `NumberField`; typing works too, and a number over the top shows the top at once.
- **Delay time:** `src/lib/workflows/times.ts` lists every 15 minutes on the browser's 12 or 24 hour clock, plus Any
  time; a value the list doesn't have (an older 09:10) stays. Cards say "at 9:15 AM".
- **Deleted form:** `goneProblems` in `src/lib/workflows/check.ts`. The trigger card and panel say it in words, the
  deleted form is its own chip with a remove button, and Publish stays off. A deleted meeting type works the same way.
- **Rows with several buttons** (Forms, Meeting types, Then on, Status, Re-entry) are no longer `<label>`s, so a click
  on their words doesn't press the first chip.
- **Cards:** the first problem shows in words under the step's line; the bare count is gone.
- **Audiences:** migration 162 (`audience_people` with phone, title, country, lists, sort and phone search;
  `audience_person_update` for members, renamed from the plan's `contact_update`, which an older function already
  used). The Columns menu is kept on this computer. A click on a first name, last name, phone, title or country edits
  it; a click on the email opens the person's sheet. Add person goes through the import route (consent, throwaway
  addresses and owners' review as for an import), onto the list shown or no list.
- **Import:** Title and Country columns (country only as a two-letter code), and the panel's padding.
- **Not in this round:** Delete on a row (people leave through Unsubscribe and the existing tools), and Phone and
  Country as merge fields: first name, last name and title already are, and adding the rest means changing what every
  send reads, which waits for a change with its own send tests.
- **Proof:** `tests/emailRound3.test.ts`, `tests/pg/audienceColumns.pg.ts`, `scripts/emails-check.ts` (33 browser
  checks on a stand-in page); the Studio and email canvas checks pass.
- **Cost:** $0 a month at Beta and Growth.

## As built: E3

- **Names:** the sidebar section is **Email**; the page once called Campaigns is **Emails** (its address is the same).
  "Campaign" stays the word for a one-time send.
- **Copies:** migration 163 adds `emails.workflow_id` and `step_id` (kind journey, always a draft, deleted with the
  automation) and `workflow_email_ensure`, which makes one copy per email step, keeps copies that exist (the canvas may
  have newer words), orders them like the steps and removes copies whose step is gone. `email_draft_save` and
  `email_version_save` accept these copies. Matching is by step id, so the automation's draft carries no new field.
- **The editor** (`src/components/app/workflows/emailCopies.ts`): on open, and whenever email steps are added, copied or
  removed, it makes the copies and brings their words into the draft. Copies made just then keep the step's approval
  (only the form changed, from paragraphs to a design); a copy with other words asks for approval again. Those words
  reach every undo step (a new `sync` action), so undo never brings older words back over the canvas's. Edits made in
  the panel (subject, Write with AI, a template, the classic editor) reach the copy 800 ms later, with retries.
  **Edit email** saves both and opens the email on its canvas. Cards and the panel show **Changed since publish**.
- **Publish** reads the copies and refuses with "changed on the Emails page" while one differs from the draft; the
  editor then brings the words in for a look and a new approval. The send pipeline and the engine are unchanged: the
  version still holds its own copy of each email.
- **Emails page:** automations show as cards tagged Automation after the groups, with an All, Campaigns, Automations
  switch; an automation not opened since copies came gets them there. Their canvas has no Add email, Send, Duplicate,
  Delete or moving between groups (each says to change it in the automation); it has **Open the automation**, typing,
  blocks, Tia, versions and comments. Tia's "new emails from one prompt" says to add steps instead.
- **Classic editor:** "Open in the classic editor" on any draft's More menu opens the block builder; its changes go
  through the canvas's save and undo.
- **Proof:** `tests/automationEmails.test.ts` (approval rules, Publish refusing a changed email, key order, undo),
  `tests/pg/automationEmails.pg.ts`, `scripts/email-canvas-check.ts` check 69, `scripts/emails-check.ts` (the editor's
  side).
- **Cost:** $0 a month at Beta and Growth beyond Tia's use, already counted in the plan.
