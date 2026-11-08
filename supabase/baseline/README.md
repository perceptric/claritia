# Claritia database baseline

The full schema of the Claritia database on the Hostinger server, taken on 2026-11-08 after migration 139.
A new database is these files run in order, then any migration added after 139.

| File | Holds |
|---|---|
| 00_extensions_schemas.sql | Extensions and the app's own schemas |
| 01_types.sql | Enum and composite types |
| 02_functions.sql | Functions |
| 03_tables.sql | Tables, each with its sequences, defaults and keys |
| 04_views.sql | Views |
| 05_keys_indexes.sql | Foreign keys and indexes |
| 06_triggers.sql | Triggers |
| 07_security.sql | Row level security, policies and grants |
| 08_realtime.sql | Tables sent over Realtime |
| 09_cron.sql | Scheduled jobs (13) |

## What changed on the way here

- The move off Supabase cloud left out 2 tables and 137 functions that nothing used.
- Migrations 125, 126, 133 and 134 had never run on the old database; they ran on the new one.
- 135 to 139 removed website visitor identification, and the team's own and partner email domains now live in
  `team_domains`.

The old Supabase project keeps its data until it is deleted.
