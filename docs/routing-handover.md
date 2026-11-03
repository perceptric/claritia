# Routing: handover report

The report `docs/routing-workflow.md` Section 27 asks for at the end of stages A to I. The detailed map of what lives
where is `docs/routing-current-to-target.md`. Everything below was run locally against a test database and a mocked
browser harness; nothing here was deployed.

## 1. The user journey and the screens built

Routing is three tabs: Policies, Teams and Activity (`src/components/app/routing/RoutingView.tsx`, `rt/`).

- Set up. An empty workspace starts with two choices: Send everything to me (one person, no team) or Route by
  conditions. A policy opens in its editor: where leads come from (forms and the internal handoff, with field mappings
  by field id), checks and existing ownership, ordered rules (country, size and the other typed fields, All or Any), a
  destination for each (a team, a person or review), Everyone else, the backup and the review owner. The draft saves
  itself with a revision; a conflict offers Reload, Compare and Reapply mine.
- Test and publish. Test lead runs the shared evaluator on the saved draft or the published version, with a typed lead,
  an existing contact looked up in the workspace, and labeled simulation overrides. Publishing needs a test of exactly
  this release, shows what changes and which sources go live, and is keyed by an operation id so a lost answer is
  looked up, not repeated.
- Teams. Members with Accepting leads, Paused or Out of office, today's count against the cap, calendar health and who
  is next in the round robin.
- Forms. Forms › Settings › After submit shows the same connection Routing edits: its policy, Assign only or Show
  calendar, the meeting type, and whether it is Live, Waiting to publish or Disconnected. Disconnect sends the form's new
  leads to Needs review.
- A real lead. A form fill is saved first, routed by the policy its connection resolves to, and the committed owner's
  times are shown (or the configured message). The meeting is pending until the calendar holds the event, then
  confirmed. A visitor who leaves the calendar is marked abandoned after 30 minutes (configurable per connection); the
  owner stays; a follow-up task only when the connection asks for one; a later booking confirms and resolves it.
- Internal handoff. Contacts › Route & book previews the suggested recipient and their times (nothing written), then
  Assign without booking or Confirm handoff & book commits once. A workspace owner may choose another recipient with a
  reason.
- Activity. Real runs with separate assignment, booking and sync states; All runs, Needs review and Errors. A run's drawer
  shows its record and timeline, and the actions for its state: Approve and route (an explicit child attempt with the
  version, corrections and a preview), Assign manually, Dismiss with a reason, Reopen, Reassign, Ask the owner to
  reconnect, Check calendar, Resume booking, Retry sync.

Screenshots of the new and changed screens, light, dark and phone, next to the approved demo:
`/tmp/claude-0/-home-user/a4b08ed1-7938-5db9-8e16-29d8ad0ed525/scratchpad/routing4-shots/` (earlier stages in
`routing3-shots/`).

## 2. Model mapping and migrations

| Spec entity | Where it lives |
| --- | --- |
| Policy, version, draft | `routing_policies`, `routing_policy_versions` (immutable), mirrored to `routers` / `router_versions` for the default policy (095) |
| Source connection | `routing_sources`, one per form plus the handoff; staged `draft` with a revision; `when_off` for a disconnected form (097) |
| Team, membership, queue | `routing_teams`, `routing_team_members` (stable positions), `routing_team_keys`, one `next_position` per team (095) |
| Member settings | `router_reps` (pause, out of office, caps, backup), `availability` (zone, hours), `calendar_accounts` |
| Quota | `routing_quota`, one row per member and period with its own zone (095) |
| Routing run | `router_runs` with policy and source references, assignment, booking and sync states, trace, `parent_run_id`, `meeting_id`, `booking_active_at` (095, 096, 097) |
| Assignment event | `routing_assignments` with `counted` and `advanced` (095) |
| Review item | `routing_reviews` with state, named reviewer, revision, latest action and child run (095, lifecycle in 097) |
| Follow-up task | `tasks.dedupe_key` = `routing:<run>:schedule` or `routing:<run>:abandoned` (095) |
| Booking intent | the `meetings` row; its correlation reference is the calendar job key `create:<meeting>` |
| Outbox | the jobs queue (`enqueue_job`), written in the commit's transaction |

Migrations: `095_routing_policies.sql` (policies, teams, sources, quota, the committer, the move of every workspace's
router into a default policy named Inbound), `096_routing_screens.sql` (staged names, test evidence, the screens'
reads), `097_routing_recovery.sql` (review lifecycle, escalation, booking and sync recovery, abandonment, the Forms
connection on creation, the pooled team quota). Each is safe to run twice and deletes nothing.

What 097 changes in live behavior:

- A routed form's run says `pending_confirmation` after the visitor books and `confirmed` only once the calendar holds
  the event (before, it said `confirmed` at once). A cancelled meeting sets the run's booking to `cancelled`.
- A calendar create that stops trying marks the run `outcome_unknown` or `failed` (with `provider_error`) instead of
  leaving it pending with no reason.
- New forms get a connection row when they are made; it follows the form's "Book a meeting" choice at each form publish
  until someone edits it.
- A form disconnected through Routing or Forms sends new leads to review (only for disconnects made from now on; any
  existing disabled connection keeps `when_off = none`, the old behavior).
- A two-way CRM workspace sees `Sync pending` and then `Synced` or `Sync failed` on new owners.
- Booking-first team meetings that give an unowned contact its owner now count once in that person's quota.
- Members can hand off only their own leads or leads with no owner (they can still preview any).

## 3. Retention, scope, rule order, default, fallback and fairness

- Retention. Company owner (opportunity owner first), then contact owner, in the policy's order. An existing owner is
  kept only when in scope, accepting leads and (for a new allocation) under the cap; keeping them costs no count and no
  turn. Migrated v1 policies keep their old live semantics until a reviewed v2 publish.
- Scope. A v2 policy lists the people and teams it may assign to; owners outside it are skipped with a reason. A
  reassignment by hand may choose anyone in the workspace who can take the lead now.
- Rule order. First match wins; later rules are "not evaluated" in the trace; an unknown value never satisfies "is not".
- Default and fallback. Everyone else takes what no rule matched. When the chosen destination has nobody eligible, the
  backup is tried once, then the lead goes to review with a named reviewer (the policy's review owner, else a workspace
  owner; if that person leaves, a workspace owner).
- Fairness. One persisted queue position per team, advanced only by a committed new allocation; a returning member gets
  no catch-up. The daily and weekly caps count committed new allocations across every team and policy (and now
  booking-first team meetings that set an owner). A cap lowered below today's count blocks new allocations only; a zone
  change starts at the next period. Retries, previews, tests, reruns that keep the owner, cancellations and no-shows count
  nothing and refund nothing.

## 4. Integrations: verified, boundary-tested, incomplete

| Integration | State |
| --- | --- |
| Postgres functions, triggers, RLS and grants | Verified on a real Postgres 16 with every migration (`tests/pg`, `tests/db/leaks.sql`, `tests/db/jobs.sql`) |
| Jobs queue and worker handlers (`routing_abandon`, `meeting_sync`, `route`) | Verified: the handlers ran against the database in tests; `tests/workerImage.test.ts` resolves the worker image |
| Calendar event creation and reconciliation | Boundary-tested with the fake provider only, including a create that made the event but lost its answer, and a create that surely failed. Google (event id from the key, 409 then read) and Microsoft (transactionId) dedupe is in the existing provider code but was not run against real accounts here |
| Zoom | Not exercised in these stages; its partial-create guard is existing code |
| CRM sync (HubSpot, Salesforce) | Boundary-tested through `sync_log` rows and the queued `source_pull` retry job; no real CRM was called |
| Slack and email notifications, the book-later email | Not exercised; the jobs are queued and their dedupe keys checked |
| Browser screens | Rendered with a mocked server in Chromium (Playwright) for screenshots; no end-to-end run against the real API |

## 5. Acceptance scenarios and results

All passing. Files: `tests/routingPolicy.test.ts`, `tests/routingScreensModel.test.ts`, `tests/routingRecoveryModel.test.ts`,
`tests/pg/routingPolicies.pg.ts`, `tests/pg/routingForms.pg.ts`, `tests/pg/routingScreens.pg.ts`, `tests/pg/routingRecovery.pg.ts`.

| Group | Scenarios | Result |
| --- | --- | --- |
| A. Policy creation and editing | P01-P10 | Pass (P07 Undo also in the browser harness) |
| B. Rule semantics and data | R01-R15 | Pass |
| C. Ownership, scope and quotas | O01-O14 | Pass |
| D. Team allocation and concurrency | T01-T12 | Pass |
| E. Forms and booking | B01-B16 | Pass. B06, B07, B09, B10, B11, B12 and B15 are new in H; B01 and B08 updated for pending-then-confirmed |
| F. Internal handoff | H01-H10 | Pass (H10 also as a regression in the recovery file) |
| G. Testing, publishing, review and access | G01-G16 | Pass. G09-G14 are new in H and I; G02, G15 and G16 were checked in the browser harness in stage F |

Full run on this branch: `npm test` 833 unit tests pass; `tests/pg/*.ts` 401 of 402 pass (the warehouse test in
`sources.pg.ts`, which always fails in this environment, is the one failure); leaks and jobs SQL tests pass; `npm run
build` passes.

Limits: B09 and B11 prove the app never makes a second intent and that the fake provider's key dedupe is used on the
reconcile path; they do not prove Google's or Microsoft's behavior. The B11 double click returns one meeting; the second
click can come back as "That time was just taken" rather than the same meeting (existing scheduler behavior).

## 6. Deviations from the guide

- Roles. Claritia has two workspace roles, owner and member. Owner is the spec's Admin; member is the Rep. There is no
  scoped manager or read-only role yet, so "if granted" capabilities stay with owners, with one explicit grant: the
  review owner an owner names in a policy may act on that policy's review items. Effect: members can view, test, hand
  off their own or unowned leads, pause themselves and recover their own runs; everything else needs an owner.
- Abandonment window. The guide suggests "existing scheduling or session settings". The window and the follow-up are
  set on the form's connection (Where leads come from › Unfinished booking), because meeting types have no session
  setting and the follow-up belongs to the source. Default 30 minutes.
- Visitor wording. The public page still shows the scheduler's existing booked screen as soon as Claritia holds the
  time; it doesn't show "We're confirming your meeting" while the calendar event is being made. Internally the run is
  pending until the event exists. Changing the public widget was left out to keep the booking path as it is.
- Resume booking for a form lead emails the committed owner's times (the existing book-later email) rather than
  reopening the visitor's session. A handoff's booking is resumed in Route & book.
- Disconnect is staged like any other connection change: it takes effect with the policy's next publish.
- A connection made automatically for a new form follows the form's own after-submit setting at each form publish until
  someone edits it; after that only the draft and publish service changes it. This keeps new forms working as before
  without a Routing publish.
- Archive and duplicate were already complete in stage F (archive refused while a live source uses the policy;
  duplicate makes a disconnected draft); nothing more was needed.

## 7. Rollout steps

1. Apply `supabase/migrations/097_routing_recovery.sql` after 095 and 096 (it is safe to run twice), before deploying
   the app and the worker.
2. Deploy the worker (`worker-intel`) with the app: it now handles `routing_abandon` and tags calendar failures.
3. No new environment variables, services or keys.
4. To check a real calendar end to end, book a routed Demo request with a Google and a Microsoft test account, then stop
   the worker mid-create once to see the run go to "Outcome unknown" and back to confirmed with Check calendar.
5. To undo 097's live effects without a restore, drop its triggers (`routing_meeting_made`, `routing_meeting_changed`,
   `routing_meeting_failed`, `routing_runs_before`, `routing_runs_after`, `routing_reviews_child`, `routing_reviewer_left`,
   `routing_sync_logged`, `routing_form_made`, `routing_form_published`).

## Running cost

No new service and no AI call. The new work is a small delayed job per calendar-showing form fill, a few audit rows and
jobs for retries. Beta (50 teams): $0 a month. Growth (500 teams): $0 a month, inside the existing database and worker.
