# CRM: Contacts, Companies, Opportunities

The first group in the sidebar. Records come from the customer's CRM (HubSpot, Salesforce, Pipedrive, Attio, Omniscient) through the sources pipeline (`src/lib/sources/sync.ts`), and can be added by hand.

## Screens

- **Contacts.** Everyone. Leads are a view on Contacts (a lead status is set), with a board by lead status. The contact page shows the contact's opportunities.
- **Companies.** Every company, with fit and intent from website intelligence. The company page holds its contacts, its opportunities and what it does on the site (visits, people, intent signals, firmographics). The live visit feed opens from the Visits button. The old Accounts and Visitors screens are folded in here.
- **Opportunities.** A built-in object on the records tables (`supabase/migrations/044_crm.sql`). Board by stage by default, with the amount totalled per stage; table, saved views, filters, bulk edit and export come from the shared records list. Views: Open, Won, Lost, No company. The page leads with amount, win chance and close date, and marks a late close date.

Patterns taken from Omniscient: stages with a kind (open, won, lost) so boards and reports tell them apart, the amount per stage, the late close date, built-in fields that can be renamed but not deleted, and the field source on synced values.

## Opportunities from CRMs

| CRM | Read | Links |
| --- | --- | --- |
| HubSpot | Deal search on `hs_lastmodifieddate`, then the archived list for deletes. Stage names and won/lost from the pipelines. Needs the optional `crm.objects.deals.read` scope. | v4 associations to companies and contacts |
| Salesforce | `queryAll` on Opportunity by `SystemModstamp`, deletes included | `AccountId`, contact roles |
| Pipedrive | Full read, then the recents feed (check) | Organization, person |
| Attio | Deals object, full read each run (check) | Associated company and people |
| Omniscient | API v1 `/opportunities` | Account |

- Closed deals always land on the stages `won` and `lost`. Open stages keep the CRM's name, and a stage the list doesn't have yet is added to it.
- Links only go to companies and contacts the same source already synced. A CRM that won't share deals (scope not granted) logs one error in the sync log and contacts keep syncing.
- Tests: `tests/opportunities.test.ts`, `tests/pg/opportunities.pg.ts` (250 deals through 429s and an expired token, stage changes, deletes, a portal without the deals scope).

## Fields, notes and tasks (closer to Omniscient)

- **Add a field where you are.** The + at the end of any records table, and Add field at the bottom of a record's details, open the field dialog; the new field joins the table as a column. Settings › Fields uses the same dialog.
- **The field dialog:** name, type (16 types, now with Rating), colored options for pick lists (click an option's tag to change its color; they show as square tags everywhere), what a linked record points at, a one-line description shown on hover, the group and the required switch. Colors and descriptions live in `fields.options[].color` and `fields.config.description`.
- **Notes and tasks** on every record (contacts, companies, opportunities, custom objects): `supabase/migrations/049_crm_notes.sql`, `src/components/app/records/RecordWork.tsx`. Notes are changed by their author or an owner. Tasks have a due date (late ones in red) and a teammate. A deleted record takes its notes and tasks with it.
- Tests: leak tests for notes and tasks (`tests/db/leaks.sql`), and the CRM part of `scripts/screens-check.ts`.
- Still to port from Omniscient: table grouping and footer totals, keyboard moves with copy and paste, a page per field with unique and default values, paired relationships, formula and rollup fields, files on a record.

Running cost: no AI and no new services. Notes and tasks are small rows (under 1 KB each): about 50 MB at Beta and 1 GB at Growth, inside the Supabase plan. $0 a month added at both stages.

## Settings

- **CRM:** Connection, Imports, Sync log, Fields, Objects.
- **Email:** Sending domains (`docs/sending-setup.md`).
- **Team:** Members. Invite by email; signing in with that email joins the workspace (same as Omniscient).

## Running cost

No new AI calls and no new paid services. Deal reads use the CRMs' free APIs inside the sync job that already runs.

| | Beta (50 teams) | Growth (500 teams) |
| --- | --- | --- |
| Claude tokens | $0 | $0 |
| Database storage (about 2 KB per opportunity; 2,000 per team at Beta, 5,000 at Growth) | about 0.2 GB, inside the plan: $0 | about 5 GB, inside Supabase Pro's 8 GB (check): $0 to $1 |
| Sync job time (one more page per run) | $0 | $0 |
| **Added per month** | **$0** | **$0 to $1** |
