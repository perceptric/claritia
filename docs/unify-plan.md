# One app: four sections, one screen system (plan)

Claritia becomes CRM, Automation, Inbound and Nurture, with Settings at the bottom. Pages and Ads go. The workspace
data is cleared so teams start from an empty app. Every screen is rebuilt on one small set of page types and shared
parts, so the app looks and works the same everywhere.

Planned with the UI/UX Pro Max skill (navigation, tables, empty states, accessibility rules) and an audit of every
screen. The brand stays as it is (`docs/brand.md`): warm paper, Geist, pills, the existing tokens.

| Part | Work | Time |
|---|---|---|
| 0 | Clear the data (after you approve the list in 0.2) | 0.5 day |
| 1 | New sidebar; Pages, Ads and the Reports group removed; old addresses forward | 1 day |
| 2 | Shared parts: one sheet, one modal, one tab bar, one editor frame, one stat card | 3 days |
| 3 | Every screen moved onto the page types, section by section | 6 days |
| 4 | Tests, screens check, screenshots in light and dark, docs | 1.5 days |

About 2.5 weeks. Running cost: $0 added at Beta and at Growth. Nothing new is paid for; removing Pages and Ads
removes no paid service.

---

## Part 0. Start from scratch

### 0.1 What's in production today (25 Oct)

6 workspaces with 1,854 contacts, 390 companies, 16,548 visits (sessions) with 13,933 devices and about 37,000 page
events, 3 forms, 2 meeting types, 1 nurture, 9,493 old jobs, plus rows from the old testing product (tests, runs,
projects, environments).

### 0.2 What gets cleared, and what stays

**Cleared (every workspace):**
- CRM: contacts, companies, opportunities and custom records, notes, tasks, field history, consents, imports
- Visits and identity: sessions, devices, page events, persons, identifiers, accounts, signals, scores
- Inbound: forms and their fills, meeting types, meetings, booking links and polls
- Automation: workflows and their runs, routing setups and history, enrichment history and caches
- Nurture: emails, messages, segments, templates, nurtures
- Old testing product: tests, runs, projects, environments and their secrets
- Finished and failed jobs

**Kept:**
- Sign-ins, workspaces, members, plans and billing
- The tracking sites (so the snippet already on a website keeps working)
- Sending domains, connected calendars, connected CRMs and API keys
- System lists (source kinds, standard fields)

### 0.3 How

One SQL file, `scripts/reset-data.sql`, in a single transaction. It copies every cleared table into the schema
`reset_backup_20261025`, then empties them with one `TRUNCATE` that has no `CASCADE`: if any kept table still points
at a cleared one, it stops and changes nothing. You run it in the Supabase SQL editor, or I run it after you say
"go". Drop the backup schema once you're sure.

---

## Part 1. The sidebar

```
CRM
  Contacts
  Companies
  Opportunities
  Meetings
Automation
  Workflows
  Routing          tabs: Overview · Rules · Teams · Regions · Company types · History · Needs review
  Enrichment       tabs: Overview · Providers · Rules · History
Inbound
  Forms            booking forms join the list as a form kind
  Scheduling       tabs: Meeting types · Availability · Links and polls · Reminders · Payments
  Visitors         tabs: Feed · Visitors · Alerts · Setup   (today's Signals)
Nurture
  Emails           tabs: Emails · Templates   (broadcasts and every workflow email in one list)
  Segments
  Lead scoring     tabs: Score · Ideal customer
Settings
```

Rules from the UI/UX skill and the audit:
- **At most 4 items in a group.** Pages inside an item are tabs under the page title, never more sidebar rows.
  Routing goes from 8 rows to 1, and Scheduling from 8 to 1.
- **Every tab has its own address** (`/routing/teams`, `/scheduling/availability`), so back, refresh and links
  work. Old addresses forward: `/signals/*` → `/visitors/*`, `/templates` → `/emails/templates`,
  `/settings/lead_scoring` → `/scoring`, `/pages`, `/ads` → Contacts.
- **The current item is always marked**: the filled ink pill on the sidebar item, the underline on the tab.
- **Reports fold into the screens where people act on them**, so there's no Reports group:

| Report today | New home |
|---|---|
| Funnel and Reps | CRM › Contacts › Overview |
| Speed to lead and routing rules | Automation › Routing › Overview, under the setup |
| Forms | Inbound › Forms › Overview |
| Email | Nurture › Emails: every email and workflow with sent, delivered, clicked and meetings |

- **"Soon" items** (Handoffs, AI scheduler, Notetaker) come out of the sidebar until they're built.

---

## Part 2. The screen system

### 2.1 Five page types

Every screen is one of these. Each type has one layout and one set of parts.

| Type | Used by | Layout |
|---|---|---|
| **List** | Contacts, Companies, Opportunities, Meetings, Workflows, Forms, Emails, Segments, Visitors | Header (title, count, tabs, one primary button) · one filter bar · table · bulk bar when rows are picked · row opens a side sheet or a record |
| **Record** | A contact, company, opportunity, meeting, form fill | Header with a back crumb ("Contacts / Dana Lee") · tabs · main column and a right rail of fields |
| **Editor** | Workflows, Routing rules, Forms, Meeting types | One `EditorFrame`: back crumb, name, state pill, Undo and Redo, Try, History, Versions, Make live · canvas on the left · 400px inspector on the right · drawers from the right |
| **Report** | Overview tabs (Contacts, Routing, Enrichment) | Stat cards · one chart · one table; date range and CSV in the header |
| **Settings** | Settings, Lead scoring, Enrichment rules, Visitors setup | Section list on the left, one panel at a time, max width 3xl |

### 2.2 One of each shared part

The audit found these doing the same job in several ways. Each becomes one part in `src/components/app/ui/`, and the
copies are deleted.

| Part | Today | After |
|---|---|---|
| Side sheet | 4 (SidePanel, workflow Drawer, routing VersionsDrawer, VisitPanel) | `Sheet`: right side, inset, X to close, Escape, focus kept inside |
| Modal | 3 plus DialogHost | `Modal` (DialogHost and FieldDialog use it) |
| Tab bar | Tabs, Settings pill nav, Forms inspector tabs, section nav | `Tabs` with addresses; `Segmented` only for switching a view, never for pages |
| Segmented, Toggle, IconButton | 4, 3 and 2 copies | one each in `ui` |
| Stat card | 8 sizes (22 to 34px) | `StatCards`, 30px, one size everywhere |
| Editor frame | 4 editors with their own headers | `EditorFrame` (2.1); the workflow editor gets the 20px title and back crumb |
| Make live and Versions | 2 publish dialogs, 2 version drawers | `PublishDialog` and `VersionsSheet`, fed each editor's changes in sentences |
| Template picker | 3 card grids | `TemplatePicker`: "Start blank" first, then cards with a name and a few words |
| Copy button | 5 | `CopyButton` |
| Label row | 7 (`Field`, `Row`, `Line`, `Detail`, `Labeled`...) | `Field` |
| Filter bar | 6 styles | `FilterBar` on every list |
| Card heading | CardHead, own h2 14px, plain span | `CardHead` |
| Loading | header vanishes on 4 screens | the header always shows; the body shows a skeleton of its own layout |

### 2.3 One way to do each thing

- **Words.** "Make live" (never Publish), "Versions" (never Saved setups), "Try a contact", "Changes not live yet",
  "Soon" as one gray pill.
- **Saving.** Every editor saves by itself, with "Saved" or "Not saved. Retrying…" in the header. Meeting types and
  Templates lose their Save buttons.
- **The primary button** sits in the header, and shows on the first screen too.
- **First screens.** `ToolIntro` with a sketch on every list before its first record, with the same button as the
  header. Companies and Opportunities get one. Forms' AI start moves behind "New form".
- **Empty results** ("No matches") use `Empty` with one line and a way out ("Clear filters").
- **Tables.** One row height (48px), hover `bg-hover`, a checkbox column and a bulk bar wherever rows can be deleted
  (every list, per the "everything can be deleted" rule). Tables scroll sideways on phones.
- **Widths.** Lists, editors and reports use the full panel; records max 6xl; settings max 3xl.
- **Dates and numbers.** en-US everywhere, in the workspace's time zone (Meetings uses en-GB today).
- **Off-brand bits fixed:** raw hex in `FormsView.tsx:873,924`, glyph icons in `FieldDialog.tsx:23-29`, the old
  `bg-brand-pale` token in `RecordTable.tsx:197`.
- **Accessibility** (UI/UX skill, priority 1): visible focus on every control, every icon button labelled, keyboard
  reaches every action, text contrast 4.5:1 in light and dark, motion off under reduced motion.

---

## Part 3. Moving the screens

Section by section, so the app works at the end of each day.

1. **CRM.** Contacts, Companies, Opportunities and custom objects on List and Record. The Overview tab on Contacts
   (today's Funnel and Reps). Meetings on List, en-US dates.
2. **Automation.** Workflows and Routing on `EditorFrame`. Routing's 8 pages become 1 page with tabs; Speed to lead
   joins its Overview. Enrichment's tabs use the shared `Tabs`.
3. **Inbound.** Forms list with the report columns; booking forms join the list. Scheduling's pages become tabs.
   Signals becomes Visitors, and VisitPanel becomes a `Sheet`.
4. **Nurture.** Emails list (broadcasts plus every workflow email) with Templates as a tab; Segments; Lead scoring and
   Ideal customer move out of Settings.
5. **Settings.** The shared `Tabs` replace the pill nav; the ToolIntro heroes inside Settings become short panels.

Removed: `views/MarketingIntros.tsx` (Pages, Ads), `reports/ReportsView.tsx` (its pages move into 3.1 to 3.4),
`meetings/TypesList.tsx` (dead code), and every duplicate in 2.2.

---

## Part 4. Tests and checks

- `tests/nav.test.ts`: the four groups and their items, every tab's address, every old address forwarding.
- `scripts/screens-check.ts`: walks every section from an empty workspace; checks there's one `h1` per screen, the
  header stays while loading, and no page errors in light or dark.
- `scripts/brand-check.ts`: fails on raw hex, `<select>`, `window.confirm`, glyph icons, or a second drawer or modal
  part.
- Screenshots of each section in light and dark, for you to review before merge.
- The data reset (Part 0) runs on a copy built from every migration first, and must leave the kept rows untouched.

---

## What's built (25 Oct)

- **Part 0:** `scripts/reset-data.sql`, tested on a copy. Not run on production yet: it runs when you run it in the
  Supabase SQL editor.
- **Part 1:** the four sections; one item per route with tabs under the title (`Section` in `ui.tsx`); Pages, Ads,
  the Reports group and the "Soon" items removed; booking forms fold into Forms; Signals is Visitors; Templates is a
  tab of Emails; Lead scoring and Ideal customer moved out of Settings; reports inside their sections; every old
  address forwards (`tests/nav.test.ts`).
- **Part 2 and 3, done:** one `Sheet` for every side panel; the workflow editor on the standard header; headers stay
  while loading; one set of words (Make live, Versions, Try a contact, Changes not live yet); meeting types and email
  templates save by themselves; one panel heading style; the shared stat cards on Visits; first screens on Companies
  and Opportunities; saved views on lists as a View picker; field-type icons; en-US dates; raw hex removed.
- **Also done:** one copy button (`CopyButton`); `SHOTS_DIR=<folder>` on `scripts/screens-check.ts` saves every
  section in light and dark (checked 25 Oct, all 30 screens).
- **Still to do:** the forms builder's own toggle, segmented control and icon button merged into the shared ones; one
  template picker for routing, workflows and forms; a bulk bar on the lists that don't have one yet (Workflows,
  Forms, Segments, Templates).

## Decisions (25 Oct)

1. Clearing data: the list in 0.2, in every workspace. `scripts/reset-data.sql` is tested on a copy built from every
   migration: records go, workspaces, settings, fields and sites stay, the backup holds every cleared row, and a
   second run stops before it can overwrite the backup.
2. Reports fold into the sections (Part 1 table).
3. Visitors under Inbound, Enrichment under Automation.
4. Workflows under Automation.
