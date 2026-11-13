# Workflows: one home for meeting emails, a simpler sidebar, better templates

Plan, 2026-11-13. Three parts, each its own release.

## Why

- Meeting emails live in two places today: the System emails group on Emails, and the starting workflows (Meeting
  announcement, Meeting follow-up, No-show follow-up) that send their own reminders and follow-ups. People can't tell
  which one sends what.
- The sidebar has a whole Email section (Emails, Automations, Audiences, Templates, Brand) for a product that is forms,
  meetings and workflows.
- The 100 email templates look plain: black and white only, no logo, square buttons, the same layout every time, and
  placeholders like "[What they ordered]" and "{{company_address}}" showing in the gallery.

## Part A. The meeting emails are the default workflows

Every workspace starts with these workflows, each one live and doing what Claritia does today:

| Folder | Workflow | Trigger | Steps |
| --- | --- | --- | --- |
| Meetings | Booking confirmed | Meeting booked | Email the guest (with the calendar invite), email the host |
| Meetings | Reminders | Meeting booked | Delay until 1 day before, email; delay until 1 hour before, email |
| Meetings | Meeting moved | Meeting moved | Email the guest (new invite), email the host |
| Meetings | Meeting canceled | Meeting canceled | Email the guest (removes the invite), email the host |
| Meetings | After the meeting | Meeting ended | Email the host: Held or No-show |
| Meetings | No-show follow-up | Marked no-show | Email the guest with open times |
| Forms | Pick a time | Form sent, no booking | Email with open times |
| Forms | Form follow-up | Form sent | The draft we have today |

How it works:

- A new kind of step, **Meeting email**, is an email step that the meeting worker sends, so the calendar invite, the
  one-send-per-meeting rule, the host's own mailbox and the retries all stay exactly as they are now. Each one is the
  System email row it already is (164), edited in the step's panel or on the canvas like any email.
- **Reminders** are the Delay steps in the Reminders workflow. Change "1 day before" there and every meeting follows.
  The Reminders setting on meeting types goes away; today's values are copied into each workspace's Reminders workflow.
- Pausing a workflow stops its emails. Booking confirmed, Meeting moved and Meeting canceled can't be paused or
  deleted (they carry the invite); their emails can be changed, and steps can be added to them (a Slack note, a text).
- Any step can be added to these workflows like any other: a Slack message after a booking, a text an hour before.
- The old starting workflows that did the same job (Meeting announcement, Meeting follow-up, No-show follow-up) are
  removed where they were never changed or published, so nobody gets two emails. Changed ones stay and are left alone.
- The System emails group on Emails goes away; each meeting workflow's emails are its group, like any workflow.
- If a workflow can't be read when a meeting email is due, the built-in email goes, as today.

Tests: a real database with flaky providers, as for System emails (`tests/pg/systemEmails.pg.ts`): each event sends
once, the invite always goes, Pause stops reminders, Delay changes move reminders, a removed starting workflow never
causes a second email.

## Part B. The sidebar: Forms, Meetings, Workflows

- **Workflows** is one item in the sidebar, at `/workflows`. "Automation" becomes "Workflow" everywhere.
  `/emails/automations/…` addresses open the same workflow.
- The Email section goes. Where its other pages go is the open question below.

## Part C. Templates

### Email templates: a new look and more of them

- One design language with the meeting emails: the brand's logo in a header, the brand's accent color, pill buttons,
  a tinted band for the main card, real sample words in place of brackets, and no merge tags showing in the gallery.
- **200 templates**: the 100 we have, redrawn, and 100 new ones, in folders by job: Meetings, Forms and leads, Welcome
  and onboarding, Newsletters, Offers, Events and webinars, Orders and payments, and by industry (clinics, real estate,
  agencies, coaching, schools, fitness, restaurants, home services, nonprofits).
- Three looks for each (Clean, Bold, Warm), which take the brand kit's colors and fonts.
- The gallery: bigger previews in the workspace's brand, folders and a search, Preview, and **Use in a workflow** next
  to Use for a campaign.

### Workflow templates

- **New workflow** opens a gallery of about 30 ready workflows with their emails written: lead follow-up, quote
  follow-up, webinar reminders, onboarding series, win-back, review request, event check-in. Each starts as a draft.

## Build order

1. Part A, meeting emails as the default workflows (largest; reliability tests first).
2. Part B, the sidebar and the rename.
3. Part C, templates: the redraw and 100 new email templates, then workflow templates.

## Monthly cost

No new services and no AI calls: the templates are written once in code, and the meeting emails go the way they go
now.

| Stage | Servers | Sending | Claude tokens | Total added |
| --- | --- | --- | --- | --- |
| Beta (50 teams) | $0 | $0 | $0 | **$0** |
| Growth (500 teams) | $0 | $0 | $0 | **$0** |

## Open question

Where Emails (campaigns), Audiences, Templates and Brand go once the Email section is gone.
