# Routing: current to target

The short map asked for by `docs/routing-workflow.md` Section 24 (discovery checklist), written before the refactor
and kept up to date by it. "Unverified" means the code path exists but was not exercised against a real provider here.

## 1. What exists today (inspected)

| Area | Where | What it does today |
| --- | --- | --- |
| Router body | `src/lib/router/types.ts` (`RouterBody` v1) | One body per version: spam step, account step (company/opportunity owner), keep step (contact owner, `whenOut` keep/backup/route), ordered rules (`all`/`any`, typed conditions, `then` queue/owner/hold, optional `meet`), queues (members, method rr/weighted/load, strict, hoursOnly), fallback ("Everyone else": a user or a queue), territories, company types, SLA, `notify.noTimes`. |
| Engine | `src/lib/router/engine.ts` `decide()` | Pure. Spam, then company owner, then contact owner, then first matching rule, then its queue, then the fallback. Round robin = fewest leads from that queue in 30 days, then longest wait, then order. A rule whose queue has nobody falls through to the fallback; the fallback user takes leads over caps. |
| Conditions | `src/lib/router/conditions.ts` `holds()` | "is not" / "not one of" are **true** on an unknown value; `toNumber` reads the low end of a range ("51-200" is 51) and digits out of any text. Empty condition lists never match. |
| Checks | `src/lib/router/check.ts` | `cleanBody` (any input to a valid body) and `problems` (what blocks publish). |
| Persistence | `064_router.sql`: `routers` (one per workspace: live_version, draft, draft_revision, paused_at, allow/block), `router_versions` (immutable by convention only), `router_runs` (unique `(workspace_id, key)`, steps, facts, owner, by, queue_id) | `router_draft_save` (revision check), `router_publish` (next version, clears draft), `router_live`. |
| Commit | `router_commit` (064) | Advisory lock per queue, duplicate key returns the first run, re-picks the queue turn under the lock with fresh 30-day counts (`router_pick`), writes the run, the owner (field history, CRM owner link), `route_status` for held/unassigned, the timeline line and the `router_alert` job. Caps are counted from `router_runs` (`by` queue/fallback only). |
| Facts | `router_facts` / `router_facts_full` (064/090) | Contact, company (linked, else first domain match by an order), open opportunity owner, submission answers, reps' state, 30-day queue counts. |
| Reps | `router_reps` | `paused_until`, `out_dates` (dates in the rep's zone), `backup`, `cap_day`, `cap_week`. Saved at once (`router_rep_save`), outside versions. |
| Assignment UI | `src/components/app/routing/Assignment.tsx`, `assignModel.ts` | Edits the body as cards and saves + publishes in one step. **Changing reps on a shared queue split it into a new queue per rule** (`q_<rule id>`, `q_default`), which conflicts with spec §12 (one shared queue per team). |
| Sales reps / History | `SalesReps.tsx`, `History.tsx` | Read `router_reps` and `router_runs`. |
| Owner writers | `router_commit` (routing), `meeting_team_run` (084, only when a contact has no owner), `contact_update` / record saves (034, people in the CRM), `lead_route` (064, the old MQL routing when no router is live), CRM sync (owner_crm_id, mapped by `contacts_crm_owner`, 086) | Company owner: record saves and `router_commit` when `account.setCompanyOwner`. |
| Form submit | `src/lib/forms/submit.ts` `acceptFill` → `form_submit_all` (090) | The submission and contact are saved first (idempotent by the browser's key). Then `routeFillWith` routes inline within 300 ms, else the `route` job routes with the same key `form:<submission>`. |
| Routed booking | `src/lib/forms/schedule.ts` `claritiaPlan`, `src/lib/forms/booking.ts`, `src/lib/meetings/server.ts` `offer`/`book` with `only` | With Routing live, the lead sees only the routed rep's times (`only`), and the signed token books with that rep alone. **When routing was too slow the lead booked from the meeting type's own hosts** (conflicts with "host = committed owner"). |
| Meeting type hosts | `meeting_types.kind` one / round_robin / collective / double / group, `settings.team` (a Routing queue) | A team type pools a Routing queue and takes the queue's turn at booking (`router_pick`, `meeting_team_run`). This is the spec's separate booking-first mode. |
| Jobs / outbox | `020_foundation.sql`, `087_job_lanes.sql` `enqueue_job` (unique key), `worker-intel/jobs/router.ts` | `route`, `router_alert` (Slack/email), `router_sla`, `meeting_team_run`, `meeting_book_later`. |
| Tasks | `tasks` (049) | No dedupe key. |
| Notifications | `router_alert` job, `router_alert_sent` claims | Slack app message, channel, or email. |
| Audit | `audit_log` (020), `field_history` | Owner changes are in `field_history`. |

Unverified here: real Google/Microsoft calendar reads and event creation (only the `fake` provider runs in tests),
Slack/email delivery, CRM two-way owner sync.

## 2. Target (stages A to E) and the chosen adaptations

| Spec entity | Where it lives now |
| --- | --- |
| Policy | `routing_policies` (095): workspace, stable id, name, `is_default`, durable `draft` + `draft_revision`, `active_version`, `archived_at`, `create_key` (one policy per create click). |
| Policy version | `routing_policy_versions` (095): immutable (an update trigger refuses changes), `publish_key` unique per policy (a lost publish response is looked up, not repeated). |
| Default policy | Every workspace with a `routers` row gets one policy named **Inbound** with all its `router_versions` copied (same numbers, same bodies) and its draft. `routers` / `router_versions` stay as a **mirror** written in the same transaction by the publish and draft services, so every older reader (app counts, SLA, reports, the current Routing screens) keeps working. `router_live` reads the policy. |
| Policy config | The existing `RouterBody`, extended (no second format): `v: 2` turns on the spec's semantics; every existing body is `v: 1`, which keeps its exact live condition and owner semantics (see 3). New fields: `scope`, `ownership.order`, `ownership.capBlocksNew`, `backup`, `review.owner`, rule `then: "user"`. |
| Source connection | `routing_sources` (095): source kind form/handoff, form id, `policy_id`, `enabled`, `follows_default` (routes with the workspace's default policy, as every form did before), `outcome` assign_only / assign_and_calendar, `meeting_type_id`, `mappings` (by stable form field id, `src/lib/routing/mapping.ts`), completion (the form's own after-submit setting), `no_slots`, `live_revision`, staged `draft` + `draft_revision`. One row per form (unique), so a form has one primary live policy. `routing_source_resolve` reads the connection's live revision and the policy's active version together. |
| Team / membership | `routing_teams` + `routing_team_members` (stable `position`) + `routing_team_keys` (the body's queue ids). One persisted `next_position` per team: one shared queue per team, whichever rules or policies point at it. |
| Member preferences | `router_reps` (unchanged): pause, out dates, backup, caps. |
| Quota period | `routing_quota` (095): one row per member and period with its own start, end and zone, so a zone change takes effect at the next boundary. |
| Routing run | `router_runs`, extended: policy id and version, source id and revision, `assignment_state`, `booking_state`, `sync_state`, `previous_owner`, `effect` (new/retained/none), `trace` (the spec's seven stages), `parent_run_id`, `team_id`. The request identity is the existing unique `(workspace_id, key)`. |
| Assignment event | `routing_assignments` (095): one per committed run, with `counted` (quota) and `advanced` (queue turn). |
| Review item | `routing_reviews` (095): one per held/unallocated run, a named reviewer (the policy's review owner, else a workspace owner), state open / approved_pending_execution / in_progress / resolved / dismissed. |
| Follow-up task | `tasks.dedupe_key` (095, unique per workspace): one scheduling task per run and purpose. |
| Outbox | The jobs queue, written inside the commit transaction (`router_alert`), run after commit by the worker. |
| Evaluator | `src/lib/router/engine.ts` `decide()` stays the one evaluator; `src/lib/routing/evaluate.ts` wraps it and adds the spec trace and state. The Test panel, Replay, the form path and the jobs all call it. |
| Committer | `routing_commit(jsonb)` (095). `router_commit(...)` is kept as a thin wrapper over it for the callers that still use the old signature (manual assign, the SLA job). |

### Decisions recorded

1. **Live semantics kept (v1).** Migrated bodies stay `v: 1`, and `v: 1` keeps: "is not" true on unknown, the low end of
   a range for number tests, company owner ignoring caps, every member in scope, the owner's backup when they're away,
   a rule whose team has nobody falling to Everyone else, Everyone else as a person taking leads over caps. Turning a
   policy to `v: 2` is a reviewed, published change (Stage F screen), never done by the migration.
2. **Round robin moves to the shared persisted queue.** Spec §12 (one queue per team, a turn only for a committed new
   allocation, no catch-up debt) replaces "fewest leads in 30 days" for teams set to take turns. The migration seeds
   each team's `next_position` with the member the old rule would have picked next (fewest leads in that queue in 30
   days, then longest wait, then order), so fairness isn't reset. Weighted and fewest-meetings teams keep their
   method.
3. **Per-rule queues.** Queues whose ids look like the last build's per-rule split (`q_<rule id>`, `q_default`, with an
   optional `_n`) are folded into another queue of the same body **only when they are identical**: same members in
   the same order, same weights, method, strict and hours setting. Both queue ids then point at one team
   (`routing_team_keys`). Anything else stays its own named team. The Assignment screen no longer splits: a rule
   whose reps change reuses a team with exactly those reps, or edits its own unshared team, or makes one new team named
   after its reps.
4. **Quota.** Caps count committed new owner allocations in `routing_quota`, across teams and policies, including
   company-owner and manual allocations (the old count only had queue and fallback picks). Retention and retries
   count nothing. Today's count is seeded from today's `router_runs`, so caps don't reset at migration. Undoing a run
   (spam, route again) no longer refunds a count (spec §12: a transfer doesn't refund).
5. **Sources.** Every form gets an explicit connection: forms whose after-submit step books with Claritia calendar get
   `assign_and_calendar` with their meeting type; everything else `assign_only` (an outside scheduler link keeps
   working as before). Each `follows_default`: it routes whenever the default policy is live and not paused, exactly
   as before. Publishing a staged connection to a policy turns `follows_default` off for it. A form made later with no
   row also uses the default policy until Stage F writes its row on create.
6. **Slow routing.** A form whose connection shows a calendar no longer falls back to the meeting type's own hosts
   when routing is slow: the visitor sees "Your details are saved. We're finishing your request." and the form sends
   the same request again (same key), so the times shown are always the committed owner's.
7. **Booking-first team types** (`settings.team`) are left as they are: they keep their own pooled turn from
   `router_runs` and don't advance the shared owner-first queue.

## 3. v1 and v2 semantics side by side

| Behavior | v1 (every migrated body) | v2 (spec) |
| --- | --- | --- |
| "is not" / "not one of" on unknown | true | false; use "is unknown" |
| Number test on a range | low end of the range | true only when the whole range passes |
| Number from text | first digits in the text | whole numbers only ("1,200"); anything else is unknown |
| Ownership order | company (opportunity first), then contact | `ownership.order`, default company then contact |
| Owner away | `keep.whenOut`: keep, their backup, or route on | skipped with a reason |
| Company owner at cap | assigned | skipped; next candidate |
| Scope | every workspace member | `scope.people` and members of `scope.teams` |
| Rule team has nobody | Everyone else | `backup` once (person or team), then review |
| Nobody at all | Unassigned | review item with the named reviewer |
| Company found by domain, several match | the first by owner/length/age | review (`multiple_companies`) |
| Mapped form value of the wrong type | read as is | review (`source_mapping_mismatch`) |

## 4. Built in stages A to E

| Stage | What exists now |
| --- | --- |
| A | This map. |
| B | `src/lib/routing/states.ts` (assignment, booking, sync and review states as separate lists; typed errors; visitor copy), `src/lib/routing/evaluate.ts` (the one evaluator's spec trace: input, checks, ownership, rules, distribution, assignment, booking; a configuration fingerprint), `src/lib/routing/validate.ts` (blocking errors and warnings), `src/lib/routing/mapping.ts` (field mappings by id, ranges kept as ranges, countries as codes). The engine (`src/lib/router/engine.ts`) gained v2: input checks, ownership in order and scope, typed conditions (`conditions.ts`), first match with later rules "not evaluated", one backup hop then review, and turns from a team's persisted next position. |
| C | Policies, immutable versions, durable drafts with revisions, publish keys, source connections, `routing_migrate` (the default policy Inbound, teams, connections, quota seed). The current Routing screens keep working on the mirror; `actions.publish` goes through `src/lib/routing/policies.ts` `publishPolicy` (validated, revision-checked, keyed by the draft revision). |
| D | Teams (`routing_team_save`, stable positions, one queue each), the quota, `routing_commit` (Section 22's order, consistent lock order: request key, contact, team, quota rows by user id), `routing_assignments`, `routing_reviews`, `tasks.dedupe_key`. `route()` (forms, jobs, the SLA job, manual assign through `router_commit`) commits through it. The Assignment screen no longer makes a queue per rule. |
| E | `acceptFill`: the submission is saved first; the connection and policy are resolved together and stored on the run with the mapped answers; assign-only shows its completion; a calendar connection shows the committed owner's times only; held, no-slots, calendar-disconnected and failed reads keep the owner and record a distinct reason, with one scheduling task; a taken slot refreshes times; a slow send answers "Your details are saved. We're finishing your request." and the form element sends the same request again; the `route` job carries what the send captured. |

Acceptance scenarios run (all passing): R01-R15, O01-O14 and P03-P06 at the evaluator (`tests/routingPolicy.test.ts`);
T01-T12, O01-O14 at commit, R11-R13 facts, G05, G07, P02, P06, B13 and the migration (`tests/pg/routingPolicies.pg.ts`);
B01-B05, B08, B13, B14, B16, public tampering and two flaky cases (`tests/pg/routingForms.pg.ts`); T05 in validation.

## 5. Left for stages F to I

- F: the Policies / Teams / Activity screens, the tester with saved evidence and the publish review screen (the
  services exist: `createPolicy`, `saveDraft`, `publishPolicy`, `saveTeam`, `stageSource`, `evaluate`, `validatePolicy`);
  turning a migrated policy to v2 as a reviewed release; evidence storage and the "one dry run before publish" gate.
- G: internal handoff (Route & book): preview, `expect_owner` conflicts shown to the person, override with reason.
- H: Activity and the review lifecycle (approve, child attempt with `parent_run_id`, resolve), booking abandonment
  after 30 minutes, provider event reconciliation (no provider-side dedupe exists yet: an unknown create outcome is
  not modelled beyond `pending_confirmation`), CRM sync state, escalation when a reviewer leaves.
- I: writing a connection when a form is created, archive and duplicate, pooled team meeting types counting toward the
  owner-first quota and queue, role-scoped permissions beyond "workspace owner edits".

## 6. Rollback

095 adds tables and columns and replaces functions; it deletes nothing. The `routers` / `router_versions` mirror is
complete, so restoring 094's function bodies brings back the old path with every version intact.
